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
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true }))
    .toBeVisible();
}

test("account guidance opens one exact all-activity scope and clears hidden filters", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  await startDemo(page);
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await page.getByRole("combobox", { name: "Account" })
    .selectOption("demo-account-swing");
  await page.getByRole("textbox", { name: "Activity from" }).fill("2026-07-07");
  await page.getByRole("textbox", { name: "Activity through" }).fill("2026-07-09");
  await page.getByRole("button", { name: "Apply scope" }).click();
  await page.getByRole("searchbox", { name: "Search scoped trades" }).fill("QQQ");
  await page.locator("#trade-view-filter-summary").click();
  await page.getByRole("combobox", { name: "Review state" })
    .selectOption("completed");

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const wholeWorkspacePnl = await page.locator(".result-card").first().textContent();
  const action = page.getByRole("button", {
    name: "Open Demo Brokerage in Trades, account 1 of 2",
  });
  await action.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Trades", exact: true }))
    .toBeVisible();
  await expect(page.locator("#trade-scope-summary")).toBeFocused();
  await expect(page.getByRole("combobox", { name: "Account" }))
    .toHaveValue("demo-account-primary");
  await expect(page.getByRole("textbox", { name: "Activity from" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Activity through" })).toHaveValue("");
  await expect(page.getByRole("searchbox", { name: "Search scoped trades" }))
    .toHaveValue("");
  await expect(page.locator("#trade-filter-review")).toHaveValue("all");
  await expect(page.locator("#trade-scope-summary")).toContainText(
    "Demo Brokerage · All activity dates",
  );
  await expect(page.locator(".trade-card")).toHaveCount(5);
  await expect(page.locator("#route-announcer")).toHaveText(
    "Opened Demo Brokerage in Trades. All activity dates and 5 current derived trades. Temporary dates, day, search, and card filters were cleared.",
  );

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator(".result-card").first()).toHaveText(wholeWorkspacePnl ?? "");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storageBefore);
  expect(externalRequests).toEqual([]);
});

test("a coherently swapped account action fails visibly without changing route or scope", async ({ page }) => {
  await startDemo(page);
  const action = page.getByRole("button", {
    name: "Open Demo Brokerage in Trades, account 1 of 2",
  });
  await action.evaluate((element) => {
    (element as HTMLElement).dataset.accountOverviewRoute = "demo-account-swing";
    (element as HTMLElement).dataset.accountOverviewPosition = "2";
  });
  await action.click();

  await expect(page.getByRole("heading", { name: "Dashboard", exact: true }))
    .toBeVisible();
  const status = page.locator("#account-overview-status");
  await expect(status).toBeVisible();
  await expect(status).toBeFocused();
  await expect(status).toHaveText(
    "This account link is no longer available. No Trade Browser scope changed.",
  );
});

test("a stale account ID fails visibly without changing route or scope", async ({ page }) => {
  await startDemo(page);
  const action = page.getByRole("button", {
    name: "Open Demo Brokerage in Trades, account 1 of 2",
  });
  await action.evaluate((element) => {
    (element as HTMLElement).dataset.accountOverviewRoute = "missing-account";
  });
  await action.click();

  await expect(page.getByRole("heading", { name: "Dashboard", exact: true }))
    .toBeVisible();
  await expect(page.locator("#account-overview-status")).toBeFocused();
  await expect(page.locator("#account-overview-status")).toHaveText(
    "This account link is no longer available. No Trade Browser scope changed.",
  );
});

test("a post-assignment render failure restores the previous exact tab and browser state", async ({
  page,
}) => {
  await startDemo(page);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await page.getByRole("combobox", { name: "Account" })
    .selectOption("demo-account-swing");
  await page.getByRole("textbox", { name: "Activity from" }).fill("2026-07-07");
  await page.getByRole("textbox", { name: "Activity through" }).fill("2026-07-09");
  await page.getByRole("button", { name: "Apply scope" }).click();
  await page.getByRole("searchbox", { name: "Search scoped trades" }).fill("QQQ");
  await page.locator("#trade-view-filter-summary").click();
  await page.getByRole("combobox", { name: "Review state" })
    .selectOption("completed");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();

  await page.evaluate(() => {
    const app = document.querySelector("#app");
    if (app === null) throw new Error("Missing app root.");
    const original = Element.prototype.querySelector;
    Element.prototype.querySelector = function patchedQuerySelector(
      selectors: string,
    ): Element | null {
      if (this === app && selectors === "#trade-scope-summary") {
        Element.prototype.querySelector = original;
        return null;
      }
      return original.call(this, selectors);
    };
  });
  await page.getByRole("button", {
    name: "Open Demo Brokerage in Trades, account 1 of 2",
  }).click();

  await expect(page.getByRole("heading", { name: "Dashboard", exact: true }))
    .toBeVisible();
  await expect(page.locator("#account-overview-status")).toBeFocused();
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Account" }))
    .toHaveValue("demo-account-swing");
  await expect(page.getByRole("textbox", { name: "Activity from" }))
    .toHaveValue("2026-07-07");
  await expect(page.getByRole("textbox", { name: "Activity through" }))
    .toHaveValue("2026-07-09");
  await expect(page.getByRole("searchbox", { name: "Search scoped trades" }))
    .toHaveValue("qqq");
  await expect(page.locator("#trade-filter-review")).toHaveValue("completed");
  await expect(page.locator(".trade-card")).toHaveCount(2);
  await expect(page.locator(".trade-card:visible")).toHaveCount(1);
});

test("account guidance reflows at 320px and 200% text with reachable controls", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startDemo(page);
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });

  const section = page.locator("[data-account-overview]");
  await expect(section).toBeVisible();
  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    section: (() => {
      const element = document.querySelector<HTMLElement>("[data-account-overview]");
      if (element === null) return Number.POSITIVE_INFINITY;
      return element.scrollWidth - element.clientWidth;
    })(),
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.section).toBeLessThanOrEqual(1);

  for (const control of await section.locator("button:visible").all()) {
    const box = await control.boundingBox();
    expect(box, "visible account action should have a layout box").not.toBeNull();
    expect(box?.width ?? 0, "control width").toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, "control height").toBeGreaterThanOrEqual(44);
  }

  const accountAction = page.getByRole("button", {
    name: "Open Demo Brokerage in Trades, account 1 of 2",
  });
  await accountAction.focus();
  await page.keyboard.press("Enter");
  const summary = page.locator("#trade-scope-summary");
  await expect(summary).toBeFocused();
  await expect(summary).toBeInViewport();
  const focusGeometry = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("#trade-scope-summary");
    if (target === null) throw new Error("Missing exact scope summary.");
    const rect = target.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, viewport: window.innerHeight };
  });
  expect(focusGeometry.top).toBeGreaterThanOrEqual(0);
  expect(focusGeometry.top).toBeLessThanOrEqual(focusGeometry.viewport - 44);
  await expect(page.locator("#trade-scope-summary-title")).toBeInViewport();

  const reviewAction = page.locator(".trade-card:visible button[data-review-trade]").first();
  await reviewAction.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("This fictional demo review is read-only.")).toBeVisible();
  await page.getByRole("button", { name: "Close trade review" }).click();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();

  const longDuplicate = "A".repeat(256);
  await page.locator("[data-account-overview] h3").evaluateAll((headings, label) => {
    for (const heading of headings) heading.textContent = label;
  }, longDuplicate);
  const longLabelOverflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    cards: Array.from(document.querySelectorAll<HTMLElement>(
      "[data-account-overview-account]",
    )).map((card) => card.scrollWidth - card.clientWidth),
  }));
  expect(longLabelOverflow.document).toBeLessThanOrEqual(1);
  expect(longLabelOverflow.cards.every((overflowValue) => overflowValue <= 1))
    .toBe(true);
});
