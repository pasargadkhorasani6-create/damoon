import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { canViewSignals } from "@/lib/subscription";
import { faDate } from "@/lib/format";
import { tg, TelegramError } from "./api";
import { enqueueDms } from "./queue";

/** کرون: اعضای کانال که اشتراکشان تمام شده حذف می‌شوند (ban + unban تا بعد از تمدید بتوانند برگردند) */
export async function removeExpiredMembers(): Promise<number> {
  const channel = env().TELEGRAM_CHANNEL_ID;
  if (!channel) return 0;
  const members = await db.user.findMany({ where: { telegramInChannel: true, telegramId: { not: null } } });
  let removed = 0;
  for (const u of members) {
    if (await canViewSignals(u)) continue;
    try {
      await tg("banChatMember", { chat_id: channel, user_id: u.telegramId!.toString(), until_date: Math.floor(Date.now() / 1000) + 60 });
      await tg("unbanChatMember", { chat_id: channel, user_id: u.telegramId!.toString(), only_if_banned: true });
    } catch (e) {
      // کاربر قبلاً کانال را ترک کرده
      if (!(e instanceof TelegramError && /not found|not a member|PARTICIPANT_ID_INVALID/i.test(e.description))) throw e;
    }
    await db.user.update({ where: { id: u.id }, data: { telegramInChannel: false } });
    await enqueueDms([{ kind: "text", userId: u.id, text: `اشتراک شما به پایان رسید و دسترسی به کانال سیگنال قطع شد.\nبرای تمدید: ${env().APP_URL}/pricing` }]);
    removed++;
  }
  return removed;
}

/** کرون: یادآوری ۳ روز مانده به پایان اشتراک (فقط اگر اشتراک بعدی خریده نشده باشد) */
export async function sendExpiryReminders(now = new Date()): Promise<number> {
  const soon = new Date(now.getTime() + 3 * 86_400_000);
  const subs = await db.subscription.findMany({
    where: { reminderSentAt: null, revokedAt: null, endsAt: { gt: now, lte: soon }, user: { telegramId: { not: null } } },
  });
  let sent = 0;
  for (const s of subs) {
    const later = await db.subscription.findFirst({ where: { userId: s.userId, revokedAt: null, endsAt: { gt: s.endsAt } } });
    await db.subscription.update({ where: { id: s.id }, data: { reminderSentAt: now } });
    if (later) continue;
    await enqueueDms([
      { kind: "text", userId: s.userId, text: `⏰ اشتراک شما در ${faDate(s.endsAt)} به پایان می‌رسد.\nبرای تمدید: ${env().APP_URL}/pricing` },
    ]);
    sent++;
  }
  return sent;
}
