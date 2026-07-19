import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import {
  parseJournalArchive,
  type JournalArchive,
} from "../src/application/journal-archive";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

interface StorageSnapshot {
  readonly local: readonly (readonly [string, string])[];
  readonly session: readonly (readonly [string, string])[];
}

function logExternalRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:")
      && url.origin !== BASE_ORIGIN
    ) requests.push(request.url());
  });
  return requests;
}

async function storageSnapshot(page: Page): Promise<StorageSnapshot> {
  return page.evaluate(() => {
    const entries = (storage: Storage): readonly (readonly [string, string])[] => (
      Array.from({ length: storage.length }, (_, index) => storage.key(index))
        .map((key) => key === null ? null : [key, storage.getItem(key) ?? ""] as const)
        .filter((entry): entry is readonly [string, string] => entry !== null)
        .sort(([left], [right]) => left.localeCompare(right))
    );
    return { local: entries(localStorage), session: entries(sessionStorage) };
  });
}

async function exportJournal(page: Page): Promise<JournalArchive> {
  await page.getByRole("button", { name: "More", exact: true }).click();
  const action = page.locator("#user-data-export");
  await action.click();
  await expect(action).toHaveText("Share or save export");
  const downloadPromise = page.waitForEvent("download");
  await action.click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("The review-clear export has no local path.");
  return parseJournalArchive(await readFile(path, "utf8"));
}

async function expectUnobscuredAtCurrentSize(
  page: Page,
  selector: string,
  requireControlSize = false,
): Promise<void> {
  const geometry = await page.locator(selector).evaluate((element) => {
    const boundary = (
      candidate: HTMLElement | null,
      edge: "top" | "bottom",
    ): number | null => {
      if (candidate === null) return null;
      const style = window.getComputedStyle(candidate);
      if (style.position !== "fixed" && style.position !== "sticky") return null;
      const bounds = candidate.getBoundingClientRect();
      return edge === "top" && bounds.bottom > 0
        ? bounds.bottom
        : edge === "bottom" && bounds.top < window.innerHeight
          ? bounds.top
          : null;
    };
    const bounds = element.getBoundingClientRect();
    const origin = element.closest<HTMLElement>(
      "[data-dashboard-review-progress], [data-review-clear-plan-check-origin]",
    );
    return {
      top: bounds.top,
      bottom: bounds.bottom,
      width: bounds.width,
      height: bounds.height,
      topBoundary: boundary(document.querySelector(".topbar"), "top") ?? 0,
      bottomBoundary: boundary(document.querySelector(".tabbar"), "bottom")
        ?? window.innerHeight,
      originOverflow: origin === null ? 0 : origin.scrollWidth - origin.clientWidth,
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      hit: document.elementsFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + bounds.height / 2,
      ).some((candidate) => candidate === element || element.contains(candidate)),
    };
  });
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.topBoundary - 1);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.bottomBoundary + 1);
  if (requireControlSize) {
    expect(geometry.width).toBeGreaterThanOrEqual(44);
    expect(geometry.height).toBeGreaterThanOrEqual(44);
  }
  expect(geometry.originOverflow).toBeLessThanOrEqual(1);
  expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
  expect(geometry.hit).toBe(true);
}

async function injectNextReceiptProjectionFailure(page: Page): Promise<void> {
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Intl.DateTimeFormat.prototype,
      "formatToParts",
    );
    const original = descriptor?.value as (
      (this: Intl.DateTimeFormat, date?: Date | number) => Intl.DateTimeFormatPart[]
    ) | undefined;
    if (descriptor === undefined || original === undefined) {
      throw new Error("Intl.DateTimeFormat.prototype.formatToParts is not instrumentable.");
    }
    Object.defineProperty(Intl.DateTimeFormat.prototype, "formatToParts", {
      ...descriptor,
      value(this: Intl.DateTimeFormat) {
        Object.defineProperty(Intl.DateTimeFormat.prototype, "formatToParts", descriptor);
        throw new Error("Injected post-commit receipt projection failure.");
      },
    });
  });
}

async function injectNextScreenProjectionFailure(page: Page): Promise<void> {
  await page.evaluate(() => {
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
          throw new Error("Injected post-commit manual projection failure.");
        }
        setter.call(this, value);
      },
    });
  });
}

async function openEmptyJournal(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Build your journal" })).toBeVisible();
}

async function importOneClosedTrade(page: Page): Promise<void> {
  await openEmptyJournal(page);
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "aapl-in,AAPL,BTO,1,100,0,USD,2026-07-09T14:30:00Z",
    "aapl-out,AAPL,STC,1,110,0,USD,2026-07-09T15:00:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "review-clear-plan-check.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 2 executions" }).click();
  await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
}

async function importOneOpenTrade(page: Page): Promise<void> {
  await openEmptyJournal(page);
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "open-only,SOFI,BTO,1,25,0,USD,2026-07-09T14:30:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "review-clear-open-only.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 1 execution" }).click();
  await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
}

async function clearDashboardReviewQueue(page: Page): Promise<void> {
  await importOneClosedTrade(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const action = page.locator(
    '[data-dashboard-review-progress] button[data-trade-review-origin="dashboard-review-progress"]',
  );
  await expect(action).toHaveAccessibleName(/Review next trade for AAPL Stock/u);
  await action.click();
  const dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await dialog.locator("#review-note").fill("Close the review loop before reading the evidence.");
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.locator("#dashboard-review-progress-title")).toBeFocused();
  await expect(page.locator("#dashboard-review-progress-title")).toHaveText("Review queue clear");
}

test("clear Dashboard and Journal queues explicitly continue into full-journal Plan Check", async ({ page, context }) => {
  const externalRequests = logExternalRequests(page);
  await clearDashboardReviewQueue(page);
  const storageAfterReview = await storageSnapshot(page);
  const archiveBefore = await exportJournal(page);
  await context.setOffline(true);
  const cases = [
    { width: 421, origin: "dashboard", activation: "pointer" },
    { width: 421, origin: "journal", activation: "enter" },
    { width: 320, origin: "dashboard", activation: "space" },
    { width: 320, origin: "journal", activation: "pointer" },
  ] as const;
  for (const scenario of cases) {
    await page.setViewportSize({ width: scenario.width, height: 568 });
    await page.evaluate(() => {
      document.documentElement.dataset.testTextScale = "200";
    });
    const tabName = scenario.origin === "dashboard" ? "Dashboard" : "Journal";
    await page.getByRole("button", { name: tabName, exact: true }).click();
    const actionSelector = `button[data-review-clear-plan-check="${scenario.origin}"]`;
    const action = page.locator(actionSelector);
    await expect(action).toHaveAccessibleName(
      "Open Plan Check for 1 completed reviewed trade",
    );
    await action.focus();
    await expect(action).toBeFocused();
    await expectUnobscuredAtCurrentSize(page, actionSelector, true);
    if (scenario.activation === "pointer") await action.click();
    else {
      await page.keyboard.press(scenario.activation === "enter" ? "Enter" : "Space");
    }

    const planCheck = page.locator("#plan-check-title");
    await expect(
      planCheck,
      `${scenario.origin} at ${scenario.width}px via ${scenario.activation}`,
    ).toBeFocused();
    await expectUnobscuredAtCurrentSize(page, "#plan-check-title");
    await expect(page.locator("[data-plan-check]")).toContainText("small cohort");
    await expect(page.locator("[data-plan-check]")).toContainText(
      "Hermes never asks you to trade more for a metric.",
    );
    await expect(page.locator("#route-announcer")).toHaveText(
      "Review queue complete. Plan Check opened with full-journal observational evidence.",
    );
  }

  const archiveAfter = await exportJournal(page);
  expect(archiveAfter.stateSha256).toBe(archiveBefore.stateSha256);
  expect(archiveAfter.reportSha256).toBe(archiveBefore.reportSha256);
  expect(archiveAfter.payload.data).toEqual(archiveBefore.payload.data);
  expect(await storageSnapshot(page)).toEqual(storageAfterReview);
  expect(externalRequests).toEqual([]);
});

test("waiting, empty, and fictional journals do not expose a review-clear insight action", async ({ page }) => {
  await openEmptyJournal(page);
  await expect(page.locator("[data-review-clear-plan-check]")).toHaveCount(0);
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.locator("[data-review-clear-plan-check]")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open review journal" })).toBeVisible();

  await importOneClosedTrade(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "1 review waiting" })).toBeVisible();
  await expect(page.locator("[data-review-clear-plan-check]")).toHaveCount(0);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.locator("[data-review-clear-plan-check]")).toHaveCount(0);

  const openOnlyPage = await page.context().newPage();
  try {
    await importOneOpenTrade(openOnlyPage);
    await openOnlyPage.getByRole("button", { name: "Dashboard", exact: true }).click();
    await expect(openOnlyPage.locator("[data-review-clear-plan-check]")).toHaveCount(0);
    await openOnlyPage.getByRole("button", { name: "Journal", exact: true }).click();
    await expect(openOnlyPage.locator("[data-review-clear-plan-check]")).toHaveCount(0);
  } finally {
    await openOnlyPage.close();
  }
});

test("a confirmed import commit recovery suppresses stale review-clear actions", async ({ page }) => {
  await clearDashboardReviewQueue(page);
  await page.getByRole("button", { name: "Import latest session" }).click();
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "saved-open,SOFI,BTO,1,25,0,USD,2026-07-10T14:30:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "saved-after-review-clear.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await injectNextReceiptProjectionFailure(page);
  await page.getByRole("button", { name: "Import 1 execution" }).click();
  await expect(page.locator("[data-import-receipt-review-failure]")).toBeVisible();

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("button", { name: "Finish saved import" })).toHaveCount(1);
  await expect(page.locator("[data-review-clear-plan-check]")).toHaveCount(0);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Journal", exact: true })).toBeVisible();
  await expect(page.locator("[data-review-clear-plan-check]")).toHaveCount(0);

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.getByRole("button", { name: "Finish saved import" }).click();
  await page.getByRole("button", {
    name: /^Retry review continuation for saved-after-review-clear\.csv/u,
  }).click();
  await expect(page.locator("[data-import-receipt-review-continuation]")).toBeVisible();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator('button[data-review-clear-plan-check="dashboard"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.locator('button[data-review-clear-plan-check="journal"]')).toHaveCount(1);
});

test("a confirmed manual commit recovery suppresses stale review-clear actions", async ({ page }) => {
  await clearDashboardReviewQueue(page);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await page.locator("button[data-manual-execution]").click();
  await page.locator("#manual-account").fill("Primary brokerage");
  await page.locator("#manual-symbol").fill("TSLA");
  await page.locator("#manual-side").selectOption({ label: "Buy" });
  await page.locator("#manual-position-effect").selectOption({ label: "Open" });
  await page.locator("#manual-quantity").fill("1");
  await page.locator("#manual-price").fill("200");
  await page.locator("#manual-fee").fill("0");
  await page.locator("#manual-executed-at").fill("2026-07-10T14:30");
  await page.getByRole("button", { name: "Review execution" }).click();
  await expect(page.getByRole("heading", { name: "Review before saving" })).toBeVisible();
  await injectNextScreenProjectionFailure(page);
  await page.getByRole("button", { name: "Save execution" }).click();
  await expect(page.locator("[data-manual-capture-review-failure]")).toBeVisible();

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator("[data-manual-capture-review-failure]")).toBeVisible();
  await expect(page.locator("[data-review-clear-plan-check]")).toHaveCount(0);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Journal", exact: true })).toBeVisible();
  await expect(page.locator("[data-review-clear-plan-check]")).toHaveCount(0);

  await page.getByRole("button", { name: "Retry review continuation" }).click();
  await expect(page.locator("[data-manual-capture-review-continuation]")).toBeVisible();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator('button[data-review-clear-plan-check="dashboard"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.locator('button[data-review-clear-plan-check="journal"]')).toHaveCount(1);
});

test("a manual recovery scan never exposes review-clear navigation before reconciliation", async ({ page }) => {
  await clearDashboardReviewQueue(page);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await page.locator("button[data-manual-execution]").click();
  await page.locator("#manual-account").fill("Primary brokerage");
  await page.locator("#manual-symbol").fill("NVDA");
  await page.locator("#manual-side").selectOption({ label: "Buy" });
  await page.locator("#manual-position-effect").selectOption({ label: "Open" });
  await page.locator("#manual-quantity").fill("1");
  await page.locator("#manual-price").fill("150");
  await page.locator("#manual-fee").fill("0");
  await page.locator("#manual-executed-at").fill("2026-07-10T15:30");
  await page.getByRole("button", { name: "Review execution" }).click();
  await injectNextScreenProjectionFailure(page);
  await page.getByRole("button", { name: "Save execution" }).click();
  await expect(page.locator("[data-manual-capture-review-failure]")).toBeVisible();

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Replay welcome" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.evaluate(() => {
    document.documentElement.dataset.reviewClearRecoveryLeak = "0";
    document.documentElement.dataset.reviewClearRecoveryResolved = "0";
    const screen = document.querySelector("#screen");
    if (screen === null) throw new Error("The recovery screen is unavailable.");
    const contains = (node: Node, selector: string): boolean => (
      node instanceof Element
      && (node.matches(selector) || node.querySelector(selector) !== null)
    );
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const added of record.addedNodes) {
          if (contains(added, "[data-review-clear-plan-check]")) {
            document.documentElement.dataset.reviewClearRecoveryLeak = "1";
          }
          if (contains(added, "[data-manual-capture-review-continuation]")) {
            document.documentElement.dataset.reviewClearRecoveryResolved = "1";
            observer.disconnect();
          }
        }
      }
    });
    observer.observe(screen, { childList: true, subtree: true });
  });
  await page.getByRole("button", { name: "Start my journal" }).click();

  await expect(page.locator("[data-manual-capture-review-continuation]")).toBeVisible();
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.dataset.reviewClearRecoveryResolved
  ))).toBe("1");
  expect(await page.evaluate(() => (
    document.documentElement.dataset.reviewClearRecoveryLeak
  ))).toBe("0");
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator('button[data-review-clear-plan-check="dashboard"]')).toHaveCount(1);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.locator('button[data-review-clear-plan-check="journal"]')).toHaveCount(1);
});

test("a no-result recovery scan stays closed through Dashboard and releases the current Journal", async ({ page }) => {
  await clearDashboardReviewQueue(page);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Replay welcome" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.evaluate(() => {
    document.documentElement.dataset.reviewClearNoResultLeak = "0";
    document.documentElement.dataset.reviewClearMidScanJournal = "0";
    document.documentElement.dataset.reviewClearMidScanJournalLeak = "0";
    const screen = document.querySelector("#screen");
    if (screen === null) throw new Error("The no-result recovery screen is unavailable.");
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        for (const added of record.addedNodes) {
          if (!(added instanceof Element)) continue;
          const dashboard = added.matches('[aria-labelledby="dashboard-title"]')
            ? added
            : added.querySelector('[aria-labelledby="dashboard-title"]');
          if (dashboard === null) continue;
          if (dashboard.querySelector("[data-review-clear-plan-check]") !== null) {
            document.documentElement.dataset.reviewClearNoResultLeak = "1";
          }
          document.querySelector<HTMLButtonElement>('button[data-tab="journal"]')?.click();
          const journal = screen.querySelector('[aria-labelledby="journal-title"]');
          if (journal !== null) {
            document.documentElement.dataset.reviewClearMidScanJournal = "1";
            if (journal.querySelector("[data-review-clear-plan-check]") !== null) {
              document.documentElement.dataset.reviewClearMidScanJournalLeak = "1";
            }
          }
        }
      }
    });
    observer.observe(screen, { childList: true, subtree: true });
  });
  await page.getByRole("button", { name: "Start my journal" }).click();

  await expect.poll(() => page.evaluate(() => (
    document.documentElement.dataset.reviewClearMidScanJournal
  ))).toBe("1");
  await expect(page.getByRole("heading", { name: "Journal", exact: true })).toBeVisible();
  await expect(page.locator('button[data-review-clear-plan-check="journal"]')).toHaveCount(1);
  expect(await page.evaluate(() => (
    document.documentElement.dataset.reviewClearNoResultLeak
  ))).toBe("0");
  expect(await page.evaluate(() => (
    document.documentElement.dataset.reviewClearMidScanJournalLeak
  ))).toBe("0");
});

test("a moved or duplicated review-clear origin fails visibly before navigation", async ({ page }) => {
  const externalRequests = logExternalRequests(page);
  await clearDashboardReviewQueue(page);
  const storageAfterReview = await storageSnapshot(page);
  const archiveBefore = await exportJournal(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  let action = page.locator('button[data-review-clear-plan-check="dashboard"]').first();
  await action.evaluate((element) => {
    const screen = document.querySelector("#screen");
    if (!(screen instanceof HTMLElement)) throw new Error("Dashboard screen is unavailable.");
    screen.append(element);
  });
  await action.click();
  let error = page.locator('[data-review-clear-plan-check-error="dashboard"]');
  await expect(error).toBeFocused();
  await expect(error).toContainText("could not open the exact Plan Check continuation");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.locator("#plan-check-title")).toHaveCount(0);

  action = page.locator('button[data-review-clear-plan-check="dashboard"]').first();
  await action.evaluate((element) => {
    element.insertAdjacentElement("afterend", element.cloneNode(true) as Element);
  });
  await action.click();
  error = page.locator('[data-review-clear-plan-check-error="dashboard"]');
  await expect(error).toBeFocused();
  await expect(page.locator('button[data-review-clear-plan-check="dashboard"]')).toHaveCount(1);

  for (const scenario of ["replace", "disable", "count", "target"] as const) {
    action = page.locator('button[data-review-clear-plan-check="dashboard"]');
    await action.evaluate((element, currentScenario) => {
      let trigger = element as HTMLButtonElement;
      if (currentScenario === "replace") {
        const replacement = trigger.cloneNode(true) as HTMLButtonElement;
        trigger.replaceWith(replacement);
        trigger = replacement;
      } else if (currentScenario === "disable") {
        trigger.disabled = true;
      } else if (currentScenario === "count") {
        trigger.dataset.reviewClearCompleted = "999";
      } else {
        trigger.dataset.reviewClearReportTarget = "other-title";
      }
      trigger.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }, scenario);
    error = page.locator('[data-review-clear-plan-check-error="dashboard"]');
    await expect(error, scenario).toBeFocused();
    await expect(error, scenario).toContainText(
      "could not open the exact Plan Check continuation",
    );
    await expect(page.locator("#plan-check-title"), scenario).toHaveCount(0);
    await expect(
      page.locator('button[data-review-clear-plan-check="dashboard"]'),
      scenario,
    ).toHaveCount(1);
  }

  action = page.locator('button[data-review-clear-plan-check="dashboard"]');
  await action.evaluate((element) => {
    const card = element.closest<HTMLElement>("[data-dashboard-review-progress]");
    const stack = card?.parentElement;
    const previous = card?.previousElementSibling;
    const next = card?.nextElementSibling;
    if (
      card === null
      || !(stack instanceof HTMLElement)
      || !(previous instanceof Element)
      || !(next instanceof Element)
    ) {
      throw new Error("Dashboard topology is unavailable.");
    }
    stack.append(previous.cloneNode(true), card, next.cloneNode(true));
  });
  await action.click();
  error = page.locator('[data-review-clear-plan-check-error="dashboard"]');
  await expect(error).toBeFocused();

  action = page.locator('button[data-review-clear-plan-check="dashboard"]');
  await action.evaluate((element) => {
    const card = element.closest<HTMLElement>("[data-dashboard-review-progress]");
    if (card === null) throw new Error("Dashboard review card is unavailable.");
    card.style.opacity = "0";
    (element as HTMLButtonElement).click();
  });
  error = page.locator('[data-review-clear-plan-check-error="dashboard"]');
  await expect(error).toBeFocused();

  action = page.locator('button[data-review-clear-plan-check="dashboard"]');
  await action.evaluate((element) => {
    const card = element.closest<HTMLElement>("[data-dashboard-review-progress]");
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (card === null || shell === null) throw new Error("Dashboard shell is unavailable.");
    shell.append(card);
  });
  await action.click();
  error = page.locator('[data-review-clear-plan-check-error="dashboard"]');
  await expect(error).toBeFocused();
  await expect(page.locator(".app-shell > [data-dashboard-review-progress]")).toHaveCount(0);

  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  action = page.locator('button[data-review-clear-plan-check="journal"]').first();
  await action.evaluate((element) => {
    const queue = element.closest<HTMLElement>("[data-review-queue]");
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (queue === null || shell === null) throw new Error("Journal shell is unavailable.");
    shell.append(queue);
  });
  await action.click();
  error = page.locator('[data-review-clear-plan-check-error="journal"]');
  await expect(error).toBeFocused();
  await expect(error).toContainText("could not open the exact Plan Check continuation");
  await expectUnobscuredAtCurrentSize(
    page,
    '[data-review-clear-plan-check-error="journal"]',
  );
  await expect(page.locator(".app-shell > [data-review-queue]")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Journal", exact: true })).toBeVisible();
  await expect(page.locator("#plan-check-title")).toHaveCount(0);

  action = page.locator('button[data-review-clear-plan-check="journal"]');
  await action.evaluate((element) => {
    const queue = element.closest<HTMLElement>("[data-review-queue]");
    const stack = queue?.parentElement;
    const previous = queue?.previousElementSibling;
    const next = queue?.nextElementSibling;
    if (
      queue === null
      || !(stack instanceof HTMLElement)
      || !(previous instanceof Element)
      || !(next instanceof Element)
    ) {
      throw new Error("Journal topology is unavailable.");
    }
    stack.append(previous.cloneNode(true), queue, next.cloneNode(true));
  });
  await action.click();
  error = page.locator('[data-review-clear-plan-check-error="journal"]');
  await expect(error).toBeFocused();
  await expectUnobscuredAtCurrentSize(
    page,
    '[data-review-clear-plan-check-error="journal"]',
  );

  action = page.locator('button[data-review-clear-plan-check="journal"]').first();
  await action.evaluate((element) => {
    element.insertAdjacentElement("afterend", element.cloneNode(true) as Element);
  });
  await action.click();
  error = page.locator('[data-review-clear-plan-check-error="journal"]');
  await expect(error).toBeFocused();
  await expectUnobscuredAtCurrentSize(
    page,
    '[data-review-clear-plan-check-error="journal"]',
  );
  await expect(page.locator('button[data-review-clear-plan-check="journal"]')).toHaveCount(1);

  const archiveAfter = await exportJournal(page);
  expect(archiveAfter.stateSha256).toBe(archiveBefore.stateSha256);
  expect(archiveAfter.reportSha256).toBe(archiveBefore.reportSha256);
  expect(archiveAfter.payload.data).toEqual(archiveBefore.payload.data);
  expect(await storageSnapshot(page)).toEqual(storageAfterReview);
  expect(externalRequests).toEqual([]);
});

test("a Plan Check destination that changes during focus rolls back to the exact origin", async ({ page }) => {
  const externalRequests = logExternalRequests(page);
  await clearDashboardReviewQueue(page);
  const storageAfterReview = await storageSnapshot(page);
  const archiveBefore = await exportJournal(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await page.evaluate(() => {
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
        setter.call(this, value);
        if (this.id !== "screen" || !value.includes("data-plan-check")) return;
        Object.defineProperty(Element.prototype, "innerHTML", descriptor);
        const destination = this.querySelector<HTMLElement>("[data-plan-check]");
        const shell = document.querySelector<HTMLElement>(".app-shell");
        if (destination === null || shell === null) {
          throw new Error("The Plan Check destination is unavailable.");
        }
        shell.append(destination);
      },
    });
  });

  await page.locator('button[data-review-clear-plan-check="dashboard"]').click();
  let error = page.locator('[data-review-clear-plan-check-error="dashboard"]');
  await expect(error).toBeFocused();
  await expect(page.locator(".app-shell > [data-plan-check]")).toHaveCount(0);
  await page.locator('button[data-review-clear-plan-check="dashboard"]').click();
  await expect(page.locator("#plan-check-title")).toBeFocused();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();

  await page.evaluate(() => {
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
        setter.call(this, value);
        if (this.id !== "screen" || !value.includes("data-plan-check")) return;
        Object.defineProperty(Element.prototype, "innerHTML", descriptor);
        const destination = this.querySelector<HTMLElement>("[data-plan-check]");
        const stack = this.querySelector<HTMLElement>(":scope > .screen-stack");
        if (destination === null || stack === null) {
          throw new Error("The Plan Check stack destination is unavailable.");
        }
        stack.append(destination);
      },
    });
  });
  await page.locator('button[data-review-clear-plan-check="dashboard"]').click();
  error = page.locator('[data-review-clear-plan-check-error="dashboard"]');
  await expect(error).toBeFocused();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.locator("#plan-check-title")).toHaveCount(0);

  await page.evaluate(() => {
    const originalFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function focus(options?: FocusOptions): void {
      if (this.id === "plan-check-title") {
        HTMLElement.prototype.focus = originalFocus;
        this.closest("[data-plan-check]")?.querySelector(".plan-check-meta")?.remove();
      }
      originalFocus.call(this, options);
    };
  });

  await page.locator('button[data-review-clear-plan-check="dashboard"]').click();
  error = page.locator('[data-review-clear-plan-check-error="dashboard"]');
  await expect(error).toBeFocused();
  await expect(error).toContainText("could not open the exact Plan Check continuation");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.locator("#plan-check-title")).toHaveCount(0);
  await expect(page.locator("#route-announcer")).toHaveText(
    "The exact Plan Check continuation was unavailable. Your journal did not change.",
  );

  await page.evaluate(() => {
    const originalFocus = HTMLElement.prototype.focus;
    HTMLElement.prototype.focus = function focus(options?: FocusOptions): void {
      if (this.id === "plan-check-title") {
        HTMLElement.prototype.focus = originalFocus;
        originalFocus.call(this, options);
        this.style.position = "fixed";
        this.style.left = "-10000px";
        this.style.clipPath = "inset(100%)";
        return;
      }
      originalFocus.call(this, options);
    };
  });
  await page.locator('button[data-review-clear-plan-check="dashboard"]').click();
  error = page.locator('[data-review-clear-plan-check-error="dashboard"]');
  await expect(error).toBeFocused();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.locator("#plan-check-title")).toHaveCount(0);

  const archiveAfter = await exportJournal(page);
  expect(archiveAfter.stateSha256).toBe(archiveBefore.stateSha256);
  expect(archiveAfter.reportSha256).toBe(archiveBefore.reportSha256);
  expect(archiveAfter.payload.data).toEqual(archiveBefore.payload.data);
  expect(await storageSnapshot(page)).toEqual(storageAfterReview);
  expect(externalRequests).toEqual([]);
});
