# AGENTS.md — Hermes Journal

## Product truth

- The active product lives in `mobile/`: an iPhone-first, local-first trading
  journal for adult phone-first traders.
- Product strategy and scope live in `docs/mobile/PRODUCT_BLUEPRINT.md`.
- The proposed Core model is a one-time paid app; exact pricing is an unapproved
  hypothesis. An optional hosted Connect service is a gated future product, not
  an assumed dependency.
- TradeZella is a capability benchmark only. Never copy its name, trade dress,
  copy, assets, screenshots, or identity.
- Hermes is journaling, analytics, and user-directed deterministic calculator
  software—not investment advice. It never places, changes, routes, or cancels
  a trade and never promises trading outcomes.

## Sources of truth

Read these before changing the mobile product:

1. `docs/mobile/PRODUCT_BLUEPRINT.md` — product, stack, economics, and phases.
2. `docs/mobile/IOS_ROADMAP.md` — current delivery sequence.
3. `docs/mobile/LOCAL_LEDGER.md` — financial data and persistence invariants.
4. `docs/mobile/MAC_HANDOFF.md` — native acceptance evidence still required.

If legacy documentation conflicts with these files, the mobile contract wins
and the stale document must be flagged or archived rather than blended.

## Active and legacy boundaries

- `mobile/` is active product code.
- `src/hermes/`, `web/`, `deploy/`, root Python configuration, strategy docs,
  and the historical trading-operation skills are frozen legacy reference.
- Touch legacy code only for deterministic extraction with parity fixtures,
  legacy safety-test maintenance, or explicit archival work.
- Never extend the legacy journal schema for mobile records.
- Do not introduce legacy regimes, owner-specific strategy rules, systemd,
  broker credentials, market-data services, or hosted AI into the Core.

## Mobile invariants

- Native state is required to use SQLCipher-encrypted SQLite. The adapter must
  hand its random secret to the pinned plugin's secret API under the configured
  iOS Keychain prefix. Treat encryption and Keychain operation as unverified
  until recorded Mac/iPhone evidence exists; browser persistence is ephemeral
  development behavior.
- Preserve immutable source facts, execution versions, exact decimal strings,
  atomic writes, deterministic ordering, idempotency, and visible errors.
- Derived trades never replace executions. Annotations attach to stable trade
  subjects, not disposable projection rows.
- Never aggregate currencies without an explicit, sourced FX layer.
- Keep production `server.url` absent and CSP `connect-src 'none'` unless a
  separately approved privacy, security, and recurring-cost decision changes
  the product.
- No advertising SDK, IDFA, or financial/journal content in diagnostics or
  product analytics.
- Reward review and rule adherence, never trade count, turnover, risk, or P&L.
- The product name and bundle ID remain provisional. Do not upload a build or
  create an App Store record without human approval.
- Do not configure or publicly promise a price without explicit human approval.

## Engineering conventions

- Keep deterministic financial calculations in pure TypeScript. A model never
  calculates P&L, metrics, routing, retries, or status.
- Reuse the `JournalApplication` and `JournalStore` boundaries. Native and
  browser adapters must obey the same application contract.
- Financial form controls carry decimal strings; do not coerce them through
  JavaScript `number`.
- A write command is prepared and validated before commit, reverified at the
  store boundary, and committed atomically with its projection update.
- Every schema or formula change needs a version, checksum, migration/replay
  evidence, and export compatibility decision.
- Split mobile UI by feature/module as it grows; do not add large workflows to
  the existing `ui/app.ts` monolith.
- Keep changes surgical. Do not refactor the legacy prototype while building a
  mobile feature.

## Verification

For mobile changes, run the relevant subset and report every skipped gate:

```bash
cd mobile
npm ci
npm run typecheck
npm run test:boundary
npm test
npm run test:e2e
npm run ios:sync
npm audit --omit=dev
cd ..
git diff --check
```

Run Ruff/Pytest when legacy Python changes. Do not claim native readiness from
Linux: CocoaPods, Xcode, Simulator, physical-device, Keychain, SQLCipher,
signing, TestFlight, and App Store claims require recorded Mac/device evidence.
