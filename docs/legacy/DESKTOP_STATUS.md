# Legacy desktop boundary

The Python/FastAPI Hermes application predates the mobile product decision. It
was designed around one trader's regime, risk-posture, and percent-only workflow.
That is no longer the product contract for Hermes Journal.

## Status

- The legacy desktop application is not bundled into the iOS or Android app.
- Its personal strategy, posture, campaign, TradingView, and cockpit concepts
  must not become mobile domain requirements.
- New journal records must use the mobile execution-first schema rather than
  extending the legacy `journal_entries` table.
- No new product work should land in the legacy surface unless it is necessary
  to extract or verify a reusable deterministic component.

## Candidates for extraction

- Fixed-fractional sizing math and shared golden fixtures.
- Generic performance/statistics calculations.
- Input validation, migration, observability, and no-broker-write tests.
- Provider-independent import normalization patterns.

## Retirement sequence

1. Build and verify the mobile execution/import schema independently.
2. Extract any generic engine behind a neutral contract and parity fixture.
3. Move historical strategy documents and the desktop runtime to an archive.
4. Remove the legacy runtime from the mobile product repository only after its
   remaining reusable behavior is represented by tests or intentionally retired.

Git history remains the recovery path; legacy files are not a product roadmap.
