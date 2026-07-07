# The Setup Catalog — Five-Tool Confluence AIO v3.5-SHORT

### A plain-English profile of every entry trigger — what it is, the story behind it, and how to recognize it

> **A candidate is not a setup.** This catalog is a field guide to *pattern recognition*, not a shopping list. A trigger arming is the system raising its hand — it becomes a trade only after the regime gate, the confluence floor, the risk halts, and *your* journaled thesis all agree. Read this alongside **The-Hermes-Playbook.md** (how to *play* the thesis) and **CHART_READING_GUIDE.md** (how to *read* every panel). This doc covers the one thing those don't: the anatomy of each individual trigger.

---

## How to Read a Profile

Every trigger below is described the same way, so you can compare them at a glance:

- **What it is** — the one-line identity.
- **The market story** — why this pattern is worth a look at all.
- **What the system requires** — the exact conditions, in plain terms, faithful to the code. All must be true.
- **Textbook example** — what a clean instance looks like on the tape.
- **Entry / stop / target** — the mechanics once it fires.
- **On the HUD & chart** — how it shows up live, plus the entry-id tag stamped on the backtest marker (e.g. `L1 · flip · 85`).
- **Failure modes / when to skip** — how it lies to you, and when to pass even when it's green.

**Two things are true of *every* trigger and are not repeated in each profile:**

1. **The regime is the gate.** No long arms unless the regime is **Bull**; no short arms unless the regime is **Bear**. This is non-negotiable and upstream of everything below.
2. **The floor is the floor.** The confluence score must clear **`min_score` (default 55)**, the entry gates must pass (trend quality, minimum strength, stability, no shock bar), relative strength must agree, the environment filters must allow it, the book must be flat, and no halt can be active. A trigger firing into a failed gate is a *no-trade*. See Playbook §3–§5.

---

# THE LONG TRIGGERS — the tested workhorse

Four ways to arm a long. Any **one** of them, stacked on a Bull regime and a ≥55 score, is a candidate. They are listed in the order the score respects them — from the trigger that catches the most leg to the one that asks for the most confirmation.

---

## L1 · Regime Flip to Bull

**Marker:** `L1 · flip · <score>`  ·  **HUD trigger word:** `flip`  ·  **Trigger points to the score:** 25 (the richest)

**What it is.** The bar the regime engine confirms a fresh flip from Neutral/Bear **into Bull**. The freshest, highest-value entry in the book — it aims to be there when the leg is born.

**The market story.** A trend has just cleared the volatility-normalized threshold *and* survived its confirmation bars *and* passed the EMA-direction and gap guards. The regime brain is saying "the character of this tape just changed." Catching the flip aims to position near the start of a new leg rather than late in it — but that is a design intent, not a promise; it only tilts the odds over a large sample, and the leg may never follow through. Nothing here is validated until it survives out-of-sample.

**What the system requires:**

- [ ] The confirmed regime changed to Bull **this bar** (a genuine flip, not a continuation of an existing Bull).
- [ ] The `Trigger: regime flip` input is on.
- [ ] All the shared gates (score ≥ 55, quality, strength, flat, un-halted).

**Textbook example.** After a stretch of red or gray background, the tint turns green, price is holding above its EMA(100), and the anchored VWAP *re-anchors right here* — a fresh gold line begins at the flip bar. Momentum is turning up but not yet stretched.

**Entry / stop / target.** Entry on the next open after the confirmed flip. Stop = **ATR(14) × 2** below entry — that distance *is* your 1R. Scale at **T1 = 1R**, **T2 = 2R**, move to **breakeven after T1**, and let the chandelier trail carry the runner once you're 1R in profit. Full risk machinery: Playbook §5 and §10.

**On the HUD & chart.** Regime cell flips to `Bull`, the background turns green, a **green triangle** prints below the bar, and `Score L` jumps. The gold AVWAP line visibly resets to this bar.

**Failure modes / when to skip:**

- **The whipsaw flip.** In chop, regimes can flip and flip back. The engine's confirmation bars and hysteresis exist to suppress this, but they can't eliminate it. If `Chop: High` or the age of the new regime is tiny, respect the auto-derated size — or pass.
- **The exhausted flip.** A flip that confirms only *after* a huge run has already happened is late by design (the engine lags at turns). If `Strength` is already extreme, you may be buying the top of the move, not the start of the leg.
- **Flip on a shock bar.** A gap/shock is designed to neutralize a new flip and block entries. Don't override the `Gap: Shock` warning.

---

## L2 · Hidden Continuation Divergence (above the AVWAP)

**Marker:** `L1 · hidDiv · <score>`  ·  **HUD trigger word:** `hidDiv`  ·  **Trigger points:** 25

**What it is.** A **hidden bullish divergence** — price makes a *higher* low while the oscillator makes a *lower* low — occurring **above** the anchored VWAP inside an existing Bull regime. A pullback that refuses to break.

**The market story.** Hidden divergence is a *continuation* signal, not a reversal. The dip shook out weak momentum (oscillator dropped) but price held its ground (higher low). Because it's above the AVWAP, demand is still in control of this leg. This is the "buy the pullback in an uptrend" pattern, formalized.

**What the system requires:**

- [ ] Two consecutive oscillator pivot **lows** (RSI or MFI, 5 bars each side), spaced **5–60 bars** apart.
- [ ] Price at the newer pivot low is **higher** than the prior pivot low.
- [ ] Oscillator at the newer pivot low is **lower** than the prior one.
- [ ] Price is trading **above** the anchored VWAP (`AVWAP ↑`).
- [ ] `Trigger: hidden continuation divergence` is on.

**Textbook example.** Uptrend, green background, price above the gold line. Price dips into a shallow pullback, prints a low that's clearly above the last swing low, but RSI sags to a *lower* trough than before. The higher-low/lower-low mismatch is the tell; the "above AVWAP" requirement keeps you out of pullbacks that have already ceded control.

**Entry / stop / target.** Identical mechanics to L1: ATR(14) × 2 stop = 1R, T1/T2 at 1R/2R, breakeven after T1, chandelier runner.

**On the HUD & chart.** `Osc` cell shows the oscillator; `AVWAP` reads `↑`. Green triangle prints. The `hidDiv` tag on the marker distinguishes it from a flip entry.

**Failure modes / when to skip:**

- **Pivot lag.** Divergence needs 5 bars to the *right* of a pivot to confirm — the signal is real but arrives a handful of bars after the actual low. That's the honesty cost of non-repainting; don't chase a price that's already run.
- **Divergence that keeps diverging.** A single hidden div is a condition, not a guarantee the pullback is over. Momentum can keep bleeding.
- **The AVWAP fake.** If price is barely above the AVWAP and slipping, the "above" condition is fragile — one bar and you're below it and the story flips to supply.

---

## L3 · Regular Divergence in the Value Zone

**Marker:** `L1 · regDiv · <score>`  ·  **HUD trigger word:** `regDiv`  ·  **Trigger points:** 20

**What it is.** A **regular bullish divergence** — price makes a *lower* low while the oscillator makes a *higher* low — occurring inside the **value zone** (between the AVWAP and its −1σ band). A reversal setup bought at fair value.

**The market story.** Regular divergence signals *exhaustion of the down-move*: price pressed to a new low but momentum couldn't confirm it (higher oscillator low). Requiring it inside the value zone means you're buying that turn where the leg's own volume-weighted "fair price" says there's value — not catching a knife in open space far below.

**What the system requires:**

- [ ] Two consecutive oscillator pivot **lows**, 5–60 bars apart.
- [ ] Price at the newer pivot low is **lower** than the prior one.
- [ ] Oscillator at the newer pivot low is **higher** than the prior one.
- [ ] Price is inside the **long value zone** — at or below the AVWAP but at or above the AVWAP − 1σ (unless the value-zone requirement is switched off, in which case any location qualifies; it's on by default).
- [ ] `Trigger: regular divergence in value zone` is on.

**Textbook example.** Price is pulling back within a Bull regime, dipping into the shaded band just under the gold line. It pokes a marginally lower low, but RSI carves a clearly higher trough. The higher-low in momentum against the lower-low in price, *inside* the value band, is the setup.

**Entry / stop / target.** Same mechanics as above: ATR(14) × 2 = 1R, scale at 1R/2R, breakeven after T1, trail the runner.

**On the HUD & chart.** The `AVWAP` cell and the shaded value band on the chart tell you whether price is actually in the zone. Green triangle, `regDiv` tag.

**Failure modes / when to skip:**

- **Counter-trend by nature.** This is the only long trigger that *fights* the immediate down-swing to catch a turn. It's the second-lowest-scored trigger (20 — only the reclaim's 15 is lower) for a reason: it leans hard on RS and location to clear the floor.
- **Out-of-zone divergence.** If the value-zone requirement is off and you take a regular div far below the AVWAP, you've removed the guardrail that makes this setup sane. Keep the zone on.
- **Divergence into a genuine breakdown.** If the regime is thin or wobbling toward Neutral, "exhaustion" can just be a pause before more selling.

---

## L4 · AVWAP Reclaim with RS Confirmation

**Marker:** `L1 · reclaim · <score>`  ·  **HUD trigger word:** `reclaim`  ·  **Trigger points:** 15 (asks for the most confirmation)

**What it is.** Price **crosses back up through** the anchored VWAP — closing above it this bar after closing at/below it last bar — **and** the symbol is a full RS **leader** (outperforming the benchmark *and* rising).

**The market story.** The AVWAP is where the average buyer of this leg sits. Reclaiming it means demand just wrested control back from supply. On its own, a reclaim is common and noisy — so this trigger demands the strongest possible relative-strength confirmation before it counts: not merely positive RS, but a *leader*. Price retakes control with the benchmark behind it.

**What the system requires:**

- [ ] Price closes **above** the AVWAP this bar, having closed **at or below** it on the prior bar (a genuine upward cross).
- [ ] Mansfield RS is a **leader** — positive *and* rising (this is stricter than the other longs, which accept mere positive RS).
- [ ] `Trigger: AVWAP reclaim with RS confirmation` is on.

**Textbook example.** Price has been chopping under the gold line, then closes decisively back above it. The RS/Mansfield read isn't just positive — it's climbing, and the HUD shows `Leader`. The cross plus the leadership is the whole setup.

**Entry / stop / target.** Same mechanics: ATR(14) × 2 = 1R, 1R/2R scaling, breakeven after T1, chandelier runner.

**On the HUD & chart.** `AVWAP` flips from `↓` to `↑` on the reclaim bar; the `RS` cell must read `Leader`. Green triangle, `reclaim` tag.

**Failure modes / when to skip:**

- **The false reclaim.** Price pops above the AVWAP for one close and slides right back under. The RS-leader requirement is the filter against this — without leadership, a reclaim is just noise. Don't relax it.
- **Lowest base score.** Because the trigger itself only contributes 15, this setup *cannot* clear the 55 floor on the trigger alone — it leans hard on RS, location, and strength points. If those aren't there, it won't arm, and that's correct.

---

## Long Triggers at a Glance

| Tag | Trigger | Direction of the trade | Trigger score | Core requirement beyond the regime gate |
|---|---|---|---|---|
| `flip` | Regime flip to Bull | With a *new* trend | 25 | The regime confirmed a flip to Bull this bar |
| `hidDiv` | Hidden continuation divergence | *Continuation* of an uptrend | 25 | Higher price low + lower osc low, **above** AVWAP |
| `regDiv` | Regular divergence in value zone | *Reversal* of a pullback | 20 | Lower price low + higher osc low, **in** the value zone |
| `reclaim` | AVWAP reclaim + RS leader | Reassertion of demand | 15 | Upward AVWAP cross **and** RS is a full leader |

> The scaling legs share the trigger word: you'll see the same setup tagged `L1 · flip · 85`, `L2 · flip`, `L3 · flip` as the position enters in up to three pieces. Only `L1` carries the score.

---

# THE SHORT TRIGGERS

## ⚠️ UNVALIDATED — read this before recognizing a single short setup

> **The entire short side is an experiment, not a product.** The dedicated sell-side system is a behavior-changing variant that has **not passed its validation campaign**, and in the reference backtest it ran **net negative**. Nothing below is evidence that shorting works. These profiles exist so you can *recognize* what the experiment is doing and journal it honestly — sized as tuition, or not traded at all — until the campaign in Playbook §9 clears it. Do not read the presence of a detailed profile as a blessing. See Playbook §7.

The short book is **deliberately** harder to satisfy than the long book. Shorting is the black-diamond run: losses come faster and squeezes are violent, so the sell-side wraps every trigger in a **veto stack**. Under the default dedicated logic there are **two** ways to arm a short, and both must survive the vetoes.

**Shared short preconditions (upstream of both triggers):**

1. **Regime = Bear**, the entry gates pass, and the environment filters allow a short.
2. **Relative weakness.** By default the symbol must be a *relative-weakness leader* — Mansfield below zero **and** not rising — and it must **not** be an RS leader.
3. **None of the veto filters tripped** (detailed after the triggers).
4. **Score ≥ 55** on the dedicated short score, and the book is flat and un-halted.

---

## S1 · Failed AVWAP / Supply Reclaim

**Marker:** `S1 · failAVWAP · <score>`  ·  **HUD trigger word:** `failAVWAP`  ·  **Trigger points to the short score:** 45 (the highest-conviction short)

**What it is.** Price rallies up **into** the anchored VWAP (the supply line of a down-leg), fails to reclaim it, and gets **rejected below** it on a weak candle. The short-side mirror of "buy the pullback" — here it's "sell the failed bounce."

**The market story.** In a Bear regime the AVWAP acts as overhead supply — the average price of trapped longs. A rally that pokes into that line and rolls over is the market telling you sellers are still defending it. You're entering as the bounce fails, with the invalidation (a successful reclaim) close overhead.

**What the system requires:**

- [ ] Price is **below** the AVWAP (close under the gold line).
- [ ] Price **tested supply** this bar: the *high* reached up to within the retest tolerance of the AVWAP (default 0.35 ATR below it), but the bar still **closed below** the AVWAP.
- [ ] It's a **rejection candle**: either a red bar (close < open) *or* an upper wick that's at least 35% of the bar's range.
- [ ] Relative weakness confirmed, and the veto stack clear.

**Textbook example.** Red background. Price grinds up toward the gold line, prints a bar whose high stabs into it, but closes back below with a visible upper wick — a rejection at supply. Mansfield is negative and deteriorating.

**Entry / stop / target.** Entry on the next open. **Structural stop:** placed **above the recent supply/rejection high** (the higher of the shelf high or the AVWAP) plus a small buffer (0.25 ATR) — *not* a symmetric ATR box. Your **R is measured against that real invalidation**, and size keys off it. If that structural distance is wider than the max stop (8% by default), the no-chase filter kills the trade. Targets scale at 1R/2R with breakeven after T1 and a chandelier runner, same as longs. Additionally, the short **exits on an AVWAP reclaim** — if price closes back above the gold line, the thesis broke, get out.

**On the HUD & chart.** `Regime: Bear`, `AVWAP ↓`, `RS` weak, and the **Short:** cell reads `Review OK` when all vetoes are clear. A **red triangle** prints above the bar. Marker tag `failAVWAP`.

**Failure modes / when to skip:**

- **The reclaim that sticks.** The whole thesis is a *failed* reclaim; if the next bar closes back above the AVWAP, you were early and the AVWAP-reclaim exit fires. That's the trade working as designed — a fast, small loss — not a reason to widen the stop.
- **Rejection that isn't rejection.** A doji tagging the line with no real upper wick and a flat close is a weak signal the filter may still pass; use your eyes.
- **Squeeze fuel.** A failed-reclaim short into a name with recovering RS or a big green body is exactly what the squeeze veto is for. If it blocks, believe it.

---

## S2 · Bear-Flag Breakdown

**Marker:** `S1 · bearFlag · <score>`  ·  **HUD trigger word:** `bearFlag`  ·  **Trigger points:** 32

**What it is.** Price breaks **down through the floor of a consolidation shelf** — the lowest low of the recent ~8 bars — while trading **below** the AVWAP, with relative weakness confirmed. The continuation break of a bear flag.

**The market story.** After a leg down, price pauses and consolidates sideways (the "flag"). A close below the shelf that has contained that pause signals the pause is over and the down-leg is resuming. Requiring it below the AVWAP and with weak RS keeps you from shorting a bounce that merely dipped.

**What the system requires:**

- [ ] Price is **below** the AVWAP.
- [ ] Price **closes below** the shelf floor — the lowest low of the prior ~8 bars (the shelf lookback).
- [ ] Relative weakness confirmed (the trigger requires it directly).
- [ ] The bear-flag breakdown trigger is enabled, and the veto stack clear.

**Textbook example.** Red background, price under the gold line, a tight sideways shelf of several bars, then a bar that closes cleanly below the bottom of that shelf. Mansfield negative and falling.

**Entry / stop / target.** Same as S1: **structural stop above the shelf/supply high** (+0.25 ATR buffer), R keyed off that distance, no-chase kill if it's wider than 8%, 1R/2R scaling, breakeven after T1, chandelier runner, and the **AVWAP-reclaim thesis-broke exit**.

**On the HUD & chart.** `Regime: Bear`, `AVWAP ↓`, `RS` weak, **Short:** cell `Review OK`. Red triangle above the bar. Marker tag `bearFlag`.

**Failure modes / when to skip:**

- **The bear trap.** The classic failure: price breaks the shelf, sucks in shorts, then reverses hard back above it. The structural stop above the shelf is where that invalidates — respect it, don't move it.
- **Breakdown into support.** Breaking a shelf right onto a larger support level is a low-room short; the support-proximity veto (needs ≥ 1.25 ATR of room below) exists precisely to block this.
- **Already stretched.** A shelf that breaks after price is already far below the AVWAP or oversold is a chase, not a setup — the no-chase veto should catch it.

---

## The Short Veto Stack — why shorts are (correctly) hard to get

Even with a Bear regime, a clean trigger, weak RS, and a ≥55 score, a short is **blocked** if *any* of these trip. The blocking reason surfaces in the HUD **Short:** cell.

| Veto | HUD reads | It blocks a short when… |
|---|---|---|
| **High chop** | (folds into `Not Ready`) | Trend quality is the worst tier (both ADX and ER weak). |
| **No-chase** | `No Chase` | Price is stretched > 3 ATR below the AVWAP, RSI ≤ 28 (oversold), 4 straight down bars, **or** the structural stop is wider than the 8% max. |
| **Support-room** | `Support Near` | Less than 1.25 ATR of room down to the recent support low. |
| **Squeeze-risk** | `Squeeze Risk` | A large green body (≥ 0.9 ATR), a gap up (≥ 0.75 ATR), extreme ATR% (≥ 8%), **or** RS is *recovering* (Mansfield below zero but rising). |

> **The asymmetry is the point.** These vetoes make shorts rare on purpose. If you find yourself loosening them to make trades appear, stop — you are manufacturing sample, not proving an edge. "No short here" is the system working, not failing.

---

## Short Triggers at a Glance

| Tag | Trigger | Trigger score | Core requirement | Note |
|---|---|---|---|---|
| `failAVWAP` | Failed AVWAP / supply reclaim | 45 | Below AVWAP, high tests supply, rejection candle | Highest-conviction short |
| `bearFlag` | Bear-flag breakdown | 32 | Below AVWAP, close under the ~8-bar shelf floor, weak RS | Continuation break |
| `bearFlip` | Bear regime flip | 15 | Only available if the "require failed reclaim" input is turned off | Off by default |

> `bearFlip` appears only when you relax the default requirement that every short come from a failed reclaim or a breakdown. It's the legacy path; the dedicated system prefers the two structural triggers above.

---

## The Discipline Around Every Setup

- [ ] **Recognition is not permission.** Seeing the pattern is step one; the regime gate, the 55 floor, the vetoes, and your journaled thesis are steps two through five.
- [ ] **Trade the tag you can name.** If you can't say which trigger fired and why it cleared the floor, you don't have a setup — you have a hunch.
- [ ] **The long side is the workhorse; the short side is an unproven experiment** that is net-negative in testing. Size accordingly, or don't short at all.
- [ ] **Everything is R and % of equity** — never a dollar. The stop sets the size; the size never sets the stop.
- [ ] **A trigger tilts the odds; it does not deliver a result.** Any edge here must be *earned* over a large sample and *validated out-of-sample*, never assumed. Below ~100 trades you know nothing.

---

*This is a pattern-recognition guide for a decision-support tool. Every trigger describes a condition in the present tape — none of it predicts the future or promises a profitable outcome. Every figure is a percent of equity or an R-multiple; there are no dollar amounts. The short side is unvalidated and net-negative in testing. Read it with the Playbook and the Chart Reading Guide, respect the halt banner, and journal every trade.*

**— The Hermes Desk**
