import { sha256Hex } from "../adapters/sqlite/schema";
import { assertJsonHasUniqueObjectKeys } from "./strict-json";

export const JOURNAL_ARCHIVE_KIND = "hermes-journal-export" as const;
export const JOURNAL_ARCHIVE_FORMAT_VERSION = 1 as const;
export const JOURNAL_ARCHIVE_MAX_BYTES = 64 * 1024 * 1024;

const MAX_JSON_DEPTH = 64;
const MAX_JSON_NODES = 1_000_000;
const MAX_JSON_ARRAY_LENGTH = 500_000;
const MAX_JSON_STRING_LENGTH = 16 * 1024 * 1024;
const HASH_PATTERN = /^[0-9a-f]{64}$/;
const CANONICAL_UNSIGNED_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/;
const MAX_UINT64_TEXT = "18446744073709551615";
const MAX_DATE_MICROSECONDS_TEXT = "8640000000000000000";

export type JournalArchiveJson =
  | null
  | boolean
  | number
  | string
  | readonly JournalArchiveJson[]
  | { readonly [key: string]: JournalArchiveJson };

export interface JournalArchiveMigration {
  readonly version: number;
  readonly name: string;
  readonly checksumSha256: string;
}

export interface JournalArchiveSource {
  readonly schemaUserVersion: number;
  readonly migrations: readonly JournalArchiveMigration[];
}

export interface JournalArchivePayload {
  readonly kind: string;
  readonly version: number;
  readonly data: JournalArchiveJson;
}

export interface JournalArchiveSummary {
  readonly workspaceName: string | null;
  readonly currency: string | null;
  readonly timeZone: string | null;
  readonly accounts: string;
  readonly activeExecutions: string;
  readonly executionVersions: string;
  readonly importReceipts: string;
  readonly rolledBackImports: string;
  readonly currentReviews: string;
  readonly reviewVersions: string;
  readonly reviewTerms: string;
  readonly playbooks: string;
  readonly attachments: string;
  readonly attachmentBytes: string;
}

export interface JournalArchiveUnsigned {
  readonly kind: typeof JOURNAL_ARCHIVE_KIND;
  readonly formatVersion: typeof JOURNAL_ARCHIVE_FORMAT_VERSION;
  readonly exportedAtUs: string;
  readonly source: JournalArchiveSource;
  readonly payload: JournalArchivePayload;
  readonly attachments: {
    readonly version: 1;
    readonly entries: readonly [];
  };
  readonly summary: JournalArchiveSummary;
  /** Digest of durable journal state only; export time is deliberately excluded. */
  readonly stateSha256: string;
  /** Versioned exact report-input digest, not a localized UI snapshot. */
  readonly reportSha256: string;
}

export interface JournalArchive extends JournalArchiveUnsigned {
  /** Digest of every archive field except this field itself. */
  readonly archiveSha256: string;
}

export interface JournalExportArtifact {
  readonly fileName: string;
  readonly mediaType: "application/vnd.hermes.journal+json";
  readonly contents: string;
  readonly archive: JournalArchive;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string,
): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} has missing or unsupported fields.`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  return value;
}

function requireString(value: unknown, label: string, allowEmpty = false): string {
  if (
    typeof value !== "string"
    || (!allowEmpty && value.length === 0)
    || value.length > MAX_JSON_STRING_LENGTH
  ) {
    throw new Error(`${label} must be a bounded${allowEmpty ? "" : " non-empty"} string.`);
  }
  return value;
}

function requireNullableString(value: unknown, label: string): string | null {
  return value === null ? null : requireString(value, label, true);
}

function requirePositiveSafeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || typeof value !== "number" || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

function exceedsUnsignedDecimal(value: string, maximum: string): boolean {
  return value.length > maximum.length
    || (value.length === maximum.length && value > maximum);
}

function requireCanonicalUnsignedInteger(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (!CANONICAL_UNSIGNED_INTEGER_PATTERN.test(text)) {
    throw new Error(`${label} must be a canonical non-negative decimal string.`);
  }
  if (exceedsUnsignedDecimal(text, MAX_UINT64_TEXT)) {
    throw new Error(`${label} must fit in an unsigned 64-bit integer.`);
  }
  return text;
}

function requireExportTimestamp(value: unknown, label: string): string {
  const text = requireCanonicalUnsignedInteger(value, label);
  if (exceedsUnsignedDecimal(text, MAX_DATE_MICROSECONDS_TEXT)) {
    throw new Error(`${label} is outside the supported calendar range.`);
  }
  return text;
}

function requireHash(value: unknown, label: string): string {
  const text = requireString(value, label);
  if (!HASH_PATTERN.test(text)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  return text;
}

function validateJson(
  value: unknown,
  state: { nodes: number },
  depth = 0,
): asserts value is JournalArchiveJson {
  state.nodes += 1;
  if (state.nodes > MAX_JSON_NODES) throw new Error("Journal archive JSON has too many values.");
  if (depth > MAX_JSON_DEPTH) throw new Error("Journal archive JSON is nested too deeply.");
  if (value === null || typeof value === "boolean") return;
  if (typeof value === "string") {
    if (value.length > MAX_JSON_STRING_LENGTH) {
      throw new Error("Journal archive JSON contains an oversized string.");
    }
    return;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || Object.is(value, -0)) {
      throw new Error("Journal archive JSON numbers must be canonical safe integers; durable integers use strings.");
    }
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_JSON_ARRAY_LENGTH) {
      throw new Error("Journal archive JSON contains an oversized array.");
    }
    for (const item of value) validateJson(item, state, depth + 1);
    return;
  }
  if (!isRecord(value)) throw new Error("Journal archive JSON contains an unsupported value.");
  for (const [key, item] of Object.entries(value)) {
    if (key.length === 0 || key.length > 256) {
      throw new Error("Journal archive JSON contains an invalid object key.");
    }
    validateJson(item, state, depth + 1);
  }
}

function frozenJsonCopy(value: JournalArchiveJson): JournalArchiveJson {
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => frozenJsonCopy(item)));
  }
  const copy = Object.create(null) as Record<string, JournalArchiveJson>;
  for (const [key, item] of Object.entries(value)) {
    copy[key] = frozenJsonCopy(item);
  }
  return Object.freeze(copy);
}

/** Stable UTF-16-key-ordered JSON for hashes and byte-identical export artifacts. */
export function canonicalJournalArchiveJson(value: JournalArchiveJson): string {
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJournalArchiveJson(item)).join(",")}]`;
  }
  const record = value as { readonly [key: string]: JournalArchiveJson };
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJournalArchiveJson(record[key] ?? null)}`
  )).join(",")}}`;
}

function parseMigration(value: unknown, index: number): JournalArchiveMigration {
  const record = requireRecord(value, `Migration ${index + 1}`);
  assertExactKeys(record, ["version", "name", "checksumSha256"], `Migration ${index + 1}`);
  return Object.freeze({
    version: requirePositiveSafeInteger(record.version, `Migration ${index + 1} version`),
    name: requireString(record.name, `Migration ${index + 1} name`),
    checksumSha256: requireHash(record.checksumSha256, `Migration ${index + 1} checksum`),
  });
}

function parseSource(value: unknown): JournalArchiveSource {
  const record = requireRecord(value, "Archive source");
  assertExactKeys(record, ["schemaUserVersion", "migrations"], "Archive source");
  const schemaUserVersion = requirePositiveSafeInteger(
    record.schemaUserVersion,
    "Archive schema user version",
  );
  if (!Array.isArray(record.migrations) || record.migrations.length === 0) {
    throw new Error("Archive migration history must be a non-empty array.");
  }
  const migrations = record.migrations.map(parseMigration);
  migrations.forEach((migration, index) => {
    if (migration.version !== index + 1) {
      throw new Error("Archive migration versions must be contiguous and ordered.");
    }
  });
  if (migrations.at(-1)?.version !== schemaUserVersion) {
    throw new Error("Archive schema version does not match its migration history.");
  }
  return Object.freeze({ schemaUserVersion, migrations: Object.freeze(migrations) });
}

function parsePayload(value: unknown): JournalArchivePayload {
  const record = requireRecord(value, "Archive payload");
  assertExactKeys(record, ["kind", "version", "data"], "Archive payload");
  const data = record.data;
  validateJson(data, { nodes: 0 });
  return Object.freeze({
    kind: requireString(record.kind, "Archive payload kind"),
    version: requirePositiveSafeInteger(record.version, "Archive payload version"),
    data: frozenJsonCopy(data),
  });
}

function parseSummary(value: unknown): JournalArchiveSummary {
  const record = requireRecord(value, "Archive summary");
  const keys = [
    "workspaceName",
    "currency",
    "timeZone",
    "accounts",
    "activeExecutions",
    "executionVersions",
    "importReceipts",
    "rolledBackImports",
    "currentReviews",
    "reviewVersions",
    "reviewTerms",
    "playbooks",
    "attachments",
    "attachmentBytes",
  ] as const;
  assertExactKeys(record, keys, "Archive summary");
  return Object.freeze({
    workspaceName: requireNullableString(record.workspaceName, "Archive workspace name"),
    currency: requireNullableString(record.currency, "Archive currency"),
    timeZone: requireNullableString(record.timeZone, "Archive time zone"),
    accounts: requireCanonicalUnsignedInteger(record.accounts, "Archive account count"),
    activeExecutions: requireCanonicalUnsignedInteger(
      record.activeExecutions,
      "Archive active execution count",
    ),
    executionVersions: requireCanonicalUnsignedInteger(
      record.executionVersions,
      "Archive execution-version count",
    ),
    importReceipts: requireCanonicalUnsignedInteger(
      record.importReceipts,
      "Archive import-receipt count",
    ),
    rolledBackImports: requireCanonicalUnsignedInteger(
      record.rolledBackImports,
      "Archive rollback count",
    ),
    currentReviews: requireCanonicalUnsignedInteger(
      record.currentReviews,
      "Archive current-review count",
    ),
    reviewVersions: requireCanonicalUnsignedInteger(
      record.reviewVersions,
      "Archive review-version count",
    ),
    reviewTerms: requireCanonicalUnsignedInteger(record.reviewTerms, "Archive review-term count"),
    playbooks: requireCanonicalUnsignedInteger(record.playbooks, "Archive playbook count"),
    attachments: requireCanonicalUnsignedInteger(record.attachments, "Archive attachment count"),
    attachmentBytes: requireCanonicalUnsignedInteger(
      record.attachmentBytes,
      "Archive attachment byte count",
    ),
  });
}

function parseUnsigned(record: Record<string, unknown>): JournalArchiveUnsigned {
  if (record.kind !== JOURNAL_ARCHIVE_KIND) throw new Error("This is not a Hermes journal export.");
  if (record.formatVersion !== JOURNAL_ARCHIVE_FORMAT_VERSION) {
    throw new Error("This Hermes journal export version is not supported by this app build.");
  }
  const attachments = requireRecord(record.attachments, "Archive attachments");
  assertExactKeys(attachments, ["version", "entries"], "Archive attachments");
  if (attachments.version !== 1 || !Array.isArray(attachments.entries)) {
    throw new Error("Archive attachment catalog version is not supported.");
  }
  if (attachments.entries.length !== 0) {
    throw new Error("This app build cannot restore archives containing attachments.");
  }
  return Object.freeze({
    kind: JOURNAL_ARCHIVE_KIND,
    formatVersion: JOURNAL_ARCHIVE_FORMAT_VERSION,
    exportedAtUs: requireExportTimestamp(record.exportedAtUs, "Archive export time"),
    source: parseSource(record.source),
    payload: parsePayload(record.payload),
    attachments: Object.freeze({ version: 1, entries: Object.freeze([] as const) }),
    summary: parseSummary(record.summary),
    stateSha256: requireHash(record.stateSha256, "Archive state digest"),
    reportSha256: requireHash(record.reportSha256, "Archive report digest"),
  });
}

function unsignedJson(unsigned: JournalArchiveUnsigned): JournalArchiveJson {
  return unsigned as unknown as JournalArchiveJson;
}

export function createJournalArchive(unsigned: JournalArchiveUnsigned): JournalArchive {
  const parsed = parseUnsigned(unsigned as unknown as Record<string, unknown>);
  const archiveSha256 = sha256Hex(canonicalJournalArchiveJson(unsignedJson(parsed)));
  return Object.freeze({ ...parsed, archiveSha256 });
}

export function serializeJournalArchive(archive: JournalArchive): string {
  const parsed = parseJournalArchive(canonicalJournalArchiveJson(
    archive as unknown as JournalArchiveJson,
  ));
  return `${canonicalJournalArchiveJson(parsed as unknown as JournalArchiveJson)}\n`;
}

export function parseJournalArchive(rawInput: string): JournalArchive {
  if (new TextEncoder().encode(rawInput).byteLength > JOURNAL_ARCHIVE_MAX_BYTES) {
    throw new Error(`Hermes journal exports are limited to ${JOURNAL_ARCHIVE_MAX_BYTES} bytes.`);
  }
  assertJsonHasUniqueObjectKeys(rawInput, {
    maxDepth: MAX_JSON_DEPTH,
    maxNodes: MAX_JSON_NODES,
    maxArrayLength: MAX_JSON_ARRAY_LENGTH,
    maxStringLength: MAX_JSON_STRING_LENGTH,
  });
  let value: unknown;
  try {
    value = JSON.parse(rawInput) as unknown;
  } catch (error) {
    throw new Error("The selected file is not valid JSON.", { cause: error });
  }
  validateJson(value, { nodes: 0 });
  const record = requireRecord(value, "Journal archive");
  assertExactKeys(record, [
    "kind",
    "formatVersion",
    "exportedAtUs",
    "source",
    "payload",
    "attachments",
    "summary",
    "stateSha256",
    "reportSha256",
    "archiveSha256",
  ], "Journal archive");
  const unsigned = parseUnsigned(record);
  const archiveSha256 = requireHash(record.archiveSha256, "Archive digest");
  const expected = sha256Hex(canonicalJournalArchiveJson(unsignedJson(unsigned)));
  if (archiveSha256 !== expected) {
    throw new Error("The journal export checksum does not match its contents.");
  }
  return Object.freeze({ ...unsigned, archiveSha256 });
}

export function journalArchiveFileName(exportedAtUs: string): string {
  const milliseconds = Number(
    BigInt(requireExportTimestamp(exportedAtUs, "Archive export time")) / 1_000n,
  );
  const date = new Date(milliseconds);
  if (!Number.isFinite(date.getTime())) return "hermes-journal-export.json";
  const stamp = date.toISOString().replaceAll(":", "-");
  return `hermes-journal-export-${stamp}.json`;
}

export function createJournalExportArtifact(unsigned: JournalArchiveUnsigned): JournalExportArtifact {
  const archive = createJournalArchive(unsigned);
  return Object.freeze({
    fileName: journalArchiveFileName(archive.exportedAtUs),
    mediaType: "application/vnd.hermes.journal+json",
    contents: serializeJournalArchive(archive),
    archive,
  });
}
