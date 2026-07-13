import {
  compareSignedDecimals,
  divideSignedDecimals,
  multiplySignedDecimals,
} from "./signed-decimal";

export const RESULT_R_DEFINITION_V1 = "result-r-v1" as const;
export const PERCENT_RETURN_DEFINITION_V1 = "percent-return-v1" as const;
export const TRADE_METRIC_FRACTION_DIGITS = 12 as const;
export const TRADE_METRIC_ROUNDING_MODE = "half_away_from_zero" as const;

export type TradeMetricName = "result-r" | "percent-return";
export type TradeMetricDefinitionVersion =
  | typeof RESULT_R_DEFINITION_V1
  | typeof PERCENT_RETURN_DEFINITION_V1;
export type TradeMetricNullReason =
  | "no_realized_exit"
  | "missing_initial_risk"
  | "currency_mismatch"
  | "unsupported_asset"
  | "invalid_denominator";

/** An exact canonical decimal and the currency that gives it meaning. */
export interface ExactMetricMoney {
  readonly amount: string;
  readonly currency: string;
}

interface TradeMetricEvidenceBase {
  readonly metric: TradeMetricName;
  readonly definitionVersion: TradeMetricDefinitionVersion;
  readonly numerator: ExactMetricMoney | null;
  readonly denominator: ExactMetricMoney | null;
  /** The common currency, or null when the two inputs cannot be reconciled. */
  readonly currency: string | null;
  readonly scaleFactor: "1" | "100";
  readonly fractionDigits: typeof TRADE_METRIC_FRACTION_DIGITS;
  readonly roundingMode: typeof TRADE_METRIC_ROUNDING_MODE;
  /** True when the numerator reflects realized exits while a position remains open. */
  readonly isPartial: boolean;
}

export interface AvailableTradeMetricEvidence extends TradeMetricEvidenceBase {
  readonly value: string;
  readonly nullReason: null;
  readonly numerator: ExactMetricMoney;
  readonly denominator: ExactMetricMoney;
  readonly currency: string;
}

export interface UnavailableTradeMetricEvidence extends TradeMetricEvidenceBase {
  readonly value: null;
  readonly nullReason: TradeMetricNullReason;
}

export type TradeMetricEvidence =
  | AvailableTradeMetricEvidence
  | UnavailableTradeMetricEvidence;

export interface ResultRMetricInput {
  /** Null means the trade has no realized exit; zero is a valid realized result. */
  readonly netRealizedPnl: ExactMetricMoney | null;
  /** A user-confirmed positive initial-risk amount in the P&L currency. */
  readonly initialRisk: ExactMetricMoney | null;
  readonly isPartial: boolean;
}

export interface PercentReturnMetricInput {
  readonly assetClass: string;
  /** Null means the trade has no realized exit; fees are already reflected here. */
  readonly netRealizedPnl: ExactMetricMoney | null;
  /** Full positive entry notional, including the entire entered quantity. */
  readonly fullEntryNotional: ExactMetricMoney;
  readonly isPartial: boolean;
}

export interface TradeMetricsV1Input
  extends ResultRMetricInput, PercentReturnMetricInput {}

export interface TradeMetricsV1 {
  readonly resultR: TradeMetricEvidence;
  readonly percentReturn: TradeMetricEvidence;
}

interface MetricDefinition {
  readonly metric: TradeMetricName;
  readonly definitionVersion: TradeMetricDefinitionVersion;
  readonly scaleFactor: "1" | "100";
}

const RESULT_R: MetricDefinition = {
  metric: "result-r",
  definitionVersion: RESULT_R_DEFINITION_V1,
  scaleFactor: "1",
};

const PERCENT_RETURN: MetricDefinition = {
  metric: "percent-return",
  definitionVersion: PERCENT_RETURN_DEFINITION_V1,
  scaleFactor: "100",
};

function sharedCurrency(
  numerator: ExactMetricMoney | null,
  denominator: ExactMetricMoney | null,
): string | null {
  return numerator !== null
    && denominator !== null
    && numerator.currency === denominator.currency
    ? numerator.currency
    : null;
}

function unavailable(
  definition: MetricDefinition,
  nullReason: TradeMetricNullReason,
  numerator: ExactMetricMoney | null,
  denominator: ExactMetricMoney | null,
  isPartial: boolean,
): UnavailableTradeMetricEvidence {
  return {
    ...definition,
    value: null,
    nullReason,
    numerator,
    denominator,
    currency: sharedCurrency(numerator, denominator),
    fractionDigits: TRADE_METRIC_FRACTION_DIGITS,
    roundingMode: TRADE_METRIC_ROUNDING_MODE,
    isPartial,
  };
}

function available(
  definition: MetricDefinition,
  numerator: ExactMetricMoney,
  denominator: ExactMetricMoney,
  isPartial: boolean,
): AvailableTradeMetricEvidence {
  const scaledNumerator = multiplySignedDecimals(numerator.amount, definition.scaleFactor);
  return {
    ...definition,
    value: divideSignedDecimals(
      scaledNumerator,
      denominator.amount,
      TRADE_METRIC_FRACTION_DIGITS,
    ),
    nullReason: null,
    numerator,
    denominator,
    currency: numerator.currency,
    fractionDigits: TRADE_METRIC_FRACTION_DIGITS,
    roundingMode: TRADE_METRIC_ROUNDING_MODE,
    isPartial,
  };
}

function hasPositiveDenominator(denominator: ExactMetricMoney): boolean {
  return compareSignedDecimals(denominator.amount, "0") > 0;
}

export function deriveResultRV1(input: ResultRMetricInput): TradeMetricEvidence {
  const { netRealizedPnl, initialRisk, isPartial } = input;
  if (netRealizedPnl === null) {
    return unavailable(RESULT_R, "no_realized_exit", null, initialRisk, isPartial);
  }
  if (initialRisk === null) {
    return unavailable(RESULT_R, "missing_initial_risk", netRealizedPnl, null, isPartial);
  }
  if (netRealizedPnl.currency !== initialRisk.currency) {
    return unavailable(RESULT_R, "currency_mismatch", netRealizedPnl, initialRisk, isPartial);
  }
  if (!hasPositiveDenominator(initialRisk)) {
    return unavailable(RESULT_R, "invalid_denominator", netRealizedPnl, initialRisk, isPartial);
  }
  return available(RESULT_R, netRealizedPnl, initialRisk, isPartial);
}

export function derivePercentReturnV1(input: PercentReturnMetricInput): TradeMetricEvidence {
  const { assetClass, netRealizedPnl, fullEntryNotional, isPartial } = input;
  if (netRealizedPnl === null) {
    return unavailable(PERCENT_RETURN, "no_realized_exit", null, fullEntryNotional, isPartial);
  }
  if (assetClass !== "stock" && assetClass !== "etf") {
    return unavailable(
      PERCENT_RETURN,
      "unsupported_asset",
      netRealizedPnl,
      fullEntryNotional,
      isPartial,
    );
  }
  if (netRealizedPnl.currency !== fullEntryNotional.currency) {
    return unavailable(
      PERCENT_RETURN,
      "currency_mismatch",
      netRealizedPnl,
      fullEntryNotional,
      isPartial,
    );
  }
  if (!hasPositiveDenominator(fullEntryNotional)) {
    return unavailable(
      PERCENT_RETURN,
      "invalid_denominator",
      netRealizedPnl,
      fullEntryNotional,
      isPartial,
    );
  }
  return available(PERCENT_RETURN, netRealizedPnl, fullEntryNotional, isPartial);
}

export function deriveTradeMetricsV1(input: TradeMetricsV1Input): TradeMetricsV1 {
  return {
    resultR: deriveResultRV1(input),
    percentReturn: derivePercentReturnV1(input),
  };
}
