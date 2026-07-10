# Hermes — Session Handoff
**2026-07-05 · written at owner's request on retirement of the building session**
For the next assistant (or future session): read this, then ARCHITECTURE.md,
then the master plan section below. The owner is Kevin (GitHub `Ayyitskevin`).

## What Hermes is, in three lines
Self-hosted decision-support dashboard for one regime-following swing trader.
**Hard boundary, never crossed: no order-placement code, no broker write
access** — CI-enforced by `tests/test_no_order_paths.py`. All sizing is % of
equity; no account dollar figures anywhere. Honesty is the product: every
number carries source/as-of/caveat; missing stays missing.

## State of main (all merged 2026-07-04/05)
- **PR #1**: full V1 — regime engine (pluggable), risk layer, journal with
  reviewer second-pass, daily-check scheduler, three data providers (alpaca
  default / sample / databento stub), Station-design web UI, ops tooling.
- **PR #2**: Regime Label v6.2 (owner's TradingView classifier) ported to
  `src/hermes/regime/v62.py`, now DEFAULT. Fidelity: `docs/REGIME_V62_PORT.md`.
- **PR #3**: parity target re-pointed to the AIO v3.2 regime module.
- **PR #4**: same-second job-run ordering fix + ops notes from a full deploy
  rehearsal (runbook verified end-to-end in-container).

## In flight on branch `claude/hermes-repo-setup-eptgaa`
RS leadership board (master plan Phase 5 #1): `src/hermes/rs/board.py`,
`GET /api/rs/board`, dashboard plate, METHODOLOGY/ARCHITECTURE entries.
Ruff clean, 65 existing tests green. **Missing: `tests/test_rs_board.py`**
(build agent hit session limit mid-docs) — write it before merge: leader →
LONG-OK/HI-CONV under bull reading, laggard → SKIP-LAG, short history →
missing, non-bull regime caps at WATCH. Branch protocol: after any merge,
restart this same branch from origin/main (`git checkout -B ... origin/main`),
force-with-lease push OK; commits as `Claude <noreply@anthropic.com>`
(environment signs only that identity), owner's identity appears via merges.

## The TradingView side (NOT in this repo — deliberately; order-shaped code
is banned here). Owner holds all files via chat:
- **Five-Tool Confluence AIO v3.3** — canonical strategy (regime + RS + div
  + AVWAP + risk/exits). v3.2 = owner's v3.1 + 6 review fixes + 2 compile
  fixes; v3.3 adds the D13 fix (equity-halt rolling-peak re-arm + red HALT
  banner). Regime core verified model-identical to `v62.py` at daily defaults.
- **Unified Operating Playbook v1.3** — doctrine + deficiency ledger D1–D14.
- **Phase 4 campaign kit + report draft** (see below).

## Phase 4 validation campaign — done, verdict UNSIGNED
Independent Python replication (`aio_v32_backtest.py`, scratchpad-only,
stdlib, 16+1-item deviation manifest) run on owner's TradingView CSV exports
(8 symbols, 2019→2026-07). **Parity: 100.00% regime match on all files vs
the chart's own exported series**; z within 2e-15. Results (defaults, costs
0.05%/side): QQQ PF 1.95 (OOS 1.53, WF 5/6), SPX 2.24, NVDA 3.54†, META
1.83†, AAPL 1.63†, MSFT ~1.0† (one trade = 388% of net), AMZN 1.40†,
**IWM 0.41 (negative)**. † = pre-registered survivorship caveat. Every cell
n<30 entry events → individually anecdote-grade. **Draft verdict:
CONDITIONAL-EDGE** — per-trade quality on liquid large-cap/tech trend
vehicles only; low-frequency overlay (~3 signals/yr/symbol), not an index
substitute. Ablations: RS gate and divergence triggers *hurt* (flip-only
variant V-A: QQQ 2.52, 6/6 WF); AVWAP/protections inert at 1% sizing.
Held as evidence under change control (ledger D14), NOT made default.
**Pending before signing**: owner's Strategy Tester cross-check readings
(QQQ+NVDA, defaults — re-add strategy first, D13 can void a halted tester)
and father-in-law external review (§6 attack list in the campaign kit).

## Discoveries worth knowing
- **D13**: v3.2's equity-DD halt was a one-way trap (halted → equity frozen
  → halted forever). Proven by owner's own exports (NVDA/AAPL frozen at
  25.47% DD, zero signals). Fixed in v3.3.
- **D14**: see ablations above. Any filter change = new variant = reviewer
  pass + own campaign (Playbook §7 change control).
- Pine v6 gotchas that bit us: same-ID strategy.exit zombie orders;
  `expr[1]`+`lookahead_on` for non-repaint HTF; ternaries evaluate both
  branches (volume-less symbols); `input.time` needs const-string
  `timestamp("...")`; `ta.*` must run unconditionally.

## Master plan (owner's copy via chat; gates are the owner's to call)
P1 one-brain ✔ (10-day chart-vs-dashboard parity glance in progress) ·
P2 deploy on owner's box (runbook rehearsed; OPERATIONS.md; ~20 min) ·
P3 journal habit (20 resolved entries gate) · P4 campaign ✔ draft (above) ·
P5 selection layer (RS board = first piece, in flight) · P6 ops hardening +
broker READ-ONLY (guard must evolve first — see ARCHITECTURE.md roadmap #6) ·
P7 multi-agent debate (gated on P3+P4) · P8 menu.

## Working conventions that made this work
One phase in flight. Adversarial review before shipping (every artifact
above went through it; the owner's own revision produced 6 findings — rule
applies to everyone). Evidence over silence (job_runs/MISSED; "silence is
not evidence"). Small n labeled anecdote everywhere. When docs and code
disagree, fix the docs. The owner brings trading judgment and the merge
button; you bring code and the review loop.


## 2026-07-10 — A/B desk improvements (Grok)

Landed on branch `grok/a-b-desk-improvements` (see commit):

- **A2** trade-memory reflection on journal close (`reflect_trade` via AIRouter)
- **A3** chart↔dashboard parity ritual (`/api/parity`, UI #/parity, P1 streak)
- **A4** daily-check narrative via AIRouter (local-first)
- **A5** premarket briefing (`/api/briefing`, UI #/briefing, `hermes briefing`)
- **A1/B5** doctor gates + restore-drill CLI/API (`hermes doctor`, `restore-drill`)
- **B2** monthly performance (`/api/reports/monthly`, UI #/monthly)
- **B3** campaign status plate (`/api/campaign`, UI #/campaign)
- **B4** screener compression (VCP-ish) flags on rows
- **B6** structured debate + attach-to-proposal (`/api/debate/{sym}/structured`, POST `/api/debate/attach-proposal`)
- **B1** boundary guard evolved (method-aware); sealed `broker_ro/` paper GET → % cache; risk merge optional

Habit gates P2/P3 remain the owner's to close. Pre-existing v62 synthetic-tape test failures unchanged.
