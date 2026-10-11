import Link from "next/link";
import { db } from "@/lib/db";
import { faDate } from "@/lib/format";
import { toLatinDigits } from "@/lib/phone";
import { Flash, pageOf, PAGE_SIZE, Table, type SP } from "../ui";

export default async function AdminUsers({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const q = toLatinDigits(sp.q?.trim() ?? "").slice(0, 100);
  const page = pageOf(sp.page);
  const now = new Date();
  const where = q
    ? { OR: [{ email: { contains: q, mode: "insensitive" as const } }, { phone: { contains: q } }, { name: { contains: q, mode: "insensitive" as const } }] }
    : {};
  const users = await db.user.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
    include: { subscriptions: { where: { revokedAt: null, endsAt: { gt: now } }, orderBy: { endsAt: "desc" }, take: 1 } },
  });
  return (
    <>
      <h1 className="text-2xl font-bold">کاربران و اشتراک‌ها</h1>
      <Flash msg={sp.msg} err={sp.err} />
      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="جست‌وجو: نام، ایمیل یا موبایل" className="input max-w-sm" />
        <button className="btn-ghost">جست‌وجو</button>
      </form>
      <Table head={["نام", "ایمیل", "موبایل", "اشتراک تا", "تلگرام", "وضعیت", "عضویت"]} testId="admin-users">
        {users.map((u) => (
          <tr key={u.id}>
            <td>
              <Link href={`/admin/users/${u.id}`} className="text-brand underline">
                {u.name}
              </Link>
              {u.role === "ADMIN" && <span className="ms-2 text-xs text-info">ادمین</span>}
            </td>
            <td className="ltr-num text-start">{u.email}</td>
            <td className="ltr-num text-start">{u.phone}</td>
            <td>{u.subscriptions[0] ? faDate(u.subscriptions[0].endsAt) : <span className="text-muted">—</span>}</td>
            <td>{u.telegramId ? (u.telegramInChannel ? "متصل · در کانال" : "متصل") : "—"}</td>
            <td>{u.bannedAt ? <span className="text-down">مسدود</span> : "فعال"}</td>
            <td>{faDate(u.createdAt)}</td>
          </tr>
        ))}
      </Table>
      <div className="flex gap-2">
        {page > 1 && <Link className="btn-ghost" href={`?q=${encodeURIComponent(q)}&page=${page - 1}`}>قبلی</Link>}
        {users.length === PAGE_SIZE && <Link className="btn-ghost" href={`?q=${encodeURIComponent(q)}&page=${page + 1}`}>بعدی</Link>}
      </div>
    </>
  );
}
