import { parseExecutionTimestamp } from "./csv";
import { currencyMinorUnit } from "./currency";
import { canonicalizeDecimal } from "./decimal";

export type ManualAssetClass = "stock" | "etf";
export type ManualExecutionSide = "BUY" | "SELL";
export type ManualPositionEffect = "AUTO" | "OPEN" | "CLOSE";

export interface ExecutionInput {
  readonly accountName: string;
  readonly timeZone: string;
  readonly defaultCurrency: string;
  readonly symbol: string;
  readonly assetClass: ManualAssetClass;
  readonly side: ManualExecutionSide;
  readonly positionEffect: ManualPositionEffect;
  readonly quantity: string;
  readonly price: string;
  readonly fee: string;
  readonly executedAt: string;
}

export interface ValidatedExecutionInput {
  readonly accountName: string;
  readonly timeZone: string;
  readonly defaultCurrency: string;
  readonly symbol: string;
  readonly assetClass: ManualAssetClass;
  readonly side: ManualExecutionSide;
  readonly positionEffect: ManualPositionEffect;
  readonly quantity: string;
  readonly price: string;
  readonly fee: string;
  readonly feeMinor: string;
  readonly minorUnit: number;
  readonly enteredAt: string;
  readonly executedAt: string;
  readonly occurredAtUs: string;
}

export type ExecutionInputErrorCode =
  | "invalid_name"
  | "invalid_time_zone"
  | "invalid_currency"
  | "invalid_symbol"
  | "invalid_asset_class"
  | "invalid_side"
  | "invalid_position_effect"
  | "invalid_quantity"
  | "invalid_price"
  | "invalid_fee"
  | "invalid_timestamp";

export class ExecutionInputError extends Error {
  constructor(
    readonly code: ExecutionInputErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ExecutionInputError";
  }
}

const NAME_LIMIT = 256;
const MAX_SQLITE_INTEGER = 9_223_372_036_854_775_807n;

function containsControlCharacters(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
  });
}

function validatedName(value: string, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.length > NAME_LIMIT
    || value.trim() !== value
    || containsControlCharacters(value)
  ) {
    throw new ExecutionInputError(
      "invalid_name",
      `${label} must contain 1-${NAME_LIMIT} trimmed visible characters.`,
    );
  }
  return value;
}

function validatedTimeZone(value: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value) {
    throw new ExecutionInputError("invalid_time_zone", "Select a valid IANA time zone.");
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date(0));
    return value;
  } catch {
    throw new ExecutionInputError("invalid_time_zone", "Select a valid IANA time zone.");
  }
}

function validatedSymbol(value: string): string {
  const symbol = value.trim().toLocaleUpperCase("en-US");
  if (!/^[A-Z0-9][A-Z0-9._:/-]{0,31}$/.test(symbol)) {
    throw new ExecutionInputError(
      "invalid_symbol",
      "Use 1-32 letters, digits, dots, slashes, colons, underscores, or hyphens.",
    );
  }
  return symbol;
}

function validatedDecimal(
  value: string,
  field: "quantity" | "price" | "fee",
  allowZero: boolean,
): string {
  const parsed = canonicalizeDecimal(value, { allowZero });
  if (!parsed.ok) {
    throw new ExecutionInputError(
      field === "quantity"
        ? "invalid_quantity"
        : field === "price" ? "invalid_price" : "invalid_fee",
      `${field[0]?.toLocaleUpperCase("en-US") ?? ""}${field.slice(1)}: ${parsed.message}`,
    );
  }
  return parsed.value;
}

function feeInMinorUnits(value: string, exponent: number): string {
  const [whole = "0", fraction = ""] = value.split(".", 2);
  if (/[^0]/.test(fraction.slice(exponent))) {
    throw new ExecutionInputError(
      "invalid_fee",
      `Fees in this currency support at most ${exponent} fractional digits.`,
    );
  }
  const minor = BigInt(`${whole}${fraction.slice(0, exponent).padEnd(exponent, "0")}`);
  if (minor > MAX_SQLITE_INTEGER) {
    throw new ExecutionInputError(
      "invalid_fee",
      "The fee is outside the local ledger integer range.",
    );
  }
  return String(minor);
}

function epochMicroseconds(instant: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(instant);
  if (match === null) {
    throw new ExecutionInputError("invalid_timestamp", "Execution time is not canonical UTC.");
  }
  const epochMilliseconds = Date.parse(`${match[1]}.000Z`);
  const fraction = match[2] ?? "";
  if (
    !Number.isSafeInteger(epochMilliseconds)
    || epochMilliseconds < 0
    || /[^0]/.test(fraction.slice(6))
  ) {
    throw new ExecutionInputError(
      "invalid_timestamp",
      "Execution time must be on or after 1970 and use at most microsecond precision.",
    );
  }
  const value =
    (BigInt(epochMilliseconds) / 1000n) * 1_000_000n
      + BigInt(fraction.slice(0, 6).padEnd(6, "0"));
  if (value > MAX_SQLITE_INTEGER) {
    throw new ExecutionInputError(
      "invalid_timestamp",
      "Execution time is outside the local ledger integer range.",
    );
  }
  return String(value);
}

function offsetMatchesTimeZone(raw: string, instantIso: string, timeZone: string): boolean {
  const wallTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (wallTime === null) return false;
  const expected = [
    Number(wallTime[1]),
    Number(wallTime[2]),
    Number(wallTime[3]),
    Number(wallTime[4]),
    Number(wallTime[5]),
    Number(wallTime[6] ?? "0"),
  ];
  const actual = new Map(
    new Intl.DateTimeFormat("en-CA-u-ca-iso8601-hc-h23-nu-latn", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(new Date(instantIso))
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  return expected[0] === actual.get("year")
    && expected[1] === actual.get("month")
    && expected[2] === actual.get("day")
    && expected[3] === actual.get("hour")
    && expected[4] === actual.get("minute")
    && expected[5] === actual.get("second");
}

export function validateExecutionInput(input: ExecutionInput): ValidatedExecutionInput {
  const accountName = validatedName(input.accountName, "Account name");
  const timeZone = validatedTimeZone(input.timeZone);
  const defaultCurrency = input.defaultCurrency.trim().toLocaleUpperCase("en-US");
  const minorUnit = currencyMinorUnit(defaultCurrency);
  if (minorUnit === null) {
    throw new ExecutionInputError(
      "invalid_currency",
      `${defaultCurrency || "This currency"} is not supported by the local ledger.`,
    );
  }
  const symbol = validatedSymbol(input.symbol);
  if (input.assetClass !== "stock" && input.assetClass !== "etf") {
    throw new ExecutionInputError("invalid_asset_class", "Choose stock or ETF.");
  }
  if (input.side !== "BUY" && input.side !== "SELL") {
    throw new ExecutionInputError("invalid_side", "Choose buy or sell.");
  }
  if (
    input.positionEffect !== "AUTO"
    && input.positionEffect !== "OPEN"
    && input.positionEffect !== "CLOSE"
  ) {
    throw new ExecutionInputError(
      "invalid_position_effect",
      "Choose automatic, open, or close position effect.",
    );
  }
  const quantity = validatedDecimal(input.quantity, "quantity", false);
  const price = validatedDecimal(input.price, "price", false);
  const fee = validatedDecimal(input.fee, "fee", true);
  const timestamp = parseExecutionTimestamp(input.executedAt, timeZone);
  if (!timestamp.ok) {
    throw new ExecutionInputError("invalid_timestamp", timestamp.message);
  }
  const occurredAtUs = epochMicroseconds(timestamp.instantIso);
  if (timestamp.source === "offset" && !offsetMatchesTimeZone(
    input.executedAt,
    timestamp.instantIso,
    timeZone,
  )) {
    throw new ExecutionInputError(
      "invalid_timestamp",
      `The explicit UTC offset does not match ${timeZone} at that local time.`,
    );
  }
  return {
    accountName,
    timeZone,
    defaultCurrency,
    symbol,
    assetClass: input.assetClass,
    side: input.side,
    positionEffect: input.positionEffect,
    quantity,
    price,
    fee,
    feeMinor: feeInMinorUnits(fee, minorUnit),
    minorUnit,
    enteredAt: input.executedAt,
    executedAt: timestamp.instantIso,
    occurredAtUs,
  };
}
