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
    link: "Direction mix",
    target: "#direction-mix-title",
    returnLink: "[data-direction-mix] > .section-title .report-menu-link",
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
    const planGroup = page.locator(
      '[data-plan-check-group="followed"]',
    );
    const mistakeGroup = page.locator(
      '[data-mistake-patterns-group-index="0"]',
    );
    const emotionGroup = page.locator(
      '[data-emotion-patterns-group-index="0"]',
    );
    const setupGroup = page.locator(
      '[data-setup-performance-group-index="0"]',
    );
    await directionGroup.locator("summary").click();
    await planGroup.locator("summary").click();
    await mistakeGroup.locator("summary").click();
    await emotionGroup.locator("summary").click();
    await setupGroup.locator("summary").click();
    await expect(directionGroup).toHaveAttribute("open", "");
    await expect(planGroup).toHaveAttribute("open", "");
    await expect(mistakeGroup).toHaveAttribute("open", "");
    await expect(emotionGroup).toHaveAttribute("open", "");
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
    await expect(directionGroup).toHaveAttribute("open", "");
    await expect(planGroup).toHaveAttribute("open", "");
    await expect(mistakeGroup).toHaveAttribute("open", "");
    await expect(emotionGroup).toHaveAttribute("open", "");
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
    const menuHeading = page.locator("#reports-navigation-title");
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

    const summaries = page.locator([
      "[data-direction-mix-group] > summary",
      "[data-plan-check-group] > summary",
      "[data-mistake-patterns-group-index] > summary",
      "[data-emotion-patterns-group-index] > summary",
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
        "[data-direction-mix]",
        "[data-direction-mix] *",
        "[data-plan-check]",
        "[data-plan-check] *",
        "[data-mistake-patterns]",
        "[data-mistake-patterns] *",
        "[data-emotion-patterns]",
        "[data-emotion-patterns] *",
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
    const directionGroup = page.locator('[data-direction-mix-group="long"]');
    const followedGroup = page.locator('[data-plan-check-group="followed"]');
    const mistakeGroup = page.locator('[data-mistake-patterns-group-index="0"]');
    const emotionGroup = page.locator(
      '[data-emotion-patterns-group-index="0"]',
    );
    await directionGroup.locator(":scope > summary").click();
    await followedGroup.locator(":scope > summary").click();
    await mistakeGroup.locator(":scope > summary").click();
    await emotionGroup.locator(":scope > summary").click();
    await expect(directionGroup).toHaveAttribute("open", "");
    await expect(followedGroup).toHaveAttribute("open", "");
    await expect(mistakeGroup).toHaveAttribute("open", "");
    await expect(emotionGroup).toHaveAttribute("open", "");

    const controls = page.locator([
      "a[data-report-target]",
      "[data-direction-mix-group] > summary",
      "[data-plan-check-group] > summary",
      "[data-mistake-patterns-group-index] > summary",
      "[data-emotion-patterns-group-index] > summary",
      "[data-setup-performance-group-index] > summary",
      '[data-direction-mix-group="long"][open] .report-trade-action',
      '[data-plan-check-group="followed"][open] .report-trade-action',
      '[data-mistake-patterns-group-index="0"][open] .report-trade-action',
      '[data-emotion-patterns-group-index="0"][open] .report-trade-action',
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

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - window.innerWidth,
      reports: Array.from(document.querySelectorAll<HTMLElement>([
        "[data-report-navigation]",
        "[data-report-overview]",
        "[data-direction-mix]",
        "[data-plan-check]",
        "[data-mistake-patterns]",
        "[data-emotion-patterns]",
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
    await page.getByRole("searchbox", { name: "Search scoped trades" }).fill("qqq");
    const browserBefore = await tradeBrowserFingerprint(page);

    await page.getByRole("button", { name: "Reports", exact: true }).click();
    const directionGroup = page.locator('[data-direction-mix-group="long"]');
    const planGroup = page.locator('[data-plan-check-group="followed"]');
    const mistakeGroup = page.locator('[data-mistake-patterns-group-index="0"]');
    const emotionGroup = page.locator('[data-emotion-patterns-group-index="0"]');
    const setupGroup = page.locator('[data-setup-performance-group-index="0"]');
    await directionGroup.locator("summary").click();
    await planGroup.locator("summary").click();
    await mistakeGroup.locator("summary").click();
    await emotionGroup.locator("summary").click();
    await setupGroup.locator("summary").click();
    await expect(directionGroup).toHaveAttribute("open", "");
    await expect(planGroup).toHaveAttribute("open", "");
    await expect(mistakeGroup).toHaveAttribute("open", "");
    await expect(emotionGroup).toHaveAttribute("open", "");
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

    await action.evaluate((element) => {
      const clone = element.cloneNode(true) as HTMLButtonElement;
      clone.id = "appended-report-trade";
      clone.innerHTML = "<span>Open appended trade</span>";
      element.insertAdjacentElement("afterend", clone);
    });
    const appended = page.locator("#appended-report-trade");
    await appended.locator("span").click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(appended).toBeFocused();

    await appended.evaluate((element) => {
      element.dataset.reviewTrade = "demo-subject-qqq";
    });
    await appended.locator("span").click();
    const exactIdDialog = page.getByRole("dialog", {
      name: /QQQ trade review · ETF · Demo Swing · Jul 9 · Morning/u,
    });
    await expect(exactIdDialog).toBeVisible();
    await expect(exactIdDialog.locator("#trade-review-title")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(appended).toBeFocused();

    await appended.evaluate((element) => {
      element.dataset.tradeReviewReportSource = "unknown-report";
    });
    await appended.locator("span").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const invalidSourceError = page.locator(
      "[data-trade-review-open-error]",
    );
    await expect(invalidSourceError).toHaveText(
      "Hermes could not open this exact trade because its stable local identity is unavailable.",
    );
    await expect(invalidSourceError).toBeFocused();
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
    await appended.evaluate((element) => {
      document.querySelector("[data-trade-review-open-error]")?.remove();
      element.dataset.tradeReviewReportSource = "plan-check";
    });

    await appended.evaluate((element) => {
      delete element.dataset.tradeReviewReportSource;
    });
    await appended.locator("span").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const missingSourceError = page.locator(
      "[data-trade-review-open-error]",
    );
    await expect(missingSourceError).toHaveText(
      "Hermes could not open this exact trade because its stable local identity is unavailable.",
    );
    await expect(missingSourceError).toBeFocused();
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
    await appended.evaluate((element) => {
      document.querySelector("[data-trade-review-open-error]")?.remove();
      element.dataset.tradeReviewReportSource = "plan-check";
    });

    await appended.evaluate((element) => {
      element.dataset.reviewTrade = "missing-subject";
    });
    await appended.locator("span").click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("[data-trade-review-open-error]")).toHaveText(
      "Hermes could not open this exact trade because its stable local identity is unavailable.",
    );
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
    await appended.evaluate((element) => {
      document.querySelector("[data-trade-review-open-error]")?.remove();
      element.remove();
    });

    await expect(directionGroup).toHaveAttribute("open", "");
    await expect(planGroup).toHaveAttribute("open", "");
    await expect(mistakeGroup).toHaveAttribute("open", "");
    await expect(emotionGroup).toHaveAttribute("open", "");
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
      expect(await localStorageSnapshot(page)).toEqual(storageBefore);
      expect(externalRequests).toEqual([]);
    },
  );
}
