import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";

import { parseJournalArchive } from "../src/application/journal-archive";

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

async function seedPreviousTradeState(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await page.getByRole("combobox", { name: "Account" })
    .selectOption("demo-account-swing");
  await page.getByRole("textbox", { name: "Activity from" }).fill("2026-07-07");
  await page.getByRole("textbox", { name: "Activity through" }).fill("2026-07-09");
  await page.getByRole("button", { name: "Apply scope" }).click();
  await page.getByRole("searchbox", { name: "Search scoped trades" }).fill("QQQ");
  await page.locator("#trade-view-filter-summary").click();
  await page.getByRole("combobox", { name: "Asset class" }).selectOption("etf");
  await page.getByRole("combobox", { name: "Direction" }).selectOption("long");
  await page.getByRole("combobox", { name: "Position state" }).selectOption("closed");
  await page.getByRole("combobox", { name: "Review state" }).selectOption("completed");
  await page.getByRole("combobox", { name: "Setup" }).selectOption("Reversal");
  await page.getByRole("combobox", { name: "Mistake" }).selectOption("Early entry");
  await page.getByRole("combobox", { name: "Emotion" }).selectOption("Impatient");
  await page.getByRole("combobox", { name: "Tag" }).selectOption("Stopped on plan");
  await page.getByRole("combobox", { name: "Playbook" }).selectOption("Reversal");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", {
    name: /Open Tuesday, July 7, 2026: -\$100\.00 allocation-day P&L/u,
  }).click();
  await expect(page.getByRole("heading", { name: "Tuesday, July 7, 2026" }))
    .toBeVisible();
  await page.getByRole("button", { name: "Journal", exact: true }).click();
}

async function expectPreviousTradeState(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Account" }))
    .toHaveValue("demo-account-swing");
  await expect(page.getByRole("textbox", { name: "Activity from" }))
    .toHaveValue("2026-07-07");
  await expect(page.getByRole("textbox", { name: "Activity through" }))
    .toHaveValue("2026-07-09");
  await expect(page.getByRole("searchbox", { name: /Search .* scoped trades/u }))
    .toHaveValue("qqq");
  await expect(page.locator("#trade-filter-asset-class")).toHaveValue("etf");
  await expect(page.locator("#trade-filter-direction")).toHaveValue("long");
  await expect(page.locator("#trade-filter-position")).toHaveValue("closed");
  await expect(page.locator("#trade-filter-setup")).toHaveValue("Reversal");
  await expect(page.locator("#trade-filter-mistake")).toHaveValue("Early entry");
  await expect(page.locator("#trade-filter-emotion")).toHaveValue("Impatient");
  await expect(page.locator("#trade-filter-tag")).toHaveValue("Stopped on plan");
  await expect(page.locator("#trade-filter-review")).toHaveValue("completed");
  await expect(page.locator("#trade-filter-playbook")).toHaveValue("Reversal");
  await expect(page.locator("#calendar-day-filter-title")).toContainText(
    "Tuesday, July 7, 2026",
  );
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
    name: "playbook-scope.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 2 executions" }).click();
  await page.getByRole("button", { name: "Trades", exact: true }).click();
}
async function exportedJournalState(page: Page): Promise<string> {
  await page.getByRole("button", { name: "More", exact: true }).click();
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Export journal" }),
  });
  const action = card.locator("#user-data-export");
  await action.click();
  await expect(action).toHaveText("Share or save export");
  const downloadPromise = page.waitForEvent("download");
  await action.click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("The journal export download has no local path.");
  const contents = await readFile(path, "utf8");
  const archive = parseJournalArchive(contents);
  return JSON.stringify({
    payload: archive.payload,
    summary: archive.summary,
    attachments: archive.attachments,
  });
}

test("playbook action opens its exact completed cohort and clears conflicting state", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  await startDemo(page);
  await seedPreviousTradeState(page);
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));

  const action = page.getByRole("button", {
    name: "Open Breakout completed reviews in Trades, playbook 2 of 3",
  });
  await action.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Trades", exact: true }))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Trades", exact: true }))
    .toHaveAttribute("aria-current", "page");
  await expect(page.locator("#trade-view-filter-summary")).toBeFocused();
  await expect(page.getByRole("combobox", { name: "Account" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Activity from" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Activity through" })).toHaveValue("");
  await expect(page.getByRole("searchbox", { name: "Search scoped trades" }))
    .toHaveValue("");
  await expect(page.locator("#calendar-day-filter-title")).toHaveCount(0);
  await expect(page.locator("#trade-filter-asset-class")).toHaveValue("all");
  await expect(page.locator("#trade-filter-direction")).toHaveValue("all");
  await expect(page.locator("#trade-filter-position")).toHaveValue("all");
  await expect(page.locator("#trade-filter-review")).toHaveValue("completed");
  await expect(page.locator("#trade-filter-setup")).toHaveValue("");
  await expect(page.locator("#trade-filter-mistake")).toHaveValue("");
  await expect(page.locator("#trade-filter-emotion")).toHaveValue("");
  await expect(page.locator("#trade-filter-tag")).toHaveValue("");
  await expect(page.locator("#trade-filter-playbook")).toHaveValue("Breakout");
  await expect(page.locator("[data-trade-filter-disclosure]"))
    .toHaveAttribute("open", "");
  await expect(page.locator("[data-trade-view-filter-count]"))
    .toHaveText("· 2 active filters");
  await expect(page.locator(".trade-card")).toHaveCount(8);
  await expect(page.locator(".trade-card:visible")).toHaveCount(3);
  const visibleSubjects = await page.locator(".trade-card:visible").evaluateAll((cards) => (
    cards.map((card) => (card as HTMLElement).dataset.tradeSubject ?? "").sort()
  ));
  expect(visibleSubjects).toEqual([
    "demo-subject-aapl",
    "demo-subject-amd",
    "demo-subject-spy",
  ]);
  await expect(page.locator("#trade-count")).toHaveText("Showing 3 of 8 trades");
  await expect(page.locator("#trade-scope-summary")).toContainText(
    "All accounts · All activity dates",
  );
  await expect(page.locator("#trade-scope-summary")).toContainText("+$310.00");
  await expect(page.locator("#trade-scope-summary")).toContainText(
    "8 contributing trades · 16 allocations · 6 activity days",
  );
  await expect(page.locator("#route-announcer")).toHaveText(
    "Opened Breakout completed reviews in Trades. 3 of 8 current trades. Temporary account, dates, day, search, and other card filters were cleared.",
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storageBefore);
  expect(externalRequests).toEqual([]);
});

test("a coherently swapped playbook action fails visibly and preserves prior filters", async ({
  page,
}) => {
  await startDemo(page);
  await seedPreviousTradeState(page);
  const action = page.getByRole("button", {
    name: "Open Breakout completed reviews in Trades, playbook 2 of 3",
  });
  await action.evaluate((element) => {
    const button = element as HTMLElement;
    button.dataset.playbookTradeScopeRoute = "Reversal";
    button.dataset.playbookTradeScopePosition = "3";
    button.dataset.playbookTradeScopeCount = "2";
    button.setAttribute(
      "aria-label",
      "Open Reversal completed reviews in Trades, playbook 3 of 3",
    );
    button.click();
  });

  await expect(page.getByRole("heading", { name: "Journal", exact: true }))
    .toBeVisible();
  const status = page.locator("#playbook-trade-scope-status");
  await expect(status).toBeVisible();
  await expect(status).toBeFocused();
  await expect(status).toHaveText(
    "This playbook link is no longer available. No Trade Browser filters changed.",
  );
  await expectPreviousTradeState(page);
});

test("a post-assignment render failure restores the prior tab and exact browser state", async ({
  page,
}) => {
  await startDemo(page);
  await seedPreviousTradeState(page);
  await page.evaluate(() => {
    const app = document.querySelector("#app");
    if (app === null) throw new Error("Missing app root.");
    const original = Element.prototype.querySelector;
    Element.prototype.querySelector = function patchedQuerySelector(
      selectors: string,
    ): Element | null {
      if (this === app && selectors === "#trade-view-filter-summary") {
        Element.prototype.querySelector = original;
        return null;
      }
      return original.call(this, selectors);
    };
  });
  await page.getByRole("button", {
    name: "Open Breakout completed reviews in Trades, playbook 2 of 3",
  }).click();

  await expect(page.getByRole("heading", { name: "Journal", exact: true }))
    .toBeVisible();
  await expect(page.locator("#playbook-trade-scope-status")).toBeFocused();
  await expect(page.locator("#playbook-trade-scope-status")).toHaveText(
    "This playbook link is no longer available. No Trade Browser filters changed.",
  );
  await expectPreviousTradeState(page);
});

test("playbook scope reflows at 320px and 200% text with reachable exact actions", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startDemo(page);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });

  const section = page.locator("[data-playbook-trade-scope]");
  await expect(section).toBeVisible();
  const overflow = await page.evaluate(() => {
    const target = document.querySelector<HTMLElement>("[data-playbook-trade-scope]");
    return {
      document: document.documentElement.scrollWidth - window.innerWidth,
      section: target === null ? Number.POSITIVE_INFINITY : target.scrollWidth - target.clientWidth,
    };
  });
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.section).toBeLessThanOrEqual(1);
  for (const control of await section.locator("button:visible").all()) {
    const box = await control.boundingBox();
    expect(box).not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  const action = page.getByRole("button", {
    name: "Open Breakout completed reviews in Trades, playbook 2 of 3",
  });
  await action.focus();
  await page.keyboard.press("Enter");
  const summary = page.locator("#trade-view-filter-summary");
  await expect(summary).toBeFocused();
  await expect(summary).toBeInViewport();
  await expect(page.locator("#trade-filter-playbook")).toHaveValue("Breakout");
});

test("a draft-only playbook opens an honest zero-result completed cohort offline", async ({
  page,
  context,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  await importClosedStockTrade(page);
  await page.locator(".trade-card:visible").getByRole("button", {
    name: /Review trade/u,
  }).click();
  const dialog = page.getByRole("dialog", { name: /AAPL trade review/u });
  await dialog.locator("#review-setup").fill("Opening range");
  await dialog.locator("#review-playbook").fill("Draft process");
  await dialog.locator("#review-note").fill("Retained draft-only playbook.");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(dialog).toHaveCount(0);
  const journalBefore = await exportedJournalState(page);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.locator("[data-playbook-trade-scope-card=\"Draft process\"]"))
    .toContainText("0 trades");
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));
  await context.setOffline(true);
  await page.getByRole("button", {
    name: "Open Draft process completed reviews in Trades, playbook 1 of 1",
  }).click();

  await expect(page.locator("#trade-filter-review")).toHaveValue("completed");
  await expect(page.locator("#trade-filter-playbook")).toHaveValue("Draft process");
  await expect(page.locator("#trade-count")).toHaveText("Showing 0 of 1 trade");
  await expect(page.locator(".trade-card")).toHaveCount(1);
  await expect(page.locator(".trade-card:visible")).toHaveCount(0);
  await expect(page.locator("#trade-empty")).toBeVisible();
  await expect(page.locator("#trade-empty")).toContainText(
    "No trades match these filters",
  );
  await expect(page.locator("#route-announcer")).toHaveText(
    "Opened Draft process completed reviews in Trades. 0 of 1 current trades. Temporary account, dates, day, search, and other card filters were cleared.",
  );
  const journalAfter = await exportedJournalState(page);
  expect(journalAfter).toBe(journalBefore);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storageBefore);
  expect(externalRequests).toEqual([]);
});
