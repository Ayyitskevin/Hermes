import { describe, expect, it } from "vitest";

import type { CsvHeaderMapping } from "../core/csv";
import { JournalImportError, type PreparedCsvImport } from "./journal-store";
import {
  csvImportRevision,
  prepareCsvImport,
  verifyPreparedCsvImport,
} from "./prepare-csv-import";

const VALID_CSV = "Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
  + "AAPL,BTO,2.5000,100.25,0.10,USD,2026-07-01T09:30:00-04:00\r\n"
  + "AAPL,STC,1,101.50,0.05,USD,2026-07-01T14:00:00Z";

function prepare(overrides: Partial<Parameters<typeof prepareCsvImport>[0]> = {}) {
  return prepareCsvImport({
    rawInput: VALID_CSV,
    sourceName: "broker-export.csv",
    accountName: "Main brokerage",
    timeZone: "America/New_York",
    defaultCurrency: "usd",
    ...overrides,
  });
}

function expectPreviewChanged(operation: () => unknown): JournalImportError {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(JournalImportError);
    const importError = error as JournalImportError;
    expect(importError.conflict.code).toBe("preview_changed");
    return importError;
  }
  throw new Error("Expected JournalImportError");
}

function withoutRevision(command: PreparedCsvImport) {
  return {
    sourceName: command.sourceName,
    accountName: command.accountName,
    timeZone: command.timeZone,
    defaultCurrency: command.defaultCurrency,
    rawInput: command.rawInput,
    mapping: command.mapping,
    preview: command.preview,
  };
}

describe("CSV import preparation", () => {
  it("creates a deterministic command from canonical options and preview data", () => {
    const first = prepare();
    const second = prepare();

    expect(first.sourceName).toBe("broker-export.csv");
    expect(first.accountName).toBe("Main brokerage");
    expect(first.defaultCurrency).toBe("USD");
    expect(first.mapping).toBeNull();
    expect(first.preview.status).toBe("ready");
    expect(first.preview.validRows).toBe(2);
    expect(first.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toEqual(first);
    expect(csvImportRevision(withoutRevision(first))).toBe(first.revision);
  });

  it("verifies a valid command by reparsing and returns the canonical rebuild", () => {
    const prepared = prepare();
    const verified = verifyPreparedCsvImport(prepared);

    expect(verified).toEqual(prepared);
    expect(verified).not.toBe(prepared);
    expect(verified.preview).not.toBe(prepared.preview);
  });

  it.each([
    ["sourceName", ""],
    ["sourceName", " export.csv"],
    ["sourceName", "export.csv "],
    ["accountName", ""],
    ["accountName", " Main"],
    ["accountName", "Main "],
  ] as const)("rejects an invalid trimmed %s", (field, value) => {
    expectPreviewChanged(() => prepare({ [field]: value }));
  });

  it("bounds source and account names while preserving safe text data", () => {
    expectPreviewChanged(() => prepare({ sourceName: "x".repeat(257) }));
    expectPreviewChanged(() => prepare({ accountName: "x".repeat(257) }));
    expect(prepare({ sourceName: "<broker & export>.csv" }).sourceName).toBe(
      "<broker & export>.csv",
    );
  });

  it("returns an invalid CSV preview for correction instead of throwing", () => {
    const prepared = prepare({
      rawInput: "Symbol,Side,Quantity,Price,Timestamp\n<script>,LONG,1e2,0,not-a-date",
    });

    expect(prepared.preview.status).toBe("invalid");
    expect(prepared.preview.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "csv_invalid_symbol", rawValue: "<script>" }),
      expect.objectContaining({ code: "csv_invalid_side", rawValue: "LONG" }),
      expect.objectContaining({ code: "csv_invalid_quantity", rawValue: "1e2" }),
    ]));
    const error = expectPreviewChanged(() => verifyPreparedCsvImport(prepared));
    expect(error.conflict.issues).toEqual(prepared.preview.issues);
  });

  it("requires all accepted executions to use the workspace currency", () => {
    const prepared = prepare({
      rawInput: "Symbol,Side,Quantity,Price,Currency,Timestamp\n"
        + "AAPL,BUY,1,100,USD,2026-07-01T13:30:00Z\n"
        + "SAP,BUY,1,200,EUR,2026-07-01T13:31:00Z",
    });

    expect(prepared.preview.status).toBe("invalid");
    expect(prepared.preview.totalDataRows).toBe(2);
    expect(prepared.preview.validRows).toBe(1);
    expect(prepared.preview.rejectedRows).toBe(1);
    expect(prepared.preview.skippedRows).toBe(0);
    expect(prepared.preview.rows.map((row) => row.symbol)).toEqual(["AAPL"]);
    expect(prepared.preview.issues).toContainEqual(expect.objectContaining({
      code: "csv_invalid_currency",
      rawValue: "EUR",
      message: expect.stringContaining("workspace uses USD"),
    }));
    expectPreviewChanged(() => verifyPreparedCsvImport(prepared));
  });

  it("accepts one non-USD workspace currency when every row agrees", () => {
    const prepared = prepare({
      defaultCurrency: "eur",
      rawInput: "Symbol,Side,Quantity,Price,Currency,Timestamp\n"
        + "SAP,BUY,1,200,EUR,2026-07-01T13:31:00Z",
    });
    expect(prepared.defaultCurrency).toBe("EUR");
    expect(prepared.preview.status).toBe("ready");
    expect(verifyPreparedCsvImport(prepared)).toEqual(prepared);
  });

  it("rejects currencies the v1 ledger cannot persist before enabling commit", () => {
    const prepared = prepare({
      defaultCurrency: "MXN",
      rawInput: "Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\n"
        + "AAPL,BUY,1,100,0,MXN,2026-07-01T13:30:00Z",
    });

    expect(prepared.preview.status).toBe("invalid");
    expect(prepared.preview.rows).toEqual([]);
    expect(prepared.preview.issues).toContainEqual(expect.objectContaining({
      code: "csv_invalid_currency",
      rawValue: "MXN",
      message: expect.stringContaining("not yet supported"),
    }));
    expectPreviewChanged(() => verifyPreparedCsvImport(prepared));
  });

  it("rejects fee precision the selected currency cannot persist", () => {
    const prepared = prepare({
      rawInput: "Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\n"
        + "AAPL,BUY,1,100,0.001,USD,2026-07-01T13:30:00Z",
    });

    expect(prepared.preview.status).toBe("invalid");
    expect(prepared.preview.rows).toEqual([]);
    expect(prepared.preview.issues).toContainEqual(expect.objectContaining({
      code: "csv_invalid_fee",
      rawValue: "0.001",
      message: expect.stringContaining("at most 2 fractional digits"),
    }));
  });

  it("rejects fees that overflow SQLite minor-unit storage", () => {
    const prepared = prepare({
      rawInput: "Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\n"
        + "AAPL,BUY,1,100,999999999999999999,USD,2026-07-01T13:30:00Z",
    });

    expect(prepared.preview.status).toBe("invalid");
    expect(prepared.preview.rows).toEqual([]);
    expect(prepared.preview.issues).toContainEqual(expect.objectContaining({
      code: "csv_invalid_fee",
      rawValue: "999999999999999999",
      message: expect.stringContaining("integer range"),
    }));
  });

  it("rejects nonzero timestamp precision beyond microseconds before commit", () => {
    const prepared = prepare({
      rawInput: "Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\n"
        + "AAPL,BUY,1,100,0,USD,2026-07-01T13:30:00.1234567Z",
    });

    expect(prepared.preview.status).toBe("invalid");
    expect(prepared.preview.rows).toEqual([]);
    expect(prepared.preview.issues).toContainEqual(expect.objectContaining({
      code: "csv_invalid_timestamp",
      rawValue: "2026-07-01T13:30:00.1234567Z",
      message: expect.stringContaining("microseconds"),
    }));
  });

  it("rejects pre-epoch timestamps that the local ledger cannot persist", () => {
    const prepared = prepare({
      rawInput: "Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\n"
        + "AAPL,BUY,1,100,0,USD,1900-01-01T00:00:00Z",
    });

    expect(prepared.preview.status).toBe("invalid");
    expect(prepared.preview.rows).toEqual([]);
    expect(prepared.preview.issues).toContainEqual(expect.objectContaining({
      code: "csv_invalid_timestamp",
      rawValue: "1900-01-01T00:00:00Z",
      message: expect.stringContaining("on or after 1970-01-01"),
    }));
  });

  it("copies an explicit mapping so later caller mutation cannot alter the preview command", () => {
    const mutableMapping = {
      executionId: null,
      symbol: 0,
      side: 1,
      quantity: 2,
      price: 3,
      fee: null,
      currency: null,
      executedAt: 4,
    } satisfies CsvHeaderMapping;
    const prepared = prepare({
      rawInput: "A,B,C,D,E\nAAPL,BUY,1,100,2026-07-01T13:30:00Z",
      mapping: mutableMapping,
    });
    mutableMapping.price = 2;

    expect(prepared.mapping?.price).toBe(3);
    expect(prepared.preview.status).toBe("ready");
  });
});

describe("CSV preview revision verification", () => {
  it("detects raw input and option drift", () => {
    const prepared = prepare();
    expectPreviewChanged(() => verifyPreparedCsvImport({
      ...prepared,
      rawInput: `${prepared.rawInput}\n`,
    }));
    expectPreviewChanged(() => verifyPreparedCsvImport({
      ...prepared,
      timeZone: "UTC",
    }));
    expectPreviewChanged(() => verifyPreparedCsvImport({
      ...prepared,
      accountName: "Another account",
    }));
  });

  it("detects canonical row, issue, count, and raw-record preview drift", () => {
    const prepared = prepare();
    const firstRow = prepared.preview.rows[0];
    if (firstRow === undefined) {
      throw new Error("Expected a preview row");
    }
    const changedRow = {
      ...firstRow,
      price: firstRow.quantity,
    };
    expectPreviewChanged(() => verifyPreparedCsvImport({
      ...prepared,
      preview: {
        ...prepared.preview,
        rows: [changedRow, ...prepared.preview.rows.slice(1)],
      },
    }));
    expectPreviewChanged(() => verifyPreparedCsvImport({
      ...prepared,
      preview: {
        ...prepared.preview,
        validRows: 99,
      },
    }));

    const firstRecord = prepared.preview.document.records[0];
    if (firstRecord === undefined) {
      throw new Error("Expected a source record");
    }
    expectPreviewChanged(() => verifyPreparedCsvImport({
      ...prepared,
      preview: {
        ...prepared.preview,
        document: {
          ...prepared.preview.document,
          records: [{ ...firstRecord, sourceText: "changed" }, ...prepared.preview.document.records.slice(1)],
        },
      },
    }));
  });

  it("reparses to defeat a digest recalculated over a forged preview", () => {
    const prepared = prepare();
    const firstRow = prepared.preview.rows[0];
    if (firstRow === undefined) {
      throw new Error("Expected a preview row");
    }
    const forgedDraft = {
      ...withoutRevision(prepared),
      preview: {
        ...prepared.preview,
        rows: [{ ...firstRow, price: firstRow.quantity }, ...prepared.preview.rows.slice(1)],
      },
    };
    const forged: PreparedCsvImport = {
      ...forgedDraft,
      revision: csvImportRevision(forgedDraft),
    };

    expect(forged.revision).not.toBe(prepared.revision);
    expectPreviewChanged(() => verifyPreparedCsvImport(forged));
  });

  it("includes exact issue data in invalid-preview revisions", () => {
    const prepared = prepare({
      rawInput: "Symbol,Side,Quantity,Price,Timestamp\nAAPL,LONG,1,100,now",
    });
    const firstIssue = prepared.preview.issues[0];
    if (firstIssue === undefined) {
      throw new Error("Expected an issue");
    }
    const changed = {
      ...withoutRevision(prepared),
      preview: {
        ...prepared.preview,
        issues: [{ ...firstIssue, message: "changed" }, ...prepared.preview.issues.slice(1)],
      },
    };
    expect(csvImportRevision(changed)).not.toBe(prepared.revision);
  });

  it("converts malformed runtime commands into preview_changed JournalImportError", () => {
    const prepared = prepare();
    const malformed = {
      ...prepared,
      preview: null,
    } as unknown as PreparedCsvImport;
    expectPreviewChanged(() => verifyPreparedCsvImport(malformed));
  });
});
