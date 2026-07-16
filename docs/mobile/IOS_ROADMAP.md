# Hermes Journal iOS product roadmap

Status: active delivery roadmap · updated 2026-07-16

The authoritative product, audience, stack, pricing, and validation decisions
live in [the product blueprint](PRODUCT_BLUEPRINT.md). This document tracks the
delivery sequence for that contract.

## Product decision

Hermes Journal is an original, mobile-first trading journal whose launch cohort
is adult, phone-first stock and ETF traders. Options, futures, crypto, forex,
and prop workflows remain discovery segments until their data contracts exist.
It replaces the earlier single-trader cockpit direction. TradeZella is
used only to benchmark useful capabilities; Hermes must not copy its protected
name, copy, graphics, assets, or interface. Hermes is not affiliated with,
endorsed by, or sponsored by TradeZella.

Working product promise:

> A private trade journal that shows what is working—without a required
> subscription.

Proposed commercial hypothesis (requires explicit owner approval):

- iPhone first, Android after iOS behavior and data contracts stabilize.
- $9.99 upfront App Store price hypothesis; do not configure or promise it yet.
- No Core subscription and no second lifetime-unlock purchase.
- Core journal records and reports work without an account or network service.
- The app never places or modifies a brokerage order.
- A future hosted Connect service requires the blueprint's retention,
  willingness-to-pay, rights, privacy, security, and unit-economics gates; it
  can never be required for local Core features.

“Hermes Journal” is a working name. `app.hermesjournal.mobile` is a provisional,
neutral bundle identifier. Name, trademark, domain, and App Store availability
must be cleared before the App Store record is created. Apple does not allow the
bundle ID to change after a build has been uploaded, so no build may be uploaded
under the provisional identifier until that gate is cleared.

## Opportunity and honest rating

- **7/10** micro-product potential as a polished, privacy-oriented alternative
  to the core import → journal → review workflow.
- **4/10** if marketed as literal parity with every hosted TradeZella service
  at the proposed $9.99 price; real-time integrations, licensed data, hosted
  sync, and recurring AI
  have continuing costs.
- **5/10 current readiness**: the execution ledger, generic CSV loop, manual
  capture, versioned trade review, Durable Daily Journal v1, Trade Browser
  Scope v1, Structured Trades Facets v1, Dynamic Review Facets v1, Reports
  Navigator v1, Report Trade Continuation v1, Mistake Patterns v1, Emotion
  Patterns v1, Tag Patterns v1, Direction Mix v1, Opening Weekday Mix v1,
  Review Session Coverage v1, Dashboard Recent Trade Continuation v1, Exact
  Setup Facet v1, Review Queue Focus v1, Calendar-Day Reflection Continuation
  v1, Daily Reflection Return Focus v1, Compact Trades Filters v1, export, and
  matching-runtime local restore are implemented.
  Browser Recovery
  Continuity proves a restored daily draft can append and survive a second
  restore; Exact-Command Recovery proves an ambiguous daily save retains and
  replays only its original command. However, native restore acceptance,
  verified deletion, deeper reports, attachments, and Mac/device evidence
  remain incomplete.

TradeZella currently advertises $29/$49 monthly plans and $288/$399 annual
prices. That gives Hermes a large price wedge, but price alone is not the product:
fast mobile review, user-owned data, reliable import, and trustworthy analytics
must carry the value.

At the proposed $9.99 hypothesis, approximate developer proceeds are $6.99
under Apple's standard 30%
commission or $8.49 at 15%, before taxes, refunds, and operating costs. The
[Apple Developer Program](https://developer.apple.com/programs/whats-included/)
also has an annual membership cost. Recheck commission eligibility and
[App Store pricing](https://developer.apple.com/help/app-store-connect/manage-app-pricing/set-a-price)
before launch; maintenance and support still need a unit-economics gate.

## Capability boundary

| Layer | Hermes Journal commitment |
|---|---|
| Proposed one-time paid Core | Local accounts; stock/ETF executions and partial exits; quantity, price, fees, commissions, currency P&L; versioned percent/risk bases before percent return or R is shown; manual entry; generic stock CSV import with preview/deduplication/rollback; trades and calendar; daily/trade notes and screenshots; setup/mistake/emotion tags; playbooks and rules; filters; core performance reports; versioned export/restore/delete-all-data; position sizing |
| Local post-launch depth | Prioritized broker CSV parser packs; options/futures contracts; MAE/MFE and exit efficiency when data supports them; journal templates; richer comparison reports; PDF/share summaries; user-supplied price-file analysis; optional local or bring-your-own-key assistance |
| Not included without a new approved model | Developer-funded real-time sync across hundreds of brokers; hosted multi-device storage; licensed tick/Level II history; turnkey cloud replay/backtesting; recurring AI credits; mentor communities; prop-firm monitoring; high-touch managed support |

The flat price must never depend on an unpriced recurring service. Features with
ongoing costs need user-supplied infrastructure or a separately approved product
decision.

## Information architecture

Five destinations:

1. **Dashboard** — net P&L, versioned-risk-backed R, core metrics, curve,
   calendar, process review, actionable recent trades.
2. **Trades** — search, filters, list/calendar views, trade detail, executions, notes, tags, screenshots.
3. **Journal** — daily notes, trade reviews, templates, emotions/mistakes, playbooks, rules.
4. **Reports** — currency expectancy, profit factor, drawdown, streaks, and
   breakdowns by setup, tag, symbol, direction, day, and time; R expectancy
   requires compatible stored risk bases.
5. **More** — imports, accounts, tags/playbooks, planning tools, export/restore, settings, privacy, help, and legal.

Add/manual-import actions are task controls, not navigation tabs. They appear
only when their durable workflow exists; the foundation must not ship dead
buttons that imply records can be saved.

## Runtime architecture

```text
Capacitor iOS shell
  mobile task-oriented UI
    typed application services
      pure TypeScript journal and analytics core
        native repository configured to require SQLCipher
        file import/export adapters
        plugin secret API with configured iOS Keychain prefix
        Keychain adapter for future user-owned credentials
        best-effort platform lifecycle adapters
```

Python, FastAPI, APScheduler, systemd, and the legacy cockpit are not embedded in
the phone. A deterministic legacy calculation is reused only after it is
extracted behind a neutral contract and shared golden fixture.

## Execution-first data model

The mobile schema is new; it does not evolve the legacy percent-only journal row.
Numbered migrations will cover:

- workspaces, accounts, brokers, and base currencies;
- import batches, source rows, mappings, validation results, and rollback state;
- instruments and contracts;
- executions/fills with side, quantity, price, fee, commission, currency, and time;
- normalized trades that group partial entries/exits without discarding source evidence;
- notes, attachments, tags and tag categories;
- playbooks, rules, and per-trade rule reviews;
- daily journal entries and report snapshots;
- export schema version and migration history.

Imports must be idempotent. Source rows remain explainable, duplicate files do
not duplicate performance, and a failed batch cannot leave a partial journal.

## Delivery phases

### Phase 0 — neutral paid-app foundation (delivered in the current draft)

Delivered:

- Vite/TypeScript/Capacitor 8 workspace and CocoaPods iPhone target.
- Original Hermes Journal identity, with personal photography naming removed.
- Dashboard, Trades, Journal, Reports, and More navigation.
- Three-step journal onboarding with the empty private journal as the primary
  choice and persistent, explicit fictional-demo provenance.
- A semantic opening surface plus fail-closed Startup Recovery v1. A failed
  initial open never falls back to demo/browser storage; factory cleanup is
  confirmed or a constructed application is closed before one guarded
  full-document retry is offered, and an unconfirmed teardown requires a full
  app close/reopen.
- Eight coherent fictional trades with P&L/R/win-rate/profit-factor/expectancy
  derived from the same records.
- Working trade search and position-size planning tool.
- Safe areas, 44-point controls, focus containment/return, route announcements,
  reduced motion, and 200% short-landscape browser coverage.
- Production WebView CSP with `connect-src 'none'` and bundled subresources
  restricted to local `self`/`data` sources, with no network requests in Hermes
  app code. The pinned SQLite plugin's unused native HTTP-download bridge
  remains a dependency audit/removal gate.
- Linux CI for locked install, TypeScript, unit tests, browser flows, bundle
  build, byte-identical Capacitor public-copy verification, selected generated-
  config contract validation, explicit tracked native/lockfile drift, and the
  legacy Python safety suite. Its job summary reports CocoaPods, Xcode,
  Simulator, iPhone, SQLCipher/Keychain lifecycle, VoiceOver, and Dynamic Type
  as NOT RUN.

Not delivered in Phase 0: durable financial records, manual entry, CSV file
selection, native device/Xcode evidence, final branding, or App Store metadata.

### Phase 1 — durable import → journal → report slice

Delivered in the current vertical slice. Here, "delivered" means checked-in
source/configuration plus Linux SQL.js, mock, and Chromium evidence; it is not
observed plugin/device behavior:

- Numbered SQLite v1 ledger and v2 durable-manual-submission migrations with
  STRICT tables, foreign keys, checksums,
  immutable import/execution facts, mutable heads, and generation-scoped derived
  projections.
- SQLCipher configuration through pinned `@capacitor-community/sqlite` 8.1.0,
  plus app code that generates a random secret and passes it to the plugin's
  secret API under the configured iOS Keychain prefix.
- Generic RFC 4180 CSV selection, mapping/remapping, exact raw-row provenance,
  explicit limits, IANA-zone parsing, DST gap/fold rejection, and exact decimal
  validation entirely on device.
- Stale-preview protection, single-workspace currency enforcement, idempotent
  active duplicate files, same-source changed-payload conflicts, per-account
  receipt attribution, immutable import-occurrence coverage, atomic commit, and
  dependency-aware rollback/restoration through void and non-void versions.
- Deterministic FIFO normalization for partial entries/exits, long/short
  reversals, proportional fees/rebates, contract multipliers, and
  currency-separated totals, with stable equal-timestamp ordering and
  opening-allocation trade identities.
- Replay-safe migration statements plus implemented native-adapter fail-closed
  checks for missing plugin secrets, configured encryption, SQLite/SQLCipher
  integrity, foreign keys, schema version, and migration receipts.
- Explicit empty, fictional-demo, and real-workspace UI states; imported
  execution projections drive the Dashboard, Trades, Reports, calendar, curve,
  import history, and rollback controls.
- Two-step manual execution capture with exact string decimals, stock/ETF and
  account identity, side/position effect, IANA time plus optional explicit UTC
  offset, tamper-evident review, replay-safe submission identity, immutable
  `manual` source facts, atomic projection rebuild, and an unacknowledged-command
  record intended to reside in encrypted native storage and reconcile a lost
  response on relaunch.
- Manual-only journals remain distinct from import receipts, while CSV receipt
  rollback cannot deactivate independently entered manual facts.
- SQLite v3 immutable review versions and optimistic heads attached to stable
  trade subjects, including reusable setup/mistake/emotion/tag vocabulary,
  playbooks, rule outcomes, user-confirmed risk, and optional planned stops.
- Single-Trade Review Exact-Command Recovery v1 retains the individual sheet's
  frozen prepared batch across unknown status and exposes exact replay only.
  Ordered member receipts recover historical committed versions; same-call
  domain errors after an earlier unknown remain ambiguous, fresh stale-head
  rejection preserves the form and blocks obsolete submits, and post-proof
  render failure offers refresh only. Production Chromium proves no form
  reread/new ID, privacy/focus, 320px/200% recovery layout, exact archive
  cardinality, and zero persistence during refresh.
- Individual Trade Review Stale-Head Recovery v1 now proves and displays the
  sole coherent newer review from one exact fresh local snapshot while
  retaining every raw form/rule value. Complete-form, non-merge consent rotates
  identity and requires a separate save; completed heads stay completed and a
  second race repeats the gate. Chromium proves the offline v1→v4 journey,
  failed evidence refresh, focus, 320px/200% reflow, one head, and four
  receipts. SQLite proves the four-link chain and unchanged state across both
  rejected stale commands. Native bridge/multi-scene/lifecycle, relaunch, and
  device accessibility remain open. Atomic batch ambiguous recovery is a
  separate human-gated HIGH because it requires a durable batch receipt and
  schema/migration/export/restore decisions.
- Batch Tag Known-Commit Refresh-Only Recovery v1 now makes the resolved-result
  UI one-way: its modal owns focus and background inertness before save, a
  direct committed result retains its atomic claim, a reconciled duplicate
  result explicitly withholds batch identity, and redraw retries perform zero
  persistence. Chromium proves pre-commit cleanup, repeated activation,
  privacy-safe copy, exact member heads/receipts, unchanged execution
  provenance, and 320px/200% layout. Unknown-result exact replay and native
  acceptance remain open.
- SQLite v4 immutable daily-reflection versions and one optimistic head per
  workspace-local date. Trading and no-trade days support explicit draft or
  completed saves, optional headline/note/emotion/tags/self-reported process
  score, idempotent lost-response reconciliation, and read-only demo examples.
  The date is durable identity; the process score is excluded from performance,
  Direction Mix, Opening Weekday Mix, Plan Check, Setup Breakdown, Mistake
  Patterns, Emotion Patterns, Tag Patterns, and Review Session Coverage
  analytics.
- Daily Journal Stale-Head Recovery v1 preserves the raw form after a
  deterministic optimistic conflict, disables the obsolete submission, loads
  one fresh local snapshot, and displays its different newer head before the
  user may accept that head as the base. A fresh submission ID plus a second
  explicit save appends the successor; missing/unchanged/reload-failed evidence
  stays blocked. Chromium proves this state machine offline, including three
  immutable versions, one head, three receipts, focus, 320px/200% reflow, and
  long-token wrapping. Native multi-scene/lifecycle acceptance remains open.
- Daily Journal Exact-Command Recovery v1 retains the frozen prepared command
  across an unknown outcome and enables only exact replay. Receipt identity is
  checked before the current head, so a committed command still reconciles
  after a successor advances; identical text under another submission is not
  proof. Deterministic stale enters the preserve/review/consent flow, repeated
  ambiguity stays locked, and a proven commit with failed rendering offers
  refresh only. Chromium proves offline focus containment, generic copy,
  320px/200% reflow, no form reread/new ID, immutable history, and no external
  request. Native bridge/lifecycle acceptance remains open.
- Exact, versioned result-R and stock/ETF percent-return definitions with pinned
  rounding, inspectable numerator/denominator evidence, partial-exit labeling,
  incompatible-input null reasons, and fee/short/repeating-ratio fixtures.
- Trade-detail execution inspection, durable review edits, pending/draft/
  completed queues, atomic batch tagging, and session streaks that follow the
  blueprint's any-execution-date/at-least-one-saved-review definition.
- Slice C-B user-owned data v1: Slice C-A's transactional native table-set and
  development-only browser export now have matching-runtime local restore
  implementations. The native restore adapter, covered by Linux repository and
  codec tests, accepts only current-migration `sqlite-table-set` v1 and verifies
  the checksum, 35 tables, 280 ordered columns, canonical rows/signed integers,
  table/state digests, and recomputed summary without executing archive SQL.
  Preview trial-restores in the real destination transaction, verifies table,
  report, summary, foreign-key, and `quick_check` evidence, then rolls back.
  Commit reparses/rederives, atomically rechecks empty state, verifies inside
  the transaction and after commit, and reconciles an exact already-restored
  retry without duplicating data. Different nonempty state is never merged or
  overwritten.
- Browser development accepts only `browser-session-state` v2 and is not native
  recovery evidence. The local UI is absent in demo, blocks nonempty journals,
  requires a verified preview and explicit confirmation, rejects `File.size`
  above 64 MiB before reading, and relies on an independent 67,108,864-byte
  UTF-8 parser limit.
- Recovery Continuity v1 adds browser composition evidence without changing
  those contracts: a UI-authored daily draft survives offline empty-session
  restore, appends exactly one successor through the restored optimistic head,
  re-exports with two versions/one head/two submissions, and survives a second
  restore. A delayed file read that is superseded by another selection cannot
  expose preview evidence or approval, and successful restore focuses the
  stable rendered screen.
- The current matching-runtime archive is restorable but is not a complete
  native backup: attachment catalog v1 is empty, archives with attachments are
  rejected, and native Files/lifecycle/low-storage/near-limit-memory behavior
  remains unverified. Delete All Data is unavailable.
- Compatibility remains exact-runtime during pre-release: this build rejects
  browser v1 and pre-v4 native table sets. A legacy file must be restored in its
  exact old runtime, then the live journal opened/migrated and exported again.
  On-device v3→v4 migration exists but retained-data/interruption proof remains
  a Mac/iPhone gate.
- The first governed insight slice is local and derived-only: Plan Check uses
  current projections and current completed review heads to reconcile exact
  followed/broken cash cohorts, accepts only replay-matching `result-r-v1`
  evidence for R coverage, shows every contributing trade and saved rule,
  discloses account/currency/time zone/period and exclusions, renders evidence
  25 rows at a time, and withholds its observational cash comparison until each
  cohort has at least three trades. Definition
  `plan-adherence-report-v1` is pinned by SHA-256
  `0f092c3bdd6c5051e97f5be0f1c7758a01e3159875adf660b1b0ea00f970ae85`;
  restore recomputes it from existing archive inputs with no schema/archive
  shape change.
- Governed Setup Breakdown replaces the earlier lossy setup summary. Definition
  `setup-performance-report-v1` is pinned by SHA-256
  `5779276cbbc4278136f96bbaca167216c60b395cdad4a8bb4cf9c3b5f272601b`.
  It groups only completed reviewed closed trades with exact realized P&L and a
  classified current setup, reconciles all four exclusion buckets, preserves
  exact cash, admits only strict replay-compatible R, and orders groups by
  stable setup-name code unit rather than outcome. It renders at most five
  groups per action and 25 contributors per group per evidence action, focuses
  the first newly revealed group, and links every included trade to evidence.
  Existing archives retain all inputs; a focused test proves governed reports
  recompute identically after browser export and restore.
- Mistake Patterns v1 is a count-only report over exact saved mistake labels on
  current completed review heads. Definition `mistake-patterns-report-v1` is
  pinned by SHA-256
  `f94fc896308348f55a665aeafba665f0f3d4ee50fc225c4dba1087bc2babad3c`.
  Open and closed trades are equally eligible; pending/draft reviews and
  completed heads without assignments reconcile separately. Unique included
  trades and total assignments conserve independently when a trade has several
  labels. Groups use stable mistake-name code-unit order, evidence uses traded
  date descending then subject ID, and presentation reveals at most five groups
  and 25 contributors per action. No financial, rate, rank, causal, predictive,
  advisory, schema, store, archive, or digest-shape change is included.
- Emotion Patterns v1 is a count-only report over the one exact optional emotion
  on each current completed review head. Definition
  `emotion-patterns-report-v1` is pinned by SHA-256
  `d674eceb0d641512f106f9f1c6b37e23fe1a2ecd0d43e54b7e48865fa594adb4`.
  Open and closed trades are equally eligible; pending/draft reviews and
  completed heads without an emotion reconcile separately. Each included trade
  contributes to exactly one group, so included trades and assignments conserve
  exactly. Groups use stable emotion-name code-unit order, evidence uses traded
  date descending then subject ID, and presentation reveals at most five groups
  and 25 contributors per action. No financial, rate, intensity, rank, causal,
  predictive, advisory, schema, store, archive, or digest-shape change is
  included.
- Tag Patterns v1 is a count-only report over exact saved tags on current
  completed review heads. Definition `tag-patterns-report-v1` is pinned by
  SHA-256
  `ad24da67086c74558203d89b9fe27f2d8907f6170b29fa5320e0aada88405c27`.
  Pending/draft reviews and completed heads without a tag reconcile separately.
  Unique included trades and total assignments conserve independently when a
  trade has several tags. The builder validates the exact saved-review label
  contract without repair, groups by stable tag-name code-unit order, and
  orders evidence by traded date descending then subject ID. Presentation
  reveals at most five groups and 25 contributors per action. Saved vocabulary,
  Daily Journal tags, historical heads, position state, results, and Trades
  filters do not affect eligibility or grouping. No financial, rate, rank,
  reward, causal, predictive, advisory, schema, store, archive, or digest-shape
  change is included.
- Direction Mix v1 is a count-only report over every trade in the current
  full-workspace projection. Definition `direction-mix-report-v1` is pinned by
  SHA-256
  `0a55af9905699cc62746c99b5b4e7dd664588d8b526eefb207e9fb2bb77b3ab2`.
  It has no exclusions: every unique, valid stable-ID trade appears once in the
  fixed Long then Short groups, including zero-count groups. Position and review
  status are validated evidence only and do not change inclusion, grouping, or
  ordering; authored review content, results, currency, and Trades filters are
  not consumed. Evidence uses traded date descending then stable subject ID and
  presentation reveals 25 contributors per action. No financial, percentage,
  rate, rank, causal, predictive, advisory, schema, store, archive, or
  digest-shape change is included.
- Opening Weekday Mix v1 is a count-only report over every trade in the current
  full-workspace projection. Definition
  `opening-weekday-mix-report-v1` is pinned by SHA-256
  `6f205c00826d547f1f0640bec0acceac836e707c4a95287d2e35f4ae62e01cf8`.
  It has no exclusions: every unique valid stable-ID trade appears once in the
  fixed Monday-through-Sunday groups, including zero-count groups, according to
  the canonical workspace-local opening date already derived from the
  immutable ledger. Real Gregorian dates from 1970 through 9999 validate or
  fail closed. Later allocations, exits, and reviews do not regroup a trade.
  Evidence uses opening date descending then stable subject ID and presentation
  reveals 25 contributors per action. Reviews, results, currency, and Trades
  filters are not consumed. No financial, percentage, rate, comparison,
  ranking, reward, causal, predictive, target, advisory, schema, store,
  archive, or digest-shape change is included.
- Review Session Coverage v1 is a count-only report over canonical current
  full-workspace calendar sessions and their durable trade contributions.
  Definition `review-session-coverage-report-v1` is pinned by SHA-256
  `8fafa15893363476f1d0433c8fbb70d3db000b6c4a75bfd9a621862c52244113`.
  A session is reviewed when at least one exactly resolved current trade has a
  saved draft or completed head whose strictly ascending `reviewSessionDates`
  include that date; the current streak is the maximal reviewed suffix ending
  at the latest trading session, so no-trade calendar gaps do not break it and
  an unreviewed latest session yields a zero streak. Three fixed groups—Current
  streak, Reviewed before streak, and Unreviewed—conserve sessions separately
  from calendar-date/trade assignments. Evidence uses date descending then
  stable subject ID, identifies each assignment's current review and coverage
  state, and opens the exact stable-ID trade through existing continuation.
  The fictional demo reconciles 6 of 6 reviewed sessions, a six-session current
  streak, and eight assignments. `reviewProgress` total, reviewed, and streak
  counts are cross-checks only. P&L, currency, Daily Journal, outcomes, and
  Trade Browser scope are not consumed; no rate, ranking, reward, advice,
  schema, store, archive, or digest-shape change is included.
- Trade Browser Scope v1 derives an all-account or stable single-account view
  over optional inclusive workspace-local allocation/activity dates. Exact
  contribution P&L, trade, allocation, and day counts reconcile from calendar
  evidence; selected days intersect the retained account/range; activity-month
  navigation skips empty scoped months; search changes card visibility only;
  every card shows its account and separates scoped contribution from
  whole-trade P&L. Session state survives internal navigation and valid ledger
  refreshes, then resets on mode switch/reload. Dashboard headline/equity/review
  and all eight governed reports intentionally remain whole-workspace.
- Structured Trades Facets v1 adds fixed exact asset-class, direction,
  position-state, and review-state controls over already-scoped cards. The four
  facets AND with normalized search and never change scope evidence, exact P&L,
  counts, the calendar, Dashboard, or governed Reports. Clear search and filters
  preserves account/date/day scope; Clear all resets both layers. Facet state is
  session-only, survives internal navigation and valid refresh, and resets on a
  mode switch or reload. This derived layer changes no schema, store, archive,
  or report definition.
- Dynamic Review Facets v1 adds exact Mistake, Emotion, and Tag selects derived
  from current `TradePreview` assignments across the whole workspace, not
  unused saved vocabulary. Values reuse the saved-review normalization and
  limits; choices are stable code-unit ordered, detached, and deeply frozen.
  The three selects AND with the four fixed facets, normalized search, and
  existing account/date/day scope. A well-formed selection that loses its final
  current assignment remains visible as not currently assigned and yields zero
  cards rather than a silently broadened view. These session-only filters retain
  valid refresh state, reset on mode switch or reload, and never change exact
  scope evidence/totals, the calendar, Dashboard, governed Reports, schema,
  store, archive, or report definitions.
- Exact Setup Facet v1 adds a classified-only exact Setup select derived from
  current whole-workspace `TradePreview` assignments. The canonical absent
  **Unclassified** placeholder is excluded, but an explicitly saved setup with
  that literal name remains a real option. Setup composes with the other seven
  facets, normalized search, and scope; a stale valid selection stays visible
  and yields zero cards. It is session-only and changes no scope evidence,
  calendar, Dashboard, report, store, archive, digest, schema, or financial
  definition.
- Review Queue Focus v1 derives a detached, deeply frozen, fail-closed grouping
  projection from current closed trades whose current review state is
  unfinished. It requires unique stable subject identities, coherent current
  review heads, and exact waiting/draft/completed count reconciliation against
  `reviewProgress`; invalid evidence throws rather than being repaired,
  dropped, or defaulted. Only nonempty **Drafts** then **Not started** groups
  render, preserving canonical snapshot order within each group. After a
  confirmed queue-origin single-review save or resolved
  batch-tag refresh redraws Journal, focus moves to the first surviving group
  heading or the stable queue title when none survives. Existing versioned
  review and atomic batch writes, recovery states, and ownership are unchanged;
  no queue/focus/group state enters SQLite, the browser journal, an archive,
  digest, report, or financial formula. Schema v4, the five primary tabs, ten
  report targets, and eight governed reports are unchanged. Native VoiceOver,
  hardware-keyboard, Dynamic Type, lifecycle, reflow, and focus acceptance
  remain a Mac/iPhone hold.
- Calendar-Day Reflection Continuation v1 renders the full-workspace Daily
  Journal state for the exact selected activity date inside its Trades card.
  Local non-future actions carry a canonical date that must agree with the
  selected Trade Browser state and card before the editor, random submission
  identity, inert state, or persistence can begin. Exact creates lock that date
  instead of using the generic newest-unoccupied default; draft/completed
  actions continue the unique current head. Demo and future dates remain
  read-only. Direct save, exact replay, and known-commit refresh recovery focus
  the rebuilt reflection status while retaining account/date/day scope, query,
  and all eight exact facets. The reflection remains a whole-workspace-date
  record and never marks the trading session reviewed. Existing Daily Journal
  persistence/recovery is reused without schema, store-command, report,
  formula, archive, digest, preference, dependency, or native-source changes.
  Native VoiceOver, keyboard, Dynamic Type, lifecycle, and physical-device
  persistence acceptance remain held.
- Daily Reflection Return Focus v1 gives every current Journal reflection card
  an exact date identity and focusable heading. After direct save, exact replay,
  or confirmed-commit refresh retry, Journal redraws and focus returns to the
  unique same-date heading from the prepared command, then **Daily notes**, then
  the screen. Post-refresh focus for generic creation follows its validated
  prepared date without rereading mutable DOM or reverting to the pre-open
  default. Calendar-origin precedence,
  cancel return, and unresolved recovery ownership are unchanged. The slice is
  presentation-only and adds no persistence, schema, store command, archive,
  digest, report, formula, preference, dependency, or native source. Native
  VoiceOver, hardware-keyboard, lifecycle, and Dynamic Type acceptance remain
  held.
- Compact Trades Filters v1 puts only those eight exact controls and their
  error region in a native disclosure. Zero exact facets render collapsed; any
  fixed, dynamic, or retained stale facet renders open; the summary count
  updates from zero through eight without counting query or account/date/day
  scope. Search-only clear stays visible outside the disclosure. Resetting the
  final facet or using the combined clear action collapses and focuses the
  summary. Production Chromium proves pointer, Enter, Space, sequential Tab,
  stale refresh, report/storage neutrality, 44-point controls, and no overflow
  at 320 and 421 CSS pixels with 200% text. No disclosure state is persisted.
- Reports Navigator v1 exposes ten semantic targets: Performance Summary,
  Journal Curve, Review Session Coverage, Direction Mix, Opening Weekday Mix,
  Plan Check, Mistake Patterns, Emotion Patterns, Tag Patterns, and Setup
  Breakdown in DOM order.
  Dashboard enters Review Session Coverage or Plan Check directly, every
  section returns to the menu, and jumps preserve
  opened disclosures while moving focus below measured chrome without animation. At
  480 CSS pixels or narrower the top bar scrolls with content, leaving the
  fixed primary tabs and enough visible height for bounded report controls at
  200% text. Production Chromium proves keyboard and pointer activation, direct
  Dashboard entry, return navigation, fully unobscured focus for menu links,
  targets, and existing report summaries, 44-point controls, no horizontal or
  internal overflow, no external request, no local-preference write, stable DOM
  identity, and unchanged governed metric/curve/metadata/group/evidence
  fingerprints. This adds no schema, store, archive, digest input, formula,
  checksum, cohort, evidence-order, or pagination change.
- Report Trade Continuation v1 opens the existing exact trade review/detail
  sheet in place from every Direction Mix, Opening Weekday Mix, Review Session
  Coverage, Plan Check, Mistake Patterns, Emotion Patterns, Tag Patterns, and
  Setup Breakdown contributor. Stable
  subject IDs are
  validated at render and activation; asset
  class, account, and session disambiguate duplicate symbols; a replaceable
  delegated listener
  covers progressively appended rows and groups. A missing or duplicate
  render-time match aborts an incoherent report; activation-time invalid
  identity/source data shows a focused error without inert state or a store
  call. Close returns to the exact row, while a save or reconciliation refresh
  that rebuilds the report returns to the allowlisted source heading.
  Production Chromium proves offline demo inspection, exact-ID-over-label
  behavior, conflicting retained Trade Browser scope/search/facets,
  disclosure/DOM/scroll/report/storage continuity, dynamic post-bind
  activation, fail-closed unknown identity, 44-point controls, focus trapping,
  and no overflow at 320 and 421 CSS pixels with 200% text. No route,
  browser-state, schema, store, archive, formula, checksum, cohort definition
  or eligibility rule, order, or pagination change.
- Dashboard Recent Trade Continuation v1 keeps the existing four-row
  full-workspace Dashboard cohort and newest-projection order, but gives every
  semantic row an **Open trade** action backed only by its stable subject ID.
  Asset class, account, and full session context distinguish duplicate symbols.
  The demo is read-only and ordinary close restores the exact trigger; a local
  save uses the existing review command, redraws Dashboard, announces the
  result, and focuses the stable screen. Production Chromium proves exact
  QQQ/META/SPY/AMD demo order, distinct duplicate-symbol targeting, focused
  tamper failure before inert state, preference and network neutrality,
  keyboard activation, 44-by-48 CSS-pixel targets, and unobscured no-overflow
  reflow at 320 and 421 CSS pixels with 200% text. No report-source context,
  route, Trade Browser state, schema, store contract, archive, digest, metric,
  formula, checksum, cohort, or financial definition changed.
- Real SQL.js schema/repository tests plus browser import/rollback coverage. The
  2026-07-13 Slice B Linux gate passed 248 Vitest tests and 19 Playwright
  journeys.
- The 2026-07-13 Slice C-A Linux gate passed a locked install, 271 Vitest tests
  across 26 files, 21 Playwright journeys, the production build, Capacitor sync,
  dependency audit, native/lock drift check, and whitespace check.

Still required in Phase 1:

- Verify native encryption, Keychain loss/reinstall behavior, backup behavior,
  CocoaPods lock resolution, kill/relaunch persistence, and migrations on a Mac
  and physical iPhone.
- Inject native factory-open, initial-ledger-read, and teardown failures. Verify
  VoiceOver announces the startup recovery surface, no replacement/fallback
  journal opens, clean retry reopens the same data, and unconfirmed teardown
  requires a full app relaunch at 320 CSS pixels and 200% Dynamic Type.
- Deepen the delivered Trades review detail and scope with saved presets,
  optional persistent/report scope, fuller account management,
  vocabulary/playbook management, and the remaining reconciled report families.
- Add a human-gated generic-CSV asset-class contract before claiming ETF/
  options/futures/crypto file coverage; the current generic CSV adapter
  intentionally records rows as stock.
- Prove native export and restore Files/share/cancel/save/reopen behavior on a
  Mac and iPhone, including empty-state preview rollback, atomic commit, exact
  response-loss retry, asynchronous file replacement, continued Daily Journal
  writes, interruption, relaunch, low storage, and near-limit memory behavior.
- Repeat Daily Journal exact-command recovery against native SQLite with lost
  bridge responses before and after commit, repeated unknown results, a later
  head from a second scene, refresh failure after proven commit,
  background/foreground, force quit/relaunch, and device accessibility. Never
  accept readable-ledger content or matching authored text as receipt proof.
- After native restore acceptance, add verified Delete All Data with database,
  Keychain, attachment, interruption, response-loss, and receipt behavior.

Exit gate: manual/CSV input → normalized trade → journal metadata → dashboard/
report → export/restore works in airplane mode, survives kill/relaunch, and
passes duplicate, corruption, currency, fee, partial-fill, and long/short tests.

### Phase 2 — journal depth and release-quality workflows

- Add prioritized broker-specific CSV adapters behind the generic mapping core.
- Add options/futures contract fields and commission-aware calculations.
- Add attachments/screenshots with quota, export, deletion, and orphan cleanup.
- Add templates, reminders, saved view presets, fuller vocabulary/playbook
  management, drawdown/time-of-day/symbol reports, deeper setup
  comparisons, and explainable report drill-down.
- Add app-local privacy policy, help, disclaimers, and a complete data-management surface.
- Add optional local or user-funded intelligence only after privacy and cost review.

Exit gate: reports reconcile against fixtures/source records, every stored field
exports and deletes correctly, and failures remain visible and recoverable.

### Phase 3 — iOS beta and App Store submission

- Replace generated Capacitor icon/splash placeholders with cleared, original assets.
- Run Xcode 26+, Simulator, physical iPhone, VoiceOver, Dynamic Type, reduced
  motion, keyboard, orientation, migration, interruption, and offline relaunch tests.
- Confirm final name/bundle ID, signing, privacy manifest, SDK behavior, and archive.
- Publish support/privacy URLs and complete privacy nutrition labels, age rating,
  category, screenshots, description, keywords, review notes, and disclaimer.
- After explicit owner approval, configure the selected paid-app tier under the
  Paid Apps Agreement. The current $9.99 figure is only a hypothesis; do not
  create a subscription or in-app lifetime unlock.
- Distribute through TestFlight before human-reviewed submission.

Exit gate: signed archive, device matrix, TestFlight evidence, final privacy/
legal/product review, and human App Store submission approval are complete.

### Phase 4 — Android parity

- Add the Capacitor Android target after iOS contracts freeze.
- Reuse the TypeScript domain, fixtures, responsive UI, and import/export format.
- Implement Android Keystore/storage lifecycle, document picker/share sheet,
  backup behavior, back navigation, and edge-to-edge safe areas.
- Complete Play Data Safety, content rating, signing, closed testing, and the
  local-currency one-time paid price.

Parity means behavioral and data-contract parity, not pixel imitation of iOS.

## Competitive evidence

Verified against official materials on 2026-07-09:

- [TradeZella pricing and feature matrix](https://www.tradezella.com/pricing)
- [TradeZella pricing help](https://help.tradezella.com/en/articles/8911582-our-pricing)
- [Generic CSV import](https://help.tradezella.com/en/articles/8239862-how-to-import-trades-from-unsupported-broker-into-tradezella-via-generic-csv-file-upload)
- [Tags and cross-analysis](https://help.tradezella.com/en/articles/11595729-reports-tags)
- [Strategies and rules](https://help.tradezella.com/en/articles/7020769-getting-started-with-strategies)

TradeZella's pricing pages currently disagree on some tier names/entitlements.
Hermes benchmarks the documented product-wide capability set, not an unstable
tier-by-tier claim. Reverify before public comparative positioning.

## Launch blockers outside Linux implementation

1. A Mac with the current App Store-required Xcode and an enrolled Apple Developer account.
2. Final brand/name/trademark/domain and bundle-identifier clearance.
3. Final icon, screenshots, support URL, privacy URL, and App Store copy.
4. Human review of financial, privacy, and comparative claims.
5. Written rights review before any broker sync, market-data, chart, replay, or backtest integration.

Durable trade/day annotations, Trade Browser Scope v1, Structured Trades Facets
v1, Dynamic Review Facets v1, Reports Navigator v1, Report Trade Continuation
v1, Mistake Patterns v1, Emotion Patterns v1, Tag Patterns v1, Direction Mix
v1, Opening Weekday Mix v1, Review Session Coverage v1, Dashboard Recent Trade
Continuation v1, Exact Setup Facet v1, Review Queue Focus v1, Calendar-Day
Reflection Continuation v1, Daily Reflection Return Focus v1, Compact Trades
Filters v1,
matching-runtime local restore, and all eight governed reports are implemented.
Twenty-one bounded Slice D increments are implemented in total; the seventeen
presentation/projection increments remain derived-only. Durable Daily Journal,
Report Trade Continuation, Dashboard Recent Trade Continuation, and Calendar-Day
Reflection Continuation are the write-capable exceptions. The trade
continuations reuse the existing versioned trade-review path; the calendar-day
continuation reuses the existing Daily Journal path without changing either
persistence contract.
Startup Recovery v1 and the Linux-to-Mac evidence boundary harden application
initialization and CI handoff without changing a schema, migration, financial
definition, or native readiness claim.
Daily Journal Exact-Command Recovery v1 closes the browser unknown-save gap
without strengthening any native claim.
Single-Trade Review Exact-Command Recovery v1 closes only the individual
review-sheet unknown-save gap. Individual Trade Review Stale-Head Recovery v1
now closes its deterministic browser conflict/consent gap without changing
schema or strengthening any native claim. Atomic batch ambiguous recovery
remains a human-gated HIGH pending a durable batch-receipt design; the narrower
Batch Tag Known-Commit Refresh-Only Recovery v1 now prevents resolved saves
from being submitted again after redraw failure.
Native v3→v4 migration/relaunch and Daily Journal device acceptance, native
restore acceptance, verified Delete All Data, remaining report families, and
later attachment round-trip remain—not broker connectivity, hosted sync,
Android, recurring AI, or legacy cockpit extraction.
