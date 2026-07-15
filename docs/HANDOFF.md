# Hermes Journal — active mobile handoff

Status: verified Dynamic Review Facets v1 ·
updated 2026-07-15

## Current handoff

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
> active Dynamic Review Facets v1 handoff above.

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
> Recovery v1 and now by the active Dynamic Review Facets v1 handoff above.

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
> active Individual Trade Review Stale-Head Recovery handoff above.

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
> active Single-Trade Review Exact-Command Recovery handoff above.

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

- Superseded by the active individual-sheet milestone above: exact replay and
  refresh-only recovery are now delivered narrowly for one Trade Review.
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
> active Daily Journal Exact-Command Recovery handoff above.

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
> active Daily Journal Stale-Head Recovery handoff above.

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
> active Startup Recovery handoff above.

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
> active Startup Recovery handoff above.

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
> active Slice D-F handoff above.

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
> active Slice D-F handoff above.

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
> active Slice D-F handoff above.

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
> active Slice D-F handoff above.

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
> active Slice D-F handoff above.

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
