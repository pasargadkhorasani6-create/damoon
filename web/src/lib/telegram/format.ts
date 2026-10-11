import type { SignalDTO } from "@/lib/signals/dto";
import type { SignalChangeType } from "@/lib/realtime";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const price = (v: number | null, d: number) => (v == null ? "—" : v.toFixed(Math.min(Math.max(d, 0), 8)));

const tehran = new Intl.DateTimeFormat("fa-IR", {
  timeZone: "Asia/Tehran",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const STATUS: Record<SignalDTO["status"], string> = {
  PENDING: "⏳ در انتظار فعال‌سازی",
  ACTIVE: "🔵 فعال",
  TP_HIT: "✅ تارگت",
  SL_HIT: "⛔️ استاپ",
  CLOSED: "⚪️ بسته‌شده",
  CANCELED: "✖️ لغو (فعال نشد)",
};

const ORDER = { MARKET: "مارکت", STOP: "Stop", LIMIT: "Limit" } as const;

export const DISCLAIMER_LINE = "⚠️ توصیه‌ی مالی نیست؛ سودی تضمین نمی‌شود.";

/** متن کامل سیگنال (ارسال اولیه و ویرایش پیام کانال) */
export function formatSignal(s: SignalDTO): string {
  const buy = s.direction === "BUY";
  const lines = [
    `${buy ? "🟢" : "🔴"} <b>${esc(s.symbol)}</b> — ${buy ? "خرید" : "فروش"} ${ORDER[s.orderType]}${s.timeframe ? ` (${esc(s.timeframe)})` : ""}`,
    "",
    `ورود: <code>${price(s.entry, s.digits)}</code>`,
    `حد ضرر: <code>${price(s.stopLoss, s.digits)}</code>`,
    `حد سود: <code>${price(s.takeProfit, s.digits)}</code>`,
    "",
    `وضعیت: ${STATUS[s.status]}`,
  ];
  if (s.fillPrice != null && s.status !== "PENDING") lines.push(`قیمت فعال‌شدن: <code>${price(s.fillPrice, s.digits)}</code>`);
  if (s.exitPrice != null) lines.push(`قیمت خروج: <code>${price(s.exitPrice, s.digits)}</code>`);
  if (s.resultR != null) lines.push(`نتیجه: <b>${s.resultR > 0 ? "+" : ""}${s.resultR.toFixed(2)}R</b>`);
  lines.push(`🕒 ${tehran.format(new Date(s.signalAt))} (تهران)`, "", DISCLAIMER_LINE);
  return lines.join("\n");
}

/** پیام کوتاه تغییر وضعیت (به‌صورت پاسخ به پیام سیگنال) */
export function formatChange(s: SignalDTO, change: SignalChangeType): string | null {
  const head = `<b>${esc(s.symbol)}</b> ${s.direction === "BUY" ? "خرید" : "فروش"}`;
  switch (change) {
    case "activated":
      return `🔵 ${head} فعال شد در <code>${price(s.fillPrice, s.digits)}</code>`;
    case "updated":
      return `✏️ ${head}: حد ضرر <code>${price(s.stopLoss, s.digits)}</code> | حد سود <code>${price(s.takeProfit, s.digits)}</code>`;
    case "canceled":
      return `✖️ ${head} فعال نشد و لغو شد.`;
    case "closed": {
      const r = s.resultR != null ? ` (${s.resultR > 0 ? "+" : ""}${s.resultR.toFixed(2)}R)` : "";
      return `${STATUS[s.status]} ${head} در <code>${price(s.exitPrice, s.digits)}</code>${r}`;
    }
    default:
      return null;
  }
}
