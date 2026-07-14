import type {
  JournalArchiveJson,
  JournalArchivePayload,
  JournalArchiveSource,
} from "../../application/journal-archive";
import { canonicalJournalArchiveJson } from "../../application/journal-archive";
import type { SqlDatabase, SqlRow } from "../../application/sql-database";
import { MOBILE_SCHEMA_MIGRATIONS, sha256Hex } from "./schema";

export const SQLITE_JOURNAL_ARCHIVE_PAYLOAD_KIND = "sqlite-table-set" as const;
export const SQLITE_JOURNAL_ARCHIVE_PAYLOAD_VERSION = 1 as const;

/**
 * Pinned export-v1 coverage. A new schema table requires an explicit archive
 * compatibility decision instead of being silently omitted or accepted.
 */
export const SQLITE_JOURNAL_ARCHIVE_TABLES = Object.freeze([
  "schema_migrations",
  "currencies",
  "workspaces",
  "accounts",
  "instruments",
  "import_batches",
  "import_source_rows",
  "import_issues",
  "executions",
  "execution_versions",
  "execution_fee_components",
  "execution_heads",
  "execution_sources",
  "import_execution_occurrences",
  "import_receipts",
  "import_rollbacks",
  "manual_execution_submissions",
  "projection_rebuild_runs",
  "trade_subjects",
  "trade_projections",
  "trade_execution_allocations",
  "trade_lot_matches",
  "trade_money_totals",
  "projection_active_state",
  "metric_definitions",
  "review_terms",
  "playbooks",
  "playbook_rules",
  "trade_review_versions",
  "trade_review_term_assignments",
  "trade_review_rule_results",
  "trade_review_heads",
  "daily_journal_entry_versions",
  "daily_journal_entry_term_assignments",
  "daily_journal_entry_heads",
] as const);

export type SqliteJournalArchiveTableName = typeof SQLITE_JOURNAL_ARCHIVE_TABLES[number];

/**
 * Export-v1 column contracts generated from the v1-v4 migrations with
 * PRAGMA table_xinfo. Each digest covers ordered name, declared type,
 * nullability, primary-key position, SQL default, and hidden value.
 */
export const SQLITE_JOURNAL_ARCHIVE_V1_COLUMN_SHA256: Readonly<
  Record<SqliteJournalArchiveTableName, string>
> = Object.freeze({
  schema_migrations: "fd0f626652721faa3cee1ed299b0fbf1ea18f39c06f1bf326fdb008f0680a6e6",
  currencies: "9f485f107902f56d3852dbb5b6ff806abcc8f9aef8d4c5102b8c024c54704f1e",
  workspaces: "285b5caee07e8ce8f1bde57ad769fc778a24e5f1790132d56bce056f9acd6005",
  accounts: "ea4eec2923028ff6b2f652146f79e3ca11c269c10f0efcbadd1220913575f603",
  instruments: "b5769f63d4edcc4c41deb7bcd9ab72dd94b0bce627e3c7228d7f704aadabce09",
  import_batches: "91821a4b2c79cd7b1ce379c6f93185105063e5faa594b6e92dcabf50d11b24d1",
  import_source_rows: "b37d94f6f96d7624d869418a65f314d58b9a98042892e253a2eb66d64e1f67bb",
  import_issues: "1d94da1f6d5fc717b5dd3a96ef0a91770a9340d2bc12a9b55d261ec4cda2bf19",
  executions: "55d670b743eb70e2d8ca3c135abffeab4dab5056335cf1fd08076482a94efb94",
  execution_versions: "7b95bf7a93a5607f1d2ce530af7d9f1a245dc73e3855feed85e6dcfccf2cd9ee",
  execution_fee_components: "e38385f4a4434d22e00cdf6b3b18e7bc4ac65c7207ccc5c75305ea0d57bf0c85",
  execution_heads: "73fe15fb2d11083027db83fd6a099d8db26753a162a1156227479b7523ebd581",
  execution_sources: "fed9c6808ff7dfb61fd62817b9af3fc93cb68d373675c72885915d49d5f34bed",
  import_execution_occurrences: "f9412987ae3dca4b4e5fae7929cc0224f5229488a28786bc4dd1c8a5e93423df",
  import_receipts: "691a33cecb26864e17db58eaf06f4c118f6c362b3d64bec1a473d1c594ae4543",
  import_rollbacks: "31fb421f6ae5107c3f2c2885b27b97192d50bb54bd170e48d6345f7662c204c0",
  manual_execution_submissions: "c7d9520b8d83ae8d69093b522de5276dc98bc66a491a6b93e7cbec564b6a72b9",
  projection_rebuild_runs: "e8a376907de14a83cc562bf7e66a2f6af7ce7f922e3b1edcb4f41a4cdc474271",
  trade_subjects: "cb0bb6782c11018ef230ebf4bf5b840fb2112f1a4345b08b73fb508dffde98ac",
  trade_projections: "7316349f7adc108d70f3e7f12bfa82f1025f4a50db2e004b267ac537d7bf970d",
  trade_execution_allocations: "514ffe9003ca3278646792b9cde473d939fc614907542e5eb856b59057565a2a",
  trade_lot_matches: "87bd07cc2d6c6b852b6691f35543bdb3663fde07a0142e14786e7d16675d8af0",
  trade_money_totals: "566a249156782efc5676907cdcae9af2aa3a88749d9af9b20aaf6d37e70ec565",
  projection_active_state: "7148e708b6cdcaada58bf3d0aa7aec86bbf6b4a49179268d7b056affe643d9ed",
  metric_definitions: "2648e6beb56017e616c43bb7c34ee915b553457d2e92d5da7fb9f453e25450e6",
  review_terms: "7a88821504d0b3bc77919d8fe30a0253fecbb2df409e9698c0d7e64fa622841a",
  playbooks: "20e50c0a5afcc72740d84418bf00c47e246e2279a8952808de2225a3aa9661e9",
  playbook_rules: "7904a28046b81afd1f55af222237a0306ded4e316336554e1e2d213c13fc8ffb",
  trade_review_versions: "62f5ff8f419729cb4047ec7fc3c46a9f6af659f07d88fa0d8bc6d8efccc802d8",
  trade_review_term_assignments: "9e313549ff5a20aa2c9eb994b46d78169c268cb2378e228b9dd9392ec8c94c3d",
  trade_review_rule_results: "581a008c464e748db4ad1da26e2c496da6235109654e1b841ae58a71800e99ca",
  trade_review_heads: "b7e6b63731be74535b7808b4ee4c8271423853b1ac6cbe84379478166fb46f95",
  daily_journal_entry_versions: "a50a88e940d8b65bf7ac1363d0c4e286a454bee48e3a88f2cbad1c3405b7806e",
  daily_journal_entry_term_assignments: "bb50f27fabb51891037d58e7a2551c2a0d7cc770d31be595a2851683ec3d7e50",
  daily_journal_entry_heads: "b561ff83a8e1e083f52585cd6d7a81ea59f065bf2b8afc718aa88f0fa68873d2",
});

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
const CANONICAL_INTEGER_PATTERN = /^(?:0|-?[1-9][0-9]*)$/;

export type SqliteArchiveColumnType = "INTEGER" | "TEXT";

export interface SqliteArchiveColumn {
  readonly name: string;
  readonly declaredType: SqliteArchiveColumnType;
  readonly notNull: boolean;
  readonly primaryKeyPosition: number;
  readonly defaultSql: string | null;
  readonly hidden: 0;
}

export interface SqliteArchiveTable {
  readonly name: string;
  /**
   * Diagnostic provenance; export-v1 compatibility is gated by the pinned
   * column manifest.
   */
  readonly createSqlSha256: string;
  readonly columns: readonly SqliteArchiveColumn[];
  readonly rows: readonly (readonly (string | null)[])[];
  readonly rowCount: string;
  readonly tableSha256: string;
}

export interface SqliteJournalArchiveData {
  readonly tableFormatVersion: 1;
  readonly tables: readonly SqliteArchiveTable[];
}

export interface SqliteJournalArchiveSnapshot {
  readonly source: JournalArchiveSource;
  readonly payload: JournalArchivePayload;
  readonly stateSha256: string;
  readonly tables: readonly SqliteArchiveTable[];
}

function requireSafeInteger(row: SqlRow, column: string): number {
  const value = row[column];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`SQLite archive metadata ${column} is not a safe integer.`);
  }
  return value;
}

function requireText(row: SqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`SQLite archive metadata ${column} is not text.`);
  }
  return value;
}

function nullableText(row: SqlRow, column: string): string | null {
  const value = row[column];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new Error(`SQLite archive metadata ${column} is neither text nor null.`);
  }
  return value;
}

function quoteIdentifier(identifier: string): string {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error("The journal schema contains an unsupported SQL identifier.");
  }
  return `"${identifier}"`;
}

function asArchiveJson(value: unknown): JournalArchiveJson {
  return value as JournalArchiveJson;
}

export function tableDigestInput(table: Omit<SqliteArchiveTable, "tableSha256">): JournalArchiveJson {
  return asArchiveJson(table);
}

export function portableStateDigestInput(
  tables: readonly SqliteArchiveTable[],
): JournalArchiveJson {
  return asArchiveJson({
    tableFormatVersion: 1,
    // Migration application timestamps describe the destination environment,
    // not the user's portable journal. Version/name/checksum remain in source.
    tables: tables
      .filter((table) => table.name !== "schema_migrations")
      .map((table) => ({
        name: table.name,
        columns: table.columns.map((column) => ({
          name: column.name,
          declaredType: column.declaredType,
        })),
        rows: table.rows,
      })),
  });
}

async function verifyMigrationHistory(database: SqlDatabase): Promise<void> {
  const rows = await database.query<SqlRow>(
    "SELECT version, name, checksum_sha256 FROM schema_migrations ORDER BY version",
  );
  if (rows.length !== MOBILE_SCHEMA_MIGRATIONS.length) {
    throw new Error("Journal export migration history is incomplete.");
  }
  rows.forEach((row, index) => {
    const expected = MOBILE_SCHEMA_MIGRATIONS[index];
    if (
      expected === undefined
      || requireSafeInteger(row, "version") !== expected.toVersion
      || requireText(row, "name") !== expected.name
      || requireText(row, "checksum_sha256") !== expected.checksumSha256
    ) {
      throw new Error(
        "Journal export migration history does not match this app build.",
      );
    }
  });
}

async function loadColumns(
  database: SqlDatabase,
  tableName: SqliteJournalArchiveTableName,
): Promise<readonly SqliteArchiveColumn[]> {
  const rows = await database.query<SqlRow>(`PRAGMA table_xinfo(${quoteIdentifier(tableName)})`);
  if (rows.length === 0) throw new Error(`Journal archive table ${tableName} has no columns.`);
  const columns = rows.map((row, index) => {
    if (requireSafeInteger(row, "cid") !== index) {
      throw new Error(`Journal archive table ${tableName} has unstable column ordering.`);
    }
    const name = requireText(row, "name");
    quoteIdentifier(name);
    const declaredType = requireText(row, "type").toUpperCase();
    if (declaredType !== "INTEGER" && declaredType !== "TEXT") {
      throw new Error(
        `Journal archive table ${tableName}.${name} uses unsupported type ${declaredType || "(empty)"}.`,
      );
    }
    const notNull = requireSafeInteger(row, "notnull");
    const primaryKeyPosition = requireSafeInteger(row, "pk");
    const hidden = requireSafeInteger(row, "hidden");
    if ((notNull !== 0 && notNull !== 1) || primaryKeyPosition < 0) {
      throw new Error(`Journal archive table ${tableName}.${name} has invalid column metadata.`);
    }
    if (hidden !== 0) {
      throw new Error(
        `Journal archive table ${tableName}.${name} is generated or hidden; export v1 rejects it.`,
      );
    }
    return Object.freeze({
      name,
      declaredType,
      notNull: notNull === 1,
      primaryKeyPosition,
      defaultSql: nullableText(row, "dflt_value"),
      hidden: 0 as const,
    });
  });
  const actualSha256 = sha256Hex(JSON.stringify(columns));
  const expectedSha256 = SQLITE_JOURNAL_ARCHIVE_V1_COLUMN_SHA256[tableName];
  if (actualSha256 !== expectedSha256) {
    throw new Error(
      `Journal archive table ${tableName} column manifest does not match export v1 (expected ${expectedSha256}, received ${actualSha256}).`,
    );
  }
  return Object.freeze(columns);
}

async function loadTable(
  database: SqlDatabase,
  tableName: SqliteJournalArchiveTableName,
  createSql: string,
): Promise<SqliteArchiveTable> {
  const columns = await loadColumns(database, tableName);
  const selectColumns = columns.map((column) => {
    const identifier = quoteIdentifier(column.name);
    return column.declaredType === "INTEGER"
      ? `CAST(${identifier} AS TEXT) AS ${identifier}`
      : identifier;
  }).join(", ");
  const queried = await database.query<SqlRow>(
    `SELECT ${selectColumns} FROM ${quoteIdentifier(tableName)}`,
  );
  const rows = queried.map((row) => Object.freeze(columns.map((column) => {
    const value = row[column.name];
    if (value === null) {
      if (column.notNull) {
        throw new Error(`Journal archive table ${tableName}.${column.name} contains null.`);
      }
      return null;
    }
    if (typeof value !== "string") {
      throw new Error(`Journal archive table ${tableName}.${column.name} is not text-safe.`);
    }
    if (column.declaredType === "INTEGER" && !CANONICAL_INTEGER_PATTERN.test(value)) {
      throw new Error(
        `Journal archive table ${tableName}.${column.name} is not a canonical integer.`,
      );
    }
    return value;
  })));
  rows.sort((left, right) => {
    const leftJson = canonicalJournalArchiveJson(asArchiveJson(left));
    const rightJson = canonicalJournalArchiveJson(asArchiveJson(right));
    return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
  });
  const withoutDigest = Object.freeze({
    name: tableName,
    createSqlSha256: sha256Hex(createSql),
    columns,
    rows,
    rowCount: String(rows.length),
  });
  return Object.freeze({
    ...withoutDigest,
    tableSha256: sha256Hex(canonicalJournalArchiveJson(tableDigestInput(withoutDigest))),
  });
}

/** Caller must hold the journal connection's single transaction. */
export async function readSqliteJournalArchive(
  database: SqlDatabase,
): Promise<SqliteJournalArchiveSnapshot> {
  const userVersionRows = await database.query<SqlRow>("PRAGMA user_version");
  const userVersion = userVersionRows[0] === undefined
    ? 0
    : requireSafeInteger(userVersionRows[0], "user_version");
  const current = MOBILE_SCHEMA_MIGRATIONS.at(-1);
  if (current === undefined || userVersion !== current.toVersion) {
    throw new Error("The journal schema version is incompatible with export v1.");
  }
  await verifyMigrationHistory(database);
  const schemaRows = await database.query<SqlRow>(
    `SELECT name, sql
       FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name`,
  );
  const schemaByName = new Map(schemaRows.map((row) => [
    requireText(row, "name"),
    requireText(row, "sql"),
  ] as const));
  const expected = new Set<string>(SQLITE_JOURNAL_ARCHIVE_TABLES);
  const unexpected = [...schemaByName.keys()].filter((name) => !expected.has(name));
  const missing = SQLITE_JOURNAL_ARCHIVE_TABLES.filter((name) => !schemaByName.has(name));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `Journal export schema coverage changed (missing: ${missing.join(", ") || "none"}; unsupported: ${unexpected.join(", ") || "none"}).`,
    );
  }
  const tables: SqliteArchiveTable[] = [];
  for (const tableName of SQLITE_JOURNAL_ARCHIVE_TABLES) {
    const createSql = schemaByName.get(tableName);
    if (createSql === undefined) throw new Error(`Journal archive table ${tableName} is missing.`);
    tables.push(await loadTable(database, tableName, createSql));
  }
  const data: SqliteJournalArchiveData = Object.freeze({
    tableFormatVersion: 1,
    tables: Object.freeze(tables),
  });
  const stateSha256 = sha256Hex(canonicalJournalArchiveJson(portableStateDigestInput(tables)));
  const source: JournalArchiveSource = Object.freeze({
    schemaUserVersion: current.toVersion,
    migrations: Object.freeze(MOBILE_SCHEMA_MIGRATIONS.map((migration) => Object.freeze({
      version: migration.toVersion,
      name: migration.name,
      checksumSha256: migration.checksumSha256,
    }))),
  });
  return Object.freeze({
    source,
    payload: Object.freeze({
      kind: SQLITE_JOURNAL_ARCHIVE_PAYLOAD_KIND,
      version: SQLITE_JOURNAL_ARCHIVE_PAYLOAD_VERSION,
      data: asArchiveJson(data),
    }),
    stateSha256,
    tables: Object.freeze(tables),
  });
}

export function sqliteArchiveTable(
  archive: SqliteJournalArchiveSnapshot,
  name: SqliteJournalArchiveTableName,
): SqliteArchiveTable {
  const table = archive.tables.find((candidate) => candidate.name === name);
  if (table === undefined) throw new Error(`Journal archive table ${name} is missing.`);
  return table;
}
