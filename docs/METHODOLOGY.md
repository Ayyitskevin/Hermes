# Methodology traceability

The rule: every skill in Hermes maps to a real, named methodology or to the
owner's own validated rules — and says so on screen. If a piece of logic
isn't traceable, it must say that too. This file is the ledger. The same
text ships inside the app: regime evidence carries `methodology` and
`caveat` fields rendered in every teach-in worksheet.

## Regime engine — `reference-v1`

| Component | Named methodology | What it does NOT prove |
|---|---|---|
| Price vs 200-day SMA | Faber (2007), *A Quantitative Approach to Tactical Asset Allocation* — the 10-month (~200-day) timing filter | Lags at turns; whipsaws in flat tape. Locates price, doesn't forecast it |
| 50-day SMA slope | Moving-average trend structure; family tested in Brock, Lakonishok & LeBaron (1992), *Simple Technical Trading Rules and the Stochastic Properties of Stock Returns* | Slope thresholds are readability choices, not fitted parameters |
| Watchlist breadth (% above 50-day MA) | Standard market-internals breadth gauge | Computed over the configured watchlist, not the whole market — a proxy that inherits watchlist bias |
| Realized-vol percentile (20d vs 252d) | Volatility clustering — the regularity behind Engle (1982) ARCH and the volatility-regime literature | Benchmark realized vol is a VIX proxy (no free VIX feed); the 85th-percentile stress line is a convention |
| 12-1 momentum | Jegadeesh & Titman (1993); time-series form Moskowitz, Ooi & Pedersen (2012); crash caveat Daniel & Moskowitz (2016) | A statistical tendency with documented failures exactly at regime turns |
| Label rules + confidence | Explicit hand-written rules over the five votes; confidence = agreement × coverage | **A heuristic description of the present, not a backtested edge.** Stated verbatim in the UI |

`reference-v1` deliberately has **zero fitted parameters** — nothing in it
can be silently overfit. What it buys is transparency, not alpha.

## Regime engine — `v62` (default)

**Regime Label v6.2**, the owner's classifier, ported from its TradingView
source — this is the "owner's own validated rules" branch of the
traceability requirement. Model: 20-day log return divided by realized
window volatility (population stdev × √20), volatility-percentile adaptive
enter/exit thresholds with hysteresis, EMA(100) direction filter, 4×ATR
gap-shock guard, 2-bar confirmation. Supporting gauges: Wilder's ADX (1978)
and Kaufman's efficiency ratio compose its chop-risk read. Its honesty
statement is carried into the UI verbatim: *a heuristic derived from
historical label-correlation, not a backtested edge.* On the owner's charts
the same core now runs embedded as the regime module of the Five-Tool
Confluence AIO v3.2 strategy — verified model-identical at daily defaults,
so chart and dashboard share one brain. Full fidelity record in
[REGIME_V62_PORT.md](REGIME_V62_PORT.md).

## RS leadership board

| Component | Named methodology | What it does NOT prove |
|---|---|---|
| RS line = close_symbol / close_benchmark | Comparative relative-strength line — Weinstein (1988), *Secrets for Profiting in Bull and Bear Markets*; the Mansfield chart-service convention | A ratio of two prices: it says who HAS been outperforming, not who will |
| Mansfield RS = (RS / SMA200(RS) − 1) × 100 | Mansfield relative strength — the RS line against its ~200-day zero line, the form used throughout Weinstein's stage analysis | **A relative-performance tilt, not persistence.** Above-zero states a fact about the past window; continuation is assumed by the stage framework, not demonstrated by it |
| 3-bar Mansfield slope; 50-bar RS new-high/new-low flags | Hermes conventions for "rising/falling" and "new high/low" — readability choices, not fitted or validated parameters | Nothing — they label the direction and range position of the line |
| Verdicts HI-CONV / LONG-OK / WATCH / SKIP-LAG, non-bull cap at WATCH | Explicit hand-written rules over the measures plus the current regime reading; the cap encodes *risk outranks selection* (SKIP-LAG alone survives any regime) | A verdict recommends which name earns a **review** first. It is never a trade signal — no order path exists in this codebase |

**Gate vs selection — the campaign distinction, stated plainly.** The
Phase 4 campaign (2026-07-05) tested RS as an **entry gate** on index
vehicles — "only take the signal when RS agrees" — and found it did not add
value at default parameters. This board makes a **different,
cross-sectional selection claim**: given that you are looking at all, which
watchlist name to look at first. That claim is not validated either — the
campaign result neither supports nor condemns it, and no Hermes backtest
has tested it. The board's caveat says exactly this, on screen, verbatim
(`CAVEAT` in `src/hermes/rs/board.py`). Short history (<200 overlapping
bars) renders as `missing`, never interpolated, per the data-integrity
contract.

## Risk layer

| Rule | Named methodology |
|---|---|
| Position sizing: `size% = risk% / stop-distance%` | Fixed-fractional (% risk) sizing — Van Tharp's position-sizing model; fixed-fraction family per Ralph Vince |
| Open-risk budget (Σ planned risk ≤ cap) | Portfolio heat — Chande's and Elder's aggregate-risk discipline |
| Max drawdown circuit breaker | Standard drawdown-based trading halt; tracked on a normalized 100-based equity index so no dollar figure exists |
| Concentration caps (position / sector) | Basic diversification constraints (no attribution needed; arithmetic) |
| Pairwise correlation warning | Pearson correlation of daily returns; the observation that correlated positions are one position wearing two tickers |

## Trade journal

| Feature | Source pattern |
|---|---|
| Thesis + signal state + planned risk frozen at entry | Trade-journaling discipline (Pattern A's `trader-memory-core`) |
| Resolution vs realized return, benchmark return, alpha | `TradingAgents`' `TradingMemoryLog`/`Reflector`: each decision resolved against raw return and alpha vs SPY |
| Mandatory thesis verdict (yes/partial/no) separate from P&L | Same pattern — "was the call right" ≠ "did it make money" |
| Small-sample honesty (<20 closed trades = anecdotes) | Sample-size adequacy criterion from Pattern A's `edge-strategy-reviewer` |

## Reviewer second-pass

Modeled on Pattern A's `edge-strategy-reviewer` (a deterministic quality
gate). Hermes' rule checks: execution realism (stop inside noise band /
implausibly wide), sizing-cap interactions, setup sample size, conjunctive-
condition overfitting smell, regime coherence. The optional local-LLM
critique is additive; the deterministic checks never depend on it.

## Posture derivation

`allow / restrict / cash-priority` — vocabulary and philosophy from Pattern
A's `market-regime-daily`, whose output is explicitly "a posture, not a
directive." Hermes' mapping: breach ⇒ cash-priority (risk outranks regime);
bear/stress ⇒ cash-priority; warn or rangebound ⇒ restrict; else allow.

## What is NOT traceable to a named methodology

- The reviewer's specific thresholds (`MIN_STOP_DISTANCE_PCT = 0.35`,
  `WIDE_STOP_WARN_PCT = 15.0`, conjunction count ≥ 4,
  `MIN_SETUP_SAMPLE = 10`) are Hermes conventions — sensible, but not
  literature. They are constants at the top of `review/reviewer.py`.
- reference-v1's composition constants are conventions too: the breadth
  bullish/bearish cutoffs (≥60% / ≤40%) and its 5-symbol minimum, the ±0.5
  composite-score label cutoffs, the +0.5 calm-volatility vote, and the
  85th-percentile stress line (the last is flagged in its own caveat).
- The journal's benchmark-anchor staleness bound
  (`MAX_ANCHOR_STALENESS_DAYS = 5`) is a convention: staler anchors return
  a missing benchmark rather than a silently-truncated one.
- The sample provider's synthetic tape is a scripted random walk for demos
  and tests. It is stamped `source: sample` everywhere it appears.
