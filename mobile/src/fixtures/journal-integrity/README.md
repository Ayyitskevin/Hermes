# Journal integrity golden fixtures

Consumed by `src/core/journal-integrity.test.ts` through the shipped
`prepareCsvImport` → `normalizeTrades` → report/invariant path. Do not invent
parallel parsers in tests.

| Fixture | Intent |
|---|---|
| `equities-partial-fees.csv` | Stock + ETF round trips, partial exits, commissions |
| `duplicate-executions.csv` | Same file re-submitted; stable execution IDs |
| `malformed-rows.csv` | Missing symbol, invalid side/qty/price/fee/currency/timestamp, blank row |
| `timezone-dst-fold.csv` | Ambiguous fall-back and nonexistent spring-forward NY wall times |
| `unsupported-instruments.csv` | OCC option, futures, crypto pairs mixed with one equity row |
| `mixed-partial-import.csv` | Valid equities plus one unsupported option — whole file stays invalid |

Generic CSV remains stock/ETF only. Unsupported instrument rows receive
`csv_unsupported_instrument` and block commit; they never enter published
report totals as stock with multiplier 1.
