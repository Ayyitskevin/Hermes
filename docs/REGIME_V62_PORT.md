# Regime Label v6.2 — port status and fidelity notes

**Status: PORTED (2026-07).** `src/hermes/regime/v62.py` implements the core
model of "Regime Label v6.2 Professional" from its TradingView Pine source,
and `regime.classifier = "v62"` is the default. The original contract this
document used to describe has been fulfilled; what remains here is the
fidelity record — what was ported exactly, what deviates, and why.

**Parity target (updated 2026-07-04):** on the owner's charts the v6.2 core
now runs embedded as the regime module of the **Five-Tool Confluence AIO
v3.2** strategy, which supersedes the standalone v6.2 indicator as the
operating artifact. The port was re-verified line-by-line against that
module: at the AIO's daily-chart defaults (preset `Auto` → Daily, `StDev`
vol model, percentile adjustment on, hysteresis on, EMA(100) filter on,
regime quality filter `Off`, gap handling `Neutralize new flips`, external
override off) it is the same model, same constants, same state machine as
what is ported here. No code change was required.

## Ported exactly (Daily preset)

- `window_log_ret = ln(close/close[20])`, `regime_z = window_log_ret /
  (population stdev of 1-bar log returns over 20 bars × √20)`
- Volatility-percentile adaptive thresholds:
  `factor = max(0.50, 1 + ((percentile − 50)/100) × 0.25)`,
  `enter_z = max(0.10, 0.85 × factor)`,
  `exit_z = max(0.05, min(0.55 × factor, enter_z − 0.05))`
- EMA(100) direction filter (bull above / bear below, default on)
- Enter/exit hysteresis over the previous **confirmed** state
- Gap-shock guard: `|open − prior close| > 4 × ATR(14)` cannot *create* a
  flip (neutralize-new-flips mode, the upstream default)
- 2-bar confirmation; the state machine is **replayed over the full supplied
  history** each run, so today's label is exactly what the machine arrives at
- Strength `= min(100, |z| / (1.5 × enter_z) × 100)`, regime age, extension
  risk (strength ≥ 85 and age > 20), chop risk from ADX(14,14) ≥ 20 and
  efficiency ratio(20) ≥ 0.25
- The honesty statement, verbatim in every reading: *a heuristic derived
  from historical label-correlation, not a backtested edge*

## Declared deviations

| Deviation | Reason |
|---|---|
| Daily preset only (20 / 0.85 / 0.55 / 2) | Hermes V1 runs daily bars; 4H/Weekly presets ride with the multi-timeframe roadmap item |
| Fixed-% mode, HTF vote, wider-neutral band, probabilistic strength omitted | All are upstream defaults-off; the HTF vote is also the upstream-flagged duplication hazard |
| AIO v3.2's selectable non-default options omitted: `EWMA`/`ATR%` vol models, `Custom` preset, `Off`/`Force Neutral` gap modes, regime-side quality filter variants, external regime override | All default to the ported behavior on a daily chart; same defaults-off policy as the row above |
| The AIO's other modules (relative strength, divergence, AVWAP, risk/exits, order simulation) are not ported | They are strategy/execution layers, not the classifier. Order-shaped code is banned from this repo by the no-order-paths boundary; the RS module is the model for the V2 leadership-board roadmap item |
| Regime-side quality gate Off (upstream default); ADX/ER still computed and shown as chop-risk evidence | Matches upstream defaults; the gate belongs to the playbook layer |
| Recursive indicators (EMA/RMA/ATR/ADX) seeded per Wilder convention | Warmup deltas vs Pine decay geometrically; negligible at ≥500 bars of history |
| `score`/`confidence` fields are Hermes presentation mappings (signed scaled z; strength/100 or band-centeredness) | Hermes' reading contract needs both; the v6.2 label/strength math is untouched and documented in the module |
| Label mapping: Bull→`bull_trend`, Bear→`bear_trend`, Neutral→`chop`; the `stress` lane is unused by v62 | v6.2 has three states; the strip renders three lanes' worth of trace |

## Verifying parity against the chart

Run the Five-Tool Confluence AIO v3.2 on a **daily** chart of the same
symbol as Hermes' benchmark, regime inputs at defaults (preset `Auto`,
`StDev` vol model, quality filter `Off`, gap handling `Neutralize new
flips`, external override off), and compare its confirmed regime against
Hermes' reading bar by bar (the Hermes reading records `data_asof`). The
standalone v6.2 indicator at its daily defaults reads identically and works
too. Small divergences immediately after data gaps or in the first ~500
bars of history are warmup artifacts; persistent divergence is a bug —
file it with both readings attached.

## Swapping classifiers

```toml
[regime]
classifier = "v62"          # default — the owner's brain
# classifier = "reference-v1"  # published-methods composite, second opinion
```

Both classifiers implement the same contract; the strip, tape, posture,
journal signal-freeze, and teach-in all work identically with either.
