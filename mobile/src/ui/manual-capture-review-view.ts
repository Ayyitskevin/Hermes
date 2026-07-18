import type {
  ManualCaptureReviewContinuation,
} from "../application/manual-capture-review-continuation";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { reviewTradeAction } from "./trade-review-sheet";

export interface ManualCaptureReviewViewActions {
  readonly dismiss: () => void;
}

export interface ManualCaptureReviewFailureActions {
  readonly retry: () => Promise<void>;
}

const manualCaptureBindings = new WeakMap<HTMLElement, AbortController>();

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function assetClassLabel(trade: TradePreview): "Stock" | "ETF" {
  return trade.assetClass === "etf" ? "ETF" : "Stock";
}

function actionLabel(trade: TradePreview): string {
  if (trade.reviewStatus === "pending") return "Review trade";
  if (trade.reviewStatus === "draft") return "Continue draft";
  return "Open completed review";
}

export function focusManualCaptureElement(
  root: HTMLElement,
  target: HTMLElement,
  block: "start" | "nearest" = "start",
): void {
  const topbar = root.querySelector<HTMLElement>(".topbar");
  const topbarRect = topbar?.getBoundingClientRect();
  const topbarPosition = topbar === null
    ? "static"
    : window.getComputedStyle(topbar).position;
  const topBoundary = (
    (topbarPosition === "sticky" || topbarPosition === "fixed")
    && topbarRect !== undefined
    && topbarRect.bottom > 0
  ) ? topbarRect.bottom : 0;
  const tabbar = root.querySelector<HTMLElement>(".tabbar");
  const tabbarRect = tabbar?.getBoundingClientRect();
  const tabbarPosition = tabbar === null
    ? "static"
    : window.getComputedStyle(tabbar).position;
  const bottomBoundary = (
    (tabbarPosition === "sticky" || tabbarPosition === "fixed")
    && tabbarRect !== undefined
    && tabbarRect.top < window.innerHeight
  ) ? tabbarRect.top : window.innerHeight;
  const margin = 12;
  const minimumTop = topBoundary + margin;
  const maximumBottom = bottomBoundary - margin;
  target.style.scrollMarginTop = `${Math.ceil(minimumTop)}px`;
  target.style.scrollMarginBottom = `${Math.ceil(Math.max(0, window.innerHeight - maximumBottom))}px`;
  target.scrollIntoView({ behavior: "auto", block });
  const rect = target.getBoundingClientRect();
  const availableHeight = Math.max(0, maximumBottom - minimumTop);
  const desiredTop = rect.height > availableHeight || block === "start"
    ? minimumTop
    : Math.min(Math.max(rect.top, minimumTop), maximumBottom - rect.height);
  const delta = rect.top - desiredTop;
  if (Math.abs(delta) > 1) {
    window.scrollBy({ top: delta, left: 0, behavior: "auto" });
  }
  target.focus({ preventScroll: true });
}

function resolveTargets(
  snapshot: JournalWorkspaceSnapshot,
  continuation: ManualCaptureReviewContinuation,
): readonly TradePreview[] {
  if (snapshot.provenance !== "local") {
    throw new Error("Manual capture review guidance is available only in the private journal.");
  }
  if (
    continuation.tradeSubjectIds.length < 1
    || continuation.tradeSubjectIds.length > 2
    || new Set(continuation.tradeSubjectIds).size !== continuation.tradeSubjectIds.length
  ) {
    throw new Error("Manual capture review targets are inconsistent.");
  }
  const targets = continuation.tradeSubjectIds.map((tradeSubjectId) => {
    const matches = snapshot.trades.filter((trade) => (
      trade.tradeSubjectId === tradeSubjectId
      && trade.accountId === continuation.accountId
      && trade.executions.filter((execution) => (
        execution.executionId === continuation.executionId
      )).length === 1
    ));
    if (matches.length !== 1) {
      throw new Error("A manual capture review target is stale or ambiguous.");
    }
    return matches[0]!;
  });
  const scopeOrder = continuation.scope.evidence
    .map((evidence) => evidence.trade.tradeSubjectId)
    .filter((tradeSubjectId) => continuation.tradeSubjectIds.includes(tradeSubjectId));
  if (
    continuation.scope.state.accountId !== continuation.accountId
    || continuation.scope.accountLabel !== continuation.accountLabel
    || scopeOrder.some((tradeSubjectId, index) => (
      tradeSubjectId !== continuation.tradeSubjectIds[index]
    ))
    || scopeOrder.length !== targets.length
  ) {
    throw new Error("Manual capture review guidance no longer matches its exact account scope.");
  }
  return Object.freeze(targets);
}

function targetRow(trade: TradePreview, position: number): string {
  const state = `${titleCase(trade.side)} · ${titleCase(trade.status)} · ${titleCase(trade.reviewStatus)}`;
  return `<article class="trade-row manual-capture-review-row" data-manual-capture-review-trade="${escapeHtml(trade.tradeSubjectId)}" data-manual-capture-review-position="${position}">
    <div class="trade-row-identity"><h3>${escapeHtml(trade.symbol)}</h3><span>${assetClassLabel(trade)} · ${escapeHtml(trade.accountLabel)} · ${escapeHtml(trade.sessionLabel)}</span><span>${escapeHtml(state)}</span></div>
    <div class="trade-row-action">${reviewTradeAction(trade, actionLabel(trade), "manual-capture-review")}</div>
  </article>`;
}

export function manualCaptureReviewSection(
  snapshot: JournalWorkspaceSnapshot,
  continuation: ManualCaptureReviewContinuation,
): string {
  const targets = resolveTargets(snapshot, continuation);
  const replay = continuation.outcome === "duplicate"
    ? " This execution was already saved; no duplicate was created."
    : "";
  return `<article class="card manual-capture-review" data-manual-capture-review-continuation aria-labelledby="manual-capture-review-title">
    <p class="card-label">MANUAL CAPTURE · SAVED</p>
    <h2 id="manual-capture-review-title" data-manual-capture-review-title tabindex="-1">Review trades linked to this execution</h2>
    <p>Hermes rebuilt the journal from the complete ledger. This exact execution links to ${countNoun(targets.length, "current trade")} in ${escapeHtml(continuation.accountLabel)}.${escapeHtml(replay)}</p>
    <p class="helper-text">The account view still contains all ${countNoun(continuation.scope.evidence.length, "current trade")} in this account. Temporary dates, day, search, and card filters were cleared. Dashboard and governed Reports remain whole-workspace.</p>
    <div class="trade-list manual-capture-review-list">${targets.map(targetRow).join("")}</div>
    <div class="quick-actions"><button class="text-button" type="button" data-manual-capture-review-dismiss>Dismiss saved execution guide</button></div>
  </article>`;
}

function showTamperFailure(root: HTMLElement, section: HTMLElement): void {
  section.querySelector("[data-manual-capture-review-open-error]")?.remove();
  const error = document.createElement("p");
  error.className = "form-error";
  error.dataset.manualCaptureReviewOpenError = "";
  error.setAttribute("role", "alert");
  error.tabIndex = -1;
  error.textContent = "Hermes could not open that exact linked trade. Refresh Trades and try again.";
  section.append(error);
  focusManualCaptureElement(root, error, "nearest");
}

export function bindManualCaptureReviewView(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
  continuation: ManualCaptureReviewContinuation,
  actions: ManualCaptureReviewViewActions,
): void {
  manualCaptureBindings.get(root)?.abort();
  const binding = new AbortController();
  manualCaptureBindings.set(root, binding);
  const sections = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-manual-capture-review-continuation]",
  ));
  if (sections.length === 0) return;
  const headings = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-manual-capture-review-title]",
  ));
  const dismissButtons = Array.from(root.querySelectorAll<HTMLButtonElement>(
    "button[data-manual-capture-review-dismiss]",
  ));
  const rows = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-manual-capture-review-trade]",
  ));
  const section = sections[0];
  const heading = headings[0];
  const dismiss = dismissButtons[0];
  const targets = resolveTargets(snapshot, continuation);
  if (
    sections.length !== 1
    || headings.length !== 1
    || dismissButtons.length !== 1
    || section === undefined
    || heading === undefined
    || dismiss === undefined
    || !root.contains(section)
    || !section.contains(heading)
    || !section.contains(dismiss)
    || heading.id !== "manual-capture-review-title"
    || rows.length !== targets.length
  ) {
    throw new Error("The manual capture review continuation structure is inconsistent.");
  }
  const expectedButtons = rows.map((row, index) => {
    const target = targets[index];
    const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>(
      "button[data-review-trade]",
    ));
    const button = buttons[0];
    if (
      target === undefined
      || buttons.length !== 1
      || button === undefined
      || !section.contains(row)
      || row.dataset.manualCaptureReviewTrade !== target.tradeSubjectId
      || row.dataset.manualCaptureReviewPosition !== String(index)
      || button.dataset.reviewTrade !== target.tradeSubjectId
      || !row.contains(button)
    ) {
      throw new Error("A manual capture review action is inconsistent.");
    }
    return button;
  });
  const expectedByButton = new Map(expectedButtons.map((button, index) => (
    [button, targets[index]!.tradeSubjectId]
  )));

  root.addEventListener("click", (event) => {
    const eventTarget = event.target;
    const trigger = eventTarget instanceof Element
      ? eventTarget.closest<HTMLButtonElement>("button[data-review-trade]")
      : null;
    if (trigger === null || trigger.closest("[data-manual-capture-review-continuation]") !== section) {
      return;
    }
    const expected = expectedByButton.get(trigger);
    const row = trigger.closest<HTMLElement>("[data-manual-capture-review-trade]");
    if (
      expected === undefined
      || !trigger.isConnected
      || !section.contains(trigger)
      || row === null
      || row.dataset.manualCaptureReviewTrade !== expected
      || trigger.dataset.reviewTrade !== expected
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showTamperFailure(root, section);
    }
  }, { capture: true, signal: binding.signal });
  dismiss.addEventListener("click", actions.dismiss, { signal: binding.signal });
}

export function manualCaptureReviewFailure(): string {
  return `<article class="card form-error manual-capture-review-failure" data-manual-capture-review-failure aria-labelledby="manual-capture-review-failure-title" aria-describedby="manual-capture-review-failure-copy">
    <p class="card-label">MANUAL CAPTURE · SAVE CONFIRMED</p>
    <h2 id="manual-capture-review-failure-title" data-manual-capture-review-failure-title tabindex="-1">Execution saved; review continuation needs attention</h2>
    <p id="manual-capture-review-failure-copy"><strong>Execution saved, but Hermes could not reconcile its exact current trade.</strong> No Trades scope changed. Retry only the review continuation; do not save the execution again.</p>
    <button class="secondary-button" type="button" data-manual-capture-review-retry>Retry review continuation</button>
    <p class="helper-text" data-manual-capture-review-retry-status role="status" aria-live="polite"></p>
  </article>`;
}

export function bindManualCaptureReviewFailure(
  root: HTMLElement,
  actions: ManualCaptureReviewFailureActions,
): void {
  const failures = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-manual-capture-review-failure]",
  ));
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(
    "button[data-manual-capture-review-retry]",
  ));
  const statuses = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-manual-capture-review-retry-status]",
  ));
  const failure = failures[0];
  const button = buttons[0];
  const status = statuses[0];
  if (
    failures.length !== 1
    || buttons.length !== 1
    || statuses.length !== 1
    || failure === undefined
    || button === undefined
    || status === undefined
    || !root.contains(failure)
    || !failure.contains(button)
    || !failure.contains(status)
  ) {
    throw new Error("The manual capture review retry structure is inconsistent.");
  }
  let retrying = false;
  button.addEventListener("click", async () => {
    if (retrying) return;
    retrying = true;
    failure.setAttribute("aria-busy", "true");
    button.disabled = true;
    button.textContent = "Retrying…";
    status.textContent = "Retrying the confirmed execution’s review continuation.";
    try {
      await actions.retry();
      if (!root.contains(failure)) return;
      retrying = false;
      failure.removeAttribute("aria-busy");
      button.disabled = false;
      button.textContent = "Retry review continuation";
      status.textContent = "Review continuation is still pending. Try again.";
    } catch {
      if (!root.contains(failure)) return;
      retrying = false;
      failure.removeAttribute("aria-busy");
      button.disabled = false;
      button.textContent = "Retry review continuation";
      status.textContent = "Review continuation retry could not finish. Try again.";
    }
  });
}
