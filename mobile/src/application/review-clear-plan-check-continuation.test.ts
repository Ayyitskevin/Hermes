import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  buildReviewClearPlanCheckContinuation,
} from "./review-clear-plan-check-continuation";

function localWorkspace(
  overrides: Partial<JournalWorkspaceSnapshot> = {},
): JournalWorkspaceSnapshot {
  return {
    ...DEMO_WORKSPACE,
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
    ...overrides,
  };
}

function waitingWorkspace(): JournalWorkspaceSnapshot {
  const pending: TradePreview = {
    ...DEMO_WORKSPACE.trades[0]!,
    reviewStatus: "pending",
    reviewId: null,
    reviewVersion: null,
    reviewSessionDates: [],
  };
  return localWorkspace({
    trades: [pending, ...DEMO_WORKSPACE.trades.slice(1)],
    reviewProgress: {
      ...DEMO_WORKSPACE.reviewProgress,
      pendingTrades: 1,
      draftTrades: 0,
      completedTrades: DEMO_WORKSPACE.reviewProgress.completedTrades - 1,
    },
  });
}

describe("review-clear Plan Check continuation", () => {
  it("derives frozen Dashboard and Journal continuations only after a local review queue clears", () => {
    const dashboard = buildReviewClearPlanCheckContinuation(
      localWorkspace(),
      "dashboard",
    );
    const journal = buildReviewClearPlanCheckContinuation(
      localWorkspace(),
      "journal",
    );

    expect(dashboard).toEqual({
      origin: "dashboard",
      completedTradeCount: DEMO_WORKSPACE.reviewProgress.completedTrades,
      reportTargetId: "plan-check-title",
    });
    expect(journal).toEqual({
      origin: "journal",
      completedTradeCount: DEMO_WORKSPACE.reviewProgress.completedTrades,
      reportTargetId: "plan-check-title",
    });
    expect(Object.isFrozen(dashboard)).toBe(true);
    expect(Object.isFrozen(journal)).toBe(true);
  });

  it("does not bypass waiting reviews or invent a continuation without a completed closed review", () => {
    expect(buildReviewClearPlanCheckContinuation(
      waitingWorkspace(),
      "dashboard",
    )).toBeNull();
    expect(buildReviewClearPlanCheckContinuation(localWorkspace({
      trades: [],
      reviewProgress: {
        pendingTrades: 0,
        draftTrades: 0,
        completedTrades: 0,
        streakSessions: 0,
        reviewedSessions: 0,
        tradingSessions: 0,
      },
    }), "journal")).toBeNull();
  });

  it("keeps a nonempty open-only local journal outside the continuation", () => {
    const openTrade: TradePreview = {
      ...DEMO_WORKSPACE.trades[0]!,
      status: "open",
    };
    const openOnly = localWorkspace({
      trades: [openTrade],
      reviewProgress: {
        pendingTrades: 0,
        draftTrades: 0,
        completedTrades: 0,
        streakSessions: 0,
        reviewedSessions: 0,
        tradingSessions: 1,
      },
    });

    expect(buildReviewClearPlanCheckContinuation(openOnly, "dashboard")).toBeNull();
    expect(buildReviewClearPlanCheckContinuation(openOnly, "journal")).toBeNull();
  });

  it("keeps fictional and empty workspaces outside the local continuation", () => {
    expect(buildReviewClearPlanCheckContinuation(
      DEMO_WORKSPACE,
      "dashboard",
    )).toBeNull();
    expect(buildReviewClearPlanCheckContinuation({
      ...DEMO_WORKSPACE,
      provenance: "empty",
      provenanceLabel: "EMPTY JOURNAL",
      trades: [],
      reviewProgress: {
        pendingTrades: 0,
        draftTrades: 0,
        completedTrades: 0,
        streakSessions: 0,
        reviewedSessions: 0,
        tradingSessions: 0,
      },
    }, "journal")).toBeNull();
  });

  it("fails closed when current review counts do not reconcile", () => {
    expect(() => buildReviewClearPlanCheckContinuation(localWorkspace({
      reviewProgress: {
        ...DEMO_WORKSPACE.reviewProgress,
        completedTrades: DEMO_WORKSPACE.reviewProgress.completedTrades + 1,
      },
    }), "dashboard")).toThrow(/completed closed trades/u);
  });
});
