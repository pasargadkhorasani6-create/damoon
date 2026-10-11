import { hmacHex, safeEqualHex, sha256Hex } from "@/lib/crypto";
import { env } from "@/lib/env";
import { redis } from "@/lib/redis";

/**
 * امضای درخواست‌های ربات:
 *   canonical = `${timestamp}\n${nonce}\n${METHOD}\n${path}\n${sha256hex(body)}`
 *   X-Signature = hex(HMAC-SHA256(secret, canonical))
 * هدرها: X-Api-Key, X-Timestamp (ثانیه‌ی یونیکس), X-Nonce (۱۶ تا ۶۴ کاراکتر), X-Signature
 */
export const MAX_SKEW_SEC = 120;
export const NONCE_TTL_SEC = 600;

export function canonicalString(ts: string, nonce: string, method: string, path: string, body: string) {
  return `${ts}\n${nonce}\n${method.toUpperCase()}\n${path}\n${sha256Hex(body)}`;
}

export function signRequest(secret: string, ts: string, nonce: string, method: string, path: string, body: string) {
  return hmacHex(secret, canonicalString(ts, nonce, method, path, body));
}

export function parseApiKeys(raw: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const part of raw.split(",").map((s) => s.trim()).filter(Boolean)) {
    const i = part.indexOf(":");
    if (i <= 0) continue;
    const id = part.slice(0, i).trim();
    const secret = part.slice(i + 1).trim();
    if (secret.length >= 32) m.set(id, secret);
  }
  return m;
}

export type BotAuthResult = { ok: true; keyId: string } | { ok: false; status: number; error: string };

export async function verifyBotRequest(req: Request, body: string, now = Date.now()): Promise<BotAuthResult> {
  const keyId = req.headers.get("x-api-key") ?? "";
  const ts = req.headers.get("x-timestamp") ?? "";
  const nonce = req.headers.get("x-nonce") ?? "";
  const sig = (req.headers.get("x-signature") ?? "").toLowerCase();

  const secret = parseApiKeys(env().BOT_API_KEYS).get(keyId);
  if (!secret) return { ok: false, status: 401, error: "invalid api key" };
  if (!/^\d{9,11}$/.test(ts)) return { ok: false, status: 401, error: "invalid timestamp" };
  if (Math.abs(now / 1000 - Number(ts)) > MAX_SKEW_SEC) return { ok: false, status: 401, error: "timestamp out of range" };
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return { ok: false, status: 401, error: "invalid nonce" };

  const path = new URL(req.url).pathname;
  const expected = signRequest(secret, ts, nonce, req.method, path, body);
  if (!safeEqualHex(expected, sig)) return { ok: false, status: 401, error: "invalid signature" };

  // nonce فقط یک بار پذیرفته می‌شود (جلوگیری از replay). بعد از بررسی امضا ذخیره می‌شود تا مهاجم نتواند nonce را بسوزاند
  const fresh = await redis().set(`bot-nonce:${keyId}:${nonce}`, "1", "EX", NONCE_TTL_SEC, "NX");
  if (fresh !== "OK") return { ok: false, status: 401, error: "replayed nonce" };
  return { ok: true, keyId };
}
