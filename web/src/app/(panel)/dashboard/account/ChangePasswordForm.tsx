"use client";

import { useActionState } from "react";
import { changePasswordAction, type FormState } from "@/app/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/forms";

export function ChangePasswordForm() {
  const [state, action] = useActionState<FormState, FormData>(changePasswordAction, {});
  return (
    <form action={action} className="max-w-sm space-y-4">
      <FormMessage error={state.error} message={state.message} />
      <Field label="رمز فعلی" name="current" type="password" dir="ltr" required autoComplete="current-password" />
      <Field label="رمز جدید" name="next" type="password" dir="ltr" required minLength={8} autoComplete="new-password" />
      <SubmitButton className="btn-primary">تغییر رمز</SubmitButton>
    </form>
  );
}
