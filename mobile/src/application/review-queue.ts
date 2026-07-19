import type {
  JournalWorkspaceSnapshot,
  TradePreview,
} from "../core/types";
import { freezeTradePreview } from "./trade-browser";

export type ReviewQueueClassification = "draft" | "pending";

export interface ReviewQueueGroup {
  readonly classification: ReviewQueueClassification;
  readonly tradeCount: number;
  readonly tradeSubjectIds: readonly string[];
  readonly trades: readonly TradePreview[];
}

export interface ReviewQueue {
  readonly waitingTradeCount: number;
  readonly draftTradeCount: number;
  readonly pendingTradeCount: number;
  readonly groups: readonly [
    ReviewQueueGroup,
    ReviewQueueGroup,
  ];
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

function validateIdentifier(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be a string.`);
  }
  const codePointCount = Array.from(value).length;
  if (
    codePointCount < 1
    || codePointCount > 256
    || value.trim() !== value
    || CONTROL_CHARACTERS.test(value)
  ) {
    throw new Error(
      `${label} must contain 1-256 trimmed code points without control characters.`,
    );
  }
  return value;
}

function validateCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
}

function validateCurrentReviewHead(
  trade: TradePreview,
  reviewIds: Set<string>,
): void {
  const status = trade.reviewStatus as unknown;
  if (status !== "pending" && status !== "draft" && status !== "completed") {
    throw new Error(
      `Trade ${trade.tradeSubjectId} has an unsupported review status.`,
    );
  }
  if (status === "pending") {
    if (trade.reviewId !== null || trade.reviewVersion !== null) {
      throw new Error(
        `Pending trade ${trade.tradeSubjectId} must not have a saved review identity.`,
      );
    }
    return;
  }

  const reviewId = validateIdentifier(
    trade.reviewId,
    `Trade ${trade.tradeSubjectId} review ID`,
  );
  if (
    !Number.isSafeInteger(trade.reviewVersion)
    || (trade.reviewVersion as number) < 1
  ) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} must have a positive saved review version.`,
    );
  }
  if (reviewIds.has(reviewId)) {
    throw new Error(`Current review ID ${reviewId} appears more than once.`);
  }
  reviewIds.add(reviewId);
}

function frozenGroup(
  classification: ReviewQueueClassification,
  trades: readonly TradePreview[],
): ReviewQueueGroup {
  const detachedTrades = Object.freeze(trades.map(freezeTradePreview));
  return Object.freeze({
    classification,
    tradeCount: detachedTrades.length,
    tradeSubjectIds: Object.freeze(
      detachedTrades.map((trade) => trade.tradeSubjectId),
    ),
    trades: detachedTrades,
  });
}

export function buildReviewQueue(
  snapshot: JournalWorkspaceSnapshot,
): ReviewQueue {
  const expectedWaiting = validateCount(
    snapshot.reviewProgress.pendingTrades,
    "Review progress waiting-trade count",
  );
  const expectedDrafts = validateCount(
    snapshot.reviewProgress.draftTrades,
    "Review progress draft-trade count",
  );
  const expectedCompleted = validateCount(
    snapshot.reviewProgress.completedTrades,
    "Review progress completed-trade count",
  );

  const subjects = new Set<string>();
  const reviewIds = new Set<string>();
  const drafts: TradePreview[] = [];
  const pending: TradePreview[] = [];
  let completedCount = 0;

  for (const trade of snapshot.trades) {
    const subjectId = validateIdentifier(
      trade.tradeSubjectId,
      "Trade subject ID",
    );
    if (subjects.has(subjectId)) {
      throw new Error(`Trade subject ID ${subjectId} appears more than once.`);
    }
    subjects.add(subjectId);

    const positionStatus = trade.status as unknown;
    if (positionStatus !== "open" && positionStatus !== "closed") {
      throw new Error(`Trade ${subjectId} has an unsupported position status.`);
    }
    validateCurrentReviewHead(trade, reviewIds);
    if (positionStatus !== "closed") continue;

    if (trade.reviewStatus === "draft") drafts.push(trade);
    else if (trade.reviewStatus === "pending") pending.push(trade);
    else completedCount += 1;
  }

  const waitingCount = drafts.length + pending.length;
  if (waitingCount !== expectedWaiting) {
    throw new Error(
      `Review queue has ${waitingCount} waiting trades but review progress reports ${expectedWaiting}.`,
    );
  }
  if (drafts.length !== expectedDrafts) {
    throw new Error(
      `Review queue has ${drafts.length} drafts but review progress reports ${expectedDrafts}.`,
    );
  }
  if (completedCount !== expectedCompleted) {
    throw new Error(
      `Review queue has ${completedCount} completed closed trades but review progress reports ${expectedCompleted}.`,
    );
  }

  const draftGroup = frozenGroup("draft", drafts);
  const pendingGroup = frozenGroup("pending", pending);
  const groups: ReviewQueue["groups"] = Object.freeze([
    draftGroup,
    pendingGroup,
  ]);
  return Object.freeze({
    waitingTradeCount: waitingCount,
    draftTradeCount: drafts.length,
    pendingTradeCount: pending.length,
    groups,
  });
}

export function firstReviewQueueTrade(queue: ReviewQueue): TradePreview | null {
  return queue.groups[0].trades[0]
    ?? queue.groups[1].trades[0]
    ?? null;
}
