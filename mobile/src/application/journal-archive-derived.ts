import { sha256Hex } from "../adapters/sqlite/schema";
import type { JournalLedgerSnapshot } from "./journal-store";
import {
  canonicalJournalArchiveJson,
  type JournalArchiveJson,
  type JournalArchiveSummary,
} from "./journal-archive";

export interface JournalArchiveHistoryCounts {
  readonly executionVersions: string;
  readonly importReceipts: string;
  readonly rolledBackImports: string;
  readonly reviewVersions: string;
  readonly reviewTerms: string;
  readonly playbooks: string;
}

export function journalArchiveReportSha256(ledger: JournalLedgerSnapshot): string {
  return sha256Hex(canonicalJournalArchiveJson({
    digestVersion: "hermes-report-input-v1",
    ledger,
  } as unknown as JournalArchiveJson));
}

export function journalArchiveSummary(
  ledger: JournalLedgerSnapshot,
  history: JournalArchiveHistoryCounts,
): JournalArchiveSummary {
  return Object.freeze({
    workspaceName: ledger.workspace?.name ?? null,
    currency: ledger.workspace?.defaultCurrency ?? null,
    timeZone: ledger.workspace?.timeZone ?? null,
    accounts: String(ledger.accounts.length),
    activeExecutions: String(ledger.executions.length),
    executionVersions: history.executionVersions,
    importReceipts: history.importReceipts,
    rolledBackImports: history.rolledBackImports,
    currentReviews: String(ledger.tradeReviews.length),
    reviewVersions: history.reviewVersions,
    reviewTerms: history.reviewTerms,
    playbooks: history.playbooks,
    attachments: "0",
    attachmentBytes: "0",
  });
}
