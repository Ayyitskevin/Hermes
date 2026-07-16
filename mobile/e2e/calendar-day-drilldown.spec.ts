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

test("calendar day stepper rejects tampered or ambiguous targets without changing selection", async ({ page }) => {
  await startDemo(page);
  await page.getByRole("button", { name: /Open Wednesday, July 1, 2026/ }).click();
  const jul1 = page.getByRole("heading", { name: "Wednesday, July 1, 2026" });
  const next = page.getByRole("button", {
    name: "Next activity day: Thursday, July 2, 2026",
  }).first();
  const storageBefore = await page.evaluate(() => JSON.stringify(window.localStorage));

  await next.evaluate((button) => {
    button.setAttribute("data-calendar-day-target", "2026-07-07");
  });
  await next.click();
  const error = page.locator("[data-calendar-day-step-error]");
  await expect(error).toBeFocused();
  await expect(error).toHaveText(
    "Hermes could not safely move to that day. Refresh Trades and try again.",
  );
  await expect(jul1).toBeVisible();
  await expect(page.locator('[data-calendar-day-filter="2026-07-01"]')).toHaveCount(1);
  await expect(page.locator('[data-calendar-day-filter="2026-07-07"]')).toHaveCount(0);
  await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).toBe(storageBefore);

  const previous = page.getByRole("button", {
    name: "Previous activity day: none in retained scope",
  });
  await next.evaluate((button) => {
    button.setAttribute("data-calendar-day-target", "2026-07-02");
  });
  await previous.evaluate((button) => {
    button.setAttribute("data-calendar-day-step", "sideways");
  });
  await next.click();
  await expect(page.locator("[data-calendar-day-step-error]")).toBeFocused();
  await expect(jul1).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).toBe(storageBefore);
  await previous.evaluate((button) => {
    button.setAttribute("data-calendar-day-step", "previous");
  });

  await next.evaluate((button) => {
    const clone = button.cloneNode(true);
    button.parentElement?.append(clone);
  });
  await next.click();
  await expect(page.locator("[data-calendar-day-step-error]")).toBeFocused();
  await expect(page.locator("[data-calendar-day-step-error]")).toHaveCount(1);
  await expect(jul1).toBeVisible();
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).toBe(storageBefore);

  await next.evaluate((button) => {
    button.parentElement?.querySelectorAll('[data-calendar-day-step="next"]')
      .forEach((candidate, index) => {
        if (index > 0) candidate.remove();
      });
  });
  await next.click();
  await expect(page.getByRole("heading", {
    name: "Thursday, July 2, 2026",
  })).toBeFocused();
  await expect(page.locator("#route-announcer")).toContainText(
    "Next activity day. Trades for Thursday, July 2, 2026.",
  );
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).toBe(storageBefore);
});

test("rebuilt activity-day focus clears sticky chrome at a wide viewport", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 844 });
  await startDemo(page);
  await page.getByRole("button", { name: /Open Wednesday, July 1, 2026/ }).click();
  await page.getByRole("button", {
    name: "Next activity day: Thursday, July 2, 2026",
  }).click();
  const heading = page.getByRole("heading", { name: "Thursday, July 2, 2026" });
  await expect(heading).toBeFocused();
  const bounds = await heading.evaluate((element) => {
    const headingRect = element.getBoundingClientRect();
    const topbar = document.querySelector<HTMLElement>(".topbar");
    const topbarRect = topbar?.getBoundingClientRect();
    const topbarPosition = topbar === null
      ? ""
      : window.getComputedStyle(topbar).position;
    const topBoundary = (
      (topbarPosition === "sticky" || topbarPosition === "fixed")
      && topbarRect !== undefined
      && topbarRect.bottom > 0
    ) ? topbarRect.bottom : 0;
    const tabbarTop = document.querySelector<HTMLElement>(".tabbar")
      ?.getBoundingClientRect().top ?? window.innerHeight;
    return {
      headingTop: headingRect.top,
      headingBottom: headingRect.bottom,
      topBoundary,
      bottomBoundary: Math.min(window.innerHeight, tabbarTop),
    };
  });
  expect(bounds.headingTop).toBeGreaterThanOrEqual(bounds.topBoundary - 1);
  expect(bounds.headingBottom).toBeLessThanOrEqual(bounds.bottomBoundary + 1);
});

test("calendar drill-down reflows at 320px and 421px with 200% text", async ({ page }) => {
  for (const width of [320, 421]) {
    await page.setViewportSize({ width, height: 568 });
    await startDemo(page);
    await page.evaluate(() => {
      document.documentElement.dataset.testTextScale = "200";
    });
    await page.getByRole("button", { name: /Open Wednesday, July 1, 2026/ }).click();
    const next = page.getByRole("button", {
      name: "Next activity day: Thursday, July 2, 2026",
    });
    await next.evaluate((button) => {
      button.setAttribute("data-calendar-day-target", "2026-07-07");
    });
    await next.click();
    const error = page.locator("[data-calendar-day-step-error]");
    await expect(error).toBeFocused();
    const errorBounds = await error.evaluate((element) => {
      const errorRect = element.getBoundingClientRect();
      const topbar = document.querySelector<HTMLElement>(".topbar");
      const topbarRect = topbar?.getBoundingClientRect();
      const topbarPosition = topbar === null
        ? ""
        : window.getComputedStyle(topbar).position;
      const topBoundary = (
        (topbarPosition === "sticky" || topbarPosition === "fixed")
        && topbarRect !== undefined
        && topbarRect.bottom > 0
      ) ? topbarRect.bottom : 0;
      const tabbarTop = document.querySelector<HTMLElement>(".tabbar")
        ?.getBoundingClientRect().top ?? window.innerHeight;
      return {
        top: errorRect.top,
        bottom: errorRect.bottom,
        height: errorRect.height,
        topBoundary,
        bottomBoundary: Math.min(window.innerHeight, tabbarTop),
        scrollY: window.scrollY,
        maxScrollY: document.documentElement.scrollHeight - window.innerHeight,
      };
    });
    expect(errorBounds.top, `${width}px focused error: ${JSON.stringify(errorBounds)}`)
      .toBeGreaterThanOrEqual(errorBounds.topBoundary - 1);
    expect(errorBounds.bottom, `${width}px focused error: ${JSON.stringify(errorBounds)}`)
      .toBeLessThanOrEqual(errorBounds.bottomBoundary + 1);
    await next.evaluate((button) => {
      button.setAttribute("data-calendar-day-target", "2026-07-02");
    });
    await next.focus();
    await page.keyboard.press("Enter");
    const scaledHeading = page.getByRole("heading", { name: "Thursday, July 2, 2026" });
    await expect(scaledHeading).toBeFocused();
    await expect(scaledHeading).toBeInViewport();

    const overflow = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>("[data-calendar-day-filter]");
      const stepper = document.querySelector<HTMLElement>("[data-calendar-day-stepper]");
      return {
        document: document.documentElement.scrollWidth - window.innerWidth,
        card: card === null ? Number.POSITIVE_INFINITY : card.scrollWidth - card.clientWidth,
        stepper: stepper === null
          ? Number.POSITIVE_INFINITY
          : stepper.scrollWidth - stepper.clientWidth,
      };
    });
    expect(overflow.document, `${width}px: ${JSON.stringify(overflow)}`)
      .toBeLessThanOrEqual(1);
    expect(overflow.card, `${width}px: ${JSON.stringify(overflow)}`)
      .toBeLessThanOrEqual(1);
    expect(overflow.stepper, `${width}px: ${JSON.stringify(overflow)}`)
      .toBeLessThanOrEqual(1);
    for (const control of await page.locator(
      "[data-calendar-day-stepper] button:visible",
    ).all()) {
      const box = await control.boundingBox();
      expect(box, `${width}px step control should have a layout box`).not.toBeNull();
      expect(box?.width ?? 0, "control width").toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, "control height").toBeGreaterThanOrEqual(44);
    }
  }
});
