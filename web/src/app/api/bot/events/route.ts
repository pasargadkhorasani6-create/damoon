import { NextResponse } from "next/server";
import { verifyBotRequest } from "@/lib/bot/hmac";
import { rateLimit } from "@/lib/rate-limit";
import { botEventSchema } from "@/lib/signals/schemas";
import { applyBotEvent } from "@/lib/signals/service";
import { toSignalDTO } from "@/lib/signals/dto";

const MAX_BODY = 16 * 1024;

/** دریافت رویدادهای ربات معاملاتی (سیگنال جدید، فعال‌شدن، تغییر، لغو، بسته‌شدن) */
export async function POST(req: Request) {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > MAX_BODY) return NextResponse.json({ error: "payload too large" }, { status: 413 });
  const body = await req.text();
  if (body.length > MAX_BODY) return NextResponse.json({ error: "payload too large" }, { status: 413 });

  const auth = await verifyBotRequest(req, body);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rl = await rateLimit(`bot:${auth.keyId}`, 300, 60);
  if (!rl.ok) return NextResponse.json({ error: "rate limited" }, { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } });

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const parsed = botEventSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation failed", issues: parsed.error.issues.slice(0, 5) }, { status: 422 });
  }

  const res = await applyBotEvent(parsed.data, auth.keyId);
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true, duplicate: res.duplicate, signal: toSignalDTO(res.signal) }, { status: res.status });
}
