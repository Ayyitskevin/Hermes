import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { parseJournalArchive } from "../src/application/journal-archive";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

function journalDateLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

function journalHeadingDateLabel(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

function previousIsoDate(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

async function establishLocalJournal(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "aapl-in,AAPL,BTO,1,100,0,USD,2026-07-09T14:30:00Z",
    "aapl-out,AAPL,STC,1,110,0,USD,2026-07-09T15:00:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "daily-journal.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 2 executions" }).click();
  await page.getByRole("button", { name: "Journal", exact: true }).click();
}

async function localStorageSnapshot(page: Page): Promise<readonly string[]> {
  return page.evaluate(() => (
    Array.from({ length: window.localStorage.length }, (_, index) => {
      const key = window.localStorage.key(index);
      return JSON.stringify([
        key,
        key === null ? null : window.localStorage.getItem(key),
      ]);
    }).sort()
  ));
}

test("daily reflection creates, validates, completes, and returns focus without autosave", async ({ page }) => {
  await establishLocalJournal(page);
  const trigger = page.getByRole("button", { name: "Write daily reflection" });
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: "New daily reflection" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "New daily reflection" })).toBeFocused();
  await expect(page.locator("#screen")).toHaveAttribute("inert", "");

  await page.keyboard.press("Shift+Tab");
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

  await dialog.locator("#daily-entry-headline").fill("Protected the process");
  await dialog.locator("#daily-entry-note").fill("Waited for confirmation and skipped a weak setup.");
  await dialog.locator("#daily-entry-emotion").fill("Focused");
  await dialog.locator("#daily-entry-score").fill("88");
  await dialog.locator("#daily-entry-tags").fill("Patient, No trade");
  await expect(dialog.locator("#daily-entry-note-count")).toContainText("49 / 5,000");

  const confirmationPromise = page.waitForEvent("dialog");
  const closeAttempt = dialog.getByRole("button", { name: "Cancel" }).click();
  const confirmation = await confirmationPromise;
  expect(confirmation.message()).toBe("Discard the unsaved daily reflection?");
  await confirmation.dismiss();
  await closeAttempt;
  await expect(dialog).toBeVisible();

  const discardPromise = page.waitForEvent("dialog");
  const discardAttempt = dialog.getByRole("button", { name: "Cancel" }).click();
  const discard = await discardPromise;
  await discard.accept();
  await discardAttempt;
  await expect(dialog).toHaveCount(0);
  await expect(page.locator(".journal-note")).toHaveCount(0);
  await expect(trigger).toBeFocused();

  await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog.locator("#daily-entry-headline").fill("Protected the process");
  await dialog.locator("#daily-entry-note").fill("Waited for confirmation and skipped a weak setup.");
  await dialog.locator("#daily-entry-emotion").fill("Focused");
  await dialog.locator("#daily-entry-score").fill("88");
  await dialog.locator("#daily-entry-tags").fill("Patient, No trade");
  const firstDate = await dialog.locator("#daily-entry-date").inputValue();
  const firstDateLabel = journalDateLabel(firstDate);

  const pending = await dialog.getByRole("button", { name: "Save draft" }).evaluate((element) => {
    (element as HTMLButtonElement).click();
    const form = document.querySelector<HTMLElement>("#daily-entry-form");
    const controls = Array.from(document.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement
    >("[data-daily-entry-backdrop] button, [data-daily-entry-backdrop] input, [data-daily-entry-backdrop] textarea"));
    return {
      busy: form?.getAttribute("aria-busy"),
      enabled: controls.filter((control) => !control.disabled).length,
      focusInDialog: document.querySelector(".daily-journal-sheet")
        ?.contains(document.activeElement) ?? false,
    };
  });
  expect(pending).toEqual({ busy: "true", enabled: 0, focusInDialog: true });
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#route-announcer")).toContainText(
    `Daily reflection for ${firstDateLabel} saved on device.`,
  );
  const card = page.locator(".journal-note").filter({ hasText: "Protected the process" });
  await expect(card).toContainText("Protected the process");
  await expect(card).toContainText("draft");
  await expect(card).toContainText("88% process");
  await expect(card).toContainText("No executions recorded");
  await expect(card).toHaveAttribute("data-daily-entry-card", firstDate);
  const firstHeading = card.getByRole("heading", { name: "Protected the process" });
  await expect(firstHeading).toHaveAttribute("data-daily-entry-heading", firstDate);
  await expect(firstHeading).toHaveAccessibleName(
    `Protected the process · ${journalHeadingDateLabel(firstDate)}`,
  );
  await expect(firstHeading).toBeFocused();
  await expect(firstHeading).toBeInViewport();

  await page.getByRole("button", { name: "Write another date" }).click();
  const anotherDialog = page.getByRole("dialog", { name: "New daily reflection" });
  const anotherDefaultDate = await anotherDialog.locator("#daily-entry-date").inputValue();
  const anotherDate = previousIsoDate(anotherDefaultDate);
  expect(anotherDate).not.toBe(firstDate);
  await anotherDialog.locator("#daily-entry-date").fill(anotherDate);
  await expect(anotherDialog.locator("#daily-entry-date")).toHaveValue(anotherDate);
  await anotherDialog.locator("#daily-entry-note").fill("No setup met the plan.");
  await anotherDialog.getByRole("button", { name: "Save draft" }).click();
  await expect(anotherDialog).toHaveCount(0);
  await expect(page.locator(".journal-note")).toHaveCount(2);
  const anotherCard = page.locator(".journal-note").filter({ hasText: "No setup met the plan." });
  await expect(anotherCard).toBeVisible();
  await expect(anotherCard).toHaveAttribute("data-daily-entry-card", anotherDate);
  const anotherHeading = anotherCard.getByRole("heading", { name: "Daily reflection" });
  await expect(anotherHeading).toHaveAccessibleName(
    `Daily reflection · ${journalHeadingDateLabel(anotherDate)}`,
  );
  await expect(anotherHeading).toBeFocused();
  await expect(page.locator(`[data-daily-entry-card="${anotherDefaultDate}"]`)).toHaveCount(0);

  const edit = card.getByRole("button", { name: /Edit daily reflection for/u });
  await edit.click();
  const editDialog = page.getByRole("dialog", { name: "Edit daily reflection" });
  const date = editDialog.locator("#daily-entry-date");
  await expect(date).toHaveAttribute("readonly", "");
  const immutableDate = await date.inputValue();
  await editDialog.locator("#daily-entry-headline").fill("");
  await editDialog.locator("#daily-entry-note").fill("");
  await editDialog.locator("#daily-entry-emotion").fill("");
  await editDialog.locator("#daily-entry-score").fill("");
  await editDialog.locator("#daily-entry-tags").fill("");
  await editDialog.getByRole("button", { name: "Complete reflection" }).click();
  await expect(editDialog.locator("#daily-entry-error")).toContainText("authored signal");
  await expect(date).toHaveAttribute("readonly", "");
  await expect(date).toHaveValue(immutableDate);

  await editDialog.locator("#daily-entry-note").fill("Stayed patient; no setup met the plan.");
  await editDialog.getByRole("button", { name: "Complete reflection" }).click();
  await expect(editDialog).toHaveCount(0);
  const completed = page.locator(".journal-note").filter({
    hasText: "Stayed patient; no setup met the plan.",
  });
  await expect(completed).toContainText("completed");
  await expect(completed).toContainText(
    "Stayed patient; no setup met the plan.",
  );
  await expect(completed).toHaveAttribute("data-daily-entry-card", immutableDate);
  const completedHeading = completed.getByRole("heading", {
    name: `Daily reflection · ${journalHeadingDateLabel(immutableDate)}`,
  });
  await expect(completedHeading).toHaveAttribute("data-daily-entry-heading", immutableDate);
  await expect(completedHeading).toBeFocused();
  await expect(completedHeading).toBeInViewport();
});

test("daily reflection rhythm recomputes missing to draft to completed through existing saves", async ({ page }) => {
  await establishLocalJournal(page);
  const rhythm = page.locator("[data-daily-reflection-rhythm]");
  const session = rhythm.locator('[data-reflection-session="2026-07-09"]');
  await expect(rhythm).toContainText("0 of 1 completed");
  await expect(rhythm).toContainText("No current completed run");
  await expect(session).toHaveAccessibleName(
    "Thursday, July 9, 2026: missing daily reflection",
  );

  await page.getByRole("button", { name: "Write daily reflection" }).click();
  let dialog = page.getByRole("dialog", { name: "New daily reflection" });
  await dialog.locator("#daily-entry-date").fill("2026-07-09");
  await dialog.locator("#daily-entry-note").fill("Review the recorded session without rating the result.");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rhythm).toContainText("0 of 1 completed");
  await expect(session).toHaveAccessibleName(
    "Thursday, July 9, 2026: draft daily reflection",
  );

  const card = page.locator('[data-daily-entry-card="2026-07-09"]');
  await card.getByRole("button", { name: /Edit daily reflection/u }).click();
  dialog = page.getByRole("dialog", { name: "Edit daily reflection" });
  await dialog.getByRole("button", { name: "Complete reflection" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(rhythm).toContainText("1 of 1 completed");
  await expect(rhythm).toContainText("1-session current run");
  await expect(session).toHaveAccessibleName(
    "Thursday, July 9, 2026: completed daily reflection",
  );
});

test("fictional daily reflection rhythm stays offline, read-only, and reflows at 200%", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  const storageBefore = await localStorageSnapshot(page);
  const rhythm = page.locator("[data-daily-reflection-rhythm]");
  await expect(rhythm).toContainText("2 of 6 completed");
  await expect(rhythm).toContainText("2-session current run");
  await expect(rhythm.locator("[data-reflection-session]")).toHaveCount(6);
  await expect(rhythm.getByRole("button")).toHaveCount(0);

  for (const width of [320, 421]) {
    await page.setViewportSize({ width, height: 844 });
    const geometry = await rhythm.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return {
        left: bounds.left,
        right: bounds.right,
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(geometry.left, `${width}px rhythm left`).toBeGreaterThanOrEqual(-1);
    expect(geometry.right, `${width}px rhythm right`).toBeLessThanOrEqual(width + 1);
    expect(geometry.documentOverflow, `${width}px document overflow`).toBeLessThanOrEqual(1);
  }
  expect(await localStorageSnapshot(page)).toEqual(storageBefore);
  expect(externalRequests).toEqual([]);
});

test("an uncertain exact daily save returns focus to its prepared Journal date", async ({ page, context }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:")
      && url.origin !== BASE_ORIGIN
    ) externalRequests.push(request.url());
  });
  await establishLocalJournal(page);
  await context.setOffline(true);

  await page.getByRole("button", { name: "Write daily reflection" }).click();
  const dialog = page.getByRole("dialog", { name: "New daily reflection" });
  const isoDate = await dialog.locator("#daily-entry-date").inputValue();
  await dialog.locator("#daily-entry-headline").fill("Exact retry returns here");
  await dialog.locator("#daily-entry-note").fill(
    "The frozen command should rebuild Journal and return to this exact date.",
  );

  await page.evaluate(() => {
    const originalNow = Date.now.bind(Date);
    let failuresRemaining = 2;
    document.documentElement.dataset.dailyReturnFocusClockFailures = "0";
    Object.defineProperty(Date, "now", {
      configurable: true,
      value: () => {
        const stack = new Error().stack ?? "";
        if (
          failuresRemaining > 0
          && /commitDailyJournal(?:Entry|Safely)/u.test(stack)
        ) {
          failuresRemaining -= 1;
          const root = document.documentElement;
          root.dataset.dailyReturnFocusClockFailures = String(
            Number(root.dataset.dailyReturnFocusClockFailures ?? "0") + 1,
          );
          throw new Error("injected exact-retry response loss");
        }
        return originalNow();
      },
    });
  });

  await dialog.getByRole("button", { name: "Complete reflection" }).click();
  const error = dialog.locator("#daily-entry-error");
  const exactRetry = dialog.getByRole("button", { name: "Retry this exact save" });
  await expect(error).toContainText("retry the same save");
  await expect(error).toBeFocused();
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.dataset.dailyReturnFocusClockFailures
  ))).toBe("2");

  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  await exactRetry.click();
  await expect(dialog).toHaveCount(0);
  const card = page.locator(`[data-daily-entry-card="${isoDate}"]`);
  await expect(card).toContainText("Exact retry returns here");
  await expect(card).toContainText("completed");
  const heading = card.getByRole("heading", { name: "Exact retry returns here" });
  await expect(heading).toHaveAttribute("data-daily-entry-heading", isoDate);
  await expect(heading).toHaveAccessibleName(
    `Exact retry returns here · ${journalHeadingDateLabel(isoDate)}`,
  );
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();
  const exactFocusEvidence = await heading.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const topbar = document.querySelector<HTMLElement>(".topbar")?.getBoundingClientRect();
    const tabbar = document.querySelector<HTMLElement>(".tabbar")?.getBoundingClientRect();
    const card = element.closest<HTMLElement>("[data-daily-entry-card]");
    return {
      top: bounds.top,
      bottom: bounds.bottom,
      topbarBottom: topbar?.bottom ?? 0,
      tabbarTop: tabbar?.top ?? window.innerHeight,
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      cardOverflow: card === null ? null : card.scrollWidth - card.clientWidth,
    };
  });
  expect(exactFocusEvidence.top, JSON.stringify(exactFocusEvidence))
    .toBeGreaterThanOrEqual(exactFocusEvidence.topbarBottom - 1);
  expect(exactFocusEvidence.bottom, JSON.stringify(exactFocusEvidence))
    .toBeLessThanOrEqual(exactFocusEvidence.tabbarTop + 1);
  expect(exactFocusEvidence.documentOverflow, JSON.stringify(exactFocusEvidence))
    .toBeLessThanOrEqual(1);
  expect(exactFocusEvidence.cardOverflow, JSON.stringify(exactFocusEvidence))
    .toBeLessThanOrEqual(1);
  await expect(page.locator("#route-announcer")).toContainText(
    "Journal reloaded after confirming the exact daily reflection save.",
  );

  await page.getByRole("button", { name: "Write another date" }).click();
  const fallbackDialog = page.getByRole("dialog", { name: "New daily reflection" });
  const fallbackDefaultDate = await fallbackDialog.locator("#daily-entry-date").inputValue();
  const fallbackDate = previousIsoDate(fallbackDefaultDate);
  await fallbackDialog.locator("#daily-entry-date").fill(fallbackDate);
  await expect(fallbackDialog.locator("#daily-entry-date")).toHaveValue(fallbackDate);
  expect(fallbackDate).not.toBe(fallbackDefaultDate);
  await fallbackDialog.locator("#daily-entry-note").fill(
    "Use the stable Daily notes heading when the exact rebuilt heading is unavailable.",
  );
  await page.evaluate((date) => {
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
        Array.from(this.querySelectorAll<HTMLElement>("[data-daily-entry-heading]"))
          .find((candidate) => candidate.dataset.dailyEntryHeading === date)
          ?.removeAttribute("data-daily-entry-heading");
      },
    });
  }, fallbackDate);
  await page.setViewportSize({ width: 844, height: 568 });
  await fallbackDialog.getByRole("button", { name: "Save draft" }).click();
  await expect(fallbackDialog).toHaveCount(0);
  await expect(page.locator(`[data-daily-entry-card="${fallbackDate}"]`)).toContainText(
    "Use the stable Daily notes heading",
  );
  const dailyNotesHeading = page.getByRole("heading", { name: "Daily notes" });
  await expect(dailyNotesHeading).toBeFocused();
  await expect(dailyNotesHeading).toBeInViewport();
  for (const width of [844, 320, 421]) {
    await page.setViewportSize({ width, height: 568 });
    await dailyNotesHeading.evaluate((element) => {
      element.scrollIntoView({ behavior: "auto", block: "start" });
      element.focus({ preventScroll: true });
    });
    const fallbackFocusEvidence = await dailyNotesHeading.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const topbar = document.querySelector<HTMLElement>(".topbar")?.getBoundingClientRect();
      const tabbar = document.querySelector<HTMLElement>(".tabbar")?.getBoundingClientRect();
      return {
        top: bounds.top,
        bottom: bounds.bottom,
        topbarBottom: topbar?.bottom ?? 0,
        tabbarTop: tabbar?.top ?? window.innerHeight,
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      };
    });
    expect(fallbackFocusEvidence.top, `${width}px: ${JSON.stringify(fallbackFocusEvidence)}`)
      .toBeGreaterThanOrEqual(fallbackFocusEvidence.topbarBottom - 1);
    expect(fallbackFocusEvidence.bottom, `${width}px: ${JSON.stringify(fallbackFocusEvidence)}`)
      .toBeLessThanOrEqual(fallbackFocusEvidence.tabbarTop + 1);
    expect(
      fallbackFocusEvidence.documentOverflow,
      `${width}px: ${JSON.stringify(fallbackFocusEvidence)}`,
    ).toBeLessThanOrEqual(1);
  }

  await page.getByRole("button", { name: "Write another date" }).click();
  const ambiguousDialog = page.getByRole("dialog", { name: "New daily reflection" });
  const ambiguousDate = await ambiguousDialog.locator("#daily-entry-date").inputValue();
  await ambiguousDialog.locator("#daily-entry-note").fill(
    "Fall through to the screen when rebuilt focus evidence is ambiguous.",
  );
  await page.evaluate((date) => {
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
        const exactCard = Array.from(
          this.querySelectorAll<HTMLElement>("[data-daily-entry-card]"),
        ).find((candidate) => candidate.dataset.dailyEntryCard === date);
        const exactHeading = Array.from(
          exactCard?.querySelectorAll<HTMLElement>("[data-daily-entry-heading]") ?? [],
        ).find((candidate) => candidate.dataset.dailyEntryHeading === date);
        exactHeading?.insertAdjacentElement("afterend", exactHeading.cloneNode(true) as Element);
        const dailyNotes = this.querySelector<HTMLElement>("#daily-notes-title");
        dailyNotes?.insertAdjacentElement("afterend", dailyNotes.cloneNode(true) as Element);
      },
    });
  }, ambiguousDate);
  await ambiguousDialog.getByRole("button", { name: "Save draft" }).click();
  await expect(ambiguousDialog).toHaveCount(0);
  await expect(page.locator(`[data-daily-entry-card="${ambiguousDate}"]`).first()).toContainText(
    "Fall through to the screen",
  );
  await expect(page.locator("#screen")).toBeFocused();
  expect(externalRequests).toEqual([]);
});

test("calendar day continues the exact workspace reflection without changing trade-browser state or review coverage", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  await establishLocalJournal(page);

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const reviewProgress = page.locator(".review-progress-card");
  const reviewProgressBefore = await reviewProgress.evaluate((element) => (
    element.textContent?.replace(/\s+/gu, " ").trim() ?? ""
  ));

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await page.getByRole("combobox", { name: "Account" }).selectOption({
    label: "Primary brokerage · 1 trade",
  });
  await page.getByRole("textbox", { name: "Activity from" }).fill("2026-07-09");
  await page.getByRole("textbox", { name: "Activity through" }).fill("2026-07-09");
  await page.getByRole("button", { name: "Apply scope" }).click();

  await page.locator("#trade-view-filter-summary").click();
  await page.getByRole("combobox", { name: "Asset class" }).selectOption("stock");
  await page.getByRole("combobox", { name: "Direction" }).selectOption("long");
  await page.getByRole("combobox", { name: "Position state" }).selectOption("closed");
  await page.getByRole("combobox", { name: "Review state" }).selectOption("pending");
  await page.getByRole("searchbox", { name: "Search scoped trades" }).fill("AAPL");
  await expect(page.locator("[data-trade-view-filter-count]")).toHaveText(
    "· 4 active filters",
  );
  await expect(page.locator("#trade-count")).toHaveText("Showing 1 of 1 trade");

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const calendarDay = page.locator('button[data-calendar-day="2026-07-09"]');
  await calendarDay.click();

  const selectedCard = page.locator('[data-calendar-day-filter="2026-07-09"]');
  const reflection = selectedCard.locator(".calendar-day-reflection");
  const reflectionHeading = reflection.locator("#calendar-day-reflection-title");
  const activityStepper = selectedCard.getByRole("group", {
    name: "Scoped activity day navigation",
  });
  await expect(selectedCard).toBeVisible();
  await expect(activityStepper).toContainText(
    "Activity day 1 of 1 in retained trade-browser scope.",
  );
  await expect(activityStepper.getByRole("button", {
    name: "Previous activity day: none in retained scope",
  })).toBeDisabled();
  await expect(activityStepper.getByRole("button", {
    name: "Next activity day: none in retained scope",
  })).toBeDisabled();
  await expect(reflectionHeading).toHaveText("Daily reflection");
  await expect(reflection.locator(".calendar-day-reflection-state")).toHaveText(
    "No reflection saved",
  );
  await expect(reflection).toContainText(
    "Daily reflections belong to the whole workspace date, not only this trade-browser scope.",
  );
  await expect(reflection).toContainText(
    "They are separate from trade reviews and do not mark this trading session reviewed.",
  );

  const exactAction = reflection.getByRole("button", {
    name: "Write reflection for this day — July 9, 2026",
  });
  await expect(exactAction).toHaveAttribute("data-daily-entry-calendar-date", "2026-07-09");
  const storageBeforeTamper = await localStorageSnapshot(page);
  await exactAction.evaluate((element) => {
    element.setAttribute("data-daily-entry-calendar-date", "2026-07-08");
  });
  await exactAction.click();
  const openError = page.locator("[data-daily-entry-open-error]");
  await expect(openError).toBeFocused();
  await expect(openError).toContainText("could not safely open this daily reflection");
  await expect(page.locator("[data-daily-entry-backdrop]")).toHaveCount(0);
  await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
  await expect(reflection.locator(".calendar-day-reflection-state")).toHaveText(
    "No reflection saved",
  );
  expect(await localStorageSnapshot(page)).toEqual(storageBeforeTamper);

  await exactAction.evaluate((element) => {
    element.removeAttribute("data-daily-entry-calendar-date");
  });
  await exactAction.click();
  await expect(openError).toBeFocused();
  await expect(openError).toContainText("could not safely open this daily reflection");
  await expect(page.locator("[data-daily-entry-open-error]")).toHaveCount(1);
  await expect(page.locator("[data-daily-entry-backdrop]")).toHaveCount(0);
  await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
  await expect(reflection.locator(".calendar-day-reflection-state")).toHaveText(
    "No reflection saved",
  );
  expect(await localStorageSnapshot(page)).toEqual(storageBeforeTamper);

  await exactAction.evaluate((element) => {
    element.setAttribute("data-daily-entry-calendar-date", "2026-07-09");
  });
  await exactAction.click();
  let dialog = page.getByRole("dialog", { name: "New daily reflection" });
  const exactDate = dialog.locator("#daily-entry-date");
  await expect(dialog).toBeVisible();
  await expect(exactDate).toHaveValue("2026-07-09");
  await expect(exactDate).toHaveAttribute("readonly", "");
  await expect(dialog.locator("#daily-entry-date-hint")).toContainText(
    "selected calendar day is this entry’s durable identity",
  );
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(exactAction).toBeFocused();

  await exactAction.click();
  dialog = page.getByRole("dialog", { name: "New daily reflection" });
  await dialog.locator("#daily-entry-date").evaluate((input) => {
    const date = input as HTMLInputElement;
    date.value = "2026-07-08";
    date.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(dialog.locator("#daily-entry-date")).toHaveValue("2026-07-08");
  await dialog.locator("#daily-entry-note").fill(
    "Captured the selected session without changing its trade review.",
  );
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(reflectionHeading).toBeFocused();
  await expect(reflection.locator(".calendar-day-reflection-state")).toHaveText(
    "Draft saved on device",
  );
  await expect(reflection.getByRole("button", {
    name: "Continue reflection draft — July 9, 2026",
  })).toHaveText("Continue reflection draft");
  await expect(activityStepper).toContainText(
    "Activity day 1 of 1 in retained trade-browser scope.",
  );

  await expect(page.getByRole("combobox", { name: "Account" }).locator("option:checked"))
    .toContainText("Primary brokerage");
  await expect(page.getByRole("textbox", { name: "Activity from" })).toHaveValue(
    "2026-07-09",
  );
  await expect(page.getByRole("textbox", { name: "Activity through" })).toHaveValue(
    "2026-07-09",
  );
  await expect(page.getByRole("searchbox", { name: "Search Jul 9 scoped trades" }))
    .toHaveValue("aapl");
  await expect(page.getByRole("combobox", { name: "Asset class" })).toHaveValue("stock");
  await expect(page.getByRole("combobox", { name: "Direction" })).toHaveValue("long");
  await expect(page.getByRole("combobox", { name: "Position state" })).toHaveValue("closed");
  await expect(page.getByRole("combobox", { name: "Review state" })).toHaveValue("pending");
  await expect(page.locator("[data-trade-view-filter-count]")).toHaveText(
    "· 4 active filters",
  );
  await expect(page.locator(".trade-card:visible")).toHaveCount(1);

  await reflection.getByRole("button", {
    name: "Continue reflection draft — July 9, 2026",
  }).click();
  dialog = page.getByRole("dialog", { name: "Edit daily reflection" });
  await expect(dialog.locator("#daily-entry-date")).toHaveValue("2026-07-09");
  await expect(dialog.locator("#daily-entry-date")).toHaveAttribute("readonly", "");
  await expect(dialog.locator("#daily-entry-note")).toHaveValue(
    "Captured the selected session without changing its trade review.",
  );
  await dialog.getByRole("button", { name: "Complete reflection" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(reflectionHeading).toBeFocused();
  await expect(reflection.locator(".calendar-day-reflection-state")).toHaveText(
    "Completed reflection saved on device",
  );
  await expect(reflection.getByRole("button", {
    name: "Edit completed reflection — July 9, 2026",
  })).toHaveText("Edit completed reflection");
  await expect(activityStepper.getByRole("button", {
    name: "Next activity day: none in retained scope",
  })).toBeDisabled();

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  expect(await reviewProgress.evaluate((element) => (
    element.textContent?.replace(/\s+/gu, " ").trim() ?? ""
  ))).toBe(reviewProgressBefore);
  await expect(calendarDay).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Trades", exact: true }).click();

  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  const completedAction = reflection.getByRole("button", {
    name: "Edit completed reflection — July 9, 2026",
  });
  for (const width of [320, 421]) {
    await page.setViewportSize({ width, height: 568 });
    await reflection.scrollIntoViewIfNeeded();
    const overflow = await reflection.evaluate((element) => ({
      document: document.documentElement.scrollWidth - window.innerWidth,
      reflection: element.scrollWidth - element.clientWidth,
    }));
    expect(overflow.document, `${width}px: ${JSON.stringify(overflow)}`)
      .toBeLessThanOrEqual(1);
    expect(overflow.reflection, `${width}px: ${JSON.stringify(overflow)}`)
      .toBeLessThanOrEqual(1);
    const actionBox = await completedAction.boundingBox();
    expect(
      actionBox,
      `${width}px calendar reflection action should have a layout box`,
    ).not.toBeNull();
    expect(actionBox?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(actionBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  expect(externalRequests).toEqual([]);
});

test("empty and fictional journals keep daily reflection controls read-only", async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.getByText(/establish your journal currency and time zone/i)).toBeVisible();
  await expect(page.locator("[data-daily-entry-new], [data-daily-entry-edit]")).toHaveCount(0);

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.getByText(/Fictional examples are read-only/i)).toBeVisible();
  await expect(page.locator(".journal-note")).not.toHaveCount(0);
  await expect(page.locator("[data-daily-entry-new], [data-daily-entry-edit]")).toHaveCount(0);
});

test("an uncertain daily reflection retries the exact command and enters stale recovery when another head wins", async ({ page, context }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:")
      && url.origin !== BASE_ORIGIN
    ) externalRequests.push(request.url());
  });
  await establishLocalJournal(page);
  const privateDetail = "/private/journals/kevin.db bridge response disappeared";
  await context.setOffline(true);

  await page.getByRole("button", { name: "Write daily reflection" }).click();
  let dialog = page.getByRole("dialog", { name: "New daily reflection" });
  const isoDate = await dialog.locator("#daily-entry-date").inputValue();
  const localDraft = {
    headline: "Keep my uncertain headline",
    note: "This only in-memory reflection must survive every check.",
    emotion: "Alert",
    score: "94",
    tags: "Exact retry, Preserve me",
  };
  await dialog.locator("#daily-entry-headline").fill(localDraft.headline);
  await dialog.locator("#daily-entry-note").fill(localDraft.note);
  await dialog.locator("#daily-entry-emotion").fill(localDraft.emotion);
  await dialog.locator("#daily-entry-score").fill(localDraft.score);
  await dialog.locator("#daily-entry-tags").fill(localDraft.tags);
  await page.evaluate((detail) => {
    const originalNow = Date.now.bind(Date);
    let failuresRemaining = 4;
    document.documentElement.dataset.dailyClockFailures = "0";
    Object.defineProperty(Date, "now", {
      configurable: true,
      value: () => {
        const stack = new Error().stack ?? "";
        if (
          failuresRemaining > 0
          && /commitDailyJournal(?:Entry|Safely)/u.test(stack)
        ) {
          failuresRemaining -= 1;
          const failures = Number(document.documentElement.dataset.dailyClockFailures ?? "0") + 1;
          document.documentElement.dataset.dailyClockFailures = String(failures);
          throw new Error(detail);
        }
        return originalNow();
      },
    });
  }, privateDetail);
  await dialog.getByRole("button", { name: "Complete reflection" }).click();

  await expect.poll(() => page.evaluate(() => (
    document.documentElement.dataset.dailyClockFailures
  ))).toBe("2");
  const error = dialog.locator("#daily-entry-error");
  const exactRetry = dialog.getByRole("button", { name: "Retry this exact save" });
  await expect(error).toContainText("retry the same save");
  await expect(error).not.toContainText(privateDetail);
  await expect(error).toBeFocused();
  await expect(exactRetry).toBeEnabled();
  const enabledControls = await dialog
    .locator("button:visible, input:visible, textarea:visible")
    .evaluateAll((elements) => elements
      .filter((element) => !(element as HTMLButtonElement | HTMLInputElement).disabled)
      .map((element) => element.id));
  expect(enabledControls).toEqual(["daily-entry-reconcile"]);
  await page.keyboard.press("Tab");
  await expect(exactRetry).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(exactRetry).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.locator("[data-daily-entry-backdrop]").click({ position: { x: 2, y: 2 } });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#daily-entry-note")).toHaveValue(localDraft.note);

  await page.evaluate(() => {
    const counter = document.documentElement;
    counter.dataset.dailyPreparedValueReads = "0";
    counter.dataset.dailyRandomIdCalls = "0";
    const incrementValueReads = () => {
      if (!(new Error().stack ?? "").includes("/assets/index-")) return;
      const reads = Number(counter.dataset.dailyPreparedValueReads ?? "0") + 1;
      counter.dataset.dailyPreparedValueReads = String(reads);
    };
    const inputDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    const inputGetter = inputDescriptor?.get;
    const inputSetter = inputDescriptor?.set;
    const textareaDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    const textareaGetter = textareaDescriptor?.get;
    const textareaSetter = textareaDescriptor?.set;
    if (
      inputDescriptor === undefined || inputGetter === undefined || inputSetter === undefined
      || textareaDescriptor === undefined || textareaGetter === undefined
      || textareaSetter === undefined
    ) throw new Error("Form value accessors are not instrumentable.");
    Object.defineProperty(HTMLInputElement.prototype, "value", {
      ...inputDescriptor,
      get(this: HTMLInputElement) {
        incrementValueReads();
        return inputGetter.call(this);
      },
      set(this: HTMLInputElement, value: string) { inputSetter.call(this, value); },
    });
    Object.defineProperty(HTMLTextAreaElement.prototype, "value", {
      ...textareaDescriptor,
      get(this: HTMLTextAreaElement) {
        incrementValueReads();
        return textareaGetter.call(this);
      },
      set(this: HTMLTextAreaElement, value: string) { textareaSetter.call(this, value); },
    });
    const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: (array: Uint8Array) => {
        const calls = Number(counter.dataset.dailyRandomIdCalls ?? "0") + 1;
        counter.dataset.dailyRandomIdCalls = String(calls);
        return originalGetRandomValues(array);
      },
    });
  });
  const pendingRetry = await exactRetry.evaluate((element) => {
    (element as HTMLButtonElement).click();
    const form = document.querySelector<HTMLElement>("#daily-entry-form");
    const controls = Array.from(document.querySelectorAll<
      HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement
    >("[data-daily-entry-backdrop] button, [data-daily-entry-backdrop] input, [data-daily-entry-backdrop] textarea"));
    return {
      busy: form?.getAttribute("aria-busy"),
      enabled: controls.filter((control) => !control.disabled).length,
      focusInDialog: document.querySelector(".daily-journal-sheet")
        ?.contains(document.activeElement) ?? false,
    };
  });
  expect(pendingRetry).toEqual({ busy: "true", enabled: 0, focusInDialog: true });
  await expect(error).toContainText("still could not confirm");
  await expect(error).toContainText("form remains locked");
  await expect(error).not.toContainText(privateDetail);
  await expect(error).toBeFocused();
  await expect(exactRetry).toBeEnabled();
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.dataset.dailyClockFailures
  ))).toBe("4");
  expect(await page.evaluate(() => ({
    valueReads: document.documentElement.dataset.dailyPreparedValueReads,
    randomIds: document.documentElement.dataset.dailyRandomIdCalls,
  }))).toEqual({ valueReads: "0", randomIds: "0" });
  await expect(dialog.locator("#daily-entry-headline")).toHaveValue(localDraft.headline);
  await expect(dialog.locator("#daily-entry-note")).toHaveValue(localDraft.note);
  await expect(dialog.locator("#daily-entry-emotion")).toHaveValue(localDraft.emotion);
  await expect(dialog.locator("#daily-entry-score")).toHaveValue(localDraft.score);
  await expect(dialog.locator("#daily-entry-tags")).toHaveValue(localDraft.tags);
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

  const uncertainBackdrop = await page.locator("[data-daily-entry-backdrop]").elementHandle();
  if (uncertainBackdrop === null) throw new Error("Expected the uncertain daily-reflection backdrop.");
  await uncertainBackdrop.evaluate((element) => {
    element.remove();
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.removeAttribute("inert");
      background.removeAttribute("aria-hidden");
    });
  });

  await page.getByRole("button", { name: "Write daily reflection" }).click();
  const competingDialog = page.getByRole("dialog", { name: "New daily reflection" });
  await expect(competingDialog.locator("#daily-entry-date")).toHaveValue(isoDate);
  await competingDialog.locator("#daily-entry-headline").fill("Competing saved head");
  await competingDialog.locator("#daily-entry-note").fill("Another screen committed version one.");
  await competingDialog.locator("#daily-entry-emotion").fill("Calm");
  await competingDialog.locator("#daily-entry-score").fill("80");
  await competingDialog.locator("#daily-entry-tags").fill("Competing");
  await competingDialog.getByRole("button", { name: "Save draft" }).click();
  await expect(competingDialog).toHaveCount(0);
  await page.evaluate(() => {
    document.documentElement.dataset.dailyPreparedValueReads = "0";
    document.documentElement.dataset.dailyRandomIdCalls = "0";
  });

  await uncertainBackdrop.evaluate((element) => {
    const root = document.querySelector("#app");
    if (root === null) throw new Error("Hermes root is unavailable.");
    root.append(element);
    document.body.classList.add("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.setAttribute("inert", "");
      background.setAttribute("aria-hidden", "true");
    });
    element.querySelector<HTMLElement>("#daily-entry-error")?.focus();
  });

  dialog = page.getByRole("dialog", { name: "New daily reflection" });
  await dialog.getByRole("button", { name: "Retry this exact save" }).click();
  expect(await page.evaluate(() => ({
    valueReads: document.documentElement.dataset.dailyPreparedValueReads,
    randomIds: document.documentElement.dataset.dailyRandomIdCalls,
  }))).toEqual({ valueReads: "0", randomIds: "0" });
  await expect(error).toContainText("Nothing was overwritten");
  await expect(error).toContainText("unsaved changes are still here");
  await expect(error).not.toContainText(privateDetail);
  await expect(error).toBeFocused();
  await expect(dialog.locator("#daily-entry-date")).toHaveAttribute("readonly", "");
  await expect(dialog.locator("#daily-entry-headline")).toHaveValue(localDraft.headline);
  await expect(dialog.locator("#daily-entry-note")).toHaveValue(localDraft.note);
  await expect(dialog.locator("#daily-entry-emotion")).toHaveValue(localDraft.emotion);
  await expect(dialog.locator("#daily-entry-score")).toHaveValue(localDraft.score);
  await expect(dialog.locator("#daily-entry-tags")).toHaveValue(localDraft.tags);
  await expect(dialog.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Complete reflection" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Retry this exact save" })).toBeHidden();

  await dialog.getByRole("button", { name: "Review latest saved version" }).click();
  const latest = dialog.locator("#daily-entry-latest");
  await expect(latest).toBeFocused();
  await expect(latest).toContainText("Version 1 · draft");
  await expect(latest).toContainText("Competing saved head");
  await expect(latest).toContainText("Another screen committed version one.");
  await expect(dialog.locator("#daily-entry-note")).toHaveValue(localDraft.note);
  const accept = dialog.getByRole("button", { name: "Continue with my unsaved changes" });
  await accept.click();
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.dataset.dailyRandomIdCalls
  ))).toBe("1");
  await expect(dialog.locator("#daily-entry-rebase-status")).toContainText("Version 1 is now the base");
  const complete = dialog.getByRole("button", { name: "Complete reflection" });
  await expect(complete).toBeEnabled();
  await expect(complete).toBeFocused();
  await complete.click();
  await expect(dialog).toHaveCount(0);
  const finalCard = page.locator(".journal-note").filter({ hasText: localDraft.headline });
  await expect(finalCard).toContainText(localDraft.note);
  await expect(finalCard).toContainText("completed");
  await expect(finalCard).toContainText("94% process");
  await expect(finalCard).toHaveAttribute("data-daily-entry-card", isoDate);
  await expect(finalCard.getByRole("heading", { name: localDraft.headline })).toBeFocused();

  await page.getByRole("button", { name: "More", exact: true }).click();
  const exportAction = page.locator("#user-data-export");
  await exportAction.click();
  await expect(exportAction).toHaveText("Share or save export");
  const downloadPromise = page.waitForEvent("download");
  await exportAction.click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("The exact-recovery export has no local path.");
  const archive = parseJournalArchive(await readFile(path, "utf8"));
  const data = archive.payload.data as unknown as {
    readonly dailyEntryVersions: readonly {
      readonly id: string;
      readonly isoDate: string;
      readonly version: number;
      readonly state: "draft" | "completed";
      readonly title: string | null;
      readonly note: string;
    }[];
    readonly dailyEntryHeads: readonly (readonly [string, string])[];
    readonly dailyEntrySubmissions: readonly (readonly [
      string,
      { readonly entryVersionId: string },
    ])[];
  };
  const versions = [...data.dailyEntryVersions]
    .filter((entry) => entry.isoDate === isoDate)
    .sort((left, right) => left.version - right.version);
  expect(versions).toHaveLength(2);
  expect(versions[0]).toMatchObject({
    version: 1,
    state: "draft",
    title: "Competing saved head",
    note: "Another screen committed version one.",
  });
  expect(versions[1]).toMatchObject({
    version: 2,
    state: "completed",
    title: localDraft.headline,
    note: localDraft.note,
  });
  const finalVersion = versions[1];
  if (finalVersion === undefined) throw new Error("Expected the exact-recovery successor.");
  expect(data.dailyEntryHeads).toEqual([[isoDate, finalVersion.id]]);
  expect(data.dailyEntrySubmissions).toHaveLength(2);
  expect(data.dailyEntrySubmissions.map(([, receipt]) => receipt.entryVersionId).sort())
    .toEqual(versions.map((entry) => entry.id).sort());
  expect(externalRequests).toEqual([]);
});

test("an uncertain exact save stays frozen after a non-head submission conflict", async ({ page, context }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:")
      && url.origin !== BASE_ORIGIN
    ) externalRequests.push(request.url());
  });
  await establishLocalJournal(page);
  await context.setOffline(true);

  const privateDetail = "/private/journals/kevin.db pre-commit bridge failure";
  await page.evaluate((detail) => {
    const root = document.documentElement;
    const originalNow = Date.now.bind(Date);
    const originalGetRandomValues = crypto.getRandomValues.bind(crypto);
    let failuresRemaining = 2;
    root.dataset.dailyClockFailures = "0";
    root.dataset.dailySubmissionIdCalls = "0";
    root.dataset.forceKnownDailySubmission = "true";
    Object.defineProperty(Date, "now", {
      configurable: true,
      value: () => {
        const stack = new Error().stack ?? "";
        if (
          failuresRemaining > 0
          && /commitDailyJournal(?:Entry|Safely)/u.test(stack)
        ) {
          failuresRemaining -= 1;
          const failures = Number(root.dataset.dailyClockFailures ?? "0") + 1;
          root.dataset.dailyClockFailures = String(failures);
          throw new Error(detail);
        }
        return originalNow();
      },
    });
    Object.defineProperty(crypto, "getRandomValues", {
      configurable: true,
      value: (array: Uint8Array) => {
        const calls = Number(root.dataset.dailySubmissionIdCalls ?? "0") + 1;
        root.dataset.dailySubmissionIdCalls = String(calls);
        if (
          root.dataset.forceKnownDailySubmission === "true"
          && array.byteLength === 32
        ) {
          root.dataset.forceKnownDailySubmission = "false";
          array.fill(0x4a);
          return array;
        }
        return originalGetRandomValues(array);
      },
    });
  }, privateDetail);

  await page.getByRole("button", { name: "Write daily reflection" }).click();
  let dialog = page.getByRole("dialog", { name: "New daily reflection" });
  const isoDate = await dialog.locator("#daily-entry-date").inputValue();
  const localDraft = {
    headline: "Retain the exact command",
    note: "This draft must remain frozen after the receipt conflict.",
    emotion: "Alert",
    score: "89",
    tags: "Exact identity",
  };
  await dialog.locator("#daily-entry-headline").fill(localDraft.headline);
  await dialog.locator("#daily-entry-note").fill(localDraft.note);
  await dialog.locator("#daily-entry-emotion").fill(localDraft.emotion);
  await dialog.locator("#daily-entry-score").fill(localDraft.score);
  await dialog.locator("#daily-entry-tags").fill(localDraft.tags);
  await dialog.getByRole("button", { name: "Complete reflection" }).click();
  const error = dialog.locator("#daily-entry-error");
  await expect(error).toContainText("retry the same save");
  await expect(error).not.toContainText(privateDetail);
  await expect.poll(() => page.evaluate(() => (
    document.documentElement.dataset.dailyClockFailures
  ))).toBe("2");

  const uncertainBackdrop = await page.locator("[data-daily-entry-backdrop]").elementHandle();
  if (uncertainBackdrop === null) throw new Error("Expected the uncertain receipt-conflict editor.");
  await uncertainBackdrop.evaluate((element) => {
    element.remove();
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.removeAttribute("inert");
      background.removeAttribute("aria-hidden");
    });
    document.documentElement.dataset.forceKnownDailySubmission = "true";
  });

  await page.getByRole("button", { name: "Write daily reflection" }).click();
  const competingDialog = page.getByRole("dialog", { name: "New daily reflection" });
  await expect(competingDialog.locator("#daily-entry-date")).toHaveValue(isoDate);
  await competingDialog.locator("#daily-entry-headline").fill("Different content, same receipt");
  await competingDialog.locator("#daily-entry-note").fill(
    "A separate prepared command now owns this exact submission identity.",
  );
  await competingDialog.locator("#daily-entry-emotion").fill("Calm");
  await competingDialog.locator("#daily-entry-score").fill("75");
  await competingDialog.locator("#daily-entry-tags").fill("Receipt conflict");
  await competingDialog.getByRole("button", { name: "Save draft" }).click();
  await expect(competingDialog).toHaveCount(0);
  await expect(page.locator(".journal-note").filter({
    hasText: "Different content, same receipt",
  })).toBeVisible();

  await uncertainBackdrop.evaluate((element) => {
    const root = document.querySelector("#app");
    if (root === null) throw new Error("Hermes root is unavailable.");
    document.documentElement.dataset.dailySubmissionIdCalls = "0";
    root.append(element);
    document.body.classList.add("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.setAttribute("inert", "");
      background.setAttribute("aria-hidden", "true");
    });
    element.querySelector<HTMLElement>("#daily-entry-error")?.focus();
  });

  dialog = page.getByRole("dialog", { name: "New daily reflection" });
  const exactRetry = dialog.getByRole("button", { name: "Retry this exact save" });
  await exactRetry.click();
  await expect(error).toContainText("could not safely prove");
  await expect(error).toContainText("outcome is still unknown");
  await expect(error).not.toContainText("already saved with different values");
  await expect(error).not.toContainText(privateDetail);
  await expect(error).toBeFocused();
  await expect(exactRetry).toBeEnabled();
  await expect(dialog.locator("#daily-entry-headline")).toHaveValue(localDraft.headline);
  await expect(dialog.locator("#daily-entry-note")).toHaveValue(localDraft.note);
  await expect(dialog.locator("#daily-entry-emotion")).toHaveValue(localDraft.emotion);
  await expect(dialog.locator("#daily-entry-score")).toHaveValue(localDraft.score);
  await expect(dialog.locator("#daily-entry-tags")).toHaveValue(localDraft.tags);
  const enabledControls = await dialog
    .locator("button:visible, input:visible, textarea:visible")
    .evaluateAll((elements) => elements
      .filter((element) => !(element as HTMLButtonElement | HTMLInputElement).disabled)
      .map((element) => element.id));
  expect(enabledControls).toEqual(["daily-entry-reconcile"]);
  expect(await page.evaluate(() => ({
    clockFailures: document.documentElement.dataset.dailyClockFailures,
    submissionIds: document.documentElement.dataset.dailySubmissionIdCalls,
  }))).toEqual({ clockFailures: "2", submissionIds: "0" });

  await exactRetry.click();
  await expect(error).toContainText("could not safely prove");
  expect(await page.evaluate(() => (
    document.documentElement.dataset.dailySubmissionIdCalls
  ))).toBe("0");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.locator("[data-daily-entry-backdrop]").click({ position: { x: 2, y: 2 } });
  await expect(dialog).toBeVisible();
  await expect(page.locator(".journal-note")).toHaveCount(1);

  await uncertainBackdrop.evaluate((element) => {
    element.remove();
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.removeAttribute("inert");
      background.removeAttribute("aria-hidden");
    });
  });
  await page.getByRole("button", { name: "More", exact: true }).click();
  const exportAction = page.locator("#user-data-export");
  await exportAction.click();
  await expect(exportAction).toHaveText("Share or save export");
  const downloadPromise = page.waitForEvent("download");
  await exportAction.click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("The non-head conflict export has no local path.");
  const archive = parseJournalArchive(await readFile(path, "utf8"));
  const data = archive.payload.data as unknown as {
    readonly dailyEntryVersions: readonly {
      readonly id: string;
      readonly isoDate: string;
      readonly version: number;
      readonly state: "draft" | "completed";
      readonly title: string | null;
      readonly note: string;
    }[];
    readonly dailyEntryHeads: readonly (readonly [string, string])[];
    readonly dailyEntrySubmissions: readonly (readonly [
      string,
      { readonly entryVersionId: string },
    ])[];
  };
  const versions = data.dailyEntryVersions.filter((entry) => entry.isoDate === isoDate);
  expect(versions).toHaveLength(1);
  expect(versions[0]).toMatchObject({
    version: 1,
    state: "draft",
    title: "Different content, same receipt",
    note: "A separate prepared command now owns this exact submission identity.",
  });
  const competing = versions[0];
  if (competing === undefined) throw new Error("Expected the competing receipt version.");
  expect(data.dailyEntryHeads).toEqual([[isoDate, competing.id]]);
  expect(data.dailyEntrySubmissions).toEqual([
    [expect.any(String), { entryVersionId: competing.id, revision: expect.any(String) }],
  ]);
  expect(externalRequests).toEqual([]);
});

test("a proven daily reflection commit retries only the failed journal refresh", async ({ page, context }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:")
      && url.origin !== BASE_ORIGIN
    ) externalRequests.push(request.url());
  });
  await establishLocalJournal(page);
  await context.setOffline(true);

  await page.getByRole("button", { name: "Write daily reflection" }).click();
  const dialog = page.getByRole("dialog", { name: "New daily reflection" });
  const isoDate = await dialog.locator("#daily-entry-date").inputValue();
  await dialog.locator("#daily-entry-headline").fill("Commit proven before refresh");
  await dialog.locator("#daily-entry-note").fill(
    "The immutable version must not be submitted again when only rendering fails.",
  );
  await dialog.locator("#daily-entry-emotion").fill("Steady");
  await dialog.locator("#daily-entry-score").fill("91");
  await dialog.locator("#daily-entry-tags").fill("Refresh only");

  const privateDetail = "/private/journals/kevin.db injected refresh failure";
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
  }, privateDetail);

  await dialog.getByRole("button", { name: "Complete reflection" }).click();
  const error = dialog.locator("#daily-entry-error");
  const refreshOnly = dialog.getByRole("button", { name: "Retry journal refresh" });
  await expect(error).toContainText("saved on this device");
  await expect(error).toContainText("Do not save it again");
  await expect(error).not.toContainText(privateDetail);
  await expect(error).toBeFocused();
  await expect(refreshOnly).toBeEnabled();
  await expect(dialog.getByRole("button", { name: "Retry this exact save" })).toBeHidden();
  const enabledControls = await dialog
    .locator("button:visible, input:visible, textarea:visible")
    .evaluateAll((elements) => elements
      .filter((element) => !(element as HTMLButtonElement | HTMLInputElement).disabled)
      .map((element) => element.id));
  expect(enabledControls).toEqual(["daily-entry-reconcile"]);
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  await page.locator("[data-daily-entry-backdrop]").click({ position: { x: 2, y: 2 } });
  await expect(dialog).toBeVisible();

  await page.evaluate(() => {
    const root = document.documentElement;
    const descriptor = Object.getOwnPropertyDescriptor(Map.prototype, "get");
    const original = descriptor?.value as (
      (this: Map<unknown, unknown>, key: unknown) => unknown
    ) | undefined;
    if (descriptor === undefined || original === undefined) {
      throw new Error("Map.prototype.get is not instrumentable.");
    }
    root.dataset.dailyCommitMapReadsDuringRefresh = "0";
    Object.defineProperty(Map.prototype, "get", {
      ...descriptor,
      value(this: Map<unknown, unknown>, key: unknown) {
        if ((new Error().stack ?? "").includes("commitDailyJournalEntry")) {
          const reads = Number(root.dataset.dailyCommitMapReadsDuringRefresh ?? "0") + 1;
          root.dataset.dailyCommitMapReadsDuringRefresh = String(reads);
        }
        return original.call(this, key);
      },
    });
  });
  await refreshOnly.click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => (
    document.documentElement.dataset.dailyCommitMapReadsDuringRefresh
  ))).toBe("0");
  const card = page.locator(".journal-note").filter({
    hasText: "Commit proven before refresh",
  });
  await expect(card).toContainText(
    "The immutable version must not be submitted again when only rendering fails.",
  );
  await expect(card).toContainText("completed");
  await expect(card).toContainText("91% process");
  await expect(card).toHaveAttribute("data-daily-entry-card", isoDate);
  const heading = card.getByRole("heading", { name: "Commit proven before refresh" });
  await expect(heading).toHaveAttribute("data-daily-entry-heading", isoDate);
  await expect(heading).toBeFocused();
  await expect(heading).toBeInViewport();

  await page.getByRole("button", { name: "More", exact: true }).click();
  const exportAction = page.locator("#user-data-export");
  await exportAction.click();
  await expect(exportAction).toHaveText("Share or save export");
  const downloadPromise = page.waitForEvent("download");
  await exportAction.click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("The refresh-only export has no local path.");
  const archive = parseJournalArchive(await readFile(path, "utf8"));
  const data = archive.payload.data as unknown as {
    readonly dailyEntryVersions: readonly {
      readonly id: string;
      readonly isoDate: string;
      readonly version: number;
      readonly state: "draft" | "completed";
      readonly title: string | null;
      readonly note: string;
    }[];
    readonly dailyEntryHeads: readonly (readonly [string, string])[];
    readonly dailyEntrySubmissions: readonly (readonly [
      string,
      { readonly entryVersionId: string },
    ])[];
  };
  const versions = data.dailyEntryVersions.filter((entry) => entry.isoDate === isoDate);
  expect(versions).toHaveLength(1);
  expect(versions[0]).toMatchObject({
    version: 1,
    state: "completed",
    title: "Commit proven before refresh",
    note: "The immutable version must not be submitted again when only rendering fails.",
  });
  const committed = versions[0];
  if (committed === undefined) throw new Error("Expected the committed refresh-only version.");
  expect(data.dailyEntryHeads).toEqual([[isoDate, committed.id]]);
  expect(data.dailyEntrySubmissions).toEqual([
    [expect.any(String), { entryVersionId: committed.id, revision: expect.any(String) }],
  ]);
  expect(externalRequests).toEqual([]);
});

test("a stale daily reflection preserves local text, proves the latest head, and appends only after consent", async ({ page, context }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:")
      && url.origin !== BASE_ORIGIN
    ) externalRequests.push(request.url());
  });
  await establishLocalJournal(page);
  await context.setOffline(true);

  await page.getByRole("button", { name: "Write daily reflection" }).click();
  let dialog = page.getByRole("dialog", { name: "New daily reflection" });
  const isoDate = await dialog.locator("#daily-entry-date").inputValue();
  await dialog.locator("#daily-entry-headline").fill("Original saved headline");
  await dialog.locator("#daily-entry-note").fill("Original immutable version.");
  await dialog.locator("#daily-entry-emotion").fill("Focused");
  await dialog.locator("#daily-entry-score").fill("70");
  await dialog.locator("#daily-entry-tags").fill("Original");
  await dialog.getByRole("button", { name: "Save draft" }).click();

  const originalCard = page.locator(".journal-note").filter({
    hasText: "Original saved headline",
  });
  await originalCard.getByRole("button", { name: /Edit daily reflection/u }).click();
  dialog = page.getByRole("dialog", { name: "Edit daily reflection" });
  const localDraft = {
    headline: "My preserved headline",
    note: "My unsaved reflection stays intact.",
    emotion: "Patient",
    score: "93",
    tags: "My draft, Keep this",
  };
  await dialog.locator("#daily-entry-headline").fill(localDraft.headline);
  await dialog.locator("#daily-entry-note").fill(localDraft.note);
  await dialog.locator("#daily-entry-emotion").fill(localDraft.emotion);
  await dialog.locator("#daily-entry-score").fill(localDraft.score);
  await dialog.locator("#daily-entry-tags").fill(localDraft.tags);

  const staleBackdrop = await page.locator("[data-daily-entry-backdrop]").elementHandle();
  if (staleBackdrop === null) throw new Error("Expected the first daily-reflection backdrop.");
  await staleBackdrop.evaluate((element) => {
    element.remove();
    document.body.classList.remove("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.removeAttribute("inert");
      background.removeAttribute("aria-hidden");
    });
  });

  await originalCard.getByRole("button", { name: /Edit daily reflection/u }).click();
  const competingDialog = page.getByRole("dialog", { name: "Edit daily reflection" });
  const latestNote = `Second screen saved ${"longtoken".repeat(20)}`;
  const latestTag = `newer-tag-${"x".repeat(40)}`;
  await competingDialog.locator("#daily-entry-headline").fill("Newer saved headline");
  await competingDialog.locator("#daily-entry-note").fill(latestNote);
  await competingDialog.locator("#daily-entry-emotion").fill("Calm");
  await competingDialog.locator("#daily-entry-score").fill("81");
  await competingDialog.locator("#daily-entry-tags").fill(latestTag);
  await competingDialog.getByRole("button", { name: "Save draft" }).click();
  await expect(competingDialog).toHaveCount(0);

  await staleBackdrop.evaluate((element) => {
    const root = document.querySelector("#app");
    if (root === null) throw new Error("Hermes root is unavailable.");
    root.append(element);
    document.body.classList.add("modal-open");
    document.querySelectorAll(".skip-link, .topbar, #screen, .tabbar").forEach((background) => {
      background.setAttribute("inert", "");
      background.setAttribute("aria-hidden", "true");
    });
    element.querySelector<HTMLElement>("#daily-entry-title")?.focus();
  });

  dialog = page.getByRole("dialog", { name: "Edit daily reflection" });
  await dialog.getByRole("button", { name: "Complete reflection" }).click();
  const error = dialog.locator("#daily-entry-error");
  await expect(error).toContainText("Nothing was overwritten");
  await expect(error).toContainText("unsaved changes are still here");
  await expect(error).toBeFocused();
  await expect(dialog.locator("#daily-entry-headline")).toHaveValue(localDraft.headline);
  await expect(dialog.locator("#daily-entry-note")).toHaveValue(localDraft.note);
  await expect(dialog.locator("#daily-entry-emotion")).toHaveValue(localDraft.emotion);
  await expect(dialog.locator("#daily-entry-score")).toHaveValue(localDraft.score);
  await expect(dialog.locator("#daily-entry-tags")).toHaveValue(localDraft.tags);
  await expect(dialog.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Complete reflection" })).toBeDisabled();
  await expect(page.locator("#screen")).toHaveAttribute("inert", "");

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
          throw new Error("Injected one-shot journal refresh failure.");
        }
        setter.call(this, value);
      },
    });
  });
  await dialog.getByRole("button", { name: "Review latest saved version" }).click();
  await expect(error).toContainText("could not prove a different newer saved version");
  await expect(error).not.toContainText("Injected one-shot");
  await expect(error).toBeFocused();
  await expect(dialog.locator("#daily-entry-date")).toHaveValue(isoDate);
  await expect(dialog.locator("#daily-entry-headline")).toHaveValue(localDraft.headline);
  await expect(dialog.locator("#daily-entry-note")).toHaveValue(localDraft.note);
  await expect(dialog.locator("#daily-entry-emotion")).toHaveValue(localDraft.emotion);
  await expect(dialog.locator("#daily-entry-score")).toHaveValue(localDraft.score);
  await expect(dialog.locator("#daily-entry-tags")).toHaveValue(localDraft.tags);
  await expect(dialog.getByRole("button", { name: "Save draft" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Complete reflection" })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "Review latest saved version" })).toBeEnabled();
  await expect(dialog.locator("#daily-entry-latest")).toBeHidden();
  await expect(dialog.getByRole("button", { name: "Continue with my unsaved changes" }))
    .toBeHidden();

  await dialog.getByRole("button", { name: "Review latest saved version" }).click();
  const accept = dialog.getByRole("button", { name: "Continue with my unsaved changes" });
  const latest = dialog.locator("#daily-entry-latest");
  await expect(latest).toBeFocused();
  await expect(latest).toHaveCSS("outline-style", "solid");
  await expect(latest).toHaveCSS("outline-width", "2px");
  await expect(latest).toContainText("Version 2 · draft");
  await expect(latest).toContainText("Newer saved headline");
  await expect(latest).toContainText(latestNote);
  await expect(latest).toContainText("Calm");
  await expect(latest).toContainText("81%");
  await expect(latest).toContainText(latestTag);
  await expect(dialog.locator("#daily-entry-note")).toHaveValue(localDraft.note);
  await expect(dialog.getByRole("button", { name: "Complete reflection" })).toBeDisabled();
  await expect(page.locator(".journal-note").filter({ hasText: "Newer saved headline" }))
    .toContainText(latestNote);
  await page.keyboard.press("Tab");
  await expect(accept).toBeFocused();

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
  for (const control of await dialog.locator("#daily-entry-conflict button:visible").all()) {
    const box = await control.boundingBox();
    expect(box, "visible conflict action should have a layout box").not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await accept.click();
  await expect(dialog.locator("#daily-entry-rebase-status"))
    .toContainText("Version 2 is now the base");
  const complete = dialog.getByRole("button", { name: "Complete reflection" });
  await expect(complete).toBeEnabled();
  await expect(complete).toBeFocused();
  await expect(page.locator(".journal-note").filter({ hasText: "Newer saved headline" }))
    .toHaveCount(1);

  await complete.click();
  await expect(dialog).toHaveCount(0);
  const finalCard = page.locator(".journal-note").filter({ hasText: localDraft.headline });
  await expect(finalCard).toContainText(localDraft.note);
  await expect(finalCard).toContainText("completed");
  await expect(finalCard).toContainText("93% process");

  await page.getByRole("button", { name: "More", exact: true }).click();
  const exportAction = page.locator("#user-data-export");
  await exportAction.click();
  await expect(exportAction).toHaveText("Share or save export");
  const downloadPromise = page.waitForEvent("download");
  await exportAction.click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("The stale-recovery export has no local path.");
  const archive = parseJournalArchive(await readFile(path, "utf8"));
  const data = archive.payload.data as unknown as {
    readonly dailyEntryVersions: readonly {
      readonly id: string;
      readonly isoDate: string;
      readonly version: number;
      readonly state: "draft" | "completed";
      readonly title: string | null;
      readonly note: string;
    }[];
    readonly dailyEntryHeads: readonly (readonly [string, string])[];
    readonly dailyEntrySubmissions: readonly (readonly [
      string,
      { readonly entryVersionId: string },
    ])[];
  };
  const versions = [...data.dailyEntryVersions]
    .filter((entry) => entry.isoDate === isoDate)
    .sort((left, right) => left.version - right.version);
  expect(versions).toHaveLength(3);
  expect(versions[0]).toMatchObject({
    version: 1,
    state: "draft",
    title: "Original saved headline",
    note: "Original immutable version.",
  });
  expect(versions[1]).toMatchObject({
    version: 2,
    state: "draft",
    title: "Newer saved headline",
    note: latestNote,
  });
  expect(versions[2]).toMatchObject({
    version: 3,
    state: "completed",
    title: localDraft.headline,
    note: localDraft.note,
  });
  const finalVersion = versions[2];
  if (finalVersion === undefined) throw new Error("Expected the reconciled version.");
  expect(data.dailyEntryHeads).toEqual([[isoDate, finalVersion.id]]);
  expect(data.dailyEntrySubmissions).toHaveLength(3);
  expect(data.dailyEntrySubmissions.map(([, receipt]) => receipt.entryVersionId).sort())
    .toEqual(versions.map((entry) => entry.id).sort());
  expect(externalRequests).toEqual([]);
});

test("daily reflection reflows at 320px and 200% text without horizontal escape", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await establishLocalJournal(page);
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  await page.getByRole("button", { name: "Write daily reflection" }).click();
  const dialog = page.getByRole("dialog", { name: "New daily reflection" });
  await dialog.locator("#daily-entry-note").fill("longtoken".repeat(150));
  await dialog.locator("#daily-entry-tags").fill("process-tag-with-a-very-long-unbroken-token");

  const dimensions = await dialog.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
  }));
  expect(dimensions.scrollWidth, JSON.stringify(dimensions))
    .toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.documentOverflow, JSON.stringify(dimensions)).toBeLessThanOrEqual(1);
  for (const control of await dialog.locator("button:visible, input:visible, textarea:visible").all()) {
    const box = await control.boundingBox();
    expect(box, "visible daily-reflection control should have a layout box").not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  await expect(dialog.getByRole("button", { name: "Complete reflection" })).toBeVisible();
});
