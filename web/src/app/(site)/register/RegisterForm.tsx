"use client";

import Link from "next/link";
import { useActionState } from "react";
import { registerAction, type FormState } from "@/app/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/forms";

export function RegisterForm() {
  const [state, action] = useActionState<FormState, FormData>(registerAction, {});

  if (state.step === "code") {
    return (
      <form action={action} className="space-y-4">
        <input type="hidden" name="step" value="code" />
        <input type="hidden" name="phone" value={state.phone} />
        <FormMessage error={state.error} message={state.message} />
        <p className="text-sm text-muted">
          کد ۶ رقمی ارسال‌شده به <span className="ltr-num">{state.phone}</span> را وارد کنید.
        </p>
        <Field label="کد تأیید" name="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" required maxLength={6} />
        <SubmitButton>تأیید و ساخت حساب</SubmitButton>
      </form>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <FormMessage error={state.error} />
      <Field label="نام و نام خانوادگی" name="name" required autoComplete="name" />
      <Field label="ایمیل" name="email" type="email" dir="ltr" required autoComplete="email" />
      <Field label="شماره موبایل" name="phone" type="tel" dir="ltr" placeholder="09xxxxxxxxx" required autoComplete="tel" />
      <Field label="رمز عبور (حداقل ۸ کاراکتر)" name="password" type="password" dir="ltr" required minLength={8} autoComplete="new-password" />
      <label className="flex items-start gap-2 text-sm text-muted">
        <input type="checkbox" name="accept" className="mt-1.5 accent-brand" required />
        <span>
          <Link href="/terms" className="text-brand underline" target="_blank">
            قوانین و سلب مسئولیت
          </Link>{" "}
          را خوانده‌ام و می‌پذیرم که سیگنال‌ها توصیه‌ی مالی نیستند و سودی تضمین نمی‌شود.
        </span>
      </label>
      <SubmitButton>دریافت کد تأیید</SubmitButton>
    </form>
  );
}
