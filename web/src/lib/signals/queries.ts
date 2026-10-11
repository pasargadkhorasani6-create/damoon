import { db } from "@/lib/db";
import { toSignalDTO, type SignalDTO } from "./dto";

export async function listSignals(opts: { cursor?: string | null; limit?: number } = {}): Promise<{ items: SignalDTO[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const rows = await db.signal.findMany({
    orderBy: [{ signalAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
  });
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map(toSignalDTO);
  return { items, nextCursor: hasMore ? items[items.length - 1].id : null };
}
