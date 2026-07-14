import { expect, test, type Page } from "@playwright/test";

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
    };
  });
  expect(pending).toEqual({ busy: "true", enabled: 0 });
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
