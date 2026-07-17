import { expect, test, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

async function chooseCsv(page: Page, name: string, rows: readonly string[]): Promise<void> {
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    ...rows,
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name,
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
}

async function previewAndImport(page: Page, count: number): Promise<void> {
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: `Import ${count} execution${count === 1 ? "" : "s"}` }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "More", exact: true }).click();
}

test("receipt reconciliation distinguishes accepted, existing, skipped, and written rows", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });

  await page.locator("#import-account").fill("Primary brokerage");
  await chooseCsv(page, "first.csv", [
    "aapl-in,AAPL,BTO,1,100,0,USD,2026-07-09T14:30:00Z",
  ]);
  await previewAndImport(page, 1);

  await page.locator("#import-account").fill("Primary brokerage");
  await chooseCsv(page, "second.csv", [
    "aapl-in,AAPL,BTO,1,100,0,USD,2026-07-09T14:30:00Z",
    "msft-in,MSFT,BTO,1,400,0,USD,2026-07-09T15:30:00Z",
    ",,,,,,,",
  ]);
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(page.getByText("2 valid · 0 rejected · 1 skipped")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 executions" }).click();
  await expect(page.locator("#route-announcer")).toHaveText(
    "2 accepted rows = 1 new or restored execution version + 1 already-present row; reversible receipt created.",
  );
  await page.getByRole("button", { name: "More", exact: true }).click();

  const receipt = page.locator(".import-history-row").filter({ hasText: "second.csv" });
  await expect(receipt).toContainText("2 accepted rows");
  const disclosure = receipt.locator(".import-receipt-disclosure");
  const summary = disclosure.locator("summary");
  const storageBefore = await page.evaluate(() => JSON.stringify(window.localStorage));
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(disclosure).toHaveAttribute("open", "");
  await expect(receipt).toContainText("3 source rows = 2 accepted + 0 rejected + 1 skipped.");
  await expect(receipt).toContainText("2 accepted rows = 1 new or restored execution version + 1 already present.");
  await expect(receipt).toContainText("2 warnings = 1 already-present warning + 1 other preview warning.");
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).toBe(storageBefore);
  const geometry = await summary.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return {
      height: bounds.height,
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(geometry.height).toBeGreaterThanOrEqual(44);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(externalRequests).toEqual([]);

  page.once("dialog", (dialog) => dialog.accept());
  const rollback = receipt.getByRole("button", { name: "Roll back this import" });
  await rollback.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#route-announcer")).toHaveText(
    "Import rolled back. Its immutable receipt remains in history.",
  );
  await expect(receipt).toContainText("ROLLED BACK");
  await expect(receipt).toContainText("The immutable receipt remains in history.");
  await expect(receipt.getByRole("button", { name: "Roll back this import" })).toHaveCount(0);
  const rebuiltHeading = receipt.locator("[data-import-receipt-heading]");
  await expect(rebuiltHeading).toBeFocused();
  await expect(rebuiltHeading).toBeInViewport();
  const focusedGeometry = await rebuiltHeading.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    bottom: element.getBoundingClientRect().bottom,
    topbarBottom: document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0,
    viewportHeight: window.innerHeight,
  }));
  expect(focusedGeometry.top).toBeGreaterThanOrEqual(focusedGeometry.topbarBottom - 1);
  expect(focusedGeometry.bottom).toBeLessThanOrEqual(focusedGeometry.viewportHeight + 1);
});

test("fictional receipt reconciliation stays inspectable and read-only", async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await page.getByRole("button", { name: "More", exact: true }).click();

  const receipt = page.locator(".import-history-row").filter({ hasText: "Generic broker CSV" });
  await expect(receipt.getByText("Reconcile receipt", { exact: true })).toBeVisible();
  await expect(receipt).toContainText(
    "This fictional receipt is read-only. Rollback is available only in your private journal.",
  );
  await expect(receipt.getByRole("button", { name: "Roll back this import" })).toHaveCount(0);
});
