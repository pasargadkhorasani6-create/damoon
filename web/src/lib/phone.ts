const faDigits = "۰۱۲۳۴۵۶۷۸۹";
const arDigits = "٠١٢٣٤٥٦٧٨٩";

/** ارقام فارسی/عربی را به لاتین تبدیل می‌کند */
export function toLatinDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (d) => {
    const i = faDigits.indexOf(d);
    return String(i >= 0 ? i : arDigits.indexOf(d));
  });
}

/** شماره موبایل ایران را به قالب 09xxxxxxxxx نرمال می‌کند؛ نامعتبر = null */
export function normalizeIranMobile(input: string): string | null {
  let s = toLatinDigits(input).replace(/[\s\-()]/g, "");
  if (s.startsWith("+98")) s = "0" + s.slice(3);
  else if (s.startsWith("0098")) s = "0" + s.slice(4);
  else if (s.startsWith("98") && s.length === 12) s = "0" + s.slice(2);
  else if (s.startsWith("9") && s.length === 10) s = "0" + s;
  return /^09\d{9}$/.test(s) ? s : null;
}

export function maskPhone(p: string): string {
  return p.length === 11 ? `${p.slice(0, 4)}***${p.slice(7)}` : p;
}
