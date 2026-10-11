import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth/current";

export const metadata: Metadata = { title: "پنل کاربری" };

export default async function DashboardPage() {
  const user = await requireUser();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">سلام {user.name}</h1>
      <div className="card">
        <p className="text-muted">برای دریافت سیگنال‌ها اشتراک تهیه کنید.</p>
        <Link href="/pricing" className="btn-primary mt-4">
          مشاهده‌ی تعرفه‌ها
        </Link>
      </div>
    </div>
  );
}
