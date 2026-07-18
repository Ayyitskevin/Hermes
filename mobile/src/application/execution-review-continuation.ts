import type { JournalWorkspaceSnapshot } from "../core/types";
import { buildExactAccountTradeScope } from "./account-overview";
import type { TradeBrowserResult } from "./trade-browser";

export interface ExecutionReviewTargets {
  readonly executionIds: readonly string[];
  readonly accountId: string;
  readonly accountLabel: string;
  readonly tradeSubjectIds: readonly string[];
  readonly scope: TradeBrowserResult;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined
      && (codePoint < 32 || (codePoint >= 127 && codePoint <= 159));
  });
}

export function validExecutionReviewIdentity(value: unknown): value is string {
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
 * Resolves immutable execution identities to their exact current trade subjects.
 *
 * The allocation scan is linear in current projection size. Display labels,
 * symbols, timestamps, source order, and recency are never identity fallbacks.
 */
export function resolveExecutionReviewTargets(
  snapshot: JournalWorkspaceSnapshot,
  executionIds: readonly string[],
  expectedAccountId?: string,
): ExecutionReviewTargets {
  if (snapshot.provenance !== "local") {
    throw new Error("Execution review continuation requires a private local journal.");
  }
  if (executionIds.length === 0) {
    throw new Error("Execution review continuation requires at least one execution identity.");
  }
  if (!executionIds.every(validExecutionReviewIdentity)) {
    throw new Error("Execution review continuation requires a valid execution identity.");
  }
  if (new Set(executionIds).size !== executionIds.length) {
    throw new Error("Execution review continuation received a duplicate execution identity.");
  }
  if (
    expectedAccountId !== undefined
    && (
      expectedAccountId.length === 0
      || expectedAccountId.trim() !== expectedAccountId
      || hasControlCharacter(expectedAccountId)
    )
  ) {
    throw new Error("Execution review continuation requires a valid account identity.");
  }

  const requested = new Set(executionIds);
  const byExecution = new Map<string, Array<{
    readonly trade: JournalWorkspaceSnapshot["trades"][number];
    readonly allocations: JournalWorkspaceSnapshot["trades"][number]["executions"];
  }>>();
  for (const trade of snapshot.trades) {
    const allocationsByExecution = new Map<string, typeof trade.executions>();
    for (const allocation of trade.executions) {
      if (!requested.has(allocation.executionId)) continue;
      allocationsByExecution.set(
        allocation.executionId,
        [...(allocationsByExecution.get(allocation.executionId) ?? []), allocation],
      );
    }
    for (const [executionId, allocations] of allocationsByExecution) {
      const affected = byExecution.get(executionId) ?? [];
      affected.push({ trade, allocations });
      byExecution.set(executionId, affected);
    }
  }

  const accountIds = new Set<string>();
  const affectedSubjects = new Set<string>();
  for (const executionId of executionIds) {
    const affected = byExecution.get(executionId) ?? [];
    const executionSubjects = new Set<string>();
    if (affected.length === 0) {
      throw new Error("The saved execution does not reconcile to an exact current trade.");
    }
    if (affected.length > 2) {
      throw new Error("One execution may reconcile to at most two current trades.");
    }
    for (const { trade, allocations } of affected) {
      if (allocations.length !== 1) {
        throw new Error(
          "An execution must contribute exactly one allocation fragment per affected trade.",
        );
      }
      accountIds.add(trade.accountId);
      if (executionSubjects.has(trade.tradeSubjectId)) {
        throw new Error("Execution review continuation received a duplicate subject identity.");
      }
      executionSubjects.add(trade.tradeSubjectId);
      affectedSubjects.add(trade.tradeSubjectId);
    }
    if (accountIds.size > 1) {
      throw new Error("The receipt executions must reconcile to one stable account.");
    }
    if (affected.length === 2) {
      const exit = affected.find(({ allocations }) => allocations[0]?.effect === "exit");
      const entry = affected.find(({ allocations }) => allocations[0]?.effect === "entry");
      const exitAllocation = exit?.allocations[0];
      const entryAllocation = entry?.allocations[0];
      if (
        exit === undefined
        || entry === undefined
        || exitAllocation === undefined
        || entryAllocation === undefined
        || exit.trade.tradeSubjectId === entry.trade.tradeSubjectId
        || exit.trade.symbol !== entry.trade.symbol
        || exit.trade.assetClass !== entry.trade.assetClass
        || exit.trade.side === entry.trade.side
        || exit.trade.status !== "closed"
        || exitAllocation.side !== entryAllocation.side
        || exitAllocation.side !== expectedAllocationSide(exit.trade, "exit")
        || entryAllocation.side !== expectedAllocationSide(entry.trade, "entry")
        || exitAllocation.occurredAt !== entryAllocation.occurredAt
        || exitAllocation.price !== entryAllocation.price
        || exitAllocation.currency !== entryAllocation.currency
      ) {
        throw new Error(
          "Two execution targets must be the exact exit and entry sides of one AUTO reversal.",
        );
      }
    }
  }

  if (accountIds.size !== 1) {
    throw new Error("The receipt executions must reconcile to one stable account.");
  }
  const accountId = [...accountIds][0];
  if (accountId === undefined) {
    throw new Error("The saved executions have no current account identity.");
  }
  if (expectedAccountId !== undefined && accountId !== expectedAccountId) {
    throw new Error("The receipt executions do not belong to the receipt account.");
  }

  const scope = buildExactAccountTradeScope(snapshot, accountId);
  const orderedSubjects = scope.evidence
    .map((evidence) => evidence.trade.tradeSubjectId)
    .filter((tradeSubjectId) => affectedSubjects.has(tradeSubjectId));
  if (
    orderedSubjects.length !== affectedSubjects.size
    || new Set(orderedSubjects).size !== affectedSubjects.size
  ) {
    throw new Error("The saved execution targets do not reconcile inside the exact account scope.");
  }
  const scopeBySubject = new Map(scope.evidence.map((evidence) => (
    [evidence.trade.tradeSubjectId, evidence.trade] as const
  )));
  for (const executionId of executionIds) {
    const affected = byExecution.get(executionId) ?? [];
    for (const { trade } of affected) {
      const scoped = scopeBySubject.get(trade.tradeSubjectId);
      if (
        scoped === undefined
        || scoped.accountId !== accountId
        || scoped.executions.filter((allocation) => (
          allocation.executionId === executionId
        )).length !== 1
      ) {
        throw new Error("A saved execution target became stale during scope reconciliation.");
      }
    }
  }

  return Object.freeze({
    executionIds: Object.freeze([...executionIds]),
    accountId,
    accountLabel: scope.accountLabel,
    tradeSubjectIds: Object.freeze(orderedSubjects),
    scope,
  });
}
