-- Source: capability-ledger.json (schema_version 1, as_of 2026-07-17).
-- These are exact roadmap-domain counts, not feature-coverage percentages.
WITH ledger_summary(domains, shipped, local_priorities, gated_or_excluded) AS (
  VALUES (20, 6, 6, 8)
)
SELECT domains, shipped, local_priorities, gated_or_excluded
FROM ledger_summary;
