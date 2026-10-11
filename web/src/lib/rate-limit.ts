import { redis } from "./redis";

export type RateLimitResult = { ok: boolean; remaining: number; retryAfterSec: number };

/**
 * Fixed-window rate limit روی Redis؛ بین همه‌ی پروسس‌ها مشترک است.
 * key مثلاً "login:ip:1.2.3.4"
 */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateLimitResult> {
  const k = `rl:${key}`;
  const r = redis();
  const [[, count], [, ttl]] = (await r
    .multi()
    .incr(k)
    .ttl(k)
    .exec()) as [[null, number], [null, number]];
  if (ttl < 0) await r.expire(k, windowSec);
  const retryAfterSec = ttl < 0 ? windowSec : ttl;
  return { ok: count <= limit, remaining: Math.max(0, limit - count), retryAfterSec };
}

export async function resetRateLimit(key: string) {
  await redis().del(`rl:${key}`);
}
