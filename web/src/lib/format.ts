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
