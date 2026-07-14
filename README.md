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
- Win rate, profit factor, drawdown, streak, setup, mistake, and tag reports.
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
- SQLCipher-backed native storage with a random passphrase held by the iOS
  Keychain through the pinned Capacitor SQLite plugin.
- An on-device RFC 4180 CSV flow with inference/remapping, exact source text,
  row-level validation, stale-preview protection, atomic commit, deduplication,
  and receipt rollback.
- A two-step manual execution flow with exact decimal validation, IANA/offset
  timestamps, encrypted durable submission reconciliation, immutable
  manual-source facts, and the same atomic deterministic projection path as CSV.
- Immutable v3 trade-review versions attached to durable trade subjects, with
  notes, setup/mistake/emotion tags, playbooks, rule outcomes, exact initial
  risk, optional planned stop, optimistic concurrency, and atomic batch tagging.
- Immutable v4 day-level journal versions keyed by workspace-local date. Users
  can explicitly save a draft or completed reflection on trading and no-trade
  days, edit only through an optimistic successor version, and optionally add a
  headline, note, emotion, tags, and a clearly self-reported process score that
  never enters performance or Plan Check analytics.
- A mobile trade-detail review sheet with execution inspection, exact R/return
  evidence, pending/draft/completed queues, and versioned-review session streaks.
- A versioned, deterministic plaintext journal export that captures all
  app-owned SQLite facts and history in one transaction, rejects
  ambiguous/corrupt envelopes, and offers a browser-tested,
  accessibility-designed two-step delivery path: file-capable Web Share when
  supported, otherwise a browser download. The browser export is a labeled
  in-memory development artifact, not a native backup.
- A local-only, previewed Slice C-B restore for current
  `hermes-journal-export` v1 files. Native accepts only `sqlite-table-set` v1;
  the browser development runtime accepts only `browser-session-state` v2 and
  is not native recovery evidence. Restore revalidates the selected archive,
  never merges or overwrites an existing journal, and treats an exact
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
- Trade Browser Scope v1 uses stable account IDs plus optional inclusive
  workspace-local allocation/activity dates to derive exact scoped P&L, trade,
  allocation, and activity-day evidence. Dashboard month navigation visits
  months with scoped activity; selecting a day refines the retained
  account/range, and clearing the day restores it. Every card shows its account
  and keeps whole-trade realized-to-date P&L separate from scoped allocation
  contribution. Search changes card visibility only. Scope is session-only and
  affects Trades plus the Dashboard calendar; headline metrics, equity, review
  progress, Plan Check, and Setup Breakdown remain whole-workspace.
- Structured Trades Facets v1 ANDs the existing normalized search with four
  fixed, exact card filters: asset class (Stock/ETF), direction, position state,
  and review state. These session-only controls change visible Trades cards
  only; they retain account/date/day scope and never change exact scope totals,
  the calendar, Dashboard, or governed Reports. Clear search and filters
  preserves scope, Clear all resets both layers, and mode switches or reload
  reset the ephemeral state.
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
presets, persistent/report scoping, full account management, and the remaining
report families remain Phase 1 work. Native v3→v4 migration, Daily Journal
relaunch/Files export/restore/continued writes, VoiceOver, and small-screen
behavior still require Mac/iPhone evidence.
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
        encrypted local SQLite repositories
        local CSV import/provenance adapters
        Keychain-held random database secret
```

The production Capacitor configuration has no remote `server.url`, and the
content security policy blocks network connections. Browser development uses
an explicitly labeled in-memory session store; native iOS uses encrypted SQLite.
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
