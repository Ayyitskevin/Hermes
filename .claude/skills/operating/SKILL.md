---
name: operating
description: Top-level index and router for running the Hermes trading operation. Fire this FIRST whenever a session is asked to operate, extend, deploy, backtest, or reason about Hermes — "run the daily check", "add a feature", "is this ready to ship", "what phase are we in", "which skill covers X". It encodes the three-layer model (Operate / Validate / Remember), the master-plan phase gates, the "one phase in flight" rule, and routes to the other nine operation skills. Read this before acting; then load the specific skill the task lands in.
---

# operating — the router

Hermes is one third of a larger trading operation. Before you touch anything,
know which layer you are in and which gate governs it.

## The doctrine

**Three layers, one brain.** The same regime model (Regime Label v6.2) governs
all three; they cannot disagree by construction, only by bug.

```
OPERATE   (live, human)   Five-Tool Confluence AIO v3.3 on TradingView,
                          orders OFF (chart-tool mode) → the playbook → the human
VALIDATE  (simulation)    The SAME AIO file, orders ON in the Strategy Tester —
                          research harness only, never a live signal generator
REMEMBER  (accountability) Hermes — the v6.2 port (parity-verified), self-grading
                          journal, risk layer, daily check
```

Hermes is the REMEMBER layer. It is decision-support only: it analyzes and
recommends; a human places every trade. Source of truth for the whole doctrine
is the owner's Unified Operating Playbook (v1.4) and the master build plan;
this repo carries the honesty machinery that enforces it.

**The invariants, every phase, no exceptions** (from the master plan):
1. The boundary: no order paths, ever — CI-enforced. → `boundary-doctrine`
2. Risk outranks signal — in code, on screen, in the runbook. → `risk-layer`
3. Honesty machinery: methodology + caveat on every skill; source + as-of on
   every number; missing stays missing; small-n is labelled an anecdote.
4. Observability: every job logs canonical lines, writes `job_runs`, gets a
   MISSED check + manual trigger. → `deploy-ops`
5. Change control: parameters are strategy variants; variants pass the reviewer
   before use. → `backtest-honesty`
6. **One phase in flight at a time.** The V1 lesson, permanent.

**The phase gates** (master plan; gates are the owner's to call, not yours):

| Phase | Goal | Gate (measurable, not a feeling) |
|---|---|---|
| P1 one brain | v6.2 governs all three layers | 10 consecutive sessions of chart-vs-dashboard label parity |
| P2 go live | Hermes runs as a real service on real data | 10 trading days, zero MISSED, zero manual restarts |
| P3 operating habit | the runbook becomes muscle memory | **20 closed, fully-resolved journal entries** |
| P4 validation campaign | does the stack have an edge? | a written verdict with n ≥ 30 in the cells that matter |
| P5 selection layer | Hermes answers "which names" | 2 weeks where the shortlist comes from the board, not scrolling |
| P6 ops hardening + broker READ-only | backups, failover, read-only sync | a restore actually performed; guard evolved BEFORE any broker URL |
| P7 multi-agent debate | Ollama bull/bear → journal proposal | debates measurably improve thesis quality |
| P8 expansion menu | pick by appetite, one at a time | — |

As of the last handoff: P1–P5 largely landed (RS board, weekly review,
screener merged); the live-operating gates (P2 10-day, P3 20-entry) are
habit gates, not code, and are the owner's to close.

## What NOT to do

**#1 failure: skipping ahead of a gate** — building P7's debate mode because it
is exciting while P3's journal habit is still empty. "You don't move on because
the next thing is exciting; you move on because the gate is passed." A feature
that reads from or feeds the journal is worthless before 20 resolved entries
exist. When a task jumps phases, name the gate it skips and say so.

Second failure: working two phases at once. One in flight. Always.

## Where it lives

- Doctrine: the owner's Unified Operating Playbook v1.4 and Master Build Plan
  (owner-side; the scratchpad copies are the reference used to write these skills).
- In-repo: `README.md`, `docs/ARCHITECTURE.md` (module map + V2 roadmap),
  `docs/METHODOLOGY.md` (every skill → named method), `docs/HANDOFF.md` (state).
- The 9 sibling skills: `boundary-doctrine`, `regime-parity`, `pine-discipline`,
  `risk-layer`, `journal-loop`, `backtest-honesty`, `data-integrity`,
  `rs-selection`, `deploy-ops`.

## Route to the right skill

| The task touches… | Fire |
|---|---|
| Adding any code near a broker / order / trading host | `boundary-doctrine` (first) |
| The regime classifier, its constants, chart-vs-dashboard divergence | `regime-parity` |
| TradingView Pine, repaint, the AIO, the D1–D15 ledger | `pine-discipline` |
| Sizing, limits, correlation, drawdown, the equity index | `risk-layer` |
| Proposing/committing/closing a trade; the reviewer second-pass | `journal-loop` |
| A backtest, an ablation, a "does it have an edge" question | `backtest-honesty` |
| A number's source, staleness, providers, missing data | `data-integrity` |
| "Which names", the RS board, the screener, the universe | `rs-selection` |
| systemd, scheduled jobs, MISSED, backups, `.env`, doctor | `deploy-ops` |

## How to verify

You are oriented correctly when you can name (a) which of the three layers the
task is in, (b) which phase gate governs it, and (c) which sibling skill owns
the detail. If you cannot, re-read this file before writing anything.
