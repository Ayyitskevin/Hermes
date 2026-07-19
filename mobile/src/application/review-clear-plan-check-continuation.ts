import type { JournalWorkspaceSnapshot } from "../core/types";
import { buildReviewQueue } from "./review-queue";

export const REVIEW_CLEAR_PLAN_CHECK_TARGET_ID = "plan-check-title" as const;

export type ReviewClearPlanCheckOrigin = "dashboard" | "journal";

export interface ReviewClearPlanCheckContinuation {
  readonly origin: ReviewClearPlanCheckOrigin;
  readonly completedTradeCount: number;
  readonly reportTargetId: typeof REVIEW_CLEAR_PLAN_CHECK_TARGET_ID;
}

/**
 * Derives the one review-to-insight handoff from the current journal snapshot.
 *
 * Review Queue remains the sole owner of queue eligibility. This projection
 * neither chooses a report dynamically nor records that the insight was seen.
 */
export function buildReviewClearPlanCheckContinuation(
  snapshot: JournalWorkspaceSnapshot,
  origin: ReviewClearPlanCheckOrigin,
): Readonly<ReviewClearPlanCheckContinuation> | null {
  if (origin !== "dashboard" && origin !== "journal") {
    throw new Error("Review-clear Plan Check continuation has an invalid origin.");
  }
  const queue = buildReviewQueue(snapshot);
  if (
    snapshot.provenance !== "local"
    || queue.waitingTradeCount !== 0
    || snapshot.reviewProgress.completedTrades === 0
  ) return null;

  return Object.freeze({
    origin,
    completedTradeCount: snapshot.reviewProgress.completedTrades,
    reportTargetId: REVIEW_CLEAR_PLAN_CHECK_TARGET_ID,
  });
}
