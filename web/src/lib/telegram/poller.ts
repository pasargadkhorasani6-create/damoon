import { redis } from "@/lib/redis";
import { tg, TelegramError, type TgUpdate } from "./api";
import { handleUpdate } from "./bot";

const OFFSET_KEY = "tg:offset";

/**
 * دریافت آپدیت‌ها با long polling (به‌جای webhook)، تا سرور ایران
 * نیازی به دریافت درخواست مستقیم از سرورهای تلگرام نداشته باشد.
 */
export async function pollOnce(timeoutSec = 25): Promise<number> {
  const offset = Number((await redis().get(OFFSET_KEY)) ?? 0);
  const updates = await tg<TgUpdate[]>(
    "getUpdates",
    { offset, timeout: timeoutSec, allowed_updates: ["message", "chat_join_request"] },
    (timeoutSec + 10) * 1000,
  );
  for (const u of updates) {
    try {
      await handleUpdate(u);
    } catch (e) {
      console.error("[telegram] update failed", u.update_id, e);
    }
    await redis().set(OFFSET_KEY, String(u.update_id + 1));
  }
  return updates.length;
}

export async function runPoller(signal: AbortSignal) {
  // اگر قبلاً webhook تنظیم شده باشد getUpdates کار نمی‌کند
  await tg("deleteWebhook", { drop_pending_updates: false }).catch(() => {});
  let backoff = 1000;
  while (!signal.aborted) {
    try {
      await pollOnce();
      backoff = 1000;
    } catch (e) {
      const wait = e instanceof TelegramError && e.retryAfter ? e.retryAfter * 1000 : backoff;
      console.error("[telegram] polling error:", (e as Error).message);
      await new Promise((r) => setTimeout(r, wait));
      backoff = Math.min(backoff * 2, 60_000);
    }
  }
}
