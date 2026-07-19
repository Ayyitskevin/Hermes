import { describe, expect, it } from "vitest";

import type {
  JournalWorkspaceSnapshot,
  TradePreview,
} from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  buildReviewQueue,
  firstReviewQueueTrade,
} from "./review-queue";

function pending(trade: TradePreview): TradePreview {
  return {
    ...trade,
    reviewStatus: "pending",
    reviewId: null,
    reviewVersion: null,
  };
}

function draft(trade: TradePreview): TradePreview {
  return {
    ...trade,
    reviewStatus: "draft",
  };
}

function snapshotWith(
  trades: readonly TradePreview[],
  progress: Partial<JournalWorkspaceSnapshot["reviewProgress"]> = {},
): JournalWorkspaceSnapshot {
  const closed = trades.filter((trade) => trade.status === "closed");
  return {
    ...DEMO_WORKSPACE,
    trades,
    reviewProgress: {
      ...DEMO_WORKSPACE.reviewProgress,
      pendingTrades: closed.filter((trade) => (
        trade.reviewStatus !== "completed"
      )).length,
      draftTrades: closed.filter((trade) => (
        trade.reviewStatus === "draft"
      )).length,
      completedTrades: closed.filter((trade) => (
        trade.reviewStatus === "completed"
      )).length,
      ...progress,
    },
  };
}

describe("review queue projection", () => {
  it("groups drafts before not-started trades while preserving snapshot order", () => {
    const source = DEMO_WORKSPACE.trades;
    const trades = [
      pending(source[0]!),
      draft(source[1]!),
      pending(source[2]!),
      draft(source[3]!),
      ...source.slice(4),
    ];

    const queue = buildReviewQueue(snapshotWith(trades));

    expect(queue).toMatchObject({
      waitingTradeCount: 4,
      draftTradeCount: 2,
      pendingTradeCount: 2,
    });
    expect(queue.groups.map((group) => group.classification)).toEqual([
      "draft",
      "pending",
    ]);
    expect(queue.groups[0].trades).toEqual([trades[1], trades[3]]);
    expect(queue.groups[1].trades).toEqual([trades[0], trades[2]]);
    expect(queue.groups[0].tradeSubjectIds).toEqual([
      trades[1]!.tradeSubjectId,
      trades[3]!.tradeSubjectId,
    ]);
    expect(queue.groups[1].tradeSubjectIds).toEqual([
      trades[0]!.tradeSubjectId,
      trades[2]!.tradeSubjectId,
    ]);
    expect(Object.isFrozen(queue)).toBe(true);
    expect(Object.isFrozen(queue.groups)).toBe(true);
    expect(queue.groups.every((group) => (
      Object.isFrozen(group)
      && Object.isFrozen(group.trades)
      && Object.isFrozen(group.tradeSubjectIds)
    ))).toBe(true);
  });

  it("selects the first draft, then the first pending trade, then no trade", () => {
    const source = DEMO_WORKSPACE.trades;
    const draftFirstQueue = buildReviewQueue(snapshotWith([
      pending(source[0]!),
      draft(source[1]!),
      ...source.slice(2),
    ]));
    const pendingOnlyQueue = buildReviewQueue(snapshotWith([
      pending(source[0]!),
      ...source.slice(1),
    ]));
    const emptyQueue = buildReviewQueue(DEMO_WORKSPACE);
    expect(firstReviewQueueTrade(draftFirstQueue)?.tradeSubjectId).toBe(
      source[1]!.tradeSubjectId,
    );
    expect(firstReviewQueueTrade(pendingOnlyQueue)?.tradeSubjectId).toBe(
      source[0]!.tradeSubjectId,
    );
    expect(firstReviewQueueTrade(emptyQueue)).toBeNull();
  });

  it("detaches and deeply freezes validated queue trades from mutable source objects", () => {
    const source = pending({
      ...DEMO_WORKSPACE.trades[0]!,
      mistakes: [...DEMO_WORKSPACE.trades[0]!.mistakes],
      executions: DEMO_WORKSPACE.trades[0]!.executions.map((execution) => ({
        ...execution,
      })),
    });
    const originalSubjectId = source.tradeSubjectId;
    const originalMistakes = [...source.mistakes];
    const queue = buildReviewQueue(snapshotWith([
      source,
      ...DEMO_WORKSPACE.trades.slice(1),
    ]));
    const projected = queue.groups[1].trades[0]!;

    (source as { tradeSubjectId: string }).tradeSubjectId = "mutated-subject";
    (source as { reviewStatus: TradePreview["reviewStatus"] }).reviewStatus =
      "completed";
    (source.mistakes as string[]).push("mutated mistake");
    (source.executions[0] as { price: string }).price = "999";

    expect(queue.groups[1].tradeSubjectIds).toEqual([originalSubjectId]);
    expect(projected.tradeSubjectId).toBe(originalSubjectId);
    expect(projected.reviewStatus).toBe("pending");
    expect(projected.mistakes).toEqual(originalMistakes);
    expect(projected.executions[0]?.price).not.toBe("999");
    expect(Object.isFrozen(projected)).toBe(true);
    expect(Object.isFrozen(projected.mistakes)).toBe(true);
    expect(Object.isFrozen(projected.executions)).toBe(true);
    expect(Object.isFrozen(projected.executions[0])).toBe(true);
  });

  it("excludes open trades without changing their coherent current review heads", () => {
    const first = {
      ...pending(DEMO_WORKSPACE.trades[0]!),
      status: "open" as const,
    };
    const second = pending(DEMO_WORKSPACE.trades[1]!);
    const snapshot = snapshotWith([
      first,
      second,
      ...DEMO_WORKSPACE.trades.slice(2),
    ]);

    const queue = buildReviewQueue(snapshot);

    expect(queue.waitingTradeCount).toBe(1);
    expect(queue.groups[1].trades).toEqual([second]);
    expect(queue.groups.flatMap((group) => group.trades)).not.toContain(first);
  });

  it("validates and excludes coherent open draft and completed heads", () => {
    const source = DEMO_WORKSPACE.trades;
    const openDraft = {
      ...draft(source[0]!),
      status: "open" as const,
    };
    const openCompleted = {
      ...source[1]!,
      status: "open" as const,
    };
    const closedPending = pending(source[2]!);
    const queue = buildReviewQueue(snapshotWith([
      openDraft,
      openCompleted,
      closedPending,
      ...source.slice(3),
    ]));

    expect(queue.waitingTradeCount).toBe(1);
    expect(queue.groups[1].trades).toEqual([closedPending]);
    expect(queue.groups.flatMap((group) => group.trades)).not.toContain(openDraft);
    expect(queue.groups.flatMap((group) => group.trades)).not.toContain(openCompleted);
  });

  it.each([
    ["empty", ""],
    ["leading space", " subject"],
    ["control character", "subject\u0000id"],
    ["too long", "😀".repeat(257)],
  ])("rejects an invalid %s stable subject identity", (_label, tradeSubjectId) => {
    const invalid = {
      ...DEMO_WORKSPACE.trades[0]!,
      tradeSubjectId,
    };
    expect(() => buildReviewQueue(snapshotWith([
      invalid,
      ...DEMO_WORKSPACE.trades.slice(1),
    ]))).toThrow(/subject ID|code points/u);
  });

  it("rejects duplicate stable subjects even outside the waiting cohort", () => {
    const source = DEMO_WORKSPACE.trades;
    const duplicate = {
      ...source[1]!,
      tradeSubjectId: source[0]!.tradeSubjectId,
    };
    expect(() => buildReviewQueue(snapshotWith([
      source[0]!,
      duplicate,
      ...source.slice(2),
    ]))).toThrow(/appears more than once/u);
  });

  it.each([
    {
      label: "pending head with a saved ID",
      trade: {
        ...pending(DEMO_WORKSPACE.trades[0]!),
        reviewId: "unexpected-review",
      },
      pattern: /must not have a saved review identity/u,
    },
    {
      label: "draft head without an ID",
      trade: {
        ...draft(DEMO_WORKSPACE.trades[0]!),
        reviewId: null,
      },
      pattern: /review ID/u,
    },
    {
      label: "draft head with version zero",
      trade: {
        ...draft(DEMO_WORKSPACE.trades[0]!),
        reviewVersion: 0,
      },
      pattern: /positive saved review version/u,
    },
    {
      label: "completed head without an ID",
      trade: {
        ...DEMO_WORKSPACE.trades[0]!,
        reviewId: null,
      },
      pattern: /review ID/u,
    },
  ])("rejects an incoherent $label", ({ trade, pattern }) => {
    expect(() => buildReviewQueue(snapshotWith([
      trade as TradePreview,
      ...DEMO_WORKSPACE.trades.slice(1),
    ]))).toThrow(pattern);
  });

  it("rejects repeated current review-head identities", () => {
    const source = DEMO_WORKSPACE.trades;
    const duplicate = {
      ...source[1]!,
      reviewId: source[0]!.reviewId,
    };
    expect(() => buildReviewQueue(snapshotWith([
      source[0]!,
      duplicate,
      ...source.slice(2),
    ]))).toThrow(/Current review ID .* appears more than once/u);
  });

  it("rejects repeated draft review-head identities", () => {
    const source = DEMO_WORKSPACE.trades;
    const first = draft(source[0]!);
    const second = {
      ...draft(source[1]!),
      reviewId: first.reviewId,
    };
    expect(() => buildReviewQueue(snapshotWith([
      first,
      second,
      ...source.slice(2),
    ]))).toThrow(/Current review ID .* appears more than once/u);
  });

  it.each([
    ["waiting", { pendingTrades: 1 }, /waiting trades/u],
    ["draft", { draftTrades: 1 }, /drafts/u],
    ["completed", { completedTrades: 7 }, /completed closed trades/u],
  ] as const)("rejects a mismatched %s progress count", (_label, progress, pattern) => {
    expect(() => buildReviewQueue(snapshotWith(
      DEMO_WORKSPACE.trades,
      progress,
    ))).toThrow(pattern);
  });

  it.each([
    ["negative", -1],
    ["fractional", 1.5],
    ["unsafe", Number.MAX_SAFE_INTEGER + 1],
  ])("rejects a %s progress count", (_label, pendingTrades) => {
    expect(() => buildReviewQueue({
      ...DEMO_WORKSPACE,
      reviewProgress: {
        ...DEMO_WORKSPACE.reviewProgress,
        pendingTrades,
      },
    })).toThrow(/non-negative safe integer/u);
  });

  it("rejects unsupported runtime position and review states", () => {
    expect(() => buildReviewQueue(snapshotWith([
      {
        ...DEMO_WORKSPACE.trades[0]!,
        status: "archived",
      } as unknown as TradePreview,
      ...DEMO_WORKSPACE.trades.slice(1),
    ]))).toThrow(/unsupported position status/u);
    expect(() => buildReviewQueue(snapshotWith([
      {
        ...DEMO_WORKSPACE.trades[0]!,
        reviewStatus: "abandoned",
      } as unknown as TradePreview,
      ...DEMO_WORKSPACE.trades.slice(1),
    ]))).toThrow(/unsupported review status/u);
  });
});
