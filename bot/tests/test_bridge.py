from types import SimpleNamespace as NS

from mt5_bridge import Bridge


class FakeMT5:
    ORDER_TYPE_BUY, ORDER_TYPE_SELL, ORDER_TYPE_BUY_LIMIT, ORDER_TYPE_SELL_LIMIT = 0, 1, 2, 3
    ORDER_TYPE_BUY_STOP, ORDER_TYPE_SELL_STOP = 4, 5
    POSITION_TYPE_BUY, POSITION_TYPE_SELL = 0, 1
    DEAL_ENTRY_IN, DEAL_ENTRY_OUT, DEAL_ENTRY_OUT_BY = 0, 1, 3
    DEAL_REASON_SL, DEAL_REASON_TP, DEAL_REASON_EXPERT = 4, 5, 3
    ORDER_STATE_CANCELED, ORDER_STATE_EXPIRED, ORDER_STATE_REJECTED = 2, 6, 5

    def __init__(self):
        self.orders, self.positions, self.deals, self.hist_orders = [], [], [], []

    def account_info(self):
        return NS(login=777)

    def symbol_info(self, s):
        return NS(digits=2)

    def orders_get(self):
        return tuple(self.orders)

    def positions_get(self):
        return tuple(self.positions)

    def history_deals_get(self, position):
        return tuple(d for d in self.deals if d.position_id == position)

    def history_orders_get(self, ticket):
        return tuple(o for o in self.hist_orders if o.ticket == ticket)


class RecPub:
    def __init__(self):
        self.calls = []

    def __getattr__(self, name):
        return lambda *a, **k: self.calls.append((name, a, k))


MAGIC = 55501


def order(ticket, typ=4, sl=2395.0, tp=2405.0, magic=MAGIC):
    return NS(ticket=ticket, magic=magic, symbol="XAUUSD", type=typ, price_open=2400.0, sl=sl, tp=tp, time_setup=1760000000)


def test_full_lifecycle_tp(tmp_path):
    mt5, pub = FakeMT5(), RecPub()
    b = Bridge(mt5, pub, MAGIC, state_path=str(tmp_path / "s.db"))

    mt5.orders = [order(10), order(99, magic=1)]  # سفارش ربات دیگر نادیده گرفته می‌شود
    b.poll()
    b.poll()  # تکرار نباید دوباره ارسال کند
    assert [c[0] for c in pub.calls] == ["signal_new"]
    assert pub.calls[0][1][:3] == ("777-10", "XAUUSD", "BUY")

    mt5.orders = []
    mt5.positions = [NS(identifier=10, magic=MAGIC, symbol="XAUUSD", type=0, price_open=2400.3, sl=2395.0, tp=2405.0, time=1760000060)]
    b.poll()
    assert pub.calls[-1][0] == "signal_activated" and pub.calls[-1][2]["fill_price"] == 2400.3

    mt5.positions[0].sl = 2400.3  # انتقال حد ضرر به سربه‌سر
    b.poll()
    assert pub.calls[-1][0] == "signal_updated" and pub.calls[-1][2]["stop_loss"] == 2400.3

    mt5.positions = []
    mt5.deals = [
        NS(position_id=10, magic=MAGIC, entry=0, price=2400.3, volume=0.1, time=1760000060, reason=3),
        NS(position_id=10, magic=MAGIC, entry=1, price=2405.0, volume=0.1, time=1760000300, reason=5),
    ]
    b.poll()
    name, args, kw = pub.calls[-1]
    assert name == "signal_closed" and kw["reason"] == "TP" and kw["exit_price"] == 2405.0 and kw["fill_price"] == 2400.3
    n = len(pub.calls)
    b.poll()
    assert len(pub.calls) == n


def test_expired_pending_is_canceled(tmp_path):
    mt5, pub = FakeMT5(), RecPub()
    b = Bridge(mt5, pub, MAGIC, state_path=str(tmp_path / "s.db"))
    mt5.orders = [order(20, typ=5, sl=2405.0, tp=2395.0)]
    b.poll()
    assert pub.calls[0][1][2] == "SELL"
    mt5.orders = []
    b.poll()  # هنوز در تاریخچه نیست → صبر
    assert len(pub.calls) == 1
    mt5.hist_orders = [NS(ticket=20, state=2, time_done=1760000400)]
    b.poll()
    assert pub.calls[-1][0] == "signal_canceled" and pub.calls[-1][2]["reason"] == "canceled"


def test_fast_fill_and_close_between_polls(tmp_path):
    mt5, pub = FakeMT5(), RecPub()
    b = Bridge(mt5, pub, MAGIC, state_path=str(tmp_path / "s.db"))
    mt5.orders = [order(30)]
    b.poll()
    mt5.orders = []
    mt5.deals = [
        NS(position_id=30, magic=MAGIC, entry=0, price=2400.0, volume=0.1, time=1760000060, reason=3),
        NS(position_id=30, magic=MAGIC, entry=1, price=2395.0, volume=0.1, time=1760000090, reason=4),
    ]
    b.poll()
    assert [c[0] for c in pub.calls] == ["signal_new", "signal_activated", "signal_closed"]
    assert pub.calls[-1][2]["reason"] == "SL"


def test_state_survives_restart(tmp_path):
    mt5, pub = FakeMT5(), RecPub()
    mt5.orders = [order(40)]
    Bridge(mt5, pub, MAGIC, state_path=str(tmp_path / "s.db")).poll()
    pub2 = RecPub()
    Bridge(mt5, pub2, MAGIC, state_path=str(tmp_path / "s.db")).poll()
    assert pub2.calls == []
