import type {
  CsvHeaderMapping,
  CsvPreviewIssue,
  GenericCsvPreview,
} from "../core/csv";
import type {
  LedgerExecution,
  TradeNormalizationResult,
} from "../core/ledger";

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

export interface JournalLedgerSnapshot {
  readonly workspace: JournalWorkspaceRecord | null;
  readonly accounts: readonly JournalAccountRecord[];
  readonly instruments: readonly JournalInstrumentRecord[];
  readonly executions: readonly LedgerExecution[];
  readonly projection: TradeNormalizationResult;
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

export interface JournalStore {
  load(): Promise<JournalLedgerSnapshot>;
  commitCsvImport(command: PreparedCsvImport): Promise<CsvImportCommitResult>;
  rollbackImport(receiptId: string, reason: string): Promise<JournalLedgerSnapshot>;
  close(): Promise<void>;
}
