import type { CsvHeaderMapping } from "../core/csv";
import type { JournalWorkspaceSnapshot } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import type {
  CsvImportCommitResult,
  DailyJournalCommitResult,
  JournalRestoreCommitResult,
  JournalStore,
  JournalTradeReviewRecord,
  ManualExecutionCommitResult,
  PreparedCsvImport,
  PreparedTradeReviewBatch,
  TradeReviewCommitResult,
  UnacknowledgedManualExecution,
} from "./journal-store";
import {
  JournalDailyEntryError,
  JournalRestoreError,
  JournalTradeReviewError,
} from "./journal-store";
import type { JournalExportArtifact } from "./journal-archive";
import type { PreparedJournalRestore } from "./journal-restore";
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
  createTradeReviewSubmissionId,
  prepareTradeReview,
  tradeReviewBatchRevision,
  type PreparedTradeReview,
  type TradeReviewInput,
  verifyPreparedTradeReview,
} from "./prepare-trade-review";
import {
  createDailyJournalSubmissionId,
  prepareDailyJournalEntry,
  type DailyJournalEntryInput,
  type PreparedDailyJournalEntry,
} from "./prepare-daily-journal";
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

export class TradeReviewCommitStatusUncertainError extends Error {
  constructor(cause: unknown) {
    super(
      "Hermes could not confirm whether this exact trade review save committed. Keep this sheet open and retry the same save; do not reopen or re-enter this review.",
      { cause },
    );
    this.name = "TradeReviewCommitStatusUncertainError";
  }
}

export class DailyJournalCommitStatusUncertainError extends Error {
  constructor(cause: unknown) {
    super(
      "Hermes could not confirm whether this exact daily reflection save committed. Keep this sheet open and retry the same save; do not create another reflection for this date.",
      { cause },
    );
    this.name = "DailyJournalCommitStatusUncertainError";
  }
}

export class JournalRestoreCommitStatusUncertainError extends Error {
  constructor(cause: unknown) {
    super(
      "Hermes could not confirm whether the journal restore committed. Keep the selected file and try the same restore again; do not add new journal data.",
      { cause },
    );
    this.name = "JournalRestoreCommitStatusUncertainError";
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

  async exportUserData(): Promise<JournalExportArtifact> {
    if (this.viewMode !== "local") {
      throw new Error("Return to your local journal before exporting private data.");
    }
    return this.store.exportUserData();
  }

  async prepareUserDataRestore(contents: string): Promise<PreparedJournalRestore> {
    if (this.viewMode !== "local") {
      throw new Error("Return to your local journal before previewing a private restore.");
    }
    return this.store.prepareUserDataRestore(contents);
  }

  async commitUserDataRestore(
    prepared: PreparedJournalRestore,
  ): Promise<JournalRestoreCommitResult> {
    if (this.viewMode !== "local") {
      throw new Error("Return to your local journal before restoring private data.");
    }
    const result = await this.store.commitUserDataRestore(prepared);
    this.viewMode = "local";
    return result;
  }

  async commitUserDataRestoreSafely(
    prepared: PreparedJournalRestore,
  ): Promise<JournalRestoreCommitResult> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.commitUserDataRestore(prepared);
      } catch (error) {
        if (error instanceof JournalRestoreError) throw error;
        lastError = error;
      }
    }
    throw new JournalRestoreCommitStatusUncertainError(lastError);
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

  createReviewSubmissionId(): string {
    this.assertLocalReviewMode();
    return createTradeReviewSubmissionId();
  }

  prepareReview(input: TradeReviewInput): PreparedTradeReview {
    this.assertLocalReviewMode();
    return prepareTradeReview(input);
  }

  prepareReviewBatch(
    reviews: readonly PreparedTradeReview[],
    batchId?: string,
  ): PreparedTradeReviewBatch {
    this.assertLocalReviewMode();
    if (!Array.isArray(reviews) || reviews.length === 0) {
      throw new Error("Select at least one trade review before saving an atomic batch.");
    }
    const verifiedReviews = reviews.map((review) => verifyPreparedTradeReview(review));
    const tradeSubjectIds = new Set<string>();
    const submissionIds = new Set<string>();
    for (const review of verifiedReviews) {
      if (tradeSubjectIds.has(review.tradeSubjectId)) {
        throw new Error("An atomic batch can revise each trade only once.");
      }
      if (submissionIds.has(review.submissionId)) {
        throw new Error("An atomic batch can use each review submission only once.");
      }
      tradeSubjectIds.add(review.tradeSubjectId);
      submissionIds.add(review.submissionId);
    }
    const resolvedBatchId = batchId ?? createTradeReviewSubmissionId();
    return Object.freeze({
      batchId: resolvedBatchId,
      revision: tradeReviewBatchRevision(resolvedBatchId, verifiedReviews),
      reviews: Object.freeze(verifiedReviews),
    });
  }

  async commitReviews(
    prepared: PreparedTradeReviewBatch,
  ): Promise<TradeReviewCommitResult> {
    this.assertLocalReviewMode();
    const result = await this.store.commitTradeReviews(prepared);
    this.viewMode = "local";
    return result;
  }

  async commitReviewsSafely(
    prepared: PreparedTradeReviewBatch,
  ): Promise<TradeReviewCommitResult> {
    this.assertLocalReviewMode();
    let lastError: unknown;
    let hadUnknownCommitError = false;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.commitReviews(prepared);
      } catch (error) {
        if (error instanceof JournalTradeReviewError) {
          if (!hadUnknownCommitError) throw error;
          // A domain error does not say whether the adapter checked the exact
          // submission receipt first. After an earlier unknown response, it
          // cannot prove that the prior attempt did not commit. Preserve
          // ambiguity and let the current-head fallback provide positive proof.
        } else {
          hadUnknownCommitError = true;
        }
        lastError = error;
      }
    }

    try {
      const ledger = await this.store.load();
      const reviewBySubjectId = new Map(
        ledger.tradeReviews.map((review) => [review.tradeSubjectId, review] as const),
      );
      const reviewIds = prepared.reviews.map((review) => {
        const current = reviewBySubjectId.get(review.tradeSubjectId);
        if (current?.revision !== review.revision) {
          throw new TradeReviewCommitStatusUncertainError(lastError);
        }
        return current.id;
      });
      this.viewMode = "local";
      return {
        outcome: "duplicate",
        reviewIds,
        ledger,
      };
    } catch (error) {
      if (error instanceof TradeReviewCommitStatusUncertainError) throw error;
      throw new TradeReviewCommitStatusUncertainError(error);
    }
  }

  createDailyJournalSubmissionId(): string {
    this.assertLocalReviewMode();
    return createDailyJournalSubmissionId();
  }

  prepareDailyJournal(input: DailyJournalEntryInput): PreparedDailyJournalEntry {
    this.assertLocalReviewMode();
    return prepareDailyJournalEntry(input);
  }

  async commitDailyJournal(
    prepared: PreparedDailyJournalEntry,
  ): Promise<DailyJournalCommitResult> {
    this.assertLocalReviewMode();
    const result = await this.store.commitDailyJournalEntry(prepared);
    this.viewMode = "local";
    return result;
  }

  async commitDailyJournalSafely(
    prepared: PreparedDailyJournalEntry,
  ): Promise<DailyJournalCommitResult> {
    this.assertLocalReviewMode();
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.commitDailyJournal(prepared);
      } catch (error) {
        if (error instanceof JournalDailyEntryError) throw error;
        lastError = error;
      }
    }
    try {
      const ledger = await this.store.load();
      const current = ledger.dailyEntries.find((entry) => (
        entry.isoDate === prepared.isoDate
      ));
      if (current?.revision !== prepared.revision) {
        throw new DailyJournalCommitStatusUncertainError(lastError);
      }
      this.viewMode = "local";
      return {
        outcome: "duplicate",
        entryVersionId: current.id,
        ledger,
      };
    } catch (error) {
      if (error instanceof DailyJournalCommitStatusUncertainError) throw error;
      throw new DailyJournalCommitStatusUncertainError(error);
    }
  }

  async addTagToTrades(
    tradeSubjectIds: readonly string[],
    tag: string,
  ): Promise<TradeReviewCommitResult> {
    this.assertLocalReviewMode();
    if (!Array.isArray(tradeSubjectIds) || tradeSubjectIds.length === 0) {
      throw new Error("Select at least one active trade before adding a tag.");
    }
    if (new Set(tradeSubjectIds).size !== tradeSubjectIds.length) {
      throw new Error("Each selected trade subject must be unique.");
    }

    const ledger = await this.store.load();
    const activeSubjectIds = new Set(
      ledger.tradeSubjects.map((subject) => subject.tradeSubjectId),
    );
    const reviewBySubjectId = new Map<string, JournalTradeReviewRecord>();
    for (const review of ledger.tradeReviews) {
      if (reviewBySubjectId.has(review.tradeSubjectId)) {
        throw new Error("The journal exposed more than one current review for a trade.");
      }
      reviewBySubjectId.set(review.tradeSubjectId, review);
    }
    for (const tradeSubjectId of tradeSubjectIds) {
      if (!activeSubjectIds.has(tradeSubjectId)) {
        throw new JournalTradeReviewError({
          code: "trade_changed",
          message: "A selected trade is no longer part of the active immutable ledger projection.",
        });
      }
    }

    const reviews = tradeSubjectIds.map((tradeSubjectId) => {
      const current = reviewBySubjectId.get(tradeSubjectId) ?? null;
      if (current?.playbookName === null && current.rules.length > 0) {
        throw new Error("A current trade review has rules without a playbook snapshot.");
      }
      return this.prepareReview({
        submissionId: this.createReviewSubmissionId(),
        tradeSubjectId,
        expectedPreviousReviewId: current?.id ?? null,
        state: current?.state ?? "draft",
        note: current?.note ?? "",
        setup: current?.setup ?? null,
        mistakes: current?.mistakes ?? [],
        tags: [...(current?.tags ?? []), tag],
        emotion: current?.emotion ?? null,
        playbook: current?.playbookName === null || current === null
          ? null
          : {
              name: current.playbookName,
              rules: current.rules.map((rule) => ({
                name: rule.text,
                outcome: rule.outcome,
              })),
            },
        initialRisk: current?.initialRisk ?? null,
        plannedStop: current?.plannedStop ?? null,
      });
    });
    return this.commitReviewsSafely(this.prepareReviewBatch(reviews));
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

  private assertLocalReviewMode(): void {
    if (this.viewMode !== "local") {
      throw new Error("Demo journal data is read-only. Start a local journal before saving reviews.");
    }
  }
}
