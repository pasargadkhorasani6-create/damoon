"use client";

import { useActionState } from "react";
import { resetPasswordAction, type FormState } from "@/app/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/forms";

export function ResetForm() {
  const [state, action] = useActionState<FormState, FormData>(resetPasswordAction, {});
  const codeStep = state.step === "code";
  return (
    <form action={action} className="space-y-4">
      {codeStep && <input type="hidden" name="step" value="code" />}
      <FormMessage error={state.error} message={state.message} />
      {codeStep ? (
        <>
          <input type="hidden" name="phone" value={state.phone} />
          <Field label="کد بازیابی" name="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" required maxLength={6} />
          <Field label="رمز عبور جدید" name="password" type="password" dir="ltr" required minLength={8} autoComplete="new-password" />
          <SubmitButton>تغییر رمز و ورود</SubmitButton>
        </>
      ) : (
        <>
          <Field label="شماره موبایل حساب" name="phone" type="tel" dir="ltr" placeholder="09xxxxxxxxx" required />
          <SubmitButton>ارسال کد بازیابی</SubmitButton>
        </>
      )}
    </form>
  );
}
