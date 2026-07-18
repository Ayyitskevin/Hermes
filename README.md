# Hermes Journal

Hermes Journal is an iPhone-first trading journal for traders who want serious
review and analytics without another required subscription. The proposed
commercial model is a one-time paid Core, with **$9.99 as an unapproved launch
price hypothesis**, followed by Android parity after the iOS product is stable.
A separately priced hosted Connect service is only a future, evidence-gated
option; the local Core must remain complete without it. Pricing and every App
Store action require explicit owner approval.

The working promise is:

> A private trade journal that shows what is working—without a required
> subscription.

TradeZella is a capability benchmark, not a design template. Hermes Journal
uses an original interface, product identity, copy, and implementation. It is
not affiliated with, endorsed by, or sponsored by TradeZella.

## Product direction

The mobile product is a general-purpose journal, not the original single-trader
risk cockpit. Its primary workflow is:

```text
manual entry or broker CSV
  → normalized trades and executions
  → notes, tags, screenshots, and playbooks
  → dashboard, calendar, and performance reports
  → user-controlled export or empty-journal restore
```

The five destinations are **Dashboard, Trades, Journal, Reports, and More**.
Risk sizing remains an optional planning tool; regime signals, posture states,
and owner-specific trading rules do not define the mobile experience.

## Proposed commercial boundary

If approved, one paid app includes the complete local product—there is no Core
subscription or second lifetime-unlock purchase. The proposed Core scope is:

- Manual trade entry and generic broker CSV import.
- Accounts, executions, partial exits, fees, and currency-separated P&L.
- Searchable trades, calendar, daily/trade notes, tags, screenshots, and playbooks.
- Win rate, profit factor, drawdown, streak, setup, mistake, emotion, and tag
  reports.
- On-device storage plus versioned export, restore, and delete-all-data controls.
- Deterministic planning tools that do not require a hosted service.

Unlimited hosted sync, licensed market history, real-time broker infrastructure,
and recurring AI credits are not promised inside the flat price. Those require
user-supplied infrastructure or a separately approved business model.
Percent return and R-multiples use pinned v1 definitions with exact decimal
evidence. R remains unavailable until the user confirms a positive initial-risk
amount in the trade's P&L currency; the position-size tool never supplies it.

See [the product and technical blueprint](docs/mobile/PRODUCT_BLUEPRINT.md) for
the target audience, differentiation, stack decision, delivery slices, product
metrics, and the gates for any optional hosted service.
The source-backed
[TradeZella capability benchmark and Hermes parity roadmap](docs/mobile/tradezella-parity/report.html)
records the benefit translation, evidence limits, explicit dispositions, and
next local-first sequence.

## Current status

The repository contains an execution-first iOS vertical slice, not a
submission-ready product:

- Vite, TypeScript, Capacitor 8, and an iPhone-only CocoaPods iOS project.
- Original journal-first navigation with an empty private journal by default;
  the fictional demo is an explicit, isolated choice.
- A semantic pre-JavaScript opening surface and fail-closed Startup Recovery v1.
  If application creation or the first journal read fails, Hermes confirms
  factory cleanup or closes the constructed application before offering one
  guarded full-document retry. It never opens browser/demo storage as a native
  fallback, never renders raw plugin/database detail, and withholds retry when
  teardown cannot be confirmed.
- Versioned STRICT SQLite migrations for immutable import provenance, execution
  versions, current heads, FIFO projections, fees, receipts, rollbacks, and
  durable manual-submission reconciliation.
- Capacitor configuration that requires SQLCipher-backed storage, plus a native
  adapter that generates a random passphrase and hands it to the pinned SQLite
  plugin's secret API. Native SQLCipher/Keychain operation remains a Mac/iPhone
  gate.
- An on-device RFC 4180 CSV flow with inference/remapping, exact source text,
  row-level validation, stale-preview protection, atomic commit, deduplication,
  and receipt rollback.
- A two-step manual execution flow with exact decimal validation, IANA/offset
  timestamps, schema-backed submission reconciliation intended for the
  configured native store, immutable manual-source facts, and the same atomic
  deterministic projection path as CSV.
- Immutable v3 trade-review versions attached to durable trade subjects, with
  notes, setup/mistake/emotion tags, playbooks, rule outcomes, exact initial
  risk, optional planned stop, optimistic concurrency, and atomic batch tagging.
- Immutable v4 day-level journal versions keyed by workspace-local date. Users
  can explicitly save a draft or completed reflection on trading and no-trade
  days, edit only through an optimistic successor version, and optionally add a
  headline, note, emotion, tags, and a clearly self-reported process score that
  never enters performance, Review Session Coverage, Direction Mix, Opening
  Weekday Mix, Plan Check, Setup Breakdown, Mistake Patterns, Emotion Patterns,
  or Tag Patterns analytics.
- Daily Journal Stale-Head Recovery v1 keeps the unsaved form intact after a
  deterministic optimistic conflict, blocks the obsolete save, loads and shows
  the newer local head, and requires separate consent to use it as the base
  before another explicit save can append a successor. It never auto-merges or
  overwrites either version. This is a browser-tested retained-editor race in
  one application/store, not native multi-scene or lifecycle evidence.
- Daily Journal Exact-Command Recovery v1 keeps an ambiguous save frozen with
  its original prepared command and exposes only **Retry this exact save**.
  A matching receipt remains valid proof even after a newer head advances;
  deterministic stale recovery uses the flow above, repeated ambiguity stays
  locked, and a proven commit followed by render failure exposes refresh only.
  Production-browser evidence is not native bridge, relaunch, or device proof.
- Single-Trade Review Exact-Command Recovery v1 gives the individual review
  sheet the same no-reconstruction boundary while retaining its own frozen
  PreparedTradeReviewBatch. Unknown outcomes expose exact replay only; a
  matching member receipt recovers the original immutable version, a newer head
  enters the stale flow below, and a proven save with a failed render exposes
  refresh only.
- Individual Trade Review Stale-Head Recovery v1 preserves every raw static and
  ordered rule field, loads one fresh local snapshot, and displays its sole
  coherent newer review before consent. Consent explicitly uses the complete
  local form—not a field merge—as a successor, rotates submission identity, and
  still requires a separate save. A completed winner cannot regress to draft;
  another intervening head repeats the proof/consent gate. Production Chromium
  proves a v1→v4 retained-editor race offline, and SQLite tests prove the exact
  predecessor chain and absence of stale receipts. This is not native
  multi-scene/lifecycle evidence. Atomic batch exact-command recovery remains a
  separate HIGH, human-gated schema/migration slice because exact atomic proof
  requires a durable batch receipt.
- Batch Tag Known-Commit Refresh-Only Recovery v1 validates a recovery surface
  before saving, locks the queue controls behind one modal save/refresh state,
  and never re-enters persistence after a resolved result. A direct
  `committed` result may be described as one atomic batch; a reconciled
  `duplicate` result says only that the selected member revisions are already
  present because there is no durable batch receipt. If redraw fails, the sole
  action retries the journal refresh with private adapter detail withheld.
  Production Chromium proves zero repeat store calls, exact member
  head/submission cardinality, unchanged execution provenance, focus
  containment, and 320px/200% reflow. Unknown batch status before a resolved
  result remains the separate human-gated exact-command problem above.
- Review Queue Focus v1 is the nineteenth bounded Slice D increment and the
  sixteenth derived-only presentation/projection increment. It builds a
  detached, deeply frozen, fail-closed grouping projection from current closed
  trades whose current review state is unfinished, reconciles unique stable
  subject identities and waiting/draft/completed counts against
  `reviewProgress`, and preserves canonical snapshot order inside fixed
  nonempty **Drafts** then **Not started** groups. After a confirmed
  queue-origin single-review save or resolved batch-tag refresh, focus moves to
  the first surviving group heading, or to the stable queue title when no
  unfinished trade remains. The existing versioned review and atomic
  batch write paths are unchanged. No queue, focus, or group state enters the
  schema, store, browser journal, archive, digest, governed reports, or
  financial formulas. It remains derived-only; schema v4, five primary tabs,
  ten report targets, and eight governed reports are unchanged. Native
  VoiceOver, hardware-keyboard, Dynamic Type, lifecycle, and focus acceptance
  remain held for the Mac/iPhone gate.
- Calendar-Day Reflection Continuation v1 is the twentieth bounded Slice D
  increment and the fourth write-capable exception. Opening an exact activity
  day now shows that whole-workspace date's current reflection state and reuses
  the existing Durable Daily Journal editor without routing through Journal or
  choosing the generic newest-unoccupied date. Calendar-origin dates are
  canonical, non-future, read-only identities. A zero-head date offers creation
  for that exact date; malformed or detached actions and duplicate, missing, or
  ambiguous edit heads fail visibly before modal, randomness, inert state, or
  persistence.
  Demo and future dates remain informative and noninteractive. Save, exact
  replay, and committed-refresh recovery rebuild
  Trades before focusing the same day's reflection status while retaining
  account/date/day scope, query, and all eight exact facets. A daily reflection
  belongs to the whole workspace date and never marks its trading session
  reviewed. No schema, store command, report, formula, archive, digest,
  preference, dependency, or native source changed; the sixteen earlier
  derived-only increments, schema v4, five tabs, ten report targets, and eight
  governed reports remained unchanged in that slice.
- Daily Reflection Return Focus v1 is the twenty-first bounded Slice D
  increment and the seventeenth derived-only presentation increment. Every
  current Journal reflection card now owns its canonical date identity and a
  programmatically focusable heading. After a direct save, exact-command replay,
  or confirmed-commit refresh retry redraws Journal, focus returns to the unique
  rebuilt heading for the date captured by the prepared command, then to the
  stable **Daily notes** heading, then the screen. Post-refresh focus never
  rereads the mutable date field or reverts to its pre-open default; it uses the
  validated date already captured by the prepared command, not the rotating
  entry-version ID.
  Calendar-origin focus, ordinary cancel return, and unresolved recovery
  ownership remain unchanged. No persistence, schema, store command, archive,
  digest, report, formula, preference, dependency, or native source changed.
- Exact Scoped Activity-Day Stepper v1 is the twenty-second bounded Slice D
  increment and the eighteenth derived-only presentation/projection increment.
  A selected Trades day now exposes native previous/next controls over the
  validated, frozen account/date scoped-calendar cohort—not calendar arithmetic,
  the displayed month, search results, or exact card facets. Adjacency skips
  dates with no retained activity and crosses month boundaries; endpoints stay
  present and disabled with visible position/count context.
  Activation rebuilds from live session state, retains account/range, query, and
  all eight facets, changes only the selected day and its displayed month, then
  announces and focuses the unique rebuilt date-qualified heading. Missing,
  duplicate, detached, nonadjacent, or tampered DOM/state identity produces one
  fully visible focused generic error without changing selection or touching
  storage. No schema, store command, archive, digest, report, formula,
  preference, dependency, or native source changed; the same four write-capable
  exceptions remain.
- Dashboard Review Return Focus v1 is the twenty-third bounded Slice D
  increment and the nineteenth derived-only presentation/projection increment.
  The Weekly Review Rhythm card now derives its exact next subject and
  waiting/clear state from the fail-closed Review Queue projection: **Drafts**
  first, then **Not started**, in canonical snapshot order. One exact Dashboard
  card, focusable heading, origin action, and stable trade subject must agree
  before sheet markup, random identity, inert state, or persistence.
  Ordinary dismissal returns to the connected CTA. Confirmed direct save,
  exact-command replay, and known-commit refresh retry redraw Dashboard,
  announce the result, and focus the unique rebuilt rhythm heading. A missing
  or duplicate rebuilt heading falls to the screen without another write;
  unresolved recovery keeps modal ownership. Dashboard recent-trade, Reports,
  Trades, and Journal queue focus behavior is unchanged. No schema, store
  command, archive, digest, report, formula, route, preference, dependency, or
  native source changed; the same four write-capable exceptions remain.
- Manual Entry Validation Focus v1 is the twenty-fourth bounded Slice D
  increment and the twentieth derived-only presentation/focus increment. When
  **Review execution** synchronously fails the existing preparation validation,
  Hermes keeps the form and modal ownership, preserves every authored value,
  leaves review/save unavailable, and moves visible focus to the unchanged
  field-specific inline alert centered inside the scrolling sheet. The one
  submission ID is still created when the sheet opens; this failure creates or
  rotates no additional identity and performs no commit, store, or network
  work. Corrected review and exact-trigger dismissal retain their existing
  paths. Production Chromium covers the focus, geometry, value, storage,
  request, correction, and dismissal contract at 320/421 CSS pixels with 200%
  text; native VoiceOver, keyboard, safe-area, and Dynamic Type acceptance
  remains held. No schema, store command, archive, digest, report, formula,
  route, preference, dependency, or native source changed; the same four
  write-capable exceptions remain.
- CSV Preview Feedback Focus v1 is the twenty-fifth bounded Slice D increment
  and the twenty-first derived-only presentation/focus increment. Every
  explicit **Preview CSV** outcome now owns visible feedback focus: missing,
  oversized, unreadable, or synchronously rejected files focus the existing
  status while clearing stale preview/commit state; ready and invalid previews
  focus their exact title. Authored account, time zone, currency, and selected
  file remain intact, and a generation/file-identity guard prevents late reads
  from replacing current input, content, or focus. Ordinary input/file changes
  do not steal focus, while mapping rerenders retain their changed-selector and
  final-commit targets. Production Chromium covers early failure at 320 CSS
  pixels with 200% text; ready/invalid preview, mapping completion, and visible
  focus at 320/421/568 pixels with 200% text; delayed-read cancellation at the
  390x844 default scale; and retained inputs, stale-preview removal, no overflow,
  local-storage/request/import-history neutrality, plus unchanged correction to
  the existing commit path.
  Native VoiceOver, hardware-keyboard, safe-area, lifecycle, and Dynamic Type
  acceptance remain held. No schema, store command, archive, digest, report,
  formula, route, preference, dependency, or native source changed; the same
  four write-capable exceptions remain.
- Import Receipt Reconciliation v1 is the twenty-sixth bounded Slice D
  increment and the twenty-second derived-only presentation/projection
  increment. The latest receipt and every import-history row now distinguish
  source, accepted, rejected, skipped, new-or-restored, already-present, and
  warning counts from the immutable receipt. Fail-closed conservation rejects
  incoherent preview data, successful rollback returns focus to the exact
  rebuilt receipt, and fictional demo receipts expose no rollback action.
  Production Chromium proves the overlap/duplicate case, keyboard disclosure,
  rollback focus, 320px/200% reflow, and storage/network neutrality. No schema,
  store command, receipt fact, financial formula, archive, report, preference,
  dependency, or native source changed.
- Daily Reflection Rhythm v1 is the twenty-seventh bounded Slice D increment
  and the twenty-third derived-only presentation/projection increment. It
  classifies every canonical trading-session date from current day-review heads
  as completed, draft, or missing, shows the latest seven in chronological
  order, and computes only the maximal completed suffix ending at the latest
  session. No-trade reflections remain separate. The projection ignores P&L,
  trade counts/outcomes, trade-review state, note content, tags, emotion, and
  process score; it creates no reward for trading frequency or profit.
  Production Chromium proves demo and local edit continuation, 320/421px at
  200% text, read-only demo behavior, and storage/network neutrality. No schema,
  store command, archive, digest, report, formula, preference, dependency, or
  native source changed; the same four write-capable exceptions remain.
- Guided Account Overview v1 is the twenty-eighth bounded Slice D increment
  and the twenty-fourth derived-only presentation/projection increment.
  Established and fictional-demo Dashboards list every retained account in the
  snapshot's existing stable order, including zero-trade accounts, using only
  its label and exact current derived-trade count. Each action resolves the
  stable ledger account ID and rebuilds the existing Trade Browser from its
  empty state plus that ID, so dates, selected day, search, and card facets
  cannot remain as contradictory hidden filters. Success focuses and announces
  the exact all-activity scope; stale, detached, or tampered identity fails
  visibly without changing route or scope. The module adds no account mutation,
  balance, account-level financial metric, activation preference, write
  command, schema, archive, formula, dependency, native source, or network
  path. Separate five-participant manual and generic-CSV first-use cohorts
  remain NOT RUN and are not replaced by automated acceptance.
- Manual Capture Review Continuation v1 is the twenty-ninth bounded Slice D
  increment and the twenty-fifth derived-only presentation/projection
  increment. After the existing manual command is confirmed or reconciled,
  Hermes narrows the visible commit reference to its outcome and immutable
  execution ID; pending recovery temporarily retains the existing submission
  acknowledgement token only until the exact destination is visible. It
  reloads the current local projection and resolves that exact execution to one
  current trade—or both exact subjects bearing an AUTO reversal's immutable
  allocation fragments—inside one stable account.
  It opens the existing all-activity account scope from an empty Trade Browser
  state, clears dates, day, search, and all eight card facets, focuses a
  dedicated review guide, and exposes state-qualified exact-subject actions
  without auto-opening a review. The guide survives a guide-origin review save,
  clears on a new capture or scope/filter/mode reset, and persists no activation
  progress. An unacknowledged known save remains recoverable across restart; an
  ordinary acknowledged guide does not.
  Missing, ambiguous, excessive, cross-account, stale, detached, or tampered
  identity fails closed. A known save followed by reload, reconciliation, or
  destination failure offers only **Retry review continuation** and never
  resubmits the execution. Production Chromium proves the single-target and
  two-target reversal paths, draft continuation, filter reset, focus,
  dismissal, tamper rejection, an injected destination-render failure after a
  known commit with continuation-only retry and no second commit,
  no local-preference/network write, and 320px/200% reflow. The generic-CSV
  receipt-to-review branch and separate
  moderated manual/CSV cohorts remain NOT RUN. No schema, store command,
  archive, digest, export/restore shape, governed report, financial formula,
  preference, dependency, native source, or network path changed; the same
  four write-capable exceptions remain.
- A mobile trade-detail review sheet with execution inspection, exact R/return
  evidence, pending/draft/completed queues, and versioned-review session streaks.
- A versioned, deterministic plaintext journal export that captures all
  app-owned SQLite facts and history in one transaction, rejects
  ambiguous/corrupt envelopes, and offers a browser-tested,
  accessibility-designed two-step delivery path: file-capable Web Share when
  supported, otherwise a browser download. The browser export is a labeled
  in-memory development artifact, not a native backup.
- A local-only, previewed Slice C-B restore implementation for current
  `hermes-journal-export` v1 files. The native adapter, covered by Linux
  repository/codec tests, accepts only `sqlite-table-set` v1; the browser
  development runtime accepts only `browser-session-state` v2 and is not native
  recovery evidence. Restore revalidates the selected archive, never merges or
  overwrites an existing journal, and treats an exact
  already-restored state as an idempotent retry. The UI rejects files larger
  than 64 MiB before reading them; the parser independently enforces the same
  67,108,864-byte UTF-8 limit.
- Browser Recovery Continuity v1 composes the real Daily Journal and recovery
  surfaces: a draft can be exported, restored into a fresh empty session,
  continued through its restored immutable head, re-exported, and restored
  again with exact version/head/submission evidence. A delayed superseded file
  read cannot reveal or enable stale approval, and successful restore moves
  focus to stable rendered content. This Chromium evidence is not a native
  Files or lifecycle claim.
- Exact decimal-string normalization for partial fills, long/short reversals,
  fee allocation, and currency-separated P&L without implicit FX.
- A clearly labeled, fully offline demo journal with eight fictional trades
  split across two fictional accounts.
- Headline currency P&L, win rate, profit factor, versioned percent return, and
  risk-backed R derived from real ledger records; unavailable denominators fail
  visibly instead of producing an invented metric.
- Review Session Coverage v1 is a checksum-pinned, count-only explanation of
  the existing review streak. Every workspace-local date with at least one
  durable trade contribution appears exactly once in fixed current-streak,
  reviewed-before-streak, or unreviewed groups. A saved draft or completed
  trade-review head can cover a session; one reviewed contributor does not
  imply every trade that day is reviewed. Session counts and date/trade
  assignments reconcile separately, rows open exact stable-ID trades 25 at a
  time, and the report contains no P&L, rate, ranking, trading target,
  prediction, or advice.
- An offline plan-adherence report derived from current completed review heads.
  It reconciles followed/broken cohorts with explicit exclusions, exact cash
  and R coverage, account/currency/time-zone context, and deterministic evidence
  drill-down; the observational comparison appears only at three trades per
  cohort and never claims causation or gives trade advice.
- A checksum-pinned offline Setup Breakdown over completed reviewed closed
  trades. It reconciles exact setup cohorts and exclusions, shows cash
  expectancy/net/wins plus strict replay-compatible R coverage, uses stable
  setup-name code-unit order rather than performance rank, and progressively
  renders pages of five setup groups and 25 contributors per group without
  claiming causation, prediction, or advice.
- Mistake Patterns v1 is a checksum-pinned, count-only projection over exact
  mistake labels on current completed review heads. Open and closed trades are
  equally eligible; pending/draft reviews and completed reviews without an
  assignment reconcile separately. Unique included trades stay distinct from
  total label assignments when one trade has several mistakes. Groups use
  stable label code-unit order, pages are bounded to five groups and 25
  contributors, and every row opens the exact stable-ID trade without showing
  P&L, win rate, R, expectancy, rank, causation, or advice.
- Emotion Patterns v1 is a checksum-pinned, count-only projection over the one
  exact optional emotion on each current completed review head. Open and closed
  trades are equally eligible; pending/draft reviews and completed reviews
  without an emotion reconcile separately. Every included trade contributes to
  exactly one stable code-unit-ordered group. Pages are bounded to five groups
  and 25 contributors, every row opens the exact stable-ID trade, and the report
  shows no P&L, rate, intensity, rank, causation, prediction, or advice.
- Tag Patterns v1 is a checksum-pinned, count-only projection over exact tags
  on current completed trade-review heads. Pending/draft reviews and completed
  reviews without a tag reconcile separately; open/closed state and results do
  not affect eligibility. Unique included trades remain distinct from total
  assignments when one trade has several tags. Groups use stable tag-name
  code-unit order. The view reveals at most five groups and 25 contributors per
  action in traded-date/subject-ID order, with exact stable-ID continuation and
  no P&L, rate, ranking, causation, prediction, reward, or advice.
- Direction Mix v1 is a checksum-pinned, count-only projection over every
  current trade. It has no exclusions: each stable-ID trade appears exactly
  once in fixed Long-then-Short groups, with evidence ordered by trade date
  descending then subject ID. Position and review status are evidence only and
  never change inclusion or grouping; authored review content, results, and
  Trades filters are not consumed. Evidence is revealed 25 contributors at a
  time, every row opens the exact stable-ID trade, and the report shows no P&L,
  rate, rank, causal, predictive, or advisory output.
- Opening Weekday Mix v1 is a checksum-pinned, count-only projection over every
  current trade's canonical workspace-local opening date. It has no exclusions:
  each stable-ID trade appears exactly once in fixed Monday-through-Sunday
  groups, including zero-count groups, with evidence ordered by opening date
  descending then subject ID. Later allocations, exits, reviews, results,
  currency, and Trades filters do not change grouping. Evidence is revealed 25
  contributors at a time, every row opens the exact stable-ID trade, and the
  report exposes no P&L, currency, win rate, R, expectancy, percentage, rate,
  ranking, comparison, outcome claim, target, reward, prediction, or advice.
- Reports Navigator v1 puts the existing Performance Summary, Journal Curve,
  Review Session Coverage, Direction Mix, Opening Weekday Mix, Plan Check,
  Mistake Patterns, Emotion Patterns, Tag Patterns, and Setup Breakdown in one
  semantic, DOM-ordered report menu.
  Dashboard opens Review Session Coverage or Plan Check directly; every section
  returns to the menu; jumps preserve open evidence disclosures and move visible
  focus below live chrome.
  At iPhone widths the redundant top bar scrolls with content so 200% text and
  large report summaries can remain fully visible above the fixed primary tabs.
  This is transient presentation over the unchanged full-workspace snapshot:
  it performs no store write and changes no metric, curve input, report
  checksum, cohort, evidence order, archive, or digest.
- Report Trade Continuation v1 adds an **Open trade** action to every Review
  Session Coverage, Direction Mix, Opening Weekday Mix, Plan Check, Mistake
  Patterns, Emotion Patterns, Tag Patterns, or Setup Breakdown contributor. It
  resolves exactly one trade by stable subject ID and reuses the review/detail
  sheet in place, so
  duplicate symbols are qualified by asset class, account, and session without
  routing through or clearing Trades. Delegated activation covers contributors
  and progressively appended report rows/groups. Ordinary close returns to the
  exact row; a save or refresh that rebuilds evidence returns to the originating
  report heading. The report source is transient DOM context. No report-origin
  or selected-trade state is persisted; Trades state and the report,
  review-persistence, checksum, and archive contracts remain unchanged.
- Dashboard Recent Trade Continuation v1 turns the unchanged four newest
  projected Recent trades rows into semantic **Open trade** actions. Each row
  exposes asset class, account, and full session context, while activation
  resolves exactly one stable trade-subject ID and reuses the existing
  review/detail sheet without routing through Trades or adding report-source
  context. The fictional demo remains read-only; ordinary close returns to the
  exact trigger; an explicit local save uses the existing review command,
  redraws Dashboard, announces the result, and focuses the stable screen.
  Tampered identity fails visibly before inert state or persistence. No route,
  Trade Browser scope, report definition, schema, archive, digest, financial
  formula, or persistence contract changed.
- Trade Browser Scope v1 uses stable account IDs plus optional inclusive
  workspace-local allocation/activity dates to derive exact scoped P&L, trade,
  allocation, and activity-day evidence. Dashboard month navigation visits
  months with scoped activity; selecting a day refines the retained
  account/range, and clearing the day restores it. Every card shows its account
  and keeps whole-trade realized-to-date P&L separate from scoped allocation
  contribution. Search changes card visibility only. Scope is session-only and
  affects Trades plus the Dashboard calendar; headline metrics, equity, review
  progress, Review Session Coverage, Direction Mix, Opening Weekday Mix, Plan
  Check, Mistake Patterns, Emotion Patterns, Tag Patterns, and Setup Breakdown
  remain whole-workspace.
- Structured Trades Facets v1 ANDs the existing normalized search with four
  fixed, exact card filters: asset class (Stock/ETF), direction, position state,
  and review state. These session-only controls change visible Trades cards
  only; they retain account/date/day scope and never change exact scope totals,
  the calendar, Dashboard, or governed Reports. Clear search and filters
  preserves scope, Clear all resets both layers, and mode switches or reload
  reset the ephemeral state.
- Dynamic Review Facets v1 adds exact Mistake, Emotion, and Tag selects derived
  from current `TradePreview` assignments across the whole workspace. Choices
  use the saved-review normalization and limit contract, are stable code-unit
  ordered, detached, and deeply frozen, and never come from unused vocabulary.
  The three selects AND with the four fixed facets, normalized search, and the
  existing account/date/day scope while changing visible cards only. If a valid
  selected value loses its final current assignment, it remains visibly selected
  as not currently assigned and produces zero cards instead of broadening the
  view. Refresh retains valid session state; mode switches and reload reset it.
- Compact Trades Filters v1 keeps the exact facet contract while placing
  only the selects and their error region in a native disclosure. A clean view
  starts collapsed with an exact active-filter count; any fixed, dynamic, or
  retained stale facet opens on render, while search and account/date/day scope
  never count. The combined clear action remains reachable for a search-only
  view, and clearing or resetting the final exact facet returns focus to the
  summary. Disclosure state is presentation-only—no preference, journal,
  archive, report, formula, or schema state was added.
- Exact Setup Facet v1 extends that disclosure from seven to eight controls with
  a classified-only Setup select derived from exact current `TradePreview`
  assignments. The projection never treats the canonical absent
  **Unclassified** placeholder as an assignment; an explicitly saved setup
  named **Unclassified** remains a real exact choice. A retained setup whose
  last assignment is removed stays visible as not currently assigned and yields
  zero cards. The control composes with every existing facet, query, and scope,
  remains session-only, and changes no scope totals, calendar, Dashboard,
  report, store, archive, digest, schema, or financial definition.
- Working trade search and fixed-fractional position sizing.
- Safe-area, keyboard/focus, reduced-motion, Dynamic Type, and 44-point control coverage.
- CI for locked dependencies, types, unit tests, browser flows, production
  build, byte-identical Linux-to-iOS-shell public-copy evidence, generated-config
  contract validation, and the legacy Python safety suite. Its Actions summary
  keeps CocoaPods, Xcode, Simulator,
  iPhone, SQLCipher/Keychain lifecycle, VoiceOver, and Dynamic Type at
  NOT RUN until a recorded Mac/device handoff proves them.

Linux tests exercise the real schema/repository through SQL.js. The
verify:ios-sync command independently hashes every production bundle file,
matches it against the ignored Capacitor public directory, validates the
generated local-only identity/SQLite registration, and proves tracked
native/lockfile cleanliness. That is bundle-handoff evidence, not a CocoaPods
resolution, native compile, or plugin-runtime result. Native
encryption, Keychain recovery behavior, CocoaPods resolution, kill/relaunch,
device backup behavior, native export/restore Files handoff, force-quit/
response-loss recovery, low-storage, and near-limit memory behavior still
require the Mac/device gate. Slice C-B restores a current-schema archive on its
matching runtime, but that file is not a complete native backup: attachment
catalog v1 is empty, archives containing attachments are rejected, and native
lifecycle behavior remains unverified. The current build deliberately rejects
older browser payloads and pre-v4 native table sets; a pre-release legacy file
must first be restored by its exact old runtime, then opened/migrated and
exported again with the current build. Attachments, Delete All Data, saved scope
presets, persistent/report scoping, full account and vocabulary/playbook
management, human-gated generic-CSV asset-class semantics, and the remaining
report families remain Phase 1 work. Native v3→v4 migration, Daily Journal
relaunch/Files export/restore/continued writes, VoiceOver, and small-screen
behavior still require Mac/iPhone evidence.
Saved Views also remain held because private filter labels currently have no
approved protected preference adapter; plaintext WebView `localStorage` is not
an acceptable persistence downgrade. Shipping them requires an explicitly
approved encrypted preference design, migration/lifecycle ownership, and
archive/export-exclusion rules.
See [the iOS roadmap](docs/mobile/IOS_ROADMAP.md) for the release sequence and
[the Mac handoff](docs/mobile/MAC_HANDOFF.md) for Xcode/device gates.

## Run the mobile foundation

Node 22.12 or newer is required.

```bash
cd mobile
npm ci
npm run typecheck
npm run test:boundary
npm test
npm run test:ios-sync
npm run test:e2e
npm run ios:copy
npm run verify:ios-sync
```

The TypeScript bundle and native container can be generated on Linux. Xcode,
Simulator, physical-device, signing, TestFlight, and App Store verification
require macOS. The first Mac setup must run `pod install` in `mobile/ios/App`
through the later `ios:sync` native-update phase and commit the resulting
lockfile, workspace, and reviewed project changes.
verify:ios-sync must print PASS only for the bundle, byte-identical copy,
selected generated-config registration contract, and tracked-drift rows; every
Mac/device row remains NOT RUN on Linux.

## Architecture

```text
Capacitor iOS shell
  mobile task-oriented UI
    typed application services
      pure TypeScript journal and analytics core
        native repository configured to require SQLCipher
        local CSV import/provenance adapters
        plugin secret API with configured iOS Keychain prefix
```

The production Capacitor configuration has no remote `server.url`, and the
content security policy sets `connect-src 'none'` and restricts bundled WebView
subresources to local `self`/`data` sources. Hermes production app code makes no
network requests, but the pinned SQLite plugin still exposes an unused native
HTTP-download bridge method that the WebView CSP does not govern. Audit or
remove that dependency surface before claiming the native binary has no network
capability. Browser development uses an explicitly labeled in-memory session
store; native iOS is configured to require encrypted SQLite, with runtime proof
still held for the Mac/iPhone gate.
See [the local ledger contract](docs/mobile/LOCAL_LEDGER.md).

## Legacy desktop prototype

The existing Python/FastAPI dashboard, strategy documentation, and personal
regime workflow are legacy source material. They are not bundled into the mobile
app and no longer define the product. They remain temporarily so generic math,
tests, and migration-safe patterns can be extracted with parity evidence before
the legacy surface is archived or removed.

Do not extend the legacy journal schema for mobile records. The mobile product
gets a new execution-first schema. See
[the legacy boundary](docs/legacy/DESKTOP_STATUS.md).

The legacy verification lane remains available while extraction is in progress:

```bash
.venv/bin/ruff check src tests
.venv/bin/pytest
```

## Product safety

Hermes Journal provides journaling, analytics, and user-directed deterministic
calculators. It does not provide investment advice, connect to brokerage write
APIs, place or modify orders, or promise trading outcomes. Imported values and
calculations must remain inspectable and exportable, and users remain
responsible for verifying their records.

## License

MIT — see [LICENSE](LICENSE). Vendored Archivo and B612 Mono fonts use the SIL
Open Font License; their license texts are in `web/fonts/`.

## Disclaimer

Hermes Journal does not provide investment advice. Markets involve risk of loss.
Calculations are estimates and should be checked against source records before
they inform a decision.
