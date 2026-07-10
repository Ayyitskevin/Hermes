import initSqlJs, { type Database } from "sql.js";
import { describe, expect, it } from "vitest";

import type {
  SqlDatabase,
  SqlParameters,
  SqlRow,
  SqlRunResult,
} from "../../application/sql-database";
import { prepareCsvImport } from "../../application/prepare-csv-import";
import { V1_MIGRATION_STATEMENTS } from "./schema";
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
    for (const statement of V1_MIGRATION_STATEMENTS) {
      await database.execute(statement);
    }
    await database.execute("PRAGMA user_version = 1");
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
