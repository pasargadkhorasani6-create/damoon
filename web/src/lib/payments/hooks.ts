import type { Payment, Subscription } from "@/generated/prisma/client";

/** بعد از فعال‌شدن اشتراک (در فاز تلگرام: ارسال لینک دعوت کانال) */
export async function onPaymentPaid(payment: Payment, subscription: Subscription) {
  console.info(`[payments] paid ${payment.id} → subscription ${subscription.id} until ${subscription.endsAt.toISOString()}`);
}
