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

interface QuickReviewArchiveData {
  readonly reviewVersions: readonly {
    readonly state: "draft" | "completed";
  }[];
  readonly reviewHeads: readonly (readonly [string, string])[];
  readonly reviewSubmissions: readonly (readonly [string, unknown])[];
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
    name: "quick-review.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 4 executions" }).click();
  await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
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
  if (path === null) throw new Error("The Quick Review export has no local path.");
  return parseJournalArchive(await readFile(path, "utf8"));
}

function archiveData(archive: JournalArchive): QuickReviewArchiveData {
  return archive.payload.data as unknown as QuickReviewArchiveData;
}

test("Quick Review advances, reuses vocabulary, pauses drafts, and clears locally", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const externalRequests = logExternalRequests(page);
  await importTwoClosedTrades(page);
  const storageAfterImport = await storageSnapshot(page);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  const quickCard = page.locator("[data-quick-review]");
  await expect(quickCard).toHaveCount(1);
  const startAction = quickCard.getByRole("button", { name: /Start quick review for AAPL/u });
  await expect(startAction).toBeVisible();
  await startAction.click();
  let dialog = page.getByRole("dialog", { name: /AAPL trade review/u });
  await expect(dialog).toBeVisible();
  const evidence = dialog.locator("[data-quick-review-evidence]");
  await expect(evidence).not.toHaveAttribute("open", "");
  await expect(dialog.getByRole("heading", { name: "Execution inspection" })).toBeHidden();
  await expect(page.locator("#screen")).toHaveAttribute("inert", "");
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  const summary = evidence.locator("summary");
  await expect(summary).toBeVisible();
  const layout = await dialog.evaluate((element) => ({
    documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
    sheetOverflow: element.scrollWidth - element.clientWidth,
  }));
  expect(layout.documentOverflow).toBeLessThanOrEqual(1);
  expect(layout.sheetOverflow).toBeLessThanOrEqual(1);
  const controls = await dialog.locator("button:visible").all();
  for (const control of controls) {
    const box = await control.boundingBox();
    expect(box, "Quick Review control should have a layout box").not.toBeNull();
    expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  }
  const summaryBox = await summary.boundingBox();
  expect(summaryBox, "Outcome summary should have a layout box").not.toBeNull();
  expect(summaryBox?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.evaluate(() => { delete document.documentElement.dataset.testTextScale; });
  await dialog.locator("#review-setup").fill("Opening range breakout");
  await dialog.locator("#review-emotion").fill("Focused");
  await dialog.locator("#review-mistakes").fill("Late scale-out");
  await dialog.locator("#review-note").fill("AAPL followed the planned confirmation.");
  await dialog.getByRole("button", { name: "Mark reviewed & next" }).click();
  await expect(page.getByRole("dialog", { name: /AAPL trade review/u })).toHaveCount(0);
  dialog = page.getByRole("dialog", { name: /MSFT trade review/u });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#route-announcer")).toHaveText("AAPL review completed.");
  const setupChoice = dialog.getByRole("button", { name: "Use setup Opening range breakout" });
  const emotionChoice = dialog.getByRole("button", { name: "Use emotion Focused" });
  await expect(setupChoice).toBeVisible();
  await expect(emotionChoice).toBeVisible();
  await setupChoice.click();
  await emotionChoice.click();
  await expect(dialog.locator("#review-setup")).toHaveValue("Opening range breakout");
  await expect(dialog.locator("#review-emotion")).toHaveValue("Focused");
  await dialog.locator("#review-note").fill("MSFT draft pauses this one-thumb session.");
  const msftEvidence = dialog.locator("[data-quick-review-evidence]");
  await expect(msftEvidence).not.toHaveAttribute("open", "");
  await dialog.getByRole("button", { name: "Save draft & pause" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#quick-review-title")).toBeFocused();
  await expect(page.locator('[data-review-queue-group="draft"]')).toContainText("MSFT");
  await quickCard.getByRole("button", { name: /Continue quick review for MSFT/u }).click();
  dialog = page.getByRole("dialog", { name: /MSFT trade review/u });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#review-setup")).toHaveValue("Opening range breakout");
  await expect(dialog.locator("#review-emotion")).toHaveValue("Focused");
  await expect(dialog.locator("#review-note")).toHaveValue("MSFT draft pauses this one-thumb session.");
  await dialog.getByRole("button", { name: "Finish quick review" }).click();
  const clearTitle = page.locator("#review-queue-clear-title");
  await expect(clearTitle).toBeVisible();
  await expect(clearTitle).toBeFocused();
  await expect(page.locator("[data-review-queue-group]")).toHaveCount(0);
  await expect(page.locator("[data-quick-review]")).toHaveCount(0);
  await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
  await expect(page.locator("#screen")).not.toHaveAttribute("aria-hidden", "true");
  await expect(page.locator("body")).not.toHaveClass(/modal-open/u);
  expect(await storageSnapshot(page)).toEqual(storageAfterImport);
  const data = archiveData(await exportJournal(page));
  expect(data.reviewVersions).toHaveLength(3);
  expect(data.reviewVersions.filter((version) => version.state === "completed")).toHaveLength(2);
  expect(data.reviewVersions.filter((version) => version.state === "draft")).toHaveLength(1);
  expect(data.reviewHeads).toHaveLength(2);
  expect(data.reviewSubmissions).toHaveLength(3);
  expect(externalRequests).toEqual([]);
});

test("Quick Review fails visibly when the exact rebuilt continuation does not open", async ({ page }) => {
  const externalRequests = logExternalRequests(page);
  await importTwoClosedTrades(page);
  const storageAfterImport = await storageSnapshot(page);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await page.getByRole("button", { name: /Start quick review for AAPL/u }).click();
  const dialog = page.getByRole("dialog", { name: /AAPL trade review/u });
  await expect(dialog).toBeVisible();
  await dialog.locator("#review-note").fill("AAPL saves before a blocked continuation.");
  await page.evaluate(() => {
    const blockExactNext = (event: Event) => {
      const target = event.target;
      const action = target instanceof Element
        ? target.closest<HTMLButtonElement>('button[data-trade-review-origin="quick-review"]')
        : null;
      if (!action?.getAttribute("aria-label")?.includes("MSFT")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      document.removeEventListener("click", blockExactNext, true);
    };
    document.addEventListener("click", blockExactNext, true);
  });

  await dialog.getByRole("button", { name: "Mark reviewed & next" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: /MSFT trade review/u })).toHaveCount(0);
  const error = page.locator("[data-quick-review-continuation-error]");
  await expect(error).toBeVisible();
  await expect(error).toBeFocused();
  await expect(error).toContainText("could not open the exact next queued trade");
  await expect(page.getByRole("button", { name: /Start quick review for MSFT/u })).toBeEnabled();
  expect(await storageSnapshot(page)).toEqual(storageAfterImport);
  const data = archiveData(await exportJournal(page));
  expect(data.reviewVersions).toEqual([
    expect.objectContaining({
      state: "completed",
    }),
  ]);
  expect(data.reviewHeads).toHaveLength(1);
  expect(data.reviewSubmissions).toHaveLength(1);
  expect(externalRequests).toEqual([]);
});

test("Quick Review rejects a moved or tampered launcher before opening or writing", async ({ page }) => {
  const externalRequests = logExternalRequests(page);
  await importTwoClosedTrades(page);
  const storageAfterImport = await storageSnapshot(page);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  const quickCard = page.locator("[data-quick-review]");
  const startAction = quickCard.getByRole("button", { name: /Start quick review for AAPL/u });
  await quickCard.evaluate((card) => {
    const screen = document.querySelector("#screen");
    if (!(screen instanceof HTMLElement)) throw new Error("Journal screen is unavailable.");
    screen.append(card);
  });
  await startAction.click();
  const error = page.locator("[data-trade-review-open-error]");
  await expect(error).toBeVisible();
  await expect(error).toBeFocused();
  await expect(error).toContainText("stable local identity is unavailable");
  await expect(page.locator("[data-trade-review-backdrop]")).toHaveCount(0);
  await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");

  await quickCard.evaluate((card) => {
    const queue = document.querySelector("[data-review-queue]");
    const title = queue?.firstElementChild;
    if (!(queue instanceof HTMLElement) || !(title instanceof Element)) {
      throw new Error("Review queue is unavailable.");
    }
    title.insertAdjacentElement("afterend", card);
    card.setAttribute("data-quick-review-subject", "tampered-subject");
  });
  await startAction.click();
  await expect(error).toBeVisible();
  await expect(error).toBeFocused();
  await expect(error).toContainText("stable local identity is unavailable");
  await expect(page.locator("[data-trade-review-backdrop]")).toHaveCount(0);
  expect(await storageSnapshot(page)).toEqual(storageAfterImport);
  const data = archiveData(await exportJournal(page));
  expect(data.reviewVersions).toHaveLength(0);
  expect(data.reviewHeads).toHaveLength(0);
  expect(data.reviewSubmissions).toHaveLength(0);
  expect(externalRequests).toEqual([]);
});

test("Quick Review retries only a committed refresh before opening the next trade", async ({ page }) => {
  const externalRequests = logExternalRequests(page);
  await importTwoClosedTrades(page);
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await page.getByRole("button", { name: /Start quick review for AAPL/u }).click();
  const aaplDialog = page.getByRole("dialog", { name: /AAPL trade review/u });
  await expect(aaplDialog).toBeVisible();
  await aaplDialog.locator("#review-note").fill("The saved review advances only after redraw.");
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
          throw new Error("injected Quick Review refresh failure");
        }
        setter.call(this, value);
      },
    });
  });

  await aaplDialog.getByRole("button", { name: "Mark reviewed & next" }).click();
  const retry = aaplDialog.getByRole("button", { name: "Retry journal refresh" });
  await expect(aaplDialog.locator("#trade-review-error")).toContainText("saved on this device");
  await expect(retry).toBeEnabled();
  await expect(page.getByRole("dialog", { name: /MSFT trade review/u })).toHaveCount(0);

  await retry.click();
  await expect(aaplDialog).toHaveCount(0);
  const msftDialog = page.getByRole("dialog", { name: /MSFT trade review/u });
  await expect(msftDialog).toBeVisible();
  await msftDialog.getByRole("button", { name: "Close trade review" }).click();
  const data = archiveData(await exportJournal(page));
  expect(data.reviewVersions).toEqual([
    expect.objectContaining({
      state: "completed",
    }),
  ]);
  expect(data.reviewHeads).toHaveLength(1);
  expect(data.reviewSubmissions).toHaveLength(1);
  expect(externalRequests).toEqual([]);
});
