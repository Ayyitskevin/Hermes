---
name: pine-discipline
description: The non-repaint idioms, Pine v6 gotchas, and the D1–D15 deficiency ledger that are the change-control memory for the owner's TradingView AIO v3.3 strategy. Fire this whenever editing, reviewing, or reasoning about Pine Script, the Five-Tool AIO, HTF logic, repaint risk, the Strategy Tester, or a "why did we decide X on the chart side" question. Trigger phrases — "edit the Pine script", "does this repaint", "add an HTF filter", "the backtest looks off", "new AIO version", "halt is stuck". The rule — never ship a repaint, and never re-introduce a bug the ledger already killed.
---

# pine-discipline — the chart side's hard-won memory

The AIO lives on TradingView, deliberately outside this repo (order-shaped code
is banned here — see `boundary-doctrine`). But its lessons are operation
doctrine, and Claude edits it via the owner. This skill is that memory.

## The doctrine

**Non-repaint idioms — a signal that changes after the fact is a lie:**
- **HTF pulls use `expr[1]` + `lookahead_on`.** Request a higher-timeframe
  series with a one-bar offset and lookahead on, so you read only *completed*
  HTF bars. `lookahead_on` alone (no offset) repaints; the offset is the point.
- **Signals fire on confirmed bars only** (`barstate.isconfirmed`, or act on
  `[1]`). An intrabar condition can flip before the close.
- **Fills are next-bar-open.** The Strategy Tester assumes fill on the next bar
  open, costs on; never on the signal bar's close.
- The regime module's confirmed state is the only *state*; the HTF EMA filter is
  an entry **veto**, not a second regime opinion — it reads completed HTF bars
  and can never promote an entry (playbook §9, ledger D8).

**Pine v6 gotchas that actually bit this operation:**
- **Same-ID exit zombies.** Reusing one `strategy.exit` ID leaves stale resting
  exits that fire later out of context. Give each leg a distinct ID / cancel
  cleanly.
- **Ternaries evaluate both branches.** `cond ? ta.foo() : bar` runs `ta.foo()`
  regardless — on a volume-less symbol that is a silent `na`/error. Compute
  `ta.*` **unconditionally**, then select.
- **`input.time` needs a const string** — `timestamp("2020-01-01")`, not a
  runtime-built string.
- **`ta.*` must run unconditionally** every bar (same root cause as the ternary
  trap): a `ta.atr` reached only on some bars gives wrong state.
- A daily-loss / equity-DD halt written for daily bars **breaks on weekly
  charts** — guard timeframe assumptions.

## The D1–D15 ledger — change-control memory

Every finding is logged with a status; you re-read it so you don't re-derive or
re-break it. The live/instructive ones:

| # | Finding | Status |
|---|---|---|
| D1 | Guards validate range, not identity — a wrong {−1,0,+1} export wires silently | RETIRED for the AIO (one script, no wiring); OPEN only for the legacy multi-script stack |
| D2 | v6.2 HTF *vote* re-implements core math without hysteresis — flap risk | VERIFIED + moot in the AIO (vote not carried over); latent in standalone v6.2 |
| D3 | Vol-percentile scaling atop a vol-normalized z = double conservatism in stress | VERIFIED, bounded (factor floor 0.50), judged intentional — flips are *meant* to be harder in stress |
| D10 | Research-harness parameter drift = silent strategy variants | OPEN as discipline; the §7 change-control rule is the mitigation |
| D11 | The owner's v3.1 carried 6 defects (leg-latch regression, HTF repaint, gap re-coupling, ungated external strength, weekly halt break, dead var) + 2 compile issues | RESOLVED in v3.2 — logged as proof the review rule applies to *everyone's* revisions |
| **D13** | The equity-DD **halt was a one-way trap**: tripped → no trades → equity frozen → drawdown never recovers → halted forever (proven live: exports frozen at 25.47% DD, zero signals) | **RESOLVED in v3.3** — "Rolling peak" re-arm (DD vs highest equity of last 252 bars, so halts age out) + a loud on-chart HALT banner with age. "Latch (v3.2)" stays selectable |
| **D14** | On the tech-only tier, RS + divergence filters didn't earn their place | **PARTIALLY REVERSED** — full-cycle ablation: RS earns its place on a *diversified* universe; divergence does NOT clearly (see `rs-selection` / `backtest-honesty`) |
| **D15** | Is there a real, durable edge, and on what universe? | **RESOLVED** — signed verdict EDGE, conditional (diversified universe + filters on + dynamic selection); holds OOS |

(D4–D9, D12 are RESOLVED/SUPERSEDED — journal loop, HTF precedence, two-brains,
health-timestamp tie. Full text: the Unified Operating Playbook §10.)

## What NOT to do

**#1 failure: shipping a repaint or re-introducing a killed bug.** The most
expensive mistake here is a backtest that looks great because a signal repaints,
or re-adding a defect the ledger already fixed (a same-ID exit, an ungated HTF
vote, the latched halt). Before editing the AIO: read the ledger, confirm the
change is not a resurrection, and confirm every new signal is confirmed-bar and
next-open-filled. Any parameter change is a **new strategy variant** — route it
through `backtest-honesty`, not an impulse toggle.

## Where it lives

- The AIO v3.3, standalone v6.2, and the full ledger: owner-side (TradingView +
  chat). The parity-verified regime core is mirrored in `src/hermes/regime/v62.py`
  (see `regime-parity`).
- The declared regime deviations (what the port omits and why):
  `docs/REGIME_V62_PORT.md`.
- The gotchas as a checklist: `docs/HANDOFF.md` ("Pine v6 gotchas that bit us").

## How to verify

For a non-repaint check: run the strategy, note a historical signal, reload the
chart, confirm the signal did not move. For a ledger check: grep the ledger for
the mechanism you are about to touch and confirm you are not undoing a fix. A
variant is validated only through the campaign protocol (`backtest-honesty`).
