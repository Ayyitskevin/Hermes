import { describe, expect, it } from "vitest";

import type {
  JournalAccountOption,
  JournalWorkspaceSnapshot,
  TradePreview,
} from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import { buildExactAccountReviewCoverageScope } from "./account-review-coverage-scope";

function coherentSnapshot(
  trades: readonly TradePreview[],
  extraAccounts: readonly JournalAccountOption[] = [],
): JournalWorkspaceSnapshot {
  const accountOptions = [
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
    accountOptions,
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

describe("exact account review coverage scope", () => {
  it.each([
    ["draft", 1, ["demo-subject-msft"]],
    ["pending", 1, ["demo-subject-aapl"]],
    ["completed", 2, ["demo-subject-amd", "demo-subject-meta"]],
  ] as const)(
    "opens the exact primary-account %s cohort from an empty browser state",
    (reviewState, count, subjects) => {
      const target = buildExactAccountReviewCoverageScope(
        mixedSnapshot(),
        "demo-account-primary",
        reviewState,
        count,
      );

      expect(target).toMatchObject({
        accountId: "demo-account-primary",
        accountLabel: "Demo Brokerage",
        accountPosition: 1,
        accountCount: 3,
        reviewState,
        tradeCount: count,
        tradeSubjectIds: subjects,
      });
      expect(target.scope.state).toMatchObject({
        accountId: "demo-account-primary",
        activityFrom: null,
        activityThrough: null,
        selectedDay: null,
        query: "",
        assetClass: "all",
        direction: "all",
        positionState: "closed",
        reviewState,
        setup: null,
        mistake: null,
        emotion: null,
        tag: null,
        playbook: null,
      });
      expect(target.scope.evidence).toHaveLength(5);
      expect(target.scope.visibleEvidence.map(({ trade }) => (
        trade.tradeSubjectId
      )).sort()).toEqual(subjects);
      expect(target.scope.visibleEvidence.every(({ trade }) => (
        trade.accountId === "demo-account-primary"
        && trade.status === "closed"
        && trade.reviewStatus === reviewState
      ))).toBe(true);
      expect(target.scope.visibleEvidence.some(({ trade }) => (
        trade.tradeSubjectId === "demo-subject-nvda"
      ))).toBe(false);
      expect(Object.isFrozen(target)).toBe(true);
      expect(Object.isFrozen(target.tradeSubjectIds)).toBe(true);
    },
  );

  it("uses stable account ID and position when labels are duplicated", () => {
    const mixed = mixedSnapshot();
    const snapshot: JournalWorkspaceSnapshot = {
      ...mixed,
      accountOptions: mixed.accountOptions.map((account) => ({
        ...account,
        label: account.id === "retained-account" ? account.label : "Same account",
      })).sort((left, right) => (
        left.label < right.label ? -1
          : left.label > right.label ? 1
            : left.id < right.id ? -1
              : left.id > right.id ? 1
                : 0
      )),
      trades: mixed.trades.map((trade) => ({
        ...trade,
        accountLabel: "Same account",
      })),
    };
    const target = buildExactAccountReviewCoverageScope(
      snapshot,
      "demo-account-primary",
      "pending",
      1,
    );

    expect(target.accountPosition).toBe(2);
    expect(target.scope.accountLabel).toBe("Same account · account 2 of 3");
    expect(target.scope.visibleEvidence[0]?.trade.tradeSubjectId)
      .toBe("demo-subject-aapl");
  });

  it("rejects missing, empty, unsupported, and stale cohort requests", () => {
    const snapshot = mixedSnapshot();
    expect(() => buildExactAccountReviewCoverageScope(
      snapshot,
      "missing-account",
      "pending",
      1,
    )).toThrow("not available");
    expect(() => buildExactAccountReviewCoverageScope(
      snapshot,
      "retained-account",
      "pending",
      1,
    )).toThrow("no longer available");
    expect(() => buildExactAccountReviewCoverageScope(
      snapshot,
      "demo-account-primary",
      "pending",
      2,
    )).toThrow("no longer available");
    expect(() => buildExactAccountReviewCoverageScope(
      snapshot,
      "demo-account-primary",
      "pending",
      0,
    )).toThrow("positive safe integer");
    expect(() => buildExactAccountReviewCoverageScope(
      snapshot,
      "demo-account-primary",
      "open" as never,
      1,
    )).toThrow("unsupported");
  });
});
