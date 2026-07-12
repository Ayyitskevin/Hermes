---
name: rs-selection
description: The "which names first" layer — the Mansfield RS leadership board, the Minervini Trend-Template screener, and the validated cross-sector universe finding. Fire this whenever ranking or selecting watchlist names, configuring the universe, reasoning about relative strength / the screener, or answering "what should I look at". Trigger phrases — "which names", "RS board", "run the screener", "is this a setup", "what universe", "just trade the tech leaders", "hardcode the winners". The rule — let the board select dynamically across a diversified universe — never bet a narrow correlated cluster, never hardcode past winners.
---

# rs-selection — which names earn the first look

This is the selection layer (decision hierarchy rank 3, below risk and regime).
It answers *which watchlist name to review first* — never whether to trade. The
board and screener recommend a **reading order** and surface **candidates**;
neither is a signal, and no order path exists (see `boundary-doctrine`).

## The doctrine

**The RS board** (`src/hermes/rs/board.py`) — Mansfield relative strength
against the benchmark, from cached daily bars:

```
RS line   = close_symbol / close_benchmark    (aligned by session date; gaps stay gaps)
Mansfield = (RS / SMA200(RS) − 1) × 100        (Weinstein 1988 / Mansfield zero line)
```

Verdicts read **against the current regime** — risk outranks selection, so a
non-bull regime **caps every verdict at WATCH except SKIP-LAG** (a laggard stays
a laggard in any regime): `HI-CONV` (Mansfield>0, rising, 50-bar RS high, bull) /
`LONG-OK` (Mansfield>0, not falling, bull) / `WATCH` / `SKIP-LAG` (Mansfield<0
and falling, or new 50-bar low). Fewer than 200 overlapping bars → `missing`,
never interpolated. **No reading yet counts as non-bull** — an unknown regime
never widens permissions.

**The screener** (`src/hermes/screener/trend_template.py`) — Minervini's (2013)
eight-point Trend Template scored 0–8 → **PASS (8/8) / NEAR (6–7) / NO (<6)**.
Criterion 8 (market-wide RS) is a **documented Mansfield PROXY** (Hermes has no
full-market universe for Minervini's own RS rating). Below 252 bars → `missing`.
It outputs **candidates, never setups**: a candidate becomes a setup only when
the human creates a journaled proposal, whose reviewer second-pass is the gate
— the screener deliberately does **not** call the reviewer and does **not**
bypass it (`journal-loop`). Fundamentals (CANSLIM's earnings/sales/sponsorship)
are omitted — no fundamentals feed; a match is not a fundamental endorsement.

**The VALIDATED universe finding** (the Phase-4 signed verdict; `backtest-honesty`):
- **Diversify past tech.** Full-cycle working groups: **Industrials, Staples,
  Tech, Comm** (pooled PF 1.86–2.20). **Energy, Health, RealEstate were
  net-negative** — the strategy does not work on every sector.
- **RS on; divergence optional.** The sector ablations refined "keep filters
  on": the **RS gate earns its place** on a diversified universe (removing it:
  PF 1.53→1.47) — the real reversal of the tech-only D14 finding. **Divergence
  does not clearly earn its place** (removing it: 1.53→**1.57**). Best config
  found: **V-B (RS-on / Div-off)** — a §7 variant to validate further, not an
  instant default.
- **Select dynamically.** Leadership rotates (recent window favoured
  Financials/Industrials; full cycle favoured Industrials/Staples/Tech). The
  board and screener exist to pick the *current* leaders and skip the laggard
  groups. Feed them the wide field (SPY/QQQ/IWM for context; XLK XLC XLY XLV XLF
  XLI XLE XLB XLP XLU XLRE for the sector map; cross-sector leaders as examples)
  and **let the board rank** — apply the AIO per-chart, since it is symbol-
  agnostic.

**Gate vs selection.** The Phase-4 campaign tested RS as an entry *gate* on
index vehicles and found it added no value at defaults. This board makes a
different, *cross-sectional selection* claim — and that claim is itself not yet
validated. The `CAVEAT` in `board.py` says exactly this, on screen.

## What NOT to do

**#1 failure: betting a narrow correlated cluster, or hardcoding past winners.**
"Optimizing by picking winners" (a fixed list of GE/LLY/NVDA because they *did*
run) is the **survivorship trap** — the very thing the whole verdict warns
against. Five correlated tech names is not a universe; it is one bet with nothing
to select between (which is *why* RS looked useless on the tech-only tier). Never
hardcode a curated list into the watchlist as "the winners"; the discipline is
the symbol-agnostic strategy plus **dynamic** selection across a *diversified*
field. Any universe or filter change is a §7 variant — validated before it
becomes doctrine.

Second failure: treating a screener PASS as a setup, or an RS verdict as a trade
signal. Both are review-order candidates; the reviewer gate lives at propose time.

## Where it lives

- Board: `src/hermes/rs/board.py` (constants `MANSFIELD_SMA=200`, `SLOPE_BARS=3`,
  `RANGE_BARS=50`; `_verdict`, `build_board`; `CAVEAT`).
- Screener: `src/hermes/screener/trend_template.py` (the eight criteria,
  `MIN_BARS=252`; `CAVEAT`) — reuses the board's `_rs_line` for criterion 8.
- Methodology + caveats: `docs/METHODOLOGY.md` ("RS leadership board", "Swing
  screener"). The universe evidence: `full_cycle_verdict.md` /
  `sector_ablation_findings.md` (owner-side). Tests: `tests/test_rs_board.py`,
  `tests/test_screener.py`.

## How to verify

`.venv/bin/pytest tests/test_rs_board.py tests/test_screener.py -q` green.
Confirm a laggard reads `SKIP-LAG` in any regime, a leader is capped at `WATCH`
when the regime is not bull, short history renders `missing`, and a screener
PASS in a non-bull tape is annotated context-only (not suppressed). Confirm the
watchlist is a diversified cross-sector field the board ranks — not a hardcoded
list of yesterday's winners.
