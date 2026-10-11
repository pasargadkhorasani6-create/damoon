import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/current";
import { canViewSignals } from "@/lib/subscription";
import { listSignals } from "@/lib/signals/queries";
import { SignalFeed } from "@/components/signals/SignalFeed";
import { Disclaimer } from "@/components/Disclaimer";

export const metadata: Metadata = { title: "فید سیگنال" };

export default async function SignalsPage() {
  const user = await requireUser();
  if (!(await canViewSignals(user))) {
    return (
      <div className="card space-y-4 text-center">
        <h1 className="text-xl font-bold">فید سیگنال فقط برای مشترکین فعال است</h1>
        <p className="text-muted">با تهیه‌ی اشتراک، سیگنال‌ها را لحظه‌ای در سایت و تلگرام دریافت کنید.</p>
        <Link href="/pricing" className="btn-primary">
          خرید اشتراک
        </Link>
      </div>
    );
  }
  const { items, nextCursor } = await listSignals({ limit: 30 });
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">فید سیگنال</h1>
      <Disclaimer compact />
      <SignalFeed initial={items} initialCursor={nextCursor} />
    </div>
  );
}
