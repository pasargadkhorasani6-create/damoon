import { env } from "@/lib/env";

/**
 * ارسال پیامک با ملی پیامک (REST کنسول).
 * - اگر MELIPAYAMAK_BODY_ID تنظیم شده باشد: ارسال با الگوی خدماتی (پیشنهادی؛ روی خطوط بلک‌لیست هم می‌رسد)
 * - در غیر این صورت: ارسال ساده از شماره‌ی MELIPAYAMAK_FROM
 */
const BASE = "https://console.melipayamak.com/api/send";

export class SmsError extends Error {}

export async function sendOtpSms(to: string, code: string, fetchImpl: typeof fetch = fetch): Promise<void> {
  const e = env();
  if (e.SMS_DRY_RUN) {
    console.info(`[sms:dry-run] OTP for ${to}: ${code}`);
    return;
  }
  if (!e.MELIPAYAMAK_CONSOLE_KEY) throw new SmsError("MELIPAYAMAK_CONSOLE_KEY is not set");

  let url: string;
  let body: unknown;
  if (e.MELIPAYAMAK_BODY_ID) {
    url = `${BASE}/shared/${encodeURIComponent(e.MELIPAYAMAK_CONSOLE_KEY)}`;
    body = { bodyId: Number(e.MELIPAYAMAK_BODY_ID), to, args: [code] };
  } else {
    if (!e.MELIPAYAMAK_FROM) throw new SmsError("MELIPAYAMAK_FROM or MELIPAYAMAK_BODY_ID must be set");
    url = `${BASE}/simple/${encodeURIComponent(e.MELIPAYAMAK_CONSOLE_KEY)}`;
    body = { from: e.MELIPAYAMAK_FROM, to, text: `${e.APP_NAME}\nکد تأیید شما: ${code}\nاین کد را در اختیار دیگران قرار ندهید.` };
  }

  const res = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = (await res.json().catch(() => ({}))) as { recId?: number; status?: string };
  // ملی پیامک در صورت موفقیت recId بزرگ‌تر از ۱۰۰۰ برمی‌گرداند
  if (!res.ok || !data.recId || data.recId < 1000) {
    throw new SmsError(`Melipayamak send failed: HTTP ${res.status} ${data.status ?? ""}`);
  }
}
