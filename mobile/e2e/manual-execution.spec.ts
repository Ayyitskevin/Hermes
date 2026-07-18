import { expect, test, type Locator, type Page, type Request } from "@playwright/test";

const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

async function startEmptyJournal(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Build your journal" })).toBeVisible();
}

async function reviewManualExecution(
  page: Page,
  input: {
    readonly side: "Buy" | "Sell";
    readonly effect: "Open" | "Close" | "Automatic";
    readonly symbol?: string;
    readonly quantity?: string;
    readonly price: string;
    readonly executedAt: string;
  },
): Promise<void> {
  const symbol = input.symbol ?? "AAPL";
  await page.locator("#manual-symbol").fill(symbol);
  await page.locator("#manual-side").selectOption({ label: input.side });
  await page.locator("#manual-position-effect").selectOption({ label: input.effect });
  await page.locator("#manual-quantity").fill(input.quantity ?? "2");
  await page.locator("#manual-price").fill(input.price);
  await page.locator("#manual-fee").fill("1");
  await page.locator("#manual-executed-at").fill(input.executedAt);
  await page.getByRole("button", { name: "Review execution" }).click();
  await expect(page.getByRole("heading", { name: "Review before saving" })).toBeVisible();
  await expect(page.getByText(`${symbol} · STOCK`, { exact: true })).toBeVisible();
  const effect = input.effect === "Automatic" ? "AUTO" : input.effect.toUpperCase();
  await expect(page.getByText(`${input.side.toUpperCase()} · ${effect}`, {
    exact: true,
  })).toBeVisible();
}

async function fillInvalidManualExecution(page: Page): Promise<void> {
  await page.locator("#manual-account").fill("Primary brokerage");
  await page.locator("#manual-symbol").fill("AAPL");
  await page.locator("#manual-quantity").fill("1");
  await page.locator("#manual-price").fill("1e2");
  await page.locator("#manual-executed-at").fill("2026-07-09T14:30");
}

async function localStorageSnapshot(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(window.localStorage)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, window.localStorage.getItem(key) ?? ""]),
  ));
}

async function expectControlWithinSheet(control: Locator): Promise<void> {
  const geometry = await control.evaluate((element) => {
    const sheet = element.closest<HTMLElement>(".manual-entry-sheet");
    if (sheet === null) throw new Error("The manual-entry sheet is missing.");
    return {
      control: element.getBoundingClientRect(),
      sheet: sheet.getBoundingClientRect(),
    };
  });
  expect(geometry.control.top).toBeGreaterThanOrEqual(geometry.sheet.top);
  expect(geometry.control.bottom).toBeLessThanOrEqual(geometry.sheet.bottom);
}

async function expectWithinUnobscuredChrome(
  target: Locator,
  options: { readonly wholeTarget?: boolean } = {},
): Promise<void> {
  const geometry = await target.evaluate((element) => {
    const fixedBoundary = (
      candidate: HTMLElement | null,
      edge: "top" | "bottom",
    ): number | null => {
      if (candidate === null) return null;
      const position = window.getComputedStyle(candidate).position;
      if (position !== "fixed" && position !== "sticky") return null;
      const bounds = candidate.getBoundingClientRect();
      return edge === "top" && bounds.bottom > 0
        ? bounds.bottom
        : edge === "bottom" && bounds.top < window.innerHeight
          ? bounds.top
          : null;
    };
    const bounds = element.getBoundingClientRect();
    return {
      target: { top: bounds.top, bottom: bounds.bottom },
      topBoundary: fixedBoundary(document.querySelector(".topbar"), "top") ?? 0,
      bottomBoundary: fixedBoundary(document.querySelector(".tabbar"), "bottom")
        ?? window.innerHeight,
    };
  });
  expect(geometry.target.top).toBeGreaterThanOrEqual(geometry.topBoundary + 8);
  if (options.wholeTarget !== false) {
    expect(geometry.target.bottom).toBeLessThanOrEqual(geometry.bottomBoundary - 8);
  }
}

test("manual entry creates exact fills, a closed trade, and no phantom import receipt", async ({ page }) => {
  await startEmptyJournal(page);
  const trigger = page.getByRole("button", { name: "Enter execution" });
  await trigger.click();
  await expect(page.getByRole("heading", { name: "Add execution" })).toBeFocused();
  await expect(page.locator("#screen")).toHaveAttribute("inert", "");
  await page.locator("#manual-account").fill("Primary brokerage");
  await page.locator("#manual-time-zone").fill("UTC");
  await reviewManualExecution(page, {
    side: "Buy",
    effect: "Open",
    price: "100",
    executedAt: "2026-07-09T14:30",
  });
  const storageBeforeSaves = await localStorageSnapshot(page);
  const requests: string[] = [];
  const recordRequest = (request: Request) => requests.push(request.url());
  page.on("request", recordRequest);
  const pendingSuccess = await page.getByRole("button", { name: "Save execution" })
    .evaluate((element) => {
      const button = element as HTMLButtonElement;
      button.click();
      const backdrop = document.querySelector<HTMLElement>("#manual-entry");
      const sheet = document.querySelector<HTMLElement>(".manual-entry-sheet");
      backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      sheet?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return {
        connected: backdrop?.isConnected ?? false,
        busy: sheet?.getAttribute("aria-busy"),
      };
    });
  expect(pendingSuccess).toEqual({ connected: true, busy: "true" });

  await expect(page.getByRole("heading", { name: "Trades", exact: true })).toBeVisible();
  await expect(page.locator("#route-announcer")).toContainText(
    "Buy execution for AAPL saved on device. Opened Primary brokerage in Trades with 1 current trade; 1 trade linked to this execution.",
  );
  const scope = page.locator("#trade-scope-summary");
  await expect(scope).toContainText("Primary brokerage · All activity dates");
  await expect(scope).toContainText("1 contributing trade · 1 allocation");
  const continuation = page.locator("[data-manual-capture-review-continuation]");
  const continuationTitle = page.locator("#manual-capture-review-title");
  await expect(continuation).toHaveCount(1);
  await expect(continuationTitle).toBeFocused();
  await expect(continuation).toContainText(
    "This exact execution links to 1 current trade in Primary brokerage.",
  );
  const linkedReview = continuation.getByRole("button", {
    name: /^Review trade for AAPL Stock, Primary brokerage,/,
  });
  await expect(linkedReview).toHaveText("Review trade");
  await linkedReview.click();
  const reviewDialog = page.getByRole("dialog", { name: /^AAPL trade review/ });
  await expect(reviewDialog).toBeVisible();
  await expect(reviewDialog.getByRole("heading", { name: "Execution inspection" })).toBeVisible();
  await expect(reviewDialog.getByText("BUY 2", { exact: true })).toBeVisible();
  await expect(reviewDialog.getByText("100 USD", { exact: true })).toBeVisible();
  await reviewDialog.locator("#review-note").fill("Review continuation stays exact.");
  await reviewDialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(reviewDialog).toHaveCount(0);
  await expect(continuationTitle).toBeFocused();
  await expect(continuation.getByRole("button", {
    name: /^Continue draft for AAPL Stock, Primary brokerage,/,
  })).toHaveText("Continue draft");

  await page.getByRole("button", { name: "Add execution" }).click();
  await page.keyboard.press("Escape");
  await expect(continuation).toHaveCount(0);
  await expect(scope).toContainText("Primary brokerage · All activity dates");
  await expect(page.getByRole("button", { name: "Add execution" })).toBeFocused();

  await page.locator("#trade-scope-from").fill("2026-07-10");
  await page.getByRole("button", { name: "Apply scope" }).click();
  await page.getByRole("searchbox", { name: "Search scoped trades" }).fill("not-a-match");
  await expect(page.locator("#trade-count")).toContainText("Showing 0");
  await page.getByRole("button", { name: "Add execution" }).click();
  await expect(page.locator("#manual-account")).toHaveValue("Primary brokerage");
  await expect(page.locator("#manual-time-zone")).toHaveAttribute("readonly", "");
  await expect(page.locator("#manual-currency")).toHaveAttribute("readonly", "");
  await reviewManualExecution(page, {
    side: "Sell",
    effect: "Close",
    price: "110",
    executedAt: "2026-07-09T15:30",
  });
  await page.getByRole("button", { name: "Save execution" }).click();

  page.off("request", recordRequest);
  expect(requests).toEqual([]);
  expect(await localStorageSnapshot(page)).toEqual(storageBeforeSaves);
  await expect(continuationTitle).toBeFocused();
  await expect(continuation).toContainText(
    "This exact execution links to 1 current trade in Primary brokerage.",
  );
  await expect(continuation.getByRole("button", {
    name: /^Continue draft for AAPL Stock, Primary brokerage,/,
  })).toHaveText("Continue draft");
  await expect(page.locator("#trade-scope-from")).toHaveValue("");
  await expect(page.getByRole("searchbox", { name: "Search scoped trades" })).toHaveValue("");
  await expect(scope).toContainText("1 contributing trade · 2 allocations");
  await expect(page.locator(".trade-card").getByRole("heading", {
    name: "AAPL",
    exact: true,
  })).toBeVisible();
  await expect(page.locator(".trade-card .journal-metrics > strong"))
    .toHaveText("+$18.00");
  await continuation.getByRole("button", { name: "Dismiss saved execution guide" }).click();
  await expect(continuation).toHaveCount(0);
  await expect(scope).toBeFocused();
  await expect(scope).toContainText("Primary brokerage · All activity dates");

  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByText("LATEST IMPORT RECEIPT", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Import history" })).toHaveCount(0);
  await expect(page.getByText(
    "Manual fills remain independent facts; CSV imports also create reversible receipts.",
    { exact: false },
  )).toBeVisible();
});

test("AUTO reversal exposes both exact linked trades and rejects a tampered target at 200% text", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startEmptyJournal(page);
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  await page.getByRole("button", { name: "Enter execution" }).click();
  await page.locator("#manual-account").fill("Primary brokerage");
  await page.locator("#manual-time-zone").fill("UTC");
  await reviewManualExecution(page, {
    side: "Buy",
    effect: "Open",
    quantity: "1",
    price: "100",
    executedAt: "2026-07-09T14:30",
  });
  await page.getByRole("button", { name: "Save execution" }).click();
  await expect(page.locator("#manual-capture-review-title")).toBeFocused();

  await page.getByRole("button", { name: "Add execution" }).click();
  await reviewManualExecution(page, {
    side: "Sell",
    effect: "Automatic",
    quantity: "2",
    price: "110",
    executedAt: "2026-07-09T15:30",
  });
  await page.getByRole("button", { name: "Save execution" }).click();

  const continuation = page.locator("[data-manual-capture-review-continuation]");
  const rows = continuation.locator("[data-manual-capture-review-trade]");
  const actions = continuation.locator("button[data-review-trade]");
  const closedRow = rows.filter({ hasText: "Long · Closed · Pending" });
  const openRow = rows.filter({ hasText: "Short · Open · Pending" });
  const closedAction = closedRow.locator("button[data-review-trade]");
  const openAction = openRow.locator("button[data-review-trade]");
  await expect(page.locator("#manual-capture-review-title")).toBeFocused();
  await expect(continuation).toContainText(
    "This exact execution links to 2 current trades in Primary brokerage.",
  );
  await expect(rows).toHaveCount(2);
  await expect(closedRow).toHaveCount(1);
  await expect(openRow).toHaveCount(1);
  await expect(actions).toHaveCount(2);

  await closedAction.click();
  const reviewDialog = page.getByRole("dialog", { name: /^AAPL trade review/ });
  await expect(reviewDialog).toBeVisible();
  await expect(reviewDialog.getByRole("heading", { name: "Execution inspection" }))
    .toBeVisible();
  await expect(reviewDialog.getByText("2 allocations", { exact: true })).toBeVisible();
  await reviewDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(closedAction).toBeFocused();

  const geometry = await continuation.evaluate((element) => ({
    cardOverflow: element.scrollWidth - element.clientWidth,
    documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(geometry.cardOverflow).toBeLessThanOrEqual(1);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);

  await openAction.evaluate((element) => {
    element.dataset.reviewTrade = "tampered-subject";
  });
  await openAction.click();
  await expect(reviewDialog).toHaveCount(0);
  const error = continuation.locator("[data-manual-capture-review-open-error]");
  await expect(error).toContainText("could not open that exact linked trade");
  await expect(error).toBeFocused();
  await expectWithinUnobscuredChrome(error);

  await continuation.getByRole("button", { name: "Dismiss saved execution guide" }).click();
  const scope = page.locator("#trade-scope-summary");
  await expect(scope).toBeFocused();
  await expectWithinUnobscuredChrome(scope, { wholeTarget: false });
});

test("a known manual save retries only continuation after destination failure", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startEmptyJournal(page);
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  await page.getByRole("button", { name: "Enter execution" }).click();
  await page.locator("#manual-account").fill("Primary brokerage");
  await page.locator("#manual-time-zone").fill("UTC");
  await reviewManualExecution(page, {
    side: "Buy",
    effect: "Open",
    quantity: "1",
    price: "100",
    executedAt: "2026-07-09T14:30",
  });
  const storageBefore = await localStorageSnapshot(page);
  const requests: string[] = [];
  const recordRequest = (request: Request) => requests.push(request.url());
  page.on("request", recordRequest);
  const privateDetail = "/private/journals/kevin.db injected manual destination failure";
  await page.evaluate((detail) => {
    const root = document.documentElement;
    const mapDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, "get");
    const originalMapGet = mapDescriptor?.value as (
      (this: Map<unknown, unknown>, key: unknown) => unknown
    ) | undefined;
    if (mapDescriptor === undefined || originalMapGet === undefined) {
      throw new Error("Map.prototype.get is not instrumentable.");
    }
    root.dataset.manualCommitMapReads = "0";
    Object.defineProperty(Map.prototype, "get", {
      ...mapDescriptor,
      value(this: Map<unknown, unknown>, key: unknown) {
        if ((new Error().stack ?? "").includes("commitManualExecution")) {
          const reads = Number(root.dataset.manualCommitMapReads ?? "0") + 1;
          root.dataset.manualCommitMapReads = String(reads);
        }
        return originalMapGet.call(this, key);
      },
    });

    const htmlDescriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    const htmlGetter = htmlDescriptor?.get;
    const htmlSetter = htmlDescriptor?.set;
    if (
      htmlDescriptor === undefined
      || htmlGetter === undefined
      || htmlSetter === undefined
    ) throw new Error("Element.innerHTML is not instrumentable.");
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: htmlDescriptor.configurable,
      enumerable: htmlDescriptor.enumerable,
      get: htmlGetter,
      set(this: Element, value: string) {
        if (this.id === "screen") {
          Object.defineProperty(Element.prototype, "innerHTML", htmlDescriptor);
          throw new Error(detail);
        }
        htmlSetter.call(this, value);
      },
    });
  }, privateDetail);

  const routeAnnouncementBefore = await page.locator("#route-announcer").textContent();
  await page.getByRole("button", { name: "Save execution" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  const failure = page.locator("[data-manual-capture-review-failure]");
  const failureHeading = page.locator("#manual-capture-review-failure-title");
  await expect(failure).toContainText(
    "Execution saved, but Hermes could not reconcile its exact current trade.",
  );
  await expect(failure).toContainText("do not save the execution again");
  await expect(failure).not.toContainText(privateDetail);
  await expect(failureHeading).toBeFocused();
  await expectWithinUnobscuredChrome(failureHeading);
  expect(await page.locator("#route-announcer").textContent()).toBe(routeAnnouncementBefore);
  expect(Number(await page.evaluate(() => (
    document.documentElement.dataset.manualCommitMapReads
  )))).toBeGreaterThan(0);

  await page.evaluate(() => {
    document.documentElement.dataset.manualCommitMapReads = "0";
  });
  const supersededRetryState = await failure.getByRole("button", {
    name: "Retry review continuation",
  }).evaluate((element) => {
    const button = element as HTMLButtonElement;
    button.scrollIntoView({ block: "nearest" });
    button.click();
    document.querySelector<HTMLButtonElement>("#settings-open")?.click();
    const card = button.closest<HTMLElement>("[data-manual-capture-review-failure]");
    return {
      disabled: button.disabled,
      text: button.textContent,
      busy: card?.getAttribute("aria-busy") ?? null,
      status: card?.querySelector<HTMLElement>(
        "[data-manual-capture-review-retry-status]",
      )?.textContent ?? null,
      settingsHidden: document.querySelector<HTMLElement>("#settings")?.hidden ?? true,
    };
  });
  expect(supersededRetryState).toEqual({
    disabled: true,
    text: "Retrying…",
    busy: "true",
    status: "Retrying the confirmed execution’s review continuation.",
    settingsHidden: false,
  });
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await expect(page.locator("[data-manual-capture-review-continuation]")).toHaveCount(0);
  const hiddenRetry = failure.locator("button[data-manual-capture-review-retry]");
  await expect(hiddenRetry).toBeEnabled();
  await expect(failure.locator("[data-manual-capture-review-retry-status]")).toContainText(
    "still pending",
  );
  await page.getByRole("button", { name: "Close settings" }).click();
  const retry = failure.getByRole("button", { name: "Retry review continuation" });
  await expect(failureHeading).toBeFocused();

  const retryState = await retry.evaluate((element) => {
    const button = element as HTMLButtonElement;
    button.click();
    const card = button.closest<HTMLElement>("[data-manual-capture-review-failure]");
    return {
      disabled: button.disabled,
      text: button.textContent,
      busy: card?.getAttribute("aria-busy") ?? null,
    };
  });
  expect(retryState).toEqual({ disabled: true, text: "Retrying…", busy: "true" });
  await expect(failure).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Trades", exact: true })).toBeVisible();
  await expect(page.locator("#manual-capture-review-title")).toBeFocused();
  await expect(page.locator("[data-manual-capture-review-continuation]")).toContainText(
    "This exact execution links to 1 current trade in Primary brokerage.",
  );
  expect(await page.evaluate(() => (
    document.documentElement.dataset.manualCommitMapReads
  ))).toBe("0");
  page.off("request", recordRequest);
  expect(requests).toEqual([]);
  expect(await localStorageSnapshot(page)).toEqual(storageBefore);
});

test("finishing onboarding resumes an unacknowledged known save without adapter detail", async ({ page }) => {
  await startEmptyJournal(page);
  await page.getByRole("button", { name: "Enter execution" }).click();
  await page.locator("#manual-account").fill("Primary brokerage");
  await page.locator("#manual-time-zone").fill("UTC");
  await reviewManualExecution(page, {
    side: "Buy",
    effect: "Open",
    quantity: "1",
    price: "100",
    executedAt: "2026-07-09T14:30",
  });
  const privateDetail = "/private/journals/kevin.db injected acknowledgement failure";
  await page.evaluate((detail) => {
    const root = document.documentElement;
    root.dataset.manualCommitMapReads = "0";
    const getDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, "get");
    const originalGet = getDescriptor?.value as (
      (this: Map<unknown, unknown>, key: unknown) => unknown
    ) | undefined;
    const setDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, "set");
    const originalSet = setDescriptor?.value as (
      (this: Map<unknown, unknown>, key: unknown, value: unknown) => Map<unknown, unknown>
    ) | undefined;
    if (
      getDescriptor === undefined
      || originalGet === undefined
      || setDescriptor === undefined
      || originalSet === undefined
    ) throw new Error("Map instrumentation is unavailable.");
    Object.defineProperty(Map.prototype, "get", {
      ...getDescriptor,
      value(this: Map<unknown, unknown>, key: unknown) {
        if ((new Error().stack ?? "").includes("commitManualExecution")) {
          root.dataset.manualCommitMapReads = String(
            Number(root.dataset.manualCommitMapReads ?? "0") + 1,
          );
        }
        return originalGet.call(this, key);
      },
    });
    let failed = false;
    Object.defineProperty(Map.prototype, "set", {
      ...setDescriptor,
      value(this: Map<unknown, unknown>, key: unknown, value: unknown) {
        if (!failed && (new Error().stack ?? "").includes("acknowledgeManualExecution")) {
          failed = true;
          throw new Error(detail);
        }
        return originalSet.call(this, key, value);
      },
    });
  }, privateDetail);
  const messages: string[] = [];
  page.on("dialog", async (dialog) => {
    messages.push(dialog.message());
    await dialog.accept();
  });

  await page.getByRole("button", { name: "Save execution" }).click();
  await expect(page.locator("#manual-capture-review-title")).toBeFocused();
  await expect.poll(() => messages.length).toBe(1);
  expect(messages[0]).toBe(
    "The execution is visible, but its save confirmation remains pending. Hermes will retry recovery after restart.",
  );
  expect(messages[0]).not.toContain(privateDetail);

  await page.evaluate(() => {
    document.documentElement.dataset.manualCommitMapReads = "0";
  });
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Replay welcome" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Start my journal" }).click();

  const continuation = page.locator("[data-manual-capture-review-continuation]");
  await expect(page.locator("#manual-capture-review-title")).toBeFocused();
  await expect(continuation).toContainText(
    "This execution was already saved; no duplicate was created.",
  );
  await expect(page.locator("#route-announcer")).toContainText(
    "already saved and awaiting confirmation",
  );
  expect(await page.evaluate(() => (
    document.documentElement.dataset.manualCommitMapReads
  ))).toBe("0");
});

test("manual guidance preserves only its own review origin and clears on view filters", async ({ page }) => {
  await startEmptyJournal(page);
  await page.getByRole("button", { name: "Enter execution" }).click();
  await page.locator("#manual-account").fill("Primary brokerage");
  await page.locator("#manual-time-zone").fill("UTC");
  await reviewManualExecution(page, {
    side: "Buy",
    effect: "Open",
    symbol: "AAPL",
    price: "100",
    executedAt: "2026-07-09T14:30",
  });
  await page.getByRole("button", { name: "Save execution" }).click();

  await page.getByRole("button", { name: "Add execution" }).click();
  await reviewManualExecution(page, {
    side: "Buy",
    effect: "Open",
    symbol: "MSFT",
    price: "200",
    executedAt: "2026-07-09T15:30",
  });
  await page.getByRole("button", { name: "Save execution" }).click();

  const continuation = page.locator("[data-manual-capture-review-continuation]");
  await expect(continuation).toContainText("MSFT");
  const aaplCard = page.locator(".trade-card").filter({
    has: page.getByRole("heading", { name: "AAPL", exact: true }),
  });
  await aaplCard.getByRole("button", {
    name: /^Review trade for AAPL Stock, Primary brokerage,/,
  }).click();
  const reviewDialog = page.getByRole("dialog", { name: /^AAPL trade review/ });
  await reviewDialog.locator("#review-note").fill("Ordinary card review origin.");
  await reviewDialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(reviewDialog).toHaveCount(0);
  await expect(continuation).toHaveCount(1);
  await expect(page.locator("#screen")).toBeFocused();
  await expect(page.locator("#manual-capture-review-title")).not.toBeFocused();

  const search = page.getByRole("searchbox", { name: "Search scoped trades" });
  await search.fill("MSFT");
  await expect(continuation).toHaveCount(0);
  await expect(search).toHaveValue("MSFT");
  await expect(page.locator("#trade-count")).toContainText("Showing 1");

  await page.getByRole("button", { name: "Add execution" }).click();
  await reviewManualExecution(page, {
    side: "Buy",
    effect: "Open",
    symbol: "NVDA",
    price: "300",
    executedAt: "2026-07-09T16:30",
  });
  await page.getByRole("button", { name: "Save execution" }).click();
  await expect(continuation).toContainText("NVDA");
  await expect(search).toHaveValue("");

  await page.locator("#trade-view-filter-summary").click();
  const direction = page.locator("#trade-filter-direction");
  await direction.selectOption("short");
  await expect(continuation).toHaveCount(0);
  await expect(direction).toHaveValue("short");
  await expect(page.locator("#trade-count")).toContainText("Showing 0");
});

test("manual save blocks every dismissal path while the ledger transaction is pending", async ({ page }) => {
  await startEmptyJournal(page);
  await page.getByRole("button", { name: "Enter execution" }).click();
  await page.locator("#manual-account").fill("Primary brokerage");
  await reviewManualExecution(page, {
    side: "Sell",
    effect: "Close",
    price: "110",
    executedAt: "2026-07-09T15:30",
  });

  const pendingState = await page.locator("#manual-save").evaluate((element) => {
    const button = element as HTMLButtonElement;
    button.click();
    const backdrop = document.querySelector<HTMLElement>("#manual-entry");
    const sheet = document.querySelector<HTMLElement>(".manual-entry-sheet");
    backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    sheet?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return {
      connected: backdrop?.isConnected ?? false,
      busy: sheet?.getAttribute("aria-busy"),
      closeDisabled: Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-manual-close]"),
      ).every((candidate) => candidate.disabled),
    };
  });
  expect(pendingState).toEqual({ connected: true, busy: "true", closeDisabled: true });
  await expect(page.getByRole("dialog", { name: "Add execution" })).toBeVisible();
  await expect(page.locator("#manual-save-error")).toContainText(
    "CLOSE execution cannot act on a flat position",
  );
  await expect(page.locator(".manual-entry-sheet")).toHaveAttribute("aria-busy", "false");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add execution" })).toHaveCount(0);
});

test("manual entry validates before review and Escape restores focus without writing", async ({ page }) => {
  await startEmptyJournal(page);
  const trigger = page.getByRole("button", { name: "Enter execution" });
  await trigger.click();
  await fillInvalidManualExecution(page);
  const storageBefore = await localStorageSnapshot(page);
  await page.getByRole("button", { name: "Review execution" }).click();
  const error = page.locator("#manual-entry-error");
  await expect(error).toContainText("signs and exponents are not supported");
  await expect(error).toHaveAttribute("tabindex", "-1");
  await expect(error).toBeFocused();
  await expect(page.locator("#manual-entry-form")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save execution" })).toBeHidden();
  expect(await localStorageSnapshot(page)).toEqual(storageBefore);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add execution" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("heading", { name: "Build your journal" })).toBeVisible();
});

test("manual preparation feedback owns visible in-sheet focus at 200% text", async ({ page }) => {
  for (const width of [320, 421]) {
    await page.setViewportSize({ width, height: 568 });
    await startEmptyJournal(page);
    await page.evaluate(() => {
      document.documentElement.dataset.testTextScale = "200";
    });
    const trigger = page.getByRole("button", { name: "Enter execution" });
    await trigger.click();
    await fillInvalidManualExecution(page);
    const authoredValues = await page.locator("#manual-entry-form").evaluate((form) => (
      Object.fromEntries(Array.from(
        form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"),
        (control) => [control.id, control.value],
      ))
    ));
    const storageBefore = await localStorageSnapshot(page);
    const scrollBefore = await page.evaluate(() => ({
      window: window.scrollY,
      backdrop: document.querySelector<HTMLElement>("#manual-entry")?.scrollTop ?? -1,
    }));
    const requests: string[] = [];
    const recordRequest = (request: Request) => requests.push(request.url());
    page.on("request", recordRequest);

    await page.getByRole("button", { name: "Review execution" }).click();
    const error = page.locator("#manual-entry-error");
    await expect(error).toHaveAttribute("role", "alert");
    await expect(error).toHaveAttribute("tabindex", "-1");
    await expect(error).toContainText("signs and exponents are not supported");
    await expect(error).toBeFocused();
    await expect(page.locator("#manual-entry-form")).toBeVisible();
    await expect(page.locator("#manual-entry-review")).toBeHidden();
    await expect(page.getByRole("button", { name: "Save execution" })).toBeHidden();
    await expect(page.locator("#screen")).toHaveAttribute("inert", "");

    const geometry = await error.evaluate((element) => {
      const sheet = element.closest<HTMLElement>(".manual-entry-sheet");
      const backdrop = element.closest<HTMLElement>("#manual-entry");
      if (sheet === null || backdrop === null) {
        throw new Error("The manual-entry modal structure is missing.");
      }
      const errorBounds = element.getBoundingClientRect();
      const sheetBounds = sheet.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        error: {
          top: errorBounds.top,
          right: errorBounds.right,
          bottom: errorBounds.bottom,
          left: errorBounds.left,
        },
        sheet: {
          top: sheetBounds.top,
          right: sheetBounds.right,
          bottom: sheetBounds.bottom,
          left: sheetBounds.left,
        },
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        sheetOverflow: sheet.scrollWidth - sheet.clientWidth,
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        windowScrollY: window.scrollY,
        backdropScrollTop: backdrop.scrollTop,
      };
    });
    expect(geometry.error.top, `${width}px error top`)
      .toBeGreaterThanOrEqual(geometry.sheet.top + 8);
    expect(geometry.error.bottom, `${width}px error bottom`)
      .toBeLessThanOrEqual(geometry.sheet.bottom - 8);
    expect(geometry.error.left, `${width}px error left`)
      .toBeGreaterThanOrEqual(geometry.sheet.left + 8);
    expect(geometry.error.right, `${width}px error right`)
      .toBeLessThanOrEqual(geometry.sheet.right - 8);
    expect(geometry.outlineStyle).toBe("solid");
    expect(geometry.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(geometry.sheetOverflow).toBeLessThanOrEqual(1);
    expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
    expect(geometry.windowScrollY).toBe(scrollBefore.window);
    expect(geometry.backdropScrollTop).toBe(scrollBefore.backdrop);
    expect(await page.locator("#manual-entry-form").evaluate((form) => (
      Object.fromEntries(Array.from(
        form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"),
        (control) => [control.id, control.value],
      ))
    ))).toEqual(authoredValues);

    await page.keyboard.press("Tab");
    const cancel = page.getByRole("button", { name: "Cancel" });
    await expect(cancel).toBeFocused();
    await expectControlWithinSheet(cancel);
    await error.focus();
    await page.keyboard.press("Shift+Tab");
    const currency = page.locator("#manual-currency");
    await expect(currency).toBeFocused();
    await expectControlWithinSheet(currency);

    await page.locator("#manual-price").fill("100");
    await page.getByRole("button", { name: "Review execution" }).click();
    await expect(error).toBeHidden();
    await expect(page.getByRole("heading", { name: "Review before saving" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save execution" })).toBeFocused();
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    page.off("request", recordRequest);
    expect(requests).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Add execution" })).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
  }
});

test("manual entry binds an explicit fold offset to the selected IANA zone", async ({ page }) => {
  await startEmptyJournal(page);
  await page.getByRole("button", { name: "Enter execution" }).click();
  await page.locator("#manual-account").fill("Primary brokerage");
  await page.locator("#manual-symbol").fill("AAPL");
  await page.locator("#manual-quantity").fill("1");
  await page.locator("#manual-price").fill("100");
  await page.locator("#manual-time-zone").fill("America/New_York");
  await page.locator("#manual-executed-at").fill("2026-11-01T01:30");
  await page.locator("#manual-utc-offset").fill("-04:00");
  await page.getByRole("button", { name: "Review execution" }).click();

  await expect(page.getByText("2026-11-01T05:30:00Z", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await page.locator("#manual-utc-offset").fill("+14:00");
  await page.getByRole("button", { name: "Review execution" }).click();
  await expect(page.locator("#manual-entry-error")).toContainText(
    "does not match America/New_York",
  );
});
