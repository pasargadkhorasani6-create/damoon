import "server-only";
import { EventEmitter } from "node:events";
import { newRedisConnection } from "./redis";
import { SIGNAL_CHANNEL, type RealtimeMessage } from "./realtime";

/**
 * یک اتصال Redis subscribe برای هر پروسس؛ پیام‌ها بین همه‌ی کلاینت‌های SSE همان پروسس پخش می‌شوند.
 * (به‌جای یک اتصال Redis برای هر کاربر)
 */
type Hub = { emitter: EventEmitter; started: boolean };
const g = globalThis as unknown as { __signalHub?: Hub };

function hub(): Hub {
  if (!g.__signalHub) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    g.__signalHub = { emitter, started: false };
  }
  const h = g.__signalHub;
  if (!h.started) {
    h.started = true;
    const sub = newRedisConnection();
    sub.subscribe(SIGNAL_CHANNEL).catch((e) => {
      console.error("[realtime] subscribe failed", e);
      h.started = false;
    });
    sub.on("message", (_ch, raw) => {
      try {
        h.emitter.emit("message", JSON.parse(raw) as RealtimeMessage);
      } catch {
        /* پیام نامعتبر */
      }
    });
  }
  return h;
}

export function onRealtime(listener: (m: RealtimeMessage) => void): () => void {
  const h = hub();
  h.emitter.on("message", listener);
  return () => h.emitter.off("message", listener);
}
