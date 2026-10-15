/**
 * پراکسی ساده برای هاست‌هایی که به Binance یا تلگرام دسترسی ندارند (مثلاً سرور ایران).
 *
 * ۱. در Cloudflare → Workers یک Worker بسازید و این کد را جای کد پیش‌فرض بگذارید.
 * ۲. آدرس Worker (مثلاً https://damoon-proxy.yourname.workers.dev) را:
 *    - در «آدرس‌های API داده» بالاتر از بقیه بگذارید؛
 *    - در «آدرس API تلگرام» بگذارید؛
 *    - در «نبض بازار ← پراکسی» بگذارید.
 *
 * فقط همین مسیرها عبور داده می‌شوند و Worker چیزی ذخیره نمی‌کند.
 * مسیر /fetch فقط به میزبان‌های فهرست PULSE_HOSTS اجازه می‌دهد (پراکسی باز نیست).
 */
const BINANCE = "https://data-api.binance.vision";
const TELEGRAM = "https://api.telegram.org";
const PULSE_HOSTS = [
  "api.stocktwits.com",
  "www.reddit.com",
  "news.google.com",
  "www.coindesk.com",
  "cointelegraph.com",
  "api.alternative.me",
];

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/v3/klines") {
      return fetch(BINANCE + url.pathname + url.search, { headers: { Accept: "application/json" } });
    }

    if (request.method === "POST" && /^\/bot\d+:[A-Za-z0-9_-]+\/sendMessage$/.test(url.pathname)) {
      return fetch(TELEGRAM + url.pathname, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: await request.text(),
      });
    }

    if (request.method === "GET" && url.pathname === "/fetch") {
      let target;
      try {
        target = new URL(url.searchParams.get("url") || "");
      } catch {
        return new Response("bad url", { status: 400 });
      }
      if (target.protocol !== "https:" || !PULSE_HOSTS.includes(target.hostname)) {
        return new Response("host not allowed", { status: 403 });
      }
      const upstream = await fetch(target.toString(), {
        headers: {
          Accept: request.headers.get("Accept") || "*/*",
          "User-Agent": request.headers.get("User-Agent") || "DamoonSignal",
        },
        redirect: "manual", // ریدایرکت به میزبان خارج از فهرست دنبال نمی‌شود
        cf: { cacheTtl: 120, cacheEverything: true },
      });
      return new Response(upstream.body, {
        status: upstream.status,
        headers: { "Content-Type": upstream.headers.get("Content-Type") || "application/octet-stream" },
      });
    }

    return new Response("not found", { status: 404 });
  },
};
