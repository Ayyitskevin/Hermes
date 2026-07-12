---
name: journal-loop
description: The trade journal — the self-grading memory loop (propose → reviewer → commit → close → resolve) that is the real product of the whole operation. Fire this whenever proposing, committing, closing, or resolving a trade, running the reviewer second-pass, or reasoning about the journal, thesis verdicts, or performance stats. Trigger phrases — "log this trade", "propose an entry", "close entry N", "did the thesis play out", "what's my win rate", "the journal says". The rule — the thesis verdict is separate from P&L, small samples are anecdotes, and the loop only works if it is never skipped.
---

# journal-loop — the memory that grades itself against reality

Phase 3 is the real product: "every later feature either feeds this loop or
reads from it." The journal freezes what you believed and planned at entry, and
later grades it against what actually happened — including the harder question
than P&L.

## The doctrine

**The loop — five stages, in order** (`src/hermes/journal/service.py`):

1. **propose** (`propose_entry`) — compute suggested sizing (`risk-layer`) AND
   run the reviewer second-pass, capture the frozen signal state. Writes
   **nothing**; returns the full proposal for the human to accept or reject. A
   thesis is required — *"it looks strong" is not a thesis.*
2. **reviewer** (`review.reviewer.review_entry`, runs *inside* propose) — the
   second pair of eyes: execution realism (stop inside noise < 0.35% = high /
   blocked; stop > 15% = wide-stop warn), sizing-cap interaction, setup sample
   size (< 10 closed = anecdote), conjunctive-condition overfitting smell
   (≥ 4 "and"s), regime coherence. Verdict `clear` / `caution` / `blocked` is
   **advisory** — the human can override, but the override is stored forever.
   The optional local-LLM critique is additive; the deterministic checks never
   depend on it (Ollama down → said openly, verdict notes the skipped pass).
3. **commit** (`commit_entry`) — write the row. The reviewer verdict, sizing,
   and frozen signal state travel with the entry forever. The API re-runs
   propose at commit time rather than trusting a client dict.
4. **close** (`close_entry`) — requires an exit price, a **thesis verdict**
   (`yes` / `partial` / `no`), and a resolution note. Atomic (a status-guarded
   UPDATE makes a concurrent double-close impossible; the equity index moves
   exactly once per entry).
5. **resolve** (inside close) — realized return, benchmark return over the same
   window, **alpha vs the benchmark**, and the equity-index move. A stale
   benchmark anchor (> 5 days) returns a *missing* benchmark, never a silently
   truncated one.

**Thesis verdict is separate from P&L.** "Was the call right" ≠ "did it make
money." Both are recorded; a lucky win with a wrong thesis and an unlucky loss
with a right thesis are graded honestly. A trade is not resolved by its P&L
alone — the mandatory thesis verdict is the point.

**Small-sample honesty.** `performance_summary()` reports win rate, thesis hit
rate, and average alpha — and below **20 closed trades** it labels every stat an
anecdote, in the payload, on screen. A per-setup sample below 10 gets the same
treatment at propose time. Numbers do not become an edge by being displayed.

## What NOT to do

**#1 failure: journal abandonment — the phase where this project dies.** Not in
code, in silence: trades that never get logged, closes that never get resolved,
theses left unexamined. "Everything downstream starves." The mitigations are
the design: the loop is cheap (10-minute runbook), the `journal_resolve` job
nags about open/stale entries nightly, and the weekly ritual grades resolved
trades. Log **every** trade — *especially the ones you are sure about* — and
resolve every close with a real thesis verdict, or the memory learns nothing.

Second failure: overriding a `blocked`/`caution` reviewer verdict silently. The
override is allowed and recorded; do it deliberately, with a reason, knowing it
travels with the entry forever.

## Where it lives

- Service: `src/hermes/journal/service.py` — `propose_entry`, `commit_entry`,
  `close_entry`, `_benchmark_return`, `stale_open_entries`, `performance_summary`.
- Reviewer: `src/hermes/review/reviewer.py` — thresholds `MIN_SETUP_SAMPLE=10`,
  `MIN_STOP_DISTANCE_PCT=0.35`, `WIDE_STOP_WARN_PCT=15.0`.
- The nag job: `_journal_resolve_nudge` in `src/hermes/jobs/scheduler.py`
  (`journal_resolve`, Mon–Fri 17:00).
- Methodology: `docs/METHODOLOGY.md` ("Trade journal", "Reviewer second-pass").
  Doctrine: playbook §8. Tests: `tests/test_journal.py`.

## How to verify

`.venv/bin/pytest tests/test_journal.py -q` green. End-to-end: `propose_entry`
returns sizing + a reviewer verdict + frozen signal state and writes nothing;
`close_entry` refuses without a thesis verdict and moves the equity index once.
The Phase-3 gate is **20 closed, fully-resolved entries** — count them; nothing
downstream is meaningful before that number exists.
