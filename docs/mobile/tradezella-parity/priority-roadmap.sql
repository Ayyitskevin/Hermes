-- Source: capability-ledger.json (schema_version 1, as_of 2026-07-17).
-- Sequence is a product recommendation, not measured impact or adoption.
WITH priority_roadmap(sequence, capability, first_increment, decision_gate, success_metric) AS (
  VALUES
    (1, 'Guided activation and account overview',
      'Add a read-only account overview with exact deep links into the existing Trade Browser scope.',
      'No account mutation, financial aggregation, or advisory onboarding copy.',
      'At least four of five moderated first-use participants reach one trusted review without correction.'),
    (2, 'Reusable filters and saved views',
      'Specify and ship device-local view presets after ownership, reset, stale-value, and export-exclusion rules are pinned.',
      'A saved scope cannot silently change governed report membership.',
      'A preset restores exact account, date, search, and facet state after relaunch and fails closed on stale values.'),
    (3, 'Named broker CSV parser packs',
      'Implement the first parser only after an anonymized real-format fixture and timezone, fee, identity, and asset semantics exist.',
      'No guessed format, credential storage, silent fallback, or broader asset claim.',
      'Golden files reconcile every row; repeat imports are idempotent and changed payloads fail visibly.'),
    (4, 'Playbook and template management',
      'Add standalone local CRUD for reusable playbooks, ordered rules, and user-authored reflection templates.',
      'Templates never auto-classify, overwrite evidence, or imply causality.',
      'Create, edit, apply, export, and restore reproduce exact ordered content and explicit application evidence.'),
    (5, 'Deeper observational reports',
      'Resolve Symbol Breakdown eligibility first; define each later timing, drawdown, or comparison family separately.',
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
