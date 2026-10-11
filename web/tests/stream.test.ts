import { describe, expect, it, vi } from "vitest";
import { createSignalStream } from "@/lib/signals/stream";
import { publishRealtime } from "@/lib/realtime";
import { newSignalEvent, botRequest, makeUser } from "./helpers";
import { createSession, SESSION_COOKIE } from "@/lib/auth/session";
import { db } from "@/lib/db";

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, needle: string, timeoutMs = 5000) {
  const dec = new TextDecoder();
  let buf = "";
  const deadline = Date.now() + timeoutMs;
  while (!buf.includes(needle)) {
    if (Date.now() > deadline) throw new Error(`timeout waiting for ${needle}; got: ${buf}`);
    const { value, done } = await Promise.race([
      reader.read(),
      new Promise<{ value: undefined; done: true }>((r) => setTimeout(() => r({ value: undefined, done: true }), 200)),
    ]);
    if (value) buf += dec.decode(value);
    if (done && !value) continue;
  }
  return buf;
}

describe("SSE signal stream", () => {
  it("delivers published signal events to connected clients", async () => {
    const stream = createSignalStream({ stillAllowed: async () => true });
    const reader = stream.getReader();
    await readUntil(reader, "event: ready");
    // صبر کوتاه تا اتصال subscribe ردیس برقرار شود
    await new Promise((r) => setTimeout(r, 300));
    const { POST } = await import("@/app/api/bot/events/route");
    const ev = newSignalEvent();
    expect((await POST(botRequest("/api/bot/events", ev))).status).toBe(201);
    const got = await readUntil(reader, ev.externalId === "" ? "x" : '"change":"created"');
    expect(got).toContain('"symbol":"XAUUSD"');
    await reader.cancel();
  });

  it("closes with 'expired' when access is lost", async () => {
    let allowed = true;
    const stream = createSignalStream({ stillAllowed: async () => allowed, recheckMs: 100, heartbeatMs: 50 });
    const reader = stream.getReader();
    await readUntil(reader, ": ping");
    allowed = false;
    await readUntil(reader, "event: expired");
  });
});

describe("signals API access control", () => {
  it("401 without session, 403 without subscription, 200 with subscription", async () => {
    let token: string | undefined;
    vi.doMock("next/headers", () => ({
      cookies: async () => ({ get: (n: string) => (n === SESSION_COOKIE && token ? { value: token } : undefined) }),
      headers: async () => new Headers(),
    }));
    const { GET } = await import("@/app/api/signals/route");
    const req = () => new Request("http://localhost/api/signals");

    expect((await GET(req())).status).toBe(401);
    const u = await makeUser();
    token = (await createSession(u.id)).token;
    expect((await GET(req())).status).toBe(403);
    await db.subscription.create({
      data: { userId: u.id, planSlug: "monthly", startsAt: new Date(), endsAt: new Date(Date.now() + 86_400_000), source: "ADMIN" },
    });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ items: [], nextCursor: null });
    vi.doUnmock("next/headers");
  });
});
