/** Currency capabilities deliberately supported by the v1 local ledger UI. */
export const SUPPORTED_CURRENCY_MINOR_UNITS: Readonly<Record<string, number>> = Object.freeze({
  AUD: 2,
  CAD: 2,
  CHF: 2,
  EUR: 2,
  GBP: 2,
  JPY: 0,
  NZD: 2,
  USD: 2,
});

export function currencyMinorUnit(currency: string): number | null {
  return SUPPORTED_CURRENCY_MINOR_UNITS[currency] ?? null;
}
