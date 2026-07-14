import initSqlJs, { type Database } from "sql.js";
import { describe, expect, it } from "vitest";

import type {
  SqlDatabase,
  SqlParameters,
  SqlRow,
  SqlRunResult,
} from "../../application/sql-database";
import type { JournalLedgerSnapshot } from "../../application/journal-store";
import {
  createJournalExportArtifact,
  parseJournalArchive,
} from "../../application/journal-archive";
import { prepareCsvImport } from "../../application/prepare-csv-import";
import {
  type DailyJournalEntryInput,
  prepareDailyJournalEntry,
} from "../../application/prepare-daily-journal";
import {
  prepareManualExecution,
  type ManualExecutionInput,
} from "../../application/prepare-manual-execution";
import {
  type PreparedTradeReview,
  prepareTradeReview,
  tradeReviewBatchRevision,
  type TradeReviewInput,
} from "../../application/prepare-trade-review";
import { MOBILE_SCHEMA_MIGRATIONS } from "./schema";
import {
  SQLITE_JOURNAL_ARCHIVE_TABLES,
  type SqliteArchiveTable,
} from "./journal-archive";
import {
  SqliteJournalStore,
  type JournalStoreRuntime,
} from "./sqlite-journal-store";

const ROUND_TRIP_CSV = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
  + "fill-1,AAPL,BTO,2,100,0.10,USD,2026-07-01T13:30:00Z\r\n"
  + "fill-2,AAPL,STC,2,110,0.10,USD,2026-07-01T14:30:00Z";

const sqlJs = initSqlJs();

class SqlJsDatabase implements SqlDatabase {
  private inTransaction = false;
  private closed = false;

  constructor(private readonly database: Database) {}

  async execute(statement: string): Promise<SqlRunResult> {
    this.assertOpen();
    this.database.run(statement);
    return { changes: this.database.getRowsModified() };
  }

  async run(statement: string, values: SqlParameters = []): Promise<SqlRunResult> {
    this.assertOpen();
    this.database.run(statement, [...values]);
    return { changes: this.database.getRowsModified() };
  }

  async query<Row extends SqlRow>(
    statement: string,
    values: SqlParameters = [],
  ): Promise<readonly Row[]> {
    this.assertOpen();
    const prepared = this.database.prepare(statement);
    try {
      prepared.bind([...values]);
      const rows: Row[] = [];
      while (prepared.step()) {
        rows.push(prepared.getAsObject() as Row);
      }
      return rows;
    } finally {
      prepared.free();
    }
  }

  async transaction<Result>(operation: () => Promise<Result>): Promise<Result> {
    this.assertOpen();
    if (this.inTransaction) throw new Error("Nested test transactions are not supported.");
    this.database.run("BEGIN IMMEDIATE");
    this.inTransaction = true;
    try {
      const result = await operation();
      this.database.run("COMMIT");
      return result;
    } catch (error) {
      this.database.run("ROLLBACK");
      throw error;
    } finally {
      this.inTransaction = false;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    if (this.inTransaction) throw new Error("Cannot close during a test transaction.");
    this.database.close();
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("The SQL.js test database is closed.");
  }
}

class RestoreFaultDatabase implements SqlDatabase {
  private failExecutionInsertAt: number | null = null;
  private executionInsertCount = 0;
  private failNextQuery = false;
  private armPostCommitVerificationFailure = false;
  private loseNextTransactionResponse = false;

  constructor(private readonly delegate: SqlDatabase) {}

  failOnExecutionInsert(number: number): void {
    this.failExecutionInsertAt = number;
    this.executionInsertCount = 0;
  }

  loseNextCommittedResponse(): void {
    this.loseNextTransactionResponse = true;
  }

  failNextPostCommitVerification(): void {
    this.armPostCommitVerificationFailure = true;
  }

  async execute(statement: string): Promise<SqlRunResult> {
    return this.delegate.execute(statement);
  }

  async run(statement: string, values: SqlParameters = []): Promise<SqlRunResult> {
    if (
      this.failExecutionInsertAt !== null
      && statement.startsWith('INSERT INTO "executions"')
    ) {
      this.executionInsertCount += 1;
      if (this.executionInsertCount === this.failExecutionInsertAt) {
        this.failExecutionInsertAt = null;
        throw new Error("Injected restore insert failure.");
      }
    }
    return this.delegate.run(statement, values);
  }

  async query<Row extends SqlRow>(
    statement: string,
    values: SqlParameters = [],
  ): Promise<readonly Row[]> {
    if (this.failNextQuery) {
      this.failNextQuery = false;
      throw new Error("Injected deterministic post-commit verification failure.");
    }
    return this.delegate.query<Row>(statement, values);
  }

  async transaction<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = await this.delegate.transaction(operation);
    if (this.armPostCommitVerificationFailure) {
      this.armPostCommitVerificationFailure = false;
      this.failNextQuery = true;
    }
    if (this.loseNextTransactionResponse) {
      this.loseNextTransactionResponse = false;
      throw new Error("Injected committed response loss.");
    }
    return result;
  }

  async close(): Promise<void> {
    await this.delegate.close();
  }
}

interface StoreOperationGate {
  readonly started: Promise<void>;
  readonly released: Promise<void>;
  isStarted(): boolean;
  signalStarted(): void;
  release(): void;
}

function createStoreOperationGate(): StoreOperationGate {
  let startedSignaled = false;
  let resolveStarted = (): void => undefined;
  let release = (): void => undefined;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    started,
    released,
    isStarted: () => startedSignaled,
    signalStarted() {
      startedSignaled = true;
      resolveStarted();
    },
    release,
  };
}

class BlockingStoreOperationDatabase implements SqlDatabase {
  private acknowledgementGate: StoreOperationGate | null = null;
  private closeGate: StoreOperationGate | null = null;
  private transactionGate: StoreOperationGate | null = null;

  constructor(private readonly delegate: SqlDatabase) {}

  blockNextAcknowledgement(): StoreOperationGate {
    if (this.acknowledgementGate !== null) {
      throw new Error("An acknowledgement gate is already active.");
    }
    const gate = createStoreOperationGate();
    this.acknowledgementGate = gate;
    return gate;
  }

  blockNextTransaction(): StoreOperationGate {
    if (this.transactionGate !== null) {
      throw new Error("A transaction gate is already active.");
    }
    const gate = createStoreOperationGate();
    this.transactionGate = gate;
    return gate;
  }

  blockNextClose(): StoreOperationGate {
    if (this.closeGate !== null) {
      throw new Error("A close gate is already active.");
    }
    const gate = createStoreOperationGate();
    this.closeGate = gate;
    return gate;
  }

  async execute(statement: string): Promise<SqlRunResult> {
    return this.delegate.execute(statement);
  }

  async run(statement: string, values: SqlParameters = []): Promise<SqlRunResult> {
    const gate = this.acknowledgementGate;
    if (
      gate !== null
      && statement.startsWith("UPDATE manual_execution_submissions")
      && statement.includes("acknowledged_at_ms")
    ) {
      this.acknowledgementGate = null;
      gate.signalStarted();
      await gate.released;
    }
    return this.delegate.run(statement, values);
  }

  async query<Row extends SqlRow>(
    statement: string,
    values: SqlParameters = [],
  ): Promise<readonly Row[]> {
    return this.delegate.query<Row>(statement, values);
  }

  async transaction<Result>(operation: () => Promise<Result>): Promise<Result> {
    const gate = this.transactionGate;
    if (gate !== null) {
      this.transactionGate = null;
      gate.signalStarted();
      await gate.released;
    }
    return this.delegate.transaction(operation);
  }

  async close(): Promise<void> {
    const gate = this.closeGate;
    if (gate !== null) {
      this.closeGate = null;
      gate.signalStarted();
      await gate.released;
    }
    await this.delegate.close();
  }
}

function deterministicRuntime(): JournalStoreRuntime {
  let idSequence = 0;
  let clockMs = 1_800_000_000_000;
  return {
    nowMs() {
      const value = clockMs;
      clockMs += 1;
      return value;
    },
    newId(prefix) {
      idSequence += 1;
      return `${prefix}:test-${String(idSequence).padStart(4, "0")}`;
    },
  };
}

async function createHarness(runtime: JournalStoreRuntime = deterministicRuntime()) {
  const SQL = await sqlJs;
  const database = new SqlJsDatabase(new SQL.Database());
  await database.execute("PRAGMA foreign_keys = ON");
  await database.transaction(async () => {
    for (const migration of MOBILE_SCHEMA_MIGRATIONS) {
      for (const statement of migration.statements) {
        await database.execute(statement);
      }
    }
    const current = MOBILE_SCHEMA_MIGRATIONS.at(-1);
    if (current === undefined) throw new Error("Test schema has no migrations.");
    await database.execute(`PRAGMA user_version = ${current.toVersion}`);
  });
  return {
    database,
    store: new SqliteJournalStore(database, runtime),
  };
}

function preparedCsv(rawInput = ROUND_TRIP_CSV) {
  return prepareCsvImport({
    rawInput,
    sourceName: "fills.csv",
    accountName: "Main brokerage",
    timeZone: "America/New_York",
    defaultCurrency: "USD",
  });
}

function preparedManual(
  submissionDigit: string,
  overrides: Partial<ManualExecutionInput> = {},
) {
  return prepareManualExecution({
    submissionId: submissionDigit.repeat(64),
    accountName: "Main brokerage",
    timeZone: "America/New_York",
    defaultCurrency: "USD",
    symbol: "AAPL",
    assetClass: "stock",
    side: "BUY",
    positionEffect: "OPEN",
    quantity: "2",
    price: "100",
    fee: "0.10",
    executedAt: "2026-07-01T09:30:00",
    ...overrides,
  });
}

function preparedReview(
  tradeSubjectId: string,
  submissionDigit: string,
  overrides: Partial<TradeReviewInput> = {},
): PreparedTradeReview {
  return prepareTradeReview({
    submissionId: submissionDigit.repeat(64),
    tradeSubjectId,
    expectedPreviousReviewId: null,
    state: "completed",
    note: "Waited for confirmation and managed the exit deliberately.",
    setup: "Opening-range breakout",
    mistakes: ["Late exit"],
    tags: ["A+ setup"],
    emotion: "Focused",
    playbook: {
      name: "Momentum",
      rules: [
        { name: "Wait for confirmation", outcome: "followed" },
        { name: "Respect the stop", outcome: "followed" },
      ],
    },
    initialRisk: { amount: "10", currency: "USD" },
    plannedStop: "95",
    ...overrides,
  });
}

function preparedReviewBatch(batchId: string, reviews: readonly PreparedTradeReview[]) {
  return {
    batchId,
    reviews,
    revision: tradeReviewBatchRevision(batchId, reviews),
  };
}

function preparedDailyEntry(
  submissionDigit: string,
  overrides: Partial<DailyJournalEntryInput> = {},
) {
  return prepareDailyJournalEntry({
    submissionId: submissionDigit.repeat(64),
    isoDate: "2026-07-13",
    expectedPreviousEntryId: null,
    state: "draft",
    title: "Protected the process",
    note: "Waited for confirmation.",
    emotion: "Focused",
    processScorePct: 88,
    tags: ["Patient"],
    ...overrides,
  });
}

async function scalar(database: SqlDatabase, statement: string): Promise<number | string | null> {
  const rows = await database.query<SqlRow>(statement);
  const first = rows[0];
  if (first === undefined) throw new Error(`Query returned no row: ${statement}`);
  const value = Object.values(first)[0];
  if (typeof value !== "number" && typeof value !== "string" && value !== null) {
    throw new Error(`Query returned an unsupported scalar: ${statement}`);
  }
  return value;
}

async function count(database: SqlDatabase, table: string): Promise<number> {
  const value = await scalar(database, `SELECT COUNT(*) AS count FROM ${table}`);
  if (typeof value !== "number") throw new Error(`Invalid count for ${table}`);
  return value;
}

async function expectHealthyDatabase(database: SqlDatabase): Promise<void> {
  expect(await scalar(database, "PRAGMA foreign_keys")).toBe(1);
  expect(await scalar(database, "PRAGMA quick_check")).toBe("ok");
  expect(await database.query("PRAGMA foreign_key_check")).toEqual([]);
}

describe("SqliteJournalStore", () => {
  it("loads an empty migrated journal without manufacturing state", async () => {
    const { database, store } = await createHarness();
    try {
      const ledger = await store.load();

      expect(ledger).toMatchObject({
        workspace: null,
        accounts: [],
        instruments: [],
        executions: [],
        imports: [],
      });
      expect(ledger.projection).toEqual({
        executions: [],
        trades: [],
        allocations: [],
        lotMatches: [],
        moneyTotals: [],
      });
      await expectHealthyDatabase(database);
    } finally {
      await store.close();
    }
  });

  it("persists, retries, rolls back around, and restores immutable daily-entry chains", async () => {
    const source = await createHarness();
    const destination = await createHarness();
    const replay = await createHarness();
    try {
      await expect(source.store.commitDailyJournalEntry(preparedDailyEntry("a")))
        .rejects.toMatchObject({ conflict: { code: "workspace_changed" } });
      expect(await count(source.database, "daily_journal_entry_versions")).toBe(0);

      const imported = await source.store.commitCsvImport(preparedCsv());
      const firstCommand = preparedDailyEntry("a");
      const first = await source.store.commitDailyJournalEntry(firstCommand);
      expect(first.ledger.dailyEntries).toEqual([
        expect.objectContaining({
          id: first.entryVersionId,
          version: 1,
          state: "draft",
          emotion: "Focused",
          tags: ["Patient"],
        }),
      ]);
      expect(await source.store.commitDailyJournalEntry(firstCommand)).toMatchObject({
        outcome: "duplicate",
        entryVersionId: first.entryVersionId,
      });
      await expect(source.store.commitDailyJournalEntry(preparedDailyEntry("a", {
        note: "Changed after the same submission ID was saved.",
      }))).rejects.toMatchObject({ conflict: { code: "submission_changed" } });

      const edit = await source.store.commitDailyJournalEntry(preparedDailyEntry("b", {
        expectedPreviousEntryId: first.entryVersionId,
        state: "completed",
        title: null,
        note: "Stayed patient and skipped a weak setup.",
        emotion: "focused",
        processScorePct: 93,
        tags: ["patient", "No trade"],
      }));
      expect(edit.ledger.dailyEntries).toEqual([
        expect.objectContaining({
          id: edit.entryVersionId,
          version: 2,
          state: "completed",
          emotion: "Focused",
          tags: ["Patient", "No trade"],
        }),
      ]);
      expect(await count(source.database, "daily_journal_entry_versions")).toBe(2);
      expect(await count(source.database, "daily_journal_entry_heads")).toBe(1);
      expect(await count(source.database, "daily_journal_entry_term_assignments")).toBe(5);
      expect(await source.database.query(
        `SELECT version_number, supersedes_version_id
           FROM daily_journal_entry_versions ORDER BY version_number`,
      )).toEqual([
        { version_number: 1, supersedes_version_id: null },
        { version_number: 2, supersedes_version_id: first.entryVersionId },
      ]);

      const stateBeforeStale = (await source.store.exportUserData()).archive.stateSha256;
      await expect(source.store.commitDailyJournalEntry(preparedDailyEntry("c", {
        expectedPreviousEntryId: first.entryVersionId,
      }))).rejects.toMatchObject({ conflict: { code: "entry_changed" } });
      expect((await source.store.exportUserData()).archive.stateSha256).toBe(stateBeforeStale);
      await expect(source.database.run(
        "UPDATE daily_journal_entry_versions SET note_text = 'mutated' WHERE id = ?",
        [first.entryVersionId],
      )).rejects.toThrow(/immutable/i);

      const afterRollback = await source.store.rollbackImport(
        imported.receipt.id,
        "Daily reflections are not owned by CSV receipts",
      );
      expect(afterRollback.dailyEntries).toEqual([
        expect.objectContaining({ id: edit.entryVersionId, version: 2 }),
      ]);

      const artifact = await source.store.exportUserData();
      const prepared = await destination.store.prepareUserDataRestore(artifact.contents);
      const restored = await destination.store.commitUserDataRestore(prepared);
      expect(restored.ledger.dailyEntries).toEqual(afterRollback.dailyEntries);
      expect(await count(destination.database, "daily_journal_entry_versions")).toBe(2);
      expect(await count(destination.database, "daily_journal_entry_heads")).toBe(1);
      expect((await destination.store.exportUserData()).archive.stateSha256)
        .toBe(artifact.archive.stateSha256);

      const restoredHead = restored.ledger.dailyEntries[0];
      if (restoredHead === undefined) throw new Error("Restored daily-entry head is missing.");
      const continued = await destination.store.commitDailyJournalEntry(preparedDailyEntry("d", {
        expectedPreviousEntryId: restoredHead.id,
        state: "completed",
        title: null,
        note: "Continued after native restore.",
        emotion: "FOCUSED",
        processScorePct: 95,
        tags: ["PATIENT", "NO TRADE"],
      }));
      expect(continued.ledger.dailyEntries).toEqual([
        expect.objectContaining({
          version: 3,
          emotion: "Focused",
          tags: ["Patient", "No trade"],
        }),
      ]);
      expect(await count(destination.database, "daily_journal_entry_versions")).toBe(3);
      const continuedArtifact = await destination.store.exportUserData();
      const replayPrepared = await replay.store.prepareUserDataRestore(continuedArtifact.contents);
      const replayed = await replay.store.commitUserDataRestore(replayPrepared);
      expect(replayed.ledger.dailyEntries).toEqual(continued.ledger.dailyEntries);
      expect((await replay.store.exportUserData()).archive.stateSha256)
        .toBe(continuedArtifact.archive.stateSha256);
      await expectHealthyDatabase(source.database);
      await expectHealthyDatabase(destination.database);
      await expectHealthyDatabase(replay.database);
    } finally {
      await source.store.close();
      await destination.store.close();
      await replay.store.close();
    }
  });

  it("persists immutable review versions, exact risk metadata, and retry identity", async () => {
    const { database, store } = await createHarness();
    try {
      const imported = await store.commitCsvImport(preparedCsv());
      const tradeSubjectId = imported.ledger.tradeSubjects[0]?.tradeSubjectId;
      if (tradeSubjectId === undefined) throw new Error("Expected one durable trade subject.");
      const firstCommand = preparedReviewBatch("review-batch-one", [
        preparedReview(tradeSubjectId, "a"),
      ]);

      const first = await store.commitTradeReviews(firstCommand);
      const firstReview = first.ledger.tradeReviews[0];
      expect(first.outcome).toBe("committed");
      expect(firstReview).toMatchObject({
        tradeSubjectId,
        version: 1,
        state: "completed",
        setup: "Opening-range breakout",
        mistakes: ["Late exit"],
        emotion: "Focused",
        tags: ["A+ setup"],
        playbookName: "Momentum",
        initialRisk: { amount: "10", currency: "USD" },
        plannedStop: "95",
        resultRMetricId: "result-r",
        resultRMetricVersion: 1,
        percentReturnMetricId: "percent-return",
        percentReturnMetricVersion: 1,
      });
      expect(firstReview?.rules).toEqual([
        expect.objectContaining({ text: "Wait for confirmation", outcome: "followed" }),
        expect.objectContaining({ text: "Respect the stop", outcome: "followed" }),
      ]);

      const duplicate = await store.commitTradeReviews(firstCommand);
      expect(duplicate).toMatchObject({
        outcome: "duplicate",
        reviewIds: first.reviewIds,
      });
      expect(await count(database, "trade_review_versions")).toBe(1);

      const firstReviewId = firstReview?.id;
      if (firstReviewId === undefined) throw new Error("Expected the first review head.");
      const edit = preparedReviewBatch("review-batch-two", [
        preparedReview(tradeSubjectId, "b", {
          expectedPreviousReviewId: firstReviewId,
          note: "The plan worked; the final scale-out was still late.",
          tags: ["Needs work"],
          playbook: {
            name: "momentum",
            rules: [
              { name: "wait for confirmation", outcome: "followed" },
              { name: "respect the stop", outcome: "broken" },
            ],
          },
        }),
      ]);
      const edited = await store.commitTradeReviews(edit);
      expect(edited.ledger.tradeReviews).toHaveLength(1);
      expect(edited.ledger.tradeReviews[0]).toMatchObject({
        version: 2,
        note: "The plan worked; the final scale-out was still late.",
        tags: ["Needs work"],
      });
      expect(await count(database, "trade_review_versions")).toBe(2);
      expect(await count(database, "trade_review_heads")).toBe(1);
      expect(await database.query(
        "SELECT version_number, supersedes_version_id FROM trade_review_versions ORDER BY version_number",
      )).toEqual([
        { version_number: 1, supersedes_version_id: null },
        { version_number: 2, supersedes_version_id: firstReviewId },
      ]);
      await expect(database.run(
        "UPDATE trade_review_versions SET note_text = 'mutated' WHERE id = ?",
        [firstReviewId],
      )).rejects.toThrow(/immutable/);

      const recreated = new SqliteJournalStore(database, deterministicRuntime());
      const reloaded = await recreated.load();
      expect(reloaded.tradeReviews[0]).toMatchObject({
        id: edited.reviewIds[0],
        version: 2,
        playbookName: "Momentum",
      });
      const visibleEdit = reloaded.tradeReviews[0];
      if (visibleEdit === undefined) throw new Error("Expected the reloaded review head.");
      expect(prepareTradeReview({
        submissionId: edit.reviews[0]!.submissionId,
        tradeSubjectId: visibleEdit.tradeSubjectId,
        expectedPreviousReviewId: edit.reviews[0]!.expectedPreviousReviewId,
        state: visibleEdit.state,
        note: visibleEdit.note,
        setup: visibleEdit.setup,
        mistakes: visibleEdit.mistakes,
        tags: visibleEdit.tags,
        emotion: visibleEdit.emotion,
        playbook: visibleEdit.playbookName === null ? null : {
          name: visibleEdit.playbookName,
          rules: visibleEdit.rules.map((rule) => ({
            name: rule.text,
            outcome: rule.outcome,
          })),
        },
        initialRisk: visibleEdit.initialRisk,
        plannedStop: visibleEdit.plannedStop,
      }).revision).toBe(visibleEdit.revision);

      const validTamperBase = preparedReview(tradeSubjectId, "c", {
        expectedPreviousReviewId: visibleEdit.id,
      });
      const tampered = {
        ...validTamperBase,
        note: "Changed after the immutable review command was prepared.",
      };
      await expect(store.commitTradeReviews(preparedReviewBatch(
        "tampered-review",
        [tampered],
      ))).rejects.toMatchObject({ conflict: { code: "review_changed" } });
      await expectHealthyDatabase(database);
    } finally {
      await store.close();
    }
  });

  it("exports complete SQLite facts and history beyond the current read model", async () => {
    const { database, store } = await createHarness();
    try {
      const imported = await store.commitCsvImport(preparedCsv());
      const tradeSubjectId = imported.ledger.tradeSubjects[0]?.tradeSubjectId;
      if (tradeSubjectId === undefined) throw new Error("Expected one durable trade subject.");

      const manualCommand = preparedManual("9", {
        symbol: "MSFT",
        assetClass: "etf",
        quantity: "1",
        price: "400",
        fee: "0",
        executedAt: "2026-07-02T09:30:00",
      });
      const manual = await store.commitManualExecution(manualCommand);

      const first = await store.commitTradeReviews(preparedReviewBatch("export-review-one", [
        preparedReview(tradeSubjectId, "d"),
      ]));
      const firstReviewId = first.reviewIds[0];
      if (firstReviewId === undefined) throw new Error("Expected the first review version.");

      const second = await store.commitTradeReviews(preparedReviewBatch("export-review-two", [
        preparedReview(tradeSubjectId, "e", {
          expectedPreviousReviewId: firstReviewId,
          note: "The exit followed the plan, but the stop rule needs work.",
          tags: ["Needs work"],
          playbook: {
            name: "momentum",
            rules: [
              { name: "wait for confirmation", outcome: "followed" },
              { name: "respect the stop", outcome: "broken" },
            ],
          },
        }),
      ]));
      const secondReviewId = second.reviewIds[0];
      if (secondReviewId === undefined) throw new Error("Expected the second review version.");

      const visible = await store.load();
      expect(visible.tradeReviews.map((review) => review.id)).toEqual([secondReviewId]);

      const artifact = await store.exportUserData();
      const archive = parseJournalArchive(artifact.contents);
      expect(archive).toEqual(artifact.archive);
      expect(artifact.mediaType).toBe("application/vnd.hermes.journal+json");
      expect(archive.payload).toMatchObject({ kind: "sqlite-table-set", version: 1 });
      expect(archive.stateSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(archive.reportSha256).toMatch(/^[0-9a-f]{64}$/);

      const data = archive.payload.data as unknown as {
        readonly tableFormatVersion: number;
        readonly tables: readonly SqliteArchiveTable[];
      };
      expect(data.tableFormatVersion).toBe(1);
      expect(data.tables.map((table) => table.name)).toEqual(SQLITE_JOURNAL_ARCHIVE_TABLES);

      const tableRows = (name: typeof SQLITE_JOURNAL_ARCHIVE_TABLES[number]) => {
        const table = data.tables.find((candidate) => candidate.name === name);
        if (table === undefined) throw new Error("Missing exported SQLite table " + name + ".");
        return table.rows.map((row) => Object.fromEntries(table.columns.map((column, index) => [
          column.name,
          row[index] ?? null,
        ])));
      };

      expect(tableRows("import_batches")).toEqual([
        expect.objectContaining({
          source_kind: "generic_csv",
          source_name: "fills.csv",
          parser_id: "generic-csv",
          parser_version: "1",
          mapping_json: expect.stringContaining("\"timeZone\":\"America/New_York\""),
        }),
      ]);
      expect(tableRows("import_source_rows")).toEqual(expect.arrayContaining([
        expect.objectContaining({
          row_ordinal: "1",
          source_text: "fill-1,AAPL,BTO,2,100,0.10,USD,2026-07-01T13:30:00Z\r\n",
        }),
        expect.objectContaining({
          row_ordinal: "2",
          source_text: "fill-2,AAPL,STC,2,110,0.10,USD,2026-07-01T14:30:00Z",
        }),
      ]));
      expect(tableRows("execution_sources").map((row) => row.source_kind).sort()).toEqual([
        "import",
        "import",
        "manual",
      ]);
      expect(tableRows("manual_execution_submissions")).toEqual([
        expect.objectContaining({
          submission_id: manualCommand.submissionId,
          state: "committed",
          execution_id: manual.executionId,
          command_json: expect.stringContaining("\"symbol\":\"MSFT\""),
        }),
      ]);

      expect(tableRows("trade_review_versions")).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: firstReviewId,
          version_number: "1",
          supersedes_version_id: null,
          note_text: "Waited for confirmation and managed the exit deliberately.",
          result_r_metric_id: "result-r",
          result_r_metric_version: "1",
          percent_return_metric_id: "percent-return",
          percent_return_metric_version: "1",
        }),
        expect.objectContaining({
          id: secondReviewId,
          version_number: "2",
          supersedes_version_id: firstReviewId,
          note_text: "The exit followed the plan, but the stop rule needs work.",
        }),
      ]));
      expect(tableRows("trade_review_heads")).toEqual([
        expect.objectContaining({ review_version_id: secondReviewId }),
      ]);
      expect(tableRows("review_terms").map((row) => row.name).sort()).toEqual([
        "A+ setup",
        "Focused",
        "Late exit",
        "Needs work",
        "Opening-range breakout",
      ]);
      expect(tableRows("playbooks")).toEqual([
        expect.objectContaining({ name: "Momentum", normalized_name: "momentum" }),
      ]);
      expect(tableRows("playbook_rules").map((row) => row.rule_text).sort()).toEqual([
        "Respect the stop",
        "Wait for confirmation",
      ]);
      expect(tableRows("trade_review_term_assignments")).toHaveLength(8);
      expect(tableRows("trade_review_rule_results").map((row) => row.outcome).sort()).toEqual([
        "broken",
        "followed",
        "followed",
        "followed",
      ]);

      expect(tableRows("metric_definitions")).toEqual(expect.arrayContaining([
        expect.objectContaining({
          metric_id: "result-r",
          version: "1",
          fraction_digits: "12",
          rounding_mode: "half_away_from_zero",
          description: expect.stringContaining("initial risk"),
        }),
        expect.objectContaining({
          metric_id: "percent-return",
          version: "1",
          fraction_digits: "12",
          rounding_mode: "half_away_from_zero",
          description: expect.stringContaining("entry notional"),
        }),
      ]));
      expect(archive.summary).toEqual({
        workspaceName: "My Journal",
        currency: "USD",
        timeZone: "America/New_York",
        accounts: "1",
        activeExecutions: "3",
        executionVersions: "3",
        importReceipts: "1",
        rolledBackImports: "0",
        currentReviews: "1",
        reviewVersions: "2",
        reviewTerms: "5",
        playbooks: "1",
        attachments: "0",
        attachmentBytes: "0",
      });
      await expectHealthyDatabase(database);
    } finally {
      await store.close();
    }
  });


  it("previews by rollback, atomically restores review history, and reconciles retry", async () => {
    const source = await createHarness();
    const destination = await createHarness();
    const staleDestination = await createHarness();
    const otherSource = await createHarness();
    try {
      const imported = await source.store.commitCsvImport(preparedCsv());
      const tradeSubjectId = imported.ledger.tradeSubjects[0]?.tradeSubjectId;
      if (tradeSubjectId === undefined) throw new Error("Expected a restorable trade subject.");
      await source.store.commitManualExecution(preparedManual("6", {
        symbol: "MSFT",
        assetClass: "stock",
        quantity: "1",
        price: "400",
        fee: "0",
        executedAt: "2026-07-02T09:30:00",
      }));
      const first = await source.store.commitTradeReviews(preparedReviewBatch(
        "restore-review-one",
        [preparedReview(tradeSubjectId, "1")],
      ));
      const firstReviewId = first.reviewIds[0];
      if (firstReviewId === undefined) throw new Error("Expected restore review version one.");
      const second = await source.store.commitTradeReviews(preparedReviewBatch(
        "restore-review-two",
        [preparedReview(tradeSubjectId, "2", {
          expectedPreviousReviewId: firstReviewId,
          note: "Second immutable restore version.",
          tags: ["Needs work"],
        })],
      ));
      const secondReviewId = second.reviewIds[0];
      if (secondReviewId === undefined) throw new Error("Expected restore review version two.");
      await source.store.commitTradeReviews(preparedReviewBatch(
        "restore-review-three",
        [preparedReview(tradeSubjectId, "3", {
          expectedPreviousReviewId: secondReviewId,
          note: "Third immutable restore version.",
          tags: ["Reviewed"],
        })],
      ));
      await source.database.run(
        "UPDATE workspaces SET created_at_ms = CAST(? AS INTEGER), updated_at_ms = CAST(? AS INTEGER)",
        ["9007199254740993", "9007199254740993"],
      );
      await source.database.run(
        `INSERT INTO execution_fee_components (
           execution_version_id, workspace_id, component_ordinal,
           category, currency_code, cost_minor
         )
         SELECT id, workspace_id, 98, 'other', quote_currency_code, CAST(? AS INTEGER)
           FROM execution_versions ORDER BY id LIMIT 1`,
        ["-9223372036854775808"],
      );
      await source.database.run(
        `INSERT INTO execution_fee_components (
           execution_version_id, workspace_id, component_ordinal,
           category, currency_code, cost_minor
         )
         SELECT id, workspace_id, 99, 'other', quote_currency_code, CAST(? AS INTEGER)
           FROM execution_versions ORDER BY id LIMIT 1`,
        ["9223372036854775807"],
      );
      const artifact = await source.store.exportUserData();

      const baseline = await destination.store.exportUserData();
      const migrationRowsBefore = await destination.database.query(
        "SELECT version, name, checksum_sha256, applied_at_ms FROM schema_migrations ORDER BY version",
      );
      const prepared = await destination.store.prepareUserDataRestore(artifact.contents);
      expect(prepared.preview).toMatchObject({
        target: "empty",
        payloadKind: "sqlite-table-set",
        payloadVersion: 1,
        stateSha256: artifact.archive.stateSha256,
        reportSha256: artifact.archive.reportSha256,
        summary: artifact.archive.summary,
      });

      await expect(destination.store.commitUserDataRestore({
        ...prepared,
        contents: "not the previewed archive",
      })).rejects.toMatchObject({ conflict: { code: "preview_changed" } });

      const afterPreview = await destination.store.exportUserData();
      expect(afterPreview.archive.stateSha256).toBe(baseline.archive.stateSha256);
      expect(afterPreview.archive.reportSha256).toBe(baseline.archive.reportSha256);
      expect(await count(destination.database, "workspaces")).toBe(0);
      expect(await count(destination.database, "trade_review_versions")).toBe(0);
      expect(await destination.database.query(
        "SELECT version, name, checksum_sha256, applied_at_ms FROM schema_migrations ORDER BY version",
      )).toEqual(migrationRowsBefore);

      const restored = await destination.store.commitUserDataRestore(prepared);
      expect(restored).toMatchObject({
        outcome: "committed",
        stateSha256: artifact.archive.stateSha256,
        reportSha256: artifact.archive.reportSha256,
      });
      expect(restored.ledger.tradeReviews).toEqual([
        expect.objectContaining({
          version: 3,
          note: "Third immutable restore version.",
          tags: ["Reviewed"],
        }),
      ]);
      expect(await count(destination.database, "trade_review_versions")).toBe(3);
      expect(await count(destination.database, "trade_review_heads")).toBe(1);
      expect(await destination.database.query(
        `SELECT version_number, supersedes_version_id
           FROM trade_review_versions ORDER BY version_number`,
      )).toEqual([
        { version_number: 1, supersedes_version_id: null },
        { version_number: 2, supersedes_version_id: firstReviewId },
        { version_number: 3, supersedes_version_id: secondReviewId },
      ]);
      expect(await destination.database.query(
        "SELECT version, name, checksum_sha256, applied_at_ms FROM schema_migrations ORDER BY version",
      )).toEqual(migrationRowsBefore);
      expect(await scalar(
        destination.database,
        "SELECT CAST(created_at_ms AS TEXT) FROM workspaces",
      )).toBe("9007199254740993");
      expect(await destination.database.query(
        `SELECT CAST(cost_minor AS TEXT) AS cost_minor_text
           FROM execution_fee_components
          WHERE cost_minor IN (CAST(? AS INTEGER), CAST(? AS INTEGER))
          ORDER BY cost_minor`,
        ["-9223372036854775808", "9223372036854775807"],
      )).toEqual([
        { cost_minor_text: "-9223372036854775808" },
        { cost_minor_text: "9223372036854775807" },
      ]);

      const destinationArtifact = await destination.store.exportUserData();
      expect(destinationArtifact.archive.stateSha256).toBe(artifact.archive.stateSha256);
      expect(destinationArtifact.archive.reportSha256).toBe(artifact.archive.reportSha256);
      expect(destinationArtifact.archive.summary).toEqual(artifact.archive.summary);
      const retry = await destination.store.commitUserDataRestore(prepared);
      expect(retry.outcome).toBe("already-restored");
      expect(await count(destination.database, "trade_review_versions")).toBe(3);

      await otherSource.store.commitManualExecution(preparedManual("7", {
        symbol: "NVDA",
      }));
      const differentArtifact = await otherSource.store.exportUserData();
      await expect(destination.store.prepareUserDataRestore(differentArtifact.contents))
        .rejects.toMatchObject({ conflict: { code: "journal_not_empty" } });

      const stalePrepared = await staleDestination.store.prepareUserDataRestore(artifact.contents);
      await staleDestination.store.commitManualExecution(preparedManual("8", {
        symbol: "META",
      }));
      await expect(staleDestination.store.commitUserDataRestore(stalePrepared))
        .rejects.toMatchObject({ conflict: { code: "journal_not_empty" } });
      expect((await staleDestination.store.load()).instruments.map((item) => item.symbol))
        .toEqual(["META"]);
      await expectHealthyDatabase(destination.database);
      await expectHealthyDatabase(staleDestination.database);
    } finally {
      await source.store.close();
      await destination.store.close();
      await staleDestination.store.close();
      await otherSource.store.close();
    }
  });
  it("rolls back an injected partial replay and reconciles a lost commit response", async () => {
    const source = await createHarness();
    const failedHarness = await createHarness();
    const lostHarness = await createHarness();
    const failedDatabase = new RestoreFaultDatabase(failedHarness.database);
    const lostDatabase = new RestoreFaultDatabase(lostHarness.database);
    const failedStore = new SqliteJournalStore(failedDatabase, deterministicRuntime());
    const lostStore = new SqliteJournalStore(lostDatabase, deterministicRuntime());
    try {
      await source.store.commitCsvImport(preparedCsv());
      const artifact = await source.store.exportUserData();

      const failedPrepared = await failedStore.prepareUserDataRestore(artifact.contents);
      failedDatabase.failOnExecutionInsert(2);
      await expect(failedStore.commitUserDataRestore(failedPrepared))
        .rejects.toMatchObject({ conflict: { code: "verification_failed" } });
      expect(await count(failedHarness.database, "workspaces")).toBe(0);
      expect(await count(failedHarness.database, "executions")).toBe(0);
      expect(await count(failedHarness.database, "execution_versions")).toBe(0);
      expect((await failedStore.commitUserDataRestore(failedPrepared)).outcome)
        .toBe("committed");
      expect(await count(failedHarness.database, "executions")).toBe(2);

      const lostPrepared = await lostStore.prepareUserDataRestore(artifact.contents);
      lostDatabase.loseNextCommittedResponse();
      await expect(lostStore.commitUserDataRestore(lostPrepared))
        .rejects.toThrow(/committed response loss/i);
      expect(await count(lostHarness.database, "executions")).toBe(2);
      const reconciled = await lostStore.commitUserDataRestore(lostPrepared);
      expect(reconciled.outcome).toBe("already-restored");
      expect(reconciled.stateSha256).toBe(artifact.archive.stateSha256);
      expect(reconciled.reportSha256).toBe(artifact.archive.reportSha256);
      await expectHealthyDatabase(failedHarness.database);
      await expectHealthyDatabase(lostHarness.database);
    } finally {
      await source.store.close();
      await failedStore.close();
      await lostStore.close();
    }
  });

  it("leaves fresh post-commit failures raw for reconciliation retry", async () => {
    const source = await createHarness();
    const destination = await createHarness();
    const faultDatabase = new RestoreFaultDatabase(destination.database);
    const store = new SqliteJournalStore(faultDatabase, deterministicRuntime());
    try {
      await source.store.commitCsvImport(preparedCsv());
      const artifact = await source.store.exportUserData();
      const prepared = await store.prepareUserDataRestore(artifact.contents);

      faultDatabase.failNextPostCommitVerification();
      await expect(store.commitUserDataRestore(prepared)).rejects.toMatchObject({
        name: "Error",
        message: expect.stringMatching(/post-commit verification failure/i),
      });
      expect(await count(destination.database, "executions")).toBe(2);
      expect((await store.commitUserDataRestore(prepared)).outcome).toBe("already-restored");
      await expectHealthyDatabase(destination.database);
    } finally {
      await source.store.close();
      await store.close();
    }
  });

  it("keeps an earlier acknowledgement outside restore preview rollback", async () => {
    const source = await createHarness();
    const destination = await createHarness();
    const database = new BlockingStoreOperationDatabase(destination.database);
    const store = new SqliteJournalStore(database, deterministicRuntime());
    let acknowledgementGate: StoreOperationGate | null = null;
    let restoreGate: StoreOperationGate | null = null;
    let acknowledgement: Promise<void> | null = null;
    let preview: Promise<unknown> | null = null;
    try {
      await source.store.commitCsvImport(preparedCsv());
      const artifact = await source.store.exportUserData();
      const command = preparedManual("8", { symbol: "META" });
      await store.commitManualExecution(command);

      acknowledgementGate = database.blockNextAcknowledgement();
      restoreGate = database.blockNextTransaction();
      acknowledgement = store.acknowledgeManualExecution(command.submissionId);
      await acknowledgementGate.started;
      preview = store.prepareUserDataRestore(artifact.contents);
      await Promise.resolve();
      expect(restoreGate.isStarted()).toBe(false);

      acknowledgementGate.release();
      await acknowledgement;
      acknowledgement = null;
      await restoreGate.started;
      restoreGate.release();
      await expect(preview).rejects.toMatchObject({
        conflict: { code: "journal_not_empty" },
      });
      preview = null;
      expect(await store.loadUnacknowledgedManualExecutions()).toEqual([]);
      expect(await scalar(
        destination.database,
        "SELECT COUNT(*) FROM manual_execution_submissions WHERE acknowledged_at_ms IS NOT NULL",
      )).toBe(1);
    } finally {
      acknowledgementGate?.release();
      restoreGate?.release();
      if (acknowledgement !== null) await acknowledgement.catch(() => undefined);
      if (preview !== null) await preview.catch(() => undefined);
      await source.store.close();
      await store.close();
    }
  });

  it("queues regular work behind a restore that reserved the store", async () => {
    const source = await createHarness();
    const destination = await createHarness();
    const database = new BlockingStoreOperationDatabase(destination.database);
    const store = new SqliteJournalStore(database, deterministicRuntime());
    await source.store.commitCsvImport(preparedCsv());
    const artifact = await source.store.exportUserData();
    const gate = database.blockNextTransaction();
    const preview = store.prepareUserDataRestore(artifact.contents);
    let loadSettled = false;
    let load: Promise<JournalLedgerSnapshot> | null = null;
    try {
      await gate.started;
      load = store.load().finally(() => {
        loadSettled = true;
      });
      await Promise.resolve();
      expect(loadSettled).toBe(false);

      gate.release();
      expect((await preview).preview.target).toBe("empty");
      expect((await load).workspace).toBeNull();
      load = null;
    } finally {
      gate.release();
      await preview.catch(() => undefined);
      if (load !== null) await load.catch(() => undefined);
      await source.store.close();
      await store.close();
    }
  });

  it("queues close behind earlier work and rejects work requested after close", async () => {
    const destination = await createHarness();
    const database = new BlockingStoreOperationDatabase(destination.database);
    const store = new SqliteJournalStore(database, deterministicRuntime());
    const command = preparedManual("9", { symbol: "MSFT" });
    await store.commitManualExecution(command);
    const acknowledgementGate = database.blockNextAcknowledgement();
    const closeGate = database.blockNextClose();
    const acknowledgement = store.acknowledgeManualExecution(command.submissionId);
    await acknowledgementGate.started;
    const closing = store.close();
    try {
      await Promise.resolve();
      expect(closeGate.isStarted()).toBe(false);
      await expect(store.load()).rejects.toThrow(/store is closing/i);
      await expect(store.prepareUserDataRestore("not parsed while closing")).rejects.toMatchObject({
        name: "Error",
        message: expect.stringMatching(/store is closing/i),
      });

      acknowledgementGate.release();
      await acknowledgement;
      await closeGate.started;
      expect(await scalar(
        destination.database,
        "SELECT COUNT(*) FROM manual_execution_submissions WHERE acknowledged_at_ms IS NOT NULL",
      )).toBe(1);
      closeGate.release();
      await closing;
    } finally {
      acknowledgementGate.release();
      closeGate.release();
      await Promise.allSettled([acknowledgement, closing]);
      await store.close().catch(() => undefined);
    }
  });

  it("rolls back source state that the current mobile workspace cannot render", async () => {
    const source = await createHarness();
    const destination = await createHarness();
    try {
      await source.store.commitManualExecution(preparedManual("4"));
      await source.database.run(
        "UPDATE workspaces SET time_zone_id = ?",
        ["Mars/Olympus"],
      );
      const artifact = await source.store.exportUserData();

      await expect(destination.store.prepareUserDataRestore(artifact.contents))
        .rejects.toMatchObject({
          conflict: {
            code: "verification_failed",
            message: expect.stringMatching(/unsupported time zone/i),
          },
        });
      expect(await count(destination.database, "workspaces")).toBe(0);
      expect(await count(destination.database, "executions")).toBe(0);
      await expectHealthyDatabase(destination.database);
    } finally {
      await source.store.close();
      await destination.store.close();
    }
  });

  it("rejects a self-consistent false report claim and rolls the preview back", async () => {
    const source = await createHarness();
    const destination = await createHarness();
    try {
      await source.store.commitManualExecution(preparedManual("5"));
      const artifact = await source.store.exportUserData();
      const archive = artifact.archive;
      const falseReport = createJournalExportArtifact({
        kind: archive.kind,
        formatVersion: archive.formatVersion,
        exportedAtUs: archive.exportedAtUs,
        source: archive.source,
        payload: archive.payload,
        attachments: archive.attachments,
        summary: archive.summary,
        stateSha256: archive.stateSha256,
        reportSha256: "f".repeat(64),
      });

      await expect(destination.store.prepareUserDataRestore(falseReport.contents))
        .rejects.toMatchObject({
          conflict: {
            code: "verification_failed",
            message: expect.stringMatching(/report digest/i),
          },
        });
      expect(await count(destination.database, "workspaces")).toBe(0);
      expect(await count(destination.database, "executions")).toBe(0);
      await expectHealthyDatabase(destination.database);
    } finally {
      await source.store.close();
      await destination.store.close();
    }
  });

  it("rolls back every review in a batch when a later optimistic head is stale", async () => {
    const { database, store } = await createHarness();
    const twoTrades = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "a-in,AAPL,BTO,1,100,0,USD,2026-07-01T13:30:00Z\r\n"
      + "a-out,AAPL,STC,1,110,0,USD,2026-07-01T14:30:00Z\r\n"
      + "m-in,MSFT,BTO,1,400,0,USD,2026-07-01T15:30:00Z\r\n"
      + "m-out,MSFT,STC,1,410,0,USD,2026-07-01T16:30:00Z";
    try {
      const imported = await store.commitCsvImport(preparedCsv(twoTrades));
      const firstSubject = imported.ledger.tradeSubjects[0]?.tradeSubjectId;
      const secondSubject = imported.ledger.tradeSubjects[1]?.tradeSubjectId;
      if (firstSubject === undefined || secondSubject === undefined) {
        throw new Error("Expected two durable trade subjects.");
      }
      const initialReview = preparedReview(firstSubject, "c");
      await store.commitTradeReviews(preparedReviewBatch("initial-review", [initialReview]));
      const versionCount = await count(database, "trade_review_versions");
      const termCount = await count(database, "review_terms");

      await expect(store.commitTradeReviews(preparedReviewBatch("mixed-retry", [
        initialReview,
        preparedReview(secondSubject, "d", { setup: "Pullback" }),
      ]))).rejects.toMatchObject({ conflict: { code: "submission_changed" } });
      expect(await count(database, "trade_review_versions")).toBe(versionCount);
      expect(await count(database, "trade_review_heads")).toBe(1);
      expect(await count(database, "review_terms")).toBe(termCount);

      const atomicBatch = preparedReviewBatch("atomic-stale-review", [
        preparedReview(secondSubject, "d", {
          setup: "Pullback",
          mistakes: ["Oversized"],
          tags: ["Batch-only tag"],
        }),
        preparedReview(firstSubject, "e", {
          expectedPreviousReviewId: null,
          note: "This edit intentionally carries a stale predecessor.",
        }),
      ]);
      await expect(store.commitTradeReviews(atomicBatch)).rejects.toMatchObject({
        conflict: { code: "review_changed" },
      });
      expect(await count(database, "trade_review_versions")).toBe(versionCount);
      expect(await count(database, "trade_review_heads")).toBe(1);
      expect(await count(database, "review_terms")).toBe(termCount);
      expect((await store.load()).tradeReviews).toHaveLength(1);
      await expectHealthyDatabase(database);
    } finally {
      await store.close();
    }
  });

  it("keeps an old review on its opening subject when replacement executions create a new trade", async () => {
    const { store } = await createHarness();
    try {
      const imported = await store.commitCsvImport(preparedCsv());
      const oldSubjectId = imported.ledger.tradeSubjects[0]?.tradeSubjectId;
      if (oldSubjectId === undefined) throw new Error("Expected an original trade subject.");
      await store.commitTradeReviews(preparedReviewBatch("review-before-replacement", [
        preparedReview(oldSubjectId, "f"),
      ]));
      await store.rollbackImport(imported.receipt.id, "Replace source executions");
      const replacement = await store.commitCsvImport(preparedCsv(
        ROUND_TRIP_CSV.replace("fill-1", "replacement-1").replace("fill-2", "replacement-2"),
      ));
      const newSubjectId = replacement.ledger.tradeSubjects[0]?.tradeSubjectId;

      expect(newSubjectId).toBeDefined();
      expect(newSubjectId).not.toBe(oldSubjectId);
      expect(replacement.ledger.tradeReviews).toEqual([
        expect.objectContaining({ tradeSubjectId: oldSubjectId }),
      ]);
      expect(replacement.ledger.tradeReviews.some((review) => (
        review.tradeSubjectId === newSubjectId
      ))).toBe(false);
    } finally {
      await store.close();
    }
  });

  it("commits manual fills through immutable sources and exact projections without import receipts", async () => {
    const { database, store } = await createHarness();
    try {
      const entry = await store.commitManualExecution(preparedManual("1"));
      const exit = await store.commitManualExecution(preparedManual("2", {
        side: "SELL",
        positionEffect: "CLOSE",
        price: "110",
        executedAt: "2026-07-01T10:30:00",
      }));

      expect(entry.outcome).toBe("committed");
      expect(exit.ledger.imports).toEqual([]);
      expect(exit.ledger.executions).toHaveLength(2);
      expect(exit.ledger.projection.trades[0]).toMatchObject({
        direction: "LONG",
        status: "CLOSED",
        enteredQuantity: "2",
        exitedQuantity: "2",
        moneyTotals: [{
          currency: "USD",
          grossPnl: "20",
          feeCost: "0.2",
          netPnl: "19.8",
        }],
      });
      expect(await count(database, "execution_sources")).toBe(2);
      expect(await scalar(
        database,
        "SELECT COUNT(*) FROM execution_sources WHERE source_kind = 'manual'",
      )).toBe(2);
      expect(await count(database, "import_batches")).toBe(0);
      expect(await count(database, "import_receipts")).toBe(0);
      expect(await count(database, "projection_rebuild_runs")).toBe(2);
      expect(await expectHealthyDatabase(database)).toBeUndefined();
    } finally {
      await store.close();
    }
  });

  it("replays the same manual submission idempotently without rebuilding", async () => {
    const { database, store } = await createHarness();
    try {
      const command = preparedManual("3");
      const first = await store.commitManualExecution(command);
      const duplicate = await store.commitManualExecution(command);

      expect(duplicate).toMatchObject({
        outcome: "duplicate",
        executionId: first.executionId,
      });
      expect(await count(database, "executions")).toBe(1);
      expect(await count(database, "execution_versions")).toBe(1);
      expect(await count(database, "projection_rebuild_runs")).toBe(1);
      expect(await store.loadUnacknowledgedManualExecutions()).toEqual([{
        submissionId: command.submissionId,
        executionId: first.executionId,
        symbol: "AAPL",
        side: "BUY",
      }]);

      const recreatedStore = new SqliteJournalStore(database, deterministicRuntime());
      const recovered = await recreatedStore.loadUnacknowledgedManualExecutions();
      expect(recovered).toHaveLength(1);
      const replayAfterResponseLoss = await recreatedStore.commitManualExecution(command);
      expect(replayAfterResponseLoss).toMatchObject({
        outcome: "duplicate",
        executionId: first.executionId,
      });
      expect(await count(database, "executions")).toBe(1);
      await recreatedStore.acknowledgeManualExecution(command.submissionId);
      expect(await recreatedStore.loadUnacknowledgedManualExecutions()).toEqual([]);
      await expect(database.run(
        "UPDATE manual_execution_submissions SET acknowledged_at_ms = NULL WHERE submission_id = ?",
        [command.submissionId],
      )).rejects.toThrow(/state cannot regress/);
    } finally {
      await store.close();
    }
  });

  it("keeps manual ETF and generic-CSV stock identities separate by asset class", async () => {
    const { store } = await createHarness();
    try {
      const manualEtf = await store.commitManualExecution(preparedManual("7", {
        symbol: "SPY",
        assetClass: "etf",
      }));
      const imported = await store.commitCsvImport(preparedCsv(
        "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
          + "csv-spy,SPY,BUY,1,500,0,USD,2026-07-01T14:30:00Z",
      ));
      expect(imported.ledger.instruments
        .filter((instrument) => instrument.symbol === "SPY")
        .map((instrument) => instrument.assetClass))
        .toEqual(["etf", "stock"]);
      expect(imported.ledger.executions.find((execution) => execution.id === manualEtf.executionId)
        ?.instrumentId).not.toBe(imported.ledger.executions.find((execution) => (
        execution.id !== manualEtf.executionId
      ))?.instrumentId);
      const firstExport = await store.exportUserData();
      const secondExport = await store.exportUserData();
      expect(secondExport.archive.stateSha256).toBe(firstExport.archive.stateSha256);
      expect(secondExport.archive.reportSha256).toBe(firstExport.archive.reportSha256);
    } finally {
      await store.close();
    }
  });

  it("atomically rejects changed or invalid manual submissions", async () => {
    const { database, store } = await createHarness();
    try {
      const committed = preparedManual("4");
      await store.commitManualExecution(committed);
      const before = {
        executions: await count(database, "executions"),
        versions: await count(database, "execution_versions"),
        runs: await count(database, "projection_rebuild_runs"),
      };

      await expect(store.commitManualExecution(preparedManual("4", {
        price: "101",
      }))).rejects.toThrow(/already staged with different/);
      expect({
        executions: await count(database, "executions"),
        versions: await count(database, "execution_versions"),
        runs: await count(database, "projection_rebuild_runs"),
      }).toEqual(before);
    } finally {
      await store.close();
    }

    const invalidHarness = await createHarness();
    try {
      await expect(invalidHarness.store.commitManualExecution(preparedManual("5", {
        side: "SELL",
        positionEffect: "CLOSE",
      }))).rejects.toThrow(/CLOSE execution cannot act on a flat position/);
      expect(await count(invalidHarness.database, "workspaces")).toBe(0);
      expect(await count(invalidHarness.database, "executions")).toBe(0);
      expect(await count(invalidHarness.database, "projection_rebuild_runs")).toBe(0);
    } finally {
      await invalidHarness.store.close();
    }
  });

  it("keeps manual facts outside CSV receipt rollback coverage", async () => {
    const { database, store } = await createHarness();
    try {
      const manual = await store.commitManualExecution(preparedManual("6"));
      const csv = await store.commitCsvImport(preparedCsv(
        "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
        + "csv-exit,AAPL,STC,2,110,0.10,USD,2026-07-01T14:30:00Z",
      ));
      const rolledBack = await store.rollbackImport(csv.receipt.id, "Remove only the CSV exit");

      expect(rolledBack.executions.map((execution) => execution.id)).toEqual([
        manual.executionId,
      ]);
      expect(rolledBack.projection.trades[0]).toMatchObject({
        status: "OPEN",
        remainingQuantity: "2",
      });
      expect(await scalar(
        database,
        `SELECT COUNT(*) FROM import_execution_occurrences
          WHERE execution_id = '${manual.executionId}'`,
      )).toBe(0);
    } finally {
      await store.close();
    }
  });

  it("atomically commits a two-fill round trip with exact receipt and projection values", async () => {
    const { database, store } = await createHarness();
    try {
      const result = await store.commitCsvImport(preparedCsv());

      expect(result.outcome).toBe("committed");
      expect(result.receipt).toMatchObject({
        sourceName: "fills.csv",
        sourceRows: 2,
        acceptedRows: 2,
        rejectedRows: 0,
        skippedRows: 0,
        warningCount: 0,
        executionCount: 2,
        rolledBackAtUs: null,
      });
      expect(result.ledger.executions).toHaveLength(2);
      expect(result.ledger.projection.trades).toHaveLength(1);
      expect(result.ledger.projection.trades[0]).toMatchObject({
        direction: "LONG",
        status: "CLOSED",
        enteredQuantity: "2",
        exitedQuantity: "2",
        remainingQuantity: "0",
        entryNotional: "200",
        exitNotional: "220",
        moneyTotals: [{
          currency: "USD",
          grossPnl: "20",
          feeCost: "0.2",
          netPnl: "19.8",
          feeMinorUnit: 2,
        }],
      });
      expect(await count(database, "executions")).toBe(2);
      expect(await count(database, "execution_versions")).toBe(2);
      expect(await count(database, "execution_fee_components")).toBe(2);
      expect(await count(database, "import_receipts")).toBe(1);
      expect(await count(database, "projection_rebuild_runs")).toBe(1);
      expect(await count(database, "trade_projections")).toBe(1);
      expect(await count(database, "trade_execution_allocations")).toBe(2);
      expect(await count(database, "trade_lot_matches")).toBe(1);
      expect(await scalar(
        database,
        "SELECT generation FROM projection_active_state WHERE workspace_id = 'workspace:primary'",
      )).toBe(1);
      expect(await database.query(
        "SELECT gross_pnl_text, fee_cost_text, net_pnl_text FROM trade_money_totals",
      )).toEqual([{ gross_pnl_text: "20", fee_cost_text: "0.2", net_pnl_text: "19.8" }]);
      await expectHealthyDatabase(database);
    } finally {
      await store.close();
    }
  });

  it("returns the original receipt for an identical import without rebuilding", async () => {
    const { database, store } = await createHarness();
    try {
      const first = await store.commitCsvImport(preparedCsv());
      const duplicate = await store.commitCsvImport(preparedCsv());

      expect(duplicate.outcome).toBe("duplicate");
      expect(duplicate.receipt.id).toBe(first.receipt.id);
      expect(duplicate.ledger.executions).toHaveLength(2);
      expect(duplicate.ledger.imports).toHaveLength(1);
      expect(await count(database, "import_batches")).toBe(1);
      expect(await count(database, "import_receipts")).toBe(1);
      expect(await count(database, "executions")).toBe(2);
      expect(await count(database, "projection_rebuild_runs")).toBe(1);
      expect(await scalar(database, "SELECT generation FROM projection_active_state")).toBe(1);
      await expectHealthyDatabase(database);
    } finally {
      await store.close();
    }
  });

  it("does not collapse identical fills that lack an external execution ID", async () => {
    const { database, store } = await createHarness();
    const identicalFills = "Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "AAPL,BUY,2,100,0,USD,2026-07-01T13:30:00Z\r\n"
      + "AAPL,BUY,2,100,0,USD,2026-07-01T13:30:00Z\r\n"
      + "AAPL,SELL,4,110,0,USD,2026-07-01T14:30:00Z";
    try {
      const result = await store.commitCsvImport(preparedCsv(identicalFills));
      expect(result.ledger.executions).toHaveLength(3);
      expect(result.ledger.projection.trades[0]).toMatchObject({
        enteredQuantity: "4",
        exitedQuantity: "4",
        moneyTotals: [expect.objectContaining({ netPnl: "40" })],
      });
      expect(await count(database, "executions")).toBe(3);
    } finally {
      await store.close();
    }
  });

  it("does not duplicate no-ID executions when a later export reorders rows", async () => {
    const { database, store } = await createHarness();
    const firstOrder = "Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "AAPL,BUY,1,100,0,USD,2026-07-01T13:30:00Z\r\n"
      + "AAPL,BUY,1,101,0,USD,2026-07-01T13:31:00Z\r\n"
      + "AAPL,SELL,2,110,0,USD,2026-07-01T14:30:00Z";
    const reordered = "Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "AAPL,BUY,1,101,0,USD,2026-07-01T13:31:00Z\r\n"
      + "AAPL,BUY,1,100,0,USD,2026-07-01T13:30:00Z\r\n"
      + "AAPL,SELL,2,110,0,USD,2026-07-01T14:30:00Z";
    try {
      await store.commitCsvImport(preparedCsv(firstOrder));
      const result = await store.commitCsvImport(preparedCsv(reordered));

      expect(result.outcome).toBe("committed");
      expect(result.receipt.executionCount).toBe(0);
      expect(result.receipt.warningCount).toBe(3);
      expect(result.ledger.executions).toHaveLength(3);
      expect(result.ledger.imports).toHaveLength(2);
      expect(await count(database, "executions")).toBe(3);
    } finally {
      await store.close();
    }
  });

  it("scopes exact-file deduplication to the selected account", async () => {
    const { database, store } = await createHarness();
    try {
      await store.commitCsvImport(preparedCsv());
      const secondAccount = prepareCsvImport({
        rawInput: ROUND_TRIP_CSV,
        sourceName: "fills.csv",
        accountName: "Second brokerage",
        timeZone: "America/New_York",
        defaultCurrency: "USD",
      });
      const result = await store.commitCsvImport(secondAccount);

      expect(result.outcome).toBe("committed");
      expect(result.ledger.accounts).toHaveLength(2);
      expect(result.ledger.executions).toHaveLength(4);
      expect(await count(database, "import_batches")).toBe(2);
    } finally {
      await store.close();
    }
  });

  it("keeps shared executions active while a later overlapping receipt remains active", async () => {
    const { database, store } = await createHarness();
    const firstCsv = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "fill-1,AAPL,BUY,1,100,0,USD,2026-07-01T13:30:00Z";
    const overlappingCsv = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "fill-1,AAPL,BUY,1,100,0,USD,2026-07-01T13:30:00Z\r\n"
      + "fill-2,AAPL,SELL,1,110,0,USD,2026-07-01T14:30:00Z";
    try {
      const first = await store.commitCsvImport(preparedCsv(firstCsv));
      const second = await store.commitCsvImport(preparedCsv(overlappingCsv));
      expect(second.ledger.executions).toHaveLength(2);
      expect(second.receipt).toMatchObject({ acceptedRows: 2, executionCount: 1 });
      expect(await count(database, "import_execution_occurrences")).toBe(3);

      const afterFirstRollback = await store.rollbackImport(
        first.receipt.id,
        "Remove the earlier overlapping import",
      );
      expect(afterFirstRollback.executions).toHaveLength(2);
      expect(afterFirstRollback.projection.moneyTotals[0]?.netPnl).toBe("10");
      expect(await scalar(
        database,
        `SELECT reverted_execution_count
           FROM import_rollbacks WHERE import_receipt_id = '${first.receipt.id}'`,
      )).toBe(0);

      const duplicate = await store.commitCsvImport(preparedCsv(overlappingCsv));
      expect(duplicate.outcome).toBe("duplicate");
      expect(duplicate.ledger.executions).toHaveLength(2);

      const afterSecondRollback = await store.rollbackImport(
        second.receipt.id,
        "Remove the remaining overlapping import",
      );
      expect(afterSecondRollback.executions).toEqual([]);
      expect(await scalar(
        database,
        `SELECT reverted_execution_count
           FROM import_rollbacks WHERE import_receipt_id = '${second.receipt.id}'`,
      )).toBe(2);
      await expectHealthyDatabase(database);
    } finally {
      await store.close();
    }
  });

  it("keeps a later trade on its immutable subject when an earlier trade is rolled back", async () => {
    const { database, store } = await createHarness();
    const firstTrade = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "a-entry,AAPL,BTO,1,100,0,USD,2026-07-01T13:30:00Z\r\n"
      + "a-exit,AAPL,STC,1,110,0,USD,2026-07-01T14:30:00Z";
    const secondTrade = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "b-entry,AAPL,BTO,1,120,0,USD,2026-07-02T13:30:00Z\r\n"
      + "b-exit,AAPL,STC,1,130,0,USD,2026-07-02T14:30:00Z";
    const activeSubjectForB = () => scalar(
      database,
      `SELECT projection.trade_subject_id
         FROM trade_projections AS projection
         JOIN projection_active_state AS active
           ON active.active_rebuild_run_id = projection.rebuild_run_id
         JOIN trade_execution_allocations AS allocation
           ON allocation.rebuild_run_id = projection.rebuild_run_id
          AND allocation.trade_subject_id = projection.trade_subject_id
         JOIN execution_versions AS version
           ON version.id = allocation.execution_version_id
        WHERE version.external_execution_id = 'b-entry'
          AND allocation.effect = 'entry'`,
    );
    try {
      const first = await store.commitCsvImport(preparedCsv(firstTrade));
      await store.commitCsvImport(preparedCsv(secondTrade));
      const subjectBefore = await activeSubjectForB();

      await store.rollbackImport(first.receipt.id, "Remove the earlier independent trade");

      expect(await activeSubjectForB()).toBe(subjectBefore);
      expect((await store.load()).projection.trades).toHaveLength(1);
      await expectHealthyDatabase(database);
    } finally {
      await store.close();
    }
  });

  it("uses a workspace-global execution sequence across equal-timestamp batches", async () => {
    const { database, store } = await createHarness();
    const entry = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "z-entry,AAPL,BTO,1,100,0,USD,2026-07-01T13:30:00Z";
    const exit = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "a-exit,AAPL,STC,1,110,0,USD,2026-07-01T13:30:00Z";
    try {
      await store.commitCsvImport(preparedCsv(entry));
      const result = await store.commitCsvImport(preparedCsv(exit));

      expect(result.ledger.projection.trades[0]).toMatchObject({
        status: "CLOSED",
        moneyTotals: [expect.objectContaining({ netPnl: "10" })],
      });
      expect(await database.query(
        `SELECT version.external_execution_id, execution.ledger_sequence
           FROM execution_heads AS head
           JOIN execution_versions AS version ON version.id = head.execution_version_id
           JOIN executions AS execution ON execution.id = head.execution_id
          ORDER BY execution.ledger_sequence`,
      )).toEqual([
        { external_execution_id: "z-entry", ledger_sequence: 1 },
        { external_execution_id: "a-exit", ledger_sequence: 2 },
      ]);
    } finally {
      await store.close();
    }
  });

  it("preserves equal-timestamp ordering when a rolled-back file is restored in reverse", async () => {
    const { database, store } = await createHarness();
    const original = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "entry,AAPL,BTO,1,100,0,USD,2026-07-01T13:30:00Z\r\n"
      + "exit,AAPL,STC,1,110,0,USD,2026-07-01T13:30:00Z";
    const reversed = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "exit,AAPL,STC,1,110,0,USD,2026-07-01T13:30:00Z\r\n"
      + "entry,AAPL,BTO,1,100,0,USD,2026-07-01T13:30:00Z";
    try {
      const first = await store.commitCsvImport(preparedCsv(original));
      await store.rollbackImport(first.receipt.id, "Restore from a differently ordered export");
      const restored = await store.commitCsvImport(preparedCsv(reversed));

      expect(restored.outcome).toBe("committed");
      expect(restored.ledger.projection.trades[0]).toMatchObject({
        status: "CLOSED",
        moneyTotals: [expect.objectContaining({ netPnl: "10" })],
      });
      expect(await database.query(
        `SELECT version.external_execution_id, execution.ledger_sequence
           FROM execution_heads AS head
           JOIN execution_versions AS version ON version.id = head.execution_version_id
           JOIN executions AS execution ON execution.id = head.execution_id
          ORDER BY execution.ledger_sequence`,
      )).toEqual([
        { external_execution_id: "entry", ledger_sequence: 1 },
        { external_execution_id: "exit", ledger_sequence: 2 },
      ]);
    } finally {
      await store.close();
    }
  });

  it("rolls back every staged write when a stable source identity changes payload", async () => {
    const { database, store } = await createHarness();
    try {
      await store.commitCsvImport(preparedCsv());
      const before = {
        batches: await count(database, "import_batches"),
        rows: await count(database, "import_source_rows"),
        issues: await count(database, "import_issues"),
        receipts: await count(database, "import_receipts"),
        executions: await count(database, "executions"),
        versions: await count(database, "execution_versions"),
        runs: await count(database, "projection_rebuild_runs"),
        generation: await scalar(database, "SELECT generation FROM projection_active_state"),
      };
      const changedSecondFill = ROUND_TRIP_CSV.replace(
        "fill-2,AAPL,STC,2,110,0.10",
        "fill-2,MSFT,STC,2,110,0.10",
      );

      await expect(store.commitCsvImport(preparedCsv(changedSecondFill))).rejects.toMatchObject({
        name: "JournalImportError",
        conflict: { code: "execution_changed" },
      });

      expect({
        batches: await count(database, "import_batches"),
        rows: await count(database, "import_source_rows"),
        issues: await count(database, "import_issues"),
        receipts: await count(database, "import_receipts"),
        executions: await count(database, "executions"),
        versions: await count(database, "execution_versions"),
        runs: await count(database, "projection_rebuild_runs"),
        generation: await scalar(database, "SELECT generation FROM projection_active_state"),
      }).toEqual(before);
      expect((await store.load()).executions).toHaveLength(2);
      await expectHealthyDatabase(database);
    } finally {
      await store.close();
    }
  });

  it("voids imported executions on receipt rollback while retaining immutable history", async () => {
    const { database, store } = await createHarness();
    try {
      const committed = await store.commitCsvImport(preparedCsv());
      const rolledBack = await store.rollbackImport(
        committed.receipt.id,
        "User requested a complete rollback",
      );

      expect(rolledBack.executions).toEqual([]);
      expect(rolledBack.projection.trades).toEqual([]);
      expect(rolledBack.imports).toHaveLength(1);
      expect(rolledBack.imports[0]).toMatchObject({
        id: committed.receipt.id,
        executionCount: 2,
        rolledBackAtUs: expect.stringMatching(/^[0-9]+$/),
      });
      expect(await count(database, "import_batches")).toBe(1);
      expect(await count(database, "import_source_rows")).toBe(2);
      expect(await count(database, "import_receipts")).toBe(1);
      expect(await count(database, "import_rollbacks")).toBe(1);
      expect(await count(database, "executions")).toBe(2);
      expect(await count(database, "execution_versions")).toBe(4);
      expect(await count(database, "execution_sources")).toBe(2);
      expect(await count(database, "execution_fee_components")).toBe(2);
      expect(await scalar(
        database,
        `SELECT COUNT(*) FROM execution_heads AS head
          JOIN execution_versions AS version ON version.id = head.execution_version_id
         WHERE version.is_void = 1`,
      )).toBe(2);
      expect(await count(database, "projection_rebuild_runs")).toBe(2);
      expect(await scalar(database, "SELECT generation FROM projection_active_state")).toBe(2);
      expect(await count(database, "trade_projections")).toBe(1);
      await expect(
        database.run(
          "UPDATE import_receipts SET warning_count = 99 WHERE id = ?",
          [committed.receipt.id],
        ),
      ).rejects.toThrow(/immutable/);
      await expect(
        database.run(
          "UPDATE trade_projections SET status = 'open' WHERE rowid = (SELECT rowid FROM trade_projections LIMIT 1)",
        ),
      ).rejects.toThrow(/immutable/);
      await expect(
        database.run(
          "DELETE FROM projection_rebuild_runs WHERE id = (SELECT id FROM projection_rebuild_runs LIMIT 1)",
        ),
      ).rejects.toThrow(/immutable/);
      await expectHealthyDatabase(database);

      const restored = await store.commitCsvImport(preparedCsv());
      expect(restored.outcome).toBe("committed");
      expect(restored.ledger.executions).toHaveLength(2);
      expect(restored.ledger.imports).toHaveLength(2);
      expect(await count(database, "executions")).toBe(2);
      expect(await count(database, "execution_versions")).toBe(6);
      expect(await count(database, "execution_sources")).toBe(4);
      expect(await count(database, "execution_fee_components")).toBe(4);
      expect(await count(database, "import_batches")).toBe(2);
      expect(await count(database, "import_receipts")).toBe(2);
      expect(await scalar(database, "SELECT generation FROM projection_active_state")).toBe(3);
      const rebuilds = await database.query<SqlRow>(
        `SELECT input_heads_sha256, output_sha256
           FROM projection_rebuild_runs ORDER BY started_at_ms, id`,
      );
      expect(rebuilds).toHaveLength(3);
      expect(rebuilds[0]?.input_heads_sha256).not.toBe(rebuilds[2]?.input_heads_sha256);
      expect(rebuilds[0]?.output_sha256).toBe(rebuilds[2]?.output_sha256);
      await expectHealthyDatabase(database);
    } finally {
      await store.close();
    }
  });

  it("keeps rollback audit time causal when the device clock moves backward", async () => {
    const ids = deterministicRuntime();
    const times = [2_000, 1_000];
    const { database, store } = await createHarness({
      nowMs: () => times.shift() ?? 1_000,
      newId: (prefix) => ids.newId(prefix),
    });
    try {
      const committed = await store.commitCsvImport(preparedCsv());
      const rolledBack = await store.rollbackImport(
        committed.receipt.id,
        "Clock moved backward after the import",
      );

      expect(committed.receipt.importedAtUs).toBe("2000000");
      expect(rolledBack.imports[0]?.rolledBackAtUs).toBe("2000000");
      expect(await scalar(
        database,
        "SELECT recorded_at_ms FROM import_rollbacks LIMIT 1",
      )).toBe(2_000);
    } finally {
      await store.close();
    }
  });
});
