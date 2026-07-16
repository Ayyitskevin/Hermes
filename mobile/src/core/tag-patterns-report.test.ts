import { describe, expect, it } from "vitest";

import { sha256Hex } from "../adapters/sqlite/schema/checksum";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  TAG_PATTERNS_REPORT_DEFINITION,
  TAG_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON,
  TAG_PATTERNS_REPORT_DEFINITION_SHA256,
  TAG_PATTERNS_REPORT_VERSION,
  buildTagPatternsReport,
} from "./tag-patterns-report";
import { deriveTradeMetricsV1 } from "./trade-metrics";
import type { JournalWorkspaceSnapshot, TradePreview } from "./types";

type TradeOptions = {
  readonly id: string;
  readonly tags?: readonly string[];
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
  tags = ["Plan followed"],
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
    emotion: "Calm",
    tradedOn,
    reviewSessionDates: [tradedOn],
    sessionLabel: `${tradedOn} session`,
    accountLabel,
    note: "Fixture",
    tags,
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
      emotions: [],
      tags: ["Vocabulary only"],
      playbooks: [],
    },
    dailyJournal: [],
    playbooks: [],
  };
}

describe("tag-patterns report v1", () => {
  it("pins the independently replayable deeply immutable definition", () => {
    expect(TAG_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON).toBe(
      JSON.stringify(TAG_PATTERNS_REPORT_DEFINITION),
    );
    expect(sha256Hex(TAG_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON)).toBe(
      TAG_PATTERNS_REPORT_DEFINITION_SHA256,
    );
    expect(TAG_PATTERNS_REPORT_DEFINITION).toMatchObject({
      version: TAG_PATTERNS_REPORT_VERSION,
      inputs: {
        projection: "current-projection",
        reviews: "current-review-heads",
        tags: "current-completed-review.tags[]",
      },
      cohort: {
        exclusionPrecedence: [
          "review-status-not-completed=>incompleteReview",
          "completed-with-no-tag-assignment=>noTagAssigned",
        ],
        uniqueTradeConservation: "includedTradeCount+exclusions=totalTradeCount",
      },
      labelValidation: {
        content: "C0-C1-control-free-single-line-text",
      },
      groupOrder: "tag-name:ascending-code-unit",
      counting: {
        reconciliation: "sum(group.assignmentCount)=totalAssignmentCount",
      },
      migration: {
        decision: "derived-only-recompute",
        archiveShapeChange: false,
      },
    });
    for (const value of [
      TAG_PATTERNS_REPORT_DEFINITION,
      TAG_PATTERNS_REPORT_DEFINITION.inputs,
      TAG_PATTERNS_REPORT_DEFINITION.cohort,
      TAG_PATTERNS_REPORT_DEFINITION.cohort.exclusionPrecedence,
      TAG_PATTERNS_REPORT_DEFINITION.labelValidation,
      TAG_PATTERNS_REPORT_DEFINITION.counting,
      TAG_PATTERNS_REPORT_DEFINITION.evidenceOrder,
      TAG_PATTERNS_REPORT_DEFINITION.migration,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it("reconciles the exact fictional demo without reading daily-journal tags", () => {
    const report = buildTagPatternsReport(DEMO_WORKSPACE);

    expect(report.metadata).toEqual({
      version: TAG_PATTERNS_REPORT_VERSION,
      definitionSha256: TAG_PATTERNS_REPORT_DEFINITION_SHA256,
      timeZone: "UTC",
      accountLabel: "2 demo accounts",
      periodLabel: "Jul 1–9, 2026",
      totalTradeCount: 8,
      includedTradeCount: 8,
      totalAssignmentCount: 16,
      exclusions: {
        incompleteReview: 0,
        noTagAssigned: 0,
      },
    });
    expect(report.groups.map((group) => [group.tag, group.assignmentCount]))
      .toEqual([
        ["Chased entry", 1],
        ["Early entry", 1],
        ["Early exit", 1],
        ["Invalidation respected", 1],
        ["Opening range", 1],
        ["Patient entry", 1],
        ["Plan followed", 5],
        ["Protected remainder", 1],
        ["Risk reduced", 1],
        ["Stop respected", 1],
        ["Stopped on plan", 1],
        ["Target held", 1],
      ]);
    expect(report.groups.find((group) => group.tag === "Plan followed")
      ?.evidence.map((evidence) => evidence.symbol)).toEqual([
        "META",
        "AMD",
        "NVDA",
        "AAPL",
        "MSFT",
      ]);
    expect(JSON.stringify(report)).not.toContain("Reversal");
  });

  it("keeps position and result neutral while conserving trades and assignments", () => {
    const report = buildTagPatternsReport(snapshot([
      trade({
        id: "open-no-result",
        status: "open",
        pnl: null,
        tags: ["Plan followed", "Opening range"],
      }),
      trade({ id: "positive", pnl: "12", tags: ["Plan followed"] }),
      trade({ id: "negative", pnl: "-9", tags: ["Risk reduced"] }),
      trade({ id: "unassigned", tags: [] }),
      trade({ id: "draft", reviewStatus: "draft", tags: ["Ignored draft"] }),
      trade({ id: "pending", reviewStatus: "pending", tags: ["Ignored pending"] }),
    ]));

    expect(report.metadata).toMatchObject({
      totalTradeCount: 6,
      includedTradeCount: 3,
      totalAssignmentCount: 4,
      exclusions: {
        incompleteReview: 2,
        noTagAssigned: 1,
      },
    });
    expect(report.groups.map((group) => [
      group.tag,
      group.assignmentCount,
      group.tradeSubjectIds,
    ])).toEqual([
      ["Opening range", 1, ["subject-open-no-result"]],
      ["Plan followed", 2, ["subject-open-no-result", "subject-positive"]],
      ["Risk reduced", 1, ["subject-negative"]],
    ]);
    expect(
      report.metadata.includedTradeCount
      + Object.values(report.metadata.exclusions).reduce((sum, count) => sum + count, 0),
    ).toBe(report.metadata.totalTradeCount);
    expect(report.groups.reduce((sum, group) => sum + group.assignmentCount, 0))
      .toBe(report.metadata.totalAssignmentCount);
    const serialized = JSON.stringify(report.groups);
    for (const prohibited of [
      "Vocabulary only",
      "Ignored draft",
      "Ignored pending",
      "netPnlExact",
      "winCount",
      "cashExpectancyExact",
      "averageRExact",
      "rate",
      "rank",
      "advice",
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
  });

  it("uses exact label and evidence order independent of projection order or symbol", () => {
    const fixtures = [
      trade({
        id: "z",
        symbol: "DUP",
        accountLabel: "Brokerage",
        tags: ["Zulu", "Alpha", "😀", "Ä"],
        tradedOn: "2026-07-02",
      }),
      trade({
        id: "b",
        symbol: "DUP",
        accountLabel: "Retirement",
        tags: ["Alpha"],
        tradedOn: "2026-07-03",
      }),
      trade({
        id: "a",
        symbol: "DUP",
        accountLabel: "Brokerage",
        tags: ["Alpha"],
        tradedOn: "2026-07-03",
      }),
    ];
    const first = buildTagPatternsReport(snapshot(fixtures));
    const second = buildTagPatternsReport(
      structuredClone(snapshot([...fixtures].reverse())),
    );

    expect(second).toEqual(first);
    expect(first.groups.map((group) => group.tag)).toEqual([
      "Alpha",
      "Zulu",
      "Ä",
      "😀",
    ]);
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

  it("uses only the current head, moves stable assignments, and detaches output", () => {
    const tags = ["Patient entry", "Shared"];
    const completed = trade({ id: "stable", tags });
    const before = buildTagPatternsReport(snapshot([completed]));
    const whileDraft = buildTagPatternsReport(snapshot([{
      ...completed,
      tags: "Malformed draft tags are excluded first" as unknown as readonly string[],
      reviewStatus: "draft",
      reviewId: "review-stable-draft",
      reviewVersion: 2,
    }]));
    const after = buildTagPatternsReport(snapshot([{
      ...completed,
      tags: ["Risk reduced", "Shared"],
      reviewId: "review-stable-v3",
      reviewVersion: 3,
    }]));

    tags[0] = "Source mutated";
    expect(before.groups.map((group) => group.tag)).toEqual(["Patient entry", "Shared"]);
    expect(whileDraft.groups).toEqual([]);
    expect(whileDraft.metadata.exclusions).toEqual({
      incompleteReview: 1,
      noTagAssigned: 0,
    });
    expect(after.groups.map((group) => [group.tag, group.tradeSubjectIds])).toEqual([
      ["Risk reduced", ["subject-stable"]],
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

  it("ignores tag vocabulary and Daily Journal tags", () => {
    const base = snapshot([trade({ id: "saved", tags: ["Saved trade tag"] })]);
    const withOtherTagSources: JournalWorkspaceSnapshot = {
      ...base,
      reviewOptions: {
        ...base.reviewOptions,
        tags: ["Vocabulary only", "Daily only"],
      },
      dailyJournal: DEMO_WORKSPACE.dailyJournal,
    };

    expect(buildTagPatternsReport(withOtherTagSources))
      .toEqual(buildTagPatternsReport(base));
    expect(JSON.stringify(buildTagPatternsReport(withOtherTagSources)))
      .toBe(JSON.stringify(buildTagPatternsReport(base)));
  });

  it("accepts a canonical 120-code-point astral tag and returns a frozen empty cohort", () => {
    const astral = "😀".repeat(120);
    expect(buildTagPatternsReport(snapshot([
      trade({ id: "astral", tags: [astral] }),
    ])).groups[0]?.tag).toBe(astral);

    const report = buildTagPatternsReport(snapshot([
      trade({ id: "empty", tags: [] }),
      trade({ id: "draft", reviewStatus: "draft", tags: ["Ignored"] }),
    ]));
    expect(report.groups).toEqual([]);
    expect(report.metadata).toMatchObject({
      totalTradeCount: 2,
      includedTradeCount: 0,
      totalAssignmentCount: 0,
      exclusions: { incompleteReview: 1, noTagAssigned: 1 },
    });
    expect(Object.isFrozen(report.groups)).toBe(true);
  });

  it("accepts the exact 20-tag assignment boundary", () => {
    const tags = Array.from(
      { length: 20 },
      (_, index) => `Tag ${String(index).padStart(2, "0")}`,
    );
    const report = buildTagPatternsReport(snapshot([
      trade({ id: "twenty", tags }),
    ]));

    expect(report.metadata.includedTradeCount).toBe(1);
    expect(report.metadata.totalAssignmentCount).toBe(20);
    expect(report.groups).toHaveLength(20);
    expect(report.groups.map((group) => group.tag)).toEqual(tags);
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
    ["non-array tags", [trade({
      id: "shape",
      tags: "Plan followed" as unknown as readonly string[],
    })], () => {}],
    ["non-string tag member", [trade({
      id: "member-shape",
      tags: ["Plan followed", 42 as unknown as string],
    })], () => {}],
    ["blank tag", [trade({ id: "blank-tag", tags: [""] })], () => {}],
    ["non-normalized tag", [trade({ id: "spaces", tags: [" Plan  followed "] })], () => {}],
    ["decomposed tag", [trade({ id: "decomposed", tags: ["Cafe\u0301"] })], () => {}],
    ["control tag", [trade({ id: "control", tags: ["Plan\nfollowed"] })], () => {}],
    ["long tag", [trade({ id: "long", tags: ["x".repeat(121)] })], () => {}],
    ["long astral tag", [trade({ id: "long-astral", tags: ["😀".repeat(121)] })], () => {}],
    ["fold-expanding tag", [trade({ id: "fold", tags: ["İ".repeat(120)] })], () => {}],
    ["too many tags", [trade({
      id: "many",
      tags: Array.from({ length: 21 }, (_, index) => `Tag ${index}`),
    })], () => {}],
    ["within-trade duplicate", [trade({
      id: "same",
      tags: ["Plan followed", "plan followed"],
    })], () => {}],
    ["cross-head display conflict", [
      trade({ id: "case-a", tags: ["Plan followed"] }),
      trade({ id: "case-b", tags: ["plan followed"] }),
    ], () => {}],
  ] as const)("fails closed for %s", (_label, source, mutate) => {
    const items = [...source] as TradePreview[];
    mutate(items);
    expect(() => buildTagPatternsReport(snapshot(items))).toThrow();
  });
});
