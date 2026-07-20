import { describe, expect, it } from "vitest";

import type { LedgerExecution, TradeProjection } from "./ledger";
import { normalizeTrades } from "./normalize-trades";
import {
  assertActiveHeadProjectionIntegrity,
  assertActiveLedgerIntegrity,
  assertAllocationsReferenceActiveExecutions,
  assertImportReceiptReconciles,
  assertNoDuplicateExecutionIds,
  assertOpenPartialRealizedConsistency,
  assertPublishedReportsExcludeVoided,
  assertReportCohortTraceable,
  assertTradeQuantityInvariants,
  TradeInvariantError,
} from "./trade-invariants";

function execution(overrides: Partial<LedgerExecution> = {}): LedgerExecution {
  return {
    id: "execution-1",
    accountId: "account-1",
    instrumentId: "instrument-1",
    occurredAtUs: "1",
    side: "BUY",
    quantity: "10",
    price: "100",
    quoteCurrency: "USD",
    multiplier: "1",
    fees: [],
    ...overrides,
  };
}

function expectInvariant(
  operation: () => unknown,
  code: TradeInvariantError["code"],
): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(TradeInvariantError);
    expect((error as TradeInvariantError).code).toBe(code);
    return;
  }
  throw new Error(`Expected TradeInvariantError ${code}`);
}

describe("trade invariants", () => {
  it("accepts a closed long round trip with fees after normalization", () => {
    const executions = [
      execution({
        id: "open",
        occurredAtUs: "1",
        quantity: "10",
        price: "100",
        fees: [{ category: "COMMISSION", currency: "USD", costMinor: "100", minorUnit: 2 }],
      }),
      execution({
        id: "close",
        occurredAtUs: "2",
        side: "SELL",
        quantity: "10",
        price: "110",
        fees: [{ category: "COMMISSION", currency: "USD", costMinor: "100", minorUnit: 2 }],
      }),
    ];
    const projection = assertActiveLedgerIntegrity(executions);
    expect(projection.trades).toHaveLength(1);
    expect(projection.trades[0]).toMatchObject({
      status: "CLOSED",
      enteredQuantity: "10",
      exitedQuantity: "10",
      remainingQuantity: "0",
    });
    expect(projection.moneyTotals[0]?.netPnl).toBe("98");
  });

  it("rejects closed quantity above opened quantity", () => {
    const trades = [{
      id: "bad",
      accountId: "a",
      instrumentId: "i",
      direction: "LONG",
      status: "CLOSED",
      quoteCurrency: "USD",
      multiplier: "1",
      openedAtUs: "1",
      closedAtUs: "2",
      enteredQuantity: "5",
      exitedQuantity: "6",
      remainingQuantity: "0",
      entryNotional: "500",
      exitNotional: "600",
      allocationIds: [],
      moneyTotals: [],
    }] as const satisfies readonly TradeProjection[];
    expectInvariant(
      () => assertTradeQuantityInvariants(trades),
      "closed_quantity_exceeds_opened",
    );
  });

  it("rejects duplicate execution IDs that would double-count", () => {
    expectInvariant(
      () => assertNoDuplicateExecutionIds([
        execution({ id: "same" }),
        execution({ id: "same", occurredAtUs: "2" }),
      ]),
      "duplicate_execution_id",
    );
  });

  it("rejects report cohorts that include unknown or double-counted trades", () => {
    const projection = normalizeTrades([
      execution({ id: "a", occurredAtUs: "1" }),
      execution({ id: "b", occurredAtUs: "2", side: "SELL" }),
    ]);
    const ids = projection.trades.map((trade) => trade.id);
    expect(ids).toHaveLength(1);
    const tradeId = ids[0]!;
    assertReportCohortTraceable(ids, [tradeId]);
    expectInvariant(
      () => assertReportCohortTraceable(ids, [tradeId, "ghost-trade"]),
      "report_includes_unknown_trade",
    );
    expectInvariant(
      () => assertReportCohortTraceable(ids, [tradeId, tradeId]),
      "report_double_counts_trade",
    );
  });

  it("reconciles import receipt partitions and already-present rows", () => {
    assertImportReceiptReconciles({
      sourceRows: 5,
      acceptedRows: 3,
      rejectedRows: 1,
      skippedRows: 1,
      executionVersions: 2,
      warningCount: 1,
    });
    expectInvariant(
      () => assertImportReceiptReconciles({
        sourceRows: 5,
        acceptedRows: 3,
        rejectedRows: 1,
        skippedRows: 0,
        executionVersions: 2,
        warningCount: 1,
      }),
      "import_receipt_unreconciled",
    );
    expectInvariant(
      () => assertImportReceiptReconciles({
        sourceRows: 3,
        acceptedRows: 3,
        rejectedRows: 0,
        skippedRows: 0,
        executionVersions: 1,
        warningCount: 0,
      }),
      "import_receipt_unreconciled",
    );
  });

  it("is deterministic for partial FIFO exits", () => {
    const executions = [
      execution({ id: "1", occurredAtUs: "1", quantity: "2", price: "10" }),
      execution({ id: "2", occurredAtUs: "2", quantity: "3", price: "20" }),
      execution({
        id: "3",
        occurredAtUs: "3",
        side: "SELL",
        quantity: "4",
        price: "30",
      }),
      execution({ id: "4", occurredAtUs: "4", quantity: "1", price: "25" }),
      execution({
        id: "5",
        occurredAtUs: "5",
        side: "SELL",
        quantity: "2",
        price: "30",
      }),
    ];
    const first = assertActiveLedgerIntegrity(executions);
    const second = assertActiveLedgerIntegrity(executions);
    expect(first.trades[0]).toMatchObject({
      enteredQuantity: "6",
      exitedQuantity: "6",
      remainingQuantity: "0",
    });
    expect(first.moneyTotals).toEqual(second.moneyTotals);
    expect(first.lotMatches.map((match) => match.grossPnl)).toEqual(
      second.lotMatches.map((match) => match.grossPnl),
    );
  });

  it("accepts open partial remaining quantity and rejects inactive allocation refs", () => {
    const executions = [
      execution({ id: "entry", occurredAtUs: "1", quantity: "10", price: "100" }),
      execution({
        id: "partial-exit",
        occurredAtUs: "2",
        side: "SELL",
        quantity: "4",
        price: "110",
      }),
    ];
    const projection = assertActiveHeadProjectionIntegrity(executions);
    expect(projection.trades[0]).toMatchObject({
      status: "OPEN",
      enteredQuantity: "10",
      exitedQuantity: "4",
      remainingQuantity: "6",
    });
    assertOpenPartialRealizedConsistency(projection);
    assertAllocationsReferenceActiveExecutions(projection, ["entry", "partial-exit"]);
    expectInvariant(
      () => assertAllocationsReferenceActiveExecutions(projection, ["entry"]),
      "allocation_references_inactive_execution",
    );
  });

  it("rejects published cohorts that retain voided subjects", () => {
    assertPublishedReportsExcludeVoided(["a"], ["a"], ["voided"]);
    expectInvariant(
      () => assertPublishedReportsExcludeVoided([], ["voided"], ["voided"]),
      "report_includes_unknown_trade",
    );
  });
});
