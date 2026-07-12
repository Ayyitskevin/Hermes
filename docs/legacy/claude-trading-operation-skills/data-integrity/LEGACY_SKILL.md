---
name: data-integrity
description: The data-integrity contract — providers, source+as-of on every number, missing-stays-missing, staleness labelling, and visible rate limits. Fire this whenever fetching/displaying market data, choosing or configuring a provider, handling gaps or short history, or reasoning about whether a number is trustworthy. Trigger phrases — "which provider", "the data looks stale", "fill the gap", "interpolate the missing bar", "is this live", "rate limited", "Databento free tier". The rule — a stale or cached number must never dress itself as live, and missing data stays missing — never interpolated.
---

# data-integrity — honesty is the product

Every number Hermes shows carries where it came from and how old it is, or it
says it is missing. "Never a cached number dressed as live." This contract is
what lets the risk layer and the journal be trusted at all.

## The doctrine

**Providers** (config-driven, `src/hermes/data/registry.py`):
- **Alpaca — default.** Free real-time IEX feed; a **paper account is enough, no
  funding**. Deep daily history (~2016), ~200 req/min. IEX is ~2–3% of
  consolidated volume — fine for liquid ETFs/large caps on daily bars; thin
  names may gap (and the gaps show). The module talks to **`data.alpaca.markets`
  only**, GET-only (a test locks this — see `boundary-doctrine`).
- **Databento — documented fallback.** State the economics honestly: **there is
  no recurring free tier.** The "250k messages/month free" claim in circulation
  is wrong; new accounts get a **one-time signup credit** (~6-month expiry;
  current amount on databento.com). Zero-license-fee equities datasets make it
  the right *paid* fallback. Hermes ships a thin daily-bars adapter that says so.
- **Sample — zero-key.** A deterministic synthetic tape for demos and tests,
  **stamped `source: sample` everywhere it appears.** Never confuse it for real.
- (Polygon: free tier is EOD-only, 5 req/min — unsuitable. IEX Cloud: shut down
  2024-08-31. Don't reach for either.)

**The four rules** (`docs/ARCHITECTURE.md` "Data integrity contract"):
1. **Source + as-of on every number.** Every `Bar`/`Snapshot` row carries
   `source` and `fetched_at`; every displayed number carries source + as-of on
   screen. A number without provenance does not ship.
2. **Missing stays missing — never interpolated, ever.** Indicators return
   `None` on short history; evidence shows `status: missing`; the UI shows
   `∅ missing`. The RS board and screener render `missing` below their bar
   floors rather than guessing. A fabricated value is worse than a blank.
3. **Staleness is computed, labelled, displayed** — `live` / `stale` / `dead`
   (`store.staleness`), the per-symbol freshness chip flips `● live → ◐ stale →
   ○ dead`.
4. **Rate limits degrade visibly.** An Alpaca 429 → one logged retry → provider
   state `rate_limited` on the dashboard. The provider chip also shows `✗ no
   keys` / `✗ auth error`; sample mode still works without keys.

**Latency truth.** For daily/4H/weekly regime-following, seconds of latency are
indistinguishable from tick-level real-time. Hermes does not pretend otherwise
and does not over-engineer for it.

## What NOT to do

**#1 failure: a stale or cached number dressed as live.** The cardinal sin is a
value that *looks* current but isn't — a cached bar shown without its as-of, a
rate-limited feed silently serving old data, an interpolated gap-fill that reads
like a real print. Every one of these launders a lie into a decision. When data
is old, say `stale`/`dead`; when it is absent, say `missing`; when the provider
is throttled, say `rate_limited`. Never fill a gap to make a chart look
complete, and never promote the `sample` tape to real.

Second failure: treating Databento as free. Budget for the paid reality or stay
on Alpaca.

## Where it lives

- Models (source + as-of mandatory): `src/hermes/data/models.py`.
- Read-only Protocol: `src/hermes/data/provider.py`; adapters:
  `alpaca.py`, `databento.py`, `sample.py`; selection: `registry.py`; cache +
  staleness: `store.py`.
- The contract in prose: `docs/ARCHITECTURE.md` ("Data integrity contract",
  "Data-source reality"); provider setup: `README.md`.
- `.env` shape (keys, never in the repo): `.env.example` (see `deploy-ops`).

## How to verify

`.venv/bin/hermes doctor` reports the active provider and its state; the
dashboard/rail chips show provider state and per-symbol freshness. Confirm a
short-history symbol renders `missing` (not 0, not interpolated), a throttled
provider renders `rate_limited` (not a silent stale number), and every displayed
figure carries a source + as-of. Tests exercise the store and adapters
(`tests/test_indicators.py` for the None-on-short-history math).
