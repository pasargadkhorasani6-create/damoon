const faNum = new Intl.NumberFormat("fa-IR");

export const fa = (n: number | string) => (typeof n === "number" ? faNum.format(n) : n.replace(/\d/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[+d]));

export function toman(n: number) {
  return `${faNum.format(n)} تومان`;
}

const dtf = new Intl.DateTimeFormat("fa-IR", {
  timeZone: "Asia/Tehran",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});
const df = new Intl.DateTimeFormat("fa-IR", { timeZone: "Asia/Tehran", year: "numeric", month: "long", day: "numeric" });

export const faDateTime = (d: Date | string) => dtf.format(new Date(d));
export const faDate = (d: Date | string) => df.format(new Date(d));

/** تعداد روزهای باقی‌مانده تا تاریخ (گرد به بالا) */
export function daysUntil(d: Date | null, now = Date.now()): number {
  return d ? Math.max(0, Math.ceil((d.getTime() - now) / 86_400_000)) : 0;
}

export function subscriptionState(s: { startsAt: Date; endsAt: Date; revokedAt: Date | null }, now = Date.now()) {
  if (s.revokedAt) return { label: "لغو شده", current: false };
  if (s.endsAt.getTime() < now) return { label: "منقضی", current: false };
  if (s.startsAt.getTime() > now) return { label: "آینده", current: true };
  return { label: "فعال", current: true };
}
