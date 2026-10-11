import type { Metadata } from "next";
import Link from "next/link";
import { Disclaimer } from "@/components/Disclaimer";

export const metadata: Metadata = { title: "تعرفه‌ها" };

// در فاز پرداخت، پلن‌ها از دیتابیس خوانده می‌شوند
const PLANS = [
  { slug: "monthly", title: "ماهانه", days: 30 },
  { slug: "quarterly", title: "سه‌ماهه", days: 90 },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 py-14">
      <h1 className="text-center text-3xl font-extrabold">تعرفه‌ها</h1>
      <div className="grid gap-6 md:grid-cols-2">
        {PLANS.map((p) => (
          <div key={p.slug} className="card space-y-4">
            <h2 className="text-xl font-bold">{p.title}</h2>
            <p className="text-muted">{p.days} روز دسترسی کامل</p>
            <Link href={`/checkout/${p.slug}`} className="btn-primary w-full">
              خرید
            </Link>
          </div>
        ))}
      </div>
      <Disclaimer />
    </div>
  );
}
