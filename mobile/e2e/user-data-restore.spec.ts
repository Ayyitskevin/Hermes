import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  parseJournalArchive,
  type JournalArchive,
} from "../src/application/journal-archive";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

interface BrowserDailyJournalPayload {
  readonly dailyEntryVersions: readonly {
    readonly id: string;
    readonly isoDate: string;
    readonly version: number;
    readonly state: "draft" | "completed";
    readonly title: string | null;
    readonly note: string;
    readonly emotion: string | null;
    readonly processScorePct: number | null;
    readonly tags: readonly string[];
  }[];
  readonly dailyEntryHeads: readonly (readonly [string, string])[];
  readonly dailyEntrySubmissions: readonly (readonly [
    string,
    { readonly revision: string; readonly entryVersionId: string },
  ])[];
}

function dailyJournalPayload(archive: JournalArchive): BrowserDailyJournalPayload {
  if (
    archive.payload.kind !== "browser-session-state"
    || archive.payload.version !== 2
  ) {
    throw new Error("Expected a browser-session-state v2 recovery fixture.");
  }
  return archive.payload.data as unknown as BrowserDailyJournalPayload;
}

function trackExternalRequests(page: Page): string[] {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:")
      && url.origin !== BASE_ORIGIN
    ) {
      externalRequests.push(request.url());
    }
  });
  return externalRequests;
}

function tradeCard(page: Page, symbol: string): Locator {
  return page.locator(".trade-card").filter({
    has: page.getByRole("heading", { name: symbol, exact: true }),
  });
}

async function startWithReviewedTrade(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "aapl-in,AAPL,BTO,1,100,0,USD,2026-07-09T14:30:00Z",
    "aapl-out,AAPL,STC,1,110,0,USD,2026-07-09T15:00:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "restore-source.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 2 executions" }).click();

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  const card = tradeCard(page, "AAPL");
  await card.getByRole("button", { name: /Review trade/u }).click();
  let dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await dialog.locator("#review-note").fill("First immutable restore review.");
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();

  await card.getByRole("button", { name: /Edit review/u }).click();
  dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await dialog.locator("#review-note").fill("Second immutable restore review.");
  await dialog.getByRole("button", { name: "Save review changes" }).click();
}

async function downloadArchive(page: Page): Promise<{
  readonly contents: string;
  readonly archive: JournalArchive;
}> {
  const action = page.locator("#user-data-export");
  await expect(action).toHaveText("Prepare export");
  await action.click();
  await expect(action).toHaveText("Share or save export");
  const downloadPromise = page.waitForEvent("download");
  await action.click();
  const download = await downloadPromise;
  const path = await download.path();
  if (path === null) throw new Error("The journal export download has no local path.");
  const contents = await readFile(path, "utf8");
  await expect(page.locator("#user-data-export-status")).toContainText("Download requested");
  return { contents, archive: parseJournalArchive(contents) };
}

async function writeDailyDraft(page: Page): Promise<string> {
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await page.getByRole("button", { name: "Write daily reflection" }).click();
  const dialog = page.getByRole("dialog", { name: "New daily reflection" });
  const isoDate = await dialog.locator("#daily-entry-date").inputValue();
  await dialog.locator("#daily-entry-headline").fill("Recovery checkpoint");
  await dialog.locator("#daily-entry-note").fill("Draft written before export.");
  await dialog.locator("#daily-entry-emotion").fill("Focused");
  await dialog.locator("#daily-entry-score").fill("88");
  await dialog.locator("#daily-entry-tags").fill("Patient, Recovery");
  await dialog.getByRole("button", { name: "Save draft" }).click();
  await expect(page.locator(".journal-note").filter({ hasText: "Recovery checkpoint" }))
    .toContainText("Draft written before export.");
  return isoDate;
}

async function restoreArchive(
  page: Page,
  source: { readonly contents: string; readonly archive: JournalArchive },
  fileName: string,
): Promise<void> {
  await page.getByRole("button", { name: "More", exact: true }).click();
  const restoreCard = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Restore into this empty journal" }),
  });
  await restoreCard.getByLabel("Hermes archive").setInputFiles({
    name: fileName,
    mimeType: "application/vnd.hermes.journal+json",
    buffer: Buffer.from(source.contents),
  });
  const preview = restoreCard.getByRole("button", { name: "Preview archive" });
  await expect(preview).toBeEnabled();
  await preview.click();

  await expect(restoreCard.getByRole("heading", { name: "Ready for confirmation" }))
    .toBeFocused();
  await expect(restoreCard.locator("#user-data-restore-counts")).toContainText(
    `${source.archive.summary.activeExecutions} active execution${source.archive.summary.activeExecutions === "1" ? "" : "s"}`,
  );
  await expect(restoreCard.locator("#user-data-restore-counts")).toContainText(
    `${source.archive.summary.reviewVersions} review version${source.archive.summary.reviewVersions === "1" ? "" : "s"}`,
  );
  await expect(restoreCard.locator("#user-data-restore-payload"))
    .toHaveText("browser-session-state v2 · empty target verified");
  await expect(restoreCard.locator("#user-data-restore-state-digest"))
    .toHaveText(source.archive.stateSha256);
  await expect(restoreCard.locator("#user-data-restore-report-digest"))
    .toHaveText(source.archive.reportSha256);

  const commit = restoreCard.locator("#user-data-restore-commit");
  await expect(commit).toBeDisabled();
  await restoreCard.locator("#user-data-restore-confirm").check();
  await expect(commit).toBeEnabled();
  await commit.click();
  await expect(page.locator("#route-announcer")).toHaveText(
    "Restore complete. The verified journal is now available on this device.",
  );
  await expect(page.locator("#screen")).toBeFocused();
}

test("restores a daily draft offline, continues its immutable history, and restores the successor", async ({
  context,
  page,
}) => {
  const externalRequests = trackExternalRequests(page);
  await startWithReviewedTrade(page);
  const dailyDate = await writeDailyDraft(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  const original = await downloadArchive(page);
  expect(original.archive.summary.reviewVersions).toBe("2");
  const originalDaily = dailyJournalPayload(original.archive);
  expect(originalDaily.dailyEntryVersions).toEqual([
    expect.objectContaining({
      isoDate: dailyDate,
      version: 1,
      state: "draft",
      title: "Recovery checkpoint",
      note: "Draft written before export.",
      emotion: "Focused",
      processScorePct: 88,
      tags: ["Patient", "Recovery"],
    }),
  ]);
  expect(originalDaily.dailyEntryHeads).toHaveLength(1);
  expect(originalDaily.dailyEntrySubmissions).toHaveLength(1);

  await page.reload();
  await expect(page.getByRole("heading", { name: "Build your journal", exact: true })).toBeVisible();
  await context.setOffline(true);
  try {
    await restoreArchive(page, original, "daily-draft.json");

    const blockedRestore = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "Empty journal required" }),
    });
    await expect(blockedRestore).toContainText("never merges or overwrites");
    await expect(blockedRestore).toContainText("Delete All Data is not available yet");
    await expect(blockedRestore.locator("#user-data-restore-file")).toHaveCount(0);
    await expect(blockedRestore.getByRole("button")).toHaveCount(0);

    await page.getByRole("button", { name: "Trades", exact: true }).click();
    const restoredTrade = tradeCard(page, "AAPL");
    await expect(restoredTrade).toContainText("completed");
    await restoredTrade.getByRole("button", { name: "Edit review" }).click();
    const restoredReview = page.getByRole("dialog", { name: "AAPL trade review" });
    await expect(restoredReview.getByText("REVIEWED · VERSION 2", { exact: true }))
      .toBeVisible();
    await expect(restoredReview.locator("#review-note"))
      .toHaveValue("Second immutable restore review.");
    await restoredReview.getByRole("button", { name: "Cancel" }).click();

    await page.getByRole("button", { name: "Journal", exact: true }).click();
    const restoredDaily = page.locator(".journal-note").filter({
      hasText: "Recovery checkpoint",
    });
    await expect(restoredDaily).toHaveCount(1);
    await expect(restoredDaily).toContainText("Draft written before export.");
    await expect(restoredDaily).toContainText("draft");
    await expect(restoredDaily).toContainText("Focused");
    await expect(restoredDaily).toContainText("88% process");
    await expect(restoredDaily).toContainText("Patient");
    await expect(restoredDaily).toContainText("Recovery");

    await page.getByRole("button", { name: "More", exact: true }).click();
    const restored = await downloadArchive(page);
    expect(restored.archive.stateSha256).toBe(original.archive.stateSha256);
    expect(restored.archive.reportSha256).toBe(original.archive.reportSha256);
    expect(restored.archive.summary.reviewVersions).toBe("2");

    await page.getByRole("button", { name: "Journal", exact: true }).click();
    await restoredDaily.getByRole("button", { name: /Edit daily reflection for/u }).click();
    const editor = page.getByRole("dialog", { name: "Edit daily reflection" });
    await expect(editor.locator("#daily-entry-date")).toHaveAttribute("readonly", "");
    await expect(editor.locator("#daily-entry-date")).toHaveValue(dailyDate);
    await expect(editor.locator("#daily-entry-headline")).toHaveValue("Recovery checkpoint");
    await expect(editor.locator("#daily-entry-note")).toHaveValue("Draft written before export.");
    await expect(editor.locator("#daily-entry-emotion")).toHaveValue("Focused");
    await expect(editor.locator("#daily-entry-score")).toHaveValue("88");
    await expect(editor.locator("#daily-entry-tags")).toHaveValue("Patient, Recovery");
    await editor.locator("#daily-entry-note").fill("Continued safely after restoring the archive.");
    await editor.locator("#daily-entry-emotion").fill("Relieved");
    await editor.locator("#daily-entry-score").fill("94");
    await editor.locator("#daily-entry-tags").fill("Patient, Recovery verified");
    await editor.getByRole("button", { name: "Complete reflection" }).click();
    await expect(page.locator("#route-announcer")).toContainText("saved on device.");
    await expect(page.locator("#screen")).toBeFocused();

    const completedDaily = page.locator(".journal-note").filter({
      hasText: "Recovery checkpoint",
    });
    await expect(completedDaily).toHaveCount(1);
    await expect(completedDaily).toContainText("Continued safely after restoring the archive.");
    await expect(completedDaily).toContainText("completed");
    await expect(completedDaily).toContainText("Relieved");
    await expect(completedDaily).toContainText("94% process");

    await page.getByRole("button", { name: "More", exact: true }).click();
    const continued = await downloadArchive(page);
    expect(continued.archive.stateSha256).not.toBe(original.archive.stateSha256);
    const continuedDaily = dailyJournalPayload(continued.archive);
    expect(continuedDaily.dailyEntryVersions).toHaveLength(2);
    expect(continuedDaily.dailyEntryHeads).toHaveLength(1);
    expect(continuedDaily.dailyEntrySubmissions).toHaveLength(2);
    const versions = [...continuedDaily.dailyEntryVersions]
      .sort((left, right) => left.version - right.version);
    const first = versions[0];
    const second = versions[1];
    if (first === undefined || second === undefined) {
      throw new Error("Expected two immutable daily-entry versions.");
    }
    expect(first).toMatchObject({
      isoDate: dailyDate,
      version: 1,
      state: "draft",
      note: "Draft written before export.",
      emotion: "Focused",
      processScorePct: 88,
      tags: ["Patient", "Recovery"],
    });
    expect(second).toMatchObject({
      isoDate: dailyDate,
      version: 2,
      state: "completed",
      note: "Continued safely after restoring the archive.",
      emotion: "Relieved",
      processScorePct: 94,
      tags: ["Patient", "Recovery verified"],
    });
    expect(continuedDaily.dailyEntryHeads).toEqual([[dailyDate, second.id]]);
    expect(continuedDaily.dailyEntrySubmissions
      .map(([, submission]) => submission.entryVersionId)
      .sort()).toEqual([first.id, second.id].sort());

    await context.setOffline(false);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Build your journal", exact: true }))
      .toBeVisible();
    await context.setOffline(true);
    await restoreArchive(page, continued, "continued-daily-journal.json");
    await page.getByRole("button", { name: "Journal", exact: true }).click();
    const replayedDaily = page.locator(".journal-note").filter({
      hasText: "Recovery checkpoint",
    });
    await expect(replayedDaily).toHaveCount(1);
    await expect(replayedDaily).toContainText("Continued safely after restoring the archive.");
    await expect(replayedDaily).toContainText("completed");
    await expect(replayedDaily).toContainText("Relieved");

    await page.getByRole("button", { name: "More", exact: true }).click();
    const replayed = await downloadArchive(page);
    expect(replayed.archive.stateSha256).toBe(continued.archive.stateSha256);
    expect(replayed.archive.reportSha256).toBe(continued.archive.reportSha256);
    expect(externalRequests).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
});

test("changing files during an asynchronous preview cannot expose stale restore approval", async ({
  page,
}) => {
  const externalRequests = trackExternalRequests(page);
  await startWithReviewedTrade(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  const original = await downloadArchive(page);
  await writeDailyDraft(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  const replacement = await downloadArchive(page);
  expect(replacement.archive.stateSha256).not.toBe(original.archive.stateSha256);

  await page.addInitScript(() => {
    const nativeText = File.prototype.text;
    Object.defineProperty(File.prototype, "text", {
      configurable: true,
      writable: true,
      value(this: File): Promise<string> {
        if (this.name !== "slow-original.json") return nativeText.call(this);
        const file = this;
        return new Promise<string>((resolve, reject) => {
          Reflect.set(window, "__hermesReleaseSlowArchive", async () => {
            try {
              resolve(await nativeText.call(file));
            } catch (error) {
              reject(error);
            }
          });
        });
      },
    });
  });
  await page.reload();
  await page.getByRole("button", { name: "More", exact: true }).click();

  const restoreCard = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Restore into this empty journal" }),
  });
  const input = restoreCard.getByLabel("Hermes archive");
  const preview = restoreCard.getByRole("button", { name: "Preview archive" });
  const details = restoreCard.locator("#user-data-restore-details");
  const confirmation = restoreCard.locator("#user-data-restore-confirm");
  const commit = restoreCard.locator("#user-data-restore-commit");
  const status = restoreCard.locator("#user-data-restore-status");

  await input.setInputFiles({
    name: "slow-original.json",
    mimeType: "application/vnd.hermes.journal+json",
    buffer: Buffer.from(original.contents),
  });
  await preview.click();
  await expect(status).toContainText("Reading and verifying");
  await page.waitForFunction(() => (
    typeof Reflect.get(window, "__hermesReleaseSlowArchive") === "function"
  ));

  await input.setInputFiles({
    name: "replacement.json",
    mimeType: "application/vnd.hermes.journal+json",
    buffer: Buffer.from(replacement.contents),
  });
  await expect(status).toHaveText(
    "replacement.json. Choose Preview archive to verify it before restore.",
  );
  await input.focus();
  await expect(input).toBeFocused();
  await expect(details).toBeHidden();
  await expect(confirmation).toBeDisabled();
  await expect(commit).toBeDisabled();
  await expect(preview).toBeEnabled();

  await page.evaluate(async () => {
    const release = Reflect.get(window, "__hermesReleaseSlowArchive");
    if (typeof release !== "function") {
      throw new Error("The delayed archive read was not installed.");
    }
    await release();
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  });
  await expect(status).toHaveText(
    "replacement.json. Choose Preview archive to verify it before restore.",
  );
  await expect(input).toBeFocused();
  await expect(details).toBeHidden();
  await expect(confirmation).toBeDisabled();
  await expect(commit).toBeDisabled();
  await expect(preview).toBeEnabled();

  await preview.click();
  await expect(restoreCard.getByRole("heading", { name: "Ready for confirmation" }))
    .toBeFocused();
  await expect(restoreCard.locator("#user-data-restore-state-digest"))
    .toHaveText(replacement.archive.stateSha256);
  await expect(restoreCard.locator("#user-data-restore-state-digest"))
    .not.toHaveText(original.archive.stateSha256);
  await expect(status).toContainText("Verified: the archive is compatible");
  await expect(confirmation).toBeEnabled();
  await expect(confirmation).not.toBeChecked();
  await expect(commit).toBeDisabled();

  await restoreCard.getByRole("button", { name: "Cancel" }).click();
  await expect(status).toHaveText(
    "Restore preview cancelled. Choose an archive to start again.",
  );
  await expect(input).toBeFocused();
  await expect(details).toBeHidden();
  await expect(commit).toBeDisabled();
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Build your journal", exact: true }))
    .toBeVisible();
  expect(externalRequests).toEqual([]);
});

test("demo mode omits every private restore surface", async ({ page }) => {
  const externalRequests = trackExternalRequests(page);
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await page.getByRole("button", { name: "More", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Demo stays separate" })).toBeVisible();
  await expect(page.locator(".user-data-restore")).toHaveCount(0);
  await expect(page.locator("#user-data-restore-file")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /restore|preview archive/iu })).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test("empty restore controls reflow at 320px and 200% text with touch-size targets", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "More", exact: true }).click();
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Restore into this empty journal" }),
  });
  await expect(card).toBeVisible();
  await expect(card.getByLabel("Hermes archive")).toHaveAttribute(
    "accept",
    ".json,application/json,application/vnd.hermes.journal+json",
  );

  const dimensions = await card.evaluate((element) => {
    const cardBounds = element.getBoundingClientRect();
    const offenders = Array.from(element.querySelectorAll<HTMLElement>("*"))
      .filter((candidate) => candidate.getClientRects().length > 0)
      .map((candidate) => ({
        element: `${candidate.tagName.toLowerCase()}${candidate.id ? `#${candidate.id}` : ""}`,
        left: candidate.getBoundingClientRect().left,
        right: candidate.getBoundingClientRect().right,
      }))
      .filter((candidate) => (
        candidate.left < cardBounds.left - 1 || candidate.right > cardBounds.right + 1
      ));
    const targets = Array.from(
      element.querySelectorAll<HTMLElement>('button, input[type="file"]'),
    ).filter((candidate) => candidate.getClientRects().length > 0).map((candidate) => ({
      element: `${candidate.tagName.toLowerCase()}${candidate.id ? `#${candidate.id}` : ""}`,
      width: candidate.getBoundingClientRect().width,
      height: candidate.getBoundingClientRect().height,
    }));
    return {
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      offenders,
      targets,
    };
  });
  expect(dimensions.scrollWidth, JSON.stringify(dimensions))
    .toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.offenders).toEqual([]);
  expect(dimensions.targets.length).toBeGreaterThan(0);
  for (const target of dimensions.targets) {
    expect(target.width, target.element).toBeGreaterThanOrEqual(44);
    expect(target.height, target.element).toBeGreaterThanOrEqual(44);
  }
});
