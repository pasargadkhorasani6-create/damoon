import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { faDateTime } from "@/lib/format";
import { formatUsdt } from "@/lib/payments/tron";
import { CopyButton } from "./CopyButton";
import { UsdtTxForm } from "./UsdtTxForm";

export const metadata: Metadata = { title: "پرداخت تتر" };

export default async function UsdtPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const p = await db.payment.findUnique({ where: { id }, include: { plan: true } });
  if (!p || p.userId !== user.id || p.provider !== "USDT_TRC20") notFound();
  const amount = formatUsdt(p.amount);
  const address = env().USDT_TRC20_ADDRESS;

  if (p.status === "PAID") {
    return (
      <div className="card space-y-4 text-center">
        <h1 className="text-xl font-bold text-up">پرداخت تأیید شد</h1>
        <p className="text-muted">اشتراک {p.plan.title} شما فعال شد.</p>
        <Link href="/dashboard/signals" className="btn-primary">
          رفتن به فید سیگنال
        </Link>
      </div>
    );
  }
  if (p.status !== "PENDING") {
    return (
      <div className="card space-y-4 text-center">
        <h1 className="text-xl font-bold">مهلت این پرداخت تمام شده است</h1>
        <p className="text-muted">اگر واریز انجام داده‌اید، هش تراکنش را برای پشتیبانی ارسال کنید.</p>
        <Link href="/pricing" className="btn-primary">
          ایجاد سفارش جدید
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">پرداخت تتر — اشتراک {p.plan.title}</h1>
      <div className="card space-y-5">
        <div className="rounded-xl border border-down/40 bg-down/10 p-3 text-sm leading-7">
          فقط <strong>USDT روی شبکه‌ی TRC20 (ترون)</strong> ارسال کنید و <strong>دقیقاً همین مبلغ</strong> را بفرستید (کارمزد شبکه را جدا
          پرداخت کنید). ارسال روی شبکه‌ی دیگر یا مبلغ متفاوت قابل پیگیری خودکار نیست.
        </div>
        <div>
          <div className="label">مبلغ دقیق</div>
          <div className="flex items-center gap-3">
            <span className="ltr-num text-2xl font-extrabold text-brand" data-testid="usdt-amount">
              {amount} USDT
            </span>
            <CopyButton text={amount} />
          </div>
        </div>
        <div>
          <div className="label">آدرس کیف پول (TRC20)</div>
          <div className="flex flex-wrap items-center gap-3">
            <code className="ltr-num break-all rounded-lg bg-bg px-3 py-2 text-sm">{address}</code>
            <CopyButton text={address} />
          </div>
        </div>
        <p className="text-sm text-muted">مهلت پرداخت تا {faDateTime(p.expiresAt)}. واریز به‌صورت خودکار هر دقیقه بررسی می‌شود؛ برای تأیید سریع‌تر هش تراکنش را وارد کنید.</p>
        <UsdtTxForm paymentId={p.id} />
      </div>
    </div>
  );
}
