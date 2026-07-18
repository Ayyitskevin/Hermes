import type { JournalWorkspaceSnapshot } from "../core/types";
import type { ManualExecutionCommitResult } from "./journal-store";
import {
  buildExactAccountTradeScope,
} from "./account-overview";
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

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined
      && (codePoint < 32 || (codePoint >= 127 && codePoint <= 159));
  });
}

function validExecutionId(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.trim() === value
    && [...value].length <= 256
    && !hasControlCharacter(value);
}

function expectedAllocationSide(
  trade: JournalWorkspaceSnapshot["trades"][number],
  effect: "entry" | "exit",
): "buy" | "sell" {
  if (effect === "entry") return trade.side === "long" ? "buy" : "sell";
  return trade.side === "long" ? "sell" : "buy";
}

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
  if (!validExecutionId(result.executionId)) {
    throw new Error("Manual capture continuation requires a valid execution identity.");
  }

  const affected = snapshot.trades.filter((trade) => (
    trade.executions.some((execution) => execution.executionId === result.executionId)
  ));
  if (affected.length === 0) {
    throw new Error("The saved execution does not reconcile to an exact current trade.");
  }
  if (affected.length > 2) {
    throw new Error("One manual execution may reconcile to at most two current trades.");
  }
  const affectedAllocations = affected.map((trade) => {
    const allocations = trade.executions.filter((execution) => (
      execution.executionId === result.executionId
    ));
    if (allocations.length !== 1) {
      throw new Error(
        "A manual execution must contribute exactly one allocation fragment per affected trade.",
      );
    }
    return Object.freeze({ trade, allocation: allocations[0]! });
  });
  const accounts = new Set(affected.map((trade) => trade.accountId));
  if (accounts.size !== 1) {
    throw new Error("A manual execution must reconcile to one stable account.");
  }
  const accountId = affected[0]?.accountId;
  if (accountId === undefined) {
    throw new Error("The saved execution has no current account identity.");
  }

  const scope = buildExactAccountTradeScope(snapshot, accountId);
  const affectedSubjects = new Set(affected.map((trade) => trade.tradeSubjectId));
  if (affectedSubjects.size !== affected.length) {
    throw new Error("Manual capture continuation received a duplicate subject identity.");
  }
  if (affectedAllocations.length === 2) {
    const exit = affectedAllocations.find(({ allocation }) => allocation.effect === "exit");
    const entry = affectedAllocations.find(({ allocation }) => allocation.effect === "entry");
    if (
      exit === undefined
      || entry === undefined
      || exit.trade.symbol !== entry.trade.symbol
      || exit.trade.assetClass !== entry.trade.assetClass
      || exit.trade.side === entry.trade.side
      || exit.trade.status !== "closed"
      || exit.allocation.side !== entry.allocation.side
      || exit.allocation.side !== expectedAllocationSide(exit.trade, "exit")
      || entry.allocation.side !== expectedAllocationSide(entry.trade, "entry")
      || exit.allocation.occurredAt !== entry.allocation.occurredAt
      || exit.allocation.price !== entry.allocation.price
      || exit.allocation.currency !== entry.allocation.currency
    ) {
      throw new Error(
        "Two manual execution targets must be the exact exit and entry sides of one AUTO reversal.",
      );
    }
  }
  const orderedSubjects = scope.evidence
    .map((evidence) => evidence.trade.tradeSubjectId)
    .filter((tradeSubjectId) => affectedSubjects.has(tradeSubjectId));
  if (
    orderedSubjects.length !== affected.length
    || new Set(orderedSubjects).size !== affected.length
  ) {
    throw new Error("The saved execution targets do not reconcile inside the exact account scope.");
  }
  for (const tradeSubjectId of orderedSubjects) {
    const matches = scope.evidence.filter((evidence) => (
      evidence.trade.tradeSubjectId === tradeSubjectId
      && evidence.trade.accountId === accountId
      && evidence.trade.executions.filter((execution) => (
        execution.executionId === result.executionId
      )).length === 1
    ));
    if (matches.length !== 1) {
      throw new Error("A saved execution target became stale during scope reconciliation.");
    }
  }

  return Object.freeze({
    outcome: result.outcome,
    executionId: result.executionId,
    accountId,
    accountLabel: scope.accountLabel,
    tradeSubjectIds: Object.freeze(orderedSubjects),
    scope,
  });
}
