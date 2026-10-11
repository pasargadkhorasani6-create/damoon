import { describe, expect, it, vi } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { sendOtpSms, SmsError } from "@/lib/sms/melipayamak";

function withEnv(vars: Record<string, string>, fn: () => Promise<void>) {
  return async () => {
    const old = { ...process.env };
    Object.assign(process.env, vars);
    resetEnvCache();
    try {
      await fn();
    } finally {
      process.env = old;
      resetEnvCache();
    }
  };
}

describe("melipayamak", () => {
  it(
    "sends via shared pattern when BODY_ID is set",
    withEnv({ SMS_DRY_RUN: "false", MELIPAYAMAK_CONSOLE_KEY: "KEY", MELIPAYAMAK_BODY_ID: "1234" }, async () => {
      const f = vi.fn(async () => new Response(JSON.stringify({ recId: 99999, status: "ok" })));
      await sendOtpSms("09121234567", "123456", f as unknown as typeof fetch);
      const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("https://console.melipayamak.com/api/send/shared/KEY");
      expect(JSON.parse(init.body as string)).toEqual({ bodyId: 1234, to: "09121234567", args: ["123456"] });
    }),
  );

  it(
    "throws on provider failure",
    withEnv({ SMS_DRY_RUN: "false", MELIPAYAMAK_CONSOLE_KEY: "KEY", MELIPAYAMAK_BODY_ID: "1234" }, async () => {
      const f = vi.fn(async () => new Response(JSON.stringify({ recId: 11, status: "invalid" })));
      await expect(sendOtpSms("09121234567", "1", f as unknown as typeof fetch)).rejects.toBeInstanceOf(SmsError);
    }),
  );
});
