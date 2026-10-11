import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { faDate, faDateTime, subscriptionState, toman } from "@/lib/format";
import { formatUsdt } from "@/lib/payments/tron";
import { banAction, grantDaysAction, revokeSubscriptionAction } from "@/app/actions/admin";
import { Flash, Table } from "../../ui";

export default async function AdminUser({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const u = await db.user.findUnique({
    where: { id },
    include: { subscriptions: { orderBy: { endsAt: "desc" } }, payments: { orderBy: { createdAt: "desc" }, take: 30, include: { plan: true } } },
  });
  if (!u) notFound();
  return (
    <>
      <h1 className="text-2xl font-bold">{u.name}</h1>
      <Flash msg={sp.msg} err={sp.err} />
      <div className="card grid gap-3 text-sm sm:grid-cols-4">
        <div><div className="text-muted">ایمیل</div><div className="ltr-num">{u.email}</div></div>
        <div><div className="text-muted">موبایل</div><div className="ltr-num">{u.phone}</div></div>
        <div><div className="text-muted">تلگرام</div><div className="ltr-num">{u.telegramUsername ? `@${u.telegramUsername}` : u.telegramId ? String(u.telegramId) : "—"}</div></div>
        <div><div className="text-muted">ثبت‌نام</div><div>{faDateTime(u.createdAt)}</div></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <form action={grantDaysAction} className="card space-y-3">
          <h2 className="font-bold">افزودن اشتراک دستی</h2>
          <input type="hidden" name="userId" value={u.id} />
          <input name="days" type="number" min={1} max={3650} defaultValue={30} className="input" aria-label="تعداد روز" />
          <input name="note" placeholder="توضیح (مثلاً جبران قطعی)" className="input" maxLength={200} aria-label="توضیح" />
          <button className="btn-primary">افزودن روز</button>
        </form>
        <form action={banAction} className="card space-y-3">
          <h2 className="font-bold">وضعیت حساب</h2>
          <input type="hidden" name="userId" value={u.id} />
          <input type="hidden" name="ban" value={u.bannedAt ? "0" : "1"} />
          <p className="text-sm text-muted">{u.bannedAt ? `مسدود از ${faDateTime(u.bannedAt)}` : "حساب فعال است. مسدودسازی همه‌ی نشست‌ها را خارج می‌کند."}</p>
          <button className={u.bannedAt ? "btn-ghost" : "btn-ghost text-down"}>{u.bannedAt ? "رفع مسدودی" : "مسدود کردن"}</button>
        </form>
      </div>

      <h2 className="font-bold">اشتراک‌ها</h2>
      <Table head={["از", "تا", "منبع", "وضعیت", ""]}>
        {u.subscriptions.map((s) => {
          const st = subscriptionState(s);
          return (
            <tr key={s.id}>
              <td>{faDate(s.startsAt)}</td>
              <td>{faDate(s.endsAt)}</td>
              <td>{s.source === "ADMIN" ? `دستی${s.note ? ` (${s.note})` : ""}` : "پرداخت"}</td>
              <td>{st.label}</td>
              <td>
                {st.current && (
                  <form action={revokeSubscriptionAction}>
                    <input type="hidden" name="userId" value={u.id} />
                    <input type="hidden" name="subscriptionId" value={s.id} />
                    <button className="text-xs text-down underline">لغو</button>
                  </form>
                )}
              </td>
            </tr>
          );
        })}
      </Table>

      <h2 className="font-bold">پرداخت‌ها</h2>
      <Table head={["تاریخ", "پلن", "روش", "مبلغ", "وضعیت", "پیگیری"]}>
        {u.payments.map((p) => (
          <tr key={p.id}>
            <td>{faDateTime(p.createdAt)}</td>
            <td>{p.plan.title}</td>
            <td>{p.provider === "ZARINPAL" ? "زرین‌پال" : "تتر"}</td>
            <td>{p.currency === "IRR" ? toman(Number(p.amount) / 10) : `${formatUsdt(p.amount)} USDT`}</td>
            <td>{p.status}</td>
            <td className="ltr-num text-start text-xs">{p.refId ?? p.txHash ?? "—"}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
