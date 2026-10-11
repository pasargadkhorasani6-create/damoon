import type { Metadata } from "next";
import { requireUser } from "@/lib/auth/current";
import { ChangePasswordForm } from "./ChangePasswordForm";

export const metadata: Metadata = { title: "حساب کاربری" };

export default async function AccountPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">حساب کاربری</h1>
      <div className="card grid gap-3 text-sm sm:grid-cols-3">
        <div>
          <div className="text-muted">نام</div>
          <div>{user.name}</div>
        </div>
        <div>
          <div className="text-muted">ایمیل</div>
          <div className="ltr-num">{user.email}</div>
        </div>
        <div>
          <div className="text-muted">موبایل</div>
          <div className="ltr-num">{user.phone}</div>
        </div>
      </div>
      <div className="card">
        <h2 className="mb-4 font-bold">تغییر رمز عبور</h2>
        <ChangePasswordForm />
      </div>
    </div>
  );
}
