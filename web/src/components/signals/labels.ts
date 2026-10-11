import type { SignalDTO } from "@/lib/signals/dto";

export const STATUS_LABEL: Record<SignalDTO["status"], string> = {
  PENDING: "در انتظار فعال‌سازی",
  ACTIVE: "فعال",
  TP_HIT: "تارگت",
  SL_HIT: "استاپ",
  CLOSED: "بسته‌شده",
  CANCELED: "لغو",
};

export const STATUS_STYLE: Record<SignalDTO["status"], string> = {
  PENDING: "bg-info/15 text-info",
  ACTIVE: "bg-brand/15 text-brand",
  TP_HIT: "bg-up/15 text-up",
  SL_HIT: "bg-down/15 text-down",
  CLOSED: "bg-muted/15 text-muted",
  CANCELED: "bg-muted/10 text-muted line-through",
};

export const ORDER_LABEL = { MARKET: "مارکت", STOP: "استاپ", LIMIT: "لیمیت" } as const;

export const fmtPrice = (v: number | null, digits: number) => (v == null ? "—" : v.toFixed(Math.min(Math.max(digits, 0), 8)));
export const fmtR = (r: number | null) => (r == null ? "—" : `${r > 0 ? "+" : ""}${r.toFixed(2)}R`);
