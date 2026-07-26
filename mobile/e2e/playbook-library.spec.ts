import { expect, test, type Locator, type Page } from "@playwright/test";

const BASE_ORIGIN = "http://127.0.0.1:4173";
const ONBOARDING_KEY = "hermes.journal.onboarding.v2";

function logExternalRequests(page: Page): string[] {
  const requests: string[] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      (url.protocol === "http:" || url.protocol === "https:")
      && url.origin !== BASE_ORIGIN
    ) requests.push(request.url());
  });
  return requests;
}

async function establishLocalJournal(page: Page): Promise<void> {
  await page.addInitScript(
    (key) => window.localStorage.setItem(key, "complete"),
    ONBOARDING_KEY,
  );
  await page.goto("/");
  const csv = [
    "execution_id,symbol,side,quantity,price,fee,currency,executed_at",
    "aapl-in,AAPL,BTO,1,100,0,USD,2026-07-09T14:30:00Z",
    "aapl-out,AAPL,STC,1,110,0,USD,2026-07-09T15:00:00Z",
    "",
  ].join("\r\n");
  await page.locator("#import-file").setInputFiles({
    name: "playbook-library.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(csv),
  });
  await page.locator("#import-account").fill("Primary brokerage");
  await page.getByRole("button", { name: "Preview CSV" }).click();
  await page.getByRole("button", { name: "Import 2 executions" }).click();
  await expect(page.getByRole("heading", { name: "More", exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Journal", exact: true }))
    .toBeVisible();
}

function definitionCard(page: Page, name: string): Locator {
  return page.locator("[data-playbook-definition]").filter({
    has: page.getByRole("heading", { name, exact: true }),
  });
}

async function expectControlValues(
  controls: Locator,
  expected: readonly string[],
): Promise<void> {
  await expect.poll(() => controls.evaluateAll((elements) => (
    elements.map((element) => (
      element as HTMLInputElement | HTMLSelectElement
    ).value)
  ))).toEqual(expected);
}

async function acceptLifecycleConfirmation(
  page: Page,
  action: "Archive" | "Restore",
  name: string,
  trigger: Locator,
): Promise<void> {
  const confirmationPromise = page.waitForEvent("dialog");
  const actionAttempt = trigger.click();
  const confirmation = await confirmationPromise;
  expect(confirmation.type()).toBe("confirm");
  expect(confirmation.message()).toBe(
    `${action} ${name}? Its stable identity and every revision stay on this device.`,
  );
  await confirmation.accept();
  await actionAttempt;
}

test("a narrow local flow preserves the exact applied playbook snapshot after a later rename", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const externalRequests = logExternalRequests(page);
  await establishLocalJournal(page);

  await page.getByRole("button", { name: "New playbook" }).click();
  let editor = page.getByRole("dialog", { name: "New playbook" });
  await editor.locator("#playbook-definition-name").fill("Opening Range");
  await editor.locator("#playbook-definition-rules").fill("Wait for the opening range");
  await editor.getByRole("button", { name: "Create playbook" }).click();
  await expect(editor).toHaveCount(0);

  let card = definitionCard(page, "Opening Range");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Edit" }).click();
  editor = page.getByRole("dialog", { name: "Edit playbook" });
  await editor.locator("#playbook-definition-name").fill("Opening Range Confirmed");
  await editor.locator("#playbook-definition-rules").fill([
    "Wait for confirmation",
    "Respect the planned stop",
  ].join("\n"));
  await editor.getByRole("button", { name: "Save new version" }).click();
  await expect(editor).toHaveCount(0);

  const appliedName = "Opening Range Confirmed";
  card = definitionCard(page, appliedName);
  await acceptLifecycleConfirmation(
    page,
    "Archive",
    appliedName,
    card.getByRole("button", { name: "Archive" }),
  );
  const archivedDisclosure = page.getByText("Archived playbooks (1)", {
    exact: true,
  });
  await expect(archivedDisclosure).toBeVisible();
  await archivedDisclosure.click();
  card = definitionCard(page, appliedName);
  await expect(card.getByText("Archived", { exact: true })).toBeVisible();
  await acceptLifecycleConfirmation(
    page,
    "Restore",
    appliedName,
    card.getByRole("button", { name: "Restore" }),
  );

  card = definitionCard(page, appliedName);
  await expect(card.getByText("Active", { exact: true })).toBeVisible();
  const definitionId = await card.getAttribute("data-playbook-definition");
  const appliedRevision = await card.getAttribute(
    "data-playbook-definition-revision",
  );
  const appliedVersionLabel = await card.locator(".section-title strong")
    .textContent();
  if (
    definitionId === null
    || appliedRevision === null
    || appliedVersionLabel === null
  ) {
    throw new Error("The restored playbook card has no exact immutable identity.");
  }
  const appliedVersion = appliedVersionLabel.replace(/^v/u, "");

  const queueItem = page.locator("[data-review-queue-trade]").filter({
    has: page.getByRole("heading", { name: "AAPL", exact: true }),
  });
  await queueItem.getByRole("button", {
    name: /^Review for AAPL Stock, Primary brokerage,/u,
  }).click();
  let review = page.getByRole("dialog", { name: "AAPL trade review" });
  const playbookInput = review.locator("#review-playbook");
  const librarySelect = review.locator("#review-playbook-library");
  const ruleNames = review.locator('input[name="review-rule-name"]');
  await expect(playbookInput).toHaveValue("");
  await expect(librarySelect).toHaveValue("");
  await expect(ruleNames).toHaveCount(0);
  await expect(review.locator("#review-playbook-application-status")).toHaveText(
    "No saved revision is linked. Free-text playbook work remains ad hoc.",
  );

  await playbookInput.fill("One-off tape read");
  await review.getByRole("button", { name: "Add rule" }).click();
  await ruleNames.fill("Ad hoc only");
  await librarySelect.selectOption(definitionId);
  await expect(playbookInput).toHaveValue("One-off tape read");
  await expect(ruleNames).toHaveValue("Ad hoc only");

  const applyConfirmationPromise = page.waitForEvent("dialog");
  const applyAttempt = review.getByRole("button", {
    name: "Apply selected revision",
  }).click();
  const applyConfirmation = await applyConfirmationPromise;
  expect(applyConfirmation.type()).toBe("confirm");
  expect(applyConfirmation.message()).toBe(
    "Apply this saved revision and replace the current playbook name and rule work?",
  );
  await applyConfirmation.accept();
  await applyAttempt;
  await expect(playbookInput).toHaveValue(appliedName);
  await expectControlValues(ruleNames, [
    "Wait for confirmation",
    "Respect the planned stop",
  ]);
  await expect(review.locator("#review-playbook-application-status")).toHaveText(
    `${appliedName} version ${appliedVersion} applied. Saving will link this exact immutable revision.`,
  );
  await review.locator('select[name="review-rule-outcome"]').nth(0)
    .selectOption("followed");
  await review.locator('select[name="review-rule-outcome"]').nth(1)
    .selectOption("not_applicable");
  await review.locator("#review-note").fill(
    "Applied the restored saved revision explicitly.",
  );
  await review.getByRole("button", { name: "Mark reviewed" }).click();
  await expect(review).toHaveCount(0);
  await expect(page.locator("#route-announcer")).toHaveText(
    "AAPL review completed.",
  );

  card = definitionCard(page, appliedName);
  await card.getByRole("button", { name: "Edit" }).click();
  editor = page.getByRole("dialog", { name: "Edit playbook" });
  const renamedDefinition = "Opening Range Renamed Later";
  await editor.locator("#playbook-definition-name").fill(renamedDefinition);
  await editor.getByRole("button", { name: "Save new version" }).click();
  await expect(editor).toHaveCount(0);
  card = definitionCard(page, renamedDefinition);
  await expect(card).toHaveAttribute("data-playbook-definition", definitionId);
  await expect(card).not.toHaveAttribute(
    "data-playbook-definition-revision",
    appliedRevision,
  );

  await page.getByRole("button", { name: "Trades", exact: true }).click();
  const tradeCard = page.locator(".trade-card").filter({
    has: page.getByRole("heading", { name: "AAPL", exact: true }),
  });
  await tradeCard.getByRole("button", {
    name: /^Edit review for AAPL Stock, Primary brokerage,/u,
  }).click();
  review = page.getByRole("dialog", { name: "AAPL trade review" });
  await expect(review.locator("#review-playbook")).toHaveValue(appliedName);
  await expectControlValues(
    review.locator('input[name="review-rule-name"]'),
    [
      "Wait for confirmation",
      "Respect the planned stop",
    ],
  );
  await expectControlValues(
    review.locator('select[name="review-rule-outcome"]'),
    ["followed", "not_applicable"],
  );
  await expect(review.locator("#review-playbook-library")).toHaveValue("");
  await expect(
    review.locator("#review-playbook-library option").filter({
      hasText: renamedDefinition,
    }),
  ).toHaveCount(1);
  await expect(review.locator("#review-playbook-application-status")).toHaveText(
    "This review already links one exact immutable saved revision.",
  );
  await expect(review.locator("#review-playbook")).not.toHaveValue(
    renamedDefinition,
  );
  await review.getByRole("button", { name: "Cancel" }).click();
  await expect(review).toHaveCount(0);

  await page.getByRole("button", { name: "Open settings" }).click();
  await page.getByRole("button", { name: "Explore demo journal" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true }))
    .toBeVisible();
  await page.getByRole("button", { name: "Journal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Journal", exact: true }))
    .toBeVisible();
  await expect(page.getByText(renamedDefinition, { exact: true })).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});
