# Reading the Charts — Five-Tool Confluence AIO v3.5-SHORT
### A plain-English guide to every panel, color, arrow, and number on the chart

> **The one idea to hold onto:** this tool **describes the present**, it does not predict the future. Every panel is answering "what is true *right now*?" — never "what happens next?" If you read it that way, it will never lie to you.

This strategy paints a lot on your screen. This guide walks through **every** piece of it, top to bottom, in order of "what should I look at first." Nothing here requires you to read code.

---

## Table of Contents
1. [Your first 5 seconds](#1--your-first-5-seconds)
2. [The price chart itself](#2--the-price-chart-itself)
3. [The Main HUD (top-right)](#3--the-main-hud-top-right)
4. [The Markov panel (bottom-right)](#4--the-markov-panel-bottom-right)
5. [The Validation panel (bottom-left)](#5--the-validation-panel-bottom-left)
6. [The halt banner (top-center)](#6--the-halt-banner-top-center)
7. [Trade markers & labels](#7--trade-markers--labels)
8. [The `!` flags — what they mean](#8--the--flags--what-they-mean)
9. [Glossary](#9--glossary)

---

## 1 · Your first 5 seconds

Before reading anything else, glance at three things in the **top-right HUD**:

1. **Regime** (top-left cell) — *Bull*, *Bear*, or *Neutral*. This is the gate. Longs only work in Bull, shorts only in Bear.
2. **Score L / Sv2** — two numbers, e.g. `35 / 14`. The floor is **55**. If neither side is ≥ 55, there is no trade here.
3. **The halt cell** (`Ready` / `Paused: …`) — if it doesn't say **Ready**, the system is standing down and so should you.

That's the whole go/no-go in one look. Everything below is *why*.

---

## 2 · The price chart itself

The strategy draws directly on your candles.

| What you see | What it is | How to read it |
|---|---|---|
| **Faint green background** | Bull regime tint | The tide is up. Longs are "with the market." |
| **Faint red background** | Bear regime tint | The tide is down. Shorts are "with the market." |
| **No tint** | Neutral / no regime | Chop. The system has no directional lean. |
| **Yellow/gold line** | **Anchored VWAP** | The average price *since the current leg began*. Above it = buyers in control; below it = sellers. |
| **Faint shaded band around the gold line** | The **value zone** (±1 standard deviation) | A "fair value" envelope. Pullbacks into it are where good entries hide. |
| **Amber/tan line** (only when in a trade) | The **runner stop** (trailing) | Where the last piece of the position gets out. |
| **Faint red line** (only when in a trade) | The **leg stop** | The stop for the scaling pieces. |
| **Small green triangle *below* a candle** | A **long** signal fired here | The system would go long on this bar. |
| **Small red triangle *above* a candle** | A **short** signal fired here | The system would go short on this bar. |

> **Note:** the gold VWAP line *jumps* every time the regime flips. That's on purpose — it re-anchors to the start of each new leg. Don't be alarmed when it "resets."

---

## 3 · The Main HUD (top-right)

This is your cockpit. In **Full** mode it's a 4-column, 6-row grid. Here's every cell, row by row.

### Row 1 — the headline
| Cell | Example | Meaning |
|---|---|---|
| **Regime · Source** | `Bear · CORE` | The regime, and where it came from. `CORE` = the strategy's own brain (normal). `EXT`/`SYNCING`/`LINK?` = an external feed (advanced, usually ignore). |
| **RS** | `RS-` / `Leader` / `Laggard` | Relative strength vs the benchmark (SPY). `Leader` = outperforming & rising. `Laggard` = underperforming & falling. |
| **Position** | `Flat` / `Long · 1.2R` / `Short · 0.4R` | Are you in a trade, and how far in your favor (in R — units of risk). `Chart Only` = orders are off. |
| **Trades** | `Trades: 120` | How many trades the backtest has closed. `· Low Sample` appears under 30. |

### Row 2 — the regime math
| Cell | Example | Meaning |
|---|---|---|
| **Z-Score** | `Z-Score: -1.24` | How stretched price is vs its recent volatility. Negative = down-move; positive = up-move. |
| **Strength** | `Strength: 95` | How strong the current regime is, 0–100. |
| **Enter/Exit** | `0.87 / 0.56` | The z-score thresholds to *start* and *hold* a regime. |
| **Preset · Vol model** | `Daily · StDev` | Which timeframe preset and volatility model are active. |

### Row 3 — the environment
| Cell | Example | Meaning |
|---|---|---|
| **Chop** | `Chop: Medium` | Trend quality. `High` chop = messy, and the system shrinks size. |
| **Gap** | `Gap: Normal` | `Shock` means a big overnight gap just happened (entries get blocked). |
| **Age** | `Age: 29` | How many bars the current regime has lasted. `· Extended` = getting long in the tooth. |
| **Risk Scale** | `Risk Scale: 0.75x` | The size multiplier. Below `1.00x` means the system is *automatically trading smaller* (usually from chop). |

### Row 4 — the confluence read
| Cell | Example | Meaning |
|---|---|---|
| **Osc** | `Osc: RSI 49` | The momentum oscillator value. `No Volume` = the symbol has no volume data. |
| **Mansfield** | `Mansfield: -8.49%` | The relative-strength number. Positive = leading the benchmark; negative = lagging. |
| **AVWAP** | `AVWAP: 521.21 ↑` | The anchored-VWAP price, with an arrow: **↑ = price above it** (bullish), **↓ = price below it** (bearish). *Shorts need ↓.* |
| **Score L / Sv2** | `Score L/Sv2: 25 / 14` | **The go/no-go number.** Long score / short score. Floor is 55. |

### Row 5 — the risk state
| Cell | Example | Meaning |
|---|---|---|
| **Halt state** | `Ready` / `Paused: Risk` | Whether new entries are allowed. Anything other than `Ready` = standing down. |
| **Equity DD** | `Equity DD: 1%` | Current drawdown from the equity peak. |
| **ATR** | `ATR: 5.3%` | Average daily range as a % — how "wide" the candles are right now. |
| **Orders** | `Orders: Sim On` | Whether the backtest is placing simulated orders. |

### Row 6 — status tags
| Cell | Meaning |
|---|---|
| **Bar Magnifier** / **Validation** | Static labels (informational — not live readouts). |
| **Date Filter: On/Off** | Whether a backtest date window is active. |
| **Short: [state]** | The single most useful short cell. Tells you *why* a short is or isn't allowed: `Review OK` (all clear), `No Chase`, `Support Near`, `Squeeze Risk`, or `Not Ready`. |

---

## 4 · The Markov panel (bottom-right)

This panel answers one question: **"historically, how sticky is the current regime, and what has it tended to become?"** It is a *statistics readout* — the panel literally labels itself **"Not forecast."**

**The grid (top):** a transition table. Each row is a *from* state, each column a *to* state.

|  | → Bull | → Neutral | → Bear | n |
|---|---|---|---|---|
| **Bull** | 94% [93-95] | 6% [5-7] | 0% [0-0] | 2203 |
| **Neutral** | 3% [3-4] | 95% [94-95] | 2% [1-2] | 4564 |
| **Bear** | 0% [0-1] | 7% [6-9] | 93% [91-94] | 1088 |

- Read it as: *"When in Bull, 94% of the time the next confirmed bar is still Bull."*
- The `[93-95]` bracket is the **95% confidence range** — how much to trust that percentage. Tight bracket = reliable; wide bracket = thin data.
- The **`n` column** is how many samples that row is based on. A `!` here means the sample is too small to trust.
- The **highlighted row** is the regime you're in right now.

**The summary rows (bottom):**
| Row | Reads | Meaning |
|---|---|---|
| **Current** | `Bear · Stay: 95.3% · Net: -91` | Your regime, its stickiness, and its directional lean. |
| **Dwell** | `Mean: 21.3 · Age: 29 · Mature` | How long this regime *usually* lasts vs how long it's lasted *this time*. `Mature` = older than average. |
| **Base rate** | `B 28% · N 58% · R 14% · Not forecast` | The long-run share of time spent in each regime. **Explicitly not a prediction.** |

> **How to actually use it:** it's *context*, not a signal. A `Mature` regime with high `Stay %` says "this trend has legs but is getting old" — a reason to trail stops tighter, not a reason to enter or exit on its own.

---

## 5 · The Validation panel (bottom-left)

This is the strategy grading *itself*. It's the honesty engine — it will happily tell you the system is losing.

| Row | Example | What it's telling you |
|---|---|---|
| **Validation** | `Healthy` / `Review` | Overall verdict. `Review` = something below needs your attention. |
| **All Trades** | `Net: -901 · PF: 0.91 · WR: 35%` | The whole book. **PF (profit factor) below 1.0 = losing money.** |
| **Longs** | `Trades: 0 · Net: 0` | The long book *by itself*. |
| **Shorts** | `Trades: 120 · Net: -901 · PF: 0.91` | The short book *by itself*, never blended with longs. A `!` = sample below your minimum. |
| **Out-of-Sample** | `Trades: 27 · PF: 0.19` | Performance on recent data the system wasn't "tuned" on. **This is the honest test** — it matters more than the in-sample numbers above it. |
| **Stress Test** | `Ex Best 1 · Ex Best 3 · Best Dep · Bad Chunks` | What's left if you remove the 1 and 3 luckiest trades, how dependent the book is on its best trade, and how many time-chunks lost money. |
| **Chunk table** | `#1 … #6` with `OK`/`Weak` | The history sliced into equal pieces. Lots of `Weak` = inconsistent, not a stable edge. |
| **Review If** | `Sample OK · OOS Weak · Balanced · Unstable` | A plain-English summary of which honesty checks passed or failed. |

> **The most important row is Out-of-Sample.** A book can look great in-sample and fall apart out-of-sample — that gap is the difference between a real edge and a curve-fit story. Trust the OOS row over the headline.

---

## 6 · The halt banner (top-center)

Most of the time you won't see this. When you do, it looks like:

```
ENTRY HALT — equity DD 26.4% ≥ 25.0%  (12 bars)
```

It means the risk circuit-breaker has tripped (too much drawdown, or a daily loss limit) and **new entries are paused**. The number in parentheses is how many bars it's been active. This is the system protecting you from a bad streak — it outranks every signal on the chart.

---

## 7 · Trade markers & labels

On top of the small green/red signal triangles (§2), TradingView draws the actual **entry and exit points** of every backtest trade. The labels follow a code:

**Entries** look like `L1 · flip · 85` or `S2 · failAVWAP`:
- **`L` = long, `S` = short.** The number (`1`/`2`/`3`) is which scaling *leg* it is (the position enters in up to three pieces).
- The middle word is **which trigger fired**: `flip` (regime flip), `hidDiv` (hidden divergence), `regDiv` (regular divergence), `reclaim` (AVWAP reclaim) for longs; `failAVWAP` (failed reclaim), `bearFlag` (breakdown), `bearFlip` for shorts.
- The trailing number (e.g. `85`) is the **confluence score** at entry.

**Exits** look like `L1_T1`, `L2_T2`, `L3_RUN`, `PROT_S1`:
- `_T1` / `_T2` = took profit at target 1 / target 2.
- `_RUN` = the trailing "runner" piece.
- `PROT_` = the protective stop got hit.
- You'll also see `Regime exit`, `AVWAP reclaim`, and `Time stop` on exits triggered by those rules.

**The ± number** on a marker (e.g. `+108`, `-30`) is that trade's profit or loss.

> If the chart looks like a wall of arrows, that's normal on lower timeframes — it's every trade in the backtest history, not live signals.

---

## 8 · The `!` flags — what they mean

A `!` anywhere on the chart is the honesty system flagging **"don't trust this number yet — the sample is too small."** You'll see it in two places:

- **Next to a Shorts (or Longs) trade count** — the book has fewer trades than your "minimum for a robust sample" (default 100). Below that, the PF and win-rate are an *anecdote*, not evidence.
- **In the Markov `n` column** — that regime row was built from too few observations to trust its percentages.

**Do not make a `!` go away by lowering the threshold.** That's hiding the truth from yourself. The only honest way to clear it is *more trades* (more history, more symbols).

---

## 9 · Glossary

| Term | Plain meaning |
|---|---|
| **Regime** | The market's current state: Bull trend, Bear trend, or Neutral/chop. |
| **AVWAP** | Anchored volume-weighted average price. The "average price since this leg began." Re-anchors on every regime flip. |
| **Value zone** | The ±1σ band around the AVWAP — a fair-value envelope. |
| **Mansfield / RS** | Relative strength vs the benchmark. Positive = leading; negative = lagging. |
| **Confluence score** | 0–100 stack of trigger + RS + location + momentum. Floor is 55. |
| **Z-Score** | How far price has moved relative to its own recent volatility. |
| **Strength** | How strong the current regime is, 0–100. |
| **R** | One unit of risk (entry-to-stop distance). A `+2R` trade made twice what it risked. |
| **PF (profit factor)** | Gross profit ÷ gross loss. Above 1.0 = making money; below = losing. |
| **WR (win rate)** | % of trades that were winners. |
| **OOS** | Out-of-sample — data the model didn't see during tuning. The honest test. |
| **Chop** | Trend quality. High chop = messy, low-conviction tape. |
| **Risk Scale** | Auto size multiplier; below 1.0× means trading smaller on purpose. |
| **p(stay) / dwell** | How sticky a regime is, empirically. Context, never a forecast. |
| **`!`** | Low-sample warning. The number isn't trustworthy yet. |

---

*This is a reading guide for a decision-support tool. Everything on the chart describes the present or the past — none of it predicts the future. Every figure is a percent or an R-multiple; there are no dollar amounts. When in doubt, trust the Out-of-Sample row and respect the halt banner.*
