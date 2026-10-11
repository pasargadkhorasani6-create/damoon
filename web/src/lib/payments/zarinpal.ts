import { env } from "@/lib/env";

/** API نسخه‌ی ۴ زرین‌پال. مبالغ به ریال ارسال می‌شوند (currency: IRR). */
const base = () => (env().ZARINPAL_SANDBOX ? "https://sandbox.zarinpal.com/pg" : "https://payment.zarinpal.com/pg");

export const startPayUrl = (authority: string) => `${base()}/StartPay/${encodeURIComponent(authority)}`;

type ZpResponse<T> = { data?: T | []; errors?: { code?: number; message?: string } | [] };

export class ZarinpalError extends Error {
  constructor(message: string, public code?: number) {
    super(message);
  }
}

async function post<T>(path: string, body: object, fetchImpl: typeof fetch): Promise<{ data: T | null; errorCode?: number; errorMessage?: string }> {
  const res = await fetchImpl(`${base()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as ZpResponse<T>;
  const data = json.data && !Array.isArray(json.data) ? (json.data as T) : null;
  const err = json.errors && !Array.isArray(json.errors) ? json.errors : undefined;
  return { data, errorCode: err?.code, errorMessage: err?.message };
}

export async function requestPayment(
  args: { amountRial: number; description: string; callbackUrl: string; mobile?: string; email?: string; orderId: string },
  fetchImpl: typeof fetch = fetch,
): Promise<{ authority: string }> {
  const { data, errorCode, errorMessage } = await post<{ code: number; authority: string }>(
    "/v4/payment/request.json",
    {
      merchant_id: env().ZARINPAL_MERCHANT_ID,
      amount: args.amountRial,
      currency: "IRR",
      description: args.description,
      callback_url: args.callbackUrl,
      metadata: { mobile: args.mobile, email: args.email, order_id: args.orderId },
    },
    fetchImpl,
  );
  if (data?.code !== 100 || !data.authority) throw new ZarinpalError(errorMessage ?? "payment request failed", errorCode ?? data?.code);
  return { authority: data.authority };
}

export type VerifyResult =
  | { ok: true; refId: string; cardPan?: string; alreadyVerified: boolean; raw: unknown }
  | { ok: false; code?: number; message?: string; raw: unknown };

/** تأیید سمت سرور؛ مبلغ از دیتابیس خوانده می‌شود، نه از درخواست کاربر */
export async function verifyPayment(args: { authority: string; amountRial: number }, fetchImpl: typeof fetch = fetch): Promise<VerifyResult> {
  const r = await post<{ code: number; ref_id: number | string; card_pan?: string }>(
    "/v4/payment/verify.json",
    { merchant_id: env().ZARINPAL_MERCHANT_ID, amount: args.amountRial, authority: args.authority },
    fetchImpl,
  );
  if (r.data && (r.data.code === 100 || r.data.code === 101)) {
    return { ok: true, refId: String(r.data.ref_id), cardPan: r.data.card_pan, alreadyVerified: r.data.code === 101, raw: r.data };
  }
  return { ok: false, code: r.errorCode ?? r.data?.code, message: r.errorMessage, raw: r };
}
