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
| `open-partial-remaining.csv` | Buy 10 / sell 4 — open partial remaining 6 with realized-on-partial |
| `close-partial-remaining.csv` | Sell remaining 6 — used as a later receipt; voiding it reopens the partial |

Generic CSV remains stock/ETF only. Unsupported instrument rows receive
`csv_unsupported_instrument` and block commit; they never enter published
report totals as stock with multiplier 1.

Active-head follow-up (`journal-integrity-active-heads.test.ts`): full receipt
void clears governed report subjects and headline performance; rolling back a
later close receipt reprojects the open partial without retaining closed-round-
trip P&L.
