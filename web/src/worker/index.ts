/**
 * پروسس پس‌زمینه (جدا از وب‌سرور): کرون‌ها و صف ارسال تلگرام.
 * اجرا: npm run worker
 */
import "dotenv/config";
import { Queue, Worker } from "bullmq";
import { newRedisConnection } from "@/lib/redis";
import { CRON_JOBS } from "./cron";

const connection = newRedisConnection({ forBullmq: true });
const cronQueue = new Queue("cron", { connection });

async function main() {
  for (const [name, job] of Object.entries(CRON_JOBS)) {
    await cronQueue.upsertJobScheduler(name, { every: job.everyMs }, { name, opts: { removeOnComplete: 100, removeOnFail: 500 } });
  }

  const cronWorker = new Worker(
    "cron",
    async (j) => {
      const job = CRON_JOBS[j.name];
      if (!job) return;
      const result = await job.run();
      if (result) console.info(`[cron] ${j.name}:`, result);
      return result;
    },
    { connection: newRedisConnection({ forBullmq: true }), concurrency: 2 },
  );
  cronWorker.on("failed", (j, e) => console.error(`[cron] ${j?.name} failed:`, e.message));

  console.info("[worker] started:", Object.keys(CRON_JOBS).join(", "));

  const shutdown = async () => {
    console.info("[worker] shutting down");
    await cronWorker.close();
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
