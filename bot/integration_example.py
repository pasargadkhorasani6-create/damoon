"""
نمونه‌ی اتصال مستقیم در خود ربات (جایگزین mt5_bridge.py).

اگر ترجیح می‌دهید رویدادها مستقیماً از داخل brooks_microchannel_bot.py ارسال شوند،
فقط این چند خط را بعد از جاهایی که ربات سفارش را ثبت/بسته می‌کند اضافه کنید.
این فراخوانی‌ها غیرمسدودکننده‌اند و هرگز exception نمی‌دهند، پس منطق معاملاتی تغییری نمی‌کند.
"""
from signal_publisher import SignalPublisher

pub = SignalPublisher.from_env()  # یک بار در شروع ربات

# ۱) بعد از order_send موفق برای سفارش Buy Stop / Sell Stop:
#     result = mt5.order_send(request)
#     if result.retcode == mt5.TRADE_RETCODE_DONE:
#         pub.signal_new(f"{account_login}-{result.order}", symbol, "BUY", entry=price, stop_loss=sl,
#                        take_profit=tp, order_type="STOP", timeframe="M5", digits=digits)
#
# ۲) وقتی سفارش شرطی فعال شد:          pub.signal_activated(ext_id, fill_price=position.price_open)
# ۳) وقتی سفارش شرطی لغو/منقضی شد:      pub.signal_canceled(ext_id, reason="expired")
# ۴) وقتی پوزیشن بسته شد:               pub.signal_closed(ext_id, exit_price=deal.price, reason="TP" | "SL" | "MANUAL")
#
# در پایان اجرای ربات:                   pub.close()
