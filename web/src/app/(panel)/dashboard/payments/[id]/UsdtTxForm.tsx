"use client";

import { useActionState } from "react";
import { submitTxAction, type PayState } from "@/app/actions/payments";
import { Field, FormMessage, SubmitButton } from "@/components/forms";

export function UsdtTxForm({ paymentId }: { paymentId: string }) {
  const [state, action] = useActionState<PayState, FormData>(submitTxAction, {});
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="paymentId" value={paymentId} />
      <FormMessage error={state.error} message={state.message} />
      <Field label="هش تراکنش (TxID)" name="txHash" dir="ltr" required minLength={64} maxLength={66} placeholder="e.g. 4f1c…" />
      <SubmitButton className="btn-primary">بررسی تراکنش</SubmitButton>
    </form>
  );
}
