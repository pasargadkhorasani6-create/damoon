import Link from "next/link";
import { db } from "@/lib/db";
import { faDateTime, toman } from "@/lib/format";
import { formatUsdt } from "@/lib/payments/tron";
import { recheckPaymentAction } from "@/app/actions/admin";
import type { PaymentStatus } from "@/generated/prisma/client";
import { Flash, pageOf, PAGE_SIZE, Table, type SP } from "../ui";

const STATUSES: PaymentStatus[] = ["PENDING", "PAID", "FAILED", "EXPIRED"];

export default async function AdminPayments({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const status = STATUSES.find((s) => s === sp.status);
  const page = pageOf(sp.page);
  const payments = await db.payment.findMany({
    where: status ? { status } : {},
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
    include: { user: { select: { id: true, name: true, email: true } }, plan: true },
  });
  return (
    <>
      <h1 className="text-2xl font-bold">پرداخت‌ها</h1>
      <Flash msg={sp.msg} err={sp.err} />
      <div className="flex flex-wrap gap-2 text-sm">
        <Link href="/admin/payments" className="btn-ghost !py-1.5">همه</Link>
        {STATUSES.map((s) => (
          <Link key={s} href={`/admin/payments?status=${s}`} className={`btn-ghost !py-1.5 ${status === s ? "border-brand" : ""}`}>
            {s}
          </Link>
        ))}
      </div>
      <Table head={["تاریخ", "کاربر", "پلن", "روش", "مبلغ", "وضعیت", "پیگیری", ""]} testId="admin-payments">
        {payments.map((p) => (
          <tr key={p.id}>
            <td className="whitespace-nowrap">{faDateTime(p.createdAt)}</td>
            <td>
              <Link href={`/admin/users/${p.user.id}`} className="text-brand underline">{p.user.name}</Link>
            </td>
            <td>{p.plan.title}</td>
            <td>{p.provider === "ZARINPAL" ? "زرین‌پال" : "تتر"}</td>
            <td className="whitespace-nowrap">{p.currency === "IRR" ? toman(Number(p.amount) / 10) : `${formatUsdt(p.amount)} USDT`}</td>
            <td>{p.status}{p.failReason ? <div className="text-xs text-muted">{p.failReason}</div> : null}</td>
            <td className="ltr-num max-w-40 truncate text-start text-xs">{p.refId ?? p.txHash ?? p.authority ?? "—"}</td>
            <td>
              {p.status !== "PAID" && (
                <form action={recheckPaymentAction}>
                  <input type="hidden" name="paymentId" value={p.id} />
                  <button className="text-xs text-brand underline">بررسی مجدد</button>
                </form>
              )}
            </td>
          </tr>
        ))}
      </Table>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn-ghost" href={`?${status ? `status=${status}&` : ""}page=${page - 1}`}>قبلی</Link>}
        {payments.length === PAGE_SIZE && <Link className="btn-ghost" href={`?${status ? `status=${status}&` : ""}page=${page + 1}`}>بعدی</Link>}
      </div>
    </>
  );
}
