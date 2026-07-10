import { expect, test, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.mobile.onboarding.v1";

async function startPastOnboarding(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
}

test("first launch stays offline, names each step, and persists completion", async ({ page }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });

  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: "Hermes introduction" });
  const progress = page.getByRole("progressbar", { name: "Introduction progress" });
  await expect(dialog).toBeVisible();
  await expect(progress).toHaveAttribute("aria-valuetext", "Step 1 of 3");
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Continue" })).toBeFocused();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Decision support only." })).toBeFocused();
  await expect(progress).toHaveAttribute("aria-valuetext", "Step 2 of 3");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Explore a frozen sample." })).toBeFocused();
  await expect(progress).toHaveAttribute("aria-valuetext", "Step 3 of 3");
  await page.getByRole("button", { name: "Explore sample" }).click();

  await expect(page.locator("#screen")).toBeFocused();
  await expect(page.locator(".topbar .sample-badge")).toHaveText("SAMPLE");
  await expect(page.locator("body")).not.toHaveClass(/modal-open/);
  await page.reload();
  await expect(dialog).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test("all five tabs, sizing, settings feedback, and touch targets work", async ({ page }) => {
  await startPastOnboarding(page);
  const destinations = [
    ["Today", "Trading dashboard"],
    ["Trades", "Trades"],
    ["Journal", "Journal"],
    ["Insights", "Insights"],
    ["More", "More"],
  ] as const;

  for (const [tab, heading] of destinations) {
    const tabButton = page.getByRole("button", { name: tab, exact: true });
    await tabButton.click();
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expect(tabButton).toHaveAttribute("aria-current", "page");
  }

  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await page.getByRole("button", { name: "Calculate plan" }).click();
  await expect(page.getByText("20.00%", { exact: true })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(1);

  const settingsButton = page.getByRole("button", { name: "Open settings" });
  await settingsButton.click();
  await expect(page.locator("#screen")).toHaveAttribute("inert", "");
  await expect(page.locator("#screen")).toHaveAttribute("aria-hidden", "true");
  await page.getByRole("button", { name: "Connected data status" }).click();
  const status = page.getByRole("status");
  await expect(status).toBeVisible();
  await expect(status).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Replay introduction" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Close settings" })).toBeFocused();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(settingsButton).toBeFocused();
  await expect(page.locator("#screen")).not.toHaveAttribute("aria-hidden", "true");

  await settingsButton.click();
  await page.getByRole("button", { name: "Replay introduction" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Connect data" }).click();
  await expect(page.getByRole("dialog", { name: "Settings" })).toBeVisible();
  await page.getByRole("button", { name: "Close settings" }).click();
  await expect(settingsButton).toBeFocused();

  for (const control of await page.locator("button:visible, input:visible").all()) {
    const box = await control.boundingBox();
    expect(box, "visible control should have a layout box").not.toBeNull();
    expect(box?.width ?? 0, "control width").toBeGreaterThanOrEqual(44);
    expect(box?.height ?? 0, "control height").toBeGreaterThanOrEqual(44);
  }
});

test("onboarding and settings remain reachable at 200% text in short landscape", async ({ page }) => {
  await page.setViewportSize({ width: 568, height: 320 });
  await page.addInitScript(() => {
    document.documentElement.style.fontSize = "200%";
  });
  await page.goto("/");

  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("button", { name: "Explore sample" })).toBeVisible();
  await page.getByRole("button", { name: "Explore sample" }).click();
  await page.getByRole("button", { name: "Open settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Replay introduction" })).toBeVisible();

  const horizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(horizontalOverflow).toBeLessThanOrEqual(1);
});
