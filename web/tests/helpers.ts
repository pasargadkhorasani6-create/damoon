import { db } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";

let n = 0;
export async function makeUser(over: Partial<{ email: string; phone: string; password: string; role: "USER" | "ADMIN"; name: string }> = {}) {
  n++;
  const password = over.password ?? "secret-pass-123";
  return db.user.create({
    data: {
      name: over.name ?? `کاربر ${n}`,
      email: over.email ?? `user${n}-${Date.now()}@example.com`,
      phone: over.phone ?? `0912${String(1000000 + n * 7919 + (Date.now() % 1000)).slice(-7)}`,
      passwordHash: await hashPassword(password),
      role: over.role ?? "USER",
    },
  });
}

import { randomBytes } from "node:crypto";
import { signRequest } from "@/lib/bot/hmac";

export const TEST_BOT_KEY = "testbot";
export const TEST_BOT_SECRET = "test-bot-secret-0123456789abcdef0123456789abcdef";

/** درخواست امضاشده‌ی ربات می‌سازد (مانند signal_publisher.py) */
export function botRequest(
  path: string,
  body: unknown,
  opts: { method?: string; secret?: string; ts?: number; nonce?: string; key?: string } = {},
) {
  const method = opts.method ?? "POST";
  const raw = body === undefined ? "" : JSON.stringify(body);
  const ts = String(opts.ts ?? Math.floor(Date.now() / 1000));
  const nonce = opts.nonce ?? randomBytes(12).toString("hex");
  const sig = signRequest(opts.secret ?? TEST_BOT_SECRET, ts, nonce, method, path, raw);
  return new Request(`http://localhost:3000${path}`, {
    method,
    body: method === "GET" ? undefined : raw,
    headers: {
      "content-type": "application/json",
      "x-api-key": opts.key ?? TEST_BOT_KEY,
      "x-timestamp": ts,
      "x-nonce": nonce,
      "x-signature": sig,
    },
  });
}

let ticket = 1000;
export function newSignalEvent(over: Record<string, unknown> = {}) {
  ticket++;
  return {
    type: "signal.new",
    externalId: `acc1-${ticket}`,
    symbol: "XAUUSD.r",
    direction: "BUY",
    orderType: "STOP",
    entry: 2400,
    stopLoss: 2395,
    takeProfit: 2405,
    timeframe: "M5",
    digits: 2,
    signalAt: Math.floor(Date.now() / 1000),
    ...over,
  };
}

export async function seedPlans() {
  const { db } = await import("@/lib/db");
  await db.plan.createMany({
    data: [
      { slug: "monthly", title: "ماهانه", days: 30, priceToman: 1_500_000, priceUsdtCents: 1500, sortOrder: 1 },
      { slug: "quarterly", title: "سه‌ماهه", days: 90, priceToman: 3_900_000, priceUsdtCents: 3900, sortOrder: 2 },
    ],
  });
}
