import type {
  CsvHeaderMapping,
  CsvPreviewIssue,
  GenericCsvPreview,
} from "../core/csv";
import type {
  LedgerExecution,
  TradeNormalizationResult,
} from "../core/ledger";
import type { PreparedManualExecution } from "./prepare-manual-execution";
import type { PreparedTradeReview } from "./prepare-trade-review";
import type { PreparedDailyJournalEntry } from "./prepare-daily-journal";
import type { JournalExportArtifact } from "./journal-archive";
import type { PreparedJournalRestore } from "./journal-restore";

export interface JournalWorkspaceRecord {
  readonly id: string;
  readonly name: string;
  readonly defaultCurrency: string;
  readonly timeZone: string;
}

export interface JournalAccountRecord {
  readonly id: string;
  readonly name: string;
  readonly baseCurrency: string;
}

export interface JournalInstrumentRecord {
  readonly id: string;
  readonly symbol: string;
  readonly assetClass: "stock" | "etf" | "option" | "future" | "forex" | "crypto" | "other";
  readonly quoteCurrency: string;
  readonly multiplier: string;
}

export interface JournalImportReceipt {
  readonly id: string;
  readonly accountId: string;
  readonly accountName: string;
  readonly sourceName: string;
  readonly importedAtUs: string;
  readonly sourceRows: number;
  readonly acceptedRows: number;
  readonly rejectedRows: number;
  readonly skippedRows: number;
  readonly warningCount: number;
  readonly executionCount: number;
  readonly rolledBackAtUs: string | null;
}

export interface JournalTradeSubjectRecord {
  /** Deterministic ID emitted by the pure normalizer for the current projection. */
  readonly projectionTradeId: string;
  /** Durable subject ID retained across projection generations. */
  readonly tradeSubjectId: string;
}

export type JournalReviewTermCategory = "setup" | "mistake" | "emotion" | "tag";

export interface JournalReviewTermRecord {
  readonly id: string;
  readonly category: JournalReviewTermCategory;
  readonly name: string;
}

export type JournalReviewRuleOutcome =
  | "followed"
  | "broken"
  | "not_applicable"
  | "unreviewed";

export interface JournalPlaybookRuleRecord {
  readonly id: string;
  readonly playbookId: string;
  readonly text: string;
}

export interface JournalPlaybookRecord {
  readonly id: string;
  readonly name: string;
  readonly rules: readonly JournalPlaybookRuleRecord[];
}

export interface JournalTradeReviewRuleResult {
  readonly ruleId: string;
  readonly text: string;
  readonly outcome: JournalReviewRuleOutcome;
}

export interface JournalTradeReviewRecord {
  readonly id: string;
  readonly tradeSubjectId: string;
  readonly version: number;
  readonly state: "draft" | "completed";
  readonly revision: string;
  readonly note: string;
  readonly setup: string | null;
  readonly mistakes: readonly string[];
  readonly emotion: string | null;
  readonly tags: readonly string[];
  readonly playbookId: string | null;
  readonly playbookName: string | null;
  readonly rules: readonly JournalTradeReviewRuleResult[];
  readonly initialRisk: {
    readonly amount: string;
    readonly currency: string;
  } | null;
  readonly plannedStop: string | null;
  readonly resultRMetricId: "result-r";
  readonly resultRMetricVersion: 1;
  readonly percentReturnMetricId: "percent-return";
  readonly percentReturnMetricVersion: 1;
  readonly recordedAtUs: string;
  readonly completedAtUs: string | null;
}

export interface JournalDailyEntryRecord {
  readonly id: string;
  readonly isoDate: string;
  readonly version: number;
  readonly state: "draft" | "completed";
  readonly revision: string;
  readonly title: string | null;
  readonly note: string;
  readonly emotion: string | null;
  /** Optional self-report; never a derived performance or Plan Check metric. */
  readonly processScorePct: number | null;
  readonly tags: readonly string[];
  readonly recordedAtUs: string;
  readonly completedAtUs: string | null;
}

export interface JournalLedgerSnapshot {
  readonly workspace: JournalWorkspaceRecord | null;
  readonly accounts: readonly JournalAccountRecord[];
  readonly instruments: readonly JournalInstrumentRecord[];
  readonly executions: readonly LedgerExecution[];
  readonly projection: TradeNormalizationResult;
  readonly tradeSubjects: readonly JournalTradeSubjectRecord[];
  /** Current head only; immutable prior revisions remain in the store. */
  readonly tradeReviews: readonly JournalTradeReviewRecord[];
  /** Current head only; immutable prior daily-entry revisions remain in the store. */
  readonly dailyEntries: readonly JournalDailyEntryRecord[];
  readonly reviewTerms: readonly JournalReviewTermRecord[];
  readonly playbooks: readonly JournalPlaybookRecord[];
  readonly imports: readonly JournalImportReceipt[];
}

export interface PreparedCsvImport {
  /** Opaque digest of every value displayed in the preview. */
  readonly revision: string;
  readonly sourceName: string;
  readonly accountName: string;
  readonly timeZone: string;
  readonly defaultCurrency: string;
  readonly rawInput: string;
  readonly mapping: CsvHeaderMapping | null;
  readonly preview: GenericCsvPreview;
}

export interface CsvImportCommitResult {
  readonly outcome: "committed" | "duplicate";
  readonly receipt: JournalImportReceipt;
  readonly ledger: JournalLedgerSnapshot;
}

export interface ManualExecutionCommitResult {
  readonly outcome: "committed" | "duplicate";
  readonly executionId: string;
  readonly ledger: JournalLedgerSnapshot;
}

export interface TradeReviewCommitResult {
  readonly outcome: "committed" | "duplicate";
  readonly reviewIds: readonly string[];
  readonly ledger: JournalLedgerSnapshot;
}

export interface DailyJournalCommitResult {
  readonly outcome: "committed" | "duplicate";
  readonly entryVersionId: string;
  readonly ledger: JournalLedgerSnapshot;
}

export interface JournalRestoreCommitResult {
  readonly outcome: "committed" | "already-restored";
  readonly ledger: JournalLedgerSnapshot;
  readonly stateSha256: string;
  readonly reportSha256: string;
}

export interface PreparedTradeReviewBatch {
  readonly batchId: string;
  readonly revision: string;
  readonly reviews: readonly PreparedTradeReview[];
}

export interface UnacknowledgedManualExecution {
  readonly submissionId: string;
  readonly executionId: string;
  readonly symbol: string;
  readonly side: "BUY" | "SELL";
}

export interface ManualExecutionConflict {
  readonly code: "submission_changed" | "execution_changed";
  readonly message: string;
}

export class JournalManualExecutionError extends Error {
  constructor(readonly conflict: ManualExecutionConflict) {
    super(conflict.message);
    this.name = "JournalManualExecutionError";
  }
}

export interface TradeReviewConflict {
  readonly code: "submission_changed" | "review_changed" | "trade_changed";
  readonly message: string;
}

export class JournalTradeReviewError extends Error {
  constructor(readonly conflict: TradeReviewConflict) {
    super(conflict.message);
    this.name = "JournalTradeReviewError";
  }
}

export interface DailyJournalConflict {
  readonly code: "submission_changed" | "entry_changed" | "workspace_changed";
  readonly message: string;
}

export class JournalDailyEntryError extends Error {
  constructor(readonly conflict: DailyJournalConflict) {
    super(conflict.message);
    this.name = "JournalDailyEntryError";
  }
}

export interface CsvImportConflict {
  readonly code: "preview_changed" | "execution_changed" | "duplicate_execution";
  readonly message: string;
  readonly issues?: readonly CsvPreviewIssue[];
}

export class JournalImportError extends Error {
  constructor(readonly conflict: CsvImportConflict) {
    super(conflict.message);
    this.name = "JournalImportError";
  }
}

export interface JournalRestoreConflict {
  readonly code:
    | "invalid_archive"
    | "unsupported_payload"
    | "incompatible_schema"
    | "invalid_payload"
    | "preview_changed"
    | "journal_not_empty"
    | "verification_failed";
  readonly message: string;
}

export class JournalRestoreError extends Error {
  constructor(readonly conflict: JournalRestoreConflict) {
    super(conflict.message);
    this.name = "JournalRestoreError";
  }
}

export interface JournalStore {
  load(): Promise<JournalLedgerSnapshot>;
  /** Complete archive boundary; unlike load(), this includes immutable history. */
  exportUserData(): Promise<JournalExportArtifact>;
  prepareUserDataRestore(contents: string): Promise<PreparedJournalRestore>;
  commitUserDataRestore(command: PreparedJournalRestore): Promise<JournalRestoreCommitResult>;
  commitCsvImport(command: PreparedCsvImport): Promise<CsvImportCommitResult>;
  commitManualExecution(command: PreparedManualExecution): Promise<ManualExecutionCommitResult>;
  commitTradeReviews(command: PreparedTradeReviewBatch): Promise<TradeReviewCommitResult>;
  commitDailyJournalEntry(command: PreparedDailyJournalEntry): Promise<DailyJournalCommitResult>;
  loadUnacknowledgedManualExecutions(): Promise<readonly UnacknowledgedManualExecution[]>;
  acknowledgeManualExecution(submissionId: string): Promise<void>;
  rollbackImport(receiptId: string, reason: string): Promise<JournalLedgerSnapshot>;
  close(): Promise<void>;
}
