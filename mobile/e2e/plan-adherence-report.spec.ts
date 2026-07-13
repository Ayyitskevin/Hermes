import { expect, test, type Locator, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";
const DEMO_SYMBOLS = ["AAPL", "MSFT", "NVDA", "TSLA", "AMD", "SPY", "META", "QQQ"] as const;
const FOLLOWED_SYMBOLS = ["AAPL", "MSFT", "NVDA", "AMD", "META"] as const;
const BROKEN_SYMBOLS = ["TSLA", "SPY", "QQQ"] as const;

async function startDemo(page: Page): Promise<void> {
  await page.addInitScript(
    (key) => window.localStorage.setItem(key, "complete"),
    ONBOARDING_KEY,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

function planCheck(page: Page): Locator {
  return page.locator("[data-plan-check]");
}

function planDetails(report: Locator, label: "Rules followed" | "Rule broken"): Locator {
  const classification = label === "Rules followed" ? "followed" : "broken";
  return report.locator(`details[data-plan-check-group="${classification}"]`);
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

test("plan check explains its cohort and drills into disjoint rule outcomes offline", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });

  await startDemo(page);
  const shortcut = page.getByRole("button", { name: "Open plan check", exact: true });
  await expect(shortcut).toBeVisible();
  await shortcut.click();

  await expect(page.getByRole("button", { name: "Reports", exact: true }))
    .toHaveAttribute("aria-current", "page");
  const report = planCheck(page);
  await expect(report).toBeVisible();
  await expect(report.getByText("Definition", { exact: true })).toBeVisible();
  await expect(report.getByText("Definition checksum", { exact: true })).toBeVisible();
  await expect(report.getByText("Cohort", { exact: true })).toBeVisible();
  await expect(report.getByText("Currency", { exact: true })).toBeVisible();
  await expect(report.getByText("Time zone", { exact: true })).toBeVisible();
  await expect(report.getByText("Exclusions", { exact: true })).toBeVisible();
  await expect(report).toContainText("USD");
  await expect(report).toContainText("UTC");
  await expect(report).toContainText("plan-adherence-report-v1");
  await expect(report).toContainText("0f092c3bdd6c5051e97f5be0f1c7758a01e3159875adf660b1b0ea00f970ae85");
  await expect(report).toContainText("8 of 8 trades");
  await expect(report).toContainText("0 open or partial");
  await expect(report).toContainText(/completed reviewed closed trades/iu);
  await expect(report).toContainText(/at least one current saved rule is followed/iu);
  await expect(report).toContainText(/none is broken/iu);
  await expect(report).toContainText(/at least one current saved rule is broken/iu);
  await expect(report).toContainText(/broken takes precedence/iu);
  await expect(report).toContainText(/rules followed minus rule broken/iu);
  await expect(report).toContainText(/half away from zero to 12 decimal places/iu);
  await expect(report).toContainText(/one final division/iu);
  await expect(report).toContainText(/at least 3 trades in both groups/iu);
  await expect(report).toContainText(/draft|pending/iu);
  await expect(report).toContainText(/unreviewed/iu);
  await expect(report).toContainText(/not applicable/iu);

  const followed = planDetails(report, "Rules followed");
  const broken = planDetails(report, "Rule broken");
  await expect(followed).toHaveCount(1);
  await expect(broken).toHaveCount(1);
  await expect(followed.locator("summary")).toContainText("5");
  await expect(followed.locator("summary")).toContainText("+106 USD expectancy");
  await expect(broken.locator("summary")).toContainText("3");
  await expect(broken.locator("summary")).toContainText("-73.333333333333 USD expectancy");

  const followedSummary = followed.locator("summary");
  await followedSummary.focus();
  await expect(followedSummary).toBeFocused();
  expect((await followedSummary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Enter");
  await expect(followed).toHaveAttribute("open", "");
  await expectExactSymbols(followed, FOLLOWED_SYMBOLS);

  const brokenSummary = broken.locator("summary");
  await brokenSummary.focus();
  await expect(brokenSummary).toBeFocused();
  expect((await brokenSummary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Enter");
  await expect(broken).toHaveAttribute("open", "");
  await expectExactSymbols(broken, BROKEN_SYMBOLS);

  await followedSummary.focus();
  await page.keyboard.press("Enter");
  await expect(followed).not.toHaveAttribute("open", "");
  expect(FOLLOWED_SYMBOLS.filter((symbol) => (
    (BROKEN_SYMBOLS as readonly string[]).includes(symbol)
  ))).toEqual([]);
  expect(externalRequests).toEqual([]);
});

test("plan check reflows at 320px and 200% text without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startDemo(page);
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  await page.getByRole("button", { name: "Reports", exact: true }).click();

  const report = planCheck(page);
  const followed = planDetails(report, "Rules followed");
  const broken = planDetails(report, "Rule broken");
  await followed.locator("summary").press("Enter");
  await broken.locator("summary").press("Enter");
  await report.locator(".plan-check-evidence li").first().evaluate((element) => {
    element.textContent = "W".repeat(500);
  });

  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    viewport: {
      innerWidth: window.innerWidth,
      clientWidth: document.documentElement.clientWidth,
    },
    offenders: Array.from(document.querySelectorAll<HTMLElement>("[data-plan-check], [data-plan-check] *"))
      .map((element) => ({
        label: `${element.tagName.toLowerCase()}#${element.id}.${String(element.className)}`,
        own: element.scrollWidth - element.clientWidth,
        right: Math.ceil(element.getBoundingClientRect().right - window.innerWidth),
      }))
      .filter((candidate) => candidate.own > 1 || candidate.right > 1)
      .slice(0, 20),
    report: (() => {
      const element = document.querySelector<HTMLElement>("[data-plan-check]")
        ?? Array.from(document.querySelectorAll<HTMLElement>("section"))
          .find((candidate) => candidate.querySelector("h2")?.textContent === "Plan check");
      return element === undefined
        ? null
        : element.scrollWidth - element.clientWidth;
    })(),
  }));
  expect(overflow.report).not.toBeNull();
  expect(
    overflow.document,
    `Overflow evidence: ${JSON.stringify({ viewport: overflow.viewport, offenders: overflow.offenders })}`,
  ).toBeLessThanOrEqual(1);
  expect(
    overflow.offenders,
    `Clipped evidence: ${JSON.stringify({ viewport: overflow.viewport, offenders: overflow.offenders })}`,
  ).toEqual([]);
  expect(overflow.report ?? Number.POSITIVE_INFINITY).toBeLessThanOrEqual(1);
});
