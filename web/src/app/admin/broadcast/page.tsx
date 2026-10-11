import { db } from "@/lib/db";
import { fa, faDateTime } from "@/lib/format";
import { broadcastAction } from "@/app/actions/admin";
import { Flash, Table, type SP } from "../ui";

export default async function AdminBroadcast({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const history = await db.broadcast.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
  return (
    <>
      <h1 className="text-2xl font-bold">پیام همگانی</h1>
      <Flash msg={sp.msg} err={sp.err} />
      <form action={broadcastAction} className="card space-y-4">
        <textarea name="text" required minLength={2} maxLength={3500} rows={5} className="input" placeholder="متن پیام…" aria-label="متن پیام" />
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="audience" value="ACTIVE" defaultChecked className="accent-brand" /> فقط مشترکین فعال
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="audience" value="ALL" className="accent-brand" /> همه‌ی کاربران
          </label>
        </div>
        <div className="flex flex-wrap gap-6 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="dm" defaultChecked className="accent-brand" /> پیام خصوصی تلگرام
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="channel" className="accent-brand" /> کانال تلگرام
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="site" defaultChecked className="accent-brand" /> اطلاعیه در پنل سایت به مدت
            <input type="number" name="siteDays" defaultValue={7} min={1} max={60} className="input !w-20 !py-1" aria-label="روز" /> روز
          </label>
        </div>
        <button className="btn-primary">ارسال</button>
      </form>
      <Table head={["زمان", "متن", "مخاطب", "روش", "گیرندگان تلگرام"]}>
        {history.map((b) => (
          <tr key={b.id}>
            <td className="whitespace-nowrap">{faDateTime(b.createdAt)}</td>
            <td className="max-w-md truncate">{b.text}</td>
            <td>{b.audience === "ALL" ? "همه" : "مشترکین فعال"}</td>
            <td className="text-xs">{[b.viaTelegramDm && "DM", b.viaChannel && "کانال", b.viaSite && "سایت"].filter(Boolean).join("، ")}</td>
            <td>{fa(b.recipients)}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
