import { describe, expect, it } from "vitest";

import fixture from "../../../contracts/fixtures/risk/sizing.json";
import { sizePosition } from "./sizing";

describe("fixed-fractional position sizing", () => {
  for (const testCase of fixture.cases) {
    it(`matches the shared CPython oracle for ${testCase.id}`, () => {
      expect(sizePosition({
        ...testCase.input,
        side: testCase.input.side as "long" | "short",
      })).toEqual(testCase.expected);
    });
  }

  it("rejects stops on the wrong side", () => {
    expect(() => sizePosition({
      entryPrice: 100,
      stopPrice: 95,
      side: "short",
      maxRiskPerTradePct: 1,
      maxPositionSizePct: 20,
    })).toThrow("above entry");
  });

  it("rejects non-finite external input", () => {
    expect(() => sizePosition({
      entryPrice: Number.NaN,
      stopPrice: 95,
      side: "long",
      maxRiskPerTradePct: 1,
      maxPositionSizePct: 20,
    })).toThrow("positive number");
  });

  it("rejects positive inputs whose derived percentages overflow", () => {
    expect(() => sizePosition({
      entryPrice: Number.MIN_VALUE,
      stopPrice: 1,
      side: "short",
      maxRiskPerTradePct: 1,
      maxPositionSizePct: 20,
    })).toThrow("Stop distance must be a positive number");
  });

  it("rejects finite intermediates that overflow during decimal rounding", () => {
    expect(() => sizePosition({
      entryPrice: 100,
      stopPrice: 99,
      side: "long",
      maxRiskPerTradePct: 1e305,
      maxPositionSizePct: Number.MAX_VALUE,
    })).toThrow("Rounded position size must be a positive number");
  });
});
