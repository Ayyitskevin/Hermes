---
name: boundary-doctrine
description: THE one invariant Hermes promises never to cross — decision-support only, no order-placement code, no broker write access, no dollar figures, risk outranks signal. Fire this BEFORE writing any code that touches a broker, a trading host, an order, positions, live account state, or anything that could place/modify a trade — and before any Phase-6 read-only broker work. Trigger phrases — "connect to Alpaca trading", "place/route an order", "sync positions", "broker integration", "add the paper account", "wire up execution". Apply a security-review lens — this is the line that, if crossed, ends the project.
---

# boundary-doctrine — the one line

Hermes is decision-support only. There is no order-placement code, no broker
write access, and no path by which it could place or modify a live order. This
is not a feature; it is the premise. "A false positive costs a minute; a false
negative costs the project its premise."

## The doctrine

Four rules, enforced everywhere:

1. **No order-placement code, no broker write access.** Hermes analyzes and
   recommends; a human places every trade. No execution path ships, ever.
2. **No dollar figures.** Everything is % of account equity. No account
   balances, dollar position sizes, or dollar P&L are asked for, stored, or
   displayed. Only per-share market prices appear; sizing derives from them as
   % of equity. Drawdown rides on a normalized 100-based equity index.
3. **Decision-support only.** Every output is a *posture* (allow / restrict /
   cash-priority) or a *candidate* or a *review order* — never a directive,
   never a signal, never a "setup".
4. **Risk outranks signal.** A lower layer can only veto, never promote. Nothing
   overrides the risk layer, including a beautiful chart. (See `risk-layer`.)

**What the guard actually enforces** (`tests/test_no_order_paths.py`, CI-gated):
- No broker *trading* host appears anywhere in the repo. The three write-capable
  Alpaca hosts (live / paper / broker API) are in its `FORBIDDEN_HOSTS`. The one
  allowed Alpaca host is the *data* host, `data.alpaca.markets`, GET-only.
- No order-shaped endpoint or symbol appears anywhere — order submission /
  cancellation / replacement paths and broker order-request classes across
  Alpaca, Binance, Kraken, and generic shapes, matched case-insensitively
  (`FORBIDDEN_PATTERNS`).
- Every URL in `src/` points at an allow-listed host (`ALLOWED_SRC_HOSTS`);
  a new outbound destination is a reviewed decision, never a drive-by.
- The data-provider Protocol *and every concrete provider* expose exactly
  `{fetch_bars, fetch_snapshot, state, name}` — a write-surface lock. A generic
  POST helper or an order method on any provider fails the build.

The guard scans the **whole repo** (not just `src/` and `web/`), so even docs,
configs, and these skill files are covered — which is why this skill describes
the forbidden strings instead of quoting them.

## The Phase-6 precondition (the one time this can move)

The V2 roadmap's "broker read-only position sync" (Alpaca paper positions into
the risk sweep) needs to talk to a trading host — which the guard bans outright.
**The guard must evolve FIRST.** Before any trading-host URL may appear in
source: make the guard method-aware (distinguish reads from writes on a trading
host) *or* isolate a dedicated read-only module with its own surface lock. The
no-write boundary stays CI-enforced throughout. This ordering is an invariant:
"the guard evolves *before* any read-only broker work, never after." Reads-vs-
writes is a real security boundary, not a naming convention — Alpaca keys are
account-wide, not read-scoped, so a read-only *intent* is only as safe as the
code path that cannot possibly issue a write.

## What NOT to do

**#1 failure: a well-meaning feature crossing the line.** The danger is never a
malicious commit; it is a helpful one — "I'll just add a quick position sync",
"let's have it auto-cancel the stale stop", "show me the dollar P&L so it's
concrete". Each is a reasonable-sounding step over the one line. Treat any of
these as a boundary event: stop, name the invariant, and route the work through
the Phase-6 precondition (guard first) or reject it. The guard is your teammate,
not an obstacle — if a change makes you want to weaken the guard, the change is
the problem.

## Where it lives

- The guard: `tests/test_no_order_paths.py` (five tests; read it before any
  broker-adjacent work).
- The boundary stated: `README.md` (top), `docs/ARCHITECTURE.md` ("the hard
  boundary"), `docs/HANDOFF.md` (three lines).
- The read-only provider Protocol: `src/hermes/data/provider.py`; the sizing
  contract that is % only: `src/hermes/risk/engine.py`.
- The Phase-6 precondition: `docs/ARCHITECTURE.md` roadmap #7; master plan P6.

## How to verify

`.venv/bin/pytest tests/test_no_order_paths.py -q` must be green. If you added
anything network- or broker-adjacent, also grep your diff for dollar signs and
account-figure language, and confirm no new host slipped into
`ALLOWED_SRC_HOSTS` without a written reason. Green guard + % -only + no new
host = the line held.
