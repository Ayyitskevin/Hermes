import { describe, expect, it } from "vitest";

import { sha256Hex } from "../adapters/sqlite/schema/checksum";
import {
  MISTAKE_PATTERNS_REPORT_DEFINITION,
  MISTAKE_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON,
  MISTAKE_PATTERNS_REPORT_DEFINITION_SHA256,
  MISTAKE_PATTERNS_REPORT_VERSION,
  buildMistakePatternsReport,
} from "./mistake-patterns-report";
import { deriveTradeMetricsV1 } from "./trade-metrics";
import type { JournalWorkspaceSnapshot, TradePreview } from "./types";

type TradeOptions = {
  readonly id: string;
  readonly mistakes?: readonly string[];
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
  mistakes = ["Chased entry"],
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
    mistakes,
    emotion: "Calm",
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
      mistakes: ["Vocabulary only"],
      emotions: [],
      tags: [],
      playbooks: [],
    },
    dailyJournal: [],
    playbooks: [],
  };
}

describe("mistake-patterns report v1", () => {
  it("pins the independently replayable deeply immutable definition", () => {
    expect(MISTAKE_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON).toBe(
      JSON.stringify(MISTAKE_PATTERNS_REPORT_DEFINITION),
    );
    expect(sha256Hex(MISTAKE_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON)).toBe(
      MISTAKE_PATTERNS_REPORT_DEFINITION_SHA256,
    );
    expect(MISTAKE_PATTERNS_REPORT_DEFINITION).toMatchObject({
      version: MISTAKE_PATTERNS_REPORT_VERSION,
      inputs: {
        projection: "current-projection",
        reviews: "current-review-heads",
        mistakes: "current-completed-review.mistakes[]",
      },
      cohort: {
        exclusionPrecedence: [
          "review-status-not-completed=>incompleteReview",
          "completed-with-no-mistake-assignment=>noMistakeAssigned",
        ],
        uniqueTradeConservation: "includedTradeCount+exclusions=totalTradeCount",
      },
      groupOrder: "mistake-name:ascending-code-unit",
      counting: {
        reconciliation: "sum(group.assignmentCount)=totalAssignmentCount",
      },
      migration: {
        decision: "derived-only-recompute",
        archiveShapeChange: false,
      },
    });
    for (const value of [
      MISTAKE_PATTERNS_REPORT_DEFINITION,
      MISTAKE_PATTERNS_REPORT_DEFINITION.inputs,
      MISTAKE_PATTERNS_REPORT_DEFINITION.cohort,
      MISTAKE_PATTERNS_REPORT_DEFINITION.cohort.exclusionPrecedence,
      MISTAKE_PATTERNS_REPORT_DEFINITION.labelValidation,
      MISTAKE_PATTERNS_REPORT_DEFINITION.counting,
      MISTAKE_PATTERNS_REPORT_DEFINITION.evidenceOrder,
      MISTAKE_PATTERNS_REPORT_DEFINITION.migration,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it("keeps position and result neutral while conserving unique trades and assignments", () => {
    const report = buildMistakePatternsReport(snapshot([
      trade({
        id: "open-no-result",
        status: "open",
        pnl: null,
        mistakes: ["Chased entry", "Early entry"],
      }),
      trade({ id: "closed", mistakes: ["Chased entry"] }),
      trade({ id: "unassigned", mistakes: [] }),
      trade({ id: "draft", reviewStatus: "draft", mistakes: ["Ignored draft"] }),
      trade({ id: "pending", reviewStatus: "pending", mistakes: ["Ignored pending"] }),
    ]));

    expect(report.metadata).toEqual({
      version: MISTAKE_PATTERNS_REPORT_VERSION,
      definitionSha256: MISTAKE_PATTERNS_REPORT_DEFINITION_SHA256,
      timeZone: "America/New_York",
      accountLabel: "All accounts",
      periodLabel: "All history",
      totalTradeCount: 5,
      includedTradeCount: 2,
      totalAssignmentCount: 3,
      exclusions: {
        incompleteReview: 2,
        noMistakeAssigned: 1,
      },
    });
    expect(report.groups.map((group) => [
      group.mistake,
      group.assignmentCount,
      group.tradeSubjectIds,
    ])).toEqual([
      ["Chased entry", 2, ["subject-closed", "subject-open-no-result"]],
      ["Early entry", 1, ["subject-open-no-result"]],
    ]);
    expect(
      report.metadata.includedTradeCount
      + Object.values(report.metadata.exclusions).reduce((sum, count) => sum + count, 0),
    ).toBe(report.metadata.totalTradeCount);
    expect(report.groups.reduce((sum, group) => sum + group.assignmentCount, 0))
      .toBe(report.metadata.totalAssignmentCount);
    expect(JSON.stringify(report.groups)).not.toContain("Vocabulary only");
    for (const group of report.groups) {
      expect(group).not.toHaveProperty("netPnlExact");
      expect(group).not.toHaveProperty("winCount");
      expect(group).not.toHaveProperty("cashExpectancyExact");
      expect(group).not.toHaveProperty("averageRExact");
    }
  });

  it("uses exact label and evidence order independent of projection order or symbol", () => {
    const fixtures = [
      trade({
        id: "z",
        symbol: "DUP",
        accountLabel: "Brokerage",
        mistakes: ["Zulu", "Alpha"],
        tradedOn: "2026-07-02",
      }),
      trade({
        id: "b",
        symbol: "DUP",
        accountLabel: "Retirement",
        mistakes: ["Alpha"],
        tradedOn: "2026-07-03",
      }),
      trade({
        id: "a",
        symbol: "DUP",
        accountLabel: "Brokerage",
        mistakes: ["Alpha"],
        tradedOn: "2026-07-03",
      }),
    ];
    const first = buildMistakePatternsReport(snapshot(fixtures));
    const second = buildMistakePatternsReport(
      structuredClone(snapshot([...fixtures].reverse())),
    );

    expect(second).toEqual(first);
    expect(first.groups.map((group) => group.mistake)).toEqual(["Alpha", "Zulu"]);
    expect(first.groups[0]?.tradeSubjectIds).toEqual([
      "subject-a",
      "subject-b",
      "subject-z",
    ]);
    expect(first.groups[0]?.evidence.map((item) => item.accountLabel)).toEqual([
      "Brokerage",
      "Retirement",
      "Brokerage",
    ]);
  });

  it("moves only the current stable subject assignments and detaches frozen output", () => {
    const mistakes = ["Early entry", "Shared"];
    const current = trade({ id: "stable", mistakes });
    const before = buildMistakePatternsReport(snapshot([current]));
    const after = buildMistakePatternsReport(snapshot([{
      ...current,
      mistakes: ["Chased entry", "Shared"],
      reviewId: "review-stable-v2",
      reviewVersion: 2,
    }]));

    mistakes[0] = "Source mutated";
    expect(before.groups.map((group) => group.mistake)).toEqual(["Early entry", "Shared"]);
    expect(after.groups.map((group) => [group.mistake, group.tradeSubjectIds])).toEqual([
      ["Chased entry", ["subject-stable"]],
      ["Shared", ["subject-stable"]],
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
    const report = buildMistakePatternsReport(snapshot([
      trade({ id: "empty", mistakes: [] }),
      trade({ id: "draft", reviewStatus: "draft", mistakes: ["Ignored"] }),
    ]));

    expect(report.groups).toEqual([]);
    expect(report.metadata).toMatchObject({
      totalTradeCount: 2,
      includedTradeCount: 0,
      totalAssignmentCount: 0,
      exclusions: { incompleteReview: 1, noMistakeAssigned: 1 },
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
    ["non-normalized label", [trade({ id: "spaces", mistakes: [" Early  entry "] })], () => {}],
    ["control label", [trade({ id: "control", mistakes: ["Early\nentry"] })], () => {}],
    ["long label", [trade({ id: "long", mistakes: ["x".repeat(121)] })], () => {}],
    ["too many labels", [trade({
      id: "many",
      mistakes: Array.from({ length: 21 }, (_, index) => `Mistake ${index}`),
    })], () => {}],
    ["within-trade duplicate", [trade({
      id: "same",
      mistakes: ["Early entry", "early entry"],
    })], () => {}],
    ["cross-head display conflict", [
      trade({ id: "case-a", mistakes: ["Early entry"] }),
      trade({ id: "case-b", mistakes: ["early entry"] }),
    ], () => {}],
  ] as const)("fails closed for %s", (_label, source, mutate) => {
    const items = [...source] as TradePreview[];
    mutate(items);
    expect(() => buildMistakePatternsReport(snapshot(items))).toThrow();
  });
});
