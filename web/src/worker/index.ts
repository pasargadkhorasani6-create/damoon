/**
 * پروسس پس‌زمینه (جدا از وب‌سرور): کرون‌ها، صف ارسال تلگرام و دریافت پیام‌های ربات.
 * اجرا: npm run worker
 */
import "dotenv/config";
import { Queue, Worker } from "bullmq";
import { newRedisConnection } from "@/lib/redis";
import { telegramEnabled, TelegramError } from "@/lib/telegram/api";
import { processDmJob, processSignalJob } from "@/lib/telegram/deliver";
import { runPoller } from "@/lib/telegram/poller";
import { DM_QUEUE, SIGNAL_QUEUE, type DmJob, type SignalJob } from "@/lib/telegram/queue";
import { CRON_JOBS } from "./cron";

const conn = () => newRedisConnection({ forBullmq: true });

async function main() {
  const workers: Worker[] = [];
  const cronQueue = new Queue("cron", { connection: conn() });
  for (const [name, job] of Object.entries(CRON_JOBS)) {
    await cronQueue.upsertJobScheduler(name, { every: job.everyMs }, { name, opts: { removeOnComplete: 100, removeOnFail: 500 } });
  }
  workers.push(
    new Worker(
      "cron",
      async (j) => {
        const result = await CRON_JOBS[j.name]?.run();
        if (result) console.info(`[cron] ${j.name}:`, result);
        return result;
      },
      { connection: conn(), concurrency: 2 },
    ),
  );

  const abort = new AbortController();
  if (telegramEnabled()) {
    // سیگنال‌ها به ترتیب (ارسال → ویرایش)
    workers.push(new Worker<SignalJob>(SIGNAL_QUEUE, (j) => processSignalJob(j.data), { connection: conn(), concurrency: 1 }));
    // پیام خصوصی با محدودیت نرخ تلگرام
    const dm = new Worker<DmJob>(
      DM_QUEUE,
      async (j) => {
        try {
          await processDmJob(j.data);
        } catch (e) {
          if (e instanceof TelegramError && e.retryAfter) await dm.rateLimit(e.retryAfter * 1000);
          throw e;
        }
      },
      { connection: conn(), concurrency: 5, limiter: { max: 25, duration: 1000 } },
    );
    workers.push(dm);
    void runPoller(abort.signal);
  } else {
    console.warn("[worker] TELEGRAM_BOT_TOKEN not set — Telegram disabled");
  }

  for (const w of workers) w.on("failed", (j, e) => console.error(`[worker] ${w.name}/${j?.name} failed:`, e.message));
  console.info("[worker] started:", workers.map((w) => w.name).join(", "));

  const shutdown = async () => {
    console.info("[worker] shutting down");
    abort.abort();
    await Promise.all(workers.map((w) => w.close()));
    await cronQueue.close();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
