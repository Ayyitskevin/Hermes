---
name: backtest-honesty
description: The campaign protocol for validating a strategy honestly — chart parity first, n labelled, out-of-sample split, costs on, ablation-not-optimization, and believing the result either way. Fire this whenever running or reading a backtest, proposing a parameter/filter change (every change is a strategy variant), or answering "does this have an edge". Trigger phrases — "backtest this", "does the stack work", "turn off the RS filter and compare", "optimize the parameters", "is the edge real", "sign the verdict". The rule — a flattering backtest is not a track record, and a parameter change is not research until it survives the reviewer.
---

# backtest-honesty — the harness that can falsify itself

The operate layer cannot do one thing: falsify itself. The Strategy Tester (the
VALIDATE layer — the same AIO file with orders ON) is the only place that can.
Its whole value is answering, with named costs, whether the composed rules had
an edge across a full regime cycle — and being believed when the answer is no.

## The doctrine

**The campaign protocol — non-negotiable order:**
1. **Chart parity first.** Any independent replication must match the chart's
   own exported series before its numbers mean anything. The Phase-4 campaign
   hit **100% regime parity** vs the owner's exports (z within ~2e-15) — that is
   the licence to trust the rest. No parity, no verdict.
2. **Label n everywhere.** Below ~30 closed trades a cell is an **anecdote** and
   must say so. Trust the pooled/sector numbers (n 27–249) and the universe
   number (n=1,413), never individual single-name cells (n 10–24).
3. **Out-of-sample split.** Split the window (Phase 4 split at 2022-01-01) and
   report OOS separately. "A curve-fit falls apart out-of-sample; this didn't"
   — PF 1.71 in-sample (2019–21) → **1.46 OOS (2022–26, incl. the bear)** is the
   single most important line. A great in-sample PF with no OOS is nothing.
4. **Survivorship flagged.** Known winners in hindsight (GE's turnaround, NVDA's
   run, LLY's GLP-1 boom) are pre-registered caveats. The **ETF signal is the
   survivorship-free half** — trust it; it agreed with the single names.
5. **Costs on, fills next-open, always.** Commission + slippage modelled
   (0.05%/side, pessimistic-fair for liquid names); fills on the next bar open.
6. **Ablation, not optimization.** Turn each filter off *one at a time* and
   compare. The question is "which filters **earn their place**", never "which
   parameters maximize the curve." Every parameter change is a **strategy
   variant** that goes through the reviewer before use (change control, D10).
7. **Believe the backtest either way.** "If the backtest says the stack has no
   edge: believe the backtest, not the chart. That result is the harness
   working, not failing."

**The signed verdict discipline.** The Phase-4 verdict is **EDGE — conditional**,
signed only after full-cycle coverage (34 names, 11 sectors, 2019–2026, n=1,413).
"Conditional" is the verdict, not a hedge — the three conditions (diversified
universe, filters on, dynamic selection) are load-bearing (see `rs-selection`).
It is a single 7-year path, ETF-corroborated, and **the external review
(father-in-law) is still the other half of the gate** — the verdict is not fully
closed until it lands. A verdict is a document with evidence and an author, not
a vibe.

## What NOT to do

**#1 failure: a flattering backtest mistaken for a track record.** A good-looking
equity curve proves one path of history with assumed fills — it "proves nothing
forward." The failure modes to refuse: reading a single-name cell with n<30 as
signal; skipping the OOS split; quietly re-running with a nicer parameter until
the curve improves (that is optimization dressed as research, and it is how
"backtests rot into fiction"); ignoring survivorship because the number is nice.
If you catch yourself hunting for the flattering configuration, stop — that is
the tell.

Second failure: adopting a variant on one campaign. Variant **V-B** (RS-on /
Div-off, best config found at PF 1.57) is a *candidate to validate further*, not
an instant default — "not an instant flip."

## Where it lives

- The harness + change-control rules: playbook §7 / §7a (owner-side).
- The evidence (scratchpad, owner-side): `full_cycle_verdict.md` (the signed
  verdict), `sector_ablation_findings.md` (the one-at-a-time filter test).
- In-repo reflections of the verdict, verbatim on screen: the `CAVEAT` in
  `src/hermes/rs/board.py` and `src/hermes/screener/trend_template.py`; the
  "Gate vs selection" note in `docs/METHODOLOGY.md`.
- The reviewer that gates variants: `src/hermes/review/reviewer.py` (`journal-loop`).

## How to verify

For any backtest claim, confirm in order: parity established → n stated and
≥ 30 where it matters → OOS reported separately → costs on / next-open fills →
survivorship flagged → conclusion is an ablation ("earns its place"), not an
optimization ("best parameters"). Missing any one → the number is not yet
evidence. A parameter change is validated only after its own campaign + a
reviewer pass.
