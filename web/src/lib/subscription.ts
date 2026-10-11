import { db } from "./db";
import type { Prisma } from "@/generated/prisma/client";

const activeWhere = (userId: string, now: Date): Prisma.SubscriptionWhereInput => ({
  userId,
  revokedAt: null,
  startsAt: { lte: now },
  endsAt: { gt: now },
});

/** اشتراک فعال = بازه‌ی زمانی معتبر و لغونشده. انقضا مستقیماً از زمان محاسبه می‌شود (به کرون وابسته نیست) */
export async function getActiveSubscription(userId: string, now = new Date()) {
  return db.subscription.findFirst({ where: activeWhere(userId, now), orderBy: { endsAt: "desc" } });
}

/** تاریخ پایان آخرین اشتراک (برای تمدید: مدت جدید به انتهای اشتراک فعلی اضافه می‌شود) */
export async function subscriptionEndsAt(userId: string, now = new Date()): Promise<Date | null> {
  const last = await db.subscription.findFirst({
    where: { userId, revokedAt: null, endsAt: { gt: now } },
    orderBy: { endsAt: "desc" },
  });
  return last?.endsAt ?? null;
}

/** دسترسی به سیگنال‌ها: مشترک فعال یا ادمین */
export async function canViewSignals(user: { id: string; role: string; bannedAt?: Date | null }) {
  if (user.bannedAt) return false;
  if (user.role === "ADMIN") return true;
  return (await getActiveSubscription(user.id)) !== null;
}

const DAY = 86_400_000;

/** اشتراک جدید را از انتهای اشتراک فعلی (یا اکنون) شروع می‌کند */
export async function grantSubscription(
  tx: Prisma.TransactionClient,
  args: { userId: string; planSlug: string; days: number; source: "PAYMENT" | "ADMIN"; note?: string; now?: Date },
) {
  const now = args.now ?? new Date();
  const last = await tx.subscription.findFirst({
    where: { userId: args.userId, revokedAt: null, endsAt: { gt: now } },
    orderBy: { endsAt: "desc" },
  });
  const startsAt = last ? last.endsAt : now;
  return tx.subscription.create({
    data: {
      userId: args.userId,
      planSlug: args.planSlug,
      startsAt,
      endsAt: new Date(startsAt.getTime() + args.days * DAY),
      source: args.source,
      note: args.note,
    },
  });
}
