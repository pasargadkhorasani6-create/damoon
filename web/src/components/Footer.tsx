import Link from "next/link";
import { Disclaimer } from "./Disclaimer";
import { SITE } from "@/lib/site";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line/70 bg-surface/40">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-10">
        <Disclaimer compact />
        <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-muted">
          <p>© {new Date().getFullYear()} {SITE.name} — همه‌ی حقوق محفوظ است.</p>
          <nav className="flex flex-wrap gap-4">
            <Link href="/terms">قوانین و سلب مسئولیت</Link>
            <Link href="/faq">سؤالات متداول</Link>
            <Link href="/performance">عملکرد</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
