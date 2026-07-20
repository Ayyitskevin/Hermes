/**
 * Core instrument support boundary for generic CSV and validation.
 *
 * Product Core is stock/ETF only. Generic CSV has no asset-class column and
 * always materializes rows as stock with multiplier 1. Rows that look like
 * options, futures, or common crypto pairs must fail closed with an explicit
 * issue code rather than enter the ledger as equities and poison P&L.
 */

export type SupportedCoreAssetClass = "stock" | "etf";

export type UnsupportedInstrumentKind =
  | "option_contract"
  | "futures_contract"
  | "crypto_pair"
  | "unknown_non_equity";

export type InstrumentSupportResult =
  | { readonly ok: true; readonly kind: "equity_compatible" }
  | {
      readonly ok: false;
      readonly kind: UnsupportedInstrumentKind;
      readonly code: "unsupported_instrument";
      readonly message: string;
    };

/** Compact OCC/OSI option root: ROOT + YYMMDD + C|P + 8-digit strike. */
const OCC_OPTION_SYMBOL =
  /^[A-Z]{1,6}\d{6}[CP]\d{8}$/;

/**
 * Yahoo-style futures (ES=F) and dotted futures month codes that are not
 * ordinary equity class shares (BRK.B remains allowed via a separate check).
 */
const YAHOO_FUTURES = /^[A-Z0-9]{1,6}=F$/;
const FUTURES_MONTH_CODE = /^[A-Z]{1,3}[FGHJKMNQUVXZ]\d{1,2}$/;

/** Common crypto base/quote pairs seen in retail broker exports. */
const CRYPTO_BASES = new Set([
  "BTC", "ETH", "SOL", "XRP", "ADA", "DOGE", "DOT", "AVAX", "LINK", "MATIC",
  "LTC", "BCH", "ATOM", "UNI", "APT", "ARB", "OP", "NEAR", "FIL", "ICP",
  "SHIB", "PEPE", "TON", "SUI", "SEI", "TIA", "INJ", "AAVE", "MKR", "CRV",
]);
const CRYPTO_QUOTES = new Set([
  "USD", "USDT", "USDC", "EUR", "GBP", "BTC", "ETH", "USDС",
]);

const EQUITY_SYMBOL = /^[A-Z0-9][A-Z0-9._:/-]{0,31}$/;

function looksLikeCryptoPair(symbol: string): boolean {
  const separators = ["-", "/", ":"];
  for (const separator of separators) {
    if (!symbol.includes(separator)) continue;
    const [base, quote, ...rest] = symbol.split(separator);
    if (rest.length > 0 || base === undefined || quote === undefined) continue;
    if (CRYPTO_BASES.has(base) && CRYPTO_QUOTES.has(quote)) {
      return true;
    }
  }
  // Compact forms: BTCUSD, ETHUSDT
  for (const quote of ["USDT", "USDC", "USD", "EUR", "BTC", "ETH"]) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      const base = symbol.slice(0, -quote.length);
      if (CRYPTO_BASES.has(base)) return true;
    }
  }
  return false;
}

/**
 * Classifies a canonical uppercase symbol for Core CSV import support.
 * Does not invent an asset class; only blocks patterns that would be wrong
 * if forced to stock/multiplier 1.
 */
export function classifyCoreInstrumentSymbol(rawSymbol: string): InstrumentSupportResult {
  const symbol = rawSymbol.trim().toLocaleUpperCase("en-US");
  // Futures / OCC / crypto patterns are classified before the equity charset so
  // symbols like ES=F still surface as futures (not a generic charset failure).
  if (OCC_OPTION_SYMBOL.test(symbol)) {
    return {
      ok: false,
      kind: "option_contract",
      code: "unsupported_instrument",
      message:
        "Option contract symbols are not supported in Core CSV imports. "
        + "Import stock/ETF fills only, or wait for an explicit options instrument contract.",
    };
  }
  if (YAHOO_FUTURES.test(symbol) || FUTURES_MONTH_CODE.test(symbol)) {
    return {
      ok: false,
      kind: "futures_contract",
      code: "unsupported_instrument",
      message:
        "Futures symbols are not supported in Core CSV imports. "
        + "Generic CSV accepts stock and ETF equity fills only.",
    };
  }
  if (looksLikeCryptoPair(symbol)) {
    return {
      ok: false,
      kind: "crypto_pair",
      code: "unsupported_instrument",
      message:
        "Crypto pair symbols are not supported in Core CSV imports. "
        + "Generic CSV accepts stock and ETF equity fills only.",
    };
  }
  if (!EQUITY_SYMBOL.test(symbol)) {
    return {
      ok: false,
      kind: "unknown_non_equity",
      code: "unsupported_instrument",
      message:
        "Symbol is not a Core equity/ETF ticker. Generic CSV imports stock and ETF fills only.",
    };
  }
  return { ok: true, kind: "equity_compatible" };
}
