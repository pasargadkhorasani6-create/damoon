import { expect, test } from "@playwright/test";
import { otpMark, readOtp, uniquePhone } from "./utils";

test("register with mobile verification, logout, login with password and OTP", async ({ page }) => {
  const phone = uniquePhone();
  const email = `e2e-${Date.now()}@example.com`;

  await page.goto("/register");
  await page.getByLabel("نام و نام خانوادگی").fill("کاربر تست");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("شماره موبایل").fill(phone);
  await page.getByLabel(/رمز عبور/).fill("e2e-pass-1234");
  await page.getByRole("checkbox").check();
  let mark = otpMark(phone);
  await page.getByRole("button", { name: "دریافت کد تأیید" }).click();

  await page.getByLabel("کد تأیید").fill(await readOtp(phone, mark));
  await page.getByRole("button", { name: "تأیید و ساخت حساب" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: /سلام کاربر تست/ })).toBeVisible();

  await page.getByRole("button", { name: "خروج" }).click();
  await expect(page).toHaveURL(/\/$/);

  // ورود با رمز
  await page.goto("/login");
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill("wrong-password");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(page.getByText("ایمیل یا رمز عبور اشتباه است.")).toBeVisible();
  // React پس از اجرای action فرم را ریست می‌کند
  await page.getByLabel("ایمیل").fill(email);
  await page.getByLabel("رمز عبور").fill("e2e-pass-1234");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.getByRole("button", { name: "خروج" }).click();

  // ورود با OTP
  await page.goto("/login");
  await page.getByRole("button", { name: "موبایل و کد یک‌بارمصرف" }).click();
  await page.getByLabel("شماره موبایل").fill(phone);
  mark = otpMark(phone);
  await page.getByRole("button", { name: "ارسال کد ورود" }).click();
  await page.getByLabel("کد ورود").fill(await readOtp(phone, mark));
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test("panel requires login and public pages render with disclaimer", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login/);
  for (const path of ["/", "/strategy", "/pricing", "/faq", "/terms"]) {
    await page.goto(path);
    await expect(page.locator("footer")).toContainText("توصیه‌ی مالی");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  }
});
