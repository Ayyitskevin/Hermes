import type {
  ImportReceiptReviewContinuation,
} from "../application/import-receipt-review-continuation";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { focusChromeSafeElement } from "./focus-chrome-safe";
import { reviewTradeAction } from "./trade-review-sheet";

export const IMPORT_RECEIPT_REVIEW_PAGE_SIZE = 10;

export interface ImportReceiptReviewViewActions {
  readonly dismiss: () => void;
  readonly previousPage: () => void;
  readonly nextPage: () => void;
}

export interface ImportReceiptReviewFailureActions {
  readonly retry: () => Promise<void>;
  readonly dismiss: () => void;
}

export interface ImportReceiptReviewFailureContext {
  readonly receiptId: string;
  readonly sourceLabel: string;
  readonly accountLabel: string;
  readonly importedAtLabel: string;
  readonly origin: "confirmed-post-commit" | "history-review";
}

const importReceiptReviewBindings = new WeakMap<HTMLElement, AbortController>();

export function clearImportReceiptReviewViewBindings(root: HTMLElement): void {
  importReceiptReviewBindings.get(root)?.abort();
  importReceiptReviewBindings.delete(root);
}

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function actionLabel(trade: TradePreview, position: number, total: number): string {
  const action = trade.reviewStatus === "pending"
    ? "Review trade"
    : trade.reviewStatus === "draft" ? "Continue draft" : "Open completed review";
  return `${action} · ${position} of ${total}`;
}

function resolveTargets(
  snapshot: JournalWorkspaceSnapshot,
  continuation: ImportReceiptReviewContinuation,
): readonly TradePreview[] {
  if (snapshot.provenance !== "local") {
    throw new Error("Import receipt review guidance is available only in the private journal.");
  }
  if (
    continuation.tradeSubjectIds.length < 1
    || new Set(continuation.tradeSubjectIds).size !== continuation.tradeSubjectIds.length
  ) {
    throw new Error("Import receipt review targets are inconsistent.");
  }
  const targetIds = new Set(continuation.tradeSubjectIds);
  const bySubject = new Map<string, TradePreview>();
  for (const trade of snapshot.trades) {
    if (
      trade.accountId !== continuation.accountId
      || !targetIds.has(trade.tradeSubjectId)
    ) continue;
    if (bySubject.has(trade.tradeSubjectId)) {
      throw new Error("An import receipt review target is stale or ambiguous.");
    }
    bySubject.set(trade.tradeSubjectId, trade);
  }
  const targets = continuation.tradeSubjectIds.map((tradeSubjectId) => {
    const target = bySubject.get(tradeSubjectId);
    if (target === undefined) {
      throw new Error("An import receipt review target is stale or ambiguous.");
    }
    return target;
  });
  const scopeOrder = continuation.scope.evidence
    .map((evidence) => evidence.trade.tradeSubjectId)
    .filter((tradeSubjectId) => targetIds.has(tradeSubjectId));
  if (
    continuation.scope.state.accountId !== continuation.accountId
    || continuation.scope.accountLabel !== continuation.accountLabel
    || scopeOrder.length !== targets.length
    || scopeOrder.some((tradeSubjectId, index) => (
      tradeSubjectId !== continuation.tradeSubjectIds[index]
    ))
  ) {
    throw new Error("Import receipt review guidance no longer matches its exact account scope.");
  }
  return Object.freeze(targets);
}

function pageBounds(
  total: number,
  pageStart: number,
): Readonly<{ start: number; end: number }> {
  if (
    !Number.isSafeInteger(pageStart)
    || pageStart < 0
    || pageStart >= total
    || pageStart % IMPORT_RECEIPT_REVIEW_PAGE_SIZE !== 0
  ) {
    throw new Error("Import receipt review pagination is invalid.");
  }
  return Object.freeze({
    start: pageStart,
    end: Math.min(total, pageStart + IMPORT_RECEIPT_REVIEW_PAGE_SIZE),
  });
}

function targetRow(trade: TradePreview, index: number, total: number): string {
  const position = index + 1;
  const state = `${titleCase(trade.side)} · ${titleCase(trade.status)} · ${titleCase(trade.reviewStatus)}`;
  const assetClass = trade.assetClass === "etf" ? "ETF" : "Stock";
  return `<article class="trade-row import-receipt-review-row" data-import-receipt-review-trade="${escapeHtml(trade.tradeSubjectId)}" data-import-receipt-review-position="${index}">
    <div class="trade-row-identity"><h3>${escapeHtml(trade.symbol)}</h3><span>${assetClass} · ${escapeHtml(trade.accountLabel)} · ${escapeHtml(trade.sessionLabel)}</span><span>${escapeHtml(state)} · ${position} of ${total}</span></div>
    <div class="trade-row-action">${reviewTradeAction(
      trade,
      actionLabel(trade, position, total),
      "import-receipt-review",
    )}</div>
  </article>`;
}

export function importReceiptReviewSection(
  snapshot: JournalWorkspaceSnapshot,
  continuation: ImportReceiptReviewContinuation,
  pageStart: number,
): string {
  const targets = resolveTargets(snapshot, continuation);
  const page = pageBounds(targets.length, pageStart);
  const visibleTargets = targets.slice(page.start, page.end);
  const previousCount = Math.min(IMPORT_RECEIPT_REVIEW_PAGE_SIZE, page.start);
  const nextCount = Math.min(
    IMPORT_RECEIPT_REVIEW_PAGE_SIZE,
    targets.length - page.end,
  );
  return `<article class="card import-receipt-review" data-import-receipt-review-continuation="${escapeHtml(continuation.receiptId)}" aria-labelledby="import-receipt-review-title" aria-describedby="import-receipt-review-context">
    <p class="card-label">CSV RECEIPT · RECONCILED</p>
    <h2 id="import-receipt-review-title" data-import-receipt-review-title tabindex="-1">Review trades linked to ${escapeHtml(continuation.sourceLabel)}</h2>
    <p id="import-receipt-review-context">${escapeHtml(continuation.importedAtLabel)} · ${escapeHtml(continuation.accountLabel)}</p>
    <p><strong>${countNoun(continuation.acceptedRows, "accepted row")}</strong> = ${countNoun(continuation.executionVersions, "new or restored execution version")} + ${countNoun(continuation.alreadyPresentRows, "already-present row")}.</p>
    <p>Those exact accepted occurrences resolve to ${countNoun(continuation.uniqueExecutionCount, "stable execution")} and ${countNoun(targets.length, "current trade")} in ${escapeHtml(continuation.accountLabel)}.</p>
    <p class="helper-text">Hermes ordered these targets through the complete all-activity account scope. Several rows or executions may belong to one trade. Generic CSV remains stock-only; no broker or broader asset semantics were inferred.</p>
    <div class="trade-list import-receipt-review-list">${visibleTargets.map((trade, index) => targetRow(trade, page.start + index, targets.length)).join("")}</div>
    <p class="result-count" role="status">Showing ${page.start + 1}${page.end === page.start + 1 ? "" : `–${page.end}`} of ${countNoun(targets.length, "linked trade")}</p>
    <div class="quick-actions">
      ${previousCount > 0 ? `<button class="secondary-button" type="button" data-import-receipt-review-previous>Show previous ${countNoun(previousCount, "linked trade")}</button>` : ""}
      ${nextCount > 0 ? `<button class="secondary-button" type="button" data-import-receipt-review-next>Show next ${countNoun(nextCount, "linked trade")}</button>` : ""}
      <button class="text-button" type="button" data-import-receipt-review-dismiss>Dismiss receipt guide</button>
    </div>
  </article>`;
}

function showTamperFailure(root: HTMLElement, section: HTMLElement): void {
  section.querySelector("[data-import-receipt-review-open-error]")?.remove();
  const error = document.createElement("p");
  error.className = "form-error";
  error.dataset.importReceiptReviewOpenError = "";
  error.setAttribute("role", "alert");
  error.tabIndex = -1;
  error.textContent = "Hermes could not open that exact receipt-linked trade. Refresh the receipt and try again.";
  section.append(error);
  focusChromeSafeElement(root, error, "nearest");
}

export function bindImportReceiptReviewView(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
  continuation: ImportReceiptReviewContinuation,
  pageStart: number,
  actions: ImportReceiptReviewViewActions,
): void {
  clearImportReceiptReviewViewBindings(root);
  const binding = new AbortController();
  importReceiptReviewBindings.set(root, binding);
  const sections = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-import-receipt-review-continuation]",
  ));
  if (sections.length === 0) return;
  const section = sections[0];
  const heading = section?.querySelector<HTMLElement>("[data-import-receipt-review-title]");
  const dismiss = section?.querySelector<HTMLButtonElement>(
    "button[data-import-receipt-review-dismiss]",
  );
  const previous = section?.querySelector<HTMLButtonElement>(
    "button[data-import-receipt-review-previous]",
  ) ?? null;
  const next = section?.querySelector<HTMLButtonElement>(
    "button[data-import-receipt-review-next]",
  ) ?? null;
  const targets = resolveTargets(snapshot, continuation);
  const page = pageBounds(targets.length, pageStart);
  const rows = section === undefined ? [] : Array.from(section.querySelectorAll<HTMLElement>(
    "[data-import-receipt-review-trade]",
  ));
  if (
    sections.length !== 1
    || section === undefined
    || heading == null
    || dismiss == null
    || !root.contains(section)
    || heading.id !== "import-receipt-review-title"
    || section.dataset.importReceiptReviewContinuation !== continuation.receiptId
    || rows.length !== page.end - page.start
    || (page.start > 0) !== (previous !== null)
    || (page.end < targets.length) !== (next !== null)
  ) {
    throw new Error("The import receipt review continuation structure is inconsistent.");
  }
  const expectedByButton = new Map<HTMLButtonElement, string>();
  rows.forEach((row, index) => {
    const targetIndex = page.start + index;
    const target = targets[targetIndex];
    const buttons = Array.from(row.querySelectorAll<HTMLButtonElement>(
      "button[data-review-trade]",
    ));
    const button = buttons[0];
    if (
      target === undefined
      || buttons.length !== 1
      || button === undefined
      || row.dataset.importReceiptReviewTrade !== target.tradeSubjectId
      || row.dataset.importReceiptReviewPosition !== String(targetIndex)
      || button.dataset.reviewTrade !== target.tradeSubjectId
      || !row.contains(button)
    ) {
      throw new Error("An import receipt review action is inconsistent.");
    }
    expectedByButton.set(button, target.tradeSubjectId);
  });

  root.addEventListener("click", (event) => {
    const eventTarget = event.target;
    const trigger = eventTarget instanceof Element
      ? eventTarget.closest<HTMLButtonElement>("button[data-review-trade]")
      : null;
    if (trigger === null || trigger.closest("[data-import-receipt-review-continuation]") !== section) {
      return;
    }
    const expected = expectedByButton.get(trigger);
    const row = trigger.closest<HTMLElement>("[data-import-receipt-review-trade]");
    if (
      expected === undefined
      || !trigger.isConnected
      || row === null
      || row.dataset.importReceiptReviewTrade !== expected
      || trigger.dataset.reviewTrade !== expected
    ) {
      event.preventDefault();
      event.stopImmediatePropagation();
      showTamperFailure(root, section);
    }
  }, { capture: true, signal: binding.signal });
  dismiss.addEventListener("click", actions.dismiss, { signal: binding.signal });
  previous?.addEventListener("click", actions.previousPage, { signal: binding.signal });
  next?.addEventListener("click", actions.nextPage, { signal: binding.signal });
}

export function importReceiptReviewFailure(
  context: ImportReceiptReviewFailureContext,
): string {
  const confirmed = context.origin === "confirmed-post-commit";
  const heading = confirmed
    ? `Import saved; review for ${context.sourceLabel} needs attention`
    : `Review for ${context.sourceLabel} needs attention`;
  const copy = confirmed
    ? `<strong>Do not import ${escapeHtml(context.sourceLabel)} again.</strong> Retry only this exact receipt-to-review continuation; Hermes will not read, prepare, or commit that file again.`
    : `Hermes could not rebuild this exact receipt-to-review continuation. The immutable receipt remains unchanged; retry this guide before deciding whether to add a different CSV.`;
  return `<article class="card form-error import-receipt-review-failure" data-import-receipt-review-failure="${escapeHtml(context.receiptId)}" data-import-receipt-review-failure-origin="${context.origin}" aria-labelledby="import-receipt-review-failure-title" aria-describedby="import-receipt-review-failure-context import-receipt-review-failure-copy">
    <p class="card-label">${confirmed ? "CSV IMPORT · RECEIPT CONFIRMED" : "CSV RECEIPT · REVIEW UNAVAILABLE"}</p>
    <h2 id="import-receipt-review-failure-title" data-import-receipt-review-failure-title tabindex="-1">${escapeHtml(heading)}</h2>
    <p id="import-receipt-review-failure-context">${escapeHtml(context.importedAtLabel)} · ${escapeHtml(context.accountLabel)}</p>
    <p id="import-receipt-review-failure-copy">${copy}</p>
    <div class="quick-actions"><button class="secondary-button" type="button" data-import-receipt-review-retry aria-label="Retry review continuation for ${escapeHtml(context.sourceLabel)}, ${escapeHtml(context.accountLabel)}, ${escapeHtml(context.importedAtLabel)}">Retry review continuation</button>${confirmed ? "" : `<button class="text-button" type="button" data-import-receipt-review-failure-dismiss>Dismiss</button>`}</div>
    <p class="helper-text" data-import-receipt-review-retry-status role="status" aria-live="polite"></p>
  </article>`;
}

export function bindImportReceiptReviewFailure(
  root: HTMLElement,
  context: ImportReceiptReviewFailureContext,
  actions: ImportReceiptReviewFailureActions,
): void {
  const failures = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-import-receipt-review-failure]",
  ));
  const failure = failures[0];
  const retry = failure?.querySelector<HTMLButtonElement>(
    "button[data-import-receipt-review-retry]",
  );
  const dismiss = failure?.querySelector<HTMLButtonElement>(
    "button[data-import-receipt-review-failure-dismiss]",
  ) ?? null;
  const status = failure?.querySelector<HTMLElement>(
    "[data-import-receipt-review-retry-status]",
  );
  if (
    failures.length !== 1
    || failure === undefined
    || retry == null
    || status == null
    || failure.dataset.importReceiptReviewFailure !== context.receiptId
    || failure.dataset.importReceiptReviewFailureOrigin !== context.origin
    || (context.origin === "confirmed-post-commit" ? dismiss !== null : dismiss === null)
  ) {
    throw new Error("The import receipt review retry structure is inconsistent.");
  }
  let retrying = false;
  retry.addEventListener("click", async () => {
    if (retrying) return;
    retrying = true;
    failure.setAttribute("aria-busy", "true");
    retry.disabled = true;
    if (dismiss !== null) dismiss.disabled = true;
    retry.textContent = "Retrying…";
    status.textContent = context.origin === "confirmed-post-commit"
      ? "Reloading only the confirmed receipt continuation."
      : "Reloading only this immutable receipt continuation.";
    try {
      await actions.retry();
      if (!failure.isConnected) return;
      status.textContent = "Review continuation is still pending. Try again.";
    } catch {
      if (!failure.isConnected) return;
      status.textContent = "Review continuation retry could not finish. Try again.";
    }
    retrying = false;
    failure.removeAttribute("aria-busy");
    retry.disabled = false;
    if (dismiss !== null) dismiss.disabled = false;
    retry.textContent = "Retry review continuation";
  });
  dismiss?.addEventListener("click", actions.dismiss);
}
