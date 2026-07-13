# Hermes Journal — active mobile handoff

Status: verified Slice C-A export-only Linux milestone · updated 2026-07-13

task: Deliver a user-owned, deterministic journal export before restore or
Delete All Data, without adding trade execution, hosted sync, broker access, or
a required server.

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
- README and mobile product, roadmap, ledger, and Mac handoff documents now
  distinguish plaintext integrity from authentication/encryption, archive from
  recoverable backup, browser evidence from native evidence, and Slice C-A from
  unfinished restore/delete work.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed; 0 vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 26 files, 271 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; 21 Playwright journeys passed,
  including offline download/parse/demo isolation and share cancellation with
  no fallback download.
- `cd mobile && npm run ios:sync` — exit 0; nested production build transformed
  46 modules and copied the bundle; Capacitor found only
  `@capacitor-community/sqlite@8.1.0`. CocoaPods and `xcodebuild` were
  unavailable and explicitly skipped.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` — exit 0 after
  sync; no tracked native or lock drift.
- `git diff --check` — exit 0.
- Independent read-only final rereview returned clear after synchronous
  browser-snapshot, total instrument-ordering, negative-zero integrity, and
  schema-claim findings were fixed and spot-checked.

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

open:

- HOLD restore. First add payload-kind/version dispatch, full table/row/summary
  verification, a user preview, interruption/retry evidence, and an
  empty-journal-only atomic commit. The current parser deliberately does not
  treat an archive as restorable.
- HOLD Delete All Data until restore is proven, then define database, Keychain,
  attachment, interruption, response-loss, and verification-receipt behavior.
- Attachment catalog v1 is deliberately empty. Attachment round-trip, native
  near-64-MiB memory behavior, low-storage behavior, and streaming/temp-file
  design remain open.
- Run every native gate in `docs/mobile/MAC_HANDOFF.md`, including
  share/cancel/save/reopen/custom-MIME behavior, VoiceOver/Dynamic Type,
  SQLCipher/Keychain, backup/reinstall, migration interruption, force quit, and
  physical-device lifecycle.
- Do not start broker sync, hosted Connect, Android, recurring AI, or App Store
  submission in the next slice.

## Legacy history

The Python/FastAPI cockpit and strategy-operation documents remain frozen,
explicitly labeled historical reference. They do not define the active product,
stack, launch audience, or completion state.
