import initSqlJs, { type Database } from "sql.js";
import { describe, expect, it } from "vitest";

import {
  MOBILE_SCHEMA_MIGRATIONS,
  V1_MIGRATION_BODY,
  V1_MIGRATION_CHECKSUM_SHA256,
  V1_MIGRATION_NAME,
  V1_MIGRATION_STATEMENTS,
  V1_MIGRATION_VERSION,
  V2_MIGRATION_BODY,
  V2_MIGRATION_CHECKSUM_SHA256,
  V2_MIGRATION_NAME,
  V2_MIGRATION_STATEMENTS,
  V2_MIGRATION_VERSION,
  V3_MIGRATION_BODY,
  V3_MIGRATION_CHECKSUM_SHA256,
  V3_MIGRATION_NAME,
  V3_MIGRATION_STATEMENTS,
  V3_MIGRATION_VERSION,
  V4_MIGRATION_BODY,
  V4_MIGRATION_CHECKSUM_SHA256,
  V4_MIGRATION_NAME,
  V4_MIGRATION_STATEMENTS,
  V4_MIGRATION_VERSION,
  createCapacitorSchemaUpgrades,
  sha256Hex,
  v1MigrationChecksumInput,
  v2MigrationChecksumInput,
  v3MigrationChecksumInput,
  v4MigrationChecksumInput,
} from "./index";

const REQUIRED_TABLES = [
  "accounts",
  "currencies",
  "daily_journal_entry_heads",
  "daily_journal_entry_term_assignments",
  "daily_journal_entry_versions",
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
  "manual_execution_submissions",
  "metric_definitions",
  "playbook_rules",
  "playbooks",
  "projection_active_state",
  "projection_rebuild_runs",
  "review_terms",
  "schema_migrations",
  "trade_execution_allocations",
  "trade_lot_matches",
  "trade_money_totals",
  "trade_projections",
  "trade_review_heads",
  "trade_review_rule_results",
  "trade_review_term_assignments",
  "trade_review_versions",
  "trade_subjects",
  "workspaces",
] as const;

const REQUIRED_INDEXES = [
  "accounts_workspace_active_idx",
  "daily_journal_entry_heads_version_idx",
  "daily_journal_entry_term_assignments_term_idx",
  "daily_journal_entry_versions_date_idx",
  "daily_journal_entry_versions_submission_idx",
  "daily_journal_entry_versions_supersedes_idx",
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
  "manual_execution_submissions_unacknowledged_idx",
  "playbook_rules_playbook_idx",
  "playbooks_workspace_name_idx",
  "projection_rebuild_runs_workspace_status_idx",
  "review_terms_workspace_category_idx",
  "trade_execution_allocations_version_idx",
  "trade_lot_matches_entry_idx",
  "trade_lot_matches_exit_idx",
  "trade_money_totals_currency_idx",
  "trade_projections_status_time_idx",
  "trade_review_heads_review_version_idx",
  "trade_review_rule_results_rule_idx",
  "trade_review_term_assignments_term_idx",
  "trade_review_versions_subject_version_idx",
  "trade_review_versions_submission_idx",
  "trade_review_versions_supersedes_idx",
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
    for (const migration of MOBILE_SCHEMA_MIGRATIONS) {
      for (const statement of migration.statements) db.run(statement);
    }
    const current = MOBILE_SCHEMA_MIGRATIONS.at(-1);
    if (current === undefined) throw new Error("Test schema has no migrations.");
    db.run(`PRAGMA user_version = ${current.toVersion}`);
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    db.close();
    throw error;
  }
  return db;
}

async function createV1Database(): Promise<Database> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("PRAGMA foreign_keys = ON");
  db.run("BEGIN IMMEDIATE");
  try {
    for (const statement of V1_MIGRATION_STATEMENTS) db.run(statement);
    db.run("PRAGMA user_version = 1");
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    db.close();
    throw error;
  }
  return db;
}

async function createV2Database(): Promise<Database> {
  const db = await createV1Database();
  db.run("BEGIN IMMEDIATE");
  try {
    for (const statement of V2_MIGRATION_STATEMENTS) db.run(statement);
    db.run("PRAGMA user_version = 2");
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    db.close();
    throw error;
  }
  return db;
}

async function createV3Database(): Promise<Database> {
  const db = await createV2Database();
  db.run("BEGIN IMMEDIATE");
  try {
    for (const statement of V3_MIGRATION_STATEMENTS) db.run(statement);
    db.run("PRAGMA user_version = 3");
    db.run("COMMIT");
  } catch (error) {
    db.run("ROLLBACK");
    db.close();
    throw error;
  }
  return db;
}

function seedTradeSubject(db: Database): void {
  db.run("INSERT INTO currencies VALUES ('USD', 2, 'US Dollar')");
  db.run(
    "INSERT INTO workspaces VALUES ('workspace-1', 'Journal', 'USD', 'UTC', 1, 1, NULL)",
  );
  db.run(
    "INSERT INTO accounts (id, workspace_id, name, account_kind, base_currency_code, created_at_ms) VALUES ('account-1', 'workspace-1', 'Primary', 'brokerage', 'USD', 1)",
  );
  db.run(
    "INSERT INTO instruments (id, workspace_id, symbol, asset_class, quote_currency_code, multiplier_text, created_at_ms) VALUES ('instrument-1', 'workspace-1', 'AAPL', 'stock', 'USD', '1', 1)",
  );
  db.run(
    "INSERT INTO trade_subjects (id, workspace_id, account_id, instrument_id, stable_key_sha256, created_at_ms) VALUES ('trade-1', 'workspace-1', 'account-1', 'instrument-1', ?, 1)",
    ["9".repeat(64)],
  );
}

interface ReviewVersionFixture {
  readonly id: string;
  readonly versionNumber: number;
  readonly supersedesVersionId: string | null;
  readonly submissionId: string;
  readonly state?: "draft" | "completed";
  readonly noteText?: string;
  readonly playbookId?: string | null;
  readonly initialRiskAmountText?: string | null;
  readonly riskCurrencyCode?: string | null;
  readonly plannedStopPriceText?: string | null;
  readonly recordedAtMs: number;
  readonly completedAtMs?: number | null;
}

function insertReviewVersion(db: Database, fixture: ReviewVersionFixture): void {
  const state = fixture.state ?? "completed";
  db.run(
    `INSERT INTO trade_review_versions (
      id, workspace_id, trade_subject_id, version_number, supersedes_version_id,
      submission_id, revision_sha256, state, note_text, playbook_id,
      initial_risk_amount_text, risk_currency_code, planned_stop_price_text,
      result_r_metric_id, result_r_metric_version,
      percent_return_metric_id, percent_return_metric_version,
      recorded_at_ms, completed_at_ms
    ) VALUES (?, 'workspace-1', 'trade-1', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      'result-r', 1, 'percent-return', 1, ?, ?)`,
    [
      fixture.id,
      fixture.versionNumber,
      fixture.supersedesVersionId,
      fixture.submissionId,
      fixture.submissionId.replace(/.$/, fixture.versionNumber.toString(16)),
      state,
      fixture.noteText ?? "Reviewed without changing execution facts.",
      fixture.playbookId ?? null,
      fixture.initialRiskAmountText ?? null,
      fixture.riskCurrencyCode ?? null,
      fixture.plannedStopPriceText ?? null,
      fixture.recordedAtMs,
      fixture.completedAtMs ?? (state === "completed" ? fixture.recordedAtMs : null),
    ],
  );
}

describe("mobile SQLite migration contract", () => {
  it("uses stable ordered migration inputs and fresh Capacitor-compatible arrays", () => {
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

    expect(MOBILE_SCHEMA_MIGRATIONS.map(({ toVersion }) => toVersion)).toEqual([1, 2, 3, 4]);
    expect(MOBILE_SCHEMA_MIGRATIONS[0]).toMatchObject({
      toVersion: V1_MIGRATION_VERSION,
      name: V1_MIGRATION_NAME,
      checksumSha256: V1_MIGRATION_CHECKSUM_SHA256,
      checksumInput: v1MigrationChecksumInput(),
    });
    expect(V1_MIGRATION_CHECKSUM_SHA256).toBe(
        "37905c631232529779ebaa6178ddd7b4c102f8f93b099898712bbe539ea92326",
    );
    expect(MOBILE_SCHEMA_MIGRATIONS[1]).toMatchObject({
      toVersion: V2_MIGRATION_VERSION,
      name: V2_MIGRATION_NAME,
      checksumSha256: V2_MIGRATION_CHECKSUM_SHA256,
      checksumInput: v2MigrationChecksumInput(),
    });
    expect(V2_MIGRATION_CHECKSUM_SHA256).toBe(
      "0ca43faada6b2d1087c4a699232061a78ffdae395131edb3980663e50497cbd9",
    );
    expect(MOBILE_SCHEMA_MIGRATIONS[2]).toMatchObject({
      toVersion: V3_MIGRATION_VERSION,
      name: V3_MIGRATION_NAME,
      checksumSha256: V3_MIGRATION_CHECKSUM_SHA256,
      checksumInput: v3MigrationChecksumInput(),
    });
    expect(V3_MIGRATION_CHECKSUM_SHA256).toBe(
      "f3f59b4ac9adb365f6f43e12d4f97d7e9004d040584f52f3b742d08ab65782a9",
    );
    expect(MOBILE_SCHEMA_MIGRATIONS[3]).toMatchObject({
      toVersion: V4_MIGRATION_VERSION,
      name: V4_MIGRATION_NAME,
      checksumSha256: V4_MIGRATION_CHECKSUM_SHA256,
      checksumInput: v4MigrationChecksumInput(),
    });
    expect(V4_MIGRATION_CHECKSUM_SHA256).toBe(
      "d48bffb0ce4420de7dbb881811f6479e0798e702a295dba902cb9eb525468938",
    );

    const firstCopy = createCapacitorSchemaUpgrades();
    const secondCopy = createCapacitorSchemaUpgrades();
    expect(firstCopy).toEqual([
      { toVersion: 1, statements: [...V1_MIGRATION_STATEMENTS] },
      { toVersion: 2, statements: [...V2_MIGRATION_STATEMENTS] },
      { toVersion: 3, statements: [...V3_MIGRATION_STATEMENTS] },
      { toVersion: 4, statements: [...V4_MIGRATION_STATEMENTS] },
    ]);
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
    const migrationSql = MOBILE_SCHEMA_MIGRATIONS
      .flatMap(({ statements }) => statements)
      .join("\n");

    for (const { statements } of MOBILE_SCHEMA_MIGRATIONS) {
      for (const statement of statements) {
        expect(statement.trim().length).toBeGreaterThan(0);
        if (/^CREATE TRIGGER\b/i.test(statement.trim())) {
          expect(statement).toMatch(/^CREATE TRIGGER IF NOT EXISTS[\s\S]+BEGIN SELECT RAISE\([\s\S]+\); END$/i);
        } else {
          expect(statement).not.toContain(";");
        }
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
    const bodySql = [
      ...V1_MIGRATION_BODY,
      ...V2_MIGRATION_BODY,
      ...V3_MIGRATION_BODY,
      ...V4_MIGRATION_BODY,
    ].join("\n");

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
      "metric_definitions",
      "review_terms",
      "playbooks",
      "playbook_rules",
      "trade_review_versions",
      "trade_review_term_assignments",
      "trade_review_rule_results",
      "daily_journal_entry_versions",
      "daily_journal_entry_term_assignments",
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
    expect(bodySql).toMatch(/metric_id TEXT NOT NULL CHECK\(metric_id IN \('result-r', 'percent-return'\)\)/);
    expect(bodySql).toMatch(/fraction_digits INTEGER NOT NULL CHECK\(fraction_digits BETWEEN 0 AND 18\)/);
    expect(bodySql).toMatch(/rounding_mode TEXT NOT NULL CHECK\(rounding_mode = 'half_away_from_zero'\)/);
    expect(bodySql).toMatch(/initial_risk_amount_text TEXT CHECK/);
    expect(bodySql).toMatch(/planned_stop_price_text TEXT CHECK/);
    expect(bodySql).toContain("CREATE TRIGGER IF NOT EXISTS trade_review_heads_require_forward_update");
  });

  it("executes the complete migration chain with foreign keys and integrity checks enabled", async () => {
    const db = await createMigratedDatabase();
    try {
      expect(queryColumn(db, "PRAGMA foreign_keys")).toEqual([1]);
      expect(queryColumn(db, "PRAGMA user_version")).toEqual([4]);
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

      expect(queryColumn(db, "SELECT version FROM schema_migrations ORDER BY version")).toEqual([1, 2, 3, 4]);
      expect(queryColumn(
        db,
        "SELECT checksum_sha256 FROM schema_migrations ORDER BY version",
      )).toEqual([
        V1_MIGRATION_CHECKSUM_SHA256,
        V2_MIGRATION_CHECKSUM_SHA256,
        V3_MIGRATION_CHECKSUM_SHA256,
        V4_MIGRATION_CHECKSUM_SHA256,
      ]);

      expect(db.exec(
        "SELECT metric_id, version, fraction_digits, rounding_mode FROM metric_definitions ORDER BY metric_id",
      )[0]?.values).toEqual([
        ["percent-return", 1, 12, "half_away_from_zero"],
        ["result-r", 1, 12, "half_away_from_zero"],
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

  it("upgrades an existing v1 ledger to v2 without replacing existing state", async () => {
    const db = await createV1Database();
    try {
      db.run("INSERT INTO currencies VALUES ('USD', 2, 'US Dollar')");
      db.run(
        "INSERT INTO workspaces VALUES ('workspace-1', 'Journal', 'USD', 'UTC', 1, 1, NULL)",
      );
      db.run("BEGIN IMMEDIATE");
      for (const statement of V2_MIGRATION_STATEMENTS) db.run(statement);
      db.run("PRAGMA user_version = 2");
      db.run("COMMIT");

      expect(queryColumn(db, "PRAGMA user_version")).toEqual([2]);
      expect(queryColumn(db, "SELECT name FROM workspaces")).toEqual(["Journal"]);
      expect(queryColumn(
        db,
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'manual_execution_submissions'",
      )).toEqual(["manual_execution_submissions"]);
      expect(queryColumn(db, "PRAGMA foreign_key_check")).toEqual([]);
      expect(queryColumn(db, "PRAGMA quick_check")).toEqual(["ok"]);
    } finally {
      db.close();
    }
  });

  it("replays v2 safely when its statements committed before user_version advanced", async () => {
    const db = await createV1Database();
    try {
      const hash = "a".repeat(64);
      db.run("INSERT INTO currencies VALUES ('USD', 2, 'US Dollar')");
      db.run(
        "INSERT INTO workspaces VALUES ('workspace-1', 'Journal', 'USD', 'UTC', 1, 1, NULL)",
      );
      db.run(
        "INSERT INTO accounts (id, workspace_id, name, account_kind, base_currency_code, created_at_ms) VALUES ('account-1', 'workspace-1', 'Primary', 'brokerage', 'USD', 1)",
      );
      db.run(
        "INSERT INTO instruments (id, workspace_id, symbol, asset_class, quote_currency_code, multiplier_text, created_at_ms) VALUES ('instrument-1', 'workspace-1', 'AAPL', 'stock', 'USD', '1', 1)",
      );
      db.run(
        "INSERT INTO executions (id, workspace_id, account_id, instrument_id, ledger_sequence, identity_sha256, created_at_ms) VALUES ('execution-1', 'workspace-1', 'account-1', 'instrument-1', 1, ?, 1)",
        [hash],
      );
      db.run(
        "INSERT INTO execution_versions (id, execution_id, workspace_id, version_number, side, position_effect, quantity_text, price_text, quote_currency_code, executed_at_us, is_void, version_sha256, recorded_at_ms) VALUES ('version-1', 'execution-1', 'workspace-1', 1, 'buy', 'open', '1', '100', 'USD', 1, 0, ?, 1)",
        ["b".repeat(64)],
      );
      db.run(
        "INSERT INTO execution_heads VALUES ('execution-1', 'workspace-1', 'version-1', 1)",
      );
      db.run(
        "INSERT INTO execution_sources (id, execution_version_id, workspace_id, source_kind, stable_source_key, source_payload_sha256, recorded_at_ms) VALUES ('source-1', 'version-1', 'workspace-1', 'manual', 'manual:v1:existing', ?, 1)",
        ["c".repeat(64)],
      );

      db.run("BEGIN IMMEDIATE");
      for (const statement of V2_MIGRATION_STATEMENTS) db.run(statement);
      db.run("COMMIT");
      expect(queryColumn(db, "PRAGMA user_version")).toEqual([1]);
      expect(queryColumn(
        db,
        "SELECT count(*) FROM schema_migrations WHERE version = 2",
      )).toEqual([1]);

      db.run("BEGIN IMMEDIATE");
      for (const statement of V2_MIGRATION_STATEMENTS) db.run(statement);
      db.run("PRAGMA user_version = 2");
      db.run("COMMIT");

      expect(queryColumn(db, "PRAGMA user_version")).toEqual([2]);
      expect(queryColumn(db, "SELECT count(*) FROM executions")).toEqual([1]);
      expect(queryColumn(
        db,
        "SELECT count(*) FROM schema_migrations WHERE version = 2",
      )).toEqual([1]);
      expect(queryColumn(db, "PRAGMA foreign_key_check")).toEqual([]);
      expect(queryColumn(db, "PRAGMA quick_check")).toEqual(["ok"]);
    } finally {
      db.close();
    }
  });

  it("upgrades an existing v2 ledger to v3 without replacing its stable trade state", async () => {
    const db = await createV2Database();
    try {
      seedTradeSubject(db);

      db.run("BEGIN IMMEDIATE");
      for (const statement of V3_MIGRATION_STATEMENTS) db.run(statement);
      db.run("PRAGMA user_version = 3");
      db.run("COMMIT");

      expect(queryColumn(db, "PRAGMA user_version")).toEqual([3]);
      expect(queryColumn(db, "SELECT id FROM trade_subjects")).toEqual(["trade-1"]);
      expect(queryColumn(
        db,
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name = 'trade_review_versions'",
      )).toEqual(["trade_review_versions"]);
      expect(queryColumn(db, "SELECT metric_id FROM metric_definitions ORDER BY metric_id")).toEqual([
        "percent-return",
        "result-r",
      ]);
      expect(queryColumn(db, "SELECT version FROM schema_migrations ORDER BY version")).toEqual([
        1,
        2,
        3,
      ]);
      expect(db.exec("PRAGMA foreign_key_check")).toEqual([]);
      expect(queryColumn(db, "PRAGMA quick_check")).toEqual(["ok"]);
    } finally {
      db.close();
    }
  });

  it("replays v3 safely after statements commit before user_version advances", async () => {
    const db = await createV2Database();
    try {
      seedTradeSubject(db);

      db.run("BEGIN IMMEDIATE");
      for (const statement of V3_MIGRATION_STATEMENTS) db.run(statement);
      db.run("COMMIT");

      expect(queryColumn(db, "PRAGMA user_version")).toEqual([2]);
      expect(queryColumn(
        db,
        "SELECT count(*) FROM schema_migrations WHERE version = 3",
      )).toEqual([1]);

      db.run(
        "INSERT INTO review_terms VALUES ('term-setup', 'workspace-1', 'setup', 'Opening range', 'opening range', 2)",
      );
      db.run(
        "INSERT INTO playbooks VALUES ('playbook-1', 'workspace-1', 'Breakout', 'breakout', 2)",
      );
      db.run(
        "INSERT INTO playbook_rules VALUES ('rule-1', 'workspace-1', 'playbook-1', 'Wait for confirmation', 'wait for confirmation', 2)",
      );
      insertReviewVersion(db, {
        id: "review-1",
        versionNumber: 1,
        supersedesVersionId: null,
        submissionId: "a".repeat(64),
        playbookId: "playbook-1",
        initialRiskAmountText: "125.5",
        riskCurrencyCode: "USD",
        plannedStopPriceText: "176.25",
        recordedAtMs: 3,
        completedAtMs: 4,
      });
      db.run(
        "INSERT INTO trade_review_term_assignments VALUES ('review-1', 'workspace-1', 'trade-1', 'term-setup', 'setup', 0)",
      );
      db.run(
        "INSERT INTO trade_review_rule_results VALUES ('review-1', 'workspace-1', 'trade-1', 'rule-1', 'followed', 'Wait for confirmation', 0)",
      );
      db.run(
        "INSERT INTO trade_review_heads VALUES ('workspace-1', 'trade-1', 'review-1', 4)",
      );

      db.run("BEGIN IMMEDIATE");
      for (const statement of V3_MIGRATION_STATEMENTS) db.run(statement);
      db.run("PRAGMA user_version = 3");
      db.run("COMMIT");

      expect(queryColumn(db, "PRAGMA user_version")).toEqual([3]);
      expect(queryColumn(db, "SELECT count(*) FROM metric_definitions")).toEqual([2]);
      expect(queryColumn(db, "SELECT count(*) FROM trade_review_versions")).toEqual([1]);
      expect(queryColumn(db, "SELECT review_version_id FROM trade_review_heads")).toEqual([
        "review-1",
      ]);
      expect(queryColumn(
        db,
        "SELECT count(*) FROM schema_migrations WHERE version = 3",
      )).toEqual([1]);
      expect(db.exec("PRAGMA foreign_key_check")).toEqual([]);
      expect(queryColumn(db, "PRAGMA quick_check")).toEqual(["ok"]);
    } finally {
      db.close();
    }
  });

  it("upgrades and replays v4 without replacing existing v3 state", async () => {
    const db = await createV3Database();
    try {
      seedTradeSubject(db);
      db.run("BEGIN IMMEDIATE");
      for (const statement of V4_MIGRATION_STATEMENTS) db.run(statement);
      db.run("COMMIT");

      expect(queryColumn(db, "PRAGMA user_version")).toEqual([3]);
      expect(queryColumn(
        db,
        "SELECT count(*) FROM schema_migrations WHERE version = 4",
      )).toEqual([1]);
      db.run(
        "INSERT INTO review_terms VALUES ('term-calm', 'workspace-1', 'emotion', 'Calm', 'calm', 2)",
      );
      db.run(
        `INSERT INTO daily_journal_entry_versions (
          id, workspace_id, journal_date, version_number, supersedes_version_id,
          submission_id, revision_sha256, state, title_text, note_text,
          process_score_pct, recorded_at_ms, completed_at_ms
        ) VALUES ('daily-1', 'workspace-1', '2026-07-13', 1, NULL, ?, ?,
          'completed', 'Protected the process', 'Stayed patient.', 88, 3, 3)`,
        ["d".repeat(64), "e".repeat(64)],
      );
      db.run(
        "INSERT INTO daily_journal_entry_term_assignments VALUES ('daily-1', 'workspace-1', '2026-07-13', 'term-calm', 'emotion', 0)",
      );
      db.run(
        "INSERT INTO daily_journal_entry_heads VALUES ('workspace-1', '2026-07-13', 'daily-1', 3)",
      );

      db.run("BEGIN IMMEDIATE");
      for (const statement of V4_MIGRATION_STATEMENTS) db.run(statement);
      db.run("PRAGMA user_version = 4");
      db.run("COMMIT");

      expect(queryColumn(db, "PRAGMA user_version")).toEqual([4]);
      expect(queryColumn(db, "SELECT id FROM trade_subjects")).toEqual(["trade-1"]);
      expect(queryColumn(db, "SELECT id FROM daily_journal_entry_versions")).toEqual(["daily-1"]);
      expect(queryColumn(db, "SELECT entry_version_id FROM daily_journal_entry_heads"))
        .toEqual(["daily-1"]);
      expect(queryColumn(db, "SELECT version FROM schema_migrations ORDER BY version"))
        .toEqual([1, 2, 3, 4]);
      expect(db.exec("PRAGMA foreign_key_check")).toEqual([]);
      expect(queryColumn(db, "PRAGMA quick_check")).toEqual(["ok"]);
    } finally {
      db.close();
    }
  });

  it("enforces canonical daily dates, immutable versions, and one-link heads", async () => {
    const db = await createMigratedDatabase();
    try {
      seedTradeSubject(db);
      const insert = (
        id: string,
        date: string,
        version: number,
        predecessor: string | null,
        digit: string,
        recordedAtMs: number,
      ) => db.run(
        `INSERT INTO daily_journal_entry_versions (
          id, workspace_id, journal_date, version_number, supersedes_version_id,
          submission_id, revision_sha256, state, title_text, note_text,
          process_score_pct, recorded_at_ms, completed_at_ms
        ) VALUES (?, 'workspace-1', ?, ?, ?, ?, ?, 'completed',
          'Reflection', 'Stayed patient.', 100, ?, ?)`,
        [id, date, version, predecessor, digit.repeat(64), (digit === "f" ? "0" : digit).repeat(64), recordedAtMs, recordedAtMs],
      );

      expect(() => insert("bad-date", "2026-02-30", 1, null, "a", 1)).toThrow();
      expect(() => db.run(
        `INSERT INTO daily_journal_entry_versions (
          id, workspace_id, journal_date, version_number, supersedes_version_id,
          submission_id, revision_sha256, state, title_text, note_text,
          process_score_pct, recorded_at_ms, completed_at_ms
        ) VALUES ('bad-score', 'workspace-1', '2026-07-13', 1, NULL, ?, ?,
          'completed', NULL, '', 101, 1, 1)`,
        ["a".repeat(64), "b".repeat(64)],
      )).toThrow();

      insert("daily-1", "2026-07-13", 1, null, "b", 2);
      db.run(
        "INSERT INTO daily_journal_entry_heads VALUES ('workspace-1', '2026-07-13', 'daily-1', 2)",
      );
      expect(() => db.run(
        "UPDATE daily_journal_entry_versions SET note_text = 'changed' WHERE id = 'daily-1'",
      )).toThrow(/immutable/i);
      expect(() => insert("daily-3", "2026-07-13", 3, "daily-1", "c", 3))
        .toThrow(/current head|extend/i);

      insert("daily-2", "2026-07-13", 2, "daily-1", "d", 3);
      db.run(
        "UPDATE daily_journal_entry_heads SET entry_version_id = 'daily-2', changed_at_ms = 3 WHERE workspace_id = 'workspace-1' AND journal_date = '2026-07-13'",
      );
      expect(queryColumn(db, "SELECT entry_version_id FROM daily_journal_entry_heads"))
        .toEqual(["daily-2"]);
      expect(() => db.run(
        "UPDATE daily_journal_entry_heads SET entry_version_id = 'daily-1' WHERE workspace_id = 'workspace-1' AND journal_date = '2026-07-13'",
      )).toThrow(/advance one/i);
      expect(db.exec("PRAGMA foreign_key_check")).toEqual([]);
    } finally {
      db.close();
    }
  });

  it("enforces immutable annotations, exact risk facts, and one-link review heads", async () => {
    const db = await createMigratedDatabase();
    try {
      seedTradeSubject(db);
      db.run(
        "INSERT INTO review_terms VALUES ('term-setup', 'workspace-1', 'setup', 'Opening range', 'opening range', 2)",
      );
      db.run(
        "INSERT INTO review_terms VALUES ('term-mistake', 'workspace-1', 'mistake', 'Chased entry', 'chased entry', 2)",
      );
      db.run(
        "INSERT INTO playbooks VALUES ('playbook-1', 'workspace-1', 'Breakout', 'breakout', 2)",
      );
      db.run(
        "INSERT INTO playbooks VALUES ('playbook-2', 'workspace-1', 'Reversal', 'reversal', 2)",
      );
      db.run(
        "INSERT INTO playbook_rules VALUES ('rule-1', 'workspace-1', 'playbook-1', 'Wait for confirmation', 'wait for confirmation', 2)",
      );
      db.run(
        "INSERT INTO playbook_rules VALUES ('rule-2', 'workspace-1', 'playbook-2', 'Fade exhaustion', 'fade exhaustion', 2)",
      );

      expect(() => insertReviewVersion(db, {
        id: "bad-risk",
        versionNumber: 1,
        supersedesVersionId: null,
        submissionId: "b".repeat(64),
        initialRiskAmountText: "100",
        recordedAtMs: 3,
      })).toThrow();
      expect(() => insertReviewVersion(db, {
        id: "bad-stop",
        versionNumber: 1,
        supersedesVersionId: null,
        submissionId: "c".repeat(64),
        plannedStopPriceText: "176.25",
        recordedAtMs: 3,
      })).toThrow();
      expect(() => insertReviewVersion(db, {
        id: "bad-decimal",
        versionNumber: 1,
        supersedesVersionId: null,
        submissionId: "d".repeat(64),
        initialRiskAmountText: "100.0",
        riskCurrencyCode: "USD",
        recordedAtMs: 3,
      })).toThrow();

      insertReviewVersion(db, {
        id: "review-1",
        versionNumber: 1,
        supersedesVersionId: null,
        submissionId: "e".repeat(64),
        playbookId: "playbook-1",
        initialRiskAmountText: "125.5",
        riskCurrencyCode: "USD",
        plannedStopPriceText: "176.25",
        recordedAtMs: 3,
        completedAtMs: 4,
      });

      expect(() => db.run(
        "INSERT INTO trade_review_term_assignments VALUES ('review-1', 'workspace-1', 'trade-1', 'term-setup', 'mistake', 0)",
      )).toThrow(/category/);
      db.run(
        "INSERT INTO trade_review_term_assignments VALUES ('review-1', 'workspace-1', 'trade-1', 'term-setup', 'setup', 0)",
      );
      db.run(
        "INSERT INTO trade_review_term_assignments VALUES ('review-1', 'workspace-1', 'trade-1', 'term-mistake', 'mistake', 0)",
      );

      expect(() => db.run(
        "INSERT INTO trade_review_rule_results VALUES ('review-1', 'workspace-1', 'trade-1', 'rule-2', 'broken', 'Fade exhaustion', 0)",
      )).toThrow(/playbook/);
      expect(() => db.run(
        "INSERT INTO trade_review_rule_results VALUES ('review-1', 'workspace-1', 'trade-1', 'rule-1', 'followed', 'Changed wording', 0)",
      )).toThrow(/snapshot/);
      db.run(
        "INSERT INTO trade_review_rule_results VALUES ('review-1', 'workspace-1', 'trade-1', 'rule-1', 'followed', 'Wait for confirmation', 0)",
      );

      for (const statement of [
        "UPDATE metric_definitions SET fraction_digits = 6 WHERE metric_id = 'result-r'",
        "UPDATE review_terms SET name = 'Changed' WHERE id = 'term-setup'",
        "UPDATE playbooks SET name = 'Changed' WHERE id = 'playbook-1'",
        "UPDATE playbook_rules SET rule_text = 'Changed' WHERE id = 'rule-1'",
        "UPDATE trade_review_versions SET note_text = 'Changed' WHERE id = 'review-1'",
        "UPDATE trade_review_term_assignments SET ordinal = 1 WHERE review_version_id = 'review-1' AND category = 'setup'",
        "UPDATE trade_review_rule_results SET outcome = 'broken' WHERE review_version_id = 'review-1'",
      ]) {
        expect(() => db.run(statement)).toThrow(/immutable/);
      }

      db.run("INSERT INTO trade_review_heads VALUES ('workspace-1', 'trade-1', 'review-1', 4)");
      db.run(
        "UPDATE trade_review_heads SET review_version_id = 'review-1', changed_at_ms = 4 WHERE workspace_id = 'workspace-1' AND trade_subject_id = 'trade-1'",
      );
      expect(() => db.run(
        "UPDATE trade_review_heads SET changed_at_ms = 5 WHERE workspace_id = 'workspace-1' AND trade_subject_id = 'trade-1'",
      )).toThrow(/advance/);
      expect(() => insertReviewVersion(db, {
        id: "review-skipped",
        versionNumber: 3,
        supersedesVersionId: "review-1",
        submissionId: "f".repeat(64),
        recordedAtMs: 5,
      })).toThrow(/extend/);

      insertReviewVersion(db, {
        id: "review-2",
        versionNumber: 2,
        supersedesVersionId: "review-1",
        submissionId: "1".repeat(64),
        state: "draft",
        noteText: "A later draft without a risk basis.",
        recordedAtMs: 5,
      });
      db.run(
        "UPDATE trade_review_heads SET review_version_id = 'review-2', changed_at_ms = 5 WHERE workspace_id = 'workspace-1' AND trade_subject_id = 'trade-1'",
      );
      expect(() => db.run(
        "UPDATE trade_review_heads SET review_version_id = 'review-1', changed_at_ms = 6 WHERE workspace_id = 'workspace-1' AND trade_subject_id = 'trade-1'",
      )).toThrow(/advance/);
      expect(() => db.run(
        "DELETE FROM trade_review_heads WHERE workspace_id = 'workspace-1' AND trade_subject_id = 'trade-1'",
      )).toThrow(/cannot be deleted/);

      expect(queryColumn(db, "SELECT review_version_id FROM trade_review_heads")).toEqual([
        "review-2",
      ]);
      expect(db.exec("PRAGMA foreign_key_check")).toEqual([]);
      expect(queryColumn(db, "PRAGMA quick_check")).toEqual(["ok"]);
    } finally {
      db.close();
    }
  });

  it("replays safely when statements committed before user_version advanced", async () => {
    const db = await createV1Database();
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
