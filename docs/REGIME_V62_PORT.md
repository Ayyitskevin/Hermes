# Regime Label v6.2 — port status and fidelity notes

**Status: PORTED (2026-07).** `src/hermes/regime/v62.py` implements the core
model of "Regime Label v6.2 Professional" from its TradingView Pine source,
and `regime.classifier = "v62"` is the default. The original contract this
document used to describe has been fulfilled; what remains here is the
fidelity record — what was ported exactly, what deviates, and why.

**Parity target (updated 2026-07-06):** on the owner's charts the v6.2 core
now runs embedded as the regime module of the **Five-Tool Confluence AIO
v3.4.1** strategy, which supersedes the standalone v6.2 indicator as the
operating artifact. The port was re-verified line-by-line against that
module: at the AIO's daily-chart defaults (preset `Auto` → Daily, `StDev`
vol model, percentile adjustment on, hysteresis on, EMA(100) filter on,
regime quality filter `Off`, gap handling `Neutralize new flips`, external
override off) it is the same model, same constants, same state machine as
what is ported here. No code change was required. **The regime engine is
unchanged from the v3.2 this was cut from** — v3.3 (equity-halt re-arm),
v3.4 (Markov readout) and v3.4.1 (readout hoist/export + power-iteration
convergence fix) all touched readout/validation layers only, never the
entry/exit/threshold math ported here.

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

Run the Five-Tool Confluence AIO v3.4.1 on a **daily** chart of the same
symbol as Hermes' benchmark, regime inputs at defaults (preset `Auto`,
`StDev` vol model, quality filter `Off`, gap handling `Neutralize new
flips`, external override off), and compare its confirmed regime against
Hermes' reading bar by bar (the Hermes reading records `data_asof`). The
standalone v6.2 indicator at its daily defaults reads identically and works
too. Small divergences immediately after data gaps or in the first ~500
bars of history are warmup artifacts; persistent divergence is a bug —
file it with both readings attached.

## Chart-side transition readout (AIO v3.4.1, 2026-07-06)

The AIO v3.4 chart now carries the same empirical Markov persistence readout
that Hermes computes in `regime/lab.py` (`_markov`) and serves at
`/api/regime/lab`. On the chart it is **Module 1c** — a readout only: it makes,
suppresses, sizes, and exits no trade, touches no `strategy.*` call, and does
not feed `enter_z`/`exit_z`/`risk_scale`, so it cannot resurrect the D2
ungated-second-path flap or add to D3's deliberate double-conservatism.

Both sides count transitions of the **confirmed** three-state series
(Bull `+1` / Neutral `0` / Bear `-1`), including self-transitions, and never
bridge an inactive (`∅`) gap. Both report, per current state: `p_stay`, its
Wilson 95% interval, mean dwell `= 1/(1 − p_stay)`, maturity (current run vs
mean dwell), net bias `p(→Bull) − p(→Bear)`, and a stationary base rate via
power iteration — labelled *a long-run base rate, not a forecast*.

**Exact parity check.** The chart exports three Data Window series —
`REGIME_PSTAY_PCT_EXPORT`, `REGIME_MEAN_DWELL_BARS_EXPORT`,
`REGIME_MATURITY_EXPORT` — computed at global scope from the same confirmed
counts the on-chart table draws (single source, so table and export cannot
drift). The chart's stationary base rate uses a 200-pass power iteration to
match this repo's `_markov` — a 25-pass version did not converge on a sticky
(high `p_stay`) chain and disagreed with the API; v3.4.1 fixed it. On a daily
chart of Hermes' benchmark with the chart's transition
sampling set to **Confirmed bars** (stride 1), these should agree with the
current-state row of `/api/regime/lab`'s `markov` block within
warmup/estimation noise. The chart's optional **Non-overlap lookback** sampling
mode (stride = regime lookback) is a chart-only diagnostic that reduces
overlap-inflated stickiness; it reads differently by construction, and the Data
Window stride is shown so the choice stays honest.

## Short-side variant (AIO v3.5-SHORT, owner-side, UNVALIDATED)

The owner's chart also carries an experimental **dedicated short-side system**
(AIO v3.5-SHORT): relative weakness + a failed-supply-reclaim / bear-flag trigger,
gated by no-chase, support-room and squeeze-risk filters, stopped above the
structural supply high, and exited on an AVWAP reclaim. It is a **behavior-changing
variant, off by default** (`allow_shorts = false`).

**It is deliberately NOT in this repo.** Its logic is order-shaped (entries, exits,
sizing), which the no-order-paths boundary bans — `tests/test_no_order_paths.py`
would (correctly) fail on it. The **regime engine underneath it is unchanged from
v3.4.1**, so `v62.py` parity is unaffected. What this repo carries instead is the
**honest verdict**: an `unvalidated` entry in the validation ledger
(`src/hermes/validation/ledger.py`) and the campaign that must pass before it is
trusted — `docs/campaigns/SHORT_SIDE_V2_CAMPAIGN.md`. Until that A/B campaign shows
it beats longs-only out of sample net of costs, the operating default is shorts OFF.

## Swapping classifiers

```toml
[regime]
classifier = "v62"          # default — the owner's brain
# classifier = "reference-v1"  # published-methods composite, second opinion
```

Both classifiers implement the same contract; the strip, tape, posture,
journal signal-freeze, and teach-in all work identically with either.
