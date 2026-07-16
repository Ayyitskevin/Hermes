import { describe, expect, it } from "vitest";

import { sha256Hex } from "../adapters/sqlite/schema/checksum";
import {
  EMOTION_PATTERNS_REPORT_DEFINITION,
  EMOTION_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON,
  EMOTION_PATTERNS_REPORT_DEFINITION_SHA256,
  EMOTION_PATTERNS_REPORT_VERSION,
  buildEmotionPatternsReport,
} from "./emotion-patterns-report";
import { deriveTradeMetricsV1 } from "./trade-metrics";
import type { JournalWorkspaceSnapshot, TradePreview } from "./types";

type TradeOptions = {
  readonly id: string;
  readonly emotion?: string | null;
  readonly status?: TradePreview["status"];
  readonly reviewStatus?: TradePreview["reviewStatus"];
  readonly reviewId?: string | null;
  readonly reviewVersion?: number | null;
  readonly tradedOn?: string;
  readonly symbol?: string;
  readonly accountLabel?: string;
  readonly pnl?: string | null;
};

function trade({
  id,
  emotion = "Calm",
  status = "closed",
  reviewStatus = "completed",
  reviewId = reviewStatus === "pending" ? null : `review-${id}`,
  reviewVersion = reviewStatus === "pending" ? null : 1,
  tradedOn = "2026-07-01",
  symbol = id.toUpperCase(),
  accountLabel = "Primary",
  pnl = "1",
}: TradeOptions): TradePreview {
  const metrics = deriveTradeMetricsV1({
    assetClass: "stock",
    netRealizedPnl: pnl === null ? null : { amount: pnl, currency: "USD" },
    initialRisk: pnl === null ? null : { amount: "1", currency: "USD" },
    fullEntryNotional: { amount: "100", currency: "USD" },
    isPartial: status === "open",
  });
  return {
    id: `projection-${id}`,
    tradeSubjectId: `subject-${id}`,
    accountId: `account-${accountLabel}`,
    symbol,
    assetClass: "stock",
    side: "long",
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
    setup: "Breakout",
    hasClassifiedSetup: true,
    mistakes: [],
    emotion,
    tradedOn,
    reviewSessionDates: [tradedOn],
    sessionLabel: `${tradedOn} session`,
    accountLabel,
    note: "Fixture",
    tags: [],
    followedPlan: true,
    playbook: "Breakout",
    rules: [],
    initialRisk: pnl === null ? null : { amount: "1", currency: "USD" },
    plannedStop: null,
    reviewStatus,
    reviewId,
    reviewVersion,
    executions: [],
  };
}

function snapshot(trades: readonly TradePreview[]): JournalWorkspaceSnapshot {
  return {
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
    currencyCode: "USD",
    timeZone: "America/New_York",
    accountLabel: "All accounts",
    accountOptions: [],
    periodLabel: "All history",
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
      accountLabel: "All accounts",
      sourceLabel: "Fixture",
      importedAtLabel: "Fixture",
      executions: 0,
      accounts: 0,
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
      emotions: ["Vocabulary only"],
      tags: [],
      playbooks: [],
    },
    dailyJournal: [],
    playbooks: [],
  };
}

describe("emotion-patterns report v1", () => {
  it("pins the independently replayable deeply immutable definition", () => {
    expect(EMOTION_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON).toBe(
      JSON.stringify(EMOTION_PATTERNS_REPORT_DEFINITION),
    );
    expect(sha256Hex(EMOTION_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON)).toBe(
      EMOTION_PATTERNS_REPORT_DEFINITION_SHA256,
    );
    expect(EMOTION_PATTERNS_REPORT_DEFINITION).toMatchObject({
      version: EMOTION_PATTERNS_REPORT_VERSION,
      inputs: {
        projection: "current-projection",
        reviews: "current-review-heads",
        emotion: "current-completed-review.emotion",
      },
      cohort: {
        exclusionPrecedence: [
          "review-status-not-completed=>incompleteReview",
          "completed-with-no-emotion=>noEmotionAssigned",
        ],
        uniqueTradeConservation: "includedTradeCount+exclusions=totalTradeCount",
        assignmentCardinality: "one-exact-emotion-group-per-included-trade",
      },
      groupOrder: "emotion-name:ascending-code-unit",
      counting: {
        reconciliation: "sum(group.tradeCount)=includedTradeCount",
      },
      migration: {
        decision: "derived-only-recompute",
        archiveShapeChange: false,
      },
    });
    for (const value of [
      EMOTION_PATTERNS_REPORT_DEFINITION,
      EMOTION_PATTERNS_REPORT_DEFINITION.inputs,
      EMOTION_PATTERNS_REPORT_DEFINITION.cohort,
      EMOTION_PATTERNS_REPORT_DEFINITION.cohort.exclusionPrecedence,
      EMOTION_PATTERNS_REPORT_DEFINITION.labelValidation,
      EMOTION_PATTERNS_REPORT_DEFINITION.counting,
      EMOTION_PATTERNS_REPORT_DEFINITION.evidenceOrder,
      EMOTION_PATTERNS_REPORT_DEFINITION.migration,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it("stays position and result neutral while conserving one exact group per included trade", () => {
    const report = buildEmotionPatternsReport(snapshot([
      trade({ id: "open-no-result", status: "open", pnl: null, emotion: "Calm" }),
      trade({ id: "closed", emotion: "Calm" }),
      trade({ id: "focused", emotion: "Focused" }),
      trade({ id: "unassigned", emotion: null }),
      trade({ id: "draft", reviewStatus: "draft", emotion: "Ignored draft" }),
      trade({ id: "pending", reviewStatus: "pending", emotion: "Ignored pending" }),
    ]));

    expect(report.metadata).toEqual({
      version: EMOTION_PATTERNS_REPORT_VERSION,
      definitionSha256: EMOTION_PATTERNS_REPORT_DEFINITION_SHA256,
      timeZone: "America/New_York",
      accountLabel: "All accounts",
      periodLabel: "All history",
      totalTradeCount: 6,
      includedTradeCount: 3,
      exclusions: {
        incompleteReview: 2,
        noEmotionAssigned: 1,
      },
    });
    expect(report.groups.map((group) => [
      group.emotion,
      group.tradeCount,
      group.tradeSubjectIds,
    ])).toEqual([
      ["Calm", 2, ["subject-closed", "subject-open-no-result"]],
      ["Focused", 1, ["subject-focused"]],
    ]);
    expect(
      report.metadata.includedTradeCount
      + Object.values(report.metadata.exclusions).reduce((sum, count) => sum + count, 0),
    ).toBe(report.metadata.totalTradeCount);
    expect(report.groups.reduce((sum, group) => sum + group.tradeCount, 0))
      .toBe(report.metadata.includedTradeCount);
    const serialized = JSON.stringify(report);
    expect(serialized).not.toContain("Vocabulary only");
    expect(serialized).not.toContain("resultPnl");
    expect(serialized).not.toContain("resultR");
    expect(serialized).not.toContain("winCount");
    expect(serialized).not.toContain("expectancy");
  });

  it("uses exact label and evidence order independent of projection order or symbol", () => {
    const fixtures = [
      trade({
        id: "z",
        symbol: "DUP",
        accountLabel: "Brokerage",
        emotion: "Zulu",
        tradedOn: "2026-07-02",
      }),
      trade({
        id: "b",
        symbol: "DUP",
        accountLabel: "Retirement",
        emotion: "Alpha",
        tradedOn: "2026-07-03",
      }),
      trade({
        id: "a",
        symbol: "DUP",
        accountLabel: "Brokerage",
        emotion: "Alpha",
        tradedOn: "2026-07-03",
      }),
    ];
    const first = buildEmotionPatternsReport(snapshot(fixtures));
    const second = buildEmotionPatternsReport(
      structuredClone(snapshot([...fixtures].reverse())),
    );

    expect(second).toEqual(first);
    expect(first.groups.map((group) => group.emotion)).toEqual(["Alpha", "Zulu"]);
    expect(first.groups[0]?.tradeSubjectIds).toEqual([
      "subject-a",
      "subject-b",
    ]);
    expect(first.groups[0]?.evidence.map((item) => item.accountLabel)).toEqual([
      "Brokerage",
      "Retirement",
    ]);
    expect(first.groups[1]?.tradeSubjectIds).toEqual(["subject-z"]);
  });

  it("moves only the current stable subject emotion and detaches frozen output", () => {
    const current = trade({ id: "stable", emotion: "Calm" });
    const before = buildEmotionPatternsReport(snapshot([current]));
    const after = buildEmotionPatternsReport(snapshot([{
      ...current,
      emotion: "Focused",
      reviewId: "review-stable-v2",
      reviewVersion: 2,
    }]));

    (current as { emotion: string | null }).emotion = "Source mutated";
    expect(before.groups.map((group) => group.emotion)).toEqual(["Calm"]);
    expect(after.groups.map((group) => [group.emotion, group.tradeSubjectIds])).toEqual([
      ["Focused", ["subject-stable"]],
    ]);
    for (const value of [
      before,
      before.metadata,
      before.metadata.exclusions,
      before.groups,
      before.groups[0],
      before.groups[0]?.tradeSubjectIds,
      before.groups[0]?.evidence,
      before.groups[0]?.evidence[0],
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it("returns a neutral immutable empty cohort", () => {
    const report = buildEmotionPatternsReport(snapshot([
      trade({ id: "empty", emotion: null }),
      trade({ id: "draft", reviewStatus: "draft", emotion: "Ignored" }),
    ]));

    expect(report.groups).toEqual([]);
    expect(report.metadata).toMatchObject({
      totalTradeCount: 2,
      includedTradeCount: 0,
      exclusions: { incompleteReview: 1, noEmotionAssigned: 1 },
    });
    expect(Object.isFrozen(report.groups)).toBe(true);
  });

  it.each([
    ["blank subject", [trade({ id: "blank" })], (items: TradePreview[]) => {
      items[0] = { ...items[0]!, tradeSubjectId: "" };
    }],
    ["duplicate subject", [trade({ id: "duplicate-a" }), trade({ id: "duplicate-b" })], (items: TradePreview[]) => {
      items[1] = { ...items[1]!, tradeSubjectId: items[0]!.tradeSubjectId };
    }],
    ["whitespace subject", [trade({ id: "subject-space" })], (items: TradePreview[]) => {
      items[0] = { ...items[0]!, tradeSubjectId: " subject-space" };
    }],
    ["control subject", [trade({ id: "subject-control" })], (items: TradePreview[]) => {
      items[0] = { ...items[0]!, tradeSubjectId: "subject\u007fcontrol" };
    }],
    ["long subject", [trade({ id: "subject-long" })], (items: TradePreview[]) => {
      items[0] = { ...items[0]!, tradeSubjectId: "s".repeat(257) };
    }],
    ["missing completed head", [trade({ id: "head", reviewId: null })], () => {}],
    ["whitespace completed head", [trade({ id: "head-space", reviewId: " review-head" })], () => {}],
    ["control completed head", [trade({ id: "head-control", reviewId: "review\u009fhead" })], () => {}],
    ["long completed head", [trade({ id: "head-long", reviewId: "r".repeat(257) })], () => {}],
    ["duplicate completed head", [
      trade({ id: "head-duplicate-a", reviewId: "shared-review-head" }),
      trade({ id: "head-duplicate-b", reviewId: "shared-review-head" }),
    ], () => {}],
    ["null completed version", [trade({ id: "version-null", reviewVersion: null })], () => {}],
    ["zero completed version", [trade({ id: "version-zero", reviewVersion: 0 })], () => {}],
    ["negative completed version", [trade({ id: "version-negative", reviewVersion: -1 })], () => {}],
    ["fractional completed version", [trade({ id: "version-fraction", reviewVersion: 1.5 })], () => {}],
    ["unsafe completed version", [trade({
      id: "version-unsafe",
      reviewVersion: Number.MAX_SAFE_INTEGER + 1,
    })], () => {}],
    ["empty emotion", [trade({ id: "empty-emotion", emotion: "" })], () => {}],
    ["non-normalized emotion", [trade({ id: "spaces", emotion: " Calm " })], () => {}],
    ["control emotion", [trade({ id: "control", emotion: "Calm\nstate" })], () => {}],
    ["long emotion", [trade({ id: "long", emotion: "x".repeat(121) })], () => {}],
    ["fold-expanding emotion", [trade({ id: "fold", emotion: "İ".repeat(120) })], () => {}],
    ["non-string emotion", [trade({
      id: "shape",
      emotion: ["Calm", "Focused"] as unknown as string,
    })], () => {}],
    ["cross-head display conflict", [
      trade({ id: "case-a", emotion: "Calm" }),
      trade({ id: "case-b", emotion: "calm" }),
    ], () => {}],
  ] as const)("fails closed for %s", (_label, source, mutate) => {
    const items = [...source] as TradePreview[];
    mutate(items);
    expect(() => buildEmotionPatternsReport(snapshot(items))).toThrow();
  });
});
