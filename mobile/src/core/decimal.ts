declare const canonicalDecimalBrand: unique symbol;

/** A base-10 decimal with no sign, exponent, leading zeroes, or trailing zeroes. */
export type CanonicalDecimal = string & {
  readonly [canonicalDecimalBrand]: "CanonicalDecimal";
};

export type DecimalParseErrorCode =
  | "decimal_blank"
  | "decimal_invalid_syntax"
  | "decimal_zero_not_allowed"
  | "decimal_too_many_integer_digits"
  | "decimal_too_many_fraction_digits"
  | "decimal_too_many_total_digits";

export interface DecimalParseOptions {
  readonly allowZero?: boolean;
  readonly maxIntegerDigits?: number;
  readonly maxFractionDigits?: number;
  readonly maxTotalDigits?: number;
}

export type DecimalParseResult =
  | {
      readonly ok: true;
      readonly value: CanonicalDecimal;
    }
  | {
      readonly ok: false;
      readonly code: DecimalParseErrorCode;
      readonly message: string;
    };

const DEFAULT_MAX_INTEGER_DIGITS = 18;
const DEFAULT_MAX_FRACTION_DIGITS = 12;
const DEFAULT_MAX_TOTAL_DIGITS = 30;
const DECIMAL_PATTERN = /^([0-9]+)(?:\.([0-9]+))?$/;

function positiveIntegerOption(value: number | undefined, fallback: number, name: string): number {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1) {
    throw new TypeError(`${name} must be a positive safe integer`);
  }
  return resolved;
}

/**
 * Validates and canonicalizes a positive base-10 decimal without converting it
 * through JavaScript's binary floating-point Number type.
 *
 * Surrounding whitespace is ignored. A leading sign, exponent notation,
 * locale separators, a missing integer component, and a trailing decimal point
 * are deliberately rejected. Limits apply to the supplied digits before
 * canonicalization so leading/trailing zeroes cannot bypass an input limit.
 */
export function canonicalizeDecimal(
  raw: string,
  options: DecimalParseOptions = {},
): DecimalParseResult {
  const value = raw.trim();
  if (value.length === 0) {
    return {
      ok: false,
      code: "decimal_blank",
      message: "Enter a decimal value.",
    };
  }

  const match = DECIMAL_PATTERN.exec(value);
  if (match === null) {
    return {
      ok: false,
      code: "decimal_invalid_syntax",
      message: "Use digits with an optional decimal point; signs and exponents are not supported.",
    };
  }

  const integerDigits = match[1] ?? "";
  const fractionDigits = match[2] ?? "";
  const maxIntegerDigits = positiveIntegerOption(
    options.maxIntegerDigits,
    DEFAULT_MAX_INTEGER_DIGITS,
    "maxIntegerDigits",
  );
  const maxFractionDigits = positiveIntegerOption(
    options.maxFractionDigits,
    DEFAULT_MAX_FRACTION_DIGITS,
    "maxFractionDigits",
  );
  const maxTotalDigits = positiveIntegerOption(
    options.maxTotalDigits,
    DEFAULT_MAX_TOTAL_DIGITS,
    "maxTotalDigits",
  );

  if (integerDigits.length > maxIntegerDigits) {
    return {
      ok: false,
      code: "decimal_too_many_integer_digits",
      message: `Use at most ${maxIntegerDigits} digits before the decimal point.`,
    };
  }
  if (fractionDigits.length > maxFractionDigits) {
    return {
      ok: false,
      code: "decimal_too_many_fraction_digits",
      message: `Use at most ${maxFractionDigits} digits after the decimal point.`,
    };
  }
  if (integerDigits.length + fractionDigits.length > maxTotalDigits) {
    return {
      ok: false,
      code: "decimal_too_many_total_digits",
      message: `Use at most ${maxTotalDigits} total digits.`,
    };
  }

  const canonicalInteger = integerDigits.replace(/^0+(?=[0-9])/, "");
  const canonicalFraction = fractionDigits.replace(/0+$/, "");
  const canonical = canonicalFraction.length === 0
    ? canonicalInteger
    : `${canonicalInteger}.${canonicalFraction}`;

  if (canonical === "0" && options.allowZero !== true) {
    return {
      ok: false,
      code: "decimal_zero_not_allowed",
      message: "Use a value greater than zero.",
    };
  }

  return {
    ok: true,
    value: canonical as CanonicalDecimal,
  };
}

export function isCanonicalDecimalZero(value: CanonicalDecimal): boolean {
  return value === "0";
}

function decimalParts(value: CanonicalDecimal): readonly [string, string] {
  const [integer = "0", fraction = ""] = value.split(".", 2);
  return [integer, fraction];
}

/** Compares two already-canonical non-negative decimals without Number coercion. */
export function compareCanonicalDecimals(
  left: CanonicalDecimal,
  right: CanonicalDecimal,
): -1 | 0 | 1 {
  const [leftInteger, leftFraction] = decimalParts(left);
  const [rightInteger, rightFraction] = decimalParts(right);

  if (leftInteger.length !== rightInteger.length) {
    return leftInteger.length < rightInteger.length ? -1 : 1;
  }
  if (leftInteger !== rightInteger) {
    return leftInteger < rightInteger ? -1 : 1;
  }

  const fractionLength = Math.max(leftFraction.length, rightFraction.length);
  const paddedLeft = leftFraction.padEnd(fractionLength, "0");
  const paddedRight = rightFraction.padEnd(fractionLength, "0");
  if (paddedLeft === paddedRight) {
    return 0;
  }
  return paddedLeft < paddedRight ? -1 : 1;
}
