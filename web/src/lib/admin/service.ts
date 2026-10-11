import { db } from "@/lib/db";
import { env } from "@/lib/env";
import type { Prisma } from "@/generated/prisma/client";
import { revokeAllUserSessions } from "@/lib/auth/session";
import { canViewSignals, grantSubscription } from "@/lib/subscription";
import { finalizePayment, scanUsdtPayments } from "@/lib/payments/service";
import { verifyPayment } from "@/lib/payments/zarinpal";
import { notifySignalChange } from "@/lib/signals/notify";
import { enqueueSignalTelegram, enqueueDms } from "@/lib/telegram/queue";
import { tg, telegramEnabled } from "@/lib/telegram/api";

export type Actor = { id: string; ip?: string | null };
export type AdminResult = { ok: true; message?: string } | { ok: false; error: string };

export async function audit(actor: Actor, action: string, target: string | null, data?: Prisma.InputJsonValue) {
  await db.auditLog.create({ data: { actorId: actor.id, action, target, data, ip: actor.ip ?? null } });
}

// ------------------------------------------------------------------ کاربران و اشتراک

export async function grantDays(actor: Actor, userId: string, days: number, note: string): Promise<AdminResult> {
  if (!Number.isInteger(days) || days < 1 || days > 3650) return { ok: false, error: "تعداد روز نامعتبر است." };
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "کاربر یافت نشد." };
  const sub = await db.$transaction((tx) => grantSubscription(tx, { userId, planSlug: "manual", days, source: "ADMIN", note: note.slice(0, 200) || undefined }));
  await audit(actor, "subscription.grant", `user:${userId}`, { days, note, subscriptionId: sub.id });
  return { ok: true, message: `${days} روز اشتراک اضافه شد.` };
}

export async function revokeSubscription(actor: Actor, subscriptionId: string): Promise<AdminResult> {
  const r = await db.subscription.updateMany({ where: { id: subscriptionId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (!r.count) return { ok: false, error: "اشتراک یافت نشد یا قبلاً لغو شده است." };
  await audit(actor, "subscription.revoke", `subscription:${subscriptionId}`);
  return { ok: true, message: "اشتراک لغو شد. دسترسی تلگرام در اجرای بعدی کرون قطع می‌شود." };
}

export async function setBan(actor: Actor, userId: string, banned: boolean): Promise<AdminResult> {
  if (userId === actor.id) return { ok: false, error: "نمی‌توانید حساب خودتان را مسدود کنید." };
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) return { ok: false, error: "کاربر یافت نشد." };
  if (user.role === "ADMIN") return { ok: false, error: "ادمین را نمی‌توان مسدود کرد." };
  await db.user.update({ where: { id: userId }, data: { bannedAt: banned ? new Date() : null } });
  if (banned) await revokeAllUserSessions(userId);
  await audit(actor, banned ? "user.ban" : "user.unban", `user:${userId}`);
  return { ok: true, message: banned ? "کاربر مسدود و از همه‌ی نشست‌ها خارج شد." : "مسدودی برداشته شد." };
}

// ------------------------------------------------------------------ سیگنال‌ها

/**
 * ادمین فقط سیگنالِ «در انتظار» را می‌تواند لغو کند (مثلاً خطای ربات).
 * معامله‌ی فعال یا بسته‌شده قابل لغو/ویرایش نیست تا آمار عملکرد دست‌کاری نشود.
 */
export async function adminCancelSignal(actor: Actor, signalId: string, reason: string): Promise<AdminResult> {
  const r = await db.signal.updateMany({
    where: { id: signalId, status: "PENDING" },
    data: { status: "CANCELED", cancelReason: `admin: ${reason}`.slice(0, 100), closedAt: new Date() },
  });
  if (!r.count) return { ok: false, error: "فقط سیگنال در انتظار فعال‌سازی قابل لغو است." };
  await db.signalEvent.create({ data: { signalId, type: "admin.canceled", payload: { by: actor.id, reason } } });
  await audit(actor, "signal.cancel", `signal:${signalId}`, { reason });
  await notifySignalChange(await db.signal.findUniqueOrThrow({ where: { id: signalId } }), "canceled");
  return { ok: true, message: "سیگنال لغو شد." };
}

export async function resendSignalTelegram(actor: Actor, signalId: string): Promise<AdminResult> {
  if (!telegramEnabled()) return { ok: false, error: "تلگرام فعال نیست." };
  const s = await db.signal.findUnique({ where: { id: signalId } });
  if (!s) return { ok: false, error: "سیگنال یافت نشد." };
  // پیام‌های قبلی فراموش می‌شوند تا پیام کامل دوباره ارسال شود
  await db.telegramMessage.deleteMany({ where: { signalId } });
  await enqueueSignalTelegram({ signalId, change: "created" });
  await audit(actor, "signal.resend", `signal:${signalId}`);
  return { ok: true, message: "در صف ارسال تلگرام قرار گرفت." };
}

// ------------------------------------------------------------------ پرداخت‌ها

/** بررسی مجدد پرداخت در انتظار (مثلاً کاربر به سایت برنگشته) — باز هم فقط با verify سمت سرور */
export async function recheckPayment(actor: Actor, paymentId: string, fetchImpl?: typeof fetch): Promise<AdminResult> {
  const p = await db.payment.findUnique({ where: { id: paymentId } });
  if (!p) return { ok: false, error: "پرداخت یافت نشد." };
  if (p.status === "PAID") return { ok: true, message: "این پرداخت قبلاً تأیید شده است." };
  await audit(actor, "payment.recheck", `payment:${paymentId}`);
  if (p.provider === "ZARINPAL") {
    if (!p.authority) return { ok: false, error: "این پرداخت به درگاه نرسیده است." };
    const v = await verifyPayment({ authority: p.authority, amountRial: Number(p.amount) }, fetchImpl);
    if (!v.ok) return { ok: false, error: `زرین‌پال پرداخت را تأیید نکرد (کد ${v.code ?? "?"}).` };
    const done = await finalizePayment(p.id, { refId: v.refId, cardPan: v.cardPan ?? null }, ["PENDING", "FAILED", "EXPIRED"]);
    return done ? { ok: true, message: "پرداخت تأیید و اشتراک فعال شد." } : { ok: false, error: "پرداخت قبلاً پردازش شده است." };
  }
  const n = await scanUsdtPayments();
  const fresh = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  return fresh.status === "PAID" ? { ok: true, message: "واریز پیدا و تأیید شد." } : { ok: false, error: `واریز منطبق پیدا نشد (${n} پرداخت دیگر تأیید شد).` };
}

// ------------------------------------------------------------------ پلن‌ها

export async function updatePlan(
  actor: Actor,
  planId: string,
  data: { title: string; priceToman: number; priceUsdtCents: number; days: number; active: boolean },
): Promise<AdminResult> {
  if (data.priceToman < 1000 || data.priceUsdtCents < 100 || data.days < 1) return { ok: false, error: "مقادیر نامعتبر است." };
  const before = await db.plan.findUnique({ where: { id: planId } });
  if (!before) return { ok: false, error: "پلن یافت نشد." };
  await db.plan.update({ where: { id: planId }, data });
  await audit(actor, "plan.update", `plan:${planId}`, {
    before: { title: before.title, priceToman: before.priceToman, priceUsdtCents: before.priceUsdtCents, days: before.days, active: before.active },
    after: data,
  });
  return { ok: true, message: "پلن به‌روزرسانی شد." };
}

// ------------------------------------------------------------------ پیام همگانی

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export async function sendBroadcast(
  actor: Actor,
  input: { text: string; audience: "ACTIVE" | "ALL"; viaTelegramDm: boolean; viaChannel: boolean; viaSite: boolean; siteDays: number },
): Promise<AdminResult> {
  const text = input.text.trim();
  if (text.length < 2 || text.length > 3500) return { ok: false, error: "متن پیام باید بین ۲ تا ۳۵۰۰ کاراکتر باشد." };
  if (!input.viaTelegramDm && !input.viaChannel && !input.viaSite) return { ok: false, error: "حداقل یک روش ارسال را انتخاب کنید." };

  let recipients = 0;
  if (input.viaTelegramDm && telegramEnabled()) {
    const users = await db.user.findMany({ where: { telegramId: { not: null }, bannedAt: null }, select: { id: true, role: true, bannedAt: true } });
    const target: string[] = [];
    for (const u of users) if (input.audience === "ALL" || (await canViewSignals(u))) target.push(u.id);
    await enqueueDms(target.map((userId) => ({ kind: "text" as const, userId, text: `📢 ${esc(text)}` })));
    recipients = target.length;
  }
  if (input.viaChannel && telegramEnabled() && env().TELEGRAM_CHANNEL_ID) {
    await tg("sendMessage", { chat_id: env().TELEGRAM_CHANNEL_ID, text: `📢 ${esc(text)}`, parse_mode: "HTML" });
  }
  const b = await db.broadcast.create({
    data: {
      text,
      audience: input.audience,
      viaTelegramDm: input.viaTelegramDm,
      viaChannel: input.viaChannel,
      viaSite: input.viaSite,
      recipients,
      createdById: actor.id,
      siteUntil: input.viaSite ? new Date(Date.now() + Math.min(Math.max(input.siteDays, 1), 60) * 86_400_000) : null,
    },
  });
  await audit(actor, "broadcast.send", `broadcast:${b.id}`, { audience: input.audience, recipients });
  return { ok: true, message: `پیام ثبت شد${recipients ? ` و برای ${recipients} نفر در صف ارسال تلگرام قرار گرفت` : ""}.` };
}

/** اطلاعیه‌های فعال سایت برای کاربر */
export async function activeAnnouncements(user: { id: string; role: string; bannedAt: Date | null }) {
  const rows = await db.broadcast.findMany({ where: { viaSite: true, siteUntil: { gt: new Date() } }, orderBy: { createdAt: "desc" }, take: 3 });
  if (!rows.some((r) => r.audience === "ACTIVE")) return rows;
  const active = await canViewSignals(user);
  return rows.filter((r) => r.audience === "ALL" || active);
}

// ------------------------------------------------------------------ نمای کلی

export async function overview() {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 86_400_000);
  const dayStart = new Date(now.getTime() - 86_400_000);
  const [users, activeSubs, revenue, pending, signals24h, openSignals] = await Promise.all([
    db.user.count(),
    db.subscription.findMany({ where: { revokedAt: null, startsAt: { lte: now }, endsAt: { gt: now } }, distinct: ["userId"], select: { userId: true } }),
    db.payment.groupBy({ by: ["currency"], where: { status: "PAID", paidAt: { gte: d30 } }, _sum: { amount: true }, _count: true }),
    db.payment.count({ where: { status: "PENDING" } }),
    db.signal.count({ where: { signalAt: { gte: dayStart } } }),
    db.signal.count({ where: { status: { in: ["PENDING", "ACTIVE"] } } }),
  ]);
  return { users, activeSubscribers: activeSubs.length, revenue, pendingPayments: pending, signals24h, openSignals };
}
