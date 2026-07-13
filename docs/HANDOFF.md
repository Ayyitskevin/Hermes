# Hermes Journal — active mobile handoff

Status: verified Slice D-A Plan Check Linux milestone · updated 2026-07-13

## Current handoff

task: Deliver the first governed Slice D insight: an offline, evidence-linked
plan-adherence report derived from current trade projections and current saved
review heads, without trade execution, advice, schema changes, or a new archive
shape.

stage: codex

lane: fleet-handoff

produced:

- `mobile/src/core/plan-adherence-report.ts` defines
  `plan-adherence-report-v1`, with mutually exclusive followed/broken cohorts,
  explicit exclusion precedence and conservation, fixed group/evidence order,
  exact signed-decimal cash means, compatible-R coverage, win semantics, and a
  three-trades-per-group observational threshold.
- Formula checksum
  `0f092c3bdd6c5051e97f5be0f1c7758a01e3159875adf660b1b0ea00f970ae85`
  pins group order, positive-only wins, 12-decimal half-away rounding, the
  one-final-division followed-minus-broken comparison, derived-only migration,
  and accepted `result-r-v1` evidence. R is accepted only when its metric
  contract, workspace currency, numerator, stored initial-risk denominator,
  nonpartial state, and a fresh deterministic replay all agree; incompatible R
  remains unavailable without removing the trade from cash results.
- `mobile/src/ui/reports-view.ts` separates the Reports screen from the app
  monolith and adds Plan Check to Reports and Dashboard. It discloses account,
  currency, time zone, period, cohort, exclusions, checksum, comparison
  direction, rounding, threshold, and non-causal limitations, then links each
  contributor to escaped current rule evidence.
- Evidence starts at 25 rows per group and appends at most 25 per explicit user
  action. The live showing count, 48-point control, completion focus, long-rule
  wrapping, and 320px/200% text behavior are covered.
- `mobile/src/application/workspace-snapshot.test.ts` proves a later current
  review head moves a stable trade between report groups without changing
  executions. The fictional eight-trade demo now reconciles five followed and
  three broken trades so the ready state remains clearly demo-only.
- `README.md`, `docs/mobile/PRODUCT_BLUEPRINT.md`, and
  `docs/mobile/IOS_ROADMAP.md` document the delivered boundary, final checksum,
  derived restore compatibility, and remaining report/native work.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 32 files, 342 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; 26 Playwright journeys passed,
  including offline evidence drill-down and a 320px/200% hostile 500-character
  rule with no clipped Plan Check descendants.
- `cd mobile && npm run ios:sync` — exit 0; production build transformed 54
  modules and copied the bundle; Capacitor found only
  `@capacitor-community/sqlite@8.1.0`. CocoaPods and `xcodebuild` were
  unavailable and explicitly skipped.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` — exit 0 after
  sync; no tracked native or lock drift.
- `git diff --check` — exit 0.
- Independent read-only adversarial review found and verified fixes for R
  contract/checksum gaps, denominator replay, group/win semantics, comparison
  direction and rounding disclosure, and long-rule clipping. Its final
  conclusion was: no blockers remain.

assumptions:

- The report is a deterministic current-state projection, not a stored
  historical report snapshot. Existing current-schema archives retain all
  execution/review/risk inputs and the matching runtime recomputes it; no
  schema, migration, native bridge, or export envelope changed.
- Any current broken rule takes precedence over followed rules. Open/partial
  trades, missing exact realized P&L, incomplete reviews, and completed reviews
  without a followed/broken outcome are mutually exclusive exclusions.
- The comparison is descriptive only. Three trades per group is a product
  display floor, not statistical significance, causality, prediction, or
  investment advice. Hermes never asks the user to trade more to unlock it.
- `Hermes Journal` and `app.hermesjournal.mobile` remain provisional. No App
  Store upload, price, trademark decision, signing, or Connect commitment is
  approved.
- Linux Chromium and SQL.js evidence does not prove SQLCipher, Keychain,
  CocoaPods/Xcode, VoiceOver, physical-device lifecycle, or native Files
  restore behavior.

open:

- Progressive disclosure is bounded per action but intentionally retains
  earlier pages; a user can eventually render every contributor. The report is
  also recomputed once for markup and once for binding. Cache/virtualize only
  after measured large-journal evidence justifies the added complexity.
- Add a dedicated pre-export/post-restore Plan Check equality test; current
  compatibility is compositionally covered by exact archive input restoration
  plus deterministic current-runtime recomputation.
- Drawdown, streak, time/day, symbol, direction, setup/tag/mistake/emotion
  report families, account selection, filters, calendar drill-down, and daily
  notes remain open.
- HOLD native restore acceptance, Delete All Data, attachments, and release
  claims until the existing Mac/iPhone lifecycle, Files, encryption, Keychain,
  VoiceOver/Dynamic Type, interruption, low-storage, and near-limit-memory
  gates produce positive evidence.
- Do not start broker sync, hosted Connect, Android, recurring AI, or App Store
  submission in the next slice.

## Prior milestone — Slice C-B

task: Deliver local-only previewed restore for current `hermes-journal-export`
v1 files without merging data or adding Delete All Data, trade execution,
hosted sync, broker access, or a required server.

stage: codex

lane: fleet-handoff

produced:

- `mobile/src/application/journal-archive.ts` defines the app-owned
  `hermes-journal-export` v1 envelope, canonical semantic JSON, bounded and
  duplicate-aware parsing, deep immutable artifacts, empty attachment catalog,
  portable state/report digests, and an outer corruption checksum.
- `mobile/src/adapters/sqlite/journal-archive.ts` exports every app-owned
  schema-v3 table in one SQLite transaction. It pins all 32 tables and 257
  ordered columns, rejects supported-type additions, renames, generated/hidden
  columns, unsupported types, and migration provenance drift, and serializes
  SQLite integers as canonical decimal strings.
- Native portable state excludes migration application wall clocks and live SQL
  formatting while table-level diagnostics retain them. Raw import provenance,
  inactive/history facts, immutable review versions and heads, vocabulary,
  playbooks/rules, submissions, metric definitions, and stable trade subjects
  remain present.
- `mobile/src/adapters/session-journal-store.ts` emits a separate
  `browser-session-state` development payload containing the complete
  in-memory store. It is explicitly not native recovery evidence.
- `mobile/src/ui/user-data-export.ts` adds an accessibility-designed two-step
  local flow: prepare one snapshot, then invoke file-capable Web Share when
  supported or a browser download from a fresh user activation. Cancellation
  never falls through to download, and statuses say handed/requested rather
  than saved.
- Export is absent over the fictional demo and the application boundary refuses
  to export hidden local data while demo mode is visible.
- `mobile/src/application/journal-restore.ts` binds exact selected text to a
  recomputed preview revision. Application guards keep preview/commit out of
  demo mode and retry one uncertain commit before reporting unknown status.
- `mobile/src/adapters/sqlite/journal-restore.ts` accepts only
  `sqlite-table-set` v1 from the current migration set. It verifies the outer
  checksum, all 32 tables and 257 pinned ordered columns, canonical rows and
  signed 64-bit integers, table/state digests, and a recomputed summary.
  Archive SQL is never executed; live table-SQL hashes remain diagnostic.
- Native preview trial-restores into the real destination transaction, checks
  portable table equality, report and summary equality, foreign keys, and
  `quick_check`, then deliberately rolls back. Commit reparses and rederives
  the archive, atomically rechecks that the journal is empty, restores and
  verifies inside the transaction, then verifies the committed state again.
  An exact already-restored table set returns an idempotent retry result;
  different nonempty state is never merged or overwritten.
- The browser development store accepts only `browser-session-state` v1, builds
  a separately verified candidate, swaps it atomically only into an empty
  session, and reconciles an exact already-restored retry. Browser evidence is
  not native recovery evidence.
- `mobile/src/ui/user-data-restore.ts` adds a local-only empty-journal preview →
  confirmation → restore flow. Demo exposes no control; nonempty journals show
  no chooser/action. The UI rejects `File.size` above 64 MiB before `text()`;
  the parser independently enforces 67,108,864 UTF-8 bytes.
- README and mobile product, roadmap, ledger, and Mac handoff documents now
  describe Slice C-B current-schema restore, matching-runtime compatibility,
  idempotent exact retry, and the remaining native/attachment/delete holds
  without calling the current archive a complete native backup.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed; 165 packages
  audited; 0 vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests
  passed.
- `cd mobile && npm test` — exit 0; 30 files, 320 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; 24 Playwright journeys
  passed, including offline export → fresh-session restore → digest-equivalent
  re-export, demo isolation, and 320px/200% text coverage.
- `cd mobile && npm run ios:sync` — exit 0; production build transformed
  52 modules and copied the bundle; Capacitor found only
  `@capacitor-community/sqlite@8.1.0`. CocoaPods and `xcodebuild` were
  unavailable and explicitly skipped.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` — exit
  0 after sync; no tracked native or lock drift.
- `git diff --check` — exit 0.
- Independent read-only code audit found one incomplete browser receipt-replay
  index invariant; the fix now rejects self-consistent tampering and its
  focused test passed 6/6. The final spot-check cleared that finding.
  Documentation audit findings were reconciled; no other blocking findings.

assumptions:

- `Hermes Journal` and `app.hermesjournal.mobile` remain provisional. No App
  Store record, build upload, price, trademark decision, financial disclosure,
  signing, or Connect commitment is approved.
- The export is plaintext. Its SHA-256 fields detect accidental corruption but
  are unkeyed and can be recomputed by anyone who edits the file.
- The supported launch scope remains adult phone-first stock/ETF journaling.
  Generic CSV still records rows as stock until an explicit asset-class
  contract and fixtures exist.
- Linux SQL.js and Chromium evidence do not prove SQLCipher, Keychain,
  CocoaPods, Xcode, physical-device lifecycle, Files/share-sheet behavior,
  backup, signing, TestFlight, or App Store behavior.
- Restore compatibility is deliberately current-schema and runtime-specific:
  native accepts only `sqlite-table-set` v1; browser development accepts only
  `browser-session-state` v1.
- Attachment catalog v1 is empty. Archives containing attachments are rejected.

open:

- HOLD native restore acceptance. Prove Files selection/reopen, airplane-mode
  preview and commit, interruption/response-loss retry, force quit/relaunch,
  low storage, near-limit memory, custom MIME behavior, VoiceOver/Dynamic Type,
  SQLCipher/Keychain, backup/reinstall, and physical-device lifecycle.
- HOLD Delete All Data until native restore acceptance is positive; then define
  database, Keychain, attachment, interruption, response-loss, and a
  verification-receipt contract.
- Attachment round-trip, native handling of archives near 64 MiB, and any
  streaming/temp-file design remain open. Current archives with attachments
  fail closed.
- Add DOM-level interaction coverage for file change/cancel during a pending
  preview and uncertain-commit same-command retry. Store/application behavior
  is covered and the implementation audit found no defect; this remains UI
  evidence debt.
- Do not start broker sync, hosted Connect, Android, recurring AI, or App Store
  submission in the next slice.

## Legacy history

The Python/FastAPI cockpit and strategy-operation documents remain frozen,
explicitly labeled historical reference. They do not define the active product,
stack, launch audience, or completion state.
