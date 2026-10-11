import type { Metadata } from "next";
import Link from "next/link";
import { Disclaimer } from "@/components/Disclaimer";
import { getActivePlans } from "@/lib/payments/service";
import { fa, toman } from "@/lib/format";

export const metadata: Metadata = { title: "تعرفه‌ها" };
export const dynamic = "force-dynamic";

const FEATURES = ["سیگنال‌های XAUUSD، EURUSD و US30", "فید لحظه‌ای در پنل سایت", "کانال و ربات خصوصی تلگرام", "اعلام نتیجه‌ی هر معامله"];

export default async function PricingPage() {
  const plans = await getActivePlans();
  const monthly = plans.find((p) => p.days === 30);
  return (
    <div className="mx-auto max-w-4xl space-y-10 py-14">
      <div className="space-y-2 text-center">
        <h1 className="text-3xl font-extrabold">تعرفه‌ها</h1>
        <p className="text-muted">پرداخت با زرین‌پال یا تتر (TRC20). تمدید خودکار نیست؛ خرید مجدد به انتهای اشتراک فعلی اضافه می‌شود.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        {plans.map((p) => {
          const saving = monthly && p.days > monthly.days ? Math.round((1 - p.priceToman / ((monthly.priceToman * p.days) / monthly.days)) * 100) : 0;
          return (
            <div key={p.id} className={`card flex flex-col gap-5 ${saving > 0 ? "border-brand/60" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold">{p.title}</h2>
                {saving > 0 && <span className="rounded-full bg-brand px-3 py-1 text-xs font-bold text-brand-ink">{fa(saving)}٪ صرفه‌جویی</span>}
              </div>
              <div>
                <div className="text-3xl font-extrabold">{toman(p.priceToman)}</div>
                <div className="ltr-num mt-1 text-sm text-muted">{(p.priceUsdtCents / 100).toFixed(2)} USDT</div>
              </div>
              <ul className="space-y-2 text-sm text-muted">
                <li>✓ {fa(p.days)} روز دسترسی کامل</li>
                {FEATURES.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              <Link href={`/checkout/${p.slug}`} className="btn-primary mt-auto w-full">
                خرید اشتراک {p.title}
              </Link>
            </div>
          );
        })}
        {plans.length === 0 && <p className="card text-center text-muted md:col-span-2">در حال حاضر پلنی برای فروش فعال نیست.</p>}
      </div>
      <Disclaimer />
    </div>
  );
}
