# THE HERMES PLAYBOOK
### Trading the Regime-Confluence Thesis — *Five-Tool Confluence AIO v3.5-SHORT*
**Desk Manual · v1.0**

> **House rule, above all others.** This is a decision-*support* process, not a signal service. Every reading the system produces is **posture, not directive**. The edge lives in a disciplined human pulling the trigger on a validated setup — never in the indicator firing. **Honesty is the product.** A tool that flatters you is worse than no tool at all.

---

## 1. The Thesis, in One Paragraph

Markets spend most of their time in one of three **regimes** — trend up, trend down, or chop — and the single most expensive mistake a trader makes is fighting the one they're in. Our thesis is that if you (1) identify the regime with a disciplined, non-repainting model, (2) only take trades that *agree* with that regime across several independent confirmations — trend, relative strength, location, and momentum — and (3) size by risk rather than conviction, you tilt the odds in your favor over a large sample. We do **not** claim to predict price. We claim to *describe the present accurately* and act only when the evidence stacks. Everything below is the machinery for doing that consistently.

> **What this is NOT:** a forecast, a guarantee, or an edge that's been proven to print money. It is a filter that keeps you aligned with the tape and out of low-quality trades. The long side is the tested workhorse; the short side is an **unvalidated experiment** (see §7).

---

## 2. The Instrument — What the AIO Actually Measures

The strategy is a stack of five tools plus a regime brain and a statistics readout. You don't trade any one of them alone; you trade their **confluence**.

| Module | What it reads | What it does NOT prove |
|---|---|---|
| **1 · Regime Engine** | 20-day log return, normalized by realized volatility (a z-score). Above the *enter* threshold → trend; hysteresis holds it until the *exit* threshold. Filtered by EMA(100) direction and a 4×ATR gap guard; confirmed over 2 bars. | It labels the present regime; it does not forecast the next one. Lags at turns by design. |
| **2 · Relative Strength** | Mansfield RS — the symbol vs its benchmark (SPY) against a 200-day zero line. Leader / laggard / rising / new-high-low. | A past performance tilt, not persistence. |
| **3 · Divergence** | RSI/MFI pivots vs price pivots — regular (reversal) and hidden (continuation). | A condition, not a trigger on its own. |
| **4 · Anchored VWAP** | Volume-weighted average price *re-anchored at each regime flip*. Above = demand in control; below = supply. A ±1σ "value zone." | The anchor resets every flip — read it as "since this leg began," not absolute. |
| **5 · Risk & Exits** | Position sizing, stops, targets, trailing, and the protection halts. | Arithmetic over % of equity — it says there's room, not that the trade is good. |
| **1c · Markov Readout** | Empirical transition matrix of the confirmed regime series: p(stay), mean dwell, maturity, stationary base rate, with 95% confidence bands. | **A long-run base rate, not a forecast.** Explicitly labeled "Not forecast" on the chart. |

**The regime is the gatekeeper.** No long fires unless the regime is Bull. No short fires unless the regime is Bear. Everything else refines *which* aligned trades you take.

---

## 3. The Operating Doctrine — Non-Negotiables

These are the rules that outrank every setup. Break a setup rule and you miss a trade; break a doctrine rule and you blow up.

- [ ] **Risk outranks selection.** A great-looking setup in a risk-breached book is a no-trade. The circuit breaker beats the signal, always.
- [ ] **% of equity only — never think in dollars.** Size, risk, and drawdown are always a percent. It keeps ego out of the position.
- [ ] **Posture, not prediction.** The system tells you the weather, not the future. You decide whether to carry an umbrella.
- [ ] **Non-repaint is law.** Act on *confirmed* bars. A signal that moves after the fact is a lie you told yourself.
- [ ] **A candidate is not a setup.** A screen or a green light is a name worth a *look*. It becomes a trade only when you've journaled a thesis with a defined stop.
- [ ] **Small sample = anecdote.** Below ~100 trades, any statistic is noise. Do not draw conclusions from 12 trades because the number is pretty.
- [ ] **The short side is unproven.** Until it beats longs-only out-of-sample, net of costs, shorts are an experiment carried at the smallest size or not at all.

---

## 4. The Timeframe Stack — Tide, Trade, Time

Trade one strategy across **three timeframes**, each with one job. This is your top-down routine before any position.

| Chart | Role | The question it answers |
|---|---|---|
| **Weekly** | **The Tide** | What regime am I swimming in? Only fight it with eyes open. |
| **Daily** | **The Trade** | This is where the decision is made and the position is sized. |
| **1-Hour** | **The Time** | Where's the low-risk entry *within* the daily thesis? |

**Rule of the stack:** the Daily makes the call; the Weekly grants permission; the 1H fine-tunes the entry. If the Weekly tide and the Daily trade disagree, you shrink size or stand aside — you do not let the 1H talk you into fighting the tide.

---

## 5. The Long Playbook (the tested workhorse)

**Precondition:** Regime = **Bull**, confluence **score ≥ 55**, and the book is flat and un-halted.

**The four triggers** (any one arms a long):
1. **Regime flip to Bull** — the freshest, highest-value entry. Catches the whole leg.
2. **Hidden continuation divergence** above the AVWAP — a pullback that refuses to break.
3. **Regular divergence** inside the value zone — a reversal setup at fair value.
4. **AVWAP reclaim** with RS leadership — price retakes control with the benchmark behind it.

**The confluence score (0–100)** stacks: trigger quality + relative strength + location vs AVWAP + RS new-high + trend strength. **55 is the floor.** Below it, the confluence isn't there — pass.

**Execution:**
- **Stop:** ATR(14) × 2 below entry. That distance defines your **1R**.
- **Size:** `size% = risk% ÷ stop-distance%`, risking **1% of equity** per trade, de-rated automatically in chop.
- **Targets:** scale at **T1 = 1R** and **T2 = 2R**; move stop to **breakeven after T1**; **chandelier trail** the runner once you're 1R in profit.
- **Get out** when the regime turns against you (Bear), your stop is hit, or your thesis is invalidated — whichever comes first.

> **Stand down when:** regime is Neutral or Bear, chop is High, RS is a laggard, or the risk halt is active. The best long is often no long.

---

## 6. Reading the HUD — Your Cockpit

The on-chart dashboard is the whole thesis at a glance. Read it top-to-bottom before acting.

- **Regime cell** (Bull / Bear / Neutral): the gate. Colored = active.
- **RS cell** (Leader / Laggard / RS± ): is the name with or against the benchmark?
- **Score L / Sv2**: long score / short score vs the 55 floor. This is your go/no-go number.
- **AVWAP ↑ / ↓**: is price above (demand) or below (supply) the anchored VWAP? *Shorts require ↓.*
- **Chop / Risk Scale**: High chop auto-shrinks size (0.45×). Respect it.
- **Short: [state]**: tells you exactly which short filter is blocking ("Squeeze Risk," "Support Near," "No Chase," or "Review OK").
- **Validation panel**: Longs vs Shorts split, OOS, walk-forward chunks, and the "Review / Healthy" verdict.
- **Markov panel**: persistence stats — context, never a signal.

---

## 7. The Short Playbook (⚠️ UNVALIDATED — handle as an experiment)

> **Read this box before you short anything.** The dedicated short system is a *behavior-changing variant that has not passed its validation campaign*. In the reference backtest it ran **net negative**. Running it live is a workflow choice, not evidence. Treat every short as tuition, sized accordingly, until the campaign in §9 clears it.

**Precondition:** Regime = **Bear**, relative **weakness** (Mansfield < 0), price **below** the AVWAP, and none of the veto filters tripped.

**The two triggers:**
1. **Failed AVWAP / supply reclaim** — price rallies into supply and gets rejected below the anchored VWAP.
2. **Bear-flag breakdown** — price breaks the shelf of a consolidation, below AVWAP, with RS weak.

**The veto stack (why shorts are — correctly — hard to get):**
- **No-chase:** don't short something already stretched >3 ATR below AVWAP, oversold (RSI ≤ 28), or after 4 straight down bars.
- **Support-room:** don't short into support with < 1.25 ATR of room below.
- **Squeeze-risk:** don't short into a big green candle, a gap up, extreme ATR, or recovering RS.

**Execution:** stop sits **above the structural supply high** (+ buffer) — not a symmetric box — and R keys off that real invalidation. Exit on an **AVWAP reclaim** (the thesis broke).

> **The asymmetry is deliberate.** Shorting is the black-diamond run: losses come faster, squeezes are violent, and the math is unforgiving. The short book is *supposed* to be pickier than the long book. If you loosen its filters to make trades appear, you are gathering sample — **not** proving an edge.

---

## 8. The Three Chart Configs

Same strategy, three saved layouts. Keep them separate so results never blend.

**🟢 PURE BULL — your benchmark (Arm A).** `Allow shorts` OFF · all four long triggers ON · `min_score` 55 · defaults. This is your validated bull book, untouched. Every experiment must beat *this* number.

**🔴 PURE BEAR — shorts in isolation.** `Allow shorts` ON · all four Entry-Confluence triggers OFF (kills longs) · `Use dedicated sell-side logic` ON. Judges the short side on its own P&L, never hidden inside the longs.

**⚪ HYBRID — the combined experiment (Arm C).** Both sides live. Useful, but **not** a substitute for either pure chart: a shared account means shorts reshape long results, and an unproven short book can drag a healthy long book. Read it against Pure Bull, always.

---

## 9. Validation Discipline — Earn the Right to Trust It

No variant is "real" until it survives a pre-committed campaign. This is the difference between a system and a story.

**The A/B/C test — same everything, only the short treatment changes:**
- **Arm A — Longs only:** the null. The number to beat.
- **Arm B — Legacy mirror short:** is *any* short better than none?
- **Arm C — Dedicated short:** does the crafted logic beat the mirror?

**Pass gates (decide these first, honor them later). Arm C is accepted only if, out-of-sample, ALL hold:**
- [ ] Beats the null (A) net of costs.
- [ ] Beats the mirror (B) on profit factor.
- [ ] Sample ≥ ~100 trades — below that it's *inconclusive, not a pass*.
- [ ] Not one-trade luck: "Ex Best 1 / Ex Best 3" stay positive.
- [ ] Stable across walk-forward chunks.
- [ ] Survives the squeeze — worst short loss streak within tolerance.

**If any gate fails → shorts stay OFF, and that's a *result*, logged with the same pride as a win.** "Don't short" beating your short book is the campaign doing its job.

---

## 10. Risk Management — the Layer That Keeps You in the Game

- **Per-trade risk:** 1% of equity. Full stop.
- **Sizing:** `size% = risk% ÷ stop-distance%`. Wide stop → small size. The stop sets the size, not your excitement.
- **Chop de-rating:** size auto-cuts to 0.75× (medium) / 0.45× (high) chop.
- **Equity drawdown halt:** entries pause at a 25% rolling drawdown. The breaker outranks every signal.
- **Think in R, not money.** Every trade is measured as a multiple of its own risk. A +2R win and a −1R loss are the only vocabulary you need.

---

## 11. The Practice Curriculum — How to Actually Start

> **1 strategy · 3 timeframes · 1 side · 100 journaled reps.** Depth before breadth. You do not need five bull strategies and five bear strategies — you need *one* process run until it's muscle memory.

1. **Master reading the one strategy** before you look for a second. Know why every gate fires.
2. **Trade longs first.** Higher base rate, and the tested side. Add shorts only after the long process is automatic *and* the campaign clears.
3. **The four long triggers ARE your "five strategies."** Get reps on them; don't go collecting setups.
4. **Replay and paper-trade** before real risk.
5. **Journal every trade, review every week.** The loop below is the curriculum — the strategy is just the textbook.

---

## 12. The Trade Journal (record this, every time)

| Field | Why it matters |
|---|---|
| **Date / symbol / timeframe** | Context for later grouping. |
| **Regime + RS + score at entry** | Freeze the thesis as it was, not as you remember it. |
| **Trigger** | Which of the four/two fired. |
| **Entry / stop / planned R** | Your risk, defined *before* the outcome. |
| **Exit / realized R** | What actually happened. |
| **Thesis verdict (yes / partial / no)** | *Separate from P&L.* "Was I right" ≠ "did I make money." |
| **One-line lesson** | The only part that compounds. |

---

## 13. Rules of Engagement (print this)

- [ ] Trade *with* the regime or don't trade.
- [ ] Score below 55 = no trade.
- [ ] Risk 1% of equity, sized by the stop.
- [ ] Longs are the workhorse; shorts are an unproven experiment.
- [ ] Never let the Hybrid chart become your read of the longs.
- [ ] A halt beats a signal. Every time.
- [ ] Journal it or it didn't happen.
- [ ] Below 100 trades, you know nothing. Keep going.
- [ ] "Don't short" is a valid, honorable strategy until the data says otherwise.

---

## 14. Glossary

- **Regime** — the market's current state: Bull trend, Bear trend, or Neutral/chop.
- **AVWAP** — anchored volume-weighted average price; re-anchors each regime flip.
- **Mansfield RS** — relative strength vs the benchmark against its 200-day zero line.
- **Confluence score** — 0–100 stack of trigger + RS + location + momentum; 55 floor.
- **R** — one unit of risk (entry-to-stop distance). All outcomes measured in R.
- **OOS** — out-of-sample; data the model never saw during tuning. The only honest test.
- **p(stay) / mean dwell** — how sticky a regime is, empirically. Context, not forecast.

---

*This document describes a decision-support process, not investment advice. Every figure is a percent of equity or an R-multiple — there are no dollar targets. The short side is unvalidated. Past behavior does not predict future returns. You are the trader; the system is the second opinion.*

**— The Hermes Desk**
