import Link from "next/link";
import { db } from "@/lib/db";
import { faDateTime } from "@/lib/format";
import { fmtPrice, fmtR, STATUS_LABEL } from "@/components/signals/labels";
import { cancelSignalAction, resendSignalAction } from "@/app/actions/admin";
import { Flash, pageOf, PAGE_SIZE, Table, type SP } from "../ui";

export default async function AdminSignals({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const page = pageOf(sp.page);
  const signals = await db.signal.findMany({ orderBy: { signalAt: "desc" }, take: PAGE_SIZE, skip: (page - 1) * PAGE_SIZE });
  return (
    <>
      <h1 className="text-2xl font-bold">سیگنال‌ها</h1>
      <p className="text-sm text-muted">
        سیگنال‌ها فقط توسط ربات ثبت و به‌روزرسانی می‌شوند. ادمین فقط سیگنال «در انتظار» را می‌تواند لغو کند؛ نتیجه‌ی معاملات قابل ویرایش نیست.
      </p>
      <Flash msg={sp.msg} err={sp.err} />
      <Table head={["زمان", "نماد", "جهت", "ورود", "حد ضرر", "حد سود", "وضعیت", "نتیجه", "منبع", ""]} testId="admin-signals">
        {signals.map((s) => (
          <tr key={s.id}>
            <td className="whitespace-nowrap">{faDateTime(s.signalAt)}</td>
            <td className="ltr-num text-start">{s.symbol}</td>
            <td>{s.direction === "BUY" ? "خرید" : "فروش"}</td>
            <td className="ltr-num text-start">{fmtPrice(s.entry, s.digits)}</td>
            <td className="ltr-num text-start">{fmtPrice(s.stopLoss, s.digits)}</td>
            <td className="ltr-num text-start">{fmtPrice(s.takeProfit, s.digits)}</td>
            <td>{STATUS_LABEL[s.status]}{s.cancelReason ? <div className="text-xs text-muted">{s.cancelReason}</div> : null}</td>
            <td className="ltr-num text-start">{fmtR(s.resultR)}</td>
            <td className="ltr-num text-start text-xs text-muted">{s.source}/{s.externalId}</td>
            <td className="space-y-1">
              {s.status === "PENDING" && (
                <form action={cancelSignalAction} className="flex gap-1">
                  <input type="hidden" name="signalId" value={s.id} />
                  <input name="reason" placeholder="دلیل" className="input !w-24 !px-2 !py-1 text-xs" maxLength={80} />
                  <button className="text-xs text-down underline">لغو</button>
                </form>
              )}
              <form action={resendSignalAction}>
                <input type="hidden" name="signalId" value={s.id} />
                <button className="text-xs text-brand underline">ارسال مجدد تلگرام</button>
              </form>
            </td>
          </tr>
        ))}
      </Table>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn-ghost" href={`?page=${page - 1}`}>قبلی</Link>}
        {signals.length === PAGE_SIZE && <Link className="btn-ghost" href={`?page=${page + 1}`}>بعدی</Link>}
      </div>
    </>
  );
}
