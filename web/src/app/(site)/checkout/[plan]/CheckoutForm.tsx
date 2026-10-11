"use client";

import Link from "next/link";
import { useActionState } from "react";
import { checkoutAction, type PayState } from "@/app/actions/payments";
import { FormMessage } from "@/components/forms";
import { useFormStatus } from "react-dom";
import { DISCLAIMER_SHORT } from "@/lib/site";

function PayButton({ method, children, primary }: { method: string; children: React.ReactNode; primary?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" name="method" value={method} disabled={pending} className={`${primary ? "btn-primary" : "btn-ghost"} w-full`}>
      {pending ? "در حال انتقال…" : children}
    </button>
  );
}

export function CheckoutForm({ plan, usdtEnabled }: { plan: string; usdtEnabled: boolean }) {
  const [state, action] = useActionState<PayState, FormData>(checkoutAction, {});
  return (
    <form action={action} className="space-y-5">
      <input type="hidden" name="plan" value={plan} />
      <FormMessage error={state.error} />
      <div className="rounded-xl border border-brand/30 bg-brand/5 p-4 text-sm leading-7">
        <strong className="text-brand">سلب مسئولیت: </strong>
        {DISCLAIMER_SHORT}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" name="accept" required className="mt-1.5 accent-brand" />
        <span>
          متن سلب مسئولیت و{" "}
          <Link href="/terms" target="_blank" className="text-brand underline">
            قوانین
          </Link>{" "}
          را خواندم و می‌پذیرم. می‌دانم سیگنال‌ها توصیه‌ی مالی نیستند، سودی تضمین نمی‌شود و پس از فعال‌سازی وجه بازگردانده نمی‌شود.
        </span>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <PayButton method="zarinpal" primary>
          پرداخت با زرین‌پال
        </PayButton>
        {usdtEnabled && <PayButton method="usdt">پرداخت با تتر (TRC20)</PayButton>}
      </div>
    </form>
  );
}
