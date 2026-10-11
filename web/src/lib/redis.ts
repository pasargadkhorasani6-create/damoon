import Redis from "ioredis";
import { env } from "./env";

const g = globalThis as unknown as { redis?: Redis };

export function redis(): Redis {
  if (!g.redis) {
    g.redis = new Redis(env().REDIS_URL, { maxRetriesPerRequest: 3, lazyConnect: false });
  }
  return g.redis;
}

/** اتصال جدا برای subscribe (اتصال در حالت subscribe نمی‌تواند دستور دیگری اجرا کند) */
export function newRedisConnection(opts: { forBullmq?: boolean } = {}): Redis {
  return new Redis(env().REDIS_URL, opts.forBullmq ? { maxRetriesPerRequest: null } : {});
}
