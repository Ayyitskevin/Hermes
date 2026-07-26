-- Source: capability-ledger.json (schema_version 1, as_of 2026-07-25).
-- Sequence is a product recommendation, not measured impact or adoption.
-- build-report.mjs proves that row count and sequence match the prioritize-local
-- ledger count; recommendation text remains an explicitly reviewed decision.
WITH priority_roadmap(sequence, capability, first_increment, decision_gate, success_metric) AS (
  VALUES
    (1, 'Guided activation and account overview',
      'Moderate the shipped manual and generic-CSV paths as separate first-use cohorts through exact stable-ID continuation; CSV participants must reconcile the immutable receipt before linked review.',
      'No identity inference, account mutation, financial aggregation, or advisory onboarding copy.',
      'In separate five-participant cohorts, at least four manual participants reach linked review through exact account scope and four CSV participants reach it from the reconciled canonical-scope-ordered receipt guide, without correction.'),
    (2, 'Reusable filters and saved views',
      'Specify and ship device-local view presets only after protected preference ownership, reset, stale-value, lifecycle, and archive/export-exclusion rules are pinned.',
      'No plaintext WebView localStorage downgrade; a saved scope cannot silently change governed report membership.',
      'A preset restores exact account, date, search, and facet state after relaunch and fails closed on stale values.'),
    (3, 'Named broker CSV parser packs',
      'Implement the first parser only after an anonymized real-format fixture and timezone, fee, identity, and asset semantics exist.',
      'No guessed format, credential storage, silent fallback, or broader asset claim.',
      'Golden files reconcile every row; repeat imports are idempotent and changed payloads fail visibly.'),
    (4, 'User-authored reflection templates',
      'Build explicit preview and application for user-authored reflection templates on the shipped stable-ID, immutable-version Local Playbook Library; fuller vocabulary remains separate.',
      'No auto-classification, evidence overwrite, guessed legacy promotion, or causal implication.',
      'Create, edit, preview, explicitly apply, export, and restore reproduce exact ordered template content while ad hoc reviews remain unlinked and unchanged.'),
    (5, 'Deeper observational reports',
      'Use the shipped count-only Symbol Breakdown and Account Review Coverage foundations; define each later timing, drawdown, or financial-comparison family separately.',
      'Every report needs a version, checksum, conservation, exclusions, restore equality, and exact drill-down.',
      'Each published report reproduces from the current ledger and accounts for every eligible or excluded record.'),
    (6, 'Native data lifecycle and attachments',
      'Complete Mac and iPhone acceptance before attachments, native restore claims, or approved Delete All Data.',
      'Human approval for destructive deletion; device evidence for SQLCipher, Keychain, Files, photos, interruption, and accessibility.',
      'Export, empty-device restore, continued write, re-export, attachment lifecycle, and approved deletion reconcile exact device state.')
)
SELECT sequence, capability, first_increment, decision_gate, success_metric
FROM priority_roadmap
ORDER BY sequence;
