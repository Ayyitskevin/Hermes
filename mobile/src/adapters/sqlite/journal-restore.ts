import {
  canonicalJournalArchiveJson,
  parseJournalArchive,
  type JournalArchiveJson,
  type JournalArchiveSource,
  type JournalArchiveSummary,
} from "../../application/journal-archive";
import { MOBILE_SCHEMA_MIGRATIONS, sha256Hex } from "./schema";
import {
  portableStateDigestInput,
  SQLITE_JOURNAL_ARCHIVE_PAYLOAD_KIND,
  SQLITE_JOURNAL_ARCHIVE_PAYLOAD_VERSION,
  SQLITE_JOURNAL_ARCHIVE_TABLES,
  SQLITE_JOURNAL_ARCHIVE_V1_COLUMN_SHA256,
  tableDigestInput,
  type SqliteArchiveColumn,
  type SqliteArchiveColumnType,
  type SqliteArchiveTable,
  type SqliteJournalArchiveTableName,
} from "./journal-archive";

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
const CANONICAL_SIGNED_INTEGER_PATTERN = /^(?:0|-?[1-9][0-9]*)$/;
const MIN_SQLITE_INTEGER = -9_223_372_036_854_775_808n;
const MAX_SQLITE_INTEGER = 9_223_372_036_854_775_807n;
const PRIMARY_WORKSPACE_ID = "workspace:primary";

export interface DecodedSqliteJournalRestoreArchive {
  readonly archiveSha256: string;
  readonly exportedAtUs: string;
  readonly source: JournalArchiveSource;
  readonly payloadKind: typeof SQLITE_JOURNAL_ARCHIVE_PAYLOAD_KIND;
  readonly payloadVersion: typeof SQLITE_JOURNAL_ARCHIVE_PAYLOAD_VERSION;
  readonly tableFormatVersion: 1;
  readonly tables: readonly SqliteArchiveTable[];
  /** Recomputed from the validated portable table set, never copied from the envelope. */
  readonly stateSha256: string;
  /**
   * The envelope's report claim. A restore trial must recompute and compare it
   * from the restored ledger before presenting a verified preview.
   */
  readonly claimedReportSha256: string;
  /** Recomputed from validated table rows and matched against the envelope. */
  readonly summary: JournalArchiveSummary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(label + " must be an object.");
  return value;
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(label + " has missing or unsupported fields.");
  }
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(label + " must be text.");
  return value;
}

function requireHash(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (!HASH_PATTERN.test(text)) throw new Error(label + " must be a lowercase SHA-256 digest.");
  return text;
}

function requireNonNegativeSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(label + " must be a non-negative safe integer.");
  }
  return value;
}

function requireCanonicalSqliteInteger(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (
    text.length > 20
    || !CANONICAL_SIGNED_INTEGER_PATTERN.test(text)
  ) {
    throw new Error(label + " must be a canonical signed SQLite integer.");
  }
  const integer = BigInt(text);
  if (integer < MIN_SQLITE_INTEGER || integer > MAX_SQLITE_INTEGER) {
    throw new Error(label + " is outside the signed SQLite 64-bit integer range.");
  }
  return text;
}

function asArchiveJson(value: unknown): JournalArchiveJson {
  return value as JournalArchiveJson;
}

function parseColumn(
  value: unknown,
  tableName: SqliteJournalArchiveTableName,
  index: number,
): SqliteArchiveColumn {
  const label = "SQLite restore table " + tableName + " column " + (index + 1);
  const record = requireRecord(value, label);
  assertExactKeys(record, [
    "name",
    "declaredType",
    "notNull",
    "primaryKeyPosition",
    "defaultSql",
    "hidden",
  ], label);
  const name = requireString(record.name, label + " name");
  if (!IDENTIFIER_PATTERN.test(name)) {
    throw new Error(label + " name is not a supported identifier.");
  }
  const declaredType = requireString(record.declaredType, label + " declared type");
  if (declaredType !== "INTEGER" && declaredType !== "TEXT") {
    throw new Error(label + " has an unsupported declared type.");
  }
  if (typeof record.notNull !== "boolean") {
    throw new Error(label + " nullability must be boolean.");
  }
  const primaryKeyPosition = requireNonNegativeSafeInteger(
    record.primaryKeyPosition,
    label + " primary-key position",
  );
  if (record.defaultSql !== null && typeof record.defaultSql !== "string") {
    throw new Error(label + " default SQL must be text or null.");
  }
  if (record.hidden !== 0) {
    throw new Error(label + " must not be generated or hidden.");
  }
  return Object.freeze({
    name,
    declaredType: declaredType as SqliteArchiveColumnType,
    notNull: record.notNull,
    primaryKeyPosition,
    defaultSql: record.defaultSql,
    hidden: 0 as const,
  });
}

function parseRow(
  value: unknown,
  tableName: SqliteJournalArchiveTableName,
  columns: readonly SqliteArchiveColumn[],
  index: number,
): readonly (string | null)[] {
  if (!Array.isArray(value) || value.length !== columns.length) {
    throw new Error(
      "SQLite restore table " + tableName + " row " + (index + 1)
      + " does not match its pinned column width.",
    );
  }
  return Object.freeze(value.map((cell, columnIndex) => {
    const column = columns[columnIndex];
    if (column === undefined) throw new Error("SQLite restore column lookup failed.");
    const label = "SQLite restore table " + tableName + " row " + (index + 1)
      + " column " + column.name;
    if (cell === null) {
      if (column.notNull || column.primaryKeyPosition > 0) {
        throw new Error(label + " cannot be null.");
      }
      return null;
    }
    if (column.declaredType === "INTEGER") {
      return requireCanonicalSqliteInteger(cell, label);
    }
    return requireString(cell, label);
  }));
}

function parseTable(
  value: unknown,
  expectedName: SqliteJournalArchiveTableName,
): SqliteArchiveTable {
  const label = "SQLite restore table " + expectedName;
  const record = requireRecord(value, label);
  assertExactKeys(record, [
    "name",
    "createSqlSha256",
    "columns",
    "rows",
    "rowCount",
    "tableSha256",
  ], label);
  if (record.name !== expectedName) {
    throw new Error(label + " is missing or out of canonical order.");
  }
  const createSqlSha256 = requireHash(record.createSqlSha256, label + " schema digest");
  if (!Array.isArray(record.columns) || record.columns.length === 0) {
    throw new Error(label + " columns must be a non-empty array.");
  }
  const columns = Object.freeze(
    record.columns.map((column, index) => parseColumn(column, expectedName, index)),
  );
  const names = new Set(columns.map((column) => column.name));
  if (names.size !== columns.length) {
    throw new Error(label + " contains duplicate column names.");
  }
  const actualColumnSha256 = sha256Hex(JSON.stringify(columns));
  const expectedColumnSha256 = SQLITE_JOURNAL_ARCHIVE_V1_COLUMN_SHA256[expectedName];
  if (actualColumnSha256 !== expectedColumnSha256) {
    throw new Error(label + " does not match the pinned export-v1 column manifest.");
  }
  if (!Array.isArray(record.rows)) throw new Error(label + " rows must be an array.");
  const rows = Object.freeze(
    record.rows.map((row, index) => parseRow(row, expectedName, columns, index)),
  );
  let previousRowJson: string | null = null;
  for (const row of rows) {
    const rowJson = canonicalJournalArchiveJson(asArchiveJson(row));
    if (previousRowJson !== null && previousRowJson >= rowJson) {
      throw new Error(label + " rows are not in strict canonical order.");
    }
    previousRowJson = rowJson;
  }
  const primaryKeyColumns = columns
    .map((column, index) => ({ index, position: column.primaryKeyPosition }))
    .filter((column) => column.position > 0)
    .sort((left, right) => left.position - right.position);
  if (primaryKeyColumns.length > 0) {
    const primaryKeys = new Set<string>();
    for (const row of rows) {
      const key = canonicalJournalArchiveJson(asArchiveJson(
        primaryKeyColumns.map((column) => row[column.index] ?? null),
      ));
      if (primaryKeys.has(key)) {
        throw new Error(label + " contains duplicate primary-key values.");
      }
      primaryKeys.add(key);
    }
  }

  const rowCount = requireString(record.rowCount, label + " row count");
  if (rowCount !== String(rows.length)) {
    throw new Error(label + " row count does not match its rows.");
  }
  const tableSha256 = requireHash(record.tableSha256, label + " digest");
  const withoutDigest = Object.freeze({
    name: expectedName,
    createSqlSha256,
    columns,
    rows,
    rowCount,
  });
  const expectedTableSha256 = sha256Hex(
    canonicalJournalArchiveJson(tableDigestInput(withoutDigest)),
  );
  if (tableSha256 !== expectedTableSha256) {
    throw new Error(label + " digest does not match its contents.");
  }
  return Object.freeze({ ...withoutDigest, tableSha256 });
}

function assertCurrentMigrationSource(source: JournalArchiveSource): void {
  const current = MOBILE_SCHEMA_MIGRATIONS.at(-1);
  if (
    current === undefined
    || source.schemaUserVersion !== current.toVersion
    || source.migrations.length !== MOBILE_SCHEMA_MIGRATIONS.length
  ) {
    throw new Error("SQLite restore migration source is not supported by this app build.");
  }
  source.migrations.forEach((migration, index) => {
    const expected = MOBILE_SCHEMA_MIGRATIONS[index];
    if (
      expected === undefined
      || migration.version !== expected.toVersion
      || migration.name !== expected.name
      || migration.checksumSha256 !== expected.checksumSha256
    ) {
      throw new Error("SQLite restore migration source does not match this app build.");
    }
  });
}

function columnIndex(table: SqliteArchiveTable, columnName: string): number {
  const index = table.columns.findIndex((column) => column.name === columnName);
  if (index < 0) {
    throw new Error("Pinned SQLite restore table " + table.name + " lost column " + columnName + ".");
  }
  return index;
}

function cell(
  table: SqliteArchiveTable,
  row: readonly (string | null)[],
  columnName: string,
): string | null {
  return row[columnIndex(table, columnName)] ?? null;
}

function textCell(
  table: SqliteArchiveTable,
  row: readonly (string | null)[],
  columnName: string,
): string {
  const value = cell(table, row, columnName);
  if (value === null) {
    throw new Error("SQLite restore table " + table.name + "." + columnName + " is null.");
  }
  return value;
}

function indexUniqueRows(
  table: SqliteArchiveTable,
  columnName: string,
): ReadonlyMap<string, readonly (string | null)[]> {
  const indexed = new Map<string, readonly (string | null)[]>();
  for (const row of table.rows) {
    const key = textCell(table, row, columnName);
    if (indexed.has(key)) {
      throw new Error("SQLite restore table " + table.name + " contains duplicate " + columnName + ".");
    }
    indexed.set(key, row);
  }
  return indexed;
}

function assertMigrationTable(
  tables: readonly SqliteArchiveTable[],
  source: JournalArchiveSource,
): void {
  const table = tables[0];
  if (table === undefined || table.name !== "schema_migrations") {
    throw new Error("SQLite restore migration table is missing.");
  }
  if (table.rows.length !== source.migrations.length) {
    throw new Error("SQLite restore migration table is incomplete.");
  }
  table.rows.forEach((row, index) => {
    const expected = source.migrations[index];
    if (
      expected === undefined
      || textCell(table, row, "version") !== String(expected.version)
      || textCell(table, row, "name") !== expected.name
      || textCell(table, row, "checksum_sha256") !== expected.checksumSha256
    ) {
      throw new Error("SQLite restore migration table does not match its source.");
    }
  });
}

function tableByName(
  tables: readonly SqliteArchiveTable[],
  name: SqliteJournalArchiveTableName,
): SqliteArchiveTable {
  const index = SQLITE_JOURNAL_ARCHIVE_TABLES.indexOf(name);
  const table = tables[index];
  if (table === undefined || table.name !== name) {
    throw new Error("SQLite restore table " + name + " is missing.");
  }
  return table;
}

function assertSingleWorkspaceContract(
  tables: readonly SqliteArchiveTable[],
): void {
  const workspaces = tableByName(tables, "workspaces");
  if (workspaces.rows.length > 1) {
    throw new Error("SQLite restore supports only the primary journal workspace.");
  }
  const workspace = workspaces.rows[0];
  if (
    workspace !== undefined
    && (
      textCell(workspaces, workspace, "id") !== PRIMARY_WORKSPACE_ID
      || cell(workspaces, workspace, "archived_at_ms") !== null
    )
  ) {
    throw new Error("SQLite restore supports only the active primary journal workspace.");
  }
  const expectedWorkspaceId = workspace === undefined ? null : PRIMARY_WORKSPACE_ID;
  for (const table of tables) {
    const workspaceIndex = table.columns.findIndex((column) => column.name === "workspace_id");
    if (workspaceIndex < 0) continue;
    for (const row of table.rows) {
      if (expectedWorkspaceId === null || row[workspaceIndex] !== expectedWorkspaceId) {
        throw new Error(
          "SQLite restore contains data outside the supported primary journal workspace.",
        );
      }
    }
  }
}

interface ExecutionVersionChainRow {
  readonly id: string;
  readonly workspaceId: string;
  readonly version: bigint;
}

function assertExecutionVersionChains(
  tables: readonly SqliteArchiveTable[],
): void {
  const executions = tableByName(tables, "executions");
  const versions = tableByName(tables, "execution_versions");
  const heads = tableByName(tables, "execution_heads");
  const executionById = indexUniqueRows(executions, "id");
  const versionsByExecution = new Map<string, ExecutionVersionChainRow[]>();
  for (const row of versions.rows) {
    const executionId = textCell(versions, row, "execution_id");
    const execution = executionById.get(executionId);
    if (execution === undefined) {
      throw new Error("SQLite restore contains an execution version without an execution.");
    }
    const workspaceId = textCell(versions, row, "workspace_id");
    if (workspaceId !== textCell(executions, execution, "workspace_id")) {
      throw new Error("SQLite restore execution history crosses journal ownership.");
    }
    const values = versionsByExecution.get(executionId) ?? [];
    values.push({
      id: textCell(versions, row, "id"),
      workspaceId,
      version: BigInt(textCell(versions, row, "version_number")),
    });
    versionsByExecution.set(executionId, values);
  }

  const headByExecution = indexUniqueRows(heads, "execution_id");
  for (const [executionId, head] of headByExecution) {
    const execution = executionById.get(executionId);
    if (execution === undefined) {
      throw new Error("SQLite restore contains an execution head without an execution.");
    }
    if (
      textCell(heads, head, "workspace_id")
      !== textCell(executions, execution, "workspace_id")
    ) {
      throw new Error("SQLite restore execution head crosses journal ownership.");
    }
  }

  for (const [executionId] of executionById) {
    const chain = versionsByExecution.get(executionId);
    const head = headByExecution.get(executionId);
    if (chain === undefined || chain.length === 0 || head === undefined) {
      throw new Error("Every SQLite restore execution must have exactly one current version head.");
    }
    chain.sort((left, right) => (
      left.version < right.version ? -1 : left.version > right.version ? 1 : 0
    ));
    chain.forEach((version, index) => {
      if (version.version !== BigInt(index + 1)) {
        throw new Error("SQLite restore execution versions must form one contiguous history.");
      }
    });
    const latest = chain.at(-1);
    if (
      latest === undefined
      || textCell(heads, head, "execution_version_id") !== latest.id
      || textCell(heads, head, "workspace_id") !== latest.workspaceId
    ) {
      throw new Error("SQLite restore execution head must point to the latest immutable version.");
    }
  }
}

interface ReviewVersionChainRow {
  readonly id: string;
  readonly version: bigint;
  readonly supersedesId: string | null;
}

function reviewChainKey(workspaceId: string, tradeSubjectId: string): string {
  return JSON.stringify([workspaceId, tradeSubjectId]);
}

function assertReviewVersionChains(
  tables: readonly SqliteArchiveTable[],
): void {
  const versions = tableByName(tables, "trade_review_versions");
  const heads = tableByName(tables, "trade_review_heads");
  const versionsByKey = new Map<string, ReviewVersionChainRow[]>();
  for (const row of versions.rows) {
    const key = reviewChainKey(
      textCell(versions, row, "workspace_id"),
      textCell(versions, row, "trade_subject_id"),
    );
    const values = versionsByKey.get(key) ?? [];
    values.push({
      id: textCell(versions, row, "id"),
      version: BigInt(textCell(versions, row, "version_number")),
      supersedesId: cell(versions, row, "supersedes_version_id"),
    });
    versionsByKey.set(key, values);
  }

  const headByKey = new Map<string, readonly (string | null)[]>();
  for (const row of heads.rows) {
    const key = reviewChainKey(
      textCell(heads, row, "workspace_id"),
      textCell(heads, row, "trade_subject_id"),
    );
    if (headByKey.has(key)) {
      throw new Error("SQLite restore contains duplicate trade review heads.");
    }
    headByKey.set(key, row);
  }
  for (const key of headByKey.keys()) {
    if (!versionsByKey.has(key)) {
      throw new Error("SQLite restore contains a trade review head without immutable history.");
    }
  }
  for (const [key, chain] of versionsByKey) {
    const head = headByKey.get(key);
    if (head === undefined) {
      throw new Error("Every SQLite restore review history must have exactly one current head.");
    }
    chain.sort((left, right) => (
      left.version < right.version ? -1 : left.version > right.version ? 1 : 0
    ));
    chain.forEach((version, index) => {
      const previous = index === 0 ? null : chain[index - 1]?.id ?? null;
      if (
        version.version !== BigInt(index + 1)
        || version.supersedesId !== previous
      ) {
        throw new Error("SQLite restore review versions must form one contiguous immutable chain.");
      }
    });
    const latest = chain.at(-1);
    if (
      latest === undefined
      || textCell(heads, head, "review_version_id") !== latest.id
    ) {
      throw new Error("SQLite restore review head must point to the latest immutable version.");
    }
  }
}


function recomputeSummary(
  tables: readonly SqliteArchiveTable[],
): JournalArchiveSummary {
  const workspaces = tableByName(tables, "workspaces");
  const activeWorkspaceRows = workspaces.rows.filter(
    (row) => cell(workspaces, row, "archived_at_ms") === null,
  );
  if (activeWorkspaceRows.length > 1) {
    throw new Error("SQLite restore contains more than one active journal workspace.");
  }
  const activeWorkspace = activeWorkspaceRows[0];
  const workspaceId = activeWorkspace === undefined
    ? null
    : textCell(workspaces, activeWorkspace, "id");

  const accounts = tableByName(tables, "accounts");
  const activeAccounts = workspaceId === null
    ? 0
    : accounts.rows.filter((row) => (
      textCell(accounts, row, "workspace_id") === workspaceId
      && cell(accounts, row, "archived_at_ms") === null
    )).length;

  const executions = tableByName(tables, "executions");
  const executionVersions = tableByName(tables, "execution_versions");
  const executionHeads = tableByName(tables, "execution_heads");
  const executionById = indexUniqueRows(executions, "id");
  const executionVersionById = indexUniqueRows(executionVersions, "id");
  let activeExecutions = 0;
  for (const head of executionHeads.rows) {
    const executionId = textCell(executionHeads, head, "execution_id");
    const versionId = textCell(executionHeads, head, "execution_version_id");
    const execution = executionById.get(executionId);
    const version = executionVersionById.get(versionId);
    if (execution === undefined || version === undefined) {
      throw new Error("SQLite restore execution head has missing immutable facts.");
    }
    if (
      textCell(executionVersions, version, "execution_id") !== executionId
      || textCell(executionHeads, head, "workspace_id")
        !== textCell(executions, execution, "workspace_id")
    ) {
      throw new Error("SQLite restore execution head crosses journal ownership.");
    }
    const isVoid = textCell(executionVersions, version, "is_void");
    if (isVoid !== "0" && isVoid !== "1") {
      throw new Error("SQLite restore execution version has invalid void state.");
    }
    if (
      workspaceId !== null
      && textCell(executions, execution, "workspace_id") === workspaceId
      && isVoid === "0"
    ) {
      activeExecutions += 1;
    }
  }

  const reviewVersions = tableByName(tables, "trade_review_versions");
  const reviewHeads = tableByName(tables, "trade_review_heads");
  const reviewVersionById = indexUniqueRows(reviewVersions, "id");
  let currentReviews = 0;
  for (const head of reviewHeads.rows) {
    const reviewId = textCell(reviewHeads, head, "review_version_id");
    const review = reviewVersionById.get(reviewId);
    if (review === undefined) {
      throw new Error("SQLite restore review head has no immutable version.");
    }
    const headWorkspaceId = textCell(reviewHeads, head, "workspace_id");
    if (
      textCell(reviewVersions, review, "workspace_id") !== headWorkspaceId
      || textCell(reviewVersions, review, "trade_subject_id")
        !== textCell(reviewHeads, head, "trade_subject_id")
    ) {
      throw new Error("SQLite restore review head crosses journal ownership.");
    }
    if (workspaceId !== null && headWorkspaceId === workspaceId) currentReviews += 1;
  }

  return Object.freeze({
    workspaceName: activeWorkspace === undefined
      ? null
      : textCell(workspaces, activeWorkspace, "name"),
    currency: activeWorkspace === undefined
      ? null
      : textCell(workspaces, activeWorkspace, "default_currency_code"),
    timeZone: activeWorkspace === undefined
      ? null
      : textCell(workspaces, activeWorkspace, "time_zone_id"),
    accounts: String(activeAccounts),
    activeExecutions: String(activeExecutions),
    executionVersions: tableByName(tables, "execution_versions").rowCount,
    importReceipts: tableByName(tables, "import_receipts").rowCount,
    rolledBackImports: tableByName(tables, "import_rollbacks").rowCount,
    currentReviews: String(currentReviews),
    reviewVersions: tableByName(tables, "trade_review_versions").rowCount,
    reviewTerms: tableByName(tables, "review_terms").rowCount,
    playbooks: tableByName(tables, "playbooks").rowCount,
    attachments: "0",
    attachmentBytes: "0",
  });
}

function summaryJson(summary: JournalArchiveSummary): string {
  return canonicalJournalArchiveJson(asArchiveJson(summary));
}

/**
 * Decodes only native SQLite archive payload v1. The generic envelope parser
 * runs first; every payload identifier, table, column, row, and digest is then
 * independently checked against this app build's trusted export contract.
 */
export function decodeSqliteJournalRestoreArchive(
  rawInput: string,
): DecodedSqliteJournalRestoreArchive {
  const archive = parseJournalArchive(rawInput);
  if (
    archive.payload.kind !== SQLITE_JOURNAL_ARCHIVE_PAYLOAD_KIND
    || archive.payload.version !== SQLITE_JOURNAL_ARCHIVE_PAYLOAD_VERSION
  ) {
    throw new Error("This archive does not contain a supported native SQLite journal payload.");
  }
  assertCurrentMigrationSource(archive.source);
  const data = requireRecord(archive.payload.data, "SQLite restore payload data");
  assertExactKeys(data, ["tableFormatVersion", "tables"], "SQLite restore payload data");
  if (data.tableFormatVersion !== 1) {
    throw new Error("SQLite restore table format version is not supported.");
  }
  const payloadTables = data.tables;
  if (
    !Array.isArray(payloadTables)
    || payloadTables.length !== SQLITE_JOURNAL_ARCHIVE_TABLES.length
  ) {
    throw new Error("SQLite restore payload must contain every pinned table exactly once.");
  }
  const tables = Object.freeze(SQLITE_JOURNAL_ARCHIVE_TABLES.map((tableName, index) => (
    parseTable(payloadTables[index], tableName)
  )));
  assertMigrationTable(tables, archive.source);
  assertSingleWorkspaceContract(tables);
  assertExecutionVersionChains(tables);
  assertReviewVersionChains(tables);

  const stateSha256 = sha256Hex(
    canonicalJournalArchiveJson(portableStateDigestInput(tables)),
  );
  if (stateSha256 !== archive.stateSha256) {
    throw new Error("SQLite restore state digest does not match its validated tables.");
  }
  const summary = recomputeSummary(tables);
  if (summaryJson(summary) !== summaryJson(archive.summary)) {
    throw new Error("SQLite restore summary does not match its validated tables.");
  }
  return Object.freeze({
    archiveSha256: archive.archiveSha256,
    exportedAtUs: archive.exportedAtUs,
    source: archive.source,
    payloadKind: SQLITE_JOURNAL_ARCHIVE_PAYLOAD_KIND,
    payloadVersion: SQLITE_JOURNAL_ARCHIVE_PAYLOAD_VERSION,
    tableFormatVersion: 1 as const,
    tables,
    stateSha256,
    claimedReportSha256: archive.reportSha256,
    summary,
  });
}

export function sqliteRestoreArchiveTable(
  archive: DecodedSqliteJournalRestoreArchive,
  name: SqliteJournalArchiveTableName,
): SqliteArchiveTable {
  return tableByName(archive.tables, name);
}
