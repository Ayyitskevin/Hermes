import {
  RESULT_R_DEFINITION_V1,
  TRADE_METRIC_FRACTION_DIGITS,
  TRADE_METRIC_ROUNDING_MODE,
  deriveResultRV1,
  type ExactMetricMoney,
} from "./trade-metrics";
import type { TradePreview } from "./types";

/**
 * Shared contract for reports that accept only complete, replayable result-R
 * evidence. Property order is checksum input for each owning report definition.
 */
export const REPORT_ACCEPTED_COMPLETE_RESULT_R_DEFINITION = Object.freeze({
  metric: "result-r",
  definitionVersion: RESULT_R_DEFINITION_V1,
  scaleFactor: "1",
  fractionDigits: TRADE_METRIC_FRACTION_DIGITS,
  roundingMode: TRADE_METRIC_ROUNDING_MODE,
  isPartial: false,
  availability: "value:string;nullReason:null;numerator+denominator+currency:non-null",
  currency: "workspace=evidence=numerator=denominator",
  numerator: "evidence.numerator.amount=trade.resultPnlExact",
  denominator: "evidence.denominator=trade.initialRisk",
  replay: "deriveResultRV1(numerator,denominator,false).value=evidence.value",
  rejection: "retain-cash-cohort;resultRExact=null;rTradeCount-omits",
} as const);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactMetricMoney(value: unknown): ExactMetricMoney | null {
  if (
    !isRecord(value)
    || typeof value.amount !== "string"
    || typeof value.currency !== "string"
    || value.currency.length === 0
  ) {
    return null;
  }
  return {
    amount: value.amount,
    currency: value.currency,
  };
}

/**
 * Return the stored exact R only when every persisted contract field agrees
 * with the current trade and a fresh v1 derivation reproduces the value.
 * Invalid evidence removes only R coverage; callers retain the cash cohort.
 */
export function acceptedCompleteResultRExact(
  trade: TradePreview,
  expectedCurrency: string,
): string | null {
  const evidence: unknown = trade.resultRMetric;
  if (!isRecord(evidence)) return null;

  const numerator = exactMetricMoney(evidence.numerator);
  const denominator = exactMetricMoney(evidence.denominator);
  if (
    typeof evidence.value !== "string"
    || evidence.nullReason !== null
    || evidence.metric !== REPORT_ACCEPTED_COMPLETE_RESULT_R_DEFINITION.metric
    || evidence.definitionVersion
      !== REPORT_ACCEPTED_COMPLETE_RESULT_R_DEFINITION.definitionVersion
    || evidence.scaleFactor !== REPORT_ACCEPTED_COMPLETE_RESULT_R_DEFINITION.scaleFactor
    || evidence.fractionDigits
      !== REPORT_ACCEPTED_COMPLETE_RESULT_R_DEFINITION.fractionDigits
    || evidence.roundingMode !== REPORT_ACCEPTED_COMPLETE_RESULT_R_DEFINITION.roundingMode
    || evidence.isPartial !== REPORT_ACCEPTED_COMPLETE_RESULT_R_DEFINITION.isPartial
    || evidence.currency !== expectedCurrency
    || numerator === null
    || denominator === null
    || numerator.currency !== expectedCurrency
    || denominator.currency !== expectedCurrency
    || numerator.amount !== trade.resultPnlExact
    || trade.initialRisk === null
    || denominator.amount !== trade.initialRisk.amount
    || denominator.currency !== trade.initialRisk.currency
  ) {
    return null;
  }

  try {
    const replay = deriveResultRV1({
      netRealizedPnl: numerator,
      initialRisk: denominator,
      isPartial: false,
    });
    return replay.value !== null && replay.value === evidence.value
      ? evidence.value
      : null;
  } catch {
    return null;
  }
}
