import { describe, expect, it } from "vitest";

import { calculatePerformance, summarizeSetups } from "./performance";
import { deriveTradeMetricsV1 } from "./trade-metrics";
import type { TradePreview } from "./types";

type TradeOverrides = Partial<Omit<
  TradePreview,
  | "resultPnl"
  | "resultPnlExact"
  | "resultR"
  | "percentReturn"
  | "resultRMetric"
  | "percentReturnMetric"
  | "initialRisk"
>> & {
  readonly resultPnl?: number | null;
  readonly resultPnlExact?: string | null;
  readonly initialRisk?: TradePreview["initialRisk"];
  readonly fullEntryNotional?: string;
  readonly metricIsPartial?: boolean;
};

function trade(options: TradeOverrides = {}): TradePreview {
  const {
    resultPnl = 100,
    resultPnlExact = resultPnl === null ? null : String(resultPnl),
    initialRisk = { amount: "100", currency: "USD" },
    fullEntryNotional = "100",
    metricIsPartial = false,
    ...overrides
  } = options;
  const metrics = deriveTradeMetricsV1({
    assetClass: overrides.assetClass ?? "stock",
    netRealizedPnl: resultPnlExact === null
      ? null
      : { amount: resultPnlExact, currency: "USD" },
    initialRisk,
    fullEntryNotional: { amount: fullEntryNotional, currency: "USD" },
    isPartial: metricIsPartial,
  });

  return {
    id: "trade-1",
    tradeSubjectId: "subject-1",
    reviewId: "review-1",
    symbol: "TEST",
    assetClass: "stock",
    side: "long",
    status: "closed",
    quantity: 1,
    averageEntry: 100,
    averageExit: 101,
    resultPnl,
    resultPnlExact,
    resultR: metrics.resultR.value === null ? null : Number(metrics.resultR.value),
    percentReturn: metrics.percentReturn.value === null
      ? null
      : Number(metrics.percentReturn.value),
    resultRMetric: metrics.resultR,
    percentReturnMetric: metrics.percentReturn,
    setup: "Breakout",
    mistakes: [],
    emotion: "Calm",
    tradedOn: "2026-07-01",
    reviewSessionDates: ["2026-07-01"],
    sessionLabel: "Jul 1",
    accountLabel: "Demo Brokerage",
    note: "Fixture trade",
    tags: [],
    followedPlan: true,
    playbook: "Breakout",
    rules: [],
    initialRisk,
    plannedStop: "99",
    reviewStatus: "completed",
    reviewVersion: 1,
    executions: [],
    ...overrides,
  };
}

describe("journal performance", () => {
  it("derives headline metrics from closed trade records", () => {
    const result = calculatePerformance([
      trade(),
      trade({
        id: "trade-2",
        tradeSubjectId: "subject-2",
        resultPnl: -50,
        followedPlan: false,
      }),
      trade({
        id: "trade-3",
        tradeSubjectId: "subject-3",
        status: "open",
        resultPnl: null,
      }),
    ]);

    expect(result).toEqual({
      netPnl: 50,
      netR: 0.5,
      winRatePct: 50,
      profitFactor: 2,
      averageR: 0.25,
      rTradeCount: 2,
      ruleAdherencePct: 50,
      ruleReviewCount: 2,
      tradeCount: 2,
    });
  });

  it("aggregates exact result-R values before crossing into display numbers", () => {
    const result = calculatePerformance([
      trade({ resultPnl: 0.1, initialRisk: { amount: "1", currency: "USD" } }),
      trade({
        id: "trade-2",
        tradeSubjectId: "subject-2",
        resultPnl: 0.2,
        initialRisk: { amount: "1", currency: "USD" },
      }),
    ]);

    expect(result.netR).toBe(0.3);
    expect(result.averageR).toBe(0.15);
  });

  it("returns a neutral profit factor when no loss exists", () => {
    expect(calculatePerformance([trade()]).profitFactor).toBeNull();
  });

  it("keeps closed cash results when user-confirmed initial risk is missing", () => {
    const fixture = trade({ initialRisk: null });

    expect(fixture.resultRMetric).toMatchObject({
      value: null,
      nullReason: "missing_initial_risk",
    });
    expect(calculatePerformance([fixture])).toEqual({
      netPnl: 100,
      netR: null,
      winRatePct: 100,
      profitFactor: null,
      averageR: null,
      rTradeCount: 0,
      ruleAdherencePct: 100,
      ruleReviewCount: 1,
      tradeCount: 1,
    });
  });

  it("keeps unreviewed plan adherence unknown and includes realized partial metrics", () => {
    const fixture = trade({
      status: "open",
      resultPnl: 25,
      followedPlan: null,
      metricIsPartial: true,
    });

    expect(fixture.resultRMetric).toMatchObject({ value: "0.25", isPartial: true });
    expect(fixture.percentReturnMetric).toMatchObject({ value: "25", isPartial: true });
    expect(calculatePerformance([fixture])).toMatchObject({
      netPnl: 25,
      netR: 0.25,
      rTradeCount: 1,
      tradeCount: 1,
      ruleAdherencePct: null,
      ruleReviewCount: 0,
    });
  });

  it("ranks classified setup summaries by net R and omits Unclassified", () => {
    const summaries = summarizeSetups([
      trade({ id: "trade-1", setup: "Pullback", resultPnl: 200 }),
      trade({ id: "trade-2", tradeSubjectId: "subject-2", setup: "Breakout", resultPnl: -100 }),
      trade({
        id: "trade-3",
        tradeSubjectId: "subject-3",
        setup: "Unclassified",
        resultPnl: 500,
      }),
    ]);

    expect(summaries.map((summary) => summary.name)).toEqual(["Pullback", "Breakout"]);
  });
});
