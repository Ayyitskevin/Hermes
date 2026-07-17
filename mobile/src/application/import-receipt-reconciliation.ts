import type { ImportHistoryPreview } from "../core/types";

export interface ImportReceiptReconciliation {
  readonly sourceRows: number;
  readonly acceptedRows: number;
  readonly rejectedRows: number;
  readonly skippedRows: number;
  readonly warningCount: number;
  readonly executionVersions: number;
  readonly alreadyPresentRows: number;
  readonly otherWarningCount: number;
}

function requireCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

export function reconcileImportReceipt(
  receipt: ImportHistoryPreview,
): Readonly<ImportReceiptReconciliation> {
  if (receipt.receiptId.length === 0 || receipt.receiptId.trim() !== receipt.receiptId) {
    throw new Error("Import history requires one nonempty receipt identity.");
  }
  const sourceRows = requireCount(receipt.sourceRows, "Source rows");
  const acceptedRows = requireCount(receipt.acceptedRows, "Accepted rows");
  const rejectedRows = requireCount(receipt.rejectedRows, "Rejected rows");
  const skippedRows = requireCount(receipt.skippedRows, "Skipped rows");
  const warningCount = requireCount(receipt.warningCount, "Warnings");
  const executionVersions = requireCount(receipt.executionVersions, "Execution versions");
  if (receipt.executions !== acceptedRows) {
    throw new Error("The compatibility accepted-row count is inconsistent.");
  }
  const categorizedRows = acceptedRows + rejectedRows + skippedRows;
  if (!Number.isSafeInteger(categorizedRows) || categorizedRows !== sourceRows) {
    throw new Error("Import source rows do not reconcile with accepted, rejected, and skipped rows.");
  }
  if (executionVersions > acceptedRows) {
    throw new Error("Import execution versions exceed accepted rows.");
  }
  const alreadyPresentRows = acceptedRows - executionVersions;
  if (warningCount < alreadyPresentRows) {
    throw new Error("Import warnings omit accepted rows that were already present.");
  }
  if (receipt.rolledBack !== (receipt.rolledBackAtLabel !== null)) {
    throw new Error("Import rollback state and timestamp label are inconsistent.");
  }
  return Object.freeze({
    sourceRows,
    acceptedRows,
    rejectedRows,
    skippedRows,
    warningCount,
    executionVersions,
    alreadyPresentRows,
    otherWarningCount: warningCount - alreadyPresentRows,
  });
}
