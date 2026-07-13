import { expect, test, type Page } from "@playwright/test";

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
  await expect(page.getByText("+$18.00", { exact: true })).toBeVisible();

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
  await page.locator("#manual-account").fill("Primary brokerage");
  await page.locator("#manual-symbol").fill("AAPL");
  await page.locator("#manual-quantity").fill("1");
  await page.locator("#manual-price").fill("1e2");
  await page.locator("#manual-executed-at").fill("2026-07-09T14:30");
  await page.getByRole("button", { name: "Review execution" }).click();
  await expect(page.getByRole("alert")).toContainText("signs and exponents are not supported");
  await expect(page.getByRole("button", { name: "Save execution" })).toBeHidden();

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Add execution" })).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(page.getByRole("heading", { name: "Build your journal" })).toBeVisible();
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
