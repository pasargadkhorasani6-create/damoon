import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { getActiveSubscription, subscriptionEndsAt } from "@/lib/subscription";
import { daysUntil, fa, faDate, faDateTime, toman } from "@/lib/format";
import { formatUsdt } from "@/lib/payments/tron";

export const metadata: Metadata = { title: "اشتراک و پرداخت" };

const STATUS: Record<string, [string, string]> = {
  PENDING: ["در انتظار", "text-info"],
  PAID: ["موفق", "text-up"],
  FAILED: ["ناموفق", "text-down"],
  EXPIRED: ["منقضی", "text-muted"],
};

export default async function SubscriptionPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const user = await requireUser();
  const { payment } = await searchParams;
  const [active, endsAt, payments] = await Promise.all([
    getActiveSubscription(user.id),
    subscriptionEndsAt(user.id),
    db.payment.findMany({ where: { userId: user.id }, include: { plan: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const daysLeft = daysUntil(endsAt);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">اشتراک و پرداخت</h1>
      {payment === "success" && <p className="rounded-xl border border-up/40 bg-up/10 p-4 text-up">پرداخت با موفقیت انجام شد و اشتراک شما فعال شد.</p>}
      {payment === "failed" && (
        <p className="rounded-xl border border-down/40 bg-down/10 p-4 text-down">
          پرداخت ناموفق بود. اگر مبلغی از حساب شما کسر شده، طبق قوانین بانکی حداکثر طی ۷۲ ساعت بازگردانده می‌شود.
        </p>
      )}
      <div className="card flex flex-wrap items-center gap-6">
        {active && endsAt ? (
          <>
            <div>
              <div className="text-sm text-muted">وضعیت</div>
              <div className="font-bold text-up">فعال</div>
            </div>
            <div>
              <div className="text-sm text-muted">پایان اشتراک</div>
              <div className="font-bold">{faDate(endsAt)}</div>
            </div>
            <div>
              <div className="text-sm text-muted">روزهای باقی‌مانده</div>
              <div className="font-bold">{fa(daysLeft)}</div>
            </div>
            <Link href="/pricing" className="btn-ghost ms-auto">
              تمدید
            </Link>
          </>
        ) : (
          <>
            <p className="text-muted">اشتراک فعالی ندارید.</p>
            <Link href="/pricing" className="btn-primary ms-auto">
              خرید اشتراک
            </Link>
          </>
        )}
      </div>

      <div className="card overflow-x-auto !p-0">
        <table className="w-full text-sm">
          <thead className="text-muted">
            <tr className="border-b border-line">
              {["تاریخ", "پلن", "روش", "مبلغ", "وضعیت", "پیگیری"].map((h) => (
                <th key={h} className="p-3 text-start font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => (
              <tr key={p.id} className="border-b border-line/50">
                <td className="p-3">{faDateTime(p.createdAt)}</td>
                <td className="p-3">{p.plan.title}</td>
                <td className="p-3">{p.provider === "ZARINPAL" ? "زرین‌پال" : "تتر"}</td>
                <td className="p-3">
                  {p.provider === "ZARINPAL" ? toman(Number(p.amount) / 10) : <span className="ltr-num">{formatUsdt(p.amount)} USDT</span>}
                </td>
                <td className={`p-3 ${STATUS[p.status][1]}`}>{STATUS[p.status][0]}</td>
                <td className="p-3">
                  {p.provider === "USDT_TRC20" && p.status === "PENDING" ? (
                    <Link href={`/dashboard/payments/${p.id}`} className="text-brand underline">
                      ادامه‌ی پرداخت
                    </Link>
                  ) : (
                    <span className="ltr-num text-xs text-muted">{p.refId ?? p.txHash?.slice(0, 12) ?? "—"}</span>
                  )}
                </td>
              </tr>
            ))}
            {payments.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-muted">
                  پرداختی ثبت نشده است.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
