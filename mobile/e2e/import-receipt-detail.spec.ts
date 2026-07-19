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
  await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
}

async function expectWithinUnobscuredChrome(
  locator: ReturnType<Page["locator"]>,
): Promise<void> {
  const geometry = await locator.evaluate((element) => {
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
      top: bounds.top,
      bottom: bounds.bottom,
      topBoundary: fixedBoundary(document.querySelector(".topbar"), "top") ?? 0,
      bottomBoundary: fixedBoundary(document.querySelector(".tabbar"), "bottom")
        ?? window.innerHeight,
    };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.topBoundary + 8);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.bottomBoundary - 8);
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
  const storageAfterImport = await page.evaluate(() => JSON.stringify(window.localStorage));
  expect(storageAfterImport).toBe(storageBefore);

  const reviewReceipt = receipt.getByRole("button", { name: /^Review trades linked to second\.csv/ });
  const supersededState = await reviewReceipt.evaluate((element) => {
    const button = element as HTMLButtonElement;
    button.click();
    document.querySelector<HTMLButtonElement>("#settings-open")?.click();
    return {
      disabled: button.disabled,
      rollbackDisabled: button.closest<HTMLElement>("[data-import-receipt]")
        ?.querySelector<HTMLButtonElement>("button[data-rollback-receipt]")?.disabled ?? false,
      settingsHidden: document.querySelector<HTMLElement>("#settings")?.hidden ?? true,
    };
  });
  expect(supersededState).toEqual({
    disabled: true,
    rollbackDisabled: true,
    settingsHidden: false,
  });
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(reviewReceipt).toBeEnabled();
  await expect(receipt.locator("button[data-rollback-receipt]")).toBeEnabled();
  await expect(page.locator("[data-import-receipt-review-continuation]")).toHaveCount(0);

  const privateContinuationDetail =
    "/private/journals/kevin.db injected receipt continuation destination failure";
  await page.evaluate((detail) => {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    const getter = descriptor?.get;
    const setter = descriptor?.set;
    if (descriptor === undefined || getter === undefined || setter === undefined) {
      throw new Error("Element.innerHTML is not instrumentable.");
    }
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: getter,
      set(this: Element, value: string) {
        if (this.id === "screen") {
          Object.defineProperty(Element.prototype, "innerHTML", descriptor);
          throw new Error(detail);
        }
        setter.call(this, value);
      },
    });
  }, privateContinuationDetail);
  await reviewReceipt.click();
  const continuationFailure = page.locator("[data-import-receipt-review-failure]");
  const continuationFailureHeading = page.locator(
    "#import-receipt-review-failure-title",
  );
  await expect(continuationFailure).toContainText(
    "Review for second.csv needs attention",
  );
  await expect(continuationFailure).toContainText("Imported ");
  await expect(continuationFailure).toContainText("Primary brokerage");
  await expect(continuationFailure).not.toContainText("Import saved");
  await expect(continuationFailure).not.toContainText("Do not import");
  await expect(page.locator("#csv-import-form")).toHaveCount(1);
  await expect(continuationFailure).not.toContainText(privateContinuationDetail);
  await expect(continuationFailureHeading).toBeFocused();
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(continuationFailureHeading).toBeFocused();
  await continuationFailure.getByRole("button", {
    name: /^Retry review continuation for second\.csv/,
  }).click();
  const guide = page.locator("[data-import-receipt-review-continuation]");
  const guideTitle = page.locator("#import-receipt-review-title");
  await expect(guide).toHaveCount(1);
  await expect(guideTitle).toBeFocused();
  await expect(guide).toContainText(
    "2 accepted rows = 1 new or restored execution version + 1 already-present row.",
  );
  await expect(guide).toContainText(
    "Those exact accepted occurrences resolve to 2 stable executions and 2 current trades",
  );
  await expect(guide.locator("[data-import-receipt-review-trade]")).toHaveCount(2);
  await expect(page.getByRole("dialog", { name: /trade review/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "More", exact: true }))
    .toHaveAttribute("aria-current", "page");

  const aaplReview = guide.getByRole("button", {
    name: /^Review trade · 1 of 2 for AAPL Stock, Primary brokerage,/,
  });
  await aaplReview.click();
  const reviewDialog = page.getByRole("dialog", { name: /^AAPL trade review/ });
  await expect(reviewDialog).toBeVisible();
  await reviewDialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(aaplReview).toBeFocused();

  await aaplReview.click();
  await reviewDialog.locator("#review-note").fill("Opened from the exact CSV receipt.");
  await reviewDialog.getByRole("button", { name: "Save draft", exact: true }).click();
  const continuedAaplReview = guide.getByRole("button", {
    name: /^Continue draft · 1 of 2 for AAPL Stock, Primary brokerage,/,
  });
  await expect(continuedAaplReview).toBeFocused();
  await expect(continuedAaplReview).toHaveText("Continue draft · 1 of 2");
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).toBe(storageAfterImport);
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

  const rollback = receipt.getByRole("button", {
    name: /^Roll back second\.csv from Primary brokerage,/,
  });
  await rollback.focus();
  const rollbackStart = await rollback.evaluate((element) => {
    const originalConfirm = window.confirm;
    let prompt = "";
    window.confirm = (message) => {
      prompt = message ?? "";
      return true;
    };
    try {
      (element as HTMLButtonElement).click();
      const row = element.closest<HTMLElement>("[data-import-receipt]");
      return {
        prompt,
        reviewDisabled: row
          ?.querySelector<HTMLButtonElement>("button[data-review-import-receipt]")?.disabled ?? false,
        rollbackDisabled: (element as HTMLButtonElement).disabled,
      };
    } finally {
      window.confirm = originalConfirm;
    }
  });
  expect(rollbackStart.reviewDisabled).toBe(true);
  expect(rollbackStart.rollbackDisabled).toBe(true);
  expect(rollbackStart.prompt).toContain(
    "Roll back the import from second.csv in Primary brokerage (Imported ",
  );
  await expect(page.locator("#route-announcer")).toHaveText(
    "Import rolled back. Its immutable receipt remains in history.",
  );
  await expect(receipt).toContainText("ROLLED BACK");
  await expect(receipt).toContainText("The immutable receipt remains in history.");
  await expect(receipt.getByRole("button", { name: /Review trades linked/ })).toHaveCount(0);
  await expect(receipt.locator("button[data-rollback-receipt]")).toHaveCount(0);
  await expect(guide).toHaveCount(0);
  const rebuiltHeading = receipt.locator("[data-import-receipt-heading]");
  await expect(rebuiltHeading).toBeFocused();
  await expect(rebuiltHeading).toBeInViewport();
  const focusedGeometry = await rebuiltHeading.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    bottom: element.getBoundingClientRect().bottom,
    topbarBottom: document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0,
    tabbarTop: document.querySelector(".tabbar")?.getBoundingClientRect().top
      ?? window.innerHeight,
    viewportHeight: window.innerHeight,
    animationName: window.getComputedStyle(
      element.closest<HTMLElement>(".screen-stack")!,
    ).animationName,
  }));
  expect(focusedGeometry.top).toBeGreaterThanOrEqual(focusedGeometry.topbarBottom - 1);
  expect(focusedGeometry.bottom).toBeLessThanOrEqual(
    Math.min(focusedGeometry.tabbarTop, focusedGeometry.viewportHeight) + 1,
  );
  expect(focusedGeometry.animationName).toBe("none");
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
  await expect(receipt.getByRole("button", { name: /Review trades linked/ })).toHaveCount(0);
  await expect(receipt.locator("button[data-rollback-receipt]")).toHaveCount(0);
});

test("large receipt guidance stays bounded, paginates exactly, and rejects a tampered target", async ({ page }) => {
  await page.setViewportSize({ width: 421, height: 720 });
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
  const rows = Array.from({ length: 12 }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return `receipt-${number},S${number},BTO,1,${100 + index},0,USD,2026-07-10T${String(10 + index).padStart(2, "0")}:00:00Z`;
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await chooseCsv(page, "large.csv", rows);
  await previewAndImport(page, 12);
  const storageAfterImport = await page.evaluate(() => JSON.stringify(window.localStorage));

  const receipt = page.locator(".import-history-row").filter({ hasText: "large.csv" });
  await receipt.locator("summary").click();
  await receipt.getByRole("button", { name: /^Review trades linked to large\.csv/ }).click();

  const guide = page.locator("[data-import-receipt-review-continuation]");
  const linkedRows = guide.locator("[data-import-receipt-review-trade]");
  const showNext = guide.getByRole("button", { name: "Show next 2 linked trades" });
  await expect(guide).toContainText("Showing 1–10 of 12 linked trades");
  await expect(linkedRows).toHaveCount(10);
  await expect(showNext).toBeVisible();
  const firstPageGeometry = await guide.evaluate((element) => ({
    cardOverflow: element.scrollWidth - element.clientWidth,
    documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(firstPageGeometry.cardOverflow).toBeLessThanOrEqual(1);
  expect(firstPageGeometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(await showNext.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThanOrEqual(44);

  await showNext.click();
  await expect(linkedRows).toHaveCount(2);
  await expect(guide).toContainText("Showing 11–12 of 12 linked trades");
  await expect(showNext).toHaveCount(0);
  await expect(guide.getByRole("button", {
    name: "Show previous 10 linked trades",
  })).toBeVisible();
  const eleventhHeading = linkedRows.nth(0).getByRole("heading");
  await expect(eleventhHeading).toBeFocused();
  await expectWithinUnobscuredChrome(eleventhHeading);
  expect(await eleventhHeading.evaluate((element) => ({
    style: window.getComputedStyle(element).outlineStyle,
    width: window.getComputedStyle(element).outlineWidth,
  }))).toEqual({ style: "solid", width: "2px" });
  const secondPageSymbol = (await eleventhHeading.textContent())?.trim();
  expect(secondPageSymbol).toMatch(/^S[0-9]{2}$/);

  const secondPageReview = linkedRows.first().locator("button[data-review-trade]");
  await expect(secondPageReview).toContainText("Review trade · 11 of 12");
  await secondPageReview.click();
  const secondPageDialog = page.getByRole("dialog", { name: / trade review/ });
  await expect(secondPageDialog).toHaveAccessibleName(
    new RegExp(`^${secondPageSymbol} trade review`),
  );
  await secondPageDialog.locator("#review-note").fill(
    "Second receipt page keeps exact position.",
  );
  await secondPageDialog.getByRole("button", { name: "Save draft" }).click();
  const continuedSecondPageReview = linkedRows.first().locator(
    "button[data-review-trade]",
  );
  await expect(linkedRows).toHaveCount(2);
  await expect(guide).toContainText("Showing 11–12 of 12 linked trades");
  await expect(continuedSecondPageReview).toContainText("Continue draft · 11 of 12");
  await expect(continuedSecondPageReview).toBeFocused();

  await guide.getByRole("button", {
    name: "Show previous 10 linked trades",
  }).click();
  await expect(linkedRows).toHaveCount(10);
  await expect(guide).toContainText("Showing 1–10 of 12 linked trades");
  await expect(linkedRows.first().getByRole("heading")).toBeFocused();
  await guide.getByRole("button", { name: "Show next 2 linked trades" }).click();
  await expect(linkedRows).toHaveCount(2);
  await expect(linkedRows.first().getByRole("heading")).toBeFocused();

  const lastAction = linkedRows.nth(1).locator("button[data-review-trade]");
  await lastAction.evaluate((element) => {
    element.setAttribute("data-review-trade", "tampered-subject");
  });
  await lastAction.click();
  await expect(page.getByRole("dialog", { name: /trade review/ })).toHaveCount(0);
  const error = guide.locator("[data-import-receipt-review-open-error]");
  await expect(error).toContainText("could not open that exact receipt-linked trade");
  await expect(error).toBeFocused();
  await expectWithinUnobscuredChrome(error);

  await page.locator("#import-account").fill("Primary brokerage");
  await chooseCsv(page, "large-again.csv", rows);
  await expect(guide).toHaveCount(0);
  await expect(page.locator("#import-status")).toHaveText(
    "large-again.csv selected. Preview it before import.",
  );
  expect(await page.locator("#import-file").evaluate((input) => (
    (input as HTMLInputElement).files?.[0]?.name
  ))).toBe("large-again.csv");
  await previewAndImport(page, 12);
  await expect(page.locator("#route-announcer")).toHaveText(
    "12 accepted rows = 0 new or restored execution versions + 12 already-present rows; reversible receipt created.",
  );
  const repeatedReceipt = page.locator(".import-history-row").filter({
    hasText: "large-again.csv",
  });
  await expect(page.locator(".import-history-row")).toHaveCount(2);
  await expect(repeatedReceipt.locator("[data-import-receipt-heading]")).toBeFocused();
  await repeatedReceipt.locator("summary").click();
  await repeatedReceipt.getByRole("button", {
    name: /^Review trades linked to large-again\.csv/,
  }).click();
  await expect(guide).toContainText(
    "12 accepted rows = 0 new or restored execution versions + 12 already-present rows.",
  );
  await expect(guide).toContainText(
    "Those exact accepted occurrences resolve to 12 stable executions and 12 current trades",
  );
  await guide.getByRole("button", { name: "Dismiss receipt guide" }).click();

  await page.locator("#import-account").fill("Primary brokerage");
  await chooseCsv(page, "large-again.csv", rows);
  await previewAndImport(page, 12);
  await expect(page.locator("#route-announcer")).toHaveText(
    "This exact CSV was already imported; its existing receipt records 12 accepted rows = 0 new or restored execution versions + 12 already-present rows. No records were duplicated.",
  );
  await expect(page.locator(".import-history-row")).toHaveCount(2);
  await expect(repeatedReceipt.locator("[data-import-receipt-heading]")).toBeFocused();
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).toBe(storageAfterImport);
  expect(externalRequests).toEqual([]);
});

test("a proven CSV commit retries only its receipt refresh", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
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
  await chooseCsv(page, "refresh-only.csv", [
    "refresh-only,AAPL,BTO,1,100,0,USD,2026-07-11T14:30:00Z",
  ]);
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(page.getByRole("heading", { name: "Ready to import" })).toBeVisible();
  const storageBeforeCommit = await page.evaluate(() => JSON.stringify(window.localStorage));
  const privateDetail = "/private/journals/kevin.db injected CSV refresh failure";

  await page.evaluate((detail) => {
    const root = document.documentElement;
    root.dataset.csvCommitMapReads = "0";
    root.dataset.csvFileReadsAfterPreview = "0";

    const mapDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, "get");
    const originalMapGet = mapDescriptor?.value as (
      (this: Map<unknown, unknown>, key: unknown) => unknown
    ) | undefined;
    if (mapDescriptor === undefined || originalMapGet === undefined) {
      throw new Error("Map.prototype.get is not instrumentable.");
    }
    Object.defineProperty(Map.prototype, "get", {
      ...mapDescriptor,
      value(this: Map<unknown, unknown>, key: unknown) {
        if ((new Error().stack ?? "").includes("commitCsvImport")) {
          root.dataset.csvCommitMapReads = String(
            Number(root.dataset.csvCommitMapReads ?? "0") + 1,
          );
        }
        return originalMapGet.call(this, key);
      },
    });

    const textDescriptor = Object.getOwnPropertyDescriptor(Blob.prototype, "text");
    const originalText = textDescriptor?.value as (
      (this: Blob) => Promise<string>
    ) | undefined;
    if (textDescriptor === undefined || originalText === undefined) {
      throw new Error("Blob.prototype.text is not instrumentable.");
    }
    Object.defineProperty(Blob.prototype, "text", {
      ...textDescriptor,
      value(this: Blob) {
        root.dataset.csvFileReadsAfterPreview = String(
          Number(root.dataset.csvFileReadsAfterPreview ?? "0") + 1,
        );
        return originalText.call(this);
      },
    });

    const formatDescriptor = Object.getOwnPropertyDescriptor(
      Intl.DateTimeFormat.prototype,
      "formatToParts",
    );
    const originalFormatToParts = formatDescriptor?.value as (
      (this: Intl.DateTimeFormat, date?: Date | number) => Intl.DateTimeFormatPart[]
    ) | undefined;
    if (formatDescriptor === undefined || originalFormatToParts === undefined) {
      throw new Error("Intl.DateTimeFormat.prototype.formatToParts is not instrumentable.");
    }
    Object.defineProperty(Intl.DateTimeFormat.prototype, "formatToParts", {
      ...formatDescriptor,
      value(this: Intl.DateTimeFormat) {
        Object.defineProperty(
          Intl.DateTimeFormat.prototype,
          "formatToParts",
          formatDescriptor,
        );
        throw new Error(detail);
      },
    });
  }, privateDetail);

  await page.getByRole("button", { name: "Import 1 execution" }).click();
  const recovery = page.locator("[data-import-receipt-review-failure]");
  const recoveryHeading = recovery.getByRole("heading", {
    name: "Import saved; review for refresh-only.csv needs attention",
  });
  await expect(recovery).toContainText("Do not import refresh-only.csv again.");
  await expect(recovery).toContainText("Primary brokerage");
  await expect(recovery).not.toContainText(privateDetail);
  await expect(recoveryHeading).toBeFocused();
  await expectWithinUnobscuredChrome(recoveryHeading);
  await expect(page.locator("#csv-import-form")).toHaveCount(0);
  await expect(page.locator("#commit-import")).toHaveCount(0);
  await expect(page.locator(".import-history-row")).toHaveCount(0);
  await expect(recovery.locator("[data-import-receipt-review-failure-dismiss]")).toHaveCount(0);
  expect(Number(await page.evaluate(() => (
    document.documentElement.dataset.csvCommitMapReads
  )))).toBeGreaterThan(0);
  expect(await page.evaluate(() => (
    document.documentElement.dataset.csvFileReadsAfterPreview
  ))).toBe("0");

  await page.evaluate(() => {
    document.documentElement.dataset.csvCommitMapReads = "0";
  });
  const secondPrivateDetail =
    "/private/journals/kevin.db injected repeated receipt destination failure";
  await page.evaluate((detail) => {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    const getter = descriptor?.get;
    const setter = descriptor?.set;
    if (descriptor === undefined || getter === undefined || setter === undefined) {
      throw new Error("Element.innerHTML is not instrumentable.");
    }
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: getter,
      set(this: Element, value: string) {
        if (this.id === "screen") {
          Object.defineProperty(Element.prototype, "innerHTML", descriptor);
          throw new Error(detail);
        }
        setter.call(this, value);
      },
    });
  }, secondPrivateDetail);
  await recovery.getByRole("button", {
    name: /^Retry review continuation for refresh-only\.csv/,
  }).click();
  await expect(recovery).toHaveCount(1);
  await expect(recovery).not.toContainText(secondPrivateDetail);
  await expect(recoveryHeading).toBeFocused();
  await expect(page.locator(".import-history-row")).toHaveCount(0);
  await expect(page.locator("[data-review-import-receipt]")).toHaveCount(0);
  await expect(page.locator("[data-rollback-receipt]")).toHaveCount(0);
  await expect(page.locator("#user-data-restore-form")).toHaveCount(0);
  expect(await page.evaluate(() => (
    document.documentElement.dataset.csvCommitMapReads
  ))).toBe("0");
  expect(await page.evaluate(() => (
    document.documentElement.dataset.csvFileReadsAfterPreview
  ))).toBe("0");

  await recovery.getByRole("button", {
    name: /^Retry review continuation for refresh-only\.csv/,
  }).click();
  await expect(recovery).toHaveCount(0);
  const receipt = page.locator(".import-history-row").filter({ hasText: "refresh-only.csv" });
  await expect(receipt).toHaveCount(1);
  const guide = page.locator("[data-import-receipt-review-continuation]");
  await expect(guide).toContainText("1 accepted row");
  await expect(guide.getByRole("heading", {
    name: "Review trades linked to refresh-only.csv",
  })).toBeFocused();
  expect(await page.evaluate(() => (
    document.documentElement.dataset.csvCommitMapReads
  ))).toBe("0");
  expect(await page.evaluate(() => (
    document.documentElement.dataset.csvFileReadsAfterPreview
  ))).toBe("0");
  expect(await page.evaluate(() => JSON.stringify(window.localStorage))).toBe(storageBeforeCommit);
  expect(externalRequests).toEqual([]);
});
