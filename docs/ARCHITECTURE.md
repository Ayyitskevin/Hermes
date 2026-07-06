# Hermes — Architecture

*The Phase 1 proposal, as built. Read together with [DESIGN.md](DESIGN.md) —
the technical plan and the visual plan were reviewed as one.*

## What Hermes is

A self-hosted, open-source, AI-assisted **decision-support** dashboard for one
systematic regime-following swing trader (daily/4H/weekly bars, US equities).
It analyzes and recommends; a human places every trade.

**The hard boundary, stated once and enforced everywhere:** there is no
order-placement code, no broker write access, and no path by which Hermes
could place or modify a live order. The only Alpaca host in the codebase is
the data host (`data.alpaca.markets`). CI runs a guard test
(`tests/test_no_order_paths.py`) that fails the build if a trading endpoint,
trading base URL, or order-shaped API ever appears.

## Phase 0 decisions (as configured)

| Decision | Choice |
|---|---|
| Trading style | Systematic regime-following swing trading — daily bars primary; 4H/weekly available (Alpaca supports `4Hour`/`1Week` timeframes) but V1 workflows run on `1Day` |
| Data source | **Alpaca** default (free real-time IEX feed; paper account is enough, no funding). **Databento** documented fallback. **Sample** provider for zero-key runs |
| Where it runs | Always-on machine, as a real systemd service (`deploy/hermes.service`) |
| AI inference | **Local-first**: Ollama for routine narrative/critique work, chosen by default. Cloud (Claude) is the **deliberate exception** — off unless `ai.allow_cloud` is set. A router (`ai/router.py`) routes local-first and reaches for the cloud only when a task opts in or the operator asks; a down backend falls back to the other (labeled), both down degrades visibly. Landed V2 (see roadmap #12) |
| Regime classifier | Pluggable. **Regime Label v6.2** (the owner's classifier, ported from its TradingView source) is the default; `reference-v1` (named published methods) remains as a second opinion. Fidelity notes in [REGIME_V62_PORT.md](REGIME_V62_PORT.md) |
| Open source | MIT. No personal paths/IPs/secrets; credentials via `.env` only (`.env.example` documented); README covers setup from zero |
| Position sizing | Everything is % of account equity. No *account* dollar figures — balances, dollar position sizes, dollar P&L — are asked for, stored, or displayed; only per-share market prices appear, and sizing is derived from them as % of equity. Drawdown is tracked on a normalized 100-based equity index |

## Reference architectures — verified, not assumed

Both references were re-verified against live sources on 2026-07-04:

**Pattern A — `tradermonty/claude-trading-skills`** (MIT, ~2.2k stars — up
from ~1.6k; actively maintained, commits within the last day). Confirmed: the
seven skill categories, the five tiered workflows (plus four newer ones), the
no-paid-API starter path, and `edge-strategy-reviewer` — a deterministic
quality gate scoring overfitting risk, sample-size adequacy, and execution
realism. Its `market-regime-daily` workflow outputs **a posture (allow /
restrict / cash-priority), not a directive** — Hermes adopts that vocabulary
verbatim. Its `portfolio-manager` reads holdings from Alpaca via MCP,
read-only — the working precedent for Alpaca as a data source.

**Pattern B — `TauricResearch/TradingAgents`** (Apache-2.0, ~90.7k stars,
v0.3.0 June 2026). Confirmed: the analyst → bull/bear debate → trader → risk
debate → portfolio-manager pipeline (analysts now run *sequentially*; the
"concurrent" description is stale), multi-provider LLM support including
Ollama, and no broker API anywhere. Its `TradingMemoryLog` + `Reflector`
pattern — each decision resolved later against realized return and **alpha
vs SPY**, then reflected on in prose — is the direct model for Hermes'
journal resolution loop.

What both share, kept as Hermes' first principle: no live broker connection
by default, human decision gates central.

## V1 scope (all of it built, none of it more)

1. **Daily market check** — scheduled premarket job: sync → regime → risk
   sweep → posture → morning report (+ optional local-LLM narrative,
   visibly skipped when Ollama is down).
2. **Regime engine** — pluggable classifier; `reference-v1` composite of
   five named published methods, each carrying claim + methodology + caveat
   (the teach-in payload); readings persisted with evidence and provenance.
3. **Risk layer** — fixed-fractional sizing, open-risk budget, single-position
   and sector concentration, pairwise correlation, drawdown circuit breaker
   on the normalized equity index; `ok/warn/breach` state that dominates the
   UI; breaches persist as events requiring acknowledgment.
4. **Trade journal** — propose (sizing + reviewer verdict) → commit → close →
   resolve against realized return, benchmark return, alpha, and a mandatory
   *did-the-thesis-play-out* verdict; performance summary that calls its own
   small samples anecdotes.

Supporting V1 infrastructure: reviewer second-pass (rule checks always,
local-LLM critique when available), observability (canonical log lines,
per-component files, `job_runs` positive evidence, MISSED detection, manual
run paths), three data providers, the web UI, tests, CI, systemd unit.

## Module map

```
src/hermes/
├── config.py        env + TOML config; secrets only from environment
├── oplog.py         canonical log lines: ts · action · source · latency · outcome
├── db.py            SQLite (WAL) + numbered SQL migrations
├── migrations/      0001_init.sql — bars, snapshots, regime_readings,
│                    journal_entries, equity_index, risk_events, job_runs, reports
├── data/
│   ├── models.py    Bar/Snapshot (source + as-of mandatory), ProviderState
│   ├── provider.py  MarketDataProvider protocol (read-only by construction)
│   ├── alpaca.py    default; data.alpaca.markets only; 429 → visible RATE_LIMITED
│   ├── databento.py thin fallback (daily bars, honest about its limits)
│   ├── sample.py    deterministic synthetic tape; zero-key runs and tests
│   ├── registry.py  config-driven provider selection
│   └── store.py     bar/snapshot cache + staleness (live/stale/dead)
├── regime/
│   ├── models.py    RegimeReading + Evidence (claim/methodology/caveat)
│   ├── indicators.py pure-function math (tested; returns None when data short)
│   ├── reference.py reference-v1 classifier (five named methods)
│   ├── v62.py       Regime Label v6.2 (owner's classifier, ported; DEFAULT)
│   └── engine.py    registry + persistence
├── rs/board.py      Mansfield RS leadership board (Weinstein 1988) — watchlist
│                    vs benchmark, verdicts capped by the current regime
├── portfolio/review.py  weekly portfolio review: regime coherence, sector
│                    heat, full correlation matrix, journal-informed exposure
├── screener/trend_template.py  Minervini Trend Template (2013) — watchlist
│                    scored 0–8 into PASS/NEAR/NO candidates (never setups);
│                    RS criterion reuses the rs board's Mansfield line as a proxy
├── risk/engine.py   sizing, limits, correlation, drawdown; RiskState
├── journal/service.py  propose/commit/close/resolve; equity index
├── review/reviewer.py  second-pass: overfitting, sample size, execution realism
├── ai/
│   ├── ollama.py    local-first inference (default); failures degrade visibly
│   ├── claude.py    cloud path (Anthropic Messages API); the deliberate exception
│   └── router.py    local-first routing + visible fallback + cloud usage meter
├── jobs/
│   ├── runner.py    job_runs positive evidence wrapper
│   ├── sync.py      incremental bar/snapshot sync
│   ├── daily_check.py the daily workflow + posture derivation
│   ├── weekly_review.py the Sunday portfolio-review job (stores a report)
│   ├── backup.py      nightly SQLite online-backup snapshot + retention prune
│   └── scheduler.py APScheduler cron + MISSED detection (per-job day-of-week)
├── api/routes.py    JSON API incl. manual job triggers + positive-evidence health
└── main.py          FastAPI factory + CLI (serve / daily-check / sync / doctor)
web/                 hand-written HTML/CSS/JS, vendored OFL fonts, no build step
```

## Data integrity contract

- Every bar/snapshot row carries `source` and `fetched_at`; every displayed
  number carries source + as-of on screen.
- Missing values stay missing: indicators return `None` on short history,
  evidence shows `status: missing`, the UI shows `∅ missing`. Nothing is
  interpolated, ever.
- Staleness is computed, labeled (`live/stale/dead`), and displayed.
- Rate limits degrade visibly: Alpaca 429 → one logged retry → provider state
  `rate_limited` on the dashboard. Never a cached number dressed as live.

## Observability contract

- Log line format: `timestamp · action · source · latency · outcome (ok/retry/fail)`
  — written to per-component files under `logs/`, mirrored to stdout for journald.
- Every job run writes a `job_runs` row (start, finish, outcome, trigger).
  The dashboard compares evidence against the schedule and shows **MISSED**
  when an expected fire has no row — silence is never read as success.
- Every job has a manual override: `POST /api/jobs/{name}/run`, the UI's
  "run now" buttons, and the `hermes daily-check` / `hermes sync` /
  `hermes backup` CLI.
- Durability (ops hardening, Phase 6 #1): a nightly `backup` job snapshots
  `hermes.db` via SQLite's online-backup API and prunes to a retention bound;
  the latest snapshot is positive evidence in `/api/health`, and a backup that
  stops firing is itself MISSED-flagged. See [OPERATIONS.md](OPERATIONS.md).

## V2+ roadmap (named, ordered, deliberately not in V1)

1. **RS leadership board** — watchlist ranked by Mansfield relative strength
   vs the benchmark (the AIO's RS module in decision-support form; the
   "which names" layer of the premarket read).
   **LANDED 2026-07-05:** `src/hermes/rs/board.py`, `GET /api/rs/board`, the
   Leadership plate; methodology + caveats in
   [METHODOLOGY.md](METHODOLOGY.md#rs-leadership-board).
2. **Weekly portfolio review** workflow (Pattern A's `core-portfolio-weekly`).
   **LANDED 2026-07-05:** `src/hermes/portfolio/review.py`, the Sunday
   `weekly_review` job, `GET /api/reports/weekly`; a synthesis (not a new
   measurement) of regime coherence, sector heat, the full correlation
   matrix, and journal-informed exposure. Adding it generalized the
   scheduler's spec grammar to an optional per-job day-of-week
   (`"MIN HOUR DOW"`), leaving the three daily jobs' MISSED detection
   unchanged. Methodology + caveats in
   [METHODOLOGY.md](METHODOLOGY.md#weekly-portfolio-review).
3. **Swing-opportunity screener** — Minervini VCP / O'Neil CANSLIM /
   Follow-Through-Day detection (Pattern A's swing tier).
   **LANDED 2026-07-05:** `src/hermes/screener/trend_template.py`,
   `GET /api/screener`, the Screener plate — Minervini's eight-point Trend
   Template (2013) scored per watchlist symbol into PASS (8/8) / NEAR (6–7) /
   NO (<6) verdicts, ranked and read against the current regime (PASS/NEAR
   rows annotated context-only, not suppressed, when the tape is not a bull
   trend). Criterion 8 reuses the rs board's Mansfield RS line as a documented
   proxy for Minervini's market-wide RS rating. Outputs **candidates**, never
   setups: a candidate becomes a setup only via a journaled proposal, whose
   reviewer second-pass is the gate — the screener never calls it. CANSLIM's
   fundamentals are omitted (no fundamentals feed). On-demand like the RS
   board (no scheduled job). Methodology + caveats in
   [METHODOLOGY.md](METHODOLOGY.md#swing-screener-minervini-trend-template).
4. **Trade-memory reflection loop** — local-LLM one-paragraph reflection per
   resolved trade (Pattern B's `Reflector`), appended to the journal.
5. **Multi-agent debate mode** — bull/bear research debate → trader draft →
   risk critique, on Ollama (Pattern B's pipeline, decision-support only).
6. **Databento full adapter** — live TCP client + failover drill.
7. **Broker read-only position sync** — Alpaca paper positions into the risk
   sweep (read scope only; the no-write boundary is unchanged). NOTE: this
   requires talking to Alpaca's paper-trading host, which the boundary guard
   currently bans outright — the guard must evolve first (method-aware
   allowlisting or a dedicated read-only module with its own surface lock)
   before any trading-host URL may appear in source.
8. **Monthly performance review** — regime-conditioned stats once samples
   are meaningful (Pattern A's monthly tier).
9. **Options tools / pair-trade screener** (Pattern A satellites).
10. **Crypto feeds** (Binance/Coinbase/Kraken public data) if crypto enters scope.
11. **4H/weekly regime timeframes** — the classifier consumes whatever-
    timeframe bars it is handed (each `Bar` carries its timeframe); the daily
    workflow just always hands it `1Day` bars today. The reserved
    `market.timeframes` config knob is wired to nothing until this lands.
12. **AI cloud router + cloud path** — the "AI as headline" unlock.
    **LANDED 2026-07:** `src/hermes/ai/claude.py` (Anthropic Messages API client
    mirroring `OllamaClient`'s surface + the product's `desk_read` / `coach` /
    `debate` tasks), `src/hermes/ai/router.py` (`AIRouter` — local-first policy,
    visible fallback, `UsageMeter`), and `GET /api/ai/status` (backend
    reachability + the session usage meter that powers the model selector).
    Local-first is preserved: cloud is used only when `ai.allow_cloud` is true
    **and** a task opts in or the operator asks; if the chosen backend is down
    the router falls back to the other and labels which answered; if both are
    down it returns a visible "model unavailable" state while every computed
    number still renders. The AI layer stays data-in/prose-out — it never sees
    or emits an order. The only new outbound host is `api.anthropic.com`, an
    inference host (not a broker host), allow-listed as a reviewed decision in
    the boundary guard. Methodology + caveats in
    [METHODOLOGY.md](METHODOLOGY.md#ai-router--cloud-path). The existing daily
    check keeps calling Ollama directly until the Desk surface is rebuilt (that
    migration threads the router in without changing behavior when cloud is off).

## Data-source reality (verified 2026-07-04)

- **Alpaca free tier**: real-time IEX quotes/trades/bars, ~200 req/min,
  historical daily bars to ~2016, corporate actions, paper account sufficient.
  IEX is ~2–3% of consolidated volume — fine for liquid ETFs/large caps on
  daily bars; thin names may have gaps (shown as gaps).
- **Databento**: **no recurring free tier** — the "250k messages/month free"
  claim in circulation is wrong; new accounts get a **one-time signup
  credit** (~6-month expiry; current amount on databento.com). Zero-license-
  fee equities datasets (DBEQ.BASIC, EQUS.MINI) make it the right *paid*
  fallback; redistribution rights attach to an active subscription. Hermes
  ships a thin daily-bars adapter and says exactly this.
- **Polygon** (now Massive): free tier is end-of-day only, 5 req/min — not
  suitable for the daily premarket check. **IEX Cloud**: shut down 2024-08-31.
- **Latency truth**: for daily/4H/weekly regime-following, seconds of latency
  are indistinguishable from tick-level real-time. Hermes does not pretend
  otherwise and does not over-engineer for it.
