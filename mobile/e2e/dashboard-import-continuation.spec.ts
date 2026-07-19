import { expect, test, type Locator, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

async function startEmptyJournal(page: Page): Promise<void> {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, "complete");
  }, ONBOARDING_KEY);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Build your journal" })).toBeVisible();
}

async function importClosedSession(
  page: Page,
  sourceName = "latest-session.csv",
): Promise<void> {
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "session-in,AAPL,BTO,1,100,0,USD,2026-07-18T14:30:00Z",
    "session-out,AAPL,STC,1,105,0,USD,2026-07-18T15:00:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: sourceName,
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(page.getByRole("heading", { name: "Ready to import" })).toBeFocused();
  await page.getByRole("button", { name: "Import 2 executions" }).click();
  await expect(page.getByRole("heading", { name: "More", exact: true })).toBeVisible();
}

async function storageSnapshot(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(window.localStorage)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, window.localStorage.getItem(key) ?? ""]),
  ));
}

async function expectUnobscured(
  target: Locator,
  width: number,
  requireWholeTarget = true,
  requireFocusRing = true,
) {
  const geometry = await target.evaluate(async (element) => {
    await document.fonts.ready;
    const bounds = element.getBoundingClientRect();
    const fixedBoundary = (
      candidate: HTMLElement | null,
      edge: "top" | "bottom",
    ): number | null => {
      if (candidate === null) return null;
      const position = window.getComputedStyle(candidate).position;
      if (position !== "fixed" && position !== "sticky") return null;
      const box = candidate.getBoundingClientRect();
      return edge === "top" && box.bottom > 0
        ? box.bottom
        : edge === "bottom" && box.top < window.innerHeight
          ? box.top
          : null;
    };
    const style = window.getComputedStyle(element);
    return {
      top: bounds.top,
      bottom: bounds.bottom,
      height: bounds.height,
      topBoundary: fixedBoundary(document.querySelector(".topbar"), "top") ?? 0,
      bottomBoundary: fixedBoundary(document.querySelector(".tabbar"), "bottom")
        ?? window.innerHeight,
      outlineStyle: style.outlineStyle,
      outlineWidth: Number.parseFloat(style.outlineWidth),
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    };
  });
  expect(geometry.top, `${width}px target top`).toBeGreaterThanOrEqual(
    geometry.topBoundary - 1,
  );
  if (requireWholeTarget) {
    expect(geometry.bottom, `${width}px target bottom`).toBeLessThanOrEqual(
      geometry.bottomBoundary + 1,
    );
  }
  expect(geometry.overflow, `${width}px horizontal overflow`).toBeLessThanOrEqual(1);
  if (requireFocusRing) {
    expect(geometry.outlineStyle).not.toBe("none");
    expect(geometry.outlineStyle).not.toBe("hidden");
    expect(geometry.outlineWidth).toBeGreaterThanOrEqual(1);
  }
  return geometry;
}

async function instrumentNoFileReads(page: Page): Promise<void> {
  await page.evaluate(() => {
    const observed = document.documentElement;
    observed.dataset.dashboardImportFileReads = "0";
    const originalText = File.prototype.text;
    File.prototype.text = function text(): Promise<string> {
      observed.dataset.dashboardImportFileReads = String(
        Number(observed.dataset.dashboardImportFileReads ?? "0") + 1,
      );
      return originalText.call(this);
    };
  });
}

type NextScreenMutation =
  | "move-import-tool"
  | "move-import-form"
  | "duplicate-import-tool"
  | "remove-import-status"
  | "disable-import-preview"
  | "move-confirmed-recovery"
  | "disable-confirmed-retry"
  | "inject-confirmed-manual-action";

async function mutateNextScreenRender(
  page: Page,
  mutation: NextScreenMutation,
): Promise<void> {
  await page.evaluate((requested) => {
    const descriptor = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
    const getter = descriptor?.get;
    const setter = descriptor?.set;
    if (descriptor === undefined || getter === undefined || setter === undefined) {
      throw new Error("Element.innerHTML is not instrumentable.");
    }
    const recoveryMutation = requested === "move-confirmed-recovery"
      || requested === "disable-confirmed-retry"
      || requested === "inject-confirmed-manual-action";
    const expectedMarker = recoveryMutation
      ? 'data-import-receipt-review-failure-origin="confirmed-post-commit"'
      : "data-import-tool";
    Object.defineProperty(Element.prototype, "innerHTML", {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get: getter,
      set(this: Element, value: string) {
        setter.call(this, value);
        if (this.id !== "screen" || !value.includes(expectedMarker)) return;
        Object.defineProperty(Element.prototype, "innerHTML", descriptor);
        const shell = document.querySelector<HTMLElement>(".app-shell");
        if (recoveryMutation) {
          const recovery = this.querySelector<HTMLElement>(
            '[data-import-receipt-review-failure-origin="confirmed-post-commit"]',
          );
          if (recovery === null) throw new Error("Expected a confirmed recovery.");
          if (requested === "move-confirmed-recovery") {
            if (shell === null) throw new Error("Expected the application shell.");
            shell.append(recovery);
          } else if (requested === "disable-confirmed-retry") {
            const retry = recovery.querySelector<HTMLButtonElement>(
              "button[data-import-receipt-review-retry]",
            );
            if (retry === null) throw new Error("Expected a recovery retry.");
            retry.disabled = true;
          } else {
            const exportCard = this.querySelector<HTMLElement>(".user-data-export");
            if (exportCard === null) throw new Error("Expected a read-only export card.");
            const rogueAction = document.createElement("button");
            rogueAction.type = "button";
            rogueAction.dataset.manualExecution = "";
            rogueAction.textContent = "Injected manual capture";
            exportCard.append(rogueAction);
          }
          return;
        }
        const tool = this.querySelector<HTMLElement>("[data-import-tool]");
        if (tool === null) throw new Error("Expected an import tool to mutate.");
        if (requested === "move-import-tool") {
          if (shell === null) throw new Error("Expected the application shell.");
          shell.append(tool);
        } else if (requested === "move-import-form") {
          const form = tool.querySelector<HTMLFormElement>("#csv-import-form");
          if (form === null || shell === null) throw new Error("Expected an import form.");
          shell.append(form);
        } else if (requested === "duplicate-import-tool") {
          tool.after(tool.cloneNode(true));
        } else if (requested === "remove-import-status") {
          const status = tool.querySelector<HTMLElement>("#import-status");
          if (status === null) throw new Error("Expected the import status destination.");
          status.remove();
        } else {
          const preview = tool.querySelector<HTMLButtonElement>(
            "button[data-import-preview-submit]",
          );
          if (preview === null) throw new Error("Expected the import preview action.");
          preview.disabled = true;
        }
      },
    });
  }, mutation);
}

async function expectDashboardContinuationFailure(page: Page): Promise<void> {
  const error = page.locator("[data-dashboard-import-continuation-error]");
  await expect(error).toBeFocused();
  await expect(error).toHaveText(
    "Hermes could not safely open the exact import step. Nothing was read or saved. Refresh Dashboard and try again.",
  );
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.locator("#route-announcer")).toHaveText(
    "The exact import step was unavailable. Nothing was read or saved.",
  );
}

test("Dashboard restores the recurring import job offline without reading a file at 320 and 421px", async ({ page, context }) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== BASE_ORIGIN) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 320, height: 568 });
  await startEmptyJournal(page);
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  await expect(page.locator("[data-dashboard-import-continuation]")).toHaveCount(0);
  await expect(page.locator("[data-import-tool]")).toHaveCount(1);

  await importClosedSession(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const storageBefore = await storageSnapshot(page);
  await instrumentNoFileReads(page);
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);

  for (const width of [320, 421]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 780 });
    const action = page.getByRole("button", { name: "Import latest session" });
    await expect(action).toHaveCount(1);
    await action.focus();
    const actionGeometry = await expectUnobscured(action, width, true, false);
    expect(actionGeometry.height).toBeGreaterThanOrEqual(44);
    if (width === 320) await page.keyboard.press("Enter");
    else await action.click();

    const heading = page.getByRole("heading", { name: "Import executions" });
    await expect(heading).toBeFocused();
    await expectUnobscured(heading, width);
    await expect(page.locator("#route-announcer")).toHaveText(
      "Import latest session opened. Choose an account and CSV; nothing is read until Preview CSV.",
    );
    await expect(page.locator("#import-file")).toHaveValue("");
    expect(await page.evaluate(() => (
      document.documentElement.dataset.dashboardImportFileReads
    ))).toBe("0");
    expect(await storageSnapshot(page)).toEqual(storageBefore);

    if (width === 320) {
      await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    }
  }

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await expect(page.locator("[data-dashboard-import-continuation]")).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});

test("Dashboard import continuation fails closed for replaced or moved origins and incomplete destinations", async ({ page }) => {
  await startEmptyJournal(page);
  await importClosedSession(page);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await instrumentNoFileReads(page);
  const storageBefore = await storageSnapshot(page);

  const repeatedAction = page.getByRole("button", { name: "Import latest session" });
  await repeatedAction.evaluate((button) => {
    (button as HTMLButtonElement).click();
    (button as HTMLButtonElement).click();
  });
  await expect(page.getByRole("heading", { name: "Import executions" })).toBeFocused();
  await expect(page.locator("[data-import-tool]")).toHaveCount(1);
  await page.getByRole("button", { name: "Dashboard", exact: true }).click();

  const movedAction = page.getByRole("button", { name: "Import latest session" });
  await movedAction.evaluate((button) => {
    document.querySelector("#screen")?.append(button);
  });
  await movedAction.click();
  await expectDashboardContinuationFailure(page);

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const replacementAction = page.getByRole("button", { name: "Import latest session" });
  await replacementAction.evaluate((button) => {
    const replacement = button.cloneNode(true) as HTMLButtonElement;
    replacement.removeAttribute("data-dashboard-import-action");
    button.replaceWith(replacement);
  });
  await page.getByRole("button", { name: "Import latest session" }).click();
  await expectDashboardContinuationFailure(page);

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const clonedCardAction = page.getByRole("button", { name: "Import latest session" });
  await clonedCardAction.evaluate((button) => {
    const card = button.closest<HTMLElement>("[data-dashboard-import-continuation]");
    if (card === null) throw new Error("Expected an import continuation card.");
    card.replaceWith(card.cloneNode(true));
  });
  await page.getByRole("button", { name: "Import latest session" }).click();
  await expectDashboardContinuationFailure(page);

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const wholeCardAction = page.getByRole("button", { name: "Import latest session" });
  await wholeCardAction.evaluate((button) => {
    const card = button.closest<HTMLElement>("[data-dashboard-import-continuation]");
    const shell = document.querySelector<HTMLElement>(".app-shell");
    if (card === null || shell === null) throw new Error("Expected an import continuation card.");
    shell.append(card);
  });
  await wholeCardAction.click();
  await expectDashboardContinuationFailure(page);
  await expect(page.locator(".app-shell > [data-dashboard-import-continuation]")).toHaveCount(0);

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  const movedPairAction = page.getByRole("button", { name: "Import latest session" });
  await movedPairAction.evaluate((button) => {
    const card = button.closest<HTMLElement>("[data-dashboard-import-continuation]");
    const progress = document.querySelector<HTMLElement>("[data-dashboard-review-progress]");
    const metrics = document.querySelector<HTMLElement>(".metric-grid");
    if (card === null || progress === null || metrics === null) {
      throw new Error("Expected the canonical Dashboard import chain.");
    }
    metrics.after(progress, card);
  });
  await movedPairAction.click();
  await expectDashboardContinuationFailure(page);

  for (const mutation of [
    "move-import-tool",
    "move-import-form",
    "remove-import-status",
    "disable-import-preview",
    "duplicate-import-tool",
  ] as const) {
    await page.getByRole("button", { name: "Dashboard", exact: true }).click();
    await mutateNextScreenRender(page, mutation);
    await page.getByRole("button", { name: "Import latest session" }).click();
    await expectDashboardContinuationFailure(page);
    await expect(page.locator("[data-import-tool]")).toHaveCount(0);
    await expect(page.locator("#csv-import-form")).toHaveCount(0);
  }

  expect(await page.evaluate(() => (
    document.documentElement.dataset.dashboardImportFileReads
  ))).toBe("0");
  expect(await storageSnapshot(page)).toEqual(storageBefore);
});

test("Dashboard routes a confirmed commit only to receipt recovery", async ({ page }) => {
  await page.setViewportSize({ width: 421, height: 780 });
  await startEmptyJournal(page);
  await page.evaluate(() => {
    document.documentElement.dataset.testTextScale = "200";
  });
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "saved-in,SOFI,BTO,1,25,0,USD,2026-07-18T14:30:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "saved-session.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Phone broker");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await expect(page.getByRole("heading", { name: "Ready to import" })).toBeFocused();
  await instrumentNoFileReads(page);

  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(
      Intl.DateTimeFormat.prototype,
      "formatToParts",
    );
    const original = descriptor?.value as (
      (this: Intl.DateTimeFormat, date?: Date | number) => Intl.DateTimeFormatPart[]
    ) | undefined;
    if (descriptor === undefined || original === undefined) {
      throw new Error("Intl.DateTimeFormat.prototype.formatToParts is not instrumentable.");
    }
    Object.defineProperty(Intl.DateTimeFormat.prototype, "formatToParts", {
      ...descriptor,
      value(this: Intl.DateTimeFormat) {
        Object.defineProperty(
          Intl.DateTimeFormat.prototype,
          "formatToParts",
          descriptor,
        );
        throw new Error("Injected post-commit receipt projection failure.");
      },
    });
  });
  await page.getByRole("button", { name: "Import 1 execution" }).click();
  const recovery = page.locator("[data-import-receipt-review-failure]");
  const recoveryHeading = recovery.getByRole("heading", {
    name: "Import saved; review for saved-session.csv needs attention",
  });
  await expect(recoveryHeading).toBeFocused();
  await expect(page.locator("#csv-import-form")).toHaveCount(0);
  await expect(page.locator("[data-manual-capture-card]")).toHaveCount(0);
  await expect(page.locator("[data-import-tool]")).toHaveCount(0);
  await expect(page.locator(".import-receipt, .import-history-row")).toHaveCount(0);
  await expect(page.locator("[data-review-import-receipt]")).toHaveCount(0);
  await expect(page.locator("[data-rollback-receipt]")).toHaveCount(0);
  await expect(page.locator("#user-data-restore-form")).toHaveCount(0);
  await expect(page.locator("#user-data-restore-file")).toHaveCount(0);
  await expect(page.locator("#user-data-restore-commit")).toHaveCount(0);
  await expect(page.locator("#sizing-form")).toHaveCount(0);

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("button", { name: "Import latest session" })).toHaveCount(0);
  const finish = page.getByRole("button", { name: "Finish saved import" });
  await expect(finish).toHaveCount(1);
  await finish.focus();
  const actionGeometry = await expectUnobscured(finish, 421, true, false);
  expect(actionGeometry.height).toBeGreaterThanOrEqual(44);
  const storageBeforeRecovery = await storageSnapshot(page);
  await mutateNextScreenRender(page, "move-confirmed-recovery");
  await page.keyboard.press("Enter");

  await expectDashboardContinuationFailure(page);
  await expect(page.locator(".app-shell > [data-import-receipt-review-failure]")).toHaveCount(0);
  await expect(page.locator("#csv-import-form, #user-data-restore-form")).toHaveCount(0);
  expect(await storageSnapshot(page)).toEqual(storageBeforeRecovery);

  await mutateNextScreenRender(page, "disable-confirmed-retry");
  await page.getByRole("button", { name: "Finish saved import" }).click();
  await expectDashboardContinuationFailure(page);
  expect(await storageSnapshot(page)).toEqual(storageBeforeRecovery);

  await mutateNextScreenRender(page, "inject-confirmed-manual-action");
  await page.getByRole("button", { name: "Finish saved import" }).click();
  await expectDashboardContinuationFailure(page);
  await expect(page.locator("[data-manual-execution]")).toHaveCount(0);
  expect(await storageSnapshot(page)).toEqual(storageBeforeRecovery);

  await page.getByRole("button", { name: "Finish saved import" }).click();

  await expect(recoveryHeading).toBeFocused();
  await expectUnobscured(recoveryHeading, 421);
  await expect(page.locator("#csv-import-form")).toHaveCount(0);
  await expect(page.locator("#import-file")).toHaveCount(0);
  await expect(page.locator("#route-announcer")).toHaveText(
    "Saved import recovery opened. Do not import the CSV again; retry only its exact receipt continuation.",
  );
  expect(await page.evaluate(() => (
    document.documentElement.dataset.dashboardImportFileReads
  ))).toBe("0");
  expect(await storageSnapshot(page)).toEqual(storageBeforeRecovery);
});
