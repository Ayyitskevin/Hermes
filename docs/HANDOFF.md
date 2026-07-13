# Hermes Journal — active mobile handoff

Status: verified Slice B Linux milestone · updated 2026-07-13

task: Continue Hermes as an original, local-first iPhone journal for adult,
phone-first stock/ETF traders; begin Slice C user-owned export/restore/delete
without trade execution or a required hosted service.

stage: codex

lane: fleet-handoff

produced:

- `docs/mobile/PRODUCT_BLUEPRINT.md` and
  `docs/mobile/COMPETITIVE_ANALYSIS.md` define the evidence-backed audience,
  TradeZella/mobile wedge, staged-hybrid stack, proposed economics, metrics, and
  delivery gates. Exact prices remain unapproved hypotheses.
- Root `AGENTS.md` is the active repository contract. Conflicting desktop
  automation moved from `.claude/skills/` to non-loadable
  `docs/legacy/claude-trading-operation-skills/*/LEGACY_SKILL.md`.
- `mobile/src/ui/manual-execution-sheet.ts` provides reviewed stock/ETF manual
  capture; `mobile/src/application/prepare-manual-execution.ts` and
  `mobile/src/core/execution-input.ts` enforce exact decimals, selected-zone
  offset matching, and tamper-evident reviewed commands.
- SQLite schema v2 stores the reviewed command and unacknowledged result inside
  the SQLCipher database. Same-submission retry, same-session reconciliation,
  startup reconciliation, and a non-dismissible uncertain-status path prevent a
  lost native response from becoming a second fill.
- Native and browser stores preserve manual/CSV ownership, asset-class identity,
  immutable source facts, atomic projection rebuilds, and import rollback
  boundaries.
- The named mobile boundary CI gate scans production TypeScript, HTML,
  Capacitor config, Podfile, Swift/Objective-C/native project sources, dependency
  allowlists, CSP, transport APIs, broker SDKs, and order-write surfaces.
- SQLite schema v3, both journal stores, and the application layer now append
  immutable reviews to stable trade subjects with optimistic heads,
  tamper-evident commands, exact retry recovery, atomic batch tags, normalized
  vocabulary, playbooks/rules, user-confirmed risk, and optional stop context.
- Exact result-R v1 and stock/ETF percent-return v1 retain versioned formula,
  numerator, denominator, currency, null-reason, precision, and rounding
  evidence without changing execution facts.
- The mobile review sheet and Journal queue provide execution inspection,
  draft/completed editing, review-session streaks, focus containment,
  pending-save control freezing, and 320-pixel/200%-text reflow.

verified:

- `cd mobile && npm ci` — exit 0; 164 packages installed; 0 vulnerabilities.
- `cd mobile && npm run typecheck` — exit 0.
- `cd mobile && npm run test:boundary` — exit 0; 1 file, 2 tests passed.
- `cd mobile && npm test` — exit 0; 24 files, 248 tests passed.
- `cd mobile && npm run test:e2e` — exit 0; 19 Playwright journeys passed.
- `cd mobile && npm run build` — exit 0; 42 modules transformed and the
  production bundle emitted.
- `cd mobile && npm run ios:sync` — exit 0; production bundle built and copied;
  Capacitor found only `@capacitor-community/sqlite@8.1.0`. CocoaPods and
  `xcodebuild` were unavailable and explicitly skipped.
- `git diff --exit-code -- mobile/ios mobile/package-lock.json` — exit 0 after
  sync; no tracked native or lock drift.
- `cd mobile && npm audit --omit=dev` — exit 0; 0 vulnerabilities.
- `git diff --check` — exit 0.
- Independent read-only review found and rechecked case-stable revision
  identity, deterministic tamper classification, mixed-retry atomicity,
  north-star session semantics, focus/reflow, saved-version labeling, and
  successful-save refresh truthfulness. The final rereview returned clear with
  no remaining P1/P2 finding.
- `git show --no-patch --format='%H %P' 4ac0a5f` records normal merge
  `4ac0a5f86e98f7a96e7725ffc92f77eb4b4728c6` with reviewed milestone parent
  `b700ec0fbbed04f808f4f51f5ce8d637edb1f230` and former `origin/main`
  parent `da7ad61bb61fe5e036c6d6a85ef8217ef295832e`; no history was forced.

assumptions:

- `Hermes Journal` and `app.hermesjournal.mobile` are provisional. No App
  Store record/build upload, price, trademark, financial disclosure, signing, or
  Connect commitment is approved.
- A one-time Core and $9.99 are product hypotheses, not promises. TestFlight can
  validate usability, retention, and stated willingness to pay—not purchase
  conversion.
- Manual capture supports stock/ETF. Generic CSV currently classifies every row
  as stock; other asset classes are discovery segments until explicit contracts
  and fixtures exist.
- Linux SQL.js and browser evidence do not prove SQLCipher, Keychain, CocoaPods,
  Xcode, Simulator, physical-device lifecycle, backup, signing, or App Store
  behavior.

open:

- Before downstream work, verify `origin/main` descends from `4ac0a5f`, the
  GitHub default is `main`, and both GitHub Actions lanes passed on the shipped
  descendant. Do not infer any of those facts from this local handoff alone.
- GitHub's legacy Python lane still needs to verify the frozen Python code.
  Local Ruff/Pytest executables were unavailable; no legacy Python logic changed.
- Run every native gate in `docs/mobile/MAC_HANDOFF.md`, including v2→v3
  migration interruption/replay, review response loss, SQLCipher/Keychain,
  backup/reinstall, accessibility, archive, and device lifecycle.
- Implement Slice C's versioned export manifest before restore or Delete All
  Data so executions, historical/current reviews, vocabulary, metric
  definitions, and stable subject identity round-trip coherently. Do not start
  broker sync, hosted Connect, Android, recurring AI, or App Store submission
  in that slice.

## Legacy history

The Python/FastAPI cockpit and strategy-operation documents are retained,
explicitly labeled historical reference. They no longer define the active
product, stack, launch audience, or completion state.
