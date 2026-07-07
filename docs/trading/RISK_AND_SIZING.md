# RISK & SIZING — The R Framework

### How the *Five-Tool Confluence AIO v3.5-SHORT* turns a stop into a position size, and a position into a stream of R-multiples

> **The one line that outranks the rest:** *risk outranks selection.* The prettiest confluence on the cleanest chart is a **no-trade** if the book is halted, the size math says "too wide," or a protection rule is tripped. Selection decides *whether* a name is interesting; risk decides *whether you are allowed to act, and how large.* When they disagree, risk wins — every time.

This document is the sizing and protection layer. For *how to play* the thesis see **The-Hermes-Playbook.md**; for *how to read* the on-chart HUD, stops, and halt banner see **CHART_READING_GUIDE.md**. Here we do only one thing: the arithmetic that keeps you in the game, expressed — as always — in **percent of equity and R-multiples, never in dollars.**

---

## 1 · The core formula

Every position starts from one identity:

```
size% = risk% ÷ stop-distance%
```

- **`risk%`** — how much of equity you are willing to lose if the stop is hit. The house default is **1.0% per trade** (adjustable 0.05%–5.0%). This is your budget, chosen *before* you look at the size.
- **`stop-distance%`** — the gap from entry to stop, as a percent of the entry price. For a long, the stop sits **ATR(14) × 2** below entry (the `atr_mult` default), so `stop-distance% ≈ 2 × ATR%`. For a short it keys off the *structural* supply high, not a symmetric box (see §6).
- **`size%`** — the resulting **position value as a percent of equity** (the notional you carry, before any leverage rules).

Read the formula out loud: **the stop sets the size, not your excitement.** A wide stop *shrinks* the position so the dollar-blind loss stays fixed at `risk%`. A tight stop lets the position grow — up to the caps in §5. You never "add size because you're confident"; confidence is not an input to this equation.

> **What the engine actually computes.** Internally: `risk_frac = risk% × risk_scale`, then quantity `= (equity × risk_frac) ÷ (stop-distance × price)`, then clipped by the position cap. The `risk_scale` is the auto de-rating from §5 — in calm conditions it's `1.0×` and drops out. Everything below is that same math in plain percentages.

---

## 2 · Three worked examples (all in %)

Assume **1% risk** and a long with an **ATR(14) × 2** stop unless noted. Nothing here is a dollar figure — it's all percent-of-equity.

### Example A — a normal-volatility name

| Input | Value |
|---|---|
| Risk budget | **1.0%** of equity |
| ATR% (daily range) | 2.5% |
| Stop distance | 2 × 2.5% = **5.0%** below entry |
| **size%** | 1.0% ÷ 5.0% = **20% of equity** |
| **1R** | **1.0% of equity** |

You carry a position worth 20% of equity. If the stop hits, you lose ~1% of equity = **−1R**. Hit Target 2 and you make ~2% = **+2R**.

### Example B — a wider, more volatile name

| Input | Value |
|---|---|
| Risk budget | **1.0%** of equity |
| ATR% | 4.0% |
| Stop distance | 2 × 4.0% = **8.0%** below entry |
| **size%** | 1.0% ÷ 8.0% = **12.5% of equity** |
| **1R** | **1.0% of equity** |

Same 1R, smaller position. The wider stop did exactly its job — it *reduced* the size so the risk budget is unchanged. The trader who "rounds up to 20% because it's the same conviction" has silently taken **1.6R** of risk on a 1R plan.

### Example C — the same trade, but chop de-rated (0.45×)

| Input | Value |
|---|---|
| Risk budget (nominal) | 1.0% of equity |
| Risk Scale (High chop) | **0.45×** → effective risk **0.45%** |
| Stop distance | 5.0% (as Example A) |
| **size%** | 0.45% ÷ 5.0% = **9% of equity** |
| **1R (this trade)** | **0.45% of equity** |

In High chop the engine shrinks *both* the size **and** the R. Your worst-case loss is now ~0.45% of equity, and — crucially — a win is measured against that same smaller R. De-rating is not a punishment; it's the system trading smaller on purpose when the tape is low-conviction. Respect it; don't override it back up to 1.0×.

> **The tight-stop caveat (honesty, not a footnote).** If a stop is *very* tight, the formula can demand a position larger than the **position cap** (§5, default 100% of equity). When that happens the size is clipped and your **realized risk falls *below* your budget** — e.g. a 0.5% stop wants `1 ÷ 0.5 = 200%` of equity, gets capped at 100%, so the real risk is only ~0.5% (0.5R), not 1R. That's a conservative failure, but *know when you're in it*: your R is smaller than you think, and so is the payoff.

---

## 3 · Why every outcome is an R-multiple

**R is one unit of risk** — the entry-to-stop distance, sized so that a stop-out costs exactly your risk budget. Once you've defined R, you stop thinking in prices or percentages of the *symbol* and start thinking in multiples of *your own risk*:

- A stop-out is **−1R**.
- Target 1 is **+1R**; Target 2 is **+2R**.
- A runner that trails into a big move might close **+3R, +4R** — or give back to **breakeven (0R)** if it reverses after T1.

This vocabulary is the whole point. It makes a "big" win on a small position and a "small" win on a large position **directly comparable**, because both are stated in the risk they put up. It also makes your expectancy computable over a sample: string together your realized R's, average them, and you have an **expectancy in R per trade** — the only number that tells you whether the process is tilting the odds your way.

> **Sample discipline (from the Playbook).** An R-average over **12 trades is an anecdote**; conclusions need **~100+ trades**, out-of-sample, net of costs. A pretty R number on a thin sample is noise wearing a suit. The edge is something you *earn and validate*, never assume from a good week.

---

## 4 · The management ladder — from entry to exit

The position enters in up to **three legs** and is managed on a fixed ladder. This is mechanical on purpose: it removes the moment-to-moment "should I take profit?" question that ruins execution.

| Stage | Rule | What it does |
|---|---|---|
| **Entry** | Size per §1, split into up to 3 legs (L1/L2/L3 or S1/S2/S3) | Establishes the position and the 1R distance |
| **T1 — Target 1** | Scale out at **+1R** (`t1_r = 1.0`) | Books the first multiple, cuts open risk |
| **Breakeven** | After T1, move the stop to **breakeven** (`be_after_t1 = ON`) | Aims to take the trade out of loss territory — barring gaps/slippage, worst case is now ~**0R** (no guarantee) |
| **T2 — Target 2** | Scale out again at **+2R** (`t2_r = 2.0`) | Books the second multiple |
| **Runner** | Trail the last leg on a **Chandelier stop** — 22-bar extreme minus **ATR(14) × 3** (`ch_len = 22`, `ch_mult = 3`, `use_trail = ON`) | Lets a real trend pay for the many small losers |
| **Invalidation** | Exit on regime turn against you, stop hit, or thesis break (short: AVWAP reclaim) | Whichever comes first — the thesis, not hope, ends the trade |

The shape of this ladder is *deliberately* front-loaded: you **book small R early (T1, T2)** and let a **minority of runners** carry whatever expectancy the process has — an expectancy that must be validated over a large sample, never assumed. Most trades will be small wins, breakevens, or −1R losses. That is the design working, not failing.

---

## 5 · The protection layer — the circuit breakers

These sit *above* selection. If any of them says stop, the confluence score is irrelevant. Defaults shown; several ship **off** and are yours to arm as your process matures.

| Guard | Default | What it does |
|---|---|---|
| **Equity-DD halt** | **ON, 25%** | Pauses **all new entries** when rolling drawdown hits 25% of the equity peak. In *Rolling-peak* mode (252-bar window) an old halt ages out and re-arms; in *Latch* mode a breach is **permanent** — equity freezes and no trade can occur again. |
| **Daily-loss halt** | OFF, 3% | On daily-or-faster charts, pauses new entries once the day's loss hits the limit. Stops one bad session from becoming a bad month. |
| **Cooldown** | 0 bars | Optional wait after a trade closes before the next entry — throttles revenge-trading and clustering. |
| **Chop de-rating** | **ON, 0.45× / 0.75× / 1.0×** | Auto size multiplier by trend quality: **High chop → 0.45×**, **Medium → 0.75×**, **clean → 1.0×**. Feeds straight into `risk_scale` in the §1 formula. |
| **ATR% sanity filter** | OFF, 0.10%–15% | Blocks entries when the symbol's range is pathologically dead or wild — the stop-distance the formula relies on becomes meaningless at the extremes. |
| **Position cap** | **ON, 100% of equity** | Ceiling on any single position's value. Clips the tight-stop case in §2's caveat. |
| **Portfolio / liquidity guards** | OFF, e.g. dollar-volume MA | Optional gates (min dollar-volume, gap-shock block) that keep you out of names you can't exit cleanly. |

> **Read the HUD before every trade.** The **Risk Scale** cell shows the live de-rating; the **Halt state** cell shows `Ready` or `Paused: …`; the halt **banner** (top-center) shows the drawdown breach. See **CHART_READING_GUIDE.md** §3 and §6. If the HUD isn't `Ready`, you stand down — full stop.

---

## 6 · A note on the short side (unvalidated)

Everything above applies to both sides, but the **short side is an unvalidated experiment that ran net-negative in the reference backtest** — it has *not* earned the right to be trusted, and until it beats longs-only out-of-sample net of costs (see the campaign in **The-Hermes-Playbook.md** §9), it is carried at the **smallest size or not at all**.

The one sizing difference: a short's stop is **structural** — it sits *above the supply/rejection high plus a buffer* (`short_stop_buffer_atr`), not a symmetric ATR box, so R keys off the real invalidation. A short whose structural stop is **wider than the max-stop % (default 8%)** is filtered out as a no-chase — the math itself refuses the trade. That asymmetry is intentional: shorting is the black-diamond run, and its risk rules are *supposed* to be stricter than the long book's.

---

## 7 · Pre-trade worksheet (fill this in before you click)

Copy this and complete every line. If any answer is wrong, **there is no trade** — you don't proceed to the next line.

```
── GATE (from the HUD) ─────────────────────────────
[ ] Regime agrees with my direction?      Bull=long / Bear=short ....  YES / NO
[ ] Confluence score ≥ 55?                 Score: ____              ....  YES / NO
[ ] Halt state = Ready (no banner)?                                 ....  YES / NO
[ ] Book un-halted, cooldown clear?                                 ....  YES / NO
      → any NO above = STOP. Risk outranks selection.

── SIZE (the §1 formula) ───────────────────────────
1. Risk budget:              risk%           = ______ %   (house: 1.0%)
2. Stop distance:            stop-dist%      = ______ %   (long ≈ 2 × ATR%)
3. Chop de-rating (HUD):     Risk Scale      = ______ x   (1.0 / 0.75 / 0.45)
4. Effective risk:           risk% × scale   = ______ %
5. RAW size:                 (4) ÷ (2)       = ______ % of equity
6. Position cap check:       ≤ 100%?  if not, clip to 100%  →  size% = ______ %
7. My 1R (this trade):       = line (4)       = ______ % of equity

── PLAN (in R, never dollars) ──────────────────────
    T1 target:  +1R   →  scale out, then move stop to BREAKEVEN
    T2 target:  +2R   →  scale out
    Runner:     Chandelier trail (22-bar extreme, ATR(14) × 3)
    Exit-if:    regime turns / stop hit / thesis breaks (short: AVWAP reclaim)

── JOURNAL (freeze it now, before the outcome) ─────
    Entry, stop, planned R, and thesis logged?                      ....  YES / NO
```

> Notice what the worksheet does **not** contain: a price target in currency, a profit expectation, a "how much will I make." Those are not knowable and not the point. The worksheet's only job is to define your risk *before* the market defines your outcome — and to make sure a breaker or a de-rating can veto you before you commit.

---

## 8 · The rules, condensed

- [ ] **Risk outranks selection.** A halt, a cap, or a de-rating beats any signal.
- [ ] **`size% = risk% ÷ stop-distance%`.** The stop sets the size; conviction never does.
- [ ] **1% risk is the house default.** Every outcome is then an R-multiple of that.
- [ ] **Percent of equity and R only.** No dollar figure ever enters the decision.
- [ ] **T1 at 1R, breakeven after T1, T2 at 2R, trail the runner.** Mechanical, not discretionary.
- [ ] **Respect the 0.45× / 0.75× de-rating.** Smaller size *and* smaller R in chop, by design.
- [ ] **Shorts are unproven and net-negative in testing.** Smallest size or none until validated.
- [ ] **Below ~100 trades your R-average is an anecdote.** The edge is earned and validated out-of-sample — never assumed.

---

*This document describes a decision-support process, not investment advice, and makes no promise, guarantee, or implication of profit. Disciplined risk sizing over a large, validated sample can **tilt the odds** — it cannot make any single trade or any book profitable, and any edge must be earned and confirmed out-of-sample, never assumed. Every figure here is a percent of equity or an R-multiple; there are no dollar amounts. The short side is unvalidated. You are the trader; the system is the second opinion.*

**— The Hermes Desk**
