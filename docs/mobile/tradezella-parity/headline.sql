-- Source: capability-ledger.json (schema_version 1, as_of 2026-07-18).
-- These are exact roadmap-domain counts, not feature-coverage percentages.
-- This portable constant snapshot is rederived and fail-closed against the
-- declared ledger by build-report.mjs before report delivery.
WITH ledger_summary(domains, shipped, local_priorities, gated_or_excluded) AS (
  VALUES (20, 6, 6, 8)
)
SELECT domains, shipped, local_priorities, gated_or_excluded
FROM ledger_summary;
