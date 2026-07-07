# The Hermes Trade Journal & Weekly Review

### A record-keeping system for the *Five-Tool Confluence AIO v3.5-SHORT* process

> **The one hammer of this whole document:** *"Was I right?"* is a completely separate question from *"Did I make money?"* A trade can be a perfect read that stopped out (right thesis, red P&L) or a sloppy lottery ticket that paid (wrong process, green P&L). The journal exists to keep those two questions from ever contaminating each other. If you only track P&L, you will learn the wrong lessons at exactly the wrong time.

This is the record-keeping companion to the two working documents you already have:

- **`The-Hermes-Playbook.md`** — how to *play* the thesis (regimes, triggers, sizing, the validation campaign). Its §12 defines the seven journal fields; this doc turns that stub into a running system.
- **`CHART_READING_GUIDE.md`** — how to *read* the chart (every HUD cell, panel, marker, and `!` flag). Use it to fill the journal fields accurately — the field names below map directly to HUD cells.

Nothing here overrides the Playbook's doctrine. Same house rules apply: **posture not prediction**, **% of equity and R-multiples only — never a dollar figure**, **a candidate is not a setup**, and **the short side is an unvalidated experiment that ran net-negative in testing** (Playbook §7). The journal is where those rules either become habit or get exposed.

---

## Table of Contents
1. [Why journal at all](#1--why-journal-at-all)
2. [The per-trade template](#2--the-per-trade-template)
3. [Filled examples](#3--filled-examples)
4. [The weekly review](#4--the-weekly-review)
5. [Honest self-stats: the three numbers](#5--honest-self-stats-the-three-numbers)
6. [The sample-size rule](#6--the-sample-size-rule)
7. [Optional: a Notion database schema](#7--optional-a-notion-database-schema)
8. [The one-page rules card](#8--the-one-page-rules-card)

---

## 1 · Why journal at all

Because memory lies, and it lies in the direction of your ego. After the fact, a loss becomes "unlucky" and a win becomes "I knew it." The journal freezes the thesis **as it was at entry** — regime, RS, score, trigger, defined stop — before the outcome exists to distort it. Then it separates two ledgers that most traders fatally blend:

- **The thesis ledger** — *was the read correct?* (yes / partial / no). This is a judgment about your **process**.
- **The P&L ledger** — *what did the trade return, in R?* This is a judgment about the **outcome**, which includes luck.

Over a large sample, a sound process with an honest edge tends to drag the P&L ledger positive. Over any small sample, the two ledgers can point in opposite directions purely by chance. **You improve by grading the thesis ledger; you get paid by the P&L ledger — and you must never let a green P&L talk you out of logging a bad read, or a red P&L talk you out of crediting a good one.**

> **Playbook §11 curriculum:** *1 strategy · 3 timeframes · 1 side · 100 journaled reps.* This document is the container for those reps. Below ~100, you are gathering sample, **not** proving an edge (§6).

---

## 2 · The per-trade template

One row per trade. Log it **at entry** (everything left of the double bar), then close it out **at exit** (everything right). Freeze the entry fields *before* you know the outcome — that is the entire point.

| Field | Fill when | Where it comes from | Notes |
|---|---|---|---|
| **Date** | Entry | — | Entry date. Use the Daily bar date. |
| **Symbol** | Entry | — | Ticker. |
| **TF** | Entry | — | Decision timeframe — normally **Daily** (the Trade). Note if Weekly tide and Daily disagreed. |
| **Regime** | Entry | HUD Row 1 *Regime · Source* | Bull / Bear / Neutral. **Longs need Bull; shorts need Bear.** No off-regime trades. |
| **RS** | Entry | HUD Row 1 *RS* + Row 4 *Mansfield* | Leader / Laggard / RS± and the Mansfield %. |
| **Score** | Entry | HUD Row 4 *Score L / Sv2* | The go/no-go number. **Floor is 55.** Log the side you took. |
| **Trigger** | Entry | Entry marker (e.g. `flip`, `hidDiv`, `reclaim`) | Which of the four long / two short triggers armed it (Playbook §5 / §7). |
| **Entry** | Entry | Your fill | Price you actually got in. |
| **Stop** | Entry | ATR×2 (long) or supply-high+buffer (short) | The invalidation. Defined *before* the outcome. |
| **Planned R** | Entry | — | Your target in R at entry (e.g. T1 = 1R, T2 = 2R). Not a promise — a plan. |
| **‖** | — | — | *Everything above is frozen at entry. Everything below is the outcome.* |
| **Exit** | Exit | Your fill(s) | Price(s) out. Note scale-outs if any. |
| **Realized R** | Exit | `(exit − entry) ÷ (entry − stop)` | Signed R-multiple. A stop-out is −1R; T2 is +2R. **R only — never a dollar figure.** |
| **Thesis verdict** | Exit | Your honest call | **yes / partial / no — kept SEPARATE from P&L.** Did the read play out as reasoned, regardless of what you earned? |
| **Lesson** | Exit | You | One line. The only part that compounds. |

**The R math, once:** `Realized R = (exit − entry) ÷ (entry − stop)` for longs; flip the sign convention for shorts (`(entry − exit) ÷ (stop − entry)`). If the stop is your 1R by construction, a full stop-out is −1.0R and every other outcome is measured against that same unit. This is why R, not currency, is the journal's native tongue: it normalizes every trade to its own risk so a big position and a small one are directly comparable (Playbook §10).

**Grading the thesis verdict honestly:**

| Verdict | Means | Example |
|---|---|---|
| **yes** | The read was correct and the market did roughly what the thesis said — *independent of the exit.* | Bull flip, price trended, thesis held — even if you scratched it early. |
| **partial** | The direction/structure was right but a piece was off — timing, level, or you fought the tide. | Right regime, but entered stretched and ate a shakeout before it worked. |
| **no** | The read was wrong. The regime, RS, or location did not behave as the thesis claimed. | Shorted into a squeeze that reclaimed AVWAP the next bar — thesis broke. |

> **Guardrail:** a **yes** with a **−1R** result is a *good trade* (right process, unlucky draw) and a **no** with a **+2R** result is a *bad trade you got paid for* (wrong process, lucky draw). If your journal has many of the latter and you feel great, that is the exact failure mode this system exists to catch.

---

## 3 · Filled examples

Three realistic entries. Note how the **thesis verdict** and the **realized R** deliberately disagree in two of them — that disagreement is the lesson, not an error.

### Example A — a clean long that worked (right *and* paid)

| Field | Value |
|---|---|
| Date / Symbol / TF | 2026-05-12 · NVDA · Daily (Weekly tide also Bull) |
| Regime | **Bull · CORE** |
| RS | Leader · Mansfield +6.1% |
| Score | **L 78** (floor 55 ✓) |
| Trigger | `reclaim` — AVWAP reclaim with RS leadership |
| Entry / Stop / Planned R | Entry above value zone · Stop ATR×2 below (= 1R) · Plan T1 1R, T2 2R, trail runner |
| **‖** | |
| Exit / Realized R | Scaled T1 +1R, T2 +2R, runner trailed out · **blended +1.9R** |
| **Thesis verdict** | **yes** — Bull leader reclaimed AVWAP and trended, exactly as reasoned. |
| Lesson | When RS is Leader *and* score > 75, let the runner run — don't manually cap it. |

### Example B — a correct read that still lost (right, but red)

| Field | Value |
|---|---|
| Date / Symbol / TF | 2026-06-03 · COST · Daily |
| Regime | **Bull · CORE** |
| RS | Rising · Mansfield +1.4% |
| Score | **L 61** (floor 55 ✓, but thin) |
| Trigger | `hidDiv` — hidden continuation divergence above AVWAP |
| Entry / Stop / Planned R | Entry on the pullback · Stop ATR×2 below (= 1R) · Plan T1 1R then trail |
| **‖** | |
| Exit / Realized R | Stop hit on a broad-market flush before T1 · **−1.0R** |
| **Thesis verdict** | **yes** — the setup was valid and correctly taken; a market-wide down day took it out. Nothing in the read was wrong. |
| Lesson | A textbook **yes** can still be −1R. Do **not** "fix" a process that lost to variance on one trade — this is a sample of one. |

### Example C — a short that paid but the process was wrong (the dangerous one)

| Field | Value |
|---|---|
| Date / Symbol / TF | 2026-06-24 · SNAP · Daily |
| Regime | **Bear · CORE** |
| RS | Laggard · Mansfield −9.2% |
| Score | **Sv2 58** (floor 55 ✓) |
| Trigger | `bearFlag` — breakdown below AVWAP |
| Entry / Stop / Planned R | Entered **already >3 ATR below AVWAP** (No-Chase veto *should* have blocked it) · Stop above supply high · Plan 1R–2R |
| **‖** | |
| Exit / Realized R | Kept falling · covered · **+1.6R** |
| **Thesis verdict** | **no** — I chased a stretched short the veto stack exists to forbid (Playbook §7). It worked, but I broke my own rule. This is an **unvalidated, net-negative experiment** and I traded it badly. |
| Lesson | **Getting paid for a rule-break is the worst outcome** — it trains me to repeat it. Log this as a process loss despite the green R. Size shorts as tuition until the §9 campaign clears them. |

> Examples B and C are the whole point. B is a **good trade that lost**; C is a **bad trade that won**. If your journal cannot tell those apart, it is not doing its job.

---

## 4 · The weekly review

Once a week, flat or not, sit with the journal for fifteen minutes. The review is where individual reps turn into a read on *your own process*. Work top to bottom.

**Housekeeping**
- [ ] Every trade this week has both halves logged — entry fields *and* exit fields. No open rows left un-closed.
- [ ] Every entry field was frozen *at entry*, not reconstructed from memory afterward.
- [ ] Realized R computed from the actual stop, not a rounded guess.

**Process audit (grade the thesis ledger, not the P&L)**
- [ ] Did I take any trade **off-regime** (long not in Bull, short not in Bear)? Any such trade is a process failure regardless of R.
- [ ] Did I take any trade **below score 55**? Any veto-stack override on a short (No-Chase / Support-Room / Squeeze-Risk)?
- [ ] Did I trade during a **halt** or ignore the Risk Scale de-rating? The breaker outranks the signal, always (Playbook §10).
- [ ] Did I let the **Hybrid chart** contaminate my read of the pure long book? Keep the three configs separate (Playbook §8).
- [ ] For every **no** verdict: what specifically did I misread — regime, RS, location, or trigger quality?
- [ ] For every **yes that lost** and **no that won**: did I record it as a *process* win/loss, independent of the R?

**Scoreboard (the P&L ledger — compute honestly, §5)**
- [ ] Update win rate, expectancy in R, and profit factor for the running sample.
- [ ] Recompute **longs and shorts separately** — never blend them. Shorts stay flagged as the unvalidated experiment.
- [ ] Note the current sample size and which honesty tier it sits in (§6). Did any number cross out of "noise" this week?

**Forward**
- [ ] One sentence: what is the single process change for next week? (At most one — you cannot fix five things at once.)
- [ ] Confirm nothing this week tempted me to *lower a threshold to make a trade or a `!` appear.* That is hiding the truth from yourself (Chart Guide §8).

> **The review grades the process, not the week's P&L.** A green week built on rule-breaks is a **Review**, not a **Healthy** — exactly as the on-chart Validation panel would flag it (Chart Guide §5).

---

## 5 · Honest self-stats: the three numbers

Three numbers describe a book. Compute them **from your own journal**, in R, and **separately for longs and shorts** — the on-chart Validation panel already refuses to blend the two, and so should you (Chart Guide §5).

### Win rate (WR)
`WR = winning trades ÷ total trades`

The share of trades that closed positive. **Win rate alone is meaningless** — a 40% WR that wins +2R and loses −1R is excellent; an 80% WR that wins +0.3R and loses −3R is a slow bleed. Never judge a book on WR without expectancy.

### Expectancy in R
`Expectancy = (WR × avg win in R) − (loss rate × avg loss in R)`

The **average R you can expect per trade** over the sample. This is the honest headline number because it is already in units of risk — it answers "for each unit I risk, what do I get back on average?" Positive expectancy over a *large, out-of-sample* count is the only thing that resembles an edge — and even then it must be **earned and re-validated**, never assumed to persist.

*Worked example (Longs, 40 trades):* 18 wins averaging +1.8R, 22 losses averaging −1.0R.
`Expectancy = (0.45 × 1.8) − (0.55 × 1.0) = 0.81 − 0.55 = +0.26R per trade.`
Read as: *"over these 40 trades, ~+0.26R each — but 40 is still a thin sample (§6), so this is a hint, not a verdict."*

### Profit factor (PF)
`PF = gross R won ÷ gross R lost`

Total winning R divided by total losing R. **PF above 1.0 means the book took in more than it gave back over the sample; below 1.0 means it bled** (Chart Guide §9). Same worked example: gross won `18 × 1.8 = 32.4R`; gross lost `22 × 1.0 = 22.0R`; `PF = 32.4 ÷ 22.0 = 1.47`.

> **Reference reality check:** the tested **short** book in the Playbook runs **net-negative — PF below 1.0** (§7). When you compute your own short PF, expect it to look ugly, and do **not** rescue it by loosening filters. "Don't short" beating your short book is a *result*, logged with the same pride as a win (Playbook §9).

| Number | Formula | Honest reading |
|---|---|---|
| **Win rate** | wins ÷ total | Context only. Worthless without expectancy. |
| **Expectancy (R)** | (WR × avg win R) − (loss rate × avg loss R) | Avg R per trade. The headline — **if the sample is large and out-of-sample.** |
| **Profit factor** | gross won R ÷ gross lost R | >1.0 took in more than it gave over the sample; <1.0 bled. |

**All three are descriptions of a *past sample*, not forecasts.** They tilt from noise toward signal only as the count grows — which is the entire subject of the next section.

---

## 6 · The sample-size rule

A statistic is only as trustworthy as the count behind it. This mirrors the chart's `!` low-sample flag (Chart Guide §8) and the Playbook's "small sample = anecdote" doctrine (§3).

| Trades in the sample | Status | What you may honestly conclude |
|---|---|---|
| **< ~30** | **Noise** | Nothing. This is the chart's `· Low Sample` tag. WR/expectancy/PF here are stories, not evidence. Do **not** change your process off this. |
| **~30 – 99** | **Thin** | Directional hints at most. A trend may be forming; treat it as a hypothesis to keep testing, never a conclusion. |
| **≥ ~100** | **Minimum robust** | The floor at which numbers begin to *mean* something — and only if they hold **out-of-sample** and across walk-forward chunks (Playbook §9). Even here the edge must be re-earned, never assumed. |

**The rules that flow from the table:**

- **Below ~30 you know nothing.** A pretty number from 12 trades is a coincidence with good marketing.
- **Below ~100 the book is thin** — the on-chart `!` stays lit, and it should stay lit in your journal too.
- **You clear the flag with more trades — never by lowering the threshold.** Making a `!` disappear by editing the setting is lying to yourself (Chart Guide §8). The only honest cure is more reps, more history, more symbols.
- **In-sample size is not enough.** A hundred in-sample trades that fall apart out-of-sample is a curve-fit story, not an edge. Trust the OOS count over the headline count, every time (Chart Guide §5).

> This is why the curriculum target is **100 journaled reps** (Playbook §11). It is not an arbitrary round number — it is the doorway at which your self-stats stop being anecdotes.

---

## 7 · Optional: a Notion database schema

If you keep the journal in Notion (or Airtable), this schema encodes the discipline into the tool itself — the separation of thesis-verdict from P&L becomes two different columns you literally cannot merge. One row = one trade.

| Property | Type | Options / notes |
|---|---|---|
| **Trade** | Title | e.g. `2026-05-12 NVDA L` |
| **Date** | Date | Entry date (Daily bar). |
| **Symbol** | Text | Ticker. |
| **Timeframe** | Select | `Weekly` · `Daily` · `1H` (decision TF — normally Daily). |
| **Side** | Select | `Long` · `Short` — **color Short red as a standing reminder it is unvalidated.** |
| **Regime** | Select | `Bull` · `Bear` · `Neutral`. |
| **RS** | Select | `Leader` · `Laggard` · `Rising` · `Falling`. |
| **Mansfield %** | Number | The RS reading at entry (percent). |
| **Score** | Number | Confluence score of the side taken. Floor 55. |
| **Trigger** | Select | `flip` · `hidDiv` · `regDiv` · `reclaim` · `failAVWAP` · `bearFlag` · `bearFlip`. |
| **Entry** | Number | Fill price. |
| **Stop** | Number | Invalidation price. |
| **Planned R** | Number | Target in R at entry. |
| **Exit** | Number | Fill price out. |
| **Realized R** | Formula / Number | `(Exit − Entry) ÷ (Entry − Stop)` for longs; sign-flip for shorts. **R only.** |
| **Thesis Verdict** | Select | `yes` · `partial` · `no` — **the process column. Never derived from P&L.** |
| **Process OK?** | Checkbox | Did I obey regime / score-55 / veto / halt rules? Unchecked = process loss even if R is green. |
| **Lesson** | Text | One line. |
| **Sample Tier** | Formula / Rollup | From running count: `<30 Noise` · `30–99 Thin` · `≥100 Robust` (§6). |

**Views worth building:**

- **By Side** — longs and shorts in separate views so their stats never blend (mirrors the Validation panel).
- **Process-loss filter** — `Process OK? = unchecked`, regardless of R. This is your rule-break review pile; Example C lives here.
- **Verdict × R matrix** — group by Thesis Verdict, aggregate Realized R. The `yes`-that-lost and `no`-that-won cells are your most valuable reading.
- **Rollup stats** — WR, expectancy (R), and PF (§5) as aggregations, with the Sample Tier badge shown next to them so no number is ever read without its sample size.

> Deliberately, there is **no dollar or currency property** in this schema. If you add one, you will start optimizing it. Keep the whole book in **% of equity and R** — that is doctrine, not preference.

---

## 8 · The one-page rules card

Print this. Tape it above the journal.

- [ ] **"Was I right?" is separate from "did I make money?"** Two columns, never one.
- [ ] Freeze the entry fields **at entry** — before the outcome exists to distort them.
- [ ] Thesis verdict = **yes / partial / no**, graded on the *read*, never on the R.
- [ ] A **yes that lost** is a good trade. A **no that won** is a bad trade. Log them that way.
- [ ] Everything in **R and % of equity** — never a dollar figure.
- [ ] Compute **longs and shorts separately.** Shorts stay flagged: unvalidated, net-negative experiment.
- [ ] **< 30 = noise · < 100 = thin.** Clear the `!` with more trades, never a lower threshold.
- [ ] Expectancy in R is the headline — **but only over a large, out-of-sample count.**
- [ ] One process change per weekly review. At most one.
- [ ] Journal it or it didn't happen.

---

*This is a record-keeping companion to a decision-support process, not investment advice. It records posture, not predictions. Keep your own journal in percent of equity and R-multiples; the only dollar figures in the workflow come from TradingView's own Strategy Tester (a simulated $100k account) — convert them to R, never treat them as targets. The short side is an unvalidated experiment that ran net-negative in testing. No statistic here promises a profit: an edge is something a large sample and disciplined execution must **earn and re-validate out-of-sample** — never something the journal, or the strategy, can assume. When the thesis ledger and the P&L ledger disagree, trust the thesis ledger to grade your process and the sample size to tell you whether either number means anything yet.*

**— The Hermes Desk**
