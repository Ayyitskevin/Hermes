# Trading Strategy & Playbook — Five-Tool Confluence AIO v3.5-SHORT

This folder is the human-facing handbook for the systematic swing strategy Hermes
is built to support: the **Five-Tool Confluence AIO v3.5-SHORT**, a TradingView
(Pine v6) strategy whose regime brain is the same **Regime Label v6.2** classifier
Hermes ports in [`../REGIME_V62_PORT.md`](../REGIME_V62_PORT.md). Chart and dashboard
run one brain, two surfaces.

> **The strategy's order code is deliberately NOT in this repository.** Hermes'
> one non-negotiable is the no-order-paths boundary — no order placement, no broker
> write access — and a CI guard fails the build if any appears. What lives here is
> the *documentation*: how the strategy thinks, how to read it, how to practice it,
> and how to validate any change before trusting it. These are decision-support and
> education, not execution.

## Start here — a reading order

New to the strategy? Read top to bottom. Already trading it? Jump to what you need.

| # | Doc | What it's for |
|---|-----|---------------|
| 1 | [**The Hermes Playbook**](The-Hermes-Playbook.md) | The thesis and how to *play* it — regime-confluence method, the Weekly→Daily→1H stack, the long and short playbooks, risk rules, and the validation campaign. Read this first. |
| 2 | [**Chart Reading Guide**](CHART_READING_GUIDE.md) | How to *read* the chart — a plain-English decoder for every HUD cell, the Markov panel, the Validation panel, trade markers, and the `!` flags. |
| 3 | [**Cheat Card**](cheat-card.html) | The 5-second go/no-go, HUD decoders, and risk rules on one printable card. *Open in a browser — it's a self-contained HTML page.* |
| 4 | [**Quickstart**](QUICKSTART.md) | Zero → working chart: install, the status-line & bar-magnifier fixes, the three-chart stack, and the Pure Bull / Pure Bear / Hybrid settings profiles. |
| 5 | [**Learning Path**](LEARNING_PATH.md) | A phased ~90-day practice curriculum — one strategy, three timeframes, one side, a hundred journaled reps — with don't-advance-until gates. |
| 6 | [**Setups**](SETUPS.md) | The pattern catalog: every long and short trigger — what it is, its conditions, a textbook example, and its failure modes. |
| 7 | [**Risk & Sizing**](RISK_AND_SIZING.md) | The R framework and `size% = risk% ÷ stop%` with worked examples (in %), the management ladder, and the protection halts. |
| 8 | [**Journal Template**](JOURNAL_TEMPLATE.md) | A per-trade journal and weekly-review system with filled examples and honest self-stats. |
| 9 | [**Validation Protocol**](VALIDATION_PROTOCOL.md) | How to validate *any* change before trusting it — freeze inputs, in/out-of-sample split, pass gates, costs-on. |
| 10 | [**FAQ & Troubleshooting**](FAQ_AND_TROUBLESHOOTING.md) | Every real gotcha — blank higher-timeframe charts, the status-line strip, "why zero shorts," the `!` flags — answered. |
| 11 | [**Anti-Patterns**](ANTIPATTERNS.md) | How to blow this up — the mistakes to avoid, with the fix for each. |

## The one honest line that governs all of them

Nothing in this handbook is a promise of profit, and nothing here predicts price.
The **long side is the tested workhorse**; the **short side is an unvalidated
experiment** that has run net-negative in testing. Disciplined execution over a
large, validated sample can *tilt the odds* — it cannot make any single trade or
any book profitable, and any edge must be **earned and confirmed out-of-sample,
never assumed**. Every figure is a percent of equity or an R-multiple — there are
no dollar amounts. You are the trader; the strategy is the second opinion.
