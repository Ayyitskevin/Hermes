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
  SQLITE_JOURNAL_ARCHIVE_LEGACY_PAYLOAD_VERSION,
  SQLITE_JOURNAL_ARCHIVE_PAYLOAD_KIND,
  SQLITE_JOURNAL_ARCHIVE_PAYLOAD_VERSION,
  SQLITE_JOURNAL_ARCHIVE_TABLES,
  SQLITE_JOURNAL_ARCHIVE_V1_COLUMN_SHA256,
  SQLITE_JOURNAL_ARCHIVE_V1_TABLES,
  SQLITE_JOURNAL_ARCHIVE_V2_COLUMN_SHA256,
  tableDigestInput,
  type SqliteArchiveColumn,
  type SqliteArchiveColumnType,
  type SqliteArchiveTable,
  type SqliteJournalArchiveTableName,
  type SqliteJournalArchiveV1TableName,
} from "./journal-archive";
import {
  prepareDailyJournalEntry,
  validateDailyJournalIdentifier,
} from "../../application/prepare-daily-journal";
import { preparePlaybookDefinition } from "../../application/prepare-playbook-definition";
import {
  PERCENT_RETURN_METRIC_ID,
  PERCENT_RETURN_METRIC_VERSION,
  prepareTradeReview,
  RESULT_R_METRIC_ID,
  RESULT_R_METRIC_VERSION,
  type TradeReviewRuleOutcome,
} from "../../application/prepare-trade-review";

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9_]*$/;
const CANONICAL_SIGNED_INTEGER_PATTERN = /^(?:0|-?[1-9][0-9]*)$/;
const MIN_SQLITE_INTEGER = -9_223_372_036_854_775_808n;
const MAX_SQLITE_INTEGER = 9_223_372_036_854_775_807n;
const PRIMARY_WORKSPACE_ID = "workspace:primary";
const LEGACY_SCHEMA_USER_VERSION = 4;

export interface DecodedSqliteJournalRestoreArchive {
  readonly archiveSha256: string;
  readonly exportedAtUs: string;
  readonly source: JournalArchiveSource;
  readonly payloadKind: typeof SQLITE_JOURNAL_ARCHIVE_PAYLOAD_KIND;
  readonly payloadVersion: typeof SQLITE_JOURNAL_ARCHIVE_LEGACY_PAYLOAD_VERSION
    | typeof SQLITE_JOURNAL_ARCHIVE_PAYLOAD_VERSION;
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

function canonicalReviewTermName(value: string): string {
  const canonical = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    canonical.length === 0
    || value !== canonical
    || [...canonical].length > 120
    || [...canonical.toLocaleLowerCase("en-US")].length > 120
    || /[\u0000-\u001f\u007f-\u009f]/u.test(canonical)
  ) {
    throw new Error(
      "SQLite restore review-term names must be canonical single-line text of at most 120 characters.",
    );
  }
  return canonical;
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
  expectedColumnSha256: string,
  payloadVersion: number,
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
  if (actualColumnSha256 !== expectedColumnSha256) {
    throw new Error(
      label + " does not match the pinned payload-v" + payloadVersion + " column manifest.",
    );
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

function assertSupportedMigrationSource(
  source: JournalArchiveSource,
  payloadVersion: number,
): void {
  const expectedMigrations = payloadVersion === SQLITE_JOURNAL_ARCHIVE_LEGACY_PAYLOAD_VERSION
    ? MOBILE_SCHEMA_MIGRATIONS.filter(
        (migration) => migration.toVersion <= LEGACY_SCHEMA_USER_VERSION,
      )
    : MOBILE_SCHEMA_MIGRATIONS;
  const current = expectedMigrations.at(-1);
  if (
    current === undefined
    || source.schemaUserVersion !== current.toVersion
    || source.migrations.length !== expectedMigrations.length
  ) {
    throw new Error("SQLite restore migration source is not supported by this app build.");
  }
  source.migrations.forEach((migration, index) => {
    const expected = expectedMigrations[index];
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
function upgradeLegacyMigrationTable(
  tables: readonly SqliteArchiveTable[],
): readonly SqliteArchiveTable[] {
  const table = tables[0];
  const migration = MOBILE_SCHEMA_MIGRATIONS.find(
    (candidate) => candidate.toVersion === LEGACY_SCHEMA_USER_VERSION + 1,
  );
  if (table === undefined || table.name !== "schema_migrations" || migration === undefined) {
    throw new Error("SQLite restore cannot upgrade the legacy migration baseline.");
  }
  const migrationRow = Object.freeze(table.columns.map((column): string | null => {
    if (column.name === "version") return String(migration.toVersion);
    if (column.name === "name") return migration.name;
    if (column.name === "checksum_sha256") return migration.checksumSha256;
    if (column.name === "applied_at_ms") return "0";
    throw new Error("SQLite restore migration table has an unsupported column.");
  }));
  const rows = Object.freeze([...table.rows, migrationRow].sort((left, right) => {
    const leftJson = canonicalJournalArchiveJson(asArchiveJson(left));
    const rightJson = canonicalJournalArchiveJson(asArchiveJson(right));
    return leftJson < rightJson ? -1 : leftJson > rightJson ? 1 : 0;
  }));
  const withoutDigest = Object.freeze({
    name: table.name,
    createSqlSha256: table.createSqlSha256,
    columns: table.columns,
    rows,
    rowCount: String(rows.length),
  });
  const upgraded = Object.freeze({
    ...withoutDigest,
    tableSha256: sha256Hex(canonicalJournalArchiveJson(tableDigestInput(withoutDigest))),
  });
  return Object.freeze([upgraded, ...tables.slice(1)]);
}

function optionalTableByName(
  tables: readonly SqliteArchiveTable[],
  name: SqliteJournalArchiveTableName,
): SqliteArchiveTable | undefined {
  return tables.find((table) => table.name === name);
}

function tableByName(
  tables: readonly SqliteArchiveTable[],
  name: SqliteJournalArchiveTableName,
): SqliteArchiveTable {
  const table = optionalTableByName(tables, name);
  if (table === undefined) {
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

interface PlaybookDefinitionVersionFact {
  readonly id: string;
  readonly row: readonly (string | null)[];
  readonly workspaceId: string;
  readonly playbookId: string;
  readonly version: bigint;
  readonly supersedesId: string | null;
  readonly action: string;
  readonly state: string;
  readonly name: string;
  readonly normalizedName: string;
}

interface LinkedReviewPlaybookSnapshot {
  readonly definitionId: string;
  readonly definitionVersionId: string;
  readonly definitionRevision: string;
  readonly name: string;
  readonly rules: readonly string[];
}

function assertPlaybookDefinitionChains(
  tables: readonly SqliteArchiveTable[],
): ReadonlyMap<string, LinkedReviewPlaybookSnapshot> {
  const linkedReviewSnapshots = new Map<string, LinkedReviewPlaybookSnapshot>();
  const definitions = optionalTableByName(tables, "playbook_definitions");
  if (definitions === undefined) return linkedReviewSnapshots;
  const versions = tableByName(tables, "playbook_definition_versions");
  const rules = tableByName(tables, "playbook_definition_rules");
  const heads = tableByName(tables, "playbook_definition_heads");
  const links = tableByName(tables, "trade_review_playbook_definition_links");
  const definitionById = indexUniqueRows(definitions, "id");
  const versionById = new Map<string, PlaybookDefinitionVersionFact>();
  const versionsByPlaybook = new Map<string, PlaybookDefinitionVersionFact[]>();
  for (const row of versions.rows) {
    const playbookId = textCell(versions, row, "playbook_id");
    const identity = definitionById.get(playbookId);
    const workspaceId = textCell(versions, row, "workspace_id");
    if (
      identity === undefined
      || textCell(definitions, identity, "workspace_id") !== workspaceId
    ) {
      throw new Error("SQLite restore contains an orphaned playbook definition version.");
    }
    const fact: PlaybookDefinitionVersionFact = {
      id: textCell(versions, row, "id"),
      row,
      workspaceId,
      playbookId,
      version: BigInt(textCell(versions, row, "version_number")),
      supersedesId: cell(versions, row, "supersedes_version_id"),
      action: textCell(versions, row, "action"),
      state: textCell(versions, row, "state"),
      name: textCell(versions, row, "name_snapshot"),
      normalizedName: textCell(versions, row, "normalized_name"),
    };
    versionById.set(fact.id, fact);
    const chain = versionsByPlaybook.get(playbookId) ?? [];
    chain.push(fact);
    versionsByPlaybook.set(playbookId, chain);
  }

  const rulesByVersion = new Map<
    string,
    { readonly ordinal: bigint; readonly text: string; readonly normalizedText: string }[]
  >();
  for (const row of rules.rows) {
    const versionId = textCell(rules, row, "definition_version_id");
    const version = versionById.get(versionId);
    if (
      version === undefined
      || textCell(rules, row, "workspace_id") !== version.workspaceId
      || textCell(rules, row, "playbook_id") !== version.playbookId
    ) {
      throw new Error("SQLite restore contains an orphaned playbook definition rule.");
    }
    const values = rulesByVersion.get(versionId) ?? [];
    values.push({
      ordinal: BigInt(textCell(rules, row, "ordinal")),
      text: textCell(rules, row, "rule_text_snapshot"),
      normalizedText: textCell(rules, row, "normalized_rule_text"),
    });
    rulesByVersion.set(versionId, values);
  }

  const orderedRulesForVersion = (versionId: string) => {
    const ordered = [...(rulesByVersion.get(versionId) ?? [])].sort((left, right) => (
      left.ordinal < right.ordinal ? -1 : left.ordinal > right.ordinal ? 1 : 0
    ));
    ordered.forEach((rule, index) => {
      if (rule.ordinal !== BigInt(index)) {
        throw new Error("SQLite restore playbook definition rules must be contiguous.");
      }
    });
    return ordered;
  };

  const headByPlaybook = indexUniqueRows(heads, "playbook_id");
  for (const [playbookId, identity] of definitionById) {
    const chain = versionsByPlaybook.get(playbookId);
    const head = headByPlaybook.get(playbookId);
    if (chain === undefined || chain.length === 0 || head === undefined) {
      throw new Error("Every SQLite restore playbook definition needs one current head.");
    }
    chain.sort((left, right) => (
      left.version < right.version ? -1 : left.version > right.version ? 1 : 0
    ));
    chain.forEach((version, index) => {
      const orderedRules = orderedRulesForVersion(version.id);
      const previous = index === 0 ? undefined : chain[index - 1];
      const previousRules = previous === undefined ? [] : orderedRulesForVersion(previous.id);
      const validTransition = index === 0
        ? version.action === "create"
          && version.state === "active"
          && version.supersedesId === null
          && textCell(versions, version.row, "submission_id")
            === textCell(definitions, identity, "create_submission_id")
        : previous !== undefined
          && version.supersedesId === previous.id
          && (
            (version.action === "edit"
              && previous.state === "active" && version.state === "active")
            || (version.action === "archive"
              && previous.state === "active" && version.state === "archived")
            || (version.action === "restore"
              && previous.state === "archived" && version.state === "active")
          );
      const preservesLifecycleSnapshot = (
        version.action !== "archive" && version.action !== "restore"
      ) || (
        previous !== undefined
        && version.name === previous.name
        && orderedRules.length === previousRules.length
        && orderedRules.every((rule, ruleIndex) => rule.text === previousRules[ruleIndex]?.text)
      );
      if (version.version !== BigInt(index + 1) || !validTransition || !preservesLifecycleSnapshot) {
        throw new Error(
          "SQLite restore playbook definition versions must form one valid lifecycle chain.",
        );
      }
      let prepared: ReturnType<typeof preparePlaybookDefinition>;
      try {
        const submissionId = textCell(versions, version.row, "submission_id");
        const authoredRules = orderedRules.map((rule) => rule.text);
        if (version.action === "create") {
          prepared = preparePlaybookDefinition({
            submissionId,
            action: "create",
            playbookId: null,
            expectedPreviousVersionId: null,
            name: version.name,
            rules: authoredRules,
          });
        } else if (
          version.action === "edit"
          || version.action === "archive"
          || version.action === "restore"
        ) {
          if (version.supersedesId === null) {
            throw new Error("A revised playbook definition has no predecessor.");
          }
          prepared = preparePlaybookDefinition({
            submissionId,
            action: version.action,
            playbookId: version.playbookId,
            expectedPreviousVersionId: version.supersedesId,
            name: version.name,
            rules: authoredRules,
          });
        } else {
          throw new Error("The playbook definition action is unsupported.");
        }
      } catch (error) {
        throw new Error(
          "SQLite restore playbook definition content violates the authoring contract.",
          { cause: error },
        );
      }
      if (
        prepared.playbookId !== version.playbookId
        || prepared.versionId !== version.id
        || prepared.revision !== textCell(versions, version.row, "revision_sha256")
        || prepared.name !== version.name
        || prepared.normalizedName !== version.normalizedName
        || prepared.state !== version.state
        || prepared.rules.length !== orderedRules.length
        || prepared.rules.some((rule, ruleIndex) => (
          rule.ordinal !== Number(orderedRules[ruleIndex]?.ordinal)
          || rule.text !== orderedRules[ruleIndex]?.text
          || rule.normalizedText !== orderedRules[ruleIndex]?.normalizedText
        ))
      ) {
        throw new Error(
          "SQLite restore playbook definition revision does not bind its exact normalized content.",
        );
      }
    });
    const latest = chain.at(-1);
    if (
      latest === undefined
      || textCell(heads, head, "workspace_id") !== latest.workspaceId
      || textCell(heads, head, "definition_version_id") !== latest.id
      || textCell(heads, head, "normalized_current_name") !== latest.normalizedName
      || textCell(heads, head, "current_state") !== latest.state
    ) {
      throw new Error("SQLite restore playbook definition head must point to its latest version.");
    }
  }
  for (const playbookId of headByPlaybook.keys()) {
    if (!definitionById.has(playbookId)) {
      throw new Error("SQLite restore contains an orphaned playbook definition head.");
    }
  }

  const reviewVersions = tableByName(tables, "trade_review_versions");
  const reviewById = indexUniqueRows(reviewVersions, "id");
  const reviewPlaybooks = tableByName(tables, "playbooks");
  const reviewPlaybookById = indexUniqueRows(reviewPlaybooks, "id");
  const reviewRules = tableByName(tables, "playbook_rules");
  const reviewRuleById = indexUniqueRows(reviewRules, "id");
  const results = tableByName(tables, "trade_review_rule_results");
  const resultsByReview = new Map<
    string, (readonly (string | null)[])[]
  >();
  for (const row of results.rows) {
    const reviewId = textCell(results, row, "review_version_id");
    const values = resultsByReview.get(reviewId) ?? [];
    values.push(row);
    resultsByReview.set(reviewId, values);
  }
  for (const row of links.rows) {
    const reviewId = textCell(links, row, "review_version_id");
    const review = reviewById.get(reviewId);
    const version = versionById.get(textCell(links, row, "definition_version_id"));
    const playbookId = textCell(links, row, "playbook_id");
    const reviewPlaybookId = review === undefined
      ? null
      : cell(reviewVersions, review, "playbook_id");
    const reviewPlaybook = reviewPlaybookId === null
      ? undefined
      : reviewPlaybookById.get(reviewPlaybookId);
    if (
      linkedReviewSnapshots.has(reviewId)
    ) {
      throw new Error("SQLite restore contains duplicate playbook definition review links.");
    }
    if (
      review === undefined
      || version === undefined
      || version.playbookId !== playbookId
      || textCell(links, row, "workspace_id") !== version.workspaceId
      || textCell(links, row, "workspace_id")
        !== textCell(reviewVersions, review, "workspace_id")
      || textCell(links, row, "trade_subject_id")
        !== textCell(reviewVersions, review, "trade_subject_id")
      || textCell(links, row, "revision_sha256")
        !== textCell(versions, version.row, "revision_sha256")
      || reviewPlaybook === undefined
      || textCell(reviewPlaybooks, reviewPlaybook, "normalized_name")
        !== version.normalizedName
    ) {
      throw new Error("SQLite restore contains an inexact playbook definition review link.");
    }
    const definitionRules = orderedRulesForVersion(version.id);
    const reviewResults = [...(resultsByReview.get(reviewId) ?? [])].sort((left, right) => (
      BigInt(textCell(results, left, "ordinal")) < BigInt(textCell(results, right, "ordinal"))
        ? -1
        : 1
    ));
    if (reviewResults.length !== definitionRules.length) {
      throw new Error("SQLite restore playbook definition link has a different rule count.");
    }
    definitionRules.forEach((definitionRule, index) => {
      const result = reviewResults[index];
      const reviewRule = result === undefined
        ? undefined
        : reviewRuleById.get(textCell(results, result, "playbook_rule_id"));
      if (
        result === undefined
        || BigInt(textCell(results, result, "ordinal")) !== definitionRule.ordinal
        || reviewRule === undefined
        || textCell(reviewRules, reviewRule, "normalized_rule_text")
          !== definitionRule.normalizedText
      ) {
        throw new Error(
          "SQLite restore playbook definition link rules do not share normalized identity.",
        );
      }
    });
    linkedReviewSnapshots.set(reviewId, {
      definitionId: version.playbookId,
      definitionVersionId: version.id,
      definitionRevision: textCell(versions, version.row, "revision_sha256"),
      name: version.name,
      rules: definitionRules.map((rule) => rule.text),
    });
  }
  return linkedReviewSnapshots;
}

interface ReviewTermFact {
  readonly ordinal: bigint;
  readonly name: string;
}

interface ReviewRuleFact {
  readonly ordinal: bigint;
  readonly name: string;
  readonly normalizedName: string;
  readonly outcome: TradeReviewRuleOutcome;
}

function reviewVocabularyIdentity(
  value: string,
  label: string,
  characterLimit: number,
): string {
  const canonical = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    canonical.length === 0
    || canonical !== value
    || [...canonical].length > characterLimit
    || [...canonical.toLocaleLowerCase("en-US")].length > characterLimit
    || /[\u0000-\u001f\u007f-\u009f]/u.test(canonical)
  ) {
    throw new Error(
      `SQLite restore ${label} must be canonical single-line text of at most ${characterLimit} characters.`,
    );
  }
  return canonical.toLocaleLowerCase("en-US");
}

function legacyTradeReviewRevision(
  review: ReturnType<typeof prepareTradeReview>,
): string {
  return sha256Hex(JSON.stringify([
    "hermes-trade-review-v1",
    review.submissionId,
    review.tradeSubjectId,
    review.expectedPreviousReviewId,
    review.state,
    review.note,
    review.setup === null ? null : review.setup.toLocaleLowerCase("en-US"),
    review.mistakes.map((value) => value.toLocaleLowerCase("en-US")),
    review.tags.map((value) => value.toLocaleLowerCase("en-US")),
    review.emotion === null ? null : review.emotion.toLocaleLowerCase("en-US"),
    review.playbook === null
      ? null
      : [
          review.playbook.name.toLocaleLowerCase("en-US"),
          review.playbook.rules.map((rule) => [
            rule.name.toLocaleLowerCase("en-US"),
            rule.outcome,
          ]),
        ],
    review.initialRisk === null
      ? null
      : [review.initialRisk.amount, review.initialRisk.currency],
    review.plannedStop,
    [RESULT_R_METRIC_ID, review.resultRVersion],
    [PERCENT_RETURN_METRIC_ID, review.percentReturnVersion],
  ]));
}

function assertTradeReviewRevisions(
  tables: readonly SqliteArchiveTable[],
  linkedReviewSnapshots: ReadonlyMap<string, LinkedReviewPlaybookSnapshot>,
): void {
  const versions = tableByName(tables, "trade_review_versions");
  const assignments = tableByName(tables, "trade_review_term_assignments");
  const terms = tableByName(tables, "review_terms");
  const playbooks = tableByName(tables, "playbooks");
  const playbookRules = tableByName(tables, "playbook_rules");
  const ruleResults = tableByName(tables, "trade_review_rule_results");
  const versionById = indexUniqueRows(versions, "id");
  const termById = indexUniqueRows(terms, "id");
  const playbookById = indexUniqueRows(playbooks, "id");
  const playbookRuleById = indexUniqueRows(playbookRules, "id");
  const termsByReviewCategory = new Map<string, ReviewTermFact[]>();
  const assignmentOrdinals = new Set<string>();
  const assignedTerms = new Set<string>();

  for (const row of assignments.rows) {
    const reviewId = textCell(assignments, row, "review_version_id");
    const review = versionById.get(reviewId);
    const termId = textCell(assignments, row, "term_id");
    const term = termById.get(termId);
    const category = textCell(assignments, row, "category");
    const ordinal = BigInt(textCell(assignments, row, "ordinal"));
    if (
      review === undefined
      || term === undefined
      || !["setup", "mistake", "emotion", "tag"].includes(category)
      || ordinal < 0n
      || ordinal > 19n
      || ((category === "setup" || category === "emotion") && ordinal !== 0n)
      || textCell(assignments, row, "workspace_id")
        !== textCell(versions, review, "workspace_id")
      || textCell(assignments, row, "trade_subject_id")
        !== textCell(versions, review, "trade_subject_id")
      || textCell(terms, term, "workspace_id")
        !== textCell(assignments, row, "workspace_id")
      || textCell(terms, term, "category") !== category
    ) {
      throw new Error("SQLite restore contains an inconsistent trade-review term assignment.");
    }
    const name = textCell(terms, term, "name");
    if (
      textCell(terms, term, "normalized_name")
        !== reviewVocabularyIdentity(name, "review-term name", 120)
    ) {
      throw new Error("SQLite restore review-term normalized identity is inconsistent.");
    }
    const categoryKey = JSON.stringify([reviewId, category]);
    const ordinalKey = JSON.stringify([reviewId, category, ordinal.toString()]);
    const termKey = JSON.stringify([reviewId, termId]);
    if (assignmentOrdinals.has(ordinalKey) || assignedTerms.has(termKey)) {
      throw new Error("SQLite restore contains duplicate trade-review term assignments.");
    }
    assignmentOrdinals.add(ordinalKey);
    assignedTerms.add(termKey);
    const facts = termsByReviewCategory.get(categoryKey) ?? [];
    facts.push({ ordinal, name });
    termsByReviewCategory.set(categoryKey, facts);
  }

  const orderedTerms = (reviewId: string, category: string): readonly string[] => {
    const facts = [...(termsByReviewCategory.get(JSON.stringify([reviewId, category])) ?? [])]
      .sort((left, right) => (
        left.ordinal < right.ordinal ? -1 : left.ordinal > right.ordinal ? 1 : 0
      ));
    facts.forEach((fact, index) => {
      if (fact.ordinal !== BigInt(index)) {
        throw new Error("SQLite restore trade-review term ordinals must be contiguous.");
      }
    });
    if ((category === "setup" || category === "emotion") && facts.length > 1) {
      throw new Error("SQLite restore trade reviews support one setup and one emotion.");
    }
    return facts.map((fact) => fact.name);
  };

  const rulesByReview = new Map<string, ReviewRuleFact[]>();
  const resultOrdinals = new Set<string>();
  const reviewedRules = new Set<string>();
  const outcomes: ReadonlySet<string> = new Set<TradeReviewRuleOutcome>([
    "followed",
    "broken",
    "not_applicable",
    "unreviewed",
  ]);
  for (const row of ruleResults.rows) {
    const reviewId = textCell(ruleResults, row, "review_version_id");
    const review = versionById.get(reviewId);
    const reviewPlaybookId = review === undefined
      ? null
      : cell(versions, review, "playbook_id");
    const ruleId = textCell(ruleResults, row, "playbook_rule_id");
    const rule = playbookRuleById.get(ruleId);
    const ordinal = BigInt(textCell(ruleResults, row, "ordinal"));
    const outcome = textCell(ruleResults, row, "outcome");
    if (
      review === undefined
      || reviewPlaybookId === null
      || rule === undefined
      || ordinal < 0n
      || ordinal > 19n
      || !outcomes.has(outcome)
      || textCell(ruleResults, row, "workspace_id")
        !== textCell(versions, review, "workspace_id")
      || textCell(ruleResults, row, "trade_subject_id")
        !== textCell(versions, review, "trade_subject_id")
      || textCell(playbookRules, rule, "workspace_id")
        !== textCell(ruleResults, row, "workspace_id")
      || textCell(playbookRules, rule, "playbook_id") !== reviewPlaybookId
    ) {
      throw new Error("SQLite restore contains an inconsistent trade-review rule result.");
    }
    const name = textCell(ruleResults, row, "rule_name_snapshot");
    const normalizedName = reviewVocabularyIdentity(name, "review-rule snapshot", 500);
    const sharedName = textCell(playbookRules, rule, "rule_text");
    const sharedNormalizedName = reviewVocabularyIdentity(
      sharedName,
      "shared review-rule name",
      500,
    );
    if (
      textCell(playbookRules, rule, "normalized_rule_text") !== sharedNormalizedName
      || normalizedName !== sharedNormalizedName
    ) {
      throw new Error("SQLite restore trade-review rules do not share normalized identity.");
    }
    const ordinalKey = JSON.stringify([reviewId, ordinal.toString()]);
    const ruleKey = JSON.stringify([reviewId, ruleId]);
    if (resultOrdinals.has(ordinalKey) || reviewedRules.has(ruleKey)) {
      throw new Error("SQLite restore contains duplicate trade-review rule results.");
    }
    resultOrdinals.add(ordinalKey);
    reviewedRules.add(ruleKey);
    const facts = rulesByReview.get(reviewId) ?? [];
    facts.push({
      ordinal,
      name,
      normalizedName,
      outcome: outcome as TradeReviewRuleOutcome,
    });
    rulesByReview.set(reviewId, facts);
  }

  for (const row of versions.rows) {
    const reviewId = textCell(versions, row, "id");
    const workspaceId = textCell(versions, row, "workspace_id");
    const tradeSubjectId = textCell(versions, row, "trade_subject_id");
    const state = textCell(versions, row, "state");
    const recordedAt = BigInt(textCell(versions, row, "recorded_at_ms"));
    const completedAt = cell(versions, row, "completed_at_ms");
    if (
      (state === "draft" && completedAt !== null)
      || (
        state === "completed"
        && (completedAt === null || BigInt(completedAt) < recordedAt)
      )
      || (state !== "draft" && state !== "completed")
    ) {
      throw new Error("SQLite restore contains an inconsistent trade-review state.");
    }
    if (
      textCell(versions, row, "result_r_metric_id") !== RESULT_R_METRIC_ID
      || textCell(versions, row, "result_r_metric_version")
        !== String(RESULT_R_METRIC_VERSION)
      || textCell(versions, row, "percent_return_metric_id") !== PERCENT_RETURN_METRIC_ID
      || textCell(versions, row, "percent_return_metric_version")
        !== String(PERCENT_RETURN_METRIC_VERSION)
    ) {
      throw new Error("SQLite restore trade-review metric definitions are unsupported.");
    }

    const setupValues = orderedTerms(reviewId, "setup");
    const mistakeValues = orderedTerms(reviewId, "mistake");
    const tagValues = orderedTerms(reviewId, "tag");
    const emotionValues = orderedTerms(reviewId, "emotion");
    const ruleFacts = [...(rulesByReview.get(reviewId) ?? [])].sort((left, right) => (
      left.ordinal < right.ordinal ? -1 : left.ordinal > right.ordinal ? 1 : 0
    ));
    ruleFacts.forEach((fact, index) => {
      if (fact.ordinal !== BigInt(index)) {
        throw new Error("SQLite restore trade-review rule ordinals must be contiguous.");
      }
    });

    const linkedSnapshot = linkedReviewSnapshots.get(reviewId) ?? null;
    const sharedPlaybookId = cell(versions, row, "playbook_id");
    let playbook: Parameters<typeof prepareTradeReview>[0]["playbook"] = null;
    if (sharedPlaybookId === null) {
      if (ruleFacts.length > 0 || linkedSnapshot !== null) {
        throw new Error("SQLite restore trade-review playbook content is inconsistent.");
      }
    } else {
      const sharedPlaybook = playbookById.get(sharedPlaybookId);
      if (
        sharedPlaybook === undefined
        || textCell(playbooks, sharedPlaybook, "workspace_id") !== workspaceId
      ) {
        throw new Error("SQLite restore contains an orphaned trade-review playbook.");
      }
      const sharedName = textCell(playbooks, sharedPlaybook, "name");
      const sharedNormalizedName = reviewVocabularyIdentity(
        sharedName,
        "shared review-playbook name",
        120,
      );
      if (textCell(playbooks, sharedPlaybook, "normalized_name") !== sharedNormalizedName) {
        throw new Error("SQLite restore playbook normalized identity is inconsistent.");
      }
      if (
        linkedSnapshot !== null
        && (
          reviewVocabularyIdentity(linkedSnapshot.name, "linked playbook name", 120)
            !== sharedNormalizedName
          || linkedSnapshot.rules.length !== ruleFacts.length
          || linkedSnapshot.rules.some((ruleName, index) => (
            reviewVocabularyIdentity(ruleName, "linked playbook rule", 500)
              !== ruleFacts[index]?.normalizedName
          ))
        )
      ) {
        throw new Error("SQLite restore linked review lost its definition snapshot identity.");
      }
      playbook = {
        name: linkedSnapshot?.name ?? sharedName,
        definition: linkedSnapshot === null
          ? null
          : {
              id: linkedSnapshot.definitionId,
              versionId: linkedSnapshot.definitionVersionId,
              revision: linkedSnapshot.definitionRevision,
            },
        rules: ruleFacts.map((fact, index) => ({
          name: linkedSnapshot?.rules[index] ?? fact.name,
          outcome: fact.outcome,
        })),
      };
    }

    const riskAmount = cell(versions, row, "initial_risk_amount_text");
    const riskCurrency = cell(versions, row, "risk_currency_code");
    if ((riskAmount === null) !== (riskCurrency === null)) {
      throw new Error("SQLite restore trade-review initial risk is incomplete.");
    }
    const initialRisk = riskAmount === null || riskCurrency === null
      ? null
      : { amount: riskAmount, currency: riskCurrency };
    const exact = {
      submissionId: textCell(versions, row, "submission_id"),
      tradeSubjectId,
      expectedPreviousReviewId: cell(versions, row, "supersedes_version_id"),
      state,
      note: textCell(versions, row, "note_text"),
      setup: setupValues[0] ?? null,
      mistakes: mistakeValues,
      tags: tagValues,
      emotion: emotionValues[0] ?? null,
      playbook,
      initialRisk,
      plannedStop: cell(versions, row, "planned_stop_price_text"),
    } as const;
    let prepared: ReturnType<typeof prepareTradeReview>;
    try {
      prepared = prepareTradeReview(exact);
    } catch (error) {
      throw new Error("SQLite restore trade-review content violates the authoring contract.", {
        cause: error,
      });
    }
    const exactDefinition = exact.playbook === null
      ? null
      : exact.playbook.definition ?? null;
    const exactContent = JSON.stringify([
      exact.note,
      exact.setup,
      exact.mistakes,
      exact.tags,
      exact.emotion,
      exact.playbook === null
        ? null
        : [
            exact.playbook.name,
            exactDefinition === null
              ? null
              : [
                  exactDefinition.id,
                  exactDefinition.versionId,
                  exactDefinition.revision,
                ],
            exact.playbook.rules.map((rule) => [rule.name, rule.outcome]),
          ],
      exact.initialRisk === null
        ? null
        : [exact.initialRisk.amount, exact.initialRisk.currency],
      exact.plannedStop,
    ]);
    const preparedContent = JSON.stringify([
      prepared.note,
      prepared.setup,
      prepared.mistakes,
      prepared.tags,
      prepared.emotion,
      prepared.playbook === null
        ? null
        : [
            prepared.playbook.name,
            prepared.playbook.definition === null
              ? null
              : [
                  prepared.playbook.definition.id,
                  prepared.playbook.definition.versionId,
                  prepared.playbook.definition.revision,
                ],
            prepared.playbook.rules.map((rule) => [rule.name, rule.outcome]),
          ],
      prepared.initialRisk === null
        ? null
        : [prepared.initialRisk.amount, prepared.initialRisk.currency],
      prepared.plannedStop,
    ]);
    const storedRevision = textCell(versions, row, "revision_sha256");
    const revisionMatches = linkedSnapshot === null
      ? storedRevision === prepared.revision
        || storedRevision === legacyTradeReviewRevision(prepared)
      : storedRevision === prepared.revision;
    if (exactContent !== preparedContent || !revisionMatches) {
      throw new Error(
        "SQLite restore trade-review revision does not bind its canonical content.",
      );
    }
  }
}
function assertDailyEntryVersionChains(
  tables: readonly SqliteArchiveTable[],
): void {
  const versions = tableByName(tables, "daily_journal_entry_versions");
  const heads = tableByName(tables, "daily_journal_entry_heads");
  const assignments = tableByName(tables, "daily_journal_entry_term_assignments");
  const terms = tableByName(tables, "review_terms");
  const versionsByKey = new Map<string, ReviewVersionChainRow[]>();
  const versionById = indexUniqueRows(versions, "id");
  const termById = indexUniqueRows(terms, "id");
  for (const row of terms.rows) {
    const name = canonicalReviewTermName(textCell(terms, row, "name"));
    if (textCell(terms, row, "normalized_name") !== name.toLocaleLowerCase("en-US")) {
      throw new Error("SQLite restore review-term normalized identity is inconsistent.");
    }
  }
  for (const row of versions.rows) {
    const workspaceId = textCell(versions, row, "workspace_id");
    const isoDate = textCell(versions, row, "journal_date");
    const parsedDate = new Date(isoDate + "T12:00:00.000Z");
    if (
      !/^(?:19[7-9][0-9]|[2-9][0-9]{3})-[0-9]{2}-[0-9]{2}$/.test(isoDate)
      || !Number.isFinite(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== isoDate
    ) {
      throw new Error("SQLite restore contains an invalid daily-entry date.");
    }
    const score = cell(versions, row, "process_score_pct");
    if (score !== null && (BigInt(score) < 0n || BigInt(score) > 100n)) {
      throw new Error("SQLite restore contains an invalid daily-entry process score.");
    }
    const state = textCell(versions, row, "state");
    const recordedAt = BigInt(textCell(versions, row, "recorded_at_ms"));
    const completedAt = cell(versions, row, "completed_at_ms");
    if (
      (state === "draft" && completedAt !== null)
      || (
        state === "completed"
        && (completedAt === null || BigInt(completedAt) < recordedAt)
      )
      || (state !== "draft" && state !== "completed")
    ) {
      throw new Error("SQLite restore contains an inconsistent daily-entry state.");
    }
    const key = reviewChainKey(workspaceId, isoDate);
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
      textCell(heads, row, "journal_date"),
    );
    if (headByKey.has(key)) {
      throw new Error("SQLite restore contains duplicate daily-entry heads.");
    }
    headByKey.set(key, row);
  }
  for (const key of headByKey.keys()) {
    if (!versionsByKey.has(key)) {
      throw new Error("SQLite restore contains a daily-entry head without history.");
    }
  }
  for (const [key, chain] of versionsByKey) {
    const head = headByKey.get(key);
    if (head === undefined) {
      throw new Error("Every SQLite restore daily-entry history needs one current head.");
    }
    chain.sort((left, right) => (
      left.version < right.version ? -1 : left.version > right.version ? 1 : 0
    ));
    chain.forEach((version, index) => {
      if (
        version.version !== BigInt(index + 1)
        || version.supersedesId !== (index === 0 ? null : chain[index - 1]?.id ?? null)
      ) {
        throw new Error("SQLite restore daily-entry versions must be contiguous.");
      }
    });
    if (textCell(heads, head, "entry_version_id") !== chain.at(-1)?.id) {
      throw new Error("SQLite restore daily-entry head must point to the latest version.");
    }
  }

  const assignmentKeys = new Set<string>();
  const emotionByVersion = new Map<string, string>();
  const tagsByVersion = new Map<string, { readonly ordinal: bigint; readonly name: string }[]>();
  for (const row of assignments.rows) {
    const versionId = textCell(assignments, row, "entry_version_id");
    const version = versionById.get(versionId);
    const termId = textCell(assignments, row, "term_id");
    const term = termById.get(termId);
    const category = textCell(assignments, row, "category");
    const ordinal = BigInt(textCell(assignments, row, "ordinal"));
    if (
      version === undefined
      || term === undefined
      || !["emotion", "tag"].includes(category)
      || ordinal < 0n
      || ordinal > 19n
      || (category === "emotion" && ordinal !== 0n)
      || textCell(assignments, row, "workspace_id")
        !== textCell(versions, version, "workspace_id")
      || textCell(assignments, row, "journal_date")
        !== textCell(versions, version, "journal_date")
      || textCell(terms, term, "workspace_id")
        !== textCell(assignments, row, "workspace_id")
      || textCell(terms, term, "category") !== category
    ) {
      throw new Error("SQLite restore contains an inconsistent daily-entry term assignment.");
    }
    const key = JSON.stringify([versionId, category, ordinal.toString()]);
    if (assignmentKeys.has(key) || (category === "emotion" && emotionByVersion.has(versionId))) {
      throw new Error("SQLite restore contains duplicate daily-entry term assignments.");
    }
    assignmentKeys.add(key);
    const name = textCell(terms, term, "name");
    if (category === "emotion") {
      emotionByVersion.set(versionId, name);
    } else {
      const tags = tagsByVersion.get(versionId) ?? [];
      tags.push({ ordinal, name });
      tagsByVersion.set(versionId, tags);
    }
  }

  for (const row of versions.rows) {
    const id = textCell(versions, row, "id");
    try {
      validateDailyJournalIdentifier(id, "SQLite restore daily-entry ID");
    } catch (error) {
      throw new Error("SQLite restore contains an invalid daily-entry ID.", { cause: error });
    }
    const state = textCell(versions, row, "state");
    const scoreText = cell(versions, row, "process_score_pct");
    const tagFacts = [...(tagsByVersion.get(id) ?? [])]
      .sort((left, right) => left.ordinal < right.ordinal ? -1 : left.ordinal > right.ordinal ? 1 : 0);
    tagFacts.forEach((tag, index) => {
      if (tag.ordinal !== BigInt(index)) {
        throw new Error("SQLite restore daily-entry tag ordinals must be contiguous.");
      }
    });
    if (state !== "draft" && state !== "completed") {
      throw new Error("SQLite restore contains an unsupported daily-entry state.");
    }
    const exact = {
      submissionId: textCell(versions, row, "submission_id"),
      isoDate: textCell(versions, row, "journal_date"),
      expectedPreviousEntryId: cell(versions, row, "supersedes_version_id"),
      state,
      title: cell(versions, row, "title_text"),
      note: textCell(versions, row, "note_text"),
      emotion: emotionByVersion.get(id) ?? null,
      processScorePct: scoreText === null ? null : Number(scoreText),
      tags: tagFacts.map((tag) => tag.name),
    } as const;
    let prepared: ReturnType<typeof prepareDailyJournalEntry>;
    try {
      prepared = prepareDailyJournalEntry(exact);
    } catch (error) {
      throw new Error("SQLite restore daily-entry content violates the authoring contract.", {
        cause: error,
      });
    }
    if (
      prepared.revision !== textCell(versions, row, "revision_sha256")
      || prepared.title !== exact.title
      || prepared.note !== exact.note
      || prepared.emotion !== exact.emotion
      || prepared.processScorePct !== exact.processScorePct
      || prepared.tags.length !== exact.tags.length
      || prepared.tags.some((tag, index) => tag !== exact.tags[index])
    ) {
      throw new Error("SQLite restore daily-entry revision does not bind its exact normalized content.");
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
    playbooks: String(
      tableByName(tables, "playbooks").rows.length
        + (optionalTableByName(tables, "playbook_definitions")?.rows.length ?? 0),
    ),
    attachments: "0",
    attachmentBytes: "0",
  });
}

function summaryJson(summary: JournalArchiveSummary): string {
  return canonicalJournalArchiveJson(asArchiveJson(summary));
}

/**
 * Decodes current schema-v5/payload-v2 archives and the prior
 * schema-v4/payload-v1 contract. Legacy digests and summaries are checked
 * before its migration table is upgraded for replay into the current schema.
 */
export function decodeSqliteJournalRestoreArchive(
  rawInput: string,
): DecodedSqliteJournalRestoreArchive {
  const archive = parseJournalArchive(rawInput);
  const legacyPayload = archive.payload.version
    === SQLITE_JOURNAL_ARCHIVE_LEGACY_PAYLOAD_VERSION;
  if (
    archive.payload.kind !== SQLITE_JOURNAL_ARCHIVE_PAYLOAD_KIND
    || (
      !legacyPayload
      && archive.payload.version !== SQLITE_JOURNAL_ARCHIVE_PAYLOAD_VERSION
    )
  ) {
    throw new Error("This archive does not contain a supported native SQLite journal payload.");
  }
  const payloadVersion = legacyPayload
    ? SQLITE_JOURNAL_ARCHIVE_LEGACY_PAYLOAD_VERSION
    : SQLITE_JOURNAL_ARCHIVE_PAYLOAD_VERSION;
  assertSupportedMigrationSource(archive.source, payloadVersion);
  const data = requireRecord(archive.payload.data, "SQLite restore payload data");
  assertExactKeys(data, ["tableFormatVersion", "tables"], "SQLite restore payload data");
  if (data.tableFormatVersion !== 1) {
    throw new Error("SQLite restore table format version is not supported.");
  }
  const expectedTables: readonly SqliteJournalArchiveTableName[] = legacyPayload
    ? SQLITE_JOURNAL_ARCHIVE_V1_TABLES
    : SQLITE_JOURNAL_ARCHIVE_TABLES;
  const payloadTables = data.tables;
  if (!Array.isArray(payloadTables) || payloadTables.length !== expectedTables.length) {
    throw new Error("SQLite restore payload must contain every pinned table exactly once.");
  }
  const parsedTables = Object.freeze(expectedTables.map((tableName, index) => {
    const expectedColumnSha256 = legacyPayload
      ? SQLITE_JOURNAL_ARCHIVE_V1_COLUMN_SHA256[
          tableName as SqliteJournalArchiveV1TableName
        ]
      : SQLITE_JOURNAL_ARCHIVE_V2_COLUMN_SHA256[tableName];
    return parseTable(
      payloadTables[index],
      tableName,
      expectedColumnSha256,
      payloadVersion,
    );
  }));
  assertMigrationTable(parsedTables, archive.source);
  assertSingleWorkspaceContract(parsedTables);
  assertExecutionVersionChains(parsedTables);
  assertReviewVersionChains(parsedTables);
  const linkedReviewSnapshots = assertPlaybookDefinitionChains(parsedTables);
  assertTradeReviewRevisions(parsedTables, linkedReviewSnapshots);
  assertDailyEntryVersionChains(parsedTables);

  const stateSha256 = sha256Hex(
    canonicalJournalArchiveJson(portableStateDigestInput(parsedTables)),
  );
  if (stateSha256 !== archive.stateSha256) {
    throw new Error("SQLite restore state digest does not match its validated tables.");
  }
  const summary = recomputeSummary(parsedTables);
  if (summaryJson(summary) !== summaryJson(archive.summary)) {
    throw new Error("SQLite restore summary does not match its validated tables.");
  }
  const tables = legacyPayload
    ? upgradeLegacyMigrationTable(parsedTables)
    : parsedTables;
  return Object.freeze({
    archiveSha256: archive.archiveSha256,
    exportedAtUs: archive.exportedAtUs,
    source: archive.source,
    payloadKind: SQLITE_JOURNAL_ARCHIVE_PAYLOAD_KIND,
    payloadVersion,
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
