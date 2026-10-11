"""
تست یکپارچه با سرور واقعی سایت (اختیاری):
    LIVE_API_URL=http://localhost:3100 LIVE_API_KEY_ID=testbot LIVE_API_SECRET=... pytest tests/test_live_server.py
"""
import json
import os
import time
import urllib.request

import pytest

from signal_publisher import SignalPublisher

URL = os.environ.get("LIVE_API_URL")
pytestmark = pytest.mark.skipif(not URL, reason="LIVE_API_URL not set")


def test_python_publisher_against_real_server(tmp_path):
    pub = SignalPublisher(URL, os.environ["LIVE_API_KEY_ID"], os.environ["LIVE_API_SECRET"],
                          outbox_path=str(tmp_path / "o.db"), background=False)
    assert pub.health_check().status == 200
    ext = f"live-{int(time.time() * 1000)}"
    pub.signal_new(ext, "XAUUSD.r", "BUY", entry=2400.0, stop_loss=2395.0, take_profit=2405.0, digits=2)
    pub.signal_activated(ext, fill_price=2400.0)
    pub.signal_closed(ext, exit_price=2405.0, reason="TP")
    assert pub.flush() == 3
    assert pub.pending_count() == 0
    # رویداد تکراری idempotent است
    pub.signal_new(ext, "XAUUSD.r", "BUY", entry=2400.0, stop_loss=2395.0, take_profit=2405.0)
    assert pub.flush() == 1


def test_wrong_secret_is_rejected(tmp_path):
    pub = SignalPublisher(URL, os.environ["LIVE_API_KEY_ID"], "w" * 40, outbox_path=str(tmp_path / "o.db"), background=False)
    assert pub.health_check().status == 401
