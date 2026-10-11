import { ProxyAgent, fetch as undiciFetch, type RequestInit as UndiciInit } from "undici";
import { env } from "./env";

let agent: ProxyAgent | null = null;

/**
 * fetch برای سرویس‌های خارج از ایران (TronGrid، Telegram).
 * اگر OUTBOUND_PROXY_URL تنظیم شده باشد، درخواست از پراکسی عبور می‌کند.
 */
export async function outboundFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<Response> {
  const proxy = env().OUTBOUND_PROXY_URL;
  const signal = init.signal ?? AbortSignal.timeout(init.timeoutMs ?? 15_000);
  if (!proxy) return fetch(url, { ...init, signal });
  agent ??= new ProxyAgent(proxy);
  const res = await undiciFetch(url, { ...(init as UndiciInit), signal, dispatcher: agent });
  return res as unknown as Response;
}
