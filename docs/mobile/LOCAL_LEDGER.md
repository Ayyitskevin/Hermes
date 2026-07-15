# Hermes Journal local ledger contract

Status: implemented execution + versioned trade/day review + exact-command recovery + derived trade-browser scope + local restore · 2026-07-14

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
   cryptographic submission ID plus encrypted v2 command record makes retries
   and lost native responses idempotent while retaining two independently
   entered fills that happen to have identical values.
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
      encrypted pending command + reviewed revision
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
record in place. If the native transaction commits but the WebView is killed or
the bridge response is lost, the unacknowledged v2 row survives in the same
encrypted database. Startup reconciles its execution ID against the active
ledger and acknowledges it only after the saved result has been read; retrying
the original submission returns the existing execution without rebuilding.

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
self-report evidence only; performance, Plan Check, and Setup Breakdown do not
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

Scope state is session-only: it is not stored in SQLite, browser journal state,
exports, restores, or report archives. It survives internal navigation and
valid ledger refreshes, resets on local/demo mode changes or reload, and affects
Trades plus the Dashboard calendar only. Dashboard headline metrics, equity,
review progress, Plan Check, and Setup Breakdown continue to consume the full
workspace snapshot. This slice changes no schema, migration, store, archive,
or governed report definition/version.

Search and facet state share the same session boundary. Clear search and filters
resets only those visibility controls and retains account/date/day scope; Clear
all resets scope and visibility together. Neither action mutates ledger state.

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

## Native storage and secrets

- Native iOS uses pinned `@capacitor-community/sqlite` 8.1.0 with encryption
  enabled and a random 256-bit passphrase generated on first open.
- The plugin stores that secret in the iOS Keychain under the configured Hermes
  prefix. Hermes never logs or stores it in web preferences.
- The database is configured in the app's `Documents` container. That avoids
  the plugin's explicit backup-exclusion flag for custom directories and keeps
  irreplaceable journal data eligible for normal device backup policy.
- Encryption, SQLite quick-check, SQLCipher page-HMAC integrity, and foreign-key
  integrity are verified on every native open. The schema `user_version` and
  migration receipt checksums must match the app before repository reads or writes.
- The production CSP denies network connections. The importer receives local
  file contents and makes no upload request.
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
- A current-schema archive is now restorable on its matching runtime, but it is
  not a complete native backup until attachment round-trip and native
  Files/lifecycle/interruption/low-storage/near-limit-memory gates pass. Delete
  All Data remains unavailable.

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
precision/range limits, exact two-fill P&L, encrypted response-loss
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
session retention/reset, and 320px/200% reflow.
Native Files selection, lifecycle/interruption,
Daily Journal relaunch and migration, low-storage, near-limit memory, VoiceOver,
and physical-device SQLCipher behavior remain unverified.

See [the iOS roadmap](IOS_ROADMAP.md) for remaining product work and
[the Mac handoff](MAC_HANDOFF.md) for native acceptance.
