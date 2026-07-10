import { describe, expect, it } from "vitest";

import type {
  CurrencyMoneyTotal,
  LedgerExecution,
  TradeProjection,
} from "./ledger";
import {
  normalizeTrades,
  TradeNormalizationError,
} from "./normalize-trades";

function execution(overrides: Partial<LedgerExecution> = {}): LedgerExecution {
  return {
    id: "execution-1",
    accountId: "account-1",
    instrumentId: "instrument-1",
    occurredAtUs: "1",
    side: "BUY",
    quantity: "1",
    price: "100",
    quoteCurrency: "USD",
    multiplier: "1",
    fees: [],
    ...overrides,
  };
}

function total(
  totals: readonly CurrencyMoneyTotal[],
  currency: string,
): CurrencyMoneyTotal {
  const value = totals.find((candidate) => candidate.currency === currency);
  if (value === undefined) throw new Error(`Missing ${currency} total in fixture.`);
  return value;
}

function trade(
  trades: readonly TradeProjection[],
  instrumentId: string,
  index = 0,
): TradeProjection {
  const matches = trades.filter((candidate) => candidate.instrumentId === instrumentId);
  const value = matches[index];
  if (value === undefined) throw new Error(`Missing ${instrumentId} trade ${index} in fixture.`);
  return value;
}

function expectNormalizationError(
  executions: readonly LedgerExecution[],
  code: TradeNormalizationError["code"],
): void {
  try {
    normalizeTrades(executions);
  } catch (error) {
    expect(error).toBeInstanceOf(TradeNormalizationError);
    expect((error as TradeNormalizationError).code).toBe(code);
    return;
  }
  throw new Error(`Expected normalization to fail with ${code}.`);
}

const LONG_SHORT_FIXTURE: readonly LedgerExecution[] = [
  execution({
    id: "long-entry",
    instrumentId: "AAPL",
    occurredAtUs: "1",
    side: "BUY",
    quantity: "10",
    price: "100",
    fees: [{ category: "COMMISSION", currency: "USD", costMinor: "100", minorUnit: 2 }],
  }),
  execution({
    id: "long-exit",
    instrumentId: "AAPL",
    occurredAtUs: "2",
    side: "SELL",
    quantity: "10",
    price: "110",
    fees: [{ category: "COMMISSION", currency: "USD", costMinor: "100", minorUnit: 2 }],
  }),
  execution({
    id: "short-entry",
    instrumentId: "MSFT",
    occurredAtUs: "3",
    side: "SELL",
    quantity: "2",
    price: "50",
  }),
  execution({
    id: "short-exit",
    instrumentId: "MSFT",
    occurredAtUs: "4",
    side: "BUY",
    quantity: "2",
    price: "40",
  }),
];

const PARTIAL_FIFO_FIXTURE: readonly LedgerExecution[] = [
  execution({ id: "fifo-1", instrumentId: "FIFO", occurredAtUs: "1", quantity: "2", price: "10" }),
  execution({ id: "fifo-2", instrumentId: "FIFO", occurredAtUs: "2", quantity: "3", price: "20" }),
  execution({ id: "fifo-3", instrumentId: "FIFO", occurredAtUs: "3", side: "SELL", quantity: "4", price: "30" }),
  execution({ id: "fifo-4", instrumentId: "FIFO", occurredAtUs: "4", quantity: "1", price: "25" }),
  execution({ id: "fifo-5", instrumentId: "FIFO", occurredAtUs: "5", side: "SELL", quantity: "2", price: "30" }),
];

const REVERSAL_FIXTURE: readonly LedgerExecution[] = [
  execution({
    id: "reverse-entry",
    instrumentId: "REV",
    occurredAtUs: "1",
    quantity: "10",
    price: "100",
  }),
  execution({
    id: "reverse-fill",
    instrumentId: "REV",
    occurredAtUs: "2",
    side: "SELL",
    quantity: "15",
    price: "90",
    fees: [{ category: "COMMISSION", currency: "USD", costMinor: "5", minorUnit: 2 }],
  }),
];

describe("execution-ledger trade normalization", () => {
  it("projects independent long and short round trips with exact money totals", () => {
    const result = normalizeTrades(LONG_SHORT_FIXTURE);
    const long = trade(result.trades, "AAPL");
    const short = trade(result.trades, "MSFT");

    expect(long).toMatchObject({
      direction: "LONG",
      status: "CLOSED",
      enteredQuantity: "10",
      exitedQuantity: "10",
      remainingQuantity: "0",
      entryNotional: "1000",
      exitNotional: "1100",
    });
    expect(total(long.moneyTotals, "USD")).toEqual({
      currency: "USD",
      grossPnl: "100",
      feeCost: "2",
      netPnl: "98",
      feeMinorUnit: 2,
    });
    expect(short).toMatchObject({
      direction: "SHORT",
      status: "CLOSED",
      enteredQuantity: "2",
      exitedQuantity: "2",
      remainingQuantity: "0",
    });
    expect(total(short.moneyTotals, "USD").grossPnl).toBe("20");
    expect(total(result.moneyTotals, "USD")).toMatchObject({
      grossPnl: "120",
      feeCost: "2",
      netPnl: "118",
    });
  });

  it("keeps scales and partial exits in one trade and reconciles FIFO lots", () => {
    const result = normalizeTrades(PARTIAL_FIFO_FIXTURE);
    const projected = trade(result.trades, "FIFO");

    expect(result.trades).toHaveLength(1);
    expect(projected).toMatchObject({
      status: "CLOSED",
      enteredQuantity: "6",
      exitedQuantity: "6",
      remainingQuantity: "0",
      entryNotional: "105",
      exitNotional: "180",
    });
    expect(result.lotMatches.map((match) => ({
      quantity: match.quantity,
      grossPnl: match.grossPnl,
    }))).toEqual([
      { quantity: "2", grossPnl: "40" },
      { quantity: "2", grossPnl: "20" },
      { quantity: "1", grossPnl: "10" },
      { quantity: "1", grossPnl: "5" },
    ]);
    expect(total(projected.moneyTotals, "USD").grossPnl).toBe("75");
  });

  it("splits buy 10 then sell 15 into a closed long and open short", () => {
    const result = normalizeTrades(REVERSAL_FIXTURE);
    const long = trade(result.trades, "REV", 0);
    const short = trade(result.trades, "REV", 1);
    const reversalAllocations = result.allocations.filter((allocation) => (
      allocation.executionId === "reverse-fill"
    ));

    expect(reversalAllocations.map((allocation) => ({
      effect: allocation.effect,
      quantity: allocation.quantity,
      fee: allocation.fees[0]?.costMinor,
    }))).toEqual([
      { effect: "EXIT", quantity: "10", fee: "3" },
      { effect: "ENTRY", quantity: "5", fee: "2" },
    ]);
    expect(reversalAllocations.reduce(
      (sum, allocation) => sum + BigInt(allocation.quantity),
      0n,
    )).toBe(15n);
    expect(reversalAllocations.reduce(
      (sum, allocation) => sum + BigInt(allocation.fees[0]?.costMinor ?? "0"),
      0n,
    )).toBe(5n);
    expect(long).toMatchObject({
      direction: "LONG",
      status: "CLOSED",
      remainingQuantity: "0",
      closedAtUs: "2",
    });
    expect(short).toMatchObject({
      direction: "SHORT",
      status: "OPEN",
      enteredQuantity: "5",
      remainingQuantity: "5",
      openedAtUs: "2",
    });
    expect(total(long.moneyTotals, "USD").netPnl).toBe("-100.03");
    expect(total(short.moneyTotals, "USD").netPnl).toBe("-0.02");
  });

  it("keeps high-precision fractional quantities and multiplier P&L exact", () => {
    const result = normalizeTrades([
      execution({
        id: "precision-entry",
        instrumentId: "PRECISE",
        occurredAtUs: "1",
        quantity: "0.123456789123456789",
        price: "100.000000000000001",
        multiplier: "100",
      }),
      execution({
        id: "precision-exit",
        instrumentId: "PRECISE",
        occurredAtUs: "2",
        side: "SELL",
        quantity: "0.123456789123456789",
        price: "100.000000000000011",
        multiplier: "100",
      }),
    ]);

    expect(total(result.trades[0]?.moneyTotals ?? [], "USD").grossPnl)
      .toBe("0.000000000000123456789123456789");
  });

  it("keeps quote P&L and foreign-currency fees in separate totals", () => {
    const result = normalizeTrades([
      execution({
        id: "eur-entry",
        instrumentId: "SAP",
        occurredAtUs: "1",
        quantity: "1",
        price: "10",
        quoteCurrency: "EUR",
      }),
      execution({
        id: "eur-exit",
        instrumentId: "SAP",
        occurredAtUs: "2",
        side: "SELL",
        quantity: "1",
        price: "12",
        quoteCurrency: "EUR",
        fees: [{ category: "COMMISSION", currency: "USD", costMinor: "25", minorUnit: 2 }],
      }),
    ]);

    expect(result.moneyTotals).toEqual([
      { currency: "EUR", grossPnl: "2", feeCost: "0", netPnl: "2", feeMinorUnit: null },
      { currency: "USD", grossPnl: "0", feeCost: "0.25", netPnl: "-0.25", feeMinorUnit: 2 },
    ]);
    expect(result).not.toHaveProperty("netPnl");
  });

  it("isolates positions by both account and instrument", () => {
    const result = normalizeTrades([
      execution({ id: "a-entry", accountId: "account-a", instrumentId: "SAME", occurredAtUs: "1" }),
      execution({ id: "b-entry", accountId: "account-b", instrumentId: "SAME", occurredAtUs: "1", side: "SELL" }),
      execution({ id: "a-exit", accountId: "account-a", instrumentId: "SAME", occurredAtUs: "2", side: "SELL", price: "101" }),
      execution({ id: "b-exit", accountId: "account-b", instrumentId: "SAME", occurredAtUs: "2", side: "BUY", price: "99" }),
    ]);

    expect(result.trades.map((candidate) => ({
      accountId: candidate.accountId,
      direction: candidate.direction,
      status: candidate.status,
      grossPnl: total(candidate.moneyTotals, "USD").grossPnl,
    }))).toEqual([
      { accountId: "account-a", direction: "LONG", status: "CLOSED", grossPnl: "1" },
      { accountId: "account-b", direction: "SHORT", status: "CLOSED", grossPnl: "1" },
    ]);
  });

  it("allocates negative fee rebates exactly with the same remainder rule", () => {
    const result = normalizeTrades([
      execution({
        id: "rebate-entry",
        instrumentId: "REV",
        occurredAtUs: "1",
        quantity: "10",
        price: "100",
      }),
      execution({
        id: "rebate-reversal",
        instrumentId: "REV",
        occurredAtUs: "2",
        side: "SELL",
        quantity: "15",
        price: "90",
        fees: [{ category: "OTHER", currency: "USD", costMinor: "-5", minorUnit: 2 }],
      }),
    ]);
    const allocations = result.allocations.filter((candidate) => (
      candidate.executionId === "rebate-reversal"
    ));

    expect(allocations.map((allocation) => allocation.fees[0]?.costMinor)).toEqual(["-3", "-2"]);
    expect(allocations.reduce(
      (sum, allocation) => sum + BigInt(allocation.fees[0]?.costMinor ?? "0"),
      0n,
    )).toBe(-5n);
  });

  it("uses source sequence and execution ID as stable ordering tie-breakers", () => {
    const buy = execution({
      id: "z-buy",
      instrumentId: "TIE",
      occurredAtUs: "100",
      ledgerSequence: "1",
      quantity: "1",
      price: "10",
    });
    const sell = execution({
      id: "a-sell",
      instrumentId: "TIE",
      occurredAtUs: "100",
      ledgerSequence: "2",
      side: "SELL",
      quantity: "1",
      price: "11",
    });

    const forward = normalizeTrades([buy, sell]);
    const reversed = normalizeTrades([sell, buy]);
    expect(forward).toEqual(reversed);
    expect(forward.executions.map((candidate) => candidate.id)).toEqual(["z-buy", "a-sell"]);
    expect(forward.trades).toHaveLength(1);
    expect(forward.trades[0]?.status).toBe("CLOSED");
  });

  it("canonicalizes accepted decimal facts before projecting them", () => {
    const result = normalizeTrades([
      execution({ quantity: "01.5000", price: "0100.2500", multiplier: "01.0" }),
    ]);

    expect(result.executions[0]).toMatchObject({
      quantity: "1.5",
      price: "100.25",
      multiplier: "1",
    });
    expect(result.allocations[0]).toMatchObject({ quantity: "1.5", price: "100.25" });
  });

  it("rejects duplicate IDs, invalid numeric facts, and 64-bit fee overflow", () => {
    expectNormalizationError(
      [execution({ id: "duplicate" }), execution({ id: "duplicate", occurredAtUs: "2" })],
      "DUPLICATE_EXECUTION_ID",
    );
    expectNormalizationError([execution({ quantity: "-1" })], "INVALID_DECIMAL");
    expectNormalizationError([
      execution({
        fees: [{
          category: "COMMISSION",
          currency: "USD",
          costMinor: "9223372036854775808",
          minorUnit: 2,
        }],
      }),
    ], "OVERFLOW");
  });

  it("rejects impossible explicit OPEN and CLOSE sequences", () => {
    expectNormalizationError([
      execution({ positionEffect: "CLOSE" }),
    ], "INVALID_POSITION_SEQUENCE");
    expectNormalizationError([
      execution({ id: "entry" }),
      execution({ id: "wrong-close", occurredAtUs: "2", positionEffect: "CLOSE" }),
    ], "INVALID_POSITION_SEQUENCE");
    expectNormalizationError([
      execution({ id: "entry", quantity: "10" }),
      execution({
        id: "oversized-close",
        occurredAtUs: "2",
        side: "SELL",
        positionEffect: "CLOSE",
        quantity: "11",
      }),
    ], "INVALID_POSITION_SEQUENCE");
    expectNormalizationError([
      execution({ id: "entry" }),
      execution({
        id: "opposite-open",
        occurredAtUs: "2",
        side: "SELL",
        positionEffect: "OPEN",
      }),
    ], "INVALID_POSITION_SEQUENCE");
  });

  it("rejects instrument drift and inconsistent fee minor units", () => {
    expectNormalizationError([
      execution({ id: "entry", multiplier: "1" }),
      execution({ id: "drift", occurredAtUs: "2", multiplier: "100" }),
    ], "INCONSISTENT_INSTRUMENT");
    expectNormalizationError([
      execution({
        id: "fee-1",
        fees: [{ category: "COMMISSION", currency: "USD", costMinor: "1", minorUnit: 2 }],
      }),
      execution({
        id: "fee-2",
        instrumentId: "other",
        occurredAtUs: "2",
        fees: [{ category: "COMMISSION", currency: "USD", costMinor: "1", minorUnit: 3 }],
      }),
    ], "INCONSISTENT_MINOR_UNIT");
  });
});
