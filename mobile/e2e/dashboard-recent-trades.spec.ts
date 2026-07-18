import { expect, test, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

async function startDemo(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

async function importTwoClosedTrades(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "aapl-in,AAPL,BTO,1,100,0,USD,2026-07-09T14:30:00Z",
    "aapl-out,AAPL,STC,1,110,0,USD,2026-07-09T15:00:00Z",
    "msft-in,MSFT,BTO,1,400,0,USD,2026-07-09T15:30:00Z",
    "msft-out,MSFT,STC,1,410,0,USD,2026-07-09T16:00:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "dashboard-recent-trades.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 4 executions" }).click();
  await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

async function importDuplicateSymbolSessions(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "aapl-day-one-in,AAPL,BTO,1,100,0,USD,2026-07-08T14:30:00Z",
    "aapl-day-one-out,AAPL,STC,1,105,0,USD,2026-07-08T15:00:00Z",
    "aapl-day-two-in,AAPL,BTO,1,110,0,USD,2026-07-09T14:30:00Z",
    "aapl-day-two-out,AAPL,STC,1,120,0,USD,2026-07-09T15:00:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "duplicate-symbol-sessions.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 4 executions" }).click();
  await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

function recentTrades(page: Page) {
  return page.getByRole("region", { name: "Recent trades", exact: true });
}

function recentTrade(page: Page, symbol: string) {
  return recentTrades(page).locator("[data-recent-trade]").filter({
    has: page.getByRole("heading", { name: symbol, exact: true }),
  });
}

test("Dashboard recent trades open the exact read-only demo trade and restore its trigger", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:")
      && url.origin !== BASE_ORIGIN
    ) externalRequests.push(request.url());
  });
  await startDemo(page);

  const section = recentTrades(page);
  const rows = section.locator("[data-recent-trade]");
  await expect(rows).toHaveCount(4);
  await expect.poll(() => rows.evaluateAll((elements) => (
    elements.map((element) => element.getAttribute("data-recent-trade"))
  ))).toEqual([
    "demo-subject-qqq",
    "demo-subject-meta",
    "demo-subject-spy",
    "demo-subject-amd",
  ]);

  const qqq = recentTrade(page, "QQQ");
  await expect(qqq).toContainText("ETF · Demo Swing · Jul 9 · Morning");
  const action = qqq.getByRole("button", { name: "Open trade" });
  await expect(action).toHaveAccessibleName(
    "Open trade for QQQ ETF, Demo Swing, Jul 9 · Morning",
  );
  const storageBefore = await page.evaluate(() => JSON.stringify(
    Object.entries(window.localStorage).sort(([left], [right]) => left.localeCompare(right)),
  ));

  await action.click();
  const dialog = page.getByRole("dialog", {
    name: "QQQ trade review · ETF · Demo Swing · Jul 9 · Morning",
  });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", {
    name: "QQQ trade review · ETF · Demo Swing · Jul 9 · Morning",
  })).toBeFocused();
  await expect(dialog).toContainText("This fictional demo review is read-only.");
  await expect(dialog.getByRole("button", { name: /Save|Mark reviewed/u })).toHaveCount(0);
  await expect(dialog.locator("[data-trade-review-report-context]")).toHaveCount(0);
  await dialog.getByRole("button", { name: "Close", exact: true }).click();

  await expect(action).toBeFocused();
  expect(await page.evaluate(() => JSON.stringify(
    Object.entries(window.localStorage).sort(([left], [right]) => left.localeCompare(right)),
  ))).toBe(storageBefore);
  expect(externalRequests).toEqual([]);
});

test("Dashboard recent trade activation fails visibly for a tampered stable identity", async ({ page }) => {
  await startDemo(page);
  const action = recentTrade(page, "QQQ").getByRole("button", { name: "Open trade" });
  await action.evaluate((button) => {
    button.setAttribute("data-review-trade", "missing-dashboard-subject");
  });

  await action.click();

  const error = page.locator("[data-trade-review-open-error]");
  await expect(error).toBeFocused();
  await expect(error).toHaveText(
    "Hermes could not open this exact trade because its stable local identity is unavailable.",
  );
  await expect(page.locator("#trade-review")).toHaveCount(0);
  await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
});

test("duplicate Dashboard symbols keep distinct stable identities and qualified dialogs", async ({ page }) => {
  await importDuplicateSymbolSessions(page);
  const rows = recentTrades(page).locator("[data-recent-trade]");
  await expect(rows).toHaveCount(2);
  const identities = await rows.evaluateAll((elements) => elements.map((element) => ({
    row: element.getAttribute("data-recent-trade"),
    action: element.querySelector("[data-review-trade]")?.getAttribute("data-review-trade"),
  })));
  expect(identities.every(({ row, action }) => row !== null && row === action)).toBe(true);
  expect(new Set(identities.map(({ row }) => row)).size).toBe(2);

  const contextPrefix = "Stock · Primary brokerage · ";
  const contexts = await rows.evaluateAll((elements) => elements.map((element) => (
    element.querySelector(".trade-row-identity span")?.textContent ?? ""
  )));
  expect(contexts[0]).toMatch(/^Stock · Primary brokerage · Jul 9 · /u);
  expect(contexts[1]).toMatch(/^Stock · Primary brokerage · Jul 8 · /u);

  for (const [index, context] of contexts.entries()) {
    if (!context.startsWith(contextPrefix)) {
      throw new Error("The duplicate-symbol row has no exact visible trade context.");
    }
    const session = context.slice(contextPrefix.length);
    const action = rows.nth(index).getByRole("button", {
      name: "Open trade for AAPL Stock, Primary brokerage, " + session,
      exact: true,
    });
    await action.click();
    const dialog = page.getByRole("dialog", {
      name: "AAPL trade review · Stock · Primary brokerage · " + session,
      exact: true,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("heading", {
      name: "AAPL trade review · Stock · Primary brokerage · " + session,
      exact: true,
    })).toBeFocused();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(action).toBeFocused();
  }
});

test("a Dashboard recent trade save redraws the Dashboard and keeps the saved review", async ({ page }) => {
  await importTwoClosedTrades(page);
  const aapl = recentTrade(page, "AAPL");
  await expect(aapl).toHaveCount(1);
  await aapl.getByRole("button", { name: "Open trade" }).click();

  let dialog = page.getByRole("dialog", { name: /AAPL trade review/u });
  await expect(dialog).toBeVisible();
  await dialog.locator("#review-note").fill("Reviewed from the Dashboard recent-trade row.");
  await dialog.getByRole("button", { name: "Save draft" }).click();

  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.locator("#route-announcer")).toHaveText("AAPL review draft saved.");
  await expect(page.locator("#screen")).toBeFocused();
  const refreshedAction = recentTrade(page, "AAPL").getByRole("button", { name: "Open trade" });
  await expect(refreshedAction).toHaveCount(1);

  await refreshedAction.click();
  dialog = page.getByRole("dialog", { name: /AAPL trade review/u });
  await expect(dialog.getByText("DRAFT REVIEW", { exact: true })).toBeVisible();
  await expect(dialog.locator("#review-note")).toHaveValue(
    "Reviewed from the Dashboard recent-trade row.",
  );
});

test("Dashboard recent trade actions reflow at 200% text on narrow iPhone widths", async ({ page }) => {
  for (const width of [320, 421]) {
    await page.setViewportSize({ width, height: 844 });
    await startDemo(page);
    await page.evaluate(() => {
      document.documentElement.dataset.testTextScale = "200";
    });

    const section = recentTrades(page);
    await section.scrollIntoViewIfNeeded();
    const actions = await section.getByRole("button", { name: "Open trade" }).all();
    for (const action of actions) {
      await action.evaluate((button) => button.scrollIntoView({
        behavior: "auto",
        block: "center",
      }));
      const box = await action.boundingBox();
      expect(box, String(width) + "px action layout box").not.toBeNull();
      expect(box?.width ?? 0, String(width) + "px action width").toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0, String(width) + "px action height").toBeGreaterThanOrEqual(48);
      const tabbarTop = await page.locator(".tabbar").evaluate(
        (tabbar) => tabbar.getBoundingClientRect().top,
      );
      expect(box?.y ?? -1, String(width) + "px action top").toBeGreaterThanOrEqual(0);
      expect((box?.y ?? 0) + (box?.height ?? 0), String(width) + "px action bottom")
        .toBeLessThanOrEqual(tabbarTop + 1);
    }
    const keyboardAction = actions[0];
    if (keyboardAction === undefined) throw new Error("The recent-trade action is missing.");
    await keyboardAction.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: /QQQ trade review/u });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(keyboardAction).toBeFocused();
    const layout = await page.evaluate(() => ({
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      rowOverflow: Array.from(document.querySelectorAll<HTMLElement>("[data-recent-trade]"))
        .map((row) => row.scrollWidth - row.clientWidth),
    }));
    expect(layout.documentOverflow, String(width) + "px document overflow")
      .toBeLessThanOrEqual(1);
    expect(layout.rowOverflow, String(width) + "px row overflow").toEqual([0, 0, 0, 0]);
  }
});
