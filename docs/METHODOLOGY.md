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

## Regime Lab (the deep read)

The Regime Lab composes the two regime classifiers and the stored reading history
into one interrogation surface — it introduces **no new measurement**.

| Element | What it does | What it does NOT prove |
|---|---|---|
| Dual-classifier read | Runs **both** `v62` and `reference-v1` over the same cached benchmark + watchlist bars (a read — the second, non-default result is never persisted, so the scheduled daily check keeps sole ownership of the history) | Agreement is corroboration, not proof: the two share inputs and both are heuristics, not backtested edges. A single instant, not a track record |
| Label comparison only | The four-state label is the same enum for both, so it is compared directly | The per-classifier **score** and **confidence** are on different scales (reference-v1: mean of ±1 votes / agreement×coverage; v62: a mapped z / strength) and are deliberately **not** cross-compared — each card shows its own basis |
| Confidence teach-in | Breaks the confidence number into its formula and reports how many components actually voted (`votes_available / votes_total`) | A heuristic for display, never a probability. Missing components lower coverage rather than being filled in |
| Drift vs persisted | Flags when the LIVE default label differs from the last persisted reading — i.e. bars moved since the last daily check and a fresh check would relabel | It does not itself relabel or persist; it only surfaces that the authoritative reading is stale relative to current bars |
| Transition history | Current streak, label flips, and dwell-per-regime over the persisted readings of the default classifier | Below 20 readings the stats are flagged an **anecdote**, not a base rate; dwell is descriptive of the window, not a forecast of the next regime |

Every reading carries source + as-of; short history renders `∅ missing`, never
interpolated. Nothing here is a directive — a regime label is context for a human
decision, and no order path exists in this codebase.

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

## Weekly portfolio review

| Component | Named methodology | What it does NOT prove |
|---|---|---|
| Regime coherence per open position | Weinstein (1988) stage sense: a long is *with* the tape in a bull trend and *against* it otherwise (a short inverts) | Coherence is judged against a single benchmark-wide regime reading, not a per-symbol regime; "fighting" is a review flag, not an exit order |
| Sector heat (Σ size% by sector) | The same aggregation as the risk engine's sector-concentration check | % of equity only; untagged positions surface as `unspecified` and are flagged, because an untagged book can hide concentration |
| Full pairwise correlation matrix | Pearson correlation of daily returns between every open-position pair (the risk engine reports only the worst pair; this is the whole matrix) | Backward-looking over a fixed lookback — who HAS moved together, not who will; insufficient history renders as ∅ missing, never 0 |
| Journal-informed exposure | Open count, Σ planned risk %, the journal's own `performance_summary` (self-labels small samples as anecdotes), and the count of stale open theses | A synthesis of already-computed layers, not a new measurement or a forecast |

The weekly review is a scheduled **re-reading**, not a new signal: it
recommends where to focus a review this Sunday — never a trade (no order path
exists in this codebase). On a weekly cadence the underlying data can be up to
a week stale between runs, and the caveat says so on screen.

## Swing screener (Minervini Trend Template)

| Component | Named methodology | What it does NOT prove |
|---|---|---|
| Criteria 1–5: close vs the 50/150/200-day SMAs, the 150>200 relationship, the 50>150>200 stack, and the 200-day SMA rising over ~22 bars | Mark Minervini (2013), *Trade Like a Stock Market Wizard* — the Trend Template's moving-average structure (itself in the Stan Weinstein / William O'Neil trend-following lineage) | That the trend continues. Every criterion describes the PAST arrangement of price and its averages; a stock "in a Stage-2 uptrend" is a description, not a forecast |
| Criteria 6–7: close ≥ 30% above the 52-week low and within 25% (≥ 75%) of the 52-week high | Minervini's absolute-position criteria — a leader is far off its low and near its high | Range position, not momentum persistence; a name pinned near its high can still roll over the next session |
| Criterion 8: Mansfield RS > 0 vs the benchmark | A **documented PROXY** for Minervini's market-wide "RS rating ≥ 70": Hermes has no full-market universe, so it substitutes the rs board's Mansfield RS line (Weinstein 1988) — the symbol/benchmark RS against its 200-bar zero line | It is NOT Minervini's cross-sectional RS rank. It measures outperformance vs one benchmark, not a percentile against the whole market — a genuine substitution, flagged as such |
| Verdict PASS (8/8) / NEAR (6–7) / NO (<6); non-bull regime annotation | Explicit hand-written thresholds over the eight criteria plus the current regime reading; PASS/NEAR rows are annotated **context-only** (not suppressed) when the tape is not a bull trend | A verdict flags a **candidate** for review — it is never a trade signal, and never a "setup" (see below). No order path exists in this codebase |

**Candidate, not setup — and the reviewer gate is elsewhere.** The screen
outputs candidates: names worth a closer look. A candidate becomes a *setup*
only when the human creates a journaled trade proposal, and that proposal runs
the reviewer second-pass (`review.reviewer.review_entry`) at propose time. The
screener deliberately does **not** call the reviewer and does **not** bypass it
— the gate lives at propose time, by design, so the screen can never launder an
un-reviewed idea into a "validated" one.

**Filter, not edge.** The Trend Template is a trend-following filter: it
describes a confirmed uptrend, it does not predict one. The Phase 4 validation
campaign (2026-07-05) found filter-style signals did not add value at default
parameters, so passing the screen is a screening *convenience*, not forward
evidence — the caveat says this on screen, verbatim (`CAVEAT` in
`src/hermes/screener/trend_template.py`).

**Fundamentals are deliberately omitted.** Minervini's full method (and O'Neil's
CANSLIM behind it) weighs earnings, sales, and institutional sponsorship. Hermes
has **no fundamentals feed**, so it screens the price half only and says so
plainly — a match is never a fundamental endorsement, and nothing here fakes one.
Short history (<252 daily bars, or too little benchmark overlap for the RS proxy)
renders as `missing`, never interpolated, per the data-integrity contract.

## Risk layer

| Rule | Named methodology |
|---|---|
| Position sizing: `size% = risk% / stop-distance%` | Fixed-fractional (% risk) sizing — Van Tharp's position-sizing model; fixed-fraction family per Ralph Vince |
| Open-risk budget (Σ planned risk ≤ cap) | Portfolio heat — Chande's and Elder's aggregate-risk discipline |
| Max drawdown circuit breaker | Standard drawdown-based trading halt; tracked on a normalized 100-based equity index so no dollar figure exists |
| Concentration caps (position / sector) | Basic diversification constraints (no attribution needed; arithmetic) |
| Pairwise correlation warning | Pearson correlation of daily returns; the observation that correlated positions are one position wearing two tickers |

## Stress test (the Stress surface)

The Stress surface shocks the CURRENT open book against a few stylized shocks and
reads out the projected drawdown on the 100-based equity index — a WHAT-IF, not a
forecast, and always % of equity.

| Scenario | Named methodology / model | What it does NOT prove |
|---|---|---|
| Market −5 / −10 / −20% | Single-factor beta: each position moves by β × market move (β = cov/var of the position's daily returns on the benchmark's over the lookback), with side handled — a long loses in a drop, a short gains. Contribution to equity = weight × β × move | β is backward-looking over the lookback and compresses in real panics, so the beta scenarios UNDERSTATE a crisis. A single-factor point estimate, not a scenario distribution |
| All stops hit | The deterministic worst case: every open stop is taken, costing exactly Σ planned risk % (the risk the book already carries) — no beta, no model | Assumes stops fill at their level; a gap through the stop can cost more. It is the pre-committed risk, not a floor on loss |
| Crisis: −20% + correlations→1 | The stylized regime where diversification fails: long betas are floored at 1.0 so low-beta names stop cushioning. The gap vs the plain −20% case is the diversification a crisis removes | Correlations→1 is imposed by fiat, not predicted. It is a deliberately pessimistic floor to counter beta's fair-weather optimism, not a forecast of any particular crash |
| De-risk postures | Derived from the above: a cash-priority posture when a scenario breaches the drawdown circuit breaker, a trim posture for the largest crisis contributor, a diversify posture from the crisis-vs-−20% gap, and net-exposure / all-stops notes | Postures are context for a human decision — Hermes has no order path. None is a buy/sell/hedge instruction; the correlations they rest on are backward-looking |

Projected drawdown is measured from the equity index's running peak. Everything is
% of equity or an index value; there is no dollar figure in the payload or the view.

## Trade journal

| Feature | Source pattern |
|---|---|
| Thesis + signal state + planned risk frozen at entry | Trade-journaling discipline (Pattern A's `trader-memory-core`) |
| Resolution vs realized return, benchmark return, alpha | `TradingAgents`' `TradingMemoryLog`/`Reflector`: each decision resolved against raw return and alpha vs SPY |
| Mandatory thesis verdict (yes/partial/no) separate from P&L | Same pattern — "was the call right" ≠ "did it make money" |
| Small-sample honesty (<20 closed trades = anecdotes) | Sample-size adequacy criterion from Pattern A's `edge-strategy-reviewer` |

## P&L & attribution (the P&L surface)

The P&L surface grades the resolved journal on the normalized equity index. It is
a **record**, not a new measurement, and it never emits a dollar figure.

| Element | Named methodology / rule | What it does NOT prove |
|---|---|---|
| Equity index | The 100-based index the journal moves on each close — `new = prev × (1 + realized% × size_frac)` (position-weighted, compounded). 100 = flat start; drawdown is the deepest peak-to-trough on this curve | An index of journaled trades only — not a mark-to-market of open positions or an account balance. It exists only in % / index space |
| Per-trade attribution weight | The EXACT index delta each close wrote (recovered from its `equity_index` row's `cause = journal_close:<id>`), so bucket contributions sum to the index move by construction — no re-derived approximation | The delta is what happened, not what was expected. Contribution ≠ skill: a large mover can be one lucky trade |
| Buckets | Closed trades grouped by regime-at-entry (frozen in the entry's signal state), setup tag, sector, and side; each bucket ranked by contribution to the index | Descriptive of the realized window. Correlation of a bucket with gains is not evidence that bucket is a repeatable edge |
| Expectancy / payoff | Expectancy = mean R (`realized% / planned_risk%`); payoff = avg win% / avg loss%; win/thesis/alpha from `performance_summary()` | Sample statistics, not forward estimates. Alpha is vs the configured benchmark over each trade's own holding window |
| Small-sample honesty | Book-level stats flagged anecdotes below 20 closed trades; each bucket flagged below 10 | Below threshold these are noise. The flag is shown on every level, not buried |

Everything is % of equity, an index value, or an R-multiple. There is no dollar
balance, dollar P&L, or dollar position size anywhere in the payload or the view.

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

## Instrument thesis-fit (the Terminal)

The Terminal's thesis-fit is a **composite of already-named readings**, not a new
measurement. It sums four factors (each 0–25, summing to the 0–100 score by
construction) and reads out a posture — ALLOW / WATCH / RESTRICT — that is context
for a human decision, never a directive.

| Factor | Composed from (named methodology) | What it does NOT prove |
|---|---|---|
| Regime-fit | The moving-average stack (Minervini/Weinstein trend structure), the Mansfield RS line (Weinstein 1988), and the current regime reading (`v62` / `reference-v1`) | Alignment is a description of the present. The MA stack and RS describe the past window; the regime is a heuristic read, not a backtested edge |
| Setup-match | The Minervini Trend-Template score (2013) + the RS board's verdict (both reused verbatim, single-symbol) | The Phase-4 campaign found filter-style signals did not add value at default parameters — a match is a screening convenience, not forward evidence |
| Sizing-posture | The risk engine's headroom: open-risk budget, single-position concentration, and pairwise correlation (Van Tharp / Chande–Elder portfolio heat; Pearson correlation) | Headroom is arithmetic over % of equity — it says there is room, not that the trade is good. Risk outranks selection |
| Book-impact | In-book weight from the open journal + Pearson correlation of the name's returns to each open position | Correlation is backward-looking over the lookback; a highly correlated add is one position wearing two tickers |

**The two caps are load-bearing** (risk outranks selection): a **non-bull regime
caps the posture below ALLOW** (mirroring the RS board's WATCH cap), and a **risk
breach forces RESTRICT**. Short history stays missing — a symbol without the 252
daily bars / 200 benchmark-overlap bars the RS and Trend factors need returns those
fields as `None` (never 0) and a null thesis-fit score, and each affected factor is
flagged `missing`, not scored zero. Every factor carries the same teach-in shape the
regime evidence uses (`{label, chip, claim, measured, caveat}`). The optional AI
desk-read runs through the router (`desk_read`) and only rephrases these computed
facts — it invents no number and degrades visibly. This is decision-support only; no
order path exists in this codebase.

## Sizing desk (the Size surface)

The Size desk turns a planned trade (entry / stop, side inferred from stop-vs-entry)
into a **suggested position size as % of equity**, in three visible layers. It is a
suggestion for a human — no order path exists in this codebase.

| Layer | Named methodology | What it does NOT prove |
|---|---|---|
| Fixed-fractional baseline | The % risk model — risk a fixed % of equity per trade (`risk.max_risk_per_trade_pct`) and let the stop distance set the size: `size% = risk% / stop-distance%` (Van Tharp's position-sizing work; the fixed-fraction family per Ralph Vince) | A sober default, not an edge. It assumes only that you will honor the stop |
| Empirical half-Kelly | The Kelly criterion (Kelly 1956; Thorp's market application) applied to the journal's OWN closed trades in R-multiples (`R = realized_return / planned_risk`): win rate `W`, payoff ratio `b = avg_win_R / avg_loss_R`, `f* = W − (1−W)/b`, **halved** (the half-Kelly convention — full Kelly is famously too aggressive) | Kelly assumes independent, stationary bets; markets are neither. With no closed trades, or no losers to define `b`, the edge is reported `insufficient` and the desk stays on the baseline rather than extrapolate one |
| Confidence shrink | The blended risk is `shrink·half_kelly + (1−shrink)·fixed`, with `shrink = n/(n+30)` — a Beta-Bernoulli-style shrinkage toward the fixed prior (30 trades of prior weight). Below 30 closed trades the edge is flagged an **anecdote** on screen | Shrinkage narrows sampling error; it does not make a short, lucky record predictive. It deliberately pulls the size toward the sober baseline |
| Limit-aware cap | The blended risk becomes a size, then is clamped by the tightest applicable ceiling — per-position (`max_position_size_pct`, net of any existing weight), remaining open-risk budget (`max_open_risk_pct` − Σ open planned risk), and optional sector ceiling (`max_sector_exposure_pct` − held-in-sector) — and the binding limit is **named** | Arithmetic over % of equity. A correlation to an open position is surfaced as a warning (Pearson over the lookback), never silently sized in |

**Risk outranks the model**: the hard limits can only reduce the size, never raise it,
and the constraint that bound is reported explicitly (a size of 0 when a budget is
exhausted is stated, not hidden). Every figure is a % of equity or a per-share price —
the desk never emits, stores, or displays a dollar balance, dollar P&L, or dollar
position size. The Kelly number is an **upper reference** the desk deliberately halves,
shrinks, and caps — not a target.

## AI router & cloud path

| Component | Named methodology / rule | What it does NOT prove |
|---|---|---|
| Local-first routing | Doctrine, not literature: Ollama is the default; the cloud (Claude) is the deliberate exception, taken only when `ai.allow_cloud` is true **and** a task opts in (`debate` / `coach` / `desk_read`) or the operator selects it. A down backend falls back to the other and labels which answered; both down returns a visible "model unavailable" state | Nothing about answer quality — it is a *routing* policy. Which backend answered is disclosed; a labeled fallback is not a silent substitution |
| Data-in / prose-out | The model receives **computed** facts (regime label, evidence, risk state, thesis-fit rows, resolved journal history) and is instructed to restate only those facts. Numbers come from the pipeline; the AI writes prose about them | The AI does not compute, validate, or forecast any number. It can still phrase a caveat poorly — the numbers above it are complete without it, and render even when it is down |
| Boundary language in every prompt | Each system prompt forbids inventing numbers and forbids directives; `debate` ends in the tension between views, never a "buy/sell" call. The AI layer is CI-covered by the no-order-path guard like the rest of the repo | It is a prompt-level guard, reinforcing (not replacing) the structural boundary: no order path exists in this codebase for the AI to reach even if asked |
| Session usage meter (`approx_cost`) | Σ token usage × per-model USD list price, accumulated over the server process | An **approximation** of AI-infrastructure spend (list prices, not intro or negotiated rates), confined to `/api/ai/status`. It is NOT an account balance, P&L, or position size, and never enters the equity / % domain |
| Backend reachability in `/api/ai/status` | Ollama: a live tags ping; Claude: key present **and** a live models-list probe (no generation, no tokens) | A probe at status time, not a guarantee the next call succeeds — an actual call still degrades visibly if the backend drops between the probe and the request |

The router is honest by construction: it never dresses a fallback as the primary
backend, never emits prose when both backends are down, and never lets a cloud
dollar figure cross into the equity / % domain.

## Model scorecard (the honesty surface)

The scorecard grades Hermes' own models — and is the surface most bound by
"honesty is the product". It fabricates no grade: every item is marked GRADED,
THIN, or NOT_TRACKED, and what the stored data cannot support is named, not faked.

| Item | Computed from | Status logic / what it does NOT prove |
|---|---|---|
| Regime-classifier stability | Flips, average dwell, and current streak over the PERSISTED default-classifier readings | GRADED at ≥20 readings, else THIN. Descriptive of behavior only — stability is not accuracy; a rock that never moves could be missing real turns |
| Classifier agreement (now) | Whether v62 and reference-v1 read the same label on the current bars (via the Regime Lab) | Always a single instant, flagged an anecdote. Historical agreement is deliberately NOT graded — only the default classifier's readings are persisted |
| Reviewer calibration | Closed trades grouped by the reviewer's advisory verdict (clear / caution / blocked), realized win-rate and avg return per group | GRADED at ≥20 reviewed closed trades, else THIN. Whether cleared trades out-realized cautioned ones is an in-sample read of a nonstationary process, not proof the reviewer works |
| Thesis-judgment calibration | Closed trades grouped by the operator's thesis verdict (yes / partial / no) vs realized outcome | GRADED at ≥20, else THIN. Grades the HUMAN's calls, not a Hermes model; "played out" and "made money" can diverge legitimately |
| RS-board & screener follow-through | — | NOT_TRACKED: both are computed on demand and never persisted, so forward follow-through cannot be measured without first snapshotting the verdicts over time (a named future item). No number is shown rather than a fabricated one |

Every graded number carries its sample and a nonstationarity caveat. Below the
meaningful-sample threshold the item says so on its face. Nothing here is a dollar
figure, and nothing here is a directive.

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
- The default watchlist (`config/hermes.example.toml`) is a diversified
  cross-sector field — all 11 SPDR sector ETFs plus liquid leaders from each.
  This is a **breadth convention**, chosen so the RS board and screener can
  surface leadership across the whole market rather than a narrow, correlated
  cluster; it is **not** a claim that these names carry an edge. Any edge
  belongs to a trade the human places on the chart, validated on the chart —
  Hermes screens and ranks, it never asserts alpha. Watchlist composition also
  inherits watchlist bias in the breadth and RS reads (already flagged in
  those rows).
