import { expect, test } from "@playwright/test";
import { sql } from "./db";
import { register } from "./utils";

test("admin area is restricted; admin can grant a subscription and broadcast", async ({ page, browser }) => {
  // کاربر عادی
  const userEmail = await register(page);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard$/);

  // ادمین (ارتقا مانند اسکریپت make-admin)
  const adminCtx = await browser.newContext();
  const ap = await adminCtx.newPage();
  const adminEmail = await register(ap);
  await sql(`UPDATE "User" SET role='ADMIN' WHERE email=$1`, [adminEmail]);
  await ap.goto("/admin");
  await expect(ap.getByTestId("admin-overview")).toBeVisible();

  await ap.goto(`/admin/users?q=${encodeURIComponent(userEmail)}`);
  await ap.getByTestId("admin-users").getByRole("link").first().click();
  await ap.getByRole("button", { name: "افزودن روز" }).click();
  await expect(ap.getByText("30 روز اشتراک اضافه شد.")).toBeVisible();

  await ap.goto("/admin/broadcast");
  await ap.getByLabel("متن پیام").fill("اطلاعیه‌ی آزمایشی");
  await ap.getByRole("button", { name: "ارسال" }).click();
  await expect(ap.getByText("پیام ثبت شد")).toBeVisible();

  await page.goto("/dashboard");
  await expect(page.getByTestId("announcement")).toContainText("اطلاعیه‌ی آزمایشی");
  await page.goto("/dashboard/signals");
  await expect(page.getByTestId("conn-state")).toHaveAttribute("data-state", "live");
  await adminCtx.close();
});
