import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot } from "../core/types";
import { focusChromeSafeElement } from "./focus-chrome-safe";

export interface DashboardImportRecoveryContext {
  readonly receiptId: string;
  readonly origin: "confirmed-post-commit" | "history-review";
}

export type DashboardImportContinuation =
  | Readonly<{ readonly kind: "import" }>
  | Readonly<{ readonly kind: "confirmed-recovery"; readonly receiptId: string }>;

export interface DashboardImportContinuationActions {
  readonly open: (continuation: DashboardImportContinuation) => void;
  readonly fail: () => void;
}

const dashboardImportBindings = new WeakMap<HTMLElement, AbortController>();

const DISPLACED_ARTIFACT_SELECTOR = [
  "[data-dashboard-import-continuation]",
  "[data-dashboard-import-continuation-title]",
  "[data-dashboard-import-action]",
  "[data-dashboard-import-continuation-error]",
  "[data-manual-capture-review-failure]",
  "[data-manual-capture-card]",
  "[data-manual-execution]",
  "[data-import-tool]",
  "#csv-import-form",
  "#import-account",
  "#import-time-zone",
  "#import-currency",
  "#import-file",
  "[data-import-preview-submit]",
  "#import-status",
  "#import-preview",
  "#commit-import",
  "[data-import-refresh-retry]",
  "[data-import-receipt-review-failure]",
  "[data-import-receipt-review-failure-title]",
  "[data-import-receipt-review-retry]",
  ".import-receipt",
  ".import-history-row",
  "[data-import-receipt-review-continuation]",
  "[data-review-import-receipt]",
  "[data-rollback-receipt]",
  ".user-data-export",
  ".user-data-restore",
  "#sizing-form",
].join(", ");

export function clearDashboardImportContinuationBinding(root: HTMLElement): void {
  dashboardImportBindings.get(root)?.abort();
  dashboardImportBindings.delete(root);
}

export function removeDisplacedDashboardImportArtifacts(root: HTMLElement): void {
  const screen = root.querySelector<HTMLElement>("#screen");
  root.querySelectorAll<HTMLElement>(DISPLACED_ARTIFACT_SELECTOR).forEach((artifact) => {
    if (screen === null || !screen.contains(artifact)) artifact.remove();
  });
}

function isUnhiddenDestination(element: HTMLElement): boolean {
  if (
    !element.isConnected
    || element.closest("[hidden], [inert], [aria-hidden=\"true\"]") !== null
  ) return false;
  const style = window.getComputedStyle(element);
  return style.display !== "none"
    && style.visibility !== "hidden"
    && style.visibility !== "collapse"
    && style.opacity !== "0";
}

function isVisibleDestination(element: HTMLElement): boolean {
  return isUnhiddenDestination(element) && element.getClientRects().length > 0;
}

export function buildDashboardImportContinuation(
  snapshot: JournalWorkspaceSnapshot,
  recovery: DashboardImportRecoveryContext | null,
): DashboardImportContinuation | null {
  if (recovery?.origin === "confirmed-post-commit") {
    if (
      typeof recovery.receiptId !== "string"
      || recovery.receiptId.length === 0
      || recovery.receiptId.trim() !== recovery.receiptId
    ) {
      throw new Error("Confirmed import recovery requires one stable receipt identity.");
    }
    return Object.freeze({
      kind: "confirmed-recovery",
      receiptId: recovery.receiptId,
    });
  }
  if (snapshot.provenance !== "local") return null;
  return Object.freeze({ kind: "import" });
}

export function dashboardImportContinuationCard(
  continuation: DashboardImportContinuation,
): string {
  const recovering = continuation.kind === "confirmed-recovery";
  const receiptAttribute = recovering
    ? ` data-dashboard-import-receipt="${escapeHtml(continuation.receiptId)}"`
    : "";
  const heading = recovering ? "Finish saved import" : "Keep your journal current";
  const action = recovering ? "Finish saved import" : "Import latest session";
  const copy = recovering
    ? "The CSV commit is already confirmed. Continue only its exact receipt recovery; do not choose or import the file again."
    : "Bring in the next generic stock CSV. Reconcile its preview before one atomic commit; Hermes then records a reversible receipt for review. Hermes never asks for broker credentials or places an order.";
  return `<article class="card dashboard-import-continuation${recovering ? " dashboard-import-recovery" : ""}" data-dashboard-import-continuation="${continuation.kind}"${receiptAttribute} aria-labelledby="dashboard-import-continuation-title">
    <div class="section-title"><div><p class="card-label">${recovering ? "RECOVERY REQUIRED" : "RECURRING CAPTURE"}</p><h2 id="dashboard-import-continuation-title" data-dashboard-import-continuation-title tabindex="-1">${heading}</h2></div><span>${recovering ? "RECEIPT CONFIRMED" : "GENERIC STOCK CSV"}</span></div>
    <p>${copy}</p>
    <div class="quick-actions"><button class="${recovering ? "primary-button" : "secondary-button"}" type="button" data-dashboard-import-action="${continuation.kind}"${receiptAttribute}>${action}</button></div>
    <p class="form-error" data-dashboard-import-continuation-error role="alert" tabindex="-1" hidden></p>
  </article>`;
}

function exactScreenPlacement(
  root: HTMLElement,
  titleId: "dashboard-title" | "more-title",
): Readonly<{
  readonly screen: HTMLElement;
  readonly stack: HTMLElement;
  readonly heading: HTMLElement;
}> | null {
  const screens = Array.from(root.querySelectorAll<HTMLElement>("#screen"));
  const screen = screens[0];
  const stacks = screen === undefined ? [] : Array.from(screen.children)
    .filter((child): child is HTMLElement => (
      child instanceof HTMLElement && child.classList.contains("screen-stack")
    ));
  const stack = stacks[0];
  const heading = stack?.firstElementChild;
  const titles = heading instanceof HTMLElement
    ? Array.from(heading.querySelectorAll<HTMLElement>(`#${titleId}`))
    : [];
  if (
    screens.length !== 1
    || screen === undefined
    || stacks.length !== 1
    || stack === undefined
    || !(heading instanceof HTMLElement)
    || !heading.classList.contains("screen-heading")
    || heading.parentElement !== stack
    || titles.length !== 1
    || titles[0]?.id !== titleId
    || !heading.contains(titles[0]!)
  ) return null;
  return Object.freeze({ screen, stack, heading });
}

function exactManualRecoveryAfterHeading(
  root: HTMLElement,
  placement: Readonly<{
    readonly stack: HTMLElement;
    readonly heading: HTMLElement;
  }>,
): Readonly<{ readonly anchor: HTMLElement }> | null {
  const failures = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-manual-capture-review-failure]",
  ));
  const headings = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-manual-capture-review-failure-title]",
  ));
  const retries = Array.from(root.querySelectorAll<HTMLButtonElement>(
    "button[data-manual-capture-review-retry]",
  ));
  const statuses = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-manual-capture-review-retry-status]",
  ));
  if (failures.length === 0) {
    return headings.length === 0 && retries.length === 0 && statuses.length === 0
      ? Object.freeze({ anchor: placement.heading })
      : null;
  }
  const failure = failures[0];
  const heading = headings[0];
  const retry = retries[0];
  const status = statuses[0];
  if (
    failures.length !== 1
    || headings.length !== 1
    || retries.length !== 1
    || statuses.length !== 1
    || failure === undefined
    || heading === undefined
    || retry === undefined
    || status === undefined
    || failure.parentElement !== placement.stack
    || failure.previousElementSibling !== placement.heading
    || placement.heading.nextElementSibling !== failure
    || heading.id !== "manual-capture-review-failure-title"
    || heading.tabIndex !== -1
    || !failure.contains(heading)
    || !failure.contains(retry)
    || !failure.contains(status)
  ) return null;
  return Object.freeze({ anchor: failure });
}

function triggerMatches(
  root: HTMLElement,
  continuation: DashboardImportContinuation,
  section: HTMLElement,
  button: HTMLButtonElement,
): boolean {
  const sections = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-dashboard-import-continuation]",
  ));
  const headings = Array.from(section.querySelectorAll<HTMLElement>(
    "[data-dashboard-import-continuation-title]",
  ));
  const rootHeadings = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-dashboard-import-continuation-title]",
  ));
  const buttons = Array.from(section.querySelectorAll<HTMLButtonElement>(
    "button[data-dashboard-import-action]",
  ));
  const rootButtons = Array.from(root.querySelectorAll<HTMLButtonElement>(
    "button[data-dashboard-import-action]",
  ));
  const errors = Array.from(section.querySelectorAll<HTMLElement>(
    "[data-dashboard-import-continuation-error]",
  ));
  const rootErrors = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-dashboard-import-continuation-error]",
  ));
  const expectedReceipt = continuation.kind === "confirmed-recovery"
    ? continuation.receiptId
    : undefined;
  const heading = headings[0];
  const placement = exactScreenPlacement(root, "dashboard-title");
  const reviewProgressCards = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-dashboard-review-progress]",
  ));
  const accountOverviews = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-account-overview]",
  ));
  const netResults = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-dashboard-net-result]",
  ));
  const reviewProgressCard = reviewProgressCards[0];
  const accountOverview = accountOverviews[0];
  const netResult = netResults[0];
  const manualRecoveryPlacement = placement === null
    ? null
    : exactManualRecoveryAfterHeading(root, placement);
  const placementMatches = continuation.kind === "confirmed-recovery"
    ? placement !== null
      && manualRecoveryPlacement !== null
      && reviewProgressCards.length === 0
      && section.parentElement === placement.stack
      && section.previousElementSibling === manualRecoveryPlacement.anchor
      && manualRecoveryPlacement.anchor.nextElementSibling === section
    : placement !== null
      && manualRecoveryPlacement !== null
      && reviewProgressCards.length === 1
      && accountOverviews.length === 1
      && netResults.length === 1
      && reviewProgressCard !== undefined
      && accountOverview !== undefined
      && netResult !== undefined
      && accountOverview.parentElement === placement.stack
      && accountOverview.previousElementSibling === manualRecoveryPlacement.anchor
      && manualRecoveryPlacement.anchor.nextElementSibling === accountOverview
      && netResult.parentElement === placement.stack
      && netResult.previousElementSibling === accountOverview
      && accountOverview.nextElementSibling === netResult
      && reviewProgressCard.parentElement === placement.stack
      && reviewProgressCard.previousElementSibling === netResult
      && netResult.nextElementSibling === reviewProgressCard
      && section.parentElement === placement.stack
      && section.previousElementSibling === reviewProgressCard
      && reviewProgressCard.nextElementSibling === section;
  return sections.length === 1
    && sections[0] === section
    && headings.length === 1
    && rootHeadings.length === 1
    && rootHeadings[0] === headings[0]
    && heading !== undefined
    && heading.id === "dashboard-import-continuation-title"
    && section.contains(heading)
    && buttons.length === 1
    && rootButtons.length === 1
    && rootButtons[0] === button
    && buttons[0] === button
    && button.isConnected
    && section.contains(button)
    && errors.length === 1
    && rootErrors.length === 1
    && rootErrors[0] === errors[0]
    && section.dataset.dashboardImportContinuation === continuation.kind
    && button.dataset.dashboardImportAction === continuation.kind
    && section.dataset.dashboardImportReceipt === expectedReceipt
    && button.dataset.dashboardImportReceipt === expectedReceipt
    && placementMatches;
}

export function bindDashboardImportContinuation(
  root: HTMLElement,
  continuation: DashboardImportContinuation,
  actions: DashboardImportContinuationActions,
): void {
  clearDashboardImportContinuationBinding(root);
  const sections = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-dashboard-import-continuation]",
  ));
  const section = sections[0];
  const button = section?.querySelector<HTMLButtonElement>(
    "button[data-dashboard-import-action]",
  );
  if (
    section === undefined
    || button == null
    || !triggerMatches(root, continuation, section, button)
  ) {
    throw new Error("The Dashboard import continuation structure is inconsistent.");
  }
  const binding = new AbortController();
  dashboardImportBindings.set(root, binding);
  let activating = false;
  root.addEventListener("click", (event) => {
    const eventTarget = event.target;
    const trigger = eventTarget instanceof Element
      ? eventTarget.closest<HTMLButtonElement>("button")
      : null;
    if (trigger === null) return;
    const claimedSection = trigger.closest<HTMLElement>(
      "[data-dashboard-import-continuation]",
    );
    if (
      trigger !== button
      && !section.contains(trigger)
      && claimedSection === null
      && !trigger.hasAttribute("data-dashboard-import-action")
    ) return;
    if (activating) return;
    if (trigger !== button || !triggerMatches(root, continuation, section, button)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      activating = true;
      actions.fail();
      return;
    }
    activating = true;
    try {
      actions.open(continuation);
    } catch {
      actions.fail();
    }
  }, { capture: true, signal: binding.signal });
}

function importDestination(root: HTMLElement): HTMLElement {
  const tools = Array.from(root.querySelectorAll<HTMLElement>("[data-import-tool]"));
  const confirmedRecoveries = Array.from(root.querySelectorAll<HTMLElement>(
    '[data-import-receipt-review-failure-origin="confirmed-post-commit"]',
  ));
  const tool = tools[0];
  const headings = tool === undefined ? [] : Array.from(
    tool.querySelectorAll<HTMLElement>("[data-import-tool-title]"),
  );
  const forms = Array.from(root.querySelectorAll<HTMLFormElement>("#csv-import-form"));
  const accounts = Array.from(root.querySelectorAll<HTMLInputElement>("#import-account"));
  const timeZones = Array.from(root.querySelectorAll<HTMLInputElement>("#import-time-zone"));
  const currencies = Array.from(root.querySelectorAll<HTMLInputElement>("#import-currency"));
  const files = Array.from(root.querySelectorAll<HTMLInputElement>("#import-file"));
  const previewButtons = Array.from(root.querySelectorAll<HTMLButtonElement>(
    "button[data-import-preview-submit]",
  ));
  const statuses = Array.from(root.querySelectorAll<HTMLElement>("#import-status"));
  const previews = Array.from(root.querySelectorAll<HTMLElement>("#import-preview"));
  const heading = headings[0];
  const form = forms[0];
  const account = accounts[0];
  const timeZone = timeZones[0];
  const currency = currencies[0];
  const file = files[0];
  const previewButton = previewButtons[0];
  const status = statuses[0];
  const preview = previews[0];
  const placement = exactScreenPlacement(root, "more-title");
  const manualCards = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-manual-capture-card]",
  ));
  const manualCard = manualCards[0];
  const manualRecoveryPlacement = placement === null
    ? null
    : exactManualRecoveryAfterHeading(root, placement);
  if (
    tools.length !== 1
    || tool === undefined
    || headings.length !== 1
    || heading === undefined
    || heading.id !== "import-tool-title"
    || heading.tabIndex !== -1
    || forms.length !== 1
    || form === undefined
    || accounts.length !== 1
    || account === undefined
    || account.type !== "text"
    || timeZones.length !== 1
    || timeZone === undefined
    || timeZone.type !== "text"
    || currencies.length !== 1
    || currency === undefined
    || currency.type !== "text"
    || files.length !== 1
    || file === undefined
    || file.type !== "file"
    || previewButtons.length !== 1
    || previewButton === undefined
    || previewButton.type !== "submit"
    || statuses.length !== 1
    || status === undefined
    || previews.length !== 1
    || preview === undefined
    || account.disabled
    || timeZone.disabled
    || currency.disabled
    || file.disabled
    || previewButton.disabled
    || !isVisibleDestination(tool)
    || !isVisibleDestination(heading)
    || !isVisibleDestination(form)
    || !isVisibleDestination(account)
    || !isVisibleDestination(timeZone)
    || !isVisibleDestination(currency)
    || !isVisibleDestination(file)
    || !isVisibleDestination(previewButton)
    || !isUnhiddenDestination(status)
    || !isUnhiddenDestination(preview)
    || !tool.contains(heading)
    || !tool.contains(form)
    || !form.contains(account)
    || !form.contains(timeZone)
    || !form.contains(currency)
    || !form.contains(file)
    || !form.contains(previewButton)
    || !form.contains(status)
    || !form.contains(preview)
    || confirmedRecoveries.length !== 0
    || placement === null
    || manualRecoveryPlacement === null
    || manualCards.length !== 1
    || manualCard === undefined
    || manualCard.parentElement !== placement.stack
    || manualRecoveryPlacement.anchor.nextElementSibling !== manualCard
    || manualCard.previousElementSibling !== manualRecoveryPlacement.anchor
    || manualCard.nextElementSibling !== tool
    || tool.previousElementSibling !== manualCard
    || tool.parentElement !== placement.stack
  ) {
    throw new Error("The exact generic CSV import destination is unavailable.");
  }
  return heading;
}

function confirmedRecoveryDestination(
  root: HTMLElement,
  receiptId: string,
): HTMLElement {
  const allFailures = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-import-receipt-review-failure]",
  ));
  const failures = allFailures.filter((failure) => (
    failure.dataset.importReceiptReviewFailure === receiptId
  ));
  const failure = failures[0];
  const headings = failure === undefined ? [] : Array.from(
    failure.querySelectorAll<HTMLElement>("[data-import-receipt-review-failure-title]"),
  );
  const rootHeadings = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-import-receipt-review-failure-title]",
  ));
  const retries = failure === undefined ? [] : Array.from(
    failure.querySelectorAll<HTMLButtonElement>("button[data-import-receipt-review-retry]"),
  );
  const allFailureButtons = failure === undefined ? [] : Array.from(
    failure.querySelectorAll<HTMLButtonElement>("button"),
  );
  const rootRetries = Array.from(root.querySelectorAll<HTMLButtonElement>(
    "button[data-import-receipt-review-retry]",
  ));
  const dismisses = failure === undefined ? [] : Array.from(
    failure.querySelectorAll<HTMLButtonElement>(
      "button[data-import-receipt-review-failure-dismiss]",
    ),
  );
  const exports = Array.from(root.querySelectorAll<HTMLElement>(
    ".user-data-export",
  ));
  const exportCard = exports[0];
  const heading = headings[0];
  const retry = retries[0];
  const placement = exactScreenPlacement(root, "more-title");
  const manualRecoveryPlacement = placement === null
    ? null
    : exactManualRecoveryAfterHeading(root, placement);
  if (
    allFailures.length !== 1
    || failures.length !== 1
    || failure === undefined
    || failure.dataset.importReceiptReviewFailureOrigin !== "confirmed-post-commit"
    || headings.length !== 1
    || rootHeadings.length !== 1
    || rootHeadings[0] !== headings[0]
    || heading === undefined
    || heading.id !== "import-receipt-review-failure-title"
    || heading.tabIndex !== -1
    || retries.length !== 1
    || retry === undefined
    || allFailureButtons.length !== 1
    || allFailureButtons[0] !== retry
    || rootRetries.length !== 1
    || rootRetries[0] !== retry
    || retry.disabled
    || !isVisibleDestination(failure)
    || !isVisibleDestination(heading)
    || !isVisibleDestination(retry)
    || dismisses.length !== 0
    || root.querySelectorAll(
      [
        "[data-manual-capture-card]",
        "[data-manual-execution]",
        "[data-import-tool]",
        "#csv-import-form",
        "#import-account",
        "#import-time-zone",
        "#import-currency",
        "#import-file",
        "[data-import-preview-submit]",
        "#import-status",
        "#import-preview",
        "#commit-import",
        "[data-import-refresh-retry]",
        ".import-receipt",
        ".import-history-row",
        "[data-import-receipt-review-continuation]",
        "[data-review-import-receipt]",
        "[data-rollback-receipt]",
        ".user-data-restore",
        "#user-data-restore-form",
        "#user-data-restore-file",
        "#user-data-restore-commit",
        "#sizing-form",
      ].join(", "),
    ).length !== 0
    || !failure.contains(heading)
    || !failure.contains(retry)
    || placement === null
    || manualRecoveryPlacement === null
    || manualRecoveryPlacement.anchor.nextElementSibling !== failure
    || failure.previousElementSibling !== manualRecoveryPlacement.anchor
    || failure.parentElement !== placement.stack
    || exports.length !== 1
    || exportCard === undefined
    || exportCard.parentElement !== placement.stack
    || failure.nextElementSibling !== exportCard
    || exportCard.previousElementSibling !== failure
  ) {
    throw new Error("The exact confirmed import recovery destination is unavailable.");
  }
  return heading;
}

export function focusDashboardImportDestination(
  root: HTMLElement,
  continuation: DashboardImportContinuation,
): void {
  const target = continuation.kind === "import"
    ? importDestination(root)
    : confirmedRecoveryDestination(root, continuation.receiptId);
  focusChromeSafeElement(root, target, "start");
  if (document.activeElement !== target) {
    throw new Error("The exact import destination could not receive focus.");
  }
}

export function showDashboardImportContinuationFailure(root: HTMLElement): void {
  const errors = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-dashboard-import-continuation-error]",
  ));
  const error = errors[0];
  if (errors.length !== 1 || error === undefined) {
    throw new Error("Dashboard import continuation failure has no stable alert surface.");
  }
  error.textContent = "Hermes could not safely open the exact import step. Nothing was read or saved. Refresh Dashboard and try again.";
  error.hidden = false;
  focusChromeSafeElement(root, error, "nearest");
}
