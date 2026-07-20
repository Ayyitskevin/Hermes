import { describe, expect, it } from "vitest";

import {
  inferCsvHeaderMapping,
  parseCsvDocument,
  parseExecutionTimestamp,
  parseSideAlias,
  previewGenericCsvImport,
  validateCsvHeader,
  validateCsvHeaderMapping,
} from "./csv";

function firstRecord(csv: string) {
  const record = parseCsvDocument(csv).records[0];
  if (record === undefined) {
    throw new Error("Expected a CSV record");
  }
  return record;
}

describe("RFC 4180 parsing", () => {
  it("handles a UTF-8 BOM, CRLF, quoted commas/newlines, and escaped quotes", () => {
    const input = "\uFEFFsymbol,note\r\nAAPL,\"first, line\r\nsecond \"\"quoted\"\" line\"\r\n";
    const parsed = parseCsvDocument(input);

    expect(parsed.issues).toEqual([]);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[0]).toMatchObject({
      logicalRow: 1,
      physicalLineStart: 1,
      physicalLineEnd: 1,
    });
    expect(parsed.records[1]).toMatchObject({
      logicalRow: 2,
      physicalLineStart: 2,
      physicalLineEnd: 3,
    });
    expect(parsed.records[1]?.cells[1]).toEqual({
      value: "first, line\r\nsecond \"quoted\" line",
      location: {
        logicalRow: 2,
        physicalLineStart: 2,
        physicalLineEnd: 3,
        fieldIndex: 2,
      },
    });
    expect(parsed.records.map((record) => record.sourceText).join("")).toBe(input);
    expect(parsed.records[0]?.sourceText).toBe("\uFEFFsymbol,note\r\n");
    expect(parsed.records[1]?.sourceText).toBe(
      "AAPL,\"first, line\r\nsecond \"\"quoted\"\" line\"\r\n",
    );
  });

  it("accepts LF and lone CR endings without manufacturing a trailing row", () => {
    const parsed = parseCsvDocument("a,b\n1,2\r3,4\r\n");
    expect(parsed.records.map((record) => record.cells.map((cell) => cell.value))).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });

  it("keeps hostile-looking strings as inert cell data", () => {
    const parsed = parseCsvDocument(
      "symbol,note\r\nAAPL,\"=HYPERLINK(\"\"https://evil.invalid\"\",\"\"click\"\")\"\r\n"
      + "MSFT,\"<script>alert('x')</script>; DROP TABLE trades;\"",
    );

    expect(parsed.issues).toEqual([]);
    expect(parsed.records[1]?.cells[1]?.value).toBe(
      "=HYPERLINK(\"https://evil.invalid\",\"click\")",
    );
    expect(parsed.records[2]?.cells[1]?.value).toBe(
      "<script>alert('x')</script>; DROP TABLE trades;",
    );
  });

  it.each([
    ["a\"b,c", "csv_unexpected_quote"],
    ["\"a\"x,b", "csv_trailing_character_after_quote"],
    ["a,\"unterminated", "csv_unterminated_quote"],
  ])("reports malformed quoting for %s", (csv, code) => {
    expect(parseCsvDocument(csv).issues).toContainEqual(expect.objectContaining({ code }));
  });

  it("reports empty input and enforces byte, row, field-count, and field-byte limits", () => {
    expect(parseCsvDocument("").issues).toContainEqual(expect.objectContaining({
      code: "csv_empty_document",
    }));
    expect(parseCsvDocument("éé", { maxBytes: 3 }).issues).toContainEqual(
      expect.objectContaining({ code: "csv_file_too_large" }),
    );
    expect(parseCsvDocument("h\n1\n2", { maxRows: 2 }).issues).toContainEqual(
      expect.objectContaining({ code: "csv_too_many_rows" }),
    );
    expect(parseCsvDocument("a,b,c", { maxFieldsPerRow: 2 }).issues).toContainEqual(
      expect.objectContaining({ code: "csv_too_many_fields" }),
    );
    expect(parseCsvDocument("name\nfour", { maxFieldBytes: 3 }).issues).toContainEqual(
      expect.objectContaining({
        code: "csv_field_too_large",
        location: expect.objectContaining({ logicalRow: 2, fieldIndex: 1 }),
      }),
    );
  });

  it("rejects invalid parser limit configuration", () => {
    expect(() => parseCsvDocument("a", { maxRows: 0 })).toThrow(TypeError);
  });
});

describe("headers and inferred mappings", () => {
  it("flags blank and case-insensitive duplicate headers at their source fields", () => {
    const result = validateCsvHeader(firstRecord("Symbol, symbol ,"));
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "csv_duplicate_header",
      "csv_blank_header",
    ]);
    expect(result.issues.map((issue) => issue.location?.fieldIndex)).toEqual([2, 3]);
  });

  it("infers required and optional columns from common broker aliases", () => {
    const result = inferCsvHeaderMapping(firstRecord(
      "Ticker,Action,Shares,Fill Price,Commission,CCY,Executed At,Account",
    ));

    expect(result.mapping).toEqual({
      executionId: null,
      symbol: 0,
      side: 1,
      quantity: 2,
      price: 3,
      fee: 4,
      currency: 5,
      executedAt: 6,
    });
    expect(result.issues).toEqual([
      expect.objectContaining({
        severity: "warning",
        code: "csv_unmapped_header",
        header: "Account",
      }),
    ]);
  });

  it("does not guess when aliases are ambiguous or a required field is absent", () => {
    const ambiguous = inferCsvHeaderMapping(firstRecord(
      "Symbol,Ticker,Side,Quantity,Price,Timestamp",
    ));
    expect(ambiguous.mapping.symbol).toBeNull();
    expect(ambiguous.issues).toContainEqual(expect.objectContaining({
      code: "csv_ambiguous_header",
      field: "symbol",
    }));

    const missing = inferCsvHeaderMapping(firstRecord("Side,Quantity,Price,Timestamp"));
    expect(missing.issues).toContainEqual(expect.objectContaining({
      code: "csv_missing_required_header",
      field: "symbol",
    }));
  });

  it("validates explicit mapping indices and forbids reusing one source column", () => {
    const header = firstRecord("A,B,C,D,E");
    const valid = validateCsvHeaderMapping(header, {
      executionId: null,
      symbol: 0,
      side: 1,
      quantity: 2,
      price: 3,
      fee: null,
      currency: null,
      executedAt: 4,
    });
    expect(valid.issues).toEqual([]);

    const invalid = validateCsvHeaderMapping(header, {
      executionId: null,
      symbol: 0,
      side: 0,
      quantity: 2,
      price: 99,
      fee: null,
      currency: null,
      executedAt: 4,
    });
    expect(invalid.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "csv_duplicate_mapping_column" }),
      expect.objectContaining({ code: "csv_invalid_mapping_index", field: "price" }),
    ]));
  });
});

describe("execution side aliases", () => {
  it.each([
    ["BUY", "buy", "unspecified"],
    ["sell", "sell", "unspecified"],
    ["BTO", "buy", "open"],
    ["sell to close", "sell", "close"],
    ["STO", "sell", "open"],
    ["buy-to-close", "buy", "close"],
  ] as const)("normalizes %s with position effect", (raw, side, positionEffect) => {
    expect(parseSideAlias(raw)).toEqual({ ok: true, side, positionEffect });
  });

  it("rejects directional prose instead of guessing", () => {
    expect(parseSideAlias("long")).toMatchObject({ ok: false });
  });
});

describe("execution timestamps", () => {
  it("normalizes explicit ISO offsets to UTC while preserving sub-millisecond precision", () => {
    expect(parseExecutionTimestamp(
      "2026-07-01T09:30:15.123400-04:00",
      "not-used-for-offset-input",
    )).toEqual({
      ok: true,
      instantIso: "2026-07-01T13:30:15.1234Z",
      source: "offset",
    });
    expect(parseExecutionTimestamp("2026-07-01T13:30Z", "UTC")).toEqual({
      ok: true,
      instantIso: "2026-07-01T13:30:00Z",
      source: "offset",
    });
  });

  it("uses the selected IANA zone for a unique naive wall time", () => {
    expect(parseExecutionTimestamp("2026-07-01 09:30:00", "America/New_York")).toEqual({
      ok: true,
      instantIso: "2026-07-01T13:30:00Z",
      source: "iana",
      timeZone: "America/New_York",
    });
    expect(parseExecutionTimestamp("2026-07-01", "America/New_York")).toEqual({
      ok: true,
      instantIso: "2026-07-01T04:00:00Z",
      source: "iana",
      timeZone: "America/New_York",
    });
  });

  it("rejects ambiguous and nonexistent daylight-saving wall times", () => {
    expect(parseExecutionTimestamp(
      "2026-11-01 01:30:00",
      "America/New_York",
    )).toMatchObject({ ok: false, code: "ambiguous_local_time" });
    expect(parseExecutionTimestamp(
      "2026-03-08 02:30:00",
      "America/New_York",
    )).toMatchObject({ ok: false, code: "nonexistent_local_time" });
  });

  it.each([
    ["2026-02-29T09:30:00Z", "UTC", "invalid_timestamp"],
    ["2026-07-01T24:00:00Z", "UTC", "invalid_timestamp"],
    ["2026-07-01T09:30:00+14:01", "UTC", "invalid_timestamp"],
    ["07/01/2026 09:30", "UTC", "invalid_timestamp"],
    ["2026-07-01 09:30", "Mars/Olympus_Mons", "invalid_time_zone"],
  ])("rejects invalid timestamp/zone input %s", (raw, zone, code) => {
    expect(parseExecutionTimestamp(raw, zone)).toMatchObject({ ok: false, code });
  });
});

describe("generic execution CSV preview", () => {
  it("previews valid rows with exact decimals, inferred mapping, defaults, and locations", () => {
    const result = previewGenericCsvImport(
      "Ticker,Action,Shares,Fill Price,Commission,CCY,Executed At,Note\r\n"
      + "aapl,BTO,0002.5000,00123.4500,,usd,2026-07-01 09:30:00,\"opening, fill\"\r\n"
      + "NVDA,SELL,1,160.000000000001,0.15,USD,2026-07-01T14:31:00Z,exit",
      { timeZone: "America/New_York" },
    );

    expect(result.status).toBe("ready");
    expect(result.totalDataRows).toBe(2);
    expect(result.validRows).toBe(2);
    expect(result.rejectedRows).toBe(0);
    expect(result.skippedRows).toBe(0);
    expect(result.rows).toEqual([
      {
        source: { logicalRow: 2, physicalLineStart: 2, physicalLineEnd: 2 },
        executionId: null,
        symbol: "AAPL",
        side: "buy",
        positionEffect: "open",
        quantity: "2.5",
        price: "123.45",
        fee: "0",
        currency: "USD",
        executedAt: "2026-07-01T13:30:00Z",
      },
      {
        source: { logicalRow: 3, physicalLineStart: 3, physicalLineEnd: 3 },
        executionId: null,
        symbol: "NVDA",
        side: "sell",
        positionEffect: "unspecified",
        quantity: "1",
        price: "160.000000000001",
        fee: "0.15",
        currency: "USD",
        executedAt: "2026-07-01T14:31:00Z",
      },
    ]);
    expect(result.issues).toEqual([
      expect.objectContaining({ code: "csv_unmapped_header", header: "Note" }),
    ]);
  });

  it("preserves formula-like unmapped data without evaluating or rewriting it", () => {
    const formula = "=HYPERLINK(\"https://evil.invalid\",\"click\")";
    const result = previewGenericCsvImport(
      "Symbol,Side,Quantity,Price,Timestamp,Note\n"
      + `AAPL,BUY,1,100,2026-07-01T13:30:00Z,\"${formula.replaceAll("\"", "\"\"")}\"`,
      { timeZone: "UTC" },
    );

    expect(result.status).toBe("ready");
    expect(result.document.records[1]?.cells[5]?.value).toBe(formula);
  });

  it("honors a validated explicit mapping for otherwise unknown broker headers", () => {
    const input = "Instrument Code,Operation,Amount,Execution Value,Occurred\n"
      + "AAPL,BTC,2,101.25,2026-07-01T13:30:00Z";
    const inferred = previewGenericCsvImport(input, { timeZone: "UTC" });
    expect(inferred.status).toBe("invalid");

    const remapped = previewGenericCsvImport(input, {
      timeZone: "UTC",
      mapping: {
        executionId: null,
        symbol: 0,
        side: 1,
        quantity: 2,
        price: 3,
        fee: null,
        currency: null,
        executedAt: 4,
      },
    });
    expect(remapped.status).toBe("ready");
    expect(remapped.rows[0]).toMatchObject({
      symbol: "AAPL",
      side: "buy",
      positionEffect: "close",
      quantity: "2",
      price: "101.25",
    });
  });

  it("rejects all data rows when an explicit mapping is unsafe", () => {
    const result = previewGenericCsvImport(
      "A,B,C,D,E\nAAPL,BUY,1,100,2026-07-01T13:30:00Z",
      {
        timeZone: "UTC",
        mapping: {
          executionId: null,
          symbol: 0,
          side: 0,
          quantity: 2,
          price: 3,
          fee: null,
          currency: null,
          executedAt: 9,
        },
      },
    );
    expect(result.status).toBe("invalid");
    expect(result.validRows).toBe(0);
    expect(result.rejectedRows).toBe(1);
    expect(result.skippedRows).toBe(0);
    expect(result.totalDataRows).toBe(
      result.validRows + result.rejectedRows + result.skippedRows,
    );
  });

  it("returns typed row issues and exact raw values instead of coercing invalid data", () => {
    const result = previewGenericCsvImport(
      "Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\n"
      + "<script>,LONG,1e2,0,-1,US$,2026-02-30 09:30",
      { timeZone: "America/New_York" },
    );

    expect(result.status).toBe("invalid");
    expect(result.rows).toEqual([]);
    expect(result.rejectedRows).toBe(1);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({
        stage: "row",
        code: "csv_invalid_symbol",
        rawValue: "<script>",
      }),
      expect.objectContaining({ code: "csv_invalid_side", rawValue: "LONG" }),
      expect.objectContaining({ code: "csv_invalid_quantity", rawValue: "1e2" }),
      expect.objectContaining({ code: "csv_invalid_price", rawValue: "0" }),
      expect.objectContaining({ code: "csv_invalid_fee", rawValue: "-1" }),
      expect.objectContaining({ code: "csv_invalid_currency", rawValue: "US$" }),
      expect.objectContaining({ code: "csv_invalid_timestamp", rawValue: "2026-02-30 09:30" }),
    ]));
  });

  it("rejects unassigned three-letter currency strings, not only malformed ones", () => {
    const result = previewGenericCsvImport(
      "Symbol,Side,Quantity,Price,Currency,Timestamp\n"
      + "AAPL,BUY,1,100,ZZZ,2026-07-01T13:30:00Z",
      { timeZone: "UTC" },
    );
    expect(result.issues).toContainEqual(expect.objectContaining({
      code: "csv_invalid_currency",
      rawValue: "ZZZ",
    }));
  });

  it("surfaces DST ambiguity as a dedicated preview issue", () => {
    const result = previewGenericCsvImport(
      "Symbol,Side,Quantity,Price,Timestamp\nAAPL,BUY,1,100,2026-11-01 01:30:00",
      { timeZone: "America/New_York" },
    );
    expect(result.issues).toContainEqual(expect.objectContaining({
      stage: "row",
      code: "csv_ambiguous_local_time",
      field: "executedAt",
    }));
  });

  it("rejects option, futures, and crypto symbols as unsupported instruments", () => {
    const result = previewGenericCsvImport(
      "Symbol,Side,Quantity,Price,Timestamp\n"
      + "AAPL250117C00150000,BUY,1,2.5,2026-01-02T15:00:00Z\n"
      + "ES=F,BUY,1,5200,2026-01-02T14:30:00Z\n"
      + "BTC-USD,BUY,1,65000,2026-01-02T16:00:00Z\n"
      + "AAPL,BUY,1,100,2026-01-02T14:00:00Z",
      { timeZone: "UTC" },
    );
    expect(result.status).toBe("invalid");
    expect(result.validRows).toBe(1);
    expect(result.rejectedRows).toBe(3);
    expect(result.issues.filter((issue) => issue.code === "csv_unsupported_instrument"))
      .toHaveLength(3);
    expect(result.rows[0]?.symbol).toBe("AAPL");
  });

  it("blocks blank/duplicate headers, invalid configuration, and ragged rows", () => {
    const badHeader = previewGenericCsvImport(
      "Symbol,symbol,Side,Quantity,Price,Timestamp,\nAAPL,AAPL,BUY,1,100,2026-07-01T00:00Z,x",
      { timeZone: "UTC" },
    );
    expect(badHeader.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "csv_duplicate_header" }),
      expect.objectContaining({ code: "csv_blank_header" }),
      expect.objectContaining({ code: "csv_ambiguous_header", field: "symbol" }),
    ]));

    const badConfiguration = previewGenericCsvImport(
      "Symbol,Side,Quantity,Price,Timestamp\nAAPL,BUY,1,100,2026-07-01T00:00Z",
      { timeZone: "Not/A_Zone", defaultCurrency: "ZZZ" },
    );
    expect(badConfiguration.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "csv_invalid_time_zone" }),
      expect.objectContaining({ code: "csv_invalid_default_currency" }),
    ]));

    const ragged = previewGenericCsvImport(
      "Symbol,Side,Quantity,Price,Timestamp\nAAPL,BUY,1,100",
      { timeZone: "UTC" },
    );
    expect(ragged.issues).toContainEqual(expect.objectContaining({
      code: "csv_column_count_mismatch",
      location: expect.objectContaining({ logicalRow: 2 }),
    }));
    expect(ragged.issues).toContainEqual(expect.objectContaining({
      code: "csv_missing_value",
      field: "executedAt",
    }));
  });

  it("skips blank records with a warning and retains multiline physical locations", () => {
    const result = previewGenericCsvImport(
      "Symbol,Side,Quantity,Price,Timestamp,Note\r\n"
      + "AAPL,BUY,1,100,2026-07-01T00:00Z,\"line one\r\nline two\"\r\n"
      + ",,,,,",
      { timeZone: "UTC" },
    );

    expect(result.rows[0]?.source).toEqual({
      logicalRow: 2,
      physicalLineStart: 2,
      physicalLineEnd: 3,
    });
    expect(result.issues).toContainEqual(expect.objectContaining({
      severity: "warning",
      code: "csv_blank_row",
      location: expect.objectContaining({ logicalRow: 3, physicalLineStart: 4 }),
    }));
    expect(result.skippedRows).toBe(1);
    expect(result.totalDataRows).toBe(
      result.validRows + result.rejectedRows + result.skippedRows,
    );
  });
});
