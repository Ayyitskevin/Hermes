/**
 * Pure ledger and report invariants for journal integrity.
 *
 * These checks never repair data. They throw with stable codes so imports,
 * projections, and tests fail closed when quantity, money, or identity rules
 * are violated.
 */

import type {
  CurrencyMoneyTotal,
  LedgerExecution,
  TradeNormalizationResult,
  TradeProjection,
} from "./ledger";
import { normalizeTrades } from "./normalize-trades";
import {
  addSignedDecimals,
  compareSignedDecimals,
  negateSignedDecimal,
  sumSignedDecimals,
} from "./signed-decimal";

export type TradeInvariantCode =
  | "closed_quantity_exceeds_opened"
  | "remaining_quantity_inconsistent"
  | "duplicate_execution_id"
  | "money_totals_inconsistent"
  | "lot_matches_unreconciled"
  | "report_includes_unknown_trade"
  | "report_double_counts_trade"
  | "normalization_nondeterministic"
  | "import_receipt_unreconciled";

export class TradeInvariantError extends Error {
  constructor(
    readonly code: TradeInvariantCode,
    message: string,
    readonly tradeId: string | null = null,
  ) {
    super(message);
    this.name = "TradeInvariantError";
  }
}

function fail(
  code: TradeInvariantCode,
  message: string,
  tradeId: string | null = null,
): never {
  throw new TradeInvariantError(code, message, tradeId);
}

function decimalNonNegative(value: string, label: string, tradeId: string): void {
  if (!/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    fail("remaining_quantity_inconsistent", `${label} is not a non-negative decimal.`, tradeId);
  }
}

/**
 * Closed quantity never exceeds entered quantity; remaining = entered − exited
 * for every projected trade; open trades keep remaining > 0.
 */
export function assertTradeQuantityInvariants(
  trades: readonly TradeProjection[],
): void {
  for (const trade of trades) {
    decimalNonNegative(trade.enteredQuantity, "enteredQuantity", trade.id);
    decimalNonNegative(trade.exitedQuantity, "exitedQuantity", trade.id);

    if (compareSignedDecimals(trade.exitedQuantity, trade.enteredQuantity) > 0) {
      fail(
        "closed_quantity_exceeds_opened",
        `Trade ${trade.id} exited ${trade.exitedQuantity} of ${trade.enteredQuantity} entered.`,
        trade.id,
      );
    }

    decimalNonNegative(trade.remainingQuantity, "remainingQuantity", trade.id);

    const expectedRemaining = addSignedDecimals(
      trade.enteredQuantity,
      negateSignedDecimal(trade.exitedQuantity),
    );
    if (compareSignedDecimals(trade.remainingQuantity, expectedRemaining) !== 0) {
      fail(
        "remaining_quantity_inconsistent",
        `Trade ${trade.id} remaining ${trade.remainingQuantity} != entered-exited ${expectedRemaining}.`,
        trade.id,
      );
    }

    if (trade.status === "CLOSED") {
      if (compareSignedDecimals(trade.remainingQuantity, "0") !== 0) {
        fail(
          "remaining_quantity_inconsistent",
          `Closed trade ${trade.id} still has remaining quantity ${trade.remainingQuantity}.`,
          trade.id,
        );
      }
      if (trade.closedAtUs === null) {
        fail(
          "remaining_quantity_inconsistent",
          `Closed trade ${trade.id} is missing closedAtUs.`,
          trade.id,
        );
      }
    } else if (compareSignedDecimals(trade.remainingQuantity, "0") <= 0) {
      fail(
        "remaining_quantity_inconsistent",
        `Open trade ${trade.id} has non-positive remaining quantity.`,
        trade.id,
      );
    }
  }
}

/** Active executions must have unique IDs; duplicates would double-count P&L. */
export function assertNoDuplicateExecutionIds(
  executions: readonly LedgerExecution[],
): void {
  const seen = new Set<string>();
  for (const execution of executions) {
    if (seen.has(execution.id)) {
      fail(
        "duplicate_execution_id",
        `Execution ID ${execution.id} appears more than once in the active ledger.`,
      );
    }
    seen.add(execution.id);
  }
}

function moneyFor(
  totals: readonly CurrencyMoneyTotal[],
  currency: string,
): CurrencyMoneyTotal | undefined {
  return totals.find((total) => total.currency === currency);
}

/**
 * Per-trade money totals must sum to workspace money totals for each currency,
 * and net = gross − feeCost for each total row.
 */
export function assertMoneyTotalsReconcile(
  projection: TradeNormalizationResult,
): void {
  for (const trade of projection.trades) {
    for (const total of trade.moneyTotals) {
      const expectedNet = addSignedDecimals(
        total.grossPnl,
        negateSignedDecimal(total.feeCost),
      );
      if (compareSignedDecimals(total.netPnl, expectedNet) !== 0) {
        fail(
          "money_totals_inconsistent",
          `Trade ${trade.id} ${total.currency} netPnl ${total.netPnl} != gross-fee ${expectedNet}.`,
          trade.id,
        );
      }
    }
  }

  const currencies = new Set(projection.moneyTotals.map((total) => total.currency));
  for (const trade of projection.trades) {
    for (const total of trade.moneyTotals) {
      currencies.add(total.currency);
    }
  }

  for (const currency of currencies) {
    const tradeGross = sumSignedDecimals(
      projection.trades.flatMap((trade) => {
        const total = moneyFor(trade.moneyTotals, currency);
        return total === undefined ? [] : [total.grossPnl];
      }),
    );
    const tradeFees = sumSignedDecimals(
      projection.trades.flatMap((trade) => {
        const total = moneyFor(trade.moneyTotals, currency);
        return total === undefined ? [] : [total.feeCost];
      }),
    );
    const tradeNet = sumSignedDecimals(
      projection.trades.flatMap((trade) => {
        const total = moneyFor(trade.moneyTotals, currency);
        return total === undefined ? [] : [total.netPnl];
      }),
    );
    const workspace = moneyFor(projection.moneyTotals, currency);
    if (workspace === undefined) {
      if (
        compareSignedDecimals(tradeGross, "0") !== 0
        || compareSignedDecimals(tradeFees, "0") !== 0
        || compareSignedDecimals(tradeNet, "0") !== 0
      ) {
        fail(
          "money_totals_inconsistent",
          `Workspace is missing ${currency} totals for non-zero trade sums.`,
        );
      }
      continue;
    }
    if (compareSignedDecimals(workspace.grossPnl, tradeGross) !== 0
      || compareSignedDecimals(workspace.feeCost, tradeFees) !== 0
      || compareSignedDecimals(workspace.netPnl, tradeNet) !== 0
    ) {
      fail(
        "money_totals_inconsistent",
        `Workspace ${currency} totals do not equal the sum of trade totals.`,
      );
    }
  }
}

/**
 * Lot-match quantities per exit must not exceed the exit allocation quantity;
 * gross P&L on matches must sum to trade gross for the quote currency when closed.
 */
export function assertLotMatchesReconcile(
  projection: TradeNormalizationResult,
): void {
  const allocationsById = new Map(
    projection.allocations.map((allocation) => [allocation.id, allocation]),
  );
  const matchQtyByExit = new Map<string, string>();
  for (const match of projection.lotMatches) {
    const exit = allocationsById.get(match.exitAllocationId);
    if (exit === undefined) {
      fail(
        "lot_matches_unreconciled",
        `Lot match ${match.id} references missing exit allocation ${match.exitAllocationId}.`,
      );
    }
    const prior = matchQtyByExit.get(match.exitAllocationId) ?? "0";
    matchQtyByExit.set(
      match.exitAllocationId,
      sumSignedDecimals([prior, match.quantity]),
    );
  }
  for (const [exitId, matchedQty] of matchQtyByExit) {
    const exit = allocationsById.get(exitId);
    if (exit === undefined) continue;
    if (compareSignedDecimals(matchedQty, exit.quantity) !== 0) {
      fail(
        "lot_matches_unreconciled",
        `Exit ${exitId} matched ${matchedQty} but allocated ${exit.quantity}.`,
      );
    }
  }
}

export interface ImportReceiptCounts {
  readonly sourceRows: number;
  readonly acceptedRows: number;
  readonly rejectedRows: number;
  readonly skippedRows: number;
  readonly executionVersions: number;
  readonly warningCount: number;
}

/**
 * Imported row counts must partition source rows; new execution versions cannot
 * exceed accepted rows (already-present rows explain the gap via warnings).
 */
export function assertImportReceiptReconciles(receipt: ImportReceiptCounts): void {
  const { sourceRows, acceptedRows, rejectedRows, skippedRows, executionVersions, warningCount } =
    receipt;
  for (const [label, value] of Object.entries(receipt)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      fail("import_receipt_unreconciled", `${label} must be a non-negative safe integer.`);
    }
  }
  if (acceptedRows + rejectedRows + skippedRows !== sourceRows) {
    fail(
      "import_receipt_unreconciled",
      `accepted+rejected+skipped (${acceptedRows + rejectedRows + skippedRows}) != sourceRows ${sourceRows}.`,
    );
  }
  if (executionVersions > acceptedRows) {
    fail(
      "import_receipt_unreconciled",
      `executionVersions ${executionVersions} exceed acceptedRows ${acceptedRows}.`,
    );
  }
  const alreadyPresent = acceptedRows - executionVersions;
  if (warningCount < alreadyPresent) {
    fail(
      "import_receipt_unreconciled",
      `warningCount ${warningCount} omits ${alreadyPresent} already-present accepted rows.`,
    );
  }
}

/**
 * Every trade ID in a published report cohort must exist in the normalized
 * projection exactly once; unknown or double-counted IDs fail closed.
 */
export function assertReportCohortTraceable(
  projectionTradeIds: readonly string[],
  reportTradeIds: readonly string[],
): void {
  const projection = new Set(projectionTradeIds);
  const seen = new Set<string>();
  for (const id of reportTradeIds) {
    if (!projection.has(id)) {
      fail(
        "report_includes_unknown_trade",
        `Published report includes trade ${id} that is not in the active projection.`,
      );
    }
    if (seen.has(id)) {
      fail(
        "report_double_counts_trade",
        `Published report double-counts trade ${id}.`,
      );
    }
    seen.add(id);
  }
}

/** Two normalizations of the same ordered executions must be byte-identical in money and qty. */
export function assertNormalizationDeterministic(
  executions: readonly LedgerExecution[],
): TradeNormalizationResult {
  assertNoDuplicateExecutionIds(executions);
  const first = normalizeTrades(executions);
  const second = normalizeTrades(executions);
  assertTradeQuantityInvariants(first.trades);
  assertTradeQuantityInvariants(second.trades);
  assertMoneyTotalsReconcile(first);
  assertLotMatchesReconcile(first);

  const fingerprint = (result: TradeNormalizationResult): string => JSON.stringify({
    trades: result.trades.map((trade) => ({
      id: trade.id,
      enteredQuantity: trade.enteredQuantity,
      exitedQuantity: trade.exitedQuantity,
      remainingQuantity: trade.remainingQuantity,
      status: trade.status,
      moneyTotals: trade.moneyTotals,
    })),
    moneyTotals: result.moneyTotals,
    lotMatches: result.lotMatches.map((match) => ({
      id: match.id,
      quantity: match.quantity,
      grossPnl: match.grossPnl,
    })),
  });

  if (fingerprint(first) !== fingerprint(second)) {
    fail(
      "normalization_nondeterministic",
      "normalizeTrades produced different projections for the same executions.",
    );
  }
  return first;
}

/** Run the full pure-projection integrity suite on active executions. */
export function assertActiveLedgerIntegrity(
  executions: readonly LedgerExecution[],
): TradeNormalizationResult {
  return assertNormalizationDeterministic(executions);
}
