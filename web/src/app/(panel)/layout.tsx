import Link from "next/link";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { requireUser } from "@/lib/auth/current";
import { logoutAction } from "@/app/actions/auth";

const LINKS = [
  { href: "/dashboard", label: "داشبورد" },
  { href: "/dashboard/signals", label: "فید سیگنال" },
  { href: "/dashboard/subscription", label: "اشتراک و پرداخت" },
  { href: "/dashboard/telegram", label: "تلگرام" },
  { href: "/dashboard/account", label: "حساب کاربری" },
];

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <Header />
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-8 md:grid-cols-[220px_1fr]">
        <aside className="card h-fit space-y-1 !p-3">
          <div className="px-3 py-2 text-sm">
            <div className="font-semibold">{user.name}</div>
            <div className="ltr-num text-xs text-muted">{user.email}</div>
          </div>
          {LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="block rounded-lg px-3 py-2 text-sm text-muted hover:bg-surface-2 hover:text-ink">
              {l.label}
            </Link>
          ))}
          <form action={logoutAction}>
            <button className="w-full rounded-lg px-3 py-2 text-start text-sm text-down hover:bg-down/10">خروج</button>
          </form>
        </aside>
        <main className="min-w-0">{children}</main>
      </div>
      <Footer />
    </>
  );
}
