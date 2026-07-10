export type PositionSide = "long" | "short";

export interface SizingInput {
  readonly entryPrice: number;
  readonly stopPrice: number;
  readonly side: PositionSide;
  readonly maxRiskPerTradePct: number;
  readonly maxPositionSizePct: number;
}

export interface SizingResult {
  readonly sizePctEquity: number;
  readonly plannedRiskPct: number;
  readonly stopDistancePct: number;
  readonly cappedBy: "max_position_size_pct" | null;
}

/** Round an IEEE-754 value to a decimal place using Python's ties-to-even rule. */
function roundLikePython(value: number, decimals: number): number {
  if (!Number.isFinite(value)) throw new Error("Cannot round a non-finite number.");
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 9) {
    throw new Error("Rounding precision must be an integer from 0 through 9.");
  }
  if (value === 0) return value;

  const negative = value < 0;
  const magnitude = Math.abs(value);
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, magnitude, false);
  const bits = view.getBigUint64(0, false);
  const exponentBits = Number((bits >> 52n) & 0x7ffn);
  const fraction = bits & ((1n << 52n) - 1n);
  const significand = exponentBits === 0 ? fraction : (1n << 52n) | fraction;
  const binaryExponent = exponentBits === 0 ? -1074 : exponentBits - 1023 - 52;

  let numerator = significand * (10n ** BigInt(decimals));
  let denominator = 1n;
  if (binaryExponent >= 0) numerator <<= BigInt(binaryExponent);
  else denominator <<= BigInt(-binaryExponent);

  let rounded = numerator / denominator;
  const remainder = numerator % denominator;
  const comparison = remainder * 2n - denominator;
  if (comparison > 0n || (comparison === 0n && rounded % 2n !== 0n)) rounded += 1n;

  const result = Number(rounded) / (10 ** decimals);
  return negative ? -result : result;
}

function requirePositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
}

/**
 * Fixed-fractional sizing ported from src/hermes/risk/engine.py.
 * All results are percentages of equity; Hermes never asks for an account balance.
 */
export function sizePosition(input: SizingInput): SizingResult {
  requirePositiveFinite(input.entryPrice, "Entry");
  requirePositiveFinite(input.stopPrice, "Stop");
  requirePositiveFinite(input.maxRiskPerTradePct, "Risk per trade");
  requirePositiveFinite(input.maxPositionSizePct, "Maximum position size");

  if (input.side === "long" && input.stopPrice >= input.entryPrice) {
    throw new Error("A long stop must sit below entry.");
  }
  if (input.side === "short" && input.stopPrice <= input.entryPrice) {
    throw new Error("A short stop must sit above entry.");
  }

  const stopDistancePct =
    (Math.abs(input.entryPrice - input.stopPrice) / input.entryPrice) * 100;
  requirePositiveFinite(stopDistancePct, "Stop distance");
  const rawSizePct = (input.maxRiskPerTradePct / stopDistancePct) * 100;
  requirePositiveFinite(rawSizePct, "Calculated position size");
  const capped = rawSizePct > input.maxPositionSizePct;
  const sizePctEquity = capped ? input.maxPositionSizePct : rawSizePct;
  const plannedRiskPct = (sizePctEquity * stopDistancePct) / 100;
  requirePositiveFinite(plannedRiskPct, "Calculated planned risk");
  const roundedSizePct = roundLikePython(sizePctEquity, 2);
  const roundedRiskPct = roundLikePython(plannedRiskPct, 3);
  const roundedStopPct = roundLikePython(stopDistancePct, 2);
  requirePositiveFinite(roundedSizePct, "Rounded position size");
  requirePositiveFinite(roundedRiskPct, "Rounded planned risk");
  requirePositiveFinite(roundedStopPct, "Rounded stop distance");

  return {
    sizePctEquity: roundedSizePct,
    plannedRiskPct: roundedRiskPct,
    stopDistancePct: roundedStopPct,
    cappedBy: capped ? "max_position_size_pct" : null,
  };
}
