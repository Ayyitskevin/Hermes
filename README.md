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
  → user-controlled export or backup
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
- A mobile trade-detail review sheet with execution inspection, exact R/return
  evidence, pending/draft/completed queues, and versioned-review session streaks.
- A versioned, deterministic plaintext journal export that captures all
  app-owned SQLite facts and history in one transaction, rejects
  ambiguous/corrupt envelopes, and offers a browser-tested,
  accessibility-designed two-step delivery path: file-capable Web Share when
  supported, otherwise a browser download. The browser export is a labeled
  in-memory development artifact, not a native backup.
- Exact decimal-string normalization for partial fills, long/short reversals,
  fee allocation, and currency-separated P&L without implicit FX.
- A clearly labeled, fully offline demo journal with eight fictional trades.
- Headline currency P&L, win rate, profit factor, versioned percent return, and
  risk-backed R derived from real ledger records; unavailable denominators fail
  visibly instead of producing an invented metric.
- Working trade search and fixed-fractional position sizing.
- Safe-area, keyboard/focus, reduced-motion, Dynamic Type, and 44-point control coverage.
- CI for locked dependencies, types, unit tests, browser flows, production build,
  native sync, and the legacy Python safety suite.

Linux tests exercise the real schema/repository through SQL.js. Native
encryption, Keychain recovery behavior, CocoaPods resolution, kill/relaunch,
device backup behavior, and export delivery/reopen behavior still require the
Mac/device gate. Attachments, restore, Delete All Data, daily notes, and deeper
reports remain Phase 1 work.
See [the iOS roadmap](docs/mobile/IOS_ROADMAP.md) for the release sequence and
[the Mac handoff](docs/mobile/MAC_HANDOFF.md) for Xcode/device gates.

## Run the mobile foundation

Node 22.12 or newer is required.

```bash
cd mobile
npm ci
npm run typecheck
npm test
npm run test:e2e
npm run ios:sync
```

The TypeScript bundle and native container can be generated on Linux. Xcode,
Simulator, physical-device, signing, TestFlight, and App Store verification
require macOS. The first Mac setup must run `pod install` in `mobile/ios/App`
and commit the resulting lockfile, workspace, and reviewed project changes.

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
