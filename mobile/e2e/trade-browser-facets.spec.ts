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

async function localStorageSnapshot(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => (
    Array.from({ length: window.localStorage.length }, (_, index) => {
      const key = window.localStorage.key(index);
      return JSON.stringify([
        key,
        key === null ? null : window.localStorage.getItem(key),
      ]);
    }).sort()
  ));
}

async function reportFingerprint(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const text = (selector: string): string => (
      document.querySelector<HTMLElement>(selector)?.textContent
        ?.replace(/\s+/gu, " ")
        .trim() ?? ""
    );
    const attributes = (selector: string, name: string): readonly string[] => (
      Array.from(document.querySelectorAll<HTMLElement>(selector))
        .map((element) => element.getAttribute(name) ?? "")
    );
    return {
      performance: text("[data-report-overview] .metric-grid"),
      curve: {
        label: document.querySelector(".equity-chart")?.getAttribute("aria-label"),
        points: document.querySelector(".equity-line")?.getAttribute("points"),
      },
      plan: {
        metadata: text("[data-plan-check] .plan-check-meta"),
        groups: text("[data-plan-check] .plan-check-groups"),
        evidence: attributes("[data-plan-check-trade]", "data-plan-check-trade"),
      },
      mistakes: {
        metadata: text("[data-mistake-patterns] .mistake-patterns-meta"),
        groups: text("[data-mistake-patterns] .mistake-patterns-groups"),
        evidence: attributes(
          "[data-mistake-patterns-trade]",
          "data-mistake-patterns-trade",
        ),
      },
      emotions: {
        metadata: text("[data-emotion-patterns] .emotion-patterns-meta"),
        groups: text("[data-emotion-patterns] .emotion-patterns-groups"),
        evidence: attributes(
          "[data-emotion-patterns-trade]",
          "data-emotion-patterns-trade",
        ),
      },
      setup: {
        metadata: text("[data-setup-performance] .setup-performance-meta"),
        groups: text("[data-setup-performance] .setup-performance-groups"),
        evidence: attributes(
          "[data-setup-performance-trade]",
          "data-setup-performance-trade",
        ),
      },
    };
  });
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
  const mistake = page.getByRole("combobox", { name: "Mistake" });
  const emotion = page.getByRole("combobox", { name: "Emotion" });
  const tag = page.getByRole("combobox", { name: "Tag" });
  const clearView = page.getByRole("button", { name: "Clear search and filters" });
  const filterDisclosure = page.locator("[data-trade-filter-disclosure]");
  const filterSummary = page.locator("#trade-view-filter-summary");
  const activeFilterCount = page.locator("[data-trade-view-filter-count]");
  const search = page.locator("#trade-search");

  await expect(scopeSummary).toContainText("+$310.00");
  await expect(scopeSummary).toContainText(
    "8 contributing trades · 16 allocations · 6 activity days",
  );
  await expect(clearView).toBeDisabled();
  await expect(filterDisclosure).not.toHaveAttribute("open", "");
  await expect(filterSummary).toContainText("Filter controls");
  await expect(activeFilterCount).toHaveText("· none active");
  await expect(assetClass).not.toBeVisible();

  await search.fill("QQQ");
  await expect(filterDisclosure).not.toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· none active");
  await expect(clearView).toBeVisible();
  await expect(clearView).toBeEnabled();
  await clearView.click();
  await expect(filterSummary).toBeFocused();
  await expect(search).toHaveValue("");

  await filterSummary.click();
  await search.fill("QQQ");
  await expect(filterDisclosure).toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· none active");
  await search.fill("");
  await page.getByRole("textbox", { name: "Activity from" }).fill("2026-07-01");
  await page.getByRole("textbox", { name: "Activity through" }).fill("2026-07-10");
  await page.getByRole("button", { name: "Apply scope" }).click();
  await expect(filterDisclosure).not.toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· none active");
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(filterDisclosure).not.toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· none active");

  await filterSummary.click();
  await expect(filterDisclosure).toHaveAttribute("open", "");
  await assetClass.selectOption("etf");
  await expect(activeFilterCount).toHaveText("· 1 active filter");
  await direction.selectOption("long");
  await expect(activeFilterCount).toHaveText("· 2 active filters");
  await positionState.selectOption("closed");
  await expect(activeFilterCount).toHaveText("· 3 active filters");
  await reviewState.selectOption("completed");
  await expect(activeFilterCount).toHaveText("· 4 active filters");
  await mistake.selectOption("Chased entry");
  await expect(activeFilterCount).toHaveText("· 5 active filters");
  await emotion.selectOption("Impatient");
  await expect(activeFilterCount).toHaveText("· 6 active filters");
  await tag.selectOption("Stopped on plan");
  await expect(activeFilterCount).toHaveText("· 7 active filters");
  await expect(count).toHaveText("Showing 1 of 8 trades");
  await expect(page.locator(".trade-card:visible")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "SPY", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "QQQ", exact: true })).toHaveCount(0);
  await expect(page.locator('.trade-card:visible .status-chip').filter({ hasText: "ETF" }))
    .toHaveCount(1);
  await expect(scopeSummary).toContainText("+$310.00");
  await expect(clearView).toBeEnabled();

  await search.fill("QQQ");
  await expect(count).toHaveText("Showing 0 of 8 trades");
  await expect(page.locator("#trade-empty")).toBeVisible();
  await expect(page.locator("#trade-empty")).toContainText("No trades match these filters");
  await expect(scopeSummary).toContainText("+$310.00");
  await search.fill("");
  await expect(count).toHaveText("Showing 1 of 8 trades");

  const storageBefore = await localStorageSnapshot(page);
  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(page.locator("[data-plan-check]")).toContainText("8 of 8 trades");
  await expect(page.locator("[data-emotion-patterns]")).toContainText("8 trades of 8 trades");
  await expect(page.locator("[data-setup-performance]")).toContainText("8 of 8 trades");
  const reportsBefore = await reportFingerprint(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator(".result-card").first()).toContainText("+$310.00");

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(assetClass).toHaveValue("etf");
  await expect(direction).toHaveValue("long");
  await expect(positionState).toHaveValue("closed");
  await expect(reviewState).toHaveValue("completed");
  await expect(mistake).toHaveValue("Chased entry");
  await expect(emotion).toHaveValue("Impatient");
  await expect(tag).toHaveValue("Stopped on plan");
  await expect(count).toHaveText("Showing 1 of 8 trades");
  await expect(filterDisclosure).toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· 7 active filters");

  await page.getByRole("combobox", { name: "Account" }).selectOption("demo-account-swing");
  await page.getByRole("button", { name: "Apply scope" }).click();
  await expect(scopeSummary).toContainText("Demo Swing · All activity dates");
  await expect(scopeSummary).toContainText("-$220.00");
  await expect(count).toHaveText("Showing 1 of 3 trades");
  await expect(assetClass).toHaveValue("etf");
  await expect(direction).toHaveValue("long");
  await expect(mistake).toHaveValue("Chased entry");
  await expect(emotion).toHaveValue("Impatient");
  await expect(tag).toHaveValue("Stopped on plan");
  await expect(activeFilterCount).toHaveText("· 7 active filters");

  await expect(page.getByRole("heading", { name: "SPY", exact: true })).toBeVisible();
  await search.fill("QQQ");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", {
    name: /Open Tuesday, July 7, 2026: -\$100\.00 allocation-day P&L/,
  }).click();
  await expect(page.getByRole("combobox", { name: "Asset class" })).toHaveValue("etf");
  await expect(page.getByRole("combobox", { name: "Direction" })).toHaveValue("long");
  await expect(mistake).toHaveValue("Chased entry");
  await expect(emotion).toHaveValue("Impatient");
  await expect(tag).toHaveValue("Stopped on plan");
  await expect(page.locator(".trade-card:visible")).toHaveCount(0);
  await expect(page.locator("#route-announcer")).toHaveText(
    "Trades for Tuesday, July 7, 2026. 1 contributing trade, 2 allocations, -$100.00 allocation-day P&L. Search and card filters show 0 of 1 trades.",
  );
  await search.fill("");
  await expect(page.locator(".trade-card:visible")).toHaveCount(1);
  await search.fill("QQQ");
  await expect(count).toHaveText("Showing 0 of 1 trade");
  await clearView.click();
  await expect(filterSummary).toBeFocused();
  await expect(filterDisclosure).not.toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· none active");
  await expect(search).toHaveValue("");
  await expect(page.locator("#trade-filter-mistake")).toHaveValue("");
  await expect(page.locator("#trade-filter-emotion")).toHaveValue("");
  await expect(page.locator("#trade-filter-tag")).toHaveValue("");
  await expect(page.getByRole("combobox", { name: "Account" }))
    .toHaveValue("demo-account-swing");
  await expect(page.getByRole("button", { name: "Clear day filter" })).toBeVisible();
  await expect(count).toHaveText("Showing 1 trade");
  await expect(page.locator("#route-announcer")).toHaveText(
    "Search and trade card filters cleared. Showing 1 scoped trade.",
  );

  await filterSummary.click();
  await assetClass.selectOption("etf");
  await page.getByRole("button", { name: "Clear day filter" }).click();
  await expect(page.getByRole("combobox", { name: "Asset class" })).toHaveValue("etf");
  await expect(count).toHaveText("Showing 2 of 3 trades");

  await assetClass.selectOption("all");
  await expect(filterSummary).toBeFocused();
  await expect(filterDisclosure).not.toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· none active");
  await expect(page.getByRole("combobox", { name: "Account" }))
    .toHaveValue("demo-account-swing");
  await expect(count).toHaveText("Showing 3 trades");
  await expect(clearView).toBeDisabled();

  await filterSummary.click();
  await page.getByRole("combobox", { name: "Direction" }).selectOption("short");
  await tag.selectOption("Plan followed");
  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.getByRole("combobox", { name: "Account" })).toBeFocused();
  await expect(page.getByRole("combobox", { name: "Account" })).toHaveValue("");
  await expect(page.locator("#trade-filter-direction")).toHaveValue("all");
  await expect(page.locator("#trade-filter-tag")).toHaveValue("");
  await expect(count).toHaveText("Showing 8 trades");
  await expect(filterDisclosure).not.toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· none active");

  await page.getByRole("button", { name: "Reports", exact: true }).click();
  expect(await reportFingerprint(page)).toEqual(reportsBefore);
  expect(await localStorageSnapshot(page)).toEqual(storageBefore);
  await page.getByRole("button", { name: "Trades", exact: true }).click();

  await filterSummary.click();
  await page.getByRole("combobox", { name: "Asset class" }).selectOption("etf");
  await mistake.selectOption("Chased entry");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Return to my journal" }).click();
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(page.locator("#trade-filter-asset-class")).toHaveValue("all");
  await expect(page.locator("#trade-filter-mistake")).toHaveValue("");
  await expect(count).toHaveText("Showing 8 trades");
  await expect(filterDisclosure).not.toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· none active");
  expect(externalRequests).toEqual([]);
});

test("dynamic review facets refresh locally and retain stale selections", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  await importClosedStockTrade(page);
  await context.setOffline(true);

  const direction = page.getByRole("combobox", { name: "Direction" });
  const positionState = page.getByRole("combobox", { name: "Position state" });
  const reviewState = page.getByRole("combobox", { name: "Review state" });
  const mistake = page.getByRole("combobox", { name: "Mistake" });
  const emotion = page.getByRole("combobox", { name: "Emotion" });
  const tag = page.getByRole("combobox", { name: "Tag" });
  const search = page.getByRole("searchbox", { name: "Search scoped trades" });
  const count = page.locator("#trade-count");
  const scopeSummary = page.locator("#trade-scope-summary");
  const filterDisclosure = page.locator("[data-trade-filter-disclosure]");
  const filterSummary = page.locator("#trade-view-filter-summary");
  const activeFilterCount = page.locator("[data-trade-view-filter-count]");

  await expect(filterDisclosure).not.toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· none active");
  await filterSummary.click();
  await expect(mistake).toBeDisabled();
  await expect(emotion).toBeDisabled();
  await expect(tag).toBeDisabled();
  await expect(scopeSummary).toContainText("+$10.00");
  await expect(scopeSummary).toContainText(
    "1 contributing trade · 2 allocations · 1 activity day",
  );

  await direction.selectOption("long");
  await positionState.selectOption("closed");
  await reviewState.selectOption("pending");
  await search.fill("AAPL");
  await expect(activeFilterCount).toHaveText("· 3 active filters");
  await expect(count).toHaveText("Showing 1 of 1 trade");

  await page.locator(".trade-card:visible").getByRole("button", { name: /Review trade/u }).click();
  const dialog = page.getByRole("dialog", { name: /AAPL trade review/u });
  await dialog.locator("#review-mistakes").fill("Late scale-out");
  await dialog.locator("#review-emotion").fill("Focused");
  await dialog.locator("#review-tags").fill("A+ setup");
  await dialog.locator("#review-note").fill("Refresh facet retention check.");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(dialog).toHaveCount(0);

  await expect(direction).toHaveValue("long");
  await expect(positionState).toHaveValue("closed");
  await expect(reviewState).toHaveValue("pending");
  await expect(search).toHaveValue("aapl");
  await expect(count).toHaveText("Showing 0 of 1 trade");
  await expect(mistake).toBeEnabled();
  await expect(emotion).toBeEnabled();
  await expect(tag).toBeEnabled();
  await expect(mistake.locator('option[value="Late scale-out"]')).toHaveText("Late scale-out");
  await expect(emotion.locator('option[value="Focused"]')).toHaveText("Focused");
  await expect(tag.locator('option[value="A+ setup"]')).toHaveText("A+ setup");
  await expect(filterDisclosure).toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· 3 active filters");

  await reviewState.selectOption("draft");
  await mistake.selectOption("Late scale-out");
  await emotion.selectOption("Focused");
  await tag.selectOption("A+ setup");
  await expect(activeFilterCount).toHaveText("· 6 active filters");
  await expect(page.getByRole("heading", { name: "AAPL", exact: true })).toBeVisible();
  await expect(count).toHaveText("Showing 1 of 1 trade");

  await page.locator(".trade-card:visible").getByRole("button", { name: /Edit review/u }).click();
  const editDialog = page.getByRole("dialog", { name: /AAPL trade review/u });
  await editDialog.locator("#review-mistakes").fill("Early exit");
  await editDialog.locator("#review-emotion").fill("Frustrated");
  await editDialog.locator("#review-tags").fill("Review next");
  await editDialog.locator("#review-note").fill("Replaced all dynamic review labels.");
  await editDialog.getByRole("button", { name: "Save draft" }).click();
  await expect(editDialog).toHaveCount(0);

  await expect(mistake).toHaveValue("Late scale-out");
  await expect(emotion).toHaveValue("Focused");
  await expect(tag).toHaveValue("A+ setup");
  await expect(mistake.locator("option:checked")).toHaveText(
    "Late scale-out (not currently assigned)",
  );
  await expect(emotion.locator("option:checked")).toHaveText(
    "Focused (not currently assigned)",
  );
  await expect(tag.locator("option:checked")).toHaveText(
    "A+ setup (not currently assigned)",
  );
  await expect(mistake.locator('option[value="Early exit"]')).toHaveText("Early exit");
  await expect(emotion.locator('option[value="Frustrated"]')).toHaveText("Frustrated");
  await expect(tag.locator('option[value="Review next"]')).toHaveText("Review next");
  await expect(count).toHaveText("Showing 0 of 1 trade");
  await expect(scopeSummary).toContainText("+$10.00");
  await expect(filterDisclosure).toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· 6 active filters");

  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await expect(filterSummary).toBeFocused();
  await expect(filterDisclosure).not.toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· none active");
  await expect(page.locator("#trade-filter-mistake")).toHaveValue("");
  await expect(page.locator("#trade-filter-emotion")).toHaveValue("");
  await expect(page.locator("#trade-filter-tag")).toHaveValue("");
  await expect(search).toHaveValue("");
  await expect(count).toHaveText("Showing 1 trade");
  expect(externalRequests).toEqual([]);
});

test("compact exact facets toggle accessibly and reflow at 320px and 421px with 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startDemo(page);
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });

  const filters = page.locator(".trade-view-filters");
  const filterDisclosure = page.locator("[data-trade-filter-disclosure]");
  const filterSummary = page.locator("#trade-view-filter-summary");
  const activeFilterCount = page.locator("[data-trade-view-filter-count]");
  const assetClass = page.getByRole("combobox", { name: "Asset class" });
  const search = page.getByRole("searchbox", { name: "Search scoped trades" });

  await filterSummary.scrollIntoViewIfNeeded();
  await expect(filterDisclosure).not.toHaveAttribute("open", "");
  await expect(activeFilterCount).toHaveText("· none active");
  await expect(filters.locator("select:visible")).toHaveCount(0);
  await filterSummary.focus();
  await page.keyboard.press("Enter");
  await expect(filterDisclosure).toHaveAttribute("open", "");
  await page.keyboard.press("Space");
  await expect(filterDisclosure).not.toHaveAttribute("open", "");
  await page.keyboard.press("Tab");
  await expect(search).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(filterSummary).toBeFocused();
  await page.keyboard.press("Space");
  await expect(filterDisclosure).toHaveAttribute("open", "");
  await page.keyboard.press("Tab");
  await expect(assetClass).toBeFocused();

  await assetClass.selectOption("etf");
  await page.getByRole("combobox", { name: "Mistake" }).selectOption("Chased entry");
  await page.getByRole("combobox", { name: "Emotion" }).selectOption("Impatient");
  await page.getByRole("combobox", { name: "Tag" }).selectOption("Stopped on plan");
  await expect(activeFilterCount).toHaveText("· 4 active filters");
  await expect(filters.locator("select")).toHaveCount(7);
  await expect(filters).toContainText(
    "They never change allocation scope, P&L totals, the calendar, Dashboard metrics, or Reports.",
  );

  for (const width of [320, 421]) {
    await page.setViewportSize({ width, height: 568 });
    await filterSummary.scrollIntoViewIfNeeded();
    await expect(filterSummary).toBeInViewport();
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
      `${width}px overflow evidence: ${JSON.stringify(overflow.offenders)}`,
    ).toBeLessThanOrEqual(1);
    expect(overflow.offenders).toEqual([]);

    for (const control of await page.locator(
      "#trade-view-filter-summary, .trade-view-filters button:visible, .trade-view-filters select:visible",
    ).all()) {
      const box = await control.boundingBox();
      expect(box, `${width}px visible facet control should have a layout box`).not.toBeNull();
      expect(box?.width ?? 0, `${width}px control width`).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, `${width}px control height`).toBeGreaterThanOrEqual(44);
    }
  }
});
