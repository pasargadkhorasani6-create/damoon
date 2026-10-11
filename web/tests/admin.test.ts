import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import * as admin from "@/lib/admin/service";
import { POST } from "@/app/api/bot/events/route";
import { canViewSignals } from "@/lib/subscription";
import { createSession, validateSessionToken } from "@/lib/auth/session";
import { startZarinpal } from "@/lib/payments/service";
import { setTelegramTransport } from "@/lib/telegram/api";
import { botRequest, makeUser, newSignalEvent, seedPlans } from "./helpers";

let actor: admin.Actor;
beforeEach(async () => {
  const a = await makeUser({ role: "ADMIN" });
  actor = { id: a.id, ip: "9.9.9.9" };
});

describe("admin: users & subscriptions", () => {
  it("grants manual days, stacks them, and audits", async () => {
    const u = await makeUser();
    expect((await admin.grantDays(actor, u.id, 10, "جبران")).ok).toBe(true);
    expect(await canViewSignals(u)).toBe(true);
    expect((await admin.grantDays(actor, u.id, 0, "")).ok).toBe(false);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "subscription.grant" } });
    expect(log).toMatchObject({ actorId: actor.id, target: `user:${u.id}`, ip: "9.9.9.9" });
  });

  it("revokes a subscription", async () => {
    const u = await makeUser();
    await admin.grantDays(actor, u.id, 10, "");
    const s = await db.subscription.findFirstOrThrow({ where: { userId: u.id } });
    expect((await admin.revokeSubscription(actor, s.id)).ok).toBe(true);
    expect(await canViewSignals(u)).toBe(false);
    expect((await admin.revokeSubscription(actor, s.id)).ok).toBe(false);
  });

  it("ban revokes sessions; cannot ban self or other admins", async () => {
    const u = await makeUser();
    const { token } = await createSession(u.id);
    expect((await admin.setBan(actor, u.id, true)).ok).toBe(true);
    expect(await validateSessionToken(token)).toBeNull();
    expect((await admin.setBan(actor, actor.id, true)).ok).toBe(false);
    const other = await makeUser({ role: "ADMIN" });
    expect((await admin.setBan(actor, other.id, true)).ok).toBe(false);
  });
});

describe("admin: signals", () => {
  it("can cancel only pending signals; results cannot be altered", async () => {
    const pending = newSignalEvent();
    const r1 = await (await POST(botRequest("/api/bot/events", pending))).json();
    expect((await admin.adminCancelSignal(actor, r1.signal.id, "خطای ربات")).ok).toBe(true);
    expect((await db.signal.findUniqueOrThrow({ where: { id: r1.signal.id } })).status).toBe("CANCELED");

    const active = newSignalEvent();
    const r2 = await (await POST(botRequest("/api/bot/events", active))).json();
    await POST(botRequest("/api/bot/events", { type: "signal.activated", externalId: active.externalId, fillPrice: 2400, at: Math.floor(Date.now() / 1000) }));
    expect((await admin.adminCancelSignal(actor, r2.signal.id, "x")).ok).toBe(false);
    expect((await db.signal.findUniqueOrThrow({ where: { id: r2.signal.id } })).status).toBe("ACTIVE");
  });
});

describe("admin: payments & plans", () => {
  it("recheck verifies a pending Zarinpal payment server-side", async () => {
    await seedPlans();
    const u = await makeUser();
    const f = vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith("request.json") ? { data: { code: 100, authority: "RC1" }, errors: [] } : { data: { code: 100, ref_id: 42 }, errors: [] })),
    ) as unknown as typeof fetch;
    const r = await startZarinpal(u, "monthly", f);
    if (!r.ok) throw new Error();
    expect((await admin.recheckPayment(actor, r.paymentId, f)).ok).toBe(true);
    expect(await canViewSignals(u)).toBe(true);
    expect((await admin.recheckPayment(actor, r.paymentId, f)).ok).toBe(true); // idempotent
    expect(await db.subscription.count({ where: { userId: u.id } })).toBe(1);
  });

  it("updates plan prices with audit of before/after", async () => {
    await seedPlans();
    const p = await db.plan.findUniqueOrThrow({ where: { slug: "monthly" } });
    expect((await admin.updatePlan(actor, p.id, { title: "ماهانه", days: 30, priceToman: 2_000_000, priceUsdtCents: 2000, active: true })).ok).toBe(true);
    expect((await db.plan.findUniqueOrThrow({ where: { id: p.id } })).priceToman).toBe(2_000_000);
    expect((await admin.updatePlan(actor, p.id, { title: "x", days: 30, priceToman: 1, priceUsdtCents: 2000, active: true })).ok).toBe(false);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "plan.update" } });
    expect(JSON.stringify(log.data)).toContain("1500000");
  });
});

describe("admin: broadcast", () => {
  it("queues DMs for the chosen audience, posts to channel, shows site notice", async () => {
    const calls: string[] = [];
    setTelegramTransport(async (m) => {
      calls.push(m);
      return { message_id: 1 };
    });
    const sub = await makeUser();
    await db.user.update({ where: { id: sub.id }, data: { telegramId: 9001n } });
    await admin.grantDays(actor, sub.id, 5, "");
    const free = await makeUser();
    await db.user.update({ where: { id: free.id }, data: { telegramId: 9002n } });

    const r = await admin.sendBroadcast(actor, { text: "سلام <b>", audience: "ACTIVE", viaTelegramDm: true, viaChannel: true, viaSite: true, siteDays: 3 });
    expect(r.ok).toBe(true);
    const b = await db.broadcast.findFirstOrThrow();
    // ادمین هم مشترک محسوب می‌شود ولی تلگرام متصل ندارد
    expect(b.recipients).toBe(1);
    expect(calls).toEqual(["sendMessage"]);

    expect(await admin.activeAnnouncements({ ...sub, bannedAt: null })).toHaveLength(1);
    expect(await admin.activeAnnouncements({ ...free, bannedAt: null })).toHaveLength(0);
    expect((await admin.sendBroadcast(actor, { text: "x", audience: "ALL", viaTelegramDm: false, viaChannel: false, viaSite: false, siteDays: 1 })).ok).toBe(false);
    setTelegramTransport(null);
  });
});
