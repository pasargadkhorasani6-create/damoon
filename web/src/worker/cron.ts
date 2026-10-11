import { env } from "@/lib/env";
import { expireStalePayments, scanUsdtPayments } from "@/lib/payments/service";

/** کارهای زمان‌بندی‌شده؛ هر کدام مستقل و idempotent هستند */
export const CRON_JOBS: Record<string, { everyMs: number; run: () => Promise<unknown> }> = {
  "payments:expire": { everyMs: 60_000, run: () => expireStalePayments() },
  "payments:scan-usdt": {
    everyMs: 60_000,
    run: async () => (env().USDT_TRC20_ADDRESS ? scanUsdtPayments() : 0),
  },
};
