import { expect, test, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

async function startDemo(page: Page): Promise<void> {
  await page.addInitScript(
    (key) => window.localStorage.setItem(key, "complete"),
    ONBOARDING_KEY,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trades", exact: true })).toBeVisible();
}

async function importClosedStockTrade(page: Page): Promise<void> {
  await page.addInitScript(
    (key) => window.localStorage.setItem(key, "complete"),
    ONBOARDING_KEY,
  );
  await page.goto("/");
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "aapl-in,AAPL,BTO,1,100,0,USD,2026-07-09T14:30:00Z",
    "aapl-out,AAPL,STC,1,110,0,USD,2026-07-09T15:00:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "facet-refresh.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 2 executions" }).click();
  await page.getByRole("button", { name: "Trades", exact: true }).click();
}

test("exact card facets compose with search and scope without changing totals or reports", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  await startDemo(page);

  const scopeSummary = page.locator("#trade-scope-summary");
  const count = page.locator("#trade-count");
  const assetClass = page.getByRole("combobox", { name: "Asset class" });
  const direction = page.getByRole("combobox", { name: "Direction" });
  const positionState = page.getByRole("combobox", { name: "Position state" });
  const reviewState = page.getByRole("combobox", { name: "Review state" });
  const clearView = page.getByRole("button", { name: "Clear search and filters" });

  await expect(scopeSummary).toContainText("+$310.00");
  await expect(scopeSummary).toContainText(
    "8 contributing trades · 16 allocations · 6 activity days",
  );
  await expect(clearView).toBeDisabled();

  await assetClass.selectOption("etf");
  await direction.selectOption("short");
  await positionState.selectOption("closed");
  await reviewState.selectOption("completed");
  await expect(count).toHaveText("Showing 1 of 8 trades");
  await expect(page.locator(".trade-card:visible")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "QQQ", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SPY", exact: true })).toHaveCount(0);
  await expect(page.locator('.trade-card:visible .status-chip').filter({ hasText: "ETF" }))
    .toHaveCount(1);
  await expect(scopeSummary).toContainText("+$310.00");
  await expect(clearView).toBeEnabled();

  const search = page.locator("#trade-search");
  await search.fill("SPY");
  await expect(count).toHaveText("Showing 0 of 8 trades");
  await expect(page.locator("#trade-empty")).toBeVisible();
  await expect(page.locator("#trade-empty")).toContainText("No trades match these filters");
  await expect(scopeSummary).toContainText("+$310.00");
  await search.fill("");
  await expect(count).toHaveText("Showing 1 of 8 trades");

  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(page.locator("[data-plan-check]")).toContainText("8 of 8 trades");
  await expect(page.locator("[data-setup-performance]")).toContainText("8 of 8 trades");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator(".result-card").first()).toContainText("+$310.00");

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(assetClass).toHaveValue("etf");
  await expect(direction).toHaveValue("short");
  await expect(positionState).toHaveValue("closed");
  await expect(reviewState).toHaveValue("completed");
  await expect(count).toHaveText("Showing 1 of 8 trades");

  await page.getByRole("combobox", { name: "Account" }).selectOption("demo-account-swing");
  await page.getByRole("button", { name: "Apply scope" }).click();
  await expect(scopeSummary).toContainText("Demo Swing · All activity dates");
  await expect(scopeSummary).toContainText("-$220.00");
  await expect(count).toHaveText("Showing 1 of 3 trades");
  await expect(assetClass).toHaveValue("etf");
  await expect(direction).toHaveValue("short");

  await direction.selectOption("long");
  await expect(page.getByRole("heading", { name: "SPY", exact: true })).toBeVisible();
  await search.fill("QQQ");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", {
    name: /Open Tuesday, July 7, 2026: -\$100\.00 allocation-day P&L/,
  }).click();
  await expect(page.getByRole("combobox", { name: "Asset class" })).toHaveValue("etf");
  await expect(page.getByRole("combobox", { name: "Direction" })).toHaveValue("long");
  await expect(page.locator(".trade-card:visible")).toHaveCount(0);
  await expect(page.locator("#route-announcer")).toHaveText(
    "Trades for Tuesday, July 7, 2026. 1 contributing trade, 2 allocations, -$100.00 allocation-day P&L. Search and card filters show 0 of 1 trades.",
  );
  await search.fill("");
  await expect(page.locator(".trade-card:visible")).toHaveCount(1);
  await search.fill("QQQ");
  await expect(count).toHaveText("Showing 0 of 1 trade");
  await clearView.click();
  await expect(page.getByRole("combobox", { name: "Asset class" })).toBeFocused();
  await expect(search).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Account" }))
    .toHaveValue("demo-account-swing");
  await expect(page.getByRole("button", { name: "Clear day filter" })).toBeVisible();
  await expect(count).toHaveText("Showing 1 trade");
  await expect(page.locator("#route-announcer")).toHaveText(
    "Search and trade card filters cleared. Showing 1 scoped trade.",
  );

  await assetClass.selectOption("etf");
  await page.getByRole("button", { name: "Clear day filter" }).click();
  await expect(page.getByRole("combobox", { name: "Asset class" })).toHaveValue("etf");
  await expect(count).toHaveText("Showing 2 of 3 trades");

  await clearView.click();
  await expect(page.getByRole("combobox", { name: "Asset class" })).toBeFocused();
  await expect(page.getByRole("combobox", { name: "Account" }))
    .toHaveValue("demo-account-swing");
  await expect(count).toHaveText("Showing 3 trades");
  await expect(page.locator("#route-announcer")).toHaveText(
    "Search and trade card filters cleared. Showing 3 scoped trades.",
  );

  await page.getByRole("combobox", { name: "Direction" }).selectOption("short");
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByRole("combobox", { name: "Account" })).toBeFocused();
  await expect(page.getByRole("combobox", { name: "Account" })).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Direction" })).toHaveValue("all");
  await expect(count).toHaveText("Showing 8 trades");

  await page.getByRole("combobox", { name: "Asset class" }).selectOption("etf");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Return to my journal" }).click();
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Asset class" })).toHaveValue("all");
  await expect(count).toHaveText("Showing 8 trades");
  expect(externalRequests).toEqual([]);
});

test("card facets and search survive a valid local review refresh", async ({ page }) => {
  await importClosedStockTrade(page);

  const direction = page.getByRole("combobox", { name: "Direction" });
  const positionState = page.getByRole("combobox", { name: "Position state" });
  const reviewState = page.getByRole("combobox", { name: "Review state" });
  const search = page.getByRole("searchbox", { name: "Search scoped trades" });
  const count = page.locator("#trade-count");

  await direction.selectOption("long");
  await positionState.selectOption("closed");
  await reviewState.selectOption("pending");
  await search.fill("AAPL");
  await expect(count).toHaveText("Showing 1 of 1 trade");

  await page.locator(".trade-card:visible").getByRole("button", { name: /Review trade/u }).click();
  const dialog = page.getByRole("dialog", { name: /AAPL trade review/u });
  await dialog.locator("#review-note").fill("Refresh facet retention check.");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(direction).toHaveValue("long");
  await expect(positionState).toHaveValue("closed");
  await expect(reviewState).toHaveValue("pending");
  await expect(search).toHaveValue("aapl");
  await expect(count).toHaveText("Showing 0 of 1 trade");
  await reviewState.selectOption("draft");
  await expect(page.getByRole("heading", { name: "AAPL", exact: true })).toBeVisible();
  await expect(count).toHaveText("Showing 1 of 1 trade");
});

test("exact card facets reflow at 320px and 200% text with touch-size controls", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startDemo(page);
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  await page.getByRole("combobox", { name: "Asset class" }).selectOption("etf");

  const filters = page.locator(".trade-view-filters");
  await filters.scrollIntoViewIfNeeded();
  await expect(filters).toBeInViewport();
  await expect(filters).toContainText(
    "They never change allocation scope, P&L totals, the calendar, Dashboard metrics, or Reports.",
  );
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    offenders: Array.from(document.querySelectorAll<HTMLElement>(
      ".trade-view-filters, .trade-view-filters *",
    ))
      .map((element) => ({
        tag: element.tagName,
        label: `${element.tagName.toLowerCase()}#${element.id}.${String(element.className)}`,
        own: element.scrollWidth - element.clientWidth,
        right: Math.ceil(element.getBoundingClientRect().right - window.innerWidth),
      }))
      .filter((candidate) => (
        (candidate.tag !== "SELECT" && candidate.own > 1) || candidate.right > 1
      ))
      .slice(0, 20),
  }));
  expect(
    overflow.document,
    `Overflow evidence: ${JSON.stringify(overflow.offenders)}`,
  ).toBeLessThanOrEqual(1);
  expect(overflow.offenders).toEqual([]);

  for (const control of await page.locator(
    ".trade-view-filters button:visible, .trade-view-filters select:visible",
  ).all()) {
    const box = await control.boundingBox();
    expect(box, "visible facet control should have a layout box").not.toBeNull();
    expect(box?.width ?? 0, "control width").toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, "control height").toBeGreaterThanOrEqual(44);
  }
});
