"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { loginOtpAction, loginPasswordAction, type FormState } from "@/app/actions/auth";
import { Field, FormMessage, SubmitButton } from "@/components/forms";

function PasswordForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(loginPasswordAction, {});
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <FormMessage error={state.error} />
      <Field label="ایمیل" name="email" type="email" dir="ltr" required autoComplete="email" />
      <Field label="رمز عبور" name="password" type="password" dir="ltr" required autoComplete="current-password" />
      <SubmitButton>ورود</SubmitButton>
      <Link href="/forgot-password" className="block text-center text-sm text-muted hover:text-ink">
        رمز عبور را فراموش کرده‌ام
      </Link>
    </form>
  );
}

function OtpForm({ next }: { next: string }) {
  const [state, action] = useActionState<FormState, FormData>(loginOtpAction, {});
  const codeStep = state.step === "code";
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      {codeStep && <input type="hidden" name="step" value="code" />}
      <FormMessage error={state.error} message={state.message} />
      {codeStep ? (
        <>
          <input type="hidden" name="phone" value={state.phone} />
          <Field label="کد ورود" name="code" inputMode="numeric" autoComplete="one-time-code" dir="ltr" required maxLength={6} />
          <SubmitButton>ورود</SubmitButton>
        </>
      ) : (
        <>
          <Field label="شماره موبایل" name="phone" type="tel" dir="ltr" placeholder="09xxxxxxxxx" required autoComplete="tel" />
          <SubmitButton>ارسال کد ورود</SubmitButton>
        </>
      )}
    </form>
  );
}

export function LoginForms({ next }: { next: string }) {
  const [tab, setTab] = useState<"password" | "otp">("password");
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-bg p-1 text-sm">
        {(
          [
            ["password", "ایمیل و رمز عبور"],
            ["otp", "موبایل و کد یک‌بارمصرف"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`rounded-lg py-2 ${tab === k ? "bg-surface-2 font-semibold text-ink" : "text-muted"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {tab === "password" ? <PasswordForm next={next} /> : <OtpForm next={next} />}
    </div>
  );
}
