import type { Payment, Subscription } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { faDate } from "@/lib/format";
import { enqueueDms } from "@/lib/telegram/queue";

/** بعد از فعال‌شدن اشتراک: اطلاع در تلگرام (اگر حساب متصل باشد) */
export async function onPaymentPaid(payment: Payment, subscription: Subscription) {
  console.info(`[payments] paid ${payment.id} → subscription ${subscription.id} until ${subscription.endsAt.toISOString()}`);
  const user = await db.user.findUnique({ where: { id: payment.userId }, select: { telegramId: true } });
  if (!user?.telegramId) return;
  await enqueueDms([
    {
      kind: "text",
      userId: payment.userId,
      text: `✅ پرداخت شما تأیید شد و اشتراک تا ${faDate(subscription.endsAt)} فعال است.${env().TELEGRAM_CHANNEL_ID ? "\nبرای عضویت در کانال: /channel" : ""}`,
    },
  ]);
}
