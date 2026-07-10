/**
 * Immutable facts accepted by the local execution ledger.
 *
 * Decimal values are strings so no financial value crosses an IEEE-754 number
 * boundary. `normalizeTrades` canonicalizes the strings before it derives any
 * projections.
 */
export type DecimalString = string;
export type IntegerString = string;

export type ExecutionSide = "BUY" | "SELL";
export type PositionEffect = "AUTO" | "OPEN" | "CLOSE";
export type PositionDirection = "LONG" | "SHORT";
export type TradeProjectionStatus = "OPEN" | "CLOSED";
export type AllocationEffect = "ENTRY" | "EXIT";

export type FeeCategory =
  | "COMMISSION"
  | "REGULATORY"
  | "EXCHANGE"
  | "ROUTING"
  | "OTHER";

/** A positive cost is charged to the trader; a negative cost is a rebate. */
export interface ExecutionFee {
  readonly category: FeeCategory;
  readonly currency: string;
  readonly costMinor: IntegerString;
  readonly minorUnit: number;
}

export interface LedgerExecution {
  readonly id: string;
  readonly accountId: string;
  readonly instrumentId: string;
  readonly occurredAtUs: IntegerString;
  readonly ledgerSequence?: IntegerString | null;
  readonly side: ExecutionSide;
  readonly positionEffect?: PositionEffect;
  readonly quantity: DecimalString;
  readonly price: DecimalString;
  readonly quoteCurrency: string;
  readonly multiplier: DecimalString;
  readonly fees?: readonly ExecutionFee[];
}

export interface NormalizedExecution {
  readonly id: string;
  readonly accountId: string;
  readonly instrumentId: string;
  readonly occurredAtUs: IntegerString;
  readonly ledgerSequence: IntegerString | null;
  readonly side: ExecutionSide;
  readonly positionEffect: PositionEffect;
  readonly quantity: DecimalString;
  readonly price: DecimalString;
  readonly quoteCurrency: string;
  readonly multiplier: DecimalString;
  readonly fees: readonly ExecutionFee[];
}

export interface AllocationFee {
  readonly sourceComponentIndex: number;
  readonly category: FeeCategory;
  readonly currency: string;
  readonly costMinor: IntegerString;
  readonly minorUnit: number;
}

export interface TradeAllocation {
  readonly id: string;
  readonly executionId: string;
  readonly tradeId: string;
  readonly fragmentIndex: number;
  readonly effect: AllocationEffect;
  readonly side: ExecutionSide;
  readonly occurredAtUs: IntegerString;
  readonly quantity: DecimalString;
  readonly price: DecimalString;
  readonly fees: readonly AllocationFee[];
}

export interface TradeLotMatch {
  readonly id: string;
  readonly tradeId: string;
  readonly entryAllocationId: string;
  readonly exitAllocationId: string;
  readonly quantity: DecimalString;
  readonly pnlCurrency: string;
  readonly grossPnl: DecimalString;
}

/**
 * One total for one currency. There is deliberately no cross-currency total:
 * callers must provide an explicit FX layer before combining these values.
 */
export interface CurrencyMoneyTotal {
  readonly currency: string;
  readonly grossPnl: DecimalString;
  readonly feeCost: DecimalString;
  readonly netPnl: DecimalString;
  readonly feeMinorUnit: number | null;
}

export interface TradeProjection {
  readonly id: string;
  readonly accountId: string;
  readonly instrumentId: string;
  readonly direction: PositionDirection;
  readonly status: TradeProjectionStatus;
  readonly quoteCurrency: string;
  readonly multiplier: DecimalString;
  readonly openedAtUs: IntegerString;
  readonly closedAtUs: IntegerString | null;
  readonly enteredQuantity: DecimalString;
  readonly exitedQuantity: DecimalString;
  readonly remainingQuantity: DecimalString;
  readonly entryNotional: DecimalString;
  readonly exitNotional: DecimalString;
  readonly allocationIds: readonly string[];
  readonly moneyTotals: readonly CurrencyMoneyTotal[];
}

export interface TradeNormalizationResult {
  readonly executions: readonly NormalizedExecution[];
  readonly trades: readonly TradeProjection[];
  readonly allocations: readonly TradeAllocation[];
  readonly lotMatches: readonly TradeLotMatch[];
  readonly moneyTotals: readonly CurrencyMoneyTotal[];
}
