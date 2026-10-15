/**
 * پراکسی ساده برای هاست‌هایی که به Binance یا تلگرام دسترسی ندارند (مثلاً سرور ایران).
 *
 * ۱. در Cloudflare → Workers یک Worker بسازید و این کد را جای کد پیش‌فرض بگذارید.
 * ۲. آدرس Worker (مثلاً https://damoon-proxy.yourname.workers.dev) را:
 *    - در «آدرس‌های API داده» بالاتر از بقیه بگذارید؛
 *    - در «آدرس API تلگرام» بگذارید.
 *
 * فقط همین دو مسیر عبور داده می‌شوند و Worker چیزی ذخیره نمی‌کند.
 */
const BINANCE = "https://data-api.binance.vision";
const TELEGRAM = "https://api.telegram.org";

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

    return new Response("not found", { status: 404 });
  },
};
