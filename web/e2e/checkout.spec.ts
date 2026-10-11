import { expect, test } from "@playwright/test";
import { register } from "./utils";

test("pricing → checkout requires disclaimer → USDT order shows unique amount", async ({ page }) => {
  await register(page);
  await page.goto("/pricing");
  await expect(page.getByText("ماهانه").first()).toBeVisible();
  await page.getByRole("link", { name: "خرید اشتراک ماهانه" }).click();
  await expect(page).toHaveURL(/\/checkout\/monthly$/);
  await expect(page.getByText("سلب مسئولیت:").first()).toBeVisible();

  // بدون تیک سلب مسئولیت، مرورگر فرم را ارسال نمی‌کند
  await page.getByRole("button", { name: "پرداخت با تتر (TRC20)" }).click();
  await expect(page).toHaveURL(/\/checkout\/monthly$/);

  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "پرداخت با تتر (TRC20)" }).click();
  await expect(page).toHaveURL(/\/dashboard\/payments\//);
  await expect(page.getByTestId("usdt-amount")).toHaveText(/^15\.\d{2} USDT$/);

  await page.getByLabel("هش تراکنش (TxID)").fill("not-a-hash".padEnd(64, "z"));
  await page.getByRole("button", { name: "بررسی تراکنش" }).click();
  await expect(page.getByText("هش تراکنش معتبر نیست")).toBeVisible();

  await page.goto("/dashboard/subscription");
  await expect(page.getByRole("link", { name: "ادامه‌ی پرداخت" })).toBeVisible();
});
