import Link from "next/link";
import { SITE } from "@/lib/site";

export function Logo() {
  return (
    <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden>
        <rect width="28" height="28" rx="8" fill="var(--color-brand)" />
        <path d="M6 19l5-5 4 3 7-8" stroke="var(--color-brand-ink)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>{SITE.name}</span>
    </Link>
  );
}
