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
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true }))
    .toBeVisible();
}

async function seedPreviousTradeState(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await page.getByRole("combobox", { name: "Account" })
    .selectOption("demo-account-swing");
  await page.getByRole("textbox", { name: "Activity from" }).fill("2026-07-07");
  await page.getByRole("textbox", { name: "Activity through" }).fill("2026-07-09");
  await page.getByRole("button", { name: "Apply scope" }).click();
  await page.getByRole("searchbox", { name: "Search scoped trades" }).fill("QQQ");
  await page.locator("#trade-view-filter-summary").click();
  await page.locator("#trade-filter-asset-class").selectOption("etf");
  await page.locator("#trade-filter-direction").selectOption("short");
  await page.locator("#trade-filter-position").selectOption("closed");
  await page.locator("#trade-filter-review").selectOption("completed");
  await page.locator("#trade-filter-setup").selectOption("Reversal");
  await page.getByRole("button", { name: "Reports", exact: true }).click();
}

async function expectPreviousTradeState(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Account" }))
    .toHaveValue("demo-account-swing");
  await expect(page.getByRole("textbox", { name: "Activity from" }))
    .toHaveValue("2026-07-07");
  await expect(page.getByRole("textbox", { name: "Activity through" }))
    .toHaveValue("2026-07-09");
  await expect(page.getByRole("searchbox", { name: "Search scoped trades" }))
    .toHaveValue("qqq");
  await expect(page.locator("#trade-filter-asset-class")).toHaveValue("etf");
  await expect(page.locator("#trade-filter-direction")).toHaveValue("short");
  await expect(page.locator("#trade-filter-position")).toHaveValue("closed");
  await expect(page.locator("#trade-filter-review")).toHaveValue("completed");
  await expect(page.locator("#trade-filter-setup")).toHaveValue("Reversal");
  await expect(page.locator(".trade-card")).toHaveCount(2);
  await expect(page.locator(".trade-card:visible")).toHaveCount(1);
}

async function expectVisibleFailureAndPreviousState(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: "Reports", exact: true }))
    .toBeVisible();
  const status = page.locator("#account-review-coverage-status");
  await expect(status).toBeVisible();
  await expect(status).toBeFocused();
  await expect(status).toHaveText(
    "This account review link is no longer available. No Trade Browser filters changed.",
  );
  await expectPreviousTradeState(page);
}

async function swingCompletedAction(page: Page) {
  const account = page.locator(
    '[data-account-review-coverage-account="demo-account-swing"]',
  );
  await account.locator(":scope > summary").click();
  await expect(account).toHaveAttribute("open", "");
  return page.getByRole("button", {
    name: "Open Demo Swing completed reviews in Trades, account 2 of 2",
  });
}

test("account review action opens its exact closed cohort and clears conflicting state", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  await startDemo(page);
  await seedPreviousTradeState(page);
  const storageBefore = await page.evaluate(() => JSON.stringify(localStorage));

  const action = await swingCompletedAction(page);
  await action.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Trades", exact: true }))
    .toBeVisible();
  await expect(page.getByRole("button", { name: "Trades", exact: true }))
    .toHaveAttribute("aria-current", "page");
  await expect(page.locator("#trade-view-filter-summary")).toBeFocused();
  await expect(page.getByRole("combobox", { name: "Account" }))
    .toHaveValue("demo-account-swing");
  await expect(page.getByRole("textbox", { name: "Activity from" })).toHaveValue("");
  await expect(page.getByRole("textbox", { name: "Activity through" })).toHaveValue("");
  await expect(page.getByRole("searchbox", { name: "Search scoped trades" }))
    .toHaveValue("");
  await expect(page.locator("#trade-filter-asset-class")).toHaveValue("all");
  await expect(page.locator("#trade-filter-direction")).toHaveValue("all");
  await expect(page.locator("#trade-filter-position")).toHaveValue("closed");
  await expect(page.locator("#trade-filter-review")).toHaveValue("completed");
  await expect(page.locator("#trade-filter-setup")).toHaveValue("");
  await expect(page.locator("#trade-filter-mistake")).toHaveValue("");
  await expect(page.locator("#trade-filter-emotion")).toHaveValue("");
  await expect(page.locator("#trade-filter-tag")).toHaveValue("");
  await expect(page.locator("#trade-filter-playbook")).toHaveValue("");
  await expect(page.locator("[data-trade-filter-disclosure]")).toHaveAttribute("open", "");
  await expect(page.locator("[data-trade-view-filter-count]"))
    .toHaveText("· 2 active filters");
  await expect(page.locator(".trade-card")).toHaveCount(3);
  await expect(page.locator(".trade-card:visible")).toHaveCount(3);
  expect(await page.locator(".trade-card:visible").evaluateAll((cards) => (
    cards.map((card) => (card as HTMLElement).dataset.tradeSubject ?? "").sort()
  ))).toEqual([
    "demo-subject-qqq",
    "demo-subject-spy",
    "demo-subject-tsla",
  ]);
  await expect(page.locator("#trade-count")).toHaveText("Showing 3 of 3 trades");
  await expect(page.locator("#trade-scope-summary")).toContainText(
    "Demo Swing · All activity dates",
  );
  await expect(page.locator("#route-announcer")).toHaveText(
    "Opened Demo Swing completed reviews in Trades. 3 of 3 current trades. Temporary dates, day, search, and other card filters were cleared.",
  );
  expect(await page.evaluate(() => JSON.stringify(localStorage))).toBe(storageBefore);
  expect(externalRequests).toEqual([]);
});

test("a noncanonical account cohort count fails visibly and preserves prior filters", async ({
  page,
}) => {
  await startDemo(page);
  await seedPreviousTradeState(page);
  const action = await swingCompletedAction(page);
  await action.evaluate((element) => {
    const button = element as HTMLButtonElement;
    button.dataset.accountReviewCoverageCount = "03";
    button.click();
  });

  await expectVisibleFailureAndPreviousState(page);
});

test("a replaced account cohort action fails visibly instead of becoming inert", async ({
  page,
}) => {
  await startDemo(page);
  await seedPreviousTradeState(page);
  const action = await swingCompletedAction(page);
  await action.evaluate((element) => {
    element.replaceWith(element.cloneNode(true));
  });

  await page.getByRole("button", {
    name: "Open Demo Swing completed reviews in Trades, account 2 of 2",
  }).click();
  await expectVisibleFailureAndPreviousState(page);
});

test("a cloned account cohort action fails visibly instead of bypassing cardinality", async ({
  page,
}) => {
  await startDemo(page);
  await seedPreviousTradeState(page);
  const action = await swingCompletedAction(page);
  await action.evaluate((element) => {
    element.after(element.cloneNode(true));
  });
  const actions = page.getByRole("button", {
    name: "Open Demo Swing completed reviews in Trades, account 2 of 2",
  });
  await expect(actions).toHaveCount(2);
  await actions.nth(1).click();

  await expectVisibleFailureAndPreviousState(page);
});

test("a destination verification failure restores the prior tab and exact browser state", async ({
  page,
}) => {
  await startDemo(page);
  await seedPreviousTradeState(page);
  const action = await swingCompletedAction(page);
  await page.evaluate(() => {
    const app = document.querySelector("#app");
    if (app === null) throw new Error("Missing app root.");
    const original = Element.prototype.querySelectorAll;
    Element.prototype.querySelectorAll = function patchedQuerySelectorAll(
      selectors: string,
    ): NodeListOf<Element> {
      if (this === app && selectors === "#trade-view-filter-summary") {
        Element.prototype.querySelectorAll = original;
        return original.call(this, "#missing-account-review-destination");
      }
      return original.call(this, selectors);
    };
  });
  await action.click();

  await expectVisibleFailureAndPreviousState(page);
});

for (const destinationFailure of ["duplicate", "hidden", "focus"] as const) {
  test(`a ${destinationFailure} destination failure restores the prior tab and exact browser state`, async ({
    page,
  }) => {
    await startDemo(page);
    await seedPreviousTradeState(page);
    const action = await swingCompletedAction(page);
    await page.evaluate((failure) => {
      const app = document.querySelector("#app");
      if (app === null) throw new Error("Missing app root.");
      if (failure === "focus") {
        const originalFocus = HTMLElement.prototype.focus;
        HTMLElement.prototype.focus = function patchedFocus(
          options?: FocusOptions,
        ): void {
          if (this.id === "trade-view-filter-summary") {
            HTMLElement.prototype.focus = originalFocus;
            return;
          }
          originalFocus.call(this, options);
        };
        return;
      }
      const originalQuery = Element.prototype.querySelectorAll;
      Element.prototype.querySelectorAll = function patchedQuerySelectorAll(
        selectors: string,
      ): NodeListOf<Element> {
        if (this === app && selectors === "#trade-view-filter-summary") {
          Element.prototype.querySelectorAll = originalQuery;
          const initial = originalQuery.call(this, selectors);
          const summary = initial[0] as HTMLElement | undefined;
          if (summary === undefined) throw new Error("Missing destination summary.");
          if (failure === "duplicate") summary.after(summary.cloneNode(true));
          else summary.style.display = "none";
          return originalQuery.call(this, selectors);
        }
        return originalQuery.call(this, selectors);
      };
    }, destinationFailure);
    await action.click();

    await expectVisibleFailureAndPreviousState(page);
  });
}
