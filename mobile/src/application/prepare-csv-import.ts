import { sha256Hex } from "../adapters/sqlite/schema/checksum";
import { currencyMinorUnit } from "../core/currency";
import {
  previewGenericCsvImport,
  type CsvHeaderMapping,
  type CsvPreviewIssue,
  type CsvRecord,
  type GenericCsvPreview,
} from "../core/csv";
import {
  JournalImportError,
  type PreparedCsvImport,
} from "./journal-store";

export interface PrepareCsvImportInput {
  readonly rawInput: string;
  readonly sourceName: string;
  readonly accountName: string;
  readonly timeZone: string;
  readonly defaultCurrency: string;
  readonly mapping?: CsvHeaderMapping;
}

export type CsvImportRevisionInput = Omit<PreparedCsvImport, "revision">;

const NAME_LIMIT = 256;
const MAX_SQLITE_INTEGER = 9_223_372_036_854_775_807n;
const MAPPING_FIELDS = [
  "executionId",
  "symbol",
  "side",
  "quantity",
  "price",
  "fee",
  "currency",
  "executedAt",
] as const;

function conflict(message: string, issues?: readonly CsvPreviewIssue[]): JournalImportError {
  return new JournalImportError({
    code: "preview_changed",
    message,
    ...(issues === undefined ? {} : { issues }),
  });
}

function validatedName(value: string, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > NAME_LIMIT
    || value.trim() !== value
  ) {
    throw conflict(`${label} must be a non-empty, trimmed name of at most ${NAME_LIMIT} characters.`);
  }
  return value;
}

function cloneMapping(mapping: CsvHeaderMapping | undefined): CsvHeaderMapping | null {
  if (mapping === undefined) {
    return null;
  }
  return {
    executionId: mapping.executionId,
    symbol: mapping.symbol,
    side: mapping.side,
    quantity: mapping.quantity,
    price: mapping.price,
    fee: mapping.fee,
    currency: mapping.currency,
    executedAt: mapping.executedAt,
  };
}

function mappingSnapshot(mapping: CsvHeaderMapping | null): unknown {
  return mapping === null
    ? null
    : MAPPING_FIELDS.map((field) => [field, mapping[field]]);
}

function locationSnapshot(location: {
  readonly logicalRow: number;
  readonly physicalLineStart: number;
  readonly physicalLineEnd: number;
  readonly fieldIndex?: number;
} | undefined): unknown {
  return location === undefined
    ? null
    : [
        location.logicalRow,
        location.physicalLineStart,
        location.physicalLineEnd,
        location.fieldIndex ?? null,
      ];
}

function issueSnapshot(issue: CsvPreviewIssue): unknown {
  return [
    issue.stage,
    issue.severity,
    issue.code,
    issue.message,
    locationSnapshot(issue.location),
    "field" in issue ? issue.field ?? null : null,
    "header" in issue ? issue.header ?? null : null,
    "rawValue" in issue ? issue.rawValue ?? null : null,
  ];
}

function recordSnapshot(record: CsvRecord | null): unknown {
  return record === null
    ? null
    : [
        record.logicalRow,
        record.physicalLineStart,
        record.physicalLineEnd,
        record.sourceText,
        record.cells.map((cell) => [
          cell.value,
          locationSnapshot(cell.location),
        ]),
      ];
}

function previewSnapshot(preview: GenericCsvPreview): unknown {
  return [
    preview.status,
    [
      preview.document.byteLength,
      preview.document.records.map((record) => recordSnapshot(record)),
      preview.document.issues.map((issue) => issueSnapshot(issue)),
    ],
    recordSnapshot(preview.header),
    mappingSnapshot(preview.mapping),
    preview.rows.map((row) => [
      locationSnapshot(row.source),
      row.executionId,
      row.symbol,
      row.side,
      row.positionEffect,
      row.quantity,
      row.price,
      row.fee,
      row.currency,
      row.executedAt,
    ]),
    preview.issues.map((issue) => issueSnapshot(issue)),
    preview.totalDataRows,
    preview.validRows,
    preview.rejectedRows,
    preview.skippedRows,
  ];
}

/**
 * Hashes every value the user confirms plus the complete deterministic preview.
 * Fixed-order arrays avoid object key-order and optional-property ambiguity.
 */
export function csvImportRevision(input: CsvImportRevisionInput): string {
  const payload = [
    "hermes-csv-import-preview-v1",
    input.sourceName,
    input.accountName,
    input.timeZone,
    input.defaultCurrency,
    input.rawInput,
    mappingSnapshot(input.mapping),
    previewSnapshot(input.preview),
  ];
  return sha256Hex(JSON.stringify(payload));
}

function enforceWorkspaceCurrency(
  preview: GenericCsvPreview,
  workspaceCurrency: string,
): GenericCsvPreview {
  const mismatched = preview.rows.filter((row) => row.currency !== workspaceCurrency);
  if (mismatched.length === 0) {
    return preview;
  }

  const mismatchedRows = new Set(mismatched.map((row) => row.source.logicalRow));
  const issues: CsvPreviewIssue[] = mismatched.map((row) => ({
    stage: "row",
    severity: "error",
    code: "csv_invalid_currency",
    message: `This workspace uses ${workspaceCurrency}; mixed-currency aggregation is not supported.`,
    location: row.source,
    field: "currency",
    rawValue: row.currency,
  }));
  const rows = preview.rows.filter((row) => !mismatchedRows.has(row.source.logicalRow));

  return {
    ...preview,
    status: "invalid",
    rows,
    issues: [...preview.issues, ...issues],
    validRows: rows.length,
    rejectedRows: preview.rejectedRows + mismatched.length,
  };
}

function enforceLedgerCapabilities(preview: GenericCsvPreview): GenericCsvPreview {
  const rejectedRows = new Set<number>();
  const issues: CsvPreviewIssue[] = [];
  for (const row of preview.rows) {
    const minorUnit = currencyMinorUnit(row.currency);
    if (minorUnit === null) {
      rejectedRows.add(row.source.logicalRow);
      issues.push({
        stage: "row",
        severity: "error",
        code: "csv_invalid_currency",
        message: `${row.currency} is not yet supported by the v1 local ledger.`,
        location: row.source,
        field: "currency",
        rawValue: row.currency,
      });
    } else {
      const feeFraction = row.fee.split(".", 2)[1] ?? "";
      if (/[^0]/.test(feeFraction.slice(minorUnit))) {
        rejectedRows.add(row.source.logicalRow);
        issues.push({
          stage: "row",
          severity: "error",
          code: "csv_invalid_fee",
          message: `${row.currency} fees support at most ${minorUnit} fractional digits.`,
          location: row.source,
          field: "fee",
          rawValue: row.fee,
        });
      } else {
        const [feeWhole = "0"] = row.fee.split(".", 1);
        const feeMinor = BigInt(
          `${feeWhole}${feeFraction.slice(0, minorUnit).padEnd(minorUnit, "0")}`,
        );
        if (feeMinor > MAX_SQLITE_INTEGER) {
          rejectedRows.add(row.source.logicalRow);
          issues.push({
            stage: "row",
            severity: "error",
            code: "csv_invalid_fee",
            message: "The fee is outside the v1 local ledger integer range.",
            location: row.source,
            field: "fee",
            rawValue: row.fee,
          });
        }
      }
    }
    const timestampFraction = /\.(\d+)Z$/.exec(row.executedAt)?.[1] ?? "";
    if (/[^0]/.test(timestampFraction.slice(6))) {
      rejectedRows.add(row.source.logicalRow);
      issues.push({
        stage: "row",
        severity: "error",
        code: "csv_invalid_timestamp",
        message: "The local ledger supports execution timestamps through microseconds (6 fractional digits).",
        location: row.source,
        field: "executedAt",
        rawValue: row.executedAt,
      });
    }
    const epochMilliseconds = Date.parse(row.executedAt);
    if (!Number.isSafeInteger(epochMilliseconds) || epochMilliseconds < 0) {
      rejectedRows.add(row.source.logicalRow);
      issues.push({
        stage: "row",
        severity: "error",
        code: "csv_invalid_timestamp",
        message: "The v1 local ledger supports executions on or after 1970-01-01 UTC.",
        location: row.source,
        field: "executedAt",
        rawValue: row.executedAt,
      });
    }
  }
  if (rejectedRows.size === 0) return preview;
  const rows = preview.rows.filter((row) => !rejectedRows.has(row.source.logicalRow));
  return {
    ...preview,
    status: "invalid",
    rows,
    issues: [...preview.issues, ...issues],
    validRows: rows.length,
    rejectedRows: preview.rejectedRows + rejectedRows.size,
  };
}

/** Builds a displayable preview. CSV validation errors remain in the result for the UI. */
export function prepareCsvImport(input: PrepareCsvImportInput): PreparedCsvImport {
  const sourceName = validatedName(input.sourceName, "Source name");
  const accountName = validatedName(input.accountName, "Account name");
  const timeZone = input.timeZone.trim();
  const defaultCurrency = input.defaultCurrency.trim().toLocaleUpperCase("en-US");
  const mapping = cloneMapping(input.mapping);
  const parsedPreview = previewGenericCsvImport(input.rawInput, {
    timeZone,
    defaultCurrency,
    ...(mapping === null ? {} : { mapping }),
  });
  const preview = enforceLedgerCapabilities(
    enforceWorkspaceCurrency(parsedPreview, defaultCurrency),
  );
  const revisionInput: CsvImportRevisionInput = {
    sourceName,
    accountName,
    timeZone,
    defaultCurrency,
    rawInput: input.rawInput,
    mapping,
    preview,
  };

  return {
    revision: csvImportRevision(revisionInput),
    ...revisionInput,
  };
}

/**
 * Rebuilds and compares the preview immediately before persistence. A caller
 * cannot make a stale or invalid preview committable by recalculating only its
 * digest because the raw input and options are parsed again here.
 */
export function verifyPreparedCsvImport(command: PreparedCsvImport): PreparedCsvImport {
  try {
    if (command.preview.status !== "ready") {
      throw conflict("Resolve every preview error before importing.", command.preview.issues);
    }

    const currentRevision = csvImportRevision({
      sourceName: command.sourceName,
      accountName: command.accountName,
      timeZone: command.timeZone,
      defaultCurrency: command.defaultCurrency,
      rawInput: command.rawInput,
      mapping: command.mapping,
      preview: command.preview,
    });
    if (currentRevision !== command.revision) {
      throw conflict("The CSV input, options, or displayed preview changed. Preview it again.");
    }

    const reparsed = prepareCsvImport({
      rawInput: command.rawInput,
      sourceName: command.sourceName,
      accountName: command.accountName,
      timeZone: command.timeZone,
      defaultCurrency: command.defaultCurrency,
      ...(command.mapping === null ? {} : { mapping: command.mapping }),
    });
    if (reparsed.preview.status !== "ready" || reparsed.revision !== command.revision) {
      throw conflict(
        "The CSV no longer matches the displayed preview. Preview it again.",
        reparsed.preview.issues,
      );
    }
    return reparsed;
  } catch (error) {
    if (error instanceof JournalImportError) {
      throw error;
    }
    throw conflict("The prepared CSV command is malformed or changed. Preview it again.");
  }
}
