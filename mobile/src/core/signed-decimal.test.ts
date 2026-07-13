import { describe, expect, it } from "vitest";

import {
  absoluteSignedDecimal,
  addSignedDecimals,
  compareSignedDecimals,
  divideSignedDecimals,
  multiplySignedDecimals,
  negateSignedDecimal,
  sumSignedDecimals,
} from "./signed-decimal";

describe("exact signed analytics decimals", () => {
  it("adds values beyond binary floating-point precision exactly", () => {
    expect(addSignedDecimals("9007199254740993.0001", "0.0002"))
      .toBe("9007199254740993.0003");
    expect(sumSignedDecimals(["0.1", "0.2", "-0.3"])).toBe("0");
  });

  it("compares and takes absolute values without Number coercion", () => {
    expect(compareSignedDecimals("-0.0000000000001", "0")).toBe(-1);
    expect(compareSignedDecimals("10", "9.999999999999")).toBe(1);
    expect(absoluteSignedDecimal("-12.34")).toBe("12.34");
    expect(negateSignedDecimal("12.34")).toBe("-12.34");
    expect(negateSignedDecimal("0")).toBe("0");
  });

  it("multiplies signed values exactly without Number coercion", () => {
    expect(multiplySignedDecimals("9007199254740993.0001", "-0.0002"))
      .toBe("-1801439850948.19860002");
    expect(multiplySignedDecimals("-1.25", "-8")).toBe("10");
    expect(multiplySignedDecimals("0", "-999999999999999999")).toBe("0");
  });

  it("derives a rounded signed ratio as a decimal string", () => {
    expect(divideSignedDecimals("2", "3", 6)).toBe("0.666667");
    expect(divideSignedDecimals("-2", "3", 6)).toBe("-0.666667");
    expect(divideSignedDecimals("10000000000000000.1", "2", 2))
      .toBe("5000000000000000.05");
  });

  it("rounds exact ties away from zero", () => {
    expect(divideSignedDecimals("1", "2", 0)).toBe("1");
    expect(divideSignedDecimals("-1", "2", 0)).toBe("-1");
    expect(divideSignedDecimals("-0.0000000000005", "1", 12))
      .toBe("-0.000000000001");
  });

  it("rejects non-canonical or invalid ratio inputs", () => {
    expect(() => addSignedDecimals("01", "1")).toThrow(TypeError);
    expect(() => divideSignedDecimals("1", "0")).toThrow(RangeError);
    expect(() => divideSignedDecimals("1", "-2")).toThrow(RangeError);
  });
});
