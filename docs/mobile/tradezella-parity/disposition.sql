-- Source: capability-ledger.json (schema_version 1, as_of 2026-07-18).
-- These are exact roadmap-disposition counts, not feature-coverage percentages.
-- This portable constant snapshot is rederived and fail-closed against the
-- declared ledger by build-report.mjs before report delivery.
WITH ledger_counts(disposition, count) AS (
  VALUES
    ('shipped', 6),
    ('prioritize-local', 6),
    ('gated-funded', 6),
    ('intentional-non-goal', 2)
)
SELECT disposition, count
FROM ledger_counts
ORDER BY CASE disposition
  WHEN 'shipped' THEN 1
  WHEN 'prioritize-local' THEN 2
  WHEN 'gated-funded' THEN 3
  WHEN 'intentional-non-goal' THEN 4
  ELSE 5
END;
