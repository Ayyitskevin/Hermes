import type { JournalWorkspaceSnapshot } from "../core/types";
import type {
  JournalImportReceipt,
  JournalImportReviewEvidence,
} from "./journal-store";
import { reconcileImportReceipt } from "./import-receipt-reconciliation";
import {
  resolveExecutionReviewTargets,
  validExecutionReviewIdentity,
} from "./execution-review-continuation";
import type { TradeBrowserResult } from "./trade-browser";

export type ImportReceiptReviewEvidence = Readonly<Pick<
  JournalImportReviewEvidence,
  "receipt" | "occurrenceExecutionIds"
>>;

export interface ImportReceiptReviewContinuation {
  readonly receiptId: string;
  readonly accountId: string;
  readonly accountLabel: string;
  readonly sourceLabel: string;
  readonly importedAtLabel: string;
  readonly acceptedRows: number;
  readonly executionVersions: number;
  readonly alreadyPresentRows: number;
  readonly occurrenceCount: number;
  readonly uniqueExecutionCount: number;
  /** Canonical account-scope order; several accepted rows may resolve to one subject. */
  readonly tradeSubjectIds: readonly string[];
  readonly scope: TradeBrowserResult;
}

function receiptFactsMatch(
  receipt: JournalImportReceipt,
  visible: JournalWorkspaceSnapshot["importHistory"][number],
): boolean {
  return visible.receiptId === receipt.id
    && visible.accountLabel === receipt.accountName
    && visible.sourceLabel === receipt.sourceName
    && visible.executions === receipt.acceptedRows
    && visible.sourceRows === receipt.sourceRows
    && visible.acceptedRows === receipt.acceptedRows
    && visible.executionVersions === receipt.executionCount
    && visible.rejectedRows === receipt.rejectedRows
    && visible.skippedRows === receipt.skippedRows
    && visible.warningCount === receipt.warningCount
    && visible.rolledBack === (receipt.rolledBackAtUs !== null)
    && (visible.rolledBackAtLabel !== null) === (receipt.rolledBackAtUs !== null);
}

/**
 * Reconciles an active immutable receipt to exact current review subjects.
 *
 * Occurrence identity is conserved before execution and subject deduplication.
 * The receipt's counts, the read-only adapter evidence, and the visible current
 * projection must all agree or the continuation fails closed.
 */
export function buildImportReceiptReviewContinuation(
  snapshot: JournalWorkspaceSnapshot,
  evidence: ImportReceiptReviewEvidence,
): ImportReceiptReviewContinuation {
  if (snapshot.provenance !== "local") {
    throw new Error("Import receipt review continuation requires a private local journal.");
  }
  const receipt = evidence.receipt;
  if (
    receipt.id.length === 0
    || receipt.id.trim() !== receipt.id
    || [...receipt.id].length > 256
  ) {
    throw new Error("Import receipt review continuation requires a valid receipt identity.");
  }
  const visibleMatches = snapshot.importHistory.filter((item) => item.receiptId === receipt.id);
  const visible = visibleMatches[0];
  if (
    visibleMatches.length !== 1
    || visible === undefined
    || !receiptFactsMatch(receipt, visible)
  ) {
    throw new Error("The immutable receipt evidence does not match the visible journal history.");
  }
  const reconciliation = reconcileImportReceipt(visible);
  if (receipt.rolledBackAtUs !== null || visible.rolledBack) {
    throw new Error("Review continuation requires one active receipt.");
  }
  if (reconciliation.acceptedRows === 0) {
    throw new Error("Review continuation requires at least one accepted receipt row.");
  }
  if (
    evidence.occurrenceExecutionIds.length !== reconciliation.acceptedRows
    || !Number.isSafeInteger(evidence.occurrenceExecutionIds.length)
  ) {
    throw new Error("Accepted occurrence identities do not reconcile with the receipt.");
  }
  if (!evidence.occurrenceExecutionIds.every(validExecutionReviewIdentity)) {
    throw new Error("Import receipt review continuation requires a valid execution identity.");
  }
  const uniqueExecutionIds = [...new Set(evidence.occurrenceExecutionIds)];
  if (
    uniqueExecutionIds.length < reconciliation.executionVersions
    || uniqueExecutionIds.length > reconciliation.acceptedRows
  ) {
    throw new Error("Unique receipt executions do not reconcile with accepted row outcomes.");
  }

  const targets = resolveExecutionReviewTargets(
    snapshot,
    uniqueExecutionIds,
    receipt.accountId,
  );
  if (targets.accountLabel !== receipt.accountName) {
    throw new Error("The receipt account label does not match its exact current account scope.");
  }

  return Object.freeze({
    receiptId: receipt.id,
    accountId: targets.accountId,
    accountLabel: targets.accountLabel,
    sourceLabel: receipt.sourceName,
    importedAtLabel: visible.importedAtLabel,
    acceptedRows: reconciliation.acceptedRows,
    executionVersions: reconciliation.executionVersions,
    alreadyPresentRows: reconciliation.alreadyPresentRows,
    occurrenceCount: evidence.occurrenceExecutionIds.length,
    uniqueExecutionCount: uniqueExecutionIds.length,
    tradeSubjectIds: targets.tradeSubjectIds,
    scope: targets.scope,
  });
}
