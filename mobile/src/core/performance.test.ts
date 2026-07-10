import { describe, expect, it } from "vitest";

import { calculatePerformance, summarizeSetups } from "./performance";
import type { TradePreview } from "./types";

function trade(overrides: Partial<TradePreview> = {}): TradePreview {
  return {
    id: "trade-1",
    symbol: "TEST",
    assetClass: "stock",
    side: "long",
    status: "closed",
    quantity: 1,
    averageEntry: 100,
    averageExit: 101,
    resultPnl: 100,
    resultR: 1,
    setup: "Breakout",
    tradedOn: "2026-07-01",
    sessionLabel: "Jul 1",
    accountLabel: "Demo Brokerage",
    note: "Fixture trade",
    tags: [],
    followedPlan: true,
    ...overrides,
  };
}

describe("journal performance", () => {
  it("derives headline metrics from closed trade records", () => {
    const result = calculatePerformance([
      trade(),
      trade({ id: "trade-2", resultPnl: -50, resultR: -0.5, followedPlan: false }),
      trade({ id: "trade-3", status: "open", resultPnl: null, resultR: null }),
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

  it("returns a neutral profit factor when no loss exists", () => {
    expect(calculatePerformance([trade()]).profitFactor).toBeNull();
  });

  it("keeps closed cash results when an import cannot derive R", () => {
    expect(calculatePerformance([trade({ resultR: null })])).toEqual({
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

  it("keeps unreviewed plan adherence unknown and includes realized partial exits", () => {
    expect(calculatePerformance([
      trade({ status: "open", resultPnl: 25, resultR: null, followedPlan: null }),
    ])).toMatchObject({
      netPnl: 25,
      tradeCount: 1,
      ruleAdherencePct: null,
      ruleReviewCount: 0,
    });
  });

  it("ranks setup summaries by net R", () => {
    const summaries = summarizeSetups([
      trade({ id: "trade-1", setup: "Pullback", resultR: 2, resultPnl: 200 }),
      trade({ id: "trade-2", setup: "Breakout", resultR: -1, resultPnl: -100 }),
    ]);

    expect(summaries.map((summary) => summary.name)).toEqual(["Pullback", "Breakout"]);
  });
});
