import { expect, test, type Locator, type Page, type Request } from "@playwright/test";

const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

async function startEmptyJournal(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Build your journal" })).toBeVisible();
}

async function reviewManualExecution(
  page: Page,
  input: {
    readonly side: "Buy" | "Sell";
    readonly effect: "Open" | "Close";
    readonly price: string;
    readonly executedAt: string;
  },
): Promise<void> {
  await page.locator("#manual-symbol").fill("AAPL");
  await page.locator("#manual-side").selectOption({ label: input.side });
  await page.locator("#manual-position-effect").selectOption({ label: input.effect });
  await page.locator("#manual-quantity").fill("2");
  await page.locator("#manual-price").fill(input.price);
  await page.locator("#manual-fee").fill("1");
  await page.locator("#manual-executed-at").fill(input.executedAt);
  await page.getByRole("button", { name: "Review execution" }).click();
  await expect(page.getByRole("heading", { name: "Review before saving" })).toBeVisible();
  await expect(page.getByText("AAPL · STOCK", { exact: true })).toBeVisible();
  await expect(page.getByText(`${input.side.toUpperCase()} · ${input.effect.toUpperCase()}`, {
    exact: true,
  })).toBeVisible();
}

async function fillInvalidManualExecution(page: Page): Promise<void> {
  await page.locator("#manual-account").fill("Primary brokerage");
  await page.locator("#manual-symbol").fill("AAPL");
  await page.locator("#manual-quantity").fill("1");
  await page.locator("#manual-price").fill("1e2");
  await page.locator("#manual-executed-at").fill("2026-07-09T14:30");
}

async function localStorageSnapshot(page: Page): Promise<Record<string, string>> {
  return page.evaluate(() => Object.fromEntries(
    Object.keys(window.localStorage)
      .sort((left, right) => left.localeCompare(right))
      .map((key) => [key, window.localStorage.getItem(key) ?? ""]),
  ));
}

async function expectControlWithinSheet(control: Locator): Promise<void> {
  const geometry = await control.evaluate((element) => {
    const sheet = element.closest<HTMLElement>(".manual-entry-sheet");
    if (sheet === null) throw new Error("The manual-entry sheet is missing.");
    return {
      control: element.getBoundingClientRect(),
      sheet: sheet.getBoundingClientRect(),
    };
  });
  expect(geometry.control.top).toBeGreaterThanOrEqual(geometry.sheet.top);
  expect(geometry.control.bottom).toBeLessThanOrEqual(geometry.sheet.bottom);
}

test("manual entry creates exact fills, a closed trade, and no phantom import receipt", async ({ page }) => {
  await startEmptyJournal(page);
  const trigger = page.getByRole("button", { name: "Enter execution" });
  await trigger.click();
  await expect(page.getByRole("heading", { name: "Add execution" })).toBeFocused();
  await expect(page.locator("#screen")).toHaveAttribute("inert", "");
  await page.locator("#manual-account").fill("Primary brokerage");
  await page.locator("#manual-time-zone").fill("UTC");
  await reviewManualExecution(page, {
    side: "Buy",
    effect: "Open",
    price: "100",
    executedAt: "2026-07-09T14:30",
  });
  const pendingSuccess = await page.getByRole("button", { name: "Save execution" })
    .evaluate((element) => {
      const button = element as HTMLButtonElement;
      button.click();
      const backdrop = document.querySelector<HTMLElement>("#manual-entry");
      const sheet = document.querySelector<HTMLElement>(".manual-entry-sheet");
      backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      sheet?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return {
        connected: backdrop?.isConnected ?? false,
        busy: sheet?.getAttribute("aria-busy"),
      };
    });
  expect(pendingSuccess).toEqual({ connected: true, busy: "true" });

  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.locator("#route-announcer")).toHaveText(
    "Buy execution for AAPL saved on device.",
  );
  await expect(page.locator("#screen")).toBeFocused();
  await page.getByRole("button", { name: "Add execution" }).click();
  await expect(page.locator("#manual-account")).toHaveValue("Primary brokerage");
  await expect(page.locator("#manual-time-zone")).toHaveAttribute("readonly", "");
  await expect(page.locator("#manual-currency")).toHaveAttribute("readonly", "");
  await reviewManualExecution(page, {
    side: "Sell",
    effect: "Close",
    price: "110",
    executedAt: "2026-07-09T15:30",
  });
  await page.getByRole("button", { name: "Save execution" }).click();

  await expect(page.getByText("+$18.00", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("1 trade with realized P&L", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(page.getByRole("heading", { name: "AAPL", exact: true })).toBeVisible();
  await expect(page.locator(".trade-card").getByText("+$18.00", { exact: true }))
    .toBeVisible();

  await page.getByRole("button", { name: "More", exact: true }).click();
  await expect(page.getByText("LATEST IMPORT RECEIPT", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Import history" })).toHaveCount(0);
  await expect(page.getByText(
    "Manual fills remain independent facts; CSV imports also create reversible receipts.",
    { exact: false },
  )).toBeVisible();
});

test("manual save blocks every dismissal path while the ledger transaction is pending", async ({ page }) => {
  await startEmptyJournal(page);
  await page.getByRole("button", { name: "Enter execution" }).click();
  await page.locator("#manual-account").fill("Primary brokerage");
  await reviewManualExecution(page, {
    side: "Sell",
    effect: "Close",
    price: "110",
    executedAt: "2026-07-09T15:30",
  });

  const pendingState = await page.locator("#manual-save").evaluate((element) => {
    const button = element as HTMLButtonElement;
    button.click();
    const backdrop = document.querySelector<HTMLElement>("#manual-entry");
    const sheet = document.querySelector<HTMLElement>(".manual-entry-sheet");
    backdrop?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    sheet?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return {
      connected: backdrop?.isConnected ?? false,
      busy: sheet?.getAttribute("aria-busy"),
      closeDisabled: Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-manual-close]"),
      ).every((candidate) => candidate.disabled),
    };
  });
  expect(pendingState).toEqual({ connected: true, busy: "true", closeDisabled: true });
  await expect(page.getByRole("dialog", { name: "Add execution" })).toBeVisible();
  await expect(page.locator("#manual-save-error")).toContainText(
    "CLOSE execution cannot act on a flat position",
  );
  await expect(page.locator(".manual-entry-sheet")).toHaveAttribute("aria-busy", "false");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add execution" })).toHaveCount(0);
});

test("manual entry validates before review and Escape restores focus without writing", async ({ page }) => {
  await startEmptyJournal(page);
  const trigger = page.getByRole("button", { name: "Enter execution" });
  await trigger.click();
  await fillInvalidManualExecution(page);
  const storageBefore = await localStorageSnapshot(page);
  await page.getByRole("button", { name: "Review execution" }).click();
  const error = page.locator("#manual-entry-error");
  await expect(error).toContainText("signs and exponents are not supported");
  await expect(error).toHaveAttribute("tabindex", "-1");
  await expect(error).toBeFocused();
  await expect(page.locator("#manual-entry-form")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save execution" })).toBeHidden();
  expect(await localStorageSnapshot(page)).toEqual(storageBefore);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add execution" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("heading", { name: "Build your journal" })).toBeVisible();
});

test("manual preparation feedback owns visible in-sheet focus at 200% text", async ({ page }) => {
  for (const width of [320, 421]) {
    await page.setViewportSize({ width, height: 568 });
    await startEmptyJournal(page);
    await page.evaluate(() => {
      document.documentElement.dataset.testTextScale = "200";
    });
    const trigger = page.getByRole("button", { name: "Enter execution" });
    await trigger.click();
    await fillInvalidManualExecution(page);
    const authoredValues = await page.locator("#manual-entry-form").evaluate((form) => (
      Object.fromEntries(Array.from(
        form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"),
        (control) => [control.id, control.value],
      ))
    ));
    const storageBefore = await localStorageSnapshot(page);
    const scrollBefore = await page.evaluate(() => ({
      window: window.scrollY,
      backdrop: document.querySelector<HTMLElement>("#manual-entry")?.scrollTop ?? -1,
    }));
    const requests: string[] = [];
    const recordRequest = (request: Request) => requests.push(request.url());
    page.on("request", recordRequest);

    await page.getByRole("button", { name: "Review execution" }).click();
    const error = page.locator("#manual-entry-error");
    await expect(error).toHaveAttribute("role", "alert");
    await expect(error).toHaveAttribute("tabindex", "-1");
    await expect(error).toContainText("signs and exponents are not supported");
    await expect(error).toBeFocused();
    await expect(page.locator("#manual-entry-form")).toBeVisible();
    await expect(page.locator("#manual-entry-review")).toBeHidden();
    await expect(page.getByRole("button", { name: "Save execution" })).toBeHidden();
    await expect(page.locator("#screen")).toHaveAttribute("inert", "");

    const geometry = await error.evaluate((element) => {
      const sheet = element.closest<HTMLElement>(".manual-entry-sheet");
      const backdrop = element.closest<HTMLElement>("#manual-entry");
      if (sheet === null || backdrop === null) {
        throw new Error("The manual-entry modal structure is missing.");
      }
      const errorBounds = element.getBoundingClientRect();
      const sheetBounds = sheet.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return {
        error: {
          top: errorBounds.top,
          right: errorBounds.right,
          bottom: errorBounds.bottom,
          left: errorBounds.left,
        },
        sheet: {
          top: sheetBounds.top,
          right: sheetBounds.right,
          bottom: sheetBounds.bottom,
          left: sheetBounds.left,
        },
        outlineStyle: style.outlineStyle,
        outlineWidth: Number.parseFloat(style.outlineWidth),
        sheetOverflow: sheet.scrollWidth - sheet.clientWidth,
        documentOverflow: document.documentElement.scrollWidth - window.innerWidth,
        windowScrollY: window.scrollY,
        backdropScrollTop: backdrop.scrollTop,
      };
    });
    expect(geometry.error.top, `${width}px error top`)
      .toBeGreaterThanOrEqual(geometry.sheet.top + 8);
    expect(geometry.error.bottom, `${width}px error bottom`)
      .toBeLessThanOrEqual(geometry.sheet.bottom - 8);
    expect(geometry.error.left, `${width}px error left`)
      .toBeGreaterThanOrEqual(geometry.sheet.left + 8);
    expect(geometry.error.right, `${width}px error right`)
      .toBeLessThanOrEqual(geometry.sheet.right - 8);
    expect(geometry.outlineStyle).toBe("solid");
    expect(geometry.outlineWidth).toBeGreaterThanOrEqual(2);
    expect(geometry.sheetOverflow).toBeLessThanOrEqual(1);
    expect(geometry.documentOverflow).toBeLessThanOrEqual(1);
    expect(geometry.windowScrollY).toBe(scrollBefore.window);
    expect(geometry.backdropScrollTop).toBe(scrollBefore.backdrop);
    expect(await page.locator("#manual-entry-form").evaluate((form) => (
      Object.fromEntries(Array.from(
        form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"),
        (control) => [control.id, control.value],
      ))
    ))).toEqual(authoredValues);

    await page.keyboard.press("Tab");
    const cancel = page.getByRole("button", { name: "Cancel" });
    await expect(cancel).toBeFocused();
    await expectControlWithinSheet(cancel);
    await error.focus();
    await page.keyboard.press("Shift+Tab");
    const currency = page.locator("#manual-currency");
    await expect(currency).toBeFocused();
    await expectControlWithinSheet(currency);

    await page.locator("#manual-price").fill("100");
    await page.getByRole("button", { name: "Review execution" }).click();
    await expect(error).toBeHidden();
    await expect(page.getByRole("heading", { name: "Review before saving" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save execution" })).toBeFocused();
    expect(await localStorageSnapshot(page)).toEqual(storageBefore);
    page.off("request", recordRequest);
    expect(requests).toEqual([]);

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Add execution" })).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await expect(page.locator("#screen")).not.toHaveAttribute("inert", "");
  }
});

test("manual entry binds an explicit fold offset to the selected IANA zone", async ({ page }) => {
  await startEmptyJournal(page);
  await page.getByRole("button", { name: "Enter execution" }).click();
  await page.locator("#manual-account").fill("Primary brokerage");
  await page.locator("#manual-symbol").fill("AAPL");
  await page.locator("#manual-quantity").fill("1");
  await page.locator("#manual-price").fill("100");
  await page.locator("#manual-time-zone").fill("America/New_York");
  await page.locator("#manual-executed-at").fill("2026-11-01T01:30");
  await page.locator("#manual-utc-offset").fill("-04:00");
  await page.getByRole("button", { name: "Review execution" }).click();

  await expect(page.getByText("2026-11-01T05:30:00Z", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back" }).click();
  await page.locator("#manual-utc-offset").fill("+14:00");
  await page.getByRole("button", { name: "Review execution" }).click();
  await expect(page.locator("#manual-entry-error")).toContainText(
    "does not match America/New_York",
  );
});
