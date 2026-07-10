import { canonicalizeDecimal } from "./decimal";
import type {
  AllocationFee,
  CurrencyMoneyTotal,
  DecimalString,
  ExecutionFee,
  ExecutionSide,
  FeeCategory,
  LedgerExecution,
  NormalizedExecution,
  PositionDirection,
  TradeAllocation,
  TradeLotMatch,
  TradeNormalizationResult,
  TradeProjection,
} from "./ledger";

const MAX_SQLITE_INTEGER = 9_223_372_036_854_775_807n;
const MIN_SQLITE_INTEGER = -9_223_372_036_854_775_808n;
const MAX_INPUT_INTEGER_DIGITS = 38;
const MAX_INPUT_FRACTION_DIGITS = 18;
const MAX_INPUT_TOTAL_DIGITS = 38;
const MAX_COMPUTED_DIGITS = 128;

const FEE_CATEGORIES = new Set<FeeCategory>([
  "COMMISSION",
  "REGULATORY",
  "EXCHANGE",
  "ROUTING",
  "OTHER",
]);

export type TradeNormalizationErrorCode =
  | "DUPLICATE_EXECUTION_ID"
  | "INCONSISTENT_INSTRUMENT"
  | "INCONSISTENT_MINOR_UNIT"
  | "INTERNAL_INVARIANT"
  | "INVALID_CURRENCY"
  | "INVALID_DECIMAL"
  | "INVALID_EXECUTION"
  | "INVALID_INTEGER"
  | "INVALID_POSITION_SEQUENCE"
  | "OVERFLOW";

export class TradeNormalizationError extends Error {
  readonly code: TradeNormalizationErrorCode;
  readonly executionId: string | null;

  constructor(
    code: TradeNormalizationErrorCode,
    message: string,
    executionId: string | null = null,
  ) {
    super(message);
    this.name = "TradeNormalizationError";
    this.code = code;
    this.executionId = executionId;
  }
}

interface Decimal {
  readonly coefficient: bigint;
  readonly scale: number;
}

interface AllocationDraft {
  readonly id: string;
  readonly executionId: string;
  readonly tradeId: string;
  readonly fragmentIndex: number;
  readonly effect: "ENTRY" | "EXIT";
  readonly side: ExecutionSide;
  readonly occurredAtUs: string;
  readonly quantity: Decimal;
  readonly price: Decimal;
  readonly fees: AllocationFee[];
}

interface LotDraft {
  readonly entryAllocationId: string;
  remainingQuantity: Decimal;
  readonly entryPrice: Decimal;
}

interface LotMatchDraft {
  readonly id: string;
  readonly tradeId: string;
  readonly entryAllocationId: string;
  readonly exitAllocationId: string;
  readonly quantity: Decimal;
  readonly pnlCurrency: string;
  readonly grossPnl: Decimal;
}

interface TradeDraft {
  readonly id: string;
  readonly accountId: string;
  readonly instrumentId: string;
  readonly direction: PositionDirection;
  readonly quoteCurrency: string;
  readonly multiplier: Decimal;
  readonly openedAtUs: string;
  closedAtUs: string | null;
  enteredQuantity: Decimal;
  exitedQuantity: Decimal;
  remainingQuantity: Decimal;
  entryNotional: Decimal;
  exitNotional: Decimal;
  readonly allocationIds: string[];
}

interface GroupState {
  readonly accountId: string;
  readonly instrumentId: string;
  readonly quoteCurrency: string;
  readonly multiplier: Decimal;
  currentTrade: TradeDraft | null;
  readonly lots: LotDraft[];
}

interface MoneyAccumulator {
  grossPnl: Decimal;
  feeCost: Decimal;
  feeMinorUnit: number | null;
}

const ZERO: Decimal = { coefficient: 0n, scale: 0 };

function fail(
  code: TradeNormalizationErrorCode,
  message: string,
  executionId: string | null = null,
): never {
  throw new TradeNormalizationError(code, message, executionId);
}

function significantDigits(value: bigint): number {
  const magnitude = value < 0n ? -value : value;
  return magnitude === 0n ? 1 : magnitude.toString().length;
}

function checkedDecimal(coefficient: bigint, scale: number): Decimal {
  let normalizedCoefficient = coefficient;
  let normalizedScale = scale;
  while (normalizedCoefficient !== 0n && normalizedScale > 0 && normalizedCoefficient % 10n === 0n) {
    normalizedCoefficient /= 10n;
    normalizedScale -= 1;
  }
  if (normalizedCoefficient === 0n) return ZERO;
  if (significantDigits(normalizedCoefficient) > MAX_COMPUTED_DIGITS) {
    fail("OVERFLOW", `A derived decimal exceeded ${MAX_COMPUTED_DIGITS} significant digits.`);
  }
  return { coefficient: normalizedCoefficient, scale: normalizedScale };
}

function powerOfTen(exponent: number): bigint {
  if (!Number.isInteger(exponent) || exponent < 0 || exponent > MAX_COMPUTED_DIGITS) {
    fail("OVERFLOW", "A decimal scale exceeded the ledger arithmetic limit.");
  }
  return 10n ** BigInt(exponent);
}

function decimalFromCanonical(value: string): Decimal {
  const match = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(value);
  if (match === null) fail("INTERNAL_INVARIANT", `Non-canonical decimal reached arithmetic: ${value}`);
  const sign = match[1] === "-" ? -1n : 1n;
  const whole = match[2] ?? "0";
  const fraction = match[3] ?? "";
  return checkedDecimal(sign * BigInt(`${whole}${fraction}`), fraction.length);
}

function decimalToString(value: Decimal): DecimalString {
  if (value.coefficient === 0n) return "0";
  const negative = value.coefficient < 0n;
  const digits = (negative ? -value.coefficient : value.coefficient).toString();
  if (value.scale === 0) return `${negative ? "-" : ""}${digits}`;
  const padded = digits.padStart(value.scale + 1, "0");
  const whole = padded.slice(0, -value.scale);
  const fraction = padded.slice(-value.scale);
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function align(value: Decimal, scale: number): bigint {
  return value.coefficient * powerOfTen(scale - value.scale);
}

function add(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return checkedDecimal(align(left, scale) + align(right, scale), scale);
}

function subtract(left: Decimal, right: Decimal): Decimal {
  const scale = Math.max(left.scale, right.scale);
  return checkedDecimal(align(left, scale) - align(right, scale), scale);
}

function multiply(left: Decimal, right: Decimal): Decimal {
  return checkedDecimal(left.coefficient * right.coefficient, left.scale + right.scale);
}

function compare(left: Decimal, right: Decimal): number {
  const scale = Math.max(left.scale, right.scale);
  const leftCoefficient = align(left, scale);
  const rightCoefficient = align(right, scale);
  return leftCoefficient < rightCoefficient ? -1 : leftCoefficient > rightCoefficient ? 1 : 0;
}

function minimum(left: Decimal, right: Decimal): Decimal {
  return compare(left, right) <= 0 ? left : right;
}

function normalizePositiveDecimal(
  raw: string,
  label: string,
  executionId: string,
): string {
  if (typeof raw !== "string") {
    fail("INVALID_DECIMAL", `${label} must be a decimal string.`, executionId);
  }
  const result = canonicalizeDecimal(raw, {
    allowZero: false,
    maxIntegerDigits: MAX_INPUT_INTEGER_DIGITS,
    maxFractionDigits: MAX_INPUT_FRACTION_DIGITS,
    maxTotalDigits: MAX_INPUT_TOTAL_DIGITS,
  });
  if (!result.ok) {
    fail("INVALID_DECIMAL", `${label}: ${result.message}`, executionId);
  }
  return result.value;
}

function normalizeIdentifier(raw: string, label: string, executionId: string | null): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.trim() !== raw || raw.length > 256) {
    fail("INVALID_EXECUTION", `${label} must be a non-empty, trimmed string of at most 256 characters.`, executionId);
  }
  return raw;
}

function normalizeCurrency(raw: string, label: string, executionId: string): string {
  if (typeof raw !== "string" || !/^[A-Z][A-Z0-9]{2,11}$/.test(raw)) {
    fail("INVALID_CURRENCY", `${label} must be an uppercase currency code.`, executionId);
  }
  return raw;
}

function parseCanonicalInteger(
  raw: string,
  label: string,
  executionId: string,
  options: { readonly signed: boolean; readonly max: bigint; readonly min: bigint },
): bigint {
  const pattern = options.signed ? /^(?:0|-?[1-9][0-9]*)$/ : /^(?:0|[1-9][0-9]*)$/;
  if (typeof raw !== "string" || !pattern.test(raw)) {
    fail("INVALID_INTEGER", `${label} must be a canonical integer string.`, executionId);
  }
  const value = BigInt(raw);
  if (value < options.min || value > options.max) {
    fail("OVERFLOW", `${label} is outside the signed 64-bit SQLite range.`, executionId);
  }
  return value;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function encodedId(prefix: string, components: readonly string[]): string {
  return `${prefix}:${components.map((component) => `${component.length}:${component}`).join(":")}`;
}

function groupKey(accountId: string, instrumentId: string): string {
  return encodedId("group", [accountId, instrumentId]);
}

function normalizeExecutions(executions: readonly LedgerExecution[]): readonly NormalizedExecution[] {
  const ids = new Set<string>();
  const currencyMinorUnits = new Map<string, number>();

  const normalized = executions.map((execution): NormalizedExecution => {
    const provisionalId = typeof execution.id === "string" ? execution.id : "";
    const id = normalizeIdentifier(execution.id, "Execution ID", provisionalId || null);
    if (ids.has(id)) {
      fail("DUPLICATE_EXECUTION_ID", `Execution ID ${id} appears more than once.`, id);
    }
    ids.add(id);

    const accountId = normalizeIdentifier(execution.accountId, "Account ID", id);
    const instrumentId = normalizeIdentifier(execution.instrumentId, "Instrument ID", id);
    parseCanonicalInteger(execution.occurredAtUs, "Execution timestamp", id, {
      signed: false,
      min: 0n,
      max: MAX_SQLITE_INTEGER,
    });
    const ledgerSequence = execution.ledgerSequence ?? null;
    if (ledgerSequence !== null) {
      parseCanonicalInteger(ledgerSequence, "Ledger sequence", id, {
        signed: false,
        min: 0n,
        max: MAX_SQLITE_INTEGER,
      });
    }
    if (execution.side !== "BUY" && execution.side !== "SELL") {
      fail("INVALID_EXECUTION", "Execution side must be BUY or SELL.", id);
    }
    const positionEffect = execution.positionEffect ?? "AUTO";
    if (positionEffect !== "AUTO" && positionEffect !== "OPEN" && positionEffect !== "CLOSE") {
      fail("INVALID_EXECUTION", "Position effect must be AUTO, OPEN, or CLOSE.", id);
    }

    const quoteCurrency = normalizeCurrency(execution.quoteCurrency, "Quote currency", id);
    const fees = (execution.fees ?? []).map((fee, componentIndex): ExecutionFee => {
      if (!FEE_CATEGORIES.has(fee.category)) {
        fail("INVALID_EXECUTION", `Fee ${componentIndex} has an unsupported category.`, id);
      }
      const currency = normalizeCurrency(fee.currency, `Fee ${componentIndex} currency`, id);
      if (!Number.isInteger(fee.minorUnit) || fee.minorUnit < 0 || fee.minorUnit > 8) {
        fail("INVALID_EXECUTION", `Fee ${componentIndex} minor unit must be an integer from 0 through 8.`, id);
      }
      parseCanonicalInteger(fee.costMinor, `Fee ${componentIndex} cost`, id, {
        signed: true,
        min: MIN_SQLITE_INTEGER,
        max: MAX_SQLITE_INTEGER,
      });
      const knownMinorUnit = currencyMinorUnits.get(currency);
      if (knownMinorUnit !== undefined && knownMinorUnit !== fee.minorUnit) {
        fail(
          "INCONSISTENT_MINOR_UNIT",
          `${currency} fees use both ${knownMinorUnit} and ${fee.minorUnit} minor units.`,
          id,
        );
      }
      currencyMinorUnits.set(currency, fee.minorUnit);
      return {
        category: fee.category,
        currency,
        costMinor: fee.costMinor,
        minorUnit: fee.minorUnit,
      };
    });

    return {
      id,
      accountId,
      instrumentId,
      occurredAtUs: execution.occurredAtUs,
      ledgerSequence,
      side: execution.side,
      positionEffect,
      quantity: normalizePositiveDecimal(execution.quantity, "Quantity", id),
      price: normalizePositiveDecimal(execution.price, "Price", id),
      quoteCurrency,
      multiplier: normalizePositiveDecimal(execution.multiplier, "Multiplier", id),
      fees,
    };
  });

  return normalized.sort((left, right) => {
    const timeOrder = parseCanonicalInteger(left.occurredAtUs, "Execution timestamp", left.id, {
      signed: false,
      min: 0n,
      max: MAX_SQLITE_INTEGER,
    }) - parseCanonicalInteger(right.occurredAtUs, "Execution timestamp", right.id, {
      signed: false,
      min: 0n,
      max: MAX_SQLITE_INTEGER,
    });
    if (timeOrder !== 0n) return timeOrder < 0n ? -1 : 1;
    if (left.ledgerSequence !== null && right.ledgerSequence !== null) {
      const sequenceOrder = BigInt(left.ledgerSequence) - BigInt(right.ledgerSequence);
      if (sequenceOrder !== 0n) return sequenceOrder < 0n ? -1 : 1;
    } else if (left.ledgerSequence !== null) {
      return -1;
    } else if (right.ledgerSequence !== null) {
      return 1;
    }
    return stableCompare(left.id, right.id);
  });
}

function directionForSide(side: ExecutionSide): PositionDirection {
  return side === "BUY" ? "LONG" : "SHORT";
}

function createTrade(
  state: GroupState,
  execution: NormalizedExecution,
  openingFragmentIndex: number,
): TradeDraft {
  const openingAllocationId = allocationId(execution.id, openingFragmentIndex);
  return {
    id: encodedId("trade", [state.accountId, state.instrumentId, openingAllocationId]),
    accountId: state.accountId,
    instrumentId: state.instrumentId,
    direction: directionForSide(execution.side),
    quoteCurrency: state.quoteCurrency,
    multiplier: state.multiplier,
    openedAtUs: execution.occurredAtUs,
    closedAtUs: null,
    enteredQuantity: ZERO,
    exitedQuantity: ZERO,
    remainingQuantity: ZERO,
    entryNotional: ZERO,
    exitNotional: ZERO,
    allocationIds: [],
  };
}

function allocationId(executionId: string, fragmentIndex: number): string {
  return encodedId("allocation", [executionId, String(fragmentIndex)]);
}

function createEntryAllocation(
  state: GroupState,
  execution: NormalizedExecution,
  quantity: Decimal,
  fragmentIndex: number,
  trades: TradeDraft[],
  allocations: AllocationDraft[],
): AllocationDraft {
  let trade = state.currentTrade;
  if (trade === null) {
    trade = createTrade(state, execution, fragmentIndex);
    state.currentTrade = trade;
    trades.push(trade);
  }
  if (trade.direction !== directionForSide(execution.side)) {
    fail("INTERNAL_INVARIANT", "An entry allocation changed direction inside an open trade.", execution.id);
  }

  const allocation: AllocationDraft = {
    id: allocationId(execution.id, fragmentIndex),
    executionId: execution.id,
    tradeId: trade.id,
    fragmentIndex,
    effect: "ENTRY",
    side: execution.side,
    occurredAtUs: execution.occurredAtUs,
    quantity,
    price: decimalFromCanonical(execution.price),
    fees: [],
  };
  const notional = multiply(multiply(allocation.price, quantity), state.multiplier);
  trade.enteredQuantity = add(trade.enteredQuantity, quantity);
  trade.remainingQuantity = add(trade.remainingQuantity, quantity);
  trade.entryNotional = add(trade.entryNotional, notional);
  trade.allocationIds.push(allocation.id);
  state.lots.push({
    entryAllocationId: allocation.id,
    remainingQuantity: quantity,
    entryPrice: allocation.price,
  });
  allocations.push(allocation);
  return allocation;
}

function createExitAllocation(
  state: GroupState,
  execution: NormalizedExecution,
  quantity: Decimal,
  fragmentIndex: number,
  allocations: AllocationDraft[],
  lotMatches: LotMatchDraft[],
): AllocationDraft {
  const trade = state.currentTrade;
  if (trade === null || compare(quantity, trade.remainingQuantity) > 0) {
    fail("INTERNAL_INVARIANT", "An exit allocation exceeded the open position.", execution.id);
  }
  const allocation: AllocationDraft = {
    id: allocationId(execution.id, fragmentIndex),
    executionId: execution.id,
    tradeId: trade.id,
    fragmentIndex,
    effect: "EXIT",
    side: execution.side,
    occurredAtUs: execution.occurredAtUs,
    quantity,
    price: decimalFromCanonical(execution.price),
    fees: [],
  };
  const notional = multiply(multiply(allocation.price, quantity), state.multiplier);
  trade.exitedQuantity = add(trade.exitedQuantity, quantity);
  trade.remainingQuantity = subtract(trade.remainingQuantity, quantity);
  trade.exitNotional = add(trade.exitNotional, notional);
  trade.allocationIds.push(allocation.id);
  allocations.push(allocation);

  let unmatched = quantity;
  let fragmentMatchIndex = 0;
  while (compare(unmatched, ZERO) > 0) {
    const lot = state.lots[0];
    if (lot === undefined) {
      fail("INTERNAL_INVARIANT", "FIFO lots did not reconcile with the open quantity.", execution.id);
    }
    const matchedQuantity = minimum(unmatched, lot.remainingQuantity);
    const priceDifference = trade.direction === "LONG"
      ? subtract(allocation.price, lot.entryPrice)
      : subtract(lot.entryPrice, allocation.price);
    const grossPnl = multiply(multiply(priceDifference, matchedQuantity), state.multiplier);
    lotMatches.push({
      id: encodedId("match", [allocation.id, String(fragmentMatchIndex)]),
      tradeId: trade.id,
      entryAllocationId: lot.entryAllocationId,
      exitAllocationId: allocation.id,
      quantity: matchedQuantity,
      pnlCurrency: state.quoteCurrency,
      grossPnl,
    });
    fragmentMatchIndex += 1;
    lot.remainingQuantity = subtract(lot.remainingQuantity, matchedQuantity);
    unmatched = subtract(unmatched, matchedQuantity);
    if (compare(lot.remainingQuantity, ZERO) === 0) state.lots.shift();
  }

  if (compare(trade.remainingQuantity, ZERO) === 0) {
    if (state.lots.length !== 0) {
      fail("INTERNAL_INVARIANT", "A flat trade retained FIFO lots.", execution.id);
    }
    trade.closedAtUs = execution.occurredAtUs;
    state.currentTrade = null;
  }
  return allocation;
}

function quantityAsUnits(value: Decimal, scale: number): bigint {
  if (value.coefficient <= 0n) fail("INTERNAL_INVARIANT", "Allocation quantity was not positive.");
  return align(value, scale);
}

function allocateExecutionFees(
  execution: NormalizedExecution,
  fragments: readonly AllocationDraft[],
): void {
  if (fragments.length === 0) {
    fail("INTERNAL_INVARIANT", "An execution produced no allocations.", execution.id);
  }
  const maxScale = Math.max(...fragments.map((fragment) => fragment.quantity.scale));
  const weights = fragments.map((fragment) => quantityAsUnits(fragment.quantity, maxScale));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0n);
  const executionWeight = quantityAsUnits(decimalFromCanonical(execution.quantity), maxScale);
  if (totalWeight !== executionWeight) {
    fail("INTERNAL_INVARIANT", "Allocation quantities did not sum to the source execution.", execution.id);
  }

  execution.fees.forEach((fee, componentIndex) => {
    const sourceCost = BigInt(fee.costMinor);
    const sign = sourceCost < 0n ? -1n : 1n;
    const magnitude = sourceCost < 0n ? -sourceCost : sourceCost;
    const shares = weights.map((weight, index) => ({
      index,
      units: (magnitude * weight) / totalWeight,
      remainder: (magnitude * weight) % totalWeight,
    }));
    let undistributed = magnitude - shares.reduce((sum, share) => sum + share.units, 0n);
    const remainderOrder = [...shares].sort((left, right) => (
      left.remainder > right.remainder ? -1
        : left.remainder < right.remainder ? 1
          : left.index - right.index
    ));
    let remainderIndex = 0;
    while (undistributed > 0n) {
      const share = remainderOrder[remainderIndex];
      if (share === undefined) fail("INTERNAL_INVARIANT", "Fee remainder allocation failed.", execution.id);
      share.units += 1n;
      undistributed -= 1n;
      remainderIndex += 1;
    }

    shares.sort((left, right) => left.index - right.index).forEach((share) => {
      const fragment = fragments[share.index];
      if (fragment === undefined) fail("INTERNAL_INVARIANT", "Fee allocation lost a fragment.", execution.id);
      fragment.fees.push({
        sourceComponentIndex: componentIndex,
        category: fee.category,
        currency: fee.currency,
        costMinor: String(sign * share.units),
        minorUnit: fee.minorUnit,
      });
    });

    const allocatedCost = fragments.reduce((sum, fragment) => {
      const component = fragment.fees.find((candidate) => candidate.sourceComponentIndex === componentIndex);
      return sum + BigInt(component?.costMinor ?? "0");
    }, 0n);
    if (allocatedCost !== sourceCost) {
      fail("INTERNAL_INVARIANT", "Allocated fees did not reconcile to the source component.", execution.id);
    }
  });
}

function decimalFromMinorUnits(costMinor: string, minorUnit: number): Decimal {
  return checkedDecimal(BigInt(costMinor), minorUnit);
}

function moneyAccumulator(map: Map<string, MoneyAccumulator>, currency: string): MoneyAccumulator {
  let total = map.get(currency);
  if (total === undefined) {
    total = { grossPnl: ZERO, feeCost: ZERO, feeMinorUnit: null };
    map.set(currency, total);
  }
  return total;
}

function finalizedMoneyTotals(map: ReadonlyMap<string, MoneyAccumulator>): readonly CurrencyMoneyTotal[] {
  return [...map.entries()]
    .sort(([left], [right]) => stableCompare(left, right))
    .map(([currency, total]) => ({
      currency,
      grossPnl: decimalToString(total.grossPnl),
      feeCost: decimalToString(total.feeCost),
      netPnl: decimalToString(subtract(total.grossPnl, total.feeCost)),
      feeMinorUnit: total.feeMinorUnit,
    }));
}

function buildMoneyTotals(
  trades: readonly TradeDraft[],
  allocations: readonly AllocationDraft[],
  lotMatches: readonly LotMatchDraft[],
): {
  readonly byTrade: ReadonlyMap<string, readonly CurrencyMoneyTotal[]>;
  readonly all: readonly CurrencyMoneyTotal[];
} {
  const tradeMoney = new Map<string, Map<string, MoneyAccumulator>>();
  for (const trade of trades) {
    const totals = new Map<string, MoneyAccumulator>();
    moneyAccumulator(totals, trade.quoteCurrency);
    tradeMoney.set(trade.id, totals);
  }
  for (const match of lotMatches) {
    const totals = tradeMoney.get(match.tradeId);
    if (totals === undefined) fail("INTERNAL_INVARIANT", "A lot match referenced an unknown trade.");
    const total = moneyAccumulator(totals, match.pnlCurrency);
    total.grossPnl = add(total.grossPnl, match.grossPnl);
  }
  for (const allocation of allocations) {
    const totals = tradeMoney.get(allocation.tradeId);
    if (totals === undefined) fail("INTERNAL_INVARIANT", "An allocation referenced an unknown trade.");
    for (const fee of allocation.fees) {
      const total = moneyAccumulator(totals, fee.currency);
      if (total.feeMinorUnit !== null && total.feeMinorUnit !== fee.minorUnit) {
        fail("INCONSISTENT_MINOR_UNIT", `${fee.currency} fee totals use inconsistent minor units.`);
      }
      total.feeMinorUnit = fee.minorUnit;
      total.feeCost = add(total.feeCost, decimalFromMinorUnits(fee.costMinor, fee.minorUnit));
    }
  }

  const byTrade = new Map<string, readonly CurrencyMoneyTotal[]>();
  const allMoney = new Map<string, MoneyAccumulator>();
  for (const [tradeId, totals] of tradeMoney) {
    const finalized = finalizedMoneyTotals(totals);
    byTrade.set(tradeId, finalized);
    for (const [currency, total] of totals) {
      const aggregate = moneyAccumulator(allMoney, currency);
      aggregate.grossPnl = add(aggregate.grossPnl, total.grossPnl);
      aggregate.feeCost = add(aggregate.feeCost, total.feeCost);
      if (total.feeMinorUnit !== null) {
        if (aggregate.feeMinorUnit !== null && aggregate.feeMinorUnit !== total.feeMinorUnit) {
          fail("INCONSISTENT_MINOR_UNIT", `${currency} aggregate fee totals use inconsistent minor units.`);
        }
        aggregate.feeMinorUnit = total.feeMinorUnit;
      }
    }
  }
  return { byTrade, all: finalizedMoneyTotals(allMoney) };
}

function toTradeAllocation(allocation: AllocationDraft): TradeAllocation {
  return {
    id: allocation.id,
    executionId: allocation.executionId,
    tradeId: allocation.tradeId,
    fragmentIndex: allocation.fragmentIndex,
    effect: allocation.effect,
    side: allocation.side,
    occurredAtUs: allocation.occurredAtUs,
    quantity: decimalToString(allocation.quantity),
    price: decimalToString(allocation.price),
    fees: allocation.fees,
  };
}

function toLotMatch(match: LotMatchDraft): TradeLotMatch {
  return {
    id: match.id,
    tradeId: match.tradeId,
    entryAllocationId: match.entryAllocationId,
    exitAllocationId: match.exitAllocationId,
    quantity: decimalToString(match.quantity),
    pnlCurrency: match.pnlCurrency,
    grossPnl: decimalToString(match.grossPnl),
  };
}

/**
 * Deterministically projects immutable executions into FIFO trades.
 *
 * Executions are ordered by timestamp, explicit source sequence (when present),
 * then execution ID. Reordering the input array therefore cannot change a
 * projection. An AUTO reversal is split into an EXIT followed by a new ENTRY.
 */
export function normalizeTrades(executions: readonly LedgerExecution[]): TradeNormalizationResult {
  const ordered = normalizeExecutions(executions);
  const groups = new Map<string, GroupState>();
  const trades: TradeDraft[] = [];
  const allocations: AllocationDraft[] = [];
  const lotMatches: LotMatchDraft[] = [];

  for (const execution of ordered) {
    const key = groupKey(execution.accountId, execution.instrumentId);
    let state = groups.get(key);
    const multiplier = decimalFromCanonical(execution.multiplier);
    if (state === undefined) {
      state = {
        accountId: execution.accountId,
        instrumentId: execution.instrumentId,
        quoteCurrency: execution.quoteCurrency,
        multiplier,
        currentTrade: null,
        lots: [],
      };
      groups.set(key, state);
    } else if (
      state.quoteCurrency !== execution.quoteCurrency
      || compare(state.multiplier, multiplier) !== 0
    ) {
      fail(
        "INCONSISTENT_INSTRUMENT",
        "Quote currency and multiplier must remain stable within an account/instrument ledger.",
        execution.id,
      );
    }

    const executionQuantity = decimalFromCanonical(execution.quantity);
    const firstAllocationIndex = allocations.length;
    let fragmentIndex = 0;
    const active = state.currentTrade;
    if (active === null) {
      if (execution.positionEffect === "CLOSE") {
        fail("INVALID_POSITION_SEQUENCE", "A CLOSE execution cannot act on a flat position.", execution.id);
      }
      createEntryAllocation(state, execution, executionQuantity, fragmentIndex, trades, allocations);
    } else if (active.direction === directionForSide(execution.side)) {
      if (execution.positionEffect === "CLOSE") {
        fail("INVALID_POSITION_SEQUENCE", "A CLOSE execution cannot increase an open position.", execution.id);
      }
      createEntryAllocation(state, execution, executionQuantity, fragmentIndex, trades, allocations);
    } else {
      if (execution.positionEffect === "OPEN") {
        fail("INVALID_POSITION_SEQUENCE", "An OPEN execution cannot reduce or reverse an open position.", execution.id);
      }
      if (
        execution.positionEffect === "CLOSE"
        && compare(executionQuantity, active.remainingQuantity) > 0
      ) {
        fail("INVALID_POSITION_SEQUENCE", "A CLOSE execution cannot exceed the open position.", execution.id);
      }
      const exitQuantity = minimum(executionQuantity, active.remainingQuantity);
      createExitAllocation(state, execution, exitQuantity, fragmentIndex, allocations, lotMatches);
      fragmentIndex += 1;
      const reversalQuantity = subtract(executionQuantity, exitQuantity);
      if (compare(reversalQuantity, ZERO) > 0) {
        createEntryAllocation(state, execution, reversalQuantity, fragmentIndex, trades, allocations);
      }
    }

    const executionAllocations = allocations.slice(firstAllocationIndex);
    allocateExecutionFees(execution, executionAllocations);
  }

  const totals = buildMoneyTotals(trades, allocations, lotMatches);
  const projections: TradeProjection[] = trades.map((trade) => {
    const moneyTotals = totals.byTrade.get(trade.id);
    if (moneyTotals === undefined) fail("INTERNAL_INVARIANT", "A trade projection lost its money totals.");
    return {
      id: trade.id,
      accountId: trade.accountId,
      instrumentId: trade.instrumentId,
      direction: trade.direction,
      status: compare(trade.remainingQuantity, ZERO) === 0 ? "CLOSED" : "OPEN",
      quoteCurrency: trade.quoteCurrency,
      multiplier: decimalToString(trade.multiplier),
      openedAtUs: trade.openedAtUs,
      closedAtUs: trade.closedAtUs,
      enteredQuantity: decimalToString(trade.enteredQuantity),
      exitedQuantity: decimalToString(trade.exitedQuantity),
      remainingQuantity: decimalToString(trade.remainingQuantity),
      entryNotional: decimalToString(trade.entryNotional),
      exitNotional: decimalToString(trade.exitNotional),
      allocationIds: trade.allocationIds,
      moneyTotals,
    };
  });

  return {
    executions: ordered,
    trades: projections,
    allocations: allocations.map(toTradeAllocation),
    lotMatches: lotMatches.map(toLotMatch),
    moneyTotals: totals.all,
  };
}
