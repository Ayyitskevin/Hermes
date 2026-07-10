import type { PerformanceSnapshot, TradePreview } from "./types";

export interface SetupPerformance {
  readonly name: string;
  readonly tradeCount: number;
  readonly netPnl: number;
  readonly netR: number | null;
  readonly winRatePct: number;
}

function realizedTrades(trades: readonly TradePreview[]): readonly TradePreview[] {
  return trades.filter((trade) => (
    trade.resultPnl !== null
  ));
}

export function calculatePerformance(trades: readonly TradePreview[]): PerformanceSnapshot {
  const realized = realizedTrades(trades);
  const withR = realized.filter((trade) => trade.resultR !== null);
  const netPnl = realized.reduce((sum, trade) => sum + (trade.resultPnl ?? 0), 0);
  const netR = withR.length === 0
    ? null
    : withR.reduce((sum, trade) => sum + (trade.resultR ?? 0), 0);
  const wins = realized.filter((trade) => (trade.resultPnl ?? 0) > 0);
  const grossProfit = wins.reduce((sum, trade) => sum + (trade.resultPnl ?? 0), 0);
  const grossLoss = Math.abs(realized.reduce(
    (sum, trade) => sum + Math.min(trade.resultPnl ?? 0, 0),
    0,
  ));
  const reviewed = realized.filter((trade) => trade.followedPlan !== null);
  const followed = reviewed.filter((trade) => trade.followedPlan === true).length;

  return {
    netPnl,
    netR,
    winRatePct: realized.length === 0 ? 0 : (wins.length / realized.length) * 100,
    profitFactor: grossLoss === 0 ? null : grossProfit / grossLoss,
    averageR: netR === null ? null : netR / withR.length,
    rTradeCount: withR.length,
    ruleAdherencePct: reviewed.length === 0 ? null : (followed / reviewed.length) * 100,
    ruleReviewCount: reviewed.length,
    tradeCount: realized.length,
  };
}

export function summarizeSetups(trades: readonly TradePreview[]): readonly SetupPerformance[] {
  const grouped = new Map<string, TradePreview[]>();
  for (const trade of realizedTrades(trades)) {
    const group = grouped.get(trade.setup) ?? [];
    group.push(trade);
    grouped.set(trade.setup, group);
  }

  return [...grouped.entries()]
    .map(([name, group]) => {
      const performance = calculatePerformance(group);
      return {
        name,
        tradeCount: performance.tradeCount,
        netPnl: performance.netPnl,
        netR: performance.netR,
        winRatePct: performance.winRatePct,
      };
    })
    .sort((left, right) => (
      (right.netR ?? Number.NEGATIVE_INFINITY) - (left.netR ?? Number.NEGATIVE_INFINITY)
      || left.name.localeCompare(right.name)
    ));
}
