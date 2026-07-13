import initSqlJs, { type Database } from "sql.js";
import { describe, expect, it } from "vitest";

import type {
  SqlDatabase,
  SqlParameters,
  SqlRow,
  SqlRunResult,
} from "../../application/sql-database";
import {
  readSqliteJournalArchive,
  SQLITE_JOURNAL_ARCHIVE_TABLES,
  sqliteArchiveTable,
} from "./journal-archive";
import { MOBILE_SCHEMA_MIGRATIONS } from "./schema";

class SqlJsArchiveDatabase implements SqlDatabase {
  private inTransaction = false;

  constructor(private readonly database: Database) {}

  async execute(statement: string): Promise<SqlRunResult> {
    this.database.run(statement);
    return { changes: this.database.getRowsModified() };
  }

  async run(statement: string, values: SqlParameters = []): Promise<SqlRunResult> {
    this.database.run(statement, [...values]);
    return { changes: this.database.getRowsModified() };
  }

  async query<Row extends SqlRow>(
    statement: string,
    values: SqlParameters = [],
  ): Promise<readonly Row[]> {
    const prepared = this.database.prepare(statement);
    try {
      prepared.bind([...values]);
      const rows: Row[] = [];
      while (prepared.step()) rows.push(prepared.getAsObject() as Row);
      return rows;
    } finally {
      prepared.free();
    }
  }

  async transaction<Result>(operation: () => Promise<Result>): Promise<Result> {
    if (this.inTransaction) throw new Error("Nested archive test transaction.");
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
    this.database.close();
  }
}

async function migratedDatabase(): Promise<SqlJsArchiveDatabase> {
  const SQL = await initSqlJs();
  const database = new SqlJsArchiveDatabase(new SQL.Database());
  await database.execute("PRAGMA foreign_keys = ON");
  await database.transaction(async () => {
    for (const migration of MOBILE_SCHEMA_MIGRATIONS) {
      for (const statement of migration.statements) await database.execute(statement);
    }
    const current = MOBILE_SCHEMA_MIGRATIONS.at(-1);
    if (current === undefined) throw new Error("Missing test migration.");
    await database.execute(`PRAGMA user_version = ${current.toVersion}`);
  });
  return database;
}

describe("SQLite journal export payload v1", () => {
  it("covers every v1-v3 table and column with deterministic string-safe rows", async () => {
    const database = await migratedDatabase();
    try {
      const first = await database.transaction(() => readSqliteJournalArchive(database));
      const second = await database.transaction(() => readSqliteJournalArchive(database));
      expect(first.stateSha256).toBe(second.stateSha256);
      expect(first.tables.map((table) => table.name)).toEqual(SQLITE_JOURNAL_ARCHIVE_TABLES);
      expect(first.tables.flatMap((table) => table.columns)).toHaveLength(257);
      const migrations = sqliteArchiveTable(first, "schema_migrations");
      expect(migrations.rows).toHaveLength(3);
      expect(migrations.rows.every((row) => typeof row[0] === "string")).toBe(true);
      expect(migrations.rows.map((row) => row[0])).toEqual(["1", "2", "3"]);
      expect(sqliteArchiveTable(first, "metric_definitions").rows).toHaveLength(2);
    } finally {
      await database.close();
    }
  });

  it("sorts rows independently of insertion order", async () => {
    const database = await migratedDatabase();
    try {
      await database.run("INSERT INTO currencies VALUES ('USD', 2, 'US Dollar')");
      await database.run("INSERT INTO currencies VALUES ('EUR', 2, 'Euro')");
      const archive = await database.transaction(() => readSqliteJournalArchive(database));
      expect(sqliteArchiveTable(archive, "currencies").rows.map((row) => row[0]))
        .toEqual(["EUR", "USD"]);
    } finally {
      await database.close();
    }
  });

  it("fails closed for unclassified tables, missing tables, and unsupported column types", async () => {
    const extra = await migratedDatabase();
    try {
      await extra.execute("CREATE TABLE unexpected_export_state (id TEXT PRIMARY KEY) STRICT");
      await expect(extra.transaction(() => readSqliteJournalArchive(extra)))
        .rejects.toThrow(/unsupported: unexpected_export_state/i);
    } finally {
      await extra.close();
    }

    const missing = await migratedDatabase();
    try {
      await missing.execute("DROP TABLE import_issues");
      await expect(missing.transaction(() => readSqliteJournalArchive(missing)))
        .rejects.toThrow(/missing: import_issues/i);
    } finally {
      await missing.close();
    }

    const unsupported = await migratedDatabase();
    try {
      await unsupported.execute("ALTER TABLE workspaces ADD COLUMN unsafe_real REAL");
      await expect(unsupported.transaction(() => readSqliteJournalArchive(unsupported)))
        .rejects.toThrow(/unsupported type real/i);
    } finally {
      await unsupported.close();
    }
  });

  it("fails closed when a supported TEXT column is added", async () => {
    const database = await migratedDatabase();
    try {
      await database.execute("ALTER TABLE workspaces ADD COLUMN future_note TEXT");
      await expect(database.transaction(() => readSqliteJournalArchive(database)))
        .rejects.toThrow(/workspaces column manifest/i);
    } finally {
      await database.close();
    }
  });

  it("fails closed when a supported INTEGER column is added", async () => {
    const database = await migratedDatabase();
    try {
      await database.execute("ALTER TABLE workspaces ADD COLUMN future_count INTEGER");
      await expect(database.transaction(() => readSqliteJournalArchive(database)))
        .rejects.toThrow(/workspaces column manifest/i);
    } finally {
      await database.close();
    }
  });

  it("fails closed when a column is renamed without changing its count", async () => {
    const database = await migratedDatabase();
    try {
      await database.execute("ALTER TABLE currencies RENAME COLUMN display_name TO label");
      await expect(database.transaction(() => readSqliteJournalArchive(database)))
        .rejects.toThrow(/currencies column manifest/i);
    } finally {
      await database.close();
    }
  });

  it("rejects generated or hidden columns before selecting journal rows", async () => {
    const database = await migratedDatabase();
    try {
      await database.execute(
        "ALTER TABLE workspaces ADD COLUMN generated_name TEXT GENERATED ALWAYS AS (name) VIRTUAL",
      );
      await expect(database.transaction(() => readSqliteJournalArchive(database)))
        .rejects.toThrow(/generated or hidden/i);
    } finally {
      await database.close();
    }
  });

  it("excludes migration wall clocks from portable state but retains diagnostics", async () => {
    const database = await migratedDatabase();
    try {
      const before = await database.transaction(() => readSqliteJournalArchive(database));
      const beforeMigrations = sqliteArchiveTable(before, "schema_migrations");
      await database.execute("DROP TRIGGER schema_migrations_reject_update");
      await database.run(
        "UPDATE schema_migrations SET applied_at_ms = applied_at_ms + 1 WHERE version = 1",
      );
      const after = await database.transaction(() => readSqliteJournalArchive(database));
      const afterMigrations = sqliteArchiveTable(after, "schema_migrations");

      expect(after.stateSha256).toBe(before.stateSha256);
      expect(afterMigrations.tableSha256).not.toBe(beforeMigrations.tableSha256);
      expect(afterMigrations.rows).not.toEqual(beforeMigrations.rows);
    } finally {
      await database.close();
    }
  });

  it("changes portable state when a user-owned row changes", async () => {
    const database = await migratedDatabase();
    try {
      const before = await database.transaction(() => readSqliteJournalArchive(database));
      await database.run("INSERT INTO currencies VALUES ('USD', 2, 'US Dollar')");
      const after = await database.transaction(() => readSqliteJournalArchive(database));

      expect(after.stateSha256).not.toBe(before.stateSha256);
      expect(sqliteArchiveTable(after, "currencies").tableSha256)
        .not.toBe(sqliteArchiveTable(before, "currencies").tableSha256);
    } finally {
      await database.close();
    }
  });

  it("rejects migration provenance that does not match the app build", async () => {
    const database = await migratedDatabase();
    try {
      await database.execute("DROP TRIGGER schema_migrations_reject_update");
      await database.run(
        "UPDATE schema_migrations SET checksum_sha256 = ? WHERE version = 1",
        ["0".repeat(64)],
      );
      await expect(database.transaction(() => readSqliteJournalArchive(database)))
        .rejects.toThrow(/migration history does not match/i);
    } finally {
      await database.close();
    }
  });

});
