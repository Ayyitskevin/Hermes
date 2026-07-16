# Hermes Journal local ledger contract

Status: implemented execution + versioned trade/day review + governed derived reports + trade-browser scope/facets + local restore · 2026-07-16

This document describes the source-of-truth boundary for the iOS journal. The
legacy desktop journal schema is not part of this contract.

## Invariants

1. Imported and manually entered executions are facts. `executions`,
   `execution_versions`, sources,
   source rows, issues, receipts, and rollbacks are append-only.
2. Corrections and rollbacks add a version and move `execution_heads`; they do
   not rewrite or delete history.
3. Trades are deterministic projections of the active, non-void execution
   heads. They are never accepted as a second source of truth.
4. Quantities, prices, multipliers, notionals, and P&L cross TypeScript and
   SQLite as canonical decimal strings. JavaScript `number` is used only for
   bounded display formatting after the exact calculation is complete.
5. Fee components use signed integer minor units so costs and rebates reconcile
   exactly. The associated currency row defines the exponent.
6. P&L remains separated by currency. The current workspace/import UI enforces
   one currency and refuses to imply an FX conversion.
7. Every import is previewed again immediately before persistence. A stale or
   forged preview cannot be committed by changing only its digest.
8. Batch facts, active heads, a complete derived generation, and the receipt
   commit in one SQLite transaction. Any validation, conflict, normalization,
   projection, or receipt failure rolls the entire batch back.
9. A manual execution uses the same immutable execution/version/head and
   projection path without manufacturing an import batch or receipt. Its
   cryptographic submission ID plus v2 command record, intended to reside in
   the configured encrypted native store, makes retries and lost native
   responses idempotent while retaining two independently entered fills that
   happen to have identical values.
10. A review is an immutable version attached to a durable trade subject. Only
    its optimistic current head advances; a review never mutates an execution,
    projection generation, source row, or import receipt.
11. Result-R v1 is exact net realized P&L divided by user-confirmed positive
    initial risk in the same currency. Percent-return v1 for stock/ETF is exact
    net realized P&L divided by full absolute entry notional, multiplied by 100.
    Both definitions, 12-digit precision, and half-away-from-zero rounding are
    persisted; missing or incompatible evidence returns an explicit null reason.
12. Restore is payload- and runtime-specific, empty-journal-only, and
    fail-closed. It never merges or overwrites different state; an exact
    already-restored state is an idempotent response-loss retry.
13. A daily reflection has exactly one current head per workspace-local
    Gregorian date. Every explicit draft/completed save appends an immutable
    version with a content-bound revision and optimistic predecessor; the date
    never changes. A reflection requires at least one authored signal. Its
    optional process score is self-reported and excluded from governed reports.

## Import sequence

```text
local File input
  → bounded RFC 4180 parser
  → inferred or explicit column mapping
  → canonical decimals + side aliases + IANA/offset timestamp validation
  → row preview and issues
  → revision digest over input, options, mapping, rows, and issues
  → immediate re-preview
  → BEGIN transaction
      source batch + exact source rows + issues
      identity/payload conflict checks
      immutable execution/version/source facts + active heads
      one immutable import occurrence for every accepted execution row
      FIFO normalization
      generation-scoped trades/allocations/lot matches/money totals
      active-generation pointer + immutable receipt
    COMMIT
```

When a CSV supplies an execution/fill ID, the generic adapter scopes that stable
identity to the account and treats symbol, price, quantity, and the other fill
values as payload. Reusing the ID with changed payload rejects the whole batch.
Without an ID, Hermes fingerprints the intrinsic fill values and adds an
occurrence ordinal so two legitimate identical fills are retained. The full
input, account, parser, and mapping digest makes an active exact import
idempotent. A no-ID export cannot prove that a changed row is a correction;
broker-specific adapters should supply documented stable execution identities.

Blank source records are preserved and counted as skipped. Invalid rows block
the commit; Hermes does not silently import only the convenient subset of a
financial file. Capability validation also rejects pre-1970 timestamps,
sub-microsecond values, unsupported currencies, and fee precision/ranges that
the SQLite schema cannot persist, so “Ready to import” matches commit capability.

## Manual execution sequence

```text
one-thumb form
  → exact decimal, account, symbol, asset-class, side/effect validation
  → IANA local time or explicit UTC-offset validation
  → review digest over every canonical field + random submission ID
  → immediate revalidation at the store boundary
  → BEGIN transaction
      workspace + account + instrument identity checks
      pending native-store command + reviewed revision
      replay/payload conflict check
      immutable execution + version + manual source + active head
      FIFO normalization
      complete immutable projection generation + active pointer
      command state → committed, still unacknowledged
    COMMIT
  → reload the execution into the visible ledger
  → mark the command acknowledged
```

Manual facts do not create rows in `import_batches`,
`import_source_rows`, `import_execution_occurrences`, or
`import_receipts`. CSV receipt rollback therefore cannot claim or void a
manual execution. The current slice creates facts only; corrections and voiding
must use later append-only execution versions rather than editing this source
record in place. The native path is designed so that, if its transaction commits
but the WebView is killed or the bridge response is lost, the unacknowledged v2
row survives in the configured encrypted database. Startup reconciles its
execution ID against the active ledger and acknowledges it only after the saved
result has been read; retrying the original submission returns the existing
execution without rebuilding. That native persistence behavior remains
unobserved until the Mac/iPhone gate runs.

## Trade-review sequence

```text
active deterministic trade projection
  → durable subject keyed by immutable opening allocation
  → note/setup/mistake/emotion/tag/playbook/rule/risk validation
  → exact normalized command + random submission ID + revision digest
  → optimistic expected-current-review check
  → BEGIN transaction
      reuse or create normalized terms, playbook, and rules
      append one immutable review version per selected subject
      snapshot assignments, rule outcomes, risk/stop, and metric versions
      advance every selected review head by exactly one link
    COMMIT all reviews or none
  → rebuild the visible snapshot from execution facts + current review heads
```

Exact same-submission retries are idempotent when every member is already saved;
mixed old/new retry batches reject atomically. A changed payload, stale head,
missing active subject, or risk-currency mismatch also rejects the transaction.
Vocabulary identity is case-insensitive in revision digests while the first
canonical display spelling remains stable. Batch tagging prepares a full
successor version for each selected trade so prior notes, completion state,
playbook rules, and risk facts cannot be dropped silently. Completed reviews
cannot be downgraded from the edit sheet. A review session is one workspace-local
date with an execution; it is credited when at least one trade with an allocation
that date has a saved draft or completed review.

Single-Trade Review Exact-Command Recovery v1 closes the individual sheet's
unknown-outcome gap without changing storage. The sheet retains its frozen
single-member PreparedTradeReviewBatch before the first commit, including the
batch integrity identity, member submission ID, expected predecessor,
normalized review, member revision, and batch revision. Unknown status locks
every authored and close control; **Retry this exact save** is the only enabled
action and neither rereads the form nor creates an identity.

Durable proof remains the ordered set of exact member submission/revision
receipts—there is no persisted batch receipt. Both stores resolve an existing
member receipt before current-review-head comparison, although session
projection work and SQLite clock/workspace checks can fail earlier. Therefore a
domain error after an earlier unknown response in the same safe-call sequence
is not treated as proof; only a current exact revision fallback may reconcile
it. A later user retry starts a fresh exact call: an exact receipt can return
the original historical version while a newer head stays projected. A
first-result `review_changed` enters Individual Trade Review Stale-Head
Recovery v1. Other direct first-result receipt conflicts use the same
fail-closed refresh-before-reopen path. Non-head conflicts after ambiguity stay
frozen. Positive commit/duplicate proof clears the command; a render failure
then exposes **Retry journal refresh** with zero persistence.

The individual stale flow keeps every raw form value and ordered dynamic rule
row, disables the obsolete command, and retains the dismissal lock until one
fresh local snapshot proves exactly one different newer coherent head for the
same trade subject. Its escaped evidence covers every review-owned field plus
fresh metric/execution context. Consent copies only that displayed head's
review ID/version, rotates the member submission ID, and enables a separate
save against it. The complete local form becomes the successor; fields are not
merged, so the UI says that a newer saved value absent locally will be
replaced. A completed base exposes only a completed successor. A second race
clears old evidence and repeats proof/consent. No schema or store algorithm
changed. Atomic batch exact-command recovery remains HIGH and human-gated:
member receipts cannot prove exact batch identity, so truthful atomic recovery
requires a durable batch receipt with migration/export/restore decisions.

Batch Tag Known-Commit Refresh-Only Recovery v1 narrows only the UI boundary
after `addTagToTrades` resolves. Hermes validates and mounts a modal recovery
surface before persistence, locks the tag, selected subjects, submit, and
background interactions, and never calls persistence from that UI state again.
A direct `committed` result is an atomic store result. A `duplicate` result
means the exact member revisions reconciled, but copy explicitly withholds an
atomic-batch claim because no durable batch receipt exists. A failed redraw
therefore offers only **Retry journal refresh**; repeated activation performs
no preparation, ID generation, or store commit. Deterministic pre-commit
failure removes the modal and restores the original controls. This changes no
schema, review digest, store algorithm, archive, or governed metric, and it
does not close unknown batch-result recovery.

## Daily-journal sequence

```text
established local workspace + workspace-local calendar date
  → optional headline/note/emotion/process score/tags
  → normalize bounded Unicode content + require one authored signal
  → random submission ID + deterministic content revision
  → optimistic expected-current-entry check
  → BEGIN transaction
      reuse or create normalized emotion/tag vocabulary
      append one immutable daily-entry version
      snapshot ordered assignments
      insert or advance the one guarded head for that date
    COMMIT
  → rebuild the visible newest-first journal from current heads
```

Daily reflections may be saved on trading or no-trade dates and never create,
route, modify, or cancel an order. Create dates are bounded to workspace-local
today in the current UI; persisted dates remain immutable when editing. Exact
same-submission retries are idempotent, changed reuse or stale heads fail
closed, and a lost response is reconciled by date plus the prepared revision.
Demo entries are fictional and read-only. The daily process score is descriptive
self-report evidence only; performance, Direction Mix, Opening Weekday Mix,
Plan Check, Setup Breakdown, Mistake Patterns, and Emotion Patterns do not
consume it.

The editor treats a deterministic `entry_changed` separately from uncertain
persistence. It retains the raw date/headline/note/emotion/score/tag form,
locks the conflicted date, disables both obsolete save actions, and reloads one
workspace snapshot. Rebase becomes available only when that same snapshot is
local and proves a different newer head for the exact date; all saved authored
content plus date, version, and state are escaped and shown read-only
while the user's form remains unchanged. Only a separate
**Continue with my unsaved changes** action moves the local optimistic
base and rotates the submission ID, and a later explicit draft/completed save
performs the append. A reload error, absent/unchanged head, or second race keeps
the draft visible and saving blocked or re-enters the same flow. No automatic
merge, null-head fallback, overwrite, or commit occurs during reconciliation.

Daily Journal Exact-Command Recovery v1 closes the unknown-outcome UI gap
without changing persistence. Before the first commit call, the editor retains
the exact frozen prepared command—including submission ID, optimistic
predecessor, normalized content, and revision. If two safe attempts plus the
fallback read cannot prove an outcome, every authored control and close path
stays locked and **Retry this exact save** is the only enabled action. That
action never rereads the form or creates a new submission identity.

Both stores resolve an exact saved submission receipt before comparing the
current head, so replay returns the original version as a duplicate even when a
later successor is now projected. Only positive committed/duplicate evidence
may clear the retained command and refresh. A deterministic `entry_changed`
enters the preserve-review-consent stale flow; every other error remains
ambiguous because workspace, clock, or bridge failure can precede receipt
lookup. Repeated ambiguity keeps the same command and draft frozen. Once commit
is positively proven, a later render failure changes the sole action to
**Retry journal refresh** and never invokes persistence again.

## Projection semantics

Executions sort by microsecond timestamp, an immutable workspace-global ledger
sequence, then immutable ID. Raw CSV row order remains in import provenance; it
does not become a batch-local tie-breaker that can reorder equal-time fills
across files. A restored execution keeps its original ledger sequence even when
the later export reverses its rows.

The pure normalizer groups by account and instrument, applies FIFO lots, handles
long and short partial fills, and splits an automatic reversal into an exit
fragment followed by an entry fragment. Fees and rebates split across fragments
proportionally with deterministic remainder assignment. Every allocation and
lot match reconciles back to its source execution.

A trade subject is keyed by its immutable opening allocation, not by a mutable
ordinal within the account/instrument stream. Removing an earlier independent
trade therefore cannot transfer a later trade's future notes or tags. If a
correction truly removes or replaces the opening allocation, that is a new
subject by design; later annotation work must expose any merge/split decision
rather than silently moving metadata.

Projection generations are immutable. `projection_active_state` moves only to a
completed generation whose input-head digest matches. Retaining older
generations makes a rebuild explainable and prevents readers from seeing half a
projection. The digest includes each active execution ID and exact immutable
version ID, so rollback and restoration cannot masquerade as the same head set
even when their normalized P&L output is identical.

## Derived trade-browser scope

Trade Browser Scope v1 adds no second source of truth. Account options and the
account label on every trade preview derive from retained ledger accounts and
their stable IDs; labels are display text and are never filter identity.
Account/date filtering consumes only the current deterministic trade previews
and exact calendar contributions.

Dates are optional inclusive workspace-local allocation/activity dates. They
are not generic trade, opening, or closing dates. A multi-day trade belongs to
each scoped day with a contribution and appears once in range evidence with its
exact contributions reaggregated as canonical decimal strings. Zero-P&L
allocations remain activity. An optional selected day intersects the retained
account/range; a stale day fails closed before the UI explicitly clears that
refinement. Search is normalized and bounded card visibility only and never
changes exact P&L, trade, allocation, or activity-day totals.

Structured Trades Facets v1 extends that card-visibility layer with four fixed
exact values: asset class (Stock/ETF), direction, position state, and review
state. The facets AND with search after scope evidence is reconciled. They do
not trim or recompute the evidence collection, totals, calendar, Dashboard, or
governed report inputs. Unsupported runtime values fail closed instead of being
coerced into a broader view. Browser construction also detaches and freezes
trade evidence so later mutation of a local source object cannot change an
already-reconciled exact result.

Dynamic Review Facets v1 adds exact Mistake, Emotion, and Tag values to that
visibility layer. Options derive from current `TradePreview` assignments across
the complete workspace rather than `reviewOptions` vocabulary or the current
account/date/day/search/facet result. Each trade's labels are revalidated against
the saved-review contract: NFC normalization, trimmed and collapsed whitespace,
visible single-line text, a 120-code-point bound before and after the fixed
`en-US` identity fold, case-folded uniqueness within each trade's multivalued
field, and at most 20 mistake or tag assignments per trade. Available values use
stable code-unit order, are detached from source objects, and are deeply frozen
with the enclosing result.

The three dynamic facets AND with the four fixed facets, normalized search, and
existing scope. A well-formed retained selection need not be present in the new
option set: if refresh removes its last current assignment, the UI keeps the
exact selected value visible as **not currently assigned** and shows zero cards
instead of clearing it or broadening. Unsupported or malformed labels fail
closed. Dynamic facets do not trim or recompute exact scope evidence, totals,
calendar, Dashboard, or governed report inputs.

Compact Trades Filters v1 changes only how those seven exact controls are
revealed. Its active count derives from the existing four fixed and three
dynamic facet values. The native disclosure renders closed at zero and open for
any active value, including a valid stale dynamic selection; search and
account/date/day scope are excluded. In-place selection changes update the
count, and returning the last facet to its default collapses with focus on the
summary. The combined clear control remains outside the disclosure so a
search-only state stays recoverable. No disclosure boolean or count is added to
the session model, journal store, preferences, SQLite, export/restore, archive,
digest, or report input.

Scope and visibility state are session-only: they are not stored in SQLite,
browser journal state, exports, restores, or report archives. It survives
internal navigation and valid ledger refreshes, resets on local/demo mode
changes or reload, and affects Trades plus the Dashboard calendar only.
Dashboard headline metrics, equity, review progress, Direction Mix, Opening
Weekday Mix, Plan Check, Mistake Patterns, Emotion Patterns, and Setup
Breakdown consume the full snapshot.
This slice changes no schema, migration, store, archive, or governed report
definition/version.

Mistake Patterns v1 stays inside the derived-report boundary. Its complete
immutable builder consumes current projection trades and exact mistake labels
from coherent current completed review heads; open and closed positions are
equally eligible and no P&L, currency, risk, or outcome evidence is read.
`mistake-patterns-report-v1` is pinned by SHA-256
`f94fc896308348f55a665aeafba665f0f3d4ee50fc225c4dba1087bc2babad3c`.
Pending/draft reviews and completed heads without an assignment are mutually
exclusive exclusions. Unique included trades reconcile to total current trades,
while summed exact-label group assignments separately reconcile to total saved
assignments; a multi-label trade therefore remains one included trade and may
appear in several groups.

Completed-head IDs, stable subject IDs, and the existing saved-review label
normalization/limit invariants fail closed. The report never repairs, normalizes,
deduplicates, or drops stored values; case-folding is validation identity only.
Exact labels use code-unit group order; evidence uses traded date descending
then stable subject ID. Five-group and
25-contributor limits belong only to transient presentation. No report state,
definition input, or result enters SQLite, browser journal state, export/restore,
archive shape, or report-input digests; restore recomputes from existing inputs.

Emotion Patterns v1 stays inside the same derived-report boundary. Its complete
immutable builder consumes current projection trades and the one optional exact
emotion from coherent current completed review heads; open and closed positions
are equally eligible and no P&L, currency, risk, result, or outcome evidence is
read. `emotion-patterns-report-v1` is pinned by SHA-256
`d674eceb0d641512f106f9f1c6b37e23fe1a2ecd0d43e54b7e48865fa594adb4`.
Pending/draft reviews and completed heads without an emotion are mutually
exclusive exclusions. Each included trade contributes exactly one assignment to
exactly one group, so included trades and assignments must reconcile.

Completed-head IDs, stable subject IDs, and the existing saved-review emotion
normalization/limit invariants fail closed. The report never repairs or
normalizes stored values. Exact emotions use code-unit group order; evidence uses
traded date descending then stable subject ID. Five-group and 25-contributor
limits belong only to transient presentation. No report state, definition input,
or result enters SQLite, browser journal state, export/restore, archive shape,
or report-input digests; restore recomputes from existing inputs.

Direction Mix v1 stays inside that derived-report boundary. Its complete
immutable builder consumes every current projection trade and groups only on
the exact `side` field. `direction-mix-report-v1` is pinned by SHA-256
`0a55af9905699cc62746c99b5b4e7dd664588d8b526eefb207e9fb2bb77b3ab2`.
There are no exclusions: each trade contributes exactly once to the fixed Long
or Short group, both groups always exist, and their counts must reconcile to
the full projection.

Stable subject IDs must be unique, trimmed, 1–256 code points, and free of
C0/C1 controls. Direction, position status, and review status validate against
their exact runtime unions or fail closed. Position and review status are
evidence only; they do not affect inclusion, grouping, or ordering. Authored
review content, result fields, currency, and Trade Browser scope are not read.
Evidence uses traded date descending then stable subject ID. The 25-contributor
limit belongs only to transient presentation. No report state, definition
input, or result enters SQLite, browser journal state, export/restore, archive
shape, or report-input digests; restore recomputes from existing inputs.

Opening Weekday Mix v1 stays inside the same derived-report boundary. Its
complete immutable builder consumes every current projection trade and groups
only on the exact canonical `tradedOn` opening date already derived from the
immutable ledger's `openedAtUs` in the workspace time zone.
`opening-weekday-mix-report-v1` is pinned by SHA-256
`6f205c00826d547f1f0640bec0acceac836e707c4a95287d2e35f4ae62e01cf8`.
There are no exclusions: real Gregorian dates from 1970-01-01 through
9999-12-31 map to fixed Monday-through-Sunday groups, all seven groups always
exist, each trade contributes exactly once, and counts reconcile to the full
projection. Later allocations, exits, and reviews do not move a trade.

Stable subject IDs must be unique, trimmed, 1–256 code points, and C0/C1-free;
direction and position status validate as scalar drill-down evidence or fail
closed. Review content/state, results, currency, and Trade Browser scope are
not read. Evidence uses opening date descending then stable subject ID. The
25-contributor limit is presentation only. No report state or result enters
SQLite, browser journal state, export/restore, archive shape, or report-input
digests; restore recomputes from existing inputs. The report calculates no
financial output, rate, comparison, rank, reward, target, causal claim,
prediction, or advice.

Reports Navigator v1 remains inside that same derived boundary. It adds no
scope or result state: semantic in-page links target the existing Performance
Summary, Journal Curve, Direction Mix, Opening Weekday Mix, Plan Check, Mistake
Patterns, Emotion Patterns, and Setup Breakdown markup, while the Dashboard
shortcut may enter Plan Check directly. Activating a link scrolls and
focuses current DOM only; open disclosure state survives because no report is
rebuilt. The responsive top-bar position and clipped-control focus correction
are presentation behavior only. No navigation value enters SQLite, browser
journal state, local preferences, export/restore, archive digests, report-input
digests, or governed definitions. All six report builders receive the full
workspace snapshot and retain the same checksums, cohorts, exact values,
ordering, and progressive limits.

Report Trade Continuation v1 keeps its report-origin state in derived UI while
reusing the existing review-persistence path. A contributor's stable
trade-subject ID must resolve to exactly one trade in the reconciled full
snapshot before Hermes renders an **Open trade** control, and activation repeats
that exact validation against the current render snapshot. Symbols, visible
labels, DOM position, and Trade Browser search are never identity fallback.
The allowlisted Direction/Opening-Weekday/Plan/Mistake/Emotion/Setup source and
captured trigger live only in the current sheet closure and DOM attributes.
They do not enter
SQLite, browser journal state, Trade Browser state, preferences, URLs, exports,
restores, digests, report definitions, or archives. Opening and closing perform
no store operations. A review save uses the existing stable-subject review
command and may legitimately rebuild report membership; focus then returns to
the originating heading instead of treating a replacement row as the same DOM
node. Report
builders, progressive limits, and exact-total derivation and ownership remain
unchanged; account/date/day/search/facets stay independently owned and
untouched by opening or closing the continuation.

Search and all seven facet selects share the same session boundary. Clear
search and filters resets only those visibility controls and retains account/
date/day scope; Clear all resets scope and visibility together. Neither action
mutates ledger state.

## Rollback

Receipt rollback requires an explicit user confirmation. For every execution
for which that receipt is the last active import reference, Hermes adds a void
version and moves the head. `import_execution_occurrences` records every
accepted row, including duplicates already covered by an earlier receipt. If a
later active receipt also covers a fill, rolling back the earlier receipt leaves
that fill active. Hermes then normalizes the remaining heads, persists a new
generation, and appends an `import_rollbacks` record in one transaction.
Original CSV text, source rows, occurrence links, fees, execution versions, and
the import receipt remain intact.

An exact file imported again after rollback creates a new immutable batch and
receipt, adds non-void execution versions, and moves the heads back to those
versions. The original receipt remains visibly rolled back; active exact-file
deduplication still prevents a second copy while the restored receipt is active.

## Configured native storage contract (runtime not yet observed)

- The checked-in native path pins `@capacitor-community/sqlite` 8.1.0, enables
  encryption in Capacitor configuration, and generates a random 256-bit
  passphrase on first open.
- The adapter hands that secret to the plugin's secret API under the configured
  iOS Keychain prefix. Hermes application code does not write the secret to web
  preferences or log it. Actual Keychain persistence remains a Mac/iPhone gate.
- The database is configured in the app's `Documents` container, with no
  Hermes/plugin custom-directory backup-exclusion path selected in source.
  Actual device or iCloud backup inclusion and matching-Keychain-item restore
  remain unknown.
- Before returning a native connection, the adapter requires the plugin to
  report encryption, enables and checks foreign keys, and issues SQLite
  `quick_check`, SQLCipher `cipher_integrity_check`, and `foreign_key_check`.
  Linux tests cover this orchestration with mocks; native enforcement is not
  yet observed.
- The production WebView CSP sets `connect-src 'none'` and restricts bundled
  subresources to local `self`/`data` sources. Hermes importer code receives
  local file contents without making an upload request. The pinned SQLite
  plugin still exposes an unused native HTTP-download bridge method outside
  that CSP, so the binary cannot yet be described as having no network
  capability.
- Browser builds are a development surface only: financial records live in an
  explicitly labeled in-memory session store and disappear on reload.

Native SQLCipher operation, Keychain loss/reinstall behavior, actual device and
iCloud backup inclusion, restore with its Keychain item, CocoaPods resolution,
and kill/relaunch migration recovery remain Mac/physical-device gates. The v1
ledger, v2 command reconciliation, v3 trade-review statements, and v4
daily-journal statements are replay-safe for the plugin's statement/user-version
commit gap, but only interruption tests across v2→v3 and v3→v4 can prove the
native lifecycle. No privacy or recovery claim may be strengthened
until those behaviors are observed. Because SQLCipher is bundled, App Store
export-compliance answers also require a human determination.

## User-owned export and restore v1

The native adapter and archive statements below describe implemented behavior
covered by Linux repository/codec tests. They are not native Files, SQLCipher,
or plugin-runtime evidence.

- The file envelope is app-owned `hermes-journal-export` format v1. Native
  export reads all app-owned durable tables and the current report input inside one SQLite
  transaction; it never substitutes the lossy current-ledger projection for raw
  source rows, inactive/history facts, immutable review versions, submission
  receipts, formula definitions, or stable trade subjects.
- Native payload v1 is `sqlite-table-set`. Its table and ordered column
  signatures are pinned to schema v4, SQLite integers are emitted as canonical
  decimal strings, rows and JSON keys are deterministic, and table-set or
  ordered-column metadata drift fails closed. Live table-SQL hashes remain
  diagnostic; export v1 does not claim complete constraint, index, or trigger
  pinning. Migration application timestamps stay in provenance but are excluded
  from the portable user-state digest.
- Browser development uses a separate `browser-session-state` v2 payload. It
  captures the complete in-memory store, can restore only into the browser
  development runtime, disappears on reload, and is not native recovery
  evidence.
- `archiveSha256` detects accidental content corruption over canonical semantic
  JSON; `stateSha256` identifies durable user state and `reportSha256`
  identifies the versioned exact report input. These are unkeyed checksums, not
  signatures, authentication, or encryption. Anyone who edits a file can
  recompute them.
- The JSON parser rejects duplicate decoded object keys, unsafe numeric values,
  unknown envelope fields, unsupported archive/attachment versions, nonempty
  attachment catalogs, oversized structures, out-of-range timestamps, and
  checksum mismatch. Payload-specific decoders reject unsupported payload
  versions. The parser independently measures UTF-8 with `TextEncoder` and
  rejects more than 67,108,864 bytes. Validated artifacts are deeply frozen.
- Attachment catalog v1 is deliberately empty, and this app build rejects any
  archive containing attachments. Blob/File delivery and parsing can multiply
  the 64 MiB input in memory; native near-limit and low-storage behavior remain
  device gates.
- Native restore accepts only current-migration `sqlite-table-set` v1. The
  decoder verifies the envelope checksum, all 35 tables and 280 pinned ordered
  columns, canonical strict row order, primary-key uniqueness, nullable/type
  rules, signed SQLite 64-bit integers, row counts, table and portable-state
  digests, and a recomputed summary. It never executes archive SQL; live
  `createSqlSha256` values remain diagnostic rather than compatibility input.
- Preview runs in the real destination transaction. It verifies the migration
  and metric-definition baseline, refuses different nonempty state, inserts
  into an empty journal, recomputes portable table equality, report and summary
  equality, `foreign_key_check`, and `quick_check`, then throws a typed sentinel
  so the complete trial rolls back before a preview is returned.
- Commit reparses the selected text, rederives and matches every prepared
  preview claim, atomically rechecks the destination, restores and verifies
  inside the transaction, then rereads and verifies the committed state in a
  fresh transaction. An exact already-restored table set returns
  `already-restored`; different nonempty state is never merged or overwritten.
- Browser restore fully verifies a separate immutable candidate before one
  synchronous state swap. It accepts only `browser-session-state` v2, requires
  an empty session unless the exact state is already present, and cannot be
  cited as native restore evidence.
- Restore compatibility is intentionally exact-runtime during this pre-release
  phase. This build rejects browser v1 and pre-v4 native table sets rather than
  guessing at archive conversion. The recovery path is to restore the file in
  its exact old runtime, then open/migrate that live journal and export a new
  current-runtime file. On-device v3→v4 migration is implemented, but retained
  database and interruption evidence remains a Mac/iPhone gate.
- More exposes restore below the export card only for the local empty journal.
  The UI rejects `File.size` above 64 MiB before `File.text()`, invalidates stale
  previews on file change/cancel, displays adapter-recomputed summary and
  state/report evidence plus checksum-verified export time and validated
  payload metadata, requires explicit confirmation, and distinguishes committed,
  already-restored, uncertain, and failed outcomes. Demo has no restore control;
  nonempty journals have no chooser or enabled restore action.
- Recovery Continuity browser evidence composes Daily Journal authoring with
  that boundary: export → empty-session restore preserves the draft head,
  continued writing appends one successor, and the continued export restores
  again with two immutable versions, one current head, and two submission
  receipts. A deterministically delayed superseded file read cannot reveal
  details, move focus, enable confirmation/commit, or mutate the empty
  destination; the replacement file must earn its own preview. Successful
  commit focuses the stable rendered screen after the old commit control is
  removed.
- The implementation and Linux evidence support the matching-runtime restore
  contract, but the archive is not an accepted native backup until attachment
  round-trip and native Files/lifecycle/interruption/low-storage/near-limit-
  memory gates pass. Delete All Data remains unavailable.

## Verification evidence

Linux CI executes the full migration in SQL.js and checks STRICT tables,
foreign keys, migration checksum, quick/integrity checks, canonical-decimal
constraints, signed rebates, and append-only triggers. Repository tests cover
empty load, exact two-fill P&L with fees, identical no-ID fills, account-scoped
deduplication, changed-payload atomic rollback, partial-exit timing, projection
generations, receipt rollback, and exact rollback/re-import restoration. Browser
tests exercise file selection, preview invalidation, commit, dashboard
reconciliation, account-attributed history, mapping focus, persistent mutation
announcements, user-confirmed rollback, and restoration. Regression fixtures
also cover overlapping receipts, dependent rollback atomicity, stable trade
subjects, equal-timestamp cross-batch ordering, reversed restore order, causal
clock rollback, and immutable input-head digests. Manual-entry coverage adds
tamper detection, offset-to-IANA matching, DST gap/fold handling, fee
precision/range limits, exact two-fill P&L, schema-backed response-loss
reconciliation, replay idempotency, failed-close atomicity, manual/CSV
asset-class and receipt ownership separation, save-time dismissal guards,
two-step browser review, focus restoration, and manual-only receipt truthfulness.
Slice B coverage adds v2→v3 upgrade/replay, immutable one-link review heads,
tamper detection, idempotent retry, stale-head rejection, all-or-nothing batch
rollback, stable-subject survival, exact metric reconciliation, editable review
versioning without execution mutation, unsaved-change focus behavior, and the
pending/draft/completed review queue in a full mobile browser journey.
Slice C-A coverage exports all pinned SQLite tables and ordered columns,
reparses self-verifying artifacts, retains raw CSV/manual provenance and both
historical/current review versions, and rejects duplicate keys,
table/column-shape drift, and range errors. It also downloads a plaintext
browser archive offline before confirming that demo mode exposes no export
control. The 2026-07-13 Slice C-A Linux gate passed 271 Vitest tests across 26
files and 21 Playwright journeys plus the locked install, build, sync, audit,
native/lock drift, and whitespace gates. Native share-sheet/Files cancellation,
save, reopen, memory, and VoiceOver behavior remain unverified.
Slice C-B coverage adds runtime dispatch, strict native table/column/row and
signed-integer validation, digest/summary tampering, transactional preview
rollback, stale-preview rejection, exact already-restored retry, different
nonempty-state refusal, restore failure atomicity, post-commit reconciliation,
response-loss recovery, browser candidate validation, 64 MiB pre-read UI
rejection, and demo/nonempty restore isolation. Exact final integration counts
and publication evidence remain in the active handoff rather than this
contract. Daily Journal coverage adds normalized Unicode boundaries, immutable
dates/version chains, submission idempotency, optimistic conflicts, atomic
session/SQLite commits, lost-response reconciliation, v3→v4 migration,
content-bound native/browser restore validation, trading/no-trade display,
explicit draft/completed saves, demo isolation, focus/busy/error behavior, and
320px/200% browser reflow. Stale-head UI coverage composes two production
editor instances in one browser application/store: version 2 makes version 1's
command stale, all local inputs remain intact and blocked, the newer head is
displayed before consent, and the next explicit save exports exactly three
versions, one head, and three receipts while offline. A one-shot render failure
also leaves the writing intact, evidence/consent hidden, and saves blocked.
The comparison covers focus, inert background, 44-point actions, long tokens,
and 320px/200% reflow. Exact-command UI coverage composes an unknown Daily
Journal outcome through two exact attempts, repeated ambiguity without form
reread or ID generation, a later competing head, deterministic stale recovery,
and an explicit successor. Export evidence proves one immutable version and one
receipt per accepted submission; a separate one-shot render failure proves a
positively committed save exposes refresh only. This is production-bundle
browser evidence, not native bridge or lifecycle acceptance. Single-Trade
Review recovery coverage independently exercises repeated pre-mutation
ambiguity followed by exact success, a competing current head, a
same-submission/different-content receipt collision, and a proven commit with a
failed render. Instrumented production journeys prove zero form rereads and ID
generation during exact replay, zero persistence during refresh-only recovery,
privacy-safe copy, focus/dismiss containment, 320px/200% layout, and exact
version/head/submission archive cardinality. Individual stale-head coverage
adds a one-shot failed evidence refresh, complete raw static/rule preservation,
escaped v2 evidence, explicit complete-form consent, a hidden v3 race, a
second stale rejection/consent, completed-state monotonicity, and final v4 with
one head/four successful receipts. SQLite independently proves the v1→v4
supersedes chain, unchanged state digests across both stale attempts, and no
stale submission rows. Batch known-commit refresh coverage adds a direct
commit-store tripwire, double-submit and double-refresh activation, two failed
redraws, exact per-subject head/revision receipt checks, unchanged execution
provenance, modal cleanup, and 320px/200% focus/reflow evidence. This remains browser
SessionJournalStore evidence, not native SQLite bridge, multi-scene, relaunch,
VoiceOver, or Dynamic Type evidence. Browser composition additionally covers a
real
Daily Journal draft through export, offline empty-session restore, continued
immutable writing, re-export, second restore, exact version/head/submission
evidence, post-restore focus, and asynchronous file-replacement invalidation.
Trade Browser coverage adds stable same-symbol
multi-account identity, inclusive multi-day/leap/zero-P&L scope, fractional
exact sums and counts, stale-day fail-closed handling, tampered-evidence
rejection, report isolation, real activity-month navigation, invalid-range
recovery, focus visibility, fixed-facet/search AND
composition, scope/report isolation under facets, distinct clear semantics,
session retention/reset, and 320px/200% reflow. Dynamic Review Facets coverage
adds current-assignment-only option derivation across the whole workspace,
saved-review normalization/limit enforcement, stable deeply frozen choices,
seven-facet/search/scope AND composition, multi-valued mistake/tag matching,
and a retained stale selection that yields zero visible cards without changing
exact evidence, totals, or calendar state. Compact Trades Filters coverage adds
zero-to-seven counts, native pointer/keyboard disclosure behavior, query-only
clear access, final-facet collapse/focus, retained stale-value opening,
report/storage neutrality, 44-point controls, and 320/421px 200% reflow.
Emotion Patterns coverage adds checksum, cohort conservation, open/closed and
result neutrality, current-head movement, normalization/identity fail-closed
tables, stable order, immutability, real-store updates, process-score
independence, exact browser restore recomputation, five/25 pagination, count-only
copy, stable-ID continuation, save-driven regrouping, heading focus return, and
320/421px 200% reflow.
Direction Mix coverage adds checksum, full-cohort conservation, fixed
Long-then-Short grouping, zero-count groups, C0/C1 and duplicate stable-ID
rejection, invalid direction/position/review-state rejection, evidence-only
status neutrality, result and authored-review neutrality, stable ordering,
immutability, exact browser restore recomputation, 25-row pagination,
count-only copy, stable-ID continuation, save-driven heading focus return,
Trades-scope isolation, and 320/421px 200% reflow.
Opening Weekday Mix coverage adds checksum, full-cohort conservation, fixed
Monday-through-Sunday grouping and zero-count groups, canonical Gregorian date
and stable-ID rejection, direction/position evidence validation, review/result/
currency neutrality, workspace-local first-entry ownership, stable ordering,
immutability, exact browser restore recomputation, 25-row pagination,
anti-reward count-only copy, stable-ID continuation, save-driven heading focus
return, Trades-scope isolation, and 320/421px 200% reflow.
Reports Navigator coverage adds an
ordered navigation landmark, direct Dashboard entry, return paths, live-header
offset focus, preserved disclosure/DOM state, governed metric/curve/report
fingerprints, preference neutrality, 44-point controls, and fully visible
keyboard focus with no internal or document overflow at 320px/200% text and at
the 421px/200% breakpoint edge.
Report Trade Continuation coverage adds exact render/activation identity,
escaped source/action metadata, progressive Direction, Opening Weekday, Plan,
Mistake, Emotion, and Setup row/group actions,
nested-child post-bind delegation, exact-ID-over-visible-label selection,
fail-closed unknown identity before inert state, offline read-only inspection,
retained disclosures/DOM/scroll/report/storage and Trade Browser filters, exact
trigger return, source-heading return after Direction/Opening-Weekday saves and
after moving Plan/Setup/Mistake/Emotion evidence,
focus trapping, 44-point controls, and 320/421px 200% no-overflow evidence.
Native Files selection, lifecycle/
interruption, Daily Journal relaunch and migration, low-storage, near-limit
memory, VoiceOver, and physical-device SQLCipher behavior remain unverified.

See [the iOS roadmap](IOS_ROADMAP.md) for remaining product work and
[the Mac handoff](MAC_HANDOFF.md) for native acceptance.
