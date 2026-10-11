"""
signal_publisher.py — ارسال امن سیگنال‌ها و نتیجه‌ی معاملات ربات به سایت.

- فقط از کتابخانه‌ی استاندارد پایتون استفاده می‌کند (بدون وابستگی).
- هر رویداد اول در یک صف پایدار SQLite (outbox) ذخیره می‌شود و سپس در یک thread
  پس‌زمینه به ترتیب ارسال می‌شود؛ قطعی اینترنت یا ری‌استارت ربات باعث گم‌شدن رویداد نمی‌شود.
- هیچ متدی exception به کد معاملاتی برنمی‌گرداند و هیچ متدی منتظر شبکه نمی‌ماند؛
  یعنی منطق و سرعت معاملات ربات تغییری نمی‌کند.

امضای درخواست (باید با سرور یکسان باشد):
    canonical = f"{timestamp}\\n{nonce}\\n{METHOD}\\n{path}\\n{sha256hex(body)}"
    X-Signature = hex(HMAC_SHA256(secret, canonical))

استفاده:
    pub = SignalPublisher.from_env()       # SIGNAL_API_URL, SIGNAL_API_KEY_ID, SIGNAL_API_SECRET
    pub.signal_new("123-456", "XAUUSD", "BUY", entry=2400.5, stop_loss=2395.1, take_profit=2405.9)
    pub.signal_activated("123-456", fill_price=2400.6)
    pub.signal_closed("123-456", exit_price=2405.9, reason="TP")
"""
from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Any, Optional
from urllib.parse import urlparse

log = logging.getLogger("signal_publisher")

EVENTS_PATH = "/api/bot/events"


def canonical_string(ts: str, nonce: str, method: str, path: str, body: str) -> str:
    body_hash = hashlib.sha256(body.encode("utf-8")).hexdigest()
    return f"{ts}\n{nonce}\n{method.upper()}\n{path}\n{body_hash}"


def sign(secret: str, ts: str, nonce: str, method: str, path: str, body: str) -> str:
    msg = canonical_string(ts, nonce, method, path, body).encode("utf-8")
    return hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()


def _num(x: Optional[float]) -> Optional[float]:
    return None if x is None else float(x)


@dataclass
class SendResult:
    status: int  # کد HTTP یا 0 برای خطای شبکه
    body: str = ""

    @property
    def delivered(self) -> bool:
        return 200 <= self.status < 300

    @property
    def permanent_failure(self) -> bool:
        # خطای دائمی داده (ارسال مجدد فایده ندارد). 401/429/5xx/شبکه = تلاش مجدد
        return self.status in (400, 404, 409, 413, 422)


class SignalPublisher:
    def __init__(
        self,
        base_url: str,
        key_id: str,
        secret: str,
        outbox_path: str = "signal_outbox.sqlite3",
        timeout: float = 5.0,
        background: bool = True,
        max_attempts_404: int = 20,
    ) -> None:
        if len(secret) < 32:
            raise ValueError("secret must be at least 32 characters")
        self.base_url = base_url.rstrip("/")
        self.key_id = key_id
        self._secret = secret
        self.timeout = timeout
        self.max_attempts_404 = max_attempts_404
        self._db_lock = threading.Lock()
        self._db = sqlite3.connect(outbox_path, check_same_thread=False)
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS outbox (id INTEGER PRIMARY KEY AUTOINCREMENT,"
            " payload TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, created REAL NOT NULL)"
        )
        self._db.execute(
            "CREATE TABLE IF NOT EXISTS dead (id INTEGER PRIMARY KEY, payload TEXT, status INTEGER, body TEXT, at REAL)"
        )
        self._db.commit()
        self._wake = threading.Event()
        self._stop = threading.Event()
        self._thread: Optional[threading.Thread] = None
        if background:
            self._thread = threading.Thread(target=self._run, name="signal-publisher", daemon=True)
            self._thread.start()

    @classmethod
    def from_env(cls, **kw: Any) -> "SignalPublisher":
        return cls(
            os.environ["SIGNAL_API_URL"],
            os.environ["SIGNAL_API_KEY_ID"],
            os.environ["SIGNAL_API_SECRET"],
            outbox_path=os.environ.get("SIGNAL_OUTBOX_PATH", "signal_outbox.sqlite3"),
            **kw,
        )

    # ------------------------------------------------------------------ API عمومی (هرگز exception نمی‌دهد)

    def signal_new(
        self,
        external_id: str,
        symbol: str,
        direction: str,
        entry: float,
        stop_loss: float,
        take_profit: Optional[float] = None,
        order_type: str = "STOP",
        timeframe: Optional[str] = "M5",
        digits: Optional[int] = None,
        signal_at: Optional[float] = None,
        comment: Optional[str] = None,
    ) -> None:
        ev: dict[str, Any] = {
            "type": "signal.new",
            "externalId": str(external_id),
            "symbol": symbol,
            "direction": direction.upper(),
            "orderType": order_type.upper(),
            "entry": _num(entry),
            "stopLoss": _num(stop_loss),
            "takeProfit": _num(take_profit),
            "timeframe": timeframe,
            "signalAt": int(signal_at or time.time()),
        }
        if digits is not None:
            ev["digits"] = int(digits)
        if comment:
            ev["comment"] = comment[:200]
        self._enqueue(ev)

    def signal_activated(self, external_id: str, fill_price: float, at: Optional[float] = None) -> None:
        self._enqueue({"type": "signal.activated", "externalId": str(external_id), "fillPrice": _num(fill_price), "at": int(at or time.time())})

    def signal_updated(
        self, external_id: str, stop_loss: Optional[float] = None, take_profit: Optional[float] = None, at: Optional[float] = None
    ) -> None:
        ev: dict[str, Any] = {"type": "signal.updated", "externalId": str(external_id), "at": int(at or time.time())}
        if stop_loss is not None:
            ev["stopLoss"] = _num(stop_loss)
        if take_profit is not None:
            ev["takeProfit"] = _num(take_profit)
        self._enqueue(ev)

    def signal_canceled(self, external_id: str, reason: Optional[str] = None, at: Optional[float] = None) -> None:
        self._enqueue({"type": "signal.canceled", "externalId": str(external_id), "reason": reason, "at": int(at or time.time())})

    def signal_closed(
        self,
        external_id: str,
        exit_price: float,
        reason: str = "UNKNOWN",
        fill_price: Optional[float] = None,
        at: Optional[float] = None,
    ) -> None:
        ev: dict[str, Any] = {
            "type": "signal.closed",
            "externalId": str(external_id),
            "exitPrice": _num(exit_price),
            "reason": reason.upper(),
            "at": int(at or time.time()),
        }
        if fill_price is not None:
            ev["fillPrice"] = _num(fill_price)
        self._enqueue(ev)

    def health_check(self) -> SendResult:
        return self._request("GET", "/api/bot/health", "")

    def pending_count(self) -> int:
        with self._db_lock:
            return self._db.execute("SELECT COUNT(*) FROM outbox").fetchone()[0]

    def close(self, flush_timeout: float = 5.0) -> None:
        deadline = time.time() + flush_timeout
        while self.pending_count() and time.time() < deadline:
            if self.flush() == 0:
                break
        self._stop.set()
        self._wake.set()
        if self._thread:
            self._thread.join(timeout=2)

    # ------------------------------------------------------------------ داخلی

    def _enqueue(self, ev: dict[str, Any]) -> None:
        try:
            payload = json.dumps({k: v for k, v in ev.items() if v is not None}, ensure_ascii=False, separators=(",", ":"))
            with self._db_lock:
                self._db.execute("INSERT INTO outbox (payload, created) VALUES (?, ?)", (payload, time.time()))
                self._db.commit()
            self._wake.set()
        except Exception:  # noqa: BLE001 — نباید ربات را متوقف کند
            log.exception("failed to enqueue signal event")

    def flush(self) -> int:
        """رویدادهای صف را به ترتیب ارسال می‌کند؛ تعداد ارسال‌های موفق را برمی‌گرداند."""
        sent = 0
        while not self._stop.is_set():
            with self._db_lock:
                row = self._db.execute("SELECT id, payload, attempts FROM outbox ORDER BY id LIMIT 1").fetchone()
            if not row:
                return sent
            row_id, payload, attempts = row
            res = self._request("POST", EVENTS_PATH, payload)
            if res.delivered:
                self._delete(row_id)
                sent += 1
                continue
            # 404 یعنی سیگنال هنوز روی سرور ثبت نشده؛ چند بار تلاش و بعد صرف‌نظر
            if res.permanent_failure and (res.status != 404 or attempts + 1 >= self.max_attempts_404):
                log.error("signal event rejected (HTTP %s): %s — %s", res.status, payload, res.body[:300])
                with self._db_lock:
                    self._db.execute(
                        "INSERT INTO dead (id, payload, status, body, at) VALUES (?, ?, ?, ?, ?)",
                        (row_id, payload, res.status, res.body[:2000], time.time()),
                    )
                    self._db.execute("DELETE FROM outbox WHERE id = ?", (row_id,))
                    self._db.commit()
                continue
            with self._db_lock:
                self._db.execute("UPDATE outbox SET attempts = attempts + 1 WHERE id = ?", (row_id,))
                self._db.commit()
            log.warning("signal event delivery failed (HTTP %s), will retry", res.status)
            return sent
        return sent

    def _delete(self, row_id: int) -> None:
        with self._db_lock:
            self._db.execute("DELETE FROM outbox WHERE id = ?", (row_id,))
            self._db.commit()

    def _request(self, method: str, path: str, body: str) -> SendResult:
        ts = str(int(time.time()))
        nonce = secrets.token_hex(16)
        headers = {
            "Content-Type": "application/json",
            "X-Api-Key": self.key_id,
            "X-Timestamp": ts,
            "X-Nonce": nonce,
            "X-Signature": sign(self._secret, ts, nonce, method, urlparse(self.base_url + path).path, body),
            "User-Agent": "signal-publisher/1.0",
        }
        data = body.encode("utf-8") if method != "GET" else None
        req = urllib.request.Request(self.base_url + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as resp:
                return SendResult(resp.status, resp.read().decode("utf-8", "replace"))
        except urllib.error.HTTPError as e:
            return SendResult(e.code, e.read().decode("utf-8", "replace"))
        except Exception as e:  # noqa: BLE001 — خطای شبکه
            return SendResult(0, str(e))

    def _run(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            try:
                self.flush()
                backoff = 1.0 if self.pending_count() == 0 else min(backoff * 2, 60.0)
            except Exception:  # noqa: BLE001
                log.exception("publisher loop error")
                backoff = min(backoff * 2, 60.0)
            self._wake.wait(timeout=backoff if self.pending_count() else 30.0)
            self._wake.clear()
