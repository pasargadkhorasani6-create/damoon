# دامون — سایت سیگنال معاملاتی (استراتژی میکروکانال البروکس)

وب‌سایت فارسی (RTL) برای ارائه‌ی سیگنال‌های ربات معاملاتی روی XAUUSD، EURUSD و US30 به مشترکین پولی:
فید لحظه‌ای، ارسال هم‌زمان به تلگرام، پرداخت زرین‌پال و تتر، صفحه‌ی عملکرد که فقط از معاملات واقعی محاسبه می‌شود، و پنل ادمین.

> ⚠️ سیگنال‌ها توصیه‌ی مالی نیستند، سودی تضمین نمی‌شود و عملکرد گذشته تضمینی برای آینده نیست.
> این متن در فوتر همه‌ی صفحات و هنگام خرید (با تیک اجباری که سمت سرور بررسی می‌شود) نمایش داده می‌شود.

---

## فهرست

1. [معماری](#معماری)
2. [ساختار پوشه‌ها](#ساختار-پوشهها)
3. [نصب و اجرای محلی](#نصب-و-اجرای-محلی)
4. [متغیرهای محیطی (env)](#متغیرهای-محیطی-env)
5. [اتصال ربات معاملاتی](#اتصال-ربات-معاملاتی)
6. [تنظیم تلگرام](#تنظیم-تلگرام)
7. [پرداخت‌ها](#پرداختها)
8. [دیپلوی روی VPS](#دیپلوی-روی-vps)
9. [نکات سرور ایران](#نکات-سرور-ایران)
10. [تست‌ها](#تستها)
11. [امنیت](#امنیت)
12. [API ربات](#api-ربات)

---

## معماری

```
[MT5 / MT4 روی AMarkets]
        │  ربات پایتون + mt5_bridge.py   یا   EA نسخه‌ی MQL4 + SignalPublisher.mqh
        │  POST امضاشده با HMAC-SHA256 (صف پایدار، ارسال مجدد خودکار)
        ▼
Nginx (SSL, rate limit) ──► Next.js (app) ──► PostgreSQL
                              │   ▲ SSE
                              ▼   │
                            Redis (pub/sub، rate limit، صف BullMQ)
                              │
                              ▼
                            worker ──► تلگرام (کانال + پیام خصوصی)، TronGrid، کرون‌ها
```

| بخش | تکنولوژی |
|---|---|
| وب | Next.js 16 (App Router) + TypeScript + Tailwind v4 + فونت Vazirmatn (self-host) |
| دیتابیس | PostgreSQL 16 + Prisma 7 |
| احراز هویت | سیستم سشن اختصاصی: ایمیل + رمز (Argon2id) و موبایل + OTP (ملی پیامک) |
| لحظه‌ای | Server-Sent Events + Redis pub/sub |
| صف و کرون | BullMQ روی Redis (پروسس جدای `worker`) |
| دیپلوی | Docker Compose + Nginx + Let's Encrypt (certbot) + پشتیبان روزانه |

**چرا به جای Auth.js سیستم سشن اختصاصی؟** Auth.js با Credentials/OTP فقط سشن JWT می‌دهد که قابل باطل‌کردن نیست
(مثلاً هنگام مسدودسازی یا تغییر رمز). سشن دیتابیسی ما با هر درخواست بررسی می‌شود و کاملاً تست شده است.

**چرا SSE به جای WebSocket؟** جریان داده یک‌طرفه است، از Nginx بدون تنظیم خاص عبور می‌کند، خودش دوباره وصل می‌شود و سرور جداگانه لازم ندارد.

---

## ساختار پوشه‌ها

```
├── web/                    اپلیکیشن Next.js و worker
│   ├── prisma/             اسکیما، migrationها، seed پلن‌ها
│   ├── src/app/            صفحات، API، server actionها
│   ├── src/lib/            منطق اصلی (auth، signals، payments، telegram، performance، admin)
│   ├── src/worker/         پروسس پس‌زمینه (کرون، صف تلگرام، دریافت پیام‌های ربات)
│   ├── tests/              تست‌های Vitest
│   └── e2e/                تست‌های Playwright
├── bot/                    سمت ربات معاملاتی
│   ├── signal_publisher.py ماژول ارسال امن (فقط کتابخانه‌ی استاندارد پایتون)
│   ├── mt5_bridge.py       پل فقط‌خواندنی MT5 (بدون تغییر کد ربات)
│   ├── integration_example.py
│   ├── mql4/               EA نسخه‌ی MQL4 + SignalPublisher.mqh
│   └── tests/              تست‌های pytest
├── deploy/                 تنظیمات Nginx، گرفتن SSL، بازگردانی پشتیبان
├── docker-compose.yml
└── .env.production.example
```

---

## نصب و اجرای محلی

پیش‌نیازها: Node.js 22، PostgreSQL 16، Redis 7، پایتون 3.10 به بالا (برای ربات).

```bash
cd web
npm install
cp .env.example .env            # مقادیر را تنظیم کنید (بخش بعد)
npx prisma migrate deploy       # ساخت جدول‌ها
npx prisma db seed              # پلن‌های ماهانه و سه‌ماهه
npm run dev                     # http://localhost:3000
npm run worker                  # در ترمینال دوم: کرون‌ها و تلگرام
```

در حالت توسعه `SMS_DRY_RUN=true` است و کد OTP به‌جای پیامک در لاگ سرور چاپ می‌شود.

**ساخت ادمین:** ابتدا در سایت ثبت‌نام کنید، سپس:

```bash
npm run make-admin -- you@example.com
```

(ارتقای نقش از داخل سایت عمداً ممکن نیست.)

---

## متغیرهای محیطی (env)

همه‌ی اطلاعات محرمانه فقط در `.env` قرار می‌گیرند و در گیت ثبت نمی‌شوند. نمونه‌ی کامل در
`web/.env.example` (توسعه) و `.env.production.example` (دیپلوی) است. هنگام بالا آمدن، مقادیر با Zod اعتبارسنجی می‌شوند
و اگر مقداری نامعتبر باشد، برنامه با پیام واضح متوقف می‌شود.

| متغیر | توضیح |
|---|---|
| `APP_URL` | آدرس کامل سایت، مثلاً `https://example.com` (در callback زرین‌پال و لینک‌ها استفاده می‌شود) |
| `DATABASE_URL`, `REDIS_URL` | اتصال دیتابیس و Redis (در Compose خودکار تنظیم می‌شوند) |
| `SESSION_SECRET`, `OTP_PEPPER` | رشته‌ی تصادفی حداقل ۳۲ کاراکتری: `openssl rand -hex 32` |
| `MELIPAYAMAK_CONSOLE_KEY` | کلید کنسول ملی پیامک (پنل ← توسعه‌دهندگان) |
| `MELIPAYAMAK_BODY_ID` | شناسه‌ی الگوی خدماتی با متغیر `{0}` برای کد (پیشنهادی؛ روی خطوط بلک‌لیست هم می‌رسد) |
| `MELIPAYAMAK_FROM` | شماره‌ی فرستنده، اگر الگو ندارید |
| `SMS_DRY_RUN` | `true` = پیامک ارسال نمی‌شود و کد در لاگ چاپ می‌شود |
| `BOT_API_KEYS` | کلیدهای ربات به شکل `keyId:secret` (چند کلید با کاما برای چرخش کلید) |
| `ZARINPAL_MERCHANT_ID`, `ZARINPAL_SANDBOX` | مرچنت زرین‌پال؛ `true` = محیط آزمایشی |
| `USDT_TRC20_ADDRESS` | آدرس کیف پول TRC20 شما (خالی = پرداخت تتر غیرفعال) |
| `TRONGRID_API_KEY` | کلید رایگان trongrid.io (توصیه‌شده) |
| `USDT_PAYMENT_TTL_MIN` | مهلت پرداخت تتر (دقیقه) |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_CHANNEL_ID` | تنظیمات تلگرام (بخش تلگرام) |
| `TELEGRAM_API_BASE` | آدرس API تلگرام؛ برای سرور ایران می‌تواند یک relay باشد |
| `OUTBOUND_PROXY_URL` | پراکسی HTTP(S) خروجی برای تلگرام و TronGrid (سرور ایران) |
| `PERFORMANCE_RISK_PCT` | ریسک هر معامله برای تبدیل R به درصد در صفحه‌ی عملکرد (برابر `RiskPct` ربات، پیش‌فرض 0.5) |

---

## اتصال ربات معاملاتی

### ۱. ساخت کلید API

روی سرور یک secret بسازید و در `.env` قرار دهید:

```bash
openssl rand -hex 32
# BOT_API_KEYS=bot1:<secret>
```

همین `keyId` و `secret` را در سمت ربات تنظیم کنید. سرور هر درخواست را این‌طور بررسی می‌کند:
امضای HMAC، اختلاف ساعت حداکثر ±۱۲۰ ثانیه، nonce یک‌بارمصرف (ضد replay)، rate limit و حداکثر حجم ۱۶ کیلوبایت.
**ساعت سیستم ربات باید همگام باشد** (Windows Time / NTP).

### ۲-الف. ربات پایتونی MT5 (`brooks_microchannel_bot.py`)

کد ربات پایتونی در اختیار ما نبود، به همین دلیل دو مسیر آماده شده که **منطق معاملاتی را تغییر نمی‌دهند**:

**مسیر پیشنهادی: پل فقط‌خواندنی `mt5_bridge.py`.** کنار ربات روی همان ویندوز اجرا می‌شود، سفارش‌ها و پوزیشن‌های
دارای Magic ربات را می‌خواند و رویدادها را می‌فرستد. هیچ سفارشی ثبت، تغییر یا حذف نمی‌کند و به هیچ تغییری در کد ربات نیاز ندارد.

```bat
cd bot
pip install -r requirements.txt
set SIGNAL_API_URL=https://example.com
set SIGNAL_API_KEY_ID=bot1
set SIGNAL_API_SECRET=<secret>
python mt5_bridge.py --magic 55501
```

| رویداد در MT5 | رویداد ارسالی |
|---|---|
| ثبت سفارش شرطی (Buy/Sell Stop) | `signal.new` |
| تغییر SL/TP | `signal.updated` |
| فعال‌شدن سفارش (باز شدن پوزیشن) | `signal.activated` |
| حذف یا انقضای سفارش شرطی | `signal.canceled` |
| بسته‌شدن پوزیشن (دلیل TP/SL از `deal.reason`) | `signal.closed` |

**مسیر جایگزین: فراخوانی مستقیم داخل ربات.** نمونه در `bot/integration_example.py` است و چند خط بعد از `order_send` موفق
اضافه می‌شود. این فراخوانی‌ها غیرمسدودکننده‌اند و هرگز exception نمی‌دهند.

`signal_publisher.py` هر رویداد را ابتدا در یک صف SQLite (`signal_outbox.sqlite3`) ذخیره و سپس در پس‌زمینه به ترتیب ارسال می‌کند.
قطعی اینترنت یا ری‌استارت ربات باعث گم‌شدن سیگنال نمی‌شود. رویدادهایی که سرور به‌طور دائمی رد کند (مثلاً داده‌ی نامعتبر)
در جدول `dead` همان فایل ثبت می‌شوند.

### ۲-ب. EA نسخه‌ی MQL4 (`bot/mql4`)

1. فایل‌های `BrooksMicroChannel.mq4` و `SignalPublisher.mqh` را در `MQL4\Experts` کپی و در MetaEditor کامپایل کنید.
2. در Tools ← Options ← Expert Advisors گزینه‌ی «Allow WebRequest for listed URL» را فعال و آدرس سایت را اضافه کنید.
3. فایل `MQL4\Files\signal_publisher.cfg` را بسازید (secret در تنظیمات EA و فایل‌های set ذخیره نمی‌شود):
   ```
   url=https://example.com
   key=bot1
   secret=<secret>
   ```
4. در تنظیمات EA گزینه‌ی `PublishSignals=true` را بزنید.

تغییرات EA نسبت به نسخه‌ی 1.10 فقط شامل یک `#include`، دو input، و دو فراخوانی در `OnInit` و انتهای `OnTick` است.
منطق سیگنال و معامله دست نخورده است. پیشرفت هر تیکت در Global Variables ترمینال ذخیره می‌شود، پس ری‌استارت ترمینال
رویداد تکراری یا گم‌شده ایجاد نمی‌کند. در Strategy Tester ارسال انجام نمی‌شود.

> ⚠️ محیط توسعه‌ی ما MetaEditor نداشت. فایل `SignalPublisher.mqh` (شامل پیاده‌سازی HMAC-SHA256 با `CryptEncode`) را حتماً
> یک بار روی حساب دمو کامپایل و با `/api/bot/health` یا اولین سیگنال تست کنید.

### ۳. بررسی اتصال

```bash
cd bot
SIGNAL_API_URL=https://example.com SIGNAL_API_KEY_ID=bot1 SIGNAL_API_SECRET=<secret> \
python -c "from signal_publisher import SignalPublisher as P; print(P.from_env(background=False).health_check())"
# SendResult(status=200, ...)
```

---

## تنظیم تلگرام

هر دو حالت کانال خصوصی و پیام خصوصی ربات فعال‌اند:

1. با [@BotFather](https://t.me/BotFather) یک ربات بسازید و `TELEGRAM_BOT_TOKEN` و `TELEGRAM_BOT_USERNAME` را تنظیم کنید.
2. یک کانال **خصوصی** بسازید، ربات را **ادمین** کنید (با دسترسی‌های Invite users و Ban users) و شناسه‌ی عددی کانال را
   در `TELEGRAM_CHANNEL_ID` بگذارید (مثلاً `-1001234567890`).
3. کاربر در پنل سایت ← «اتصال تلگرام» را می‌زند و با لینک یک‌بارمصرف (۱۵ دقیقه) حسابش را به ربات وصل می‌کند.
4. لینک کانال از نوع «درخواست عضویت» است. ربات فقط درخواست کاربرانی را تأیید می‌کند که حساب متصل و اشتراک فعال دارند،
   پس پخش‌شدن لینک بی‌خطر است.
5. با پایان اشتراک، کرون worker کاربر را از کانال حذف و به او اطلاع می‌دهد. سه روز قبل از پایان هم یادآوری می‌فرستد.

نحوه‌ی ارسال سیگنال‌ها:
- پیام کامل در کانال و پیام خصوصی مشترکین فعال ارسال می‌شود.
- با هر تغییر (فعال‌شدن، تغییر استاپ، تارگت/استاپ، لغو) پیام اصلی ویرایش و یک پاسخ کوتاه هم ارسال می‌شود.

دستورات ربات: `/status`، `/channel`، `/dm_on`، `/dm_off`.

دریافت پیام‌ها با long polling انجام می‌شود، پس سرور به webhook ورودی از تلگرام نیاز ندارد.

---

## پرداخت‌ها

**زرین‌پال (API نسخه‌ی ۴):** درخواست پرداخت ← درگاه ← callback. پرداخت فقط پس از `verify` سمت سرور و با مبلغ ذخیره‌شده در
دیتابیس پذیرفته می‌شود و فعال‌سازی اتمیک و idempotent است. اگر کاربر به سایت برنگردد، ادمین از «پرداخت‌ها ← بررسی مجدد»
پرداخت را دوباره verify می‌کند. برای تست، `ZARINPAL_SANDBOX=true` بگذارید.

**تتر (USDT روی TRC20):** هر سفارش یک مبلغ یکتا دارد (چند سنت اضافه، مثلاً `15.37`) تا واریز با قطعیت به همان سفارش نسبت داده شود.
پرداخت به دو روش تأیید می‌شود:
- کرون هر دقیقه واریزهای تأییدشده را از TronGrid می‌خواند و خودکار تطبیق می‌دهد.
- کاربر هش تراکنش را وارد می‌کند و تراکنش روی بلاکچین بررسی می‌شود.

در هر دو روش این موارد کنترل می‌شود: قرارداد رسمی USDT، آدرس مقصد، مبلغ دقیق، بازه‌ی زمانی، و یک‌بار مصرف‌بودن هش تراکنش.

**اشتراک:** خرید مجدد به انتهای اشتراک فعلی اضافه می‌شود. دسترسی مستقیماً از تاریخ پایان محاسبه می‌شود، پس انقضا حتی بدون
کرون هم دقیق است. قیمت‌ها از «ادمین ← پلن‌ها و قیمت» قابل تغییر است. مقادیر seed پیش‌فرض (۱٬۵۰۰٬۰۰۰ و ۳٬۹۰۰٬۰۰۰ تومان /
۱۵ و ۳۹ تتر) فقط نمونه‌اند و باید آن‌ها را تنظیم کنید.

---

## دیپلوی روی VPS

پیش‌نیاز: Ubuntu 22.04 یا بالاتر، Docker و Docker Compose، و رکورد A دامنه که به IP سرور اشاره کند.

```bash
git clone <repo> damoon && cd damoon
cp .env.production.example .env
nano .env                                  # DOMAIN، رمزها، کلیدها
docker compose build
./deploy/init-letsencrypt.sh               # اولین گواهی SSL (برای تست: STAGING=1 ./deploy/init-letsencrypt.sh)
docker compose up -d
docker compose exec worker npx tsx scripts/make-admin.ts you@example.com   # پس از ثبت‌نام در سایت
```

سرویس‌ها:

| سرویس | کار |
|---|---|
| `postgres`, `redis` | داده‌ها در volume پایدار |
| `migrate` | اجرای migrationها و seed پلن‌ها پیش از بالا آمدن سایت (یک‌بار اجرا) |
| `app` | وب‌سرور Next.js (خروجی standalone، کاربر غیر root، healthcheck روی `/api/health`) |
| `worker` | کرون‌ها، صف تلگرام، دریافت پیام‌های ربات تلگرام |
| `nginx` | SSL، ریدایرکت HTTP→HTTPS، HSTS، rate limit (429)، تنظیمات SSE |
| `certbot` | تمدید خودکار گواهی (هر ۱۲ ساعت بررسی؛ nginx هر ۶ ساعت reload) |
| `backup` | `pg_dump` روزانه در `./backups` (۱۴ نسخه‌ی آخر) |

به‌روزرسانی: `git pull && docker compose build && docker compose up -d`. Migrationهای جدید خودکار اعمال می‌شوند.

بازگردانی پشتیبان: `./deploy/restore.sh backups/damoon-YYYYMMDD-HHMM.dump`

لاگ‌ها: `docker compose logs -f app worker`

> این stack در محیط توسعه با Docker واقعاً اجرا و آزموده شده است: سلامت سرویس‌ها، ریدایرکت HTTPS، ارسال سیگنال از
> `signal_publisher.py` از مسیر Nginx، فید SSE لحظه‌ای از پشت Nginx و rate limit. تنها گواهی آن self-signed بود.

---

## نکات سرور ایران

1. **Docker Hub:** از ایران در دسترس نیست. یکی از این راه‌ها را انتخاب کنید:
   - در `/etc/docker/daemon.json` یک registry mirror داخلی تعریف کنید.
   - یا در `.env` ایمیج‌ها را از میرور بگیرید:
     ```
     POSTGRES_IMAGE=<mirror>/library/postgres:16-alpine
     REDIS_IMAGE=<mirror>/library/redis:7-alpine
     NGINX_IMAGE=<mirror>/library/nginx:1.27-alpine
     CERTBOT_IMAGE=<mirror>/certbot/certbot:latest
     ```
   - برای ایمیج پایه‌ی Node: `docker compose build --build-arg NODE_IMAGE=<mirror>/library/node:22-bookworm-slim`.
   - یا ایمیج‌ها را روی سرور دیگری build کنید و با `docker save` / `docker load` منتقل کنید.
2. **npm:** در صورت نیاز میرور npm را با `NPM_REGISTRY=<mirror>` در `.env` تنظیم کنید.
3. **تلگرام و TronGrid** از سرور ایران در دسترس نیستند. یکی از این دو را تنظیم کنید:
   - `OUTBOUND_PROXY_URL=http://user:pass@<foreign-vps>:3128`، یک پراکسی HTTP روی یک VPS خارجی (مثلاً Squid یا tinyproxy).
   - یا `TELEGRAM_API_BASE` را به یک relay (مثلاً Cloudflare Worker که `api.telegram.org` را پراکسی می‌کند) و `TRONGRID_BASE_URL` را به relay مشابه بدهید.

   ربات تلگرام با long polling کار می‌کند و سرور به دسترسی ورودی از تلگرام نیازی ندارد.
4. **ربات معاملاتی** (ویندوز/VPS خارج) فقط باید به `https://<دامنه‌ی شما>` دسترسی داشته باشد.
5. **زرین‌پال و ملی پیامک** از سرور ایران مستقیم کار می‌کنند و از پراکسی عبور نمی‌کنند.

---

## تست‌ها

```bash
# وب: تست‌های واحد و یکپارچه روی Postgres و Redis واقعی (دیتابیس damoon_test، Redis db 1)
cd web
npm test               # Vitest — ۷۷ تست
npm run build
npm run test:e2e       # Playwright — ۶ سناریو (ثبت‌نام/ورود، فید زنده، خرید، عملکرد، ادمین)
npx eslint && npx tsc --noEmit

# ربات
cd bot
pip install -r requirements-dev.txt
python -m pytest -q    # ۱۰ تست (+۲ تست اختیاری روی سرور واقعی با LIVE_API_URL)
```

تست‌های پوشش‌داده‌شده:
- **احراز هویت:** هش Argon2، سشن هش‌شده، OTP یک‌بارمصرف، قفل پس از تلاش‌های زیاد، rate limit.
- **API ربات:** امضای HMAC، replay، ساعت، دست‌کاری body، چرخه‌ی کامل سیگنال، idempotency، و جلوگیری از لغو معامله‌ی فعال.
- **امضای مشترک:** یک بردار تست ثابت در TypeScript و پایتون بررسی می‌شود تا امضا در هر دو زبان یکسان بماند.
- **پرداخت‌ها:** زرین‌پال (موفق، لغو، verify ناموفق، تکرار callback)، تتر (مبلغ یکتا، تراکنش جعلی یا تکراری، تطبیق خودکار)، و فعال‌سازی هم‌زمان.
- **تلگرام:** با transport جعلی (اتصال حساب، تأیید/رد عضویت، ارسال/ویرایش، حذف اعضای منقضی).
- **آمار عملکرد:** با اعداد محاسبه‌شده‌ی دستی، و اطمینان از اینکه فقط معاملات بسته‌شده‌ی واقعی شمرده می‌شوند.

---

## امنیت

- اطلاعات محرمانه فقط در `.env` (در `.gitignore`) قرار دارد. secret ربات MQL4 در فایل cfg جداگانه است.
- همه‌ی ورودی‌ها با Zod اعتبارسنجی می‌شوند و redirect بعد از ورود فقط به مسیرهای داخلی سایت مجاز است.
- رمزها با Argon2id هش می‌شوند. توکن سشن و کد OTP و کد اتصال تلگرام فقط به‌صورت هش در دیتابیس ذخیره می‌شوند. کوکی سشن `HttpOnly` و `SameSite=Lax` است و روی HTTPS پرچم `Secure` دارد.
- Rate limit در دو لایه اعمال می‌شود:
  - Redis: ورود، ارسال و تأیید OTP، خرید، API ربات، اتصال تلگرام.
  - Nginx: برای همه‌ی مسیرها، با کد 429.
- پرداخت‌ها فقط با verify سمت سرور پذیرفته می‌شوند: زرین‌پال با مبلغ دیتابیس و تتر با بررسی روی بلاکچین. نهایی‌سازی اتمیک است.
- API ربات با HMAC-SHA256، nonce یک‌بارمصرف و محدودیت زمانی محافظت می‌شود.
- **یکپارچگی آمار:** نتیجه‌ی معامله (R) فقط سمت سرور و از قیمت‌های گزارش‌شده‌ی ربات محاسبه می‌شود. هیچ فرم یا API برای ورود یا ویرایش عدد وجود ندارد. ادمین فقط سیگنال «در انتظار» را می‌تواند لغو کند، نه معامله‌ی فعال یا بسته‌شده را. همه‌ی اقدامات ادمین در لاگ ممیزی ثبت می‌شوند.
- هدرهای امنیتی برقرارند: HSTS، `X-Frame-Options: DENY`، `nosniff`، `Referrer-Policy`، و حذف `X-Powered-By`.
- مسدودسازی کاربر همه‌ی سشن‌هایش را باطل می‌کند و اتصال SSE باز هم هر ۶۰ ثانیه دسترسی را دوباره بررسی می‌کند.

---

## API ربات

همه‌ی درخواست‌ها هدرهای زیر را دارند:

```
X-Api-Key:   <keyId>
X-Timestamp: <unix seconds>
X-Nonce:     <16..64 کاراکتر [A-Za-z0-9_-]>
X-Signature: hex(HMAC_SHA256(secret, `${ts}\n${nonce}\n${METHOD}\n${path}\n${sha256hex(body)}`))
```

| مسیر | توضیح |
|---|---|
| `GET /api/bot/health` | بررسی کلید، امضا و ساعت |
| `POST /api/bot/events` | یکی از رویدادهای زیر (JSON) |

```jsonc
{ "type": "signal.new", "externalId": "12345-678", "symbol": "XAUUSD", "direction": "BUY",
  "orderType": "STOP", "entry": 2400.5, "stopLoss": 2395.1, "takeProfit": 2405.9,
  "timeframe": "M5", "digits": 2, "signalAt": 1760000000 }
{ "type": "signal.activated", "externalId": "12345-678", "fillPrice": 2400.6, "at": 1760000100 }
{ "type": "signal.updated",   "externalId": "12345-678", "stopLoss": 2400.6, "at": 1760000200 }
{ "type": "signal.canceled",  "externalId": "12345-678", "reason": "expired", "at": 1760000300 }
{ "type": "signal.closed",    "externalId": "12345-678", "exitPrice": 2405.9, "reason": "TP", "at": 1760000400 }
```

| پاسخ | معنی |
|---|---|
| `201` | سیگنال جدید ثبت شد |
| `200` | رویداد ثبت شد، یا تکراری بود (`"duplicate": true`) |
| `401` | امضا، کلید، ساعت یا nonce نامعتبر |
| `404` | `externalId` ناشناخته |
| `409` | تغییر وضعیت غیرمجاز (مثلاً لغو معامله‌ی فعال) |
| `422` | داده‌ی نامعتبر (مثلاً حد ضرر در سمت اشتباه ورود) |
| `429` | تعداد درخواست بیش از حد مجاز |

نتیجه بر حسب R برابر است با `(خروج − ورود واقعی) ÷ |ورود واقعی − حد ضرر اولیه|`؛ برای فروش، علامت برعکس می‌شود.
