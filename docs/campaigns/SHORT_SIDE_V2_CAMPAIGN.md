# Backtest-honesty campaign — Dedicated short-side system (AIO v3.5-SHORT)

**Status: UNVALIDATED / PENDING.** Recorded in the validation ledger
(`src/hermes/validation/ledger.py`, verdict `unvalidated`). The short execution
logic lives owner-side on TradingView (order-shaped code is banned from this repo
by the no-order-paths boundary); this document is the campaign that must pass
before the variant is treated as real. Until it does, the honest default is
**shorts OFF** (`allow_shorts = false`).

## The claim on trial

> Relative weakness + a failed-supply-reclaim / bear-flag-breakdown trigger,
> gated by no-chase, support-room and squeeze-risk filters and stopped above the
> structural supply high, makes **shorting additive versus not shorting at all**.

The null hypothesis is the one that usually wins and must be beaten explicitly:
**"just don't short."** A short book that doesn't beat longs-only, out of sample,
net of costs, has no reason to exist.

## Design — a three-arm A/B/C, same everything else

Run the identical strategy, same symbols, same window, same long logic and risk
settings, changing only the short treatment:

| Arm | `allow_shorts` | `use_short_side_v2` | What it tests |
|---|---|---|---|
| **A — Longs-only** | off | — | the null: the baseline to beat |
| **B — Legacy mirror** | on | off | is *any* short better than none? |
| **C — Dedicated v2** | on | on | does the crafted short logic beat the mirror? |

The only verdict that matters: **C must beat A out-of-sample, net of costs.**
B is the sanity check — if C can't beat B, the extra machinery isn't earning its
complexity; if B already beats A, the edge isn't the v2 craft.

## Universe & window (fix before the first run — no shopping after)

- **Symbols:** a fixed, pre-committed liquid basket (large-cap equities + a few
  liquid ETFs), chosen *before* seeing results. No adding/dropping names to flatter
  the curve. Log the list.
- **Full cycle:** the window must contain at least one real bear phase (shorts are
  meaningless in a pure bull tape). 2018–present covers 2018-Q4, 2020, 2022.
- **In-sample vs out-of-sample split:** IS through the `oos_start` date already in
  the strategy (default 2022-01-01); OOS is everything after. **Tune only on IS;
  judge only on OOS.**
- **Costs ON, always:** commission (0.03% is set) + slippage (2 ticks set) +
  borrow. Shorting has a hard-to-borrow / locate cost the tester does not model —
  add a manual haircut and note it. A short edge that dies once borrow is priced
  in was never an edge.

## Pass/fail gates (decide these NOW, honor them later)

C is **accepted** only if, out-of-sample, ALL hold:

1. **Beats the null:** C's OOS net > A's OOS net (shorts added money after costs).
2. **Beats the mirror:** C's OOS profit factor ≥ B's, or C takes materially fewer/
   cleaner trades for the same net (the filters earned their keep).
3. **Sample is real:** OOS short count ≥ `min_validation_trades` (100 default). If
   the filter stack starves the sample below this, the result is an anecdote —
   **inconclusive, not a pass.** (This is the most likely outcome; see risks.)
4. **Not one-trade luck:** the Validation panel's *Ex Best 1 / Ex Best 3* stays
   positive with the top short(s) removed; *Best Dep* under `max_best_trade_dep_pct`.
5. **Consistent across chunks:** negative walk-forward chunks ≤ `max_negative_segments`.
6. **Squeeze survivability:** max adverse excursion on shorts and worst short loss
   streak are within the long book's tolerance — a short book that occasionally gets
   run over erases a year in a week.

If any gate fails → **shorts stay OFF** and the ledger verdict stays `unvalidated`
(or moves to `no_edge` if C clearly cannot beat A). No partial credit.

## Procedure

1. **Freeze inputs.** Record every non-default setting for all three arms. The
   only delta between arms is the two short toggles.
2. **Arm A** on the basket → log OOS net / PF / WR / trades, and the equity curve.
3. **Arm B** → same logs.
4. **Arm C** → same logs, plus the short telemetry the chart now surfaces directly:
   - The Validation panel splits **Longs vs Shorts** (net / PF / WR / trade count),
     so the short book is judged on its own — never blended into the long total.
     The Shorts row flags `!` when its sample is under `min_validation_trades`.
   - Cumulative Data-Window counters: `SHORT_ENTRIES_{FAILRECLAIM,BEARFLAG,BEARFLIP}`
     (shorts taken by trigger) and `SHORT_BLOCKED_{NO_CHASE,SUPPORT,SQUEEZE}`
     (would-be shorts each filter suppressed) — so you can see which trigger drives
     entries and which filter is doing the work.
   - Note: per-trigger *P&L* (failed-AVWAP net vs bear-flag net) is not yet split —
     that needs per-trade reason tagging (an entry-id refactor); the counts above are
     the current proxy.
5. **Per-symbol, not just aggregate.** A cross-section that only works because one
   name cratered is not a system.
6. **Read the gates once, out of sample, and write the verdict down** before
   touching a parameter. If you then tune, you have spent your OOS — re-split or
   walk forward on fresh data; do not re-grade the same OOS after tuning.

## What "improving it" is NOT allowed to mean

- Turning knobs until the OOS curve looks good (that just moves the overfit).
- Dropping the losing symbols from the basket after the fact.
- Declaring victory on a 15-trade sample because the PF is pretty.
- Comparing C to nothing — the null (A) must be in the room.

## Recording the outcome

Update the ledger entry verdict in `src/hermes/validation/ledger.py`:

- **`validated`** — only if every gate above passed OOS, costs-on. Rewrite the
  `result` with the actual OOS net/PF/trade-count and the window, and flip the
  operating default to shorts-on-by-policy.
- **`no_edge`** — C could not beat A. This is a *result*, logged with the same
  pride as a win (see the Minervini entry). Shorts stay off.
- **`unvalidated`** (unchanged) — sample too thin to conclude. Note what was run
  and why it was inconclusive; do not round up to a pass.

The parity note in `docs/REGIME_V62_PORT.md` points here; keep them in sync.
