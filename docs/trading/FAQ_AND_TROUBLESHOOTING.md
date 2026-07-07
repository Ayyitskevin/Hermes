# FAQ & Troubleshooting — Five-Tool Confluence AIO v3.5-SHORT

### When the chart looks broken, is empty, or is telling you something you didn't expect

> **Read this before you assume something is wrong.** Most "bugs" here are the system being *honest* or *protective* — refusing to paint a number it can't stand behind, or refusing a trade it can't justify. This page separates the real fixes (a setting in the wrong place) from the non-bugs (the system doing its job). For what each panel *means*, see `CHART_READING_GUIDE.md`; for how to *play* a read, see `The-Hermes-Playbook.md`.

---

## Quick triage

| Symptom | Is it a bug? | Where to look |
|---|---|---|
| Whole strategy blanks on D / W / M / 3M / 6M / 12M | **Yes — one setting** | [Blank charts](#1--the-chart-goes-completely-blank-on-daily-and-higher) |
| The status-line strip covers the HUD | **Yes — chart setting** | [Status line over HUD](#2--the-status-line-strip-is-covering-my-hud) |
| Zero shorts at default settings | No — protective | [0 shorts](#3--im-getting-0-shorts-at-defaults--is-the-short-side-broken) |
| Regime reads `Inactive` on high TF / a young stock | No — expected | [Inactive regime](#4--regime-says-inactive-on-a-weekly-or-a-newly-listed-stock) |
| A `!` next to a trade count | No — honesty flag | [The `!` mark](#5--whats-the--next-to-a-number) |
| Longs changed after I touched short settings | Partly — see why | [Do shorts affect longs](#6--do-the-short-settings-change-my-long-results) |
| Not sure which saved chart I'm on | No | [Hybrid vs Pure](#7--hybrid-vs-pure--which-chart-am-i-reading) |
| Broke the script after an edit | Usually a typo | [Case sensitivity](#8--i-edited-the-script-and-now-it-wont-compile) |

---

## 1 · The chart goes completely blank on Daily and higher

**Symptom.** On Daily, Weekly, Monthly, 3M, 6M, or 12M, the entire strategy vanishes — no HUD, no VWAP line, no panels, no trades. Sometimes TradingView throws a study-limit or timeout error.

**Cause.** The **Bar Magnifier** is on. It requests intrabar data to fill orders more precisely, and on high timeframes that request can exceed TradingView's data limit and blank the whole strategy.

**Fix.** In the strategy settings, group **`0 · Mode`**, set:

```
Bar Magnifier (intrabar fills — intraday only) = false
```

The input is `use_bar_magnifier` and it **ships off (`false`) by default** for exactly this reason. Keep it off on Daily and every higher timeframe. It only meaningfully helps intraday backtests — and the Hermes stack is a swing process run on the Weekly / Daily / 1-Hour tide-trade-time frame, so in normal use you leave it off, full stop.

> **Rule of thumb.** If the strategy disappeared the moment you changed timeframe *up*, this is the first thing to check. Toggle it off, and the panels come back.

---

## 2 · The status-line strip is covering my HUD

**Symptom.** TradingView's own status line — the strip of plot values it prints across the top-left of the pane — sits on top of the strategy's panels and you can't read them. Dragging it does nothing.

**Cause.** That strip is a TradingView *chart* feature, not part of this script, so the script can't move it and you can't drag it out of the way. The specific offender is the **"Arguments"** field.

**Fix.** Right-click the chart → **Settings** → **Status line** tab → turn **off "Arguments."** The strip collapses and the HUD is readable again. (You can leave the symbol/OHLC parts on if you like — it's the arguments row that's long enough to overlap the panels.)

> This is cosmetic only. Hiding "Arguments" changes nothing about the strategy, its signals, or its stats — it just uncovers what's underneath.

---

## 3 · I'm getting 0 shorts at defaults — is the short side broken?

**No. It's the system being protective, and that is by design.**

A short does **not** fire just because the regime is Bear. At defaults, a short requires the full stack to line up at once:

- [ ] Regime = **Bear**
- [ ] Price **below** the anchored VWAP (the `↓` arrow on the AVWAP cell — see `CHART_READING_GUIDE.md` §3)
- [ ] A valid trigger: a **failed AVWAP/supply reclaim** or a **bear-flag breakdown**
- [ ] Short conviction **score ≥ `min_score` (default 55)**
- [ ] **None** of the veto filters tripped — no-chase, support-room, and squeeze-risk (`use_short_no_chase_filter`, `use_short_support_filter`, `use_short_squeeze_filter` are all on by default)

Most bars fail one of these, so **0 shorts on a given symbol/window is a normal, common, correct reading** — the veto stack is *supposed* to make shorts hard to get. See the short veto logic in `The-Hermes-Playbook.md` §7.

**What NOT to do.** Do not loosen the filters just to make shorts appear. If you turn off `use_short_no_chase_filter`, drop `min_score`, or widen the tolerances until trades show up, you have not found an edge — you've manufactured sample. That's the opposite of the job.

> **The honest framing.** The dedicated short side is an **unvalidated experiment that ran net-negative in reference testing.** "The system won't let me short here" is it working, not it failing. The long side is the tested workhorse; shorts stay small-or-off until they earn their place out-of-sample (`The-Hermes-Playbook.md` §9).

---

## 4 · Regime says `Inactive` on a Weekly or a newly-listed stock

**Not a bug. Expected.** The regime cell reads `Inactive` (rather than Bull / Bear / Neutral) when there simply isn't enough price history to compute the regime model yet.

This happens in two ordinary situations:

- **High timeframes** — a Weekly or Monthly chart has far fewer bars, so the 20-bar return, the EMA(100) filter, and the volatility normalization need a longer calendar history before they can resolve.
- **Young stocks / recent IPOs** — a name that's only been trading a short while hasn't accumulated the bars the regime engine needs.

Until the lookbacks are satisfied, the model correctly declines to label a regime rather than guess from thin data. Give it more history (older symbol, or drop to a lower timeframe with more bars) and the label populates.

> This is the same instinct as the `!` flag: the system would rather say "I can't tell yet" than paint a confident-looking answer it can't back.

---

## 5 · What's the `!` next to a number?

It's the **low-sample honesty flag.** A `!` appears next to a trade count when the book has **fewer trades than `min_validation_trades` (default 100)** — the internal check is `_sN < min_validation_trades`, and the cell turns to the bear color to draw your eye.

It means: *below this many trades, the profit factor and win rate are an **anecdote**, not evidence.* (The same `!` shows up in the Markov panel's `n` column when a regime row is built from too few observations — see `CHART_READING_GUIDE.md` §8.)

**Do NOT clear it by lowering `min_validation_trades`.** That doesn't make the sample bigger — it just hides the warning and lies to you about how much you know. The only honest way to retire a `!` is **more trades**: more history, more symbols, more time. Under ~100 trades you know nothing; keep going.

| You want to... | Do this | Not this |
|---|---|---|
| Make the `!` disappear | Accumulate real trades | Lower the threshold |
| Judge a thin book | Call it *inconclusive* | Call it a pass |
| Trust a PF of 1.4 on 18 trades | Don't | "But the number is pretty" |

---

## 6 · Do the short settings change my long results?

**Mostly no, with one important yes.**

- **The short-only toggles are short-only.** The whole `Short-side` group — `use_short_side_v2`, `require_failed_reclaim_short`, `allow_short_breakdown_trigger`, the no-chase / support / squeeze filters and their thresholds — governs *only* whether and how shorts fire. Flipping them does not, by itself, change which longs the system takes.

- **BUT `min_score` is shared.** The `Minimum confluence score` (default 55) is a single input used as the floor for **both** the long score and the short score. Move it and you move the bar on *both* sides at once. It is not a short-only knob.

- **AND one shared account means shorts reshape long *results*.** Even when the long *entries* are unchanged, longs and shorts trade the same simulated equity. A short position ties up capital, moves the drawdown, and shifts the equity curve — which changes the *reported* long-side context and the blended stats. So on any chart where both sides are live, an unproven short book can drag a healthy long book. This is exactly why the configs are kept separate (next section, and `The-Hermes-Playbook.md` §8).

> **Bottom line.** Short toggles ≠ long entries, but `min_score` is shared, and a shared account means shorts always color the results. Never read your longs off a chart that also has shorts running.

---

## 7 · Hybrid vs Pure — which chart am I reading?

Three saved layouts run the *same* strategy with different switches. Keep them separate so results never blend (full setup in `The-Hermes-Playbook.md` §8):

| Config | `Allow shorts` | Long triggers | Dedicated short logic | What it's for |
|---|---|---|---|---|
| **Pure Bull (benchmark)** | OFF | all ON | — | The validated long book, clean. The number every experiment must beat. |
| **Pure Bear** | ON | all OFF | ON | The short side judged on its *own* P&L, in isolation. |
| **Hybrid** | ON | all ON | ON | Both sides live — the combined experiment. |

**How to tell which you're on:** check the **Longs** vs **Shorts** rows in the Validation panel (`CHART_READING_GUIDE.md` §5). Longs-only trades with `Shorts: 0` → you're on Pure Bull. `Longs: 0` with a short count → Pure Bear. Both non-zero → Hybrid.

> **The trap.** The Hybrid chart is useful but is **not** a substitute for either pure chart. A shared account means shorts reshape the long results (see §6), so an unvalidated short book can make a healthy long book look worse — or a lucky short run can flatter it. Always read Hybrid *against* Pure Bull, never as your read of the longs.

---

## 8 · I edited the script and now it won't compile

**First suspect: a typo in an identifier's case.** Pine identifiers are **case-sensitive.** `min_score`, `Min_Score`, and `MIN_SCORE` are three different names, and only the first exists. The same goes for `use_bar_magnifier`, `min_validation_trades`, `allow_shorts`, `use_short_side_v2`, and every other variable in the file — copy them exactly as written, capitalization included.

A single wrong-case letter produces an "undeclared identifier" or "cannot modify" error even though the name *looks* right at a glance. Before assuming a logic bug:

- [ ] Re-check the exact spelling **and** capitalization against the source.
- [ ] Watch for lookalikes — `short_rsi_len` vs `short_rSi_len`, `avwap` vs `aVWAP`.
- [ ] Confirm you didn't rename one occurrence of a variable but not the others.

> Treat the `.pine` file as the single source of truth for names. If in doubt, search the file for the identifier and copy it verbatim.

---

## Still stuck? A three-question gut check

Before you file it as a bug, ask:

1. **Is the system refusing to act, or refusing to *guess*?** `0 shorts`, `Inactive`, and `!` are all the system declining to overstate — not failures. That's the honesty engine, and honesty is the product.
2. **Did I change a setting right before this?** Blank charts (Bar Magnifier) and a shared-floor surprise (`min_score`) both trace to a single toggle.
3. **Am I reading the right chart?** A "long result" that moved may just be the Hybrid chart doing what a shared account does.

> None of the above is a promise about outcomes. The point of every filter, flag, and halt on this chart is to keep you aligned with the tape and out of low-quality trades — **tilting the odds over a large, disciplined sample**, an edge that must be earned and validated out-of-sample, never assumed. When in doubt, trust the Out-of-Sample row and respect the halt.

---

*This is a troubleshooting reference for a decision-support tool, not investment advice. Every figure is a percent of equity or an R-multiple — there are no dollar amounts anywhere in this system. The short side is an unvalidated experiment that has run net-negative in testing; the long side is the tested workhorse. Nothing here predicts price or guarantees a result.*
