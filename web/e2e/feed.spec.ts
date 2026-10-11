import { expect, test, type Page } from "@playwright/test";
import { botPost, giveSubscription } from "./db";
import { otpMark, readOtp, uniquePhone } from "./utils";

async function register(page: Page) {
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

test("non-subscriber is blocked; subscriber receives signals live without reload", async ({ page, baseURL }) => {
  const email = await register(page);

  await page.goto("/dashboard/signals");
  await expect(page.getByText("فید سیگنال فقط برای مشترکین فعال است")).toBeVisible();
  expect((await page.request.get("/api/signals/stream")).status()).toBe(403);

  await giveSubscription(email);
  await page.goto("/dashboard/signals");
  await expect(page.getByTestId("conn-state")).toHaveAttribute("data-state", "live");

  const ext = `e2e-${Date.now()}`;
  const now = Math.floor(Date.now() / 1000);
  const r1 = await botPost(baseURL!, {
    type: "signal.new", externalId: ext, symbol: "US30", direction: "SELL", orderType: "STOP",
    entry: 42000.5, stopLoss: 42050.5, takeProfit: 41950.5, digits: 1, timeframe: "M5", signalAt: now,
  });
  expect(r1.status).toBe(201);

  const card = page.getByTestId("signal-card").filter({ hasText: "42000.5" });
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute("data-status", "PENDING");
  await expect(card).toContainText("فروش");

  await botPost(baseURL!, { type: "signal.activated", externalId: ext, fillPrice: 42000.5, at: now + 60 });
  await expect(card).toHaveAttribute("data-status", "ACTIVE");
  await botPost(baseURL!, { type: "signal.closed", externalId: ext, exitPrice: 42050.5, reason: "SL", at: now + 120 });
  await expect(card).toHaveAttribute("data-status", "SL_HIT");
  await expect(card).toContainText("-1.00R");
});
