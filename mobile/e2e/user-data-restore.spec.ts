import { readFile } from "node:fs/promises";

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  parseJournalArchive,
  type JournalArchive,
} from "../src/application/journal-archive";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

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

test("restores a reviewed journal offline and re-exports identical durable digests", async ({
  context,
  page,
}) => {
  const externalRequests = trackExternalRequests(page);
  await startWithReviewedTrade(page);
  await page.getByRole("button", { name: "More", exact: true }).click();
  const original = await downloadArchive(page);
  expect(original.archive.summary.reviewVersions).toBe("2");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Build your journal", exact: true })).toBeVisible();
  await context.setOffline(true);
  try {
    await page.getByRole("button", { name: "More", exact: true }).click();
    const restoreCard = page.getByRole("article").filter({
      has: page.getByRole("heading", { name: "Restore into this empty journal" }),
    });
    const fileInput = restoreCard.getByLabel("Hermes archive");
    await fileInput.setInputFiles({
      name: "reviewed-journal.json",
      mimeType: "application/vnd.hermes.journal+json",
      buffer: Buffer.from(original.contents),
    });
    const preview = restoreCard.getByRole("button", { name: "Preview archive" });
    await expect(preview).toBeEnabled();
    await preview.click();

    await expect(restoreCard.getByRole("heading", { name: "Ready for confirmation" }))
      .toBeFocused();
    await expect(restoreCard.locator("#user-data-restore-counts"))
      .toContainText("2 active executions");
    await expect(restoreCard.locator("#user-data-restore-counts"))
      .toContainText("2 review versions");
    await expect(restoreCard.locator("#user-data-restore-payload"))
      .toHaveText("browser-session-state v2 · empty target verified");
    await expect(restoreCard.locator("#user-data-restore-state-digest"))
      .toHaveText(original.archive.stateSha256);
    await expect(restoreCard.locator("#user-data-restore-report-digest"))
      .toHaveText(original.archive.reportSha256);

    const commit = restoreCard.getByRole("button", { name: "Restore verified archive" });
    await expect(commit).toBeDisabled();
    await restoreCard.locator("#user-data-restore-confirm").check();
    await expect(commit).toBeEnabled();
    await commit.click();
    await expect(page.locator("#route-announcer")).toHaveText(
      "Restore complete. The verified journal is now available on this device.",
    );

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

    await page.getByRole("button", { name: "More", exact: true }).click();
    const restored = await downloadArchive(page);
    expect(restored.archive.stateSha256).toBe(original.archive.stateSha256);
    expect(restored.archive.reportSha256).toBe(original.archive.reportSha256);
    expect(restored.archive.summary.reviewVersions).toBe("2");
    expect(externalRequests).toEqual([]);
  } finally {
    await context.setOffline(false);
  }
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
