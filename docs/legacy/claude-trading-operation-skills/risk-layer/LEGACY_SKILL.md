---
name: risk-layer
description: The risk engine — fixed-fractional sizing, the five limits, correlation, and the drawdown breaker on a normalized equity index, all in % of equity and nothing in dollars. Fire this whenever sizing a position, changing a limit, reasoning about concentration/correlation/drawdown, or evaluating whether a plan is legal. Trigger phrases — "how big should this be", "what's my risk", "size this trade", "is the book too concentrated", "change the drawdown limit", "correlation warning". The rule the whole layer exists to enforce — risk outranks signal, and no single gap may ruin the account.
---

# risk-layer — the layer that outranks the signal

Risk is the sticky, dominant element of the operation. It can veto any trade and
be overridden by none — "nothing overrides it, including a beautiful chart."
Everything here is **% of account equity**; Hermes never sees a dollar figure
(see `boundary-doctrine`).

## The doctrine

**Fixed-fractional sizing** (Van Tharp % -risk model; Ralph Vince fixed-fraction
family). Pick the loss you tolerate per trade as a % of equity; the distance to
your stop sets the size:

```
stop_distance_pct = |entry − stop| / entry × 100
size_pct_equity   = risk_pct / stop_distance_pct × 100
```

Then cap. `size_position()` in `src/hermes/risk/engine.py` raises on an invalid
stop (a long's stop must sit below entry; a short's above), computes the raw
size, and caps it at the position limit — recording `capped_by` so the reviewer
can see that a capped size means *actual* risk is below the per-trade standard.

**The five limits** (defaults in `RiskConfig`, all % of equity, all
configurable — these are the owner's operating values):

| Limit | Default | Check |
|---|---|---|
| Max risk per trade | 1.0% | drives sizing |
| Max open risk (portfolio heat) | 4.0% | Σ planned stop-losses across all open positions ≤ cap |
| Max single position | 20.0% | no one position dominates the book |
| Max sector exposure | 30.0% | Σ size% by sector; untagged surfaces as `unspecified` and warns |
| Max drawdown (circuit breaker) | 10.0% | on the equity index |

`evaluate()` runs all five over open positions, returns one `RiskState` at the
worst level — `ok` / `warn` / `breach` — and **persists** any new warn/breach as
a durable `risk_event` (de-duped against the last unacknowledged one of the same
kind). A breach is a circuit breaker: the dashboard floods with it and the daily
report leads with it; posture becomes cash-priority regardless of regime.

**Correlation** — Pearson correlation of daily returns between every open pair,
worst pair reported, warns at |ρ| ≥ 0.70 over a 60-day lookback. The maxim:
*highly correlated positions are one position wearing two tickers* — two 15%
positions at ρ 0.9 are not diversified, they are a 30% bet with a disguise.
Insufficient history warns ("run the EOD sync"), never fabricates a number.

**The normalized equity index** — drawdown rides a 100-based index (starts at
100), moved on each journal close by the position-weighted realized return.
Drawdown = (peak − current) / peak. This is how the breaker works **without any
dollar figure ever existing** in the system.

## What NOT to do

**#1 failure: sizing that lets one gap ruin the account.** The seductive trap is
a very tight stop producing a huge fixed-fractional size — "tight stop + big
size is how one gap ruins a quarter" (the reviewer flags exactly this). A stop
inside daily noise (< ~0.35%) will be hit by randomness, not by the thesis
failing, and the size it implies is a landmine. Respect the caps as hard limits,
not suggestions; a plan that only fits by removing a cap does not fit. And never
let the signal layer talk over a breach — risk outranks it, full stop.

Second failure: reading correlation as diversification because the tickers
differ. Check ρ, not the names.

## Where it lives

- Engine: `src/hermes/risk/engine.py` — `size_position`, `evaluate`,
  `current_equity_index`, `_persist_events`, `RiskState`/`RiskCheck`/`SizingResult`.
- Limits config: `RiskConfig` in `src/hermes/config.py`.
- Correlation math: `correlation` / `daily_returns` in
  `src/hermes/regime/indicators.py`.
- Posture mapping (risk first, regime second): `derive_posture` in
  `src/hermes/jobs/daily_check.py`.
- Methodology + caveat: `docs/METHODOLOGY.md` ("Risk layer"). Tests:
  `tests/test_risk.py`.

## How to verify

`.venv/bin/pytest tests/test_risk.py -q` green. For a specific plan: confirm
`size_pct_equity = risk_pct / stop_distance_pct × 100`, that it is capped at the
position limit, and that adding it keeps Σ planned risk ≤ the open-risk cap. On
screen: a breach must dominate the page and force cash-priority posture; every
figure must be a % or the 100-based index, never a currency amount.
