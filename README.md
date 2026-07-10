# Hermes

A self-hosted, open-source, AI-assisted trading dashboard for one systematic
regime-following swing trader. It watches the market's regime, keeps risk in
front of your eyes at all times, and keeps a journal that grades itself
against reality.

**Hermes is decision-support only.** There is no order-placement code, no
broker write access, and no path by which it could place or modify a live
order — a CI guard test fails the build if one ever appears. It analyzes and
recommends; a human places every trade.

## What you get (V1)

- **Daily market check** — a scheduled premarket job that syncs data,
  classifies the regime, sweeps every risk limit, and writes a morning
  report ending in a *posture* — allow / restrict / cash-priority — not a
  directive.
- **Regime engine** — a pluggable classifier displayed as a strip-chart
  recorder: state lanes, a stepped ink trace, and a confidence ribbon that
  visibly pinches when the classifier is unsure. The default brain is
  **Regime Label v6.2** (the owner's volatility-adjusted momentum state
  machine, ported from its TradingView source); a published-methods
  composite (`reference-v1`) ships as a second opinion. Every component of
  the reading opens a worksheet: what it claims, what was measured, which
  named methodology it draws from, and what it does *not* prove.
- **Risk layer** — fixed-fractional position sizing, open-risk budget,
  concentration and correlation checks, and a drawdown circuit breaker on a
  normalized equity index (Hermes never knows a dollar figure). Risk state
  is the sticky, dominant element of the page; a breach floods it and dims
  everything else until acknowledged.
- **Trade journal** — every entry freezes thesis, signal state, and planned
  risk. Every close resolves against realized return, benchmark return, and
  alpha — plus the harder question: *did the thesis play out?* A reviewer
  second-pass (overfitting, sample size, execution realism) runs before any
  entry can be committed.

The rest of the ambition — portfolio reviews, screeners, multi-agent debate
mode — is a named, ordered roadmap in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), deliberately not in V1.

## Premium mobile app (in development)

Hermes is being rebuilt for iPhone first as a **$9.99 one-time paid app** and
privacy-first alternative to the core TradeZella journal workflow, with Android
parity after the iOS release. It is intentionally local-first: no subscription,
account, hosted inference bill, or developer-funded market-data service. The
current native foundation includes an offline journal/performance workspace,
Today/Trades/Journal/Insights/More navigation, risk-first onboarding,
and a tested fixed-fractional position-sizing port.

```bash
cd mobile
npm ci
npm test
npm run build
npm run test:e2e
npm run ios:sync
```

The TypeScript bundle and native iOS container can be generated on Linux,
but signing, simulator/device checks, archiving, and App Store submission
require macOS with Xcode. Product scope, launch gates, and the Android follow-on
are tracked in [docs/mobile/IOS_ROADMAP.md](docs/mobile/IOS_ROADMAP.md).

## Quickstart — zero keys, two minutes

Requires **Python 3.11+**. Runs out of the box on a bundled deterministic
sample tape (clearly stamped `sample` everywhere it appears):

```bash
git clone https://github.com/Ayyitskevin/Hermes.git && cd Hermes
python3 -m venv .venv && .venv/bin/pip install -e .
.venv/bin/hermes serve
# → http://127.0.0.1:8642  (click "run now" on daily_check, or:)
.venv/bin/hermes daily-check
```

## Real data — Alpaca (free)

1. Create a free account at [alpaca.markets](https://alpaca.markets) — the
   **paper-trading account is enough**; no funding. Generate API keys.
2. `cp .env.example .env` and fill in `APCA_API_KEY_ID` / `APCA_API_SECRET_KEY`.
3. `cp config/hermes.example.toml config/hermes.toml`, set
   `data.provider = "alpaca"`, adjust the watchlist and risk limits
   (all limits are % of equity).
4. Restart. You now have real-time-enough IEX data (free tier) with deep
   daily history. Rate limits and staleness degrade *visibly* — a
   rate-limited provider shows as rate-limited, never as a stale number
   pretending to be live.

Databento is wired as a documented fallback (`data.provider = "databento"`),
with its economics stated honestly in
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): there is no recurring free
tier — new accounts get a one-time signup credit that expires after roughly
six months (check databento.com for current terms).

## Local AI (optional)

If you run [Ollama](https://ollama.com), Hermes uses it — local-first — for
the morning narrative and a skeptical second opinion on trade theses. Set
`ai.ollama_url` / `ai.ollama_model` in the config. When Ollama is down,
those sections say so on screen; the numbers never depend on it. Cloud
inference is a **reserved V2 slot**: the config knobs (`ai.allow_cloud`,
`ai.cloud_model`, `ANTHROPIC_API_KEY`) exist for forward-compatibility but no
cloud code path ships in V1 — setting them currently does nothing, by design
and on purpose (local-first means the cloud is the deliberate exception, and
it hasn't been needed yet).

## Deploy as a service

See [docs/OPERATIONS.md](docs/OPERATIONS.md) — systemd unit, canonical log
format (`timestamp · action · source · latency · outcome`), per-component
log files, MISSED-run detection ("silence is not evidence"), manual
overrides, backup.

## The strategy it supports — and the playbook to run it

Hermes is the dashboard-and-journal half of a two-surface system. The other
half is the owner's TradingView strategy, the **Five-Tool Confluence AIO
v3.5-SHORT** (regime · relative strength · divergence · anchored VWAP · risk),
whose regime engine is the very `v62` classifier ported in
[docs/REGIME_V62_PORT.md](docs/REGIME_V62_PORT.md) — so the chart and the
dashboard read the same regime, bar for bar.

Recent work on that strategy: an on-chart **empirical Markov transition
readout** (the same persistence statistics Hermes' Regime Lab computes), a
**Long/Short validation split** with sample-size flags, and a **dedicated
short-side variant** that is firmly **off the validated path** — an unvalidated
experiment recorded as a campaign in [docs/campaigns/](docs/campaigns/) and the
validation ledger, net-negative in testing, and kept off until it beats
longs-only out-of-sample.

**The strategy's order code is deliberately not in this repo** (the
no-order-paths boundary). What *is* here is the full human handbook — how to
read the strategy, practice it, size it, journal it, and validate any change:

**→ [docs/trading/](docs/trading/) — the Trading Strategy & Playbook handbook.**
Start with [The Hermes Playbook](docs/trading/The-Hermes-Playbook.md) (how to
play the thesis) and the
[Chart Reading Guide](docs/trading/CHART_READING_GUIDE.md) (how to read every
panel). Nothing in it promises profit; the long side is the tested workhorse,
the short side is an unvalidated experiment, and every figure is % of equity.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/trading/](docs/trading/) | **The trading handbook** — playbook, chart-reading guide, cheat card, quickstart, learning path, setups, risk & sizing, journal, validation protocol, FAQ, anti-patterns |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The Phase 1 proposal: decisions, verified reference architectures, V1 scope, module map, V2+ roadmap |
| [docs/DESIGN.md](docs/DESIGN.md) | The design plan and the genericness critique that shaped it |
| [docs/METHODOLOGY.md](docs/METHODOLOGY.md) | Every skill traced to a named methodology — and what each does not prove |
| [docs/REGIME_V62_PORT.md](docs/REGIME_V62_PORT.md) | The contract for porting the owner's Regime Label v6.2 classifier |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Running it for real |
| [docs/mobile/IOS_ROADMAP.md](docs/mobile/IOS_ROADMAP.md) | Paid-app contract, local-first architecture, iOS phases, launch gates, and Android parity |
| [docs/mobile/MAC_HANDOFF.md](docs/mobile/MAC_HANDOFF.md) | Exact macOS/Xcode build, signing, device-test, and App Store handoff |

## Development

```bash
.venv/bin/pip install -e ".[dev]"
.venv/bin/ruff check src tests
.venv/bin/pytest
```

The test suite includes `tests/test_no_order_paths.py`, which statically
scans the source for trading endpoints, broker-write hosts, and order-shaped
code. It is meant to fail loudly if anyone — including future-you — tries to
cross the one line this project promises never to cross.

## License

MIT — see [LICENSE](LICENSE). Vendored fonts (Archivo, B612 Mono) are under
the SIL Open Font License; texts in `web/fonts/`.

## Disclaimer

Hermes is a personal research and journaling tool. Nothing it displays is
financial advice. Markets involve risk of loss; every decision — and every
order — is yours.
