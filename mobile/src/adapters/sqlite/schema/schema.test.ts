import initSqlJs, { type Database } from "sql.js";
import { describe, expect, it } from "vitest";

import {
  MOBILE_SCHEMA_MIGRATIONS,
  V1_MIGRATION_BODY,
  V1_MIGRATION_CHECKSUM_SHA256,
  V1_MIGRATION_NAME,
  V1_MIGRATION_STATEMENTS,
  V1_MIGRATION_VERSION,
  createCapacitorSchemaUpgrades,
  sha256Hex,
  v1MigrationChecksumInput,
} from "./index";

const REQUIRED_TABLES = [
  "accounts",
  "currencies",
  "execution_fee_components",
  "execution_heads",
  "execution_sources",
  "execution_versions",
  "executions",
  "import_batches",
  "import_execution_occurrences",
  "import_issues",
  "import_receipts",
  "import_rollbacks",
  "import_source_rows",
  "instruments",
  "projection_active_state",
  "projection_rebuild_runs",
  "schema_migrations",
  "trade_execution_allocations",
  "trade_lot_matches",
  "trade_money_totals",
  "trade_projections",
  "trade_subjects",
  "workspaces",
] as const;

const REQUIRED_INDEXES = [
  "accounts_workspace_active_idx",
  "execution_fee_components_currency_idx",
  "execution_sources_import_row_idx",
  "execution_versions_time_idx",
  "executions_account_time_idx",
  "import_batches_dedupe_idx",
  "import_batches_workspace_time_idx",
  "import_execution_occurrences_execution_idx",
  "import_issues_batch_severity_idx",
  "import_source_rows_batch_hash_idx",
  "instruments_non_option_identity_idx",
  "instruments_option_identity_idx",
  "instruments_workspace_symbol_idx",
  "projection_rebuild_runs_workspace_status_idx",
  "trade_execution_allocations_version_idx",
  "trade_lot_matches_entry_idx",
  "trade_lot_matches_exit_idx",
  "trade_money_totals_currency_idx",
  "trade_projections_status_time_idx",
  "trade_subjects_account_instrument_idx",
] as const;

function queryColumn(db: Database, sql: string): (number | string | Uint8Array | null)[] {
  const result = db.exec(sql)[0];
  return result?.values.map((row) => row[0] ?? null) ?? [];
}

async function createMigratedDatabase(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON");
  db.run("BEGIN IMMEDIATE");
  try {
    for (const statement of V1_MIGRATION_STATEMENTS) {
      db.run(statement);
    }
    db.run("PRAGMA user_version = 1");
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    db.close();
    throw error;
  }
  return db;
}

describe("mobile SQLite migration contract", () => {
  it("uses stable ordered migration inputs and fresh Capacitor-compatible arrays", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

    expect(MOBILE_SCHEMA_MIGRATIONS.map(({ toVersion }) => toVersion)).toEqual([1]);
    expect(MOBILE_SCHEMA_MIGRATIONS[0]).toMatchObject({
      toVersion: V1_MIGRATION_VERSION,
      name: V1_MIGRATION_NAME,
      checksumSha256: V1_MIGRATION_CHECKSUM_SHA256,
      checksumInput: v1MigrationChecksumInput(),
    });
    expect(V1_MIGRATION_CHECKSUM_SHA256).toBe(
        "37905c631232529779ebaa6178ddd7b4c102f8f93b099898712bbe539ea92326",
    );

    const firstCopy = createCapacitorSchemaUpgrades();
    const secondCopy = createCapacitorSchemaUpgrades();
    expect(firstCopy).toEqual([{ toVersion: 1, statements: [...V1_MIGRATION_STATEMENTS] }]);
    expect(secondCopy).toEqual(firstCopy);
    expect(secondCopy).not.toBe(firstCopy);
    expect(secondCopy[0]?.statements).not.toBe(firstCopy[0]?.statements);

    for (let index = 1; index < MOBILE_SCHEMA_MIGRATIONS.length; index += 1) {
      expect(MOBILE_SCHEMA_MIGRATIONS[index]?.toVersion).toBeGreaterThan(
        MOBILE_SCHEMA_MIGRATIONS[index - 1]?.toVersion ?? 0,
      );
    }
  });

  it("keeps one top-level statement per item and forbids lossy ledger patterns", () => {
    const migrationSql = V1_MIGRATION_STATEMENTS.join("\n");

    for (const statement of V1_MIGRATION_STATEMENTS) {
      expect(statement.trim().length).toBeGreaterThan(0);
      if (/^CREATE TRIGGER\b/i.test(statement.trim())) {
        expect(statement).toMatch(/^CREATE TRIGGER IF NOT EXISTS[\s\S]+BEGIN SELECT RAISE\([\s\S]+\); END$/i);
      } else {
        expect(statement).not.toContain(";");
      }
    }

    expect(migrationSql).not.toMatch(/\bREAL\b/i);
    expect(migrationSql).not.toMatch(/INSERT\s+OR\s+REPLACE/i);
    expect(migrationSql).not.toMatch(/ON\s+CONFLICT[\s\S]{0,80}\bREPLACE\b/i);
    expect(migrationSql).not.toMatch(/PRAGMA\s+foreign_keys\s*=\s*OFF/i);
    expect(migrationSql).not.toMatch(/\b(?:fee|commission)_minor\b/i);
    expect(migrationSql).not.toMatch(/\b[a-z_]+_atoms\b/i);
    expect(migrationSql).not.toMatch(/\b(?:price|quantity)_scale\b/i);

    const decimalColumnDeclarations = Array.from(
      migrationSql.matchAll(/^\s*([a-z_]+_text)\s+(TEXT|INTEGER|REAL|BLOB|ANY)\b/gim),
      (match) => ({ name: match[1], type: match[2] }),
    );
    expect(decimalColumnDeclarations.length).toBeGreaterThan(15);
    expect(decimalColumnDeclarations.every(({ type }) => type === "TEXT")).toBe(true);
    expect(migrationSql).toMatch(/cost_minor INTEGER NOT NULL/);
  });

  it("declares the required strict tables, constraints, indexes, and immutable ledgers", () => {
    const bodySql = V1_MIGRATION_BODY.join("\n");

    for (const tableName of REQUIRED_TABLES) {
      expect(bodySql).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${tableName} \\([\\s\\S]+?\\) STRICT`, "i"));
    }
    for (const indexName of REQUIRED_INDEXES) {
      expect(bodySql).toMatch(new RegExp(`CREATE (?:UNIQUE )?INDEX IF NOT EXISTS ${indexName}\\b`));
    }
    for (const tableName of [
      "schema_migrations",
      "currencies",
      "instruments",
      "import_batches",
      "import_execution_occurrences",
      "import_source_rows",
      "import_issues",
      "import_receipts",
      "import_rollbacks",
      "executions",
      "execution_versions",
      "execution_fee_components",
      "execution_sources",
      "projection_rebuild_runs",
      "trade_subjects",
      "trade_projections",
      "trade_execution_allocations",
      "trade_lot_matches",
      "trade_money_totals",
    ]) {
      expect(bodySql).toContain(`CREATE TRIGGER IF NOT EXISTS ${tableName}_reject_update`);
      expect(bodySql).toContain(`CREATE TRIGGER IF NOT EXISTS ${tableName}_reject_delete`);
    }

    expect(bodySql).toMatch(/FOREIGN KEY \(execution_id, execution_version_id\)[\s\S]+REFERENCES execution_versions\(execution_id, id\)/);
    expect(bodySql).toMatch(/executed_at_us INTEGER NOT NULL CHECK\(executed_at_us >= 0\)/);
    expect(bodySql).toMatch(/position_effect TEXT NOT NULL DEFAULT 'auto'[\s\S]+CHECK\(position_effect IN \('auto', 'open', 'close'\)\)/);
    expect(bodySql).toMatch(/ledger_sequence INTEGER NOT NULL CHECK\(ledger_sequence > 0\)/);
    expect(bodySql).toMatch(/UNIQUE \(workspace_id, ledger_sequence\)/);
    expect(bodySql).toMatch(/quantity_text TEXT NOT NULL CHECK/);
    expect(bodySql).toMatch(/price_text TEXT NOT NULL CHECK/);
    expect(bodySql).toMatch(/gross_pnl_text TEXT NOT NULL CHECK/);
    expect(bodySql).toMatch(/fee_cost_text TEXT NOT NULL CHECK/);
    expect(bodySql).toMatch(/net_pnl_text TEXT NOT NULL CHECK/);
    expect(bodySql).toMatch(/accepted_row_count \+ rejected_row_count \+ skipped_row_count = source_row_count/);
    expect(bodySql).toMatch(/FOREIGN KEY \(account_id, workspace_id\)[\s\S]+REFERENCES accounts\(id, workspace_id\)/);
    expect(bodySql).toMatch(/FOREIGN KEY \(import_batch_id, account_id, workspace_id\)[\s\S]+REFERENCES import_batches\(id, account_id, workspace_id\)/);
    expect(bodySql).toMatch(/FOREIGN KEY \(execution_id, account_id, workspace_id\)[\s\S]+REFERENCES executions\(id, account_id, workspace_id\)/);
    expect(bodySql).not.toMatch(/UNIQUE \(workspace_id, input_sha256, parser_id, parser_version, mapping_sha256\)/);
  });

  it("executes the complete v1 migration with foreign keys and integrity checks enabled", async () => {
    const db = await createMigratedDatabase();
    try {
      expect(queryColumn(db, "PRAGMA foreign_keys")).toEqual([1]);
      expect(queryColumn(db, "PRAGMA user_version")).toEqual([1]);
      expect(queryColumn(db, "PRAGMA quick_check")).toEqual(["ok"]);
      expect(db.exec("PRAGMA foreign_key_check")).toEqual([]);

      const tables = queryColumn(
        db,
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      );
      expect(tables).toEqual([...REQUIRED_TABLES].sort());

      const tableList = db.exec("PRAGMA table_list")[0];
      expect(tableList).toBeDefined();
      const tableNameColumn = tableList?.columns.indexOf("name") ?? -1;
      const strictColumn = tableList?.columns.indexOf("strict") ?? -1;
      expect(tableNameColumn).toBeGreaterThanOrEqual(0);
      expect(strictColumn).toBeGreaterThanOrEqual(0);
      for (const tableName of REQUIRED_TABLES) {
        const row = tableList?.values.find((value) => value[tableNameColumn] === tableName);
        expect(row?.[strictColumn], `${tableName} should be STRICT`).toBe(1);
      }

      const indexes = queryColumn(
        db,
        "SELECT name FROM sqlite_schema WHERE type = 'index' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      );
      for (const indexName of REQUIRED_INDEXES) {
        expect(indexes).toContain(indexName);
      }

      expect(queryColumn(db, "SELECT version FROM schema_migrations")).toEqual([1]);
      expect(queryColumn(db, "SELECT checksum_sha256 FROM schema_migrations")).toEqual([
        V1_MIGRATION_CHECKSUM_SHA256,
      ]);

      db.run("INSERT INTO currencies VALUES ('USD', 2, 'US Dollar')");
      db.run(
        "INSERT INTO workspaces VALUES ('workspace-1', 'Journal', 'USD', 'America/New_York', 1, 1, NULL)",
      );
      expect(() =>
        db.run(
          "INSERT INTO accounts (id, workspace_id, name, account_kind, base_currency_code, created_at_ms) VALUES ('bad-account', 'missing', 'Bad', 'paper', 'USD', 1)",
        ),
      ).toThrow();

      db.run(
        "INSERT INTO accounts (id, workspace_id, name, account_kind, base_currency_code, created_at_ms) VALUES ('account-1', 'workspace-1', 'Paper', 'paper', 'USD', 1)",
      );
      expect(() =>
        db.run(
          "INSERT INTO instruments (id, workspace_id, symbol, asset_class, quote_currency_code, multiplier_text, created_at_ms) VALUES ('bad-instrument', 'workspace-1', 'BAD', 'stock', 'USD', '1.0', 1)",
        ),
      ).toThrow();
      db.run(
        "INSERT INTO instruments (id, workspace_id, symbol, asset_class, quote_currency_code, multiplier_text, created_at_ms) VALUES ('instrument-1', 'workspace-1', 'AAPL', 'stock', 'USD', '1', 1)",
      );

      const hash = "a".repeat(64);
      db.run(
        "INSERT INTO import_batches VALUES (?, ?, ?, 'generic_csv', 'trades.csv', 'generic', 1, ?, '{}', ?, 1)",
        ["batch-1", "workspace-1", "account-1", hash, hash],
      );
      expect(() => db.run("UPDATE import_batches SET source_name = 'changed.csv' WHERE id = 'batch-1'"))
        .toThrow(/immutable/);
      expect(() => db.run("DELETE FROM import_batches WHERE id = 'batch-1'"))
        .toThrow(/immutable/);

      const executionHash = "b".repeat(64);
      db.run(
        "INSERT INTO executions VALUES ('execution-1', 'workspace-1', 'account-1', 'instrument-1', 1, ?, 1)",
        [executionHash],
      );
      expect(() =>
        db.run(
          "INSERT INTO execution_versions (id, execution_id, workspace_id, version_number, side, quantity_text, price_text, quote_currency_code, executed_at_us, version_sha256, recorded_at_ms) VALUES ('bad-version', 'execution-1', 'workspace-1', 1, 'buy', '1.0', '10', 'USD', 1, ?, 1)",
          ["c".repeat(64)],
        ),
      ).toThrow();
      db.run(
        "INSERT INTO execution_versions (id, execution_id, workspace_id, version_number, side, position_effect, quantity_text, price_text, quote_currency_code, executed_at_us, version_sha256, recorded_at_ms) VALUES ('version-1', 'execution-1', 'workspace-1', 1, 'buy', 'auto', '1', '10.25', 'USD', 1000000, ?, 1)",
        ["d".repeat(64)],
      );
      db.run(
        "INSERT INTO accounts (id, workspace_id, name, account_kind, base_currency_code, created_at_ms) VALUES ('account-2', 'workspace-1', 'Second', 'paper', 'USD', 1)",
      );
      db.run(
        "INSERT INTO executions VALUES ('execution-2', 'workspace-1', 'account-2', 'instrument-1', 2, ?, 1)",
        ["e".repeat(64)],
      );
      db.run(
        "INSERT INTO execution_versions (id, execution_id, workspace_id, version_number, side, position_effect, quantity_text, price_text, quote_currency_code, executed_at_us, version_sha256, recorded_at_ms) VALUES ('version-2', 'execution-2', 'workspace-1', 1, 'buy', 'auto', '1', '10.25', 'USD', 2000000, ?, 1)",
        ["f".repeat(64)],
      );
      db.run(
        "INSERT INTO import_source_rows VALUES ('row-1', 'batch-1', 1, 'AAPL,BUY', '{}', ?)",
        ["1".repeat(64)],
      );
      expect(() => db.run(
        "INSERT INTO import_execution_occurrences VALUES ('occurrence-1', 'batch-1', 'row-1', 'workspace-1', 'account-1', 'execution-2', 'version-2', 'duplicate', 1)",
      )).toThrow();
      db.run(
        "INSERT INTO execution_fee_components VALUES ('version-1', 'workspace-1', 0, 'exchange', 'USD', -1)",
      );
      expect(queryColumn(db, "SELECT cost_minor FROM execution_fee_components")).toEqual([-1]);
      expect(() =>
        db.run("UPDATE execution_fee_components SET cost_minor = 1 WHERE execution_version_id = 'version-1'"),
      ).toThrow(/immutable/);
      expect(queryColumn(db, "PRAGMA quick_check")).toEqual(["ok"]);
      expect(db.exec("PRAGMA foreign_key_check")).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("replays safely when statements committed before user_version advanced", async () => {
    const db = await createMigratedDatabase();
    try {
      db.run("PRAGMA user_version = 0");
      db.run("BEGIN IMMEDIATE");
      for (const statement of V1_MIGRATION_STATEMENTS) db.run(statement);
      db.run("COMMIT");
      db.run("PRAGMA user_version = 1");

      expect(queryColumn(db, "SELECT count(*) FROM schema_migrations")).toEqual([1]);
      expect(queryColumn(db, "PRAGMA user_version")).toEqual([1]);
      expect(queryColumn(db, "PRAGMA quick_check")).toEqual(["ok"]);
      expect(db.exec("PRAGMA foreign_key_check")).toEqual([]);
    } finally {
      db.close();
    }
  });
});
