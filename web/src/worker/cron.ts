import { env } from "@/lib/env";
import { expireStalePayments, scanUsdtPayments } from "@/lib/payments/service";
import { telegramEnabled } from "@/lib/telegram/api";
import { removeExpiredMembers, sendExpiryReminders } from "@/lib/telegram/membership";

/** کارهای زمان‌بندی‌شده؛ هر کدام مستقل و idempotent هستند */
export const CRON_JOBS: Record<string, { everyMs: number; run: () => Promise<unknown> }> = {
  "payments:expire": { everyMs: 60_000, run: () => expireStalePayments() },
  "payments:scan-usdt": {
    everyMs: 60_000,
    run: async () => (env().USDT_TRC20_ADDRESS ? scanUsdtPayments() : 0),
  },
  // انقضای خودکار: حذف از کانال تلگرام پس از پایان اشتراک
  "subscriptions:telegram-kick": { everyMs: 5 * 60_000, run: async () => (telegramEnabled() ? removeExpiredMembers() : 0) },
  "subscriptions:remind": { everyMs: 60 * 60_000, run: async () => (telegramEnabled() ? sendExpiryReminders() : 0) },
};
