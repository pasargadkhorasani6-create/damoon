import hashlib
import hmac
import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from signal_publisher import SignalPublisher, canonical_string, sign

SECRET = "test-secret-0123456789abcdef0123456789abcdef"


def test_shared_hmac_vector():
    # همین بردار در web/tests/bot-api.test.ts بررسی می‌شود
    got = sign("test-vector-secret-0123456789abcdef0123456789", "1760000000", "abcdef0123456789", "POST", "/api/bot/events", '{"a":1}')
    assert got == "3973c7143e0a5e6af4f2b235790907e743e9386c927a1d75585b64084b03d59a"


class FakeServer:
    """سرور HTTP محلی که امضا را بررسی می‌کند و پاسخ‌ها را از صف برمی‌دارد."""

    def __init__(self):
        self.received = []
        self.responses = []  # کد وضعیت برای هر درخواست؛ خالی = 201
        outer = self

        class H(BaseHTTPRequestHandler):
            def log_message(self, *a):
                pass

            def do_POST(self):
                body = self.rfile.read(int(self.headers["Content-Length"])).decode()
                canon = canonical_string(self.headers["X-Timestamp"], self.headers["X-Nonce"], "POST", self.path, body)
                expected = hmac.new(SECRET.encode(), canon.encode(), hashlib.sha256).hexdigest()
                ok_sig = hmac.compare_digest(expected, self.headers["X-Signature"])
                status = 401 if not ok_sig else (outer.responses.pop(0) if outer.responses else 201)
                if status < 300:
                    outer.received.append(json.loads(body))
                self.send_response(status)
                self.end_headers()
                self.wfile.write(b'{"ok":true}')

        self.httpd = HTTPServer(("127.0.0.1", 0), H)
        self.url = f"http://127.0.0.1:{self.httpd.server_port}"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def close(self):
        self.httpd.shutdown()


@pytest.fixture
def server():
    s = FakeServer()
    yield s
    s.close()


def make(server_url, tmp_path, **kw):
    return SignalPublisher(server_url, "k1", SECRET, outbox_path=str(tmp_path / "o.db"), background=False, timeout=2, **kw)


def test_sends_signed_events_in_order(server, tmp_path):
    pub = make(server.url, tmp_path)
    pub.signal_new("1-10", "XAUUSD", "buy", entry=2400.5, stop_loss=2395, take_profit=2405, digits=2, signal_at=1760000000)
    pub.signal_activated("1-10", fill_price=2400.6, at=1760000100)
    pub.signal_closed("1-10", exit_price=2405, reason="tp", at=1760000200)
    assert pub.flush() == 3
    assert [e["type"] for e in server.received] == ["signal.new", "signal.activated", "signal.closed"]
    assert server.received[0] == {
        "type": "signal.new", "externalId": "1-10", "symbol": "XAUUSD", "direction": "BUY", "orderType": "STOP",
        "entry": 2400.5, "stopLoss": 2395.0, "takeProfit": 2405.0, "timeframe": "M5", "signalAt": 1760000000, "digits": 2,
    }
    assert server.received[2]["reason"] == "TP"
    assert pub.pending_count() == 0


def test_network_failure_keeps_events_and_survives_restart(tmp_path):
    pub = make("http://127.0.0.1:9", tmp_path)  # پورتی که چیزی رویش نیست
    pub.signal_new("1-11", "EURUSD", "SELL", entry=1.1, stop_loss=1.101)
    assert pub.flush() == 0
    assert pub.pending_count() == 1
    pub.close(flush_timeout=0)

    s = FakeServer()
    try:
        pub2 = make(s.url, tmp_path)  # همان فایل outbox
        assert pub2.flush() == 1
        assert s.received[0]["externalId"] == "1-11"
    finally:
        s.close()


def test_server_error_retries_and_permanent_error_goes_to_dead_letter(server, tmp_path):
    pub = make(server.url, tmp_path)
    server.responses = [503]
    pub.signal_new("1-12", "XAUUSD", "BUY", entry=1, stop_loss=0.5)
    assert pub.flush() == 0 and pub.pending_count() == 1
    assert pub.flush() == 1

    server.responses = [422]
    pub.signal_new("1-13", "XAUUSD", "BUY", entry=1, stop_loss=2)
    pub.signal_new("1-14", "XAUUSD", "BUY", entry=1, stop_loss=0.5)
    assert pub.flush() == 1  # رویداد نامعتبر کنار گذاشته شد و بعدی ارسال شد
    assert pub.pending_count() == 0
    dead = pub._db.execute("SELECT status FROM dead").fetchall()
    assert dead == [(422,)]


def test_never_raises_into_trading_code(tmp_path):
    pub = make("http://127.0.0.1:9", tmp_path)
    pub._db.close()  # شبیه‌سازی خرابی دیتابیس
    pub.signal_new("1-15", "XAUUSD", "BUY", entry=1, stop_loss=0.5)  # نباید exception بدهد


def test_rejects_short_secret(tmp_path):
    with pytest.raises(ValueError):
        SignalPublisher("http://x", "k", "short", outbox_path=str(tmp_path / "x.db"), background=False)
