import { describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { canViewSignals, getActiveSubscription, grantSubscription } from "@/lib/subscription";
import { makeUser } from "./helpers";

const DAY = 86_400_000;

describe("subscription access", () => {
  it("no subscription → no access; admin always has access", async () => {
    const u = await makeUser();
    expect(await canViewSignals(u)).toBe(false);
    const a = await makeUser({ role: "ADMIN" });
    expect(await canViewSignals(a)).toBe(true);
  });

  it("active subscription grants access; expiry is time-based without cron", async () => {
    const u = await makeUser();
    await db.subscription.create({
      data: { userId: u.id, planSlug: "monthly", startsAt: new Date(Date.now() - DAY), endsAt: new Date(Date.now() + 1000), source: "ADMIN" },
    });
    expect(await canViewSignals(u)).toBe(true);
    expect(await getActiveSubscription(u.id, new Date(Date.now() + 2000))).toBeNull();
  });

  it("revoked subscription and banned user have no access", async () => {
    const u = await makeUser();
    const s = await db.$transaction((tx) => grantSubscription(tx, { userId: u.id, planSlug: "monthly", days: 30, source: "ADMIN" }));
    expect(await canViewSignals(u)).toBe(true);
    expect(await canViewSignals({ ...u, bannedAt: new Date() })).toBe(false);
    await db.subscription.update({ where: { id: s.id }, data: { revokedAt: new Date() } });
    expect(await canViewSignals(u)).toBe(false);
  });

  it("renewal stacks onto the end of the current subscription", async () => {
    const u = await makeUser();
    const now = new Date("2026-01-01T00:00:00Z");
    const a = await db.$transaction((tx) => grantSubscription(tx, { userId: u.id, planSlug: "monthly", days: 30, source: "PAYMENT", now }));
    const b = await db.$transaction((tx) => grantSubscription(tx, { userId: u.id, planSlug: "quarterly", days: 90, source: "PAYMENT", now }));
    expect(b.startsAt.toISOString()).toBe(a.endsAt.toISOString());
    expect(b.endsAt.getTime() - now.getTime()).toBe(120 * DAY);
  });
});
