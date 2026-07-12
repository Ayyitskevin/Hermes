---
name: regime-parity
description: The Regime Label v6.2 model and the parity contract that binds Hermes' classifier to the owner's TradingView chart. Fire this whenever touching `src/hermes/regime/v62.py`, its constants, the regime reading, or when chart and dashboard show different regimes. Trigger phrases — "the regime is wrong", "chart says bull, Hermes says chop", "change the enter/exit threshold", "port the 4H preset", "why is the label different", "regime drift". The core rule — v62.py must stay model-identical to the AIO regime module at daily defaults — a persistent divergence is a bug, not a doctrine question.
---

# regime-parity — one brain, chart and dashboard

Regime Label v6.2 is the owner's classifier, ported to `src/hermes/regime/v62.py`
and the default brain. On the owner's charts the same core runs as the regime
module of the Five-Tool Confluence AIO v3.3. **They are the same model**, so a
disagreement is a defect to file, not a judgement call to make.

## The doctrine

**The model** (Daily preset, verbatim from the source; constants live at the top
of `v62.py`):

```
window_log_ret      = ln(close / close[20])              # LOOKBACK = 20
one_bar_log_ret     = ln(close / close[1])
realized_window_vol = population stdev(one_bar_log_ret, 20) * sqrt(20)
regime_z            = window_log_ret / realized_window_vol

vol_factor = max(0.50, 1 + ((vol_percentile - 50)/100) * 0.25)   # PCT_SENSITIVITY
enter_z    = max(0.10, 0.85 * vol_factor)                        # ENTER_Z_BASE = 0.85
exit_z     = max(0.05, min(0.55 * vol_factor, enter_z - 0.05))   # EXIT_Z_BASE = 0.55
```

Plus: an **EMA(100)** direction filter (no bull below it, no bear above it); a
**4×ATR(14)** gap-shock guard that refuses to let an overnight gap *create* a
flip (neutralize-new-flips mode); enter/exit **hysteresis** over the previous
confirmed state; **2-bar confirmation** (`CONFIRM_BARS = 2`). Vol-percentile is
ranked over `VOL_PCT_LEN = 252`. The whole state machine is **replayed over the
full supplied history each run**, so today's label is exactly what the machine,
run bar by bar, arrives at — no shortcuts. Three states: Bull→`bull_trend`,
Bear→`bear_trend`, Neutral→`chop` (v62 does not use the `stress` lane).

Supporting evidence (not the label): Wilder's **ADX(14,14) ≥ 20** and Kaufman's
**efficiency ratio(20) ≥ 0.25** compose a chop-risk read; strength =
`min(100, |z| / (1.5 × enter_z) × 100)`; extension = strength ≥ 85 and age > 20.

**The honesty statement, carried verbatim into every reading:** *a heuristic
derived from historical label-correlation, not a backtested edge.* It classifies
the present; it does not predict returns.

**The parity contract.** `v62.py` must stay model-identical to the AIO's regime
module at the AIO's daily-chart defaults: preset `Auto`→Daily, `StDev` vol
model, percentile adjustment on, hysteresis on, EMA(100) on, regime-quality
filter Off, gap handling "Neutralize new flips", external override off. This was
re-verified line-by-line and is **100% parity** on the owner's chart exports
(regime match on every file; z within ~2e-15). The AIO's other selectable
options (EWMA / ATR% vol models, Custom preset, alternate gap modes, external
override) all default to the ported behaviour on a daily chart.

Version note: the repo's fidelity record (`docs/REGIME_V62_PORT.md`) names the
**v3.2** regime module because that is what was verified line-by-line. The
canonical operating script is now **v3.3** (v3.2 + the D13 halt fix + red HALT
banner) — the **regime core is unchanged in v3.3**, so parity holds against both.

## What NOT to do

**#1 failure: a silent regime drift between chart and dashboard.** If Hermes
reads `chop` while the AIO HUD reads bull, do NOT "adjust" a constant, add a
tweak, or pick the one you like. Small divergences right after a data gap or in
the first ~500 bars are warmup artifacts (recursive EMA/RMA/ATR/ADX seeding
decays geometrically). A **persistent** divergence is a bug: file it with BOTH
readings attached (Hermes records `data_asof`), per `docs/REGIME_V62_PORT.md`.
Never let the two brains quietly diverge — that silently re-opens the retired
"two brains" era (ledger D9).

Second failure: editing the label math to "improve" it. The score/confidence
fields are Hermes *presentation* mappings and may be adjusted; the label /
strength / z math is the ported machine and is untouchable without re-verifying
parity against the chart.

## Where it lives

- The port: `src/hermes/regime/v62.py` (constants lines ~60–75; state-machine
  replay in `classify`; evidence payload in `_evidence`).
- The contract + deviations + how-to-verify: `docs/REGIME_V62_PORT.md`.
- Methodology + caveat: `docs/METHODOLOGY.md` (`v62 (default)`).
- The `reference-v1` second opinion (deliberately a *different* method):
  `src/hermes/regime/reference.py` — its disagreement is method info, not drift.
- Tests: `tests/test_v62.py`, `tests/test_regime.py`.

## How to verify

Run the AIO v3.3 (or the standalone v6.2) on a **daily** chart of Hermes'
benchmark at the defaults above, and compare its confirmed regime bar-by-bar
against Hermes' reading. Ten straight sessions of agreement is the Phase-1 gate;
after it passes, this retires to a weekly glance. In code: `pytest tests/test_v62.py`
green, and `.venv/bin/hermes daily-check` produces a reading whose label matches
the chart. Any constant change is a parity break until re-verified against the
chart — treat it as such.
