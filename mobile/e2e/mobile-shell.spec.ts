import { expect, test, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

async function startPastOnboarding(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
}

test("first launch stays offline, explains the journal, and persists completion", async ({ page }) => {
  const externalRequests: string[] = [];
  const browserErrors: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });

  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Hermes Journal welcome" });
  const progress = page.getByRole("progressbar", { name: "Welcome progress" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("heading", { name: "See your trading clearly." })).toBeFocused();
  await expect(progress).toHaveAttribute("aria-valuetext", "Step 1 of 3");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Find the patterns." })).toBeFocused();
  await expect(progress).toHaveAttribute("aria-valuetext", "Step 2 of 3");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Private by default." })).toBeFocused();
  await expect(progress).toHaveAttribute("aria-valuetext", "Step 3 of 3");
  await page.getByRole("button", { name: "Explore demo journal" }).click();

  await expect(page.locator("#screen")).toBeFocused();
  await expect(page.locator(".topbar .demo-badge")).toHaveText("DEMO");
  await expect(page.locator("[data-tab]")).toHaveCount(5);
  await expect(page.locator(".equity-line")).toHaveAttribute("points", /0\.0,[\d.]+ 12\.5,[\d.]+/);
  await expect(page.locator("#screen [style]")).toHaveCount(0);
  await expect(page.getByText("RISK BEFORE SIGNAL", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Confirmed bull", { exact: true })).toHaveCount(0);
  for (const tab of ["Trades", "Journal", "Reports", "More", "Dashboard"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
  }
  await expect(page.locator("body")).not.toHaveClass(/modal-open/);
  await page.reload();
  await expect(dialog).toHaveCount(0);
  expect(externalRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test("journal navigation, search, sizing, settings, and touch targets work", async ({ page }) => {
  await startPastOnboarding(page);
  const destinations = [
    ["Dashboard", "Dashboard"],
    ["Trades", "Trades"],
    ["Journal", "Journal"],
    ["Reports", "Reports"],
    ["More", "More"],
  ] as const;

  for (const [tab, heading] of destinations) {
    const tabButton = page.getByRole("button", { name: tab, exact: true });
    await tabButton.click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(tabButton).toHaveAttribute("aria-current", "page");
  }

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  const search = page.getByPlaceholder("Search symbol, setup, or tag");
  await search.fill("Chased entry");
  await expect(page.getByRole("status")).toHaveText("Showing 1 of 8 trades");
  await expect(page.locator(".trade-card:visible")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: "SPY", exact: true })).toBeVisible();
  await search.fill("not-a-trade");
  await expect(page.locator(".trade-card:visible")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "No trades match" })).toBeVisible();
  await search.fill("");
  await expect(page.locator(".trade-card:visible")).toHaveCount(8);

  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.getByRole("button", { name: "Calculate plan" })).toHaveCount(0);
  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByRole("button", { name: "Calculate plan" })).toHaveCount(1);
  await page.getByRole("button", { name: "Calculate plan" }).click();
  await expect(page.getByText("20.00%", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);

  const settingsButton = page.getByRole("button", { name: "Open settings" });
  await settingsButton.click();
  await expect(page.locator(".topbar")).toHaveAttribute("inert", "");
  await expect(page.locator("#screen")).toHaveAttribute("inert", "");
  await expect(page.locator("#screen")).toHaveAttribute("aria-hidden", "true");
  await expect(page.locator(".tabbar")).toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Replay welcome" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Replay welcome" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(settingsButton).toBeFocused();
  await expect(page.locator("#screen")).not.toHaveAttribute("aria-hidden", "true");

  await settingsButton.click();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeHidden();
  await expect(settingsButton).toBeFocused();

  await settingsButton.click();
  await page.getByRole("button", { name: "Replay welcome" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await expect(page.locator("#screen")).toBeFocused();

  for (const control of await page.locator("button:visible, input:visible").all()) {
    const box = await control.boundingBox();
    expect(box, "visible control should have a layout box").not.toBeNull();
    expect(box?.width ?? 0, "control width").toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, "control height").toBeGreaterThanOrEqual(44);
  }
});

test("welcome and settings remain reachable at 200% text in short landscape", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Explore demo journal" })).toBeVisible();
  await page.getByRole("button", { name: "Explore demo journal" }).click();

  for (const tab of ["Dashboard", "Trades", "Journal", "Reports", "More"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    const routeOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(routeOverflow, `${tab} horizontal overflow`).toBeLessThanOrEqual(1);
  }
  await expect(page.locator("html")).toHaveAttribute("data-test-text-scale", "200");
  const fontSizes = await page.evaluate(() => ({
    root: Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
    input: Number.parseFloat(getComputedStyle(document.querySelector("#entry") as Element).fontSize),
  }));
  expect(fontSizes.root).toBeGreaterThanOrEqual(31);
  expect(fontSizes.input).toBeGreaterThanOrEqual(31);

  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay welcome" })).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});
