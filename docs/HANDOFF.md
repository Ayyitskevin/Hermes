# Hermes Journal — active mobile handoff

Status: Account Review Coverage v1 locally verified · direct-main publication
and exact-head hosted CI pending · updated 2026-07-19

## Current handoff

task: Add one checksum-pinned, count-only Account Review Coverage report that
conserves every current trade across each retained account and routes only exact
nonzero closed-review cohorts into the existing ephemeral Trade Browser.

stage: codex

lane: fleet-handoff

produced:

- Implemented Account Review Coverage v1 as the thirty-eighth bounded Slice D
  increment and thirty-second derived-only presentation/reporting/navigation
  increment. Reports now exposes 12 semantic targets and ten governed reports;
  the six write-capable product exceptions remain fixed.
- Pinned `account-review-coverage-report-v1` to SHA-256
  `a4c1021010d1c854db7b10d05475ef4cbe696c4a09e20d8c9e8f83fc711d308a`.
  Every retained stable account appears once, including zero-trade accounts, in
  label-code-unit then stable-ID order. Duplicate labels stay distinct by
  retained position.
- Conserved each unique current trade exactly once as draft, pending/not
  started, completed, or open. Open position state overrides review state;
  waiting reconciles as draft plus pending while draft and completed reconcile
  independently with canonical review progress. Invalid identity, ordering,
  count, review-head, or conservation evidence fails closed.
- Added a separate account/state/count cohort binder. Each positive draft,
  pending, or completed closed cohort starts from `EMPTY_TRADE_BROWSER_STATE`,
  applies exact account ID plus closed-position and review-state facets,
  rederives current report membership, validates the rendered destination and
  focused filter summary, and restores the prior exact tab/browser state when
  any check fails. No action opens an individual review automatically.
- Added unit, restore-equality, report-navigation, and production-Chromium
  coverage for checksum/immutability, retained and duplicate-label accounts,
  zero-trade accounts, four-state conservation, open-state precedence, exact
  routing, conflicting-filter clearing, storage/network neutrality, source and
  destination tampering, rollback, focus, keyboard activation, and 320/421px at
  200% text.
- Updated README, Product Blueprint, iOS Roadmap, Local Ledger, Mac handoff, and
  the generated TradeZella parity artifact through its JSON/SQL build inputs.
  Account Review Coverage is count-only and has no per-trade **Open trade**
  action, so the shared non-Symbol per-trade continuation contract remains
  eight sources. Account CRUD, broker identity, and financial/performance
  account comparisons remain open.
- No schema, migration, store command, archive/digest/export/restore shape,
  preference, dependency, native source, file/network/security path, financial
  formula, order, advice, or brokerage-execution path changed.

verified:

- `cd mobile && npm ci` — 164 packages installed; zero vulnerabilities.
  `npm run typecheck` — exit 0. `npm run test:boundary` — 2/2. `npm test` —
  866/866 across 76 files. `npm run test:bundle` — 6/6. `npm run
  test:ios-sync` — 8/8. `npm audit --omit=dev` — zero production
  vulnerabilities.
- `cd mobile && npm run test:e2e` — 141/141 production-Chromium journeys,
  including all eight Account Review Coverage journeys and every prior Hermes
  browser flow.
- `cd mobile && npm run ios:sync` — 103 modules transformed, five JavaScript
  chunks, and only the pinned SQLite plugin registered; CocoaPods and
  xcodebuild were explicitly skipped on Linux. `npm run verify:bundle` —
  largest `assets/app-BRg7gWO4.js` at 431,287/500,000 bytes. `npm run
  verify:ios-sync` — nine production files copied byte-for-byte at SHA-256
  `482b2143a794cd9e8b924686655a88ef46dc82074d2d622a17380cbefbb13260`;
  generated identity, SQLite registration, native drift, and lock drift passed.
- `cd docs/mobile/tradezella-parity && node build-report.mjs artifact.json
  report.html` — 20 domains validated; 6/6/6/2 dispositions, six priority rows,
  three SQL sources, and semantic fallback 1425/1425 desktop and 375/375 mobile.
- `git diff --check`, checksum/source/scope scans, generated-file review, and
  native/lock drift checks passed. Initial independent audits identified
  delegated-source and post-focus destination-validation gaps; both were
  hardened, and the eight adversarial Account journeys plus the full browser
  suite passed. Both follow-up independent re-audits returned no P0–P2
  findings. Exact-head hosted CI is the remaining publication gate.
- The legacy Python/Ruff suite was not rerun because this slice changes no
  legacy Python source or dependency. CocoaPods, Xcode, Simulator, device,
  SQLCipher, Keychain, native VoiceOver, and native Dynamic Type are NOT RUN on
  Linux.

assumptions:

- The current full-workspace projection, retained account options, and
  canonical review-progress totals remain authoritative. This derived report
  neither stores a snapshot nor consumes the user's current Trade Browser
  scope.
- Account display labels are presentation only; stable account IDs are route
  identity. Exact cohort navigation is local and ephemeral, not a brokerage
  account connection or performance comparison.
- Chromium validates the production web artifact and browser accessibility
  boundary. Linux bundle/config/copy evidence does not prove WKWebView, native
  focus order, SQLCipher, Keychain, lifecycle, or device behavior.

open:

- Publish the verified slice directly to `main`, require exact-head hosted CI,
  then replace this pending status with the implementation SHA and CI run
  evidence.
- HOLD native acceptance until CocoaPods, Xcode, Simulator, physical iPhone,
  SQLCipher/Keychain, lifecycle, VoiceOver, Dynamic Type, safe-area, hardware-
  keyboard, Files/WKWebView, and multi-scene evidence are recorded on the
  reviewed Mac/device.
- Fleet input/output guard evidence and Sonnet Stage 2 sign-off remain open.
- The broader paired trading-and-journal product remains active. Account CRUD,
  broker identity, financial account comparison, brokerage connection, funded
  execution, and human-cohort validation remain separate, human-gated scopes.

## Prior milestone — Review-Clear Plan Check Continuation v1

Status: Review-Clear Plan Check Continuation v1 shipped on main · implementation
commit 3de0dcf · exact-head hosted CI passed · updated 2026-07-19

task: Add one fail-closed, explicit continuation from a completed local review
queue to the existing full-journal Plan Check without auto-routing after save or
changing durable journal/report state.

stage: codex

lane: fleet-handoff

produced:

- Implemented Review-Clear Plan Check Continuation v1 as the thirty-seventh
  bounded Slice D increment and thirty-first derived-only presentation/
  navigation increment.
- A coherent private Dashboard or Journal with zero canonical waiting reviews
  and at least one completed reviewed closed trade now exposes one explicit
  **Open plan check** action. Demo, empty, waiting, open-only zero-completed,
  and other zero-completed states retain their prior controls and copy.
- The final review save still redraws and focuses **Review queue clear**. Only a
  later user activation rederives the fail-closed queue, verifies the captured
  origin/count and exact bound control topology, and opens the fixed
  full-workspace `plan-check-title`; no save auto-routes.
- The destination must be one exact fresh render of the same snapshot-derived
  Plan Check, including governed metadata, evidence, canonical Reports index,
  and neighbors. It is verified again after focus; moved, cloned, duplicated,
  replaced, hidden, clipped, stale, or focus-time-changing origin/destination
  evidence returns to the exact source with one focused generic error.
- Every local startup/replayed-onboarding recovery scan suppresses both origins
  before the first eligible render, independent of onboarding state. A no-result
  scan releases the current Dashboard or Journal only after it resolves;
  confirmed import/manual-save recovery remains suppressed until the committed
  snapshot is reconciled. Previous bindings are aborted and displaced app-owned
  origin/destination artifacts are removed before redraw.
- Added application/view tests and eight production-Chromium journeys covering
  both origins, pointer/Enter/Space, 320/421px at 200% text, touch-size and
  unobscured focus, offline use, unchanged archive state/report digests and
  payload data, storage/network neutrality, demo/empty/waiting/open-only gates,
  confirmed-commit suppression and release, mutation-observed startup/no-result
  scans, origin topology/visibility/identity/attribute tampering, destination
  removal/change/clipping/same-stack movement, rollback, cleanup, and retry.
- Updated README, Product Blueprint, iOS Roadmap, Local Ledger, and Mac handoff
  evidence. No schema, migration, store command, review write, preference,
  cursor, archive/digest/export/restore shape, report definition, financial
  formula, dependency, native project, file, network, security, advice, order,
  or brokerage-execution path changed; the six write-capable exceptions remain
  fixed.

verified:

- `cd mobile && npm ci` — 164 packages installed; zero vulnerabilities.
  `npm run typecheck` — exit 0. `npm run test:boundary` — 2/2. `npm test` —
  847/847 across 73 files. `npm run test:bundle` — 6/6. `npm run
  test:ios-sync` — 8/8. `npm audit --omit=dev` — zero production
  vulnerabilities.
- `cd mobile && npm run test:e2e` — 133/133 production-Chromium journeys,
  including all eight Review-Clear Plan Check journeys and every prior Hermes
  browser flow. The final assertion-hardened continuation file also passed 8/8
  in isolation.
- `/tmp/hermes-review-clear-plan-check-venv-20260719/bin/ruff check .` — all
  checks passed. The same isolated environment's `pytest -q` — 228/228 with
  one third-party deprecation warning.
- `cd mobile && npm run ios:sync` — 100 modules transformed, five JavaScript
  chunks, and only the pinned SQLite plugin registered; CocoaPods and
  xcodebuild were explicitly skipped on Linux. `npm run verify:bundle` —
  largest `assets/app-gIOxQein.js` at 409,482/500,000 bytes. `npm run
  verify:ios-sync` — nine production files copied byte-for-byte at SHA-256
  `da5a5c9186726f9145b05e3b53130adc6de75efd8fb9c42f00b4ce40cf0f9f0a`;
  generated identity, SQLite registration, native drift, and lock drift passed.
- `git diff --check`, explicit source/scope scans, generated-file review, and
  native/lock drift checks passed. Independent architecture, implementation,
  test, product, and documentation audits found no remaining P0-P2 issue after
  startup-scan, canonical-destination, and assertion hardening.
- `gh run view 29702833626 --json status,conclusion,headSha,jobs` — exact SHA
  3de0dcf9994dedaae29d2d3582a5bed6df4b2af5, conclusion success; Mobile Linux
  job 88234705961 and Legacy Python job 88234705970 both succeeded, including
  the full browser smoke, no-order boundary, iOS handoff, bundle, and dependency
  gates.

assumptions:

- The current local snapshot and in-session recovery state remain authoritative.
  An unresolved local manual-recovery scan is deliberately fail-closed, but this
  slice does not claim that transient continuation guidance persists across
  relaunch.
- Review Queue remains the sole eligibility owner, and the existing governed
  Plan Check render remains the destination source of truth. The continuation
  neither ranks reports nor records that an insight was viewed.
- Chromium validates the production web artifact and browser accessibility
  boundary. Linux bundle/config/copy evidence does not prove WKWebView, native
  focus order, SQLCipher, Keychain, or device behavior.

open:

- HOLD native acceptance until CocoaPods, Xcode, Simulator, physical iPhone,
  SQLCipher/Keychain, lifecycle, VoiceOver, Dynamic Type, safe-area, hardware-
  keyboard, Files/WKWebView, and multi-scene evidence are recorded on the
  reviewed Mac/device.
- Fleet input/output guard evidence and Sonnet Stage 2 sign-off remain open.
- The broader paired trading-and-journal product remains active. Brokerage
  connection, funded execution, and human-cohort validation remain separate,
  human-gated scopes.

## Prior milestone — Dashboard Import Continuation v1

Status: Dashboard Import Continuation v1 shipped on main · implementation
commit 53c17f6 · exact-head hosted CI passed · updated 2026-07-19

task: Add one fail-closed, offline continuation from a nonempty local Dashboard
to the existing generic stock CSV importer, while preserving confirmed import
recovery over stale workspace state.

stage: codex

lane: fleet-handoff

produced:

- Published 53c17f6b51e9c24e7e5e72799953df2bca72c8d8 directly to GitHub
  main as Dashboard Import Continuation v1, the 36th bounded Slice D increment
  and 30th derived-only presentation/navigation increment.
- A nonempty local Dashboard now renders one secondary **Import latest
  session** action immediately after the canonical review-progress card. Empty
  Dashboard retains its inline importer, and demo exposes no import action.
- Normal-import activation validates the exact current Dashboard heading,
  optional confirmed manual-save recovery, account overview, net result, review
  progress, continuation card, and original action. Replaced, cloned, moved, or
  duplicated attempted actions fail with the existing focused, privacy-safe
  error. Confirmed-recovery activation instead validates its exact recovery
  card and stable receipt identity before opening recovery-only More.
- The normal action opens the existing More screen and requires the exact heading,
  optional manual recovery, manual-capture card, generic importer, bound form,
  account/time-zone/currency/file controls, Preview action, status, and preview
  container. Missing, cloned, moved, duplicated, hidden, disabled, or
  unfocusable destination evidence fails before a picker, file read, preview,
  preparation, commit, persistence, or network request.
- A confirmed CSV commit whose receipt continuation cannot redraw takes
  precedence over stale snapshot provenance, including stale empty state.
  Dashboard and More become recovery-only: manual/CSV capture, stale receipt
  cards/history, receipt review/rollback, restore, and sizing are withheld. The
  exact receipt retry plus read-only export remains; an independent confirmed
  manual-save retry may coexist in its own exact position.
- Repeated activation is guarded, previous render bindings are aborted, and
  displaced app-owned import, recovery, history, restore, sizing, and export
  artifacts are removed before Dashboard rebuilds.
- Added production unit and Chromium coverage for local/empty/demo gating,
  320/421px at 200% text, keyboard/pointer routing, actual browser offline mode,
  unchanged local storage, zero external requests and file reads, origin and
  destination tampering, focus ownership, confirmed recovery, and cross-flow
  manual-save recovery composition.
- Updated README, Product Blueprint, iOS Roadmap, Local Ledger, and Mac handoff
  evidence. No schema, migration, parser, store command, archive/digest/export
  shape, report, formula, preference, dependency, native project, network,
  security, money, order, or brokerage-execution path changed; the six
  write-capable exceptions remain fixed.

verified:

- `cd mobile && npm ci` — 164 packages installed; zero vulnerabilities.
  `npm run typecheck` — exit 0. `npm run test:boundary` — 2/2. `npm test` —
  836/836 across 71 files. `npm run test:bundle` — 6/6. `npm run
  test:ios-sync` — 8/8. `npm audit --omit=dev` — zero production
  vulnerabilities.
- `cd mobile && npm run test:e2e` — 125/125 production-Chromium journeys,
  including all three Dashboard Import Continuation journeys and every prior
  Hermes browser flow.
- `cd mobile && npm run ios:sync` — 98 modules transformed, five JavaScript
  chunks, and only the pinned SQLite plugin registered; CocoaPods and
  xcodebuild were explicitly skipped on Linux. `npm run verify:bundle` —
  largest `assets/app-CFjPcuq0.js` at 396,133/500,000 bytes. `npm run
  verify:ios-sync` — nine production files copied byte-for-byte at SHA-256
  `29e47bb3399c4b4e47388cb3fc3bb644e066b5574053715edc41ffb65b479eb1`;
  generated identity, SQLite registration, native drift, and lock drift passed.
- `git diff --check`, explicit staged-scope checks, and artifact scans passed.
  Independent architecture, product/phone UX, scope, documentation, and final-
  publication audits found no blocker after recovery suppression and claim-
  precision fixes.
- `gh run view 29699228616 --json status,conclusion,headSha,jobs` — exact SHA
  53c17f6b51e9c24e7e5e72799953df2bca72c8d8, conclusion success; Mobile Linux
  job 88225300901 and Legacy Python job 88225300880 both succeeded, including
  the full browser smoke, no-order boundary, iOS handoff, bundle, and dependency
  gates.

assumptions:

- The current local snapshot and in-session confirmed-commit recovery context
  remain authoritative. Recovery deliberately outranks stale provenance, but
  this slice does not claim that its transient guidance survives relaunch.
- The generic importer remains stock-only and user-initiated. This continuation
  is synchronous local navigation into the existing preview-first tool; it does
  not select or read a file, connect a broker, place an order, or provide
  advice.
- Exact DOM topology is a fail-closed presentation boundary, not authorization
  for persistence. Chromium validates the production web artifact; Linux copy
  evidence does not prove WKWebView or native accessibility behavior.

open:

- HOLD native acceptance until CocoaPods, Xcode, Simulator, physical iPhone,
  Files/WKWebView routing, SQLCipher receipt recovery, Keychain, lifecycle,
  VoiceOver, Dynamic Type, safe-area, hardware-keyboard, and multi-scene
  evidence are recorded on the reviewed Mac/device.
- Confirmed-recovery reflow is covered at 421px/200%; the generic invalid-route
  alert does not have a separate scaled chrome-geometry assertion. These are
  browser evidence gaps, not native passes.
- Fleet input/output guard evidence and Sonnet Stage 2 sign-off remain open.
- The broader paired trading-and-journal product remains active. Brokerage
  connection, funded execution, and human-cohort validation remain separate,
  human-gated scopes.

## Prior milestone — Report Trade Continuation integrity

task: Harden every governed report-to-trade continuation so only the exact
captured source/group/list/row/action identity from current report output can
open the existing review sheet, including progressively revealed evidence.

stage: codex

lane: fleet-handoff

produced:

- Published dc56cf5ee45cb102eb3779f1ba31f443228966f0 directly to GitHub main.
- Added `mobile/src/ui/report-review-action-integrity.ts` for the eight
  non-Symbol sources: Review Session Coverage, Direction Mix, Opening Weekday
  Mix, Plan Check, Mistake Patterns, Emotion Patterns, Tag Patterns, and Setup
  Breakdown. Each controlled render captures the original section, group,
  evidence list, row, action, ordinal, stable subject, and source-specific
  governed identity.
- Activation rebuilds the current report and requires the exact captured tuple
  and DOM placement. Alternate valid current IDs or sources, changed
  classification/direction/weekday/session date or exact pattern label, moved
  rows, replaced actions, stripped origins, and duplicate action cardinality
  fail with the existing focused error before dialog insertion, inert state, or
  persistence.
- Progressive registration is operation-bound. A previously captured app-owned
  control may add only the exact next bounded page: up to 25 contributors in
  its one group, or up to five groups with their initial contributor pages.
  Injected suffixes, no-op/cross-control laundering, detached or replaced
  controls, prefix replacement, unrelated row changes, and nonconserving
  section actions cannot register themselves. Activation is validate-only.
- Kept Symbol Breakdown's separately hardened group/row/action validator and
  routed it through the tightened shared dispatcher without changing its
  contract. Generic non-report trade actions remain valid.
- Expanded production-Chromium coverage across all eight non-Symbol sources,
  the exact 26th evidence row, an exact appended Tag group, copied group/row
  suffixes, replaced controls, duplicate actions, semantic/index/date/label
  tampering, row movement, source stripping, and alternate valid identities.
- Updated README, Product Blueprint, iOS Roadmap, Local Ledger, and Mac handoff
  evidence. This is integrity hardening, not another Slice D increment.
- No report builder, version, checksum, cohort, eligibility rule, formula,
  evidence order, progressive limit, schema, migration, store, archive/export,
  digest, dependency, native project, preference, network, money, security,
  order, or brokerage-execution path changed.

verified:

- `cd mobile && npm ci` — 164 packages installed; zero vulnerabilities.
  `npm run typecheck` — exit 0. `npm run test:boundary` — 2/2. `npm test` —
  832/832 across 70 files. `npm run test:bundle` — 6/6. `npm run
  test:ios-sync` — 8/8. `npm audit --omit=dev` — zero production
  vulnerabilities.
- `cd mobile && npm run test:e2e` — 122/122 production-Chromium journeys.
  Combined Reports plus specialized Symbol regression — 24/24. The focused
  adversarial group-pagination case — 1/1.
- `cd mobile && npm run ios:sync` — 97 modules transformed and only the pinned
  SQLite plugin registered; CocoaPods and xcodebuild were explicitly skipped
  on Linux. `npm run verify:bundle` — five JavaScript chunks, largest
  `assets/app-CyvYEQmN.js` at 383,357/500,000 bytes. `npm run
  verify:ios-sync` — nine production files copied byte-for-byte at SHA-256
  `771e5444bb91edd1e8e47609477b89cd60e822a34908b34a97e99e0490c5f10f`;
  generated identity, SQLite registration, native drift, and lock drift passed.
- `git diff --check` and explicit staged-scope checks passed. Independent
  architecture, product/release, and phone UX/accessibility audits found no
  blocker after operation-bound paging and documentation precision fixes.
- `gh run view 29696737079 --json status,conclusion,headSha,jobs` — exact SHA
  dc56cf5ee45cb102eb3779f1ba31f443228966f0, conclusion success; Mobile Linux
  job 88218680275 and Legacy Python job 88218680286 both succeeded, including
  the browser smoke, no-order boundary, iOS handoff, bundle, and dependency
  gates.

assumptions:

- Governed builders and the controlled report render remain the source of
  truth. DOM identity is captured only at that render or after an exact
  app-owned page delta; later arbitrary DOM content is untrusted.
- The integrity state machine is exercised at its production-DOM boundary in
  Chromium. Linux bundle/config evidence does not prove WKWebView or native
  accessibility behavior.
- Report continuation remains local journal navigation into an existing review
  command. It is not broker integration, order execution, advice, or a durable
  report state.

open:

- HOLD native acceptance until CocoaPods, Xcode, Simulator, physical iPhone,
  WKWebView exact-action and progressive-paging behavior, SQLCipher, Keychain,
  lifecycle, VoiceOver, Dynamic Type, and hardware-keyboard evidence are
  recorded on the reviewed Mac/device.
- The focused invalid-action alert has not separately been measured at
  320/421px with 200% text; valid actions and sheets pass those Chromium
  widths, and invalid actions already use the existing pre-inert focused alert.
- Fleet input/output guard evidence and Sonnet Stage 2 sign-off remain open.
- The broader paired trading-and-journal product remains active. This hardening
  adds no brokerage connection or funded trade-execution path.

## Prior milestone — Quick Review Continuation v1

task: Add a fast, local-first continuation from the canonical Review Queue into
the existing exact trade-review flow so a young mobile trader can clear drafts
and pending reviews without hunting through the journal.

stage: codex

lane: fleet-handoff

produced:

- Published 78b001c09fc8bad2276a8d1dc9a78024a9fb6a9a
  (Quick Review continuation) directly to GitHub main.
- Review now shows a compact Review now card immediately below the canonical
  queue heading. It selects Drafts before Pending and opens the exact first
  queue trade in the existing compact review sheet; demo and empty queues do
  not render a launcher.
- The compact sheet keeps outcome and execution evidence closed, prioritizes
  setup, emotion, mistakes, playbook, rules, and reflection, and exposes tags,
  risk, currency, and stop under More context. Up to six saved setup/emotion
  chips are case-insensitively deduplicated while free-form input remains.
- Save draft & pause returns focus to Review now. Mark reviewed & next refreshes
  the canonical queue and opens the exact next validated trade; the final trade
  returns focus to the queue-clear state. A blocked/no-op continuation surfaces
  a visible error instead of silently advancing.
- The launcher fails closed unless its queue/card/heading/action structure,
  position, unique exact subject, enabled state, and internal containment all
  validate. Post-click continuation also requires exactly one matching quick
  review sheet.
- Reused the immutable existing trade-review command and all exact-head,
  stale-head, and known-commit recovery behavior. No schema, migration, store,
  archive/export, report formula, preference, dependency, native-project,
  network, money, security, or order path changed.
- Updated product, roadmap, ledger, Mac handoff, and README evidence. This is
  the 35th Slice D increment; 29 are derived-only and this is the sixth
  write-capable product exception.

verified:

- cd mobile && npm ci — 164 packages installed; zero vulnerabilities.
- cd mobile && npm run typecheck — exit 0. npm test — 832/832 across 70 files.
  npm run test:boundary — 2/2. npm run test:bundle — 6/6.
  npm run test:ios-sync — 8/8. npm audit --omit=dev — zero production
  vulnerabilities.
- cd mobile && npx playwright test --workers=1 — 120/120 production Chromium
  journeys. Focused Quick Review continuation coverage — 4/4. Focused UI unit
  coverage — 25/25.
- cd mobile && npm run ios:copy — exit 0; 96 modules and five JavaScript chunks
  copied into the iOS shell. npm run verify:bundle — largest chunk
  assets/app-DcBvaM_K.js at 366,804/500,000 bytes.
- cd mobile && npm run verify:ios-sync — nine production bundle files copied
  byte-for-byte; SHA-256
  b5529923340be19fd5b03fb11005c37e1bd580d966b80ad9fa36bea523d6262f;
  generated identity, SQLite registration, native drift, and lock drift passed.
- git diff --check and artifact scans — exit 0. Independent read-only reviews
  found no remaining blocker after exact-placement and post-click hardening.
- gh run view 29693513626 --json status,conclusion,headSha,jobs — exact SHA
  78b001c09fc8bad2276a8d1dc9a78024a9fb6a9a, conclusion success; Mobile Linux
  job 88210245108 and Legacy Python job 88210245095 both succeeded, including
  the full browser smoke, iOS handoff, bundle, boundary, and dependency gates.

assumptions:

- The canonical local Review Queue remains the source of truth for next-trade
  ordering: Drafts before Pending, preserving each section's existing order.
- A compact continuation is a presentation of the existing review command, not
  a new workflow or persistence contract.
- Linux/Chromium evidence validates the web bundle and copied iOS artifact;
  WKWebView and device behavior remain native acceptance work.

open:

- HOLD native acceptance until CocoaPods, Xcode, Simulator, physical iPhone,
  WKWebView continuation, SQLCipher, Keychain, lifecycle, VoiceOver, Dynamic
  Type, and hardware-keyboard evidence are recorded on the reviewed Mac/device.
- Fleet input/output guard evidence and Sonnet Stage 2 sign-off remain open.
- The broader paired trading-and-journal product remains active; this milestone
  ships the journal continuation only and adds no brokerage execution path.

## Prior milestone — Startup/module split and bundle contract

task: Split the production mobile startup bundle at its existing async recovery
boundary and make Vite's 500 kB JavaScript chunk threshold an executable CI
contract without changing product, storage, or native behavior.

stage: codex

lane: fleet-handoff

produced:

- Published ff269fdd56aa705d9912b3f23e609e12b9dd92c6
  (Split mobile startup bundle and enforce chunk budget) directly to GitHub
  main.
- main.ts now loads the native SQLite connection/store only in the native branch
  and loads the existing whole UI module inside the already-awaited
  startApplication callback. The browser branch does not request native chunks.
  A UI-chunk failure closes the constructed JournalApplication before recovery;
  a native-chunk failure occurs before database construction.
- NativeJournalOpenCleanupError moved byte-for-byte into a lightweight module.
  connection.ts imports and re-exports that exact constructor, preserving
  instanceof identity and the non-retryable cleanup classification without
  statically loading the native SQLite adapter.
- Added verify-mobile-bundle.mjs and six fail-closed Node tests. The verifier
  recursively checks .js/.mjs/.cjs chunks, rejects nested or root symlinks,
  rejects empty bundles and invalid limits, and fails when any chunk exceeds
  500,000 bytes. CI unit-tests the verifier and applies it to the exact bundle
  copied into the iOS shell.
- The production graph is five relative JavaScript chunks. The initial entry is
  211.91 kB and the largest UI chunk is 359,489 bytes; the former 685.86 kB
  single-chunk warning is gone without raising or suppressing Vite's threshold.
- Updated the prepared-review E2E probe to recognize any emitted production
  JavaScript asset instead of hard-coding the former index chunk name. The
  exact stale-review journey and the full suite pass after the split.
- No schema, migration, store command, archive/export shape, native project,
  dependency lock, network path, security boundary, product definition,
  financial formula, order path, or public-facing behavior changed.

verified:

- cd mobile && npm ci — 164 packages installed; zero vulnerabilities.
- cd mobile && npm run typecheck — exit 0. npm run test:boundary — 2/2.
  npm test — 828/828 across 70 files. npm run test:bundle — 6/6.
  npm run test:ios-sync — 8/8. npm audit --omit=dev — zero production
  vulnerabilities.
- Focused stale-review E2E — 1/1. Exact cd mobile && npm run test:e2e — exit 0;
  116/116 production Chromium journeys.
- cd mobile && npm run ios:sync — exit 0; 96 modules, five JavaScript chunks,
  no oversized-chunk warning, one SQLite plugin registered. CocoaPods and
  xcodebuild were explicitly skipped because they are unavailable on Linux.
- cd mobile && npm run verify:bundle — five chunks; largest
  assets/app-DkXMXyDs.js at 359,489/500,000 bytes.
- cd mobile && npm run verify:ios-sync — nine production files copied
  byte-for-byte; SHA-256
  ffe8c3c291e9fb74a3f2931364f6a183ac4781cd6fa0b39a3f132850649dd528;
  generated identity and encrypted-SQLite registration passed.
- git diff --check and native/package-lock drift checks — exit 0. Three
  independent read-only reviews found no remaining blocker after .mjs and
  root-symlink hardening.
- gh run view 29675119712 --json status,conclusion,headSha,jobs — exact SHA
  ff269fdd56aa705d9912b3f23e609e12b9dd92c6, conclusion success; Mobile Linux
  job 88161071594 and Legacy Python job 88161071608 both succeeded, including
  the new verifier test and production bundle gate.

assumptions:

- Vite 8.1.4's default warning contract remains 500 decimal kB and treats only
  chunks larger than the limit as violations; equality is covered explicitly.
- Relative local chunks under base ./ remain compatible with the existing
  script-src self CSP and Capacitor copy boundary. Chromium proves the browser
  UI chunk; native WKWebView loading remains part of Mac/device acceptance.
- The parity report is a viewable checked-in artifact, but its proprietary
  external Data Analytics generator is not redistributed or claimed
  clean-checkout reproducible.

open:

- HOLD native acceptance until CocoaPods, Xcode, Simulator, physical iPhone,
  WKWebView chunk loading, SQLCipher, Keychain, lifecycle, VoiceOver, Dynamic
  Type, and hardware-keyboard evidence are recorded on the reviewed Mac/device.
- Opening Hour Mix v1 remains HOLD + CLARIFY pending a human product contract;
  no implementation was started.
- Parity-report hosted regeneration remains HOLD pending a license-safe,
  immutable generator strategy. Do not vendor the proprietary plugin without
  explicit redistribution authority.
- Guard screening and Sonnet final review remain downstream. No further Hermes
  slice is active in this session.

## Prior milestone — Symbol Breakdown v1

task: Harden shipped Symbol Breakdown v1 so its full-workspace source cohort and
stable-ID review drill-down fail closed under accessor, iterator, and DOM
identity tampering without changing its definition or product boundary.

stage: codex

lane: fleet-handoff

produced:

- Definition `symbol-breakdown-report-v1` is pinned by SHA-256
  `33c47664633d24b75a80cde1dfac46e366f2e04ecccc852ce807792743cb8aef`.
  Every current projection trade is included exactly once; there are no
  exclusions.
- Exact group identity is `(symbol, assetClass)`. Same-symbol/same-asset trades
  merge across accounts; the same symbol stored as Stock and ETF remains two
  groups. Groups use stable symbol code-unit order, then fixed Stock-before-ETF
  order for a collision. Evidence uses traded date descending then stable
  subject ID. Otherwise identical repeated trades receive stable **Trade n of
  total** visible and accessible labels.
- Before validation, snapshot `trades`, `timeZone`, `accountLabel`, and
  `periodLabel`, the array length and every indexed trade slot, and every
  consumed trade field must be own data properties. All indexed trade references
  are captured before any trade field is read; a custom iterator is never
  consulted; accessors fail without invocation; emitted stable-ID cardinality
  and uniqueness are rechecked after grouping.
- Canonical symbol, Stock/ETF asset class, Long/Short side, Open/Closed position
  state, Pending/Draft/Completed review state, real Gregorian 1970–9999 date,
  and unique trimmed C0/C1-free subject identity fail closed without repair,
  dropping, or defaults. The builder and nested results are detached and deeply
  frozen.
- Reports now exposes 11 semantic targets in DOM order: Performance Summary,
  Journal Curve, Review Session Coverage, Direction Mix, Symbol Breakdown,
  Opening Weekday Mix, Plan Check, Mistake Patterns, Emotion Patterns, Tag
  Patterns, and Setup Breakdown. Nine targets are governed reports.
- Presentation reveals five groups and 25 contributors per action. Every row
  page focuses its first newly revealed action. Each rendered review action is
  registered to its original row element, group index, evidence ordinal, and
  stable subject ID. A registered action retains Symbol origin after its source,
  class, or ancestor section marker is removed or it is moved. Activation of a
  button retaining `data-review-trade` rechecks the source, unique live section,
  exact group and symbol/asset identity, current row position, original row
  element, evidence ordinal, row/action uniqueness, and current stable-ID trade.
  A detected registered mismatch or an unregistered clone retaining a Symbol-
  specific row/group/list/card marker fails visibly with chrome-safe focus before
  opening and performs no write. Removing `data-review-trade` makes it inert to
  delegated review activation; it cannot open a review or write. Ordinary
  close returns to its trigger, while a review save or reconciliation refresh
  returns to the Symbol Breakdown heading. Trade Browser account/date/day/search/
  facet state is neither consumed nor changed.
- Matching-runtime restore recomputes exact version, checksum, cohort,
  group/evidence order, counts, and contributor identities from existing ledger
  inputs. Equality is proved by the Session-adapter Vitest, not a browser or
  native archive journey. No report output becomes durable state.
- Symbol Breakdown is the 34th bounded Slice D increment and the 29th
  derived-only presentation/projection increment. The same five write-capable
  exceptions remain. No P&L, result, rate, percentage, rank, comparison,
  prediction, reward, or advice is calculated.
- No schema, migration, store command, archive/digest/export shape, protected
  preference, native source, dependency, network path, credential, destructive
  flow, order execution, or public profit ranking was added.
- The current snapshot has no venue or listing identity. Any future venue-aware
  grouping requires a separately defined/versioned v2; v1 may not be silently
  regrouped.
- The parity report builder requires each governed SQL source exactly once in
  both artifact lists and executes all three sources in query-only in-memory
  SQLite. SQL result rows match their embedded datasets exactly where defined.
  Headline validation reconciles four selected fields; disposition validation
  reconciles category counts, not narrative fields or row order; priority
  validation reconciles ledger count and sequence before comparing SQL rows with
  the embedded dataset. This is not broader capability-identity proof. The
  builder fails early on unsupported Node runtimes; supported floors are 22.16,
  23.11, and 24.0.

verified:

- `cd mobile && npm run typecheck` — exit 0. `cd mobile && npm run
  test:boundary` — 2/2. `cd mobile && npm audit --omit=dev` — zero production
  vulnerabilities.
- `cd mobile && npm test -- src/core/symbol-breakdown-report.test.ts` — 34/34.
  `cd mobile && npm test` — 828/828 across 70 files. This covers fixed indexed
  capture, ignored custom iteration, accessor rejection without invocation,
  conservation, immutable output, and presentation paging.
- `cd mobile && npm run test:e2e -- e2e/symbol-breakdown-report.spec.ts` — 10/10.
  `cd mobile && npm run test:e2e` — 116/116. Production Chromium covered exact
  drill-down, close/save return, Trade Browser isolation, storage/network
  neutrality, registered-origin and exact-row/ordinal tamper rejection, bounded
  progressive paging focus, and 320/421px 200% reflow. Restore equality is
  covered instead by the matching-runtime Session-adapter Vitest in
  `mobile/src/adapters/session-journal-restore.test.ts`.
- `cd docs/mobile/tradezella-parity && node build-report.mjs artifact.json
  /tmp/hermes-symbol-breakdown-report.html` — exit 0; validation, packaging,
  verification, source dialog, 1440/390px checks, SQL rows 1/4/6, and no-script
  semantic fallback passed. `diff -u docs/mobile/tradezella-parity/report.html
  /tmp/hermes-symbol-breakdown-report.html` — exit 0; both SHA-256
  `97ffbb184e7e4dfb9f414f056c762c5522244b6a259c847fa8203abe7a790bca`.
- `cd mobile && npm run ios:copy` — exit 0; the 95-module build copied the public
  bundle into the iOS shell. CocoaPods and `xcodebuild` were not run.
  `cd mobile && npm run verify:ios-sync` — exit 0; six production files matched
  byte-for-byte, latest
  bundle SHA-256 `dfb11db5b2893292bfd5e58d995732f3ad594e74c2c54d24171dd1421d3e326f`.
  `cd mobile && npm run test:ios-sync` — 8/8.
- `git diff --check` and `git diff --exit-code --
  mobile/ios/App/App.xcodeproj mobile/ios/App/Podfile
  mobile/ios/App/Podfile.lock mobile/package-lock.json` — exit 0; no tracked
  native-project, CocoaPods, or lockfile drift.
- `gh run view 29672087958 --json status,conclusion,headSha,jobs` — exact
  hardening SHA `0815d5e8b789580e40b34787d19662789204f214`, conclusion `success`;
  Mobile Linux job `88152881360` and Legacy Python job `88152881366` both
  concluded `success`.
- `gh run view 29672087958 --job 88152881360 --log |
  rg 'index-Dd1sy_fq.js|Some chunks are larger than 500 kB'` — exit 0; the main
  bundle was 685.86 kB minified (167.34 kB gzip) and emitted the >500 kB warning.
- CocoaPods, Xcode, Simulator, physical iPhone, SQLCipher/Keychain runtime,
  VoiceOver, Dynamic Type, hardware keyboard, lifecycle, and multi-scene
  evidence are not claimed here.

assumptions:

- Current `TradePreview.symbol`, `assetClass`, and stable subject ID remain the
  only stored identity available for v1 grouping and drill-down. Account is
  evidence context, not group identity.
- Current full-workspace projection order and fields remain canonical inputs;
  report construction never consumes Trade Browser scope or authored review
  content.
- Input hardening evidence covers typed plain snapshots, ordinary arrays/trades,
  sparse or inherited slots, custom iterators, and accessors. Hostile JavaScript
  Proxies are outside the claimed plain-snapshot contract.
- Browser, SQL.js, and Linux evidence do not replace SQLite/WKWebView,
  SQLCipher, Keychain, VoiceOver, Dynamic Type, lifecycle, Simulator, or
  physical-device proof.

open:

- HOLD all native acceptance until the Mac/iPhone procedure proves
  checksum/cohort/collision equality, paging, drill-down, close/save focus,
  restore equality, accessibility, lifecycle, and zero durable/network change.
- Opening Hour Mix v1 is HOLD + CLARIFY pending a human product contract.
  Recommended contract: count-only full workspace; fixed 00–23 workspace-local
  buckets by first-entry time; DST folds share a bucket; missing hours are zero;
  version/checksum/conservation/fail-closed/stable-ID drill-down/restore; and no
  P&L, ranking, comparison, or market-session inference.
- Vite's 685.86 kB main bundle remains above its 500 kB warning threshold; code
  splitting or warning-policy changes are deferred and no optimization is claimed.
- Checked-in parity-report regeneration remains local-only: hosted CI does not
  rebuild or diff it, and the builder dynamically selects an unpinned installed
  external Data Analytics plugin cache, so a clean checkout is not self-contained.
  Pin the generator and add CI regeneration before claiming hosted reproducibility.
- Later timing, drawdown, comparison, MAE/MFE, exit-efficiency, and account
  report families each require their own definition, inputs, checksum,
  conservation/exclusions, drill-down, restore equality, and human product gate.
- Two separate moderated fictional-data studies remain NOT RUN: five manual
  participants and five generic-CSV participants. Do not pool cohorts or infer
  activation, retention, causality, or trading outcomes from browser automation.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim full TradeZella parity, representative popularity causality,
  native readiness, broader asset/broker support, hosted Connect, Android,
  recurring AI, TestFlight/App Store submission, public pricing, execution,
  advice, or comparative superiority from this milestone.
- The user's autonomous parity goal remains active after this slice; this
  handoff is a coherent milestone, not completion of the broad roadmap.

## Prior milestone — Exact Playbook Draft Scope v1

> Historical snapshot; current status and open items are superseded by the
> active Symbol Breakdown v1 handoff above.

Status: verified Exact Playbook Draft Scope v1 locally · feature commit ed74993
· hosted exact-commit CI passed · updated 2026-07-18

### Historical handoff

task: Deliver Exact Playbook Draft Scope v1 as a fail-closed, derived-only path
from a positive current draft count on one immutable Journal playbook card to
its exact draft Trade Browser cohort, without changing completed metrics,
retaining contradictory scope, or adding durable playbook state.

stage: codex

lane: fleet-handoff

produced:

- The detached, deeply frozen playbook-library projection now reconciles every
  immutable Journal card one-to-one with retained options, exact name, fixed
  position, ordered rules, finite completed metrics, current completed-trade
  count, and a separate current draft-assignment count. Completed `tradeCount`,
  net R, win rate, and governed-report meanings remain completed-only.
- The existing **Open completed reviews** action remains exact. A separate
  **Open draft reviews** action appears only while the card's separately
  reconciled current draft count is positive; a zero count cannot produce a
  draft action.
- Each valid draft action starts from `EMPTY_TRADE_BROWSER_STATE`, applies only
  `reviewState: "draft"` plus the exact playbook, and clears account, inclusive
  dates, selected day, query, and the other eight card facets. It does not
  auto-open the existing review editor.
- Activation rechecks the unique section, card, action kind, exact name,
  position, completed and draft counts, rules, current option, and exact current
  draft subjects before browser assignment. Missing, duplicated, detached,
  stale, noncanonical, count-mismatched, case-mismatched, or tampered evidence
  fails visibly.
- After Trades renders, destination validation reconciles the open filter
  disclosure, review and playbook controls, exact two-filter badge, canonical
  result-count text, all rendered subjects, and visible subject equality.
  Failure restores the prior tab and exact nine-facet Trade Browser state.
- If the last draft disappears after render, its detached action remains
  unavailable without a persistence or network write. The Journal archive,
  localStorage, sessionStorage, governed reports, and completed card metrics
  remain unchanged.
- README, product blueprint, local-ledger contract, iOS roadmap, Mac acceptance
  matrix, capability ledger, parity artifact/report, priority SQL, and this
  handoff now reconcile 33 bounded Slice D capabilities: 28 derived-only and the
  same 5 write-capable exceptions.
- No schema, migration, persistence command, archive/digest/export/restore shape,
  governed-report cohort/formula/version/checksum, protected preference,
  dependency, native source, network path, credential, destructive flow, order
  execution, advice, or public profit ranking was added.

verified:

- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm test` — exit 0; 68 files, 786 tests passed.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm run test:e2e -- e2e/playbook-trade-scope.spec.ts` — exit 0;
  all 10 focused production-Chromium journeys passed. Coverage includes exact
  completed and draft routing, stale/detached action failure, noncanonical
  counts, subject and result-count tamper detection, exact rollback, offline
  storage/network neutrality, focus, and 320px/200% reflow.
- The portable parity-report builder passed validation, 1440/390 responsive
  checks, 20-domain disposition lineage (6 shipped, 6 prioritize-local,
  6 gated-funded, 2 intentional non-goals), all 6 priority rows, and
  script-stripped semantic fallback QA. Checked-in report SHA-256:
  `94045d3f25d3c3310511d83e3af4ea424c68b33de2fbe3c8db526334e93510e6`.
- Parity artifact SHA-256:
  `d705545683d04eb6b3196ac6b6f68e471ce03b69c196e86882972f613b5855e6`;
  capability ledger:
  `ecb715e19286121d9e08289465570f58f8483cb265855ba4c43ccf3ba9ec2a88`;
  priority SQL:
  `f5a28f7f245fa291d0f8a2407fd8c12ba0efef4778c0ebf3d4dcab188c1e7e7f`.
- `cd mobile && npm run test:e2e` — exit 0; all 106 production-Chromium
  journeys passed in 41.0 seconds.
- `cd mobile && npm run ios:copy` and `cd mobile && npm run ios:sync` — exit
  0. CocoaPods and xcodebuild were explicitly skipped/not installed on Linux.
- `cd mobile && npm run verify:ios-sync` — exit 0. The production bundle
  matched the iOS public copy byte-for-byte with SHA-256
  `9ac23389ca8ceeb9ff68fb799f0efb510d1aa49be46e40050ccde62d7fb98b5f`;
  byte-for-byte copy, generated-configuration, and native-lock drift contracts
  passed. Every native acceptance row remains NOT RUN.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 verifier tests passed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- GitHub Actions run `29659948587` passed exact feature commit
  `ed749937dd2d0b16085528872f48cdd7f06fa28a`. Mobile Linux contract gate job
  `88120782755` and Legacy Python safety gate job `88120782761` both
  completed successfully. Hosted coverage included locked dependencies,
  typecheck, boundary/no-order checks, unit tests, the iOS verifier, all browser
  journeys, bundle copy and Linux-to-Mac handoff evidence, dependency audit,
  and Python lint/tests.
- Native CocoaPods resolution, Xcode compile, Simulator, physical iPhone,
  SQLCipher/Keychain runtime, VoiceOver, Dynamic Type, hardware keyboard,
  lifecycle, and multi-scene acceptance — NOT RUN.

assumptions:

- Current immutable playbook names and `reviewOptions.playbooks` remain the
  authoritative identity/card source until an explicitly versioned CRUD design
  introduces stable durable IDs.
- Current `TradePreview` assignments and review state remain the sole cohort
  source. Completed card metrics and the separate draft count are claims that
  must reconcile against those live facts before routing.
- Exact playbook scope is session-only. It is not written to SQLite, browser
  journal state, preferences, exports, archives, report digests, or URLs.
- Browser, SQL.js, and Linux bundle evidence do not replace SQLite/WKWebView,
  SQLCipher, Keychain, VoiceOver, Dynamic Type, lifecycle, Simulator, or
  physical-device proof.

open:

- HOLD all native acceptance. On a Mac/iPhone, prove live encrypted current
  assignments, separate exact completed/draft counts, nine-facet search/scope
  composition, conflict clearing, disappearing-draft and tamper rollback,
  VoiceOver, hardware-keyboard focus, safe-area/Dynamic Type reflow,
  background/foreground, force-quit/relaunch, and two-scene refresh without a
  durable or network write.
- Playbook CRUD, Saved Views, broker parser packs/sync, deeper reports,
  attachments/data lifecycle, replay, backtesting, hosted AI, structured
  education/community, and pricing remain behind their documented product,
  rights, security, privacy, schema, device, commercial, and human gates.
- Two separate moderated fictional-data studies remain NOT RUN: five manual
  participants and five generic-CSV participants. Do not pool cohorts or infer
  activation, retention, causality, or trading outcomes from browser automation.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim full TradeZella parity, representative popularity causality,
  native readiness, broader asset/broker support, hosted Connect, Android,
  recurring AI, TestFlight/App Store submission, public pricing, execution,
  advice, or comparative superiority from this milestone.
- The user's autonomous parity goal remains active after this slice; this
  handoff is a coherent milestone, not completion of the broad roadmap.

## Prior milestone — Daily Reflection Rhythm Continuation v1

> Historical snapshot; current status and open items are superseded by the
> active Exact Playbook Draft Scope v1 handoff above.

Status: verified Daily Reflection Rhythm Continuation v1 locally · feature
commit 53ec0b1 hosted exact-commit CI passed · updated 2026-07-18

### Historical handoff

task: Deliver Daily Reflection Rhythm Continuation v1 from an exact missing or
draft latest-seven session row into the existing locked-date Daily Journal
editor, while preserving fail-closed identity, immutable history, and
read-only completed/future/demo states.

stage: codex

lane: fleet-handoff

produced:

- A pure resolver reuses the canonical local Daily Reflection Rhythm projection,
  requires one non-future date in its visible latest-seven cohort, and returns a
  frozen target. Missing must reconcile to zero current day-review heads; draft
  and completed must reconcile to one exact current entry-version identity.
- Only missing and draft rows are actionable. Missing opens the existing new
  Daily Journal sheet with the trading-session date locked; draft opens the
  exact immutable current head. Completed, future, empty, and fictional-demo
  rows remain read-only.
- The binder rederives the target and reconciles unique section, row, displayed
  status, action kind, date, and saved-head identity before dialog creation,
  secure randomness, inert state, or persistence. Detached, duplicated, stale,
  or tampered evidence fails visibly without a write.
- Cancel returns to the exact surviving action. Confirmed save, exact-command
  retry, and confirmed-refresh recovery rebuild the Journal and focus the same
  stable rhythm row; a missing or ambiguous rebuilt row falls back to the
  programmatically focusable rhythm heading, then the screen.
- The slice reuses the existing versioned Daily Journal prepare/commit,
  optimistic-conflict, unknown-result, exact-command, and refresh-recovery
  paths. Its missing-row action can create a first day-review head, so this is
  the fifth write-capable product exception rather than a derived-only slice.
- The TradeZella parity artifact was refreshed against current official and
  independent evidence. It now distinguishes filter persistence from unshipped
  named presets, represents current automated/manual backtesting and
  user-confirmed AI mutations, broadens education/community gates, distinguishes
  Trustpilot's 540 prior-year reviews from its 534-review AI summary, and
  inventories every inline external source.
- The report builder now verifies capability-ID uniqueness, 20-domain
  disposition lineage, and the six-row local-priority sequence before producing
  the portable report. The reviewed taxonomy remains 6 shipped,
  6 prioritize-local, 6 gated-funded, and 2 intentional non-goals.
- README, product blueprint, local-ledger contract, iOS roadmap, Mac handoff,
  capability ledger, SQL snapshots, portable report, and this handoff now cover
  31 bounded Slice D increments: 26 derived-only and 5 write-capable.
- No schema, migration, store command, archive/digest/export/restore shape,
  governed-report cohort/formula/version/checksum, protected preference,
  dependency, native source, network path, credential, destructive flow, order
  execution, advice, or public profit ranking was added.

verified:

- Independent architecture review: PASS after checking the resolver, binder,
  exact-head contract, persistence reuse, and no-schema/no-new-command boundary.
- Independent UX/accessibility review: PASS after making the rhythm heading
  programmatically focusable and adding rebuilt-row missing/duplicate fallback
  coverage. Missing, draft, completed, future, empty, demo, keyboard, cancel,
  save, focus, and 320/421px at 200% behavior were accepted.
- Independent evidence review: READY TO SHARE. It reconciled the 540/534
  Trustpilot counts, AI and education gates, 14 inline URLs against 14 source
  entries, slice taxonomy, and an independent report rebuild.
- `cd mobile && npm run typecheck` — exit 0 (also rerun by both production
  builds during final iOS copy/sync).
- `cd mobile && npm test` — exit 0; 66 files, 773 tests passed.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 96 production-Chromium
  journeys passed with 16 workers.
- `cd mobile && npm run ios:copy && npm run ios:sync` — exit 0. Vite
  transformed 91 modules; Capacitor found only
  `@capacitor-community/sqlite@8.1.0` and explicitly skipped CocoaPods and
  xcodebuild on Linux.
- `cd mobile && npm run verify:ios-sync` — exit 0. Six production files
  matched the iOS public copy byte-for-byte with SHA-256
  `dd186fbc9f9ceb0ee22024438446fa716963c9c935d0235f304cc99b1e2ff82b`;
  every native acceptance row remains NOT RUN.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 verifier tests passed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- The portable-report build passed validation, package, source-dialog keyboard
  interaction, 1440/390 responsive checks, 20-domain lineage (6/6/6/2), six
  local-priority rows, and script-stripped fallback QA. Checked-in and
  independently rebuilt HTML SHA-256:
  `fc215a5f94abd84ca04f0171266fd4f44a339909f859a710b9e3b0a442200a9d`.
- Artifact SHA-256:
  `cd153ab00cf6f809e510eb309caba7ef97d66f76cd3347c0dc5ac386ada1a1ba`;
  capability ledger:
  `7f508e1c81f8575bdcda836a73a94536012bb2c59511ee0ee7f59c944ac2b61f`;
  priority SQL:
  `1a5d2c08aecbb04c7494d7a976ad6eb915c35629fffaec5c0ffcb25f2ad6a789`.
- JSON syntax, JavaScript syntax, generated-report receipt, source inventory,
  copied-bundle parity, tracked native/lockfile drift, and
  `git diff --check` passed.
- GitHub Actions run `29630379516` passed exact feature commit
  `53ec0b131113c8fc7d3e2248840d5086b9f74e9f`. Legacy Python safety job
  `88042683367` and Mobile Linux contract job `88042683415` both completed
  successfully, including the 96-journey browser smoke, boundary, bundle-copy,
  iOS-handoff, and dependency-audit stages.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/report slice
  does not touch legacy Python and the checkout has no complete project venv.
  The exact-feature-commit hosted Legacy Python safety job passed above.

assumptions:

- The workspace-local maximum date remains the canonical future boundary, and
  the rhythm's visible latest-seven projection remains the only continuation
  cohort.
- Daily Journal immutable entry/version identity and existing safe-commit
  recovery remain authoritative; the rhythm continuation does not own a second
  persistence contract.
- Browser, SQL.js, and Linux bundle evidence do not replace SQLite/WKWebView,
  SQLCipher, Keychain, VoiceOver, Dynamic Type, lifecycle, Simulator, or
  physical-device proof.
- Current competitor facts are dated external observations, not causal
  popularity, retention, profitability, or trader-outcome evidence.

open:

- Two separate moderated fictional-data studies remain NOT RUN: five manual
  participants and five generic-CSV participants. Do not pool cohorts or infer
  activation, retention, causality, or trading outcomes from browser automation.
- HOLD all native acceptance. CocoaPods, Xcode compile, Simulator, physical
  iPhone, SQLite/SQLCipher/Keychain, Files/photos, safe areas, interruption,
  background/foreground, force-quit/relaunch, multi-scene, VoiceOver, and
  Dynamic Type were NOT RUN.
- Saved Views, broker parser packs/sync, playbook CRUD, deeper reports,
  attachments/data lifecycle, replay, backtesting, hosted AI, structured
  education/community, and pricing remain behind their documented product,
  rights, security, privacy, schema, device, commercial, and human gates.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim full TradeZella parity, representative popularity causality,
  native readiness, broader asset/broker support, hosted Connect, Android,
  recurring AI, TestFlight/App Store submission, public pricing, execution,
  advice, or comparative superiority from this milestone.
- The user's autonomous parity goal remains active after this slice; this
  handoff is the requested stopping point, not completion of the broad roadmap.

## Prior milestone — Generic CSV Receipt Review Continuation v1

> Historical snapshot; current status and open items are superseded by the
> active Daily Reflection Rhythm Continuation v1 handoff above.

Status: verified Generic CSV Receipt Review Continuation v1 locally · hosted
exact-commit status tracked in GitHub Actions · updated 2026-07-17

### Historical handoff

task: Deliver Generic CSV Receipt Review Continuation v1 from one exact active
immutable receipt to its linked current review targets without rereading or
recommitting the file, inferring identity, changing Trade Browser scope, or
broadening Hermes's generic stock-only import boundary.

stage: codex

lane: fleet-handoff

produced:

- A new read-only store seam returns one exact active receipt, one execution ID
  for every accepted source-row occurrence, and the ledger from one coherent
  store operation. Accepted duplicate rows retain their multiplicity; returned
  order is explicitly nonsemantic. Session derives the evidence from immutable
  receipt execution IDs, while SQLite reads occurrence facts and the ledger in
  one serialized transaction.
- Both adapters fail closed unless the receipt is unique, committed,
  unrolled-back, account-coherent, and conserved against accepted-row and
  written-version counts. SQLite additionally rejects contradictory
  created/restored execution cardinality, missing or cross-account active
  executions, rejected receipts, invalid outcomes, and reads queued behind a
  completed rollback.
- The manual and CSV branches now share one stable execution/allocation
  resolver. CSV receipt continuation conserves occurrence multiplicity first,
  deduplicates exact execution and trade identities second, and orders only the
  linked current subjects against the existing canonical all-activity account
  scope. It never guesses from symbol, label, time, row order, recency, or DOM.
- A dedicated More-screen guide exposes state-qualified stable-subject review
  actions, ten targets per page, exact Previous/Next bounds, and qualified
  receipt position labels. It does not mutate Trade Browser filters, imply that
  every account trade is shown, or auto-open a review. Guide-origin cancel/save
  returns to the exact action and page; ordinary review origins retain their
  existing focus behavior.
- Only active local receipts expose Review and Rollback. Fictional and
  rolled-back receipts remain inspectable but non-actionable. Review-first and
  rollback-first both lock their sibling control; confirmed rollback
  invalidates an in-flight continuation before its serialized store operation
  and removes transient guidance after refresh.
- A known-positive post-commit failure surface is owned by Hermes rather than
  the File input. It names the committed source/account/time, hides capture,
  cannot be dismissed, and retries only the receipt read/continuation. Tests
  prove zero second file reads, preparations, or commits for both workspace-read
  and destination-render failures. Ordinary history-review failure remains a
  distinct dismissible surface.
- New file selection clears transient receipt guidance without losing the
  selected File. Programmatically focused receipt and target headings use
  visible chrome-safe focus treatment. Existing CSV-dependent journeys now
  explicitly acknowledge the intentional More destination before navigating to
  their actual Dashboard subject.
- SQLite exact-replay matching was separately corrected to include source name
  and require one committed, unrolled-back, unambiguous match, aligning with
  Session revision identity. Identical bytes under a renamed file intentionally
  create a distinct zero-version receipt. This is write-path correctness
  hardening, not another product increment; no schema or migration changed.
- README, product blueprint, local-ledger contract, iOS roadmap, Mac handoff,
  capability ledger, priority SQL, portable report, and this handoff now cover
  30 bounded Slice D increments, 26 derived-only presentation/projection
  increments, and the same four write-capable product exceptions.
- The benchmark remains 20 unique domains with 6 shipped, 6 prioritize-local,
  6 gated-funded, and 2 intentional non-goals. Manual and generic-CSV
  continuation are shipped inside the broader prioritize-local activation
  domain; their separate moderated human cohorts remain NOT RUN.
- No schema, migration, receipt fact, archive/digest/export/restore shape,
  governed-report cohort/formula/version/checksum, financial aggregation,
  protected preference, dependency, native source, network path, credential,
  destructive flow, order execution, advice, or public profit ranking was
  added.

verified:

- Independent technical review found no release-blocking defect after fixes for
  rollback/review mutual locking, source-name contract wording, and fail-closed
  written-occurrence cardinality. Its final focused rerun passed typecheck,
  756 then-current unit tests, receipt Playwright 4/4, boundary 2/2, iOS-sync
  verifier 8/8, and diff checking; the parent then added three adapter
  regressions and reran the broader gates below.
- Independent UX/accessibility review found no release blocker after
  fixed-size paging, qualified action identity, chrome-safe focus, state-aware
  action eligibility, listener teardown, and recovery separation. It retained
  unbounded receipt-history rendering as P2 debt and native assistive-technology
  checks as explicit device work.
- Independent evidence review reconciled implementation, tests, and claims. It
  classified this as Slice D 30 / derived-only product increment 26, kept the
  same four write-capable product increments, and required the SQLite replay
  correction to be disclosed separately.
- `cd mobile && npm ci` — exit 0; 164 packages audited, 0 vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 65 files, 759 tests passed.
- Focused adapter verification — exit 0; Session/SQLite 45/45 passed before the
  final Session renamed-file regression was added to the 759-test full run.
- `cd mobile && npm run test:e2e -- e2e/import-receipt-detail.spec.ts
  --workers=1` — exit 0; all 4 receipt journeys passed.
- The first full post-feature Chromium run exposed 22 legacy fixtures that
  still expected CSV commit to land on Dashboard: 73/95 passed. Four test files
  were updated to assert the intentional More destination, navigate explicitly
  where Dashboard was their real subject, and use qualified rollback names.
  The affected focused inventory then passed 32/32 without weakening product
  assertions.
- `cd mobile && npm run test:e2e` — final exit 0; all 95
  production-Chromium journeys passed with 16 workers.
- `cd mobile && npm run ios:copy`, then `npm run ios:sync` — exit 0.
  Vite transformed 90 modules; the existing >500 kB chunk warning remains.
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods/xcodebuild on Linux.
- `cd mobile && npm run verify:ios-sync` — exit 0. Six production files
  matched the iOS public copy byte-for-byte with SHA-256
  `28ed665a8b2fb366c1b9f060a72d8ce5b2a6481287635ddd65f9bab41c06ee18`;
  all native acceptance rows remain NOT RUN.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 verifier tests passed.
- The parity report builder passed validation, packaging, verification, source
  keyboard interaction, 1440/390 responsive checks, and script-stripped
  fallback checks for 11 blocks, 1 chart, 1 metric strip, and 1 table. Fallback
  widths reconciled at 1425/1425 desktop and 375/375 mobile.
- Repository-pinned `sql.js@1.14.1` execution of `headline.sql`,
  `disposition.sql`, and `priority-roadmap.sql` reproduced 20/6/6/8
  headline counts, exact 6/6/6/2 dispositions, and six ordered local-first
  rows.
- SHA-256: report HTML
  `935b57505beebe6a3c1ac8d1bedce60a17d1a22bede64bc1d8f50114f058a086`;
  artifact JSON
  `aefb58536379c190213284ebaad62418df12fa6061aaf813ec112ea030ba5542`;
  capability ledger
  `a20c9c20f1a6d463a2822f701e928610b403e2bb0706b98fd7cdc3b4d712a2aa`;
  priority SQL
  `47aeefff71f4ef8a52743a2d2fc0716ed9669b3c7fe5a6ce5e956dcde22bdb06`.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- JSON syntax, report receipt, SQL output, generated-bundle parity, tracked
  native/lockfile drift, and `git diff --check` — passed.
- Handoff topology checks — 1 current section, 36 prior-milestone markers, and
  37 complete `task/stage/lane/produced/verified/assumptions/open` schema
  blocks.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/report slice
  does not touch legacy Python and this checkout has no complete project venv.
  The hosted Legacy Python safety job remains required.

assumptions:

- Each accepted CSV source-row occurrence owns exactly one immutable execution
  reference. Repeated occurrences are meaningful evidence; adapter return order
  is not.
- The receipt and ledger must come from one coherent serialized read. A stale,
  rejected, rolled-back, ambiguous, cross-account, or corrupted receipt is not
  a review destination.
- Canonical all-activity account scope is used only to validate and order
  linked current subjects. CSV continuation deliberately leaves the user's
  Trade Browser session unchanged.
- The guide is transient in-process UI state. No relaunch persistence,
  activation-progress persistence, or native lifecycle continuity is claimed.
- Generic CSV remains stock-only. No broker-specific mapping, asset-class
  inference, correction inference, or broader import semantics were added.
- Source name is intentionally part of exact active import revision identity.
  The SQLite parity correction changes existing replay behavior but does not
  alter immutable receipt shape or product-increment counts.
- This increment is intended to reduce import-to-review friction; no causal
  activation, retention, or trading-outcome benefit has been measured.
- Browser, SQL.js, and Linux bundle evidence do not replace SQLite/WKWebView,
  SQLCipher, Keychain, VoiceOver, Dynamic Type, lifecycle, Simulator, or
  physical-device proof.

open:

- Before downstream pass, require the published commit's Mobile Linux and
  Legacy Python jobs to be green and record the terminal exact-SHA run in the
  fleet handoff; GitHub Actions is authoritative for that external state.
- Two separate moderated fictional-data studies remain NOT RUN: five manual
  participants and five generic-CSV participants. At least four in each cohort
  must reach linked current review without facilitator correction; CSV
  participants must first reconcile the exact immutable receipt. Do not pool
  cohorts or infer retention/causality from browser automation.
- Receipt history still renders every historical receipt in More. Its
  unbounded DOM/list behavior is P2 debt; the linked-target guide itself is
  bounded at ten per page.
- Completed-review guide opening, AUTO/many-to-one normalization boundaries,
  listener-lifetime instrumentation, and several return-focus paths have
  application/unit or indirect browser evidence but not dedicated browser
  journeys. These are residual coverage gaps, not release blockers.
- Saved Views remains held until protected preference ownership, encryption or
  an approved schema/migration, reset/stale-value lifecycle, and archive/export
  exclusion are designed. Plaintext WebView localStorage is not acceptable.
- Symbol Breakdown and every later observational report remain held on explicit
  eligibility, version, checksum, conservation, exclusion, restore-equality,
  and stable-ID drill-down decisions.
- HOLD all native acceptance. CocoaPods, Xcode compile, Simulator, physical
  iPhone, SQLite/SQLCipher/Keychain, Files/photos, safe areas, interruption,
  background/foreground, force-quit/relaunch, multi-scene, VoiceOver, and
  Dynamic Type were NOT RUN.
- Existing human gates remain: generic-CSV asset semantics; atomic batch
  durable recovery; approved Delete All Data; and removal, wrapping, or explicit
  acceptance of the pinned SQLite plugin's HTTP-download bridge and
  database-path console print.
- Credentialed broker/prop sync, licensed replay, reproducible backtesting,
  private AI, mentor/community services, and pricing/packaging remain
  gated-funded domains requiring explicit product, rights, security, privacy,
  commercial, moderation, recurring-cost, and human decisions.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim full TradeZella parity, representative popularity causality,
  native readiness, broader asset/broker support, hosted Connect, Android,
  recurring AI, TestFlight/App Store submission, public pricing, execution,
  advice, or comparative superiority from this milestone.
- The user's autonomous parity goal remains active after this slice.

## Prior milestone — Manual Capture Review Continuation v1

> Historical snapshot; current status and open items are superseded by the
> active Generic CSV Receipt Review Continuation v1 handoff above.

Status: verified Manual Capture Review Continuation v1 locally · exact-commit
hosted status tracked in GitHub Actions · updated 2026-07-17

### Historical handoff

task: Deliver Manual Capture Review Continuation v1 from a known manual commit
to the exact current review target without resubmitting the execution, inferring
identity, changing governed data, or broadening Hermes's local/offline boundary.

stage: codex

lane: fleet-handoff

produced:

- A pure continuation resolver accepts only a known `committed` or reconciled
  `duplicate` outcome plus a bounded immutable execution ID, reloads the current
  private projection, and finds one exact current subject or the two exact
  allocation subjects of one structurally valid AUTO reversal in one stable
  account. It rejects missing, ambiguous, duplicated, excessive,
  cross-account, detached, stale, and tampered evidence without symbol, label,
  timestamp, recency, row-order, or DOM inference.
- The two-target branch requires one exact exit and one exact opposite entry
  with matching represented instrument and execution facts. Recovery correctly
  tolerates a later distinct execution having closed the entry-side subject;
  mutable current open status is not mistaken for immutable reversal evidence.
- A successful continuation resets the Trade Browser to the existing exact
  all-activity account scope, clearing dates, selected day, search, and all
  eight facets. Every account trade remains visible. A dedicated guide exposes
  one state-qualified stable-subject action per linked trade and does not
  auto-open a review.
- A guide-origin review save rebuilds the exact target and returns focus to the
  guide. An ordinary trade-card review preserves the visible guide but returns
  normal screen focus. New capture, filter/scope mutation, and workspace-mode
  changes clear the transient guide.
- The visible commit reference is narrowed to outcome plus execution ID.
  Pending recovery temporarily retains the existing submission ID only until
  visible destination acknowledgment. A known destination-render failure
  offers continuation-only retry with no second commit read. Startup and
  post-onboarding recovery re-query current recoverable executions, rederive
  from the fresh projection, and acknowledge only after the exact destination
  is visible.
- Modal generation ownership prevents a delayed retry from rendering or
  stealing focus behind Settings or another inert modal. A superseded retry
  resets its busy state, Settings close restores the visible failure heading,
  and continuation alerts never interpolate private adapter detail.
- README, product blueprint, local-ledger contract, iOS roadmap, Mac handoff,
  capability ledger, priority SQL, portable report, and this handoff now cover
  29 bounded Slice D increments, 25 derived-only presentation/projection
  increments, and the same four write-capable exceptions.
- The source-backed benchmark remains 20 unique domains with 6 shipped,
  6 prioritize-local, 6 gated-funded, and 2 intentional non-goals. Manual
  capture continuation is shipped inside the broader prioritize-local guided
  activation domain; generic-CSV continuation and both human cohorts remain
  open.
- No schema, migration, store command, archive/digest/export/restore shape,
  governed-report cohort/formula/version/checksum, financial aggregation,
  preference, dependency, native source, network path, credential, destructive
  flow, order execution, advice, or public profit ranking was added.

verified:

- Regression-first and adversarial proof covers exact single-target and AUTO
  reversal destinations, a later-closed reversal entry subject, unrelated
  same-account execution-ID collision, tampered targets, hidden-filter reset,
  guide versus ordinary review origins, destination-render failure, retry-only
  recovery, modal supersession, post-onboarding recovery, privacy-safe errors,
  storage/request neutrality, and 320px/200% reflow.
- Independent technical review found and drove fixes for hidden-modal retry
  acknowledgment, unrelated two-target collisions, stale onboarding recovery,
  raw adapter alerts, and mutable reversal status. Final re-review: PASS, no
  must-fix findings.
- Independent UX/accessibility review found and drove fixes for sticky-chrome
  focus, retry busy-state recovery, modal supersession, and Settings-close
  focus. Final re-review: PASS, no must-fix findings.
- Independent evidence review reconciled the implementation and held stale or
  overbroad claims. The active docs now distinguish visible outcome/execution
  identity from temporary pending submission acknowledgment, name only the
  injected destination-render failure, keep the manual and generic-CSV studies
  separate, and include every new evidence path.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 63 files, 740 tests passed.
- Focused continuation projection/view/review-origin Vitest inventory — 25
  tests passed, including the later-closed reversal recovery fixture.
- `cd mobile && npm run test:e2e -- e2e/manual-execution.spec.ts` — exit 0;
  all 9 manual-execution journeys passed.
- `cd mobile && npm run test:e2e` — exit 0; all 93 production-Chromium journeys
  passed after the pre-existing activity-month fixture was updated to consume
  the new intentional review-guide destination.
- Initial exact-commit GitHub Actions run `29623294923` passed the Legacy Python
  gate but exposed two Mobile Linux focus-geometry failures at 2 workers: the
  `.screen-stack` entrance transform kept moving after chrome-safe focus
  geometry was measured. The shared manual-continuation focus helper now freezes
  that transform before measurement, and the E2E helper asserts the animation
  is inactive rather than weakening its 8px clearance requirement.
- CI-profile focus verification after that fix — 20/20 repeated AUTO-reversal
  tamper and known-save failure journeys passed at 2 workers; a subsequent full
  local inventory again passed 93/93.
- `cd mobile && npm run ios:copy`, then `npm run ios:sync` — exit 0. Vite
  transformed 86 modules; the existing >500 kB warning remains. Capacitor found
  only `@capacitor-community/sqlite@8.1.0` and explicitly skipped
  CocoaPods/xcodebuild on Linux.
- `cd mobile && npm run verify:ios-sync` — exit 0. Six production files matched
  the iOS public copy byte-for-byte with SHA-256
  `14e9e510e2d51dc73fd004febe6dfa36a714517489615f8a71785d07e23e9dbb`;
  all native acceptance rows remain NOT RUN.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 verifier tests passed.
- `node docs/mobile/tradezella-parity/build-report.mjs
  docs/mobile/tradezella-parity/artifact.json
  docs/mobile/tradezella-parity/report.html` — exit 0; validation, packaging,
  verification, source keyboard interaction, 1440/390 responsive checks, and
  script-stripped fallback checks passed for 11 blocks, 1 chart, 1 metric
  strip, and 1 table. Fallback client/scroll widths reconciled at 1425/1425
  desktop and 375/375 mobile.
- SQL.js execution of `headline.sql`, `disposition.sql`, and
  `priority-roadmap.sql` reproduced 20/6/6/8 headline counts, exact 6/6/6/2
  dispositions, and six ordered local-first rows. System `sqlite3` was absent;
  the repository's pinned `sql.js@1.14.1` executed the same SQL instead.
- SHA-256: report HTML
  `ade8181dcb32874f168e8cba994fdcd37c36ffc3cd9666dd3008d64411057ec9`;
  artifact JSON
  `3b97b94c952dc11f5f327dcbd93ca953f6d2244f8b6c3fb7f18d7decd00212e0`;
  capability ledger
  `d6d0e101508ecfd9d31847cba4a2948c4c8600e0559eed6f32c3183148baef6e`;
  priority SQL
  `a1fdad49029d4be5196731b4521b4b8bac2b1effe989a75bfe5412e6291436a1`.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- JSON syntax, builder syntax, report build receipt, SQL output,
  generated-bundle parity, and `git diff --check` — passed.
- Handoff topology checks — 1 current section, 35 prior-milestone markers, and
  36 complete `task/stage/lane/produced/verified/assumptions/open` schema
  blocks.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/report slice
  does not touch legacy Python and this checkout has no complete project venv.
  The hosted Legacy Python safety job remains required.

assumptions:

- The existing manual store owns commit idempotency and its durable recovery
  record. This slice begins only after the store has returned a known outcome;
  continuation retry must never call the commit again.
- Exact execution and allocation identities in the fresh current projection are
  the only routing evidence. Symbol, label, time, recency, and position in a
  rendered list are presentation only.
- One manual execution may affect two subjects only as an AUTO reversal. The
  entry-side subject can later close under a distinct execution while the
  original reversal fragments remain valid.
- Reset-all is intentional: retaining hidden dates, day, search, or facets
  would make the destination disagree with the exact guide.
- This increment is intended to reduce capture-to-review friction; no causal
  activation, retention, or trading-outcome benefit has been measured.
- Browser and Linux bundle evidence does not replace SQLite/WKWebView,
  SQLCipher, Keychain, VoiceOver, Dynamic Type, lifecycle, Simulator, or
  physical-device proof.

open:

- Before downstream pass, require the published commit's Mobile Linux and
  Legacy Python jobs to be green and record the terminal run in the fleet
  handoff; GitHub Actions is authoritative for that external state.
- Generic-CSV receipt-to-review continuation remains the next autonomous
  branch. It must start from the exact immutable receipt, reconcile explicit
  row outcomes, resolve stable current subjects, and reuse the exact account
  scope without guessed broker semantics or resubmission.
- Two distinct moderated fictional-data studies are NOT RUN: five manual
  participants and five generic-CSV participants. At least four participants
  in each cohort must reach the linked current review without facilitator
  correction; CSV participants must first reconcile the exact receipt. Do not
  pool cohorts or infer retention/causality from browser automation.
- Saved Views remains held until protected preference ownership, encryption or
  an approved schema/migration, reset/stale-value lifecycle, and archive/export
  exclusion are designed. Plaintext WebView localStorage is not acceptable.
- Symbol Breakdown and every later observational report remain held on explicit
  eligibility, version, checksum, conservation, exclusion, restore-equality,
  and stable-ID drill-down decisions.
- HOLD all native acceptance. CocoaPods, Xcode compile, Simulator, physical
  iPhone, SQLite/SQLCipher/Keychain, Files/photos, safe areas, interruption,
  background/foreground, force-quit/relaunch, multi-scene, VoiceOver, and
  Dynamic Type were NOT RUN.
- Existing human gates remain: generic-CSV asset semantics; atomic batch
  durable recovery; approved Delete All Data; and removal, wrapping, or explicit
  acceptance of the pinned SQLite plugin's HTTP-download bridge and
  database-path console print.
- Credentialed broker/prop sync, licensed replay, reproducible backtesting,
  private AI, mentor/community services, and pricing/packaging remain
  gated-funded domains requiring explicit product, rights, security, privacy,
  commercial, moderation, recurring-cost, and human decisions.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim full TradeZella parity, representative popularity causality,
  native readiness, broader asset/broker support, hosted Connect, Android,
  recurring AI, TestFlight/App Store submission, public pricing, execution,
  advice, or comparative superiority from this milestone.
- The user's autonomous parity goal remains active after this slice.

## Prior milestone — Guided Account Overview v1

> Historical snapshot; current status and open items are superseded by the
> active Manual Capture Review Continuation v1 handoff above.

Status: verified Guided Account Overview v1 locally · hosted exact-commit CI
pending · updated 2026-07-17

### Historical handoff

task: Deliver Guided Account Overview v1 as a derived-only activation path from
the Dashboard into one exact existing Trade Browser account scope, while
preserving Hermes's ledger ownership, governed definitions, local/offline
boundary, and explicit native and human acceptance holds.

stage: codex

lane: fleet-handoff

produced:

- A pure `buildAccountOverview` projection now lists every retained account in
  the ledger's stable current order with its exact current derived trade count,
  including zero-trade accounts. It owns no balance, buying-power, broker,
  performance, or financial value and writes no state.
- Every account action carries its stable ledger ID into the existing Trade
  Browser and deliberately rebuilds from `EMPTY_TRADE_BROWSER_STATE` plus that
  account. Dates, activity-day scope, search, and review facets are cleared so
  the visible count cannot disagree with hidden filters. The exact summary is
  scrolled clear of app chrome, focused, and announced.
- The account/card/action binding fails closed on missing, stale, duplicated,
  reordered, or coherently swapped identities. Candidate scope is validated
  before assignment; a later render/focus failure restores the prior exact tab
  and Trade Browser state rather than leaving a partial route transition.
- Duplicate account labels are presentation-qualified as `account N of M` in
  the exact destination summary and select options while unique labels remain
  unchanged. Demo guidance is explicitly fictional/read-only, and all-zero
  workspaces direct the user to add evidence before a review can exist.
- Production Chromium covers the exact reset-all route, tampered/stale IDs,
  post-assignment rollback, offline/storage invariants, and a 320 CSS-pixel / 200%
  text keyboard journey through the exact account into its fictional read-only
  review. Long duplicate labels remain inside the viewport.
- README, product blueprint, iOS roadmap, local-ledger contract, Mac handoff,
  parity artifact/report, roadmap SQL, and this handoff now cover 28 bounded
  Slice D increments, 24 derived-only presentation/projection increments, and
  the same 4 write-capable exceptions.
- The broader guided activation/account/receipt domain remains
  `prioritize-local`:
  branch-specific continuation into the correct review and the moderated
  4-of-5 activation gate were NOT RUN. The source-backed 20-domain benchmark
  therefore remains 6 shipped, 6 prioritize-local, 6 gated-funded, and 2
  intentional non-goals.
- No migration, durable command, archive/digest/export/restore shape,
  governed-report formula/cohort/version/checksum, account preference, balance
  model, credential, dependency, native source, network path, destructive flow,
  order execution, advice surface, or public profit ranking was added.

verified:

- Regression-first proof: targeted unit tests initially failed because the
  account overview modules did not exist. The focused type/unit/Chromium suites
  passed after the projection, binding, route, rollback, focus, and responsive
  contracts were implemented.
- Independent technical review found a coherent ID/position swap that could
  route the wrong account and missing post-assignment rollback coverage. Both
  were reproduced and fixed; technical re-review reported no remaining P0-P3.
- Independent UX/accessibility review found ambiguous duplicate labels, false
  all-zero review guidance, browser-local wording, a duplicate failure
  announcement, and insufficient scaled journey depth. All were corrected;
  UX re-review reported no remaining P0-P3.
- Independent evidence review kept the broader capability at
  `prioritize-local`, required a stale-ID browser journey, removed causal
  benefit wording, and caught the stale active handoff. The journey, artifact,
  generated report, and this handoff were corrected without changing the
  6/6/6/2 disposition counts.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 61 files, 729 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 verifier tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 89 production-Chromium journeys
  passed, including 5 Guided Account Overview journeys.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `cd mobile && npm run ios:copy`, `npm run verify:ios-sync`,
  `npm run ios:sync`, then `npm run verify:ios-sync` — exit 0. Vite transformed
  84 modules; the existing >500 kB warning remains. Six production files matched
  the iOS public copy byte-for-byte with SHA-256
  `3d160a77dda85950456619a733d6b1642d70fd52240091be4b9cf629495fc335`.
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly skipped
  CocoaPods/xcodebuild on Linux; every native acceptance row remained NOT RUN.
- `cd docs/mobile/tradezella-parity && node build-report.mjs artifact.json
  report.html` — exit 0; validation, packaging, source keyboard interaction,
  1440/390 responsive checks, and script-stripped fallback checks passed for 11
  blocks, 1 chart, 1 metric strip, and 1 table. Fallback client/scroll widths
  reconciled at 1425/1425 desktop and 375/375 mobile.
- `jq` reconciliation of `capability-ledger.json` — 20 total, 20 unique IDs;
  shipped 6, prioritize-local 6, gated-funded 6, intentional-non-goal 2.
- SHA-256: report HTML
  `f2a8a760a3950ee17a65315fa42eec7791e52125441e547a2db9d9182213b533`;
  artifact JSON
  `27e245e75e80d84c6d853a4fb819b7dca9fd8821e86c0bc55410912bafda1ea4`;
  capability ledger
  `86c460b00207213f002516946f9f9c80e25c21cf5c18e7db1ca7e6f47d3edb11`;
  priority SQL
  `564f5d2066b81527b44f64d28d60bee728ed3a13e3c7a5b31c809d2f41aac45e`.
- `node --check build-report.mjs` and `git diff --check` — exit 0.
- Handoff topology checks — 1 current section, 34 prior-milestone markers, and
  35 complete `task/stage/lane/produced/verified/assumptions/open` schema
  blocks.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/report slice
  does not touch legacy Python and this checkout has no complete project venv.
  The hosted Legacy Python safety job remains required.

assumptions:

- “Deep link” here means exact in-app navigation into existing Trade Browser
  state, not a URL router or externally addressable route.
- Reset-all is intentional: retaining dates, day scope, search, or facets would
  make the overview count disagree with hidden destination filters.
- The current ledger snapshot and its retained account order remain the source
  of truth. Duplicate-label qualification is presentation only and does not
  alter durable IDs or labels.
- This increment is intended to reduce activation ambiguity; no causal product
  impact, completion-rate gain, or moderated usability threshold has been
  measured yet.
- Browser and Linux bundle evidence does not replace SQLite/WKWebView,
  SQLCipher, Keychain, VoiceOver, Dynamic Type, lifecycle, Simulator, or
  physical-device proof.

open:

- Exact-commit hosted Mobile Linux and Legacy Python jobs remain required after
  publication before this milestone can be passed downstream.
- The branch-specific manual and generic-CSV activation paths must still be
  moderated from capture (including CSV receipt reconciliation) through exact
  account scope to the correct review. The required 4-of-5 completion gate is
  NOT RUN and cannot be satisfied by automated browser tests.
- Five further local-first priorities remain: saved views; named broker CSV
  packs with cleared fixtures; playbook/template management; deeper reports
  behind definition gates; and native lifecycle/attachments behind Mac/iPhone
  evidence and deletion approval.
- Credentialed broker/prop sync, licensed replay, reproducible backtesting,
  private AI, mentor/community services, and pricing/packaging remain
  gated-funded domains requiring explicit product, rights, security, privacy,
  commercial, moderation, recurring-cost, and human decisions.
- HOLD all native acceptance. CocoaPods, Xcode compile, Simulator, physical
  iPhone, SQLite/SQLCipher/Keychain, Files/photos, safe areas, interruption,
  background/foreground, force-quit/relaunch, multi-scene, VoiceOver, and
  Dynamic Type were NOT RUN.
- Existing human gates remain: Symbol Breakdown eligibility; generic-CSV
  asset-class semantics; atomic batch durable recovery; approved Delete All
  Data; and removal, wrapping, or explicit acceptance of the pinned SQLite
  plugin's HTTP-download bridge and database-path console print.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim full TradeZella parity, representative popularity causality,
  native readiness, broader asset/broker support, hosted Connect, Android,
  recurring AI, TestFlight/App Store submission, public pricing, execution,
  advice, or comparative superiority from this milestone.
- The user's autonomous parity goal remains active. Once exact hosted CI and
  fleet filing are complete, the next autonomous local-first candidate is saved
  views while the human branch-activation gate is scheduled separately.

## Prior milestone — TradeZella Benefit Parity Foundation v1

> Historical snapshot; current status and open items are superseded by the
> active Guided Account Overview v1 handoff above.

Status: verified TradeZella Benefit Parity Foundation v1 · updated 2026-07-17

### Historical handoff

task: Deliver a source-backed TradeZella Benefit Parity Foundation v1 and two
bounded local-first benefits—Import Receipt Reconciliation v1 and Daily
Reflection Rhythm v1—without claiming literal suite parity or changing Hermes's
schema, financial definitions, durable command ownership, network boundary, or
native-readiness status.

stage: codex

lane: fleet-handoff

produced:

- A dated capability/popularity benchmark now separates advertised TradeZella
  capabilities, public sentiment/traffic signals, inference, and Hermes roadmap
  decisions. Twenty unique benefit domains reconcile to 6 shipped,
  6 prioritize-local, 6 gated-funded, and 2 intentional non-goals. Public
  evidence supports awareness and satisfaction, not paid-user scale, retention,
  profitability, trader outcomes, or which factor causes popularity.
- The `docs/mobile/tradezella-parity/` report directory contains the canonical
  JSON artifact, capability ledger, three SQL queries, builder, and portable
  HTML. The HTML embeds the artifact and its rendered/query snapshots. The
  repository-local builder applies fail-loud scrollbar-safe patches to the
  installed analytics reader and semantic fallback without modifying the
  plugin, then browser-checks both enhanced and script-stripped surfaces.
- Current first-party pricing is dated to the July 14, 2026 effective help
  article: Essential $35 monthly/$315 yearly, Pro $59/$531, and Ultra $99/$891.
  Stale public price and undefined 50+/300+ report/data denominators remain
  labeled as conflicting marketing surfaces. Broker marketing's 500+ claim is
  kept distinct from the current operational help list's 13 sync connections and
  39 file-upload rows, including 2 marked coming soon.
- **Import Receipt Reconciliation v1** projects immutable receipt counts into
  source, accepted, rejected, skipped, new-or-restored execution versions,
  already-present rows, and warnings. Conservation is exact; duplicate copy no
  longer implies a new write; fictional demo history is explicitly read-only;
  and exact live rollback returns visible keyboard focus to the rebuilt receipt.
- **Daily Reflection Rhythm v1** classifies the latest seven strict,
  chronological, unique trading-session dates as completed, draft, or missing
  from current daily heads and computes only the maximal completed suffix ending
  at the latest session. It ignores P&L, outcomes, trade-review state, note
  content, tags, emotion, and process score; no-trade reflection remains
  separate. Missing → draft → completed continuation reuses the existing Daily
  Journal editor and save path.
- README, product blueprint, iOS roadmap, local-ledger contract, Mac handoff,
  competitive analysis, and this handoff now cover 27 bounded Slice D
  increments, 23 derived-only presentation/projection increments, and the same
  4 write-capable exceptions. Schema v4, five tabs, ten report targets, eight
  Hermes-governed reports, and every existing durable owner remain unchanged.
- No migration, archive/digest/export/restore shape, import/review/day write
  command, governed-report formula/cohort/version/checksum, credential,
  dependency, native source, destructive workflow, broker permission, order
  execution, advice surface, or public profit leaderboard was added.

verified:

- Regression-first product proof: the new unit suites initially failed because
  the projections did not exist. Three targeted browser journeys then failed on
  the old ambiguous accepted-row announcement and missing demo read-only copy;
  the same journeys passed after the focused UX correction.
- Independent technical/security review reported no P0-P3 findings and kept
  native readiness held. Independent UX/accessibility review found the receipt
  copy/demo gaps; after correction, its critical 320px/200%-text keyboard
  rollback journey passed and final re-review reported no remaining P0-P3.
- Independent evidence review reconciled all 20 unique domains and 6/6/6/2
  dispositions, then caught the stale handoff/pricing, unsupported governance
  and causal wording, source-denominator leakage, and fallback-overflow path.
  The dated source copy, factual observations, artifact timestamps, current
  handoff, and both report surfaces were corrected before publication.
- `jq` reconciliation of `capability-ledger.json` — 20 total, 20 unique IDs;
  gated-funded 6, intentional-non-goal 2, prioritize-local 6, shipped 6.
- `cd docs/mobile/tradezella-parity && node build-report.mjs artifact.json
  report.html` — exit 0; validation, packaging, and browser
  verification passed for 11 blocks, 1 chart, 1 metric strip, and 1 table;
  source dialog/keyboard semantic click passed at 1440/390 widths. Script-stripped
  fallback QA passed with desktop client/scroll 1425/1425 and mobile 375/375.
- `cd mobile && npm ci` — exit 0; 164 packages installed, 0 vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 59 files, 721 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 verifier tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 84 production-Chromium journeys
  passed after the final UX correction.
- `cd mobile && npm run ios:copy`, `npm run verify:ios-sync`,
  `npm run ios:sync`, then `npm run verify:ios-sync` — exit 0. Vite transformed
  82 modules; the existing >500 kB warning remains. Six production files matched
  the iOS public copy byte-for-byte with SHA-256
  201c9b18e25cf5251d76c5d622d061be62400f800d5e9331f756a2a3d72188dc.
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly skipped
  CocoaPods/xcodebuild on Linux; every native acceptance row remained NOT RUN.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- JSON syntax, builder syntax, generated-bundle drift, documentation schema
  counts, and `git diff --check` passed. This handoff preserves one current
  section, 33 historical milestone/snapshot markers, and 34 complete schema
  blocks.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/report slice
  does not touch legacy Python and this checkout has no complete project venv.
  The hosted Legacy Python safety job remains required.

assumptions:

- “Benefit parity” means a source-backed benefit taxonomy plus an original
  Hermes disposition, not completion of every TradeZella feature, entitlement,
  integration, or commercial service. The chart is a decision count, never a
  feature-completion percentage.
- TradeZella's official help/product pages establish advertised capability;
  Trustpilot, Semrush, affiliate, comparison, and marketing counts are dated,
  directional evidence with selection, estimation, commercial, and denominator
  caveats. No public source establishes representative user scale or causality.
- The official pricing help article is the current July 14 snapshot; all
  competitor price, entitlement, integration, mobile, and security claims must
  be reverified immediately before external comparison.
- Receipt reconciliation is limited to fields exposed consistently by both
  existing store adapters. It cannot display raw source rows/issues or split
  created from restored versions without a separately approved contract.
- Reflection rhythm owns no durable state and creates no trading-frequency,
  risk, P&L, or score incentive. Current daily heads and session dates remain the
  source of truth.
- Browser and Linux bundle evidence does not replace SQLite/WKWebView,
  SQLCipher, Keychain, VoiceOver, Dynamic Type, lifecycle, Simulator, or
  physical-device proof.

open:

- Exact-commit hosted Mobile Linux and Legacy Python jobs remain required after
  publication before this milestone can be passed downstream.
- Six local-first priorities remain, in order: guided activation/account
  overview; saved views; named broker CSV packs with cleared fixtures;
  playbook/template management; deeper reports behind definition gates; and
  native lifecycle/attachments behind Mac/iPhone evidence and deletion approval.
- Credentialed broker/prop sync, licensed replay, reproducible backtesting,
  private AI, mentor/community services, and pricing/packaging remain
  gated-funded domains requiring explicit product, rights, security, privacy,
  commercial, moderation, recurring-cost, and human decisions.
- HOLD all native acceptance. CocoaPods, Xcode compile, Simulator, physical
  iPhone, SQLite/SQLCipher/Keychain, Files/photos, safe areas, interruption,
  background/foreground, force-quit/relaunch, multi-scene, VoiceOver, and
  Dynamic Type were NOT RUN.
- Existing human gates remain: Symbol Breakdown eligibility; generic-CSV
  asset-class semantics; atomic batch durable recovery; approved Delete All
  Data; and removal, wrapping, or explicit acceptance of the pinned SQLite
  plugin's HTTP-download bridge and database-path console print.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim complete TradeZella parity, representative popularity causality,
  native readiness, broader asset/broker support, hosted Connect, Android,
  recurring AI, TestFlight/App Store submission, public pricing, execution,
  advice, or comparative superiority from this milestone.
- The user's autonomous parity goal remains active. After publication, exact
  hosted CI, and ORACLE filing, the next bounded local candidate is guided
  activation/account overview; none of the gated-funded or native work is
  authorized by this handoff.

## Prior milestone — CSV Preview Feedback Focus v1

> Historical snapshot; current status and open items are superseded by the
> active Guided Account Overview v1 handoff above.

Status: verified CSV Preview Feedback Focus v1 · updated 2026-07-17

### Historical handoff

task: Deliver CSV Preview Feedback Focus v1: make every explicit CSV preview
outcome visibly own its feedback focus while preserving authored inputs,
selected-file ownership, current asynchronous intent, existing mapping/commit
behavior, and every durable ledger, receipt, report, archive, digest, route,
preference, and financial definition.

stage: codex

lane: fleet-handoff

produced:

- Explicit **Preview CSV** outcomes now own visible feedback. Missing-file,
  over-5-MiB, read, and synchronous preparation failures clear transient stale
  preview/commit state, retain authored account/time-zone/currency plus the
  selected file when present, keep existing copy, and focus the live status.
  Ready and invalid prepared previews focus their exact title.
- `#import-status` and `#preview-title` are programmatically focusable and have
  a scoped pointer-safe focus outline. The shared focus handoff scrolls its
  target to the center, then focuses without a second scroll so status, title,
  and final mapping commit remain visible between app chrome.
- A monotonic preview generation plus exact selected-File identity now guards
  `File.text()`. Any input/file change or newer submit supersedes an in-flight
  read; its late resolve or rejection returns silently and cannot replace newer
  content, file ownership, status, preview, commit availability, or focus.
- Invalid previews retain open mapping/issues and no commit. Ready counts,
  mapping, and commit behavior remain unchanged. Mapping rerenders still focus
  the changed selector until the last required mapping, then focus the existing
  commit action. Ordinary input/file changes retain their current control focus.
- Production Chromium covers early failures at 320 CSS pixels/200% text;
  ready/invalid preview and final mapping at 320/421/568 pixels/200% text;
  static and sticky chrome; stale option/file reads; retained values/file;
  stale-surface removal; no horizontal overflow; unchanged local storage, zero
  external requests, empty import history, and correction to the existing commit
  path without committing in the new tests.
- README, product blueprint, roadmap, local-ledger contract, Mac handoff, and
  this active handoff now cover twenty-five bounded Slice D increments,
  twenty-one derived-only presentation/projection increments, and the same four
  write-capable exceptions. Schema v4, five tabs, ten report targets, and eight
  governed reports remain unchanged.
- No migration, store command, receipt/recovery contract, execution/review/day
  fact, export/restore shape, archive or digest input, governed report version/
  checksum/cohort/formula, route, preference, preset, dependency, credential,
  native source, destructive workflow, or public comparative claim changed.

verified:

- Regression-first focus proof: the three original targeted CSV journeys failed
  on the missing status/title focus targets, then passed after implementation.
- Independent review found and reproduced an asynchronous stale-read blocker.
  Its delayed-read journey first failed because an options change left the old
  read active; after the generation/file-identity guard, all four targeted CSV
  journeys passed. Final technical/security and UX/accessibility re-reviews
  reported no remaining P0-P3 findings.
- cd mobile && npm ci — exit 0; 164 packages installed, 0 vulnerabilities.
- cd mobile && npm run typecheck — exit 0.
- cd mobile && npm run test:boundary — exit 0; 1 file, 2 tests passed.
- cd mobile && npm test — exit 0; 55 files, 691 tests passed.
- cd mobile && npm run test:ios-sync — exit 0; all 8 verifier tests passed.
- cd mobile && npm run test:e2e — exit 0; all 80 production-Chromium journeys
  passed.
- cd mobile && npm run ios:copy — exit 0; Vite transformed 78 modules and copied
  the production bundle. The existing >500 kB chunk warning remains visible.
- cd mobile && npm run verify:ios-sync — exit 0 before and after sync; 6
  production files matched the iOS public copy byte-for-byte with SHA-256
  305d130a92feb527be97a1263da5e5429da4d14059f972c11ef3506cce6da5ee.
  Generated Capacitor identity/SQLite registration and tracked drift passed;
  every native evidence row remained NOT RUN.
- cd mobile && npm run ios:sync — exit 0 as a Linux compatibility check;
  Capacitor found only @capacitor-community/sqlite@8.1.0 and explicitly skipped
  CocoaPods and xcodebuild because neither is installed.
- cd mobile && npm audit --omit=dev — exit 0; 0 vulnerabilities.
- Native/lock drift, documentation structure, and whitespace checks passed.
  Exactly nine intended files changed; this handoff preserves one current
  section, thirty-two historical milestone/snapshot markers, and thirty-three
  complete schema blocks.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/UI slice does
  not touch legacy Python and this checkout has no complete project venv. The
  hosted Legacy Python safety job must provide independent evidence.

assumptions:

- The form DOM remains the owner of authored import controls and selected-file
  identity. The binder owns transient raw source text, source name, prepared
  preview, preview generation, and focus. JournalApplication and JournalStore
  remain the only durable execution owners after explicit commit.
- The preview generation is monotonic for the binder lifetime and increments on
  every submit, governed option input, and file change. Both generation and
  selected-File identity must still match after asynchronous read completion;
  stale completion intentionally performs no UI, preparation, or durable work.
- `#import-status` owns early failure/live feedback; `#preview-title` owns a
  successfully prepared ready/invalid result; mapping selectors and the existing
  commit action retain remap focus ownership.
- Browser local-storage/request/import-history evidence and inspected pre-commit
  control flow support write neutrality. This does not replace native SQLite,
  WKWebView, VoiceOver, lifecycle, SQLCipher, Keychain, or physical-device proof.

open:

- Exact-commit hosted Mobile Linux and Legacy Python jobs remain required after
  publication before the milestone can be closed.
- HOLD native CSV Preview Feedback Focus acceptance: repeat missing, over-5-MiB,
  read, preparation, stale-option-read, and stale-file-read outcomes with
  VoiceOver, hardware keyboard, safe areas, 320/421-width 200% Dynamic Type,
  wider sticky chrome, background/foreground, force-quit/relaunch, and two live
  scenes. Preserve exact values/file/focus, reject superseded completion, expose
  no stale commit or failed-attempt SQLite/network work, retain mapping targets,
  and prove correction reaches the unchanged commit path.
- HOLD native Manual Entry Validation Focus, Dashboard Review Return Focus,
  Exact Scoped Activity-Day Stepper, Daily Reflection Return Focus, Calendar-Day
  Reflection Continuation, Review Queue Focus, Exact Setup Facet, Dashboard
  Recent Trade Continuation, and Review Session Coverage acceptance; browser
  evidence does not satisfy their Mac/iPhone rows.
- HOLD the separate Opening Time Mix candidate until its governed grouping is
  explicit: four broad named bands and 24 workspace-local clock hours are
  materially different product definitions.
- HIGH — HUMAN GATE: the unpublished Symbol Breakdown draft needs a corrected
  current-review-head and draft/completed eligibility definition.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery requires an approved
  durable batch receipt plus schema/migration/export/restore behavior.
- HIGH — SECURITY/HUMAN GATE: decide whether to remove, wrap, or explicitly
  accept the pinned SQLite plugin HTTP-download bridge and database-path console
  print before release.
- Attachments, verified Delete All Data, saved presets, persistent/report scope,
  fuller management, remaining report families, and native restore/backup
  acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- After publication, exact hosted CI, and ORACLE filing, stop at the clean
  boundary; do not begin another slice.

## Prior milestone — Manual Entry Validation Focus v1

> Historical snapshot; current status and open items are superseded by the
> active CSV Preview Feedback Focus v1 handoff above.

Status: verified Manual Entry Validation Focus v1 · updated 2026-07-16

### Historical handoff

task: Deliver Manual Entry Validation Focus v1: keep synchronous
manual-preparation validation feedback visible and focused inside the sheet
while preserving every authored value, modal ownership, the single open-time
submission identity, unchanged correction/dismissal paths, and every
persistence, report, archive, digest, route, preference, and financial
definition.

stage: codex

lane: fleet-handoff

produced:

- When **Review execution** synchronously fails existing preparation
  validation, the manual form remains rendered, every authored control value is
  retained, the screen remains inert behind the modal, and the review/save
  surface stays unavailable. Existing field-specific copy remains owned by the
  existing `#manual-entry-error` alert.
- The alert is now programmatically focusable with `tabindex="-1"`. Hermes
  unhides it, centers it with `scrollIntoView` inside the independently
  scrolling sheet, then gives it visible focus without a second scroll. The
  scoped focus outline is also visible for pointer-triggered programmatic focus,
  which does not consistently match `:focus-visible`.
- The sheet still creates one submission ID when it opens. A validation failure
  creates or rotates no additional identity and calls no commit, store, or
  network path. Durable execution truth remains owned by JournalApplication and
  JournalStore; values, alert state, focus, and scroll position remain transient
  DOM presentation.
- Correcting the rejected value continues through the unchanged normalization,
  timestamp/decimal validation, preparation, review, persistence, and recovery
  path. Cancel, Escape, close-button, and backdrop dismissal retain their exact
  connected-trigger return behavior.
- Production Chromium now covers the failure and correction contract at 320
  and 421 CSS pixels with 200% text: visible focused alert and outline,
  inner-sheet-only centering, zero horizontal overflow, retained values,
  retained form/modal/inert ownership, unavailable review/save, adjacent Tab
  reachability, unchanged local storage, zero requests, successful correction,
  Save focus, and exact Escape return.
- README, product blueprint, roadmap, local-ledger contract, Mac handoff, and
  this active handoff now cover twenty-four bounded Slice D increments, twenty
  derived-only presentation/projection increments, and the same four
  write-capable exceptions. Schema v4, five tabs, ten report targets, and eight
  governed reports remain unchanged.
- No migration, new store command, preparation/receipt/recovery contract,
  execution or review fact, export/restore shape, archive or digest input,
  governed report version/checksum/cohort/formula, route, preference, preset,
  dependency, credential, native source, destructive workflow, or public
  comparative claim changed.

verified:

- Regression-first browser proof — the two impacted journeys initially failed
  on the missing alert focus target, then passed after the implementation.
- cd mobile && npm ci — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- cd mobile && npm run typecheck — exit 0.
- cd mobile && npm run test:boundary — exit 0; 1 file, 2 tests passed.
- cd mobile && npm test — exit 0; 55 files, 691 tests passed.
- cd mobile && npm run test:ios-sync — exit 0; all 8 verifier tests passed.
- cd mobile && npm run test:e2e — exit 0; all 78 production-Chromium journeys
  passed, including all 5 focused Manual Entry journeys.
- cd mobile && npm run ios:copy — exit 0; Vite transformed 78 modules and copied
  the production bundle. The existing >500 kB chunk warning remains visible.
- cd mobile && npm run verify:ios-sync — exit 0 before and after sync; 6
  production files matched the iOS public copy byte-for-byte with SHA-256
  cdf2241ebbca72135531a6c0342e7c9e29e8c1d40f233b38946abced30582f15.
  Generated Capacitor identity/SQLite registration and tracked drift passed;
  every native evidence row remained NOT RUN.
- cd mobile && npm run ios:sync — exit 0 as a Linux compatibility check;
  Capacitor found only @capacitor-community/sqlite@8.1.0 and explicitly skipped
  CocoaPods and xcodebuild because neither is installed.
- cd mobile && npm audit --omit=dev — exit 0; 0 vulnerabilities.
- Native/lock drift, documentation structure, and whitespace checks passed.
  Exactly nine intended files changed; the handoff preserves one current
  section, thirty-one historical milestone/snapshot markers, and thirty-two
  complete schema blocks.
- Final independent product/docs, technical/security, and UX/accessibility
  reviews found no open P0-P3 issue. The product review's one P2 lifecycle-
  wording finding was corrected and passed focused re-review.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/UI slice does
  not touch legacy Python and this checkout has no complete project venv. The
  hosted Legacy Python safety job must provide independent evidence after
  publication.

assumptions:

- Existing preparation validation and field-specific messages remain the sole
  owners of manual-input acceptance. This slice changes presentation after a
  synchronous failure; it does not introduce field-level `aria-invalid`
  mapping or first-invalid-control focus.
- Manual form controls own raw authored values. The binder closure owns its one
  submission ID plus prepared, saving, and uncertain state. JournalApplication
  and JournalStore remain the only durable execution owners.
- `application.prepareManual()` still runs synchronously after the open-time
  submission identity exists. Its failure occurs before commit/store/network
  work; correction resubmits through the same preparation and save path.
- The existing `#manual-entry-error` owns pre-review validation feedback,
  `#manual-save-error` owns save failures, and the route announcer owns
  confirmed success feedback. Account-list load failure remains a separate
  existing alert path outside this slice.
- Browser evidence uses the ephemeral development store and production
  Chromium. It is not native SQLite durability, WKWebView, VoiceOver,
  hardware/onscreen-keyboard, lifecycle, Dynamic Type, safe-area, SQLCipher,
  Keychain, or physical-iPhone evidence.

open:

- Exact-commit hosted Mobile Linux and Legacy Python jobs remain required after
  publication before the milestone can be closed.
- HOLD native Manual Entry Validation Focus acceptance: repeat invalid account,
  symbol, decimal, time-zone, and offset failures with VoiceOver, hardware and
  onscreen keyboards, safe areas, 320/421-width 200% Dynamic Type,
  background/foreground, and two live scenes. While the originating scene
  remains alive, preserve every value, form/modal/inert ownership, unavailable
  review/save, the single open-time identity, inner-sheet-only scroll, exact
  correction, zero failed-attempt commit/SQLite/network work, and exact-trigger
  return. After a failed attempt, force-quit/relaunch separately: no execution,
  command, authored form, modal, alert, focus, or open-time identity may be
  restored, and opening Manual Entry must start a fresh sheet with a fresh
  identity.
- HOLD native Dashboard Review Return Focus, Exact Scoped Activity-Day Stepper,
  Daily Reflection Return Focus, Calendar-Day Reflection Continuation, Review
  Queue Focus, Exact Setup Facet, Dashboard Recent Trade Continuation, and
  Review Session Coverage acceptance; browser evidence does not satisfy their
  Mac/iPhone rows.
- HOLD the separate Opening Time Mix candidate until its governed grouping is
  explicit: four broad named bands and 24 workspace-local clock hours are
  materially different product definitions.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- HIGH — SECURITY/HUMAN GATE: decide whether to remove, wrap, or explicitly
  accept the pinned SQLite plugin's unused HTTP-download bridge and database-
  path console print before release. Do not claim zero native network
  capability or console-path privacy while they remain.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining report families, and native
  restore/backup acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- After this slice is published, hosted CI is exact, and ORACLE filing is
  verified, stop at the clean boundary; do not begin a subsequent slice.

## Prior milestone — Dashboard Review Return Focus v1

> Historical snapshot; current status and open items are superseded by the
> Manual Entry Validation Focus v1 historical milestone above.

Status: verified Dashboard Review Return Focus v1 · updated 2026-07-16

### Historical handoff

task: Deliver Dashboard Review Return Focus v1: return a confirmed Weekly
Review Rhythm save to the exact rebuilt Dashboard review heading while
preserving fail-closed review-queue ordering, exact origin identity, existing
review recovery ownership, and every persistence, report, archive, digest,
route, preference, and financial definition.

stage: codex

lane: fleet-handoff

produced:

- Dashboard now derives its one next-review CTA and waiting/clear display from
  the existing deeply frozen, fail-closed `buildReviewQueue` projection.
  **Drafts** remain first, **Not started** second, and canonical snapshot order
  is retained within each group. The reconciled waiting count includes every
  unfinished closed review; the heading becomes **Review queue clear** only
  when that projection is empty.
- Weekly Review Rhythm renders one structurally marked card and one
  programmatically focusable heading. While waiting, the card, heading, sole
  marked origin action, and stable trade subject must agree. A missing origin
  marker is invalid when a review action still appears inside the Dashboard
  rhythm card; malformed, duplicated, detached, tampered, unknown, or
  conflicting origin structure is rejected before modal markup, random
  submission identity, background inerting, or persistence.
- Dashboard-origin open failures use one compact generic alert positioned
  between measured top and bottom chrome. The alert receives visible focus,
  remains fully readable at 320/421 CSS pixels with 200% text, and exposes no
  private adapter detail.
- Ordinary Cancel, Escape, close-button, and backdrop dismissal return to the
  exact connected Dashboard CTA. After a confirmed direct save,
  exact-command replay, or known-commit refresh-only retry redraws Dashboard,
  the result is announced and focus moves to the unique rebuilt Weekly Review
  Rhythm heading showing the new waiting/clear state.
- Missing or duplicate post-refresh rhythm headings fall to the unique screen
  after the confirmed write without repeating persistence. Uncertain, stale,
  blocked, and committed-but-not-refreshed states retain their existing modal
  ownership; Hermes does not auto-open the next trade.
- Dashboard recent-trade rows, report-origin reviews, Trades actions, and
  Journal queue actions retain their prior focus and recovery behavior. The
  touched Dashboard summary also uses correct singular/plural draft copy.
- Production Chromium proves removed-origin, subject-tamper, and duplicated-card
  rejection before randomness/storage; direct draft and completion; final
  clear-state focus; exact-trigger cancel; exact replay; committed-refresh-only
  recovery; missing/duplicate rebuilt-heading screen fallback; one immutable
  review chain; no network work; 44-point actions; visible keyboard focus;
  fully visible failure alerts; and no overflow at 320/421 pixels with 200%
  text.
- README, product blueprint, roadmap, local-ledger contract, Mac handoff, and
  this active handoff now cover twenty-three bounded Slice D increments,
  nineteen derived-only presentation/projection increments, and the same four
  write-capable exceptions. Schema v4, five tabs, ten report targets, and eight
  governed reports remain unchanged.
- No migration, new store command, review receipt or recovery contract,
  export/restore shape, archive or digest input, governed report
  version/checksum/cohort/formula, route, preference, preset, dependency,
  credential, native source, destructive workflow, or public comparative claim
  changed.

verified:

- cd mobile && npm ci — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- cd mobile && npm run typecheck — exit 0.
- cd mobile && npm run test:boundary — exit 0; 1 file, 2 tests passed.
- cd mobile && npm test — exit 0; 55 files, 691 tests passed.
- cd mobile && npm run test:ios-sync — exit 0; all 8 verifier tests passed.
- cd mobile && npm run test:e2e — exit 0; all 77 production-Chromium journeys
  passed after missing-origin, narrow-error, visible-focus, and archive-order
  hardening.
- cd mobile && npm run build — exit 0; Vite transformed 78 modules. The existing
  >500 kB chunk warning remains visible.
- cd mobile && npm run ios:copy plus npm run verify:ios-sync — exit 0; 6
  production files matched the iOS public copy byte-for-byte with SHA-256
  b42f5a50ea63638f52368b6877a989026c922e127ab53dec2627b877facec7dc.
  Generated Capacitor identity/SQLite registration and tracked drift passed;
  every native evidence row remained NOT RUN.
- cd mobile && npm run ios:sync — exit 0 as a Linux compatibility check;
  Capacitor found only @capacitor-community/sqlite@8.1.0 and explicitly skipped
  CocoaPods and xcodebuild because neither is installed.
- cd mobile && npm audit --omit=dev — exit 0; 0 vulnerabilities.
- git diff --check, native/lock drift, and handoff-structure checks — exit 0.
  The active handoff preserves thirty historical milestone markers and thirty-
  one complete task/stage/lane/produced/verified/assumptions/open schema blocks.
- Initial independent technical/security and UX/accessibility reviews found a
  missing-origin bypass, absent visible heading focus, narrow-error occlusion,
  and one order-sensitive archive assertion; each finding was reproduced and
  closed before the full gate.
- Final independent technical/security, product, and UX/accessibility
  re-reviews found no open P0-P3 issue after the fixes and fresh verification
  above.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/UI slice does
  not touch legacy Python and this checkout has no complete project venv. The
  hosted Legacy Python safety job must provide independent evidence after
  publication.

assumptions:

- `buildReviewQueue` remains the sole coherent owner of unfinished review
  classification and order. `reviewProgress.pendingTrades` intentionally means
  every closed review not yet completed and is reconciled against drafts plus
  not-started trades despite its historical field name.
- Durable review state remains owned by JournalApplication/JournalStore.
  Dashboard origin markers, focus targets, alerts, and waiting/clear rendering
  are transient DOM presentation only.
- Origin validation occurs before modal creation and command preparation.
  Return focus occurs only after confirmed persistence and an awaited fresh
  Dashboard render; fallback focus never invokes persistence.
- Browser evidence uses the ephemeral development store and production
  Chromium. It is not native SQLite durability, WKWebView, VoiceOver,
  hardware-keyboard, lifecycle, Dynamic Type, safe-area, SQLCipher, Keychain,
  or physical-iPhone evidence.

open:

- HOLD native Dashboard Review Return Focus acceptance: repeat exact
  draft-first/not-started order, waiting/clear heading, connected-trigger
  dismissal, direct save, exact replay, known-commit refresh-only return,
  missing/duplicate-heading fallback, malformed-origin rejection, unresolved
  recovery ownership, visible errors/focus, and unchanged recent/report/queue
  behavior with VoiceOver, hardware keyboard, safe areas, 320/421-width 200%
  Dynamic Type, background/foreground, force-quit/relaunch, and two scenes.
- HOLD native Exact Scoped Activity-Day Stepper, Daily Reflection Return Focus,
  Calendar-Day Reflection Continuation, Review Queue Focus, Exact Setup Facet,
  Dashboard Recent Trade Continuation, and Review Session Coverage acceptance;
  browser evidence does not satisfy their Mac/iPhone rows.
- HOLD the separate Opening Time Mix candidate until its governed grouping is
  explicit: four broad named bands and 24 workspace-local clock hours are
  materially different product definitions.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- HIGH — SECURITY/HUMAN GATE: decide whether to remove, wrap, or explicitly
  accept the pinned SQLite plugin's unused HTTP-download bridge and database-
  path console print before release. Do not claim zero native network
  capability or console-path privacy while they remain.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining report families, and native
  restore/backup acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- Re-audit current main after publication and choose the next bounded,
  persistence-neutral product slice; the continuous user goal remains active.

## Prior milestone — Exact Scoped Activity-Day Stepper v1

> Historical snapshot; current status and open items are superseded by the
> Dashboard Review Return Focus v1 historical milestone above.

Status: verified Exact Scoped Activity-Day Stepper v1 · updated 2026-07-16

### Historical handoff

task: Deliver Exact Scoped Activity-Day Stepper v1: move a selected Trades day
to the exact previous or next retained account/date-scoped activity session
while preserving live query and all eight card facets, crossing month and
no-activity gaps, and changing no persistence, schema, report, archive, digest,
preference, or financial definition.

stage: codex

lane: fleet-handoff

produced:

- Trade Browser now exposes a pure adjacent-day projection over its validated,
  frozen, strictly ascending scoped-calendar cohort. The selected state,
  selected-session object, destination month, cohort count, canonical dates,
  strict order, uniqueness, and attached selected identity must reconcile.
  Search, exact card facets, visible cards, raw workspace dates, and the
  month-limited Dashboard calendar never redefine adjacency or position.
- The selected Trades day card renders a semantic **Scoped activity day
  navigation** group with visible position/count context and two native
  buttons. Previous/next names retain their visible labels and add the exact
  full destination date. First, last, and one-day cohorts keep unavailable
  directions present and natively disabled.
- Activation rebuilds Trade Browser from live session state, so query/facet
  edits made without a full redraw are retained. It requires exactly one
  selected card, date-qualified heading, stepper, previous control, and next
  control; current and target attributes must agree with the one exact adjacent
  cohort member.
- The candidate is built before assignment. Account, inclusive date bounds,
  query, all eight exact facets, and every scoped activity date must remain
  identical. Only selected day and its destination Dashboard month may change.
  Any unexpected redraw, announcement, or focus exception rolls state back to
  the last validated browser before the generic error is shown.
- A successful step redraws Trades, updates the selected Dashboard month/day,
  reconciles the exact allocation-day evidence and whole-workspace reflection
  continuation, announces direction plus cohort position and retained
  search/facet result, then scrolls and focuses the unique rebuilt
  date-qualified heading with a unique-screen fallback.
- A missing, detached, duplicated, malformed, nonadjacent, boundary, or
  tampered DOM/state identity leaves the old day and session state unchanged.
  Hermes removes stale error nodes, creates one generic focused alert with a
  refresh instruction, and explicitly centers its compact text between measured
  top and bottom chrome. The failure path never opens a modal, inerts the
  background, generates an ID, calls a store, writes storage, or makes a
  network request.
- Production Chromium proves a Jul 7 to Jul 9 gap skip and return with account,
  date range, query, and all eight exact facets retained; first/last/one-day
  boundaries; keyboard Enter/Space; cross-month Jun 30 to Jul 1 selection;
  nonadjacent target, malformed opposite direction, and cloned-control
  rejection; Daily Reflection refresh coherence; no local-storage/report/
  network change; 44-point controls; no overflow at 320/421 CSS pixels with
  200% text; a fully visible focused error above the fixed tab bar; and
  unobscured rebuilt-heading focus at 844 pixels.
- README, product blueprint, roadmap, local-ledger contract, Mac handoff, and
  this active handoff now cover twenty-two bounded Slice D increments,
  eighteen derived-only presentation/projection increments, and the same four
  write-capable exceptions. Schema v4, five tabs, ten report targets, and eight
  governed reports remain unchanged.
- No migration, store command, Daily Journal or review write path,
  export/restore shape, archive or digest input, governed report
  version/checksum/cohort/formula, route, preference, preset, dependency,
  credential, native source, destructive workflow, or public comparative claim
  changed.

verified:

- cd mobile && npm ci — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- cd mobile && npm run typecheck — exit 0.
- cd mobile && npm run test:boundary — exit 0; 1 file, 2 tests passed.
- cd mobile && npm test — exit 0; 55 files, 691 tests passed.
- cd mobile && npm run test:ios-sync — exit 0; all 8 verifier tests passed.
- cd mobile && npx playwright test e2e/calendar-day-drilldown.spec.ts — exit 0;
  all 4 calendar journeys passed after alert visibility and direction-cardinality
  hardening.
- cd mobile && npm run test:e2e — exit 0; all 75 production-Chromium journeys
  passed after final hardening.
- cd mobile && npm run build — exit 0; Vite transformed 78 modules. The existing
  >500 kB chunk warning remains visible.
- cd mobile && npm run ios:copy plus npm run verify:ios-sync — exit 0; 6
  production files matched the iOS public copy byte-for-byte with SHA-256
  a4d8e45dc314b932e82e8043fb9f8938d8f31e0fe4f3976516add903ab23f5fe.
  Generated Capacitor identity/SQLite
  registration and tracked drift passed; every native evidence row remained
  NOT RUN.
- cd mobile && npm run ios:sync — exit 0 as a Linux compatibility check;
  Capacitor found only @capacitor-community/sqlite@8.1.0 and explicitly skipped
  CocoaPods and xcodebuild because neither is installed.
- cd mobile && npm audit --omit=dev — exit 0; 0 vulnerabilities.
- git diff --check and native/lock drift checks — exit 0. The active handoff
  preserves all twenty-nine historical milestone markers.
- Independent product, technical/security, and UX/accessibility reviews passed
  after closing non-actionable error copy, fixed-tabbar alert occlusion,
  opposite-direction cardinality, and post-assignment rollback gaps. The final
  reviews found no open P0-P3 issue.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/UI slice does
  not touch legacy Python and this checkout has no complete project venv. The
  hosted Legacy Python safety job must provide independent evidence after
  publication.

assumptions:

- JournalWorkspaceSnapshot.calendar remains the coherent allocation-day
  projection. buildTradeBrowser remains the sole owner of account/date scoping,
  canonical sort, duplicate-date rejection, selected-day refinement, and
  ephemeral query/facet normalization.
- scopedCalendar means activity sessions inside the retained account and
  inclusive date range before optional selected-day refinement. It intentionally
  excludes dates without retained allocation evidence and is independent of
  visible-card search/facets and whole-workspace Daily Journal dates.
- Trade Browser state remains session-only. Changing selected day and displayed
  month is not a durable ledger or preference write, and governed Reports remain
  whole-workspace.
- Browser evidence uses the ephemeral development store and production
  Chromium. It is not native SQLite durability, WKWebView, VoiceOver,
  hardware-keyboard, lifecycle, Dynamic Type, safe-area, SQLCipher, Keychain,
  or physical-iPhone evidence.

open:

- HOLD native Exact Scoped Activity-Day Stepper acceptance: repeat scoped gap
  skipping, first/last/one-day boundaries, cross-month selection,
  account/date/query/all-eight-facet retention, malformed/tampered identity,
  exact reflection redraw, announcement order, focus visibility, 44-point
  controls, and zero durable writes with VoiceOver, hardware keyboard,
  320/421-width 200% Dynamic Type, safe areas, background/foreground,
  force-quit/relaunch, and two scenes.
- HOLD native Daily Reflection Return Focus, Calendar-Day Reflection
  Continuation, Review Queue Focus, Exact Setup Facet, Dashboard Recent Trade
  Continuation, and Review Session Coverage acceptance; browser evidence does
  not satisfy their Mac/iPhone rows.
- HOLD the separate Opening Time Mix candidate until its governed grouping is
  explicit: four broad named bands and 24 workspace-local clock hours are
  materially different product definitions.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- HIGH — SECURITY/HUMAN GATE: decide whether to remove, wrap, or explicitly
  accept the pinned SQLite plugin's unused HTTP-download bridge and database-
  path console print before release. Do not claim zero native network
  capability or console-path privacy while they remain.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining report families, and native
  restore/backup acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- Re-audit current main after publication and choose the next bounded,
  persistence-neutral product slice; the continuous user goal remains active.

## Prior milestone — Daily Reflection Return Focus v1

> Historical snapshot; current status and open items are superseded by the
> active Exact Scoped Activity-Day Stepper v1 handoff above.

Status: verified Daily Reflection Return Focus v1 · updated 2026-07-16

### Historical handoff

task: Deliver Daily Reflection Return Focus v1: return post-save Journal focus
to the exact rebuilt daily-reflection heading identified by the successfully
prepared command date, with fail-closed structural fallbacks and no persistence,
schema, report, archive, digest, preference, or financial-definition change.

stage: codex

lane: fleet-handoff

produced:

- Every rendered current Journal reflection is validated before markup and owns
  a canonical ISO-date card identity plus one programmatically focusable,
  ISO-derived heading identity. The heading's accessible name appends its
  escaped display date and canonical year, so repeated authored titles and
  untitled **Daily reflection** entries remain distinguishable. The enclosing
  article is named by that exact heading.
- The stable **Daily notes** heading is programmatically focusable. After a
  direct save, successful replay of a frozen exact command, or refresh-only
  recovery for a proven commit, Journal redraws before focus resolution. The
  resolver uses the successfully prepared command's validated `isoDate`, then
  requires exactly one same-date card and exactly one same-date heading.
- A missing or ambiguous exact target falls to exactly one **Daily notes**
  heading, then exactly one screen. Duplicate fallbacks are rejected rather
  than first-matched. Focus recovery is presentation-only and cannot issue or
  repeat a persistence command.
- Generic creation still reads the user's editable date while preparing the
  command. After preparation, focus never rereads that mutable DOM field or
  reverts to its pre-open newest-unoccupied default. Existing-entry continuation
  keeps its immutable date, and no path uses the rotating entry-version ID as
  presentation identity.
- Calendar-origin continuation retains first precedence for the same-date
  reflection/selected-day heading. Connected-trigger cancel return and modal
  ownership during uncertain, stale, blocked, and committed-but-not-refreshed
  recovery remain unchanged.
- Exact and fallback headings use the established safe-area-aware sticky-chrome
  scroll offset and visible focus outline. Production Chromium proves a
  changed generic date, date-qualified accessible names, direct create/edit,
  exact replay, stale-success and committed-refresh return, a missing exact
  target, ambiguous exact and fallback identities, final screen fallback, no
  external request, no horizontal overflow, and unobscured focus at 320, 421,
  and sticky-header 844 CSS pixels with 200% text.
- The restore-continuation journey now asserts the rebuilt restored entry's
  canonical card/heading identity and focus instead of the superseded generic
  screen return. Its archive, immutable history, and successor checks are
  unchanged.
- README, product blueprint, roadmap, local-ledger contract, and Mac handoff now
  cover twenty-one bounded Slice D increments, seventeen derived-only
  presentation/projection increments, and the same four write-capable
  exceptions: Durable Daily Journal, Report Trade Continuation, Dashboard
  Recent Trade Continuation, and Calendar-Day Reflection Continuation.
- No schema, migration, store command, Daily Journal preparation/commit
  algorithm, export/restore shape, archive or digest input, governed report
  version/checksum/definition, formula, preference, dependency, native source,
  credential, destructive workflow, or public comparative claim changed.

verified:

- cd mobile && npm ci — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- cd mobile && npm run typecheck — exit 0.
- cd mobile && npm run test:boundary — exit 0; 1 file, 2 tests passed.
- cd mobile && npm test — exit 0; 55 files, 688 tests passed.
- cd mobile && npm run test:ios-sync — exit 0; all 8 verifier tests passed.
- cd mobile && npx playwright test e2e/daily-journal.spec.ts — exit 0; all 9
  Daily Journal journeys passed after final hardening. The changed-date,
  exact-replay, sticky-width, and ambiguity journey also passed 1/1 in focused
  execution.
- cd mobile && npx playwright test e2e/user-data-restore.spec.ts --grep
  "restores a daily draft" — exit 0; the affected restore-continuation journey
  passed after migrating its focus assertion.
- cd mobile && npm run test:e2e — exit 0; all 73 production-Chromium journeys
  passed. An earlier 72/73 run exposed only the superseded restore screen-focus
  assertion; the affected journey and then the complete suite passed after that
  evidence was corrected.
- cd mobile && npm run build — exit 0; Vite transformed 78 modules. The existing
  >500 kB chunk warning remains visible.
- cd mobile && npm run ios:copy plus npm run verify:ios-sync — exit 0; 6
  production files matched the iOS public copy byte-for-byte with SHA-256
  1c823721b2b472f8b6ceb1166af363303af5b0771a554f28d922cd0091cb9df0.
  Generated Capacitor identity/SQLite registration and tracked drift passed;
  every native evidence row remained NOT RUN.
- cd mobile && npm run ios:sync — exit 0 as a Linux compatibility check;
  Capacitor found only @capacitor-community/sqlite@8.1.0 and explicitly skipped
  CocoaPods and xcodebuild because neither is installed.
- cd mobile && npm audit --omit=dev — exit 0; 0 vulnerabilities.
- git diff --exit-code -- mobile/ios mobile/package-lock.json and git diff
  --check — exit 0; no tracked native/lock drift or whitespace errors.
- Independent product, technical, UX/accessibility, and skeptical source
  reviews passed after closing the non-discriminating editable-date assertion,
  date-less accessible name, sticky-width evidence, and ambiguous fallback
  gaps. The final reviews found no open P0-P3 issue.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/UI slice does
  not touch legacy Python and this checkout has no complete project venv. The
  hosted Legacy Python safety job must provide independent evidence after
  publication.

assumptions:

- `JournalWorkspaceSnapshot.dailyJournal` remains the coherent canonical
  current-head projection with one validated head per workspace-local date.
- The successfully prepared Daily Journal command remains the sole owner of the
  saved ISO date, normalized content, immutable versioning, optimistic head,
  and idempotent submission identity. Focus consumes that result only after a
  confirmed commit and successful refresh.
- Daily reflections remain whole-workspace-date records. Account/activity/day
  scope, query, and all eight exact facets neither alter their write identity
  nor create separate reflections.
- Browser evidence uses the ephemeral development store and production
  Chromium. It is not native SQLite durability, WKWebView, VoiceOver,
  hardware-keyboard, lifecycle, Dynamic Type, SQLCipher, Keychain, or
  physical-iPhone evidence.

open:

- HOLD native Daily Reflection Return Focus acceptance: repeat direct create,
  changed-date generic create, edit, exact-command replay, known-commit
  refresh-only recovery, missing/ambiguous structural fallback, ordinary
  cancel, and every unresolved recovery state with VoiceOver, hardware keyboard,
  background/foreground, force-quit/relaunch, two-scene races, measured sticky
  chrome, and 320/421-width 200% Dynamic Type. Prove one write and the same
  prepared-date current head after each accepted save.
- HOLD native Calendar-Day Reflection Continuation, Review Queue Focus, Exact
  Setup Facet, Dashboard Recent Trade Continuation, and Review Session Coverage
  acceptance; their detailed procedures remain in historical handoffs and the
  Mac checklist. Browser evidence does not satisfy those native rows.
- HOLD the separate Opening Time Mix candidate until its governed grouping is
  explicit: four broad named bands and 24 workspace-local clock hours are
  materially different product definitions.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- HIGH — SECURITY/HUMAN GATE: decide whether to remove, wrap, or explicitly
  accept the pinned SQLite plugin's unused HTTP-download bridge and database-
  path console print before release. Do not claim zero native network
  capability or console-path privacy while they remain.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining report families, and native
  restore/backup acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- Re-audit Exact Scoped Activity-Day Stepper v1 as the next bounded,
  persistence-neutral product slice after publication.

## Prior milestone — Calendar-Day Reflection Continuation v1

> Historical snapshot; current status and open items are superseded by the
> active Daily Reflection Return Focus v1 handoff above.

Status: verified Calendar-Day Reflection Continuation v1 · updated 2026-07-16

### Historical handoff

task: Deliver Calendar-Day Reflection Continuation v1: continue the exact
whole-workspace Daily Journal record from the selected activity-day card without
changing Trade Browser scope, review coverage, persistence contracts, schemas,
reports, archives, digests, preferences, or financial definitions.

stage: codex

lane: fleet-handoff

produced:

- The selected Trades calendar card now contains a semantic **Daily
  reflection** region. It resolves zero or one current head for the exact
  canonical activity date from the full `snapshot.dailyJournal`, never from
  account/date scope, selected contributors, query, or the eight exact card
  facets. Duplicate dates or malformed date, entry-version, revision, version,
  or state identities throw rather than defaulting or selecting another head.
- Local past/current dates render **No reflection saved**, **Draft saved on
  device**, or **Completed reflection saved on device** with exact create,
  continue, or edit actions. Their accessible names retain the full visible
  label and append the full date. Demo dates are explicitly fictional and
  read-only; future activity dates expose an explanatory hold and no write
  action, even if a coherent source projection supplies a future head.
- A calendar action is valid only when its captured Trade Browser selected
  date, enclosing selected-card identity, exact action date, and edit date (when
  present) are canonical and agree. Captured selected state and the action date
  must be present or absent together. Changed, removed, detached, missing, and
  ambiguous evidence produces one focused generic error before sheet markup,
  random submission identity, background inerting, or persistence.
- Calendar-origin creation locks the captured selected date and passes that
  identity to the established Daily Journal preparation path; it never invokes
  the generic newest-unoccupied-date choice. Programmatic changes to the
  readonly DOM field cannot redirect a save. Existing heads preserve their
  exact entry-version predecessor. Generic Journal create remains editable and
  retains its newest-unoccupied-date behavior.
- Direct save, exact-command replay, and known-commit refresh retry reload and
  redraw Trades before focus moves to the rebuilt same-date reflection heading,
  then the selected-day heading, then the screen. Ordinary cancel returns to a
  connected exact trigger; unresolved stale/uncertain/refresh recovery retains
  modal ownership. If concurrent activity invalidates the day, Hermes keeps the
  existing browser invalidation behavior and does not reconstruct it.
- Account/date/day scope, normalized query, and all eight exact facet values
  survive coherent refresh. Daily reflection copy states that the record belongs
  to the whole workspace date, remains separate from trade reviews, and never
  marks the trading session reviewed. Review Session Coverage is unchanged.
- Pure UI coverage proves whole-journal second-head selection, exact no-head
  creation, locked versus generic dates, demo/future holds, and duplicate or
  malformed identity rejection. Production Chromium proves changed and removed
  origin-attribute failure, zero pre-open state mutation, captured-date
  resistance to DOM changes, cancel return, draft/completed continuation,
  structural focus, browser-state retention, unchanged review coverage, no
  external requests, 44-point actions, and internal/document no-overflow at 320
  and 421 CSS pixels with 200% text.
- README, product blueprint, roadmap, local-ledger contract, and Mac handoff now
  cover twenty Slice D increments, sixteen derived-only presentation/projection
  increments, and four write-capable exceptions: Durable Daily Journal, Report
  Trade Continuation, Dashboard Recent Trade Continuation, and Calendar-Day
  Reflection Continuation. Schema v4, five primary tabs, ten report targets,
  and eight governed reports remain unchanged.
- No schema, migration, new store command, Daily Journal preparation/commit
  algorithm, export/restore shape, archive input, digest input, governed report
  version/checksum/definition, formula, dependency, native source, credential,
  destructive workflow, or public comparative claim changed.

verified:

- cd mobile && npm ci — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- cd mobile && npm run typecheck — exit 0.
- cd mobile && npm run test:boundary — exit 0; 1 file, 2 tests passed.
- cd mobile && npm test — exit 0; 55 files, 688 tests passed.
- cd mobile && npm run test:ios-sync — exit 0; all 8 verifier tests passed.
- cd mobile && npm run test:e2e — exit 0; all 72 production-Chromium journeys
  passed. The focused exact-day/calendar matrix separately passed 3/3 after the
  final label-in-name, origin-presence, revision, and reflow hardening.
- cd mobile && npm run build — exit 0; Vite transformed 78 modules. The existing
  >500 kB chunk warning remains visible.
- cd mobile && npm run ios:copy plus npm run verify:ios-sync — exit 0; 6
  production files matched the iOS public copy byte-for-byte with SHA-256
  71425661d54970a895b578abb97feb015d2fd813943d18135686e5ae98d4742f.
  Generated Capacitor identity/SQLite registration and tracked drift passed;
  every native evidence row remained NOT RUN.
- cd mobile && npm run ios:sync — exit 0 as a Linux compatibility check;
  Capacitor found only @capacitor-community/sqlite@8.1.0 and explicitly skipped
  CocoaPods and xcodebuild because neither is installed.
- cd mobile && npm audit --omit=dev — exit 0; 0 vulnerabilities.
- git diff --exit-code -- mobile/ios mobile/package-lock.json and git diff
  --check — exit 0; no tracked native/lock drift or whitespace errors.
- Independent product, technical, UX/test, and skeptical source reviews passed
  after closing the removed-origin generic-date fallback, internal 200%-text
  overflow, non-hex revision acceptance, and accessible label-in-name defect.
  The final source review found no open P0-P3 issue.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/UI slice does
  not touch legacy Python and this checkout has no complete project venv. The
  hosted Legacy Python safety job must provide independent evidence after
  publication.

assumptions:

- `JournalWorkspaceSnapshot.dailyJournal` remains the canonical coherent
  current-head projection, and Trade Browser's validated `selectedDay` remains
  the only application-state origin for an exact calendar continuation.
- One Daily Journal entry belongs to the whole workspace-local date. Account,
  activity range, selected-day contributor scope, query, and exact card facets
  do not create separate reflections or alter the Daily Journal write identity.
- The established Daily Journal command remains the sole owner of content
  normalization, immutable versioning, idempotent receipts, optimistic head
  checks, and recovery. This slice validates and routes an exact date but does
  not infer, merge, autosave, or persist browser presentation state.
- Browser evidence uses the ephemeral development store and production
  Chromium. It is not native SQLite durability, WKWebView, VoiceOver,
  hardware-keyboard, lifecycle, Dynamic Type, SQLCipher, Keychain, or
  physical-iPhone evidence.

open:

- HOLD native Calendar-Day Reflection Continuation acceptance: repeat exact
  selected-date ownership, changed/removed/detached trigger failure, generic
  Journal separation, demo/future noninteraction, immutable draft/completed
  chains, direct/exact-replay/known-commit focus, selected-day invalidation,
  scope/query/eight-facet retention, Review Session Coverage isolation,
  background/foreground, force-quit/relaunch, two-scene races, VoiceOver,
  hardware keyboard, measured 44-point controls, and 320/421-width 200% Dynamic
  Type on a current Mac/iPhone.
- HOLD native Review Queue Focus and Exact Setup Facet acceptance; their
  detailed procedures remain in the historical handoffs and Mac checklist.
  Browser evidence does not satisfy those native rows.
- HOLD native Dashboard Recent Trade Continuation and Review Session Coverage
  acceptance; their detailed procedures remain in historical handoffs and the
  Mac checklist.
- HOLD the separate Opening Time Mix candidate until its governed grouping is
  explicit: four broad named bands and 24 workspace-local clock hours are
  materially different product definitions. Durable opening instants plus the
  workspace IANA zone are technically sufficient without a schema change once
  that semantic decision is made.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- HIGH — SECURITY/HUMAN GATE: decide whether to remove, wrap, or explicitly
  accept the pinned SQLite plugin's unused HTTP-download bridge and database-
  path console print before release. Do not claim zero native network
  capability or console-path privacy while they remain.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining report families, and native
  restore/backup acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- Re-audit the next safe autonomous product slice after publication.

## Prior milestone — Review Queue Focus v1

> Historical snapshot; current status and open items are superseded by the
> active Calendar-Day Reflection Continuation v1 handoff above.

Status: verified Review Queue Focus v1 · updated 2026-07-16

### Historical handoff

task: Deliver Review Queue Focus v1: replace the flat Journal review queue with
a fail-closed fixed Drafts then Not started projection and deterministic
queue-origin post-refresh focus without changing review or batch commands,
persistence, schemas, reports, archives, digests, or financial definitions.

stage: codex

lane: fleet-handoff

produced:

- `buildReviewQueue` consumes the current full-workspace snapshot and validates
  every current trade before selecting the queue. Stable subject IDs must be
  unique, trimmed, control-free strings of 1–256 code points; position and
  review statuses must be exact runtime members; pending reviews must have no
  saved head; draft/completed reviews must have a unique valid review ID and a
  positive safe version.
- Only closed draft and pending trades are eligible. Closed completed trades
  remain part of validation and completed-count reconciliation; coherent open
  pending, draft, and completed trades validate but never enter the queue.
  Waiting, draft, and completed totals must exactly reconcile with
  `reviewProgress`, or projection fails closed.
- The immutable result owns a fixed draft-then-pending tuple. Group containers,
  stable-ID lists, preview elements, metrics, rules, risk, executions, and other
  nested evidence are detached from their source and deeply frozen by the
  established Trade Browser preview copier. Canonical snapshot order is
  preserved inside each group; no recency, P&L, score, rate, or ranking changes
  the order.
- Journal renders only nonempty `Drafts` then `Not started` groups with a
  semantic heading hierarchy. Existing stable-ID review actions and local batch
  checkboxes remain bound to their exact trades. The fictional demo remains
  inspectable and read-only; it exposes neither batch checkboxes nor the batch
  form.
- A confirmed queue-origin single-review save or resolved batch-tag refresh
  redraws Journal before focus moves to the first surviving group heading, or
  the stable queue title when no unfinished trade survives. Report-origin focus
  retains precedence, ordinary cancel returns to its connected exact trigger,
  recovery dialogs retain ownership while unresolved, and unrelated review
  saves retain the established screen fallback.
- Application/UI coverage proves invalid identities and current heads,
  reconciliation, fixed grouping, deep detachment, hostile-value escaping,
  duplicate-symbol exact-ID binding, read-only demo behavior, and focus helper
  semantics. Production Chromium proves draft and completion regrouping,
  resolved batch refresh and retry behavior, queue-specific cancel return,
  first-surviving-group and empty-title focus, recovery ownership, unchanged
  review/archive facts, 44-point controls, and no overflow at 320 and 421 CSS
  pixels with 200% text.
- README, product blueprint, roadmap, local-ledger contract, and Mac handoff
  now cover nineteen Slice D increments, sixteen derived-only
  presentation/projection increments, and the same three write-capable
  exceptions: Durable Daily Journal, Report Trade Continuation, and Dashboard
  Recent Trade Continuation. Eight governed reports, ten report targets, five
  tabs, and schema v4 remain unchanged.
- No schema, migration, store command, review or batch algorithm,
  export/restore shape, archive input, digest input, governed report
  version/checksum/definition, formula, dependency, native source, credential,
  destructive workflow, or public comparative claim changed.

verified:

- cd mobile && npm ci — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- cd mobile && npm run typecheck — exit 0.
- cd mobile && npm run test:boundary — exit 0; 1 file, 2 tests passed.
- cd mobile && npm test — exit 0; 55 files, 684 tests passed.
- cd mobile && npm run test:ios-sync — exit 0; all 8 verifier tests passed.
- cd mobile && npm run test:e2e — exit 0; all 71 production-Chromium journeys
  passed. A focused rerun after adding the queue-specific ordinary-cancel focus
  assertion passed 1/1. Focused application/UI audit runs also passed 61/61.
- cd mobile && npm run build — exit 0; Vite transformed 78 modules. The
  existing >500 kB chunk warning remains visible.
- cd mobile && npm run ios:copy plus npm run verify:ios-sync — exit 0; 6
  production files matched the iOS public copy byte-for-byte with SHA-256
  0b0dcaee87420aabd77b6e30551fa5d3ea5af0fcfd6717184085101e84861b14.
  Generated Capacitor identity/SQLite registration and tracked drift passed;
  every native evidence row remained NOT RUN.
- cd mobile && npm run ios:sync — exit 0 as a Linux compatibility check;
  Capacitor found only @capacitor-community/sqlite@8.1.0 and explicitly skipped
  CocoaPods and xcodebuild because neither is installed.
- cd mobile && npm audit --omit=dev — exit 0; 0 vulnerabilities.
- git diff --exit-code -- mobile/ios mobile/package-lock.json and git diff
  --check — exit 0; no tracked native/lock drift or whitespace errors.
- rg -c '^## Prior milestone' docs/HANDOFF.md and
  rg -c '^> Historical snapshot' docs/HANDOFF.md — each returned 26. Exact
  Setup's historical 25/25 evidence remains unchanged.
- Independent skeptical product/core, UX, technical, and documentation reviews
  passed after closing source-mutation, invalid-open-head, duplicate-head,
  queue-title focus, batch-retry focus, queue-origin wording, and
  duplicate-symbol evidence-label gaps. The final skeptical code/UI audit found
  no P0–P2 issue.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/UI slice does
  not touch legacy Python and this checkout has no complete project venv. The
  hosted Legacy Python safety job must provide independent evidence after
  publication.

assumptions:

- `JournalWorkspaceSnapshot.trades` remains the canonical coherent current
  projection and its order is the only order preserved inside each workflow
  group. `reviewProgress.pendingTrades` continues to mean all closed unfinished
  reviews, including saved drafts.
- The established workspace builder remains the owner of trade preview facts,
  current review heads, and progress counts. This display layer validates those
  facts but never repairs, normalizes, infers, or persists them.
- Drafts before Not started is a fixed workflow grouping, not a quality,
  urgency, value, performance, outcome, or recommendation ranking.
- Browser evidence uses the ephemeral development store and production
  Chromium. It is not native SQLite durability, WKWebView, VoiceOver,
  hardware-keyboard, lifecycle, Dynamic Type, SQLCipher, Keychain, or
  physical-iPhone evidence.

open:

- HOLD native Review Queue Focus acceptance: repeat exact stable-ID and
  duplicate-symbol targeting, Drafts-then-Not-started grouping, canonical
  within-group order, count reconciliation, read-only demo behavior,
  queue-origin single-review and resolved-batch focus, ordinary cancel,
  recovery ownership, background/foreground, force-quit/relaunch, multi-scene
  refresh, VoiceOver, hardware keyboard, measured 44-point controls, and
  320/421-width 200% Dynamic Type on a current Mac/iPhone.
- HOLD native Exact Setup Facet acceptance: repeat classified-only option
  derivation across in/out-of-scope reviews, explicitly saved versus absent
  **Unclassified**, all-eight AND composition, stale-zero refresh, internal
  navigation, clear boundaries, mode/reload reset, announcements, VoiceOver,
  hardware keyboard, 44-point controls, and 320/421-width 200% Dynamic Type.
- HOLD native Dashboard Recent Trade Continuation and Review Session Coverage
  acceptance; their detailed procedures remain in the historical handoffs and
  Mac checklist. Browser evidence does not satisfy those native rows.
- HOLD the separate Opening Time Mix candidate until its governed grouping is
  explicit: four broad named bands and 24 workspace-local clock hours are
  materially different product definitions. Durable opening instants plus the
  workspace IANA zone are technically sufficient without a schema change once
  that semantic decision is made.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- HIGH — SECURITY/HUMAN GATE: decide whether to remove, wrap, or explicitly
  accept the pinned SQLite plugin's unused HTTP-download bridge and database-
  path console print before release. Do not claim zero native network
  capability or console-path privacy while they remain.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining report families, and native
  restore/backup acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- Re-audit the next safe autonomous product slice after publication.

## Prior milestone — Exact Setup Facet v1

> Historical snapshot; current status and open items are superseded by the
> active Review Queue Focus v1 handoff above.

Status: verified Exact Setup Facet v1 · updated 2026-07-16

### Historical handoff

task: Deliver Exact Setup Facet v1: add the exact current classified setup to
the session-only Trades card-visibility layer without treating an absent setup
as a classification or changing scope, Dashboard, Reports, persistence,
archives, schemas, digests, or financial definitions.

stage: codex

lane: fleet-handoff

produced:

- TradeBrowserState.setup is an ephemeral exact label or null. Available setup
  options derive only from all current whole-workspace trades whose
  hasClassifiedSetup flag is exactly true; saved-but-unused setup vocabulary,
  account/date/day scope, query, and other facet results never influence the
  option set.
- Current setup projections fail closed unless classification is boolean, a
  classified value exactly satisfies the saved-review NFC/single-line/
  120-code-point normalization contract, and an absent value uses the exact
  canonical **Unclassified** placeholder. An explicitly saved setup named
  **Unclassified** remains a real exact option and match.
- Setup options use stable code-unit order, detach from source objects, and are
  deeply frozen. Exact matching additionally requires hasClassifiedSetup to be
  true; the absent placeholder never matches the Setup facet even though
  ordinary free-text search may still find displayed placeholder copy.
- Trades now exposes the accessible **Setup** / #trade-filter-setup select
  inside the existing native disclosure. The exact count spans zero through
  eight: four fixed facets plus Setup, Mistake, Emotion, and Tag. An empty
  classified option set disables the control; a retained valid value that loses
  its last assignment remains enabled and visible as **not currently
  assigned**, yielding zero cards.
- Setup ANDs with all seven existing exact facets, normalized query, and
  account/date/day scope. It changes visible cards only. Exact contribution
  P&L, counts, calendar evidence, Dashboard, all eight governed reports, ten
  report targets, five tabs, stores, archives, digests, and schema v4 remain
  unchanged.
- Valid selection survives internal navigation and a review-triggered workspace
  refresh. **Clear search and filters** resets Setup while preserving scope;
  **Clear all**, mode switches, and reload initialization reset the complete
  ephemeral state. No preference or journal state was added.
- Production Chromium now proves the eight-way AND, Setup-only announcement,
  whole-workspace option refresh after a local review, stale-zero behavior
  after reassignment, report and storage neutrality, report-continuation state
  preservation, final-facet focus/collapse, mode reset, keyboard access,
  44-point controls, and no overflow at 320 and 421 CSS pixels with 200% text.
- README, product blueprint, roadmap, local-ledger contract, and Mac handoff
  now cover eighteen Slice D increments, fifteen derived-only
  presentation/projection increments, and the same three write-capable
  exceptions: Durable Daily Journal, Report Trade Continuation, and Dashboard
  Recent Trade Continuation. Eight governed reports, ten report targets, five
  tabs, and schema v4 remain unchanged.
- No schema, migration, store command, export/restore shape, archive input,
  digest input, governed report version/checksum/definition, formula, native
  source, credential, destructive workflow, or public comparative claim
  changed.

verified:

- cd mobile && npm ci — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- cd mobile && npm run typecheck — exit 0.
- cd mobile && npm run test:boundary — exit 0; 1 file, 2 tests passed.
- cd mobile && npm test — exit 0; 53 files, 655 tests passed.
- cd mobile && npm run test:ios-sync — exit 0; all 8 verifier tests passed.
- cd mobile && npm run test:e2e — exit 0; all 70 production-Chromium journeys
  passed. Focused reruns separately passed 28 application/UI tests and all 15
  Trade-facet/Reports-navigation journeys.
- cd mobile && npm run build — exit 0; Vite transformed 76 modules. The
  existing >500 kB chunk warning remains visible.
- cd mobile && npm run ios:copy plus npm run verify:ios-sync — exit 0; 6
  production files matched the iOS public copy byte-for-byte with SHA-256
  3053cc0d8eda62254db06ceaf0483d515baa7eb58ca01866e349d721499b6356.
  Generated Capacitor identity/SQLite registration and tracked drift passed;
  every native evidence row remained NOT RUN.
- cd mobile && npm run ios:sync — exit 0 as a Linux compatibility check;
  Capacitor found only @capacitor-community/sqlite@8.1.0 and explicitly skipped
  CocoaPods and xcodebuild because neither is installed.
- cd mobile && npm audit --omit=dev — exit 0; 0 vulnerabilities.
- git diff --exit-code -- mobile/ios mobile/package-lock.json and git diff
  --check — exit 0; no tracked native/lock drift or whitespace errors.
- rg -c '^## Prior milestone' docs/HANDOFF.md and
  rg -c '^> Historical snapshot' docs/HANDOFF.md — each returned 25.
- Independent skeptical core, UI/E2E, and documentation reviews passed. The
  implementation reviewers' three
  non-blocking mutation-test gaps—archived Setup vocabulary, explicitly saved
  **Unclassified** rendering, and Setup-only announcement classification—were
  closed before the final clean gate.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/UI slice does
  not touch legacy Python and this checkout has no complete project venv. The
  hosted Legacy Python safety job must provide independent evidence after
  publication.

assumptions:

- JournalWorkspaceSnapshot.trades remains the canonical current projection, and
  every coherent preview owns a boolean hasClassifiedSetup paired with either
  one normalized saved setup or the exact absent **Unclassified** placeholder.
- The review command remains the sole owner of setup classification and label
  normalization. This visibility slice does not infer taxonomy from card text,
  search, notes, playbooks, report membership, or unused vocabulary.
- Free-text search intentionally continues to match the displayed
  **Unclassified** placeholder; the new exact Setup facet intentionally does
  not. An explicitly saved literal **Unclassified** satisfies both paths.
- Browser evidence uses the ephemeral development store and production
  Chromium. It is not native SQLite durability, WKWebView, VoiceOver,
  hardware-keyboard, lifecycle, Dynamic Type, SQLCipher, Keychain, or
  physical-iPhone evidence.

open:

- HOLD native Exact Setup Facet acceptance: repeat classified-only option
  derivation across in/out-of-scope reviews, explicitly saved versus absent
  **Unclassified**, all-eight AND composition, stale-zero refresh, internal
  navigation, clear boundaries, mode/reload reset, announcements, VoiceOver,
  hardware keyboard, 44-point controls, and 320/421-width 200% Dynamic Type on
  a current Mac/iPhone.
- HOLD native Dashboard Recent Trade Continuation acceptance: repeat exact
  QQQ/META/SPY/AMD order, stable-ID duplicate-symbol targeting, read-only demo,
  no report-origin copy, ordinary-close and save/redraw focus, tamper failure,
  offline behavior, background/foreground, relaunch, VoiceOver, hardware
  keyboard, 44-point controls, and 320/421-width 200% Dynamic Type.
- HOLD native Review Session Coverage acceptance: repeat version/checksum,
  exact 6/6/6/8 demo reconciliation, all three fixed groups, separate
  conservation, mixed covered/uncovered contributors, no-trade-gap streak
  continuity, 25-row progression, exact-ID continuation, ordinary-close and
  save/refresh focus, restore equality, offline/lifecycle behavior, VoiceOver,
  hardware keyboard, 200% Dynamic Type, and 320/421-width layout.
- HOLD the separate Opening Time Mix candidate until its governed grouping is
  explicit: four broad named bands and 24 workspace-local clock hours are
  materially different product definitions. Durable opening instants plus the
  workspace IANA zone are technically sufficient without a schema change once
  that semantic decision is made.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- HIGH — SECURITY/HUMAN GATE: decide whether to remove, wrap, or explicitly
  accept the pinned SQLite plugin's unused HTTP-download bridge and database-
  path console print before release. Do not claim zero native network
  capability or console-path privacy while they remain.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining report families, and native
  restore/backup acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- Re-audit the next safe autonomous product slice after publication.

## Prior milestone — Dashboard Recent Trade Continuation v1

> Historical snapshot; current status and open items are superseded by the
> active Exact Setup Facet v1 handoff above.

Status: verified Dashboard Recent Trade Continuation v1 · updated 2026-07-16

### Historical handoff

task: Deliver Dashboard Recent Trade Continuation v1: turn the existing four
full-workspace Dashboard Recent trades rows into exact stable-ID entry points
for inspection and review without redefining recency, routing through Trades,
or adding persistence, report, schema, archive, or financial semantics.

stage: codex

lane: fleet-handoff

produced:

- The existing `[...snapshot.trades].reverse().slice(0, 4)` cohort and order
  remain unchanged. This is the current newest-projection order, not a new
  last-edited, last-reviewed, or last-closed definition.
- Every recent row is now a semantic article with an `h3`, escaped stable
  subject identity, and visible asset-class, account, full-session, setup, and
  direction context. Its sole **Open trade** action reuses
  `reviewTradeAction(trade, "Open trade")`.
- Activation uses only `tradeSubjectId` and the existing delegated review
  binder. Symbols, visible text, DOM position, and row order are never identity
  fallback. Blank, unknown, duplicate, or tampered identity fails with a
  focused inline error before background inert state or persistence.
- The existing review/detail sheet remains the sole continuation surface.
  Demo inspection is read-only and has no report-origin copy. Ordinary close
  returns to the exact connected trigger. A confirmed local save uses the
  established immutable review command, reloads the workspace, redraws
  Dashboard, announces the result, and focuses the generic non-report
  destination `#screen`.
- The fictional demo remains exactly four rows in QQQ, META, SPY, AMD order.
  A separate two-session AAPL fixture proves equal symbols keep distinct row
  and action IDs, qualified accessible names, exact dialogs, and separate focus
  return.
- Recent rows now use a bounded responsive grid so the full-width action stacks
  without overflow. Production Chromium proves keyboard activation, 44-by-48
  CSS-pixel targets, exact trigger return, and unobscured layout at 320 and 421
  CSS pixels with 200% text.
- Opening and closing are offline, perform no preference write, and do not
  consume or mutate Trade Browser account/date/day/search/facet state, report
  state, URLs, or a selected-trade/origin model. The explicit save path is the
  already-versioned review write path.
- README, product blueprint, roadmap, local-ledger contract, and Mac handoff
  now cover seventeen Slice D increments, fourteen derived-only
  presentation/projection increments, and three write-capable exceptions:
  Durable Daily Journal, Report Trade Continuation, and Dashboard Recent Trade
  Continuation. Eight governed reports, ten report targets, five tabs, and
  schema v4 remain unchanged.
- No schema, migration, new store command, archive/export shape, digest input,
  report version/checksum/definition, financial formula, native source,
  credential, destructive workflow, or public comparative claim changed.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 53 files, 654 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 verifier tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 70 production-Chromium
  journeys passed, including exact demo order/identity, read-only inspection,
  focused tamper failure, distinct duplicate-symbol continuation, local
  save/redraw/reopen, stable-screen and exact-trigger focus, preference/network
  neutrality, keyboard activation, 44-by-48 CSS-pixel controls, and unobscured
  320/421px 200% reflow.
- `cd mobile && npm run build` — exit 0; Vite transformed 76 modules. The
  existing >500 kB chunk warning remains visible.
- `cd mobile && npm run ios:copy` plus `npm run verify:ios-sync` — exit 0;
  6 production files matched the iOS public copy byte-for-byte with SHA-256
  `b693b94a82938d5a814941d7da1d8cf7378702b35cd516917f154f48c9e19e9a`.
  Generated Capacitor identity/SQLite registration and tracked drift passed;
  every native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and `git diff
  --check` — exit 0; no tracked native/lock drift or whitespace errors.
- `rg -c '^## Prior milestone' docs/HANDOFF.md` and
  `rg -c '^> Historical snapshot' docs/HANDOFF.md` — each returned 24.
- Independent product, technical, skeptical, implementation, test, and docs
  reviews found no blocker. The duplicate-symbol boundary and 200%-text
  unobscured keyboard-operability gaps were closed before the final clean gate.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/UI slice does
  not touch legacy Python and this checkout has no complete project venv. The
  hosted Legacy Python safety job must provide independent evidence after
  publication.

assumptions:

- `JournalWorkspaceSnapshot.trades` remains the canonical deterministic
  projection order; reversing it is the pre-existing Dashboard recency contract.
- Every coherent current trade has one unique stable `tradeSubjectId`.
  Activation-time exact-one resolution remains owned by the shared delegated
  review binder.
- A confirmed non-report review save replaces Dashboard DOM, so the disconnected
  trigger intentionally falls back to focused `#screen`; this slice does not
  invent a persisted or allowlisted Dashboard-origin model.
- Browser evidence uses the ephemeral development store and production
  Chromium. It is not native SQLite durability, WKWebView, VoiceOver,
  hardware-keyboard, lifecycle, Dynamic Type, SQLCipher, Keychain, or physical-
  iPhone evidence.

open:

- HOLD native Dashboard Recent Trade Continuation acceptance: repeat exact
  QQQ/META/SPY/AMD order, stable-ID duplicate-symbol targeting, read-only demo,
  no report-origin copy, ordinary-close and save/redraw focus, tamper failure,
  offline behavior, background/foreground, relaunch, VoiceOver, hardware
  keyboard, 44-point controls, and 320/421-width 200% Dynamic Type on a current
  Mac/iPhone.
- HOLD native Review Session Coverage acceptance: repeat version/checksum,
  exact 6/6/6/8 demo reconciliation, all three fixed groups, separate
  conservation, mixed covered/uncovered contributors, no-trade-gap streak
  continuity, 25-row progression, exact-ID continuation, ordinary-close and
  save/refresh focus, restore equality, offline/lifecycle behavior, VoiceOver,
  hardware keyboard, 200% Dynamic Type, and 320/421-width layout.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- HIGH — SECURITY/HUMAN GATE: decide whether to remove, wrap, or explicitly
  accept the pinned SQLite plugin's unused HTTP-download bridge and database-
  path console print before release. Do not claim zero native network
  capability or console-path privacy while they remain.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining report families, and native
  restore/backup acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- Re-audit the next safe autonomous product slice after publication.

## Prior milestone — Review Session Coverage v1

> Historical snapshot; current status and open items are superseded by the
> active Dashboard Recent Trade Continuation v1 handoff above.

Status: verified Review Session Coverage v1 · updated 2026-07-16

### Historical handoff

task: Deliver governed Review Session Coverage v1: explain the existing review
rhythm as fixed count-only trading-session groups with exact stable trade
evidence, without adding outcome interpretation, targets, persistence, schema,
archive, or native-readiness claims.

stage: codex

lane: fleet-handoff

produced:

- New canonical definition `review-session-coverage-report-v1` is pinned by
  SHA-256
  `8fafa15893363476f1d0433c8fbb70d3db000b6c4a75bfd9a621862c52244113`.
  A trading session is each real workspace-local calendar date with at least
  one durable trade contribution. It is reviewed when at least one exactly
  resolved current trade has a saved draft or completed review whose
  `reviewSessionDates` contains that date.
- Every session belongs once to fixed `current_streak`,
  `reviewed_before_streak`, or `unreviewed` groups. The current streak is the
  maximal reviewed suffix ending at the latest recorded trading session; no-
  trade calendar gaps do not break it, and an unreviewed latest session yields
  a zero streak.
- Session counts and calendar-date/trade assignments conserve independently.
  Every contribution becomes one evidence row ordered by date descending then
  stable subject ID. One covered contributor makes its session reviewed but
  does not imply that every trade in the session has been reviewed.
- Dates, calendar/session identities, trade counts, current subject IDs,
  covered-date subsets, saved-head identities/versions, review states, asset
  classes, and review-progress totals fail closed at explicit boundaries.
  Invalid input is never repaired, dropped, deduplicated, or defaulted.
  Metadata, groups, dates, and evidence are detached and deeply frozen.
- The report cross-checks only `tradingSessions`, `reviewedSessions`, and
  `streakSessions` from existing review progress. It does not consume or
  expose P&L, currency, risk, outcomes, Daily Journal content, Trade Browser
  scope, a rate, rank, reward, target, prediction, or advice.
- Reports places Review Session Coverage between Journal Curve and Direction
  Mix. All three groups remain visible, evidence reveals at most 25 assignments
  per action, external fields are escaped, live counts are announced, and
  completion focus moves to newly revealed content.
- Every row opens exactly one current trade by stable subject ID through the
  existing review sheet with date-specific accessible context. Ordinary close
  returns to the exact connected trigger; an explicit save rebuilds the
  snapshot and returns focus to the Review Session Coverage heading.
- Dashboard's review-rhythm card now opens the report directly. Report-menu
  order, return focus, disclosures, offline behavior, localStorage neutrality,
  full-workspace Trades-filter isolation, and 320/421px 200% text behavior all
  include the new destination.
- The fictional demo contract is exactly 6 total sessions, 6 reviewed
  sessions, 0 unreviewed sessions, a 6-session current streak, 8 assignments,
  and all 3 fixed groups. Restore and review-edit regression evidence now
  exercises covered-session equality rather than only zero coverage.
- README, product blueprint, roadmap, local-ledger contract, Mac handoff, and
  report navigation now cover eight governed reports, sixteen Slice D
  increments, fourteen derived-only presentation/projection increments, and
  ten report destinations. Native rows remain NOT RUN.
- No schema, migration, store command, archive/export shape, digest input,
  financial formula/version, prior governed-report definition/checksum, native
  source, credential, destructive workflow, or public comparative claim
  changed.
- All 23 prior milestones have historical banners; older succession language
  reserves present-tense `active` for this handoff.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 53 files, 654 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 verifier tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 65 production-Chromium
  journeys passed, including the exact 6/6/6/8 demo contract, fixed zero
  groups, independent conservation, stable-ID continuation, Dashboard/menu
  focus, save-driven heading return, covered-session restore/edit equality,
  report and Trades-filter isolation, offline/storage neutrality, keyboard
  reachability, and 320/421px 200% text.
- `cd mobile && npm run build` — exit 0; Vite transformed 76 modules. The
  existing >500 kB chunk warning remains visible.
- `cd mobile && npm run ios:copy` plus `npm run verify:ios-sync` — exit 0;
  6 production files matched the iOS public copy byte-for-byte with SHA-256
  `83253bc7d4ade0b026307fc943ce4d9b771b81c2874db6b5dba8c6943b9623be`.
  Generated Capacitor identity/SQLite registration and tracked drift passed;
  every native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and `git diff
  --check` — exit 0; no tracked native/lock drift or whitespace errors.
- `rg -c '^## Prior milestone' docs/HANDOFF.md` and
  `rg -c '^> Historical snapshot' docs/HANDOFF.md` — each returned 23.
- Independent core-contract and UI/integration reviews found no blocker. Four
  low-priority boundary, restore, and continuation coverage gaps were closed
  before the final clean gate.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/report slice
  does not touch legacy Python and this checkout has no complete project venv.
  The hosted Legacy Python safety job must provide independent evidence after
  publication.

assumptions:

- `snapshot.calendar` is the canonical workspace-local durable execution
  calendar; each contribution has already been aggregated to one stable trade
  subject per date.
- `TradePreview.reviewSessionDates` contains exactly the contribution dates
  at or before the current saved review head's recorded time; older immutable
  review versions do not compete with that head.
- Governed reports intentionally consume the full-workspace snapshot. Trade
  Browser account/date/day/search/facet state does not scope or mutate them.
- Browser evidence uses production Chromium. It is not native WKWebView,
  VoiceOver, hardware-keyboard, second-scene, relaunch, Dynamic Type, SQLCipher,
  Keychain, or physical-iPhone evidence.

open:

- HOLD native Review Session Coverage acceptance: repeat version/checksum,
  exact 6/6/6/8 demo reconciliation, all three fixed groups, separate
  conservation, mixed covered/uncovered contributors, no-trade-gap streak
  continuity, 25-row progression, exact-ID continuation, ordinary-close and
  save/refresh focus, restore equality, offline/lifecycle behavior, VoiceOver,
  hardware keyboard, 200% Dynamic Type, and 320/421-width layout on a current
  Mac/iPhone.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- HIGH — SECURITY/HUMAN GATE: decide whether to remove, wrap, or explicitly
  accept the pinned SQLite plugin's unused HTTP-download bridge and database-
  path console print before release. Do not claim zero native network
  capability or console-path privacy while they remain.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining report families, and native
  restore/backup acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- Re-audit the next safe autonomous product slice after publication.

## Prior milestone — Tag Patterns v1

> Historical snapshot; current status and open items are superseded by the
> then-current Review Session Coverage v1 milestone above.

Status: verified Tag Patterns v1 · updated 2026-07-16

### Historical handoff

task: Deliver governed Tag Patterns v1: reconcile exact tags on coherent current
completed trade-review heads as count-only groups with stable trade evidence,
without adding outcome interpretation, vocabulary semantics, persistence,
schema, archive, or native-readiness claims.

stage: codex

lane: fleet-handoff

produced:

- New canonical definition `tag-patterns-report-v1` is pinned by SHA-256
  `ad24da67086c74558203d89b9fe27f2d8907f6170b29fa5320e0aada88405c27`.
  Pending/draft reviews are excluded before tag validation; coherent completed
  heads without a saved tag form the second mutually exclusive exclusion.
- Unique included trades and total exact tag assignments conserve
  independently because one trade may contribute once to several groups. The
  builder fails closed on incoherent subject/head identities and on saved tags
  outside the existing normalization, folded-identity, length, 20-assignment,
  within-trade uniqueness, or cross-current-head canonical-display boundary.
  It never repairs, deduplicates, or drops stored values.
- Groups use stable tag-name code-unit order. Evidence uses traded date
  descending then stable subject ID. Metadata, exclusions, groups, subject-ID
  arrays, and evidence are detached and deeply frozen.
- The report consumes current projection identity/evidence and exact
  `TradePreview.tags` from current completed heads; tags are the only authored
  grouping input. Saved vocabulary, Daily Journal tags, historical heads,
  position state, trade results, currency, and Trade Browser scope/search/facets
  do not affect eligibility or grouping. It exposes no P&L, rate, importance,
  rank, reward, outcome interpretation, causation, prediction, or advice.
- Reports places Tag Patterns between Emotion Patterns and Setup Breakdown.
  The view reveals at most five groups and 25 contributors per action, escapes
  external fields, announces exact live counts, and returns focus to newly
  revealed group summaries or the originating report heading after a save.
- Every contributor opens the exact stable-ID trade through the existing
  review sheet with a tag-specific accessible name. Ordinary close returns to
  the exact connected trigger; review saves may move assignments and return to
  the Tag Patterns heading without changing retained Trades state.
- The demo contract is 8 included trades of 8, 16 assignments, 12 stable
  groups, and 0/0 exclusions. `Plan followed` contains five trades; each of
  the other eleven groups contains one assignment.
- README, product blueprint, roadmap, local-ledger contract, Mac handoff, report
  navigation, continuation, restore recomputation, Daily Journal score
  neutrality, and Trade Browser isolation now cover seven governed reports,
  fifteen Slice D increments, thirteen derived-only presentation/projection
  increments, and nine report destinations. Native rows remain NOT RUN.
- No schema, migration, store command, archive/export shape, digest input,
  financial formula/version, prior governed-report definition/checksum, native
  source, credential, destructive workflow, or public comparative claim
  changed.
- All 22 prior milestones have historical banners; older succession language
  reserves present-tense `active` for this handoff.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 51 files, 596 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 verifier tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 64 production-Chromium
  journeys passed, including separate unique/assignment conservation, exact
  demo groups, malformed-draft exclusion precedence, stable Unicode code-unit
  ordering, five/25 progression with visible focus, stable-ID continuation,
  current-head reassignment, restore equality, full-workspace isolation,
  keyboard reachability, and 320/421px 200% text.
- `cd mobile && npm run build` — exit 0; Vite transformed 74 modules. The
  existing >500 kB chunk warning remains visible.
- `cd mobile && npm run ios:copy` plus `npm run verify:ios-sync` — exit 0;
  6 production files matched the iOS public copy byte-for-byte with SHA-256
  `13529efeb3d3faecd8a77bf259008f9d83b0f7b10d6c3f9b9c45eb0e565a0c62`.
  Generated Capacitor identity/SQLite registration and tracked drift passed;
  every native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and `git diff
  --check` — exit 0; no tracked native/lock drift or whitespace errors.
- `rg -c '^## Prior milestone' docs/HANDOFF.md` and
  `rg -c '^> Historical snapshot' docs/HANDOFF.md` — each returned 22.
- Independent core-contract and UI/integration reviews found no blocker. Their
  four low-priority coverage gaps were closed before the full gate.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/report slice
  does not touch legacy Python and this checkout has no complete project venv.
  The hosted Legacy Python safety job must provide independent evidence after
  publication.

assumptions:

- `TradePreview.tags` is the exact current review-head projection produced by
  the existing store boundary; older immutable versions do not compete with
  the current head.
- Governed reports intentionally consume the full-workspace snapshot. Trade
  Browser account/date/day/search/facet state does not scope or mutate them.
- A folded tag identity has one exact canonical display across coherent current
  completed heads; disagreement is invalid source state, not a reporting merge.
- Browser evidence uses production Chromium. It is not native WKWebView,
  VoiceOver, hardware-keyboard, second-scene, relaunch, Dynamic Type, SQLCipher,
  Keychain, or physical-iPhone evidence.

open:

- HOLD native Tag Patterns acceptance: repeat version/checksum, 8-of-8 unique
  trades, 16 assignments, all 12 ordered demo groups, separate conservation,
  five/25 progression, exact-ID continuation, current-head reassignment,
  save/refresh focus, restore equality, offline/lifecycle behavior, VoiceOver,
  hardware keyboard, 200% Dynamic Type, and 320/421-width layout on a current
  Mac/iPhone.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- HIGH — SECURITY/HUMAN GATE: decide whether to remove, wrap, or explicitly
  accept the pinned SQLite plugin's unused HTTP-download bridge and database-
  path console print before release. Do not claim zero native network
  capability or console-path privacy while they remain.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining report families, and native
  restore/backup acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- Re-audit the next safe autonomous product slice after publication.

## Prior milestone — Opening Weekday Mix v1

> Historical snapshot; current status and open items are superseded by the
> then-current Tag Patterns v1 milestone above.

Status: verified Opening Weekday Mix v1 · documentation truth reconciled ·
updated 2026-07-16

### Historical handoff

task: Deliver governed Opening Weekday Mix v1: reconcile every current trade
into one fixed workspace-local opening-weekday cohort with stable trade
evidence, without adding outcome interpretation, persistence, schema, archive,
or native-readiness claims.

stage: codex

lane: fleet-handoff

produced:

- New canonical definition `opening-weekday-mix-report-v1` is pinned by
  SHA-256
  `6f205c00826d547f1f0640bec0acceac836e707c4a95287d2e35f4ae62e01cf8`.
  Every current full-workspace projection trade is included exactly once with
  no exclusions; all seven fixed groups always exist in Monday-through-Sunday
  order and their counts must conserve the complete cohort.
- The grouping input is only the canonical workspace-local `tradedOn` opening
  date already derived from the immutable ledger's first entry timestamp.
  Real Gregorian dates from 1970 through 9999 validate or fail closed. Later
  allocations, exits, and reviews cannot regroup a trade.
- Stable subject IDs must be unique, trimmed, 1–256 code points, and C0/C1-free.
  Direction and position state are validated drill-down evidence only and fail
  closed on unsupported runtime values. Reviews, results, currency, Daily
  Journal scores, and Trade Browser account/date/day/search/facet state are not
  consumed.
- Evidence orders by opening date descending then stable subject ID. Report
  metadata, groups, subject-ID arrays, and evidence are detached and deeply
  frozen. The report exposes no P&L, currency, win rate, R, expectancy,
  percentage, rate, comparison, ranking, frequency reward, target, causal
  claim, prediction, or advice.
- Reports places Opening Weekday Mix between Direction Mix and Plan Check. The
  view reveals evidence in pages of at most 25, escapes every external
  display/identity field, keeps zero-count groups visible, and describes
  full-workspace scope and anti-reward neutrality directly in the UI.
- Every contributor opens the exact stable-ID trade through the existing review
  sheet with a weekday-specific accessible name. Ordinary close returns to the
  exact trigger; save/refresh returns to the Opening Weekday Mix heading after
  the report rebuild without changing membership or Trades state.
- Navigation, keyboard/responsive behavior, report fingerprints, session-store
  restore, review-edit neutrality, Daily Journal process-score neutrality, and
  Trade Browser scope/facet isolation include Opening Weekday Mix.
- README, product blueprint, roadmap, local-ledger contract, and Mac handoff now
  record six governed reports, fourteen Slice D increments, and eight report
  destinations while keeping every native row NOT RUN.
- A documentation-only follow-up now distinguishes checked-in configuration,
  implemented adapter behavior, Linux mock/repository/codec evidence, generated
  registration evidence, and native runtime evidence that remains NOT RUN.
  Encryption, Keychain persistence, integrity enforcement, backup/restore, and
  native Files behavior are no longer described as observed device facts.
- Source inspection of the pinned SQLite plugin found an unused registered
  native HTTP-download bridge and an unconditional database-path print. Hermes
  app code has no caller for the bridge, but the CSP does not govern it; both
  dependency surfaces are recorded as release holds rather than silently
  covered by the offline/WebView boundary.
- All 21 prior milestones now have historical banners. Older named succession
  links say `then-current`, reserving present-tense `active` for this handoff.
- No schema, migration, store command, archive/export shape, digest input,
  financial formula/version, prior governed-report definition/checksum, native
  source, credential, destructive workflow, or public comparative claim
  changed.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 49 files, 555 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 verifier tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 63 production-Chromium
  journeys passed, including exact weekday counts/order, fixed zero groups,
  stable-ID continuation, save-driven heading return, restore equality, report
  and Trades-filter isolation, keyboard reachability, and 320/421px 200% text.
- `cd mobile && npm run ios:copy` plus `npm run verify:ios-sync` — exit 0;
  Vite transformed 72 modules, 6 production files matched the iOS public copy
  byte-for-byte with SHA-256
  `e5102706ea277988be618167fe8127f6733e886d876ce751f17d4c2a383f4f13`,
  generated Capacitor identity/SQLite registration and tracked drift passed,
  and every native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and `git diff
  --check` — exit 0; no tracked native/lock drift or whitespace errors.
- Three independent read-only contract, verification-design, and documentation
  reviews found no implementation blocker after the active handoff, explicit
  outcome-neutrality/code-point boundaries, responsive exact-trade action, and
  source-document dates were corrected.
- Documentation follow-up: `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 49 files, 555 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 tests passed.
- `cd mobile && npm run verify:ios-sync` — exit 0; registration-only evidence
  passed while CocoaPods, Xcode, iPhone, SQLCipher, Keychain, lifecycle,
  VoiceOver, and Dynamic Type remained NOT RUN.
- `cd mobile && npm audit --omit=dev` and `git diff --check` — exit 0.
- `rg -c '^## Prior milestone' docs/HANDOFF.md` — returned 21.
- `rg -c '^> Historical snapshot' docs/HANDOFF.md` — returned 21. Independent
  source-code, evidence-wording, handoff-integrity, and editorial reviews found
  no remaining blocker after the follow-up corrections.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/report slice
  does not touch legacy Python and this checkout has no complete project venv.
  The hosted Legacy Python safety job must provide independent evidence after
  publication.

assumptions:

- `TradePreview.tradedOn` is the canonical workspace-local opening date already
  derived from the immutable ledger's `openedAtUs`; the report never parses the
  display-only session label or reinterprets the timestamp in another zone.
- Governed reports intentionally consume the full-workspace snapshot. Trade
  Browser account/date/day/search/facet state does not scope or mutate them.
- Direction and position state identify current drill-down evidence only; their
  values never change weekday membership or counts.
- Browser evidence uses production Chromium. It is not native WKWebView,
  VoiceOver, hardware-keyboard, second-scene, relaunch, Dynamic Type, SQLCipher,
  Keychain, or physical-iPhone evidence.

open:

- HOLD native Opening Weekday Mix acceptance: repeat the checksum, fixed
  1/1/3/3/0/0/0 demo counts, full-cohort conservation, UTC/local-date crossover,
  25-row progression, exact-ID continuation, save/refresh focus, restore
  equality, offline/lifecycle behavior, VoiceOver, hardware keyboard, 200%
  Dynamic Type, and 320/421-width layout on a current Mac/iPhone.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- HIGH — SECURITY/HUMAN GATE: decide whether to remove, wrap, or explicitly
  accept the pinned SQLite plugin's unused HTTP-download bridge and database-
  path console print before release. Do not claim zero native network
  capability or console-path privacy while they remain.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining reports, and native restore/backup
  acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- Re-audit the next safe autonomous product slice after publication.

## Prior milestone — Direction Mix v1

> Historical snapshot; current status and open items are superseded by the
> then-current Opening Weekday Mix v1 handoff above.

Status: verified Direction Mix v1 ·
updated 2026-07-15

### Historical handoff

task: Deliver governed Direction Mix v1: reconcile every current trade into a
fixed count-only Long or Short cohort with stable trade evidence, without adding
outcome interpretation, persistence, schema, archive, or native-readiness
claims.

stage: codex

lane: fleet-handoff

produced:

- New canonical definition `direction-mix-report-v1` is pinned by SHA-256
  `0a55af9905699cc62746c99b5b4e7dd664588d8b526eefb207e9fb2bb77b3ab2`.
  Every current full-workspace projection trade is included exactly once with
  no exclusions; both fixed groups always exist in Long-then-Short order and
  their counts must conserve the complete cohort.
- Direction is the only grouping field. Position and review status are
  validated evidence only and cannot affect inclusion, grouping, or ordering.
  Authored review content, result fields, currency, and Trade Browser
  account/date/day/search/facet state are not consumed.
- Stable subject IDs must be unique, trimmed, 1–256 code points, and C0/C1-free.
  Direction, position state, and review state fail closed on unsupported runtime
  values. Evidence orders by traded date descending then subject ID; report
  metadata, groups, ID arrays, and evidence are detached and deeply frozen.
- The report is explicitly count-only: it exposes no P&L, currency, win rate, R,
  expectancy, percentage, rate, performance rank, causal claim, prediction,
  trading advice, or behavioral score.
- Reports places Direction Mix between Journal Curve and Plan Check. The view
  always shows Long and Short, reveals evidence in pages of at most 25, escapes
  every external display/identity field, and describes full-workspace scope and
  neutrality directly in the UI.
- Every contributor opens the exact stable-ID trade through the existing review
  sheet with a direction-specific accessible name. Ordinary close returns to
  the exact trigger; save/refresh returns to the Direction Mix heading after the
  report rebuild without changing Trades state.
- Navigation, keyboard/responsive behavior, report fingerprints, session-store
  restore, review-edit neutrality, Daily Journal process-score neutrality, and
  Trade Browser scope/facet isolation include Direction Mix.
- README, product blueprint, roadmap, local-ledger contract, and Mac handoff now
  record five governed reports, thirteen Slice D increments, and seven report
  destinations while keeping every native row NOT RUN.
- No schema, migration, store command, archive/export shape, digest input,
  financial formula/version, existing governed-report definition/checksum,
  native source, credential, destructive workflow, or public comparative claim
  changed.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 47 files, 530 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 verifier tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 62 production-Chromium
  journeys passed, including exact Direction counts/order, fixed zero groups,
  stable-ID continuation, save-driven heading return, restore equality, report
  and Trades-filter isolation, keyboard reachability, and 320/421px 200% text.
- `cd mobile && npm run ios:copy` plus `npm run verify:ios-sync` — exit 0;
  Vite transformed 70 modules, 6 production files matched the iOS public copy
  byte-for-byte with SHA-256
  `879a14b301f45154d4b641e38a66d149edca8bc4350e3f6ebd910709e2cce364`,
  generated Capacitor identity/SQLite registration and tracked drift passed,
  and every native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and `git diff
  --check` — exit 0; no tracked native/lock drift or whitespace errors.
- Three independent read-only contract, integration, and documentation reviews
  found no remaining blocker after the evidence-only input contract, exhaustive
  runtime status validation, and C1-control test gaps were corrected and the
  checksum was repinned.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/report slice
  does not touch legacy Python and this checkout has no complete project venv.
  The hosted Legacy Python safety job must provide independent evidence after
  publication.

assumptions:

- `TradePreview.side` is the canonical exact Long/Short direction of each
  current projected trade. Direction Mix does not infer direction from
  executions, results, symbols, setup, or review content.
- Governed reports intentionally consume the full-workspace snapshot. Trade
  Browser account/date/day/search/facet state does not scope or mutate them.
- Position and review status are present solely to identify current evidence
  state during drill-down; their values never change membership or counts.
- Browser evidence uses production Chromium. It is not native WKWebView,
  VoiceOver, hardware-keyboard, second-scene, relaunch, Dynamic Type, SQLCipher,
  Keychain, or physical-iPhone evidence.

open:

- HOLD native Direction Mix acceptance: repeat the checksum, fixed 6/2 demo
  counts, full-cohort conservation, 25-row progression, exact-ID continuation,
  save/refresh focus, restore equality, offline/lifecycle behavior, VoiceOver,
  hardware keyboard, 200% Dynamic Type, and 320/421-width layout on a current
  Mac/iPhone.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining reports, and native restore/backup
  acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- Re-audit the next safe autonomous product slice after publication.

## Prior milestone — Emotion Patterns v1

> Historical snapshot; current status and open items are superseded by the
> then-current Direction Mix v1 handoff above.

Status: verified Emotion Patterns v1 ·
updated 2026-07-15

### Historical handoff

task: Deliver governed Emotion Patterns v1: show count-only exact saved-emotion
patterns with stable trade evidence on iPhone, without adding outcome
interpretation, persistence, schema, archive, or native-readiness claims.

stage: codex

lane: fleet-handoff

produced:

- New checksum-pinned definition `emotion-patterns-report-v1` with canonical
  SHA-256
  `d674eceb0d641512f106f9f1c6b37e23fe1a2ecd0d43e54b7e48865fa594adb4`
  consumes the current projection and current completed review heads only.
- Open and closed trades are equally eligible. Pending/draft reviews are
  excluded first; completed heads without the one optional exact emotion are
  excluded next. Every included trade contributes one assignment to exactly one
  group, so included-trade and assignment totals conserve exactly.
- Stable subject/head identities and the repository's saved-review
  normalization/limit contract fail closed. Conflicting canonical displays,
  malformed identities, incoherent completed heads, and invalid stored emotion
  values throw rather than being normalized, repaired, or dropped.
- Groups use stable emotion-name code-unit order. Evidence uses traded date
  descending then stable subject ID. The complete report is immutable;
  presentation reveals at most five groups and 25 contributors per action.
- The report is explicitly count-only: it exposes no P&L, currency, win rate, R,
  expectancy, rate, intensity, performance rank, causal claim, prediction,
  trading advice, or behavioral score.
- Reports places Emotion Patterns between Mistake Patterns and Setup Breakdown.
  Every contributor opens the exact stable-ID trade through the existing review
  sheet with an emotion-specific accessible name. Ordinary close returns to the
  exact trigger; a saved emotion change rebuilds evidence and returns focus to
  the Emotion Patterns heading.
- Existing report navigation, delegated continuation, Trade Browser
  scope/facets, real session-store current-head movement, browser archive
  restore, and Daily Journal process-score independence now include Emotion
  Patterns. Production-browser checks cover exact demo facts, offline behavior,
  focus, escaping, pagination, and 320/421px layout at 200% text.
- README, product blueprint, roadmap, local-ledger contract, and Mac handoff now
  record the fourth governed report while keeping every native row NOT RUN.
- No schema, migration, store command, archive/export shape, digest input,
  financial formula/version, existing governed-report definition/checksum,
  native source, credential, destructive workflow, or public comparative claim
  changed.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 45 files, 512 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 verifier tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 61 production-Chromium
  journeys passed, including exact Emotion counts, restore/store movement,
  report isolation, stable-ID continuation, saved regrouping, and responsive
  focus/layout paths.
- `cd mobile && npm run test:e2e -- e2e/reports-navigation.spec.ts` — exit 0
  after the 421px review correction; all 8 Reports journeys passed.
- `cd mobile && npm run ios:copy && npm run verify:ios-sync` — exit 0; Vite
  transformed 68 modules, 6 production files matched the iOS public copy
  byte-for-byte with SHA-256
  `6dc00d39ebc0e109772f89aac720f074b9efda01ecde60741cb592ff1b04bd92`,
  generated Capacitor identity/SQLite registration and tracked drift passed,
  and every native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and `git diff
  --check` — exit 0; no tracked native/lock drift or whitespace errors.
- Three independent read-only reviews found no remaining code, UI, architecture,
  financial, security, privacy, persistence, archive, schema, or documentation
  blocker. Their Mac-handoff insertion and 421px evidence findings were
  corrected; a proposed Emotion-only Unicode-policy change was reclassified as
  incompatible with the authoritative cross-cutting saved-vocabulary contract.
- Legacy Python Ruff/Pytest — NOT RUN locally because this mobile/report slice
  does not touch legacy Python and this checkout has no complete project venv.
  The hosted Legacy Python safety job must provide independent evidence after
  publication.

assumptions:

- The current `TradePreview.emotion` is the one optional exact emotion on the
  coherent current review head. Older immutable review versions and unused
  vocabulary do not compete.
- Governed reports intentionally consume the full-workspace snapshot. Trade
  Browser account/date/day/search/facet state does not scope or mutate them.
- The repository's canonical vocabulary contract currently means NFC,
  trim/collapsed whitespace, bounded case-folded identity, and C0/C1-control
  rejection. Strengthening invisible/bidirectional-format policy would require a
  coordinated writer, restore, all-report, checksum/version, and compatibility
  slice—not an Emotion-only divergence.
- Browser evidence uses production Chromium. It is not native WKWebView,
  VoiceOver, hardware-keyboard, second-scene, relaunch, Dynamic Type, SQLCipher,
  Keychain, or physical-iPhone evidence.

open:

- HOLD native Emotion Patterns acceptance: repeat exact counts/checksum,
  open/closed neutrality, five/25 progressive controls, stable-ID continuation,
  saved regrouping/focus, restore equality, offline/lifecycle behavior,
  VoiceOver, hardware keyboard, 200% Dynamic Type, and 320/421-width layout on a
  current Mac/iPhone.
- MED — treat any stronger invisible/bidirectional vocabulary policy as a
  coordinated cross-cutting contract/version/compatibility decision.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining reports, and native restore/backup
  acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.
- Re-audit the next safe autonomous product slice after publication.

## Prior milestone — Compact Trades Filters v1

> Historical snapshot; current status and open items are superseded by the
> then-current Emotion Patterns v1 handoff above.

Status: verified Compact Trades Filters v1 ·
updated 2026-07-15

### Historical handoff

task: Deliver Compact Trades Filters v1: shorten the primary iPhone Trades path
without changing exact card-filter behavior, scope, persistence, reports, or
financial truth.

stage: codex

lane: fleet-handoff

produced:

- Only the existing seven exact card-filter selects and their validation alert
  now live inside a native `details` disclosure. Boundary copy and **Clear
  search and filters** stay outside, so query-only state remains visible and
  recoverable.
- The summary derives an exact zero-to-seven active-filter count from the four
  fixed and three dynamic facet values. Search plus account/date/day scope are
  deliberately excluded.
- A clean or scope/query-only render starts collapsed. Any fixed, dynamic, or
  retained stale review facet renders open. Search input preserves a user's
  current manual disclosure choice until a later render.
- Resetting the final exact facet closes the disclosure and returns focus to
  its summary. The combined clear action rebuilds the view with the same closed,
  summary-focused state while retaining account/date/day scope; **Clear all**
  still resets both layers through its existing path.
- Disclosure state is presentation-only. No preference, session model field,
  store, SQLite row, schema, archive/export shape, digest input, report input,
  formula, URL, or native source was added.
- Production-browser coverage now protects query-only recovery, pointer/Enter/
  Space disclosure behavior, sequential Tab order, exact counts from zero to
  seven, final-facet focus/collapse, retained stale selections, local refresh,
  report/storage neutrality, and 44-point/no-overflow behavior at 320 and 421
  CSS pixels with 200% text.
- README, product blueprint, roadmap, local-ledger contract, and Mac handoff
  record this presentation boundary without claiming native acceptance.
- Follow-up CI maintenance selects the official Node 24 action majors:
  `actions/checkout@v7`, `actions/setup-node@v7`, and
  `actions/setup-python@v6`. Triggers, permissions, inputs, jobs, and commands
  are unchanged; exact-head hosted CI remains the execution authority.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0 after the locked install.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 43 files, 479 tests passed.
- `cd mobile && npx vitest run src/ui/trades-view.test.ts` — exit 0; all 10
  render/count/stale/escaping cases passed.
- `cd mobile && npm run test:ios-sync` — exit 0; all 8 verifier tests passed.
- `cd mobile && npm run test:e2e -- e2e/trade-browser-facets.spec.ts` — exit 0;
  all 3 focused production-browser journeys passed.
- `cd mobile && npm run test:e2e` — exit 0; all 60 production-browser journeys
  passed, including existing scope, report, review, restore, and recovery paths.
- `cd mobile && npm run ios:copy && npm run verify:ios-sync` — exit 0; Vite
  transformed 66 modules, 6 production files matched the iOS public copy
  byte-for-byte with SHA-256
  `5df1e6d57774c0aaa80475c95b3d2b867864fb2357fb2164f5ad2fdb796ef7ca`,
  generated Capacitor identity/SQLite registration and tracked drift passed,
  and every native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and `git diff
  --check` — exit 0; no tracked native/lock drift or whitespace errors.
- Official GitHub refs resolve `actions/checkout@v7`, `actions/setup-node@v7`,
  and `actions/setup-python@v6`; each action metadata declares `node24`. The
  existing job inputs remain supported. Exact-head hosted CI is the execution
  and annotation authority for this workflow-only change.
- Legacy Python Ruff/Pytest — NOT RUN locally because this presentation-only
  mobile diff does not touch legacy Python and this checkout has no complete
  project venv. The hosted Legacy Python safety job must provide independent
  evidence after publication.

assumptions:

- The validated `TradeBrowserResult.state` remains the sole source for exact
  facet values and current review options. A separate disclosure boolean would
  create a second, unnecessary state owner.
- A retained stale Mistake, Emotion, or Tag remains an active exact facet even
  when its current option set loses the final assignment; it therefore counts,
  opens the disclosure on render, and continues to produce zero cards.
- Browser evidence uses production Chromium. It is not native WKWebView,
  VoiceOver, hardware-keyboard, second-scene, relaunch, Dynamic Type, or
  physical-iPhone evidence.

open:

- HOLD native Compact Trades Filters acceptance: repeat zero/seven counts,
  query/scope exclusion, stale refresh, pointer/VoiceOver/Enter/Space, sequential
  keyboard order, final-facet and combined-clear focus return, 200% Dynamic
  Type, lifecycle/relaunch, and 320/421-width layout on a current Mac/iPhone.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft still
  needs a corrected current-review-head and draft/completed eligibility
  definition before any approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before broader
  ETF/options/futures/crypto file-coverage claims.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- MED — re-audit the next autonomous product slice after publication. Emotion
  Patterns remains a safe technical reuse only if it adds enough review value
  to justify another report family.
- Attachments, verified Delete All Data, saved presets, persistent/report
  scope, fuller management, remaining reports, and native restore/backup
  acceptance remain separate.
- Fleet guard-layer screening was not evidenced; do not treat this handoff as
  guard approval.
- Do not claim native readiness, broader CSV support, broker sync, execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.

## Prior milestone — Mistake Patterns v1

> Historical snapshot; current status and open items are superseded by the
> then-current Compact Trades Filters v1 handoff above.

Status: verified Mistake Patterns v1 ·
updated 2026-07-15

### Historical handoff

task: Deliver governed Mistake Patterns v1: show count-only exact saved-mistake
patterns with stable trade evidence on iPhone, without adding performance
interpretation, persistence, schema, archive, or native-readiness claims.

stage: codex

lane: fleet-handoff

produced:

- New checksum-pinned definition mistake-patterns-report-v1 with canonical
  SHA-256 f94fc896308348f55a665aeafba665f0f3d4ee50fc225c4dba1087bc2babad3c
  consumes the current projection and current completed review heads only.
- The complete immutable builder includes open and closed trades equally,
  excludes pending/draft reviews before completed heads without an assignment,
  and reconciles unique included trades separately from exact label
  assignments. A multi-label trade remains one included trade and contributes
  once to each exact saved-label group.
- Stable subject and completed-head IDs fail closed unless they are unique,
  trimmed, C0/C1-control-free strings of 1–256 code points; completed versions
  must be positive safe integers. Saved labels fail closed on malformed,
  non-normalized, over-limit, within-head duplicate, or cross-head
  case-identity/conflicting-display input.
- Groups use stable label code-unit order. Evidence uses traded date descending
  then stable subject ID. The report exposes no P&L, currency, win, R,
  expectancy, rate, rank, causal, predictive, or advisory output.
- Reports now places Mistake Patterns between Plan Check and Setup Breakdown.
  Presentation reveals at most five groups and 25 assigned-trade rows per
  action, with exact live counts, focus movement, escaped evidence, and a
  neutral empty state.
- Every mistake contributor opens the exact stable-ID trade through the
  existing review/detail sheet with a label-specific accessible name. Ordinary
  close returns to the exact trigger; an explicit save that changes assignments
  rebuilds the report and returns focus to the Mistake Patterns heading.
- The report-source allowlist is exhaustive across Plan, Mistake, and Setup.
  Unknown or missing source metadata on a report action fails closed with a
  focused alert before any dialog, inert background, or store operation.
- Existing browser restore, real session-store current-head, workspace
  process-score independence, Reports navigation, conflicting Trades-state,
  mobile reflow, and report-save journeys now protect the new report without
  changing their ownership boundaries.
- README, product blueprint, roadmap, local-ledger contract, and Mac handoff
  record the delivered report while leaving VoiceOver, native Dynamic Type,
  lifecycle, SQLCipher, and physical-device acceptance explicitly open.
- No schema, migration, store, archive/export shape, digest input, financial
  formula/version, existing report definition/checksum, native source,
  credential, destructive workflow, or public comparative claim changed.

verified:

- cd mobile && npm ci — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- cd mobile && npm run typecheck — exit 0 after final review corrections.
- cd mobile && npm run test:boundary — exit 0; 1 file, 2 tests passed.
- cd mobile && npm test — exit 0 after final review corrections; 43 files,
  478 tests passed.
- cd mobile && npx vitest run src/core/mistake-patterns-report.test.ts —
  exit 0; all 26 checksum, cohort, conservation, ordering, immutability,
  position/result-neutrality, current-head, and fail-closed cases passed.
- cd mobile && npm run test:ios-sync — exit 0; 8 tests passed.
- cd mobile && npm run test:e2e -- e2e/reports-navigation.spec.ts — exit 0;
  all 7 Reports journeys passed, including exact demo counts, stable-ID
  continuation, missing/unknown source tampering, and 320/421px 200% text.
- cd mobile && npm run test:e2e — exit 0; all 60 production-browser journeys
  passed in 34.5 seconds, including the local post-save Plan/Setup/Mistake
  regrouping journey.
- cd mobile && npm run ios:copy && npm run verify:ios-sync — exit 0; Vite
  transformed 66 modules, 6 production files matched the iOS public copy
  byte-for-byte with SHA-256
  5e6fb6edc4ac2ffc1015006958ce238f6903a218038d117be1bac319bf37c7d2,
  generated Capacitor identity/SQLite registration and tracked drift passed,
  and every native evidence row remained NOT RUN.
- cd mobile && npm run ios:sync — exit 0 as a Linux compatibility check;
  Capacitor found only @capacitor-community/sqlite@8.1.0 and explicitly skipped
  CocoaPods and xcodebuild because neither is installed.
- cd mobile && npm audit --omit=dev — exit 0; 0 vulnerabilities.
- git diff --exit-code -- mobile/ios mobile/package-lock.json and git diff
  --check — exit 0; no tracked native/lock drift or whitespace errors.
- Three independent read-only reviews found no remaining implementation or
  scope blocker. Their two fail-closed findings, one governed mutation-coverage
  finding, and documentation-truth findings were corrected before the final
  unit/type/diff gate. These reviews are advisory; the rerunnable commands above
  are authoritative.
- Legacy Python ruff / pytest — NOT RUN locally: this checkout has no project
  venv, and the offline dependency set is incomplete. The hosted Legacy Python
  safety job must provide that independent evidence after publication.

assumptions:

- Mistake Patterns intentionally consumes the reconciled full-workspace
  projection and each trade's current completed review head. Trade Browser
  account/date/day/search/facet state does not scope governed report truth.
- Exact saved display labels are report identity after the existing authored
  review normalization and limit contract. The report validates but never
  repairs, normalizes, deduplicates, or drops stored values.
- Open and closed trades are equally eligible; no result, currency, risk, or
  position-state condition is part of the cohort.
- tradeSubjectId remains the only continuation identity. The allowlisted report
  source and captured trigger are transient DOM state and absent from URLs,
  storage, exports, restores, archives, and digests.
- Browser evidence uses production Chromium and the in-memory
  SessionJournalStore. It is not a native bridge, SQLCipher transaction, second
  scene, relaunch, VoiceOver, hardware-keyboard, or physical-iPhone result.

open:

- HOLD native Mistake Patterns acceptance: verify checksum/count narration,
  multi-label conservation, five/25 progressive controls, exact-ID
  continuation, close/save focus return, VoiceOver, 200% native Dynamic Type,
  hardware keyboard, lifecycle, relaunch, and physical-device layout on a
  current Mac/iPhone.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft omits
  current-review-head source and draft/completed eligibility from its proposed
  evidence/checksum definition. Resolve that definition before approval.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before claiming
  ETF/options/futures/crypto file coverage; the current generic adapter records
  rows as stock.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- MED — re-audit the next autonomous product slice after publication. Emotion
  Patterns v1 is the nearest safe count-and-evidence reuse, but it should ship
  only if it adds decision value rather than report-family repetition; keep any
  candidate free of P&L/rate/rank/causation/advice and persistence.
- LOW — upgrade GitHub Action runtimes in a separate maintenance slice; current
  checks pass but hosted logs warn about Node 20 action runtimes.
- Attachments, verified Delete All Data, saved presets, persistent/report scope,
  fuller account/vocabulary/playbook management, remaining report families,
  and native restore/backup acceptance remain separate governed work.
- Fleet guard-layer screening was not evidenced for this slice; do not treat
  this handoff as guard approval.
- Do not claim native readiness, native backup completeness, broader CSV asset
  support, or start broker sync, execution, hosted Connect, Android, recurring
  AI, TestFlight, App Store submission, pricing, or public comparative
  positioning from this milestone.

## Prior milestone — Report Trade Continuation v1

> Historical snapshot; current status and open items are superseded by the
> then-current Mistake Patterns v1 handoff above.

Status: verified Report Trade Continuation v1 ·
updated 2026-07-15

### Historical handoff

task: Deliver Report Trade Continuation v1: open the exact existing trade from
Plan Check and Setup Breakdown evidence on iPhone without routing through
Trades or changing governed report, review-persistence, or archive contracts.

stage: codex

lane: fleet-handoff

produced:

- Every Plan Check and Setup Breakdown contributor now exposes **Open trade**
  only when its stable `tradeSubjectId` resolves to exactly one current trade.
  Symbol text, DOM order, and retained Trade Browser search are never identity
  fallbacks.
- The existing review/detail sheet opens in place over Reports. Its action and
  heading qualify the symbol with asset class, account, and session, and the
  sheet names the full-workspace report source without using or clearing Trades
  account/date/day/search/facet state.
- One replaceable root-level delegated listener covers initially rendered and
  progressively appended Plan rows, Setup evidence, and Setup groups without
  duplicate bindings. Activation revalidates exact identity and an allowlisted
  Plan/Setup source against the current render snapshot.
- Missing or duplicate identity aborts an incoherent report render. Blank,
  unknown, duplicate, or tampered activation identity/source displays a focused
  inline error before any modal, inert state, or store operation.
- Ordinary close restores the exact surviving trigger and scroll position. A
  confirmed save or reconciliation refresh may move the contributor between
  governed cohorts, so refresh returns focus to the originating Plan or Setup
  heading instead of treating a replacement row as the same DOM node.
- Demo inspection remains read-only. Local saves reuse the existing immutable,
  stable-subject review command and its exact-command recovery paths; no new
  selected-trade/report-origin state or persistence contract was introduced.
- Unit and production-browser coverage protects initial/progressive actions,
  duplicate symbols, hostile IDs, exact render matching, invalid source and
  identity, retained conflicting Trades state, disclosures/DOM/scroll/storage
  continuity, offline operation, sequential Tab access, an explicit focus trap,
  44-point controls, and no overflow at 320 and 421 CSS pixels with 200% text.
- README, product blueprint, roadmap, local-ledger contract, and Mac handoff
  record the delivered continuation while keeping VoiceOver, native Dynamic
  Type, hardware-keyboard, lifecycle, and physical-device acceptance open.
- No schema, migration, report builder/input, formula/version, checksum, cohort
  definition or eligibility rule, ordering, pagination, archive/export shape,
  native source, security credential, destructive workflow, or public
  comparative claim changed.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 41 files, 446 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; 8 tests passed.
- `cd mobile && npm run test:e2e -- e2e/reports-navigation.spec.ts` — exit 0;
  all 6 Reports journeys passed after adding invalid-source, sequential-Tab,
  and outside-sentinel focus-trap evidence.
- `cd mobile && npm run test:e2e` — exit 0; all 59 production-browser
  journeys passed in 34.0 seconds, including existing ambiguous-save, stale-
  head, receipt-recovery, report-save, and mobile-layout journeys.
- `cd mobile && npm run ios:copy && npm run verify:ios-sync` — exit 0; Vite
  transformed 64 modules, 6 production files matched the iOS public copy
  byte-for-byte with SHA-256
  `02f103eeb9d54243cae21e17753e8217ef043e12e070a850d64729ca0394b872`,
  generated Capacitor identity/SQLite registration and tracked drift passed,
  and every native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no tracked native/lock drift or whitespace
  errors.
- Three independent read-only reviews found no implementation or scope blocker.
  Their documentation-truth findings were corrected, and both medium
  mutation-coverage findings were added before the final 446-unit/59-browser
  gate. These reviews are advisory; the rerunnable commands above are
  authoritative.
- Legacy Python `ruff` / `pytest` — NOT RUN locally: this checkout has no
  project venv, and the offline dependency set is incomplete. The hosted
  Legacy Python safety job must provide that independent evidence after
  publication.

assumptions:

- Plan Check and Setup Breakdown intentionally consume the reconciled
  full-workspace snapshot. Trade Browser session state does not scope governed
  report truth.
- `tradeSubjectId` is the only continuation identity and must have exactly one
  current match. The Plan/Setup source and captured trigger remain transient DOM
  state and are absent from URLs, storage, exports, archives, and digests.
- Browser evidence uses production Chromium and the in-memory
  `SessionJournalStore`. It is not a native bridge, SQLCipher transaction,
  second scene, relaunch, VoiceOver, hardware-keyboard, or physical-iPhone
  result.
- An explicit local save can legitimately move report membership and totals;
  only their definitions, derivation, ownership, and persistence contracts are
  claimed unchanged.

open:

- HOLD native Report Trade Continuation acceptance: repeat Plan and Setup open,
  duplicate-symbol disambiguation, exact close return, save-and-refresh heading
  return, invalid-source/identity handling, progressive contributors,
  VoiceOver, 200% native Dynamic Type, hardware keyboard, multi-scene,
  background/foreground, relaunch, and physical-device layout on a current
  Mac/iPhone.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft omits
  current-review-head source and draft/completed eligibility from its proposed
  evidence/checksum definition. Resolve that definition before approving or
  publishing the report.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before claiming
  ETF/options/futures/crypto file coverage; the current generic adapter records
  rows as stock.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- MED — next autonomous candidate: Mistake Patterns v1, count-and-evidence
  only, derived from exact labels on current completed review heads. Reconcile
  unique included trades separately from multi-mistake assignment counts, reuse
  exact `tradeSubjectId` continuation, and exclude P&L, win rate, R,
  expectancy, ranking, causation, advice, persistence, and the held Symbol
  Breakdown definition.
- LOW — upgrade GitHub Action runtimes in a separate maintenance slice; current
  checks pass but hosted logs warn about Node 20 action runtimes.
- Attachments, verified Delete All Data, saved presets, persistent/report scope,
  fuller account/vocabulary/playbook management, remaining report families,
  and native restore/backup acceptance remain separate governed work.
- Fleet guard-layer screening was not evidenced for this slice; do not treat
  this handoff as guard approval.
- Do not claim native readiness, native backup completeness, broader CSV asset
  support, or start broker sync, execution, hosted Connect, Android, recurring
  AI, TestFlight, App Store submission, pricing, or public comparative
  positioning from this milestone.

## Prior milestone — Reports Navigator v1

> Historical snapshot; current status and open items are superseded by the
> newer Report Trade Continuation v1 milestone and later by the then-current
> Mistake Patterns v1 handoff above.

Status: verified Reports Navigator v1 ·
updated 2026-07-15

### Historical handoff


task: Deliver Reports Navigator v1: make the full governed Reports workspace
practical to traverse on an iPhone without changing report inputs, formulas,
evidence, persistence, or archive truth.

stage: codex

lane: fleet-handoff

produced:

- `mobile/src/ui/reports-view.ts` adds a semantic **Report sections** landmark
  with ordered jump paths for Performance summary, Journal curve, Plan check,
  and Setup breakdown. Stable focus targets and return-to-menu paths make each
  report section keyboard- and screen-reader-navigable without URL, store, or
  snapshot state.
- The cumulative Journal curve now follows the summary and precedes the two
  evidence-heavy breakdowns. It still consumes the same governed
  `snapshot.performance` and `snapshot.equityCurve`; Plan and Setup builders,
  evidence identifiers, checksums, totals, and eligibility rules are unchanged.
- Report navigation measures the rendered top bar before scrolling, focuses the
  destination without a second scroll, and keeps report links and disclosure
  controls above the fixed tab bar when they fit. The listener belongs to the
  transient Reports screen and also covers Setup groups appended after a
  disclosure opens.
- The Dashboard **Open plan check** path now opens Reports directly at the Plan
  target. Expanded Plan and Setup disclosures remain expanded while navigating,
  and no report rerender occurs for an in-screen jump.
- At 480px and below the top bar participates in document flow, preserving usable
  review space at 200% browser text while the bottom navigation remains fixed.
  Menu labels wrap, the index becomes one column, and new controls retain the
  44-point touch-target contract without horizontal overflow.
- Unit coverage protects semantic order, focus targets, return paths, measured
  offset ordering, unsupported-target failure, and navigation without rerender.
  Production-browser coverage protects pointer and keyboard paths, direct
  Dashboard entry, governed report fingerprints, disclosure and DOM continuity,
  storage immutability, offline behavior, strict 320×568/200% visibility, and
  genuine Tab traversal at the 421×568/200% breakpoint edge.
- README, product blueprint, roadmap, local-ledger contract, and Mac handoff
  record the delivered information architecture while keeping VoiceOver,
  native Dynamic Type, hardware-keyboard, multi-scene, lifecycle, and physical-
  device proof explicitly open.
- No schema, migration, ledger/store/archive shape, execution fact, financial
  formula/version, governed report input or checksum, native source, security
  credential, destructive workflow, or public comparative claim changed.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 41 files, 444 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; 8 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 55 production-browser journeys
  passed, including the three Reports Navigator journeys and 11 focused Reports
  and mobile-shell compatibility journeys.
- `cd mobile && npm run ios:copy && npm run verify:ios-sync` — exit 0;
  Vite transformed 64 modules, 6 production files matched the iOS public copy
  byte-for-byte with SHA-256
  `70ce055719bac643d8ba7880ddec62087cbd77353a353d755fffa9b7c096670a`,
  generated Capacitor identity/SQLite registration and tracked drift passed,
  and every native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no tracked native/lock drift or whitespace
  errors.
- Three independent final reviews found no functional, formula, scope,
  persistence, security, listener-lifetime, documentation-truth, iPhone-layout,
  accessibility, or test-quality blocker after that milestone's handoff and a
  421px/200% control-visibility finding were addressed. These reviews are
  advisory; the rerunnable commands above are authoritative.
- Legacy Python `ruff` / `pytest` — NOT RUN locally: this checkout has no
  project venv, and the offline dependency set is incomplete. The hosted
  Legacy Python safety job must provide that independent evidence after
  publication.

assumptions:

- Reports intentionally receives the reconciled full-workspace snapshot. The
  Trade Browser's session-only filters do not scope governed report truth.
- Jump state is transient DOM focus/scroll state. It is intentionally absent
  from URLs, local storage, archives, exports, and report checksums.
- Browser evidence uses production Chromium and the in-memory
  `SessionJournalStore`. It is not a native bridge, SQLCipher transaction,
  second scene, relaunch, VoiceOver, hardware-keyboard, or physical-iPhone
  result.
- Making the top bar non-sticky through 480 CSS pixels is intentional: at
  320×568 the sticky header consumed most of the 200% text viewport, and an
  independent audit reproduced the same control-visibility cliff at 421×568.

open:

- HOLD native Reports Navigator acceptance: repeat VoiceOver, 200% native
  Dynamic Type, hardware keyboard, direct Dashboard entry, every jump/return,
  expanded disclosure visibility, multi-scene, background/foreground, relaunch,
  and physical-device layout on a current Mac/iPhone.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft omits
  current-review-head source and draft/completed eligibility from its proposed
  evidence/checksum definition. Resolve that definition before approving or
  publishing the report.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before claiming
  ETF/options/futures/crypto file coverage; the current generic adapter records
  rows as stock.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- MED — next autonomous candidate: continue from a report evidence row to its
  existing trade using the stable subject identifier, with duplicate-symbol,
  progressive-append, focus, and no-formula-change coverage.
- LOW — upgrade GitHub Action runtimes in a separate maintenance slice; current
  checks pass but hosted logs warn about Node 20 action runtimes.
- Attachments, verified Delete All Data, saved presets, persistent/report scope,
  fuller account/vocabulary/playbook management, remaining report families,
  and native restore/backup acceptance remain separate governed work.
- Fleet guard-layer screening was not evidenced for this slice; do not treat
  this handoff as guard approval.
- Do not claim native readiness, native backup completeness, broader CSV asset
  support, or start broker sync, execution, hosted Connect, Android, recurring
  AI, TestFlight, App Store submission, pricing, or public comparative
  positioning from this milestone.

## Prior milestone — Dynamic Review Facets v1

> Historical snapshot; current status and open items are superseded by the
> then-current Reports Navigator v1 handoff above.

Status: verified Dynamic Review Facets v1 ·
updated 2026-07-15

### Historical handoff

task: Deliver Dynamic Review Facets v1: add exact current Mistake, Emotion, and
Tag controls to scoped Trades without changing ledger, financial, calendar, or
governed-report truth.

stage: codex

lane: fleet-handoff

produced:

- `mobile/src/application/trade-browser.ts` adds session-only exact
  `mistake`, `emotion`, and `tag` state. The predicates AND with the four
  fixed facets, normalized search, and account/date/day scope while exact
  evidence, contribution P&L, allocation/day counts, calendar state, Dashboard,
  and governed Reports remain unchanged.
- Dynamic choices derive only from current `TradePreview` assignments across
  the whole workspace, independent of active scope and unused `reviewOptions`
  vocabulary. Current labels are revalidated against the saved-review
  normalization and limit contract. Choice arrays use stable code-unit order,
  detach from source objects, and are deeply frozen.
- A well-formed selected value may outlive its final current assignment. The
  browser retains it, the UI labels it **not currently assigned**, and the exact
  predicate returns zero cards rather than silently clearing or broadening.
  Malformed retained state or incoherent current trade labels fail closed.
- `mobile/src/ui/trades-view.ts` renders native Mistake, Emotion, and Tag
  selects alongside the four fixed controls. Empty categories are disabled,
  values are escaped, all seven controls refresh from the current workspace,
  Clear search and filters preserves scope, Clear all resets both layers, and
  navigation/valid refresh retains session state. Mode switches and reload
  discard it.
- Unit coverage independently protects each dynamic predicate, pairwise AND
  behavior with near-matches, multi-valued membership, whole-workspace option
  ownership, normalization/limits, stale values, escaping, empty categories,
  detachment, and deep freezing.
- The production-browser suite composes all seven facets with search and
  account/day scope, proves Reports and exact totals remain whole, saves and
  replaces a real local review offline, retains all three stale selections, and
  verifies seven selects plus touch targets and no horizontal overflow at
  320px/200% text.
- README, product blueprint, roadmap, local-ledger contract, and Mac handoff
  record the delivered browser boundary and keep VoiceOver, native Dynamic
  Type, hardware keyboard, multi-scene, lifecycle, and physical-device proof
  explicitly open.
- No schema, migration, review digest, store/archive shape, execution fact,
  financial formula/version, native source, security credential, destructive
  workflow, or public comparative claim changed.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 41 files, 442 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; 8 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 52 production-browser
  journeys passed, including the three Trade Browser facet journeys.
- `cd mobile && npm run ios:copy && npm run verify:ios-sync` — exit 0;
  Vite transformed 64 modules, 6 production files matched the iOS public copy
  byte-for-byte with SHA-256
  `ef2bbbda3b54b96d6b1840ce3b6e905df6f77dfae1eec23149ae087b79acadc2`,
  generated Capacitor identity/SQLite registration and tracked drift passed,
  and every native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no tracked native/lock drift or whitespace
  errors.
- Legacy Python `ruff` / `pytest` — NOT RUN locally: this checkout has no
  project venv, and the offline dependency set is incomplete. The hosted
  Legacy Python safety job must provide that independent evidence after
  publication.

assumptions:

- Current `TradePreview` review projections are the reconciled read model for
  current assignments. Historical/day vocabulary intentionally does not create
  a selectable value.
- Stale well-formed values deliberately remain exact zero-result predicates;
  clearing them is an explicit user action.
- Browser evidence uses production Chromium and the in-memory
  `SessionJournalStore`. It is not a native bridge, SQLCipher transaction,
  second scene, relaunch, VoiceOver, hardware-keyboard, or physical-iPhone
  result.
- Two independent final reviews found no implementation, financial-scope,
  iPhone-layout, accessibility-copy, or documentation-truth blocker after an
  initial test-isolation gap and stale active-handoff finding were addressed.
  These advisory reviews are claims; the rerunnable commands above remain the
  authoritative evidence.

open:

- HOLD native seven-facet acceptance: repeat VoiceOver, 200% Dynamic Type,
  hardware keyboard, review refresh/stale choice, account/day invalidation,
  multi-scene, background/foreground, relaunch, and physical-device layout on a
  current Mac/iPhone.
- HIGH — HUMAN GATE: the separate unpublished Symbol Breakdown draft omits
  current-review-head source and draft/completed eligibility from its proposed
  evidence/checksum definition. Resolve that definition before approving or
  publishing the report.
- HIGH — HUMAN GATE: define generic-CSV asset-class semantics before claiming
  ETF/options/futures/crypto file coverage; the current generic adapter records
  rows as stock.
- HIGH — HUMAN GATE: atomic batch exact-command recovery still requires an
  approved durable batch receipt plus schema/migration/export/restore behavior.
- MED — next autonomous candidate: improve the Reports information architecture
  with an accessible index/jump path while keeping report inputs and formulas
  unchanged.
- LOW — upgrade GitHub Action runtimes in a separate maintenance slice; current
  checks pass but hosted logs warn about Node 20 action runtimes.
- Attachments, verified Delete All Data, saved presets, persistent/report scope,
  fuller account/vocabulary/playbook management, remaining report families,
  and native restore/backup acceptance remain separate governed work.
- Fleet guard-layer screening was not evidenced for this slice; do not treat
  this handoff as guard approval.
- Do not claim native readiness, native backup completeness, broader CSV asset
  support, or start broker sync, execution, hosted Connect, Android, recurring
  AI, TestFlight, App Store submission, pricing, or public comparative
  positioning from this milestone.

## Prior milestone — Batch Tag Known-Commit Refresh-Only Recovery v1

> Historical snapshot; current status and open items are superseded by the
> then-current Dynamic Review Facets v1 handoff above.

task: Deliver Batch Tag Known-Commit Refresh-Only Recovery v1: once a batch
tag result resolves, make redraw recovery one-way and prove it cannot prepare
or submit another review batch.

stage: codex

lane: fleet-handoff

produced:

- mobile/src/ui/app.ts now validates and mounts a recovery alert dialog before
  persistence, then synchronously locks the tag, selected subjects, submit,
  navigation, and background interactions behind one `ready → saving →
  committed` UI state. Deterministic pre-commit failure removes the modal,
  restores the original controls, and returns focus to bounded form error.
- A direct `committed` result retains truthful atomic-batch wording. A
  reconciled `duplicate` result says only that exact selected member revisions
  are already present and explicitly withholds atomic batch identity because
  the store has no durable batch receipt.
- Once the result resolves, the old form can never re-enter
  `addTagToTrades`. A failed redraw exposes only **Retry journal refresh**;
  repeated form submissions and repeated retry activation are synchronously
  guarded, generate no identity, and make no store call. Caught adapter,
  database, and path detail is replaced with bounded local copy.
- The recovery sheet is outside `#screen`, so it survives a redraw that
  disconnects the old form. It owns inert/modal state before the first
  persistence await, remains programmatically focusable with no enabled
  controls, traps Tab, ignores Escape/backdrop dismissal, and releases only
  the modal ownership it acquired after successful refresh or definite
  pre-commit rejection.
- The production-browser regression runs offline at 320px and 200% text. It
  proves pre-commit cleanup, two selected trades, a positively calibrated
  direct store-call tripwire, blocked double submit, blocked double retry, two
  failed redraws, private-detail suppression, focus/inert/Escape/backdrop
  containment, no horizontal overflow, a 44-point retry target, and cleanup
  after success.
- Export evidence keys both selected subjects to exactly one v1 draft, one
  current head, and one matching submission/revision receipt. Active and
  inactive executions, import receipts and their revision index, manual
  submissions, and execution/import counters remain exactly unchanged.
- README, local-ledger contract, product blueprint, iOS roadmap, and Mac
  handoff distinguish this resolved-result boundary from unknown batch status.
  Atomic batch exact-command recovery remains a separate HIGH, human-gated
  schema/migration/export/restore design.
- No schema, migration, review digest, store algorithm, archive shape,
  execution fact, governed formula, financial definition, security
  credential, destructive workflow, native source, or public comparative claim
  changed.

verified:

- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 41 files, 433 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; 8 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 52 production-browser
  journeys passed, including all 14 Trade Review journeys and the new
  two-member batch redraw regression.
- `cd mobile && npm run ios:copy && npm run verify:ios-sync` — exit 0;
  Vite transformed 64 modules, 6 production files matched the iOS public copy
  byte-for-byte with SHA-256
  `7113c109a1cc7c8f9acd533b6c30f6cbfd5767d417670b28c2b12488a812df5a`,
  selected generated identity/SQLite registration and tracked drift passed,
  and every native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no tracked native/lock drift or whitespace
  errors.
- Legacy Python `ruff` / `pytest` — NOT RUN locally: this checkout has no
  project venv, and the offline uv cache lacks `apscheduler`. The hosted
  Legacy Python safety job must supply that independent evidence after publish;
  the failed offline probe changed no tracked file and its temporary venv was
  removed.

assumptions:

- Three independent read-only re-audits reported CLEAN after their initial
  proof-classification, store-tripwire, exact-receipt, modal-ownership, focus,
  and responsive findings were addressed. Those advisory reports are not
  cold-rerunnable evidence; the command-backed gates above remain
  authoritative.
- `outcome: committed` is the direct atomic store result.
  `outcome: duplicate` proves only reconciled exact member revisions in this
  UI; it does not inherit atomic batch identity.
- Browser evidence uses the production application and in-memory
  SessionJournalStore. It is not a native bridge, SQLCipher transaction,
  second scene, relaunch, VoiceOver, hardware-keyboard, or physical-device
  result.
- Unknown batch status before a resolved result is intentionally not replayed
  or called recovered by this slice. A durable batch receipt remains necessary
  for exact atomic proof across ambiguity.

open:

- HIGH — HUMAN GATE: design atomic batch exact-command recovery around a
  durable batch receipt. Approve schema/migration/export/restore behavior
  before implementation; current member receipts must not be presented as one
  atomic batch identity.
- HOLD native batch/individual review acceptance: repeat bridge loss,
  resolved-result redraw failure, duplicate reconciliation, multi-scene races,
  background/foreground, force quit/relaunch, SQLCipher/Keychain, VoiceOver,
  Dynamic Type, hardware keyboard, and physical-device layout on a current
  Mac/iPhone.
- MED — next autonomous product candidate: session-only exact dynamic
  tag/mistake/emotion facets over already-scoped Trades cards, without changing
  ledger/report scope.
- LOW — upgrade GitHub Action runtimes in a separate maintenance slice; current
  checks pass but hosted logs warn about Node 20 action runtimes.
- Separate Symbol Breakdown and generic-CSV asset-class WIP remain
  uncommitted/unpublished and human-gated. Attachments and verified Delete All
  Data remain separate governed slices.
- Do not claim ambiguous batch exact recovery, native backup readiness,
  native multi-scene/device acceptance, or start broker sync, trade execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.

## Prior milestone — Individual Trade Review Stale-Head Recovery v1

> Historical snapshot; superseded first by Batch Tag Known-Commit Refresh-Only
> Recovery v1 and later by the then-current Dynamic Review Facets v1 handoff
> above.

task: Deliver Individual Trade Review Stale-Head Recovery v1: preserve one
complete unsaved review after deterministic optimistic-concurrency rejection,
prove and display the exact newer local head, require explicit non-merge
consent and a fresh command identity, and repeat that gate if another writer
wins.

stage: codex

lane: fleet-handoff

produced:

- mobile/src/ui/trade-review-sheet.ts routes only a deterministic first-result
  `review_changed` into stale recovery. The obsolete prepared command is
  cleared; authored controls and every dismissal path remain locked until one
  fresh local snapshot proves exactly one coherent, different, strictly newer
  review for the same durable trade subject. Other direct conflicts retain the
  existing refresh-before-reopen path, and post-unknown conflicts remain
  ambiguous exact-replay holds.
- The comparison region escapes and displays the newer review's version/state,
  trade/account context, setup, reflection, mistakes, emotion, tags, playbook,
  ordered rule outcomes, risk/currency, planned stop, execution-allocation
  count, Result R, and percent return. Missing, duplicate, demo, pending,
  same-identity, equal/older-version, or incoherent candidates fail closed
  without rendering private error detail.
- A failed comparison refresh preserves all raw static values and every ordered
  dynamic rule row, leaves saving and dismissal locked, creates no identity,
  and exposes only a generic retry. Successful proof keeps the same complete
  form, focuses the evidence, and makes consent the next action in keyboard
  order. Cancel then requires the existing dirty-form confirmation.
- **Continue with my unsaved review** copies only the displayed predecessor
  identity, rotates the member submission ID once, and performs no save. Copy
  explicitly says the entire form—not a field merge—will become the next
  immutable version. A completed base hides draft save and permits only a
  completed successor. A later competing head clears old evidence, relocks
  dismissal, and requires a second fresh proof and consent before another
  command can be prepared.
- mobile/src/ui/app.ts returns the same freshly loaded workspace snapshot used
  to rerender the background, binding candidate selection, evidence, playbook
  lookup, and currency fallback to one read. Existing proven-commit
  refresh-only behavior is unchanged.
- Unit/application coverage proves escaped complete evidence, fail-closed
  candidate selection, one-call stale propagation, and projection of only the
  competing head. The SQLite algorithm regression proves a v1→v4 supersedes
  chain, one head, four successful submission receipts, unchanged archive
  state across both stale attempts, absent stale submissions, and immutable
  executions.
- The production-browser journey retains one editor through a failed evidence
  render, exact v2 comparison, a hidden v3 writer, two explicit consents, and
  final completed v4 persistence. It proves every prepared predecessor and
  consent-generated member identity directly, absence of receipts for both
  rejected commands, full raw-field/rule preservation across both races,
  exact allocation/R/return evidence without opaque IDs, focus and dismissal
  containment, 320px/200% reflow, offline behavior, one final head, four
  successful receipts, and no external requests.
- README, the ledger contract, product blueprint, iOS roadmap, and Mac handoff
  describe the browser boundary and native acceptance matrix. Atomic batch
  exact-command recovery remains a separate HIGH, human-gated persistence
  design because member receipts cannot prove atomic batch identity; a durable
  batch receipt requires schema/migration/export/restore decisions.
- No schema, migration, archive shape, store algorithm, execution fact,
  governed formula, financial definition, security credential, destructive
  workflow, native source, or public comparative claim changed.

verified:

- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 41 files, 433 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; 8 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 51 production-browser
  journeys passed, including all 13 Trade Review journeys and the retained
  editor v1→v4 stale race.
- `cd mobile && npm run ios:copy && npm run verify:ios-sync` — exit 0; Vite
  transformed 64 modules, 6 production files matched the iOS public copy
  byte-for-byte with SHA-256
  `a61a09e8d3d629c014e285155a15273ee88619f2d16b07fb021c3bc6a57a092c`,
  selected generated identity/SQLite registration and tracked drift passed,
  and every native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no tracked native/lock drift or whitespace
  errors.

assumptions:

- The final read-only UI/accessibility and documentation audits reported CLEAN.
  Their advisory reports are not cold-rerunnable evidence; the command-backed
  gates above remain authoritative. The test audit's initial acceptance-proof
  findings were addressed with direct command/receipt and repeated raw-form
  assertions, then rerun.
- Browser evidence uses one production application and its in-memory
  SessionJournalStore. Retained editors are deterministic UI concurrency
  evidence, not a second WKWebView scene, native SQLite bridge, SQLCipher
  transaction, relaunch, or device lifecycle result.
- The SQLite regression exercises the production store algorithm through its
  SQL harness. It is not runtime evidence for the Capacitor plugin, SQLCipher,
  Keychain, background/foreground behavior, or a physical database on iOS.
- The complete-form successor intentionally replaces review-owned fields; it
  does not merge them. Superseded immutable versions remain in history.
- Existing member receipts are sufficient for the individual sheet but cannot
  establish exact atomic replay for a multi-member batch. Designing the
  required durable batch receipt is a human-gated schema/migration/export/
  restore decision.
- No schema, migration, archive, formula, financial, destructive, security-
  credential, native, or public-positioning decision is inferred from this
  reliability slice.

open:

- HIGH — HUMAN GATE: design atomic batch exact-command recovery around a
  durable batch receipt. Approve the schema/migration/export/restore contract
  before implementation; current member receipts must not be presented as
  exact atomic proof.
- HOLD native individual-review acceptance: repeat pre/post-commit bridge
  loss, exact replay, deterministic stale comparison/consent, failed evidence
  rendering, a later head from a second real scene, repeated race, completed
  monotonicity, background/foreground, force quit/relaunch, SQLCipher/Keychain,
  VoiceOver, Dynamic Type, hardware keyboard, and physical-device layout on a
  current Mac/iPhone.
- LOW: upgrade GitHub Action runtimes in a separate maintenance slice; current
  checks pass but hosted logs warn about Node 20 action runtimes.
- Separate Symbol Breakdown and generic-CSV asset-class WIP remain
  uncommitted/unpublished and human-gated. Attachments and verified Delete All
  Data remain separate governed slices; deletion requires its dedicated human
  gate.
- Do not claim batch exact recovery, native backup readiness, native
  multi-scene/device acceptance, or start broker sync, trade execution, hosted
  Connect, Android, recurring AI, TestFlight, App Store submission, pricing,
  or public comparative positioning from this milestone.

## Prior milestone — Single-Trade Review Exact-Command Recovery v1

> Historical snapshot; current status and open items are superseded by the
> then-current Individual Trade Review Stale-Head Recovery handoff above.

task: Deliver Single-Trade Review Exact-Command Recovery v1 for the individual
Trade Review sheet: retain one immutable prepared command across an unknown
save outcome, permit only exact replay, fail closed on unproven conflicts, and
separate proven-commit refresh failure from persistence retry.

stage: codex

lane: fleet-handoff

produced:

- mobile/src/ui/trade-review-sheet.ts retains the frozen single-member
  PreparedTradeReviewBatch before the first commit call. Unknown status locks
  every authored control and close path; **Retry this exact save** is the only
  enabled action and reuses the same batch/member identities, predecessor,
  normalized review, and revisions without rereading the form.
- mobile/src/application/journal-application.ts tracks whether any earlier
  response in the same safe-call sequence was unknown. After that boundary,
  every later JournalTradeReviewError remains ambiguous unless the current
  exact revision positively reconciles the command. This explicit state also
  covers an adapter rejection whose value is undefined.
- Durable proof is the ordered set of exact member submission/revision
  receipts; there is no persisted batch receipt. Browser-session and SQLite
  regressions prove a historical exact retry can return its original version
  after later heads advance while preserving current projections, hashes,
  version/head cardinality, and receipt cardinality. Equal content under a
  different submission is not proof.
- A deterministic first-result conflict preserves the raw form, disables
  obsolete submits and every dismissal path, and exposes **Refresh journal
  before reopening**. Successful refresh updates the background but retains
  the draft until the user explicitly cancels and reopens. Refresh failure
  remains blocked and retryable. Any non-head conflict after an earlier unknown
  result stays frozen with exact replay as the only action.
- Positive committed/duplicate proof clears the retained command. If rendering
  then fails, the sheet exposes only **Retry journal refresh** and cannot invoke
  persistence. Raw adapter, database, and path details are never rendered;
  only bounded preparation errors may surface.
- Busy transitions dynamically capture current controls, including rule fields
  added after the sheet opens. Repeated activation is synchronously guarded,
  zero-control focus trapping falls back to the dialog, and disconnected
  trigger close falls back to #screen.
- Five production-bound Playwright journeys prove repeated pre-mutation
  ambiguity and exact replay, double-activation protection, a competing head,
  a direct first-attempt receipt conflict, same-submission/different-content
  ambiguity, and known-commit render failure. They assert zero form rereads or
  identity generation during replay, exact persisted review fields and ledger
  cardinality, enforced refresh-before-dismissal, offline behavior, and
  320px/200% reflow where applicable.
- README, the ledger contract, product blueprint, iOS roadmap, and Mac handoff
  describe this individual-sheet browser boundary. Atomic batch-tag recovery,
  full Trade Review stale-head evidence/consent/rebase, native bridge loss,
  multi-scene behavior, relaunch, SQLCipher/Keychain, VoiceOver, Dynamic Type,
  and physical-device acceptance remain open.
- No schema, migration, archive shape, store algorithm, execution fact,
  governed formula, financial definition, security credential, destructive
  workflow, native source, or public comparative claim changed.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 41 files, 428 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; 8 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 51 Playwright journeys
  passed, including the five new recovery journeys.
- Focused final `cd mobile && npm run test:e2e -- e2e/trade-review.spec.ts
  --grep "uncertain trade review|exact review retry|direct review receipt
  conflict|different content owns|proven trade review commit"` — exit 0; all
  5 recovery journeys passed together.
- `cd mobile && npm run build` — exit 0; Vite transformed 64 modules and
  emitted the production bundle.
- `cd mobile && npm run ios:copy && npm run verify:ios-sync` — exit 0; 6
  production files matched the iOS public copy byte-for-byte with SHA-256
  `4f98c5cb39cb5bbc1379d94719004c695ce0e7ba363ccb3b44d90d86ac7c017d`;
  selected generated identity/SQLite registration and tracked drift passed;
  every native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no tracked native/lock drift or whitespace
  errors.
assumptions:

- Independent read-only application/store, UI/accessibility, and integration
  audits reported CLEAN after the final refresh-before-dismissal gate. These
  advisory reports are not cold-rerunnable evidence; the command-backed gates
  above remain authoritative.
- Browser evidence uses one production application and its in-memory
  SessionJournalStore. Multiple retained editors are deterministic UI
  concurrency evidence, not a second WKWebView scene, native SQLite bridge,
  SQLCipher transaction, relaunch, or device lifecycle result.
- The retained prepared command exists only in sheet memory. Reloading or
  force-quitting during ambiguity can lose it, so recovery copy requires the
  sheet to remain open until commit is positively proven.
- Existing exact member receipts are sufficient for this single-member sheet.
  They do not establish atomic replay for a multi-member batch, which has no
  durable batch receipt and currently regenerates batch/member identities.
- Same-call domain errors after an unknown response are intentionally treated
  as ambiguous because the application contract does not prove whether receipt
  lookup preceded a clock, workspace, projection, bridge, or store failure.
- No schema, migration, archive, formula, financial, destructive, security-
  credential, native, or public-positioning decision is inferred from this
  reliability slice.

open:

- HIGH: atomic batch-tag exact-command recovery. Current
  `bindBatchReviewTagging` / `addTagToTrades` behavior regenerates
  batch/member identities and must not be presented as safe ambiguous replay.
- HIGH: full Trade Review stale-head recovery with proved latest evidence,
  explicit review/consent, a fresh command, and guarded rebase. This increment
  provides only fail-closed refresh-before-reopen.
- HOLD native individual-review acceptance: repeat bridge loss before/after
  commit, repeated ambiguity, a later head from a second real scene,
  receipt-first replay, direct and post-unknown conflicts, proven-commit refresh
  failure, background/foreground, force quit/relaunch, SQLCipher/Keychain,
  VoiceOver, Dynamic Type, and physical-device layout on a current Mac/iPhone.
- Upgrade GitHub Action runtimes in a separate low-risk maintenance slice;
  current checks pass but hosted logs warn about Node 20 action runtimes.
- Separate Symbol Breakdown and generic-CSV asset-class WIP remain
  uncommitted/unpublished and human-gated. Attachments and verified Delete All
  Data remain separate governed slices; deletion requires its dedicated human
  gate.
- Do not claim broad Trade Review recovery, native backup readiness, or start
  broker sync, trade execution, hosted Connect, Android, recurring AI,
  TestFlight, App Store submission, pricing, or public comparative positioning
  from this milestone.

## Prior milestone — Daily Journal Exact-Command Recovery v1

> Historical snapshot; current status and open items are superseded by the
> then-current Single-Trade Review Exact-Command Recovery handoff above.

task: Deliver Daily Journal Exact-Command Recovery v1: retain the immutable
prepared command across an unknown save outcome, permit only exact replay,
route deterministic stale into the existing preserve/review/consent flow, and
separate proven-commit refresh failure from any persistence retry.

stage: codex

lane: fleet-handoff

produced:

- mobile/src/ui/daily-journal-sheet.ts retains the frozen
  PreparedDailyJournalEntry before its first commit call. An unknown outcome
  leaves all six authored controls and every close path locked; **Retry this
  exact save** is the only enabled action and reuses the same submission ID,
  predecessor, normalized content, tags, and revision without rereading the
  form or generating another identity.
- Exact replay accepts only positive committed/duplicate evidence. Both stores
  already resolve an exact saved submission receipt before current-head
  comparison, so replay can return the original version after a later successor
  advances while projecting the newer head. Browser-session and SQLite
  regressions prove this historical replay leaves the state hash, two-version
  chain, one head, and receipt counts unchanged. Identical authored content
  under a different submission is explicitly not accepted as proof.
- A deterministic `entry_changed` during exact replay enters Daily Journal
  Stale-Head Recovery with the raw draft intact. Every other retry error,
  including a non-head JournalDailyEntryError, remains ambiguous because
  workspace, clock, bridge, or receipt-read failure may occur before positive
  receipt proof. Repeated ambiguity keeps the same command and sheet frozen.
- Once committed/duplicate is proven, the retained command is cleared. A later
  screen-render failure displays generic saved-state copy and exposes only
  **Retry journal refresh**; that branch never invokes persistence. Raw caught
  bridge/database/path detail is no longer rendered. Unexpected non-domain
  save failures also use generic copy; only the bounded
  DailyJournalPreparationError remains user-visible.
- Focus moves inside the dialog before controls are disabled. Hidden conflict
  descendants are excluded from the focus trap by rendered geometry, the
  uncertain sheet contains forward/reverse Tab, and Escape/backdrop cannot
  discard the only in-memory command. Long error text wraps at 320 CSS pixels
  and 200% text.
- The production-bound Playwright journey injects four commit-stack clock
  failures to prove initial and repeated ambiguity, zero product form rereads
  and zero submission-ID generation, only-action/busy/focus semantics,
  Escape/backdrop containment, and 320px/200% layout. A second real editor then
  commits the same date; exact replay enters stale recovery and the explicit
  successor exports exactly two versions, one current head, and two one-to-one
  receipts with no external HTTP(S) request.
- A separate production-bound conflict journey gives different content the
  retained command's submission identity after initial ambiguity. Exact replay
  receives the real non-head `submission_changed` error but keeps the original
  fields and command frozen, renders no domain/path detail, enables only exact
  retry, generates no new identity, and leaves the competing one-version ledger
  unchanged across repeated attempts.
- A separate production-bound journey commits successfully, injects a one-shot
  #screen render failure, proves refresh is the only action, and exports exactly
  one immutable version, one head, and one receipt after refresh succeeds.
- README, the ledger contract, iOS roadmap, product blueprint, and Mac handoff
  describe the browser boundary and retain native bridge-loss, multi-scene,
  relaunch, SQLCipher/Keychain, VoiceOver, Dynamic Type, and physical-device
  acceptance as NOT RUN.
- No schema, migration, archive shape, store algorithm, execution fact,
  governed formula, report definition, financial definition, security
  credential, destructive workflow, or public comparative claim changed.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 41 files, 422 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; 8 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 46 Playwright journeys passed.
- Focused final `cd mobile && npm run test:e2e --
  e2e/daily-journal.spec.ts --grep "uncertain daily reflection|non-head
  submission conflict|proven daily reflection commit|stale daily reflection"`
  — exit 0; all 4 exact/non-head/stale/refresh-only production journeys passed
  together.
- `cd mobile && npm run build` — exit 0; Vite transformed 64 modules and
  emitted the production bundle.
- `cd mobile && npm run ios:copy && npm run verify:ios-sync` — exit 0; 6
  production files matched the iOS public copy byte-for-byte with SHA-256
  `5e77541904298b0d63cfc8e11ce829be014b436cdc9de49d6ceee01725c2264a`;
  selected generated identity/SQLite registration and git drift passed; every
  native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no tracked native/lock drift or whitespace
  errors.
- Independent read-only core, UI/accessibility, and integration audits cleared
  the final slice after adding real non-head interaction coverage, immutable
  archive assertions, zero-persistence refresh instrumentation, generic error
  copy, hidden-descendant focus filtering, and native-evidence limits.

assumptions:

- Browser evidence uses one real production application and its in-memory
  SessionJournalStore. Detaching and reattaching an editor is deterministic UI
  concurrency evidence, not a second WKWebView scene, native SQLite bridge,
  SQLCipher transaction, relaunch, or device lifecycle result.
- The clock fault is scoped to production daily-entry commit stacks so
  Playwright's own actionability clock is not modified. It represents a generic
  pre-mutation store outage and proves the UI's retained-command boundary;
  application units separately prove post-commit response-loss reconciliation,
  and neither is native bridge evidence.
- A raw Daily Journal draft and its retained command remain in memory only.
  Reloading or force-quitting during ambiguity can lose them, so the browser
  copy requires the sheet to stay open and does not recommend restart until
  commit is positively proven.
- No schema, migration, archive, formula, financial, destructive, security-
  credential, or public-positioning decision is inferred from this reliability
  slice.

open:

- Superseded by the then-current individual-sheet milestone above: exact replay
  and refresh-only recovery are now delivered narrowly for one Trade Review.
  Atomic batch-tag recovery and full stale-head evidence/consent remain open.
- HOLD native Daily Journal acceptance: repeat bridge loss before/after commit,
  repeated ambiguity, a later head from a second real scene, receipt-first
  replay, stale-after-unknown, proven-commit refresh failure, background/
  foreground, force quit/relaunch, SQLCipher/Keychain, VoiceOver, Dynamic Type,
  and physical-device 320px behavior on a current Mac/iPhone.
- `submission_changed` and `workspace_changed` remain intentionally
  fail-closed without a dedicated interaction recovery. Trade Review stale-head
  recovery remains a separate editor slice.
- Upgrade GitHub Action runtimes in a separate low-risk maintenance slice;
  current checks pass but hosted logs warn about Node 20 action runtimes.
- Separate Symbol Breakdown and generic-CSV asset-class WIP remain
  uncommitted/unpublished and human-gated. Attachments and verified Delete All
  Data remain separate governed slices; deletion requires its dedicated human
  gate.
- Do not claim native backup readiness or start broker sync, trade execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.

## Prior milestone — Daily Journal Stale-Head Recovery v1

> Historical snapshot; current status and open items are superseded by the
> then-current Daily Journal Exact-Command Recovery handoff above.

task: Deliver Daily Journal Stale-Head Recovery v1: preserve unsaved authored
changes after a deterministic optimistic conflict, prove and display the
different newer local head from one fresh snapshot, and require explicit
consent plus a separate save before appending a successor.

stage: codex

lane: fleet-handoff

produced:

- mobile/src/ui/daily-journal-sheet.ts now classifies deterministic
  daily-entry conflicts separately from uncertain persistence and editable
  validation. An expected-version mismatch keeps all six raw controls in the
  open sheet, locks/describes the conflicted date, disables both obsolete save
  actions, uses neutral pre-proof copy, and leaves Cancel/Escape behind the
  existing dirty-discard confirmation.
- **Review latest saved version** reloads one workspace snapshot through the
  same callback that installs the background view. Reconciliation proceeds
  only when that exact local snapshot proves a different, newer head for the
  same date. Missing, unchanged, nonlocal, non-newer, or failed-refresh evidence
  stays blocked with the draft intact.
- The escaped comparison shows the saved date, version, state, headline,
  reflection, emotion, self-reported score, and tags in a labeled focusable
  region with a visible focus ring. The user must choose **Continue with my
  unsaved changes**, which rotates to a fresh submission ID and accepts the
  displayed head as the base, then separately choose draft/completed save.
  There is no auto-merge, overwrite, null-head fallback, or reconciliation
  commit. A second race re-enters the same guarded path.
- Other deterministic JournalDailyEntryError variants now block the prepared
  save with neutral copy instead of re-enabling an identity that cannot safely
  apply. Ordinary preparation validation stays editable/retryable; uncertain
  persistence remains a separate frozen path.
- mobile/src/ui/app.ts returns the same freshly loaded snapshot that it renders,
  preventing display/base identity from coming from separate reads. Pending
  save focus stays inside the focusable dialog before every control is
  disabled; disconnected-trigger close falls back to #screen.
- Unit coverage proves error classification, escaped comparison output, and
  rejection of same/missing/non-newer/nonlocal reconciliation heads.
  Application coverage proves a deterministic stale domain error passes
  through after one attempt and a fresh read exposes only the competing head.
- The Playwright journey creates v1, retains and detaches its production-bound
  editor, saves competing v2 through a second production editor in the same
  browser application/store, and reattaches v1 to trigger the real stale path.
  A one-shot #screen render failure preserves date plus every authored field,
  keeps both submits blocked, hides evidence/consent, and renders generic
  focused copy; retry then shows v2, visible evidence focus, Tab-to-consent, and
  explicit v3. Offline export proves exactly three immutable versions, one v3
  head, three one-to-one receipts, and no external HTTP(S) request.
- README, iOS roadmap, product blueprint, local-ledger contract, and Mac handoff
  document this as a deterministic retained-editor race in one browser
  application/store. They do not claim native multi-scene, lifecycle, SQLCipher,
  VoiceOver, Dynamic Type, or physical-device acceptance.
- No schema, migration, archive shape, store projection, execution fact,
  governed formula, report definition, financial definition, security
  credential, destructive workflow, or public comparative claim changed.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 41 files, 420 tests passed.
- `cd mobile && npm run test:ios-sync` — exit 0; 8 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 43 Playwright journeys passed.
- Final post-review `cd mobile && npm run test:e2e --
  e2e/daily-journal.spec.ts --grep stale` — exit 0; 1/1 passed with all six
  raw controls retained after injected refresh failure, blocked evidence/
  consent, visible 2px evidence focus, Tab-to-consent, 320px/200% reflow,
  immutable archive history, and offline/no-external-request assertions.
- `cd mobile && npm run build` — exit 0; Vite transformed 64 modules and
  emitted the production bundle.
- `cd mobile && npm run ios:copy && npm run verify:ios-sync` — exit 0; 6
  production files matched the iOS public copy byte-for-byte with SHA-256
  `3b946309eba4d6b9f665b861fed0ba1bb11fc38b9d200464b739cb9c3e0a3033`;
  selected generated identity/SQLite registration and git drift passed; every
  native evidence row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no native/lock drift or whitespace errors.
- Three independent read-only core, UI/accessibility, and integration reviews
  cleared the final stale-head slice after the negative-path, neutral-copy,
  focus-ring, and documentation fixes.

assumptions:

- The browser race retains two real production editor instances bound to one
  in-memory SessionJournalStore. It is deterministic concurrency evidence for
  the UI state machine, not a second window, WKWebView scene, native bridge,
  SQLCipher transaction, relaunch, or device lifecycle result.
- The one-shot test makes the next #screen render throw after the fresh read.
  It proves the UI catch path and privacy-safe rendered copy. Pure helper tests
  independently prove missing, same-ID, non-newer, and nonlocal snapshots do
  not become rebase-ready.
- JournalDailyEntryError `entry_changed` also covers malformed prepared
  commands and range exhaustion, so the initial copy is deliberately neutral;
  only a different newer head from the fresh snapshot earns latest-version
  consent.
- No schema, migration, archive, formula, financial, destructive, security, or
  public-positioning decision is inferred from this reliability slice.

open:

- HIGH next reliability slice: the pre-existing uncertain-save **Reload journal
  and reconcile** action still closes after any readable ledger without proving
  the exact prepared revision exists. Retain and retry the exact immutable
  command (or prove its receipt); committed/duplicate may refresh and close,
  deterministic stale must enter the new flow, and another unknown outcome must
  keep the only in-memory draft frozen.
- HOLD native stale-head acceptance: repeat create/edit collisions, a second
  intervening head, refresh failure, two real scenes/screens, background/
  foreground, force quit, SQLCipher/Keychain, VoiceOver, Dynamic Type, and
  physical-device 320px behavior on a current Mac/iPhone.
- Browser create-collision and repeat-race UI composition remain unproved.
  `submission_changed` and `workspace_changed` now fail closed but do not
  have dedicated interaction recovery. Trade Review stale-head recovery remains
  a separate editor slice.
- Upgrade GitHub Action runtimes in a separate low-risk maintenance slice;
  current checks pass but hosted logs warn about Node 20 action runtimes.
- Separate Symbol Breakdown and generic-CSV asset-class WIP remain
  uncommitted/unpublished and human-gated. Attachments and verified Delete All
  Data remain separate governed slices; deletion requires its dedicated human
  gate.
- Do not claim native backup readiness or start broker sync, trade execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.

## Prior milestone — Startup Recovery v1

> Historical snapshot; current status and open items are superseded by the
> then-current Daily Journal Stale-Head Recovery handoff above.

task: Deliver Startup Recovery v1 and a truthful pre-native iOS evidence gate:
fail closed when the first application open/read cannot establish safe
ownership, permit one full-document retry only after confirmed teardown, and
separate Linux bundle/config-copy proof from later CocoaPods/Xcode/device proof.

stage: codex

lane: fleet-handoff

produced:

- mobile/index.html, mobile/src/ui/startup.ts, and mobile/src/styles.css add a
  semantic pre-JavaScript opening surface plus a focused, keyboard-reachable,
  320px/200%-reflowing recovery alert. Rendered copy is generic and does not
  expose the caught plugin/database detail. No fallback journal, reset, delete,
  or reinstall action is offered.
- The startup controller owns one attempt per document. A constructed
  JournalApplication must close before retry appears. A native factory failure
  is retryable only when factory cleanup remains confirmed; an unconfirmed
  teardown withholds retry and requires a full app close/reopen. The retry is
  guarded against duplicate activation and performs a full document reload.
- NativeJournalDatabaseFactory now keeps retrieve/create acquisition inside its
  cleanup boundary, attempts both database-handle and connection-registry close
  paths, and aggregates the original open failure with every cleanup failure in
  NativeJournalOpenCleanupError. This covers acquisition response loss before a
  JournalApplication can own the connection.
- startApp installs its document keydown listener only after the initial render
  and onboarding bind succeed, so a failed first read does not leak a global
  listener into the recovery surface.
- mobile/scripts/verify-ios-sync.mjs independently hashes the production
  bundle, byte-compares all six files with the ignored iOS public copy, permits
  only the two generated Cordova shims, validates selected generated app/
  SQLite registration fields, and rejects staged, unstaged, or untracked native
  and lockfile drift. Its evidence matrix keeps CocoaPods, native compilation,
  Xcode, Simulator, iPhone, SQLCipher/Keychain, lifecycle, VoiceOver, and
  Dynamic Type at NOT RUN.
- CI now runs the pure ios:copy phase before the verifier. The Mac handoff runs
  copy → verifier → ios:sync/CocoaPods, preserving the pre-native report and
  recording native evidence separately. README, roadmap, product blueprint,
  and Mac acceptance copy reflect that evidence boundary.
- No schema, migration, archive format, store projection, governed formula,
  financial definition, destructive workflow, or public comparative claim is
  changed.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 41 files, 417 tests passed. Native factory
  regressions cover simultaneous handle/registry cleanup failure and connection
  acquisition response loss; startup regressions cover retryable creation,
  close-before-retry, application-close failure, and uncertain factory cleanup.
- `cd mobile && npm run test:ios-sync` — exit 0; 8 tests passed, including every
  selected config mismatch, invalid JSON, all three native NOT RUN rows, and
  unstaged/staged/untracked drift controls.
- `cd mobile && npm run test:e2e` — exit 0; all 42 Playwright journeys passed.
  Startup recovery covers transient and repeated failures, singular controls,
  generic rendered detail, no fallback/external request, focus/keyboard, 48px
  retry, 320px width, and 200% text.
- `cd mobile && npm run build` — exit 0; Vite transformed 64 modules and emitted
  the production bundle.
- `cd mobile && npm run ios:copy && npm run verify:ios-sync` — exit 0; 6 bundle
  files matched byte-for-byte with SHA-256
  `98f8b6387c50b0205326d4ae57c6b28bf5e39240884d3941816337619dc7b5e8`;
  selected generated identity/SQLite registration and git drift passed; every
  native row remained NOT RUN.
- `cd mobile && npm run ios:sync` — exit 0 as a Linux compatibility check;
  Capacitor found only `@capacitor-community/sqlite@8.1.0` and explicitly
  skipped CocoaPods and xcodebuild because neither is installed.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no native/lock drift or whitespace errors.
- Independent read-only startup/core, UI, and iOS-evidence re-reviews reported
  no remaining finding. The startup recovery journeys also passed 10 repeated
  reviewer runs (20/20 tests).

assumptions:

- Chromium injects a browser-preference failure after application construction;
  it proves the generic recovery surface and browser ownership behavior, not a
  native plugin failure. Controller and native-adapter units independently bind
  the same teardown-classification contract.
- “Did not display the technical failure detail” is a rendered-UI claim. Native
  dependency diagnostics and Xcode/device console behavior remain unmeasured
  and are not represented as private by this milestone.
- verify:ios-sync validates a byte-identical public asset copy and selected
  generated-config fields. It is not a canonical whole-config comparison,
  CocoaPods resolution, native compile, plugin-runtime, signing, or
  device-readiness result.
- The retry is one guarded action in the current document. Reload creates a new
  document and rechecks the same retained local journal; it does not create a
  browser/demo replacement.
- No schema, migration, archive, formula, financial, destructive, security-
  credential, or public-positioning decision is inferred from this reliability
  slice.

open:

- HOLD CocoaPods/Podfile.lock/workspace resolution, Xcode build, Simulator and
  physical-iPhone startup injection, same-journal retry, teardown-failure
  relaunch, SQLCipher/Keychain, migration, force-quit/background lifecycle,
  Files handoff, backup, low-storage/near-limit-memory, VoiceOver, Dynamic Type,
  and physical 320px evidence until recorded on a current Mac and iPhone.
- Audit native SQLite plugin diagnostics and error propagation before claiming
  that journal paths or technical failure details stay out of Xcode/device
  consoles.
- A known Daily Journal stale-head conflict is rejected safely by both stores,
  but the editor currently re-enables the obsolete submission as a generic
  retry instead of preserving text and offering a reload/reconcile action.
- Upgrade the GitHub Action runtimes in a separate low-risk maintenance slice;
  current checks pass but hosted logs warn about Node 20 action runtimes.
- Separate Symbol Breakdown and generic-CSV asset-class WIP remain
  uncommitted/unpublished and human-gated. Attachments and verified Delete All
  Data remain separate governed slices; deletion requires its dedicated human
  gate.
- Do not claim native backup readiness or start broker sync, trade execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.

## Prior milestone — Recovery Continuity v1

> Historical snapshot; current status and open items are superseded by the
> then-current Startup Recovery handoff above.

task: Deliver Daily Journal Recovery Continuity v1: compose the existing Daily
Journal and matching-runtime recovery contracts into one user-facing
author → export → empty-session restore → continue-writing → re-export →
second-restore journey, and prove stale asynchronous file reads cannot expose
restore approval.

stage: codex

lane: fleet-handoff

produced:

- mobile/src/ui/user-data-restore.ts now focuses the stable #screen region
  after a successful restore refresh. The focused commit button is removed by
  that refresh, so focus no longer falls back to an unspecified browser target.
- mobile/e2e/user-data-restore.spec.ts authors a real Daily Journal draft,
  exports it, restores it into a fresh browser session while offline, verifies
  the restored review and daily content, and edits the restored immutable head
  through the real Journal UI. The continued export is inspected for exactly
  two versions, one date head pointing to version 2, and two submission
  receipts, then restored into a second fresh session and re-exported with the
  same state/report digests.
- The same suite deterministically pauses archive A's File.text(), selects
  distinct valid archive B, releases A, and proves A cannot reveal preview
  details, change status or focus, enable confirmation/commit, or mutate the
  empty destination. B remains independently previewable and its exact state
  digest is the only evidence shown.
- Existing versioned envelope/payload/schema contracts, financial formulas,
  report definitions, archive summary, non-merge restore semantics, and Daily
  Journal authoring semantics are unchanged. This is browser composition and
  accessibility hardening, not a seventh Slice D product increment.
- README, ledger, roadmap, product blueprint, and Mac handoff distinguish the
  new Linux/Chromium composition evidence from native Files, SQLCipher,
  Keychain, WKWebView, lifecycle, and device accessibility gates.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- cd mobile && npm run typecheck — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 40 files, 409 tests passed.
- cd mobile && npm run test:e2e -- user-data-restore.spec.ts — exit 0; all
  4 restore journeys passed, including the composed continued-write recovery
  path, deterministic stale-file race, demo isolation, and 320px/200% reflow.
- `cd mobile && npm run test:e2e` — exit 0; all 40 Playwright journeys
  passed.
- `cd mobile && npm run build` — exit 0; Vite transformed 63 modules and
  emitted the production bundle.
- `cd mobile && npm run ios:sync` — exit 0; the verified bundle was copied
  into iOS and Capacitor found only `@capacitor-community/sqlite@8.1.0`.
  CocoaPods and `xcodebuild` were unavailable and explicitly skipped.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no tracked native/lock drift or whitespace
  errors after sync.
- Three independent read-only reviews reported no remaining archive/store
  correctness, UI/accessibility/timing, integration, or documentation finding.
  The delayed-file race also passed 5/5 repeated reviewer runs.

assumptions:

- Browser restore uses the intentionally ephemeral browser-session-state v2
  development adapter. Reload is used only to create an empty destination; it
  is not persistence or native recovery evidence.
- The composed test inspects immutable daily versions, heads, and submissions
  in the verified payload instead of adding fields to the exact archive-v1
  summary. A trustworthy summary-shape change would require a separate
  compatibility decision.
- A Daily Journal successor changes the broad archive state/report-input
  digests because those digests bind the full ledger. Current governed report
  formulas still exclude the self-reported process score.
- No schema, migration, archive format, store algorithm, financial definition,
  destructive action, or public comparative claim is changed.

open:

- HOLD native Files selection/share/reopen, asynchronous adapter preview,
  SQLCipher/Keychain, v3→v4 retained-data migration, force-quit/relaunch,
  response-loss, low-storage/near-limit-memory, VoiceOver, Dynamic Type, and
  physical-device continued writes until measured on a current Mac and iPhone.
- A known Daily Journal stale-head conflict is rejected safely by both stores,
  but the editor currently re-enables the obsolete submission as a generic
  retry instead of offering a preserve-text-and-reload reconciliation action.
  That UX hardening is separate from this restore-file preview race.
- Separate Symbol Breakdown and generic-CSV asset-class WIP remain
  uncommitted/unpublished and human-gated. Both began before Structured Trades
  Facets v1 and require a manual rebase preserving class-qualified review
  identity, one asset-class chip, and immutable facet evidence.
- Attachments and verified Delete All Data remain separate governed slices.
  Delete All Data is irreversible and requires its dedicated human gate.
- Do not claim native backup readiness or start broker sync, trade execution,
  hosted Connect, Android, recurring AI, TestFlight, App Store submission,
  pricing, or public comparative positioning from this milestone.

## Prior milestone — Slice D-F

> Historical snapshot; current status and open items are superseded by the
> then-current Startup Recovery handoff above.

task: Deliver Structured Trades Facets v1: four fixed exact, session-only card
filters that compose with normalized search while preserving the existing
account/date/day financial scope and whole-workspace report boundary.

stage: codex

lane: fleet-handoff

produced:

- `mobile/src/application/trade-browser.ts` adds exact asset-class,
  direction, position-state, and review-state facets. Facets AND with search
  only after account/date/day evidence is reconciled, so they never change
  exact contribution P&L, trade/allocation/day counts, or calendar evidence.
  Unsupported filter or source enum values fail closed. Browser evidence is a
  detached, recursively frozen trade preview rather than an alias to a mutable
  local snapshot.
- `mobile/src/ui/trades-view.ts` renders four labeled native selects, an
  asset-class chip, truthful search/facet empty states, live visible-card
  counts, and a **Clear search and filters** action that retains financial
  scope. Clear all resets both layers. Duplicate-symbol card headings add
  screen-reader-only asset-class/account/session identity.
- `mobile/src/ui/trade-review-sheet.ts` adds asset class to review action and
  dialog accessible names, keeping same-symbol Stock/ETF review targets
  distinguishable. Existing search-only copy and exact Trade Browser behavior
  remain backward compatible.
- Facet/search state survives internal navigation, selected-day changes, valid
  review-refresh writes, and valid snapshot refreshes. It resets on local/demo
  switches or reload. Calendar-day activation announces retained view-filter
  results, including zero visible cards.
- `mobile/e2e/trade-browser-facets.spec.ts` covers four-way facet AND logic,
  conflicting search, selected-day/account retention, separate clear actions,
  whole-workspace Dashboard/Plan Check/Setup Breakdown isolation, local review
  refresh, mode reset, offline behavior, 44-point controls, and 320px/200%
  reflow. Core/UI tests add malformed-source rejection, mutable-source
  detachment, and same-symbol Stock/ETF subject/accessibility identity.
- README, roadmap, product blueprint, ledger contract, and Mac handoff now
  document the delivered visibility boundary and remaining dynamic/native work.
  No schema, migration, adapter, store, archive, or governed report definition
  changed.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 40 files, 409 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 39 Playwright journeys passed,
  including facet/search/scope composition, valid review-refresh retention,
  calendar-day zero-result announcements, report isolation, legacy search
  behavior, review accessibility, and 320px/200% reflow.
- `cd mobile && npm run build` — exit 0; Vite transformed 63 modules and
  emitted the production bundle.
- `cd mobile && npm run ios:sync` — exit 0; the verified production bundle was
  copied into iOS and Capacitor found only
  `@capacitor-community/sqlite@8.1.0`. CocoaPods and `xcodebuild` were
  unavailable and explicitly skipped.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no tracked native/lock drift or whitespace
  errors after sync.
- Independent read-only core and UI re-reviews reported no remaining
  correctness or accessibility finding in the implemented boundary.

assumptions:

- V1 intentionally exposes only fixed values already canonical in
  `TradePreview`: Stock/ETF, long/short, open/closed, and
  pending/draft/completed. Dynamic setup/tag/mistake/emotion vocabulary is not
  inferred or persisted by this slice.
- Search and facets change visible cards only. Account/date/day scope totals,
  the Dashboard calendar evidence, Dashboard metrics, Plan Check, and Setup
  Breakdown do not consume `visibleEvidence`.
- View-filter state is ephemeral. **Clear search and filters** preserves
  account/date/day scope; **Clear all** resets view filters and financial scope.
- Linux SQL.js/Chromium evidence proves deterministic browser contracts, not
  native SQLCipher, Keychain, WKWebView, iOS picker, lifecycle, VoiceOver, or
  physical-device behavior. Fleet guard-layer screening was not evidenced.

open:

- HOLD native facet/select traversal, VoiceOver announcements, Dynamic Type,
  hardware keyboard, background/relaunch reset, and physical 320px behavior
  until measured on a current Mac and iPhone.
- Saved view/scope presets, dynamic vocabulary facets, optional persistent or
  governed-report scope, fuller account management, and remaining reconciled
  report families remain Phase 1/2 work.
- Separate Symbol Breakdown and generic-CSV asset-class WIP were intentionally
  not merged: both started from pre-facet `2841a67` and remain human-gated.
  Their later manual rebase must preserve this slice's immutable facet evidence,
  class-qualified review identity, and one asset-class chip while reconciling
  overlapping product docs.
- Attachments and verified Delete All Data remain separate governed slices.
  Delete All Data is irreversible and requires its dedicated human gate.
- Do not start broker sync, trade execution, hosted Connect, Android, recurring
  AI, TestFlight, App Store submission, price promises, or public comparative
  claims from this slice.
- Pass to Sonnet for final sign-off. The broader autonomous Hermes product goal
  remains active; this verified Slice D-F boundary is a coherent stopping point.

## Prior milestone — Slice D-E

> Historical snapshot; current status and open items are superseded by the
> then-current Slice D-F handoff above.

task: Deliver Trade Browser Scope v1: a derived-only, mobile-first account and
allocation-date evidence browser with exact scoped contributions, activity
month navigation, retained session state, and explicit whole-workspace report
boundaries.

stage: codex

lane: fleet-handoff

produced:

- mobile/src/application/trade-browser.ts validates stable ledger account
  identity, canonical inclusive workspace-local allocation/activity dates,
  bounded normalized search, exact calendar reconciliation, stale-day
  fail-closed behavior, and read-only derived evidence. It reaggregates canonical
  decimal contribution P&L and trade/allocation/day counts without summing
  display numbers.
- Workspace projections now expose stable accountId per trade plus sorted
  retained account options and active trade counts. Filtering never relies on
  account labels. The fictional demo remains eight trades and now spans two
  clearly labeled accounts so account isolation is visible offline.
- mobile/src/ui/trades-view.ts owns the extracted Trades workflow: all or one
  account, optional inclusive date bounds, exact scope summary, per-card account
  labels, distinct whole-trade versus scoped/day contribution evidence,
  normalized card search, invalid-range recovery, clear-day, and Clear all.
- Dashboard calendar navigation visits only months containing scoped activity.
  A selected day intersects and survives the account/range scope; clearing it
  restores that scope. Account/range/day/search state survives internal
  navigation and valid ledger refreshes, resets on local/demo switches or
  reload, and explicitly announces stale account/day recovery.
- Scope affects Trades and the Dashboard calendar only. Dashboard headline
  P&L, equity, review progress, Plan Check, and Setup Breakdown continue to
  receive the complete workspace snapshot and remain explicitly labeled
  whole-workspace. No schema, migration, store, archive, or governed report
  definition/version changed.
- Responsive and accessible behavior includes native select/date controls,
  44-point targets, visible focus destinations, pressed day state, named month
  controls, keyboard announcements, and 320px/200% reflow without horizontal
  escape. Product, roadmap, ledger, and Mac/device contracts document the
  delivered boundary and remaining native gates.

verified:

- cd mobile && npm ci — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- cd mobile && npm run typecheck — exit 0.
- cd mobile && npm run test:boundary — exit 0; 1 file, 2 tests passed.
- cd mobile && npm test — exit 0; 40 files, 403 tests passed.
- cd mobile && npm run test:e2e — exit 0; all 36 Playwright journeys passed,
  including multi-account range/search/day composition, governed-report
  isolation, invalid-range recovery, retained navigation state, real
  two-month local evidence, focus, and 320px/200% reflow.
- cd mobile && npm run build — exit 0; Vite transformed 63 modules and
  emitted the production bundle.
- cd mobile && npm run ios:sync — exit 0; the verified production bundle was
  copied into iOS and Capacitor found only
  @capacitor-community/sqlite@8.1.0. CocoaPods and xcodebuild were
  unavailable and explicitly skipped.
- cd mobile && npm audit --omit=dev — exit 0; 0 vulnerabilities.
- git diff --exit-code -- mobile/ios mobile/package-lock.json and
  git diff --check — exit 0; no tracked native/lock drift or whitespace
  errors after sync.

assumptions:

- “Activity date” means the workspace-local date of an allocation contribution,
  not a generic trade open/close date. A multi-day trade can contribute to more
  than one scoped day, including a zero-P&L day.
- Search changes card visibility only. The exact scope summary and report
  inputs do not change with search. Scoped contribution can differ from the
  card's whole-trade realized-to-date result.
- V1 supports all accounts or one retained ledger account, not multi-select,
  account CRUD, saved presets, persistent scope, or governed report rescoping.
- Linux SQL.js/Chromium evidence proves deterministic contracts, not native
  SQLCipher, Keychain, WKWebView, iOS picker, lifecycle, VoiceOver, or
  physical-device behavior. Fleet guard-layer screening was not evidenced.

open:

- HOLD native scope lifecycle, VoiceOver, Dynamic Type, select/date picker,
  virtual keyboard, background/relaunch reset, and 320px physical-device
  behavior until measured on a current Mac and iPhone.
- Saved scope presets, optional persistent/report scope, fuller account
  management, vocabulary/playbook management, and remaining reconciled report
  families remain Phase 1.
- Attachments and verified Delete All Data remain separate governed slices.
  Delete All Data is irreversible and requires its dedicated human gate.
- Do not start broker sync, trade execution, hosted Connect, Android, recurring
  AI, TestFlight, App Store submission, price promises, or public comparative
  claims from this slice.
- Pass to Sonnet for final sign-off. The broader autonomous Hermes product goal
  remains active; this verified Slice D-E boundary is a coherent stopping point.

## Prior milestone — Slice D-D

> Historical snapshot; current status and open items are superseded by the
> then-current Slice D-F handoff above.

task: Deliver Durable Daily Journal v1: an explicit-save, mobile-first,
day-level reflection workflow with immutable optimistic history, complete local
export/restore coverage, and no trade-execution or analytics contamination.

stage: codex

lane: fleet-handoff

produced:

- `mobile/src/application/prepare-daily-journal.ts` defines the authored
  contract: one workspace-local Gregorian date, draft/completed state, optional
  headline/note/emotion/tags/self-reported process score, at least one signal,
  NFC/code-point/control limits, secure submission identity, immutable date,
  optimistic predecessor, and a deterministic content-bound revision.
- `mobile/src/adapters/sqlite/schema/v4.ts` adds checksum-pinned immutable
  `daily_journal_entry_versions`, one guarded `daily_journal_entry_heads` row per
  date, and ordered shared-vocabulary assignments. SQLite and browser stores
  provide atomic create/edit, exact retry idempotency, stale-head/change
  conflicts, and lost-response reconciliation without mutating executions.
- Native archive payload v1 now pins schema v4's 35 tables and 280 ordered
  columns. Browser development payload is `browser-session-state` v2. Both
  preserve all daily-entry versions/heads/submissions/vocabulary and recompute
  normalized content revisions during restore. Restore now rejects poisoned
  shared term names, mismatched native normalized identities, invalid IDs,
  missing signals, broken chains/chronology, and unsupported legacy payloads.
- Compatibility remains intentionally exact-runtime before release. The current
  build rejects browser v1 and pre-v4 native table sets; recovery requires the
  exact old runtime, followed by live database migration and a new current
  export. On-device v3→v4 migration exists but still needs retained native data
  and interruption evidence.
- Journal UI supports today plus the newest unused date, trading/no-trade
  context, explicit draft/complete saves, immutable edit dates, no autosave,
  dirty-close confirmation, Unicode counters, focus containment/return,
  background inerting, all-control busy state, truthful uncertain/known-saved
  reconciliation, and 320px/200% reflow. Empty and demo states expose no write
  action, and the editor states that Hermes never places or routes a trade.
- A changed self-reported process score affects only the displayed daily entry;
  a regression proves every other snapshot field plus Plan Check and Setup
  Breakdown remain identical. Browser-session and SQL.js native-adapter
  post-restore save → export → second restore are also proven with canonical
  shared-vocabulary reuse.
- `README.md`, the ledger contract, product blueprint, iOS roadmap, and Mac
  handoff now document schema v4, browser payload v2, exact-runtime
  compatibility, delivered Daily Journal scope, and the remaining native gates.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 38 files, 392 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; all 33 Playwright journeys passed,
  including multi-date Daily Journal create/edit/discard, demo/empty isolation,
  busy controls, immutable dates, and 320px/200% reflow.
- `cd mobile && npm run build` — exit 0; Vite transformed 61 modules and emitted
  the production bundle.
- `cd mobile && npm run ios:sync` — exit 0; the verified production bundle was
  copied into iOS and Capacitor found only
  `@capacitor-community/sqlite@8.1.0`. CocoaPods and `xcodebuild` were unavailable
  and explicitly skipped.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no tracked native/lock drift or whitespace
  errors after sync.

assumptions:

- Daily Journal writing requires an established local workspace so currency and
  IANA time zone are never invented. It can cover any date from 1970-01-01
  through workspace-local today, including no-trade dates; one current head
  exists per date and prior versions remain evidence.
- The optional process score is user-authored reflection, not a derived
  performance, Plan Check, Setup Breakdown, prediction, advice, or incentive to
  trade. Daily entries never create, place, route, modify, or cancel orders.
- Browser session evidence is development-only and disappears on reload. Linux
  SQL.js/Chromium proves deterministic contracts, not native SQLCipher,
  Keychain, Files, WKWebView, iOS date-picker, lifecycle, or accessibility.
- Native outer/table archive versions remain v1 even though the pinned current
  table set is schema v4; browser payload v2 is a distinct runtime contract.
  Fleet guard-layer screening was not evidenced.

open:

- HOLD native v3→v4 retained-data/interruption/relaunch, SQLCipher/Keychain,
  Files export/restore/continued writes, VoiceOver, Dynamic Type, virtual
  keyboard/date picker, 320px device layout, low-storage, near-limit-memory,
  and response-loss behavior until measured on a current Mac and iPhone.
- A single user-facing Playwright export → reload → restore → Journal journey
  that authors a daily entry would strengthen composition evidence; the current
  adapter round-trip/continued-write tests and separate export/restore browser
  journeys cover the underlying contracts, so this is not a correctness hold.
- Attachments, verified Delete All Data, account selection, reusable trade/date
  filters, broader calendar navigation, vocabulary/playbook management, and
  remaining reports are still Phase 1. Delete All Data is irreversible and
  requires its dedicated human-gated slice.
- Do not start broker sync, trade execution, hosted Connect, Android, recurring
  AI, TestFlight, App Store submission, price promises, or public comparative
  claims from this slice.
- Pass to Sonnet for final sign-off. The broader autonomous Hermes product goal
  remains active; this verified Slice D-D boundary is a coherent stopping point.

## Prior milestone — Slice D-C

> Historical snapshot; current status and open items are superseded by the
> then-current Slice D-F handoff above.

task: Deliver a bounded Dashboard-calendar → Trades evidence drill-down that
reconciles workspace-local allocation days to stable trade subjects and exact
P&L while preserving whole-trade result context, without account selection,
arbitrary or persisted date/range filtering, report rescoping, schema/archive
changes, trade execution, advice, or a native-readiness claim.

stage: codex

lane: fleet-handoff

produced:

- `mobile/src/application/workspace-snapshot.ts` now groups normalized
  allocation P&L events by workspace-local date, maps projection IDs to durable
  trade subjects, preserves exact signed-decimal day/contributor totals, counts
  allocation fragments, sorts stable subject evidence by code unit, and fails
  closed if contributions do not reconcile to the day total.
- `mobile/src/core/types.ts` carries exact calendar totals, allocation counts,
  and per-subject contributions as derived snapshot evidence. No SQLite,
  migration, journal archive, or export-envelope shape changed.
- `mobile/src/data/demo.ts` derives the fictional calendar from the same eight
  demo trade previews and rejects cross-day demo fixtures rather than allowing
  hand-maintained calendar drift.
- `mobile/src/ui/calendar-day-view.ts` turns Dashboard days into native button
  controls and renders a transient Trades evidence view with explicit workspace
  scope, allocation-day P&L, per-trade contribution/allocation evidence, and
  separately labeled whole-trade realized-to-date results.
- Calendar selection has keyboard/VoiceOver-oriented focus and announcement
  behavior, scoped search, review continuity, a clear action, tab/navigation
  reset, 44-point targets, and 320px/200% reflow coverage. A still-valid day
  survives internal workspace refresh; it is not saved or reused as report
  scope.
- Regression fixtures cover fractional exact aggregation, partial exits,
  long-to-short AUTO reversal fee splitting, multi-day membership, same-day
  multi-account aggregation, stable durable IDs, hostile markup, and browser
  export → empty-container restore equality.
- `README.md`, the product blueprint, iOS roadmap, and Mac handoff document the
  delivered boundary, whole-workspace semantics, remaining filter/account
  work, and required native calendar acceptance.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 35 files, 365 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; 30 Playwright journeys passed,
  including the offline keyboard drill-down and 320px/200% reflow journey.
- `cd mobile && npm run ios:sync` — exit 0; production build transformed 58
  modules and copied the bundle; Capacitor found only
  `@capacitor-community/sqlite@8.1.0`. CocoaPods and `xcodebuild` were
  unavailable and explicitly skipped.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no tracked native/lock drift or whitespace
  errors after sync.
- Independent read-only re-review found no release blocker and reconfirmed
  exact-decimal reconciliation, stable identity, escaping, accessibility
  flow, browser restore equality, and the absence of external requests.

assumptions:

- Calendar membership follows each normalized allocation event's timestamp in
  the workspace time zone, not a trade open/close date. A multi-day trade can
  therefore contribute to more than one day.
- Allocation-day contribution is distinct from the trade card's whole-trade
  realized-to-date result. Day totals cover the current whole workspace and
  all active accounts in its single currency; the drill-down does not select
  an account.
- Selection is ephemeral UI state. Matching-runtime archives retain the ledger
  facts needed to recompute it; stored and exported shapes remain unchanged.
- The workflow is descriptive journaling evidence, not prediction, advice,
  statistical significance, or an order-entry surface. Hermes still never
  places, routes, changes, or cancels a trade.
- Linux SQL.js and Chromium evidence does not prove native SQLCipher, Keychain,
  Files, VoiceOver, Dynamic Type, lifecycle, signing, TestFlight, App Store, or
  physical-iPhone behavior. Fleet guard-layer screening was not evidenced.

open:

- HOLD native calendar reconciliation, multi-account/multi-day fixtures,
  VoiceOver focus/announcements, 320px/200% Dynamic Type, review continuity,
  relaunch, and restore equality until measured on a current Mac/iPhone.
- Filtered trade cards retain the existing card design: workspace scope is
  explicit, but an individual card does not yet display its account label.
  Account-aware same-symbol disambiguation belongs with the account/filter
  contract rather than this transient day slice.
- A dedicated local review-save-while-filtered browser journey and native
  derived-calendar restore assertion are useful hardening, not correctness
  holds; existing save refresh and hash-validated ledger restore paths compose.
- Attachments, verified Delete All Data, Durable Daily Journal v1, account
  selection, reusable trade/date-range filters, broader calendar navigation,
  vocabulary/playbook management, and remaining reports are still Phase 1.
- Do not start broker sync, trade execution, hosted Connect, Android, recurring
  AI, TestFlight, App Store submission, price promises, or public comparative
  claims from this slice.
- Pass to Sonnet for final sign-off. The broader autonomous Hermes product goal
  remains active; the next coherent product slice is Durable Daily Journal v1.

## Prior milestone — Slice D-B

> Historical snapshot; current status and open items are superseded by the
> then-current Slice D-F handoff above.

task: Deliver the second governed Slice D insight: a checksum-pinned offline
Setup Breakdown derived from current projections and current saved review
heads, with exact cash, strict replay-compatible R, reconciled exclusions, and
progressively bounded evidence, without trade execution, advice, schema/archive
changes, or a native-readiness claim.

stage: codex

lane: fleet-handoff

produced:

- `mobile/src/core/setup-performance-report.ts` defines
  `setup-performance-report-v1`, pinned by SHA-256
  `5779276cbbc4278136f96bbaca167216c60b395cdad4a8bb4cf9c3b5f272601b`.
  It uses mutually exclusive exclusion precedence, exact setup membership,
  positive-only wins, exact signed-decimal cash, 12-decimal half-away means,
  strict replay-compatible R coverage, stable setup-name code-unit order, and
  traded-date/subject-ID evidence order.
- Derived `hasClassifiedSetup` state carries null/string classification
  separately from display text. A saved literal `Unclassified` remains a
  classified, editable label; null or absent review state remains excluded.
  Mapper, review-sheet, report, and real session-store revision regressions pin
  this boundary without changing persistence or export schemas.
- `mobile/src/core/report-result-r.ts` shares the strict complete-result-R
  validator between Setup Breakdown and Plan Check. Plan Check behavior and
  checksum
  `0f092c3bdd6c5051e97f5be0f1c7758a01e3159875adf660b1b0ea00f970ae85`
  remain unchanged.
- Reports replaces the lossy setup table with escaped evidence groups. Initial
  rendering is capped at five groups and 25 contributors per group; each
  explicit action adds at most the same bound, live counts remain exact, and
  focus moves to the first newly revealed group. Demo values reconcile to
  Breakout/Pullback/Reversal cash expectancy of
  +56.666666666667/+86.666666666667/-60 USD.
- Browser export → empty-container restore now proves byte-equivalent derived
  Plan Check and Setup Breakdown values, cohorts, ordering, and evidence.
  A real SessionJournalStore test proves a current review edit moves one stable
  trade from Breakout to Pullback while retaining exact +10 USD evidence.
- `README.md`, the product blueprint, iOS roadmap, and Mac handoff document
  the final checksum, code-unit ordering, five/25 pagination, both native
  report gates, derived restore equality, and remaining release holds.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed, 165 audited, 0
  vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 34 files, 361 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; 28 Playwright journeys passed,
  including offline exact evidence and 320px/200% Setup Breakdown reflow.
- `cd mobile && npm run ios:sync` — exit 0; production build transformed 57
  modules and copied the bundle; Capacitor found only
  `@capacitor-community/sqlite@8.1.0`. CocoaPods and `xcodebuild` were
  unavailable and explicitly skipped.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` and
  `git diff --check` — exit 0; no tracked native/lock drift or whitespace
  errors after sync.
- Independent read-only re-audit found no blocker. It recomputed the Setup
  Breakdown checksum, confirmed unchanged Plan Check checksum semantics,
  verified structural classification/editability, group/evidence bounds and
  focus, generic diagnostics, escaping, and aligned product/native copy.

assumptions:

- Setup Breakdown is descriptive journaling evidence, not causal analysis,
  prediction, financial advice, statistical significance, or a prompt to trade.
  Hermes still never places, routes, changes, or cancels an order.
- The report is a deterministic current-state projection. Current-schema
  archives retain all execution/review/risk inputs and matching runtimes
  recompute both reports; no stored or exported shape changed.
- `hasClassifiedSetup` is derived from whether the current saved setup is a
  string, not from its wording. Display labels are not persistence truth.
- Linux SQL.js and Chromium evidence does not prove native SQLCipher, Keychain,
  Files, VoiceOver, lifecycle, signing, TestFlight, App Store, or physical
  iPhone behavior. `Hermes Journal`, its bundle ID, and price remain
  provisional and unapproved.
- Fleet guard-layer screening was not evidenced in this lane; downstream must
  not infer that it ran.

open:

- HOLD native Plan Check/Setup Breakdown accessibility and restore equality,
  plus the existing SQLCipher, Keychain, Files, interruption, low-storage,
  migration, and physical-device gates, until measured on a current Mac/iPhone.
- Progressive group/evidence actions are bounded, while previously revealed
  pages intentionally remain in the DOM. Reports also derive once for markup
  and once for binding; cache or virtualize only after measured journal size
  justifies added state.
- Drawdown, streak, time/day, symbol, direction, tag, mistake, emotion, deeper
  setup comparisons, account selection, filters, calendar drill-down, daily
  notes, attachments, and verified Delete All Data remain open.
- Do not start broker sync, trade execution, hosted Connect, Android, recurring
  AI, TestFlight, App Store submission, price promises, or public comparative
  claims from this slice.
- Pass to Sonnet for final sign-off. The broader autonomous Hermes product goal
  remains active.

## Prior milestone — Slice D-A

> Historical snapshot; current status and open items are superseded by the
> then-current Slice D-F handoff above.

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

> Historical snapshot; current status and open items are superseded by later
> milestones and ultimately by the active Dashboard Recent Trade Continuation
> v1 handoff above.

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
