import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/current";
import { LoginForms } from "./LoginForms";

export const metadata: Metadata = { title: "ورود" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getCurrentUser()) redirect("/dashboard");
  const { next = "/dashboard" } = await searchParams;
  return (
    <div className="mx-auto max-w-md py-14">
      <div className="card space-y-6">
        <h1 className="text-2xl font-bold">ورود به حساب</h1>
        <LoginForms next={next} />
        <p className="text-center text-sm text-muted">
          حساب ندارید؟{" "}
          <Link href="/register" className="text-brand">
            ثبت‌نام کنید
          </Link>
        </p>
      </div>
    </div>
  );
}
