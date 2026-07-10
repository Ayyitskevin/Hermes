# Hermes Journal

Hermes Journal is an iPhone-first trading journal for traders who want serious
review and analytics without another subscription. The commercial target is a
one-time **$9.99 App Store purchase**, followed by Android parity after the iOS
product is stable.

The working promise is:

> A private trade journal that shows what is working—for one upfront purchase.

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

## Commercial boundary

The paid app includes the complete local product—there is no subscription or
second lifetime-unlock purchase. A sustainable $9.99 release can include:

- Manual trade entry and generic broker CSV import.
- Accounts, executions, partial exits, fees, currency P&L, percent return, and R.
- Searchable trades, calendar, daily/trade notes, tags, screenshots, and playbooks.
- Win rate, profit factor, expectancy, drawdown, streak, setup, mistake, and tag reports.
- On-device storage plus versioned export, restore, and delete-all-data controls.
- Deterministic planning tools that do not require a hosted service.

Unlimited hosted sync, licensed market history, real-time broker infrastructure,
and recurring AI credits are not promised inside the flat price. Those require
user-supplied infrastructure or a separately approved business model.

## Current status

The repository contains the paid-app foundation, not a submission-ready product:

- Vite, TypeScript, Capacitor 8, and an iPhone-only iOS project.
- Original journal-first navigation and three-step onboarding.
- A clearly labeled, fully offline demo journal with eight fictional trades.
- Headline P&L, R, win rate, profit factor, expectancy, and setup reports derived
  from those trade records.
- Working trade search and fixed-fractional position sizing.
- Safe-area, keyboard/focus, reduced-motion, Dynamic Type, and 44-point control coverage.
- CI for locked dependencies, types, unit tests, browser flows, production build,
  native sync, and the legacy Python safety suite.

Durable SQLite storage, manual entry, and CSV import are the next vertical slice.
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
require macOS.

## Architecture

```text
Capacitor iOS shell
  mobile task-oriented UI
    typed application services
      pure TypeScript journal and analytics core
        encrypted local SQLite repositories
        file import/export adapters
        Keychain adapter for future user-owned credentials
```

The production Capacitor configuration has no remote `server.url`, and the demo
content security policy blocks network connections.

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

Hermes Journal is retrospective journaling and analytics software. It does not
connect to brokerage write APIs, place orders, modify orders, or promise trading
outcomes. Imported values and calculations must remain inspectable and
exportable, and users remain responsible for verifying their records.

## License

MIT — see [LICENSE](LICENSE). Vendored Archivo and B612 Mono fonts use the SIL
Open Font License; their license texts are in `web/fonts/`.

## Disclaimer

Hermes Journal does not provide investment advice. Markets involve risk of loss.
Calculations are estimates and should be checked against source records before
they inform a decision.
