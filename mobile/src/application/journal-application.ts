import type { CsvHeaderMapping } from "../core/csv";
import type { JournalWorkspaceSnapshot } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import type {
  CsvImportCommitResult,
  JournalStore,
  ManualExecutionCommitResult,
  PreparedCsvImport,
  UnacknowledgedManualExecution,
} from "./journal-store";
import {
  createManualExecutionSubmissionId,
  prepareManualExecution,
  type ManualExecutionInput,
  type PreparedManualExecution,
} from "./prepare-manual-execution";
import {
  prepareCsvImport,
  type PrepareCsvImportInput,
} from "./prepare-csv-import";
import {
  workspaceSnapshotFromLedger,
} from "./workspace-snapshot";

export interface CsvImportSelection {
  readonly rawInput: string;
  readonly sourceName: string;
  readonly accountName: string;
  readonly timeZone: string;
  readonly defaultCurrency: string;
  readonly mapping?: CsvHeaderMapping;
}

export class ManualExecutionCommitStatusUncertainError extends Error {
  constructor(cause: unknown) {
    super(
      "Hermes could not confirm whether this execution was saved. Keep this sheet open and check the same submission again; do not re-enter it.",
      { cause },
    );
    this.name = "ManualExecutionCommitStatusUncertainError";
  }
}

export class JournalApplication {
  private viewMode: "local" | "demo" = "local";

  constructor(
    private readonly store: JournalStore,
    readonly persistence: "encrypted-device" | "browser-session",
  ) {}

  async loadWorkspace(): Promise<JournalWorkspaceSnapshot> {
    if (this.viewMode === "demo") return DEMO_WORKSPACE;
    return workspaceSnapshotFromLedger(await this.store.load());
  }

  async startJournal(): Promise<JournalWorkspaceSnapshot> {
    this.viewMode = "local";
    return this.loadWorkspace();
  }

  async exploreDemo(): Promise<JournalWorkspaceSnapshot> {
    this.viewMode = "demo";
    return DEMO_WORKSPACE;
  }

  prepareCsv(selection: CsvImportSelection): PreparedCsvImport {
    const input: PrepareCsvImportInput = selection;
    return prepareCsvImport(input);
  }

  async commitCsv(prepared: PreparedCsvImport): Promise<CsvImportCommitResult> {
    const result = await this.store.commitCsvImport(prepared);
    this.viewMode = "local";
    return result;
  }

  createManualSubmissionId(): string {
    return createManualExecutionSubmissionId();
  }

  prepareManual(input: ManualExecutionInput): PreparedManualExecution {
    return prepareManualExecution(input);
  }

  async commitManual(
    prepared: PreparedManualExecution,
  ): Promise<ManualExecutionCommitResult> {
    const result = await this.store.commitManualExecution(prepared);
    this.viewMode = "local";
    return result;
  }

  async commitManualSafely(
    prepared: PreparedManualExecution,
  ): Promise<ManualExecutionCommitResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.commitManual(prepared);
      } catch (error) {
        lastError = error;
      }
    }
    try {
      const recoverable = await this.loadRecoverableManualExecutions();
      const recovered = recoverable.find((item) => item.submissionId === prepared.submissionId);
      if (recovered !== undefined) {
        const ledger = await this.store.load();
        this.viewMode = "local";
        return {
          outcome: "duplicate",
          executionId: recovered.executionId,
          ledger,
        };
      }
    } catch (error) {
      throw new ManualExecutionCommitStatusUncertainError(error);
    }
    throw lastError;
  }

  async loadAccountNames(): Promise<readonly string[]> {
    const ledger = await this.store.load();
    return ledger.accounts
      .map((account) => account.name)
      .sort((left, right) => left.localeCompare(right, "en-US"));
  }

  async loadRecoverableManualExecutions(): Promise<readonly UnacknowledgedManualExecution[]> {
    const recoverable = await this.store.loadUnacknowledgedManualExecutions();
    if (recoverable.length === 0) return recoverable;
    const ledger = await this.store.load();
    const activeExecutionIds = new Set(ledger.executions.map((execution) => execution.id));
    for (const item of recoverable) {
      if (!activeExecutionIds.has(item.executionId)) {
        throw new Error("A committed manual execution could not be reconciled with the ledger.");
      }
    }
    return recoverable;
  }

  async acknowledgeManualExecution(submissionId: string): Promise<void> {
    await this.store.acknowledgeManualExecution(submissionId);
  }

  async rollbackImport(receiptId: string, reason: string): Promise<JournalWorkspaceSnapshot> {
    const ledger = await this.store.rollbackImport(receiptId, reason);
    this.viewMode = "local";
    return workspaceSnapshotFromLedger(ledger);
  }

  async close(): Promise<void> {
    await this.store.close();
  }
}
