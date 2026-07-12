import { describe, expect, it } from "vitest";

import {
  ExecutionInputError,
  type ExecutionInput,
  validateExecutionInput,
} from "./execution-input";

function validInput(overrides: Partial<ExecutionInput> = {}): ExecutionInput {
  return {
    accountName: "Main brokerage",
    timeZone: "America/New_York",
    defaultCurrency: "USD",
    symbol: " aapl ",
    assetClass: "stock",
    side: "BUY",
    positionEffect: "OPEN",
    quantity: "001.2500",
    price: "0100.5000",
    fee: "0.10",
    executedAt: "2026-07-12T09:30:00",
    ...overrides,
  };
}

describe("manual execution input", () => {
  it("canonicalizes exact decimals, symbol, currency, local time, and fee minor units", () => {
    expect(validateExecutionInput(validInput())).toEqual({
      accountName: "Main brokerage",
      timeZone: "America/New_York",
      defaultCurrency: "USD",
      symbol: "AAPL",
      assetClass: "stock",
      side: "BUY",
      positionEffect: "OPEN",
      quantity: "1.25",
      price: "100.5",
      fee: "0.1",
      feeMinor: "10",
      minorUnit: 2,
      enteredAt: "2026-07-12T09:30:00",
      executedAt: "2026-07-12T13:30:00Z",
      occurredAtUs: "1783863000000000",
    });
  });

  it("accepts an explicit offset during an ambiguous local clock hour", () => {
    const result = validateExecutionInput(validInput({
      executedAt: "2026-11-01T01:30:00-04:00",
    }));
    expect(result.executedAt).toBe("2026-11-01T05:30:00Z");
  });

  it("accepts either valid offset during an ambiguous local clock hour", () => {
    const later = validateExecutionInput(validInput({
      executedAt: "2026-11-01T01:30:00-05:00",
    }));
    expect(later.executedAt).toBe("2026-11-01T06:30:00Z");
  });

  it("accepts the UI's minute-precision wall time with a matching fold offset", () => {
    const result = validateExecutionInput(validInput({
      executedAt: "2026-11-01T01:30-04:00",
    }));
    expect(result.executedAt).toBe("2026-11-01T05:30:00Z");
  });

  it("accepts a matching explicit offset outside a clock fold", () => {
    const result = validateExecutionInput(validInput({
      executedAt: "2026-07-12T09:30:00-04:00",
    }));
    expect(result.executedAt).toBe("2026-07-12T13:30:00Z");
  });

  it("rejects an explicit offset that does not match the selected IANA zone", () => {
    expect(() => validateExecutionInput(validInput({
      executedAt: "2026-07-12T09:30:00+14:00",
    }))).toThrow(/does not match America\/New_York/);
  });

  it("preserves a valid IANA alias in the reviewed workspace contract", () => {
    expect(validateExecutionInput(validInput({ timeZone: "US/Eastern" })).timeZone)
      .toBe("US/Eastern");
  });

  it("keeps the largest supported four-digit year inside SQLite's integer range", () => {
    const result = validateExecutionInput(validInput({
      timeZone: "UTC",
      executedAt: "9999-12-31T23:59:59.999999Z",
    }));
    expect(BigInt(result.occurredAtUs)).toBeLessThanOrEqual(9_223_372_036_854_775_807n);
  });

  it.each([
    ["2026-03-08T02:30:00", /does not exist/],
    ["2026-11-01T01:30:00", /occurs more than once/],
    ["1969-12-31T23:59:59Z", /on or after 1970/],
    ["2026-07-12T09:30:00.0000001Z", /microsecond precision/],
  ])("rejects unsupported timestamp %s", (executedAt, message) => {
    expect(() => validateExecutionInput(validInput({ executedAt }))).toThrow(message);
  });

  it.each([
    [{ quantity: "0" }, "invalid_quantity"],
    [{ price: "1e2" }, "invalid_price"],
    [{ fee: "0.001" }, "invalid_fee"],
    [{ defaultCurrency: "BTC" }, "invalid_currency"],
    [{ symbol: "AAPL!" }, "invalid_symbol"],
    [{ accountName: " Main " }, "invalid_name"],
  ] satisfies readonly [Partial<ExecutionInput>, string][])(
    "rejects invalid financial or identity input %#",
    (overrides, code) => {
      try {
        validateExecutionInput(validInput(overrides));
        throw new Error("Expected validation to fail");
      } catch (error) {
        expect(error).toBeInstanceOf(ExecutionInputError);
        expect((error as ExecutionInputError).code).toBe(code);
      }
    },
  );

  it("rejects fees outside SQLite's signed integer range", () => {
    expect(() => validateExecutionInput(validInput({
      fee: "92233720368547758.08",
    }))).toThrow(/integer range/);
  });
});
