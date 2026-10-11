import { Queue } from "bullmq";
import { newRedisConnection } from "@/lib/redis";
import type { SignalChangeType } from "@/lib/realtime";
import { telegramEnabled } from "./api";

/** صف سیگنال‌ها ترتیبی پردازش می‌شود (concurrency=1) تا ویرایش قبل از ارسال اولیه انجام نشود */
export const SIGNAL_QUEUE = "tg-signal";
/** پیام‌های خصوصی با محدودیت نرخ تلگرام (حدود ۳۰ پیام در ثانیه) */
export const DM_QUEUE = "tg-dm";

export type SignalJob = { signalId: string; change: SignalChangeType };
export type DmJob =
  | { kind: "signal"; userId: string; signalId: string; change: SignalChangeType }
  | { kind: "text"; userId: string; text: string };

const g = globalThis as unknown as { __tgQueues?: { signal: Queue; dm: Queue } };

export function tgQueues() {
  if (!g.__tgQueues) {
    const connection = newRedisConnection({ forBullmq: true });
    g.__tgQueues = { signal: new Queue(SIGNAL_QUEUE, { connection }), dm: new Queue(DM_QUEUE, { connection }) };
  }
  return g.__tgQueues;
}

const jobOpts = { attempts: 6, backoff: { type: "exponential", delay: 3000 }, removeOnComplete: 1000, removeOnFail: 5000 } as const;

export async function enqueueSignalTelegram(job: SignalJob) {
  if (!telegramEnabled()) return;
  await tgQueues().signal.add("signal", job, jobOpts);
}

export async function enqueueDms(jobs: DmJob[]) {
  if (!telegramEnabled() || !jobs.length) return;
  await tgQueues().dm.addBulk(jobs.map((data) => ({ name: data.kind, data, opts: jobOpts })));
}
