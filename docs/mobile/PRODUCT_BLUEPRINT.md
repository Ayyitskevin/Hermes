# Hermes Journal product and technical blueprint

Status: authoritative mobile product blueprint · 2026-07-16

## Executive decision

Hermes Journal will launch as an original, iPhone-first trading journal for
phone-first traders who want a fast review habit without another expensive
subscription. It provides journaling, analytics, and user-directed deterministic
calculators. It never holds funds, provides investment advice, places or changes
orders, or recommends a security.

The implementation strategy is a **staged hybrid**:

1. Finish and release the private, offline Core using the Linux-tested
   TypeScript/Capacitor ledger and configured SQLCipher adapter already in this
   repository.
2. Add narrowly scoped Swift/Capacitor integrations where they materially
   improve the iPhone experience: Files and Share Sheet import, camera/photo
   attachments, local notifications, biometric lock, and MetricKit diagnostics.
3. Consider an optional hosted Connect service only after prelaunch usability/
   retention evidence and a real, human-approved paid cohort establish demand
   and sustainable economics. The local Core must remain complete and useful
   without Connect.

Do not rewrite the current ledger in SwiftUI and do not stand up a multi-tenant
backend before those gates. The existing immutable execution ledger, exact FIFO
normalizer, CSV provenance, rollback model, encrypted-native-store design and
adapter, and test fixtures are Hermes's strongest assets. A rewrite would delay
validation while discarding verified correctness.

## Product position

Working promise:

> The mobile trading journal that turns every session into a better habit—fast,
> private, read-only, and affordable.

Hermes competes with TradeZella on the core import → review → insight loop, not
on feature count. TradeZella currently advertises $29/$49 monthly plans and
$288/$399 annual plans, plus a broad web product spanning imports, analytics,
replay, backtesting, AI, mentors, and prop-firm workflows. Hermes wins its wedge
through a native-feeling phone workflow, clear ownership of local data, a much
lower entry price, inspectable calculations, and an import history users can
trust.

TradeZella is a capability benchmark only. Hermes must not copy its name, trade
dress, assets, copy, screenshots, or interaction design and must not imply an
affiliation.

## Audience and jobs

Primary audience:

- Adult Gen Z and younger millennial self-directed stock and ETF traders who
  execute in apps such as Robinhood, Webull, Schwab/thinkorswim, or IBKR and
  review mainly from their phone.
- Developing traders who need consistency and reflection more than another
  signal feed.
- Privacy- and price-sensitive traders willing to import files or enter fills
  manually in exchange for a complete local product.

Options, futures, forex, crypto, and prop-platform traders are discovery
segments, not launch-audience claims. Hermes may target them only after explicit
instrument contracts, parsers, multipliers, fees, and reconciliation fixtures
exist; generic CSV rows are stock-only today.

Core jobs:

1. Bring a session into the journal from Files, Share Sheet, or a short manual
   form without touching broker credentials.
2. Reconcile exactly what was accepted, skipped, rejected, or deduplicated.
3. Review a trade in under 60 seconds: setup, emotion, mistake, rule adherence,
   note, and optional screenshot.
4. See one useful, explainable pattern and drill into the trades behind it.
5. Keep a review habit without rewarding overtrading, profit screenshots, or
   gambling-like engagement.
6. Export, restore, or delete all journal data without asking Hermes for access.

## Differentiation principles

### 1. Review-first mobile workflow

The home experience is a short action queue, not a desktop dashboard squeezed
onto a phone: import the latest session, review unreviewed trades, then see one
evidence-linked insight. Common actions should be reachable with one thumb and
complete in less than a minute.

### 2. Every number traces to a fill

Imports show a preview, row-level errors, duplicates, receipt, and reversible
history. Derived trades never replace immutable executions. Reports expose the
included trade count, exclusions, currency, time zone, and metric definition.

### 3. Habit mechanics without gambling mechanics

Hermes may reward completed reviews, rule adherence, journal streaks, and data
backup. It must not reward trade count, turnover, risk taken, or profit.

### 4. Private and honest by default

The Core works without an account or network connection. No advertising SDK,
IDFA, brokerage username/password, or silent financial telemetry is allowed.
Any future AI or cloud feature is opt-in and states exactly what leaves the
device.

### 5. Price clarity

The proposed launch model remains a one-time paid Core with no second unlock and
no subscription required for local features. **$9.99 is an unapproved validation
hypothesis**, not a public promise or permission to configure App Store pricing
or fund recurring services. Exact pricing requires explicit owner approval after
unit-economics and willingness-to-pay evidence.

An optional Connect plan may be tested later around **$5.99/month or $49/year**
only if it pays for hosted backup/sync, read-only broker aggregation, and its
support burden. Existing Core features and user exports must not be held behind
Connect. Pricing is a hypothesis until App Store commission, taxes, support,
provider costs, conversion, retention, and refund data are measured. Connect
pricing also requires explicit owner approval.

## Scope contract

| Capability | Core launch | Later local | Connect candidate |
|---|---|---|---|
| Manual executions and generic CSV | Stock/ETF manual; stock-only generic CSV | Asset-class mapping and broker parser packs | Read-only scheduled imports |
| Exact fills, fees, partial exits, long/short | Exact fills; fees representable in declared currency minor units; stock/ETF contracts | Options/futures/forex/crypto contracts | Provider reconciliation |
| Notes, setup/mistake/emotion tags, playbooks | Yes | Templates and richer review queues | Private mentor comments |
| Core reports and drill-down | Currency metrics; percent/R only after versioned bases | Deeper comparisons and local insight feed | Cross-device aggregates |
| Screenshots/attachments | Yes, bounded on device | Share cards and PDF summary | Encrypted private backup |
| Export, restore, Delete All Data | Yes | Additional interoperable formats | Account-level export/deletion |
| Account or network requirement | No | No | Yes, only for Connect |
| Trade execution/custody | Never | Never | Never |
| Real-time market data/replay/backtest | No | User-supplied files only | Separate rights and economics gate |
| AI | No launch dependency | Local/BYOK exploration | Opt-in reflection only; never calculations or advice |

## Information architecture

The five destinations remain:

1. **Dashboard** — review queue, headline P&L and risk-basis-backed R, one
   insight, calendar, curve, recent trades.
2. **Trades** — search/filter, trade detail, executions, notes, tags, screenshots.
3. **Journal** — daily reviews, templates, emotions/mistakes, playbooks, rules.
4. **Reports** — currency expectancy, profit factor, drawdown, streaks, and
   breakdowns by setup, tag, symbol, direction, day, and time; R expectancy is
   shown only for trades with a compatible stored risk basis.
5. **More** — imports, accounts, planning tools, data management, privacy, help,
   and legal.

Import and add actions are tasks, not tabs. The primary home call to action
changes with state: import/enter first trades, review pending trades, or examine
an evidence-linked pattern.

## Stack decision

### Core client — keep

| Area | Tool | Contract |
|---|---|---|
| iOS shell | Capacitor 8 + CocoaPods target | iPhone first; no remote `server.url` |
| UI | Vite 8, TypeScript 5.9, semantic HTML, CSS | Split the current monolith into feature modules before large screen growth |
| Domain | Pure TypeScript | Exact deterministic calculations; no model-generated metrics |
| Local truth | SQLite STRICT schema + SQLCipher | Immutable source facts, versioned corrections, derived projections |
| Secrets | iOS Keychain | Random database secret; no app or provider secret in source |
| Native affordances | Small Swift/Capacitor plugins | File/Share Sheet, photos, notifications, biometrics, diagnostics |
| Unit/integration tests | Vitest + SQL.js | Golden fixtures, property boundaries, real schema/repository behavior |
| User journeys | Playwright | Mobile layout, accessibility, import/review/export journeys |
| Native release gate | Xcode, Simulator, physical iPhone, Xcode Cloud | SQLCipher, lifecycle, accessibility, archive, TestFlight evidence |

Do not adopt React, React Native, Flutter, or a SwiftUI rewrite merely to add
screens. First split `ui/app.ts` into screen templates/controllers and shared
components while preserving the typed application and store boundaries. Revisit
the client platform only if measured WebView limitations block a release
requirement.

### Optional Connect backend — deferred

If the product gates pass, use a modular Supabase/PostgreSQL backend first:

- Postgres with row-level security for tenant isolation.
- Private object storage for encrypted user-owned files.
- Edge/API functions for idempotent writes and provider webhooks.
- A durable queue for imports and reconciliation.
- Sign in with Apple as the primary identity.
- A versioned HTTPS/OpenAPI contract; the mobile app never receives service
  credentials.

Sync immutable facts, annotations, and outbox events—not opaque database files
or derived projections. The deterministic client/server metric versions must
reconcile. A provider adapter may expose link, sync, refresh, and revoke; it must
never expose an order-placement method.

Read-only broker aggregation has recurring cost. SnapTrade currently advertises
daily read-only data around $1 per connected user/month, so it cannot be bundled
into the proposed $9.99 one-time Core hypothesis. No provider is selected until
coverage, data rights, retention, deletion, security, support, and unit
economics pass review.

### Product and delivery tools

- Figma plus Apple Human Interface Guidelines and SF Symbols for cleared design
  work; production assets remain original.
- GitHub Issues/Projects for epics and acceptance gates; GitHub Actions for the
  cross-platform checks already present.
- Xcode Cloud/TestFlight for signed native builds when a Mac and Apple Developer
  account are available.
- MetricKit first for native diagnostics. Any third-party crash or product
  analytics SDK requires a field allowlist and must exclude tickers, broker and
  account identifiers, balances, P&L, filenames, screenshots, and journal text.

## Data and correctness invariants

1. Executions/fills are immutable facts. Corrections add versions; rollbacks
   never erase provenance.
2. One source row is not assumed to equal one trade. Trades are deterministic
   projections over ordered execution versions.
3. Decimal quantities and money never cross a binary floating-point boundary in
   the ledger. Currency totals are not combined without an explicit FX source.
4. File hashes, source identities, and idempotency keys make repeated imports
   safe and explainable.
5. Trade annotations attach to stable trade subjects, not disposable projection
   rows.
6. Every schema or formula change has a version, migration, checksum, replay
   test, and export compatibility decision.
7. No code path connects to a brokerage write endpoint or creates/modifies an
   order. The mobile source/dependency boundary test and production CSP keep
   this boundary executable.
8. Storage, export, restore, deletion, and attachment cleanup are product
   features, not post-launch operations work.

## Delivery roadmap

### Slice A — product contract and manual capture

Status: implemented and Linux-verified; native persistence/lifecycle evidence
remains part of the Mac/device release gate.

- Establish repository-local mobile instructions and quarantine conflicting
  legacy-agent guidance.
- Split just enough UI structure to add a maintainable task flow.
- Add validated manual execution entry through the same immutable ledger and
  projection contracts as CSV.
- Persist the reviewed command and unacknowledged result in schema v2, intended
  to reside in the configured encrypted native store, so a lost native response
  or WebView restart reconciles the existing fill.
- Cover empty and existing workspace/account states, exact decimals, fees,
  time zones, duplicate submission, failure atomicity, and accessibility.

Exit: a user can enter a fill offline, see its normalized trade/report effect,
relaunch on native storage, and trace it to a manual source fact.

### Slice B — the 60-second review

Status: implemented and Linux-verified; native v2→v3 migration, encrypted
relaunch, and device accessibility remain part of the Mac/device release gate.

- Trade detail with execution inspection.
- Durable note plus setup, mistake, emotion, and rule-adherence fields.
- Configurable tags and playbook/rule assignment.
- Pending-review queue, batch tagging, and review-completion streak.
- Persist versioned risk metadata on the stable trade subject. Risk-basis v1 is
  an explicit, positive initial-risk amount in the trade's P&L currency, with an
  optional planned stop retained as source context. The standalone sizing
  calculator never silently supplies or changes this basis.
- Define result-R v1 as exact net realized P&L divided by the user-confirmed
  initial-risk amount. Define percent-return v1 for supported stock/ETF trades
  as exact net realized P&L divided by absolute entry notional, multiplied by
  100. Persist both definition versions, return null when inputs/currencies are
  incompatible, and cover fees, shorts, partial exits, and zero/missing bases
  with reconciliation fixtures.

Exit: a user can complete and later edit a review without changing execution
facts; every annotation survives projection rebuilds; and percent/R/expectancy
never appear without their inspectable, versioned denominator.

### Slice C — user-owned data

- Versioned export manifest covering every currently stored field and a
  versioned attachment catalog.
- Previewed, atomic restore with compatibility and corruption checks.
- Delete All Data with confirmation, attachment cleanup, Keychain/database
  behavior, and a verification receipt.

Slice C-B adds local-only, previewed restore for current
`hermes-journal-export` v1 files. The native adapter, covered by Linux
repository/codec tests, accepts only `sqlite-table-set` v1 from the current
migration set; its decoder verifies the envelope checksum, all 35 tables and 280
pinned ordered columns, canonical rows and signed 64-bit integers, table/state
digests, and a recomputed summary. Archive SQL is never executed, and live
table-SQL hashes remain diagnostic.

The native restore adapter is implemented and covered by Linux repository tests
that trial-restore into the real destination transaction, recompute table,
report, summary, foreign-key, and `quick_check` evidence, then roll back
deliberately. Commit reparses and rederives the archive, atomically rechecks that
the destination is empty, verifies inside the transaction, and verifies the
committed state again. An exact already-restored state is an idempotent retry;
different nonempty state is never merged or overwritten. Browser development
accepts only `browser-session-state` v2,
validates a separate candidate before one atomic swap, and is not native
recovery evidence.

The UI rejects `File.size` above 64 MiB before reading text; the parser
independently enforces 67,108,864 UTF-8 bytes. A matching-runtime,
current-schema file is restorable, but it is not yet a complete native backup:
attachment catalog v1 is empty, archives containing attachments fail closed,
and Files, interruption/lifecycle, low-storage, and near-limit memory behavior
remain native gates. Delete All Data remains unavailable.

Compatibility is intentionally exact-runtime during this pre-release phase.
The current build rejects browser v1 and pre-v4 native table sets; a legacy
file must first be restored by its exact old runtime, then the live journal
opened/migrated and exported again. On-device v3→v4 migration is implemented,
but retained-data/interruption proof remains a Mac/iPhone release gate.

Exit: export → delete → restore reproduces the same ledger, annotations,
attachments, and report digests in airplane mode.

### Slice D — insight and mobile depth

Thirteen bounded Slice D increments are implemented in the current workspace.
The first is an offline plan-adherence report over the current projection and
current saved review heads. A completed closed trade with exact realized P&L is
classified as
broken when any current rule is broken, otherwise followed when any current
rule is followed; open/partial trades, missing exact P&L, incomplete reviews,
and completed reviews with no classifiable rule are separately reconciled.
Evidence is ordered by trade date descending then stable trade-subject ID and
is progressively rendered 25 rows at a time.

The definition is `plan-adherence-report-v1`, checksum
`0f092c3bdd6c5051e97f5be0f1c7758a01e3159875adf660b1b0ea00f970ae85`.
Cash uses exact signed-decimal sums. R coverage accepts only replay-matching
`result-r-v1` evidence with its pinned 12-decimal half-away-from-zero contract;
incompatible R remains unavailable without removing the cash trade. Group means
use half-away-from-zero division at 12 decimal places.
The followed-minus-broken cash comparison uses one final exact division and is
shown only with at least three included trades in each group. Copy remains
observational, identifies account/currency/time zone/period, and links every
contributor to its saved rule evidence. The report is derived-only: no schema or
archive shape changed, existing current-schema archives retain its inputs, and
the matching runtime recomputes it after restore.

The second is governed Setup Breakdown. Definition
`setup-performance-report-v1` is pinned by checksum
`5779276cbbc4278136f96bbaca167216c60b395cdad4a8bb4cf9c3b5f272601b`.
Its mutually exclusive cohort excludes open/partial trades, missing exact
realized P&L, incomplete reviews, then completed reviews without a saved setup;
every included trade belongs to exactly one exact setup label. The derived
`hasClassifiedSetup` state preserves null/string classification separately
from display text, so wording never reclassifies a saved label. Cash totals
remain decimal strings, cash expectancy and compatible R use 12-decimal
half-away division, zero is not a win, and R coverage accepts only the same
strict replay-validated versioned evidence as Plan Check. Groups use stable
setup-name code-unit order, not performance rank. At most five groups render
per group page; within each group, evidence uses traded date descending then
stable subject ID and renders at most 25 contributors per action. Copy
discloses scope, exclusions, rounding, ordering, and its non-causal,
non-predictive, non-advisory boundary.
This report is also derived-only: no schema or archive shape changed, and
existing current-schema archives retain its inputs.

The count-only Mistake Patterns report uses definition
`mistake-patterns-report-v1`, pinned by checksum
`f94fc896308348f55a665aeafba665f0f3d4ee50fc225c4dba1087bc2babad3c`.
It consumes the current projection and current completed review heads without a
position-state, realized-result, currency, or outcome condition. Pending/draft
reviews are excluded first; completed heads without a saved mistake assignment
are excluded next. Unique included trades reconcile separately from total exact
label assignments, because one trade may appear once in several groups. Saved
labels are validated without normalization or repair, groups use stable
mistake-name code-unit order, and evidence uses traded date descending then
stable subject ID. Presentation renders five groups and 25 contributors per
action. The report contains no P&L, win rate, R, expectancy, rate, ranking,
causal, predictive, or advisory output. A dedicated browser archive test proves
all six governed reports recompute identically after export and restore. No
schema, archive, or digest-shape change is included.

The count-only Emotion Patterns report uses definition
`emotion-patterns-report-v1`, pinned by checksum
`d674eceb0d641512f106f9f1c6b37e23fe1a2ecd0d43e54b7e48865fa594adb4`.
It consumes the current projection and current completed review heads without a
position-state, realized-result, currency, or outcome condition. Pending/draft
reviews are excluded first; completed heads without the one optional exact
emotion are excluded next. Each included trade belongs to exactly one emotion
group, so included trades and assignments must reconcile exactly. Saved values
are validated without normalization or repair, groups use stable emotion-name
code-unit order, and evidence uses traded date descending then stable subject
ID. Presentation renders five groups and 25 contributors per action. The report
contains no P&L, win rate, R, expectancy, rate, intensity, ranking, causal,
predictive, or advisory output. It is derived-only and adds no schema, archive,
or digest-shape change.

The count-only Direction Mix report uses definition
`direction-mix-report-v1`, pinned by checksum
`0a55af9905699cc62746c99b5b4e7dd664588d8b526eefb207e9fb2bb77b3ab2`.
It consumes every trade in the current full-workspace projection exactly once,
with no exclusions, and returns the fixed Long then Short groups even when one
or both are empty. Direction is the only grouping input. Position and review
status are validated evidence fields but never change inclusion, grouping, or
ordering; authored review content, result fields, currency, and Trade Browser
scope are not consumed. Stable subject IDs must be unique, trimmed, 1–256 code
points, and free of C0/C1 controls. Evidence uses traded date descending then
stable subject ID and renders 25 contributors per action. The report contains
no P&L, win rate, R, expectancy, percentage, rate, ranking, causal, predictive,
or advisory output. It is derived-only and adds no schema, store, archive, or
digest-shape change.

The count-only Opening Weekday Mix report uses definition
`opening-weekday-mix-report-v1`, pinned by checksum
`6f205c00826d547f1f0640bec0acceac836e707c4a95287d2e35f4ae62e01cf8`.
It consumes every trade in the current full-workspace projection exactly once,
with no exclusions. The only grouping input is `TradePreview.tradedOn`: the
canonical workspace-local calendar date already derived from the immutable
ledger trade's first-entry time. Real Gregorian dates from 1970-01-01 through
9999-12-31 map deterministically to fixed Monday-through-Sunday groups, which
all remain present when empty. Later allocations, exits, and reviews do not
move a trade between groups.

Stable subject IDs must be unique, trimmed, 1–256 code points, and C0/C1-free;
direction and position status are validated scalar evidence. Evidence uses
opening date descending then stable subject ID and renders 25 contributors per
action. Authored review content and state, results, currency, and Trade Browser
scope are not consumed. The report contains no P&L, win rate, R, expectancy,
percentage, rate, comparison, ranking, reward, causal claim, prediction,
target, or advice. It is derived-only and adds no schema, store, archive, or
digest-shape change.

The third increment turns Dashboard trading days into a bounded evidence
drill-down in Trades. Calendar membership is derived from normalized allocation
events in the workspace time zone; exact day P&L reconciles to durable
trade-subject contributions and allocation counts. A multi-day trade can appear
on more than one day. The selected view separately labels allocation-day
contribution and whole-trade realized-to-date result. At that increment
boundary it remained a transient whole-workspace view without account/date
scope; the fifth increment below extends the same evidence model. Neither
increment rescopes reports or changes schema/archive shapes.

The fourth increment is Durable Daily Journal v1. An established local
workspace can explicitly save a draft or completed day-level reflection for a
trading or no-trade date, then edit it only by appending an optimistic immutable
successor. The workspace-local date is durable identity. Headline, note,
emotion, tags, and a self-reported process score are optional, but every version
requires at least one authored signal; the score is excluded from performance,
Direction Mix, Opening Weekday Mix, Plan Check, Setup Breakdown, Mistake
Patterns, and Emotion Patterns analytics.
Schema v4 adds immutable versions,
one guarded head per date, and shared-vocabulary assignments. Browser payload
v2 and the native archive codecs covered by Linux tests preserve the complete
chain, validate the content-bound revision, and reject legacy payloads rather than
guessing at conversion. Native Files/plugin execution remains a Mac/iPhone
gate. Demo examples remain fictional and read-only, and the editor states that
Hermes never places or routes a trade.

Daily Journal Stale-Head Recovery v1 hardens that optimistic boundary without
changing persistence. A definite `entry_changed` keeps the user's raw form
values in memory and disables the obsolete submission. Hermes loads one fresh
local workspace snapshot, proves and displays a different newer head for the
same date, then requires explicit consent to use it as the base and a separate
save action to append the successor with a fresh submission identity. It never
auto-merges or auto-submits; missing, unchanged, or unreadable head evidence
remains fail-closed. Chromium proves the composed three-version flow through a
deterministic retained-editor race in one application/store, but not native
multi-scene, WKWebView lifecycle, SQLCipher, or device accessibility.

Daily Journal Exact-Command Recovery v1 hardens the ambiguous boundary without
changing persistence. The sheet retains the original immutable prepared
command before its first save attempt and freezes every authored control and
close path when commit status cannot be proven. The only action replays that
exact command: it does not reread raw form values or create another submission
ID. Store receipt identity resolves before current-head comparison, so the
original committed version remains provable after a later successor advances;
identical content under a different submission is not evidence. Positive
commit/duplicate proof may refresh, deterministic stale enters the preserve/
review/consent flow, every other result stays frozen, and a proven commit
followed by render failure offers refresh only. Chromium proves this state
machine offline in the production bundle, not native bridge loss, multi-scene
lifecycle, relaunch, or device accessibility.

Single-Trade Review Exact-Command Recovery v1 applies the same safety invariant
to the individual trade-review sheet without sharing editor state or changing
the review schema. The sheet owns one frozen PreparedTradeReviewBatch until
ordered member-receipt proof, enables only exact replay while status is
unknown, preserves the raw form and blocks obsolete saves on a fresh
`review_changed`, and offers refresh only after positive commit proof. Domain
errors observed after an earlier unknown attempt remain ambiguous unless the
current exact revision is positively proven. Chromium covers repeated
ambiguity, exact recovery, competing-head and submission-collision paths,
privacy/focus/reflow, and zero-persistence refresh. Atomic batch ambiguous
recovery remains separate; native bridge, multi-scene, relaunch, and device
accessibility remain unproven.

Individual Trade Review Stale-Head Recovery v1 completes the deterministic
`review_changed` interaction above without changing persistence. One fresh
local snapshot must contain exactly one coherent different newer review for the
same durable trade subject. Hermes displays escaped evidence for the complete
saved review and fresh metric/execution context while preserving every raw
static field and ordered dynamic rule row. Consent is explicit that the whole
local form—not a field merge—will become the successor, rotates submission
identity, and still requires a separate save. A completed winner allows only a
completed successor. If another head wins after consent, the old candidate is
cleared and the full evidence/consent cycle repeats. Chromium proves the
v1→v4 race offline; SQLite proves the exact chain and unchanged state across
both stale commands. This is not native multi-scene, lifecycle, or device
accessibility evidence. Atomic batch exact recovery remains a human-gated HIGH
because it needs a durable batch receipt plus migration/export/restore
decisions.

Batch Tag Known-Commit Refresh-Only Recovery v1 adds no persistence contract.
The UI prevalidates a modal recovery surface, owns focus and background
inertness across save and redraw, and treats the resolved state as one-way.
Direct `committed` output retains the atomic result wording; reconciled
`duplicate` output says only that exact member revisions are present because
there is no durable batch receipt. Redraw failure exposes refresh only, never a
second batch action. Chromium instruments the production store path to prove
zero repeat commit calls and exact two-member heads/submission receipts while
execution provenance remains byte-equivalent. Unknown batch-result recovery
still requires the separately approved receipt/schema design.

The fifth increment is Trade Browser Scope v1. It is a derived-only projection
over stable ledger account IDs and exact calendar contributions: all accounts
or one account, optional inclusive workspace-local allocation/activity dates,
and an optional selected-day intersection. Exact decimal contribution P&L,
trade, allocation, and day counts are reaggregated from calendar evidence;
multi-day and zero-P&L activity remain visible. The Dashboard calendar pages
only through months containing scoped activity, every trade card identifies
its account, and scoped allocation contribution is explicitly separate from
whole-trade realized-to-date P&L. Search changes visible cards but never scope
totals. State is session-only, survives internal navigation/refresh while
valid, and resets on local/demo switches or reload. It scopes Trades and the
Dashboard calendar only: headline metrics, equity, review progress, Direction
Mix, Opening Weekday Mix, Plan Check, Mistake Patterns, Emotion Patterns, and
Setup Breakdown remain whole-workspace. No schema, migration, journal store, archive, or
report-definition version changed.

The sixth increment is Structured Trades Facets v1. Four fixed exact facets—
asset class (Stock/ETF), direction, position state, and review state—AND with
the existing normalized text query over cards already admitted by the account,
date, and selected-day scope. Facets and search change visible cards only. They
never change exact contribution P&L, trade/allocation/day counts, calendar
evidence, Dashboard metrics, Direction Mix, Opening Weekday Mix, Plan Check,
Mistake Patterns, Emotion Patterns, or Setup Breakdown. Clear search and
filters resets the query
and facets while retaining scope; Clear all resets both layers.
The state is session-only, survives internal navigation and valid refresh, and
resets on a local/demo switch or reload. Fixed options deliberately avoid
inventing dynamic vocabulary semantics. No schema, migration, store, archive,
or governed report-definition version changed.

A seventh increment, Dynamic Review Facets v1, adds exact Mistake, Emotion, and
Tag selects to the same card-visibility layer. Their choices derive from current
`TradePreview` assignments across the whole workspace, independent of account,
date, selected-day, search, and fixed-facet scope; unused saved vocabulary is not
offered. Values reuse the saved-review contract: NFC normalization, trimmed and
collapsed whitespace, visible single-line text, 120-code-point limits before and
after the fixed `en-US` identity fold, no duplicate folded identities within
each trade's multivalued field, and at most 20 mistake or tag assignments per
trade. Choice arrays use stable code-unit order, detach from mutable inputs, and
are deeply frozen.

Mistake, Emotion, and Tag AND with the four fixed facets, normalized search, and
the existing account/date/day scope. A well-formed selected value that loses its
last current assignment stays visible as **not currently assigned** and returns
zero cards; refresh never silently broadens the view. Like the fixed facets,
these controls do not change exact scope evidence, contribution P&L, trade/
allocation/day totals, the calendar, Dashboard, or governed Reports. They remain
session-only, reset on mode switch or reload, and add no schema, migration,
store, archive, or governed report-definition change. Saved presets, persistent
or report scope, and vocabulary/playbook management remain separate work.

An eighth increment, Reports Navigator v1, reorganizes only the existing
Reports presentation. Its semantic menu follows DOM order—Performance Summary,
Journal Curve, Direction Mix, Opening Weekday Mix, Plan Check, Mistake
Patterns, Emotion Patterns, then Setup Breakdown—and every destination has a
stable focusable heading plus a return path. Dashboard's existing Plan Check
shortcut lands on that heading. In-page jumps measure the live top chrome,
scroll without animation, then focus without a second scroll; opened report
disclosures and DOM identity survive every jump. At widths through 480 CSS
pixels the top bar enters normal document flow, leaving the fixed primary tabs
as navigation and enough unobscured height for large controls at 200% text.
This state is transient and performs no journal-store operation. Headline
metrics, curve points, report builders, versions, checksums, cohorts,
exclusions, exact values, ordering, pagination, archive inputs, and state/report
digests are unchanged.

A ninth increment, Report Trade Continuation v1, completes the explainable
pattern-to-trade loop without adding a route or detail surface. Every Direction
Mix, Opening Weekday Mix, Plan Check, Mistake Patterns, Emotion Patterns, and
Setup Breakdown contributor emits **Open trade** only after its stable
trade-subject ID resolves to exactly one current trade. The existing review
sheet opens in place with an allowlisted
transient report source; its action and heading qualify duplicate symbols by
asset class, account, and session. One replaceable delegated listener covers
initially rendered and progressively appended contributors and report groups.
Rendering requires exactly one stable-ID
match and aborts an incoherent report; activation-time blank, unknown,
duplicate, or tampered identity/source data shows a focused error before inert
state or persistence. Close returns to the exact connected trigger; a save or
reconciliation refresh that rebuilds Reports focuses the originating Plan or
pattern heading because the contributor may have moved or left its cohort. The
full-workspace reports do not consume or change Trade Browser
account/date/day/search/facet state. No URL, selected-trade state, schema,
migration, store, archive, digest input, formula, definition, checksum, cohort
definition or eligibility rule, ordering, or pagination changes.

A tenth increment, Mistake Patterns v1, adds the governed count-and-evidence
projection described above between Plan Check and Setup Breakdown. Every exact
label group and contributor uses progressive presentation only; the builder
returns the complete immutable report. Contributors reuse stable-ID in-place
continuation with label-specific accessible names. Ordinary close returns to the
exact trigger; an explicit review save that moves, adds, or removes assignments
returns to the Mistake Patterns heading after the report rebuild. The source is
allowlisted transient DOM context and does not consume or change Trades scope,
search, facets, URLs, persistence, archives, or digests.

An eleventh increment, Compact Trades Filters v1, shortens the primary iPhone
Trades path without changing the seven-facet projection. Only the selects and
their validation error live inside a native `details` disclosure; the boundary
copy and combined clear action remain exposed so search retains its description
and a search-only view can still clear. The summary shows the exact number of
active facets. Zero-facet renders are collapsed; any fixed, dynamic, or retained
stale facet renders open. In-place facet changes update that count, selecting
the final facet back to its default collapses and returns focus to the summary,
and search never overrides a manual disclosure choice. Account/date/day scope
and query do not count. No disclosure value enters Trade Browser state,
preferences, stores, SQLite, URLs, exports/restores, archives, report inputs,
digests, or governed formulas/definitions.

A twelfth increment, Emotion Patterns v1, adds the governed count-and-evidence
projection described above between Mistake Patterns and Setup Breakdown. Each
included trade contributes exactly one saved emotion to one stable group; the
builder returns the complete immutable report while the view progressively
reveals five groups and 25 contributors per action. Contributors reuse stable-ID
in-place continuation with emotion-specific accessible names. Ordinary close
returns to the exact trigger; an explicit review save that moves or removes an
assignment returns to the Emotion Patterns heading after the report rebuild.
The allowlisted source is transient DOM context. The report consumes no Trade
Browser scope, search, facets, URL, persisted presentation state, archive, or
digest, and adds no financial or behavioral interpretation.

A thirteenth increment, Direction Mix v1, adds the governed count-and-evidence
projection described above between Journal Curve and Plan Check. Every current
trade contributes to exactly one fixed Long or Short group, so group counts
must conserve the full current projection without exclusions. The builder
returns the complete immutable report while the view progressively reveals 25
contributors per group action. Contributors reuse stable-ID in-place
continuation with direction-specific accessible names. Ordinary close returns
to the exact trigger; an explicit save returns to the Direction Mix heading
after Reports rebuilds, even though review changes cannot alter direction
membership. The allowlisted source is transient DOM context. The report
consumes no Trade Browser scope, authored review content, result fields, URL,
persisted presentation state, archive, or digest, and adds no financial
interpretation.

A fourteenth increment, Opening Weekday Mix v1, adds the governed count-and-
evidence projection described above between Direction Mix and Plan Check. Every
current trade contributes to exactly one fixed Monday-through-Sunday group from
its canonical workspace-local opening date, so counts conserve the full
projection without exclusions and zero-count groups remain visible. The
builder returns the complete immutable report while the view reveals at most
25 contributors per group action. Contributors reuse stable-ID continuation
with weekday-specific accessible names. Ordinary close returns to the exact
trigger; an explicit review save returns to the Opening Weekday Mix heading
after Reports rebuilds even though review changes cannot alter opening-date
membership. This transient allowlisted source consumes no Trade Browser scope,
review content or state, result fields, URL, persisted presentation state,
archive, or digest. Copy expressly avoids trade-count rewards and any weekday
ranking, comparison, outcome claim, prediction, target, or advice.

A recovery-continuity hardening milestone composes the fourth increment with
Slice C-B rather than adding another product increment. In the browser
development runtime, a UI-authored draft now has one executable journey through
export, offline empty-session restore, continued immutable writing, re-export,
and a second restore. The continued payload proves two versions, one head, and
two submissions; the replayed export reproduces the same state/report digests.
A deterministic delayed-file test also proves a superseded read cannot expose
or enable restore approval, and a successful commit focuses stable rendered
content. Native Files, adapter latency, lifecycle, and device accessibility
remain separate gates.

Still open in Slice D:

- Drawdown, streak, time-of-day, symbol, tag, and remaining report
  families with reconciled drill-down, plus saved scope
  presets, saved view presets, persistent/report scope, fuller account
  management, and fuller vocabulary/playbook management.
- Bounded screenshots, camera/photo flow, orphan cleanup, and export coverage.
- Share Sheet/Files import, local reminders, biometric lock, and a review widget
  where platform behavior supports it.
- Human-gated generic-CSV asset-class semantics and prioritized CSV packs for the
  brokers the beta cohort actually uses.

Exit: every report reconciles to golden fixtures and every native integration
passes privacy, accessibility, lifecycle, and failure-path tests.

### Slice E — iOS beta and paid release

- Final name, trademark/domain, bundle ID, icon, splash, support/privacy URLs,
  disclaimer, privacy manifest, SDK inventory, export-compliance decision, and
  App Store metadata.
- CocoaPods lock/workspace review, signed archive, Simulator and physical-device
  matrix, VoiceOver/Dynamic Type, interruption, migration, backup, reinstall,
  and offline relaunch evidence.
- Add the opt-in, content-free beta measurement subsystem before TestFlight: a
  numbered local schema migration; Settings consent/withdrawal; 90-day expiry;
  a versioned `hermes-beta-metrics-v1` receipt; MetricKit count reconciliation;
  user-initiated export; Delete All Data coverage; and unit, migration, privacy,
  and browser/native acceptance tests for every event and prohibited field.
- TestFlight cohort and release-candidate support runbook.

Exit: the release checklist has positive evidence and a human approves the
financial, privacy, comparative-marketing, and App Store submission gates. The
beta receipt can independently reproduce every instrumentation-derived
prelaunch KPI denominator without containing or joining to journal content;
MetricKit, reconciliation forms, and interview/WTP evidence remain named,
separate sources.

### Slice F — Connect discovery, not commitment

Only begin after Core beta evidence meets the gates below. Prototype hosted
backup and one read-only integration with explicit deletion/export and cost
telemetry. Do not begin Android, social/community, replay, or recurring AI in
the same discovery slice.

## Product gates and metrics

The north-star behavior is **weekly reviewed trading sessions**, not trades
executed or P&L. A trading session is one workspace-local calendar date with at
least one execution; it is reviewed when at least one versioned trade review is
saved for that date. An activated tester has completed onboarding, committed at
least one execution, and saved a first review.

Prelaunch TestFlight gates:

- At least 20 representative phone-first stock/ETF traders complete onboarding,
  one import/manual-entry session, and one saved review.
- At least 80% of tester-confirmed successful imports reconcile with broker
  execution count and cash P&L; denominator is testers who completed a CSV
  import and submitted the reconciliation prompt, excluding manual-only users.
- Median first-review latency (first foreground after install to first saved
  review) is under 3 minutes; median repeat-review latency (opening an
  unreviewed trade to saving its review) is under 60 seconds.
- At least 50% of activated testers save a review during days 22-28 after their
  activation date.
- Crash-free foreground sessions are at least 99.5% from MetricKit counts, with
  no confirmed ledger corruption or unexplained data loss.
- At least 30% of interviewed active testers say they would be very disappointed
  to lose the product, and stated willingness-to-pay/landing-page evidence
  supports testing the proposed one-time price.

TestFlight is free and cannot measure purchase conversion. After explicit owner
approval and a paid App Store launch, evaluate product-page-to-purchase
conversion, refunds, net proceeds, support hours, and annual fixed costs against
an owner-approved forecast before treating the price or maintenance model as
validated.

### Privacy-safe beta measurement contract

- Events are content-free and opt-in: install-random tester ID, event name,
  coarse UTC date, monotonic duration where needed, app/build version, and
  coarse success/failure code only.
  Never collect ticker, account/broker, quantity, price, balance, P&L, filename,
  screenshot, note, tag, playbook, or imported row content.
- Required local events are onboarding-completed, csv-import-committed,
  manual-execution-committed, reconciliation-form-submitted,
  trade-review-opened, trade-review-saved, app-foregrounded, and
  export/delete-requested. The form event carries only submitted plus coarse
  yes/no/mismatch outcome—never counts or financial content. MetricKit supplies
  aggregate crash/hang diagnostics; interview and willingness-to-pay evidence
  remains separately identified.
- The Core has no silent analytics transport. During beta, the user explicitly
  consents and exports a content-free metrics receipt or submits the tester form.
  Events remain on device for at most 90 days, are included in export/delete
  controls, and are not combined with journal content.
- Every reported rate names its cohort window, numerator, denominator, excluded
  users, app build, and missing-receipt count. Production telemetry or a hosted
  collector requires a separate privacy/security/product approval.

Connect discovery gates:

- Core week-8 reviewed-session retention is at least 35% among activated paid
  users.
- At least 30% of retained users request sync or cross-device backup and at
  least 15% accept the tested Connect price.
- Gross margin remains above 75% after provider, storage, support, App Store,
  tax, and refund costs.
- Written data-display/derived-data rights and a security/privacy threat model
  exist for the selected provider.

## Risk register

| Risk | Control |
|---|---|
| Proposed $9.99 price cannot fund maintenance | Treat it as an unapproved measured hypothesis; do not include recurring-cost features |
| “Direct competitor” becomes a parity trap | Compete on the mobile review loop and trust; keep explicit non-goals |
| WebView UI stops feeling native | Use native affordances and measure; platform rewrite requires a proven blocker |
| Startup failure strands or silently replaces the journal | Semantic pre-JavaScript status; fail-closed teardown; one full-document retry only after confirmed close; never fall back or reset |
| Import edge cases damage trust | Immutable provenance, preview, reconciliation, idempotency, rollback, broker fixtures |
| Financial/App Store classification | Accurate journaling/analytics positioning, no advice/execution, legal and human submission review |
| Sensitive financial data leaks | Local-first architecture, encryption, no financial telemetry, explicit export/deletion |
| Gamification encourages overtrading | Reward review/process only; prohibit profit/trade-frequency incentives |
| Legacy cockpit guidance corrupts mobile work | Repository-local mobile contract and quarantined legacy automation/docs |
| Name or bundle ID is unavailable | Keep provisional identity out of uploaded builds until clearance |

## Current evidence and immediate next step

The reviewed mobile history now contains the iOS foundation, execution-ledger,
manual-capture, and 60-second-review slices. The 2026-07-13 Linux Slice B gate
completed a locked install with zero reported vulnerabilities, TypeScript, the
  dedicated two-check mobile/native boundary gate, 248 Vitest tests across 24
files, 19 Playwright journeys, the production build, Capacitor iOS sync, and
tracked-native-drift and whitespace checks. Schema v3 is checksum-pinned and
replay-tested from v2. Exact fee-aware R and percent-return fixtures cover
positive, negative, zero, repeating, partial, short, missing, incompatible, and
unsupported cases. CocoaPods, Xcode, native SQLCipher/Keychain lifecycle, and
physical-device accessibility remain explicit Mac/device release holds.

The 2026-07-13 Slice C-A Linux gate passed a locked install, 271 Vitest tests
across 26 files, 21 Playwright journeys, the production build, Capacitor iOS
sync, dependency audit, native/lock drift check, and whitespace check.

Slice C-B pairs the export manifest with current-schema, matching-runtime,
empty-journal-only restore and idempotent exact-retry reconciliation. The
fourteen Slice D increments add Plan Check, governed Setup Breakdown,
allocation-day calendar evidence, Durable Daily Journal v1, Trade Browser Scope
v1, Structured Trades Facets v1, Dynamic Review Facets v1, Reports Navigator
v1, Report Trade Continuation v1, Mistake Patterns v1, Compact Trades Filters
v1, Emotion Patterns v1, Direction Mix v1, and Opening Weekday Mix v1. The twelve
presentation/projection increments other than
Daily Journal and Report Trade Continuation remain derived-only. Report Trade
Continuation reuses the existing versioned review save path without changing
its persistence contract; Daily Journal adds checksum-pinned schema v4 and
browser payload v2 while preserving the outer archive version. Final
integration
counts and publication state belong in the active `docs/HANDOFF.md`; this
blueprint does not duplicate unfinalized evidence. Recovery Continuity adds
browser composition and stale-selection evidence across existing C-B/Daily
Journal boundaries without changing their versioned contracts. Startup
Recovery v1 adds a semantic opening/failure path, application teardown before
full-document retry, privacy-safe rendered copy, and deterministic Chromium
accessibility evidence. Daily Journal Stale-Head Recovery v1 adds
preserve-review-consent-resubmit behavior at the existing optimistic head
boundary, and Exact-Command Recovery v1 closes the browser unknown-save gap
with receipt-first replay and refresh-only handling after proven commit. The
individual Trade Review sheet now has its own exact-command recovery boundary;
Individual Trade Review Stale-Head Recovery v1 now adds complete-form
comparison, consent, fresh identity, completed-state monotonicity, and repeated
race handling at the trade-review head boundary introduced in schema v3. It
now composes with Batch Tag Known-Commit Refresh-Only Recovery v1, which closes
only the resolved-save/redraw boundary. It does not include atomic batch
ambiguous recovery, whose durable receipt requires a separately approved
schema/migration. The
Linux CI handoff now verifies the ignored iOS
public copy byte-for-byte and validates selected generated-registration fields
while explicitly leaving all native rows NOT RUN. None of these reliability
milestones changes a schema, migration, formula, archive, or financial
definition. Native restore
acceptance on
a Mac/iPhone, v3→v4 retained-data migration and Daily Journal lifecycle/device
acceptance (including native exact-command recovery), verified Delete All Data,
the remaining reports, and later
attachment round-trip remain open—not broker connectivity, hosted sync, Android,
recurring AI, or legacy cockpit extraction.

## Competitive and platform references

- [TradeZella pricing and capability matrix](https://www.tradezella.com/pricing)
- [TradeZella getting-started workflow](https://help.tradezella.com/en/articles/13863136-getting-started-with-tradezella)
- [TradeZella filter workflow](https://help.tradezella.com/en/articles/12417670-using-filters-in-tradezella)
- [TradeZella feature requests](https://tradezella.canny.io/feature-requests?sort=top)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Capacitor documentation](https://capacitorjs.com/docs)
- [Supabase pricing](https://supabase.com/pricing)
- [SnapTrade pricing](https://snaptrade.com/pricing)
