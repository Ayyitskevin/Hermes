import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  parseJournalArchive,
  type JournalArchive,
} from "../src/application/journal-archive";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

interface ReviewArchiveData {
  readonly activeExecutions: readonly unknown[];
  readonly inactiveExecutions: readonly unknown[];
  readonly receipts: readonly unknown[];
  readonly receiptByRevision: readonly unknown[];
  readonly manualSubmissions: readonly unknown[];
  readonly counters: {
    readonly nextExecutionSequence: string;
    readonly nextReceiptOrdinal: string;
  };
  readonly reviewVersions: readonly {
    readonly id: string;
    readonly tradeSubjectId: string;
    readonly version: number;
    readonly state: "draft" | "completed";
    readonly revision: string;
    readonly note: string;
    readonly setup: string | null;
    readonly mistakes: readonly string[];
    readonly emotion: string | null;
    readonly tags: readonly string[];
    readonly playbookName: string | null;
    readonly rules: readonly {
      readonly text: string;
      readonly outcome: string;
    }[];
    readonly initialRisk: {
      readonly amount: string;
      readonly currency: string;
    } | null;
    readonly plannedStop: string | null;
  }[];
  readonly reviewHeads: readonly (readonly [string, string])[];
  readonly reviewSubmissions: readonly (readonly [
    string,
    { readonly reviewId: string; readonly revision: string },
  ])[];
}

interface PreparedReviewObservation {
  readonly submissionId: string;
  readonly expectedPreviousReviewId: string | null;
  readonly note: string;
  readonly revision: string;
}

interface PreparedReviewProbe {
  readonly commands: readonly PreparedReviewObservation[];
  readonly randomIds: readonly string[];
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

async function exportJournal(page: Page): Promise<JournalArchive> {
  await page.getByRole("button", { name: "More", exact: true }).click();
  const exportAction = page.locator("#user-data-export");
  await exportAction.click();
  await expect(exportAction).toHaveText("Share or save export");
  const downloadPromise = page.waitForEvent("download");
  await exportAction.click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("The trade-review recovery export has no local path.");
  return parseJournalArchive(await readFile(path, "utf8"));
}

function reviewArchiveData(archive: JournalArchive): ReviewArchiveData {
  return archive.payload.data as unknown as ReviewArchiveData;
}

async function installPreparedReviewCounters(page: Page): Promise<void> {
  await page.evaluate(() => {
    const root = document.documentElement;
    const observed = window as typeof window & {
      __hermesPreparedReviews?: {
        submissionId: string;
        expectedPreviousReviewId: string | null;
        note: string;
        revision: string;
      }[];
      __hermesReviewRandomIds?: string[];
    };
    observed.__hermesPreparedReviews = [];
    observed.__hermesReviewRandomIds = [];
    root.dataset.reviewPreparedValueReads = "0";
    root.dataset.reviewRandomIdCalls = "0";
    const incrementValueReads = () => {
      if (!(new Error().stack ?? "").includes("/assets/index-")) return;
      const reads = Number(root.dataset.reviewPreparedValueReads ?? "0") + 1;
      root.dataset.reviewPreparedValueReads = String(reads);
    };
    const instrumentValue = (
      prototype: object,
      label: string,
    ) => {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
      const getter = descriptor?.get;
      const setter = descriptor?.set;
      if (
        descriptor === undefined
        || getter === undefined
        || setter === undefined
      ) throw new Error(`${label} value accessor is not instrumentable.`);
      Object.defineProperty(prototype, "value", {
        ...descriptor,
        get(this: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement) {
          incrementValueReads();
          return getter.call(this) as string;
        },
        set(
          this: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
          value: string,
        ) {
          setter.call(this, value);
        },
      });
    };
    instrumentValue(HTMLInputElement.prototype, "Input");
    instrumentValue(HTMLTextAreaElement.prototype, "Textarea");
    instrumentValue(HTMLSelectElement.prototype, "Select");
    const originalFreeze = Object.freeze.bind(Object);
    Object.defineProperty(Object, "freeze", {
      configurable: true,
      writable: true,
      value: (candidate: object) => {
        if (typeof candidate === "object" && candidate !== null) {
          const record = candidate as Record<string, unknown>;
          if (
            typeof record.submissionId === "string"
            && typeof record.tradeSubjectId === "string"
            && Object.prototype.hasOwnProperty.call(record, "expectedPreviousReviewId")
            && (
              record.expectedPreviousReviewId === null
              || typeof record.expectedPreviousReviewId === "string"
            )
            && typeof record.note === "string"
            && typeof record.revision === "string"
            && record.resultRVersion === 1
            && record.percentReturnVersion === 1
          ) {
            observed.__hermesPreparedReviews?.push({
              submissionId: record.submissionId,
              expectedPreviousReviewId: record.expectedPreviousReviewId,
              note: record.note,
              revision: record.revision,
            });
          }
        }
        return originalFreeze(candidate);
      },
    });
    const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: (array: Uint8Array) => {
        const calls = Number(root.dataset.reviewRandomIdCalls ?? "0") + 1;
        root.dataset.reviewRandomIdCalls = String(calls);
        const result = originalGetRandomValues(array);
        observed.__hermesReviewRandomIds?.push(
          Array.from(result, (value) => value.toString(16).padStart(2, "0")).join(""),
        );
        return result;
      },
    });
  });
}

async function resetPreparedReviewProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const observed = window as typeof window & {
      __hermesPreparedReviews?: PreparedReviewObservation[];
      __hermesReviewRandomIds?: string[];
    };
    observed.__hermesPreparedReviews = [];
    observed.__hermesReviewRandomIds = [];
    document.documentElement.dataset.reviewPreparedValueReads = "0";
    document.documentElement.dataset.reviewRandomIdCalls = "0";
  });
}

async function preparedReviewProbe(page: Page): Promise<PreparedReviewProbe> {
  const observed = await page.evaluate(() => {
    const probe = window as typeof window & {
      __hermesPreparedReviews?: PreparedReviewObservation[];
      __hermesReviewRandomIds?: string[];
    };
    return {
      commands: probe.__hermesPreparedReviews ?? [],
      randomIds: probe.__hermesReviewRandomIds ?? [],
    };
  });
  const unique = new Map<string, PreparedReviewObservation>();
  observed.commands.forEach((command) => {
    unique.set(`${command.submissionId}:${command.revision}`, command);
  });
  return {
    commands: [...unique.values()],
    randomIds: observed.randomIds,
  };
}

async function preparedReviewCounters(
  page: Page,
): Promise<{ readonly valueReads: string | undefined; readonly randomIds: string | undefined }> {
  return page.evaluate(() => ({
    valueReads: document.documentElement.dataset.reviewPreparedValueReads,
    randomIds: document.documentElement.dataset.reviewRandomIdCalls,
  }));
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
    name: "two-trades.csv",
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

function tradeCard(page: Page, symbol: string): Locator {
  return page.locator(".trade-card").filter({
    has: page.getByRole("heading", { name: symbol, exact: true }),
  });
}

async function openTradeReview(page: Page, symbol: string): Promise<Locator> {
  const card = tradeCard(page, symbol);
  await card.locator("[data-review-trade]").click();
  const dialog = page.getByRole("dialog", { name: `${symbol} trade review` });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function changePlaybookWithConfirmation(
  page: Page,
  input: Locator,
  nextPlaybook: string,
  decision: "accept" | "dismiss",
): Promise<void> {
  await input.fill(nextPlaybook);
  const confirmationPromise = page.waitForEvent("dialog");
  const changeAttempt = input.blur();
  const confirmation = await confirmationPromise;
  expect(confirmation.type()).toBe("confirm");
  expect(confirmation.message()).toMatch(/rule|playbook/iu);
  if (decision === "accept") await confirmation.accept();
  else await confirmation.dismiss();
  await changeAttempt;
}

async function completeReview(page: Page, symbol: string, risk: string): Promise<void> {
  const card = tradeCard(page, symbol);
  await card.getByRole("button", { name: /Review trade|Continue draft|Edit review/u }).click();
  const dialog = page.getByRole("dialog", { name: `${symbol} trade review` });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#screen")).toHaveAttribute("inert", "");
  await expect(dialog.getByRole("heading", { name: "Execution inspection" })).toBeVisible();
  await expect(dialog.locator(".review-execution-row")).toHaveCount(2);
  await dialog.locator("#review-setup").fill("Opening range breakout");
  await dialog.locator("#review-emotion").fill("Focused");
  await dialog.locator("#review-mistakes").fill("Late scale-out");
  if (symbol === "AAPL") await dialog.locator("#review-tags").fill("A+ setup");
  await dialog.locator("#review-risk").fill(risk);
  await dialog.locator("#review-stop").fill(symbol === "AAPL" ? "95" : "395");
  await dialog.locator("#review-playbook").fill("Momentum");
  await dialog.getByRole("button", { name: "Add rule" }).click();
  await dialog.locator('input[name="review-rule-name"]').last().fill("Wait for confirmation");
  await dialog.locator('select[name="review-rule-outcome"]').last().selectOption("followed");
  await dialog.locator("#review-note").fill(`${symbol} followed the planned confirmation.`);
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#route-announcer")).toHaveText(`${symbol} review completed.`);
}

test("trade reviews persist exact risk metrics, edit immutably, and clear an atomic queue", async ({ page }) => {
  await importTwoClosedTrades(page);
  await expect(page.getByRole("heading", { name: "2 reviews waiting" })).toBeVisible();
  await page.getByRole("button", { name: "Trades", exact: true }).click();

  const aapl = tradeCard(page, "AAPL");
  await aapl.getByRole("button", { name: "Review trade" }).click();
  const initialDialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await expect(initialDialog.getByText("Add user-confirmed initial risk to calculate R.")).toBeVisible();
  await expect(initialDialog.getByText("10%", { exact: true })).toBeVisible();
  await initialDialog.locator("#review-note").fill("Unsaved reflection");
  const confirmationPromise = page.waitForEvent("dialog");
  const closeAttempt = initialDialog.getByRole("button", { name: "Cancel" }).click();
  const confirmation = await confirmationPromise;
  expect(confirmation.type()).toBe("confirm");
  expect(confirmation.message()).toBe("Discard the unsaved trade review?");
  await confirmation.dismiss();
  await closeAttempt;
  await expect(initialDialog).toBeVisible();
  await initialDialog.locator("#review-note").fill("");
  await initialDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(aapl.getByRole("button", { name: "Review trade" })).toBeFocused();

  await completeReview(page, "AAPL", "5");
  await expect(tradeCard(page, "AAPL").locator(".journal-metrics span"))
    .toContainText("+2.0R · +10.00%");
  await expect(tradeCard(page, "AAPL")).toContainText("completed");

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByText("1 session streak", { exact: true })).toBeVisible();
  await expect(page.locator(".review-progress-card"))
    .toContainText("1 of 1 trading sessions reviewed.");
  await page.getByRole("button", { name: "Trades", exact: true }).click();

  await tradeCard(page, "AAPL").getByRole("button", { name: "Edit review" }).click();
  const editDialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await expect(editDialog.getByText("2R", { exact: true })).toBeVisible();
  await expect(editDialog.locator("#review-risk")).toHaveValue("5");
  await editDialog.locator("#review-note").fill("AAPL review updated without changing executions.");
  await editDialog.getByRole("button", { name: "Save review changes" }).click();
  await tradeCard(page, "AAPL").getByRole("button", { name: "Edit review" }).click();
  await expect(page.getByText("REVIEWED · VERSION 2", { exact: true })).toBeVisible();
  await expect(page.locator("#review-note")).toHaveValue(
    "AAPL review updated without changing executions.",
  );
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trade review queue" })).toBeVisible();
  await expect(page.locator(".review-queue-item")).toHaveCount(1);
  await expect(page.locator('[data-review-queue-group="draft"]')).toHaveCount(0);
  await expect(page.locator('[data-review-queue-group="pending"]')).toContainText("MSFT");
  await page.locator("[data-batch-review-subject]").check();
  await page.locator("#batch-review-tag").fill("Earnings day");
  await page.getByRole("button", { name: "Apply tag to selected" }).click();
  await expect(page.locator("#route-announcer")).toHaveText(
    "Earnings day added to 1 trade in one atomic review batch.",
  );
  await expect(page.locator("#review-queue-group-draft-title")).toBeFocused();
  await expect(page.locator('[data-review-queue-group="pending"]')).toHaveCount(0);
  await expect(page.locator(".review-queue-item")).toContainText("draft");

  await page.locator(".review-queue-item").getByRole("button", { name: "Continue draft" }).click();
  await expect(page.locator("#review-tags")).toHaveValue("Earnings day");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".review-queue-item")
    .getByRole("button", { name: "Continue draft" })).toBeFocused();
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await completeReview(page, "MSFT", "10");

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review queue clear" })).toBeVisible();
  await expect(page.getByText("1 session streak", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.locator(".review-queue-item")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Review queue clear" })).toBeVisible();
});

test("Dashboard review saves return focus to the exact rebuilt review rhythm", async ({ page }) => {
  const externalRequests = logExternalRequests(page);
  await importTwoClosedTrades(page);
  await installPreparedReviewCounters(page);

  const rhythm = page.locator("[data-dashboard-review-progress]").first();
  const heading = page.locator("#dashboard-review-progress-title");
  let nextReview = rhythm.locator(
    'button[data-trade-review-origin="dashboard-review-progress"]',
  );
  await expect(rhythm).toHaveAttribute("data-dashboard-review-progress", "waiting");
  await expect(heading).toHaveText("2 reviews waiting");
  await expect(nextReview).toHaveAttribute("data-review-trade", /.+/u);
  await expect(nextReview).toHaveAccessibleName(/Review next trade for AAPL Stock/u);
  const exactSubject = await nextReview.getAttribute("data-review-trade");
  if (exactSubject === null) throw new Error("Dashboard review action has no exact subject.");
  const storageBefore = await page.evaluate(() => (
    Object.entries(localStorage).sort(([left], [right]) => left.localeCompare(right))
  ));

  const expectOpenErrorWithinChrome = async (
    error: Locator,
    viewportWidth: number,
  ) => {
    const geometry = await error.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const topbar = document.querySelector<HTMLElement>(".topbar")?.getBoundingClientRect();
      const tabbar = document.querySelector<HTMLElement>(".tabbar")?.getBoundingClientRect();
      return {
        active: document.activeElement === element,
        top: bounds.top,
        bottom: bounds.bottom,
        topbarBottom: topbar?.bottom ?? 0,
        tabbarTop: tabbar?.top ?? window.innerHeight,
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    const evidence = JSON.stringify({ viewportWidth, ...geometry });
    expect(geometry.active, evidence).toBe(true);
    expect(geometry.top, evidence).toBeGreaterThanOrEqual(geometry.topbarBottom - 1);
    expect(geometry.bottom, evidence).toBeLessThanOrEqual(geometry.tabbarTop + 1);
    expect(geometry.documentOverflow, evidence).toBeLessThanOrEqual(1);
  };

  await nextReview.evaluate((element) => {
    element.removeAttribute("data-trade-review-origin");
  });
  const unmarkedNextReview = rhythm.locator("button[data-review-trade]");
  await unmarkedNextReview.click();
  let openError = page.locator("[data-trade-review-open-error]");
  await expect(openError).toBeFocused();
  await expect(page.locator("#trade-review")).toHaveCount(0);
  await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
  expect(await preparedReviewCounters(page)).toEqual({
    valueReads: "0",
    randomIds: "0",
  });
  await unmarkedNextReview.evaluate((element) => {
    element.setAttribute("data-trade-review-origin", "dashboard-review-progress");
  });
  await openError.evaluate((element) => {
    element.remove();
  });

  await page.setViewportSize({ width: 421, height: 568 });
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  await rhythm.evaluate((element) => {
    element.setAttribute("data-dashboard-review-subject", "tampered-subject");
  });
  await nextReview.click();
  openError = page.locator("[data-trade-review-open-error]");
  await expect(openError).toBeFocused();
  await expectOpenErrorWithinChrome(openError, 421);
  await expect(page.locator("#trade-review")).toHaveCount(0);
  await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
  expect(await preparedReviewCounters(page)).toEqual({
    valueReads: "0",
    randomIds: "0",
  });
  expect(await page.evaluate(() => (
    Object.entries(localStorage).sort(([left], [right]) => left.localeCompare(right))
  ))).toEqual(storageBefore);
  await openError.evaluate((element) => {
    element.remove();
  });

  await page.setViewportSize({ width: 320, height: 568 });
  await rhythm.evaluate((element, subject) => {
    element.setAttribute("data-dashboard-review-subject", subject);
    const clone = element.cloneNode(true);
    element.insertAdjacentElement("afterend", clone as Element);
  }, exactSubject);
  await nextReview.click();
  openError = page.locator("[data-trade-review-open-error]");
  await expect(openError).toBeFocused();
  await expectOpenErrorWithinChrome(openError, 320);
  await expect(page.locator("#trade-review")).toHaveCount(0);
  await expect(page.locator("[data-dashboard-review-progress]")).toHaveCount(2);
  expect(await preparedReviewCounters(page)).toEqual({
    valueReads: "0",
    randomIds: "0",
  });
  await page.locator("[data-dashboard-review-progress]").nth(1).evaluate((element) => {
    element.remove();
  });
  await openError.evaluate((element) => {
    element.remove();
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    delete document.documentElement.dataset.testTextScale;
  });
  await nextReview.click();
  let dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(nextReview).toBeFocused();

  await nextReview.click();
  dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await dialog.locator("#review-note").fill("Keep this exact Dashboard review in progress.");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(heading).toBeFocused();
  await expect(heading).toHaveText("2 reviews waiting");
  await expect(rhythm).toContainText(/1 draft ·/u);
  nextReview = rhythm.locator(
    'button[data-trade-review-origin="dashboard-review-progress"]',
  );
  await expect(nextReview).toHaveAccessibleName(/Continue next review for AAPL Stock/u);

  await nextReview.click();
  dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(heading).toBeFocused();
  await expect(heading).toHaveText("1 review waiting");
  await expect(nextReview).toHaveAccessibleName(/Review next trade for MSFT Stock/u);

  for (const width of [421, 320]) {
    await page.setViewportSize({ width, height: 568 });
    await page.evaluate(() => {
      document.documentElement.dataset.testTextScale = "200";
    });
    const layout = await nextReview.evaluate((element) => {
      const button = element.getBoundingClientRect();
      const card = element.closest<HTMLElement>("[data-dashboard-review-progress]");
      return {
        width: button.width,
        height: button.height,
        cardOverflow: (card?.scrollWidth ?? 0) - (card?.clientWidth ?? 0),
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(layout.width, JSON.stringify({ viewportWidth: width, ...layout })).toBeGreaterThanOrEqual(44);
    expect(layout.height, JSON.stringify({ viewportWidth: width, ...layout })).toBeGreaterThanOrEqual(44);
    expect(layout.cardOverflow, JSON.stringify({ viewportWidth: width, ...layout })).toBeLessThanOrEqual(1);
    expect(layout.documentOverflow, JSON.stringify({ viewportWidth: width, ...layout })).toBeLessThanOrEqual(1);
  }

  await nextReview.click();
  dialog = page.getByRole("dialog", { name: "MSFT trade review" });
  await dialog.locator("#review-note").fill("Finish the last Dashboard review.");
  const finalSave = dialog.getByRole("button", { name: "Mark reviewed" });
  await finalSave.focus();
  await page.keyboard.press("Enter");
  await expect(heading).toBeFocused();
  await expect(heading).toHaveText("Review queue clear");
  await expect(rhythm).toHaveAttribute("data-dashboard-review-progress", "clear");
  await expect(rhythm.locator(
    'button[data-trade-review-origin="dashboard-review-progress"]',
  )).toHaveCount(0);
  await expect(rhythm.getByRole("button", { name: "Open review journal" })).toBeVisible();
  const focusLayout = await heading.evaluate((element) => {
    const title = element.getBoundingClientRect();
    const topbar = document.querySelector<HTMLElement>(".topbar")?.getBoundingClientRect();
    const tabbar = document.querySelector<HTMLElement>(".tabbar")?.getBoundingClientRect();
    const card = element.closest<HTMLElement>("[data-dashboard-review-progress]");
    const style = window.getComputedStyle(element);
    return {
      active: document.activeElement === element,
      titleTop: title.top,
      titleBottom: title.bottom,
      topbarBottom: topbar?.bottom ?? 0,
      tabbarTop: tabbar?.top ?? window.innerHeight,
      cardOverflow: (card?.scrollWidth ?? 0) - (card?.clientWidth ?? 0),
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
    };
  });
  expect(focusLayout.active, JSON.stringify(focusLayout)).toBe(true);
  expect(focusLayout.titleTop, JSON.stringify(focusLayout))
    .toBeGreaterThanOrEqual(focusLayout.topbarBottom - 1);
  expect(focusLayout.titleBottom, JSON.stringify(focusLayout))
    .toBeLessThanOrEqual(focusLayout.tabbarTop + 1);
  expect(focusLayout.cardOverflow, JSON.stringify(focusLayout)).toBeLessThanOrEqual(1);
  expect(focusLayout.documentOverflow, JSON.stringify(focusLayout)).toBeLessThanOrEqual(1);
  expect(focusLayout.outlineStyle, JSON.stringify(focusLayout)).toBe("solid");
  expect(focusLayout.outlineWidth, JSON.stringify(focusLayout)).toBeGreaterThanOrEqual(2);
  await expect(page.locator("#route-announcer")).toHaveText("MSFT review completed.");
  await expect(page.locator("body")).not.toHaveClass(/modal-open/u);
  await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
  expect(externalRequests).toEqual([]);
});

test("Dashboard review focus falls back when the rebuilt heading is missing or duplicated", async ({ page }) => {
  const externalRequests = logExternalRequests(page);
  await importTwoClosedTrades(page);
  const dashboardAction = page.locator(
    '[data-dashboard-review-progress] button[data-trade-review-origin="dashboard-review-progress"]',
  );
  const dashboardHeadings = page.locator("[data-dashboard-review-progress-title]");
  const installPostRefreshMutation = async (mutation: "duplicate" | "remove") => {
    await page.evaluate((nextMutation) => {
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
          if (this.id !== "screen") return;
          Object.defineProperty(Element.prototype, "innerHTML", descriptor);
          const heading = this.querySelector<HTMLElement>(
            "[data-dashboard-review-progress-title]",
          );
          if (heading === null) {
            throw new Error("Dashboard review heading was not rebuilt.");
          }
          if (nextMutation === "duplicate") {
            heading.insertAdjacentElement("afterend", heading.cloneNode(true) as Element);
            return;
          }
          heading.remove();
        },
      });
    }, mutation);
  };

  await dashboardAction.click();
  let dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await dialog.locator("#review-note").fill("Keep this Dashboard review as a draft.");
  await installPostRefreshMutation("duplicate");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#screen")).toBeFocused();
  await expect(dashboardHeadings).toHaveCount(2);
  await expect(page.locator("#route-announcer")).toHaveText("AAPL review draft saved.");
  await expect(page.locator("body")).not.toHaveClass(/modal-open/u);
  await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");

  await dashboardHeadings.nth(1).evaluate((element) => {
    element.remove();
  });
  await expect(dashboardHeadings).toHaveCount(1);
  await expect(dashboardAction)
    .toHaveAccessibleName(/Continue next review for AAPL Stock/u);
  await dashboardAction.click();
  dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await dialog.locator("#review-note").fill("Complete this Dashboard review once.");
  await installPostRefreshMutation("remove");
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#screen")).toBeFocused();
  await expect(dashboardHeadings).toHaveCount(0);
  await expect(page.locator("#route-announcer")).toHaveText("AAPL review completed.");
  await expect(page.locator("body")).not.toHaveClass(/modal-open/u);
  await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");

  const data = reviewArchiveData(await exportJournal(page));
  expect(data.reviewVersions).toHaveLength(2);
  expect(data.reviewVersions).toEqual(expect.arrayContaining([
    expect.objectContaining({
      version: 1,
      state: "draft",
      note: "Keep this Dashboard review as a draft.",
    }),
    expect.objectContaining({
      version: 2,
      state: "completed",
      note: "Complete this Dashboard review once.",
    }),
  ]));
  const completed = data.reviewVersions.find((version) => (
    version.version === 2 && version.state === "completed"
  ));
  if (completed === undefined) throw new Error("Expected one completed Dashboard review.");
  expect(data.reviewHeads).toEqual([[completed.tradeSubjectId, completed.id]]);
  expect(data.reviewSubmissions).toHaveLength(2);
  expect(externalRequests).toEqual([]);
});

test("review queue groups unfinished work and restores focus after each regroup", async ({ page }) => {
  await importTwoClosedTrades(page);
  await page.getByRole("button", { name: "Journal", exact: true }).click();

  const queue = page.locator("[data-review-queue]");
  const pendingGroup = page.locator('[data-review-queue-group="pending"]');
  await expect(page.locator('[data-review-queue-group="draft"]')).toHaveCount(0);
  await expect(pendingGroup.locator("[data-review-queue-trade]")).toHaveCount(2);
  await expect(pendingGroup.locator("[data-review-queue-trade] h4")).toHaveText([
    "AAPL",
    "MSFT",
  ]);

  await pendingGroup.getByRole("button", { name: /Review for MSFT/u }).click();
  let dialog = page.getByRole("dialog", { name: /MSFT trade review/u });
  await dialog.getByRole("button", { name: "Save draft" }).click();

  const draftHeading = page.locator("#review-queue-group-draft-title");
  await expect(draftHeading).toBeFocused();
  await expect(draftHeading).toBeInViewport();
  expect(await page.locator("[data-review-queue-group]").evaluateAll((groups) => (
    groups.map((group) => group.getAttribute("data-review-queue-group"))
  ))).toEqual(["draft", "pending"]);
  await expect(page.locator('[data-review-queue-group="draft"]')).toContainText("MSFT");
  await expect(page.locator('[data-review-queue-group="pending"]')).toContainText("AAPL");
  await expect(page.locator("[data-batch-review-subject]")).toHaveCount(2);

  for (const width of [320, 421]) {
    await page.setViewportSize({ width, height: 568 });
    await page.evaluate(() => {
      document.documentElement.dataset.testTextScale = "200";
    });
    await draftHeading.scrollIntoViewIfNeeded();
    await expect(draftHeading).toBeInViewport();
    const overflow = await queue.evaluate((element) => ({
      document: document.documentElement.scrollWidth - window.innerWidth,
      queue: element.scrollWidth - element.clientWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(1);
    expect(overflow.queue).toBeLessThanOrEqual(1);
    for (const control of await queue.locator(
      "button:visible, label.review-select:visible",
    ).all()) {
      const box = await control.boundingBox();
      expect(box, "queue control should have a layout box").not.toBeNull();
      expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
      expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
    }
  }

  await page.locator('[data-review-queue-group="draft"]')
    .getByRole("button", { name: /Continue draft for MSFT/u })
    .click();
  dialog = page.getByRole("dialog", { name: /MSFT trade review/u });
  await dialog.locator("#review-note").fill("Completed the saved draft.");
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(page.locator("#review-queue-group-pending-title")).toBeFocused();
  await expect(page.locator('[data-review-queue-group="draft"]')).toHaveCount(0);

  await page.locator('[data-review-queue-group="pending"]')
    .getByRole("button", { name: /Review for AAPL/u })
    .click();
  dialog = page.getByRole("dialog", { name: /AAPL trade review/u });
  await dialog.locator("#review-note").fill("Completed from the focused queue.");
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();

  await expect(page.locator("#review-queue-title")).toBeFocused();
  await expect(page.getByRole("heading", { name: "Review queue clear" })).toBeVisible();
  await expect(page.locator("[data-review-queue-group]")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/modal-open/u);
  await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
  await expect(page.locator("#screen")).not.toHaveAttribute("aria-hidden", "true");
});

test("report review saves return to the source heading when evidence moves", async ({ page }) => {
  await importTwoClosedTrades(page);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await completeReview(page, "AAPL", "5");
  await completeReview(page, "MSFT", "10");
  await page.getByRole("button", { name: "Reports", exact: true }).click();

  const reviewSessionStreak = page.locator(
    '[data-review-session-coverage-group="current_streak"]',
  );
  await reviewSessionStreak.locator("summary").click();
  const reviewSessionAction = reviewSessionStreak.getByRole("button", {
    name: /Open AAPL trade for the current review streak on /u,
  });
  await reviewSessionAction.click();
  const reviewSessionDialog = page.getByRole("dialog", {
    name: /AAPL trade review/u,
  });
  await expect(
    reviewSessionDialog.locator("[data-trade-review-report-context]"),
  ).toHaveText(
    "Opened from Review session coverage. This full-workspace report does not use or change your Trades filters.",
  );
  await reviewSessionDialog.locator("#review-note")
    .fill("Review session coverage refresh.");
  await reviewSessionDialog.getByRole("button", {
    name: "Save review changes",
  }).click();

  await expect(reviewSessionDialog).toHaveCount(0);
  await expect(page.locator("#review-session-coverage-title")).toBeFocused();
  await expect(reviewSessionStreak).not.toHaveAttribute("open", "");
  await reviewSessionStreak.locator("summary").click();
  await expect(
    reviewSessionStreak.locator("[data-review-session-coverage-trade]"),
  ).toHaveCount(2);

  const longDirection = page.locator('[data-direction-mix-group="long"]');
  await longDirection.locator("summary").click();
  const directionAction = longDirection.getByRole("button", {
    name: /Open AAPL trade for the long direction group/u,
  });
  await directionAction.click();
  const directionDialog = page.getByRole("dialog", {
    name: /AAPL trade review/u,
  });
  await expect(directionDialog.locator("[data-trade-review-report-context]"))
    .toHaveText(
      "Opened from Direction mix. This full-workspace report does not use or change your Trades filters.",
    );
  await directionDialog.locator("#review-note").fill("Direction report refresh.");
  await directionDialog.getByRole("button", { name: "Save review changes" }).click();

  await expect(directionDialog).toHaveCount(0);
  await expect(page.locator("#direction-mix-title")).toBeFocused();
  await expect(
    page.locator('[data-direction-mix-group="long"] [data-direction-mix-trade]'),
  ).toHaveCount(2);

  const openingThursday = page.locator(
    '[data-opening-weekday-mix-group="thursday"]',
  );
  await openingThursday.locator("summary").click();
  const openingWeekdayAction = openingThursday.getByRole("button", {
    name: /Open AAPL trade for the Thursday opening group/u,
  });
  await openingWeekdayAction.click();
  const openingWeekdayDialog = page.getByRole("dialog", {
    name: /AAPL trade review/u,
  });
  await expect(
    openingWeekdayDialog.locator("[data-trade-review-report-context]"),
  ).toHaveText(
    "Opened from Opening weekday mix. This full-workspace report does not use or change your Trades filters.",
  );
  await openingWeekdayDialog.locator("#review-note")
    .fill("Opening weekday report refresh.");
  await openingWeekdayDialog.getByRole("button", {
    name: "Save review changes",
  }).click();

  await expect(openingWeekdayDialog).toHaveCount(0);
  await expect(page.locator("#opening-weekday-mix-title")).toBeFocused();
  await expect(
    page.locator(
      '[data-opening-weekday-mix-group="thursday"] [data-opening-weekday-mix-trade]',
    ),
  ).toHaveCount(2);

  const followed = page.locator('[data-plan-check-group="followed"]');
  await followed.locator("summary").click();
  const planAction = followed.getByRole("button", {
    name: /Open AAPL trade/u,
  });
  await planAction.click();
  const planDialog = page.getByRole("dialog", {
    name: /AAPL trade review/u,
  });
  await expect(planDialog.locator("[data-trade-review-report-context]")).toHaveText(
    "Opened from Plan check. This full-workspace report does not use or change your Trades filters.",
  );
  await planDialog.locator('select[name="review-rule-outcome"]')
    .selectOption("broken");
  await planDialog.getByRole("button", { name: "Save review changes" }).click();

  await expect(planDialog).toHaveCount(0);
  await expect(page.locator("#plan-check-title")).toBeFocused();
  await expect(
    page.locator(
      '[data-plan-check-group="broken"] [data-plan-check-trade] .report-trade-action',
    ).filter({ hasText: "Open trade" }),
  ).toHaveCount(1);

  const setupGroup = page.locator("[data-setup-performance-group-index]")
    .filter({ hasText: "Opening range breakout" });
  await setupGroup.locator("summary").click();
  const setupAction = setupGroup.getByRole("button", {
    name: /Open AAPL trade/u,
  });
  await setupAction.click();
  const setupDialog = page.getByRole("dialog", {
    name: /AAPL trade review/u,
  });
  await expect(setupDialog.locator("[data-trade-review-report-context]")).toHaveText(
    "Opened from Setup breakdown. This full-workspace report does not use or change your Trades filters.",
  );
  await setupDialog.locator("#review-setup").fill("Reversal");
  await setupDialog.getByRole("button", { name: "Save review changes" }).click();

  await expect(setupDialog).toHaveCount(0);
  await expect(page.locator("#setup-performance-title")).toBeFocused();
  const reversalGroup = page.locator("[data-setup-performance-group-index]")
    .filter({ has: page.locator("summary", { hasText: "Reversal" }) });
  const movedAction = reversalGroup.locator(
    "[data-setup-performance-trade] .report-trade-action",
  );
  await expect(movedAction).toHaveCount(1);
  await expect(movedAction).toHaveAttribute("aria-label", /Open AAPL trade/u);

  const lateScaleOut = page.locator("[data-mistake-patterns-group-index]")
    .filter({ has: page.locator("summary", { hasText: "Late scale-out" }) });
  await lateScaleOut.locator("summary").click();
  const mistakeAction = lateScaleOut.getByRole("button", {
    name: /Open AAPL trade for saved mistake Late scale-out/u,
  });
  await mistakeAction.click();
  const mistakeDialog = page.getByRole("dialog", {
    name: /AAPL trade review/u,
  });
  await expect(mistakeDialog.locator("[data-trade-review-report-context]"))
    .toHaveText(
      "Opened from Mistake patterns. This full-workspace report does not use or change your Trades filters.",
    );
  await mistakeDialog.locator("#review-mistakes")
    .fill("Early entry, Chased entry");
  await mistakeDialog.getByRole("button", { name: "Save review changes" }).click();

  await expect(mistakeDialog).toHaveCount(0);
  await expect(page.locator("#mistake-patterns-title")).toBeFocused();
  const mistakeSection = page.locator("[data-mistake-patterns]");
  await expect(mistakeSection.getByText("2 unique trades of 2 trades", { exact: true }))
    .toBeVisible();
  await expect(mistakeSection.getByText("3 saved mistake assignments", { exact: true }))
    .toBeVisible();
  const chased = mistakeSection.locator("[data-mistake-patterns-group-index]")
    .filter({ has: page.locator("summary", { hasText: "Chased entry" }) });
  const early = mistakeSection.locator("[data-mistake-patterns-group-index]")
    .filter({ has: page.locator("summary", { hasText: "Early entry" }) });
  const retainedLate = mistakeSection.locator("[data-mistake-patterns-group-index]")
    .filter({ has: page.locator("summary", { hasText: "Late scale-out" }) });
  await expect(chased.locator('[data-mistake-patterns-trade]')).toHaveCount(1);
  await expect(chased.locator('[data-mistake-patterns-trade]')).toContainText("AAPL");
  await expect(early.locator('[data-mistake-patterns-trade]')).toHaveCount(1);
  await expect(early.locator('[data-mistake-patterns-trade]')).toContainText("AAPL");
  await expect(retainedLate.locator('[data-mistake-patterns-trade]')).toHaveCount(1);
  await expect(retainedLate.locator('[data-mistake-patterns-trade]')).toContainText("MSFT");

  const aPlus = page.locator("[data-tag-patterns-group-index]")
    .filter({ has: page.locator("summary", { hasText: "A+ setup" }) });
  await aPlus.locator("summary").click();
  const tagAction = aPlus.getByRole("button", {
    name: /Open AAPL trade for saved tag A\+ setup/u,
  });
  await tagAction.click();
  const tagDialog = page.getByRole("dialog", {
    name: /AAPL trade review/u,
  });
  await expect(tagDialog.locator("[data-trade-review-report-context]"))
    .toHaveText(
      "Opened from Tag patterns. This full-workspace report does not use or change your Trades filters.",
    );
  await tagDialog.locator("#review-tags")
    .fill("Review next, Risk reduced");
  await tagDialog.getByRole("button", { name: "Save review changes" }).click();

  await expect(tagDialog).toHaveCount(0);
  await expect(page.locator("#tag-patterns-title")).toBeFocused();
  const tagSection = page.locator("[data-tag-patterns]");
  await expect(tagSection.getByText("1 unique trade of 2 trades", { exact: true }))
    .toBeVisible();
  await expect(tagSection.getByText("2 saved tag assignments", { exact: true }))
    .toBeVisible();
  await expect(tagSection.getByText(
    "0 pending or draft · 1 completed without a saved tag",
    { exact: true },
  )).toBeVisible();
  const removedAPlus = tagSection.locator("[data-tag-patterns-group-index]")
    .filter({ has: page.locator("summary", { hasText: "A+ setup" }) });
  const reviewNext = tagSection.locator("[data-tag-patterns-group-index]")
    .filter({ has: page.locator("summary", { hasText: "Review next" }) });
  const riskReduced = tagSection.locator("[data-tag-patterns-group-index]")
    .filter({ has: page.locator("summary", { hasText: "Risk reduced" }) });
  await expect(removedAPlus).toHaveCount(0);
  await expect(reviewNext.locator('[data-tag-patterns-trade]')).toHaveCount(1);
  await expect(reviewNext.locator('[data-tag-patterns-trade]')).toContainText("AAPL");
  await expect(riskReduced.locator('[data-tag-patterns-trade]')).toHaveCount(1);
  await expect(riskReduced.locator('[data-tag-patterns-trade]')).toContainText("AAPL");

  const focused = page.locator("[data-emotion-patterns-group-index]")
    .filter({ has: page.locator("summary", { hasText: "Focused" }) });
  await focused.locator("summary").click();
  const emotionAction = focused.getByRole("button", {
    name: /Open AAPL trade for saved emotion Focused/u,
  });
  await emotionAction.click();
  const emotionDialog = page.getByRole("dialog", {
    name: /AAPL trade review/u,
  });
  await expect(emotionDialog.locator("[data-trade-review-report-context]"))
    .toHaveText(
      "Opened from Emotion patterns. This full-workspace report does not use or change your Trades filters.",
    );
  await emotionDialog.locator("#review-emotion").fill("Calm");
  await emotionDialog.getByRole("button", { name: "Save review changes" }).click();

  await expect(emotionDialog).toHaveCount(0);
  await expect(page.locator("#emotion-patterns-title")).toBeFocused();
  const emotionSection = page.locator("[data-emotion-patterns]");
  await expect(emotionSection.getByText("2 trades of 2 trades", { exact: true }))
    .toBeVisible();
  const calm = emotionSection.locator("[data-emotion-patterns-group-index]")
    .filter({ has: page.locator("summary", { hasText: "Calm" }) });
  const retainedFocused = emotionSection.locator("[data-emotion-patterns-group-index]")
    .filter({ has: page.locator("summary", { hasText: "Focused" }) });
  await expect(calm.locator('[data-emotion-patterns-trade]')).toHaveCount(1);
  await expect(calm.locator('[data-emotion-patterns-trade]')).toContainText("AAPL");
  await expect(retainedFocused.locator('[data-emotion-patterns-trade]')).toHaveCount(1);
  await expect(retainedFocused.locator('[data-emotion-patterns-trade]')).toContainText("MSFT");
});

test("a proven batch tag commit retries only the failed journal refresh", async ({ page, context }) => {
  const externalRequests = logExternalRequests(page);
  await page.setViewportSize({ width: 320, height: 568 });
  await importTwoClosedTrades(page);
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  const before = reviewArchiveData(await exportJournal(page));
  const executionStateBefore = {
    activeExecutions: before.activeExecutions,
    inactiveExecutions: before.inactiveExecutions,
    receipts: before.receipts,
    receiptByRevision: before.receiptByRevision,
    manualSubmissions: before.manualSubmissions,
    nextExecutionSequence: before.counters.nextExecutionSequence,
    nextReceiptOrdinal: before.counters.nextReceiptOrdinal,
  };
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await installPreparedReviewCounters(page);
  await context.setOffline(true);

  const subjects = page.locator("[data-batch-review-subject]");
  await expect(subjects).toHaveCount(2);
  const selectedSubjectIds = await subjects.evaluateAll((elements) => (
    elements.map((element) => (element as HTMLInputElement).value)
  ));
  for (const subject of await subjects.all()) await subject.check();
  const submit = page.getByRole("button", { name: "Apply tag to selected" });
  await submit.click();
  const preparationError = page.locator("#batch-review-error");
  await expect(preparationError).toBeVisible();
  await expect(preparationError).toBeFocused();
  await expect(page.locator("#batch-review-refresh-recovery")).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/modal-open/u);
  await expect(page.locator("#batch-review-tag")).toBeEnabled();
  await expect(submit).toBeEnabled();
  for (const subject of await subjects.all()) await expect(subject).toBeEnabled();
  await resetPreparedReviewProbe(page);
  await page.locator("#batch-review-tag").fill("Earnings day");

  const privateDetail = "/private/journals/kevin.db injected batch refresh failure";
  await page.evaluate((detail) => {
    const mapDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, "get");
    const originalMapGet = mapDescriptor?.value as (
      (this: Map<unknown, unknown>, key: unknown) => unknown
    ) | undefined;
    if (mapDescriptor === undefined || originalMapGet === undefined) {
      throw new Error("Map.prototype.get is not instrumentable.");
    }
    const root = document.documentElement;
    root.dataset.batchCommitMapReads = "0";
    Object.defineProperty(Map.prototype, "get", {
      ...mapDescriptor,
      value(this: Map<unknown, unknown>, key: unknown) {
        if ((new Error().stack ?? "").includes("commitTradeReviews")) {
          const reads = Number(root.dataset.batchCommitMapReads ?? "0") + 1;
          root.dataset.batchCommitMapReads = String(reads);
        }
        return originalMapGet.call(this, key);
      },
    });

    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    const getter = descriptor?.get;
    const setter = descriptor?.set;
    if (descriptor === undefined || getter === undefined || setter === undefined) {
      throw new Error("Element.innerHTML is not instrumentable.");
    }
    root.dataset.batchRefreshRenderFailures = "0";
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: getter,
      set(this: Element, value: string) {
        if (this.id === "screen") {
          const failures = Number(root.dataset.batchRefreshRenderFailures ?? "0") + 1;
          root.dataset.batchRefreshRenderFailures = String(failures);
          if (failures === 2) {
            Object.defineProperty(Element.prototype, "innerHTML", descriptor);
          }
          throw new Error(`${detail} ${failures}`);
        }
        setter.call(this, value);
      },
    });
  }, privateDetail);

  await submit.click();
  const recovery = page.getByRole("alertdialog", { name: "Batch tag saved" });
  const status = recovery.locator("#batch-review-refresh-status");
  const retry = recovery.getByRole("button", { name: "Retry journal refresh" });
  await expect(recovery).toBeVisible();
  await expect(recovery).toContainText("Do not apply the tag again");
  await expect(status).toContainText("selected review updates remain");
  await expect(status).not.toContainText(privateDetail);
  await expect(status).toBeFocused();
  await expect(retry).toBeEnabled();
  await expect(page.locator("#screen")).toHaveAttribute("inert", "");
  await expect(page.locator("#screen")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("body")).toHaveClass(/modal-open/u);
  await expect(page.locator("#batch-review-form")).toHaveAttribute("aria-busy", "false");
  await expect(page.locator("#batch-review-tag")).toBeDisabled();
  await expect(page.locator("#batch-review-form button[type='submit']")).toBeDisabled();
  for (const subject of await subjects.all()) await expect(subject).toBeDisabled();
  const enabledRecoveryControls = await recovery
    .locator("button:visible, input:visible, textarea:visible, select:visible")
    .evaluateAll((elements) => elements
      .filter((element) => !(
        element as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      ).disabled)
      .map((element) => element.id));
  expect(enabledRecoveryControls).toEqual(["batch-review-refresh-retry"]);
  const overflow = await recovery.evaluate((element) => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    sheet: element.scrollWidth - element.clientWidth,
    right: Math.ceil(element.getBoundingClientRect().right - window.innerWidth),
  }));
  expect(overflow.document).toBeLessThanOrEqual(1);
  expect(overflow.sheet).toBeLessThanOrEqual(1);
  expect(overflow.right).toBeLessThanOrEqual(0);
  const retryBox = await retry.boundingBox();
  expect(retryBox, "refresh retry should have a layout box").not.toBeNull();
  expect(retryBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(retryBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Escape");
  await expect(recovery).toBeVisible();
  await page.locator("#batch-review-refresh-recovery").dispatchEvent("click");
  await expect(recovery).toBeVisible();

  const initialCommit = await preparedReviewProbe(page);
  expect(initialCommit.commands).toHaveLength(2);
  expect(initialCommit.randomIds.length).toBeGreaterThanOrEqual(
    initialCommit.commands.length,
  );
  expect(Number(await page.evaluate(() => (
    document.documentElement.dataset.batchCommitMapReads
  )))).toBeGreaterThan(0);
  await resetPreparedReviewProbe(page);
  await page.evaluate(() => {
    document.documentElement.dataset.batchCommitMapReads = "0";
  });

  await page.locator("#batch-review-form").evaluate((element) => {
    element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  expect(await preparedReviewProbe(page)).toEqual({ commands: [], randomIds: [] });
  expect(await page.evaluate(() => (
    document.documentElement.dataset.batchCommitMapReads
  ))).toBe("0");

  const pendingRetry = await retry.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
    const sheet = button.closest<HTMLElement>(".batch-review-refresh-sheet");
    if (sheet === null) throw new Error("Batch refresh sheet is missing.");
    const tabAllowed = sheet.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Tab",
      bubbles: true,
      cancelable: true,
    }));
    return {
      activeIsSheet: document.activeElement === sheet,
      retryDisabled: (button as HTMLButtonElement).disabled,
      retryHidden: (button as HTMLButtonElement).hidden,
      tabAllowed,
    };
  });
  expect(pendingRetry).toEqual({
    activeIsSheet: true,
    retryDisabled: true,
    retryHidden: true,
    tabAllowed: false,
  });
  await expect(status).toContainText("selected review updates remain");
  await expect(status).toBeFocused();
  await expect(retry).toBeEnabled();
  expect(await page.evaluate(() => (
    document.documentElement.dataset.batchRefreshRenderFailures
  ))).toBe("2");
  expect(await preparedReviewProbe(page)).toEqual({ commands: [], randomIds: [] });
  expect(await page.evaluate(() => (
    document.documentElement.dataset.batchCommitMapReads
  ))).toBe("0");

  await retry.click();
  await expect(recovery).toHaveCount(0);
  await expect(page.locator("#review-queue-group-draft-title")).toBeFocused();
  await expect(page.locator("#route-announcer")).toHaveText(
    "Earnings day added to 2 trades in one atomic review batch.",
  );
  expect(await preparedReviewProbe(page)).toEqual({ commands: [], randomIds: [] });
  expect(await page.evaluate(() => (
    document.documentElement.dataset.batchCommitMapReads
  ))).toBe("0");
  await expect(page.locator("body")).not.toHaveClass(/modal-open/u);
  await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
  await expect(page.locator("#screen")).not.toHaveAttribute("aria-hidden", "true");

  const data = reviewArchiveData(await exportJournal(page));
  expect({
    activeExecutions: data.activeExecutions,
    inactiveExecutions: data.inactiveExecutions,
    receipts: data.receipts,
    receiptByRevision: data.receiptByRevision,
    manualSubmissions: data.manualSubmissions,
    nextExecutionSequence: data.counters.nextExecutionSequence,
    nextReceiptOrdinal: data.counters.nextReceiptOrdinal,
  }).toEqual(executionStateBefore);
  expect(data.reviewVersions).toHaveLength(2);
  const reviewsBySubject = new Map(data.reviewVersions.map((review) => (
    [review.tradeSubjectId, review] as const
  )));
  expect([...reviewsBySubject.keys()].sort()).toEqual([...selectedSubjectIds].sort());
  const heads = new Map(data.reviewHeads);
  expect([...heads.keys()].sort()).toEqual([...selectedSubjectIds].sort());
  for (const tradeSubjectId of selectedSubjectIds) {
    const review = reviewsBySubject.get(tradeSubjectId);
    expect(review).toMatchObject({
      tradeSubjectId,
      version: 1,
      state: "draft",
      tags: ["Earnings day"],
    });
    if (review === undefined) throw new Error(`Missing review for ${tradeSubjectId}.`);
    expect(review.tags).toEqual(["Earnings day"]);
    expect(heads.get(tradeSubjectId)).toBe(review.id);
    const submissions = data.reviewSubmissions.filter(([, receipt]) => (
      receipt.reviewId === review.id
    ));
    expect(submissions).toHaveLength(1);
    expect(submissions[0]?.[0]).toMatch(/^[a-f0-9]{64}$/u);
    expect(submissions[0]?.[1].revision).toBe(review.revision);
  }
  expect(data.reviewSubmissions).toHaveLength(2);
  expect(externalRequests).toEqual([]);
});

test("trade review contains reverse focus from its initially focused title", async ({ page }) => {
  await importTwoClosedTrades(page);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  const dialog = await openTradeReview(page, "AAPL");
  await expect(dialog.getByRole("heading", { name: "AAPL trade review" })).toBeFocused();

  await page.keyboard.press("Shift+Tab");

  const focusRemainsInDialog = await dialog.evaluate((element) => (
    element.contains(document.activeElement)
  ));
  expect(focusRemainsInDialog).toBe(true);
});

test("changing playbooks confirms before replacing dirty rule work", async ({ page }) => {
  await importTwoClosedTrades(page);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await completeReview(page, "AAPL", "5");

  const dialog = await openTradeReview(page, "MSFT");
  const playbook = dialog.locator("#review-playbook");
  await playbook.fill("Custom review");
  await playbook.blur();
  await dialog.getByRole("button", { name: "Add rule" }).click();
  const ruleName = dialog.locator('input[name="review-rule-name"]').last();
  const ruleOutcome = dialog.locator('select[name="review-rule-outcome"]').last();
  await ruleName.fill("Keep this custom rule");
  await ruleOutcome.selectOption("broken");

  await changePlaybookWithConfirmation(page, playbook, "Momentum", "dismiss");
  await expect(playbook).toHaveValue("Custom review");
  await expect(ruleName).toHaveValue("Keep this custom rule");
  await expect(ruleOutcome).toHaveValue("broken");

  await changePlaybookWithConfirmation(page, playbook, "Momentum", "accept");
  await expect(playbook).toHaveValue("Momentum");
  await expect(dialog.locator('input[name="review-rule-name"]')).toHaveCount(1);
  await expect(dialog.locator('input[name="review-rule-name"]')).toHaveValue(
    "Wait for confirmation",
  );
  await expect(dialog.locator('select[name="review-rule-outcome"]')).toHaveValue("unreviewed");
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
] as const) {
  test(`trade review reflows without internal horizontal scrolling at 200% text and ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await importTwoClosedTrades(page);
    await page.getByRole("button", { name: "Trades", exact: true }).click();
    await page.evaluate(() => {
      document.documentElement.dataset.testTextScale = "200";
    });
    const dialog = await openTradeReview(page, "AAPL");
    await dialog.getByRole("button", { name: "Add rule" }).click();
    await dialog.locator('input[name="review-rule-name"]').last().fill("Wait for confirmation");
    await dialog.locator('select[name="review-rule-outcome"]').last()
      .selectOption("not_applicable");

    const dimensions = await dialog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      offenders: Array.from(element.querySelectorAll<HTMLElement>("*"))
        .map((candidate) => ({
          element: `${candidate.tagName.toLowerCase()}${candidate.id ? `#${candidate.id}` : ""}${Array.from(candidate.classList, (name) => `.${name}`).join("")}`,
          clientWidth: candidate.clientWidth,
          scrollWidth: candidate.scrollWidth,
          right: Math.round(candidate.getBoundingClientRect().right),
        }))
        .filter((candidate) => (
          candidate.scrollWidth > candidate.clientWidth
          || candidate.right > Math.round(element.getBoundingClientRect().right)
        )),
    }));
    expect(dimensions.scrollWidth, JSON.stringify(dimensions))
      .toBeLessThanOrEqual(dimensions.clientWidth);
  });
}

test("review controls expose the trade or rule they act on", async ({ page }) => {
  await importTwoClosedTrades(page);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(tradeCard(page, "AAPL").locator("[data-review-trade]")).toHaveAccessibleName(
    /^(?=.*\breview\b)(?=.*\bAAPL\b).*$/iu,
  );
  await expect(tradeCard(page, "MSFT").locator("[data-review-trade]")).toHaveAccessibleName(
    /^(?=.*\breview\b)(?=.*\bMSFT\b).*$/iu,
  );

  await page.getByRole("button", { name: "Journal", exact: true }).click();
  for (const symbol of ["AAPL", "MSFT"]) {
    const queueItem = page.locator(".review-queue-item").filter({
      has: page.getByRole("heading", { name: symbol, exact: true }),
    });
    await expect(queueItem.getByRole("checkbox")).toHaveAccessibleName(
      new RegExp(`^(?=.*\\bselect\\b)(?=.*\\b${symbol}\\b).*$`, "iu"),
    );
    await expect(queueItem.locator("[data-review-trade]")).toHaveAccessibleName(
      new RegExp(`^(?=.*\\breview\\b)(?=.*\\b${symbol}\\b).*$`, "iu"),
    );
  }

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  const dialog = await openTradeReview(page, "AAPL");
  for (const rule of ["Wait for confirmation", "Respect the planned stop"]) {
    await dialog.getByRole("button", { name: "Add rule" }).click();
    await dialog.locator('input[name="review-rule-name"]').last().fill(rule);
  }
  const removeButtons = dialog.locator("[data-review-rule-remove]");
  await expect(removeButtons.nth(0)).toHaveAccessibleName(
    /^(?=.*\bremove\b)(?=.*\brule\b)(?=.*\bWait for confirmation\b).*$/iu,
  );
  await expect(removeButtons.nth(1)).toHaveAccessibleName(
    /^(?=.*\bremove\b)(?=.*\brule\b)(?=.*\bRespect the planned stop\b).*$/iu,
  );
  const outcomeControls = dialog.locator('select[name="review-rule-outcome"]');
  await expect(outcomeControls.nth(0)).toHaveAccessibleName(
    /^(?=.*\boutcome\b)(?=.*\bWait for confirmation\b).*$/iu,
  );
  await expect(outcomeControls.nth(1)).toHaveAccessibleName(
    /^(?=.*\boutcome\b)(?=.*\bRespect the planned stop\b).*$/iu,
  );

  await removeButtons.nth(1).click();
  await expect(dialog.locator('input[name="review-rule-name"]').first()).toBeFocused();
  await dialog.locator("[data-review-rule-remove]").click();
  await expect(dialog.getByRole("button", { name: "Add rule" })).toBeFocused();
});

test("trade review disables every form control while its save is pending", async ({ page }) => {
  await importTwoClosedTrades(page);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  const dialog = await openTradeReview(page, "AAPL");
  await dialog.locator("#review-note").fill("A pending save must freeze this exact form snapshot.");

  const pendingState = await dialog.getByRole("button", { name: "Save draft" })
    .evaluate((element) => {
      (element as HTMLButtonElement).click();
      const sheet = document.querySelector<HTMLElement>(".trade-review-sheet");
      const controls = Array.from(document.querySelectorAll<HTMLElement>(
        ".trade-review-sheet button, .trade-review-sheet input, .trade-review-sheet select, .trade-review-sheet textarea",
      ));
      return {
        connected: sheet?.isConnected ?? false,
        busy: sheet?.getAttribute("aria-busy"),
        enabledControls: controls
          .filter((control) => !control.matches(":disabled"))
          .map((control) => control.id || control.getAttribute("name") || control.textContent?.trim()),
      };
    });

  expect(pendingState).toEqual({ connected: true, busy: "true", enabledControls: [] });
  await expect(dialog).toHaveCount(0);
});

test("an uncertain trade review replays only its exact frozen batch until commit is proven", async ({ page, context }) => {
  const externalRequests = logExternalRequests(page);
  await importTwoClosedTrades(page);
  await context.setOffline(true);
  const dashboardHeading = page.locator("#dashboard-review-progress-title");
  const dashboardAction = page.locator(
    '[data-dashboard-review-progress] button[data-trade-review-origin="dashboard-review-progress"]',
  );
  await expect(dashboardAction)
    .toHaveAccessibleName(/Review next trade for AAPL Stock/u);
  await dashboardAction.click();
  const dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await expect(dialog).toBeVisible();
  const localDraft = {
    setup: "Exact opening range",
    emotion: "Alert",
    mistakes: "Entered early, Chased",
    tags: "Exact retry, Preserve me",
    risk: "5",
    stop: "95",
    playbook: "Recovery plan",
    rule: "Wait for the exact confirmation",
    note: "This in-memory review must survive every ambiguous response.",
  };
  await dialog.locator("#review-setup").fill(localDraft.setup);
  await dialog.locator("#review-emotion").fill(localDraft.emotion);
  await dialog.locator("#review-mistakes").fill(localDraft.mistakes);
  await dialog.locator("#review-tags").fill(localDraft.tags);
  await dialog.locator("#review-risk").fill(localDraft.risk);
  await dialog.locator("#review-stop").fill(localDraft.stop);
  await dialog.locator("#review-playbook").fill(localDraft.playbook);
  await dialog.getByRole("button", { name: "Add rule" }).click();
  await dialog.locator('input[name="review-rule-name"]').last().fill(localDraft.rule);
  await dialog.locator('select[name="review-rule-outcome"]').last().selectOption("followed");
  await dialog.locator("#review-note").fill(localDraft.note);

  const privateDetail = "/private/journals/kevin.db trade review response disappeared";
  await page.evaluate((detail) => {
    const originalNow = Date.now.bind(Date);
    let failuresRemaining = 4;
    document.documentElement.dataset.reviewClockFailures = "0";
    Object.defineProperty(Date, "now", {
      configurable: true,
      value: () => {
        const stack = new Error().stack ?? "";
        if (
          failuresRemaining > 0
          && /commit(?:TradeReviews|ReviewsSafely)/u.test(stack)
        ) {
          failuresRemaining -= 1;
          const failures = Number(
            document.documentElement.dataset.reviewClockFailures ?? "0",
          ) + 1;
          document.documentElement.dataset.reviewClockFailures = String(failures);
          throw new Error(detail);
        }
        return originalNow();
      },
    });
  }, privateDetail);

  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.dataset.reviewClockFailures
  ))).toBe("2");
  const error = dialog.locator("#trade-review-error");
  const exactRetry = dialog.getByRole("button", { name: "Retry this exact save" });
  await expect(error).toContainText("retry the same save");
  await expect(error).not.toContainText(privateDetail);
  await expect(error).toBeFocused();
  await expect(dialog).toHaveAttribute("aria-busy", "false");
  await expect(exactRetry).toBeEnabled();
  const enabledControls = await dialog
    .locator("button:visible, input:visible, textarea:visible, select:visible")
    .evaluateAll((elements) => elements
      .filter((element) => !(
        element as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      ).disabled)
      .map((element) => element.id));
  expect(enabledControls).toEqual(["trade-review-reconcile"]);
  await page.keyboard.press("Tab");
  await expect(exactRetry).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(exactRetry).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.locator("[data-trade-review-backdrop]").click({ position: { x: 2, y: 2 } });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Close trade review" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();

  await installPreparedReviewCounters(page);
  const pendingRetry = await exactRetry.evaluate((element) => {
    (element as HTMLButtonElement).click();
    (element as HTMLButtonElement).click();
    const sheet = document.querySelector<HTMLElement>(".trade-review-sheet");
    const controls = Array.from(document.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >(".trade-review-sheet button, .trade-review-sheet input, .trade-review-sheet textarea, .trade-review-sheet select"));
    return {
      busy: sheet?.getAttribute("aria-busy"),
      enabled: controls.filter((control) => !control.disabled).length,
      focusInDialog: sheet?.contains(document.activeElement) ?? false,
    };
  });
  expect(pendingRetry).toEqual({ busy: "true", enabled: 0, focusInDialog: true });
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.dataset.reviewClockFailures
  ))).toBe("4");
  await expect(error).toContainText("still could not confirm");
  await expect(error).toContainText("form remains locked");
  await expect(error).not.toContainText(privateDetail);
  await expect(error).toBeFocused();
  expect(await preparedReviewCounters(page)).toEqual({
    valueReads: "0",
    randomIds: "0",
  });
  await expect(dialog.locator("#review-setup")).toHaveValue(localDraft.setup);
  await expect(dialog.locator("#review-emotion")).toHaveValue(localDraft.emotion);
  await expect(dialog.locator("#review-mistakes")).toHaveValue(localDraft.mistakes);
  await expect(dialog.locator("#review-tags")).toHaveValue(localDraft.tags);
  await expect(dialog.locator("#review-risk")).toHaveValue(localDraft.risk);
  await expect(dialog.locator("#review-stop")).toHaveValue(localDraft.stop);
  await expect(dialog.locator("#review-playbook")).toHaveValue(localDraft.playbook);
  await expect(dialog.locator('input[name="review-rule-name"]')).toHaveValue(localDraft.rule);
  await expect(dialog.locator('select[name="review-rule-outcome"]')).toHaveValue("followed");
  await expect(dialog.locator("#review-note")).toHaveValue(localDraft.note);

  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => { document.documentElement.dataset.testTextScale = "200"; });
  const uncertainDimensions = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(uncertainDimensions.scrollWidth, JSON.stringify(uncertainDimensions))
    .toBeLessThanOrEqual(uncertainDimensions.clientWidth);
  expect(uncertainDimensions.documentOverflow, JSON.stringify(uncertainDimensions))
    .toBeLessThanOrEqual(1);
  const retryBox = await exactRetry.boundingBox();
  expect(retryBox).not.toBeNull();
  expect(retryBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(retryBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { delete document.documentElement.dataset.testTextScale; });

  await exactRetry.click();
  await expect(dialog).toHaveCount(0);
  expect(await preparedReviewCounters(page)).toEqual({
    valueReads: "0",
    randomIds: "0",
  });
  await expect(page.locator("#route-announcer")).toHaveText("AAPL review completed.");
  await expect(dashboardHeading).toBeFocused();
  await expect(dashboardHeading).toHaveText("1 review waiting");
  await expect(dashboardAction)
    .toHaveAccessibleName(/Review next trade for MSFT Stock/u);

  const data = reviewArchiveData(await exportJournal(page));
  expect(data.reviewVersions).toEqual([
    expect.objectContaining({
      version: 1,
      state: "completed",
      note: localDraft.note,
      setup: localDraft.setup,
      mistakes: ["Entered early", "Chased"],
      emotion: localDraft.emotion,
      tags: ["Exact retry", "Preserve me"],
      playbookName: localDraft.playbook,
      rules: [expect.objectContaining({
        text: localDraft.rule,
        outcome: "followed",
      })],
      initialRisk: { amount: localDraft.risk, currency: "USD" },
      plannedStop: localDraft.stop,
    }),
  ]);
  const saved = data.reviewVersions[0];
  if (saved === undefined) throw new Error("Expected one exact recovered review.");
  expect(data.reviewHeads).toEqual([[saved.tradeSubjectId, saved.id]]);
  expect(data.reviewSubmissions).toEqual([
    [expect.any(String), { reviewId: saved.id, revision: expect.any(String) }],
  ]);
  expect(externalRequests).toEqual([]);
});

test("a stale review proves exact newer heads and appends the complete local form only after each consent", async ({ page, context }) => {
  const externalRequests = logExternalRequests(page);
  await importTwoClosedTrades(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Trades", exact: true }).click();

  let dialog = await openTradeReview(page, "AAPL");
  await dialog.locator("#review-setup").fill("Original saved setup");
  await dialog.locator("#review-tags").fill("Original");
  await dialog.locator("#review-note").fill("Original immutable review version.");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(dialog).toHaveCount(0);

  await installPreparedReviewCounters(page);
  dialog = await openTradeReview(page, "AAPL");
  const localDraft = {
    setup: "Preserve this local setup",
    emotion: "Focused",
    mistakes: "Entered early, Chased",
    tags: "Local only, Do not overwrite",
    risk: "125.50",
    stop: "94.25",
    playbook: "Local recovery plan",
    firstRule: "Keep the original rule",
    note: "This raw review must survive a deterministic newer head.",
  };
  const expectCompleteRawLocalDraft = async (target: Locator) => {
    await expect(target.locator("#review-setup")).toHaveValue(localDraft.setup);
    await expect(target.locator("#review-emotion")).toHaveValue(localDraft.emotion);
    await expect(target.locator("#review-mistakes")).toHaveValue(localDraft.mistakes);
    await expect(target.locator("#review-tags")).toHaveValue(localDraft.tags);
    await expect(target.locator("#review-risk")).toHaveValue(localDraft.risk);
    await expect(target.locator("#review-risk-currency")).toHaveValue("USD");
    await expect(target.locator("#review-stop")).toHaveValue(localDraft.stop);
    await expect(target.locator("#review-playbook")).toHaveValue(localDraft.playbook);
    await expect(target.locator('input[name="review-rule-name"]')).toHaveCount(2);
    await expect(target.locator('input[name="review-rule-name"]').nth(0))
      .toHaveValue(localDraft.firstRule);
    await expect(target.locator('select[name="review-rule-outcome"]').nth(0))
      .toHaveValue("broken");
    await expect(target.locator('input[name="review-rule-name"]').nth(1)).toHaveValue("");
    await expect(target.locator('select[name="review-rule-outcome"]').nth(1))
      .toHaveValue("unreviewed");
    await expect(target.locator("#review-note")).toHaveValue(localDraft.note);
  };
  await dialog.locator("#review-setup").fill(localDraft.setup);
  await dialog.locator("#review-emotion").fill(localDraft.emotion);
  await dialog.locator("#review-mistakes").fill(localDraft.mistakes);
  await dialog.locator("#review-tags").fill(localDraft.tags);
  await dialog.locator("#review-risk").fill(localDraft.risk);
  await dialog.locator("#review-risk-currency").selectOption("USD");
  await dialog.locator("#review-stop").fill(localDraft.stop);
  await dialog.locator("#review-playbook").fill(localDraft.playbook);
  await dialog.getByRole("button", { name: "Add rule" }).click();
  await dialog.locator('input[name="review-rule-name"]').last().fill(localDraft.firstRule);
  await dialog.locator('select[name="review-rule-outcome"]').last().selectOption("broken");
  await dialog.getByRole("button", { name: "Add rule" }).click();
  await dialog.locator("#review-note").fill(localDraft.note);

  const privateDetail = "/private/journals/kevin.db pre-mutation review failure";
  await page.evaluate((detail) => {
    const originalNow = Date.now.bind(Date);
    let failuresRemaining = 2;
    document.documentElement.dataset.reviewClockFailures = "0";
    Object.defineProperty(Date, "now", {
      configurable: true,
      value: () => {
        const stack = new Error().stack ?? "";
        if (
          failuresRemaining > 0
          && /commit(?:TradeReviews|ReviewsSafely)/u.test(stack)
        ) {
          failuresRemaining -= 1;
          const failures = Number(
            document.documentElement.dataset.reviewClockFailures ?? "0",
          ) + 1;
          document.documentElement.dataset.reviewClockFailures = String(failures);
          throw new Error(detail);
        }
        return originalNow();
      },
    });
  }, privateDetail);
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  const error = dialog.locator("#trade-review-error");
  await expect(error).toContainText("retry the same save");
  await expect(error).not.toContainText(privateDetail);
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.dataset.reviewClockFailures
  ))).toBe("2");
  const initialPreparedProbe = await preparedReviewProbe(page);
  const initialPreparedCommands = initialPreparedProbe.commands.filter((command) => (
    command.note === localDraft.note
  ));
  expect(initialPreparedCommands).toHaveLength(1);
  const initialPrepared = initialPreparedCommands[0];
  if (initialPrepared === undefined) {
    throw new Error("Expected the original retained prepared review.");
  }
  expect(initialPreparedProbe.randomIds).toHaveLength(2);
  expect(initialPrepared.submissionId).toBe(initialPreparedProbe.randomIds[0]);

  const uncertainBackdrop = await page.locator("[data-trade-review-backdrop]")
    .elementHandle();
  if (uncertainBackdrop === null) throw new Error("Expected the uncertain review editor.");
  await uncertainBackdrop.evaluate((element) => {
    element.remove();
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.removeAttribute("inert");
      background.removeAttribute("aria-hidden");
    });
  });

  const competingDialog = await openTradeReview(page, "AAPL");
  const competingVersionTwo = {
    setup: "Competing <saved> setup",
    emotion: "Calm",
    mistakes: "Ignored volume",
    tags: "Competing, Saved elsewhere",
    risk: "200",
    stop: "92",
    playbook: "Competing plan",
    rule: "Wait for <volume>",
    note: "Another editor committed the completed second immutable review.",
  };
  await competingDialog.locator("#review-setup").fill(competingVersionTwo.setup);
  await competingDialog.locator("#review-emotion").fill("Calm");
  await competingDialog.locator("#review-mistakes").fill(competingVersionTwo.mistakes);
  await competingDialog.locator("#review-tags").fill(competingVersionTwo.tags);
  await competingDialog.locator("#review-risk").fill(competingVersionTwo.risk);
  await competingDialog.locator("#review-stop").fill(competingVersionTwo.stop);
  await competingDialog.locator("#review-playbook").fill(competingVersionTwo.playbook);
  await competingDialog.getByRole("button", { name: "Add rule" }).click();
  await competingDialog.locator('input[name="review-rule-name"]')
    .last().fill(competingVersionTwo.rule);
  await competingDialog.locator('select[name="review-rule-outcome"]')
    .last().selectOption("followed");
  await competingDialog.locator("#review-note").fill(competingVersionTwo.note);
  await competingDialog.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(competingDialog).toHaveCount(0);
  await resetPreparedReviewProbe(page);

  await uncertainBackdrop.evaluate((element) => {
    const root = document.querySelector("#app");
    if (root === null) throw new Error("Hermes root is unavailable.");
    root.append(element);
    document.body.classList.add("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.setAttribute("inert", "");
      background.setAttribute("aria-hidden", "true");
    });
    element.querySelector<HTMLElement>("#trade-review-error")?.focus();
  });

  dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await dialog.getByRole("button", { name: "Retry this exact save" }).click();
  await expect(error).toContainText("Nothing was overwritten");
  await expect(error).toContainText("unsaved changes are still here");
  await expect(error).toContainText("Review the latest saved version");
  await expect(error).not.toContainText(privateDetail);
  await expect(error).toBeFocused();
  await expect(dialog.locator("#review-setup")).toHaveValue(localDraft.setup);
  await expect(dialog.locator("#review-emotion")).toHaveValue(localDraft.emotion);
  await expect(dialog.locator("#review-mistakes")).toHaveValue(localDraft.mistakes);
  await expect(dialog.locator("#review-tags")).toHaveValue(localDraft.tags);
  await expect(dialog.locator("#review-risk")).toHaveValue(localDraft.risk);
  await expect(dialog.locator("#review-risk-currency")).toHaveValue("USD");
  await expect(dialog.locator("#review-stop")).toHaveValue(localDraft.stop);
  await expect(dialog.locator("#review-playbook")).toHaveValue(localDraft.playbook);
  await expect(dialog.locator('input[name="review-rule-name"]')).toHaveCount(2);
  await expect(dialog.locator('input[name="review-rule-name"]').nth(0))
    .toHaveValue(localDraft.firstRule);
  await expect(dialog.locator('select[name="review-rule-outcome"]').nth(0))
    .toHaveValue("broken");
  await expect(dialog.locator('input[name="review-rule-name"]').nth(1)).toHaveValue("");
  await expect(dialog.locator('select[name="review-rule-outcome"]').nth(1))
    .toHaveValue("unreviewed");
  for (const removeRule of await dialog.locator("[data-review-rule-remove]").all()) {
    await expect(removeRule).toBeEnabled();
  }
  await expect(dialog.locator("#review-note")).toHaveValue(localDraft.note);
  await expect(dialog.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Mark reviewed" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Close trade review" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Retry this exact save" })).toBeHidden();
  const reviewLatest = dialog.getByRole("button", { name: "Review latest saved version" });
  await expect(reviewLatest).toBeEnabled();
  await dialog.press("Escape");
  await expect(dialog).toBeVisible();
  await page.locator("[data-trade-review-backdrop]").dispatchEvent("click");
  await expect(dialog).toBeVisible();
  expect(await preparedReviewCounters(page)).toEqual({
    valueReads: "0",
    randomIds: "0",
  });

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
          throw new Error("Injected one-shot trade review refresh failure.");
        }
        setter.call(this, value);
      },
    });
  });
  await reviewLatest.click();
  await expect(error).toContainText("could not prove one different newer saved review");
  await expect(error).not.toContainText("Injected one-shot");
  await expect(error).toBeFocused();
  await expect(dialog.locator("#trade-review-latest")).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Continue with my unsaved review" }))
    .toBeHidden();
  await expect(reviewLatest).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Close trade review" })).toBeDisabled();
  await expect(dialog.locator("#review-setup")).toHaveValue(localDraft.setup);
  await expect(dialog.locator("#review-emotion")).toHaveValue(localDraft.emotion);
  await expect(dialog.locator("#review-mistakes")).toHaveValue(localDraft.mistakes);
  await expect(dialog.locator("#review-tags")).toHaveValue(localDraft.tags);
  await expect(dialog.locator("#review-risk")).toHaveValue(localDraft.risk);
  await expect(dialog.locator("#review-stop")).toHaveValue(localDraft.stop);
  await expect(dialog.locator("#review-playbook")).toHaveValue(localDraft.playbook);
  await expect(dialog.locator("#review-note")).toHaveValue(localDraft.note);
  const failedProofCounters = await preparedReviewCounters(page);
  expect(Number(failedProofCounters.valueReads)).toBeGreaterThan(0);
  expect(failedProofCounters.randomIds).toBe("0");

  await reviewLatest.click();
  const latest = dialog.locator("#trade-review-latest");
  const acceptLatest = dialog.getByRole("button", { name: "Continue with my unsaved review" });
  await expect(latest).toBeFocused();
  await expect(latest).toHaveCSS("outline-style", "solid");
  await expect(latest).toHaveCSS("outline-width", "2px");
  await expect(latest).toContainText("Version 2 · completed");
  await expect(latest).toContainText("Primary brokerage");
  await expect(latest).toContainText(competingVersionTwo.setup);
  await expect(latest).toContainText(competingVersionTwo.note);
  await expect(latest).toContainText(competingVersionTwo.mistakes);
  await expect(latest).toContainText("Competing, Saved elsewhere");
  await expect(latest).toContainText(competingVersionTwo.playbook);
  await expect(latest).toContainText(competingVersionTwo.rule);
  await expect(latest).toContainText("Followed");
  await expect(latest).toContainText("200 USD");
  await expect(latest).toContainText("92");
  const latestValue = (label: string) => latest.locator("dt", {
    hasText: label,
  }).locator("xpath=following-sibling::dd");
  await expect(latestValue("Execution allocations")).toHaveText("2");
  await expect(latestValue("Result R")).toHaveText("0.05R");
  await expect(latestValue("Percent return")).toHaveText("10%");
  const versionTwoEvidenceMarkup = await latest.evaluate((element) => element.innerHTML);
  expect(versionTwoEvidenceMarkup).not.toContain("session-review:");
  await expect(dialog.locator("#review-setup")).toHaveValue(localDraft.setup);
  await expect(dialog.locator("#review-emotion")).toHaveValue(localDraft.emotion);
  await expect(dialog.locator("#review-mistakes")).toHaveValue(localDraft.mistakes);
  await expect(dialog.locator("#review-tags")).toHaveValue(localDraft.tags);
  await expect(dialog.locator("#review-risk")).toHaveValue(localDraft.risk);
  await expect(dialog.locator("#review-risk-currency")).toHaveValue("USD");
  await expect(dialog.locator("#review-stop")).toHaveValue(localDraft.stop);
  await expect(dialog.locator("#review-playbook")).toHaveValue(localDraft.playbook);
  await expect(dialog.locator('input[name="review-rule-name"]')).toHaveCount(2);
  await expect(dialog.locator('input[name="review-rule-name"]').nth(0))
    .toHaveValue(localDraft.firstRule);
  await expect(dialog.locator('select[name="review-rule-outcome"]').nth(0))
    .toHaveValue("broken");
  await expect(dialog.locator('input[name="review-rule-name"]').nth(1)).toHaveValue("");
  await expect(dialog.locator('select[name="review-rule-outcome"]').nth(1))
    .toHaveValue("unreviewed");
  await expect(dialog.locator("#review-note")).toHaveValue(localDraft.note);
  await expect(dialog.getByRole("button", { name: "Mark reviewed" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Close trade review" })).toBeEnabled();
  await page.keyboard.press("Tab");
  await expect(acceptLatest).toBeFocused();

  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  const conflictDimensions = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(conflictDimensions.scrollWidth, JSON.stringify(conflictDimensions))
    .toBeLessThanOrEqual(conflictDimensions.clientWidth);
  expect(conflictDimensions.documentOverflow, JSON.stringify(conflictDimensions))
    .toBeLessThanOrEqual(1);
  for (const control of await dialog.locator("#trade-review-conflict button:visible").all()) {
    const box = await control.boundingBox();
    expect(box, "visible conflict action should have a layout box").not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.evaluate(() => {
    delete document.documentElement.dataset.testTextScale;
  });

  const provedBackdrop = await page.locator("[data-trade-review-backdrop]").elementHandle();
  if (provedBackdrop === null) throw new Error("Expected the proved stale review editor.");
  await provedBackdrop.evaluate((element) => {
    element.remove();
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.removeAttribute("inert");
      background.removeAttribute("aria-hidden");
    });
  });

  const competingVersionThree = {
    setup: "Third saved setup",
    emotion: "Patient",
    tags: "Third writer",
    note: "A third editor advanced the completed head after version two was displayed.",
  };
  const thirdDialog = await openTradeReview(page, "AAPL");
  await thirdDialog.locator("#review-setup").fill(competingVersionThree.setup);
  await thirdDialog.locator("#review-emotion").fill(competingVersionThree.emotion);
  await thirdDialog.locator("#review-tags").fill(competingVersionThree.tags);
  await thirdDialog.locator("#review-note").fill(competingVersionThree.note);
  await thirdDialog.getByRole("button", { name: "Save review changes" }).click();
  await expect(thirdDialog).toHaveCount(0);
  await resetPreparedReviewProbe(page);

  await provedBackdrop.evaluate((element) => {
    const root = document.querySelector("#app");
    if (root === null) throw new Error("Hermes root is unavailable.");
    root.append(element);
    document.body.classList.add("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.setAttribute("inert", "");
      background.setAttribute("aria-hidden", "true");
    });
  });
  dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await expect(dialog.locator("#trade-review-latest")).toContainText("Version 2 · completed");
  await acceptLatest.click();
  expect(await preparedReviewCounters(page)).toEqual({
    valueReads: "0",
    randomIds: "1",
  });
  await expect(dialog.locator("#trade-review-rebase-status")).toContainText(
    "Version 2 is now the base",
  );
  await expect(dialog.locator("#trade-review-rebase-status")).toContainText(
    "not a field merge",
  );
  await expect(dialog.locator("#trade-review-rebase-status")).toContainText(
    "successor will remain completed",
  );
  await expect(dialog.getByRole("button", { name: "Save draft" })).toBeHidden();
  const saveCompleted = dialog.getByRole("button", { name: "Save review changes" });
  await expect(saveCompleted).toBeEnabled();
  await expect(saveCompleted).toBeFocused();

  await saveCompleted.click();
  await expect(error).toContainText("Nothing was overwritten");
  await expect(error).toContainText("Review the latest saved version");
  await expect(dialog.locator("#trade-review-latest")).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Continue with my unsaved review" }))
    .toBeHidden();
  await expect(dialog.getByRole("button", { name: "Review latest saved version" }))
    .toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Close trade review" })).toBeDisabled();
  expect((await preparedReviewCounters(page)).randomIds).toBe("2");
  await expectCompleteRawLocalDraft(dialog);
  const firstRebasedProbe = await preparedReviewProbe(page);
  expect(firstRebasedProbe.randomIds).toHaveLength(2);
  const firstRebasedCommands = firstRebasedProbe.commands.filter((command) => (
    command.note === localDraft.note
  ));
  expect(firstRebasedCommands).toHaveLength(1);
  const firstRebasedPrepared = firstRebasedCommands[0];
  if (firstRebasedPrepared === undefined) {
    throw new Error("Expected the first consented prepared review.");
  }
  expect(firstRebasedPrepared.submissionId).toBe(firstRebasedProbe.randomIds[0]);

  await dialog.getByRole("button", { name: "Review latest saved version" }).click();
  await expect(latest).toBeFocused();
  await expect(latest).toContainText("Version 3 · completed");
  await expect(latest).toContainText(competingVersionThree.setup);
  await expect(latest).toContainText(competingVersionThree.note);
  await expectCompleteRawLocalDraft(dialog);
  const versionThreeEvidenceMarkup = await latest.evaluate((element) => element.innerHTML);
  expect(versionThreeEvidenceMarkup).not.toContain("session-review:");
  expect((await preparedReviewCounters(page)).randomIds).toBe("2");
  await dialog.getByRole("button", { name: "Continue with my unsaved review" }).click();
  expect((await preparedReviewCounters(page)).randomIds).toBe("3");
  await expect(dialog.locator("#trade-review-rebase-status")).toContainText(
    "Version 3 is now the base",
  );
  await expect(saveCompleted).toBeFocused();
  await saveCompleted.click();
  await expect(dialog).toHaveCount(0);
  expect((await preparedReviewCounters(page)).randomIds).toBe("4");
  const finalPreparedProbe = await preparedReviewProbe(page);
  expect(finalPreparedProbe.randomIds).toHaveLength(4);
  const finalLocalCommands = finalPreparedProbe.commands.filter((command) => (
    command.note === localDraft.note
  ));
  expect(finalLocalCommands).toHaveLength(2);
  const finalPrepared = finalLocalCommands.find((command) => (
    command.submissionId === finalPreparedProbe.randomIds[2]
  ));
  if (finalPrepared === undefined) {
    throw new Error("Expected the second consented prepared review.");
  }

  const data = reviewArchiveData(await exportJournal(page));
  const versions = [...data.reviewVersions].sort((left, right) => left.version - right.version);
  expect(versions).toHaveLength(4);
  expect(versions[0]).toMatchObject({
    version: 1,
    state: "draft",
    note: "Original immutable review version.",
    setup: "Original saved setup",
    tags: ["Original"],
  });
  expect(versions[1]).toMatchObject({
    version: 2,
    state: "completed",
    note: competingVersionTwo.note,
    setup: competingVersionTwo.setup,
    mistakes: ["Ignored volume"],
    emotion: "Calm",
    tags: ["Competing", "Saved elsewhere"],
    playbookName: competingVersionTwo.playbook,
    rules: [expect.objectContaining({
      text: competingVersionTwo.rule,
      outcome: "followed",
    })],
    initialRisk: { amount: competingVersionTwo.risk, currency: "USD" },
    plannedStop: competingVersionTwo.stop,
  });
  expect(versions[2]).toMatchObject({
    version: 3,
    state: "completed",
    note: competingVersionThree.note,
    setup: competingVersionThree.setup,
    emotion: competingVersionThree.emotion,
    tags: ["Third writer"],
  });
  expect(versions[3]).toMatchObject({
    version: 4,
    state: "completed",
    note: localDraft.note,
    setup: localDraft.setup,
    mistakes: ["Entered early", "Chased"],
    emotion: localDraft.emotion,
    tags: ["Local only", "Do not overwrite"],
    playbookName: localDraft.playbook,
    rules: [expect.objectContaining({
      text: localDraft.firstRule,
      outcome: "broken",
    })],
    initialRisk: { amount: "125.5", currency: "USD" },
    plannedStop: localDraft.stop,
  });
  const finalVersion = versions[3];
  if (finalVersion === undefined) throw new Error("Expected the reconciled review version.");
  expect(initialPrepared.expectedPreviousReviewId).toBe(versions[0]?.id);
  expect(firstRebasedPrepared.expectedPreviousReviewId).toBe(versions[1]?.id);
  expect(finalPrepared.expectedPreviousReviewId).toBe(versions[2]?.id);
  expect(versionTwoEvidenceMarkup).not.toContain(versions[1]?.id);
  expect(versionThreeEvidenceMarkup).not.toContain(versions[2]?.id);
  expect(data.reviewHeads).toEqual([[finalVersion.tradeSubjectId, finalVersion.id]]);
  expect(data.reviewSubmissions).toHaveLength(4);
  const successfulSubmissionIds = data.reviewSubmissions.map(([submissionId]) => submissionId);
  expect(successfulSubmissionIds).not.toContain(initialPrepared.submissionId);
  expect(successfulSubmissionIds).not.toContain(firstRebasedPrepared.submissionId);
  expect(successfulSubmissionIds).toContain(finalPrepared.submissionId);
  expect(data.reviewSubmissions.map(([, receipt]) => receipt.reviewId).sort())
    .toEqual(versions.map((version) => version.id).sort());
  expect(externalRequests).toEqual([]);
});

test("a direct review receipt conflict preserves the draft and requires refresh before reopening", async ({ page, context }) => {
  const externalRequests = logExternalRequests(page);
  await importTwoClosedTrades(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await page.evaluate(() => {
    const root = document.documentElement;
    const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
    root.dataset.forceKnownReviewSubmission = "true";
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: (array: Uint8Array) => {
        if (
          root.dataset.forceKnownReviewSubmission === "true"
          && array.byteLength === 32
        ) {
          root.dataset.forceKnownReviewSubmission = "false";
          array.fill(0x5b);
          return array;
        }
        return originalGetRandomValues(array);
      },
    });
  });

  let dialog = await openTradeReview(page, "AAPL");
  const localDraft = {
    setup: "Direct conflict local setup",
    tags: "Keep this local draft",
    rule: "Preserve this dynamic rule",
    note: "The first submit must fail closed without exposing receipt detail.",
  };
  await dialog.locator("#review-setup").fill(localDraft.setup);
  await dialog.locator("#review-tags").fill(localDraft.tags);
  await dialog.locator("#review-playbook").fill("Direct conflict plan");
  await dialog.getByRole("button", { name: "Add rule" }).click();
  await dialog.locator('input[name="review-rule-name"]').last().fill(localDraft.rule);
  await dialog.locator('select[name="review-rule-outcome"]').last().selectOption("broken");
  await dialog.locator("#review-note").fill(localDraft.note);
  const blockedBackdrop = await page.locator("[data-trade-review-backdrop]").elementHandle();
  if (blockedBackdrop === null) throw new Error("Expected the direct-conflict editor.");
  await blockedBackdrop.evaluate((element) => {
    element.remove();
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.removeAttribute("inert");
      background.removeAttribute("aria-hidden");
    });
    document.documentElement.dataset.forceKnownReviewSubmission = "true";
  });

  const competingDialog = await openTradeReview(page, "AAPL");
  await competingDialog.locator("#review-setup").fill("Receipt owner setup");
  await competingDialog.locator("#review-tags").fill("Receipt owner");
  await competingDialog.locator("#review-note").fill(
    "Different content committed under the same review submission.",
  );
  await competingDialog.getByRole("button", { name: "Save draft" }).click();
  await expect(competingDialog).toHaveCount(0);
  await blockedBackdrop.evaluate((element) => {
    const root = document.querySelector("#app");
    if (root === null) throw new Error("Hermes root is unavailable.");
    root.append(element);
    document.body.classList.add("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.setAttribute("inert", "");
      background.setAttribute("aria-hidden", "true");
    });
  });

  dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  const error = dialog.locator("#trade-review-error");
  await expect(error).toContainText("could not safely apply");
  await expect(error).toContainText("unsaved changes are still here");
  await expect(error).not.toContainText("already saved with different values");
  await expect(error).toBeFocused();
  await expect(dialog.locator("#review-setup")).toHaveValue(localDraft.setup);
  await expect(dialog.locator("#review-tags")).toHaveValue(localDraft.tags);
  await expect(dialog.locator('input[name="review-rule-name"]')).toHaveValue(localDraft.rule);
  await expect(dialog.locator('select[name="review-rule-outcome"]')).toHaveValue("broken");
  await expect(dialog.locator('input[name="review-rule-name"]')).toBeEnabled();
  await expect(dialog.locator('select[name="review-rule-outcome"]')).toBeEnabled();
  await expect(dialog.locator("[data-review-rule-remove]")).toBeEnabled();
  await expect(dialog.locator("#review-note")).toHaveValue(localDraft.note);
  await expect(dialog.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Mark reviewed" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Close trade review" })).toBeDisabled();
  const refreshBeforeReopen = dialog.getByRole("button", {
    name: "Refresh journal before reopening",
  });
  await expect(refreshBeforeReopen).toBeEnabled();
  await dialog.press("Escape");
  await expect(dialog).toBeVisible();

  await installPreparedReviewCounters(page);
  await refreshBeforeReopen.click();
  await expect(refreshBeforeReopen).toBeHidden();
  await expect(error).toContainText("The journal is refreshed");
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Close trade review" })).toBeEnabled();
  await expect(dialog.locator("#review-setup")).toHaveValue(localDraft.setup);
  await expect(dialog.locator("#review-tags")).toHaveValue(localDraft.tags);
  await expect(dialog.locator("#review-note")).toHaveValue(localDraft.note);
  expect(await preparedReviewCounters(page)).toEqual({
    valueReads: "0",
    randomIds: "0",
  });

  const confirmationPromise = page.waitForEvent("dialog");
  const closeAttempt = dialog.getByRole("button", { name: "Cancel" }).click();
  const confirmation = await confirmationPromise;
  expect(confirmation.message()).toBe("Discard the unsaved trade review?");
  await confirmation.accept();
  await closeAttempt;
  await expect(dialog).toHaveCount(0);

  const data = reviewArchiveData(await exportJournal(page));
  expect(data.reviewVersions).toEqual([
    expect.objectContaining({
      version: 1,
      state: "draft",
      note: "Different content committed under the same review submission.",
      setup: "Receipt owner setup",
      tags: ["Receipt owner"],
    }),
  ]);
  const competing = data.reviewVersions[0];
  if (competing === undefined) throw new Error("Expected the direct receipt owner.");
  expect(data.reviewHeads).toEqual([[competing.tradeSubjectId, competing.id]]);
  expect(data.reviewSubmissions).toEqual([
    [expect.any(String), { reviewId: competing.id, revision: expect.any(String) }],
  ]);
  expect(externalRequests).toEqual([]);
});

test("an uncertain exact review stays frozen when different content owns its submission receipt", async ({ page, context }) => {
  const externalRequests = logExternalRequests(page);
  await importTwoClosedTrades(page);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await page.evaluate(() => {
    const root = document.documentElement;
    const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
    root.dataset.forceKnownReviewSubmission = "true";
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: (array: Uint8Array) => {
        if (
          root.dataset.forceKnownReviewSubmission === "true"
          && array.byteLength === 32
        ) {
          root.dataset.forceKnownReviewSubmission = "false";
          array.fill(0x4a);
          return array;
        }
        return originalGetRandomValues(array);
      },
    });
  });

  let dialog = await openTradeReview(page, "AAPL");
  const localDraft = {
    setup: "Retain my exact command",
    tags: "Original identity",
    note: "This content must remain frozen after a receipt collision.",
  };
  await dialog.locator("#review-setup").fill(localDraft.setup);
  await dialog.locator("#review-tags").fill(localDraft.tags);
  await dialog.locator("#review-note").fill(localDraft.note);
  const privateDetail = "/private/journals/kevin.db exact receipt unavailable";
  await page.evaluate((detail) => {
    const originalNow = Date.now.bind(Date);
    let failuresRemaining = 2;
    document.documentElement.dataset.reviewClockFailures = "0";
    Object.defineProperty(Date, "now", {
      configurable: true,
      value: () => {
        const stack = new Error().stack ?? "";
        if (
          failuresRemaining > 0
          && /commit(?:TradeReviews|ReviewsSafely)/u.test(stack)
        ) {
          failuresRemaining -= 1;
          const failures = Number(
            document.documentElement.dataset.reviewClockFailures ?? "0",
          ) + 1;
          document.documentElement.dataset.reviewClockFailures = String(failures);
          throw new Error(detail);
        }
        return originalNow();
      },
    });
  }, privateDetail);
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  const error = dialog.locator("#trade-review-error");
  await expect(error).toContainText("retry the same save");
  await expect(error).not.toContainText(privateDetail);
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.dataset.reviewClockFailures
  ))).toBe("2");

  const uncertainBackdrop = await page.locator("[data-trade-review-backdrop]")
    .elementHandle();
  if (uncertainBackdrop === null) throw new Error("Expected the uncertain receipt editor.");
  await uncertainBackdrop.evaluate((element) => {
    element.remove();
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.removeAttribute("inert");
      background.removeAttribute("aria-hidden");
    });
    document.documentElement.dataset.forceKnownReviewSubmission = "true";
  });

  const competingDialog = await openTradeReview(page, "AAPL");
  await competingDialog.locator("#review-setup").fill("Different receipt content");
  await competingDialog.locator("#review-tags").fill("Competing identity");
  await competingDialog.locator("#review-note").fill(
    "A separate command now owns the same submission identity.",
  );
  await competingDialog.getByRole("button", { name: "Save draft" }).click();
  await expect(competingDialog).toHaveCount(0);
  await installPreparedReviewCounters(page);

  await uncertainBackdrop.evaluate((element) => {
    const root = document.querySelector("#app");
    if (root === null) throw new Error("Hermes root is unavailable.");
    root.append(element);
    document.body.classList.add("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.setAttribute("inert", "");
      background.setAttribute("aria-hidden", "true");
    });
    element.querySelector<HTMLElement>("#trade-review-error")?.focus();
  });

  dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  const exactRetry = dialog.getByRole("button", { name: "Retry this exact save" });
  await exactRetry.click();
  await expect(error).toContainText("could not safely prove");
  await expect(error).toContainText("outcome is still unknown");
  await expect(error).not.toContainText("already saved with different values");
  await expect(error).not.toContainText(privateDetail);
  await expect(error).toBeFocused();
  await expect(exactRetry).toBeEnabled();
  await expect(dialog.locator("#review-setup")).toHaveValue(localDraft.setup);
  await expect(dialog.locator("#review-tags")).toHaveValue(localDraft.tags);
  await expect(dialog.locator("#review-note")).toHaveValue(localDraft.note);
  const enabledControls = await dialog
    .locator("button:visible, input:visible, textarea:visible, select:visible")
    .evaluateAll((elements) => elements
      .filter((element) => !(
        element as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      ).disabled)
      .map((element) => element.id));
  expect(enabledControls).toEqual(["trade-review-reconcile"]);
  expect(await preparedReviewCounters(page)).toEqual({
    valueReads: "0",
    randomIds: "0",
  });

  await exactRetry.click();
  await expect(error).toContainText("could not safely prove");
  expect(await preparedReviewCounters(page)).toEqual({
    valueReads: "0",
    randomIds: "0",
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.locator("[data-trade-review-backdrop]").click({ position: { x: 2, y: 2 } });
  await expect(dialog).toBeVisible();

  await uncertainBackdrop.evaluate((element) => {
    element.remove();
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.removeAttribute("inert");
      background.removeAttribute("aria-hidden");
    });
  });
  const data = reviewArchiveData(await exportJournal(page));
  expect(data.reviewVersions).toEqual([
    expect.objectContaining({
      version: 1,
      state: "draft",
      note: "A separate command now owns the same submission identity.",
      setup: "Different receipt content",
      tags: ["Competing identity"],
    }),
  ]);
  const competing = data.reviewVersions[0];
  if (competing === undefined) throw new Error("Expected one receipt-owner review.");
  expect(data.reviewHeads).toEqual([[competing.tradeSubjectId, competing.id]]);
  expect(data.reviewSubmissions).toEqual([
    [expect.any(String), { reviewId: competing.id, revision: expect.any(String) }],
  ]);
  expect(externalRequests).toEqual([]);
});

test("a proven trade review commit retries only the failed journal refresh", async ({ page, context }) => {
  const externalRequests = logExternalRequests(page);
  await importTwoClosedTrades(page);
  await context.setOffline(true);
  const dashboardHeading = page.locator("#dashboard-review-progress-title");
  const dashboardAction = page.locator(
    '[data-dashboard-review-progress] button[data-trade-review-origin="dashboard-review-progress"]',
  );
  await expect(dashboardAction)
    .toHaveAccessibleName(/Review next trade for AAPL Stock/u);
  await dashboardAction.click();
  const dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await expect(dialog).toBeVisible();
  await dialog.locator("#review-setup").fill("Refresh-only setup");
  await dialog.locator("#review-tags").fill("Refresh only");
  await dialog.locator("#review-note").fill(
    "The committed review must never be submitted again when only rendering fails.",
  );

  const privateDetail = "/private/journals/kevin.db injected review refresh failure";
  await page.evaluate((detail) => {
    const root = document.documentElement;
    const mapDescriptor = Object.getOwnPropertyDescriptor(Map.prototype, "get");
    const originalMapGet = mapDescriptor?.value as (
      (this: Map<unknown, unknown>, key: unknown) => unknown
    ) | undefined;
    if (mapDescriptor === undefined || originalMapGet === undefined) {
      throw new Error("Map.prototype.get is not instrumentable.");
    }
    root.dataset.reviewCommitMapReads = "0";
    Object.defineProperty(Map.prototype, "get", {
      ...mapDescriptor,
      value(this: Map<unknown, unknown>, key: unknown) {
        if ((new Error().stack ?? "").includes("commitTradeReviews")) {
          const reads = Number(root.dataset.reviewCommitMapReads ?? "0") + 1;
          root.dataset.reviewCommitMapReads = String(reads);
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

  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  const error = dialog.locator("#trade-review-error");
  const refreshOnly = dialog.getByRole("button", { name: "Retry journal refresh" });
  await expect(error).toContainText("saved on this device");
  await expect(error).toContainText("Do not save it again");
  await expect(error).not.toContainText(privateDetail);
  await expect(error).toBeFocused();
  await expect(dialog).toHaveAttribute("aria-busy", "false");
  await expect(refreshOnly).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Retry this exact save" })).toBeHidden();
  const enabledControls = await dialog
    .locator("button:visible, input:visible, textarea:visible, select:visible")
    .evaluateAll((elements) => elements
      .filter((element) => !(
        element as HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      ).disabled)
      .map((element) => element.id));
  expect(enabledControls).toEqual(["trade-review-reconcile"]);
  await expect(dialog.getByRole("button", { name: "Close trade review" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.locator("[data-trade-review-backdrop]").click({ position: { x: 2, y: 2 } });
  await expect(dialog).toBeVisible();
  expect(Number(await page.evaluate(() => (
    document.documentElement.dataset.reviewCommitMapReads
  )))).toBeGreaterThan(0);

  await page.evaluate(() => {
    document.documentElement.dataset.reviewCommitMapReads = "0";
  });
  await refreshOnly.click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => (
    document.documentElement.dataset.reviewCommitMapReads
  ))).toBe("0");
  await expect(dashboardHeading).toBeFocused();
  await expect(dashboardHeading).toHaveText("1 review waiting");
  await expect(dashboardAction)
    .toHaveAccessibleName(/Review next trade for MSFT Stock/u);

  const data = reviewArchiveData(await exportJournal(page));
  expect(data.reviewVersions).toEqual([
    expect.objectContaining({
      version: 1,
      state: "completed",
      note: "The committed review must never be submitted again when only rendering fails.",
      setup: "Refresh-only setup",
      tags: ["Refresh only"],
    }),
  ]);
  const committed = data.reviewVersions[0];
  if (committed === undefined) throw new Error("Expected one committed review.");
  expect(data.reviewHeads).toEqual([[committed.tradeSubjectId, committed.id]]);
  expect(data.reviewSubmissions).toEqual([
    [expect.any(String), { reviewId: committed.id, revision: expect.any(String) }],
  ]);
  expect(externalRequests).toEqual([]);
});

test("open trades with realized exits stay explicitly interim partial", async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "partial-in,AAPL,BTO,2,100,0,USD,2026-07-09T14:30:00Z",
    "partial-out,AAPL,STC,1,110,0,USD,2026-07-09T15:00:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "partial-trade.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 2 executions" }).click();
  await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  await expect(page.locator(".result-card").first())
    .toContainText("includes interim partial exits");
  const recentTrade = page.locator(".trade-row").filter({
    has: page.getByText("AAPL", { exact: true }),
  });
  await expect(recentTrade).toContainText("Interim partial");

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  const card = tradeCard(page, "AAPL");
  await expect(card.getByText("open", { exact: true })).toBeVisible();
  await expect(card.locator(".journal-metrics span")).toContainText("Interim partial");
});
