import { expect, test, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

async function startDemo(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

test("calendar day opens reconciled trade evidence and clears without losing review actions", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  await startDemo(page);

  const jul1 = page.getByRole("button", {
    name: "Open Wednesday, July 1, 2026: +$80.00 allocation-day P&L from 2 contributing trades",
  });
  await expect(page.locator("button[data-calendar-day]")).toHaveCount(6);
  await expect(jul1).toHaveJSProperty("tagName", "BUTTON");
  await jul1.focus();
  await page.keyboard.press("Enter");

  const filterHeading = page.getByRole("heading", { name: "Wednesday, July 1, 2026" });
  await expect(filterHeading).toBeFocused();
  await expect(filterHeading).toBeInViewport();
  await expect(page.getByRole("button", { name: "Trades", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.locator("#route-announcer")).toHaveText(
    "Trades for Wednesday, July 1, 2026. 2 contributing trades, 4 allocations, +$80.00 allocation-day P&L.",
  );
  await expect(page.locator("[data-calendar-day-filter]")).toContainText(
    "each card's main result remains the whole trade's realized-to-date result",
  );
  const reflection = page.locator("[data-calendar-day-filter] .calendar-day-reflection");
  await expect(reflection.getByRole("heading", { name: "Daily reflection" })).toBeVisible();
  await expect(reflection.locator(".calendar-day-reflection-state")).toHaveText(
    "Fictional demo reflection · read only",
  );
  await expect(reflection).toContainText(
    "Daily reflections belong to the whole workspace date, not only this trade-browser scope.",
  );
  await expect(reflection).toContainText(
    "Demo content is informative only; no daily reflection changes can be saved.",
  );
  await expect(page.locator(
    "[data-daily-entry-new], [data-daily-entry-edit], [data-daily-entry-calendar-date]",
  )).toHaveCount(0);
  await expect(page.locator(".trade-card")).toHaveCount(2);
  const aaplCard = page.locator(".trade-card").filter({
    has: page.getByRole("heading", { name: "AAPL", exact: true }),
  });
  const msftCard = page.locator(".trade-card").filter({
    has: page.getByRole("heading", { name: "MSFT", exact: true }),
  });
  await expect(aaplCard).toBeVisible();
  await expect(msftCard).toBeVisible();
  await expect(
    aaplCard.locator('[data-calendar-trade-contribution][data-calendar-day-pnl-exact="180"]'),
  ).toContainText("+$180.00");
  await expect(
    msftCard.locator('[data-calendar-trade-contribution][data-calendar-day-pnl-exact="-100"]'),
  ).toContainText("-$100.00");

  const search = page.getByRole("searchbox", { name: "Search Jul 1 scoped trades" });
  await search.fill("MSFT");
  await expect(page.getByRole("status")).toHaveText("Showing 1 of 2 trades");
  await expect(page.locator(".trade-card:visible")).toHaveCount(1);
  await expect(msftCard).toBeVisible();
  await expect(aaplCard).toBeHidden();
  await search.fill("");
  await page.getByRole("button", { name: /Edit review for AAPL/ }).click();
  await expect(page.getByRole("dialog", { name: /AAPL trade review/ })).toBeVisible();
  await expect(page.getByText("This fictional demo review is read-only.")).toBeVisible();
  await page.getByRole("button", { name: "Close trade review" }).click();

  await page.getByRole("button", { name: "Clear day filter" }).click();
  const restoredSearch = page.getByRole("searchbox", { name: "Search scoped trades" });
  await expect(restoredSearch).toBeFocused();
  await expect(restoredSearch).toBeInViewport();
  await expect(page.locator(".trade-card")).toHaveCount(8);
  await expect(page.getByRole("status")).toHaveText("Showing 8 trades");
  await expect(page.locator("#route-announcer")).toHaveText(
    "Calendar day filter cleared. Retained scope contains 8 trades.",
  );

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await jul1.click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(page.locator(".trade-card")).toHaveCount(2);
  await expect(page.locator("[data-calendar-day-filter]")).toBeVisible();
  await page.getByRole("button", { name: "Clear day filter" }).click();
  await expect(page.locator(".trade-card")).toHaveCount(8);
  expect(externalRequests).toEqual([]);
});

test("calendar drill-down reflows at 320px with 200% text and keeps touch targets", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startDemo(page);
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  await page.getByRole("button", { name: /Open Wednesday, July 1, 2026/ }).click();
  const scaledHeading = page.getByRole("heading", { name: "Wednesday, July 1, 2026" });
  await expect(scaledHeading).toBeFocused();
  await expect(scaledHeading).toBeInViewport();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
  for (const control of await page.locator("button:visible, input:visible, select:visible").all()) {
    const box = await control.boundingBox();
    expect(box, "visible control should have a layout box").not.toBeNull();
    expect(box?.width ?? 0, "control width").toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, "control height").toBeGreaterThanOrEqual(44);
  }
});
