import { readFileSync } from "node:fs";
import { expect } from "@playwright/test";

const codesFor = (phone: string) =>
  [...readFileSync("e2e/.out/server.log", "utf8").matchAll(new RegExp(`OTP for ${phone}: (\\d{6})`, "g"))].map((m) => m[1]);

/** تعداد کدهای ارسال‌شده تا این لحظه؛ قبل از درخواست کد جدید صدا بزنید */
export const otpMark = (phone: string) => codesFor(phone).length;

/** منتظر کد OTP جدید (بعد از mark) در لاگ سرور می‌ماند */
export async function readOtp(phone: string, mark: number): Promise<string> {
  await expect.poll(() => codesFor(phone).length, { timeout: 10_000 }).toBeGreaterThan(mark);
  return codesFor(phone).at(-1)!;
}

export const uniquePhone = () => `0915${String(Date.now()).slice(-7)}`;
