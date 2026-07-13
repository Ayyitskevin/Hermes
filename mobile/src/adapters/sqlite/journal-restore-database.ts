import {
  canonicalJournalArchiveJson,
  type JournalArchiveJson,
} from "../../application/journal-archive";
import type {
  SqlDatabase,
  SqlParameters,
  SqlRow,
} from "../../application/sql-database";
import {
  SQLITE_JOURNAL_ARCHIVE_TABLES,
  type SqliteArchiveTable,
} from "./journal-archive";
import type { DecodedSqliteJournalRestoreArchive } from "./journal-restore";

type SqliteJournalArchiveTableName = typeof SQLITE_JOURNAL_ARCHIVE_TABLES[number];

export type SqliteRestoreDestinationState =
  | "empty"
  | "already-restored"
  | "nonempty";

const INSERT_ORDER: readonly SqliteJournalArchiveTableName[] = Object.freeze([
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
  "review_terms",
  "playbooks",
  "playbook_rules",
]);

const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;

function asArchiveJson(value: unknown): JournalArchiveJson {
  return value as JournalArchiveJson;
}

function quoteIdentifier(identifier: string): string {
  if (!IDENTIFIER_PATTERN.test(identifier)) {
    throw new Error("The restore payload contains an unsupported SQL identifier.");
  }
  return `"${identifier}"`;
}

export function sqliteRestoreTable(
  tables: readonly SqliteArchiveTable[],
  name: SqliteJournalArchiveTableName,
): SqliteArchiveTable {
  const table = tables.find((candidate) => candidate.name === name);
  if (table === undefined) throw new Error(`Restore table ${name} is missing.`);
  return table;
}

function portableTableValue(table: SqliteArchiveTable): JournalArchiveJson {
  return asArchiveJson({
    name: table.name,
    columns: table.columns,
    rows: table.rows,
  });
}

export function sqlitePortableTablesEqual(
  left: readonly SqliteArchiveTable[],
  right: readonly SqliteArchiveTable[],
): boolean {
  for (const name of SQLITE_JOURNAL_ARCHIVE_TABLES) {
    if (name === "schema_migrations") continue;
    const leftValue = portableTableValue(sqliteRestoreTable(left, name));
    const rightValue = portableTableValue(sqliteRestoreTable(right, name));
    if (
      canonicalJournalArchiveJson(leftValue)
      !== canonicalJournalArchiveJson(rightValue)
    ) {
      return false;
    }
  }
  return true;
}

function requiredColumnIndex(table: SqliteArchiveTable, name: string): number {
  const index = table.columns.findIndex((column) => column.name === name);
  if (index < 0) throw new Error(`Restore table ${table.name} is missing column ${name}.`);
  return index;
}

function requiredText(row: readonly (string | null)[], index: number, label: string): string {
  const value = row[index];
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  return value;
}

function migrationIdentityRows(
  table: SqliteArchiveTable,
): readonly (readonly string[])[] {
  const versionIndex = requiredColumnIndex(table, "version");
  const nameIndex = requiredColumnIndex(table, "name");
  const checksumIndex = requiredColumnIndex(table, "checksum_sha256");
  return Object.freeze(table.rows.map((row) => Object.freeze([
    requiredText(row, versionIndex, "Migration version"),
    requiredText(row, nameIndex, "Migration name"),
    requiredText(row, checksumIndex, "Migration checksum"),
  ])));
}

function migrationBaselinesEqual(
  left: readonly SqliteArchiveTable[],
  right: readonly SqliteArchiveTable[],
): boolean {
  return canonicalJournalArchiveJson(asArchiveJson(migrationIdentityRows(
    sqliteRestoreTable(left, "schema_migrations"),
  ))) === canonicalJournalArchiveJson(asArchiveJson(migrationIdentityRows(
    sqliteRestoreTable(right, "schema_migrations"),
  )));
}

export function classifySqliteRestoreDestination(
  destination: readonly SqliteArchiveTable[],
  source: readonly SqliteArchiveTable[],
): SqliteRestoreDestinationState {
  if (!migrationBaselinesEqual(destination, source)) {
    throw new Error("The destination migration baseline is incompatible with this archive.");
  }
  if (sqlitePortableTablesEqual(destination, source)) return "already-restored";
  const destinationMetrics = sqliteRestoreTable(destination, "metric_definitions");
  const sourceMetrics = sqliteRestoreTable(source, "metric_definitions");
  if (
    canonicalJournalArchiveJson(portableTableValue(destinationMetrics))
    !== canonicalJournalArchiveJson(portableTableValue(sourceMetrics))
  ) {
    throw new Error("The destination metric definitions are incompatible with this archive.");
  }
  const hasUserRows = SQLITE_JOURNAL_ARCHIVE_TABLES.some((name) => (
    name !== "schema_migrations"
    && name !== "metric_definitions"
    && sqliteRestoreTable(destination, name).rows.length > 0
  ));
  return hasUserRows ? "nonempty" : "empty";
}

async function insertRow(
  database: SqlDatabase,
  table: SqliteArchiveTable,
  row: readonly (string | null)[],
): Promise<void> {
  if (row.length !== table.columns.length) {
    throw new Error(`Restore table ${table.name} contains a row with the wrong width.`);
  }
  const columns = table.columns.map((column) => quoteIdentifier(column.name));
  const placeholders = table.columns.map((column) => (
    column.declaredType === "INTEGER" ? "CAST(? AS INTEGER)" : "?"
  ));
  await database.run(
    `INSERT INTO ${quoteIdentifier(table.name)} (${columns.join(", ")})
     VALUES (${placeholders.join(", ")})`,
    row as SqlParameters,
  );
}

async function insertTableRows(
  database: SqlDatabase,
  tables: readonly SqliteArchiveTable[],
  name: SqliteJournalArchiveTableName,
): Promise<void> {
  const table = sqliteRestoreTable(tables, name);
  for (const row of table.rows) await insertRow(database, table, row);
}

interface ReviewVersionRow {
  readonly row: readonly (string | null)[];
  readonly id: string;
  readonly workspaceId: string;
  readonly tradeSubjectId: string;
  readonly version: bigint;
  readonly supersedesId: string | null;
}

function reviewKey(workspaceId: string, tradeSubjectId: string): string {
  return JSON.stringify([workspaceId, tradeSubjectId]);
}

function decodeReviewVersions(
  table: SqliteArchiveTable,
): ReadonlyMap<string, readonly ReviewVersionRow[]> {
  const idIndex = requiredColumnIndex(table, "id");
  const workspaceIndex = requiredColumnIndex(table, "workspace_id");
  const subjectIndex = requiredColumnIndex(table, "trade_subject_id");
  const versionIndex = requiredColumnIndex(table, "version_number");
  const supersedesIndex = requiredColumnIndex(table, "supersedes_version_id");
  const grouped = new Map<string, ReviewVersionRow[]>();
  for (const row of table.rows) {
    const workspaceId = requiredText(row, workspaceIndex, "Review workspace");
    const tradeSubjectId = requiredText(row, subjectIndex, "Review trade subject");
    const versionText = requiredText(row, versionIndex, "Review version");
    const supersedesId = row[supersedesIndex];
    if (supersedesId !== null && typeof supersedesId !== "string") {
      throw new Error("Review predecessor must be text or null.");
    }
    const value: ReviewVersionRow = {
      row,
      id: requiredText(row, idIndex, "Review id"),
      workspaceId,
      tradeSubjectId,
      version: BigInt(versionText),
      supersedesId,
    };
    const key = reviewKey(workspaceId, tradeSubjectId);
    const values = grouped.get(key) ?? [];
    values.push(value);
    grouped.set(key, values);
  }
  for (const [key, values] of grouped) {
    values.sort((left, right) => left.version < right.version ? -1 : left.version > right.version ? 1 : 0);
    values.forEach((value, index) => {
      const expectedVersion = BigInt(index + 1);
      const expectedPredecessor = index === 0 ? null : values[index - 1]?.id ?? null;
      if (
        value.version !== expectedVersion
        || value.supersedesId !== expectedPredecessor
      ) {
        throw new Error("Review versions do not form one contiguous immutable chain.");
      }
    });
    grouped.set(key, values);
  }
  return grouped;
}

interface ReviewHeadRow {
  readonly row: readonly (string | null)[];
  readonly workspaceId: string;
  readonly tradeSubjectId: string;
  readonly reviewVersionId: string;
  readonly changedAtMs: string;
}

function decodeReviewHeads(
  table: SqliteArchiveTable,
): ReadonlyMap<string, ReviewHeadRow> {
  const workspaceIndex = requiredColumnIndex(table, "workspace_id");
  const subjectIndex = requiredColumnIndex(table, "trade_subject_id");
  const versionIndex = requiredColumnIndex(table, "review_version_id");
  const changedIndex = requiredColumnIndex(table, "changed_at_ms");
  const heads = new Map<string, ReviewHeadRow>();
  for (const row of table.rows) {
    const value: ReviewHeadRow = {
      row,
      workspaceId: requiredText(row, workspaceIndex, "Review-head workspace"),
      tradeSubjectId: requiredText(row, subjectIndex, "Review-head trade subject"),
      reviewVersionId: requiredText(row, versionIndex, "Review-head version"),
      changedAtMs: requiredText(row, changedIndex, "Review-head timestamp"),
    };
    const key = reviewKey(value.workspaceId, value.tradeSubjectId);
    if (heads.has(key)) throw new Error("Restore payload contains duplicate review heads.");
    heads.set(key, value);
  }
  return heads;
}

async function insertTemporaryReviewHead(
  database: SqlDatabase,
  table: SqliteArchiveTable,
  head: ReviewHeadRow,
  reviewVersionId: string,
): Promise<void> {
  const versionIndex = requiredColumnIndex(table, "review_version_id");
  const temporary = [...head.row];
  temporary[versionIndex] = reviewVersionId;
  await insertRow(database, table, temporary);
}

async function advanceReviewHead(
  database: SqlDatabase,
  head: ReviewHeadRow,
  reviewVersionId: string,
): Promise<void> {
  const result = await database.run(
    `UPDATE "trade_review_heads"
        SET "review_version_id" = ?, "changed_at_ms" = CAST(? AS INTEGER)
      WHERE "workspace_id" = ? AND "trade_subject_id" = ?`,
    [reviewVersionId, head.changedAtMs, head.workspaceId, head.tradeSubjectId],
  );
  if (result.changes !== 1) throw new Error("Restore could not advance one review head.");
}

async function restoreReviewChains(
  database: SqlDatabase,
  tables: readonly SqliteArchiveTable[],
): Promise<void> {
  const versionTable = sqliteRestoreTable(tables, "trade_review_versions");
  const headTable = sqliteRestoreTable(tables, "trade_review_heads");
  const versionsByKey = decodeReviewVersions(versionTable);
  const headsByKey = decodeReviewHeads(headTable);
  for (const key of headsByKey.keys()) {
    if (!versionsByKey.has(key)) {
      throw new Error("Restore payload contains a review head without review history.");
    }
  }
  for (const key of [...versionsByKey.keys()].sort()) {
    const versions = versionsByKey.get(key);
    if (versions === undefined || versions.length === 0) continue;
    const head = headsByKey.get(key);
    const first = versions[0];
    if (first === undefined) continue;
    await insertRow(database, versionTable, first.row);
    if (head === undefined) {
      throw new Error("A review history is missing its current head.");
    }
    const last = versions.at(-1);
    if (last === undefined || head.reviewVersionId !== last.id) {
      throw new Error("A review head does not point to its latest immutable version.");
    }
    if (versions.length === 1) {
      await insertRow(database, headTable, head.row);
      continue;
    }
    await insertTemporaryReviewHead(database, headTable, head, first.id);
    for (let index = 1; index < versions.length; index += 1) {
      const version = versions[index];
      if (version === undefined) throw new Error("A review chain is incomplete.");
      await insertRow(database, versionTable, version.row);
      await advanceReviewHead(database, head, version.id);
    }
  }
}

/**
 * Replays only a decoder-produced archive. Keeping the validated envelope in
 * the signature prevents structural table objects from becoming a SQL input.
 */
export async function restoreSqliteJournalTables(
  database: SqlDatabase,
  source: DecodedSqliteJournalRestoreArchive,
): Promise<void> {
  const tables = source.tables;
  for (const name of INSERT_ORDER) await insertTableRows(database, tables, name);
  await restoreReviewChains(database, tables);
  await insertTableRows(database, tables, "trade_review_term_assignments");
  await insertTableRows(database, tables, "trade_review_rule_results");
}

export async function assertSqliteRestoreDatabaseHealthy(
  database: SqlDatabase,
): Promise<void> {
  const foreignKeys = await database.query<SqlRow>("PRAGMA foreign_keys");
  if (foreignKeys.length !== 1 || foreignKeys[0]?.["foreign_keys"] !== 1) {
    throw new Error("SQLite foreign-key enforcement is unavailable during restore.");
  }
  const violations = await database.query<SqlRow>("PRAGMA foreign_key_check");
  if (violations.length !== 0) {
    throw new Error("The restored journal violates a foreign-key constraint.");
  }
  const integrity = await database.query<SqlRow>("PRAGMA quick_check");
  const values = integrity[0] === undefined ? [] : Object.values(integrity[0]);
  if (integrity.length !== 1 || values.length !== 1 || values[0] !== "ok") {
    throw new Error("SQLite could not verify the restored journal.");
  }
}
