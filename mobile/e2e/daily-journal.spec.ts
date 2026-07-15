import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { parseJournalArchive } from "../src/application/journal-archive";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

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
  const firstDateLabel = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${firstDate}T12:00:00.000Z`));

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

  await page.getByRole("button", { name: "Write another date" }).click();
  const anotherDialog = page.getByRole("dialog", { name: "New daily reflection" });
  const anotherDate = await anotherDialog.locator("#daily-entry-date").inputValue();
  expect(anotherDate).not.toBe(firstDate);
  await anotherDialog.locator("#daily-entry-note").fill("No setup met the plan.");
  await anotherDialog.getByRole("button", { name: "Save draft" }).click();
  await expect(anotherDialog).toHaveCount(0);
  await expect(page.locator(".journal-note")).toHaveCount(2);
  await expect(page.locator(".journal-note").filter({ hasText: "No setup met the plan." }))
    .toBeVisible();

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
  await expect(page.locator("#screen")).toBeFocused();
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
