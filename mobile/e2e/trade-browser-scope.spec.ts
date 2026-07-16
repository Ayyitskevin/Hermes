import { expect, test, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

async function startDemo(page: Page): Promise<void> {
  await page.addInitScript(
    (key) => window.localStorage.setItem(key, "complete"),
    ONBOARDING_KEY,
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

async function applySwingRange(page: Page, exerciseInvalidRange = false): Promise<void> {
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await page.getByRole("combobox", { name: "Account" }).selectOption("demo-account-swing");
  if (exerciseInvalidRange) {
    await page.getByRole("textbox", { name: "Activity from" }).fill("2026-07-09");
    await page.getByRole("textbox", { name: "Activity through" }).fill("2026-07-07");
    await page.getByRole("button", { name: "Apply scope" }).click();
    const error = page.locator("#trade-scope-error");
    await expect(error).toBeFocused();
    await expect(error).toContainText("Activity start must be on or before activity end.");
    await expect(page.getByRole("textbox", { name: "Activity from" }))
      .toHaveAttribute("aria-invalid", "true");
    await expect(page.getByRole("textbox", { name: "Activity through" }))
      .toHaveAttribute("aria-invalid", "true");
    await expect(page.locator(".trade-card")).toHaveCount(8);
  }
  await page.getByRole("textbox", { name: "Activity from" }).fill("2026-07-07");
  await page.getByRole("textbox", { name: "Activity through" }).fill("2026-07-09");
  await page.getByRole("button", { name: "Apply scope" }).click();
}

test("account, activity range, search, and day scope compose without changing governed reports", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  await startDemo(page);
  await applySwingRange(page, true);

  const scopeSummary = page.locator("#trade-scope-summary");
  await expect(scopeSummary).toBeFocused();
  await expect(scopeSummary).toBeInViewport();
  await expect(scopeSummary).toContainText("Demo Swing · Jul 7, 2026–Jul 9, 2026");
  await expect(scopeSummary).toContainText("-$150.00");
  await expect(scopeSummary).toContainText(
    "2 contributing trades · 4 allocations · 2 activity days",
  );
  await expect(page.locator(".trade-card")).toHaveCount(2);
  await expect(page.locator(".trade-card .trade-account")).toHaveText([
    "Demo Swing",
    "Demo Swing",
  ]);
  await expect(page.getByRole("heading", { name: "QQQ", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "SPY", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "AAPL", exact: true })).toHaveCount(0);

  const search = page.getByRole("searchbox", { name: "Search scoped trades" });
  await search.fill("QQQ");
  await expect(page.getByRole("status")).toHaveText("Showing 1 of 2 trades");
  await expect(page.locator(".trade-card:visible")).toHaveCount(1);
  await expect(scopeSummary).toContainText("-$150.00");
  await page.getByRole("button", { name: "Apply scope" }).click();
  await expect(page.locator("#route-announcer")).toHaveText(
    "Trade browser scope applied. Scope contains 2 contributing trades across 2 activity days. Search shows 1 of 2 cards.",
  );
  await page.getByRole("searchbox", { name: "Search scoped trades" }).fill("");

  await page.getByRole("button", { name: "Reports", exact: true }).click();
  await expect(page.locator("[data-plan-check]")).toContainText("8 of 8 trades");
  await expect(page.locator("[data-plan-check]")).toContainText("2 demo accounts");
  await expect(page.locator("[data-setup-performance]")).toContainText("8 of 8 trades");
  await expect(page.locator("[data-setup-performance]")).toContainText("2 demo accounts");

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(page.locator(".trade-card")).toHaveCount(2);
  await expect(scopeSummary).toContainText("-$150.00");

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.locator(".result-card").first()).toContainText("+$310.00");
  await expect(page.locator(".result-card").first()).toContainText("8 trades");
  await expect(page.locator("button[data-calendar-day]")).toHaveCount(2);
  await expect(page.getByText(
    "Account/date filters change this calendar and Trades only; Dashboard totals and governed Reports remain whole-workspace.",
    { exact: false },
  )).toBeVisible();

  await page.getByRole("button", {
    name: /Open Tuesday, July 7, 2026: -\$100\.00 allocation-day P&L/,
  }).click();
  await expect(page.locator(".trade-card")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "SPY", exact: true })).toBeVisible();
  await expect(page.locator("[data-calendar-day-filter]")).toContainText(
    "Demo Swing · Jul 7, 2026–Jul 9, 2026",
  );
  await page.getByRole("searchbox", { name: "Search Jul 7 scoped trades" }).fill("QQQ");
  await expect(page.getByRole("status")).toHaveText("Showing 0 of 1 trade");

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const selectedDay = page.locator('button[data-calendar-day="2026-07-07"]');
  await expect(selectedDay).toHaveAttribute("aria-pressed", "true");
  expect(await selectedDay.evaluate((element) => getComputedStyle(element).boxShadow))
    .not.toBe("none");
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(page.locator(".trade-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Clear day filter" }).click();
  await expect(page.locator(".trade-card")).toHaveCount(2);
  await expect(page.locator(".trade-card:visible")).toHaveCount(1);
  await expect(scopeSummary).toContainText("-$150.00");
  await expect(page.locator("#route-announcer")).toHaveText(
    "Calendar day filter cleared. Retained scope contains 2 trades. Search shows 1 of 2 cards.",
  );

  await page.getByRole("button", { name: "Clear all" }).click();
  await expect(page.locator(".trade-card")).toHaveCount(8);
  await expect(page.getByRole("status")).toHaveText("Showing 8 trades");
  await expect(page.getByRole("combobox", { name: "Account" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Activity from" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Activity through" })).toHaveValue("");

  await page.getByRole("combobox", { name: "Account" }).selectOption("demo-account-swing");
  await page.getByRole("button", { name: "Apply scope" }).click();
  await expect(page.locator(".trade-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Return to my journal" }).click();
  await expect(page.getByRole("heading", { name: "Build your journal" })).toBeVisible();
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(page.locator(".trade-card")).toHaveCount(8);
  await expect(page.getByRole("combobox", { name: "Account" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Activity from" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Activity through" })).toHaveValue("");
  expect(externalRequests).toEqual([]);
});

test("trade scope controls reflow at 320px with 200% text and remain touchable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await startDemo(page);
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  await applySwingRange(page);
  await expect(page.locator("#trade-scope-summary")).toBeInViewport();

  const overflow = await page.evaluate(() => ({
    document: document.documentElement.scrollWidth - window.innerWidth,
    offenders: Array.from(document.querySelectorAll<HTMLElement>(
      "#trade-scope-form, #trade-scope-form *, #trade-scope-summary, #trade-scope-summary *",
    ))
      .map((element) => ({
        tag: element.tagName,
        label: `${element.tagName.toLowerCase()}#${element.id}.${String(element.className)}`,
        own: element.scrollWidth - element.clientWidth,
        right: Math.ceil(element.getBoundingClientRect().right - window.innerWidth),
      }))
      .filter((candidate) => (
        (candidate.tag !== "SELECT" && candidate.own > 1) || candidate.right > 1
      ))
      .slice(0, 20),
  }));
  expect(
    overflow.document,
    `Overflow evidence: ${JSON.stringify(overflow.offenders)}`,
  ).toBeLessThanOrEqual(1);
  expect(overflow.offenders).toEqual([]);

  for (const control of await page.locator(
    "#trade-scope-form button:visible, #trade-scope-form input:visible, #trade-scope-form select:visible",
  ).all()) {
    const box = await control.boundingBox();
    expect(box, "visible scope control should have a layout box").not.toBeNull();
    expect(box?.width ?? 0, "control width").toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, "control height").toBeGreaterThanOrEqual(44);
  }
});

test("activity month controls navigate only months with local allocation evidence", async ({ page }) => {
  await page.addInitScript(
    (key) => window.localStorage.setItem(key, "complete"),
    ONBOARDING_KEY,
  );
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Build your journal" })).toBeVisible();

  const saveExecution = async (input: {
    readonly trigger: "Enter execution" | "Add execution";
    readonly side: "Buy" | "Sell";
    readonly effect: "Open" | "Close";
    readonly price: string;
    readonly executedAt: string;
    readonly establishWorkspace?: boolean;
  }) => {
    await page.getByRole("button", { name: input.trigger, exact: true }).first().click();
    if (input.establishWorkspace === true) {
      await page.locator("#manual-account").fill("Month pager account");
      await page.locator("#manual-time-zone").fill("UTC");
    }
    await page.locator("#manual-symbol").fill("AAPL");
    await page.locator("#manual-side").selectOption({ label: input.side });
    await page.locator("#manual-position-effect").selectOption({ label: input.effect });
    await page.locator("#manual-quantity").fill("1");
    await page.locator("#manual-price").fill(input.price);
    await page.locator("#manual-fee").fill("0");
    await page.locator("#manual-executed-at").fill(input.executedAt);
    await page.getByRole("button", { name: "Review execution" }).click();
    await page.getByRole("button", { name: "Save execution" }).click();
    await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  };

  await saveExecution({
    trigger: "Enter execution",
    side: "Buy",
    effect: "Open",
    price: "100",
    executedAt: "2026-06-30T14:30",
    establishWorkspace: true,
  });
  await saveExecution({
    trigger: "Add execution",
    side: "Sell",
    effect: "Close",
    price: "110",
    executedAt: "2026-07-01T14:30",
  });

  const monthGroup = page.getByRole("group", { name: "Activity month" });
  await expect(monthGroup.getByRole("heading", { name: "June 2026" })).toBeVisible();
  await expect(page.locator("button[data-calendar-day]")).toHaveCount(1);
  await expect(monthGroup.getByRole("button", { name: "Previous activity month" })).toBeDisabled();

  await monthGroup.getByRole("button", { name: "Next activity month" }).click();
  const july = monthGroup.getByRole("heading", { name: "July 2026" });
  await expect(july).toBeFocused();
  await expect(july).toBeInViewport();
  await expect(page.locator("#route-announcer")).toHaveText(
    "Showing July 2026 trading activity.",
  );
  await expect(page.locator("button[data-calendar-day]")).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Open Wednesday, July 1, 2026/ })).toBeVisible();
  await expect(monthGroup.getByRole("button", { name: "Next activity month" })).toBeDisabled();

  await monthGroup.getByRole("button", { name: "Previous activity month" }).click();
  const june = monthGroup.getByRole("heading", { name: "June 2026" });
  await expect(june).toBeFocused();
  await expect(june).toBeInViewport();
  await expect(page.locator("#route-announcer")).toHaveText(
    "Showing June 2026 trading activity.",
  );
  const june30 = page.getByRole("button", { name: /Open Tuesday, June 30, 2026/ });
  await expect(june30).toBeVisible();
  await june30.click();
  const crossMonthNext = page.getByRole("button", {
    name: "Next activity day: Wednesday, July 1, 2026",
  });
  await crossMonthNext.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", {
    name: "Wednesday, July 1, 2026",
  })).toBeFocused();
  await expect(page.locator("#route-announcer")).toContainText(
    "Next activity day. Trades for Wednesday, July 1, 2026.",
  );
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(monthGroup.getByRole("heading", { name: "July 2026" })).toBeVisible();
  await expect(page.locator('button[data-calendar-day="2026-07-01"]'))
    .toHaveAttribute("aria-pressed", "true");
});
