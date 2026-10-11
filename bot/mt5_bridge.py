"""
mt5_bridge.py — ارسال خودکار سیگنال‌های ربات پایتونی MT5 به سایت، بدون هیچ تغییری در کد ربات.

این اسکریپت کنار ربات (brooks_microchannel_bot.py) روی همان ویندوز/ترمینال MT5 اجرا می‌شود،
فقط سفارش‌ها و پوزیشن‌های دارای Magic ربات را «می‌خواند» و هیچ سفارشی ثبت، تغییر یا حذف نمی‌کند.

    سفارش شرطی جدید            → signal.new
    تغییر SL/TP                → signal.updated
    فعال‌شدن (باز شدن پوزیشن)   → signal.activated
    حذف/انقضای سفارش شرطی      → signal.canceled
    بسته‌شدن پوزیشن            → signal.closed  (دلیل TP/SL از deal.reason)

اجرا:
    set SIGNAL_API_URL=https://example.com
    set SIGNAL_API_KEY_ID=bot1
    set SIGNAL_API_SECRET=...
    python mt5_bridge.py --magic 55501
"""
from __future__ import annotations

import argparse
import json
import logging
import sqlite3
import time
from typing import Any, Optional

from signal_publisher import SignalPublisher

log = logging.getLogger("mt5_bridge")


class Bridge:
    def __init__(self, mt5: Any, publisher: SignalPublisher, magic: int, state_path: str = "mt5_bridge_state.sqlite3",
                 timeframe: str = "M5") -> None:
        self.mt5 = mt5
        self.pub = publisher
        self.magic = magic
        self.timeframe = timeframe
        self.db = sqlite3.connect(state_path)
        # stage: 1 = new ارسال شد، 2 = activated ارسال شد، 3 = پایان (closed/canceled)
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS tracked (ticket INTEGER PRIMARY KEY, stage INTEGER, sl REAL, tp REAL, data TEXT)"
        )
        self.db.commit()
        info = mt5.account_info()
        self.login = info.login if info else 0

    # ------------------------------------------------------------------ کمکی‌ها

    def ext_id(self, ticket: int) -> str:
        return f"{self.login}-{ticket}"

    def _get(self, ticket: int) -> Optional[tuple[int, float, float]]:
        row = self.db.execute("SELECT stage, sl, tp FROM tracked WHERE ticket = ?", (ticket,)).fetchone()
        return row if row else None

    def _set(self, ticket: int, stage: int, sl: float, tp: float) -> None:
        self.db.execute(
            "INSERT INTO tracked (ticket, stage, sl, tp) VALUES (?, ?, ?, ?) "
            "ON CONFLICT(ticket) DO UPDATE SET stage = excluded.stage, sl = excluded.sl, tp = excluded.tp",
            (ticket, stage, sl, tp),
        )
        self.db.commit()

    def _digits(self, symbol: str) -> Optional[int]:
        si = self.mt5.symbol_info(symbol)
        return si.digits if si else None

    def _direction(self, order_type: int) -> str:
        m = self.mt5
        buys = {m.ORDER_TYPE_BUY, m.ORDER_TYPE_BUY_STOP, m.ORDER_TYPE_BUY_LIMIT, getattr(m, "ORDER_TYPE_BUY_STOP_LIMIT", -99)}
        return "BUY" if order_type in buys else "SELL"

    def _kind(self, order_type: int) -> str:
        m = self.mt5
        if order_type in (m.ORDER_TYPE_BUY_STOP, m.ORDER_TYPE_SELL_STOP):
            return "STOP"
        if order_type in (m.ORDER_TYPE_BUY_LIMIT, m.ORDER_TYPE_SELL_LIMIT):
            return "LIMIT"
        return "MARKET"

    # ------------------------------------------------------------------ یک دور بررسی

    def poll(self) -> None:
        m = self.mt5
        open_tickets: set[int] = set()

        for o in m.orders_get() or ():
            if o.magic != self.magic:
                continue
            open_tickets.add(o.ticket)
            st = self._get(o.ticket)
            if st is None:
                self.pub.signal_new(
                    self.ext_id(o.ticket), o.symbol, self._direction(o.type), entry=o.price_open,
                    stop_loss=o.sl, take_profit=o.tp or None, order_type=self._kind(o.type),
                    timeframe=self.timeframe, digits=self._digits(o.symbol), signal_at=o.time_setup,
                )
                self._set(o.ticket, 1, o.sl, o.tp)
            elif (o.sl, o.tp) != (st[1], st[2]):
                self.pub.signal_updated(self.ext_id(o.ticket), stop_loss=o.sl, take_profit=o.tp or None)
                self._set(o.ticket, st[0], o.sl, o.tp)

        for p in m.positions_get() or ():
            if p.magic != self.magic:
                continue
            ticket = p.identifier  # در MT5 شناسه‌ی پوزیشن = تیکت سفارشی که آن را باز کرده
            open_tickets.add(ticket)
            st = self._get(ticket)
            if st is None:
                # سفارش بازار یا سفارشی که قبل از دیده‌شدن فعال شده
                self.pub.signal_new(
                    self.ext_id(ticket), p.symbol, "BUY" if p.type == m.POSITION_TYPE_BUY else "SELL",
                    entry=p.price_open, stop_loss=p.sl, take_profit=p.tp or None, order_type="MARKET",
                    timeframe=self.timeframe, digits=self._digits(p.symbol), signal_at=p.time,
                )
                self._set(ticket, 2, p.sl, p.tp)
                continue
            if st[0] < 2:
                self.pub.signal_activated(self.ext_id(ticket), fill_price=p.price_open, at=p.time)
                self._set(ticket, 2, st[1], st[2])
            if (p.sl, p.tp) != (st[1], st[2]):
                self.pub.signal_updated(self.ext_id(ticket), stop_loss=p.sl, take_profit=p.tp or None)
                self._set(ticket, 2, p.sl, p.tp)

        # سفارش‌ها/پوزیشن‌هایی که ناپدید شده‌اند: لغو یا بسته‌شدن
        for ticket, stage in self.db.execute("SELECT ticket, stage FROM tracked WHERE stage < 3").fetchall():
            if ticket in open_tickets:
                continue
            self._resolve(ticket, stage)

    def _resolve(self, ticket: int, stage: int) -> None:
        m = self.mt5
        deals = [d for d in (m.history_deals_get(position=ticket) or ()) if d.magic == self.magic or d.position_id == ticket]
        ins = [d for d in deals if d.entry == m.DEAL_ENTRY_IN]
        outs = [d for d in deals if d.entry in (m.DEAL_ENTRY_OUT, getattr(m, "DEAL_ENTRY_OUT_BY", -99))]

        if outs:
            vol = sum(d.volume for d in outs) or 1.0
            exit_price = sum(d.price * d.volume for d in outs) / vol
            last = max(outs, key=lambda d: d.time)
            reason = "TP" if last.reason == m.DEAL_REASON_TP else "SL" if last.reason == m.DEAL_REASON_SL else "UNKNOWN"
            fill = ins[0].price if ins else None
            if stage < 2 and fill is not None:
                self.pub.signal_activated(self.ext_id(ticket), fill_price=fill, at=ins[0].time)
            self.pub.signal_closed(self.ext_id(ticket), exit_price=exit_price, reason=reason, fill_price=fill, at=last.time)
            self._set(ticket, 3, 0, 0)
            return

        if stage < 2 and not ins:
            hist = m.history_orders_get(ticket=ticket) or ()
            if hist:
                state = hist[0].state
                if state in (m.ORDER_STATE_CANCELED, m.ORDER_STATE_EXPIRED, m.ORDER_STATE_REJECTED):
                    reason = {m.ORDER_STATE_CANCELED: "canceled", m.ORDER_STATE_EXPIRED: "expired"}.get(state, "rejected")
                    self.pub.signal_canceled(self.ext_id(ticket), reason=reason, at=hist[0].time_done)
                    self._set(ticket, 3, 0, 0)
        # در غیر این صورت هنوز در تاریخچه ثبت نشده؛ دور بعد دوباره بررسی می‌شود


def main() -> None:
    ap = argparse.ArgumentParser(description="MT5 → website signal bridge (read-only)")
    ap.add_argument("--magic", type=int, required=True, help="Magic number ربات")
    ap.add_argument("--interval", type=float, default=1.0, help="فاصله‌ی بررسی (ثانیه)")
    ap.add_argument("--timeframe", default="M5")
    ap.add_argument("--state", default="mt5_bridge_state.sqlite3")
    args = ap.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    import MetaTrader5 as mt5  # فقط روی ویندوز با ترمینال MT5 در دسترس است

    if not mt5.initialize():
        raise SystemExit(f"MT5 initialize failed: {mt5.last_error()}")
    pub = SignalPublisher.from_env()
    hc = pub.health_check()
    log.info("health check: HTTP %s %s", hc.status, hc.body[:200])
    bridge = Bridge(mt5, pub, args.magic, state_path=args.state, timeframe=args.timeframe)
    log.info("bridge started for account %s, magic %s", bridge.login, args.magic)
    try:
        while True:
            try:
                bridge.poll()
            except Exception:  # noqa: BLE001
                log.exception("poll failed")
            time.sleep(args.interval)
    finally:
        pub.close()
        mt5.shutdown()


if __name__ == "__main__":
    main()
