import type { Direction, SignalStatus } from "@/generated/prisma/client";

/** نماد بروکر (با پسوندهایی مثل .r یا m) را به نماد استاندارد تبدیل می‌کند */
export function canonicalSymbol(raw: string): string {
  const s = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (s.includes("XAUUSD") || s === "GOLD") return "XAUUSD";
  if (s.includes("EURUSD")) return "EURUSD";
  if (/US30|DJ30|WS30|DJI|DOWJONES|USA30/.test(s)) return "US30";
  return s;
}

/** درستی جایگاه حد ضرر/سود نسبت به ورود */
export function validateLevels(direction: Direction, entry: number, sl: number, tp?: number | null): string | null {
  if (direction === "BUY") {
    if (!(sl < entry)) return "stopLoss must be below entry for BUY";
    if (tp != null && !(tp > entry)) return "takeProfit must be above entry for BUY";
  } else {
    if (!(sl > entry)) return "stopLoss must be above entry for SELL";
    if (tp != null && !(tp < entry)) return "takeProfit must be below entry for SELL";
  }
  return null;
}

/** نتیجه بر حسب R = سود/زیان تقسیم بر فاصله‌ی ورود تا حد ضرر اولیه */
export function computeR(direction: Direction, fill: number, initialSl: number, exit: number): number | null {
  const risk = Math.abs(fill - initialSl);
  if (!(risk > 0)) return null;
  const pnl = direction === "BUY" ? exit - fill : fill - exit;
  return Math.round((pnl / risk) * 1000) / 1000;
}

/** اگر ربات دلیل بسته‌شدن را نداند، از نزدیکی قیمت خروج به TP/SL تشخیص داده می‌شود */
export function classifyClose(
  reason: "TP" | "SL" | "MANUAL" | "UNKNOWN",
  s: { fill: number; initialSl: number; sl: number; tp: number | null; exit: number },
): Extract<SignalStatus, "TP_HIT" | "SL_HIT" | "CLOSED"> {
  if (reason === "TP") return "TP_HIT";
  if (reason === "SL") return "SL_HIT";
  if (reason === "MANUAL") return "CLOSED";
  const tol = Math.abs(s.fill - s.initialSl) * 0.15;
  if (s.tp != null && Math.abs(s.exit - s.tp) <= tol) return "TP_HIT";
  if (Math.abs(s.exit - s.sl) <= tol) return "SL_HIT";
  return "CLOSED";
}

export const CLOSED_STATUSES: SignalStatus[] = ["TP_HIT", "SL_HIT", "CLOSED"];
export const OPEN_STATUSES: SignalStatus[] = ["PENDING", "ACTIVE"];
