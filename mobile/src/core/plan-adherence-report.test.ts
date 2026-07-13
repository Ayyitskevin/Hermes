import { describe, expect, it } from "vitest";

import { sha256Hex } from "../adapters/sqlite/schema/checksum";
import { deriveTradeMetricsV1 } from "./trade-metrics";
import {
  PLAN_ADHERENCE_REPORT_DEFINITION,
  PLAN_ADHERENCE_REPORT_DEFINITION_CANONICAL_JSON,
  PLAN_ADHERENCE_REPORT_DEFINITION_SHA256,
  PLAN_ADHERENCE_INSIGHT_MIN_TRADES,
  PLAN_ADHERENCE_REPORT_VERSION,
  buildPlanAdherenceReport,
} from "./plan-adherence-report";
import type {
  JournalWorkspaceSnapshot,
  TradePreview,
  TradeRuleReviewPreview,
} from "./types";

type TradeOptions = {
  readonly id: string;
  readonly pnl?: string | null;
  readonly initialRisk?: string | null;
  readonly status?: TradePreview["status"];
  readonly reviewStatus?: TradePreview["reviewStatus"];
  readonly tradedOn?: string;
  readonly symbol?: string;
  readonly side?: TradePreview["side"];
  readonly accountLabel?: string;
  readonly rules?: readonly TradeRuleReviewPreview[];
};

const followedRule = (suffix = ""): TradeRuleReviewPreview => ({
  ruleId: `followed${suffix}`,
  text: `Followed rule${suffix}`,
  outcome: "followed",
});

const brokenRule = (suffix = ""): TradeRuleReviewPreview => ({
  ruleId: `broken${suffix}`,
  text: `Broken rule${suffix}`,
  outcome: "broken",
});

function trade({
  id,
  pnl = "1",
  initialRisk = pnl === null ? null : "1",
  status = "closed",
  reviewStatus = "completed",
  tradedOn = "2026-07-01",
  symbol = id.toUpperCase(),
  side = "long",
  accountLabel = "Primary",
  rules = [followedRule(id)],
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
    symbol,
    assetClass: "stock",
    side,
    status,
    quantity: 1,
    averageEntry: 100,
    averageExit: status === "closed" ? 101 : null,
    resultPnl: pnl === null ? null : Number(pnl),
    resultPnlExact: pnl,
    resultR: metrics.resultR.value === null
      ? null
      : Number(metrics.resultR.value),
    percentReturn: metrics.percentReturn.value === null
      ? null
      : Number(metrics.percentReturn.value),
    resultRMetric: metrics.resultR,
    percentReturnMetric: metrics.percentReturn,
    setup: "Breakout",
    mistakes: [],
    emotion: "Calm",
    tradedOn,
    reviewSessionDates: [tradedOn],
    sessionLabel: `${tradedOn} session`,
    accountLabel,
    note: "Fixture",
    tags: [],
    followedPlan: null,
    playbook: "Breakout",
    rules,
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

describe("plan-adherence report v1", () => {
  it("pins a canonical immutable formula definition and its replay checksum", () => {
    expect(PLAN_ADHERENCE_REPORT_DEFINITION_CANONICAL_JSON).toBe(
      JSON.stringify(PLAN_ADHERENCE_REPORT_DEFINITION),
    );
    expect(sha256Hex(PLAN_ADHERENCE_REPORT_DEFINITION_CANONICAL_JSON)).toBe(
      PLAN_ADHERENCE_REPORT_DEFINITION_SHA256,
    );
    expect(PLAN_ADHERENCE_REPORT_DEFINITION).toMatchObject({
      version: PLAN_ADHERENCE_REPORT_VERSION,
      inputs: {
        projection: "current-projection",
        reviews: "current-review-heads",
      },
      groupOrder: ["followed", "broken"],
      aggregation: {
        winCount: "count(resultPnlExact>0);zero-is-not-win",
      },
      acceptedR: {
        metric: "result-r",
        definitionVersion: "result-r-v1",
        scaleFactor: "1",
        fractionDigits: 12,
        roundingMode: "half_away_from_zero",
        isPartial: false,
        availability: "value:string;nullReason:null;numerator+denominator+currency:non-null",
        currency: "workspace=evidence=numerator=denominator",
        numerator: "evidence.numerator.amount=trade.resultPnlExact",
        denominator: "evidence.denominator=trade.initialRisk",
        replay: "deriveResultRV1(numerator,denominator,false).value=evidence.value",
        rejection: "retain-cash-cohort;resultRExact=null;rTradeCount-omits",
      },
      migration: {
        decision: "derived-only-recompute",
        archiveShapeChange: false,
        exportCompatibility: "existing-archives-retain-inputs;current-runtime-recomputes",
      },
    });
    expect(Object.isFrozen(PLAN_ADHERENCE_REPORT_DEFINITION)).toBe(true);
    expect(Object.isFrozen(PLAN_ADHERENCE_REPORT_DEFINITION.inputs)).toBe(true);
    expect(Object.isFrozen(PLAN_ADHERENCE_REPORT_DEFINITION.groupOrder)).toBe(true);
    expect(Object.isFrozen(PLAN_ADHERENCE_REPORT_DEFINITION.aggregation)).toBe(true);
    expect(Object.isFrozen(PLAN_ADHERENCE_REPORT_DEFINITION.acceptedR)).toBe(true);
    expect(Object.isFrozen(
      PLAN_ADHERENCE_REPORT_DEFINITION.cohort.exclusionPrecedence,
    )).toBe(true);
    expect(Object.isFrozen(PLAN_ADHERENCE_REPORT_DEFINITION.evidenceOrder)).toBe(true);
    expect(Object.isFrozen(PLAN_ADHERENCE_REPORT_DEFINITION.insight)).toBe(true);
    expect(Object.isFrozen(PLAN_ADHERENCE_REPORT_DEFINITION.migration)).toBe(true);
  });

  it("uses exact decimal aggregation for cash and R without substituting missing R", () => {
    const report = buildPlanAdherenceReport(snapshot([
      trade({ id: "a", pnl: "0.1", initialRisk: "0.2" }),
      trade({ id: "b", pnl: "0.2", initialRisk: "0.1" }),
      trade({ id: "c", pnl: "-0.1", initialRisk: null }),
    ]));

    expect(report.groups[0]).toMatchObject({
      classification: "followed",
      tradeCount: 3,
      winCount: 2,
      netPnlExact: "0.2",
      cashExpectancyExact: "0.066666666667",
      averageRExact: "1.25",
      rTradeCount: 2,
    });
  });

  it("counts only positive exact realized P&L as wins", () => {
    const group = buildPlanAdherenceReport(snapshot([
      trade({ id: "positive-win", pnl: "0.000000000001" }),
      trade({ id: "zero-not-win", pnl: "0" }),
      trade({ id: "negative-not-win", pnl: "-0.000000000001" }),
    ])).groups[0];

    expect(group).toMatchObject({
      tradeCount: 3,
      winCount: 1,
    });
  });

  it("retains cash trades while omitting incompatible R evidence from coverage", () => {
    const compatible = trade({ id: "compatible-r", pnl: "10", initialRisk: "4" });
    const incompatible = [
      withResultRMetric(
        trade({ id: "bad-version", pnl: "10", initialRisk: "4" }),
        { definitionVersion: "result-r-v2" },
      ),
      withResultRMetric(
        trade({ id: "bad-rounding", pnl: "10", initialRisk: "4" }),
        { roundingMode: "half_even" },
      ),
      withResultRMetric(
        trade({ id: "bad-value", pnl: "10", initialRisk: "4" }),
        { value: "2.500000000001" },
      ),
      withResultRMetric(
        trade({ id: "bad-numerator", pnl: "10", initialRisk: "4" }),
        { numerator: { amount: "9", currency: "USD" } },
      ),
      withResultRMetric(
        trade({ id: "bad-scale", pnl: "10", initialRisk: "4" }),
        { scaleFactor: "100" },
      ),
      withResultRMetric(
        trade({ id: "bad-precision", pnl: "10", initialRisk: "4" }),
        { fractionDigits: 6 },
      ),
      withResultRMetric(
        trade({ id: "bad-currency", pnl: "10", initialRisk: "4" }),
        { currency: "EUR" },
      ),
      withResultRMetric(
        trade({ id: "bad-partial", pnl: "10", initialRisk: "4" }),
        { isPartial: true },
      ),
      withResultRMetric(
        trade({ id: "bad-evidence-denominator", pnl: "10", initialRisk: "4" }),
        {
          denominator: { amount: "5", currency: "USD" },
          value: "2",
        },
      ),
      {
        ...trade({ id: "bad-trade-initial-risk", pnl: "10", initialRisk: "4" }),
        initialRisk: { amount: "5", currency: "USD" },
      },
    ];
    const group = buildPlanAdherenceReport(snapshot([
      compatible,
      ...incompatible,
    ])).groups[0];
    const resultRByTrade = new Map(
      group.evidence.map((item) => [item.tradeSubjectId, item.resultRExact]),
    );

    expect(group).toMatchObject({
      tradeCount: 11,
      winCount: 11,
      netPnlExact: "110",
      cashExpectancyExact: "10",
      averageRExact: "2.5",
      rTradeCount: 1,
    });
    expect(resultRByTrade.get("subject-compatible-r")).toBe("2.5");
    for (const invalidTrade of incompatible) {
      expect(resultRByTrade.get(invalidTrade.tradeSubjectId)).toBeNull();
    }
  });

  it("uses compatible exact R evidence independently of the display approximation", () => {
    const source = trade({ id: "r-display-independent", pnl: "10", initialRisk: "4" });
    const group = buildPlanAdherenceReport(snapshot([{
      ...source,
      resultR: 999,
    }])).groups[0];

    expect(group.averageRExact).toBe("2.5");
    expect(group.rTradeCount).toBe(1);
    expect(group.evidence[0]?.resultRExact).toBe("2.5");
  });

  it("returns immutable groups in canonical followed-then-broken order", () => {
    const report = buildPlanAdherenceReport(snapshot([
      trade({ id: "broken-first-input", rules: [brokenRule("-order")] }),
      trade({ id: "followed-second-input" }),
    ]));

    expect(report.groups.map((group) => group.classification)).toEqual(
      PLAN_ADHERENCE_REPORT_DEFINITION.groupOrder,
    );
    expect(report.groups[0].tradeSubjectIds).toEqual(["subject-followed-second-input"]);
    expect(report.groups[1].tradeSubjectIds).toEqual(["subject-broken-first-input"]);
  });

  it("rounds positive and negative exact ties away from zero", () => {
    const positive = buildPlanAdherenceReport(snapshot([
      trade({ id: "positive-a", pnl: "0.000000000001" }),
      trade({ id: "positive-b", pnl: "0" }),
    ])).groups[0];
    const negative = buildPlanAdherenceReport(snapshot([
      trade({ id: "negative-a", pnl: "-0.000000000001" }),
      trade({ id: "negative-b", pnl: "0" }),
    ])).groups[0];

    expect(positive.cashExpectancyExact).toBe("0.000000000001");
    expect(negative.cashExpectancyExact).toBe("-0.000000000001");
  });

  it("gives a broken rule precedence over followed rules", () => {
    const report = buildPlanAdherenceReport(snapshot([
      trade({ id: "mixed", rules: [followedRule("-mixed"), brokenRule("-mixed")] }),
    ]));

    expect(report.groups.map((group) => [group.classification, group.tradeCount]))
      .toEqual([["followed", 0], ["broken", 1]]);
    expect(report.groups[1].evidence[0]?.rules).toEqual([
      followedRule("-mixed"),
      brokenRule("-mixed"),
    ]);
  });

  it("applies exclusion precedence and reconciles every trade exactly once", () => {
    const report = buildPlanAdherenceReport(snapshot([
      trade({ id: "included" }),
      trade({ id: "open", status: "open", pnl: null, reviewStatus: "pending", rules: [] }),
      trade({ id: "missing", pnl: null, reviewStatus: "pending", rules: [] }),
      trade({ id: "draft", reviewStatus: "draft", rules: [] }),
      trade({ id: "pending", reviewStatus: "pending", rules: [] }),
      trade({ id: "na", rules: [{ ruleId: "na", text: "Not relevant", outcome: "not_applicable" }] }),
      trade({ id: "unreviewed", rules: [{ ruleId: "u", text: "Not reviewed", outcome: "unreviewed" }] }),
    ]));

    expect(report.metadata).toEqual({
      version: PLAN_ADHERENCE_REPORT_VERSION,
      definitionSha256: PLAN_ADHERENCE_REPORT_DEFINITION_SHA256,
      currencyCode: "USD",
      timeZone: "America/New_York",
      accountLabel: "Primary",
      periodLabel: "Jul 1–5, 2026",
      totalTradeCount: 7,
      includedTradeCount: 1,
      exclusions: {
        openOrPartial: 1,
        missingRealizedPnl: 1,
        incompleteReview: 2,
        unclassifiedRules: 2,
      },
    });
    expect(
      report.metadata.includedTradeCount
      + Object.values(report.metadata.exclusions).reduce((sum, count) => sum + count, 0),
    ).toBe(report.metadata.totalTradeCount);
  });

  it("returns neutral fixed groups and insufficient insight for an all-NA cohort", () => {
    const report = buildPlanAdherenceReport(snapshot([
      trade({ id: "a", rules: [] }),
      trade({ id: "b", rules: [{ ruleId: "na", text: "N/A", outcome: "not_applicable" }] }),
    ]));

    expect(report.groups).toEqual([
      {
        classification: "followed",
        tradeCount: 0,
        winCount: 0,
        netPnlExact: "0",
        cashExpectancyExact: null,
        averageRExact: null,
        rTradeCount: 0,
        tradeSubjectIds: [],
        evidence: [],
      },
      {
        classification: "broken",
        tradeCount: 0,
        winCount: 0,
        netPnlExact: "0",
        cashExpectancyExact: null,
        averageRExact: null,
        rTradeCount: 0,
        tradeSubjectIds: [],
        evidence: [],
      },
    ]);
    expect(report.insight).toEqual({
      status: "insufficient",
      minimumTradesPerGroup: PLAN_ADHERENCE_INSIGHT_MIN_TRADES,
      followedTradeCount: 0,
      brokenTradeCount: 0,
    });
  });

  it("replays deep-cloned reordered multi-account evidence by date then subject ID", () => {
    const fixtures = [
      trade({
        id: "z",
        tradedOn: "2026-07-02",
        symbol: "AAPL",
        accountLabel: "Brokerage",
      }),
      trade({
        id: "b",
        tradedOn: "2026-07-03",
        symbol: "AAPL",
        accountLabel: "Retirement",
      }),
      trade({
        id: "a",
        tradedOn: "2026-07-03",
        symbol: "AAPL",
        side: "short",
        accountLabel: "Brokerage",
      }),
    ];
    const first = buildPlanAdherenceReport(snapshot(fixtures, "2 accounts"));
    const replayInput = structuredClone(snapshot([...fixtures].reverse(), "2 accounts"));
    const second = buildPlanAdherenceReport(replayInput);

    expect(second).toEqual(first);
    expect(first.metadata.accountLabel).toBe("2 accounts");
    expect(first.groups[0].tradeSubjectIds).toEqual([
      "subject-a",
      "subject-b",
      "subject-z",
    ]);
    expect(first.groups[0].tradeSubjectIds).toEqual(
      first.groups[0].evidence.map((item) => item.tradeSubjectId),
    );
    expect(first.groups[0].evidence[0]).toMatchObject({
      accountLabel: "Brokerage",
      symbol: "AAPL",
      side: "short",
      tradedOn: "2026-07-03",
      sessionLabel: "2026-07-03 session",
      resultPnlExact: "1",
      resultRExact: "1",
    });
    expect(first.groups[0].evidence.map((item) => item.accountLabel)).toEqual([
      "Brokerage",
      "Retirement",
      "Brokerage",
    ]);
  });

  it("holds insight at two trades and exposes the exact difference at three per group", () => {
    const followed = [
      trade({ id: "f1", pnl: "0.1" }),
      trade({ id: "f2", pnl: "0.2" }),
      trade({ id: "f3", pnl: "0.3" }),
    ];
    const broken = [
      trade({ id: "b1", pnl: "-0.1", rules: [brokenRule("1")] }),
      trade({ id: "b2", pnl: "-0.2", rules: [brokenRule("2")] }),
      trade({ id: "b3", pnl: "0", rules: [brokenRule("3")] }),
    ];

    expect(buildPlanAdherenceReport(snapshot([
      ...followed.slice(0, 2),
      ...broken,
    ])).insight).toEqual({
      status: "insufficient",
      minimumTradesPerGroup: 3,
      followedTradeCount: 2,
      brokenTradeCount: 3,
    });
    expect(buildPlanAdherenceReport(snapshot([...followed, ...broken])).insight).toEqual({
      status: "ready",
      minimumTradesPerGroup: 3,
      followedMinusBrokenCashExpectancyExact: "0.3",
    });
  });

  it("rounds the exact expectation difference once instead of subtracting rounded means", () => {
    const followed = [
      trade({ id: "single-round-f1", pnl: "1" }),
      ...[2, 3, 4, 5, 6].map((index) => (
        trade({ id: `single-round-f${index}`, pnl: "0" })
      )),
    ];
    const broken = [
      trade({ id: "single-round-b1", pnl: "1", rules: [brokenRule("-single-1")] }),
      trade({ id: "single-round-b2", pnl: "0", rules: [brokenRule("-single-2")] }),
      trade({ id: "single-round-b3", pnl: "0", rules: [brokenRule("-single-3")] }),
    ];
    const report = buildPlanAdherenceReport(snapshot([...followed, ...broken]));

    expect(report.groups[0].cashExpectancyExact).toBe("0.166666666667");
    expect(report.groups[1].cashExpectancyExact).toBe("0.333333333333");
    expect(report.insight).toEqual({
      status: "ready",
      minimumTradesPerGroup: 3,
      followedMinusBrokenCashExpectancyExact: "-0.166666666667",
    });
  });

  it("returns deeply frozen report-owned evidence", () => {
    const report = buildPlanAdherenceReport(snapshot([trade({ id: "frozen" })]));

    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.metadata)).toBe(true);
    expect(Object.isFrozen(report.metadata.exclusions)).toBe(true);
    expect(Object.isFrozen(report.groups)).toBe(true);
    expect(Object.isFrozen(report.groups[0])).toBe(true);
    expect(Object.isFrozen(report.groups[0].tradeSubjectIds)).toBe(true);
    expect(Object.isFrozen(report.groups[0].evidence)).toBe(true);
    expect(Object.isFrozen(report.groups[0].evidence[0])).toBe(true);
    expect(Object.isFrozen(report.groups[0].evidence[0]?.rules)).toBe(true);
    expect(Object.isFrozen(report.groups[0].evidence[0]?.rules[0])).toBe(true);
    expect(Object.isFrozen(report.insight)).toBe(true);
  });
});
