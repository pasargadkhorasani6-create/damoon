import Link from "next/link";
import { Logo } from "./Logo";
import { getCurrentUser } from "@/lib/auth/current";

const NAV = [
  { href: "/strategy", label: "استراتژی" },
  { href: "/pricing", label: "تعرفه‌ها" },
  { href: "/performance", label: "عملکرد" },
  { href: "/faq", label: "سؤالات متداول" },
];

export async function Header() {
  const user = await getCurrentUser();
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-6 px-4 py-3">
        <Logo />
        <nav className="hidden items-center gap-5 text-sm text-muted md:flex">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="hover:text-ink">
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ms-auto flex items-center gap-2">
          {user ? (
            <>
              {user.role === "ADMIN" && (
                <Link href="/admin" className="btn-ghost !px-3 !py-2">
                  ادمین
                </Link>
              )}
              <Link href="/dashboard" className="btn-primary !px-4 !py-2">
                پنل کاربری
              </Link>
            </>
          ) : (
            <>
              <Link href="/login" className="btn-ghost !px-4 !py-2">
                ورود
              </Link>
              <Link href="/register" className="btn-primary !px-4 !py-2">
                ثبت‌نام
              </Link>
            </>
          )}
        </div>
      </div>
      <nav className="flex justify-center gap-4 border-t border-line/50 px-4 py-2 text-xs text-muted md:hidden">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href}>
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
