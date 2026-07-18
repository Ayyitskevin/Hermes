import { reconcileImportReceipt } from "../application/import-receipt-reconciliation";
import { escapeHtml } from "../core/html";
import type { ImportHistoryPreview, JournalWorkspaceSnapshot } from "../core/types";
import { focusChromeSafeElement } from "./focus-chrome-safe";

export interface ImportReceiptReviewActions {
  readonly openReceipt: (receiptId: string) => Promise<void>;
}

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function latestImportReceiptCard(snapshot: JournalWorkspaceSnapshot): string {
  const receipt = snapshot.importHistory[0];
  if (receipt === undefined) return "";
  const reconciliation = reconcileImportReceipt(receipt);
  return `<article class="card import-receipt">
    <p class="card-label">${receipt.rolledBack ? "LATEST RECEIPT · ROLLED BACK" : "LATEST IMPORT RECEIPT"}</p>
    <h2>${escapeHtml(receipt.sourceLabel)}</h2>
    <p>${escapeHtml(receipt.importedAtLabel)} · ${escapeHtml(receipt.accountLabel)}</p>
    <div class="receipt-metrics">
      <div><strong>${reconciliation.acceptedRows}</strong><span>accepted ${reconciliation.acceptedRows === 1 ? "row" : "rows"}</span></div>
      <div><strong>${reconciliation.executionVersions}</strong><span>new or restored</span></div>
      <div><strong>${reconciliation.rejectedRows}</strong><span>rejected</span></div>
      <div><strong>${reconciliation.skippedRows}</strong><span>skipped</span></div>
    </div>
  </article>`;
}

function reconciliationDisclosure(
  receipt: ImportHistoryPreview,
  allowReview: boolean,
  positionLabel: string,
): string {
  const value = reconcileImportReceipt(receipt);
  const qualifiedLabel = `Reconcile receipt for ${receipt.sourceLabel}, ${receipt.accountLabel}, ${receipt.importedAtLabel}, ${positionLabel}`;
  return `<details class="import-receipt-disclosure">
    <summary aria-label="${escapeHtml(qualifiedLabel)}">Reconcile receipt</summary>
    <dl class="import-receipt-grid">
      <div><dt>Source rows</dt><dd>${value.sourceRows}</dd></div>
      <div><dt>Accepted</dt><dd>${value.acceptedRows}</dd></div>
      <div><dt>Rejected</dt><dd>${value.rejectedRows}</dd></div>
      <div><dt>Skipped</dt><dd>${value.skippedRows}</dd></div>
      <div><dt>New or restored</dt><dd>${value.executionVersions}</dd></div>
      <div><dt>Already present</dt><dd>${value.alreadyPresentRows}</dd></div>
      <div><dt>Warnings</dt><dd>${value.warningCount}</dd></div>
      <div><dt>Other preview warnings</dt><dd>${value.otherWarningCount}</dd></div>
    </dl>
    <p>${countNoun(value.sourceRows, "source row")} = ${value.acceptedRows} accepted + ${value.rejectedRows} rejected + ${value.skippedRows} skipped.</p>
    <p>${countNoun(value.acceptedRows, "accepted row")} = ${countNoun(value.executionVersions, "new or restored execution version")} + ${value.alreadyPresentRows} already present.</p>
    <p>${countNoun(value.warningCount, "warning")} = ${countNoun(value.alreadyPresentRows, "already-present warning")} + ${countNoun(value.otherWarningCount, "other preview warning")}.</p>
    <p class="helper-text">Accepted rows already present are linked to this immutable receipt without being relabeled as newly written versions.</p>
    ${allowReview ? `<button class="secondary-button" type="button" data-review-import-receipt="${escapeHtml(receipt.receiptId)}" aria-label="Review trades linked to ${escapeHtml(receipt.sourceLabel)}, ${escapeHtml(receipt.accountLabel)}, ${escapeHtml(receipt.importedAtLabel)}, ${positionLabel}">Review linked trades</button>` : ""}
  </details>`;
}

function importReceiptHistoryCard(
  receipt: ImportHistoryPreview,
  index: number,
  total: number,
  allowRollback: boolean,
): string {
  const reconciliation = reconcileImportReceipt(receipt);
  const headingId = `import-receipt-heading-${index}`;
  const positionLabel = `receipt ${index + 1} of ${total}`;
  const state = receipt.rolledBack ? "ROLLED BACK" : "COMMITTED";
  const rollbackHistory = receipt.rolledBack
    ? `<p>${escapeHtml(receipt.rolledBackAtLabel ?? "")} · The immutable receipt remains in history.</p>`
    : allowRollback
      ? `<p>Rollback deactivates only execution versions no longer covered by another active receipt.</p>`
      : `<p>This fictional receipt is read-only. Rollback is available only in your private journal.</p>`;
  return `<article class="card import-history-row" data-import-receipt="${escapeHtml(receipt.receiptId)}" aria-labelledby="${headingId}">
    <div class="section-title"><div><p class="card-label">${state}</p><h3 id="${headingId}" data-import-receipt-heading="${escapeHtml(receipt.receiptId)}" tabindex="-1">${escapeHtml(receipt.sourceLabel)}<span class="sr-only"> · ${state.toLowerCase()} · ${positionLabel}</span></h3></div><strong>${countNoun(reconciliation.acceptedRows, "accepted row")}</strong></div>
    <p>${escapeHtml(receipt.importedAtLabel)} · ${escapeHtml(receipt.accountLabel)} · ${countNoun(reconciliation.warningCount, "warning")} · ${reconciliation.skippedRows} skipped</p>
    ${reconciliationDisclosure(receipt, allowRollback && !receipt.rolledBack, positionLabel)}
    ${rollbackHistory}
    ${allowRollback && !receipt.rolledBack ? `<button class="text-button" type="button" data-rollback-receipt="${escapeHtml(receipt.receiptId)}" aria-label="Roll back ${escapeHtml(receipt.sourceLabel)} from ${escapeHtml(receipt.accountLabel)}, ${escapeHtml(receipt.importedAtLabel)}, ${positionLabel}">Roll back this import</button>` : ""}
  </article>`;
}

export function importReceiptHistorySection(snapshot: JournalWorkspaceSnapshot): string {
  if (snapshot.importHistory.length === 0) return "";
  const allowRollback = snapshot.provenance === "local";
  return `<section aria-labelledby="import-history-title">
    <div class="section-title"><h2 id="import-history-title">Import history</h2><span>${countNoun(snapshot.importHistory.length, "receipt")}</span></div>
    <div class="journal-list">${snapshot.importHistory.map((receipt, index) => (
      importReceiptHistoryCard(receipt, index, snapshot.importHistory.length, allowRollback)
    )).join("")}</div>
  </section>`;
}

export function focusImportReceiptAfterRefresh(
  root: HTMLElement,
  receiptId: string,
): void {
  const matching = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-import-receipt-heading]",
  )).filter((heading) => heading.dataset.importReceiptHeading === receiptId);
  const target = matching.length === 1
    ? matching[0] ?? null
    : root.querySelector<HTMLElement>("#screen");
  if (target === null) return;
  if (matching.length === 1) {
    focusChromeSafeElement(root, target);
    return;
  }
  target.focus({ preventScroll: true });
}

function showReceiptReviewFailure(
  root: HTMLElement,
  row: HTMLElement,
): void {
  row.querySelector("[data-import-receipt-review-action-error]")?.remove();
  const error = document.createElement("p");
  error.className = "form-error";
  error.dataset.importReceiptReviewActionError = "";
  error.setAttribute("role", "alert");
  error.tabIndex = -1;
  error.textContent = "Hermes could not safely open that exact receipt continuation. Reconcile the receipt and try again.";
  row.append(error);
  focusChromeSafeElement(root, error, "nearest");
}

export function bindImportReceiptReviewActions(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
  actions: ImportReceiptReviewActions,
): void {
  const eligible = snapshot.provenance === "local"
    ? snapshot.importHistory.filter((receipt) => !receipt.rolledBack)
    : [];
  const eligibleIds = new Set(eligible.map((receipt) => receipt.receiptId));
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(
    "button[data-review-import-receipt]",
  ));
  if (buttons.length !== eligible.length || eligibleIds.size !== eligible.length) {
    throw new Error("Import receipt review actions do not reconcile with active receipt history.");
  }
  for (const button of buttons) {
    const receiptId = button.dataset.reviewImportReceipt;
    const row = button.closest<HTMLElement>("[data-import-receipt]");
    const disclosure = button.closest<HTMLElement>(".import-receipt-disclosure");
    const rollbackButtons = row === null ? [] : Array.from(
      row.querySelectorAll<HTMLButtonElement>("button[data-rollback-receipt]"),
    );
    const rollback = rollbackButtons[0];
    if (
      receiptId === undefined
      || !eligibleIds.has(receiptId)
      || row === null
      || row.dataset.importReceipt !== receiptId
      || disclosure === null
      || !row.contains(disclosure)
      || rollbackButtons.length !== 1
      || rollback === undefined
      || rollback.dataset.rollbackReceipt !== receiptId
    ) {
      throw new Error("An import receipt review action is inconsistent.");
    }
    button.addEventListener("click", async () => {
      if (
        !button.isConnected
        || button.dataset.reviewImportReceipt !== receiptId
        || row.dataset.importReceipt !== receiptId
      ) {
        showReceiptReviewFailure(root, row);
        return;
      }
      button.disabled = true;
      rollback.disabled = true;
      try {
        await actions.openReceipt(receiptId);
        if (button.isConnected) {
          button.disabled = false;
          rollback.disabled = false;
        }
      } catch {
        if (!row.isConnected) return;
        button.disabled = false;
        rollback.disabled = false;
        showReceiptReviewFailure(root, row);
      }
    });
  }
}
