import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { fa, toman } from "@/lib/format";
import { CheckoutForm } from "./CheckoutForm";

export const metadata: Metadata = { title: "خرید اشتراک" };

export default async function CheckoutPage({ params }: { params: Promise<{ plan: string }> }) {
  const { plan: slug } = await params;
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=/checkout/${encodeURIComponent(slug)}`);
  const plan = await db.plan.findUnique({ where: { slug } });
  if (!plan || !plan.active) notFound();
  return (
    <div className="mx-auto max-w-xl py-14">
      <div className="card space-y-6">
        <h1 className="text-2xl font-bold">خرید اشتراک {plan.title}</h1>
        <dl className="grid grid-cols-3 gap-3 text-center text-sm">
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="text-muted">مدت</dt>
            <dd className="mt-1 font-bold">{fa(plan.days)} روز</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="text-muted">ریالی</dt>
            <dd className="mt-1 font-bold">{toman(plan.priceToman)}</dd>
          </div>
          <div className="rounded-xl bg-surface-2 p-3">
            <dt className="text-muted">تتر</dt>
            <dd className="ltr-num mt-1 font-bold">{(plan.priceUsdtCents / 100).toFixed(2)} USDT</dd>
          </div>
        </dl>
        <CheckoutForm plan={plan.slug} usdtEnabled={!!env().USDT_TRC20_ADDRESS} />
      </div>
    </div>
  );
}
