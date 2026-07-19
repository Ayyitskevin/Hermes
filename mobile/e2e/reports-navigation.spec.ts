import { expect, test, type Locator, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

const REPORT_DESTINATIONS = [
  {
    link: "Performance summary",
    target: "#performance-summary-title",
    returnLink: "[data-report-overview] > .section-title .report-menu-link",
  },
  {
    link: "Journal curve",
    target: "#cumulative-result-title",
    returnLink: ".chart-card .report-menu-link",
  },
  {
    link: "Review session coverage",
    target: "#review-session-coverage-title",
    returnLink:
      "[data-review-session-coverage] > .section-title .report-menu-link",
  },
  {
    link: "Account review coverage",
    target: "#account-review-coverage-title",
    returnLink:
      "[data-account-review-coverage] > .section-title .report-menu-link",
  },
  {
    link: "Direction mix",
    target: "#direction-mix-title",
    returnLink: "[data-direction-mix] > .section-title .report-menu-link",
  },
  {
    link: "Symbol breakdown",
    target: "#symbol-breakdown-title",
    returnLink: "[data-symbol-breakdown] > .section-title .report-menu-link",
  },
  {
    link: "Opening weekday mix",
    target: "#opening-weekday-mix-title",
    returnLink:
      "[data-opening-weekday-mix] > .section-title .report-menu-link",
  },
  {
    link: "Plan check",
    target: "#plan-check-title",
    returnLink: "[data-plan-check] > .section-title .report-menu-link",
  },
  {
    link: "Mistake patterns",
    target: "#mistake-patterns-title",
    returnLink: "[data-mistake-patterns] > .section-title .report-menu-link",
  },
  {
    link: "Emotion patterns",
    target: "#emotion-patterns-title",
    returnLink: "[data-emotion-patterns] > .section-title .report-menu-link",
  },
  {
    link: "Tag patterns",
    target: "#tag-patterns-title",
    returnLink: "[data-tag-patterns] > .section-title .report-menu-link",
  },
  {
    link: "Setup breakdown",
    target: "#setup-performance-title",
    returnLink: "[data-setup-performance] > .section-title .report-menu-link",
  },
] as const;

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

async function reportFingerprint(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const text = (selector: string): string => (
      document.querySelector<HTMLElement>(selector)?.textContent
        ?.replace(/\s+/gu, " ")
        .trim() ?? ""
    );
    const attributes = (selector: string, name: string): readonly string[] => (
      Array.from(document.querySelectorAll<HTMLElement>(selector))
        .map((element) => element.getAttribute(name) ?? "")
    );
    return {
      performance: text("[data-report-overview] .metric-grid"),
      curve: {
        label: document.querySelector(".equity-chart")?.getAttribute("aria-label"),
        points: document.querySelector(".equity-line")?.getAttribute("points"),
      },
      reviewSessions: {
        metadata: text(
          "[data-review-session-coverage] .review-session-coverage-meta",
        ),
        groups: Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-review-session-coverage-group] > summary",
          ),
        ).map((summary) => summary.textContent?.replace(/\s+/gu, " ").trim()),
        evidence: attributes(
          "[data-review-session-coverage-trade]",
          "data-review-session-coverage-trade",
        ),
        actions: Array.from(document.querySelectorAll<HTMLElement>(
          "[data-review-session-coverage-trade] .report-trade-action",
        )).map((action) => [
          action.getAttribute("data-review-trade"),
          action.getAttribute("data-trade-review-report-source"),
          action.getAttribute("aria-label"),
        ]),
      },
      accountReviewCoverage: {
        metadata: text(
          "[data-account-review-coverage] .account-review-coverage-meta",
        ),
        accounts: Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-account-review-coverage-account] > summary",
          ),
        ).map((summary) => summary.textContent?.replace(/\s+/gu, " ").trim()),
        identities: attributes(
          "[data-account-review-coverage-account]",
          "data-account-review-coverage-account",
        ),
        actions: Array.from(document.querySelectorAll<HTMLElement>(
          "[data-account-review-coverage-route]",
        )).map((action) => [
          action.getAttribute("data-account-review-coverage-route"),
          action.getAttribute("data-account-review-coverage-review-state"),
          action.getAttribute("data-account-review-coverage-count"),
          action.getAttribute("aria-label"),
        ]),
      },
      direction: {
        metadata: text("[data-direction-mix] .direction-mix-meta"),
        groups: Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-direction-mix-group] > summary",
          ),
        ).map((summary) => summary.textContent?.replace(/\s+/gu, " ").trim()),
        evidence: attributes(
          "[data-direction-mix-trade]",
          "data-direction-mix-trade",
        ),
      },
      symbols: {
        metadata: text("[data-symbol-breakdown] .symbol-breakdown-meta"),
        groups: Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-symbol-breakdown-group-index] > summary",
          ),
        ).map((summary) => summary.textContent?.replace(/\s+/gu, " ").trim()),
        evidence: attributes(
          "[data-symbol-breakdown-trade]",
          "data-symbol-breakdown-trade",
        ),
        actions: Array.from(document.querySelectorAll<HTMLElement>(
          "[data-symbol-breakdown-trade] .report-trade-action",
        )).map((action) => [
          action.getAttribute("data-review-trade"),
          action.getAttribute("data-trade-review-report-source"),
          action.getAttribute("aria-label"),
        ]),
      },
      openingWeekday: {
        metadata: text(
          "[data-opening-weekday-mix] .opening-weekday-mix-meta",
        ),
        groups: Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-opening-weekday-mix-group] > summary",
          ),
        ).map((summary) => summary.textContent?.replace(/\s+/gu, " ").trim()),
        evidence: attributes(
          "[data-opening-weekday-mix-trade]",
          "data-opening-weekday-mix-trade",
        ),
      },
      plan: {
        metadata: text("[data-plan-check] .plan-check-meta"),
        groups: Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-plan-check] [data-plan-check-group] > summary",
          ),
        ).map((summary) => summary.textContent?.replace(/\s+/gu, " ").trim()),
        evidence: attributes(
          "[data-plan-check-trade]",
          "data-plan-check-trade",
        ),
      },
      mistakes: {
        metadata: text("[data-mistake-patterns] .mistake-patterns-meta"),
        groups: Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-mistake-patterns-group-index] > summary",
          ),
        ).map((summary) => summary.textContent?.replace(/\s+/gu, " ").trim()),
        evidence: attributes(
          "[data-mistake-patterns-trade]",
          "data-mistake-patterns-trade",
        ),
      },
      emotions: {
        metadata: text("[data-emotion-patterns] .emotion-patterns-meta"),
        groups: Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-emotion-patterns-group-index] > summary",
          ),
        ).map((summary) => summary.textContent?.replace(/\s+/gu, " ").trim()),
        evidence: attributes(
          "[data-emotion-patterns-trade]",
          "data-emotion-patterns-trade",
        ),
      },
      tags: {
        metadata: text("[data-tag-patterns] .tag-patterns-meta"),
        groups: Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-tag-patterns-group-index] > summary",
          ),
        ).map((summary) => summary.textContent?.replace(/\s+/gu, " ").trim()),
        evidence: attributes(
          "[data-tag-patterns-trade]",
          "data-tag-patterns-trade",
        ),
      },
      setup: {
        metadata: text("[data-setup-performance] .setup-performance-meta"),
        groups: Array.from(
          document.querySelectorAll<HTMLElement>(
            "[data-setup-performance-group-index] > summary",
          ),
        ).map((summary) => summary.textContent?.replace(/\s+/gu, " ").trim()),
        evidence: attributes(
          "[data-setup-performance-trade]",
          "data-setup-performance-trade",
        ),
      },
    };
  });
}

async function tradeBrowserFingerprint(page: Page): Promise<unknown> {
  return page.evaluate(() => {
    const controlIds = [
      "trade-scope-account",
      "trade-scope-from",
      "trade-scope-through",
      "trade-search",
      "trade-filter-asset-class",
      "trade-filter-direction",
      "trade-filter-position",
      "trade-filter-review",
      "trade-filter-setup",
      "trade-filter-mistake",
      "trade-filter-emotion",
      "trade-filter-tag",
    ] as const;
    return {
      controls: Object.fromEntries(controlIds.map((id) => {
        const control = document.querySelector<
          HTMLInputElement | HTMLSelectElement
        >(`#${id}`);
        return [id, control?.value ?? null];
      })),
      cards: Array.from(document.querySelectorAll<HTMLElement>(".trade-card"))
        .map((card) => [card.dataset.tradeSubject, card.hidden]),
      count: document.querySelector("#trade-count")?.textContent,
      scope: document.querySelector("#trade-scope-summary")?.textContent
        ?.replace(/\s+/gu, " ")
        .trim(),
    };
  });
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

  expect(
    geometry.target.top,
    `Target starts above visible content: ${JSON.stringify(geometry)}`,
  ).toBeGreaterThanOrEqual(geometry.topBoundary - 1);
  expect(
    geometry.target.bottom,
    `Target ends behind fixed navigation: ${JSON.stringify(geometry)}`,
  ).toBeLessThanOrEqual(geometry.bottomBoundary + 1);
}

async function expectTouchTarget(locator: Locator): Promise<void> {
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
}

test(
  "report sections navigate without rerendering or changing governed evidence",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await startDemo(page);
    await context.setOffline(true);
    await page.getByRole("button", { name: "Reports", exact: true }).click();

    const navigation = page.getByRole("navigation", {
      name: "Report sections",
    });
    await expect(navigation).toBeVisible();
    await expect(navigation.getByRole("link").allTextContents()).resolves.toEqual(
      REPORT_DESTINATIONS.map(({ link }) => link),
    );
    const fingerprintBefore = await reportFingerprint(page);
    const storageBefore = await localStorageSnapshot(page);
    await page.locator("[data-plan-check]").evaluate((element) => {
      element.setAttribute("data-navigation-sentinel", "preserved");
    });

    const directionGroup = page.locator(
      '[data-direction-mix-group="long"]',
    );
    const accountReviewGroup = page.locator(
      '[data-account-review-coverage-account="demo-account-primary"]',
    );
    const symbolGroup = page.locator(
      '[data-symbol-breakdown-symbol="AAPL"][data-symbol-breakdown-asset-class="stock"]',
    );
    const openingWeekdayGroup = page.locator(
      '[data-opening-weekday-mix-group="wednesday"]',
    );
    const planGroup = page.locator(
      '[data-plan-check-group="followed"]',
    );
    const reviewSessionGroups = page.locator(
      "[data-review-session-coverage-group]",
    );
    const mistakeGroup = page.locator(
      '[data-mistake-patterns-group-index="0"]',
    );
    const emotionGroup = page.locator(
      '[data-emotion-patterns-group-index="0"]',
    );
    const tagGroup = page.locator(
      '[data-tag-patterns-group-index="0"]',
    );
    const setupGroup = page.locator(
      '[data-setup-performance-group-index="0"]',
    );
    for (let index = 0; index < await reviewSessionGroups.count(); index += 1) {
      await reviewSessionGroups.nth(index).locator(":scope > summary").click();
    }
    await accountReviewGroup.locator(":scope > summary").click();
    await directionGroup.locator("summary").click();
    await symbolGroup.locator("summary").click();
    await openingWeekdayGroup.locator("summary").click();
    await planGroup.locator("summary").click();
    await mistakeGroup.locator("summary").click();
    await emotionGroup.locator("summary").click();
    await tagGroup.locator("summary").click();
    await setupGroup.locator("summary").click();
    for (let index = 0; index < await reviewSessionGroups.count(); index += 1) {
      await expect(reviewSessionGroups.nth(index)).toHaveAttribute("open", "");
    }
    await expect(accountReviewGroup).toHaveAttribute("open", "");
    await expect(directionGroup).toHaveAttribute("open", "");
    await expect(symbolGroup).toHaveAttribute("open", "");
    await expect(openingWeekdayGroup).toHaveAttribute("open", "");
    await expect(planGroup).toHaveAttribute("open", "");
    await expect(mistakeGroup).toHaveAttribute("open", "");
    await expect(emotionGroup).toHaveAttribute("open", "");
    await expect(tagGroup).toHaveAttribute("open", "");
    await expect(setupGroup).toHaveAttribute("open", "");

    for (const [index, destination] of REPORT_DESTINATIONS.entries()) {
      const link = navigation.getByRole("link", {
        name: destination.link,
        exact: true,
      });
      if (index % 2 === 0) {
        await link.click();
      } else {
        await link.focus();
        await page.keyboard.press("Enter");
      }
      const target = page.locator(destination.target);
      await expect(target).toBeFocused();
      await expectUnobscured(target);
    }

    await page.locator(REPORT_DESTINATIONS.at(-1)?.returnLink ?? "").click();
    const menuHeading = page.locator("#reports-navigation-title");
    await expect(menuHeading).toBeFocused();
    await expectUnobscured(menuHeading);
    for (let index = 0; index < await reviewSessionGroups.count(); index += 1) {
      await expect(reviewSessionGroups.nth(index)).toHaveAttribute("open", "");
    }
    await expect(accountReviewGroup).toHaveAttribute("open", "");
    await expect(directionGroup).toHaveAttribute("open", "");
    await expect(symbolGroup).toHaveAttribute("open", "");
    await expect(openingWeekdayGroup).toHaveAttribute("open", "");
    await expect(planGroup).toHaveAttribute("open", "");
    await expect(mistakeGroup).toHaveAttribute("open", "");
    await expect(emotionGroup).toHaveAttribute("open", "");
    await expect(tagGroup).toHaveAttribute("open", "");
    await expect(setupGroup).toHaveAttribute("open", "");
    await expect(page.locator("[data-plan-check]")).toHaveAttribute(
      "data-navigation-sentinel",
      "preserved",
    );
    expect(await reportFingerprint(page)).toEqual(fingerprintBefore);
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    await expect(
      page.getByRole("button", { name: "Reports", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    expect(externalRequests).toEqual([]);
  },
);

test(
  "review session coverage reconciles every demo session and stable trade assignment",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await startDemo(page);
    await context.setOffline(true);
    const storageBefore = await localStorageSnapshot(page);
    await page.getByRole("button", { name: "Reports", exact: true }).click();

    const section = page.locator("[data-review-session-coverage]");
    await expect(section).toBeVisible();
    const metadata = section.locator(".review-session-coverage-meta");
    for (const expected of [
      "review-session-coverage-report-v1",
      "8fafa15893363476f1d0433c8fbb70d3db000b6c4a75bfd9a621862c52244113",
      "Jul 1–9, 2026",
      "UTC",
      "2 demo accounts",
    ]) {
      await expect(metadata).toContainText(expected);
    }
    const metadataValue = (label: string): Locator => (
      metadata.getByText(label, { exact: true })
        .locator("xpath=following-sibling::dd")
    );
    await expect(metadataValue("Total sessions")).toHaveText(
      "6 trading sessions",
    );
    await expect(metadataValue("Reviewed sessions")).toHaveText(
      "6 trading sessions",
    );
    await expect(metadataValue("Unreviewed sessions")).toHaveText(
      "0 trading sessions",
    );
    await expect(metadataValue("Current streak")).toHaveText(
      "6 trading sessions",
    );
    await expect(metadataValue("Session–trade assignments")).toHaveText(
      "8 assignments",
    );

    const groups = section.locator("[data-review-session-coverage-group]");
    await expect(groups).toHaveCount(3);
    await expect(groups.evaluateAll((elements) => elements.map((element) => (
      element.getAttribute("data-review-session-coverage-group")
    )))).resolves.toEqual([
      "current_streak",
      "reviewed_before_streak",
      "unreviewed",
    ]);
    await expect(groups.locator(":scope > summary strong").allTextContents())
      .resolves.toEqual([
        "Current review streak",
        "Reviewed before current streak",
        "Unreviewed sessions",
      ]);
    await expect(
      groups.locator(":scope > summary .plan-check-summary-label span")
        .allTextContents(),
    ).resolves.toEqual([
      "6 sessions · 8 assignments",
      "0 sessions · 0 assignments",
      "0 sessions · 0 assignments",
    ]);

    const currentStreak = section.locator(
      '[data-review-session-coverage-group="current_streak"]',
    );
    await currentStreak.locator(":scope > summary").click();
    const rows = currentStreak.locator("[data-review-session-coverage-trade]");
    await expect(rows).toHaveCount(8);
    const expectedSubjects = [
      "demo-subject-qqq",
      "demo-subject-meta",
      "demo-subject-spy",
      "demo-subject-amd",
      "demo-subject-nvda",
      "demo-subject-tsla",
      "demo-subject-aapl",
      "demo-subject-msft",
    ];
    await expect(rows.evaluateAll((elements) => elements.map((element) => (
      element.getAttribute("data-review-session-coverage-trade")
    )))).resolves.toEqual(expectedSubjects);
    await expect(rows.evaluateAll((elements) => elements.map((element) => {
      const action = element.querySelector<HTMLElement>(".report-trade-action");
      return [
        element.getAttribute("data-review-session-coverage-trade"),
        action?.getAttribute("data-review-trade"),
        action?.getAttribute("data-trade-review-report-source"),
      ];
    }))).resolves.toEqual(expectedSubjects.map((subject) => [
      subject,
      subject,
      "review-session-coverage",
    ]));
    await expect(rows.first().locator(".report-trade-action"))
      .toHaveAccessibleName(
        "Open QQQ trade for the current review streak on 2026-07-09 — ETF, Demo Swing, Jul 9 · Morning",
      );

    for (const classification of ["reviewed_before_streak", "unreviewed"]) {
      const emptyGroup = section.locator(
        `[data-review-session-coverage-group="${classification}"]`,
      );
      await emptyGroup.locator(":scope > summary").click();
      await expect(emptyGroup.locator("[data-review-session-coverage-trade]"))
        .toHaveCount(0);
    }
    await section.getByText("How this report works", { exact: true }).click();
    await expect(section).toContainText(
      "fixed current-streak, reviewed-before-streak, then unreviewed order",
    );
    await expect(section).toContainText(
      "does not score outcomes, set goals, or tell you what to trade",
    );
    for (const prohibited of ["Cash expectancy", "Win rate", "Average R", "Net P&L"]) {
      await expect(section.getByText(prohibited, { exact: true })).toHaveCount(0);
    }
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "direction mix reports every current trade once without outcome metrics",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await startDemo(page);
    await context.setOffline(true);
    const storageBefore = await localStorageSnapshot(page);
    await page.getByRole("button", { name: "Reports", exact: true }).click();

    const section = page.locator("[data-direction-mix]");
    await expect(section).toBeVisible();
    const metadata = section.locator(".direction-mix-meta");
    for (const expected of [
      "direction-mix-report-v1",
      "0a55af9905699cc62746c99b5b4e7dd664588d8b526eefb207e9fb2bb77b3ab2",
      "Current full-workspace projection",
      "8 current trades",
    ]) {
      await expect(metadata).toContainText(expected);
    }
    await expect(
      section.locator("[data-direction-mix-group] > summary strong")
        .allTextContents(),
    ).resolves.toEqual(["Long", "Short"]);
    await expect(
      section.locator("[data-direction-mix-trade]").evaluateAll((elements) => (
        elements.map((element) => element.getAttribute("data-direction-mix-trade"))
      )),
    ).resolves.toEqual([
      "demo-subject-meta",
      "demo-subject-spy",
      "demo-subject-amd",
      "demo-subject-nvda",
      "demo-subject-aapl",
      "demo-subject-msft",
      "demo-subject-qqq",
      "demo-subject-tsla",
    ]);
    await expect(section.locator("dt").allTextContents()).resolves.not.toContain("Currency");
    for (const prohibited of ["Cash expectancy", "Wins", "Win rate", "Average R", "Net P&L", "Percent"]) {
      await expect(section.getByText(prohibited, { exact: true })).toHaveCount(0);
    }
    await section.getByText("How this report works", { exact: true }).click();
    await expect(section).toContainText("counts every current trade once");
    await expect(section).toContainText("fixed long-then-short order");
    await expect(section).toContainText("does not read results, review fields, or Trades filters");
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "opening weekday mix reports every current trade once without rewarding frequency",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await startDemo(page);
    await context.setOffline(true);
    const storageBefore = await localStorageSnapshot(page);
    await page.getByRole("button", { name: "Reports", exact: true }).click();

    const section = page.locator("[data-opening-weekday-mix]");
    await expect(section).toBeVisible();
    const metadata = section.locator(".opening-weekday-mix-meta");
    for (const expected of [
      "opening-weekday-mix-report-v1",
      "6f205c00826d547f1f0640bec0acceac836e707c4a95287d2e35f4ae62e01cf8",
      "Current full-workspace projection",
      "8 current trades",
      "UTC",
    ]) {
      await expect(metadata).toContainText(expected);
    }
    await expect(
      section.locator("[data-opening-weekday-mix-group] > summary strong")
        .allTextContents(),
    ).resolves.toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
    await expect(
      section.locator(
        "[data-opening-weekday-mix-group] > summary .plan-check-summary-label span",
      ).allTextContents(),
    ).resolves.toEqual([
      "1 current trade",
      "1 current trade",
      "3 current trades",
      "3 current trades",
      "0 current trades",
      "0 current trades",
      "0 current trades",
    ]);
    await expect(
      section.locator("[data-opening-weekday-mix-trade]")
        .evaluateAll((elements) => elements.map((element) => (
          element.getAttribute("data-opening-weekday-mix-trade")
        ))),
    ).resolves.toEqual([
      "demo-subject-amd",
      "demo-subject-spy",
      "demo-subject-meta",
      "demo-subject-aapl",
      "demo-subject-msft",
      "demo-subject-qqq",
      "demo-subject-nvda",
      "demo-subject-tsla",
    ]);
    await expect(section.locator("dt").allTextContents())
      .resolves.not.toContain("Currency");
    for (const prohibited of [
      "Cash expectancy",
      "Wins",
      "Win rate",
      "Average R",
      "Net P&L",
      "Percent",
    ]) {
      await expect(section.getByText(prohibited, { exact: true }))
        .toHaveCount(0);
    }
    await section.getByText("How this report works", { exact: true }).click();
    await expect(section).toContainText(
      "first-entry date already derived from the immutable ledger",
    );
    await expect(section).toContainText(
      "fixed Monday-through-Sunday order",
    );
    await expect(section).toContainText(
      "does not reward trade count or suggest that any weekday is better",
    );
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "mistake patterns reports exact current-head counts without performance fields",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await startDemo(page);
    await context.setOffline(true);
    const storageBefore = await localStorageSnapshot(page);
    await page.getByRole("button", { name: "Reports", exact: true }).click();

    const section = page.locator("[data-mistake-patterns]");
    await expect(section).toBeVisible();
    const metadata = section.locator(".mistake-patterns-meta");
    for (const expected of [
      "mistake-patterns-report-v1",
      "f94fc896308348f55a665aeafba665f0f3d4ee50fc225c4dba1087bc2babad3c",
      "Current completed review heads",
      "2 unique trades of 8 trades",
      "2 saved mistake assignments",
      "0 pending or draft · 6 completed without a saved mistake",
    ]) {
      await expect(metadata).toContainText(expected);
    }
    await expect(
      section.locator("[data-mistake-patterns-group-index] > summary strong")
        .allTextContents(),
    ).resolves.toEqual(["Chased entry", "Early entry"]);
    await expect(
      section.locator("[data-mistake-patterns-trade]").evaluateAll((elements) => (
        elements.map((element) => element.getAttribute("data-mistake-patterns-trade"))
      )),
    ).resolves.toEqual(["demo-subject-spy", "demo-subject-tsla"]);
    await expect(section.locator("dt").allTextContents()).resolves.not.toContain("Currency");
    for (const prohibited of ["Cash expectancy", "Win rate", "Average R", "Net P&L"]) {
      await expect(section.getByText(prohibited, { exact: true })).toHaveCount(0);
    }
    await section.getByText("How this report works", { exact: true }).click();
    await expect(section).toContainText(
      "total assignments and summed group counts can exceed unique included trades",
    );
    await expect(section).toContainText("never count or performance rank");
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "emotion patterns reports exact current-head counts without outcome metrics",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await startDemo(page);
    await context.setOffline(true);
    const storageBefore = await localStorageSnapshot(page);
    await page.getByRole("button", { name: "Reports", exact: true }).click();

    const section = page.locator("[data-emotion-patterns]");
    await expect(section).toBeVisible();
    const metadata = section.locator(".emotion-patterns-meta");
    for (const expected of [
      "emotion-patterns-report-v1",
      "d674eceb0d641512f106f9f1c6b37e23fe1a2ecd0d43e54b7e48865fa594adb4",
      "Current completed review heads",
      "8 trades of 8 trades",
      "8 current assignments",
      "0 pending or draft · 0 completed without a saved emotion",
    ]) {
      await expect(metadata).toContainText(expected);
    }
    await expect(
      section.locator("[data-emotion-patterns-group-index] > summary strong")
        .allTextContents(),
    ).resolves.toEqual([
      "Calm",
      "Focused",
      "Hesitant",
      "Impatient",
      "Patient",
    ]);
    await expect(
      section.locator("[data-emotion-patterns-trade]").evaluateAll((elements) => (
        elements.map((element) => element.getAttribute("data-emotion-patterns-trade"))
      )),
    ).resolves.toEqual([
      "demo-subject-meta",
      "demo-subject-aapl",
      "demo-subject-msft",
      "demo-subject-amd",
      "demo-subject-qqq",
      "demo-subject-spy",
      "demo-subject-tsla",
      "demo-subject-nvda",
    ]);
    await expect(section.locator("dt").allTextContents()).resolves.not.toContain("Currency");
    for (const prohibited of ["Cash expectancy", "Wins", "Win rate", "Average R", "Exact net P&L"]) {
      await expect(section.getByText(prohibited, { exact: true })).toHaveCount(0);
    }
    await section.getByText("How this report works", { exact: true }).click();
    await expect(section).toContainText("counts once in exactly one emotion group");
    await expect(section).toContainText("never count or performance rank");
    await expect(section).toContainText("do not read results");
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "tag patterns reports exact current-head assignments without ranking or outcome fields",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await startDemo(page);
    await context.setOffline(true);
    const storageBefore = await localStorageSnapshot(page);
    await page.getByRole("button", { name: "Reports", exact: true }).click();

    const section = page.locator("[data-tag-patterns]");
    await expect(section).toBeVisible();
    const metadata = section.locator(".tag-patterns-meta");
    for (const expected of [
      "tag-patterns-report-v1",
      "ad24da67086c74558203d89b9fe27f2d8907f6170b29fa5320e0aada88405c27",
      "Current completed review heads",
      "8 unique trades of 8 trades",
      "16 saved tag assignments",
      "0 pending or draft · 0 completed without a saved tag",
    ]) {
      await expect(metadata).toContainText(expected);
    }
    await expect(
      section.locator("[data-tag-patterns-group-index] > summary strong")
        .allTextContents(),
    ).resolves.toEqual([
      "Chased entry",
      "Early entry",
      "Early exit",
      "Invalidation respected",
      "Opening range",
    ]);
    await expect(
      section.locator("[data-tag-patterns-trade]").evaluateAll((elements) => (
        elements.map((element) => element.getAttribute("data-tag-patterns-trade"))
      )),
    ).resolves.toEqual([
      "demo-subject-spy",
      "demo-subject-tsla",
      "demo-subject-qqq",
      "demo-subject-tsla",
      "demo-subject-aapl",
    ]);
    await expect(section).toContainText("Showing 5 of 12 tag groups");
    await section.getByRole("button", { name: "Show 5 more tag groups" }).click();
    await expect(
      section.locator('[data-tag-patterns-group-index="5"] > summary'),
    ).toBeFocused();
    await expect(
      section.locator("[data-tag-patterns-group-index] > summary strong")
        .allTextContents(),
    ).resolves.toEqual([
      "Chased entry",
      "Early entry",
      "Early exit",
      "Invalidation respected",
      "Opening range",
      "Patient entry",
      "Plan followed",
      "Protected remainder",
      "Risk reduced",
      "Stop respected",
    ]);
    await section.getByRole("button", { name: "Show 2 more tag groups" }).click();
    await expect(
      section.locator('[data-tag-patterns-group-index="10"] > summary'),
    ).toBeFocused();
    await expect(
      section.locator("[data-tag-patterns-group-index] > summary strong")
        .allTextContents(),
    ).resolves.toEqual([
      "Chased entry",
      "Early entry",
      "Early exit",
      "Invalidation respected",
      "Opening range",
      "Patient entry",
      "Plan followed",
      "Protected remainder",
      "Risk reduced",
      "Stop respected",
      "Stopped on plan",
      "Target held",
    ]);
    const planFollowed = section.locator("[data-tag-patterns-group-index]")
      .filter({ has: page.locator("summary", { hasText: "Plan followed" }) });
    await planFollowed.locator("summary").click();
    await expect(
      planFollowed.locator("[data-tag-patterns-trade]")
        .evaluateAll((elements) => elements.map((element) => (
          element.getAttribute("data-tag-patterns-trade")
        ))),
    ).resolves.toEqual([
      "demo-subject-meta",
      "demo-subject-amd",
      "demo-subject-nvda",
      "demo-subject-aapl",
      "demo-subject-msft",
    ]);
    const appendedGroupAction = planFollowed.locator(
      '[data-tag-patterns-trade="demo-subject-meta"] .report-trade-action',
    );
    await appendedGroupAction.click();
    const appendedGroupDialog = page.getByRole("dialog", {
      name: /META trade review · Stock · Demo Brokerage · Jul 8 · Morning/u,
    });
    await expect(appendedGroupDialog).toBeVisible();
    await expect(
      appendedGroupDialog.locator("[data-trade-review-report-context]"),
    ).toHaveText(
      "Opened from Tag patterns. This full-workspace report does not use or change your Trades filters.",
    );
    await page.keyboard.press("Escape");
    await expect(appendedGroupDialog).toHaveCount(0);
    await expect(appendedGroupAction).toBeFocused();
    await expect(section.locator("dt").allTextContents())
      .resolves.not.toContain("Currency");
    for (const prohibited of [
      "Cash expectancy",
      "Wins",
      "Win rate",
      "Average R",
      "Exact net P&L",
      "Top tags",
    ]) {
      await expect(section.getByText(prohibited, { exact: true })).toHaveCount(0);
    }
    await section.getByText("How this report works", { exact: true }).click();
    await expect(section).toContainText(
      "total assignments and summed group counts can exceed unique included trades",
    );
    await expect(section).toContainText("never count or performance rank");
    await expect(section).toContainText(
      "does not read tag vocabulary, Daily Journal tags, trade results, or Trades filters",
    );
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "report group pagination registers only an exact app-owned suffix",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await startDemo(page);
    await context.setOffline(true);
    const storageBefore = await localStorageSnapshot(page);
    await page.getByRole("button", { name: "Reports", exact: true }).click();

    const section = page.locator("[data-tag-patterns]");
    const groups = section.locator("[data-tag-patterns-group-index]");
    const showGroups = section.getByRole("button", {
      name: "Show 5 more tag groups",
    });
    await showGroups.click();
    await expect(groups).toHaveCount(10);
    const exactSuffixHtml = await groups.evaluateAll((elements) => (
      elements.slice(5).map((element) => element.outerHTML).join("")
    ));

    await page.getByRole("button", { name: "Trades", exact: true }).click();
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(groups).toHaveCount(5);
    await section.locator("[data-tag-patterns-groups]").evaluate(
      (list, html) => list.insertAdjacentHTML("beforeend", html),
      exactSuffixHtml,
    );
    await section.locator('[data-tag-patterns-more="0"]').evaluate(
      (control) => (control as HTMLButtonElement).click(),
    );
    await section.locator(
      '[data-tag-patterns-group-index="6"] > summary',
    ).click();
    const injectedAction = section.locator(
      '[data-tag-patterns-group-index="6"] '
        + '[data-tag-patterns-trade="demo-subject-meta"] '
        + ".report-trade-action",
    );
    await injectedAction.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const error = page.locator("[data-trade-review-open-error]");
    await expect(error).toBeFocused();
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");

    await page.getByRole("button", { name: "Trades", exact: true }).click();
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(groups).toHaveCount(5);
    await showGroups.evaluate((control) => {
      const clone = control.cloneNode(true) as HTMLButtonElement;
      clone.id = "replacement-tag-groups-more";
      control.replaceWith(clone);
      (control as HTMLButtonElement).click();
    });
    await expect(groups).toHaveCount(10);
    await section.locator(
      '[data-tag-patterns-group-index="6"] > summary',
    ).click();
    const detachedControlAction = section.locator(
      '[data-tag-patterns-group-index="6"] '
        + '[data-tag-patterns-trade="demo-subject-meta"] '
        + ".report-trade-action",
    );
    await detachedControlAction.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-trade-review-open-error]")).toBeFocused();
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");

    await page.getByRole("button", { name: "Trades", exact: true }).click();
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await showGroups.click();
    await expect(groups).toHaveCount(10);
    await section.locator(
      '[data-tag-patterns-group-index="6"] > summary',
    ).click();
    const exactAction = section.locator(
      '[data-tag-patterns-group-index="6"] '
        + '[data-tag-patterns-trade="demo-subject-meta"] '
        + ".report-trade-action",
    );
    await exactAction.evaluate((action) => {
      const clone = action.cloneNode(true) as HTMLButtonElement;
      clone.id = "duplicate-tag-report-action";
      action.insertAdjacentElement("afterend", clone);
    });
    await exactAction.first().click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-trade-review-open-error]")).toBeFocused();
    await page.locator("#duplicate-tag-report-action").evaluate((action) => {
      action.remove();
      document.querySelector("[data-trade-review-open-error]")?.remove();
    });

    await exactAction.click();
    const dialog = page.getByRole("dialog", {
      name: /META trade review · Stock · Demo Brokerage · Jul 8 · Morning/u,
    });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(exactAction).toBeFocused();
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "a report action appended after the 25-row evidence boundary keeps its exact identity",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await importRepeatedClosedTrades(page, 26);
    await context.setOffline(true);
    const storageBefore = await localStorageSnapshot(page);

    const section = page.locator("[data-direction-mix]");
    const group = section.locator('[data-direction-mix-group="long"]');
    await group.locator(":scope > summary").click();
    const actions = group.locator(".report-trade-action");
    await expect(actions).toHaveCount(25);
    const showMore = group.getByRole("button", { name: "Show 1 more" });
    await showMore.click();
    await expect(actions).toHaveCount(26);
    const exactSuffixHtml = await actions.nth(25).evaluate(
      (element) => element.closest("[data-direction-mix-trade]")?.outerHTML,
    );
    if (exactSuffixHtml === undefined) {
      throw new Error("Missing exact Direction mix suffix.");
    }

    await page.getByRole("button", { name: "Trades", exact: true }).click();
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await group.locator(":scope > summary").click();
    await expect(actions).toHaveCount(25);
    await group.locator("[data-direction-mix-evidence-list]").evaluate(
      (list, html) => list.insertAdjacentHTML("beforeend", html),
      exactSuffixHtml,
    );
    await section.locator('[data-direction-mix-more="1"]').evaluate(
      (control) => (control as HTMLButtonElement).click(),
    );
    const injectedAction = actions.nth(25);
    await injectedAction.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const injectedError = page.locator("[data-trade-review-open-error]");
    await expect(injectedError).toBeFocused();
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
    await injectedAction.evaluate((element) => {
      element.closest("[data-direction-mix-trade]")?.remove();
    });
    await expect(actions).toHaveCount(25);

    await showMore.click();
    await expect(actions).toHaveCount(26);
    const appendedAction = actions.nth(25);
    await appendedAction.click();

    const dialog = page.getByRole("dialog", { name: /AAPL trade review/u });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-trade-review-report-context]")).toHaveText(
      "Opened from Direction mix. This full-workspace report does not use or change your Trades filters.",
    );
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(appendedAction).toBeFocused();
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "report navigation and disclosures stay reachable at 320px and 200% text",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await page.setViewportSize({ width: 320, height: 568 });
    await startDemo(page);
    await page.evaluate(() => {
      document.documentElement.dataset.testTextScale = "200";
    });
    await context.setOffline(true);
    const storageBefore = await localStorageSnapshot(page);

    await page.getByRole("button", {
      name: "View session evidence",
      exact: true,
    }).click();
    const reviewSessionHeading = page.locator("#review-session-coverage-title");
    await expect(reviewSessionHeading).toBeFocused();
    await expectUnobscured(reviewSessionHeading);
    await expect(
      page.getByRole("button", { name: "Reports", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".topbar")).toHaveCSS("position", "static");
    await page.locator(
      "[data-review-session-coverage] > .section-title .report-menu-link",
    ).click();
    const menuHeading = page.locator("#reports-navigation-title");
    await expect(menuHeading).toBeFocused();
    await expectUnobscured(menuHeading);

    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await page.getByRole("button", {
      name: "Open plan check",
      exact: true,
    }).click();
    const planHeading = page.locator("#plan-check-title");
    await expect(planHeading).toBeFocused();
    await expectUnobscured(planHeading);
    await expect(
      page.getByRole("button", { name: "Reports", exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".topbar")).toHaveCSS("position", "static");

    await page.locator(
      "[data-plan-check] > .section-title .report-menu-link",
    ).click();
    await expect(menuHeading).toBeFocused();
    await expectUnobscured(menuHeading);

    const navigation = page.getByRole("navigation", {
      name: "Report sections",
    });
    for (const destination of REPORT_DESTINATIONS) {
      const link = navigation.getByRole("link", {
        name: destination.link,
        exact: true,
      });
      await link.focus();
      await expect(link).toBeFocused();
      await expectUnobscured(link);
      await page.keyboard.press("Enter");

      const target = page.locator(destination.target);
      await expect(target).toBeFocused();
      await expectUnobscured(target);
      await page.locator(destination.returnLink).click();
      await expect(menuHeading).toBeFocused();
      await expectUnobscured(menuHeading);
    }

    const narrowAccountGroup = page.locator(
      '[data-account-review-coverage-account="demo-account-primary"]',
    );
    await narrowAccountGroup.locator(":scope > summary").click();
    await expect(narrowAccountGroup).toHaveAttribute("open", "");
    const narrowAccountAction = narrowAccountGroup.getByRole("button", {
      name: "Open Demo Brokerage completed reviews in Trades, account 1 of 2",
    });
    await expect(narrowAccountAction).toBeVisible();
    await narrowAccountAction.focus();
    await expect(narrowAccountAction).toBeFocused();
    await expectUnobscured(narrowAccountAction);
    await expectTouchTarget(narrowAccountAction);

    const summaries = page.locator([
      "[data-review-session-coverage-group] > summary",
      "[data-account-review-coverage-account] > summary",
      "[data-direction-mix-group] > summary",
      "[data-symbol-breakdown-group-index] > summary",
      "[data-opening-weekday-mix-group] > summary",
      "[data-plan-check-group] > summary",
      "[data-mistake-patterns-group-index] > summary",
      "[data-emotion-patterns-group-index] > summary",
      "[data-tag-patterns-group-index] > summary",
      "[data-setup-performance-group-index] > summary",
    ].join(", "));
    for (let index = 0; index < await summaries.count(); index += 1) {
      const summary = summaries.nth(index);
      await summary.focus();
      await expect(summary).toBeFocused();
      await expectUnobscured(summary);
      await expectTouchTarget(summary);
    }

    const navigationControls = page.locator([
      ".report-navigation-link",
      ".report-menu-link",
    ].join(", "));
    for (let index = 0; index < await navigationControls.count(); index += 1) {
      await expectTouchTarget(navigationControls.nth(index));
    }

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - window.innerWidth,
      offenders: Array.from(document.querySelectorAll<HTMLElement>([
        "[data-report-navigation]",
        "[data-report-navigation] *",
        "[data-report-overview]",
        "[data-report-overview] *",
        "[data-review-session-coverage]",
        "[data-review-session-coverage] *",
        "[data-account-review-coverage]",
        "[data-account-review-coverage] *",
        "[data-direction-mix]",
        "[data-direction-mix] *",
        "[data-symbol-breakdown]",
        "[data-symbol-breakdown] *",
        "[data-opening-weekday-mix]",
        "[data-opening-weekday-mix] *",
        "[data-plan-check]",
        "[data-plan-check] *",
        "[data-mistake-patterns]",
        "[data-mistake-patterns] *",
        "[data-emotion-patterns]",
        "[data-emotion-patterns] *",
        "[data-tag-patterns]",
        "[data-tag-patterns] *",
        "[data-setup-performance]",
        "[data-setup-performance] *",
      ].join(", ")))
        .map((element) => {
          const rect = element.getBoundingClientRect();
          return {
            label: `${element.tagName.toLowerCase()}#${element.id}.${String(element.className)}`,
            own: element.scrollWidth - element.clientWidth,
            left: Math.floor(rect.left),
            right: Math.ceil(rect.right - window.innerWidth),
          };
        })
        .filter((candidate) => (
          (candidate.label.slice(0, 6) !== "select" && candidate.own > 1)
          || candidate.left < -1
          || candidate.right > 1
        ))
        .slice(0, 20),
    }));
    expect(
      overflow.document,
      `Overflow evidence: ${JSON.stringify(overflow.offenders)}`,
    ).toBeLessThanOrEqual(1);
    expect(overflow.offenders).toEqual([]);

    await narrowAccountAction.focus();
    await page.keyboard.press("Enter");
    const filterSummary = page.locator("#trade-view-filter-summary");
    await expect(filterSummary).toBeFocused();
    await expectUnobscured(filterSummary);
    await expect(page.getByRole("combobox", { name: "Account" }))
      .toHaveValue("demo-account-primary");
    await expect(page.locator("#trade-filter-position")).toHaveValue("closed");
    await expect(page.locator("#trade-filter-review")).toHaveValue("completed");
    await expect(page.locator(".trade-card:visible")).toHaveCount(5);
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "report controls remain keyboard reachable across the mobile breakpoint edge",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await page.setViewportSize({ width: 421, height: 568 });
    await startDemo(page);
    await page.evaluate(() => {
      document.documentElement.dataset.testTextScale = "200";
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    });
    await context.setOffline(true);
    const storageBefore = await localStorageSnapshot(page);

    await page.getByRole("button", { name: "Reports", exact: true }).click();
    await expect(page.locator(".topbar")).toHaveCSS("position", "static");
    const reviewSessionGroup = page.locator(
      '[data-review-session-coverage-group="current_streak"]',
    );
    const directionGroup = page.locator('[data-direction-mix-group="long"]');
    const accountReviewGroup = page.locator(
      '[data-account-review-coverage-account="demo-account-primary"]',
    );
    const symbolGroup = page.locator('[data-symbol-breakdown-group-index="0"]');
    const openingWeekdayGroup = page.locator(
      '[data-opening-weekday-mix-group="wednesday"]',
    );
    const followedGroup = page.locator('[data-plan-check-group="followed"]');
    const mistakeGroup = page.locator('[data-mistake-patterns-group-index="0"]');
    const emotionGroup = page.locator(
      '[data-emotion-patterns-group-index="0"]',
    );
    const tagGroup = page.locator(
      '[data-tag-patterns-group-index="0"]',
    );
    await reviewSessionGroup.locator(":scope > summary").click();
    await accountReviewGroup.locator(":scope > summary").click();
    await directionGroup.locator(":scope > summary").click();
    await symbolGroup.locator(":scope > summary").click();
    await openingWeekdayGroup.locator(":scope > summary").click();
    await followedGroup.locator(":scope > summary").click();
    await mistakeGroup.locator(":scope > summary").click();
    await emotionGroup.locator(":scope > summary").click();
    await tagGroup.locator(":scope > summary").click();
    await expect(reviewSessionGroup).toHaveAttribute("open", "");
    await expect(accountReviewGroup).toHaveAttribute("open", "");
    await expect(directionGroup).toHaveAttribute("open", "");
    await expect(symbolGroup).toHaveAttribute("open", "");
    await expect(openingWeekdayGroup).toHaveAttribute("open", "");
    await expect(followedGroup).toHaveAttribute("open", "");
    await expect(mistakeGroup).toHaveAttribute("open", "");
    await expect(emotionGroup).toHaveAttribute("open", "");
    await expect(tagGroup).toHaveAttribute("open", "");

    const controls = page.locator([
      "a[data-report-target]",
      "[data-review-session-coverage-group] > summary",
      "[data-account-review-coverage-account] > summary",
      "[data-direction-mix-group] > summary",
      "[data-symbol-breakdown-group-index] > summary",
      "[data-opening-weekday-mix-group] > summary",
      "[data-plan-check-group] > summary",
      "[data-mistake-patterns-group-index] > summary",
      "[data-emotion-patterns-group-index] > summary",
      "[data-tag-patterns-group-index] > summary",
      "[data-setup-performance-group-index] > summary",
      '[data-review-session-coverage-group="current_streak"][open] .report-trade-action',
      '[data-account-review-coverage-account="demo-account-primary"][open] [data-account-review-coverage-route]',
      '[data-direction-mix-group="long"][open] .report-trade-action',
      '[data-symbol-breakdown-group-index="0"][open] .report-trade-action',
      '[data-opening-weekday-mix-group="wednesday"][open] .report-trade-action',
      '[data-plan-check-group="followed"][open] .report-trade-action',
      '[data-mistake-patterns-group-index="0"][open] .report-trade-action',
      '[data-emotion-patterns-group-index="0"][open] .report-trade-action',
      '[data-tag-patterns-group-index="0"][open] .report-trade-action',
    ].join(", "));
    const controlCount = await controls.count();
    expect(controlCount).toBeGreaterThanOrEqual(10);

    const visited = new Set<number>();
    for (let step = 0; step < 120 && visited.size < controlCount; step += 1) {
      await page.keyboard.press("Tab");
      const activeIndex = await controls.evaluateAll((elements) => (
        elements.findIndex((element) => element === document.activeElement)
      ));
      if (activeIndex < 0 || visited.has(activeIndex)) continue;

      visited.add(activeIndex);
      const activeControl = controls.nth(activeIndex);
      await expect(activeControl).toBeFocused();
      await expectUnobscured(activeControl);
      await expectTouchTarget(activeControl);
      expect(
        await activeControl.evaluate(
          (element) => window.getComputedStyle(element).outlineStyle,
        ),
      ).not.toBe("none");
    }

    expect(
      [...visited].sort((left, right) => left - right),
    ).toEqual(Array.from({ length: controlCount }, (_, index) => index));

    const reviewSessionAction = page.locator(
      '[data-review-session-coverage-trade="demo-subject-qqq"] .report-trade-action',
    );
    await reviewSessionAction.focus();
    await page.keyboard.press("Enter");
    const reviewSessionDialog = page.getByRole("dialog", {
      name: /QQQ trade review · ETF · Demo Swing · Jul 9 · Morning/u,
    });
    await expect(reviewSessionDialog).toBeVisible();
    await expect(reviewSessionDialog.locator("#trade-review-title")).toBeFocused();
    await expect(
      reviewSessionDialog.locator("[data-trade-review-report-context]"),
    ).toHaveText(
      "Opened from Review session coverage. This full-workspace report does not use or change your Trades filters.",
    );
    await reviewSessionDialog.getByRole("button", {
      name: "Close",
      exact: true,
    }).click();
    await expect(reviewSessionDialog).toHaveCount(0);
    await expect(reviewSessionAction).toBeFocused();
    await expectUnobscured(reviewSessionAction);
    await expectTouchTarget(reviewSessionAction);

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - window.innerWidth,
      reports: Array.from(document.querySelectorAll<HTMLElement>([
        "[data-report-navigation]",
        "[data-report-overview]",
        "[data-review-session-coverage]",
        "[data-account-review-coverage]",
        "[data-direction-mix]",
        "[data-symbol-breakdown]",
        "[data-opening-weekday-mix]",
        "[data-plan-check]",
        "[data-mistake-patterns]",
        "[data-emotion-patterns]",
        "[data-tag-patterns]",
        "[data-setup-performance]",
      ].join(", "))).map((element) => element.scrollWidth - element.clientWidth),
    }));
    expect(overflow.document).toBeLessThanOrEqual(1);
    expect(overflow.reports.every((value) => value <= 1)).toBe(true);
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);

test(
  "report trade inspection preserves reports and conflicting Trades state",
  async ({ page, context }) => {
    const externalRequests = logExternalRequests(page);
    await startDemo(page);
    await page.getByRole("button", { name: "Reports", exact: true }).click();
    const fullWorkspaceReportBeforeTrades = await reportFingerprint(page);
    await page.getByRole("button", { name: "Trades", exact: true }).click();
    await page.getByRole("combobox", { name: "Account" })
      .selectOption("demo-account-swing");
    await page.getByRole("textbox", { name: "Activity from" }).fill("2026-07-07");
    await page.getByRole("textbox", { name: "Activity through" }).fill("2026-07-09");
    await page.getByRole("button", { name: "Apply scope" }).click();
    await page.locator("#trade-view-filter-summary").click();
    await page.getByRole("combobox", { name: "Asset class" }).selectOption("etf");
    await page.getByRole("combobox", { name: "Direction" }).selectOption("short");
    await page.getByRole("combobox", { name: "Position state" }).selectOption("closed");
    await page.getByRole("combobox", { name: "Review state" }).selectOption("completed");
    await page.getByRole("combobox", { name: "Setup" }).selectOption("Reversal");
    await page.getByRole("searchbox", { name: "Search scoped trades" }).fill("qqq");
    const browserBefore = await tradeBrowserFingerprint(page);

    await page.getByRole("button", { name: "Reports", exact: true }).click();
    expect(await reportFingerprint(page)).toEqual(fullWorkspaceReportBeforeTrades);
    const reviewSessionGroup = page.locator(
      '[data-review-session-coverage-group="current_streak"]',
    );
    const directionGroup = page.locator('[data-direction-mix-group="long"]');
    const symbolGroup = page.locator(
      '[data-symbol-breakdown-symbol="AAPL"][data-symbol-breakdown-asset-class="stock"]',
    );
    const openingWeekdayGroup = page.locator(
      '[data-opening-weekday-mix-group="wednesday"]',
    );
    const planGroup = page.locator('[data-plan-check-group="followed"]');
    const mistakeGroup = page.locator('[data-mistake-patterns-group-index="0"]');
    const emotionGroup = page.locator('[data-emotion-patterns-group-index="0"]');
    const tagGroup = page.locator('[data-tag-patterns-group-index="0"]');
    const setupGroup = page.locator('[data-setup-performance-group-index="0"]');
    await reviewSessionGroup.locator("summary").click();
    await directionGroup.locator("summary").click();
    await symbolGroup.locator("summary").click();
    await openingWeekdayGroup.locator("summary").click();
    await planGroup.locator("summary").click();
    await mistakeGroup.locator("summary").click();
    await emotionGroup.locator("summary").click();
    await tagGroup.locator("summary").click();
    await setupGroup.locator("summary").click();
    await expect(reviewSessionGroup).toHaveAttribute("open", "");
    await expect(directionGroup).toHaveAttribute("open", "");
    await expect(symbolGroup).toHaveAttribute("open", "");
    await expect(openingWeekdayGroup).toHaveAttribute("open", "");
    await expect(planGroup).toHaveAttribute("open", "");
    await expect(mistakeGroup).toHaveAttribute("open", "");
    await expect(emotionGroup).toHaveAttribute("open", "");
    await expect(tagGroup).toHaveAttribute("open", "");
    await expect(setupGroup).toHaveAttribute("open", "");
    await page.locator("[data-plan-check]").evaluate((element) => {
      element.dataset.tradeContinuationSentinel = "preserved";
    });

    const action = page.locator(
      '[data-plan-check-trade="demo-subject-aapl"] .report-trade-action',
    );
    await expect(action).toHaveAccessibleName(
      "Open AAPL trade — Stock, Demo Brokerage, Jul 1 · Morning",
    );
    await expect(action).toHaveAttribute("aria-haspopup", "dialog");
    await action.scrollIntoViewIfNeeded();
    await action.focus();
    await expectUnobscured(action);

    const reportBefore = await reportFingerprint(page);
    const storageBefore = await localStorageSnapshot(page);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    await context.setOffline(true);
    await action.click();

    const dialog = page.getByRole("dialog", {
      name: /AAPL trade review · Stock · Demo Brokerage · Jul 1 · Morning/u,
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("#trade-review-title")).toBeFocused();
    await expect(page.locator("#screen")).toHaveAttribute("inert", "");
    await expect(dialog.locator("[data-trade-review-report-context]")).toHaveText(
      "Opened from Plan check. This full-workspace report does not use or change your Trades filters.",
    );
    await expect(dialog.getByRole("button", { name: "Save review changes" }))
      .toHaveCount(0);
    await expect(
      page.locator('button[data-tab="reports"]'),
    ).toHaveAttribute("aria-current", "page");

    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(action).toBeFocused();
    await expectUnobscured(action);
    expect(Math.abs(await page.evaluate(() => window.scrollY) - scrollBefore))
      .toBeLessThanOrEqual(1);
    const reviewSessionAction = page.locator(
      '[data-review-session-coverage-trade="demo-subject-qqq"] .report-trade-action',
    );
    await expect(reviewSessionAction).toHaveAccessibleName(
      "Open QQQ trade for the current review streak on 2026-07-09 — ETF, Demo Swing, Jul 9 · Morning",
    );
    await reviewSessionAction.click();
    const reviewSessionDialog = page.getByRole("dialog", {
      name: /QQQ trade review · ETF · Demo Swing · Jul 9 · Morning/u,
    });
    await expect(reviewSessionDialog).toBeVisible();
    await expect(
      reviewSessionDialog.locator("[data-trade-review-report-context]"),
    ).toHaveText(
      "Opened from Review session coverage. This full-workspace report does not use or change your Trades filters.",
    );
    await page.keyboard.press("Escape");
    await expect(reviewSessionDialog).toHaveCount(0);
    await expect(reviewSessionAction).toBeFocused();
    await expectUnobscured(reviewSessionAction);

    const directionAction = page.locator(
      '[data-direction-mix-trade="demo-subject-aapl"] .report-trade-action',
    );
    await expect(directionAction).toHaveAccessibleName(
      "Open AAPL trade for the long direction group — Stock, Demo Brokerage, Jul 1 · Morning",
    );
    await directionAction.click();
    const directionDialog = page.getByRole("dialog", {
      name: /AAPL trade review · Stock · Demo Brokerage · Jul 1 · Morning/u,
    });
    await expect(directionDialog).toBeVisible();
    await expect(directionDialog.locator("[data-trade-review-report-context]"))
      .toHaveText(
        "Opened from Direction mix. This full-workspace report does not use or change your Trades filters.",
      );
    await page.keyboard.press("Escape");
    await expect(directionDialog).toHaveCount(0);
    await expect(directionAction).toBeFocused();
    await expectUnobscured(directionAction);

    const openingWeekdayAction = page.locator(
      '[data-opening-weekday-mix-trade="demo-subject-aapl"] .report-trade-action',
    );
    await expect(openingWeekdayAction).toHaveAccessibleName(
      "Open AAPL trade for the Wednesday opening group — Stock, Demo Brokerage, Jul 1 · Morning",
    );
    await openingWeekdayAction.click();
    const openingWeekdayDialog = page.getByRole("dialog", {
      name: /AAPL trade review · Stock · Demo Brokerage · Jul 1 · Morning/u,
    });
    await expect(openingWeekdayDialog).toBeVisible();
    await expect(
      openingWeekdayDialog.locator("[data-trade-review-report-context]"),
    ).toHaveText(
      "Opened from Opening weekday mix. This full-workspace report does not use or change your Trades filters.",
    );
    await page.keyboard.press("Escape");
    await expect(openingWeekdayDialog).toHaveCount(0);
    await expect(openingWeekdayAction).toBeFocused();
    await expectUnobscured(openingWeekdayAction);

    const mistakeAction = page.locator(
      '[data-mistake-patterns-trade="demo-subject-spy"] .report-trade-action',
    );
    await expect(mistakeAction).toHaveAccessibleName(
      "Open SPY trade for saved mistake Chased entry — ETF, Demo Swing, Jul 7 · Afternoon",
    );
    await mistakeAction.click();
    const mistakeDialog = page.getByRole("dialog", {
      name: /SPY trade review · ETF · Demo Swing · Jul 7 · Afternoon/u,
    });
    await expect(mistakeDialog).toBeVisible();
    await expect(mistakeDialog.locator("[data-trade-review-report-context]")).toHaveText(
      "Opened from Mistake patterns. This full-workspace report does not use or change your Trades filters.",
    );
    await page.keyboard.press("Escape");
    await expect(mistakeDialog).toHaveCount(0);
    await expect(mistakeAction).toBeFocused();
    await expectUnobscured(mistakeAction);

    const emotionAction = page.locator(
      '[data-emotion-patterns-trade="demo-subject-meta"] .report-trade-action',
    );
    await expect(emotionAction).toHaveAccessibleName(
      "Open META trade for saved emotion Calm — Stock, Demo Brokerage, Jul 8 · Morning",
    );
    await emotionAction.click();
    const emotionDialog = page.getByRole("dialog", {
      name: /META trade review · Stock · Demo Brokerage · Jul 8 · Morning/u,
    });
    await expect(emotionDialog).toBeVisible();
    await expect(emotionDialog.locator("[data-trade-review-report-context]"))
      .toHaveText(
        "Opened from Emotion patterns. This full-workspace report does not use or change your Trades filters.",
      );
    await page.keyboard.press("Escape");
    await expect(emotionDialog).toHaveCount(0);
    await expect(emotionAction).toBeFocused();
    await expectUnobscured(emotionAction);

    const tagAction = page.locator(
      '[data-tag-patterns-trade="demo-subject-spy"] .report-trade-action',
    );
    await expect(tagAction).toHaveAccessibleName(
      "Open SPY trade for saved tag Chased entry — ETF, Demo Swing, Jul 7 · Afternoon",
    );
    await tagAction.click();
    const tagDialog = page.getByRole("dialog", {
      name: /SPY trade review · ETF · Demo Swing · Jul 7 · Afternoon/u,
    });
    await expect(tagDialog).toBeVisible();
    await expect(tagDialog.locator("[data-trade-review-report-context]")).toHaveText(
      "Opened from Tag patterns. This full-workspace report does not use or change your Trades filters.",
    );
    await page.keyboard.press("Escape");
    await expect(tagDialog).toHaveCount(0);
    await expect(tagAction).toBeFocused();
    await expectUnobscured(tagAction);

    const setupAction = page.locator(
      '[data-setup-performance-trade="demo-subject-spy"] .report-trade-action',
    );
    await expect(setupAction).toHaveAccessibleName(
      "Open SPY trade — ETF, Demo Swing, Jul 7 · Afternoon",
    );
    await setupAction.click();
    const setupDialog = page.getByRole("dialog", {
      name: /SPY trade review · ETF · Demo Swing · Jul 7 · Afternoon/u,
    });
    await expect(setupDialog).toBeVisible();
    await expect(setupDialog.locator("[data-trade-review-report-context]"))
      .toHaveText(
        "Opened from Setup breakdown. This full-workspace report does not use or change your Trades filters.",
      );
    await page.keyboard.press("Escape");
    await expect(setupDialog).toHaveCount(0);
    await expect(setupAction).toBeFocused();
    await expectUnobscured(setupAction);

    const expectExactTradeOpenBlocked = async () => {
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const error = page.locator("[data-trade-review-open-error]");
      await expect(error).toHaveText(
        "Hermes could not open this exact trade because its stable local identity is unavailable.",
      );
      await expect(error).toBeFocused();
      await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
    };

    for (const candidate of [
      {
        action: reviewSessionAction,
        originalId: "demo-subject-qqq",
        alternateId: "demo-subject-aapl",
      },
      {
        action: directionAction,
        originalId: "demo-subject-aapl",
        alternateId: "demo-subject-qqq",
      },
      {
        action: openingWeekdayAction,
        originalId: "demo-subject-aapl",
        alternateId: "demo-subject-qqq",
      },
      {
        action,
        originalId: "demo-subject-aapl",
        alternateId: "demo-subject-qqq",
      },
      {
        action: mistakeAction,
        originalId: "demo-subject-spy",
        alternateId: "demo-subject-qqq",
      },
      {
        action: emotionAction,
        originalId: "demo-subject-meta",
        alternateId: "demo-subject-qqq",
      },
      {
        action: tagAction,
        originalId: "demo-subject-spy",
        alternateId: "demo-subject-qqq",
      },
      {
        action: setupAction,
        originalId: "demo-subject-spy",
        alternateId: "demo-subject-qqq",
      },
    ]) {
      await candidate.action.evaluate((element, alternateId) => {
        element.dataset.reviewTrade = alternateId;
      }, candidate.alternateId);
      await candidate.action.click();
      await expectExactTradeOpenBlocked();
      await candidate.action.evaluate((element, originalId) => {
        document.querySelector("[data-trade-review-open-error]")?.remove();
        element.dataset.reviewTrade = originalId;
      }, candidate.originalId);
    }

    await action.evaluate((element) => {
      element.dataset.tradeReviewReportSource = "direction-mix";
    });
    await action.click();
    await expectExactTradeOpenBlocked();
    await action.evaluate((element) => {
      document.querySelector("[data-trade-review-open-error]")?.remove();
      element.dataset.tradeReviewReportSource = "plan-check";
    });

    await action.evaluate((element) => {
      const group = element.closest<HTMLElement>("[data-plan-check-group]");
      if (group === null) throw new Error("Missing Plan check group.");
      group.dataset.planCheckGroup = "broken";
    });
    await action.click();
    await expectExactTradeOpenBlocked();
    await action.evaluate((element) => {
      document.querySelector("[data-trade-review-open-error]")?.remove();
      const group = element.closest<HTMLElement>("[data-plan-check-group]");
      if (group === null) throw new Error("Missing Plan check group.");
      group.dataset.planCheckGroup = "followed";
    });

    await reviewSessionAction.evaluate((element) => {
      const time = element.closest("[data-review-session-coverage-trade]")
        ?.querySelector<HTMLTimeElement>("time[datetime]");
      if (time === undefined || time === null) {
        throw new Error("Missing review-session evidence date.");
      }
      time.dateTime = "2026-07-08";
    });
    await reviewSessionAction.click();
    await expectExactTradeOpenBlocked();
    await reviewSessionAction.evaluate((element) => {
      document.querySelector("[data-trade-review-open-error]")?.remove();
      const time = element.closest("[data-review-session-coverage-trade]")
        ?.querySelector<HTMLTimeElement>("time[datetime]");
      if (time === undefined || time === null) {
        throw new Error("Missing review-session evidence date.");
      }
      time.dateTime = "2026-07-09";
    });

    await mistakeAction.evaluate((element) => {
      const label = element.closest("[data-mistake-patterns-group-index]")
        ?.querySelector<HTMLElement>(
          ":scope > summary .plan-check-summary-label > strong",
        );
      if (label === undefined || label === null) {
        throw new Error("Missing mistake-pattern group label.");
      }
      label.textContent = "Different mistake";
    });
    await mistakeAction.click();
    await expectExactTradeOpenBlocked();
    await mistakeAction.evaluate((element) => {
      document.querySelector("[data-trade-review-open-error]")?.remove();
      const label = element.closest("[data-mistake-patterns-group-index]")
        ?.querySelector<HTMLElement>(
          ":scope > summary .plan-check-summary-label > strong",
        );
      if (label === undefined || label === null) {
        throw new Error("Missing mistake-pattern group label.");
      }
      label.textContent = "Chased entry";
    });

    await action.evaluate((element) => {
      element.dataset.tradeReviewReportSource = "unknown-report";
    });
    await action.click();
    await expectExactTradeOpenBlocked();
    await action.evaluate((element) => {
      document.querySelector("[data-trade-review-open-error]")?.remove();
      element.dataset.tradeReviewReportSource = "plan-check";
    });

    await action.evaluate((element) => {
      delete element.dataset.tradeReviewReportSource;
    });
    await action.click();
    await expectExactTradeOpenBlocked();
    await action.evaluate((element) => {
      document.querySelector("[data-trade-review-open-error]")?.remove();
      element.dataset.tradeReviewReportSource = "plan-check";
    });

    await action.evaluate((element) => {
      element.dataset.reviewTrade = "missing-subject";
    });
    await action.click();
    await expectExactTradeOpenBlocked();
    await action.evaluate((element) => {
      document.querySelector("[data-trade-review-open-error]")?.remove();
      element.dataset.reviewTrade = "demo-subject-aapl";
    });

    await setupAction.evaluate((element) => {
      element.id = "stripped-report-trade";
      element.classList.remove("report-trade-action");
      delete element.dataset.tradeReviewReportSource;
      element.dataset.reviewTrade = "demo-subject-qqq";
    });
    const stripped = page.locator("#stripped-report-trade");
    await stripped.click();
    await expectExactTradeOpenBlocked();
    await stripped.evaluate((element) => {
      document.querySelector("[data-trade-review-open-error]")?.remove();
      element.classList.add("report-trade-action");
      element.dataset.tradeReviewReportSource = "setup-performance";
      element.dataset.reviewTrade = "demo-subject-spy";
      element.removeAttribute("id");
    });

    await directionAction.evaluate((element) => {
      const group = element.closest<HTMLElement>(
        "[data-direction-mix-group-index]",
      );
      if (group === null) throw new Error("Missing Direction mix group.");
      group.dataset.directionMixGroupIndex = "9";
    });
    await directionAction.click();
    await expectExactTradeOpenBlocked();
    await directionAction.evaluate((element) => {
      document.querySelector("[data-trade-review-open-error]")?.remove();
      const group = element.closest<HTMLElement>(
        "[data-direction-mix-group-index]",
      );
      if (group === null) throw new Error("Missing Direction mix group.");
      group.dataset.directionMixGroupIndex = "0";
    });

    await openingWeekdayAction.evaluate((element) => {
      const row = element.closest<HTMLElement>("[data-opening-weekday-mix-trade]");
      const group = row?.closest<HTMLElement>(
        "[data-opening-weekday-mix-group-index]",
      );
      if (row === undefined || row === null || group === undefined || group === null) {
        throw new Error("Missing Opening weekday evidence row.");
      }
      const marker = document.createElement("span");
      marker.id = "opening-weekday-row-marker";
      marker.hidden = true;
      row.insertAdjacentElement("beforebegin", marker);
      group.append(row);
    });
    await openingWeekdayAction.click();
    await expectExactTradeOpenBlocked();
    await openingWeekdayAction.evaluate((element) => {
      document.querySelector("[data-trade-review-open-error]")?.remove();
      const row = element.closest<HTMLElement>("[data-opening-weekday-mix-trade]");
      const marker = document.querySelector<HTMLElement>(
        "#opening-weekday-row-marker",
      );
      if (row === undefined || row === null || marker === null) {
        throw new Error("Missing Opening weekday evidence marker.");
      }
      marker.replaceWith(row);
    });

    await action.evaluate((element) => {
      const clone = element.cloneNode(true) as HTMLButtonElement;
      clone.id = "replacement-report-trade";
      element.replaceWith(clone);
    });
    const replacement = page.locator("#replacement-report-trade");
    await replacement.click();
    await expectExactTradeOpenBlocked();
    await page.locator("[data-trade-review-open-error]").evaluate((element) => {
      element.remove();
    });

    await expect(reviewSessionGroup).toHaveAttribute("open", "");
    await expect(directionGroup).toHaveAttribute("open", "");
    await expect(symbolGroup).toHaveAttribute("open", "");
    await expect(openingWeekdayGroup).toHaveAttribute("open", "");
    await expect(planGroup).toHaveAttribute("open", "");
    await expect(mistakeGroup).toHaveAttribute("open", "");
    await expect(emotionGroup).toHaveAttribute("open", "");
    await expect(tagGroup).toHaveAttribute("open", "");
    await expect(setupGroup).toHaveAttribute("open", "");
    await expect(page.locator("[data-plan-check]")).toHaveAttribute(
      "data-trade-continuation-sentinel",
      "preserved",
    );
    expect(await reportFingerprint(page)).toEqual(reportBefore);
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);

    await page.getByRole("button", { name: "Trades", exact: true }).click();
    expect(await tradeBrowserFingerprint(page)).toEqual(browserBefore);
    expect(externalRequests).toEqual([]);
  },
);

for (const viewport of [
  { width: 320, height: 568 },
  { width: 421, height: 568 },
] as const) {
  test(
    `report trade action and sheet remain operable at ${viewport.width}px and 200% text`,
    async ({ page, context }) => {
      const externalRequests = logExternalRequests(page);
      await page.setViewportSize(viewport);
      await startDemo(page);
      await page.evaluate(() => {
        document.documentElement.dataset.testTextScale = "200";
      });
      await context.setOffline(true);
      const storageBefore = await localStorageSnapshot(page);
      await page.getByRole("button", { name: "Reports", exact: true }).click();
      const reviewSessionGroup = page.locator(
        '[data-review-session-coverage-group="current_streak"]',
      );
      await reviewSessionGroup.locator(":scope > summary").click();
      const reviewSessionAction = reviewSessionGroup.locator(
        '[data-review-session-coverage-trade="demo-subject-qqq"] .report-trade-action',
      );
      await reviewSessionAction.focus();
      await expect(reviewSessionAction).toBeFocused();
      await expectUnobscured(reviewSessionAction);
      await expectTouchTarget(reviewSessionAction);
      await expect(reviewSessionAction).toHaveAccessibleName(
        "Open QQQ trade for the current review streak on 2026-07-09 — ETF, Demo Swing, Jul 9 · Morning",
      );
      await page.keyboard.press("Enter");
      const reviewSessionDialog = page.getByRole("dialog", {
        name: /QQQ trade review · ETF · Demo Swing · Jul 9 · Morning/u,
      });
      await expect(reviewSessionDialog).toBeVisible();
      await expect(reviewSessionDialog.locator("#trade-review-title")).toBeFocused();
      await expect(
        reviewSessionDialog.locator("[data-trade-review-report-context]"),
      ).toHaveText(
        "Opened from Review session coverage. This full-workspace report does not use or change your Trades filters.",
      );
      const reviewSessionOverflow = await reviewSessionDialog.evaluate(
        (element) => ({
          document: document.documentElement.scrollWidth - window.innerWidth,
          dialog: element.scrollWidth - element.clientWidth,
        }),
      );
      expect(reviewSessionOverflow.document).toBeLessThanOrEqual(1);
      expect(reviewSessionOverflow.dialog).toBeLessThanOrEqual(1);
      await reviewSessionDialog.getByRole("button", {
        name: "Close",
        exact: true,
      }).click();
      await expect(reviewSessionDialog).toHaveCount(0);
      await expect(reviewSessionAction).toBeFocused();
      await expectUnobscured(reviewSessionAction);
      await expectTouchTarget(reviewSessionAction);

      await page.locator('[data-plan-check-group="followed"] > summary').click();

      const action = page.locator(
        '[data-plan-check-trade="demo-subject-aapl"] .report-trade-action',
      );
      await action.focus();
      await expect(action).toBeFocused();
      await expectUnobscured(action);
      await expectTouchTarget(action);
      await expect(action).toHaveAccessibleName(
        "Open AAPL trade — Stock, Demo Brokerage, Jul 1 · Morning",
      );
      await action.click();

      const dialog = page.getByRole("dialog", {
        name: /AAPL trade review · Stock · Demo Brokerage · Jul 1 · Morning/u,
      });
      await expect(dialog).toBeVisible();
      await expect(dialog.locator("#trade-review-title")).toBeFocused();
      const overflow = await dialog.evaluate((element) => ({
        document: document.documentElement.scrollWidth - window.innerWidth,
        dialog: element.scrollWidth - element.clientWidth,
        offenders: Array.from(element.querySelectorAll<HTMLElement>("*"))
          .map((candidate) => ({
            label: `${candidate.tagName.toLowerCase()}#${candidate.id}.${String(candidate.className)}`,
            rendered: candidate.getClientRects().length > 0,
            left: Math.floor(
              candidate.getBoundingClientRect().left
              - element.getBoundingClientRect().left,
            ),
            right: Math.ceil(
              candidate.getBoundingClientRect().right
              - element.getBoundingClientRect().right,
            ),
          }))
          .filter((candidate) => (
            candidate.rendered
            && (candidate.left < -1 || candidate.right > 1)
          ))
          .slice(0, 20),
      }));
      expect(
        overflow.document,
        `Overflow evidence: ${JSON.stringify(overflow.offenders)}`,
      ).toBeLessThanOrEqual(1);
      expect(overflow.dialog).toBeLessThanOrEqual(1);
      expect(overflow.offenders).toEqual([]);

      await dialog.evaluate((element) => {
        const backdrop = element.closest<HTMLElement>(
          "[data-trade-review-backdrop]",
        );
        if (backdrop === null) {
          throw new Error("Missing trade-review backdrop.");
        }
        const before = document.createElement("button");
        before.type = "button";
        before.id = "trade-review-focus-before";
        before.textContent = "Before dialog";
        backdrop.insertAdjacentElement("beforebegin", before);
        const after = document.createElement("button");
        after.type = "button";
        after.id = "trade-review-focus-after";
        after.textContent = "After dialog";
        backdrop.insertAdjacentElement("afterend", after);
      });
      const beforeSentinel = page.locator("#trade-review-focus-before");
      const afterSentinel = page.locator("#trade-review-focus-after");
      await expect(beforeSentinel).toBeAttached();
      await expect(afterSentinel).toBeAttached();
      const firstClose = dialog.getByRole("button", {
        name: "Close trade review",
      });
      const lastClose = dialog.getByRole("button", {
        name: "Close",
        exact: true,
      });
      await firstClose.focus();
      await page.keyboard.press("Shift+Tab");
      await expect(lastClose).toBeFocused();
      await expect(beforeSentinel).not.toBeFocused();
      await page.keyboard.press("Tab");
      await expect(firstClose).toBeFocused();
      await expect(afterSentinel).not.toBeFocused();
      await beforeSentinel.evaluate((element) => element.remove());
      await afterSentinel.evaluate((element) => element.remove());
      await page.keyboard.press("Escape");
      await expect(dialog).toHaveCount(0);
      await expect(action).toBeFocused();
      await expectUnobscured(action);
      await expectTouchTarget(action);

      const openingWeekdayGroup = page.locator(
        '[data-opening-weekday-mix-group="wednesday"]',
      );
      await openingWeekdayGroup.locator(":scope > summary").click();
      const openingWeekdayAction = openingWeekdayGroup.locator(
        '[data-opening-weekday-mix-trade="demo-subject-aapl"] .report-trade-action',
      );
      await openingWeekdayAction.focus();
      await expect(openingWeekdayAction).toBeFocused();
      await expectUnobscured(openingWeekdayAction);
      await expectTouchTarget(openingWeekdayAction);
      await expect(openingWeekdayAction).toHaveAccessibleName(
        "Open AAPL trade for the Wednesday opening group — Stock, Demo Brokerage, Jul 1 · Morning",
      );
      await openingWeekdayAction.click();
      const openingWeekdayDialog = page.getByRole("dialog", {
        name: /AAPL trade review · Stock · Demo Brokerage · Jul 1 · Morning/u,
      });
      await expect(openingWeekdayDialog).toBeVisible();
      await expect(
        openingWeekdayDialog.locator("[data-trade-review-report-context]"),
      ).toHaveText(
        "Opened from Opening weekday mix. This full-workspace report does not use or change your Trades filters.",
      );
      const openingWeekdayOverflow = await openingWeekdayDialog.evaluate(
        (element) => ({
          document: document.documentElement.scrollWidth - window.innerWidth,
          dialog: element.scrollWidth - element.clientWidth,
        }),
      );
      expect(openingWeekdayOverflow.document).toBeLessThanOrEqual(1);
      expect(openingWeekdayOverflow.dialog).toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
      await expect(openingWeekdayDialog).toHaveCount(0);
      await expect(openingWeekdayAction).toBeFocused();
      await expectUnobscured(openingWeekdayAction);
      await expectTouchTarget(openingWeekdayAction);

      const mistakeGroup = page.locator('[data-mistake-patterns-group-index="0"]');
      await mistakeGroup.locator(":scope > summary").click();
      const mistakeAction = mistakeGroup.locator(".report-trade-action");
      await mistakeAction.focus();
      await expect(mistakeAction).toBeFocused();
      await expectUnobscured(mistakeAction);
      await expectTouchTarget(mistakeAction);
      await expect(mistakeAction).toHaveAccessibleName(
        "Open SPY trade for saved mistake Chased entry — ETF, Demo Swing, Jul 7 · Afternoon",
      );
      await mistakeAction.click();
      const mistakeDialog = page.getByRole("dialog", {
        name: /SPY trade review · ETF · Demo Swing · Jul 7 · Afternoon/u,
      });
      await expect(mistakeDialog).toBeVisible();
      await expect(mistakeDialog.locator("[data-trade-review-report-context]"))
        .toHaveText(
          "Opened from Mistake patterns. This full-workspace report does not use or change your Trades filters.",
        );
      const mistakeOverflow = await mistakeDialog.evaluate((element) => ({
        document: document.documentElement.scrollWidth - window.innerWidth,
        dialog: element.scrollWidth - element.clientWidth,
      }));
      expect(mistakeOverflow.document).toBeLessThanOrEqual(1);
      expect(mistakeOverflow.dialog).toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
      await expect(mistakeDialog).toHaveCount(0);
      await expect(mistakeAction).toBeFocused();
      await expectUnobscured(mistakeAction);
      await expectTouchTarget(mistakeAction);

      const tagGroup = page.locator('[data-tag-patterns-group-index="0"]');
      await tagGroup.locator(":scope > summary").click();
      const tagAction = tagGroup.locator(".report-trade-action");
      await tagAction.focus();
      await expect(tagAction).toBeFocused();
      await expectUnobscured(tagAction);
      await expectTouchTarget(tagAction);
      await expect(tagAction).toHaveAccessibleName(
        "Open SPY trade for saved tag Chased entry — ETF, Demo Swing, Jul 7 · Afternoon",
      );
      await tagAction.click();
      const tagDialog = page.getByRole("dialog", {
        name: /SPY trade review · ETF · Demo Swing · Jul 7 · Afternoon/u,
      });
      await expect(tagDialog).toBeVisible();
      await expect(tagDialog.locator("[data-trade-review-report-context]"))
        .toHaveText(
          "Opened from Tag patterns. This full-workspace report does not use or change your Trades filters.",
        );
      const tagOverflow = await tagDialog.evaluate((element) => ({
        document: document.documentElement.scrollWidth - window.innerWidth,
        dialog: element.scrollWidth - element.clientWidth,
      }));
      expect(tagOverflow.document).toBeLessThanOrEqual(1);
      expect(tagOverflow.dialog).toBeLessThanOrEqual(1);
      await page.keyboard.press("Escape");
      await expect(tagDialog).toHaveCount(0);
      await expect(tagAction).toBeFocused();
      await expectUnobscured(tagAction);
      await expectTouchTarget(tagAction);
      expect(await localStorageSnapshot(page)).toEqual(storageBefore);
      expect(externalRequests).toEqual([]);
    },
  );
}
