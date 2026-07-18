import type { JournalWorkspaceSnapshot } from "../core/types";
import type { ManualExecutionCommitResult } from "./journal-store";
import {
  resolveExecutionReviewTargets,
} from "./execution-review-continuation";
import type { TradeBrowserResult } from "./trade-browser";

export interface ManualCaptureReviewContinuation {
  readonly outcome: ManualExecutionCommitResult["outcome"];
  readonly executionId: string;
  readonly accountId: string;
  readonly accountLabel: string;
  /** Canonical account-scope order; stable subject identity is never inferred from display text. */
  readonly tradeSubjectIds: readonly string[];
  readonly scope: TradeBrowserResult;
}

export type ManualCaptureCommitReference = Readonly<Pick<
  ManualExecutionCommitResult,
  "outcome" | "executionId"
>>;

/**
 * Reconciles one confirmed manual command with the fresh current projection.
 *
 * One normalized execution can contribute to the current trade or to the two
 * sides of an AUTO reversal. Every target therefore comes from exact current
 * allocation identity; symbol, label, timestamp, recency, and DOM order are
 * deliberately absent from the lookup.
 */
export function buildManualCaptureReviewContinuation(
  snapshot: JournalWorkspaceSnapshot,
  result: ManualCaptureCommitReference,
): ManualCaptureReviewContinuation {
  if (snapshot.provenance !== "local") {
    throw new Error("Manual capture continuation requires a private local journal.");
  }
  if (result.outcome !== "committed" && result.outcome !== "duplicate") {
    throw new Error("Manual capture continuation received an unsupported commit outcome.");
  }
  const resolved = resolveExecutionReviewTargets(snapshot, [result.executionId]);

  return Object.freeze({
    outcome: result.outcome,
    executionId: result.executionId,
    accountId: resolved.accountId,
    accountLabel: resolved.accountLabel,
    tradeSubjectIds: resolved.tradeSubjectIds,
    scope: resolved.scope,
  });
}
