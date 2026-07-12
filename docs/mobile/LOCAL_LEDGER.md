# Hermes Journal local ledger contract

Status: implemented CSV + manual execution vertical slice · 2026-07-12

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
ledger and v2 command-reconciliation statements are replay-safe for the plugin's
statement/user-version commit gap, but only an interruption test can prove the
native lifecycle. No privacy or recovery claim may be strengthened until those
behaviors are observed. Because SQLCipher is bundled, App Store
export-compliance answers also require a human determination.

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

See [the iOS roadmap](IOS_ROADMAP.md) for remaining product work and
[the Mac handoff](MAC_HANDOFF.md) for native acceptance.
