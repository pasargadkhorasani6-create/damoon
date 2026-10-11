import Link from "next/link";
import { DISCLAIMER_SHORT } from "@/lib/site";

export function Disclaimer({ compact = false }: { compact?: boolean }) {
  return (
    <div
      role="note"
      className={`rounded-xl border border-brand/30 bg-brand/5 text-ink/85 ${compact ? "p-3 text-xs leading-6" : "p-4 text-sm leading-7"}`}
    >
      <strong className="text-brand">سلب مسئولیت: </strong>
      {DISCLAIMER_SHORT}{" "}
      <Link href="/terms" className="text-brand underline underline-offset-4">
        قوانین کامل
      </Link>
    </div>
  );
}
