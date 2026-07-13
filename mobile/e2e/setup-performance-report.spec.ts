import { expect, test, type Locator, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";
const DEMO_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMD", "SPY", "META", "QQQ"] as const;

async function startDemo(page: Page): Promise<void> {
  await page.addInitScript(
    (key) => window.localStorage.setItem(key, "complete"),
    ONBOARDING_KEY,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Reports", exact: true }).click();
}

function setupReport(page: Page): Locator {
  return page.locator("[data-setup-performance]");
}

function setupDetails(report: Locator, setup: string): Locator {
  return report.locator("details[data-setup-performance-group-index]", { hasText: setup });
}

async function expectExactSymbols(
  details: Locator,
  expected: readonly string[],
): Promise<void> {
  for (const symbol of DEMO_SYMBOLS) {
    await expect(details.getByText(symbol, { exact: true })).toHaveCount(
      expected.includes(symbol) ? 1 : 0,
    );
  }
}

test("setup breakdown explains its governed cohort and drills into disjoint setup evidence offline", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });

  await startDemo(page);
  await expect(page.getByRole("button", { name: "Reports", exact: true }))
    .toHaveAttribute("aria-current", "page");
  const report = setupReport(page);
  await expect(report).toBeVisible();
  await expect(report.getByRole("heading", { name: "Setup breakdown", exact: true }))
    .toBeVisible();
  await expect(report.getByText("Definition", { exact: true })).toBeVisible();
  await expect(report.getByText("Definition checksum", { exact: true })).toBeVisible();
  await expect(report.getByText("Cohort", { exact: true })).toBeVisible();
  await expect(report.getByText("Currency", { exact: true })).toBeVisible();
  await expect(report.getByText("Time zone", { exact: true })).toBeVisible();
  await expect(report.getByText("Exclusions", { exact: true })).toBeVisible();
  await expect(report).toContainText("setup-performance-report-v1");
  await expect(report).toContainText("5779276cbbc4278136f96bbaca167216c60b395cdad4a8bb4cf9c3b5f272601b");
  await expect(report).toContainText("8 of 8 trades");
  await expect(report).toContainText("0 open or partial");
  await expect(report).toContainText("stable setup-name code-unit order");
  await expect(report).toContainText("not a performance ranking or recommendation");
  await expect(report).toContainText("zero is not a win");
  await expect(report).toContainText("strict replay-validated");
  await expect(report).toContainText("half away from zero to 12 decimal places");
  await expect(report).toContainText("do not establish cause");
  await expect(report).toContainText("investment advice");

  const labels = await report
    .locator(".setup-performance-group .plan-check-summary-label > strong")
    .allTextContents();
  expect(labels).toEqual(["Breakout", "Pullback", "Reversal"]);

  const breakout = setupDetails(report, "Breakout");
  const pullback = setupDetails(report, "Pullback");
  const reversal = setupDetails(report, "Reversal");
  await expect(breakout.locator("summary")).toContainText("3 reviewed closed trades");
  await expect(breakout.locator("summary")).toContainText("+56.666666666667 USD expectancy");
  await expect(pullback.locator("summary")).toContainText("3 reviewed closed trades");
  await expect(pullback.locator("summary")).toContainText("+86.666666666667 USD expectancy");
  await expect(reversal.locator("summary")).toContainText("2 reviewed closed trades");
  await expect(reversal.locator("summary")).toContainText("-60 USD expectancy");

  for (const group of [breakout, pullback, reversal]) {
    const summary = group.locator("summary");
    await summary.focus();
    await expect(summary).toBeFocused();
    expect((await summary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Enter");
    await expect(group).toHaveAttribute("open", "");
  }

  await expectExactSymbols(breakout, ["AAPL", "AMD", "SPY"]);
  await expectExactSymbols(pullback, ["MSFT", "NVDA", "META"]);
  await expectExactSymbols(reversal, ["TSLA", "QQQ"]);
  await expect(breakout).toContainText("+170 USD");
  await expect(breakout).toContainText("+0.566666666667R");
  await expect(pullback).toContainText("+260 USD");
  await expect(pullback).toContainText("+0.866666666667R");
  await expect(reversal).toContainText("-120 USD");
  await expect(reversal).toContainText("-0.6R");
  expect(externalRequests).toEqual([]);
});

test("setup breakdown reflows at 320px and 200% text without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startDemo(page);
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });

  const report = setupReport(page);
  for (const summary of await report.locator(".setup-performance-group summary").all()) {
    await summary.press("Enter");
  }
  await report.locator(".setup-performance-evidence p").first().evaluate((element) => {
    element.textContent = "W".repeat(500);
  });

  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    viewport: {
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
    },
    offenders: Array.from(
      document.querySelectorAll<HTMLElement>(
        "[data-setup-performance], [data-setup-performance] *",
      ),
    )
      .map((element) => ({
        label: `${element.tagName.toLowerCase()}#${element.id}.${String(element.className)}`,
        own: element.scrollWidth - element.clientWidth,
        right: Math.ceil(element.getBoundingClientRect().right - window.innerWidth),
      }))
      .filter((candidate) => candidate.own > 1 || candidate.right > 1)
      .slice(0, 20),
    report: (() => {
      const element = document.querySelector<HTMLElement>("[data-setup-performance]");
      return element === null ? null : element.scrollWidth - element.clientWidth;
    })(),
  }));
  expect(overflow.report).not.toBeNull();
  expect(
    overflow.document,
    `Overflow evidence: ${JSON.stringify({
      viewport: overflow.viewport,
      offenders: overflow.offenders,
    })}`,
  ).toBeLessThanOrEqual(1);
  expect(
    overflow.offenders,
    `Clipped evidence: ${JSON.stringify({
      viewport: overflow.viewport,
      offenders: overflow.offenders,
    })}`,
  ).toEqual([]);
  expect(overflow.report ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(1);
});
