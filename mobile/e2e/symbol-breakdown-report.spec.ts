import { expect, test, type Locator, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

function logExternalRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:")
      && url.origin !== BASE_ORIGIN
    ) {
      requests.push(request.url());
    }
  });
  return requests;
}

async function startDemo(page: Page): Promise<void> {
  await page.addInitScript(
    (key) => window.localStorage.setItem(key, "complete"),
    ONBOARDING_KEY,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await expect(
    page.getByRole("heading", { name: "Dashboard", exact: true }),
  ).toBeVisible();
}

async function importRepeatedClosedTrades(
  page: Page,
  tradeCount: number,
): Promise<void> {
  await page.addInitScript(
    (key) => window.localStorage.setItem(key, "complete"),
    ONBOARDING_KEY,
  );
  await page.goto("/");
  const startedAt = Date.parse("2026-07-09T14:00:00.000Z");
  const rows = Array.from({ length: tradeCount }, (_, index) => {
    const openedAt = new Date(startedAt + index * 120_000).toISOString();
    const closedAt = new Date(startedAt + index * 120_000 + 60_000).toISOString();
    return [
      `aapl-${index}-in,AAPL,BTO,1,100,0,USD,${openedAt}`,
      `aapl-${index}-out,AAPL,STC,1,101,0,USD,${closedAt}`,
    ];
  }).flat();
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    ...rows,
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "repeated-aapl.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", {
    name: `Import ${tradeCount * 2} executions`,
  }).click();
  await expect(
    page.getByRole("heading", { name: "More", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
}

async function storageSnapshot(page: Page): Promise<{
  readonly local: readonly string[];
  readonly session: readonly string[];
}> {
  return page.evaluate(() => {
    const entries = (storage: Storage): readonly string[] => (
      Array.from({ length: storage.length }, (_, index) => {
        const key = storage.key(index);
        return JSON.stringify([
          key,
          key === null ? null : storage.getItem(key),
        ]);
      }).sort()
    );
    return {
      local: entries(window.localStorage),
      session: entries(window.sessionStorage),
    };
  });
}

async function expectTouchTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

async function expectUnobscured(locator: Locator): Promise<void> {
  const geometry = await locator.evaluate((element) => {
    const target = element.getBoundingClientRect();
    const topbar = document.querySelector<HTMLElement>(".topbar");
    const topbarRect = topbar?.getBoundingClientRect();
    const topbarPosition = topbar === null
      ? "static"
      : window.getComputedStyle(topbar).position;
    const topBoundary = (
      (topbarPosition === "sticky" || topbarPosition === "fixed")
      && topbarRect !== undefined
      && topbarRect.bottom > 0
    )
      ? topbarRect.bottom
      : 0;
    const tabbarTop = document.querySelector<HTMLElement>(".tabbar")
      ?.getBoundingClientRect().top ?? window.innerHeight;
    return {
      target: { top: target.top, bottom: target.bottom },
      topBoundary,
      bottomBoundary: Math.min(window.innerHeight, tabbarTop),
    };
  });
  expect(geometry.target.top).toBeGreaterThanOrEqual(geometry.topBoundary - 1);
  expect(geometry.target.bottom)
    .toBeLessThanOrEqual(geometry.bottomBoundary + 1);
}

test(
  "symbol breakdown counts the exact demo cohort in stable bounded groups",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await startDemo(page);
    await context.setOffline(true);
    const storageBefore = await storageSnapshot(page);
    await page.getByRole("button", { name: "Reports", exact: true }).click();

    const section = page.locator("[data-symbol-breakdown]");
    await expect(section).toBeVisible();
    const metadata = section.locator(".symbol-breakdown-meta");
    for (const expected of [
      "symbol-breakdown-report-v1",
      "33c47664633d24b75a80cde1dfac46e366f2e04ecccc852ce807792743cb8aef",
      "Jul 1–9, 2026",
      "UTC",
      "2 demo accounts",
      "Current full-workspace projection",
      "8 current trades",
    ]) {
      await expect(metadata).toContainText(expected);
    }

    const groups = section.locator("[data-symbol-breakdown-group-index]");
    await expect(groups).toHaveCount(5);
    await expect(groups.evaluateAll((elements) => elements.map((element) => [
      element.getAttribute("data-symbol-breakdown-symbol"),
      element.getAttribute("data-symbol-breakdown-asset-class"),
      element.querySelector(":scope > summary strong")?.textContent,
      element.querySelector(
        ":scope > summary .plan-check-summary-label span",
      )?.textContent,
      element.querySelector("[data-symbol-breakdown-trade]")
        ?.getAttribute("data-symbol-breakdown-trade"),
    ]))).resolves.toEqual([
      ["AAPL", "stock", "AAPL · Stock", "1 current trade", "demo-subject-aapl"],
      ["AMD", "stock", "AMD · Stock", "1 current trade", "demo-subject-amd"],
      ["META", "stock", "META · Stock", "1 current trade", "demo-subject-meta"],
      ["MSFT", "stock", "MSFT · Stock", "1 current trade", "demo-subject-msft"],
      ["NVDA", "stock", "NVDA · Stock", "1 current trade", "demo-subject-nvda"],
    ]);
    for (const resultLabel of [
      "Cash expectancy",
      "Win rate",
      "Average R",
      "Net P&L",
    ]) {
      await expect(section).not.toContainText(resultLabel);
    }

    const showMore = section.getByRole("button", {
      name: "Show 3 more symbol groups",
    });
    await showMore.click();
    await expect(
      section.locator('[data-symbol-breakdown-group-index="5"] > summary'),
    ).toBeFocused();
    await expect(groups).toHaveCount(8);
    await expect(groups.evaluateAll((elements) => elements.map((element) => [
      element.getAttribute("data-symbol-breakdown-symbol"),
      element.getAttribute("data-symbol-breakdown-asset-class"),
      element.querySelector("[data-symbol-breakdown-trade]")
        ?.getAttribute("data-symbol-breakdown-trade"),
    ]))).resolves.toEqual([
      ["AAPL", "stock", "demo-subject-aapl"],
      ["AMD", "stock", "demo-subject-amd"],
      ["META", "stock", "demo-subject-meta"],
      ["MSFT", "stock", "demo-subject-msft"],
      ["NVDA", "stock", "demo-subject-nvda"],
      ["QQQ", "etf", "demo-subject-qqq"],
      ["SPY", "etf", "demo-subject-spy"],
      ["TSLA", "stock", "demo-subject-tsla"],
    ]);
    await expect(section.locator("[data-symbol-breakdown-groups-showing]"))
      .toHaveText("Showing 8 of 8 symbol groups");
    await expect(showMore).toBeHidden();

    const aapl = section.locator(
      '[data-symbol-breakdown-symbol="AAPL"][data-symbol-breakdown-asset-class="stock"]',
    );
    await aapl.locator(":scope > summary").click();
    const action = aapl.locator(".report-trade-action");
    await expect(action).toHaveAttribute("data-review-trade", "demo-subject-aapl");
    await expect(action).toHaveAttribute(
      "data-trade-review-report-source",
      "symbol-breakdown",
    );
    await expect(action).toHaveAccessibleName(
      "Open AAPL trade for the exact AAPL Stock symbol group — Stock, Demo Brokerage, Jul 1 · Morning",
    );
    await action.click();

    const dialog = page.getByRole("dialog", {
      name: /AAPL trade review · Stock · Demo Brokerage · Jul 1 · Morning/u,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-trade-review-report-context]")).toHaveText(
      "Opened from Symbol breakdown. This full-workspace report does not use or change your Trades filters.",
    );
    await expect(
      dialog.getByRole("button", { name: "Save review changes" }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(action).toBeFocused();

    expect(await storageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "symbol breakdown rejects a valid subject from a different exact group",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await startDemo(page);
    await context.setOffline(true);
    const storageBefore = await storageSnapshot(page);
    await page.getByRole("button", { name: "Reports", exact: true }).click();

    const aapl = page.locator(
      '[data-symbol-breakdown-symbol="AAPL"][data-symbol-breakdown-asset-class="stock"]',
    );
    await aapl.locator(":scope > summary").click();
    const action = aapl.locator(".report-trade-action");
    await action.evaluate((element) => {
      element.setAttribute("data-review-trade", "demo-subject-amd");
    });
    await action.click();

    const error = page.locator("[data-trade-review-open-error]");
    await expect(error).toHaveText(
      "Hermes could not open this exact trade because its stable local identity is unavailable.",
    );
    await expect(error).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
    expect(await storageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "symbol breakdown cannot be downgraded to an unscoped action and keeps its error visible",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await startDemo(page);
    await page.evaluate(() => {
      document.documentElement.dataset.testTextScale = "200";
    });
    await context.setOffline(true);
    const storageBefore = await storageSnapshot(page);
    await page.getByRole("button", { name: "Reports", exact: true }).click();

    const aapl = page.locator(
      '[data-symbol-breakdown-symbol="AAPL"][data-symbol-breakdown-asset-class="stock"]',
    );
    await aapl.locator(":scope > summary").click();
    const action = aapl.locator("button[data-review-trade]");
    await action.evaluate((element) => {
      const section = element.closest("[data-symbol-breakdown]");
      if (section === null) throw new Error("Symbol section is missing.");
      element.setAttribute("data-review-trade", "demo-subject-amd");
      element.removeAttribute("data-trade-review-report-source");
      element.classList.remove("report-trade-action");
      section.removeAttribute("data-symbol-breakdown");
    });
    await action.click();

    const error = page.locator("[data-trade-review-open-error]");
    await expect(error).toHaveText(
      "Hermes could not open this exact trade because its stable local identity is unavailable.",
    );
    await expect(error).toBeFocused();
    await expectUnobscured(error);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
    expect(await storageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "symbol breakdown binds repeated evidence to its exact ordered row",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await importRepeatedClosedTrades(page, 2);
    await context.setOffline(true);
    const storageBefore = await storageSnapshot(page);

    const group = page.locator(
      '[data-symbol-breakdown-symbol="AAPL"][data-symbol-breakdown-asset-class="stock"]',
    );
    await group.locator(":scope > summary").click();
    const rows = group.locator("[data-symbol-breakdown-trade]");
    await expect(rows).toHaveCount(2);
    await rows.evaluateAll((elements) => {
      const first = elements[0];
      const second = elements[1];
      const firstAction = first?.querySelector<HTMLButtonElement>(
        "button[data-review-trade]",
      );
      const secondAction = second?.querySelector<HTMLButtonElement>(
        "button[data-review-trade]",
      );
      const firstId = first?.getAttribute("data-symbol-breakdown-trade");
      const secondId = second?.getAttribute("data-symbol-breakdown-trade");
      if (
        first === undefined
        || second === undefined
        || firstAction === null
        || firstAction === undefined
        || secondAction === null
        || secondAction === undefined
        || firstId === null
        || firstId === undefined
        || secondId === null
        || secondId === undefined
      ) {
        throw new Error("Repeated symbol evidence is incomplete.");
      }
      first.setAttribute("data-symbol-breakdown-trade", secondId);
      firstAction.setAttribute("data-review-trade", secondId);
      second.setAttribute("data-symbol-breakdown-trade", firstId);
      secondAction.setAttribute("data-review-trade", firstId);
    });
    await rows.nth(0).locator("button[data-review-trade]").click();

    const error = page.locator("[data-trade-review-open-error]");
    await expect(error).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
    expect(await storageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "symbol breakdown rejects a retained row after an earlier row is removed and retagged",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await importRepeatedClosedTrades(page, 2);
    await context.setOffline(true);
    const storageBefore = await storageSnapshot(page);

    const group = page.locator(
      '[data-symbol-breakdown-symbol="AAPL"][data-symbol-breakdown-asset-class="stock"]',
    );
    await group.locator(":scope > summary").click();
    const rows = group.locator("[data-symbol-breakdown-trade]");
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(1)).toContainText("Trade 2 of 2");
    await rows.evaluateAll((elements) => {
      const first = elements[0];
      const second = elements[1];
      const firstId = first?.getAttribute("data-symbol-breakdown-trade");
      const secondAction = second?.querySelector<HTMLButtonElement>(
        "button[data-review-trade]",
      );
      if (
        first === undefined
        || second === undefined
        || firstId === null
        || firstId === undefined
        || secondAction === null
        || secondAction === undefined
      ) {
        throw new Error("Repeated symbol evidence is incomplete.");
      }
      first.remove();
      second.setAttribute("data-symbol-breakdown-trade", firstId);
      secondAction.setAttribute("data-review-trade", firstId);
    });
    await expect(rows).toHaveCount(1);
    await expect(rows.nth(0)).toContainText("Trade 2 of 2");
    await rows.nth(0).locator("button[data-review-trade]").click();

    const error = page.locator("[data-trade-review-open-error]");
    await expect(error).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
    expect(await storageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "symbol breakdown binds a registered action to its original evidence row",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await importRepeatedClosedTrades(page, 2);
    await context.setOffline(true);
    const storageBefore = await storageSnapshot(page);

    const group = page.locator(
      '[data-symbol-breakdown-symbol="AAPL"][data-symbol-breakdown-asset-class="stock"]',
    );
    await group.locator(":scope > summary").click();
    const rows = group.locator("[data-symbol-breakdown-trade]");
    await expect(rows).toHaveCount(2);
    await rows.evaluateAll((elements) => {
      const first = elements[0];
      const second = elements[1];
      const firstId = first?.getAttribute("data-symbol-breakdown-trade");
      const firstAction = first?.querySelector<HTMLButtonElement>(
        "button[data-review-trade]",
      );
      const replacement = second?.cloneNode(true) as HTMLElement | undefined;
      const clonedAction = replacement?.querySelector<HTMLButtonElement>(
        "button[data-review-trade]",
      );
      if (
        first === undefined
        || second === undefined
        || firstId === null
        || firstId === undefined
        || firstAction === null
        || firstAction === undefined
        || replacement === undefined
        || clonedAction === null
        || clonedAction === undefined
      ) {
        throw new Error("Repeated symbol evidence is incomplete.");
      }
      clonedAction.remove();
      replacement.setAttribute("data-symbol-breakdown-trade", firstId);
      replacement.append(firstAction);
      first.replaceWith(replacement);
    });
    await expect(rows).toHaveCount(2);
    await expect(rows.nth(0)).toContainText("Trade 2 of 2");
    await rows.nth(0).locator("button[data-review-trade]").click();

    const error = page.locator("[data-trade-review-open-error]");
    await expect(error).toBeFocused();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
    expect(await storageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "symbol row markers keep an unregistered clone fail-closed outside the section",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await importRepeatedClosedTrades(page, 2);
    await context.setOffline(true);
    const storageBefore = await storageSnapshot(page);

    const group = page.locator(
      '[data-symbol-breakdown-symbol="AAPL"][data-symbol-breakdown-asset-class="stock"]',
    );
    await group.locator(":scope > summary").click();
    const rows = group.locator("[data-symbol-breakdown-trade]");
    await expect(rows).toHaveCount(2);
    await rows.evaluateAll((elements) => {
      const first = elements[0];
      const second = elements[1];
      const secondId = second?.getAttribute("data-symbol-breakdown-trade");
      const clone = first?.cloneNode(true) as HTMLElement | undefined;
      const action = clone?.querySelector<HTMLButtonElement>(
        "button[data-review-trade]",
      );
      const destination = document.querySelector<HTMLElement>("#screen");
      if (
        first === undefined
        || second === undefined
        || secondId === null
        || secondId === undefined
        || clone === undefined
        || action === null
        || action === undefined
        || destination === null
      ) {
        throw new Error("Repeated symbol evidence is incomplete.");
      }
      clone.dataset.testClonedSymbolRow = "true";
      action.setAttribute("data-review-trade", secondId);
      action.removeAttribute("data-trade-review-report-source");
      action.classList.remove("report-trade-action");
      destination.append(clone);
    });
    const clone = page.locator('[data-test-cloned-symbol-row="true"]');
    await expect(clone).toContainText("Trade 1 of 2");
    await clone.locator("button[data-review-trade]").click();

    const error = page.locator("[data-trade-review-open-error]");
    await expect(error).toBeFocused();
    await expectUnobscured(error);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
    expect(await storageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "repeated symbol evidence stays distinguishable and focuses the first revealed action",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await importRepeatedClosedTrades(page, 26);
    await context.setOffline(true);
    const storageBefore = await storageSnapshot(page);

    const section = page.locator("[data-symbol-breakdown]");
    await expect(section.locator(".symbol-breakdown-meta"))
      .toContainText("26 current trades");
    const group = section.locator(
      '[data-symbol-breakdown-symbol="AAPL"][data-symbol-breakdown-asset-class="stock"]',
    );
    await expect(group.locator(":scope > summary")).toContainText(
      "26 current trades",
    );
    await group.locator(":scope > summary").click();

    const actions = group.locator(".report-trade-action");
    await expect(actions).toHaveCount(25);
    const initialLabels = await actions.evaluateAll((elements) => (
      elements.map((element) => element.getAttribute("aria-label"))
    ));
    expect(new Set(initialLabels).size).toBe(25);
    expect(initialLabels[0]).toContain("trade 1 of 26");
    expect(initialLabels[24]).toContain("trade 25 of 26");

    const showMore = group.getByRole("button", { name: "Show 1 more" });
    await showMore.focus();
    await page.keyboard.press("Enter");
    await expect(actions).toHaveCount(26);
    await expect(actions.nth(25)).toBeFocused();
    await expect(actions.nth(25)).toHaveAccessibleName(/trade 26 of 26/u);
    await expect(showMore).toBeHidden();
    await expect(group.locator("[data-symbol-breakdown-showing]"))
      .toHaveText("Showing 26 of 26 trades");

    expect(await storageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

for (const viewport of [
  { width: 320, height: 568 },
  { width: 421, height: 568 },
] as const) {
  test(
    `symbol breakdown remains operable at ${viewport.width}px and 200% text`,
    async ({ page, context }) => {
      const externalRequests = logExternalRequests(page);
      await page.setViewportSize(viewport);
      await startDemo(page);
      await page.evaluate(() => {
        document.documentElement.dataset.testTextScale = "200";
      });
      await context.setOffline(true);
      const storageBefore = await storageSnapshot(page);
      await page.getByRole("button", { name: "Reports", exact: true }).click();

      const menu = page.getByRole("navigation", { name: "Report sections" });
      await menu.getByRole("link", {
        name: "Symbol breakdown",
        exact: true,
      }).click();
      const heading = page.locator("#symbol-breakdown-title");
      await expect(heading).toBeFocused();
      await expectUnobscured(heading);

      const section = page.locator("[data-symbol-breakdown]");
      const aapl = section.locator(
        '[data-symbol-breakdown-symbol="AAPL"][data-symbol-breakdown-asset-class="stock"]',
      );
      const summary = aapl.locator(":scope > summary");
      const paging = section.getByRole("button", {
        name: "Show 3 more symbol groups",
      });
      const returnLink = section.getByRole("link", {
        name: "Back to report menu",
      });
      for (const control of [summary, paging, returnLink]) {
        await control.scrollIntoViewIfNeeded();
        await control.focus();
        await expect(control).toBeFocused();
        await expectUnobscured(control);
        await expectTouchTarget(control);
      }

      await summary.click();
      const action = aapl.locator(".report-trade-action");
      await action.scrollIntoViewIfNeeded();
      await action.focus();
      await expect(action).toBeFocused();
      await expectUnobscured(action);
      await expectTouchTarget(action);

      const overflow = await section.evaluate((element) => {
        const sectionRect = element.getBoundingClientRect();
        return {
          document: document.documentElement.scrollWidth - window.innerWidth,
          section: element.scrollWidth - element.clientWidth,
          offenders: Array.from(element.querySelectorAll<HTMLElement>("*"))
            .map((candidate) => {
              const rect = candidate.getBoundingClientRect();
              return {
                label: `${candidate.tagName.toLowerCase()}#${candidate.id}.${String(candidate.className)}`,
                rendered: candidate.getClientRects().length > 0,
                own: candidate.scrollWidth - candidate.clientWidth,
                left: Math.floor(rect.left - sectionRect.left),
                right: Math.ceil(rect.right - sectionRect.right),
              };
            })
            .filter((candidate) => (
              candidate.rendered
              && (
                candidate.own > 1
                || candidate.left < -1
                || candidate.right > 1
              )
            ))
            .slice(0, 20),
        };
      });
      expect(
        overflow.document,
        `Overflow evidence: ${JSON.stringify(overflow.offenders)}`,
      ).toBeLessThanOrEqual(1);
      expect(overflow.section).toBeLessThanOrEqual(1);
      expect(overflow.offenders).toEqual([]);

      await action.click();
      const dialog = page.getByRole("dialog", {
        name: /AAPL trade review · Stock · Demo Brokerage · Jul 1 · Morning/u,
      });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("[data-trade-review-report-context]")).toHaveText(
        "Opened from Symbol breakdown. This full-workspace report does not use or change your Trades filters.",
      );
      const dialogOverflow = await dialog.evaluate((element) => ({
        document: document.documentElement.scrollWidth - window.innerWidth,
        dialog: element.scrollWidth - element.clientWidth,
      }));
      expect(dialogOverflow.document).toBeLessThanOrEqual(1);
      expect(dialogOverflow.dialog).toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(action).toBeFocused();
      await expectUnobscured(action);
      await expectTouchTarget(action);
      expect(await storageSnapshot(page)).toEqual(storageBefore);
      expect(externalRequests).toEqual([]);
    },
  );
}
