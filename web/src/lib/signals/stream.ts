import "server-only";
import { onRealtime } from "@/lib/realtime-hub";
import type { RealtimeMessage } from "@/lib/realtime";

export const HEARTBEAT_MS = 25_000;
export const ACCESS_RECHECK_MS = 60_000;

/**
 * جریان SSE سیگنال‌ها. هر ACCESS_RECHECK_MS دسترسی کاربر دوباره بررسی می‌شود
 * تا با پایان اشتراک، اتصال باز هم قطع شود.
 */
export function createSignalStream(opts: {
  stillAllowed: () => Promise<boolean>;
  abortSignal?: AbortSignal;
  heartbeatMs?: number;
  recheckMs?: number;
}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  let cleanup = () => {};

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;
      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const unsubscribe = onRealtime((m: RealtimeMessage) => {
        send(`event: signal\ndata: ${JSON.stringify(m)}\n\n`);
      });
      const hb = setInterval(() => send(`: ping\n\n`), opts.heartbeatMs ?? HEARTBEAT_MS);
      const recheck = setInterval(async () => {
        if (!(await opts.stillAllowed().catch(() => false))) {
          send(`event: expired\ndata: {}\n\n`);
          cleanup();
        }
      }, opts.recheckMs ?? ACCESS_RECHECK_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        unsubscribe();
        clearInterval(hb);
        clearInterval(recheck);
        try {
          controller.close();
        } catch {
          /* قبلاً بسته شده */
        }
      };
      opts.abortSignal?.addEventListener("abort", () => cleanup());

      send(`retry: 5000\n\n`);
      send(`event: ready\ndata: {}\n\n`);
    },
    cancel() {
      cleanup();
    },
  });
}
