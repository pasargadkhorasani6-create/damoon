import { env } from "@/lib/env";
import { outboundFetch } from "@/lib/http";

export class TelegramError extends Error {
  constructor(
    public method: string,
    public code: number,
    public description: string,
    public retryAfter?: number,
  ) {
    super(`Telegram ${method} failed: ${code} ${description}`);
  }
}

export type Transport = (method: string, params: Record<string, unknown>, timeoutMs?: number) => Promise<unknown>;

const httpTransport: Transport = async (method, params, timeoutMs = 15_000) => {
  const e = env();
  const res = await outboundFetch(`${e.TELEGRAM_API_BASE}/bot${e.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
    timeoutMs,
  });
  const json = (await res.json().catch(() => ({}))) as {
    ok?: boolean;
    result?: unknown;
    error_code?: number;
    description?: string;
    parameters?: { retry_after?: number };
  };
  if (!json.ok) throw new TelegramError(method, json.error_code ?? res.status, json.description ?? "unknown", json.parameters?.retry_after);
  return json.result;
};

let transport: Transport = httpTransport;

/** فقط برای تست */
export function setTelegramTransport(t: Transport | null) {
  transport = t ?? httpTransport;
}

export const telegramEnabled = () => !!env().TELEGRAM_BOT_TOKEN;

export function tg<T = unknown>(method: string, params: Record<string, unknown> = {}, timeoutMs?: number): Promise<T> {
  return transport(method, params, timeoutMs) as Promise<T>;
}

export type TgUser = { id: number; is_bot?: boolean; first_name?: string; username?: string };
export type TgMessage = { message_id: number; chat: { id: number; type: string }; from?: TgUser; text?: string };
export type TgUpdate = {
  update_id: number;
  message?: TgMessage;
  chat_join_request?: { chat: { id: number }; from: TgUser; user_chat_id: number; date: number };
};
