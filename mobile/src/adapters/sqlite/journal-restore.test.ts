import initSqlJs, { type Database } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";

import {
  canonicalJournalArchiveJson,
  createJournalExportArtifact,
  type JournalArchiveJson,
} from "../../application/journal-archive";
import { prepareDailyJournalEntry } from "../../application/prepare-daily-journal";
import type {
  SqlDatabase,
  SqlParameters,
  SqlRow,
  SqlRunResult,
} from "../../application/sql-database";
import {
  portableStateDigestInput,
  readSqliteJournalArchive,
  SQLITE_JOURNAL_ARCHIVE_TABLES,
  type SqliteArchiveTable,
} from "./journal-archive";
import {
  decodeSqliteJournalRestoreArchive,
  sqliteRestoreArchiveTable,
} from "./journal-restore";
import { MOBILE_SCHEMA_MIGRATIONS, sha256Hex } from "./schema";

class SqlJsRestorePayloadDatabase implements SqlDatabase {
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
    if (this.inTransaction) throw new Error("Nested restore-payload test transaction.");
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

interface MutableColumn extends Record<string, unknown> {
  name: unknown;
  declaredType: unknown;
  notNull: unknown;
  primaryKeyPosition: unknown;
  defaultSql: unknown;
  hidden: unknown;
}

interface MutableTable extends Record<string, unknown> {
  name: unknown;
  createSqlSha256: unknown;
  columns: MutableColumn[];
  rows: unknown[][];
  rowCount: unknown;
  tableSha256: unknown;
}

interface MutableArchive extends Record<string, unknown> {
  source: {
    schemaUserVersion: number;
    migrations: {
      version: number;
      name: string;
      checksumSha256: string;
    }[];
  };
  payload: {
    kind: string;
    version: number;
    data: {
      tableFormatVersion: number;
      tables: MutableTable[];
      [key: string]: unknown;
    };
  };
  summary: Record<string, unknown>;
  stateSha256: string;
  reportSha256: string;
  archiveSha256: string;
}

function mutableArchive(contents: string): MutableArchive {
  return JSON.parse(contents) as MutableArchive;
}

function json(value: unknown): JournalArchiveJson {
  return value as JournalArchiveJson;
}

function recomputeTable(table: MutableTable): void {
  const withoutDigest = { ...table };
  delete withoutDigest.tableSha256;
  table.tableSha256 = sha256Hex(canonicalJournalArchiveJson(json(withoutDigest)));
}

function recomputeState(archive: MutableArchive): void {
  archive.stateSha256 = sha256Hex(canonicalJournalArchiveJson(
    portableStateDigestInput(
      archive.payload.data.tables as unknown as readonly SqliteArchiveTable[],
    ),
  ));
}

function resign(archive: MutableArchive): string {
  const unsigned = { ...archive };
  Reflect.deleteProperty(unsigned, "archiveSha256");
  archive.archiveSha256 = sha256Hex(canonicalJournalArchiveJson(json(unsigned)));
  return canonicalJournalArchiveJson(json(archive)) + "\n";
}

function table(archive: MutableArchive, name: string): MutableTable {
  const found = archive.payload.data.tables.find((candidate) => candidate.name === name);
  if (found === undefined) throw new Error("Test archive lost table " + name + ".");
  return found;
}

function columnPosition(value: MutableTable, name: string): number {
  const index = value.columns.findIndex((column) => column.name === name);
  if (index < 0) throw new Error("Test archive lost column " + name + ".");
  return index;
}

function sortAndRecomputeTable(value: MutableTable): void {
  value.rows.sort((left, right) => {
    const leftJson = canonicalJournalArchiveJson(json(left));
    const rightJson = canonicalJournalArchiveJson(json(right));
    return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
  });
  value.rowCount = String(value.rows.length);
  recomputeTable(value);
}

function recomputeChangedTables(
  archive: MutableArchive,
  ...names: readonly string[]
): void {
  for (const name of names) sortAndRecomputeTable(table(archive, name));
  recomputeState(archive);
}

function rowFor(
  value: MutableTable,
  fields: Readonly<Record<string, string | null>>,
): unknown[] {
  return value.columns.map((column, index) => {
    const name = String(column.name);
    if (Object.hasOwn(fields, name)) return fields[name] ?? null;
    if (column.declaredType === "INTEGER") return "0";
    return column.notNull === true ? name + "-" + String(index) : null;
  });
}

function setRowCell(
  value: MutableTable,
  row: unknown[],
  name: string,
  cellValue: string | null,
): void {
  row[columnPosition(value, name)] = cellValue;
}


let baselineContents = "";
let populatedContents = "";
let dailyContents = "";

beforeAll(async () => {
  const SQL = await initSqlJs();
  const database = new SqlJsRestorePayloadDatabase(new SQL.Database());
  try {
    await database.execute("PRAGMA foreign_keys = ON");
    await database.transaction(async () => {
      for (const migration of MOBILE_SCHEMA_MIGRATIONS) {
        for (const statement of migration.statements) await database.execute(statement);
      }
      const current = MOBILE_SCHEMA_MIGRATIONS.at(-1);
      if (current === undefined) throw new Error("Missing test migration.");
      await database.execute("PRAGMA user_version = " + current.toVersion);
    });
    const durable = await database.transaction(() => readSqliteJournalArchive(database));
    baselineContents = createJournalExportArtifact({
      kind: "hermes-journal-export",
      formatVersion: 1,
      exportedAtUs: "1783960200000000",
      source: durable.source,
      payload: durable.payload,
      attachments: { version: 1, entries: [] },
      summary: {
        workspaceName: null,
        currency: null,
        timeZone: null,
        accounts: "0",
        activeExecutions: "0",
        executionVersions: "0",
        importReceipts: "0",
        rolledBackImports: "0",
        currentReviews: "0",
        reviewVersions: "0",
        reviewTerms: "0",
        playbooks: "0",
        attachments: "0",
        attachmentBytes: "0",
      },
      stateSha256: durable.stateSha256,
      reportSha256: "a".repeat(64),
    }).contents;
    await database.transaction(async () => {
      await database.run("INSERT INTO currencies VALUES (?, ?, ?)", ["USD", 2, "US Dollar"]);
      await database.run(
        `INSERT INTO workspaces (
          id, name, default_currency_code, time_zone_id,
          created_at_ms, updated_at_ms, archived_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, NULL)`,
        ["workspace:primary", "Restored Journal", "USD", "America/New_York", 1, 1],
      );
      await database.run(
        `INSERT INTO accounts (
          id, workspace_id, name, account_kind, base_currency_code,
          broker_name, external_account_key, created_at_ms, archived_at_ms
        ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, NULL)`,
        ["account-one", "workspace:primary", "Main account", "brokerage", "USD", 1],
      );
      await database.run(
        `INSERT INTO instruments (
          id, workspace_id, symbol, asset_class, quote_currency_code,
          multiplier_text, expires_on, strike_price_text, option_right, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, NULL, ?)`,
        ["instrument-one", "workspace:primary", "AAPL", "stock", "USD", "1", 1],
      );
      await database.run(
        `INSERT INTO executions (
          id, workspace_id, account_id, instrument_id, ledger_sequence,
          identity_sha256, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ["execution-one", "workspace:primary", "account-one", "instrument-one", 1, "b".repeat(64), 1],
      );
      await database.run(
        `INSERT INTO execution_versions (
          id, execution_id, workspace_id, version_number, side, position_effect,
          quantity_text, price_text, quote_currency_code, executed_at_us,
          external_order_id, external_execution_id, is_void, edit_reason,
          version_sha256, recorded_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL, 0, NULL, ?, ?)`,
        [
          "version-one", "execution-one", "workspace:primary", 1, "buy", "auto",
          "1", "100", "USD", 1_000, "c".repeat(64), 1,
        ],
      );
      await database.run(
        `INSERT INTO execution_fee_components (
          execution_version_id, workspace_id, component_ordinal,
          category, currency_code, cost_minor
        ) VALUES (?, ?, ?, ?, ?, CAST(? AS INTEGER))`,
        ["version-one", "workspace:primary", 0, "other", "USD", "-9223372036854775808"],
      );
      await database.run(
        "INSERT INTO execution_heads VALUES (?, ?, ?, ?)",
        ["execution-one", "workspace:primary", "version-one", 1],
      );
    });
    const populated = await database.transaction(() => readSqliteJournalArchive(database));
    populatedContents = createJournalExportArtifact({
      kind: "hermes-journal-export",
      formatVersion: 1,
      exportedAtUs: "1783960200001000",
      source: populated.source,
      payload: populated.payload,
      attachments: { version: 1, entries: [] },
      summary: {
        workspaceName: "Restored Journal", currency: "USD", timeZone: "America/New_York",
        accounts: "1", activeExecutions: "1", executionVersions: "1",
        importReceipts: "0", rolledBackImports: "0", currentReviews: "0",
        reviewVersions: "0", reviewTerms: "0", playbooks: "0",
        attachments: "0", attachmentBytes: "0",
      },
      stateSha256: populated.stateSha256,
      reportSha256: "d".repeat(64),
    }).contents;
    const daily = prepareDailyJournalEntry({
      submissionId: "e".repeat(64),
      isoDate: "2026-07-13",
      expectedPreviousEntryId: null,
      state: "completed",
      title: null,
      note: "Protected the process.",
      emotion: "Calm",
      processScorePct: null,
      tags: [],
    });
    await database.transaction(async () => {
      await database.run(
        "INSERT INTO review_terms VALUES (?, ?, 'emotion', 'Calm', 'calm', ?)",
        ["term-calm", "workspace:primary", 2],
      );
      await database.run(
        `INSERT INTO daily_journal_entry_versions (
          id, workspace_id, journal_date, version_number, supersedes_version_id,
          submission_id, revision_sha256, state, title_text, note_text,
          process_score_pct, recorded_at_ms, completed_at_ms
        ) VALUES (?, ?, ?, 1, NULL, ?, ?, 'completed', NULL, ?, NULL, 2, 2)`,
        [
          "daily-one",
          "workspace:primary",
          daily.isoDate,
          daily.submissionId,
          daily.revision,
          daily.note,
        ],
      );
      await database.run(
        "INSERT INTO daily_journal_entry_term_assignments VALUES (?, ?, ?, ?, 'emotion', 0)",
        ["daily-one", "workspace:primary", daily.isoDate, "term-calm"],
      );
      await database.run(
        "INSERT INTO daily_journal_entry_heads VALUES (?, ?, ?, ?)",
        ["workspace:primary", daily.isoDate, "daily-one", 2],
      );
    });
    const withDaily = await database.transaction(() => readSqliteJournalArchive(database));
    dailyContents = createJournalExportArtifact({
      kind: "hermes-journal-export",
      formatVersion: 1,
      exportedAtUs: "1783960200002000",
      source: withDaily.source,
      payload: withDaily.payload,
      attachments: { version: 1, entries: [] },
      summary: {
        workspaceName: "Restored Journal", currency: "USD", timeZone: "America/New_York",
        accounts: "1", activeExecutions: "1", executionVersions: "1",
        importReceipts: "0", rolledBackImports: "0", currentReviews: "0",
        reviewVersions: "0", reviewTerms: "1", playbooks: "0",
        attachments: "0", attachmentBytes: "0",
      },
      stateSha256: withDaily.stateSha256,
      reportSha256: "e".repeat(64),
    }).contents;
  } finally {
    await database.close();
  }
});

describe("SQLite journal restore payload decoder", () => {
  it("accepts the exact native v1 table set and returns deeply immutable verified data", () => {
    const decoded = decodeSqliteJournalRestoreArchive(baselineContents);

    expect(decoded.payloadKind).toBe("sqlite-table-set");
    expect(decoded.payloadVersion).toBe(1);
    expect(decoded.tables.map((candidate) => candidate.name))
      .toEqual(SQLITE_JOURNAL_ARCHIVE_TABLES);
    expect(decoded.summary).toEqual({
      workspaceName: null,
      currency: null,
      timeZone: null,
      accounts: "0",
      activeExecutions: "0",
      executionVersions: "0",
      importReceipts: "0",
      rolledBackImports: "0",
      currentReviews: "0",
      reviewVersions: "0",
      reviewTerms: "0",
      playbooks: "0",
      attachments: "0",
      attachmentBytes: "0",
    });
    expect(sqliteRestoreArchiveTable(decoded, "schema_migrations").rows).toHaveLength(4);
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(Object.isFrozen(decoded.tables)).toBe(true);
    expect(Object.isFrozen(decoded.tables[0]?.columns)).toBe(true);
    expect(Object.isFrozen(decoded.tables[0]?.rows[0])).toBe(true);
    expect(() => {
      const firstRow = decoded.tables[0]?.rows[0] as string[];
      firstRow[0] = "99";
    }).toThrow(TypeError);
  });

  it("recomputes a populated journal summary and accepts signed 64-bit fee boundaries", () => {
    const decoded = decodeSqliteJournalRestoreArchive(populatedContents);

    expect(decoded.summary).toMatchObject({
      workspaceName: "Restored Journal",
      currency: "USD",
      timeZone: "America/New_York",
      accounts: "1",
      activeExecutions: "1",
      executionVersions: "1",
    });
    const fees = sqliteRestoreArchiveTable(decoded, "execution_fee_components");
    expect(fees.rows[0]?.at(-1)).toBe("-9223372036854775808");
  });

  it("binds native daily-entry content to its revision and requires an authored signal", () => {
    expect(() => decodeSqliteJournalRestoreArchive(dailyContents)).not.toThrow();

    const changed = mutableArchive(dailyContents);
    const versions = table(changed, "daily_journal_entry_versions");
    const version = versions.rows[0];
    if (version === undefined) throw new Error("Daily restore fixture lost its version.");
    setRowCell(versions, version, "note_text", "Changed after the durable revision.");
    recomputeChangedTables(changed, "daily_journal_entry_versions");
    expect(() => decodeSqliteJournalRestoreArchive(resign(changed)))
      .toThrow(/revision does not bind/i);

    const empty = mutableArchive(dailyContents);
    const emptyVersions = table(empty, "daily_journal_entry_versions");
    const emptyVersion = emptyVersions.rows[0];
    if (emptyVersion === undefined) throw new Error("Daily restore fixture lost its version.");
    setRowCell(emptyVersions, emptyVersion, "note_text", "");
    const assignments = table(empty, "daily_journal_entry_term_assignments");
    assignments.rows = [];
    recomputeChangedTables(
      empty,
      "daily_journal_entry_versions",
      "daily_journal_entry_term_assignments",
    );
    expect(() => decodeSqliteJournalRestoreArchive(resign(empty)))
      .toThrow(/authoring contract/i);
  });

  it("rejects noncanonical or mismatched native review vocabulary", () => {
    const noncanonical = mutableArchive(dailyContents);
    const noncanonicalTerms = table(noncanonical, "review_terms");
    const noncanonicalTerm = noncanonicalTerms.rows[0];
    if (noncanonicalTerm === undefined) throw new Error("Daily restore fixture lost its term.");
    setRowCell(noncanonicalTerms, noncanonicalTerm, "name", " Calm");
    recomputeChangedTables(noncanonical, "review_terms");
    expect(() => decodeSqliteJournalRestoreArchive(resign(noncanonical)))
      .toThrow(/review-term names must be canonical/i);

    const mismatched = mutableArchive(dailyContents);
    const mismatchedTerms = table(mismatched, "review_terms");
    const mismatchedTerm = mismatchedTerms.rows[0];
    if (mismatchedTerm === undefined) throw new Error("Daily restore fixture lost its term.");
    setRowCell(mismatchedTerms, mismatchedTerm, "normalized_name", "not-calm");
    recomputeChangedTables(mismatched, "review_terms");
    expect(() => decodeSqliteJournalRestoreArchive(resign(mismatched)))
      .toThrow(/normalized identity is inconsistent/i);
  });

  it("rejects a consistently referenced invalid native daily-entry ID", () => {
    const invalid = mutableArchive(dailyContents);
    const versions = table(invalid, "daily_journal_entry_versions");
    const heads = table(invalid, "daily_journal_entry_heads");
    const assignments = table(invalid, "daily_journal_entry_term_assignments");
    const version = versions.rows[0];
    const head = heads.rows[0];
    const assignment = assignments.rows[0];
    if (version === undefined || head === undefined || assignment === undefined) {
      throw new Error("Daily restore fixture lost its linked rows.");
    }
    setRowCell(versions, version, "id", " invalid-daily-id");
    setRowCell(heads, head, "entry_version_id", " invalid-daily-id");
    setRowCell(assignments, assignment, "entry_version_id", " invalid-daily-id");
    recomputeChangedTables(
      invalid,
      "daily_journal_entry_versions",
      "daily_journal_entry_heads",
      "daily_journal_entry_term_assignments",
    );
    expect(() => decodeSqliteJournalRestoreArchive(resign(invalid)))
      .toThrow(/invalid daily-entry ID/i);
  });

  it("rejects the browser payload even when its generic envelope checksum is valid", () => {
    const archive = mutableArchive(baselineContents);
    archive.payload.kind = "browser-session-state";

    expect(() => decodeSqliteJournalRestoreArchive(resign(archive)))
      .toThrow(/supported native SQLite journal payload/i);
  });

  it("rejects nonempty attachment catalogs before decoding SQLite rows", () => {
    const archive = mutableArchive(baselineContents);
    archive.attachments = { version: 1, entries: [{ name: "not-supported" }] };

    expect(() => decodeSqliteJournalRestoreArchive(resign(archive)))
      .toThrow(/cannot restore archives containing attachments/i);
  });

  it("rejects unsupported payload versions and table-format versions", () => {
    const payloadVersion = mutableArchive(baselineContents);
    payloadVersion.payload.version = 2;
    expect(() => decodeSqliteJournalRestoreArchive(resign(payloadVersion)))
      .toThrow(/supported native SQLite journal payload/i);

    const tableVersion = mutableArchive(baselineContents);
    tableVersion.payload.data.tableFormatVersion = 2;
    expect(() => decodeSqliteJournalRestoreArchive(resign(tableVersion)))
      .toThrow(/table format version is not supported/i);
  });

  it("requires exact payload and table object keys", () => {
    const payload = mutableArchive(baselineContents);
    payload.payload.data.surprise = true;
    expect(() => decodeSqliteJournalRestoreArchive(resign(payload)))
      .toThrow(/payload data has missing or unsupported fields/i);

    const archive = mutableArchive(baselineContents);
    table(archive, "currencies").surprise = true;
    expect(() => decodeSqliteJournalRestoreArchive(resign(archive)))
      .toThrow(/currencies has missing or unsupported fields/i);
  });

  it("requires the exact current migration source and matching migration rows", () => {
    const staleSource = mutableArchive(baselineContents);
    staleSource.source.migrations.pop();
    staleSource.source.schemaUserVersion = 3;
    expect(() => decodeSqliteJournalRestoreArchive(resign(staleSource)))
      .toThrow(/schema version|migration source/i);

    const rowsChanged = mutableArchive(baselineContents);
    const migrations = table(rowsChanged, "schema_migrations");
    const name = columnPosition(migrations, "name");
    const first = migrations.rows[0];
    if (first === undefined) throw new Error("Missing migration row.");
    first[name] = "internally-consistent-lie";
    recomputeTable(migrations);
    expect(() => decodeSqliteJournalRestoreArchive(resign(rowsChanged)))
      .toThrow(/migration table does not match its source/i);
  });

  it("requires all 35 trusted tables exactly once and in canonical order", () => {
    const missing = mutableArchive(baselineContents);
    missing.payload.data.tables.pop();
    expect(() => decodeSqliteJournalRestoreArchive(resign(missing)))
      .toThrow(/every pinned table exactly once/i);

    const reordered = mutableArchive(baselineContents);
    const first = reordered.payload.data.tables[0];
    const second = reordered.payload.data.tables[1];
    if (first === undefined || second === undefined) throw new Error("Missing test tables.");
    reordered.payload.data.tables[0] = second;
    reordered.payload.data.tables[1] = first;
    expect(() => decodeSqliteJournalRestoreArchive(resign(reordered)))
      .toThrow(/missing or out of canonical order/i);

    const duplicated = mutableArchive(baselineContents);
    const duplicate = duplicated.payload.data.tables[0];
    if (duplicate === undefined) throw new Error("Missing test table.");
    duplicated.payload.data.tables[1] = duplicate;
    expect(() => decodeSqliteJournalRestoreArchive(resign(duplicated)))
      .toThrow(/missing or out of canonical order/i);
  });

  it("rejects changed column metadata even after every attacker-controlled digest is recomputed", () => {
    const archive = mutableArchive(baselineContents);
    const workspaces = table(archive, "workspaces");
    const name = workspaces.columns.find((column) => column.name === "name");
    if (name === undefined) throw new Error("Missing workspace name column.");
    name.name = "attacker_name";
    recomputeTable(workspaces);
    recomputeState(archive);

    expect(() => decodeSqliteJournalRestoreArchive(resign(archive)))
      .toThrow(/pinned export-v1 column manifest/i);
  });

  it("rejects wrong row widths, nulls in required columns, and non-text TEXT cells", () => {
    const wrongWidth = mutableArchive(baselineContents);
    const widthMigrations = table(wrongWidth, "schema_migrations");
    widthMigrations.rows[0]?.pop();
    recomputeTable(widthMigrations);
    expect(() => decodeSqliteJournalRestoreArchive(resign(wrongWidth)))
      .toThrow(/pinned column width/i);

    const requiredNull = mutableArchive(baselineContents);
    const nullMigrations = table(requiredNull, "schema_migrations");
    const first = nullMigrations.rows[0];
    if (first === undefined) throw new Error("Missing migration row.");
    first[columnPosition(nullMigrations, "version")] = null;
    recomputeTable(nullMigrations);
    expect(() => decodeSqliteJournalRestoreArchive(resign(requiredNull)))
      .toThrow(/cannot be null/i);

    const nonText = mutableArchive(baselineContents);
    const textMigrations = table(nonText, "schema_migrations");
    const textFirst = textMigrations.rows[0];
    if (textFirst === undefined) throw new Error("Missing migration row.");
    textFirst[columnPosition(textMigrations, "name")] = 7;
    recomputeTable(textMigrations);
    expect(() => decodeSqliteJournalRestoreArchive(resign(nonText)))
      .toThrow(/must be text/i);
  });

  it("rejects noncanonical and out-of-range signed SQLite integers", () => {
    const noncanonical = mutableArchive(baselineContents);
    const firstTable = table(noncanonical, "schema_migrations");
    const first = firstTable.rows[0];
    if (first === undefined) throw new Error("Missing migration row.");
    first[columnPosition(firstTable, "applied_at_ms")] = "01";
    recomputeTable(firstTable);
    expect(() => decodeSqliteJournalRestoreArchive(resign(noncanonical)))
      .toThrow(/canonical signed SQLite integer/i);

    const overflow = mutableArchive(baselineContents);
    const overflowTable = table(overflow, "schema_migrations");
    const overflowFirst = overflowTable.rows[0];
    if (overflowFirst === undefined) throw new Error("Missing migration row.");
    overflowFirst[columnPosition(overflowTable, "applied_at_ms")] = "9223372036854775808";
    recomputeTable(overflowTable);
    expect(() => decodeSqliteJournalRestoreArchive(resign(overflow)))
      .toThrow(/signed SQLite 64-bit integer range/i);

    const underflow = mutableArchive(baselineContents);
    const underflowTable = table(underflow, "schema_migrations");
    const underflowFirst = underflowTable.rows[0];
    if (underflowFirst === undefined) throw new Error("Missing migration row.");
    underflowFirst[columnPosition(underflowTable, "applied_at_ms")] = "-9223372036854775809";
    recomputeTable(underflowTable);
    expect(() => decodeSqliteJournalRestoreArchive(resign(underflow)))
      .toThrow(/signed SQLite 64-bit integer range/i);
  });

  it("requires strict canonical row order and rejects duplicate full rows", () => {
    const descending = mutableArchive(baselineContents);
    const currencies = table(descending, "currencies");
    currencies.rows = [
      ["USD", "2", "US Dollar"],
      ["EUR", "2", "Euro"],
    ];
    currencies.rowCount = "2";
    recomputeTable(currencies);
    recomputeState(descending);
    expect(() => decodeSqliteJournalRestoreArchive(resign(descending)))
      .toThrow(/strict canonical order/i);

    const duplicateRows = mutableArchive(baselineContents);
    const duplicateCurrencies = table(duplicateRows, "currencies");
    duplicateCurrencies.rows = [
      ["USD", "2", "US Dollar"],
      ["USD", "2", "US Dollar"],
    ];
    duplicateCurrencies.rowCount = "2";
    recomputeTable(duplicateCurrencies);
    recomputeState(duplicateRows);
    expect(() => decodeSqliteJournalRestoreArchive(resign(duplicateRows)))
      .toThrow(/strict canonical order/i);

    const duplicatePrimaryKey = mutableArchive(baselineContents);
    const keyCurrencies = table(duplicatePrimaryKey, "currencies");
    keyCurrencies.rows = [
      ["USD", "2", "US Dollar"],
      ["USD", "3", "Changed metadata"],
    ];
    keyCurrencies.rowCount = "2";
    recomputeTable(keyCurrencies);
    recomputeState(duplicatePrimaryKey);
    expect(() => decodeSqliteJournalRestoreArchive(resign(duplicatePrimaryKey)))
      .toThrow(/duplicate primary-key values/i);
  });

  it("recomputes row, table, portable-state, and summary claims", () => {
    const rowCount = mutableArchive(baselineContents);
    table(rowCount, "currencies").rowCount = "1";
    expect(() => decodeSqliteJournalRestoreArchive(resign(rowCount)))
      .toThrow(/row count does not match/i);

    const tableDigest = mutableArchive(baselineContents);
    table(tableDigest, "currencies").createSqlSha256 = "b".repeat(64);
    expect(() => decodeSqliteJournalRestoreArchive(resign(tableDigest)))
      .toThrow(/table currencies digest does not match/i);

    const stateDigest = mutableArchive(baselineContents);
    stateDigest.stateSha256 = "b".repeat(64);
    expect(() => decodeSqliteJournalRestoreArchive(resign(stateDigest)))
      .toThrow(/state digest does not match/i);

    const summary = mutableArchive(baselineContents);
    summary.summary.accounts = "1";
    expect(() => decodeSqliteJournalRestoreArchive(resign(summary)))
      .toThrow(/summary does not match/i);
  });

  it("rejects alternate or additional workspace identities after all portable digests are recomputed", () => {
    const alternate = mutableArchive(populatedContents);
    const changedTables: string[] = [];
    for (const value of alternate.payload.data.tables) {
      let changed = false;
      if (value.name === "workspaces") {
        const workspace = value.rows[0];
        if (workspace === undefined) throw new Error("Missing populated workspace.");
        setRowCell(value, workspace, "id", "workspace:other");
        changed = true;
      }
      const workspaceIndex = value.columns.findIndex((column) => column.name === "workspace_id");
      if (workspaceIndex >= 0) {
        for (const row of value.rows) row[workspaceIndex] = "workspace:other";
        changed = value.rows.length > 0 || changed;
      }
      if (changed) changedTables.push(String(value.name));
    }
    recomputeChangedTables(alternate, ...changedTables);
    expect(() => decodeSqliteJournalRestoreArchive(resign(alternate)))
      .toThrow(/active primary journal workspace/i);

    const extra = mutableArchive(populatedContents);
    const workspaces = table(extra, "workspaces");
    const existing = workspaces.rows[0];
    if (existing === undefined) throw new Error("Missing populated workspace.");
    const archived = [...existing];
    setRowCell(workspaces, archived, "id", "workspace:archived");
    setRowCell(workspaces, archived, "name", "Unsupported archived journal");
    setRowCell(workspaces, archived, "archived_at_ms", "2");
    workspaces.rows.push(archived);
    recomputeChangedTables(extra, "workspaces");
    expect(() => decodeSqliteJournalRestoreArchive(resign(extra)))
      .toThrow(/only the primary journal workspace/i);
  });

  it("rejects missing, orphaned, stale, and gapped execution version heads", () => {
    const missingHead = mutableArchive(populatedContents);
    table(missingHead, "execution_heads").rows = [];
    missingHead.summary.activeExecutions = "0";
    recomputeChangedTables(missingHead, "execution_heads");
    expect(() => decodeSqliteJournalRestoreArchive(resign(missingHead)))
      .toThrow(/exactly one current version head/i);

    const staleHead = mutableArchive(populatedContents);
    const staleVersions = table(staleHead, "execution_versions");
    const firstVersion = staleVersions.rows[0];
    if (firstVersion === undefined) throw new Error("Missing populated execution version.");
    const secondVersion = [...firstVersion];
    setRowCell(staleVersions, secondVersion, "id", "version-two");
    setRowCell(staleVersions, secondVersion, "version_number", "2");
    setRowCell(staleVersions, secondVersion, "edit_reason", "Correction");
    setRowCell(staleVersions, secondVersion, "version_sha256", "e".repeat(64));
    setRowCell(staleVersions, secondVersion, "recorded_at_ms", "2");
    staleVersions.rows.push(secondVersion);
    staleHead.summary.executionVersions = "2";
    recomputeChangedTables(staleHead, "execution_versions");
    expect(() => decodeSqliteJournalRestoreArchive(resign(staleHead)))
      .toThrow(/head must point to the latest immutable version/i);

    const gapped = mutableArchive(populatedContents);
    const gapVersions = table(gapped, "execution_versions");
    const gapFirst = gapVersions.rows[0];
    if (gapFirst === undefined) throw new Error("Missing populated execution version.");
    const versionThree = [...gapFirst];
    setRowCell(gapVersions, versionThree, "id", "version-three");
    setRowCell(gapVersions, versionThree, "version_number", "3");
    setRowCell(gapVersions, versionThree, "edit_reason", "Skipped version");
    setRowCell(gapVersions, versionThree, "version_sha256", "f".repeat(64));
    setRowCell(gapVersions, versionThree, "recorded_at_ms", "3");
    gapVersions.rows.push(versionThree);
    const gapHeads = table(gapped, "execution_heads");
    const gapHead = gapHeads.rows[0];
    if (gapHead === undefined) throw new Error("Missing populated execution head.");
    setRowCell(gapHeads, gapHead, "execution_version_id", "version-three");
    gapped.summary.executionVersions = "2";
    recomputeChangedTables(gapped, "execution_versions", "execution_heads");
    expect(() => decodeSqliteJournalRestoreArchive(resign(gapped)))
      .toThrow(/contiguous history/i);

    const orphaned = mutableArchive(populatedContents);
    const orphanVersions = table(orphaned, "execution_versions");
    const orphanFirst = orphanVersions.rows[0];
    if (orphanFirst === undefined) throw new Error("Missing populated execution version.");
    const orphan = [...orphanFirst];
    setRowCell(orphanVersions, orphan, "id", "orphan-version");
    setRowCell(orphanVersions, orphan, "execution_id", "missing-execution");
    setRowCell(orphanVersions, orphan, "version_sha256", "9".repeat(64));
    orphanVersions.rows.push(orphan);
    orphaned.summary.executionVersions = "2";
    recomputeChangedTables(orphaned, "execution_versions");
    expect(() => decodeSqliteJournalRestoreArchive(resign(orphaned)))
      .toThrow(/version without an execution/i);
  });

  it("rejects missing, stale, and gapped immutable review heads", () => {
    const reviewRow = (
      value: MutableTable,
      id: string,
      version: string,
      supersedesVersionId: string | null,
    ) => rowFor(value, {
      id,
      workspace_id: "workspace:primary",
      trade_subject_id: "trade-subject-one",
      version_number: version,
      supersedes_version_id: supersedesVersionId,
    });
    const headRow = (value: MutableTable, reviewVersionId: string) => rowFor(value, {
      workspace_id: "workspace:primary",
      trade_subject_id: "trade-subject-one",
      review_version_id: reviewVersionId,
      changed_at_ms: "3",
    });

    const missingHead = mutableArchive(populatedContents);
    const missingVersions = table(missingHead, "trade_review_versions");
    missingVersions.rows.push(reviewRow(missingVersions, "review-one", "1", null));
    missingHead.summary.reviewVersions = "1";
    recomputeChangedTables(missingHead, "trade_review_versions");
    expect(() => decodeSqliteJournalRestoreArchive(resign(missingHead)))
      .toThrow(/exactly one current head/i);

    const staleHead = mutableArchive(populatedContents);
    const staleVersions = table(staleHead, "trade_review_versions");
    staleVersions.rows.push(
      reviewRow(staleVersions, "review-one", "1", null),
      reviewRow(staleVersions, "review-two", "2", "review-one"),
    );
    const staleHeads = table(staleHead, "trade_review_heads");
    staleHeads.rows.push(headRow(staleHeads, "review-one"));
    staleHead.summary.reviewVersions = "2";
    staleHead.summary.currentReviews = "1";
    recomputeChangedTables(staleHead, "trade_review_versions", "trade_review_heads");
    expect(() => decodeSqliteJournalRestoreArchive(resign(staleHead)))
      .toThrow(/head must point to the latest immutable version/i);

    const gapped = mutableArchive(populatedContents);
    const gapVersions = table(gapped, "trade_review_versions");
    gapVersions.rows.push(
      reviewRow(gapVersions, "review-one", "1", null),
      reviewRow(gapVersions, "review-three", "3", "review-one"),
    );
    const gapHeads = table(gapped, "trade_review_heads");
    gapHeads.rows.push(headRow(gapHeads, "review-three"));
    gapped.summary.reviewVersions = "2";
    gapped.summary.currentReviews = "1";
    recomputeChangedTables(gapped, "trade_review_versions", "trade_review_heads");
    expect(() => decodeSqliteJournalRestoreArchive(resign(gapped)))
      .toThrow(/contiguous immutable chain/i);
  });

});
