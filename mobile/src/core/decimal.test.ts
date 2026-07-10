import { describe, expect, it } from "vitest";

import {
  canonicalizeDecimal,
  compareCanonicalDecimals,
  isCanonicalDecimalZero,
} from "./decimal";

function decimal(raw: string, allowZero = false) {
  const result = canonicalizeDecimal(raw, { allowZero });
  if (!result.ok) {
    throw new Error(result.message);
  }
  return result.value;
}

describe("canonical decimal values", () => {
  it.each([
    ["1", "1"],
    [" 001.2300 ", "1.23"],
    ["00042", "42"],
    ["0.0001000", "0.0001"],
    ["9007199254740993.000000000001", "9007199254740993.000000000001"],
  ])("canonicalizes %s exactly as a string", (raw, expected) => {
    expect(canonicalizeDecimal(raw)).toEqual({ ok: true, value: expected });
  });

  it.each(["+1", "-1", "1e3", "1E-3", ".5", "1.", "1,000", "Infinity", "NaN"])(
    "rejects non-canonical decimal syntax %s",
    (raw) => {
      expect(canonicalizeDecimal(raw)).toMatchObject({
        ok: false,
        code: "decimal_invalid_syntax",
      });
    },
  );

  it("distinguishes blank, zero, and explicitly allowed zero", () => {
    expect(canonicalizeDecimal(" \t ")).toMatchObject({
      ok: false,
      code: "decimal_blank",
    });
    expect(canonicalizeDecimal("0.000")).toMatchObject({
      ok: false,
      code: "decimal_zero_not_allowed",
    });

    const zero = decimal("000.000", true);
    expect(zero).toBe("0");
    expect(isCanonicalDecimalZero(zero)).toBe(true);
  });

  it("applies integer, fraction, and total input limits before zero trimming", () => {
    expect(canonicalizeDecimal("0001", { maxIntegerDigits: 3 })).toMatchObject({
      ok: false,
      code: "decimal_too_many_integer_digits",
    });
    expect(canonicalizeDecimal("1.0001", { maxFractionDigits: 3 })).toMatchObject({
      ok: false,
      code: "decimal_too_many_fraction_digits",
    });
    expect(canonicalizeDecimal("123.45", { maxTotalDigits: 4 })).toMatchObject({
      ok: false,
      code: "decimal_too_many_total_digits",
    });
  });

  it("rejects unsafe limit configuration loudly", () => {
    expect(() => canonicalizeDecimal("1", { maxIntegerDigits: 0 })).toThrow(TypeError);
  });

  it("compares values larger and more precise than Number can represent", () => {
    expect(compareCanonicalDecimals(
      decimal("9007199254740993.000000000001"),
      decimal("9007199254740993.000000000002"),
    )).toBe(-1);
    expect(compareCanonicalDecimals(decimal("100"), decimal("99.999999999999"))).toBe(1);
    expect(compareCanonicalDecimals(decimal("1.2"), decimal("1.20"))).toBe(0);
  });
});
