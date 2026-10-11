import Link from "next/link";
import { Header } from "@/components/Header";
import { requireAdmin } from "@/lib/auth/current";

const LINKS = [
  ["/admin", "نمای کلی"],
  ["/admin/users", "کاربران و اشتراک‌ها"],
  ["/admin/payments", "پرداخت‌ها"],
  ["/admin/signals", "سیگنال‌ها"],
  ["/admin/broadcast", "پیام همگانی"],
  ["/admin/plans", "پلن‌ها و قیمت"],
  ["/admin/audit", "لاگ اقدامات"],
] as const;

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <Header />
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 lg:grid-cols-[200px_1fr]">
        <nav className="card h-fit space-y-1 !p-3" aria-label="منوی ادمین">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink">
              {label}
            </Link>
          ))}
        </nav>
        <main className="min-w-0 space-y-6">{children}</main>
      </div>
    </>
  );
}
