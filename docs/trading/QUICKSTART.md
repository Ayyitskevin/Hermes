# QUICKSTART — Zero to a Working Chart

### Getting *Five-Tool Confluence AIO v3.5-SHORT* onto a TradingView chart in one sitting

> **What this is.** A pure setup guide — how to paste the strategy, fix the two display gotchas, and build the three-chart stack. It gets you a *working screen*. It does not teach you to trade the tool. For that, read **The Hermes Playbook** (how to *play* the thesis) and **CHART_READING_GUIDE.md** (how to *read* every panel). This is a decision-*support* system: nothing here fires trades for you, and nothing here promises a result. The edge is earned in the seat, over a large sample, or not at all.

---

## 1 · Load the strategy into TradingView

1. Open any chart, then open the **Pine Editor** (the tab along the bottom of the screen).
2. Click **Open → New indicator** to get a blank script. Select everything in the editor and delete it.
3. Open `Five-Tool-Confluence-AIO-v3.5S.pine`, copy its **entire** contents, and paste them in.
4. Click **Save**. Give it a name you'll recognize (e.g. *Five-Tool Confluence AIO v3.5-SHORT*).
5. Click **Add to chart**. The strategy compiles and paints — background tint, gold AVWAP line, and the HUD panels appear.
6. Open the strategy's **Settings** (hover the strategy name on the chart → the gear icon) to reach every input referenced below.

> If nothing paints, re-check that you pasted the *whole* file and that **Save** succeeded before **Add to chart**. A partial paste won't compile.

---

## 2 · Fix the status line (stop it covering the HUD)

TradingView's **status line** (the strip of live values across the top of the pane) sits *on top of* the HUD and hides it. It **cannot be dragged out of the way** — you turn the noisy part off instead.

- [ ] Open **chart Settings** (right-click the chart → *Settings*, or the gear at top-right) → **Status line** tab.
- [ ] Un-check **Arguments** (the long strip of input values).
- [ ] Optional: also hide **Indicator titles** / **Values** if the top strip still crowds the HUD.

The strip shrinks and the HUD is readable again. This is a chart-level setting, so apply it on each layout you build in §4.

---

## 3 · Turn the Bar Magnifier OFF

The `use_bar_magnifier` input (group **0 · Mode**, labeled *"Bar Magnifier (intrabar fills — intraday only)"*) requests intrabar data for the backtest. On high timeframes that request can exceed TradingView's limit and **blank the entire strategy** — every panel vanishes.

- [ ] In the strategy **Settings → Inputs**, confirm **Bar Magnifier = OFF** (it ships `false`).
- [ ] Keep it **OFF** on **Daily / Weekly / Monthly / 3M / 6M / 12M** charts — always.
- [ ] Only ever consider turning it on for a purely *intraday* backtest, where it's the one place it helps.

If a chart ever goes blank after a timeframe change, this is the first thing to check.

---

## 4 · Build the Tide / Trade / Time stack

Run **one strategy across three timeframes**, each saved as its own layout. This is the top-down routine from **The Hermes Playbook §4** — here's how to wire it up.

| Layout | Timeframe | Role | Its one job |
|---|---|---|---|
| **Tide** | **Weekly** | The regime you're swimming in | Grants or denies permission |
| **Trade** | **Daily** | Where the call is made and sized | The decision chart |
| **Time** | **1-Hour** | The low-risk entry inside the daily thesis | Fine-tunes the entry |

For each of the three:

1. Set the chart to the right timeframe (Weekly, then Daily, then 1H).
2. Apply the §2 status-line fix and confirm the §3 Bar Magnifier is OFF.
3. Save it as a **named layout** (top toolbar → the layout menu → *Save As*): `Tide — Weekly`, `Trade — Daily`, `Time — 1H`.

> Keep them as **three saved layouts**, not three panes you eyeball together. Separate layouts keep each timeframe's read clean and let you return to an identical screen every session.

---

## 5 · The three settings profiles (copy-paste checklists)

Same strategy, three configurations. **Keep them as separate saved charts so their results never blend** — see **The Hermes Playbook §8**. All inputs below live in the strategy's **Settings → Inputs**.

### 🟢 PURE BULL — the benchmark (the tested workhorse)

This is your tested long book and the number every experiment must beat — a tested edge still has to prove out out-of-sample, so treat it as a benchmark to validate against, not a guarantee.

> ⚠️ `Allow shorts` ships **ON** by default in this build, so setting it **OFF** here is required, not optional — loading raw defaults leaves the short book live.

- [ ] **Allow shorts** — `OFF`
- [ ] **Trigger: regime flip** — `ON`
- [ ] **Trigger: hidden continuation divergence** — `ON`
- [ ] **Trigger: regular divergence in value zone** — `ON`
- [ ] **Trigger: AVWAP reclaim with RS confirmation** — `ON`
- [ ] **Minimum confluence score** — `55`

*(All four Entry-Confluence triggers ON; shorts off. This is the arm you trade first and measure everything against.)*

### 🔴 PURE BEAR — shorts in isolation ⚠️ UNVALIDATED

The short side is an **experiment that has not passed validation** and ran **net-negative** in the reference backtest. This profile exists to judge it *on its own P&L*, never hidden inside the longs. Carry it at the smallest size, or not at all, until the campaign in **The Hermes Playbook §9** clears it.

- [ ] **Allow shorts** — `ON`
- [ ] **Trigger: regime flip** — `OFF`
- [ ] **Trigger: hidden continuation divergence** — `OFF`
- [ ] **Trigger: regular divergence in value zone** — `OFF`
- [ ] **Trigger: AVWAP reclaim with RS confirmation** — `OFF`
- [ ] **Use dedicated sell-side logic** — `ON`

*(All four Entry-Confluence triggers OFF kills the longs, so the P&L is shorts-only. This is measurement, not a green light.)*

### ⚪ HYBRID — both sides live (read only against Pure Bull)

- [ ] **Allow shorts** — `ON`
- [ ] All four **Entry-Confluence triggers** — `ON`
- [ ] **Use dedicated sell-side logic** — `ON`
- [ ] **Minimum confluence score** — `55`

*(Both books run in one account, so an unproven short book can drag a healthy long book and reshape its results. Never let the Hybrid chart become your read of the longs — always compare it back to **Pure Bull**.)*

---

## 6 · "You're set up" — the 10-item check

- [ ] 1. The full `.pine` file is pasted, **saved**, and **added to chart**.
- [ ] 2. Chart Settings → Status line → **Arguments un-checked**; the HUD is readable.
- [ ] 3. **Bar Magnifier = OFF** and staying off on all Daily-and-higher charts.
- [ ] 4. Background tint, gold AVWAP line, and the HUD panels all paint.
- [ ] 5. `Tide — Weekly` layout saved.
- [ ] 6. `Trade — Daily` layout saved.
- [ ] 7. `Time — 1H` layout saved.
- [ ] 8. **Pure Bull** profile saved as its own chart (shorts OFF, four triggers ON, score 55).
- [ ] 9. **Pure Bear** and **Hybrid** profiles saved as their own separate charts.
- [ ] 10. You can read the go/no-go in one glance — **Regime**, **Score L / Sv2** vs the 55 floor, and the **halt cell** (per CHART_READING_GUIDE.md §1).

When all ten are ticked, your screen is built. The next step is learning to *read* it (**CHART_READING_GUIDE.md**) and *play* it (**The Hermes Playbook**) — and to remember that a working chart tilts no odds by itself. It's a second opinion; you are the trader.

---

*This is a setup guide for a decision-support tool. Every figure it references is a percent of equity or an R-multiple — there are no dollar targets. The long side is the tested workhorse; the short side is an unvalidated experiment carried as tuition until it earns validation out-of-sample. Nothing here predicts price or promises profit.*
