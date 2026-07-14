import { expect, test, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

async function installPreferenceFailures(
  page: Page,
  failureCount: number,
  privateDetail: string,
): Promise<void> {
  await page.addInitScript(
    ({ onboardingKey, counterKey, failures, detail }) => {
      const originalGet = Storage.prototype.getItem;
      const originalSet = Storage.prototype.setItem;
      originalSet.call(window.localStorage, onboardingKey, "complete");
      Storage.prototype.getItem = function getItem(key: string): string | null {
        if (this === window.localStorage && key === onboardingKey) {
          const prior = Number.parseInt(
            originalGet.call(window.sessionStorage, counterKey) ?? "0",
            10,
          );
          if (prior < failures) {
            originalSet.call(window.sessionStorage, counterKey, String(prior + 1));
            throw new Error(detail);
          }
        }
        return originalGet.call(this, key);
      };
    },
    {
      onboardingKey: ONBOARDING_KEY,
      counterKey: "hermes.test.startup-failure-count",
      failures: failureCount,
      detail: privateDetail,
    },
  );
}

function trackExternalRequests(page: Page): string[] {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  return externalRequests;
}

async function retryStartup(page: Page): Promise<void> {
  const navigation = page.waitForEvent(
    "framenavigated",
    (frame) => frame === page.mainFrame(),
  );
  await page.getByRole("button", { name: "Try opening again" }).click();
  await navigation;
  await page.waitForLoadState("load");
}

test("a transient startup failure closes safely and reloads the same local journal", async ({
  page,
}) => {
  const privateDetail = "PRIVATE_NATIVE_PATH_SHOULD_NEVER_RENDER";
  const externalRequests = trackExternalRequests(page);
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") browserErrors.push(message.text());
  });
  await installPreferenceFailures(page, 1, privateDetail);

  await page.goto("/");

  const root = page.locator("#app");
  const title = page.getByRole("heading", { name: "Hermes couldn’t open your journal" });
  const alert = page.getByRole("alert");
  const retry = page.getByRole("button", { name: "Try opening again" });
  await expect(root).toHaveAttribute("data-startup-state", "failed");
  await expect(root).toHaveAttribute("aria-busy", "false");
  await expect(title).toBeFocused();
  await expect(alert).toContainText("No fallback journal was opened");
  await expect(page.getByText(privateDetail, { exact: false })).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open settings" })).toHaveCount(0);
  await expect(page.locator("body")).not.toHaveClass(/modal-open/);
  const retryBox = await retry.boundingBox();
  expect(retryBox).not.toBeNull();
  expect(retryBox?.width ?? 0).toBeGreaterThanOrEqual(44);
  expect(retryBox?.height ?? 0).toBeGreaterThanOrEqual(44);

  await retryStartup(page);

  await expect(root).toHaveAttribute("data-startup-state", "ready");
  await expect(root).not.toHaveAttribute("aria-busy");
  await expect(page.getByRole("heading", { name: "Build your journal" })).toBeVisible();
  await expect(page.locator("#screen")).toBeFocused();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(1);
  await expect(page.getByText(privateDetail, { exact: false })).toHaveCount(0);
  expect(externalRequests).toEqual([]);
  expect(browserErrors).toEqual([]);
});

test("repeated startup failure stays singular, keyboard reachable, and reflows at 320px and 200%", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const privateDetail = "PRIVATE_" + "UNBROKEN_NATIVE_DETAIL_".repeat(24);
  const externalRequests = trackExternalRequests(page);
  await installPreferenceFailures(page, 2, privateDetail);
  await page.goto("/");
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });

  const title = page.getByRole("heading", { name: "Hermes couldn’t open your journal" });
  const retry = page.getByRole("button", { name: "Try opening again" });
  await expect(title).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(retry).toHaveCount(1);
  await expect(page.getByText(privateDetail, { exact: false })).toHaveCount(0);
  const dimensions = await page.locator(".startup-card").evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const offenders = Array.from(element.querySelectorAll<HTMLElement>("*"))
      .filter((candidate) => candidate.getClientRects().length > 0)
      .map((candidate) => ({
        element: candidate.tagName.toLowerCase()
          + (candidate.id.length > 0 ? "#" + candidate.id : ""),
        left: candidate.getBoundingClientRect().left,
        right: candidate.getBoundingClientRect().right,
      }))
      .filter((candidate) => (
        candidate.left < bounds.left - 1 || candidate.right > bounds.right + 1
      ));
    const button = element.querySelector<HTMLButtonElement>("#startup-retry");
    return {
      documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
      cardOverflow: element.scrollWidth - element.clientWidth,
      offenders,
      retryWidth: button?.getBoundingClientRect().width ?? 0,
      retryHeight: button?.getBoundingClientRect().height ?? 0,
    };
  });
  expect(dimensions.documentOverflow, JSON.stringify(dimensions)).toBeLessThanOrEqual(1);
  expect(dimensions.cardOverflow, JSON.stringify(dimensions)).toBeLessThanOrEqual(1);
  expect(dimensions.offenders).toEqual([]);
  expect(dimensions.retryWidth).toBeGreaterThanOrEqual(44);
  expect(dimensions.retryHeight).toBeGreaterThanOrEqual(44);

  await page.keyboard.press("Tab");
  await expect(retry).toBeFocused();
  const secondNavigation = page.waitForEvent(
    "framenavigated",
    (frame) => frame === page.mainFrame(),
  );
  await page.keyboard.press("Enter");
  await secondNavigation;
  await page.waitForLoadState("load");

  await expect(title).toBeFocused();
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Try opening again" })).toHaveCount(1);
  await retryStartup(page);
  await expect(page.locator("#app")).toHaveAttribute("data-startup-state", "ready");
  await expect(page.locator("#screen")).toBeFocused();
  expect(externalRequests).toEqual([]);
});
