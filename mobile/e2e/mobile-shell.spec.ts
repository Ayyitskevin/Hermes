import { expect, test, type Locator, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

async function startPastOnboarding(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.locator(".topbar .demo-badge")).toHaveText("DEMO");
}

async function localStorageSnapshot(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(window.localStorage)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, window.localStorage.getItem(key) ?? ""]),
  ));
}

async function expectImportFeedbackWithinChrome(target: Locator, width: number): Promise<void> {
  const geometry = await target.evaluate(async (element) => {
    await document.fonts.ready;
    const bounds = element.getBoundingClientRect();
    const topbar = document.querySelector<HTMLElement>(".topbar");
    const tabbar = document.querySelector<HTMLElement>(".tabbar");
    const topbarPosition = topbar === null ? "" : window.getComputedStyle(topbar).position;
    const tabbarPosition = tabbar === null ? "" : window.getComputedStyle(tabbar).position;
    const topbarBottom = topbar !== null && ["fixed", "sticky"].includes(topbarPosition)
      ? topbar.getBoundingClientRect().bottom
      : 0;
    const tabbarTop = tabbar !== null && ["fixed", "sticky"].includes(tabbarPosition)
      ? tabbar.getBoundingClientRect().top
      : window.innerHeight;
    const style = window.getComputedStyle(element);
    return {
      top: bounds.top,
      bottom: bounds.bottom,
      visibleTop: Math.max(0, topbarBottom),
      visibleBottom: Math.min(window.innerHeight, tabbarTop),
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(geometry.top, width + "px feedback top")
    .toBeGreaterThanOrEqual(geometry.visibleTop - 1);
  expect(geometry.bottom, width + "px feedback bottom")
    .toBeLessThanOrEqual(geometry.visibleBottom + 1);
  expect(geometry.outlineStyle).toBe("solid");
  expect(geometry.outlineWidth).toBeGreaterThanOrEqual(2);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
}

test("first launch stays offline, explains the journal, and persists completion", async ({ page }) => {
  const externalRequests: string[] = [];
  const browserErrors: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Hermes Journal welcome" });
  const progress = page.getByRole("progressbar", { name: "Welcome progress" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "See your trading clearly." })).toBeFocused();
  await expect(progress).toHaveAttribute("aria-valuetext", "Step 1 of 3");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Find the patterns." })).toBeFocused();
  await expect(progress).toHaveAttribute("aria-valuetext", "Step 2 of 3");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Private by default." })).toBeFocused();
  await expect(progress).toHaveAttribute("aria-valuetext", "Step 3 of 3");
  await expect(page.getByRole("button", { name: "Start my journal" })).toBeVisible();
  await page.getByRole("button", { name: "Explore fictional demo" }).click();

  await expect(page.locator("#screen")).toBeFocused();
  await expect(page.locator(".topbar .demo-badge")).toHaveText("DEMO");
  await expect(page.locator("[data-tab]")).toHaveCount(5);
  await expect(page.locator(".equity-line")).toHaveAttribute("points", /0\.0,[\d.]+ 12\.5,[\d.]+/);
  await expect(page.locator("#screen [style]")).toHaveCount(0);
  await expect(page.getByText("RISK BEFORE SIGNAL", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Confirmed bull", { exact: true })).toHaveCount(0);
  for (const tab of ["Trades", "Journal", "Reports", "More", "Dashboard"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
  }
  await expect(page.locator("body")).not.toHaveClass(/modal-open/);
  await page.reload();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Build your journal" })).toBeVisible();
  await expect(page.locator(".topbar .demo-badge")).toHaveText("NEW");
  expect(externalRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test("journal navigation, search, sizing, settings, and touch targets work", async ({ page }) => {
  await startPastOnboarding(page);
  const destinations = [
    ["Dashboard", "Dashboard"],
    ["Trades", "Trades"],
    ["Journal", "Journal"],
    ["Reports", "Reports"],
    ["More", "More"],
  ] as const;

  for (const [tab, heading] of destinations) {
    const tabButton = page.getByRole("button", { name: tab, exact: true });
    await tabButton.click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(tabButton).toHaveAttribute("aria-current", "page");
  }

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  const search = page.getByRole("searchbox", { name: "Search scoped trades" });
  await search.fill("Chased entry");
  await expect(page.getByRole("status")).toHaveText("Showing 1 of 8 trades");
  await expect(page.locator(".trade-card:visible")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "SPY", exact: true })).toBeVisible();
  await search.fill("not-a-trade");
  await expect(page.locator(".trade-card:visible")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No trades match this search" })).toBeVisible();
  await search.fill("");
  await expect(page.locator(".trade-card:visible")).toHaveCount(8);

  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.getByRole("button", { name: "Calculate plan" })).toHaveCount(0);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("button", { name: "Calculate plan" })).toHaveCount(1);
  await page.getByRole("button", { name: "Calculate plan" }).click();
  await expect(page.getByText("20.00%", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);

  const settingsButton = page.getByRole("button", { name: "Open settings" });
  await settingsButton.click();
  await expect(page.locator(".topbar")).toHaveAttribute("inert", "");
  await expect(page.locator("#screen")).toHaveAttribute("inert", "");
  await expect(page.locator("#screen")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".tabbar")).toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Replay welcome" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Return to my journal" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Replay welcome" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(settingsButton).toBeFocused();
  await expect(page.locator("#screen")).not.toHaveAttribute("aria-hidden", "true");

  await settingsButton.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();
  await expect(settingsButton).toBeFocused();

  await settingsButton.click();
  await page.getByRole("button", { name: "Replay welcome" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Explore fictional demo" }).click();
  await expect(page.locator("#screen")).toBeFocused();

  for (const control of await page.locator("button:visible, input:visible").all()) {
    const box = await control.boundingBox();
    expect(box, "visible control should have a layout box").not.toBeNull();
    expect(box?.width ?? 0, "control width").toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, "control height").toBeGreaterThanOrEqual(44);
  }
});

test("welcome and settings remain reachable at 200% text in short landscape", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Explore fictional demo" })).toBeVisible();
  await page.getByRole("button", { name: "Explore fictional demo" }).click();

  for (const tab of ["Dashboard", "Trades", "Journal", "Reports", "More"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    const routeOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(routeOverflow, `${tab} horizontal overflow`).toBeLessThanOrEqual(1);
  }
  await expect(page.locator("html")).toHaveAttribute("data-test-text-scale", "200");
  const fontSizes = await page.evaluate(() => ({
    root: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    input: Number.parseFloat(getComputedStyle(document.querySelector("#entry") as Element).fontSize),
  }));
  expect(fontSizes.root).toBeGreaterThanOrEqual(31);
  expect(fontSizes.input).toBeGreaterThanOrEqual(31);

  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay welcome" })).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});

test("CSV preview commits exact executions and receipt rollback removes their projections", async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Build your journal" })).toBeVisible();

  const csv = [
    "symbol,side,quantity,price,fee,currency,executed_at",
    "AAPL,BUY,2,100,1,USD,2026-07-09T14:30:00Z",
    "AAPL,SELL,2,110,1,USD,2026-07-09T15:30:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "broker-export.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(page.getByRole("heading", { name: "Ready to import" })).toBeFocused();
  await expect(page.getByText("2 valid · 0 rejected · 0 skipped")).toBeVisible();
  await page.getByRole("button", { name: "Import 2 executions" }).click();

  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.getByText("+$18.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 trade with realized P&L", { exact: false })).toBeVisible();
  await expect(page.locator("#route-announcer")).toHaveText(
    "2 executions accepted with a reversible receipt.",
  );

  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import history" })).toBeVisible();
  await expect(page.getByText("broker-export.csv", { exact: true }).first()).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Roll back this import" }).click();
  await expect(page.getByText("ROLLED BACK", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Roll back this import" })).toHaveCount(0);
  await expect(page.locator("#route-announcer")).toHaveText(
    "Import rolled back. Its immutable receipt remains in history.",
  );

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByText("+$0.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("0 trades with realized P&L", { exact: false })).toBeVisible();

  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.locator("#import-file").setInputFiles({
    name: "broker-export.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await expect(page.locator("#import-account")).toHaveValue("");
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(page.getByRole("heading", { name: "Ready to import" })).toBeVisible();
  await page.getByRole("button", { name: "Import 2 executions" }).click();

  await expect(page.getByRole("heading", { name: "Import history" })).toBeVisible();
  await expect(page.locator(".import-history-row")).toHaveCount(2);
  await expect(page.getByText("ROLLED BACK", { exact: true })).toHaveCount(1);
  await expect(page.getByText("COMMITTED", { exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByText("+$18.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 trade with realized P&L", { exact: false })).toBeVisible();
});

test("CSV preview feedback owns visible focus while preparation stays offline and write-free", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.addInitScript(() => {
    const readFile = File.prototype.text;
    File.prototype.text = function text(): Promise<string> {
      if (this.name === "read-error.csv") {
        return Promise.reject(new Error("Synthetic file read failure."));
      }
      return readFile.call(this);
    };
  });
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });

  const account = page.locator("#import-account");
  const timeZone = page.locator("#import-time-zone");
  const currency = page.locator("#import-currency");
  const file = page.locator("#import-file");
  const status = page.locator("#import-status");
  const preview = page.locator("#import-preview");
  await account.fill("Primary brokerage");
  await timeZone.fill("America/New_York");
  await currency.fill("usd");
  const storageBefore = await localStorageSnapshot(page);

  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(status).toHaveText("Choose a CSV file first.");
  await expect(status).toBeFocused();
  await expect(status).toHaveAttribute("tabindex", "-1");
  await expectImportFeedbackWithinChrome(status, 320);
  await expect(account).toHaveValue("Primary brokerage");
  await expect(timeZone).toHaveValue("America/New_York");
  await expect(currency).toHaveValue("usd");
  await expect(preview).toBeEmpty();

  await file.setInputFiles({
    name: "oversize.csv",
    mimeType: "text/csv",
    buffer: Buffer.alloc((5 * 1024 * 1024) + 1),
  });
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(status).toContainText("the limit is 5242880 bytes");
  await expect(status).toBeFocused();
  await expectImportFeedbackWithinChrome(status, 320);
  await expect(preview).toBeEmpty();
  expect(await file.evaluate((input) => (input as HTMLInputElement).files?.[0]?.name))
    .toBe("oversize.csv");

  await file.setInputFiles({
    name: "read-error.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("symbol,side,quantity,price,executed_at\n"),
  });
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(status).toHaveText("Synthetic file read failure.");
  await expect(status).toBeFocused();
  await expectImportFeedbackWithinChrome(status, 320);
  await expect(preview).toBeEmpty();

  const validCsv = [
    "symbol,side,quantity,price,currency,executed_at",
    "AAPL,BUY,1,100,USD,2026-07-09T14:30:00Z",
    "",
  ].join("\r\n");
  await file.setInputFiles({
    name: "correctable.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(validCsv),
  });
  await account.fill("");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(status).toContainText("Account name must be a non-empty");
  await expect(status).toBeFocused();
  await expectImportFeedbackWithinChrome(status, 320);
  await expect(preview).toBeEmpty();
  await expect(account).toHaveValue("");
  await expect(timeZone).toHaveValue("America/New_York");
  await expect(currency).toHaveValue("usd");
  expect(await file.evaluate((input) => (input as HTMLInputElement).files?.[0]?.name))
    .toBe("correctable.csv");

  await account.fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  const readyTitle = page.getByRole("heading", { name: "Ready to import" });
  await expect(readyTitle).toBeFocused();
  await expect(readyTitle).toHaveAttribute("tabindex", "-1");
  await expectImportFeedbackWithinChrome(readyTitle, 320);
  await expect(page.getByRole("button", { name: "Import 1 execution" })).toBeVisible();
  await expect(page.locator(".import-history-row")).toHaveCount(0);
  expect(await localStorageSnapshot(page)).toEqual(storageBefore);
  expect(externalRequests).toEqual([]);
});

test("stale CSV reads cannot replace current options, file ownership, or focus", async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.addInitScript(() => {
    type CsvReadWindow = Window & { releaseNextCsvRead?: () => Promise<void> };
    const readFile = File.prototype.text;
    const releases: Array<() => Promise<void>> = [];
    (window as CsvReadWindow).releaseNextCsvRead = async () => {
      await releases.shift()?.();
    };
    File.prototype.text = function text(): Promise<string> {
      if (!this.name.startsWith("delayed-")) return readFile.call(this);
      const selectedFile = this;
      return new Promise<string>((resolve, reject) => {
        releases.push(async () => {
          try {
            resolve(await readFile.call(selectedFile));
          } catch (error) {
            reject(error);
          }
          await new Promise<void>((done) => window.requestAnimationFrame(() => done()));
        });
      });
    };
  });
  await page.goto("/");

  const csvFor = (symbol: string) => [
    "symbol,side,quantity,price,currency,executed_at",
    `${symbol},BUY,1,100,USD,2026-07-09T14:30:00Z`,
    "",
  ].join("\r\n");
  const account = page.locator("#import-account");
  const file = page.locator("#import-file");
  const status = page.locator("#import-status");
  const preview = page.locator("#import-preview");
  const releaseRead = async () => page.evaluate(async () => {
    await (window as Window & { releaseNextCsvRead?: () => Promise<void> })
      .releaseNextCsvRead?.();
  });
  await account.fill("Primary brokerage");
  const storageBefore = await localStorageSnapshot(page);

  await file.setInputFiles({
    name: "delayed-options.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvFor("AAPL")),
  });
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(status).toHaveText("Reading and validating locally…");
  await account.fill("Different brokerage");
  await expect(account).toBeFocused();
  await expect(status).toHaveText(
    "Import options changed. Preview the CSV again before committing.",
  );
  await releaseRead();
  await expect(account).toBeFocused();
  await expect(preview).toBeEmpty();
  await expect(page.locator("#commit-import")).toHaveCount(0);

  await account.fill("Primary brokerage");
  await file.setInputFiles({
    name: "delayed-file.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvFor("AAPL")),
  });
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(status).toHaveText("Reading and validating locally…");
  await file.focus();
  await file.setInputFiles({
    name: "current-file.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csvFor("MSFT")),
  });
  await expect(file).toBeFocused();
  await expect(status).toHaveText("current-file.csv selected. Preview it before import.");
  await releaseRead();
  await expect(file).toBeFocused();
  await expect(preview).toBeEmpty();
  await expect(page.locator("#commit-import")).toHaveCount(0);

  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(page.getByRole("heading", { name: "Ready to import" })).toBeFocused();
  await expect(preview).toContainText("MSFT");
  await expect(preview).not.toContainText("AAPL");
  await expect(page.locator(".import-history-row")).toHaveCount(0);
  expect(await localStorageSnapshot(page)).toEqual(storageBefore);
});

test("editing import options invalidates a ready preview before commit", async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  const csv = [
    "symbol,side,quantity,price,currency,executed_at",
    "AAPL,BUY,1,100,USD,2026-07-09T14:30:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-account").fill("Primary brokerage");
  await page.locator("#import-file").setInputFiles({
    name: "broker-export.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(page.getByRole("button", { name: "Import 1 execution" })).toBeVisible();

  const account = page.locator("#import-account");
  await account.fill("Different brokerage");

  await expect(account).toBeFocused();
  await expect(page.getByRole("button", { name: "Import 1 execution" })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText(
    "Import options changed. Preview the CSV again before committing.",
  );
});

test("initial CSV previews and the final mapping own visible focus at 200% text", async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  const csv = [
    "c1,c2,c3,c4,c5",
    "AAPL,BUY,1,100,2026-07-09T14:30:00Z",
    "",
  ].join("\r\n");
  for (const width of [320, 421, 568]) {
    await page.setViewportSize({ width, height: 568 });
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.dataset.testTextScale = "200";
    });
    await page.locator("#import-account").fill("Primary brokerage");
    await page.locator("#import-file").setInputFiles({
      name: "manual-mapping.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(csv),
    });
    const storageBefore = await localStorageSnapshot(page);
    await page.getByRole("button", { name: "Preview CSV" }).click();
    const attentionTitle = page.getByRole("heading", { name: "Needs attention" });
    await expect(attentionTitle).toBeFocused();
    await expect(attentionTitle).toHaveAttribute("tabindex", "-1");
    await expectImportFeedbackWithinChrome(attentionTitle, width);
    await expect(page.locator(".mapping-details")).toHaveAttribute("open", "");
    await expect(page.getByRole("button", { name: "Import 1 execution" })).toHaveCount(0);

    await page.locator('[data-csv-field="symbol"]').selectOption("0");
    await page.locator('[data-csv-field="side"]').selectOption("1");
    await page.locator('[data-csv-field="quantity"]').selectOption("2");
    await page.locator('[data-csv-field="price"]').selectOption("3");
    await page.locator('[data-csv-field="executedAt"]').selectOption("4");

    const commit = page.getByRole("button", { name: "Import 1 execution" });
    await expect(commit).toBeFocused();
    await expectImportFeedbackWithinChrome(commit, width);
    await expect(page.locator("#import-account")).toHaveValue("Primary brokerage");
    expect(await page.locator("#import-file").evaluate(
      (input) => (input as HTMLInputElement).files?.[0]?.name,
    )).toBe("manual-mapping.csv");
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    )).toBeLessThanOrEqual(1);
  }
});

test("rolled-back receipts keep their own account and the next import requires an explicit account", async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  const csvFor = (symbol: string) => [
    "execution_id,symbol,side,quantity,price,currency,executed_at",
    `${symbol}-entry,${symbol},BTO,1,100,USD,2026-07-09T14:30:00Z`,
    `${symbol}-exit,${symbol},STC,1,110,USD,2026-07-09T15:30:00Z`,
    "",
  ].join("\r\n");
  const selectFile = async (name: string, symbol: string) => {
    await page.locator("#import-file").setInputFiles({
      name,
      mimeType: "text/csv",
      buffer: Buffer.from(csvFor(symbol)),
    });
  };

  await page.locator("#import-account").fill("Account Alpha");
  await selectFile("alpha.csv", "AAPL");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 2 executions" }).click();
  await page.getByRole("button", { name: "More", exact: true }).click();

  await expect(page.locator("#import-account")).toHaveValue("");
  await page.locator("#import-account").fill("Account Beta");
  await selectFile("beta.csv", "MSFT");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 2 executions" }).click();

  const betaReceipt = page.locator(".import-history-row").filter({ hasText: "beta.csv" });
  page.once("dialog", (dialog) => dialog.accept());
  await betaReceipt.getByRole("button", { name: "Roll back this import" }).click();

  await expect(page.locator(".import-receipt")).toContainText("Account Beta");
  await expect(page.locator(".import-history-row").filter({ hasText: "beta.csv" }))
    .toContainText("Account Beta");
  await expect(page.locator("#import-account")).toHaveValue("");
});
