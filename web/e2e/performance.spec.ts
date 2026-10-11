import { expect, test } from "@playwright/test";
import { botPost } from "./db";

test("performance page shows stats computed from bot-reported trades", async ({ page, baseURL }) => {
  await page.goto("/performance");
  // global setup دیتابیس را خالی کرده؛ ممکن است spec دیگری قبلاً معامله ثبت کرده باشد
  const now = Math.floor(Date.now() / 1000);
  for (const [i, exit] of [[1, 2410], [2, 2395]] as const) {
    const ext = `perf-${Date.now()}-${i}`;
    await botPost(baseURL!, { type: "signal.new", externalId: ext, symbol: "XAUUSD", direction: "BUY", orderType: "STOP", entry: 2400, stopLoss: 2395, takeProfit: 2410, digits: 2, signalAt: now - 600 });
    await botPost(baseURL!, { type: "signal.closed", externalId: ext, exitPrice: exit, fillPrice: 2400, reason: exit > 2400 ? "TP" : "SL", at: now - 300 + i });
  }
  await page.goto("/performance?symbol=XAUUSD");
  await expect(page.getByTestId("perf-tiles")).toBeVisible();
  await expect(page.getByTestId("perf-log").locator("tbody tr").first()).toBeVisible();
  await expect(page.getByRole("img", { name: /نمودار equity/ })).toBeVisible();
  await expect(page.locator("footer")).toContainText("عملکرد گذشته تضمینی");
  await page.screenshot({ path: "e2e/.out/performance.png", fullPage: true });
});
