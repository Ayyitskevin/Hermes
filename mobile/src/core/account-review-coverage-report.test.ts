import { describe, expect, it } from "vitest";

import { sha256Hex } from "../adapters/sqlite/schema/checksum";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  ACCOUNT_REVIEW_COVERAGE_GROUP_ORDER,
  ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION,
  ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION_CANONICAL_JSON,
  ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION_SHA256,
  ACCOUNT_REVIEW_COVERAGE_REPORT_VERSION,
  buildAccountReviewCoverageReport,
} from "./account-review-coverage-report";
import type {
  JournalAccountOption,
  JournalWorkspaceSnapshot,
  TradePreview,
} from "./types";

function demoTrade(symbol: string): TradePreview {
  const trade = DEMO_WORKSPACE.trades.find((candidate) => candidate.symbol === symbol);
  if (trade === undefined) throw new Error(`Missing demo trade ${symbol}.`);
  return trade;
}

function coherentSnapshot(
  trades: readonly TradePreview[],
  extraAccounts: readonly JournalAccountOption[] = [],
): JournalWorkspaceSnapshot {
  const accounts = [
    ...DEMO_WORKSPACE.accountOptions.map((account) => ({
      ...account,
      tradeCount: trades.filter((trade) => trade.accountId === account.id).length,
    })),
    ...extraAccounts,
  ].sort((left, right) => (
    left.label < right.label ? -1
      : left.label > right.label ? 1
        : left.id < right.id ? -1
          : left.id > right.id ? 1
            : 0
  ));
  const closed = trades.filter((trade) => trade.status === "closed");
  return {
    ...DEMO_WORKSPACE,
    accountOptions: accounts,
    trades,
    reviewProgress: {
      ...DEMO_WORKSPACE.reviewProgress,
      pendingTrades: closed.filter((trade) => trade.reviewStatus !== "completed").length,
      draftTrades: closed.filter((trade) => trade.reviewStatus === "draft").length,
      completedTrades: closed.filter((trade) => trade.reviewStatus === "completed").length,
    },
  };
}

function mixedSnapshot(): JournalWorkspaceSnapshot {
  return coherentSnapshot(DEMO_WORKSPACE.trades.map((trade) => {
    if (trade.symbol === "AAPL") {
      return {
        ...trade,
        reviewStatus: "pending" as const,
        reviewId: null,
        reviewVersion: null,
      };
    }
    if (trade.symbol === "MSFT") {
      return { ...trade, reviewStatus: "draft" as const };
    }
    if (trade.symbol === "NVDA") {
      return { ...trade, status: "open" as const };
    }
    return trade;
  }), [{ id: "retained-account", label: "Retained archive", tradeCount: 0 }]);
}

describe("account review coverage report v1", () => {
  it("pins the independently replayable deeply immutable definition", () => {
    expect(ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION_CANONICAL_JSON).toBe(
      JSON.stringify(ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION),
    );
    expect(sha256Hex(
      ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION_CANONICAL_JSON,
    )).toBe(ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION_SHA256);
    expect(ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION).toMatchObject({
      version: ACCOUNT_REVIEW_COVERAGE_REPORT_VERSION,
      cohort: {
        accountInclusion: "every-retained-account-including-zero-trade-accounts",
        tradeInclusion: "every-current-projection-trade-exactly-once",
        openTreatment:
          "counted-once-as-open-and-excluded-from-closed-review-state-actions",
      },
      groupOrder: ["draft", "pending", "completed", "open"],
      counting: {
        rates: "not-calculated",
        accountComparison: "not-calculated",
      },
      navigation: {
        actionCohorts: ["draft", "pending", "completed"],
        automaticReviewOpen: false,
      },
      migration: {
        decision: "derived-only-recompute",
        archiveShapeChange: false,
      },
    });
    for (const value of [
      ACCOUNT_REVIEW_COVERAGE_GROUP_ORDER,
      ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION,
      ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION.inputs,
      ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION.inputs.tradeFields,
      ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION.cohort,
      ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION.cohort.conservation,
      ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION.reviewHeadValidation,
      ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION.groupOrder,
      ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION.counting,
      ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION.navigation,
      ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION.navigation.actionCohorts,
      ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION.migration,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it("counts every demo trade once in stable account and review-state order", () => {
    const report = buildAccountReviewCoverageReport(DEMO_WORKSPACE);

    expect(report.metadata).toEqual({
      version: ACCOUNT_REVIEW_COVERAGE_REPORT_VERSION,
      definitionSha256: ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION_SHA256,
      timeZone: "UTC",
      accountLabel: "2 demo accounts",
      periodLabel: "Jul 1–9, 2026",
      accountCount: 2,
      totalTradeCount: 8,
      closedTradeCount: 8,
      openTradeCount: 0,
      waitingReviewCount: 0,
      pendingReviewCount: 0,
      draftReviewCount: 0,
      completedReviewCount: 8,
    });
    expect(report.accounts.map((account) => ({
      id: account.accountId,
      label: account.accountLabel,
      position: account.position,
      tradeCount: account.tradeCount,
      groups: account.groups.map((group) => [
        group.classification,
        group.tradeCount,
        group.tradeSubjectIds,
      ]),
    }))).toEqual([
      {
        id: "demo-account-primary",
        label: "Demo Brokerage",
        position: 1,
        tradeCount: 5,
        groups: [
          ["draft", 0, []],
          ["pending", 0, []],
          ["completed", 5, [
            "demo-subject-aapl",
            "demo-subject-amd",
            "demo-subject-meta",
            "demo-subject-msft",
            "demo-subject-nvda",
          ]],
          ["open", 0, []],
        ],
      },
      {
        id: "demo-account-swing",
        label: "Demo Swing",
        position: 2,
        tradeCount: 3,
        groups: [
          ["draft", 0, []],
          ["pending", 0, []],
          ["completed", 3, [
            "demo-subject-qqq",
            "demo-subject-spy",
            "demo-subject-tsla",
          ]],
          ["open", 0, []],
        ],
      },
    ]);
  });

  it("returns an all-zero immutable report when no account is retained", () => {
    const snapshot: JournalWorkspaceSnapshot = {
      ...coherentSnapshot([]),
      accountLabel: "No retained accounts",
      periodLabel: "No trades yet",
      accountOptions: [],
    };
    const report = buildAccountReviewCoverageReport(snapshot);

    expect(report.metadata).toEqual({
      version: ACCOUNT_REVIEW_COVERAGE_REPORT_VERSION,
      definitionSha256: ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION_SHA256,
      timeZone: "UTC",
      accountLabel: "No retained accounts",
      periodLabel: "No trades yet",
      accountCount: 0,
      totalTradeCount: 0,
      closedTradeCount: 0,
      openTradeCount: 0,
      waitingReviewCount: 0,
      pendingReviewCount: 0,
      draftReviewCount: 0,
      completedReviewCount: 0,
    });
    expect(report.accounts).toEqual([]);
    expect(Object.isFrozen(report.accounts)).toBe(true);
  });

  it("conserves mixed states per account and retains zero-trade accounts", () => {
    const report = buildAccountReviewCoverageReport(mixedSnapshot());
    const primary = report.accounts[0];
    const retained = report.accounts[2];

    expect(report.metadata).toMatchObject({
      accountCount: 3,
      totalTradeCount: 8,
      closedTradeCount: 7,
      openTradeCount: 1,
      waitingReviewCount: 2,
      pendingReviewCount: 1,
      draftReviewCount: 1,
      completedReviewCount: 5,
    });
    expect(primary?.groups.map((group) => [
      group.classification,
      group.tradeCount,
      group.tradeSubjectIds,
    ])).toEqual([
      ["draft", 1, ["demo-subject-msft"]],
      ["pending", 1, ["demo-subject-aapl"]],
      ["completed", 2, ["demo-subject-amd", "demo-subject-meta"]],
      ["open", 1, ["demo-subject-nvda"]],
    ]);
    expect(retained).toEqual({
      accountId: "retained-account",
      accountLabel: "Retained archive",
      position: 3,
      tradeCount: 0,
      groups: [
        { classification: "draft", tradeCount: 0, tradeSubjectIds: [] },
        { classification: "pending", tradeCount: 0, tradeSubjectIds: [] },
        { classification: "completed", tradeCount: 0, tradeSubjectIds: [] },
        { classification: "open", tradeCount: 0, tradeSubjectIds: [] },
      ],
    });
    for (const account of report.accounts) {
      expect(account.groups.reduce((total, group) => total + group.tradeCount, 0))
        .toBe(account.tradeCount);
    }
  });

  it("classifies every open trade as excluded regardless of its review state", () => {
    const aapl = demoTrade("AAPL");
    const msft = demoTrade("MSFT");
    const nvda = demoTrade("NVDA");
    const trades: readonly TradePreview[] = [
      {
        ...aapl,
        status: "open",
        reviewStatus: "pending",
        reviewId: null,
        reviewVersion: null,
      },
      { ...msft, status: "open", reviewStatus: "draft" },
      { ...nvda, status: "open", reviewStatus: "completed" },
    ];
    const report = buildAccountReviewCoverageReport(coherentSnapshot(trades));
    const primary = report.accounts[0];

    expect(report.metadata).toMatchObject({
      closedTradeCount: 0,
      openTradeCount: 3,
      waitingReviewCount: 0,
      completedReviewCount: 0,
    });
    expect(primary?.groups.map((group) => [
      group.classification,
      group.tradeCount,
    ])).toEqual([
      ["draft", 0],
      ["pending", 0],
      ["completed", 0],
      ["open", 3],
    ]);
  });

  it("returns detached deeply frozen report state", () => {
    const snapshot = mixedSnapshot();
    const report = buildAccountReviewCoverageReport(snapshot);

    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.metadata)).toBe(true);
    expect(Object.isFrozen(report.accounts)).toBe(true);
    for (const account of report.accounts) {
      expect(Object.isFrozen(account)).toBe(true);
      expect(Object.isFrozen(account.groups)).toBe(true);
      for (const group of account.groups) {
        expect(Object.isFrozen(group)).toBe(true);
        expect(Object.isFrozen(group.tradeSubjectIds)).toBe(true);
      }
    }
    const source = snapshot.accountOptions[0] as { label: string };
    source.label = "Changed after derivation";
    expect(report.accounts[0]?.accountLabel).toBe("Demo Brokerage");
  });

  it("fails closed for account, trade, head, count, order, and progress drift", () => {
    const coherent = mixedSnapshot();
    expect(() => buildAccountReviewCoverageReport({
      ...coherent,
      accountOptions: coherent.accountOptions.map((account, index) => (
        index === 0 ? { ...account, tradeCount: account.tradeCount + 1 } : account
      )),
    })).toThrow("its option reports");
    expect(() => buildAccountReviewCoverageReport({
      ...coherent,
      accountOptions: [...coherent.accountOptions].reverse(),
    })).toThrow("stable account-label and account-ID order");
    expect(() => buildAccountReviewCoverageReport({
      ...coherent,
      trades: coherent.trades.map((trade, index) => (
        index === 0 ? { ...trade, accountLabel: "Wrong account" } : trade
      )),
    })).toThrow("account label does not reconcile");
    expect(() => buildAccountReviewCoverageReport({
      ...coherent,
      trades: coherent.trades.map((trade, index) => (
        index === 0 ? { ...trade, tradeSubjectId: coherent.trades[1]!.tradeSubjectId } : trade
      )),
    })).toThrow("appears more than once");
    expect(() => buildAccountReviewCoverageReport({
      ...coherent,
      trades: coherent.trades.map((trade) => (
        trade.reviewStatus === "pending"
          ? { ...trade, reviewId: "invalid-pending-head", reviewVersion: 1 }
          : trade
      )),
    })).toThrow("must not have a saved review identity");
    expect(() => buildAccountReviewCoverageReport({
      ...coherent,
      reviewProgress: {
        ...coherent.reviewProgress,
        completedTrades: coherent.reviewProgress.completedTrades + 1,
      },
    })).toThrow("does not reconcile with review progress");
  });
});
