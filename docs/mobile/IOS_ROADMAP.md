# Hermes Journal iOS product roadmap

Status: active product plan · updated 2026-07-09

## Product decision

Hermes Journal is an original, mobile-first trading journal for a broad trading
audience. It replaces the earlier single-trader cockpit direction. TradeZella is
used only to benchmark useful capabilities; Hermes must not copy its protected
name, copy, graphics, assets, or interface. Hermes is not affiliated with,
endorsed by, or sponsored by TradeZella.

Working product promise:

> A private trade journal that shows what is working—for one upfront purchase.

Commercial contract:

- iPhone first, Android after iOS behavior and data contracts stabilize.
- $9.99 upfront App Store price.
- No subscription and no second lifetime-unlock purchase.
- Core journal records and reports work without an account or network service.
- The app never places or modifies a brokerage order.

“Hermes Journal” is a working name. `app.hermesjournal.mobile` is a provisional,
neutral bundle identifier. Name, trademark, domain, and App Store availability
must be cleared before the App Store record is created. Apple does not allow the
bundle ID to change after a build has been uploaded, so no build may be uploaded
under the provisional identifier until that gate is cleared.

## Opportunity and honest rating

- **7/10** micro-product potential as a polished, privacy-oriented alternative
  to the core import → journal → review workflow.
- **4/10** if marketed as literal parity with every hosted TradeZella service for
  $9.99; real-time integrations, licensed data, hosted sync, and recurring AI
  have continuing costs.
- **4/10 current readiness**: the execution ledger and generic CSV loop now run
  end to end with tested rollback, but the annotation/export/release surfaces
  and native Mac/device evidence are still incomplete.

TradeZella currently advertises $29/$49 monthly plans and $288/$399 annual
prices. That gives Hermes a large price wedge, but price alone is not the product:
fast mobile review, user-owned data, reliable import, and trustworthy analytics
must carry the value.

At $9.99, approximate developer proceeds are $6.99 under Apple's standard 30%
commission or $8.49 at 15%, before taxes, refunds, and operating costs. The
[Apple Developer Program](https://developer.apple.com/programs/whats-included/)
also has an annual membership cost. Recheck commission eligibility and
[App Store pricing](https://developer.apple.com/help/app-store-connect/manage-app-pricing/set-a-price)
before launch; maintenance and support still need a unit-economics gate.

## Capability boundary

| Layer | Hermes Journal commitment |
|---|---|
| $9.99 launch core | Local accounts; executions and partial exits; quantity, price, fees, commissions, currency P&L, percent return and R; manual entry; generic CSV import with preview/deduplication/rollback; trades and calendar; daily/trade notes and screenshots; setup/mistake/emotion tags; playbooks and rules; filters; core performance reports; versioned export/restore/delete-all-data; position sizing |
| Local post-launch depth | Prioritized broker CSV parser packs; options/futures contracts; MAE/MFE and exit efficiency when data supports them; journal templates; richer comparison reports; PDF/share summaries; user-supplied price-file analysis; optional local or bring-your-own-key assistance |
| Not included without a new approved model | Developer-funded real-time sync across hundreds of brokers; hosted multi-device storage; licensed tick/Level II history; turnkey cloud replay/backtesting; recurring AI credits; mentor communities; prop-firm monitoring; high-touch managed support |

The flat price must never depend on an unpriced recurring service. Features with
ongoing costs need user-supplied infrastructure or a separately approved product
decision.

## Information architecture

Five destinations:

1. **Dashboard** — net P&L/R, core metrics, curve, calendar, process review, recent trades.
2. **Trades** — search, filters, list/calendar views, trade detail, executions, notes, tags, screenshots.
3. **Journal** — daily notes, trade reviews, templates, emotions/mistakes, playbooks, rules.
4. **Reports** — expectancy, profit factor, drawdown, streaks, and breakdowns by setup, tag, symbol, direction, day, and time.
5. **More** — imports, accounts, tags/playbooks, planning tools, backup/export, settings, privacy, help, and legal.

Add/manual-import actions are task controls, not navigation tabs. They appear
only when their durable workflow exists; the foundation must not ship dead
buttons that imply records can be saved.

## Runtime architecture

```text
Capacitor iOS shell
  mobile task-oriented UI
    typed application services
      pure TypeScript journal and analytics core
        encrypted local SQLite repositories
        file import/export adapters
        Keychain adapter for future user-owned credentials
        best-effort platform lifecycle adapters
```

Python, FastAPI, APScheduler, systemd, and the legacy cockpit are not embedded in
the phone. A deterministic legacy calculation is reused only after it is
extracted behind a neutral contract and shared golden fixture.

## Execution-first data model

The mobile schema is new; it does not evolve the legacy percent-only journal row.
Numbered migrations will cover:

- workspaces, accounts, brokers, and base currencies;
- import batches, source rows, mappings, validation results, and rollback state;
- instruments and contracts;
- executions/fills with side, quantity, price, fee, commission, currency, and time;
- normalized trades that group partial entries/exits without discarding source evidence;
- notes, attachments, tags and tag categories;
- playbooks, rules, and per-trade rule reviews;
- daily journal entries and report snapshots;
- export schema version and migration history.

Imports must be idempotent. Source rows remain explainable, duplicate files do
not duplicate performance, and a failed batch cannot leave a partial journal.

## Delivery phases

### Phase 0 — neutral paid-app foundation (delivered in the current draft)

Delivered:

- Vite/TypeScript/Capacitor 8 workspace and CocoaPods iPhone target.
- Original Hermes Journal identity, with personal photography naming removed.
- Dashboard, Trades, Journal, Reports, and More navigation.
- Three-step journal onboarding with the empty private journal as the primary
  choice and persistent, explicit fictional-demo provenance.
- Eight coherent fictional trades with P&L/R/win-rate/profit-factor/expectancy
  derived from the same records.
- Working trade search and position-size planning tool.
- Safe areas, 44-point controls, focus containment/return, route announcements,
  reduced motion, and 200% short-landscape browser coverage.
- Production CSP blocking all network connections in the demo.
- Linux CI for locked install, TypeScript, unit tests, browser flows, bundle
  build, Capacitor sync, and the legacy Python safety suite.

Not delivered in Phase 0: durable financial records, manual entry, CSV file
selection, native device/Xcode evidence, final branding, or App Store metadata.

### Phase 1 — durable import → journal → report slice

Delivered in the current vertical slice:

- Numbered SQLite v1 migration with STRICT tables, foreign keys, checksums,
  immutable import/execution facts, mutable heads, and generation-scoped derived
  projections.
- SQLCipher configuration through pinned `@capacitor-community/sqlite` 8.1.0,
  with a random secret stored by the plugin in the iOS Keychain.
- Generic RFC 4180 CSV selection, mapping/remapping, exact raw-row provenance,
  explicit limits, IANA-zone parsing, DST gap/fold rejection, and exact decimal
  validation entirely on device.
- Stale-preview protection, single-workspace currency enforcement, idempotent
  active duplicate files, same-source changed-payload conflicts, per-account
  receipt attribution, immutable import-occurrence coverage, atomic commit, and
  dependency-aware rollback/restoration through void and non-void versions.
- Deterministic FIFO normalization for partial entries/exits, long/short
  reversals, proportional fees/rebates, contract multipliers, and
  currency-separated totals, with stable equal-timestamp ordering and
  opening-allocation trade identities.
- Replay-safe migration statements plus native fail-closed checks for missing
  Keychain secrets, encryption, SQLite/SQLCipher integrity, foreign keys,
  schema version, and migration receipts.
- Explicit empty, fictional-demo, and real-workspace UI states; imported
  execution projections drive the Dashboard, Trades, Reports, calendar, curve,
  import history, and rollback controls.
- Real SQL.js schema/repository tests plus browser import/rollback coverage.

Still required in Phase 1:

- Verify native encryption, Keychain loss/reinstall behavior, backup behavior,
  CocoaPods lock resolution, kill/relaunch persistence, and migrations on a Mac
  and physical iPhone.
- Build manual execution entry.
- Add trade list/detail, executions, account selection, calendar, notes, setup/
  mistake/emotion tags, playbook assignment, and core reports.
- Add versioned export/restore and Delete All Data, including attachment cleanup.

Exit gate: manual/CSV input → normalized trade → journal metadata → dashboard/
report → export/restore works in airplane mode, survives kill/relaunch, and
passes duplicate, corruption, currency, fee, partial-fill, and long/short tests.

### Phase 2 — journal depth and release-quality workflows

- Add prioritized broker-specific CSV adapters behind the generic mapping core.
- Add options/futures contract fields and commission-aware calculations.
- Add attachments/screenshots with quota, export, deletion, and orphan cleanup.
- Add templates, reminders, deeper filters, drawdown/streak/time-of-day/setup/tag
  reports, and explainable report drill-down.
- Add app-local privacy policy, help, disclaimers, and a complete data-management surface.
- Add optional local or user-funded intelligence only after privacy and cost review.

Exit gate: reports reconcile against fixtures/source records, every stored field
exports and deletes correctly, and failures remain visible and recoverable.

### Phase 3 — iOS beta and App Store submission

- Replace generated Capacitor icon/splash placeholders with cleared, original assets.
- Run Xcode 26+, Simulator, physical iPhone, VoiceOver, Dynamic Type, reduced
  motion, keyboard, orientation, migration, interruption, and offline relaunch tests.
- Confirm final name/bundle ID, signing, privacy manifest, SDK behavior, and archive.
- Publish support/privacy URLs and complete privacy nutrition labels, age rating,
  category, screenshots, description, keywords, review notes, and disclaimer.
- Configure a $9.99 paid app under the Paid Apps Agreement; do not create a
  subscription or in-app lifetime unlock.
- Distribute through TestFlight before human-reviewed submission.

Exit gate: signed archive, device matrix, TestFlight evidence, final privacy/
legal/product review, and human App Store submission approval are complete.

### Phase 4 — Android parity

- Add the Capacitor Android target after iOS contracts freeze.
- Reuse the TypeScript domain, fixtures, responsive UI, and import/export format.
- Implement Android Keystore/storage lifecycle, document picker/share sheet,
  backup behavior, back navigation, and edge-to-edge safe areas.
- Complete Play Data Safety, content rating, signing, closed testing, and the
  local-currency one-time paid price.

Parity means behavioral and data-contract parity, not pixel imitation of iOS.

## Competitive evidence

Verified against official materials on 2026-07-09:

- [TradeZella pricing and feature matrix](https://www.tradezella.com/pricing)
- [TradeZella pricing help](https://help.tradezella.com/en/articles/8911582-our-pricing)
- [Generic CSV import](https://help.tradezella.com/en/articles/8239862-how-to-import-trades-from-unsupported-broker-into-tradezella-via-generic-csv-file-upload)
- [Tags and cross-analysis](https://help.tradezella.com/en/articles/11595729-reports-tags)
- [Strategies and rules](https://help.tradezella.com/en/articles/7020769-getting-started-with-strategies)

TradeZella's pricing pages currently disagree on some tier names/entitlements.
Hermes benchmarks the documented product-wide capability set, not an unstable
tier-by-tier claim. Reverify before public comparative positioning.

## Launch blockers outside Linux implementation

1. A Mac with the current App Store-required Xcode and an enrolled Apple Developer account.
2. Final brand/name/trademark/domain and bundle-identifier clearance.
3. Final icon, screenshots, support URL, privacy URL, and App Store copy.
4. Human review of financial, privacy, and comparative claims.
5. Written rights review before any broker sync, market-data, chart, replay, or backtest integration.

The next implementation slice is Phase 1's manual entry plus durable annotations,
followed by versioned export/restore/delete-all—not broker connectivity or legacy
cockpit extraction.
