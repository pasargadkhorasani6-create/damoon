import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/current";
import { getActiveSubscription, subscriptionEndsAt } from "@/lib/subscription";
import { daysUntil, fa, faDate, faDateTime } from "@/lib/format";
import { activeAnnouncements } from "@/lib/admin/service";

export const metadata: Metadata = { title: "پنل کاربری" };

export default async function DashboardPage() {
  const user = await requireUser();
  const [active, endsAt, news] = await Promise.all([getActiveSubscription(user.id), subscriptionEndsAt(user.id), activeAnnouncements(user)]);
  const days = daysUntil(endsAt);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">سلام {user.name}</h1>
      {news.map((n) => (
        <div key={n.id} className="card border-info/40 !p-4" data-testid="announcement">
          <div className="mb-1 text-xs text-info">اطلاعیه · {faDateTime(n.createdAt)}</div>
          <p className="whitespace-pre-line text-sm leading-7">{n.text}</p>
        </div>
      ))}
      {active && endsAt ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card">
            <div className="text-sm text-muted">وضعیت اشتراک</div>
            <div className="mt-1 text-lg font-bold text-up">فعال</div>
          </div>
          <div className="card">
            <div className="text-sm text-muted">پایان اشتراک</div>
            <div className="mt-1 text-lg font-bold">{faDate(endsAt)}</div>
          </div>
          <div className={`card ${days <= 3 ? "border-down/50" : ""}`}>
            <div className="text-sm text-muted">روزهای باقی‌مانده</div>
            <div className="mt-1 text-lg font-bold">{fa(days)}</div>
          </div>
          <div className="flex flex-wrap gap-3 sm:col-span-3">
            <Link href="/dashboard/signals" className="btn-primary">
              فید سیگنال
            </Link>
            <Link href="/dashboard/telegram" className="btn-ghost">
              اتصال تلگرام
            </Link>
            {days <= 7 && (
              <Link href="/pricing" className="btn-ghost">
                تمدید اشتراک
              </Link>
            )}
          </div>
        </div>
      ) : (
        <div className="card">
          <p className="text-muted">اشتراک فعالی ندارید. برای دریافت سیگنال‌ها اشتراک تهیه کنید.</p>
          <Link href="/pricing" className="btn-primary mt-4">
            مشاهده‌ی تعرفه‌ها
          </Link>
        </div>
      )}
    </div>
  );
}
