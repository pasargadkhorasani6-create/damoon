import Link from "next/link";
import { Disclaimer } from "@/components/Disclaimer";

const FEATURES = [
  { t: "سیگنال لحظه‌ای", d: "به محض ثبت سفارش توسط ربات، سیگنال با نقطه‌ی ورود، حد ضرر و حد سود در پنل شما و تلگرام نمایش داده می‌شود." },
  { t: "قوانین ثابت و بدون احساس", d: "تمام سیگنال‌ها توسط ربات و بر اساس قوانین مکتوب استراتژی میکروکانال البروکس صادر می‌شوند؛ نه حدس و نه هیجان." },
  { t: "مدیریت ریسک سخت‌گیرانه", d: "ریسک ثابت در هر معامله، سقف ضرر روزانه و ماهانه، محدودیت تعداد پوزیشن باز و فیلتر ساعت معاملاتی و اسپرد." },
  { t: "عملکرد شفاف و واقعی", d: "آمار وین‌ریت، امید ریاضی و دراودان فقط از معاملاتی محاسبه می‌شود که ربات ثبت کرده است. هیچ عدد دستی وجود ندارد." },
];

const STEPS = [
  { n: "۱", t: "ثبت‌نام کنید", d: "با ایمیل و موبایل حساب بسازید." },
  { n: "۲", t: "اشتراک بگیرید", d: "پلن ماهانه یا سه‌ماهه را با زرین‌پال یا تتر پرداخت کنید." },
  { n: "۳", t: "سیگنال دریافت کنید", d: "در پنل سایت و کانال/ربات خصوصی تلگرام." },
];

export default function Home() {
  return (
    <div className="space-y-24 py-16">
      <section className="grid items-center gap-10 md:grid-cols-2">
        <div className="space-y-6">
          <p className="inline-block rounded-full border border-brand/40 px-3 py-1 text-xs text-brand">XAUUSD · EURUSD · US30</p>
          <h1 className="text-3xl font-extrabold leading-[1.6] md:text-4xl md:leading-[1.6]">
            سیگنال‌های معاملاتی بر پایه‌ی <span className="text-brand">میکروکانال البروکس</span>
          </h1>
          <p className="leading-8 text-muted">
            ربات معاملاتی ما بازار را کندل به کندل بررسی می‌کند و فقط وقتی سیگنال می‌دهد که الگوی ادامه‌ی روند پس از اولین پولبک با
            همه‌ی فیلترهای ریسک هم‌خوانی داشته باشد. همان سفارشی که ربات روی حساب واقعی ثبت می‌کند، برای شما ارسال می‌شود.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link href="/pricing" className="btn-primary">
              مشاهده‌ی تعرفه‌ها
            </Link>
            <Link href="/performance" className="btn-ghost">
              عملکرد واقعی
            </Link>
          </div>
        </div>
        <div className="card space-y-4" aria-label="نمونه‌ی ظاهر یک سیگنال">
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold">نمونه‌ی کارت سیگنال</span>
            <span className="rounded-full bg-info/15 px-2 py-0.5 text-xs text-info">نمایشی</span>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center text-sm">
            {[
              ["نماد", "XAUUSD"],
              ["جهت", "خرید (Buy Stop)"],
              ["وضعیت", "در انتظار فعال‌سازی"],
              ["ورود", "—"],
              ["حد ضرر", "—"],
              ["حد سود", "—"],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-surface-2 p-3">
                <div className="text-xs text-muted">{k}</div>
                <div className="mt-1 font-semibold">{v}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">قیمت‌ها فقط برای مشترکین فعال نمایش داده می‌شوند.</p>
        </div>
      </section>

      <section className="grid gap-5 md:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.t} className="card">
            <h2 className="mb-2 font-bold text-brand">{f.t}</h2>
            <p className="text-sm leading-7 text-muted">{f.d}</p>
          </div>
        ))}
      </section>

      <section>
        <h2 className="mb-6 text-center text-2xl font-bold">شروع در سه قدم</h2>
        <div className="grid gap-5 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="card text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-brand font-bold text-brand-ink">{s.n}</div>
              <h3 className="font-bold">{s.t}</h3>
              <p className="mt-1 text-sm text-muted">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <Disclaimer />
    </div>
  );
}
