import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import { parseJournalArchive } from "../src/application/journal-archive";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

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
    name: "one-trade.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 2 executions" }).click();

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  const card = page.locator(".trade-card").filter({
    has: page.getByRole("heading", { name: "AAPL", exact: true }),
  });
  await card.getByRole("button", { name: /Review trade/u }).click();
  let dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await dialog.locator("#review-note").fill("First immutable export review.");
  await dialog.getByRole("button", { name: "Save draft" }).click();

  await card.getByRole("button", { name: /Edit review/u }).click();
  dialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await dialog.locator("#review-note").fill("Second immutable export review.");
  await dialog.getByRole("button", { name: "Save draft" }).click();
}

test("local export prepares offline, downloads a self-verifying archive, and never exposes demo", async ({ page }) => {
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

  await startWithReviewedTrade(page);
  await page.getByRole("button", { name: "More", exact: true }).click();

  const card = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Export journal" }),
  });
  await expect(card.getByText("Unencrypted file.", { exact: false })).toBeVisible();
  await expect(card.getByText("Development preview.", { exact: false })).toBeVisible();
  await expect(card.getByText("Compatible exports can be restored below", { exact: false }))
    .toBeVisible();

  const action = card.locator("#user-data-export");
  await action.click();
  await expect(action).toHaveText("Share or save export");
  await expect(card.getByRole("status")).toContainText(
    "2 active executions and 2 review versions",
  );

  const downloadPromise = page.waitForEvent("download");
  await action.click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^hermes-journal-export-.*\.json$/);
  const path = await download.path();
  if (path === null) throw new Error("The journal export download has no local path.");
  const contents = await readFile(path, "utf8");
  const archive = parseJournalArchive(contents);

  expect(archive).toMatchObject({
    kind: "hermes-journal-export",
    formatVersion: 1,
    payload: {
      kind: "browser-session-state",
      version: 1,
    },
    summary: {
      activeExecutions: "2",
      currentReviews: "1",
      reviewVersions: "2",
      attachments: "0",
      attachmentBytes: "0",
    },
    attachments: { version: 1, entries: [] },
  });
  const data = archive.payload.data as unknown as {
    readonly reviewVersions: readonly unknown[];
  };
  expect(data.reviewVersions).toHaveLength(2);
  await expect(card.getByRole("status")).toContainText("Download requested");
  expect(externalRequests).toEqual([]);

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Export journal" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /export/i })).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test("cancelling file share stays explicit and does not start a fallback download", async ({ page }) => {
  let downloads = 0;
  page.on("download", () => {
    downloads += 1;
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", {
      configurable: true,
      value: () => true,
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: () => Promise.reject(new DOMException("User cancelled.", "AbortError")),
    });
  });
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  await page.getByRole("button", { name: "More", exact: true }).click();

  const action = page.locator("#user-data-export");
  await action.click();
  await expect(action).toHaveText("Share or save export");
  await action.click();

  await expect(page.locator("#user-data-export-status")).toContainText("Sharing cancelled");
  await expect(action).toHaveText("Share or save export again");
  expect(downloads).toBe(0);
});
