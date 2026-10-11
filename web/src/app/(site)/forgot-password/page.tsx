import type { Metadata } from "next";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "بازیابی رمز عبور" };

export default function ForgotPasswordPage() {
  return (
    <div className="mx-auto max-w-md py-14">
      <div className="card space-y-6">
        <h1 className="text-2xl font-bold">بازیابی رمز عبور</h1>
        <p className="text-sm text-muted">کد بازیابی به شماره موبایل ثبت‌شده در حساب ارسال می‌شود. پس از تغییر رمز، همه‌ی نشست‌های قبلی خارج می‌شوند.</p>
        <ResetForm />
      </div>
    </div>
  );
}
