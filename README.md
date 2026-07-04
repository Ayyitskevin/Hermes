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
  visibly pinches when the classifier is unsure. Every component of the
  reading opens a worksheet: what it claims, what was measured, which named
  methodology it draws from, and what it does *not* prove.
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

## Quickstart — zero keys, two minutes

Runs out of the box on a bundled deterministic sample tape (clearly stamped
`sample` everywhere it appears):

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
tier — new accounts get a one-time $125 credit.

## Local AI (optional)

If you run [Ollama](https://ollama.com), Hermes uses it — local-first — for
the morning narrative and a skeptical second opinion on trade theses. Set
`ai.ollama_url` / `ai.ollama_model` in the config. When Ollama is down,
those sections say so on screen; the numbers never depend on it. Cloud
inference is off by default (`ai.allow_cloud = false`) and is meant for
tasks you opt into deliberately, not for every skill.

## Deploy as a service

See [docs/OPERATIONS.md](docs/OPERATIONS.md) — systemd unit, canonical log
format (`timestamp · action · source · latency · outcome`), per-component
log files, MISSED-run detection ("silence is not evidence"), manual
overrides, backup.

## Documentation

| Doc | What's in it |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The Phase 1 proposal: decisions, verified reference architectures, V1 scope, module map, V2+ roadmap |
| [docs/DESIGN.md](docs/DESIGN.md) | The design plan and the genericness critique that shaped it |
| [docs/METHODOLOGY.md](docs/METHODOLOGY.md) | Every skill traced to a named methodology — and what each does not prove |
| [docs/REGIME_V62_PORT.md](docs/REGIME_V62_PORT.md) | The contract for porting the owner's Regime Label v6.2 classifier |
| [docs/OPERATIONS.md](docs/OPERATIONS.md) | Running it for real |

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
