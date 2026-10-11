import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

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

export async function register(page: Page) {
  const phone = uniquePhone();
  const email = `feed-${Date.now()}@example.com`;
  await page.goto("/register");
  await page.getByLabel("نام و نام خانوادگی").fill("مشترک تست");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("شماره موبایل").fill(phone);
  await page.getByLabel(/رمز عبور/).fill("feed-pass-1234");
  await page.getByRole("checkbox").check();
  const mark = otpMark(phone);
  await page.getByRole("button", { name: "دریافت کد تأیید" }).click();
  await page.getByLabel("کد تأیید").fill(await readOtp(phone, mark));
  await page.getByRole("button", { name: "تأیید و ساخت حساب" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}
