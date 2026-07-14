import { describe, expect, it } from "vitest";

import { sha256Hex } from "../adapters/sqlite/schema/checksum";
import {
  SETUP_PERFORMANCE_REPORT_DEFINITION,
  SETUP_PERFORMANCE_REPORT_DEFINITION_CANONICAL_JSON,
  SETUP_PERFORMANCE_REPORT_DEFINITION_SHA256,
  SETUP_PERFORMANCE_REPORT_VERSION,
  buildSetupPerformanceReport,
} from "./setup-performance-report";
import { deriveTradeMetricsV1 } from "./trade-metrics";
import type { JournalWorkspaceSnapshot, TradePreview } from "./types";

type TradeOptions = {
  readonly id: string;
  readonly setup?: string;
  readonly hasClassifiedSetup?: boolean;
  readonly pnl?: string | null;
  readonly initialRisk?: string | null;
  readonly status?: TradePreview["status"];
  readonly reviewStatus?: TradePreview["reviewStatus"];
  readonly tradedOn?: string;
  readonly accountId?: string;
  readonly accountLabel?: string;
  readonly symbol?: string;
  readonly side?: TradePreview["side"];
};

function trade({
  id,
  setup = "Breakout",
  pnl = "1",
  hasClassifiedSetup = setup !== "Unclassified",
  initialRisk = pnl === null ? null : "1",
  status = "closed",
  reviewStatus = "completed",
  tradedOn = "2026-07-01",
  accountId = "account-primary",
  accountLabel = "Primary",
  symbol = id.toUpperCase(),
  side = "long",
}: TradeOptions): TradePreview {
  const metrics = deriveTradeMetricsV1({
    assetClass: "stock",
    netRealizedPnl: pnl === null ? null : { amount: pnl, currency: "USD" },
    initialRisk: initialRisk === null || pnl === null
      ? null
      : { amount: initialRisk, currency: "USD" },
    fullEntryNotional: { amount: "100", currency: "USD" },
    isPartial: status === "open",
  });
  return {
    id: `projection-${id}`,
    tradeSubjectId: `subject-${id}`,
    accountId,
    symbol,
    assetClass: "stock",
    side,
    status,
    quantity: 1,
    averageEntry: 100,
    averageExit: status === "closed" ? 101 : null,
    resultPnl: pnl === null ? null : Number(pnl),
    resultPnlExact: pnl,
    resultR: metrics.resultR.value === null ? null : Number(metrics.resultR.value),
    percentReturn: metrics.percentReturn.value === null
      ? null
      : Number(metrics.percentReturn.value),
    resultRMetric: metrics.resultR,
    percentReturnMetric: metrics.percentReturn,
    setup,
    hasClassifiedSetup,
    mistakes: [],
    emotion: "Calm",
    tradedOn,
    reviewSessionDates: [tradedOn],
    sessionLabel: `${tradedOn} session`,
    accountLabel,
    note: "Fixture",
    tags: [],
    followedPlan: true,
    playbook: setup,
    rules: [],
    initialRisk: initialRisk === null ? null : { amount: initialRisk, currency: "USD" },
    plannedStop: null,
    reviewStatus,
    reviewId: reviewStatus === "pending" ? null : `review-${id}`,
    reviewVersion: reviewStatus === "pending" ? null : 1,
    executions: [],
  };
}

function snapshot(
  trades: readonly TradePreview[],
  accountLabel = "Primary",
): JournalWorkspaceSnapshot {
  return {
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
    currencyCode: "USD",
    timeZone: "America/New_York",
    accountLabel,
    accountOptions: [{
      id: "account-primary",
      label: accountLabel,
      tradeCount: trades.length,
    }],
    periodLabel: "Jul 1–5, 2026",
    performance: {
      netPnl: 0,
      netR: null,
      winRatePct: 0,
      profitFactor: null,
      averageR: null,
      rTradeCount: 0,
      ruleAdherencePct: null,
      ruleReviewCount: 0,
      tradeCount: 0,
    },
    importSummary: {
      receiptId: null,
      accountLabel: "Primary",
      sourceLabel: "Fixture",
      importedAtLabel: "Fixture",
      executions: 0,
      accounts: 1,
      rejectedRows: 0,
      skippedRows: 0,
      rolledBack: false,
    },
    importHistory: [],
    equityCurve: [0],
    calendar: [],
    trades,
    reviewProgress: {
      pendingTrades: 0,
      draftTrades: 0,
      completedTrades: 0,
      streakSessions: 0,
      reviewedSessions: 0,
      tradingSessions: 0,
    },
    reviewOptions: {
      setups: [],
      mistakes: [],
      emotions: [],
      tags: [],
      playbooks: [],
    },
    dailyJournal: [],
    playbooks: [],
  };
}

function withResultRMetric(
  source: TradePreview,
  changes: Readonly<Record<string, unknown>>,
): TradePreview {
  return {
    ...source,
    resultRMetric: {
      ...source.resultRMetric,
      ...changes,
    } as unknown as TradePreview["resultRMetric"],
  };
}

describe("setup-performance report v1", () => {
  it("pins a canonical deeply immutable definition and replay checksum", () => {
    expect(SETUP_PERFORMANCE_REPORT_DEFINITION_CANONICAL_JSON).toBe(
      JSON.stringify(SETUP_PERFORMANCE_REPORT_DEFINITION),
    );
    expect(sha256Hex(SETUP_PERFORMANCE_REPORT_DEFINITION_CANONICAL_JSON)).toBe(
      SETUP_PERFORMANCE_REPORT_DEFINITION_SHA256,
    );
    expect(SETUP_PERFORMANCE_REPORT_DEFINITION).toMatchObject({
      version: SETUP_PERFORMANCE_REPORT_VERSION,
      inputs: {
        projection: "current-projection",
        reviews: "current-review-heads",
        setup: "current-completed-review.setup",
        setupClassification: "review.setup:null=>unclassified;string=>classified",
      },
      cohort: {
        exclusionPrecedence: [
          "status-not-closed=>openOrPartial",
          "missing-resultPnlExact=>missingRealizedPnl",
          "review-status-not-completed=>incompleteReview",
          "hasClassifiedSetup=false=>unclassifiedSetup",
        ],
      },
      groupOrder: "setup-name:ascending-code-unit",
      aggregation: {
        winCount: "count(resultPnlExact>0);zero-is-not-win",
      },
      acceptedR: {
        metric: "result-r",
        definitionVersion: "result-r-v1",
        fractionDigits: 12,
        roundingMode: "half_away_from_zero",
        isPartial: false,
      },
      migration: {
        decision: "derived-only-recompute",
        archiveShapeChange: false,
      },
    });
    expect(Object.isFrozen(SETUP_PERFORMANCE_REPORT_DEFINITION)).toBe(true);
    expect(Object.isFrozen(SETUP_PERFORMANCE_REPORT_DEFINITION.inputs)).toBe(true);
    expect(Object.isFrozen(SETUP_PERFORMANCE_REPORT_DEFINITION.cohort)).toBe(true);
    expect(Object.isFrozen(
      SETUP_PERFORMANCE_REPORT_DEFINITION.cohort.exclusionPrecedence,
    )).toBe(true);
    expect(Object.isFrozen(SETUP_PERFORMANCE_REPORT_DEFINITION.aggregation)).toBe(true);
    expect(Object.isFrozen(SETUP_PERFORMANCE_REPORT_DEFINITION.acceptedR)).toBe(true);
    expect(Object.isFrozen(SETUP_PERFORMANCE_REPORT_DEFINITION.evidenceOrder)).toBe(true);
    expect(Object.isFrozen(SETUP_PERFORMANCE_REPORT_DEFINITION.migration)).toBe(true);
  });

  it("applies exclusion precedence and conserves every trade exactly once", () => {
    const report = buildSetupPerformanceReport(snapshot([
      trade({ id: "included", setup: "Breakout" }),
      trade({
        id: "open",
        setup: "Unclassified",
        status: "open",
        pnl: null,
        reviewStatus: "pending",
      }),
      trade({
        id: "missing",
        setup: "Unclassified",
        pnl: null,
        reviewStatus: "pending",
      }),
      trade({ id: "draft", setup: "Unclassified", reviewStatus: "draft" }),
      trade({ id: "pending", setup: "Breakout", reviewStatus: "pending" }),
      trade({ id: "unclassified", setup: "Unclassified" }),
    ]));

    expect(report.metadata).toEqual({
      version: SETUP_PERFORMANCE_REPORT_VERSION,
      definitionSha256: SETUP_PERFORMANCE_REPORT_DEFINITION_SHA256,
      currencyCode: "USD",
      timeZone: "America/New_York",
      accountLabel: "Primary",
      periodLabel: "Jul 1–5, 2026",
      totalTradeCount: 6,
      includedTradeCount: 1,
      exclusions: {
        openOrPartial: 1,
        missingRealizedPnl: 1,
        incompleteReview: 2,
        unclassifiedSetup: 1,
      },
    });
    expect(
      report.metadata.includedTradeCount
      + Object.values(report.metadata.exclusions).reduce((sum, count) => sum + count, 0),
    ).toBe(report.metadata.totalTradeCount);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]?.tradeSubjectIds).toEqual(["subject-included"]);
  });

  it("separates derived classification state from the Unclassified display label", () => {
    const report = buildSetupPerformanceReport(snapshot([
      trade({ id: "legacy-explicit", setup: "Unclassified", hasClassifiedSetup: true }),
      trade({ id: "absent", setup: "Unclassified", hasClassifiedSetup: false }),
    ]));

    expect(report.metadata.includedTradeCount).toBe(1);
    expect(report.metadata.exclusions.unclassifiedSetup).toBe(1);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]).toMatchObject({
      setup: "Unclassified",
      tradeSubjectIds: ["subject-legacy-explicit"],
    });
  });

  it("aggregates cash and compatible R exactly and counts only positive wins", () => {
    const group = buildSetupPerformanceReport(snapshot([
      trade({ id: "a", pnl: "0.1", initialRisk: "0.2" }),
      trade({ id: "b", pnl: "0.2", initialRisk: "0.1" }),
      trade({ id: "c", pnl: "-0.1", initialRisk: null }),
      trade({ id: "zero", pnl: "0", initialRisk: "1" }),
    ])).groups[0];

    expect(group).toMatchObject({
      setup: "Breakout",
      tradeCount: 4,
      winCount: 2,
      netPnlExact: "0.2",
      cashExpectancyExact: "0.05",
      averageRExact: "0.833333333333",
      rTradeCount: 3,
    });
  });

  it("rounds positive and negative exact ties away from zero", () => {
    const report = buildSetupPerformanceReport(snapshot([
      trade({ id: "positive-a", setup: "Positive", pnl: "0.000000000001" }),
      trade({ id: "positive-b", setup: "Positive", pnl: "0" }),
      trade({ id: "negative-a", setup: "Negative", pnl: "-0.000000000001" }),
      trade({ id: "negative-b", setup: "Negative", pnl: "0" }),
    ]));
    const bySetup = new Map(report.groups.map((group) => [group.setup, group]));

    expect(bySetup.get("Positive")?.cashExpectancyExact).toBe("0.000000000001");
    expect(bySetup.get("Negative")?.cashExpectancyExact).toBe("-0.000000000001");
  });

  it("keeps cash while rejecting hostile or tampered R evidence", () => {
    const compatible = trade({ id: "compatible", pnl: "10", initialRisk: "4" });
    const incompatible = [
      withResultRMetric(trade({ id: "version", pnl: "10", initialRisk: "4" }), {
        definitionVersion: "result-r-v2",
      }),
      withResultRMetric(trade({ id: "rounding", pnl: "10", initialRisk: "4" }), {
        roundingMode: "half_even",
      }),
      withResultRMetric(trade({ id: "value", pnl: "10", initialRisk: "4" }), {
        value: "2.500000000001",
      }),
      withResultRMetric(trade({ id: "numerator", pnl: "10", initialRisk: "4" }), {
        numerator: { amount: "9", currency: "USD" },
      }),
      withResultRMetric(trade({ id: "denominator", pnl: "10", initialRisk: "4" }), {
        denominator: { amount: "5", currency: "USD" },
        value: "2",
      }),
      withResultRMetric(trade({ id: "scale", pnl: "10", initialRisk: "4" }), {
        scaleFactor: "100",
      }),
      withResultRMetric(trade({ id: "precision", pnl: "10", initialRisk: "4" }), {
        fractionDigits: 6,
      }),
      withResultRMetric(trade({ id: "currency", pnl: "10", initialRisk: "4" }), {
        currency: "EUR",
      }),
      withResultRMetric(trade({ id: "partial", pnl: "10", initialRisk: "4" }), {
        isPartial: true,
      }),
      withResultRMetric(trade({ id: "null-reason", pnl: "10", initialRisk: "4" }), {
        nullReason: "missing_initial_risk",
      }),
      {
        ...trade({ id: "trade-risk", pnl: "10", initialRisk: "4" }),
        initialRisk: { amount: "5", currency: "USD" },
      },
      {
        ...trade({ id: "shape", pnl: "10", initialRisk: "4" }),
        resultRMetric: "<hostile-result-r>" as unknown as TradePreview["resultRMetric"],
      },
    ];
    const group = buildSetupPerformanceReport(snapshot([
      compatible,
      ...incompatible,
    ])).groups[0];
    const resultRByTrade = new Map(
      group?.evidence.map((item) => [item.tradeSubjectId, item.resultRExact]),
    );

    expect(group).toMatchObject({
      tradeCount: 13,
      winCount: 13,
      netPnlExact: "130",
      cashExpectancyExact: "10",
      averageRExact: "2.5",
      rTradeCount: 1,
    });
    expect(resultRByTrade.get("subject-compatible")).toBe("2.5");
    for (const invalidTrade of incompatible) {
      expect(resultRByTrade.get(invalidTrade.tradeSubjectId)).toBeNull();
    }
  });

  it("uses deterministic setup and evidence order independent of input order", () => {
    const fixtures = [
      trade({
        id: "z",
        setup: "Reversal",
        tradedOn: "2026-07-02",
        accountLabel: "Brokerage",
      }),
      trade({
        id: "b",
        setup: "Breakout",
        tradedOn: "2026-07-03",
        accountLabel: "Retirement",
      }),
      trade({
        id: "a",
        setup: "Breakout",
        tradedOn: "2026-07-03",
        accountLabel: "Brokerage",
        side: "short",
      }),
      trade({ id: "p", setup: "Pullback", tradedOn: "2026-07-04" }),
    ];
    const first = buildSetupPerformanceReport(snapshot(fixtures, "2 accounts"));
    const second = buildSetupPerformanceReport(
      structuredClone(snapshot([...fixtures].reverse(), "2 accounts")),
    );

    expect(second).toEqual(first);
    expect(first.groups.map((group) => group.setup)).toEqual([
      "Breakout",
      "Pullback",
      "Reversal",
    ]);
    expect(first.groups[0]?.tradeSubjectIds).toEqual(["subject-a", "subject-b"]);
    expect(first.groups[0]?.evidence.map((item) => item.accountLabel)).toEqual([
      "Brokerage",
      "Retirement",
    ]);
  });

  it("moves current-head evidence between setup groups without mutating its identity", () => {
    const current = trade({ id: "stable", setup: "Breakout" });
    const before = buildSetupPerformanceReport(snapshot([current]));
    const after = buildSetupPerformanceReport(snapshot([{
      ...current,
      setup: "Pullback",
      reviewId: "review-stable-v2",
      reviewVersion: 2,
    }]));

    expect(before.groups.map((group) => [group.setup, group.tradeSubjectIds]))
      .toEqual([["Breakout", ["subject-stable"]]]);
    expect(after.groups.map((group) => [group.setup, group.tradeSubjectIds]))
      .toEqual([["Pullback", ["subject-stable"]]]);
    expect(after.groups[0]?.evidence[0]).toMatchObject({
      tradeSubjectId: "subject-stable",
      resultPnlExact: "1",
      resultRExact: "1",
    });
  });

  it("preserves hostile long labels as deeply frozen report-owned evidence", () => {
    const hostile = `<setup data-x="&">${"A".repeat(500)}</setup>`;
    const source = trade({
      id: "hostile",
      setup: hostile,
      symbol: "<SYMBOL &>",
      accountLabel: "<ACCOUNT &>",
    });
    const report = buildSetupPerformanceReport(snapshot([source], "<ALL &>"));

    expect(report.groups[0]?.setup).toBe(hostile);
    expect(report.groups[0]?.evidence[0]).toMatchObject({
      setup: hostile,
      symbol: "<SYMBOL &>",
      accountLabel: "<ACCOUNT &>",
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.metadata)).toBe(true);
    expect(Object.isFrozen(report.metadata.exclusions)).toBe(true);
    expect(Object.isFrozen(report.groups)).toBe(true);
    expect(Object.isFrozen(report.groups[0])).toBe(true);
    expect(Object.isFrozen(report.groups[0]?.tradeSubjectIds)).toBe(true);
    expect(Object.isFrozen(report.groups[0]?.evidence)).toBe(true);
    expect(Object.isFrozen(report.groups[0]?.evidence[0])).toBe(true);
  });

  it("returns a neutral immutable report when no setup is classified", () => {
    const report = buildSetupPerformanceReport(snapshot([
      trade({ id: "unclassified", setup: "Unclassified" }),
    ]));

    expect(report.groups).toEqual([]);
    expect(report.metadata).toMatchObject({
      totalTradeCount: 1,
      includedTradeCount: 0,
      exclusions: {
        openOrPartial: 0,
        missingRealizedPnl: 0,
        incompleteReview: 0,
        unclassifiedSetup: 1,
      },
    });
    expect(Object.isFrozen(report.groups)).toBe(true);
  });
});
