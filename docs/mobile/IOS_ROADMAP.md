# Hermes premium mobile roadmap

Status: implementation started on `codex/ios-paid-app-foundation`.

## Product contract

Hermes mobile is a privacy-first, premium trading journal and decision-support
utility. Its commercial target is the core TradeZella workflow at a radically
lower price, with Hermes risk and regime context as the differentiator:

- iPhone first; Android after the iOS product is stable.
- $9.99 upfront App Store price.
- No subscription, trial paywall, account requirement, or in-app unlock.
- No trade execution or broker write access.
- User records stay on the device unless the user explicitly exports them.
- Sample mode works forever without a network connection.
- Connected data will use a user-controlled credential or file import only
  after written provider-distribution clearance.

This is a paid app rather than a conventional micro-SaaS. Product potential is
**7/10** as a polished, private replacement for the core import → journal →
review loop. It is only **4/10** if marketed as full TradeZella feature parity
at $9.99, because that would promise recurring data/cloud operations the price
cannot fund. TradeZella is a competitive reference; Hermes is not affiliated
with or endorsed by it.

Current readiness for that target is **3/10**: the native/offline foundation and
sizing parity exist, but the execution/import schema and durable journal loop do
not yet. Potential and readiness are deliberately different scores.

## Economic boundary

The $9.99 purchase covers the app binary, local calculations, bundled education,
on-device imports/analytics, and updates. TradeZella currently advertises
$29/month and $49/month plans (or $288/$399 annually), so Hermes has a roughly
29–40× first-year price wedge. That wedge is credible only because Hermes does
not bundle recurring AI inference, licensed market-data redistribution, hosted
storage, or a developer-operated proxy. Those services would create an uncapped
lifetime liability that the purchase price cannot fund.

The App Store is the purchase gate, so this edition does not need StoreKit,
restore-purchase UI, a receipt server, or subscription state. Apple developer
membership and the App Store commercial agreements remain required to publish.
The Apple Developer Program is currently $99 per membership year. At a $9.99
sale, proceeds before taxes/refunds are approximately $6.99 at Apple's standard
30% commission or $8.49 if the account qualifies for and enrolls in the 15%
Small Business Program. The local-first boundary keeps either case sustainable.

## Competitive feature boundary

The phrase “same functionality” is split into honest product layers:

| Layer | Hermes commitment |
|---|---|
| $9.99 launch core | Execution-level manual/generic CSV import; local accounts and import receipts; prices, quantity, commissions/fees, currency P&L, percent return and R-multiple; trade list; calendar; tags for setup/mistake/emotion; notes and screenshots; playbooks/rules; filters; core performance reports; versioned export/backup; Hermes risk sizing |
| Sustainable updates | High-demand broker CSV parsers; compare/custom reports; MAE/MFE and exit analysis when required price data is user-supplied or licensed; user-controlled iCloud backup; read-only broker sync only where written terms and secure BYO credentials permit it; local backtesting against user-imported history |
| Outside the lifetime promise | Developer-funded 500+ broker/prop integrations, hosted cross-platform storage, recurring AI credits, bundled tick/Level II history, server-backed replay/backtesting, mentor spaces, and community services. These require user-supplied infrastructure or a separately approved business model |

The launch should win on price, privacy, focused mobile workflow, and risk-aware
review—not pretend a $9.99 binary includes TradeZella's recurring infrastructure.

Competitive journaling deliberately evolves the desktop app's “percent only”
storage rule: Phase 1 may store optional execution price, quantity, fees, currency,
and realized P&L locally because imports and commission-aware reports require
them. Hermes still never needs an account balance, defaults to R/percent views,
never transmits those records, and preserves the no-execution boundary. This
change needs explicit schema, privacy, export, and deletion tests before it lands.

## Runtime architecture

```text
Capacitor iOS shell
  mobile task-oriented UI
    typed application services
      pure TypeScript domain core
        local SQLite repositories
        Keychain credential adapter
        read-only data/file adapters
        best-effort iOS background adapter
```

The existing Python application remains the desktop product and calculation
reference. FastAPI, APScheduler, systemd, and Python itself are not embedded in
the phone. Deterministic engines move to TypeScript behind ports; golden JSON
fixtures prove parity against pinned CPython 3.11 behavior and, for the regime
classifier, the owner-confirmed TradingView state tape.

## Delivery phases and gates

### Phase 0 — paid-app foundation (current)

Delivered in the repository:

- Vite/TypeScript/Capacitor 8 workspace and generated Swift Package Manager
  iPhone-only project (`com.kleephotography.hermes`, iOS 16 minimum).
- Three-step paid-app onboarding with no second paywall.
- Five journal-first destinations: Today, Trades, Journal, Insights, More.
- Persistent `SAMPLE` provenance, compact expandable risk rail, mobile safe
  areas, 44-point controls, reduced motion, and route announcements.
- Frozen offline journal/performance scenario and useful shells for every tab.
- Functional fixed-fractional position sizing with a shared CPython 3.11 golden
  fixture, including ties-to-even and binary-float boundaries.
- A production content security policy that blocks all connections in sample mode.
- Linux CI for locked install, types, unit tests, a Chromium mobile-flow smoke,
  bundle build, and Capacitor sync.

Exit gate: TypeScript checks, unit tests, production asset build, Capacitor sync,
and existing Python/no-write checks pass. Xcode and physical-device checks are
explicitly deferred to a Mac.

### Phase 1 — durable import → journal → insights vertical slice

- Add numbered SQLite migrations for accounts, import batches, executions,
  normalized trades, fees, tags/categories, notes, attachments, playbooks/rules,
  risk events, and performance snapshots.
- Build manual entry and a generic CSV mapping/import receipt entirely on-device.
- Add a persistent Add action for manual entry/file import; keep account,
  import-history, export, backup, and Hermes tools under More.
- Make imports and trade grouping idempotent so the same fill cannot duplicate
  results; preserve source rows for an explainable audit trail.
- Add Trades, calendar, notebook, mistake/setup/emotion tags, screenshots,
  playbook assignment, filters, and core win-rate/expectancy/profit-factor/
  drawdown/streak/R reports.
- Port fixed-fractional sizing, deterministic reviewer rules, and guarded close
  math with Python golden fixtures.
- Add versioned export/import that excludes credentials and regenerable cache.

Exit gate: import/manual entry → normalized trade → tag/note → dashboard/report →
export works in airplane mode, survives kill/relaunch, and passes duplicate-file,
corruption, currency, fee, partial-fill, and long/short fixtures.

### Phase 2 — deep local parity and Hermes intelligence

- Add prioritized broker CSV parser packs and a transparent field-mapping UI.
- Add calendar/compare/custom-tag reports, playbook analytics, MAE/MFE, running
  P&L, and exit-efficiency analysis when the input data supports them.
- Port data/config types, indicators, v6.2, risk evaluation, correlation,
  drawdown, posture, and the daily report composer as Hermes differentiators.
- Add Keychain and a direct read-only provider adapter only after written
  mobile/distribution approval from that provider.
- Refresh on launch, resume, and pull-to-refresh; record positive task evidence.
- Treat iOS background refresh as opportunistic, never as an exact schedule.

Exit gate: Python 3.11 fixtures and owner-confirmed TradingView tapes agree on
public outputs; missing and stale data stay visibly missing/stale; no write-capable
broker surface exists.

### Phase 3 — iOS beta and submission

- Replace generated Capacitor icon/splash placeholders with final Hermes assets.
- Complete VoiceOver, Dynamic Type at 200%, reduced-motion, keyboard, portrait,
  landscape, small-phone, and large-phone checks.
- Test cold launch, migration, export/import, interruption, memory pressure, and
  offline relaunch on physical supported iPhones.
- Finalize privacy nutrition labels, support/privacy URLs, screenshots, copy,
  age rating, financial disclaimer, review notes, and App Review sample path.
- Archive with the required current Xcode, upload to TestFlight, run external beta,
  then set the App Store price to $9.99 and submit.

Exit gate: signed archive, physical-device matrix, TestFlight evidence, provider
rights, App Store metadata, and human product/legal review are complete.

### Phase 4 — Android parity

- Add the Capacitor Android target after iOS navigation and domain contracts freeze.
- Reuse the TypeScript core, fixtures, sample data, and responsive UI.
- Implement Android Keystore, SQLite lifecycle, WorkManager best-effort refresh,
  notifications, export/import, back navigation, and edge-to-edge safe areas.
- Complete Play Data Safety, content rating, signing, closed testing, and the
  local-currency price corresponding to the same one-time product.

Android parity means behavioral/data-contract parity, not pixel imitation of iOS.

## Competitive baseline

Verified against TradeZella's official materials on 2026-07-09:

- [Pricing and feature matrix](https://www.tradezella.com/pricing)
- [Current pricing help](https://help.tradezella.com/en/articles/8911582-our-pricing)
- [Generic CSV import](https://help.tradezella.com/en/articles/8239862-how-to-import-trades-from-unsupported-broker-into-tradezella-via-generic-csv-file-upload)
- [Tags and cross-analysis](https://help.tradezella.com/en/articles/11595729-reports-tags)
- [Strategies and rules](https://help.tradezella.com/en/articles/7020769-getting-started-with-strategies)

TradeZella's two pricing pages currently disagree on plan names and some replay
entitlements. Hermes benchmarks the documented product-wide capability set, not
an unstable tier-by-tier promise. Reverify these pages before launch positioning.

## Launch blockers that code cannot resolve alone

1. Access to a Mac running the current required Xcode plus an enrolled Apple
   Developer account.
2. Written provider permission for any direct connected market-data, broker
   sync, chart, replay, or backtesting workflow. CSV/manual launch does not wait
   on this gate.
3. Confirmation that the bundle identifier and public App Store name are owned
   and available.
4. Final app icon, screenshots, support URL, privacy URL, and product copy.
5. Human review of financial-risk language and App Store disclosures.

Until those gates clear, sample mode, file import, local calculations, and the
journal can progress without creating a recurring service obligation.
