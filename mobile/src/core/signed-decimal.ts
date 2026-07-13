interface ExactDecimal {
  readonly coefficient: bigint;
  readonly scale: number;
}

const PATTERN = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]*[1-9]))?$/;

function powerOfTen(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0 || value > 256) {
    throw new RangeError("Decimal scale is outside the exact analytics range.");
  }
  return 10n ** BigInt(value);
}

function parse(value: string): ExactDecimal {
  const match = PATTERN.exec(value);
  if (match === null || value === "-0") {
    throw new TypeError(`Expected a canonical signed decimal, received ${value}.`);
  }
  const fraction = match[3] ?? "";
  const sign = match[1] === "-" ? -1n : 1n;
  return {
    coefficient: sign * BigInt(`${match[2] ?? "0"}${fraction}`),
    scale: fraction.length,
  };
}

function format(value: ExactDecimal): string {
  if (value.coefficient === 0n) return "0";
  let coefficient = value.coefficient;
  let scale = value.scale;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  const negative = coefficient < 0n;
  const digits = (negative ? -coefficient : coefficient).toString();
  if (scale === 0) return `${negative ? "-" : ""}${digits}`;
  const padded = digits.padStart(scale + 1, "0");
  return `${negative ? "-" : ""}${padded.slice(0, -scale)}.${padded.slice(-scale)}`;
}

function alignedCoefficient(value: ExactDecimal, scale: number): bigint {
  return value.coefficient * powerOfTen(scale - value.scale);
}

export function addSignedDecimals(left: string, right: string): string {
  const parsedLeft = parse(left);
  const parsedRight = parse(right);
  const scale = Math.max(parsedLeft.scale, parsedRight.scale);
  return format({
    coefficient: alignedCoefficient(parsedLeft, scale) + alignedCoefficient(parsedRight, scale),
    scale,
  });
}

export function compareSignedDecimals(left: string, right: string): -1 | 0 | 1 {
  const parsedLeft = parse(left);
  const parsedRight = parse(right);
  const scale = Math.max(parsedLeft.scale, parsedRight.scale);
  const difference = alignedCoefficient(parsedLeft, scale) - alignedCoefficient(parsedRight, scale);
  return difference < 0n ? -1 : difference > 0n ? 1 : 0;
}

export function absoluteSignedDecimal(value: string): string {
  const parsed = parse(value);
  return format({
    coefficient: parsed.coefficient < 0n ? -parsed.coefficient : parsed.coefficient,
    scale: parsed.scale,
  });
}

export function negateSignedDecimal(value: string): string {
  const parsed = parse(value);
  return format({ coefficient: -parsed.coefficient, scale: parsed.scale });
}

/** Multiplies two canonical signed decimals without crossing binary floating point. */
export function multiplySignedDecimals(left: string, right: string): string {
  const parsedLeft = parse(left);
  const parsedRight = parse(right);
  return format({
    coefficient: parsedLeft.coefficient * parsedRight.coefficient,
    scale: parsedLeft.scale + parsedRight.scale,
  });
}

/**
 * Returns a rounded canonical ratio without crossing binary floating point.
 * The denominator must be positive. Ties round away from zero so positive and
 * negative financial results follow the same magnitude rule.
 */
export function divideSignedDecimals(
  numerator: string,
  denominator: string,
  fractionDigits = 12,
): string {
  const left = parse(numerator);
  const right = parse(denominator);
  if (right.coefficient <= 0n) {
    throw new RangeError("Decimal ratio requires a positive denominator.");
  }
  if (!Number.isSafeInteger(fractionDigits) || fractionDigits < 0 || fractionDigits > 18) {
    throw new RangeError("Decimal ratio precision must be an integer from 0 through 18.");
  }
  const negative = left.coefficient < 0n;
  const magnitude = negative ? -left.coefficient : left.coefficient;
  const scaledNumerator = magnitude * powerOfTen(right.scale + fractionDigits);
  const scaledDenominator = right.coefficient * powerOfTen(left.scale);
  let quotient = scaledNumerator / scaledDenominator;
  const remainder = scaledNumerator % scaledDenominator;
  if (remainder * 2n >= scaledDenominator) quotient += 1n;
  return format({ coefficient: negative ? -quotient : quotient, scale: fractionDigits });
}

export function sumSignedDecimals(values: readonly string[]): string {
  return values.reduce(addSignedDecimals, "0");
}
