import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/bot/events/route";
import { listSignals } from "@/lib/signals/queries";
import { botRequest, newSignalEvent } from "./helpers";

describe("listSignals", () => {
  it("paginates newest first with a cursor", async () => {
    const base = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 5; i++) await POST(botRequest("/api/bot/events", newSignalEvent({ signalAt: base - i * 60 })));
    const p1 = await listSignals({ limit: 2 });
    expect(p1.items).toHaveLength(2);
    expect(p1.items[0].signalAt > p1.items[1].signalAt).toBe(true);
    const p2 = await listSignals({ limit: 2, cursor: p1.nextCursor });
    const p3 = await listSignals({ limit: 2, cursor: p2.nextCursor });
    expect(p3.items).toHaveLength(1);
    expect(p3.nextCursor).toBeNull();
    const ids = [...p1.items, ...p2.items, ...p3.items].map((s) => s.id);
    expect(new Set(ids).size).toBe(5);
  });
});
