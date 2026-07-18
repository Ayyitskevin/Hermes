import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  buildManualCaptureReviewContinuation,
} from "./manual-capture-review-continuation";

const EXECUTION_ID = "manual-execution:continuation";

function demoTrade(symbol: string): TradePreview {
  const trade = DEMO_WORKSPACE.trades.find((candidate) => candidate.symbol === symbol);
  if (trade === undefined) throw new Error(`Missing demo trade ${symbol}.`);
  return trade;
}

function withExecution(
  trade: TradePreview,
  executionId = EXECUTION_ID,
): TradePreview {
  const execution = trade.executions[0];
  if (execution === undefined) throw new Error(`Trade ${trade.symbol} has no execution fixture.`);
  return {
    ...trade,
    executions: [{ ...execution, executionId }],
  };
}

function reversalTrades(): readonly [TradePreview, TradePreview] {
  const source = demoTrade("AAPL");
  const entrySource = demoTrade("META");
  const allocation = source.executions[0];
  if (allocation === undefined) throw new Error("AAPL has no reversal fixture allocation.");
  const common = {
    ...allocation,
    executionId: EXECUTION_ID,
    side: "sell" as const,
    occurredAt: "2026-07-09T15:30:00Z",
    price: "110",
    currency: "USD",
  };
  return [{
    ...source,
    side: "long",
    status: "closed",
    executions: [{
      ...common,
      allocationId: `${allocation.allocationId}:reversal-exit`,
      effect: "exit",
    }],
  }, {
    ...entrySource,
    accountId: source.accountId,
    accountLabel: source.accountLabel,
    symbol: source.symbol,
    assetClass: source.assetClass,
    side: "short",
    status: "open",
    executions: [{
      ...common,
      allocationId: `${allocation.allocationId}:reversal-entry`,
      effect: "entry",
    }],
  }];
}

function localSnapshot(trades: readonly TradePreview[]): JournalWorkspaceSnapshot {
  const counts = new Map<string, number>();
  for (const trade of trades) {
    counts.set(trade.accountId, (counts.get(trade.accountId) ?? 0) + 1);
  }
  return {
    ...DEMO_WORKSPACE,
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
    accountOptions: DEMO_WORKSPACE.accountOptions.map((account) => ({
      ...account,
      tradeCount: counts.get(account.id) ?? 0,
    })),
    trades,
  };
}

function result(outcome: "committed" | "duplicate" = "committed") {
  return { outcome, executionId: EXECUTION_ID } as const;
}

describe("manual capture review continuation", () => {
  it("derives one exact account scope and stable subject from a committed execution", () => {
    const aapl = withExecution(demoTrade("AAPL"));
    const snapshot = localSnapshot([aapl, ...DEMO_WORKSPACE.trades.slice(1)]);
    const continuation = buildManualCaptureReviewContinuation(snapshot, result());

    expect(continuation).toMatchObject({
      outcome: "committed",
      executionId: EXECUTION_ID,
      accountId: aapl.accountId,
      accountLabel: aapl.accountLabel,
      tradeSubjectIds: [aapl.tradeSubjectId],
    });
    expect(continuation.scope.state).toMatchObject({
      accountId: aapl.accountId,
      activityFrom: null,
      activityThrough: null,
      selectedDay: null,
      query: "",
      assetClass: "all",
      direction: "all",
      positionState: "all",
      reviewState: "all",
      setup: null,
      mistake: null,
      emotion: null,
      tag: null,
    });
    expect(continuation.scope.evidence).toHaveLength(
      snapshot.accountOptions.find((account) => account.id === aapl.accountId)?.tradeCount ?? -1,
    );
    expect(Object.isFrozen(continuation)).toBe(true);
    expect(Object.isFrozen(continuation.tradeSubjectIds)).toBe(true);
  });

  it("retains both exact AUTO-reversal subjects in scope order", () => {
    const [aapl, reversal] = reversalTrades();
    const untouched = DEMO_WORKSPACE.trades.filter((trade) => (
      trade.tradeSubjectId !== aapl.tradeSubjectId
      && trade.tradeSubjectId !== reversal.tradeSubjectId
    ));
    const snapshot = localSnapshot([aapl, ...untouched, reversal]);
    const continuation = buildManualCaptureReviewContinuation(snapshot, result());
    const expected = continuation.scope.evidence
      .map((evidence) => evidence.trade.tradeSubjectId)
      .filter((tradeSubjectId) => (
        tradeSubjectId === aapl.tradeSubjectId || tradeSubjectId === reversal.tradeSubjectId
      ));

    expect(continuation.tradeSubjectIds).toEqual(expected);
    expect(continuation.tradeSubjectIds).toHaveLength(2);
    expect(new Set(continuation.tradeSubjectIds).size).toBe(2);
  });

  it("recovers an exact AUTO reversal after a later execution closes its entry trade", () => {
    const [exit, openEntry] = reversalTrades();
    const laterExit = openEntry.executions[0];
    if (laterExit === undefined) throw new Error("Reversal entry has no allocation fixture.");
    const closedEntry: TradePreview = {
      ...openEntry,
      status: "closed",
      executions: [
        ...openEntry.executions,
        {
          ...laterExit,
          allocationId: `${laterExit.allocationId}:later-close`,
          executionId: "manual-execution:later-close",
          effect: "exit",
          side: "buy",
          occurredAt: "2026-07-10T15:30:00Z",
        },
      ],
    };
    const untouched = DEMO_WORKSPACE.trades.filter((trade) => (
      trade.tradeSubjectId !== exit.tradeSubjectId
      && trade.tradeSubjectId !== closedEntry.tradeSubjectId
    ));

    const continuation = buildManualCaptureReviewContinuation(
      localSnapshot([exit, ...untouched, closedEntry]),
      result("duplicate"),
    );

    expect(continuation.tradeSubjectIds).toEqual(expect.arrayContaining([
      exit.tradeSubjectId,
      closedEntry.tradeSubjectId,
    ]));
    expect(continuation.tradeSubjectIds).toHaveLength(2);
  });

  it("rejects unrelated same-account subjects that collide on execution ID", () => {
    const aapl = withExecution(demoTrade("AAPL"));
    const meta = withExecution(demoTrade("META"));

    expect(() => buildManualCaptureReviewContinuation(
      localSnapshot(DEMO_WORKSPACE.trades.map((trade) => (
        trade.tradeSubjectId === aapl.tradeSubjectId
          ? aapl
          : trade.tradeSubjectId === meta.tradeSubjectId ? meta : trade
      ))),
      result(),
    )).toThrow(/exact exit and entry sides of one AUTO reversal/i);
  });

  it("projects a duplicate-safe commit result to the same exact target", () => {
    const aapl = withExecution(demoTrade("AAPL"));
    const snapshot = localSnapshot([aapl, ...DEMO_WORKSPACE.trades.slice(1)]);

    expect(buildManualCaptureReviewContinuation(snapshot, result("duplicate")))
      .toMatchObject({
        outcome: "duplicate",
        executionId: EXECUTION_ID,
        accountId: aapl.accountId,
        tradeSubjectIds: [aapl.tradeSubjectId],
      });
  });

  it("fails closed for missing, malformed, duplicated, excessive, or cross-account linkage", () => {
    const aapl = withExecution(demoTrade("AAPL"));
    const meta = withExecution(demoTrade("META"));
    const spy = withExecution(demoTrade("SPY"));
    const qqq = withExecution(demoTrade("QQQ"));
    const one = localSnapshot([aapl, ...DEMO_WORKSPACE.trades.slice(1)]);

    expect(() => buildManualCaptureReviewContinuation(
      one,
      { outcome: "committed", executionId: "missing-execution" },
    )).toThrow(/exact current trade/i);
    expect(() => buildManualCaptureReviewContinuation(
      one,
      { outcome: "committed", executionId: " padded " },
    )).toThrow(/execution identity/i);
    expect(() => buildManualCaptureReviewContinuation(
      localSnapshot([
        {
          ...aapl,
          executions: [aapl.executions[0]!, {
            ...aapl.executions[0]!,
            allocationId: `${aapl.executions[0]!.allocationId}:duplicate`,
          }],
        },
        ...DEMO_WORKSPACE.trades.slice(1),
      ]),
      result(),
    )).toThrow(/exactly one allocation fragment per affected trade/i);
    expect(() => buildManualCaptureReviewContinuation(
      localSnapshot([aapl, meta, spy]),
      result(),
    )).toThrow(/at most two current trades/i);
    expect(() => buildManualCaptureReviewContinuation(
      localSnapshot([aapl, qqq]),
      result(),
    )).toThrow(/one stable account/i);
  });

  it("rejects demo, empty, unsupported outcomes, and duplicate stable subjects", () => {
    const aapl = withExecution(demoTrade("AAPL"));
    const snapshot = localSnapshot([aapl, ...DEMO_WORKSPACE.trades.slice(1)]);

    expect(() => buildManualCaptureReviewContinuation(
      { ...snapshot, provenance: "demo" },
      result(),
    )).toThrow(/private local journal/i);
    expect(() => buildManualCaptureReviewContinuation(
      { ...snapshot, provenance: "empty" },
      result(),
    )).toThrow(/private local journal/i);
    expect(() => buildManualCaptureReviewContinuation(
      snapshot,
      { outcome: "unknown" as "committed", executionId: EXECUTION_ID },
    )).toThrow(/commit outcome/i);
    expect(() => buildManualCaptureReviewContinuation(
      localSnapshot([
        aapl,
        { ...aapl, id: `${aapl.id}:duplicate` },
      ]),
      result(),
    )).toThrow(/duplicate subject/i);
  });
});
