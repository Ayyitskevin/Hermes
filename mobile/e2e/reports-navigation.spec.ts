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
    link: "Plan check",
    target: "#plan-check-title",
    returnLink: "[data-plan-check] > .section-title .report-menu-link",
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

    const planGroup = page.locator(
      '[data-plan-check-group="followed"]',
    );
    const setupGroup = page.locator(
      '[data-setup-performance-group-index="0"]',
    );
    await planGroup.locator("summary").click();
    await setupGroup.locator("summary").click();
    await expect(planGroup).toHaveAttribute("open", "");
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
    await expect(planGroup).toHaveAttribute("open", "");
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
      "[data-plan-check-group] > summary",
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
        "[data-plan-check]",
        "[data-plan-check] *",
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

    const controls = page.locator([
      "a[data-report-target]",
      "[data-plan-check-group] > summary",
      "[data-setup-performance-group-index] > summary",
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
        "[data-plan-check]",
        "[data-setup-performance]",
      ].join(", "))).map((element) => element.scrollWidth - element.clientWidth),
    }));
    expect(overflow.document).toBeLessThanOrEqual(1);
    expect(overflow.reports.every((value) => value <= 1)).toBe(true);
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    expect(externalRequests).toEqual([]);
  },
);
