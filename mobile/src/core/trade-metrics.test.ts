import { describe, expect, it } from "vitest";

import {
  PERCENT_RETURN_DEFINITION_V1,
  RESULT_R_DEFINITION_V1,
  TRADE_METRIC_FRACTION_DIGITS,
  derivePercentReturnV1,
  deriveResultRV1,
  deriveTradeMetricsV1,
  type ExactMetricMoney,
} from "./trade-metrics";

function money(amount: string, currency = "USD"): ExactMetricMoney {
  return { amount, currency };
}

describe("versioned exact trade metrics", () => {
  it.each([
    ["positive", "100", "50", "2"],
    ["negative", "-100", "50", "-2"],
    ["zero", "0", "50", "0"],
    ["repeating positive", "1", "3", "0.333333333333"],
    ["repeating negative", "-1", "6", "-0.166666666667"],
  ])("derives %s result-R with a signed numerator", (_label, pnl, risk, expected) => {
    expect(deriveResultRV1({
      netRealizedPnl: money(pnl),
      initialRisk: money(risk),
      isPartial: false,
    })).toMatchObject({
      metric: "result-r",
      definitionVersion: RESULT_R_DEFINITION_V1,
      value: expected,
      nullReason: null,
      numerator: money(pnl),
      denominator: money(risk),
      currency: "USD",
      scaleFactor: "1",
      fractionDigits: TRADE_METRIC_FRACTION_DIGITS,
      roundingMode: "half_away_from_zero",
      isPartial: false,
    });
  });

  it.each([
    ["stock long win", "stock", "98", "1000", "9.8"],
    ["ETF loss", "etf", "-25", "500", "-5"],
    ["zero result", "stock", "0", "1000", "0"],
    ["repeating ratio", "stock", "1", "3", "33.333333333333"],
    ["short win", "stock", "37.5", "750", "5"],
  ])(
    "derives %s percent return from net P&L and full positive entry notional",
    (_label, assetClass, pnl, entryNotional, expected) => {
      expect(derivePercentReturnV1({
        assetClass,
        netRealizedPnl: money(pnl),
        fullEntryNotional: money(entryNotional),
        isPartial: false,
      })).toMatchObject({
        metric: "percent-return",
        definitionVersion: PERCENT_RETURN_DEFINITION_V1,
        value: expected,
        nullReason: null,
        numerator: money(pnl),
        denominator: money(entryNotional),
        currency: "USD",
        scaleFactor: "100",
        fractionDigits: 12,
        roundingMode: "half_away_from_zero",
      });
    },
  );

  it("treats fees as already represented in the exact net numerator", () => {
    const metrics = deriveTradeMetricsV1({
      assetClass: "stock",
      netRealizedPnl: money("98"), // 100 gross less 2 in allocated fees.
      initialRisk: money("50"),
      fullEntryNotional: money("1000"),
      isPartial: false,
    });

    expect(metrics.resultR.value).toBe("1.96");
    expect(metrics.percentReturn.value).toBe("9.8");
    expect(metrics.resultR.numerator).toEqual(money("98"));
    expect(metrics.percentReturn.numerator).toEqual(money("98"));
  });

  it("marks a realized partial exit without changing the full-entry denominator", () => {
    expect(deriveTradeMetricsV1({
      assetClass: "stock",
      netRealizedPnl: money("25"),
      initialRisk: money("100"),
      fullEntryNotional: money("1000"),
      isPartial: true,
    })).toEqual({
      resultR: expect.objectContaining({ value: "0.25", isPartial: true }),
      percentReturn: expect.objectContaining({
        value: "2.5",
        denominator: money("1000"),
        isPartial: true,
      }),
    });
  });

  it("returns inspectable reasons instead of inventing unavailable values", () => {
    expect(deriveTradeMetricsV1({
      assetClass: "stock",
      netRealizedPnl: null,
      initialRisk: null,
      fullEntryNotional: money("1000"),
      isPartial: false,
    })).toMatchObject({
      resultR: { value: null, nullReason: "no_realized_exit" },
      percentReturn: { value: null, nullReason: "no_realized_exit" },
    });

    expect(deriveResultRV1({
      netRealizedPnl: money("10"),
      initialRisk: null,
      isPartial: false,
    })).toMatchObject({ value: null, nullReason: "missing_initial_risk" });

    expect(deriveResultRV1({
      netRealizedPnl: money("10", "USD"),
      initialRisk: money("5", "EUR"),
      isPartial: false,
    })).toMatchObject({
      value: null,
      nullReason: "currency_mismatch",
      currency: null,
      numerator: money("10", "USD"),
      denominator: money("5", "EUR"),
    });

    expect(derivePercentReturnV1({
      assetClass: "option",
      netRealizedPnl: money("10"),
      fullEntryNotional: money("100"),
      isPartial: false,
    })).toMatchObject({ value: null, nullReason: "unsupported_asset" });

    expect(derivePercentReturnV1({
      assetClass: "stock",
      netRealizedPnl: money("10", "USD"),
      fullEntryNotional: money("100", "CAD"),
      isPartial: false,
    })).toMatchObject({ value: null, nullReason: "currency_mismatch" });

    for (const denominator of ["0", "-1"]) {
      expect(deriveResultRV1({
        netRealizedPnl: money("10"),
        initialRisk: money(denominator),
        isPartial: false,
      })).toMatchObject({ value: null, nullReason: "invalid_denominator" });
      expect(derivePercentReturnV1({
        assetClass: "stock",
        netRealizedPnl: money("10"),
        fullEntryNotional: money(denominator),
        isPartial: false,
      })).toMatchObject({ value: null, nullReason: "invalid_denominator" });
    }
  });
});
