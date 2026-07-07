# THE VALIDATION PROTOCOL
### How to Earn the Right to Trust a Change — *Five-Tool Confluence AIO v3.5-SHORT*
**Desk Manual · Companion to *The Hermes Playbook* and the *Chart Reading Guide***

> **House rule, above all others.** A change to the strategy is a *claim*, and a claim is worth nothing until it survives a test you committed to **before** you saw the result. This protocol is how a variant stops being a story and becomes something you're allowed to trade. It cannot make a change good — it can only tell you, honestly, whether the evidence is there yet. **Honesty is the product.** A test you can move the goalposts on is worse than no test at all.

This document generalizes the discipline first built for the short-side campaign (see *The Hermes Playbook*, §9) into a routine you run on **any** change — a new trigger, a re-tuned threshold, a different volatility model, a filter you want to loosen. For what the panels and cells actually mean, read the *Chart Reading Guide* §5; this file is about how to **use** them to make a keep/kill decision.

---

## 1 · The Principle — A Variant Is a Story Until It Survives a Test

Every change arrives wearing a good story: *"this filter should cut the bad trades,"* *"this threshold catches the leg earlier."* The story is a hypothesis, not evidence. Your backtest will almost always agree with the story you told it — that's the trap, not the proof. The only thing that separates a real edge from a flattering curve-fit is a test whose **rules were fixed before the answer was known.**

- [ ] **A candidate change is not an improvement.** It's a name worth *testing*, nothing more — the same rule as "a candidate is not a setup."
- [ ] **Decide the pass gates first, honor them later.** If you choose the bar after seeing the score, you have measured your own hope.
- [ ] **The default answer is "keep the current book."** The burden of proof is on the new thing. Ties go to the incumbent.
- [ ] **Nothing is validated because it "makes sense."** Sense is how you generate a hypothesis, not how you accept one.

---

## 2 · The Method in Four Steps

The whole protocol is four moves. Skip one and the result doesn't count.

| # | Step | The question it answers |
|---|---|---|
| **1** | **Freeze the inputs** | Am I testing *one* change, or a moving target? |
| **2** | **Split the data (IS / OOS)** | Did the edge hold on data I never tuned on? |
| **3** | **Run the A/B/C comparison** | Better than *nothing*, and better than what I already trust? |
| **4** | **Apply the pass gates** | Did it clear every pre-committed bar, net of costs? |

Everything downstream — the panel read (§7), the verdict, the logbook entry — hangs off these four.

---

## 3 · Step 1 — Freeze the Inputs

You cannot measure a change while three other things are also moving. Before the test window opens:

- [ ] **Change exactly one thing.** One trigger, one threshold, one model — isolated. If you must change two, you run two campaigns, not one.
- [ ] **Write down the full input set** (symbol, timeframe preset, date range, costs, and every non-default input) so the run is reproducible bar-for-bar later. Freeze the thesis as it *was*, not as you'll remember it.
- [ ] **Keep the three saved chart configs separate** — Pure Bull (the benchmark), Pure Bear (the side in isolation), Hybrid (the combined experiment). See *The Hermes Playbook* §8. Results from different configs never blend.
- [ ] **Costs stay ON, always.** Commission and slippage are part of the strategy properties for every arm. A variant that only wins with costs off has not won — it has found a fee it can't pay.

> **Why freezing matters:** an unfrozen input set lets you unconsciously tune until the number is pretty. That isn't testing; it's negotiating with the backtest until it agrees with you.

---

## 4 · Step 2 — In-Sample vs Out-of-Sample

The single most important line in this protocol: **tune only on in-sample; judge only on out-of-sample.**

- **In-sample (IS)** — the older data where you're *allowed* to look, tinker, and fit. This is where the story gets built.
- **Out-of-sample (OOS)** — recent data the change never saw during tuning. This is the only honest test. The dashboard treats every trade **exiting after the `Out-of-sample report start` date** (default **1 Jan 2022**) as OOS.

The gap between a great IS number and a weak OOS number *is* the difference between an edge and a curve-fit. If you tuned on OOS data — even by peeking — you have burned it, and the test is void. You get one honest OOS read per change.

- [ ] Tune, tinker, and second-guess on IS only.
- [ ] Look at OOS **once**, after the gates are fixed, and let it be the verdict.
- [ ] A change that shines IS and collapses OOS is **rejected** — that collapse is the protocol working, not a bug to tune away.

---

## 5 · Step 3 — The A/B/C Comparison

A variant judged against nothing proves nothing. Every change is measured against **two** references, not one:

| Arm | Role | What it establishes |
|---|---|---|
| **A — Null** | Do-nothing. The book *without* the change. | The number to beat. If the change can't beat doing nothing, it's noise or worse. |
| **B — Baseline** | The current accepted version — the incumbent you already trust. | Is the new thing better than the *simple* thing already in place? |
| **C — Variant** | The change under test. | Does the added complexity actually earn its keep? |

The variant (C) is accepted only if it beats **both** the null (A) *and* the baseline (B) — on out-of-sample data, net of costs. Beating the null but not the baseline means you added complexity for nothing. Beating neither means keep the current book and move on.

> **Read the arms against each other, not in isolation.** The Hybrid config is useful but is never a substitute for the pure charts: a shared account lets one side reshape the other's results, so an unproven change can quietly drag a healthy book. Always read the variant against its own null.

---

## 6 · Step 4 — The Pass Gates

Pre-commit to these. Every gate is judged **out-of-sample, net of costs.** The variant is accepted only if **all** hold; miss one and it's *inconclusive or rejected*, never a soft pass. The on-chart thresholds that back these gates live in the **`0a · Research & Validation`** input group.

- [ ] **Beats the null (A) on OOS net.** The floor. No beat, no case.
- [ ] **Beats the baseline (B) on profit factor.** Complexity must earn its keep versus the simple incumbent.
- [ ] **Sample ≥ ~100 trades** (`Minimum trades for robust sample`, default **100**). Below that it's an anecdote — *inconclusive, not a pass*. A `!` on the trade count says exactly this.
- [ ] **Not one-trade luck.** `Ex Best 1` and `Ex Best 3` — the net with the 1 and 3 luckiest trades removed — both stay positive. And best-trade dependency stays under the cap (`Max best-trade dependency %`, default **25%**), or the panel flags **Top Heavy**.
- [ ] **Stable across walk-forward chunks.** The history is sliced chronologically into chunks (`Walk-forward trade chunks`, default **6**). Negative ("Bad") chunks must stay at or below the cap (`Max negative chunks`, default **1**), or the panel flags **Unstable**. Lots of `Weak` chunks = inconsistent, not an edge.
- [ ] **OOS profit factor clears the bar** (`Minimum out-of-sample profit factor`, default **1.05**), on a non-empty OOS sample.
- [ ] **Costs were on the whole time.** Non-negotiable, restated because it's the most common way a test lies.

> **Do not clear a `!` by lowering the threshold.** Dropping `Minimum trades` from 100 to 30 doesn't make the sample robust — it hides the truth from you. The only honest way to clear a low-sample flag is *more trades*: more history, more symbols. Same for every other gate.

---

## 7 · Reading the Validation Panel to Judge

The Validation panel (bottom-left, `Full` mode) is the strategy grading itself. It will happily tell you the change is losing — that's its job. For a cell-by-cell tour read the *Chart Reading Guide* §5; here is how to read it **as a verdict.**

**Read the rows in this order — from most honest to least:**

1. **Out-of-Sample** — read this **first and trust it most.** A book can look brilliant up top and fall apart here. `Trades: 0` means you have no OOS verdict at all. This row outranks the headline.
2. **Stress Test** — `Ex Best 1` / `Ex Best 3` still positive? `Best Dep` under 25%? `Bad Chunks` at or under your cap? This is the "was it luck" row.
3. **Chunk table (#1…#6)** — scan the `Status` column. A wall of `OK` is consistency; scattered `Weak` is a warning regardless of the total.
4. **Longs / Shorts** — read each **book on its own.** The panel never blends them, so a change to one side can't hide inside the other's P&L. A `!` on either count is the low-sample flag.
5. **Review If** — the plain-English scorecard: `Sample OK`/`Low n` · `OOS OK`/`OOS Weak` · `Balanced`/`Top Heavy` · `Stable`/`Unstable`. Any red word maps directly to a failed gate in §6.
6. **Validation verdict** (top cell) — **`Healthy`** only when *every* check passed; **`Review`** the moment any one of sample, OOS, dependency, or stability fails. `Review` is not a suggestion — it means a gate is unmet.

> **The headline can flatter; the OOS row cannot.** When the top of the panel disagrees with the Out-of-Sample row, believe the OOS row. That disagreement is the whole reason the panel exists.

---

## 8 · The Honest Rule — "No Edge" Is a Result

The protocol has two honorable outcomes, and **both are wins for the process:**

- **The change clears every gate** → you've *earned* the right to trade it, at the smallest prudent size, still watching the OOS row as trades accumulate.
- **The change fails a gate** → it stays **OFF**, and that is **logged with the same pride as a pass.** "Keep the current book" beating your shiny variant is the campaign doing its job, not a defeat.

A rejected change is knowledge bought and paid for: you now know one more thing that *doesn't* tilt the odds, and you didn't risk real capital learning it. The trader who logs ten honest "no edge" results is far ahead of the one who trades one flattering story. Record the kill in the logbook — the change, the frozen inputs, the OOS numbers, and the gate it missed — with your name on it. **Never bury a failed test to protect a good story.**

> There is no promise of profit anywhere in this document, and there cannot be. A cleared gate means the odds *may* be tilted over a large sample with disciplined execution — an edge to be earned and re-checked out-of-sample, never assumed. The protocol lowers the chance you're fooling yourself; it does not guarantee a return.

---

## 9 · Worked Example — The Short-Side Campaign

The short side is the reference case this protocol was built around — and, honestly, the case for *why* it exists. In testing the dedicated short logic ran **net negative**; it remains an **unvalidated experiment**, not a tested edge. Here's the protocol applied to it.

**Step 1 — Freeze.** One change under test: the **dedicated sell-side logic** (asymmetric supply-high stop, real-invalidation R and sizing) versus the legacy mirrored short. Costs on. Shorts judged on the **Pure Bear** config so their P&L is never hidden inside the longs.

**Step 2 — Split.** Tune on in-sample only; the verdict comes from trades exiting after the OOS start date.

**Step 3 — A/B/C.**

| Arm | The short campaign's version | Question |
|---|---|---|
| **A — Null** | **Longs only** — no shorts at all | Is *any* short better than none? |
| **B — Baseline** | **Legacy mirror short** | Is the crafted logic better than a simple mirror? |
| **C — Variant** | **Dedicated short logic** | Does the added machinery earn its keep? |

**Step 4 — Gates, read on the panel.** In the reference backtest the short book showed a profit factor **below 1.0** and a **weak OOS** row — it did not clear the "beats the null net of costs" gate, so the `Review` verdict stands. The deliberately strict veto stack (no-chase, support-room, squeeze-risk — see *The Hermes Playbook* §7) keeps shorts *rare*, which means the sample is often still gathering toward ~100. **A small short sample is accumulating evidence, not proving an edge.**

**The honest outcome.** Until the dedicated short beats longs-only out-of-sample, net of costs, and clears every gate above, **shorts stay OFF or at the smallest possible size — carried as tuition, not conviction.** "Don't short" beating the short book is a valid, honorable result, logged with pride. If you loosen the short filters just to make trades appear, you are gathering sample — **not** validating an edge.

---

## 10 · The Protocol Checklist (print this)

- [ ] One change only; full input set written down and reproducible.
- [ ] Costs ON for every arm, start to finish.
- [ ] Tuned on in-sample; OOS looked at once, after gates were fixed.
- [ ] Ran all three arms: Null (A), Baseline (B), Variant (C).
- [ ] Variant beats **both** A and B, out-of-sample, net of costs.
- [ ] Sample ≥ ~100 — no `!` cleared by lowering a threshold.
- [ ] `Ex Best 1` and `Ex Best 3` positive; `Best Dep` under cap.
- [ ] Bad chunks within cap; chunk table not a wall of `Weak`.
- [ ] Read the **Out-of-Sample row first** and trusted it over the headline.
- [ ] Verdict is `Healthy` only if every gate passed — otherwise it stays OFF.
- [ ] Result logged either way. A "no edge" is a result, recorded with pride.

---

*This document describes a validation process for a decision-support tool, not investment advice. Every figure is a percent of equity or an R-multiple — there are no dollar targets. The short side is unvalidated and net-negative in testing. Passing these gates tilts the odds over a large sample with disciplined execution; it never guarantees a profit. Past behavior does not predict future returns.*

**— The Hermes Desk**
