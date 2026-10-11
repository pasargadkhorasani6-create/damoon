import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { RegisterForm } from "./RegisterForm";

export const metadata: Metadata = { title: "ثبت‌نام" };

export default async function RegisterPage() {
  if (await getCurrentUser()) redirect("/dashboard");
  return (
    <div className="mx-auto max-w-md py-14">
      <div className="card space-y-6">
        <h1 className="text-2xl font-bold">ساخت حساب کاربری</h1>
        <RegisterForm />
        <p className="text-center text-sm text-muted">
          حساب دارید؟{" "}
          <Link href="/login" className="text-brand">
            وارد شوید
          </Link>
        </p>
      </div>
    </div>
  );
}
