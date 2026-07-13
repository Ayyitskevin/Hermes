import { expect, test, type Locator, type Page } from "@playwright/test";

const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

async function importTwoClosedTrades(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "aapl-in,AAPL,BTO,1,100,0,USD,2026-07-09T14:30:00Z",
    "aapl-out,AAPL,STC,1,110,0,USD,2026-07-09T15:00:00Z",
    "msft-in,MSFT,BTO,1,400,0,USD,2026-07-09T15:30:00Z",
    "msft-out,MSFT,STC,1,410,0,USD,2026-07-09T16:00:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "two-trades.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 4 executions" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
}

function tradeCard(page: Page, symbol: string): Locator {
  return page.locator(".trade-card").filter({
    has: page.getByRole("heading", { name: symbol, exact: true }),
  });
}

async function openTradeReview(page: Page, symbol: string): Promise<Locator> {
  const card = tradeCard(page, symbol);
  await card.locator("[data-review-trade]").click();
  const dialog = page.getByRole("dialog", { name: `${symbol} trade review` });
  await expect(dialog).toBeVisible();
  return dialog;
}

async function changePlaybookWithConfirmation(
  page: Page,
  input: Locator,
  nextPlaybook: string,
  decision: "accept" | "dismiss",
): Promise<void> {
  await input.fill(nextPlaybook);
  const confirmationPromise = page.waitForEvent("dialog");
  const changeAttempt = input.blur();
  const confirmation = await confirmationPromise;
  expect(confirmation.type()).toBe("confirm");
  expect(confirmation.message()).toMatch(/rule|playbook/iu);
  if (decision === "accept") await confirmation.accept();
  else await confirmation.dismiss();
  await changeAttempt;
}

async function completeReview(page: Page, symbol: string, risk: string): Promise<void> {
  const card = tradeCard(page, symbol);
  await card.getByRole("button", { name: /Review trade|Continue draft|Edit review/u }).click();
  const dialog = page.getByRole("dialog", { name: `${symbol} trade review` });
  await expect(dialog).toBeVisible();
  await expect(page.locator("#screen")).toHaveAttribute("inert", "");
  await expect(dialog.getByRole("heading", { name: "Execution inspection" })).toBeVisible();
  await expect(dialog.locator(".review-execution-row")).toHaveCount(2);
  await dialog.locator("#review-setup").fill("Opening range breakout");
  await dialog.locator("#review-emotion").fill("Focused");
  await dialog.locator("#review-mistakes").fill("Late scale-out");
  if (symbol === "AAPL") await dialog.locator("#review-tags").fill("A+ setup");
  await dialog.locator("#review-risk").fill(risk);
  await dialog.locator("#review-stop").fill(symbol === "AAPL" ? "95" : "395");
  await dialog.locator("#review-playbook").fill("Momentum");
  await dialog.getByRole("button", { name: "Add rule" }).click();
  await dialog.locator('input[name="review-rule-name"]').last().fill("Wait for confirmation");
  await dialog.locator('select[name="review-rule-outcome"]').last().selectOption("followed");
  await dialog.locator("#review-note").fill(`${symbol} followed the planned confirmation.`);
  await dialog.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator("#route-announcer")).toHaveText(`${symbol} review completed.`);
}

test("trade reviews persist exact risk metrics, edit immutably, and clear an atomic queue", async ({ page }) => {
  await importTwoClosedTrades(page);
  await expect(page.getByRole("heading", { name: "2 reviews waiting" })).toBeVisible();
  await page.getByRole("button", { name: "Trades", exact: true }).click();

  const aapl = tradeCard(page, "AAPL");
  await aapl.getByRole("button", { name: "Review trade" }).click();
  const initialDialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await expect(initialDialog.getByText("Add user-confirmed initial risk to calculate R.")).toBeVisible();
  await expect(initialDialog.getByText("10%", { exact: true })).toBeVisible();
  await initialDialog.locator("#review-note").fill("Unsaved reflection");
  const confirmationPromise = page.waitForEvent("dialog");
  const closeAttempt = initialDialog.getByRole("button", { name: "Cancel" }).click();
  const confirmation = await confirmationPromise;
  expect(confirmation.type()).toBe("confirm");
  expect(confirmation.message()).toBe("Discard the unsaved trade review?");
  await confirmation.dismiss();
  await closeAttempt;
  await expect(initialDialog).toBeVisible();
  await initialDialog.locator("#review-note").fill("");
  await initialDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(aapl.getByRole("button", { name: "Review trade" })).toBeFocused();

  await completeReview(page, "AAPL", "5");
  await expect(tradeCard(page, "AAPL").locator(".journal-metrics span"))
    .toContainText("+2.0R · +10.00%");
  await expect(tradeCard(page, "AAPL")).toContainText("completed");

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByText("1 session streak", { exact: true })).toBeVisible();
  await expect(page.locator(".review-progress-card"))
    .toContainText("1 of 1 trading sessions reviewed.");
  await page.getByRole("button", { name: "Trades", exact: true }).click();

  await tradeCard(page, "AAPL").getByRole("button", { name: "Edit review" }).click();
  const editDialog = page.getByRole("dialog", { name: "AAPL trade review" });
  await expect(editDialog.getByText("2R", { exact: true })).toBeVisible();
  await expect(editDialog.locator("#review-risk")).toHaveValue("5");
  await editDialog.locator("#review-note").fill("AAPL review updated without changing executions.");
  await editDialog.getByRole("button", { name: "Save review changes" }).click();
  await tradeCard(page, "AAPL").getByRole("button", { name: "Edit review" }).click();
  await expect(page.getByText("REVIEWED · VERSION 2", { exact: true })).toBeVisible();
  await expect(page.locator("#review-note")).toHaveValue(
    "AAPL review updated without changing executions.",
  );
  await page.getByRole("button", { name: "Cancel" }).click();

  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Trade review queue" })).toBeVisible();
  await expect(page.locator(".review-queue-item")).toHaveCount(1);
  await page.locator("[data-batch-review-subject]").check();
  await page.locator("#batch-review-tag").fill("Earnings day");
  await page.getByRole("button", { name: "Apply tag to selected" }).click();
  await expect(page.locator("#route-announcer")).toHaveText(
    "Earnings day added to 1 trade in one atomic review batch.",
  );
  await expect(page.locator(".review-queue-item")).toContainText("draft");

  await page.locator(".review-queue-item").getByRole("button", { name: "Continue draft" }).click();
  await expect(page.locator("#review-tags")).toHaveValue("Earnings day");
  await page.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await completeReview(page, "MSFT", "10");

  await page.getByRole("button", { name: "Dashboard", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Review queue clear" })).toBeVisible();
  await expect(page.getByText("1 session streak", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.locator(".review-queue-item")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Review queue clear" })).toBeVisible();
});

test("trade review contains reverse focus from its initially focused title", async ({ page }) => {
  await importTwoClosedTrades(page);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  const dialog = await openTradeReview(page, "AAPL");
  await expect(dialog.getByRole("heading", { name: "AAPL trade review" })).toBeFocused();

  await page.keyboard.press("Shift+Tab");

  const focusRemainsInDialog = await dialog.evaluate((element) => (
    element.contains(document.activeElement)
  ));
  expect(focusRemainsInDialog).toBe(true);
});

test("changing playbooks confirms before replacing dirty rule work", async ({ page }) => {
  await importTwoClosedTrades(page);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await completeReview(page, "AAPL", "5");

  const dialog = await openTradeReview(page, "MSFT");
  const playbook = dialog.locator("#review-playbook");
  await playbook.fill("Custom review");
  await playbook.blur();
  await dialog.getByRole("button", { name: "Add rule" }).click();
  const ruleName = dialog.locator('input[name="review-rule-name"]').last();
  const ruleOutcome = dialog.locator('select[name="review-rule-outcome"]').last();
  await ruleName.fill("Keep this custom rule");
  await ruleOutcome.selectOption("broken");

  await changePlaybookWithConfirmation(page, playbook, "Momentum", "dismiss");
  await expect(playbook).toHaveValue("Custom review");
  await expect(ruleName).toHaveValue("Keep this custom rule");
  await expect(ruleOutcome).toHaveValue("broken");

  await changePlaybookWithConfirmation(page, playbook, "Momentum", "accept");
  await expect(playbook).toHaveValue("Momentum");
  await expect(dialog.locator('input[name="review-rule-name"]')).toHaveCount(1);
  await expect(dialog.locator('input[name="review-rule-name"]')).toHaveValue(
    "Wait for confirmation",
  );
  await expect(dialog.locator('select[name="review-rule-outcome"]')).toHaveValue("unreviewed");
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 320, height: 568 },
] as const) {
  test(`trade review reflows without internal horizontal scrolling at 200% text and ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await importTwoClosedTrades(page);
    await page.getByRole("button", { name: "Trades", exact: true }).click();
    await page.evaluate(() => {
      document.documentElement.dataset.testTextScale = "200";
    });
    const dialog = await openTradeReview(page, "AAPL");
    await dialog.getByRole("button", { name: "Add rule" }).click();
    await dialog.locator('input[name="review-rule-name"]').last().fill("Wait for confirmation");
    await dialog.locator('select[name="review-rule-outcome"]').last()
      .selectOption("not_applicable");

    const dimensions = await dialog.evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
      offenders: Array.from(element.querySelectorAll<HTMLElement>("*"))
        .map((candidate) => ({
          element: `${candidate.tagName.toLowerCase()}${candidate.id ? `#${candidate.id}` : ""}${Array.from(candidate.classList, (name) => `.${name}`).join("")}`,
          clientWidth: candidate.clientWidth,
          scrollWidth: candidate.scrollWidth,
          right: Math.round(candidate.getBoundingClientRect().right),
        }))
        .filter((candidate) => (
          candidate.scrollWidth > candidate.clientWidth
          || candidate.right > Math.round(element.getBoundingClientRect().right)
        )),
    }));
    expect(dimensions.scrollWidth, JSON.stringify(dimensions))
      .toBeLessThanOrEqual(dimensions.clientWidth);
  });
}

test("review controls expose the trade or rule they act on", async ({ page }) => {
  await importTwoClosedTrades(page);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  await expect(tradeCard(page, "AAPL").locator("[data-review-trade]")).toHaveAccessibleName(
    /^(?=.*\breview\b)(?=.*\bAAPL\b).*$/iu,
  );
  await expect(tradeCard(page, "MSFT").locator("[data-review-trade]")).toHaveAccessibleName(
    /^(?=.*\breview\b)(?=.*\bMSFT\b).*$/iu,
  );

  await page.getByRole("button", { name: "Journal", exact: true }).click();
  for (const symbol of ["AAPL", "MSFT"]) {
    const queueItem = page.locator(".review-queue-item").filter({
      has: page.getByRole("heading", { name: symbol, exact: true }),
    });
    await expect(queueItem.getByRole("checkbox")).toHaveAccessibleName(
      new RegExp(`^(?=.*\\bselect\\b)(?=.*\\b${symbol}\\b).*$`, "iu"),
    );
    await expect(queueItem.locator("[data-review-trade]")).toHaveAccessibleName(
      new RegExp(`^(?=.*\\breview\\b)(?=.*\\b${symbol}\\b).*$`, "iu"),
    );
  }

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  const dialog = await openTradeReview(page, "AAPL");
  for (const rule of ["Wait for confirmation", "Respect the planned stop"]) {
    await dialog.getByRole("button", { name: "Add rule" }).click();
    await dialog.locator('input[name="review-rule-name"]').last().fill(rule);
  }
  const removeButtons = dialog.locator("[data-review-rule-remove]");
  await expect(removeButtons.nth(0)).toHaveAccessibleName(
    /^(?=.*\bremove\b)(?=.*\brule\b)(?=.*\bWait for confirmation\b).*$/iu,
  );
  await expect(removeButtons.nth(1)).toHaveAccessibleName(
    /^(?=.*\bremove\b)(?=.*\brule\b)(?=.*\bRespect the planned stop\b).*$/iu,
  );
  const outcomeControls = dialog.locator('select[name="review-rule-outcome"]');
  await expect(outcomeControls.nth(0)).toHaveAccessibleName(
    /^(?=.*\boutcome\b)(?=.*\bWait for confirmation\b).*$/iu,
  );
  await expect(outcomeControls.nth(1)).toHaveAccessibleName(
    /^(?=.*\boutcome\b)(?=.*\bRespect the planned stop\b).*$/iu,
  );

  await removeButtons.nth(1).click();
  await expect(dialog.locator('input[name="review-rule-name"]').first()).toBeFocused();
  await dialog.locator("[data-review-rule-remove]").click();
  await expect(dialog.getByRole("button", { name: "Add rule" })).toBeFocused();
});

test("trade review disables every form control while its save is pending", async ({ page }) => {
  await importTwoClosedTrades(page);
  await page.getByRole("button", { name: "Trades", exact: true }).click();
  const dialog = await openTradeReview(page, "AAPL");
  await dialog.locator("#review-note").fill("A pending save must freeze this exact form snapshot.");

  const pendingState = await dialog.getByRole("button", { name: "Save draft" })
    .evaluate((element) => {
      (element as HTMLButtonElement).click();
      const sheet = document.querySelector<HTMLElement>(".trade-review-sheet");
      const controls = Array.from(document.querySelectorAll<HTMLElement>(
        ".trade-review-sheet button, .trade-review-sheet input, .trade-review-sheet select, .trade-review-sheet textarea",
      ));
      return {
        connected: sheet?.isConnected ?? false,
        busy: sheet?.getAttribute("aria-busy"),
        enabledControls: controls
          .filter((control) => !control.matches(":disabled"))
          .map((control) => control.id || control.getAttribute("name") || control.textContent?.trim()),
      };
    });

  expect(pendingState).toEqual({ connected: true, busy: "true", enabledControls: [] });
  await expect(dialog).toHaveCount(0);
});

test("open trades with realized exits stay explicitly interim partial", async ({ page }) => {
  await page.addInitScript((key) => window.localStorage.setItem(key, "complete"), ONBOARDING_KEY);
  await page.goto("/");
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "partial-in,AAPL,BTO,2,100,0,USD,2026-07-09T14:30:00Z",
    "partial-out,AAPL,STC,1,110,0,USD,2026-07-09T15:00:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "partial-trade.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 2 executions" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();

  await expect(page.locator(".result-card").first())
    .toContainText("includes interim partial exits");
  const recentTrade = page.locator(".trade-row").filter({
    has: page.getByText("AAPL", { exact: true }),
  });
  await expect(recentTrade).toContainText("Interim partial");

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  const card = tradeCard(page, "AAPL");
  await expect(card.getByText("open", { exact: true })).toBeVisible();
  await expect(card.locator(".journal-metrics span")).toContainText("Interim partial");
});
