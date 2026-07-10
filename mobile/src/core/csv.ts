import {
  canonicalizeDecimal,
  type CanonicalDecimal,
} from "./decimal";

export interface CsvLimits {
  /** Maximum UTF-8 bytes in the complete decoded document. */
  readonly maxBytes: number;
  /** Maximum logical records, including the header. */
  readonly maxRows: number;
  readonly maxFieldsPerRow: number;
  /** Maximum UTF-8 bytes in one decoded field. */
  readonly maxFieldBytes: number;
}

export const DEFAULT_CSV_LIMITS: CsvLimits = Object.freeze({
  maxBytes: 5 * 1024 * 1024,
  maxRows: 50_001,
  maxFieldsPerRow: 128,
  maxFieldBytes: 64 * 1024,
});

export interface CsvLocation {
  readonly logicalRow: number;
  readonly physicalLineStart: number;
  readonly physicalLineEnd: number;
  readonly fieldIndex?: number;
}

export interface CsvCell {
  /** Decoded RFC 4180 data. It is deliberately not HTML/formula sanitized. */
  readonly value: string;
  readonly location: CsvLocation & { readonly fieldIndex: number };
}

export interface CsvRecord {
  readonly logicalRow: number;
  readonly physicalLineStart: number;
  readonly physicalLineEnd: number;
  /**
   * Exact input slice for provenance/replay, including quoting, a leading BOM
   * on the first record, embedded newlines, and the record terminator (if any).
   */
  readonly sourceText: string;
  readonly cells: readonly CsvCell[];
}

export type CsvParseIssueCode =
  | "csv_file_too_large"
  | "csv_too_many_rows"
  | "csv_too_many_fields"
  | "csv_field_too_large"
  | "csv_unexpected_quote"
  | "csv_trailing_character_after_quote"
  | "csv_unterminated_quote"
  | "csv_empty_document";

export type CsvHeaderIssueCode =
  | "csv_blank_header"
  | "csv_duplicate_header";

export type CsvMappingIssueCode =
  | "csv_missing_required_header"
  | "csv_ambiguous_header"
  | "csv_invalid_mapping_index"
  | "csv_duplicate_mapping_column"
  | "csv_unmapped_header";

export type CsvConfigurationIssueCode =
  | "csv_invalid_time_zone"
  | "csv_invalid_default_currency";

export type CsvRowIssueCode =
  | "csv_blank_row"
  | "csv_column_count_mismatch"
  | "csv_missing_value"
  | "csv_invalid_symbol"
  | "csv_invalid_side"
  | "csv_invalid_quantity"
  | "csv_invalid_price"
  | "csv_invalid_fee"
  | "csv_invalid_execution_id"
  | "csv_invalid_currency"
  | "csv_invalid_timestamp"
  | "csv_ambiguous_local_time"
  | "csv_nonexistent_local_time";

interface CsvIssueBase {
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly location?: CsvLocation;
}

export interface CsvParseIssue extends CsvIssueBase {
  readonly stage: "parse";
  readonly code: CsvParseIssueCode;
}

export interface CsvHeaderIssue extends CsvIssueBase {
  readonly stage: "header";
  readonly code: CsvHeaderIssueCode;
  readonly header?: string;
}

export interface CsvMappingIssue extends CsvIssueBase {
  readonly stage: "mapping";
  readonly code: CsvMappingIssueCode;
  readonly field?: CsvImportField;
  readonly header?: string;
}

export interface CsvConfigurationIssue extends CsvIssueBase {
  readonly stage: "configuration";
  readonly code: CsvConfigurationIssueCode;
}

export interface CsvRowIssue extends CsvIssueBase {
  readonly stage: "row";
  readonly code: CsvRowIssueCode;
  readonly field?: CsvImportField;
  /** Exact source data for display in an escaped text context. */
  readonly rawValue?: string;
}

export type CsvPreviewIssue =
  | CsvParseIssue
  | CsvHeaderIssue
  | CsvMappingIssue
  | CsvConfigurationIssue
  | CsvRowIssue;

export interface CsvDocument {
  readonly byteLength: number;
  readonly records: readonly CsvRecord[];
  readonly issues: readonly CsvParseIssue[];
}

function resolveLimits(overrides: Partial<CsvLimits>): CsvLimits {
  const limits: CsvLimits = {
    ...DEFAULT_CSV_LIMITS,
    ...overrides,
  };
  for (const [name, value] of Object.entries(limits)) {
    if (!Number.isSafeInteger(value) || value < 1) {
      throw new TypeError(`${name} must be a positive safe integer`);
    }
  }
  return limits;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

/**
 * Parses an RFC 4180 document without interpreting any cell as markup, a
 * spreadsheet formula, a number, or a date. CRLF, LF, and CR record endings
 * are recognized; their exact characters are retained inside quoted fields.
 */
export function parseCsvDocument(
  input: string,
  limitOverrides: Partial<CsvLimits> = {},
): CsvDocument {
  const limits = resolveLimits(limitOverrides);
  const byteLength = utf8Length(input);
  if (byteLength > limits.maxBytes) {
    return {
      byteLength,
      records: [],
      issues: [{
        stage: "parse",
        severity: "error",
        code: "csv_file_too_large",
        message: `CSV is ${byteLength} bytes; the limit is ${limits.maxBytes} bytes.`,
      }],
    };
  }

  const records: CsvRecord[] = [];
  const issues: CsvParseIssue[] = [];
  let index = input.startsWith("\uFEFF") ? 1 : 0;
  let line = 1;
  let column = 1;
  let rowStartLine = 1;
  let rowStartIndex = 0;
  let fieldStartLine = 1;
  let fieldValue = "";
  let cells: CsvCell[] = [];
  let state: "field-start" | "unquoted" | "quoted" | "after-quote" = "field-start";
  let rowTouched = false;
  let stopped = false;

  const location = (fieldIndex?: number, physicalLineEnd = line): CsvLocation => ({
    logicalRow: records.length + 1,
    physicalLineStart: rowStartLine,
    physicalLineEnd,
    ...(fieldIndex === undefined ? {} : { fieldIndex }),
  });

  const finishField = (): void => {
    const fieldIndex = cells.length + 1;
    const cellLocation: CsvCell["location"] = {
      logicalRow: records.length + 1,
      physicalLineStart: fieldStartLine,
      physicalLineEnd: line,
      fieldIndex,
    };
    const fieldBytes = utf8Length(fieldValue);
    if (fieldBytes > limits.maxFieldBytes) {
      issues.push({
        stage: "parse",
        severity: "error",
        code: "csv_field_too_large",
        message: `Field is ${fieldBytes} bytes; the limit is ${limits.maxFieldBytes} bytes.`,
        location: cellLocation,
      });
    }
    cells.push({ value: fieldValue, location: cellLocation });
    if (cells.length === limits.maxFieldsPerRow + 1) {
      issues.push({
        stage: "parse",
        severity: "error",
        code: "csv_too_many_fields",
        message: `Row has more than ${limits.maxFieldsPerRow} fields.`,
        location: cellLocation,
      });
    }
    fieldValue = "";
    state = "field-start";
  };

  const finishRow = (physicalLineEnd: number, sourceEndIndex: number): void => {
    finishField();
    if (records.length >= limits.maxRows) {
      issues.push({
        stage: "parse",
        severity: "error",
        code: "csv_too_many_rows",
        message: `CSV has more than ${limits.maxRows} logical rows.`,
        location: location(undefined, physicalLineEnd),
      });
      stopped = true;
      return;
    }
    records.push({
      logicalRow: records.length + 1,
      physicalLineStart: rowStartLine,
      physicalLineEnd,
      sourceText: input.slice(rowStartIndex, sourceEndIndex),
      cells,
    });
    cells = [];
    rowTouched = false;
  };

  const newlineAt = (position: number): string | null => {
    const character = input[position];
    if (character === "\r") {
      return input[position + 1] === "\n" ? "\r\n" : "\r";
    }
    return character === "\n" ? "\n" : null;
  };

  const consumeNewline = (newline: string): void => {
    index += newline.length;
    line += 1;
    column = 1;
  };

  while (index < input.length && !stopped) {
    const character = input[index] ?? "";
    const newline = newlineAt(index);

    if (state === "quoted") {
      if (character === "\"") {
        if (input[index + 1] === "\"") {
          fieldValue += "\"";
          index += 2;
          column += 2;
        } else {
          state = "after-quote";
          index += 1;
          column += 1;
        }
      } else if (newline !== null) {
        fieldValue += newline;
        consumeNewline(newline);
      } else {
        fieldValue += character;
        index += 1;
        column += 1;
      }
      continue;
    }

    if (newline !== null) {
      const completedLine = line;
      finishRow(completedLine, index + newline.length);
      consumeNewline(newline);
      rowStartLine = line;
      rowStartIndex = index;
      fieldStartLine = line;
      continue;
    }

    if (character === ",") {
      finishField();
      rowTouched = true;
      index += 1;
      column += 1;
      fieldStartLine = line;
      continue;
    }

    if (state === "field-start" && character === "\"") {
      state = "quoted";
      rowTouched = true;
      index += 1;
      column += 1;
      continue;
    }

    if (state === "after-quote") {
      issues.push({
        stage: "parse",
        severity: "error",
        code: "csv_trailing_character_after_quote",
        message: "Only a comma or record ending may follow a closing quote.",
        location: location(cells.length + 1),
      });
      state = "unquoted";
      fieldValue += character;
    } else {
      if (character === "\"") {
        issues.push({
          stage: "parse",
          severity: "error",
          code: "csv_unexpected_quote",
          message: "A quote in an unquoted field must begin the field.",
          location: location(cells.length + 1),
        });
      }
      state = "unquoted";
      fieldValue += character;
    }
    rowTouched = true;
    index += 1;
    column += 1;
  }

  if (!stopped) {
    if (state === "quoted") {
      issues.push({
        stage: "parse",
        severity: "error",
        code: "csv_unterminated_quote",
        message: "Quoted field reaches the end of the file without a closing quote.",
        location: location(cells.length + 1),
      });
    }
    if (rowTouched || cells.length > 0 || fieldValue.length > 0 || state !== "field-start") {
      finishRow(line, input.length);
    }
  }

  if (records.length === 0 && issues.every((issue) => issue.code !== "csv_too_many_rows")) {
    issues.push({
      stage: "parse",
      severity: "error",
      code: "csv_empty_document",
      message: "CSV does not contain a header row.",
    });
  }

  return { byteLength, records, issues };
}

export interface CsvHeaderValidation {
  readonly headers: readonly string[];
  readonly issues: readonly CsvHeaderIssue[];
}

export function validateCsvHeader(header: CsvRecord): CsvHeaderValidation {
  const issues: CsvHeaderIssue[] = [];
  const seen = new Map<string, CsvCell>();
  const headers = header.cells.map((cell) => cell.value);

  for (const cell of header.cells) {
    const normalized = cell.value.trim().toLocaleLowerCase("en-US");
    if (normalized.length === 0) {
      issues.push({
        stage: "header",
        severity: "error",
        code: "csv_blank_header",
        message: "Every CSV column must have a header.",
        location: cell.location,
        header: cell.value,
      });
      continue;
    }
    const first = seen.get(normalized);
    if (first !== undefined) {
      issues.push({
        stage: "header",
        severity: "error",
        code: "csv_duplicate_header",
        message: `Header \"${cell.value}\" duplicates field ${first.location.fieldIndex}.`,
        location: cell.location,
        header: cell.value,
      });
    } else {
      seen.set(normalized, cell);
    }
  }

  return { headers, issues };
}

export type CsvImportField =
  | "executionId"
  | "symbol"
  | "side"
  | "quantity"
  | "price"
  | "fee"
  | "currency"
  | "executedAt";

export type CsvHeaderMapping = Readonly<Record<CsvImportField, number | null>>;

export interface CsvHeaderInference {
  readonly mapping: CsvHeaderMapping;
  readonly issues: readonly CsvMappingIssue[];
}

const HEADER_ALIASES: Readonly<Record<CsvImportField, ReadonlySet<string>>> = {
  executionId: new Set(["executionid", "executionidentifier", "execid", "fillid", "transactionid"]),
  symbol: new Set(["symbol", "ticker", "instrument", "security", "contract"]),
  side: new Set(["side", "action", "direction", "buysell", "transactiontype"]),
  quantity: new Set(["quantity", "qty", "shares", "units", "size", "filledquantity"]),
  price: new Set(["price", "fillprice", "executionprice", "averageprice", "avgprice"]),
  fee: new Set(["fee", "fees", "commission", "commissions", "transactionfee"]),
  currency: new Set(["currency", "currencycode", "ccy"]),
  executedAt: new Set([
    "executedat",
    "executiontime",
    "filledat",
    "filltime",
    "tradetime",
    "timestamp",
    "datetime",
    "date",
  ]),
};

const REQUIRED_IMPORT_FIELDS: readonly CsvImportField[] = [
  "symbol",
  "side",
  "quantity",
  "price",
  "executedAt",
];

function normalizedHeader(value: string): string {
  return value.trim().toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "");
}

export function inferCsvHeaderMapping(header: CsvRecord): CsvHeaderInference {
  const issues: CsvMappingIssue[] = [];
  const candidates = new Map<CsvImportField, number[]>();
  const fields = Object.keys(HEADER_ALIASES) as CsvImportField[];

  for (const field of fields) {
    candidates.set(field, []);
  }

  header.cells.forEach((cell, index) => {
    const normalized = normalizedHeader(cell.value);
    if (normalized.length === 0) {
      return;
    }
    const field = fields.find((candidate) => HEADER_ALIASES[candidate].has(normalized));
    if (field === undefined) {
      issues.push({
        stage: "mapping",
        severity: "warning",
        code: "csv_unmapped_header",
        message: `Column \"${cell.value}\" will not be imported.`,
        location: cell.location,
        header: cell.value,
      });
    } else {
      candidates.get(field)?.push(index);
    }
  });

  const mutableMapping: Record<CsvImportField, number | null> = {
    executionId: null,
    symbol: null,
    side: null,
    quantity: null,
    price: null,
    fee: null,
    currency: null,
    executedAt: null,
  };

  for (const field of fields) {
    const matches = candidates.get(field) ?? [];
    if (matches.length === 1) {
      mutableMapping[field] = matches[0] ?? null;
    } else if (matches.length > 1) {
      const firstIndex = matches[0];
      const firstCell = firstIndex === undefined ? undefined : header.cells[firstIndex];
      issues.push({
        stage: "mapping",
        severity: "error",
        code: "csv_ambiguous_header",
        message: `Multiple columns match the ${field} field.`,
        ...(firstCell === undefined ? {} : { location: firstCell.location }),
        field,
      });
    }
  }

  for (const field of REQUIRED_IMPORT_FIELDS) {
    if (mutableMapping[field] === null) {
      const ambiguous = issues.some((issue) => (
        issue.code === "csv_ambiguous_header" && issue.field === field
      ));
      if (!ambiguous) {
        issues.push({
          stage: "mapping",
          severity: "error",
          code: "csv_missing_required_header",
          message: `Map a column to the required ${field} field.`,
          field,
        });
      }
    }
  }

  return { mapping: mutableMapping, issues };
}

/** Validates a user-selected zero-based mapping before any row is interpreted. */
export function validateCsvHeaderMapping(
  header: CsvRecord,
  mapping: CsvHeaderMapping,
): CsvHeaderInference {
  const issues: CsvMappingIssue[] = [];
  const fields = Object.keys(HEADER_ALIASES) as CsvImportField[];
  const invalidFields = new Set<CsvImportField>();
  const normalized: Record<CsvImportField, number | null> = {
    executionId: null,
    symbol: null,
    side: null,
    quantity: null,
    price: null,
    fee: null,
    currency: null,
    executedAt: null,
  };

  for (const field of fields) {
    const candidate: number | null | undefined = mapping[field];
    if (candidate === null || candidate === undefined) {
      continue;
    }
    if (
      !Number.isSafeInteger(candidate)
      || candidate < 0
      || candidate >= header.cells.length
    ) {
      invalidFields.add(field);
      issues.push({
        stage: "mapping",
        severity: "error",
        code: "csv_invalid_mapping_index",
        message: `${field} maps to column ${String(candidate)}, which is outside this header.`,
        location: {
          logicalRow: header.logicalRow,
          physicalLineStart: header.physicalLineStart,
          physicalLineEnd: header.physicalLineEnd,
        },
        field,
      });
      continue;
    }
    normalized[field] = candidate;
  }

  const fieldsByColumn = new Map<number, CsvImportField[]>();
  for (const field of fields) {
    const column = normalized[field];
    if (column === null) {
      continue;
    }
    const mappedFields = fieldsByColumn.get(column) ?? [];
    mappedFields.push(field);
    fieldsByColumn.set(column, mappedFields);
  }
  for (const [column, mappedFields] of fieldsByColumn) {
    if (mappedFields.length < 2) {
      continue;
    }
    const cell = header.cells[column];
    issues.push({
      stage: "mapping",
      severity: "error",
      code: "csv_duplicate_mapping_column",
      message: `Column ${column + 1} is mapped more than once (${mappedFields.join(", ")}).`,
      ...(cell === undefined ? {} : { location: cell.location, header: cell.value }),
      field: mappedFields[0],
    });
  }

  for (const field of REQUIRED_IMPORT_FIELDS) {
    if (normalized[field] === null && !invalidFields.has(field)) {
      issues.push({
        stage: "mapping",
        severity: "error",
        code: "csv_missing_required_header",
        message: `Map a column to the required ${field} field.`,
        field,
      });
    }
  }

  return { mapping: normalized, issues };
}

export type ExecutionSide = "buy" | "sell";
export type PositionEffect = "open" | "close" | "unspecified";

export type SideAliasResult =
  | {
      readonly ok: true;
      readonly side: ExecutionSide;
      readonly positionEffect: PositionEffect;
    }
  | {
      readonly ok: false;
      readonly message: string;
    };

const SIDE_ALIASES: Readonly<Record<string, readonly [ExecutionSide, PositionEffect]>> = {
  BUY: ["buy", "unspecified"],
  SELL: ["sell", "unspecified"],
  BTO: ["buy", "open"],
  BUYTOOPEN: ["buy", "open"],
  STC: ["sell", "close"],
  SELLTOCLOSE: ["sell", "close"],
  STO: ["sell", "open"],
  SELLTOOPEN: ["sell", "open"],
  BTC: ["buy", "close"],
  BUYTOCLOSE: ["buy", "close"],
};

export function parseSideAlias(raw: string): SideAliasResult {
  const normalized = raw.trim().toLocaleUpperCase("en-US").replace(/[\s_-]+/g, "");
  const match = SIDE_ALIASES[normalized];
  if (match === undefined) {
    return {
      ok: false,
      message: "Use BUY, SELL, BTO, STC, STO, or BTC.",
    };
  }
  return { ok: true, side: match[0], positionEffect: match[1] };
}

interface TimestampComponents {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
  readonly fraction: string;
}

export type ExecutionTimestampErrorCode =
  | "invalid_timestamp"
  | "invalid_time_zone"
  | "ambiguous_local_time"
  | "nonexistent_local_time";

export type ExecutionTimestampResult =
  | {
      readonly ok: true;
      readonly instantIso: string;
      readonly source: "offset" | "iana";
      readonly timeZone?: string;
    }
  | {
      readonly ok: false;
      readonly code: ExecutionTimestampErrorCode;
      readonly message: string;
    };

const TIMESTAMP_PATTERN = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?)?(?:(Z)|([+-])(\d{2}):(\d{2}))?$/;
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function epochFromComponents(components: TimestampComponents): number | null {
  const date = new Date(0);
  date.setUTCFullYear(components.year, components.month - 1, components.day);
  date.setUTCHours(components.hour, components.minute, components.second, 0);
  const epoch = date.getTime();
  if (
    !Number.isFinite(epoch)
    || date.getUTCFullYear() !== components.year
    || date.getUTCMonth() !== components.month - 1
    || date.getUTCDate() !== components.day
    || date.getUTCHours() !== components.hour
    || date.getUTCMinutes() !== components.minute
    || date.getUTCSeconds() !== components.second
  ) {
    return null;
  }
  return epoch;
}

function parseTimestampInput(raw: string): {
  readonly components: TimestampComponents;
  readonly offsetMinutes: number | null;
} | null {
  const match = TIMESTAMP_PATTERN.exec(raw.trim());
  if (match === null) {
    return null;
  }
  const hasTime = match[4] !== undefined;
  const hasOffset = match[8] !== undefined || match[9] !== undefined;
  if (hasOffset && !hasTime) {
    return null;
  }

  const components: TimestampComponents = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4] ?? "0"),
    minute: Number(match[5] ?? "0"),
    second: Number(match[6] ?? "0"),
    fraction: match[7] ?? "",
  };
  if (epochFromComponents(components) === null) {
    return null;
  }

  if (!hasOffset) {
    return { components, offsetMinutes: null };
  }
  if (match[8] === "Z") {
    return { components, offsetMinutes: 0 };
  }
  const offsetHours = Number(match[10]);
  const offsetMinutePart = Number(match[11]);
  if (
    offsetHours > 14
    || offsetMinutePart > 59
    || (offsetHours === 14 && offsetMinutePart !== 0)
  ) {
    return null;
  }
  const sign = match[9] === "-" ? -1 : 1;
  return {
    components,
    offsetMinutes: sign * ((offsetHours * 60) + offsetMinutePart),
  };
}

function canonicalTimeZone(timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatterCache.get(timeZone);
  if (cached !== undefined) {
    return cached;
  }
  const formatter = new Intl.DateTimeFormat("en-CA-u-ca-iso8601-hc-h23-nu-latn", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatterCache.set(timeZone, formatter);
  return formatter;
}

function localComponentsAt(epoch: number, timeZone: string): Omit<TimestampComponents, "fraction"> {
  const values = new Map(
    formatterFor(timeZone)
      .formatToParts(new Date(epoch))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return {
    year: values.get("year") ?? Number.NaN,
    month: values.get("month") ?? Number.NaN,
    day: values.get("day") ?? Number.NaN,
    hour: values.get("hour") ?? Number.NaN,
    minute: values.get("minute") ?? Number.NaN,
    second: values.get("second") ?? Number.NaN,
  };
}

function sameWallTime(
  left: Omit<TimestampComponents, "fraction">,
  right: TimestampComponents,
): boolean {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute
    && left.second === right.second;
}

function offsetMillisecondsAt(epoch: number, timeZone: string): number {
  const local = localComponentsAt(epoch, timeZone);
  const localEpoch = epochFromComponents({ ...local, fraction: "" });
  if (localEpoch === null) {
    throw new RangeError("Intl returned an invalid local timestamp");
  }
  return localEpoch - epoch;
}

function utcIso(epoch: number, fraction: string): string | null {
  const date = new Date(epoch);
  const year = date.getUTCFullYear();
  if (year < 1 || year > 9999) {
    return null;
  }
  const wholeSeconds = date.toISOString().slice(0, 19);
  const canonicalFraction = fraction.replace(/0+$/, "");
  return canonicalFraction.length === 0
    ? `${wholeSeconds}Z`
    : `${wholeSeconds}.${canonicalFraction}Z`;
}

export function parseExecutionTimestamp(
  raw: string,
  selectedTimeZone: string,
): ExecutionTimestampResult {
  const parsed = parseTimestampInput(raw);
  if (parsed === null) {
    return {
      ok: false,
      code: "invalid_timestamp",
      message: "Use an ISO date/time, with an offset or a selected IANA time zone.",
    };
  }
  const baseEpoch = epochFromComponents(parsed.components);
  if (baseEpoch === null) {
    return {
      ok: false,
      code: "invalid_timestamp",
      message: "Timestamp contains an invalid calendar date or time.",
    };
  }

  if (parsed.offsetMinutes !== null) {
    const instant = baseEpoch - (parsed.offsetMinutes * 60_000);
    const instantIso = utcIso(instant, parsed.components.fraction);
    return instantIso === null
      ? {
          ok: false,
          code: "invalid_timestamp",
          message: "Timestamp is outside the supported year range.",
        }
      : { ok: true, instantIso, source: "offset" };
  }

  const timeZone = canonicalTimeZone(selectedTimeZone);
  if (timeZone === null) {
    return {
      ok: false,
      code: "invalid_time_zone",
      message: "Select a valid IANA time zone for timestamps without an offset.",
    };
  }

  const sampleDeltas = [
    -3 * 86_400_000,
    -86_400_000,
    -21_600_000,
    0,
    21_600_000,
    86_400_000,
    3 * 86_400_000,
  ];
  const offsets = new Set(sampleDeltas.map((delta) => (
    offsetMillisecondsAt(baseEpoch + delta, timeZone)
  )));
  const candidates = [...offsets]
    .map((offset) => baseEpoch - offset)
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .filter((candidate) => sameWallTime(localComponentsAt(candidate, timeZone), parsed.components))
    .sort((left, right) => left - right);

  if (candidates.length === 0) {
    return {
      ok: false,
      code: "nonexistent_local_time",
      message: `Local time does not exist in ${timeZone} because of a clock transition.`,
    };
  }
  if (candidates.length > 1) {
    return {
      ok: false,
      code: "ambiguous_local_time",
      message: `Local time occurs more than once in ${timeZone}; include an explicit UTC offset.`,
    };
  }

  const candidate = candidates[0];
  const instantIso = candidate === undefined
    ? null
    : utcIso(candidate, parsed.components.fraction);
  return instantIso === null
    ? {
        ok: false,
        code: "invalid_timestamp",
        message: "Timestamp is outside the supported year range.",
      }
    : { ok: true, instantIso, source: "iana", timeZone };
}

export interface CsvExecutionPreview {
  readonly source: CsvLocation;
  readonly executionId: string | null;
  readonly symbol: string;
  readonly side: ExecutionSide;
  readonly positionEffect: PositionEffect;
  readonly quantity: CanonicalDecimal;
  readonly price: CanonicalDecimal;
  readonly fee: CanonicalDecimal;
  readonly currency: string;
  readonly executedAt: string;
}

export interface GenericCsvPreviewOptions {
  /** Used only for source timestamps that do not include a UTC offset. */
  readonly timeZone: string;
  readonly defaultCurrency?: string;
  readonly limits?: Partial<CsvLimits>;
  /** Explicit zero-based mapping selected by the user; inference remains the default. */
  readonly mapping?: CsvHeaderMapping;
}

export interface GenericCsvPreview {
  readonly status: "ready" | "invalid";
  readonly document: CsvDocument;
  readonly header: CsvRecord | null;
  readonly mapping: CsvHeaderMapping | null;
  readonly rows: readonly CsvExecutionPreview[];
  readonly issues: readonly CsvPreviewIssue[];
  readonly totalDataRows: number;
  readonly validRows: number;
  readonly rejectedRows: number;
  readonly skippedRows: number;
}

// Pinned rather than runtime-derived so validation does not change with an
// iOS/Android JavaScript engine upgrade. Includes active ISO 4217 tender and
// fund codes needed by broker exports as of this schema version.
const ISO_4217_CURRENCIES = new Set([
  "AED", "AFN", "ALL", "AMD", "ANG", "AOA", "ARS", "AUD", "AWG", "AZN",
  "BAM", "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BRL",
  "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHF", "CLP", "CNY",
  "COP", "CRC", "CUC", "CUP", "CVE", "CZK", "DJF", "DKK", "DOP", "DZD",
  "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP", "GEL", "GHS", "GIP",
  "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HRK", "HTG", "HUF", "IDR",
  "ILS", "INR", "IQD", "IRR", "ISK", "JMD", "JOD", "JPY", "KES", "KGS",
  "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK", "LBP", "LKR",
  "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK", "MNT", "MOP",
  "MRU", "MUR", "MVR", "MWK", "MXN", "MYR", "MZN", "NAD", "NGN", "NIO",
  "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK", "PHP", "PKR", "PLN",
  "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR", "SBD", "SCR", "SDG",
  "SEK", "SGD", "SHP", "SLE", "SOS", "SRD", "SSP", "STN", "SVC", "SYP",
  "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY", "TTD", "TWD", "TZS",
  "UAH", "UGX", "USD", "UYU", "UZS", "VES", "VND", "VUV", "WST", "XAF",
  "XCD", "XCG", "XDR", "XOF", "XPF", "XSU", "YER", "ZAR", "ZMW", "ZWG",
]);

function validatedCurrency(raw: string): string | null {
  const currency = raw.trim().toLocaleUpperCase("en-US");
  return ISO_4217_CURRENCIES.has(currency) ? currency : null;
}

function validatedSymbol(raw: string): string | null {
  const symbol = raw.trim().toLocaleUpperCase("en-US");
  return /^[A-Z0-9][A-Z0-9._:/-]{0,31}$/.test(symbol) ? symbol : null;
}

function cellFor(record: CsvRecord, index: number | null): CsvCell | undefined {
  return index === null ? undefined : record.cells[index];
}

function fieldLocation(record: CsvRecord, cell: CsvCell | undefined): CsvLocation {
  return cell?.location ?? {
    logicalRow: record.logicalRow,
    physicalLineStart: record.physicalLineStart,
    physicalLineEnd: record.physicalLineEnd,
  };
}

function rowIssue(
  record: CsvRecord,
  code: CsvRowIssueCode,
  message: string,
  field?: CsvImportField,
  cell?: CsvCell,
): CsvRowIssue {
  return {
    stage: "row",
    severity: code === "csv_blank_row" ? "warning" : "error",
    code,
    message,
    location: fieldLocation(record, cell),
    ...(field === undefined ? {} : { field }),
    ...(cell === undefined ? {} : { rawValue: cell.value }),
  };
}

function requiredValue(
  record: CsvRecord,
  mapping: CsvHeaderMapping,
  field: CsvImportField,
  issues: CsvRowIssue[],
): { readonly cell: CsvCell; readonly value: string } | null {
  const cell = cellFor(record, mapping[field]);
  const value = cell?.value.trim() ?? "";
  if (cell === undefined || value.length === 0) {
    issues.push(rowIssue(record, "csv_missing_value", `${field} is required.`, field, cell));
    return null;
  }
  return { cell, value };
}

function decimalRowValue(
  record: CsvRecord,
  source: { readonly cell: CsvCell; readonly value: string } | null,
  field: "quantity" | "price" | "fee",
  issues: CsvRowIssue[],
  allowZero: boolean,
): CanonicalDecimal | null {
  if (source === null) {
    return null;
  }
  const parsed = canonicalizeDecimal(source.value, { allowZero });
  if (!parsed.ok) {
    const code: CsvRowIssueCode = field === "quantity"
      ? "csv_invalid_quantity"
      : field === "price"
        ? "csv_invalid_price"
        : "csv_invalid_fee";
    issues.push(rowIssue(record, code, parsed.message, field, source.cell));
    return null;
  }
  return parsed.value;
}

function timestampIssueCode(code: ExecutionTimestampErrorCode): CsvRowIssueCode {
  if (code === "ambiguous_local_time") {
    return "csv_ambiguous_local_time";
  }
  if (code === "nonexistent_local_time") {
    return "csv_nonexistent_local_time";
  }
  return "csv_invalid_timestamp";
}

function previewRecord(
  record: CsvRecord,
  headerWidth: number,
  mapping: CsvHeaderMapping,
  timeZone: string,
  defaultCurrency: string,
): { readonly row: CsvExecutionPreview | null; readonly issues: readonly CsvRowIssue[] } {
  const issues: CsvRowIssue[] = [];
  if (record.cells.every((cell) => cell.value.trim().length === 0)) {
    return {
      row: null,
      issues: [rowIssue(record, "csv_blank_row", "Blank row will be skipped.")],
    };
  }
  if (record.cells.length !== headerWidth) {
    issues.push(rowIssue(
      record,
      "csv_column_count_mismatch",
      `Row has ${record.cells.length} fields; the header has ${headerWidth}.`,
    ));
  }

  const symbolSource = requiredValue(record, mapping, "symbol", issues);
  const sideSource = requiredValue(record, mapping, "side", issues);
  const quantitySource = requiredValue(record, mapping, "quantity", issues);
  const priceSource = requiredValue(record, mapping, "price", issues);
  const timestampSource = requiredValue(record, mapping, "executedAt", issues);
  const executionIdCell = cellFor(record, mapping.executionId);
  const executionIdValue = executionIdCell?.value.trim() ?? "";
  const executionId = executionIdValue.length === 0 ? null : executionIdValue;
  if (
    executionId !== null
    && (executionId.length > 256 || /[\u0000-\u001f\u007f]/.test(executionId))
  ) {
    issues.push(rowIssue(
      record,
      "csv_invalid_execution_id",
      "Execution ID must contain 1-256 visible characters without control characters.",
      "executionId",
      executionIdCell,
    ));
  }
  const symbol = symbolSource === null ? null : validatedSymbol(symbolSource.value);
  if (symbolSource !== null && symbol === null) {
    issues.push(rowIssue(
      record,
      "csv_invalid_symbol",
      "Use 1-32 ASCII letters, digits, dots, slashes, colons, underscores, or hyphens.",
      "symbol",
      symbolSource.cell,
    ));
  }
  const side = sideSource === null ? null : parseSideAlias(sideSource.value);
  if (side !== null && !side.ok) {
    issues.push(rowIssue(record, "csv_invalid_side", side.message, "side", sideSource?.cell));
  }
  const quantity = decimalRowValue(record, quantitySource, "quantity", issues, false);
  const price = decimalRowValue(record, priceSource, "price", issues, false);

  const feeCell = cellFor(record, mapping.fee);
  const feeSource = feeCell === undefined || feeCell.value.trim().length === 0
    ? null
    : { cell: feeCell, value: feeCell.value.trim() };
  const zeroFee = canonicalizeDecimal("0", { allowZero: true });
  const fee = feeSource === null
    ? (zeroFee.ok ? zeroFee.value : null)
    : decimalRowValue(record, feeSource, "fee", issues, true);

  const currencyCell = cellFor(record, mapping.currency);
  const rawCurrency = currencyCell?.value.trim() || defaultCurrency;
  const currency = validatedCurrency(rawCurrency);
  if (currency === null) {
    issues.push(rowIssue(
      record,
      "csv_invalid_currency",
      "Use a three-letter ISO-style currency code such as USD.",
      "currency",
      currencyCell,
    ));
  }

  const timestamp = timestampSource === null
    ? null
    : parseExecutionTimestamp(timestampSource.value, timeZone);
  if (timestamp !== null && !timestamp.ok) {
    issues.push(rowIssue(
      record,
      timestampIssueCode(timestamp.code),
      timestamp.message,
      "executedAt",
      timestampSource?.cell,
    ));
  }

  const hasError = issues.some((issue) => issue.severity === "error");
  if (
    hasError
    || symbol === null
    || side === null
    || !side.ok
    || quantity === null
    || price === null
    || fee === null
    || currency === null
    || timestamp === null
    || !timestamp.ok
    || (executionId !== null && (executionId.length > 256 || /[\u0000-\u001f\u007f]/.test(executionId)))
  ) {
    return { row: null, issues };
  }

  return {
    row: {
      source: {
        logicalRow: record.logicalRow,
        physicalLineStart: record.physicalLineStart,
        physicalLineEnd: record.physicalLineEnd,
      },
      executionId,
      symbol,
      side: side.side,
      positionEffect: side.positionEffect,
      quantity,
      price,
      fee,
      currency,
      executedAt: timestamp.instantIso,
    },
    issues,
  };
}

/** Produces a non-mutating import preview. Persistence/commit is intentionally out of scope. */
export function previewGenericCsvImport(
  input: string,
  options: GenericCsvPreviewOptions,
): GenericCsvPreview {
  const document = parseCsvDocument(input, options.limits);
  const issues: CsvPreviewIssue[] = [...document.issues];
  const header = document.records[0] ?? null;
  if (header === null) {
    return {
      status: "invalid",
      document,
      header: null,
      mapping: null,
      rows: [],
      issues,
      totalDataRows: 0,
      validRows: 0,
      rejectedRows: 0,
      skippedRows: 0,
    };
  }

  const headerValidation = validateCsvHeader(header);
  issues.push(...headerValidation.issues);
  const mappingResult = options.mapping === undefined
    ? inferCsvHeaderMapping(header)
    : validateCsvHeaderMapping(header, options.mapping);
  issues.push(...mappingResult.issues);

  const timeZone = canonicalTimeZone(options.timeZone);
  if (timeZone === null) {
    issues.push({
      stage: "configuration",
      severity: "error",
      code: "csv_invalid_time_zone",
      message: "Select a valid IANA time zone before previewing this CSV.",
    });
  }
  const defaultCurrency = validatedCurrency(options.defaultCurrency ?? "USD");
  if (defaultCurrency === null) {
    issues.push({
      stage: "configuration",
      severity: "error",
      code: "csv_invalid_default_currency",
      message: "Default currency must be a three-letter ISO-style code.",
    });
  }

  const blockingSetupIssue = issues.some((issue) => issue.severity === "error");
  const rows: CsvExecutionPreview[] = [];
  const dataRecords = document.records.slice(1);
  let rejectedRows = blockingSetupIssue ? dataRecords.length : 0;
  let skippedRows = 0;
  if (!blockingSetupIssue && timeZone !== null && defaultCurrency !== null) {
    for (const record of dataRecords) {
      const result = previewRecord(
        record,
        header.cells.length,
        mappingResult.mapping,
        timeZone,
        defaultCurrency,
      );
      issues.push(...result.issues);
      if (result.row !== null) {
        rows.push(result.row);
      } else if (result.issues.some((issue) => issue.severity === "error")) {
        rejectedRows += 1;
      } else {
        skippedRows += 1;
      }
    }
  }

  return {
    status: issues.some((issue) => issue.severity === "error") ? "invalid" : "ready",
    document,
    header,
    mapping: mappingResult.mapping,
    rows,
    issues,
    totalDataRows: dataRecords.length,
    validRows: rows.length,
    rejectedRows,
    skippedRows,
  };
}
