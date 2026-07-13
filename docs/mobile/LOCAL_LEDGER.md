# Hermes Journal local ledger contract

Status: implemented execution + versioned review + Slice C-B local restore · 2026-07-13

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
ledger, v2 command reconciliation, and v3 review statements are replay-safe for
the plugin's statement/user-version commit gap, but only an interruption test
can prove the native lifecycle. No privacy or recovery claim may be strengthened
until those behaviors are observed. Because SQLCipher is bundled, App Store
export-compliance answers also require a human determination.

## User-owned export and restore v1

- The file envelope is app-owned `hermes-journal-export` format v1. Native
  export reads all app-owned durable tables and the current report input inside one SQLite
  transaction; it never substitutes the lossy current-ledger projection for raw
  source rows, inactive/history facts, immutable review versions, submission
  receipts, formula definitions, or stable trade subjects.
- Native payload v1 is `sqlite-table-set`. Its table and ordered column
  signatures are pinned to schema v3, SQLite integers are emitted as canonical
  decimal strings, rows and JSON keys are deterministic, and table-set or
  ordered-column metadata drift fails closed. Live table-SQL hashes remain
  diagnostic; export v1 does not claim complete constraint, index, or trigger
  pinning. Migration application timestamps stay in provenance but are excluded
  from the portable user-state digest.
- Browser development uses a separate `browser-session-state` v1 payload. It
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
  decoder verifies the envelope checksum, all 32 tables and 257 pinned ordered
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
  synchronous state swap. It accepts only `browser-session-state` v1, requires
  an empty session unless the exact state is already present, and cannot be
  cited as native restore evidence.
- More exposes restore below the export card only for the local empty journal.
  The UI rejects `File.size` above 64 MiB before `File.text()`, invalidates stale
  previews on file change/cancel, displays adapter-recomputed summary and
  state/report evidence plus checksum-verified export time and validated
  payload metadata, requires explicit confirmation, and distinguishes committed,
  already-restored, uncertain, and failed outcomes. Demo has no restore control;
  nonempty journals have no chooser or enabled restore action.
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
contract. Native Files selection, lifecycle/interruption, low-storage,
near-limit memory, VoiceOver, and physical-device SQLCipher behavior remain
unverified.

See [the iOS roadmap](IOS_ROADMAP.md) for remaining product work and
[the Mac handoff](MAC_HANDOFF.md) for native acceptance.
