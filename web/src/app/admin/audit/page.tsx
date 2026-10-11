import { db } from "@/lib/db";
import { faDateTime } from "@/lib/format";
import { Table } from "../ui";

export default async function AdminAudit() {
  const logs = await db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const actors = new Map((await db.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.actorId))] } }, select: { id: true, email: true } })).map((u) => [u.id, u.email]));
  return (
    <>
      <h1 className="text-2xl font-bold">لاگ اقدامات ادمین</h1>
      <Table head={["زمان", "ادمین", "اقدام", "هدف", "جزئیات", "IP"]}>
        {logs.map((l) => (
          <tr key={l.id}>
            <td className="whitespace-nowrap">{faDateTime(l.createdAt)}</td>
            <td className="ltr-num text-start">{actors.get(l.actorId) ?? l.actorId}</td>
            <td className="ltr-num text-start">{l.action}</td>
            <td className="ltr-num text-start text-xs">{l.target}</td>
            <td className="ltr-num max-w-sm truncate text-start text-xs text-muted">{l.data ? JSON.stringify(l.data) : ""}</td>
            <td className="ltr-num text-start text-xs">{l.ip}</td>
          </tr>
        ))}
      </Table>
    </>
  );
}
