# Hermes Journal — active mobile handoff

Status: verified Daily Journal Recovery Continuity v1 Linux milestone ·
updated 2026-07-14

## Current handoff

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
> active Recovery Continuity handoff above.

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
