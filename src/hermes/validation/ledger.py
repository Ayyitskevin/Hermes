"""Validation ledger — the honest capstone: every model claim vs what happened.

This is the receipts drawer behind the whole terminal. It does not grade in the
aggregate (the scorecard does that) — it lists individual claims, frozen at the
time they were made, next to how reality resolved them. Two kinds, held to two
DIFFERENT and deliberately-chosen standards:

  * Journal claims — a journaled thesis IS a claim ("this trade works, because
    …"). It resolves on close to the operator's own verdict: confirmed (thesis
    played out), partial, or refuted; open trades are pending. This is a fair
    test: the claim was actually made.

  * Regime reads — a regime label explicitly does NOT claim to predict returns
    (every classifier's honesty statement says so). So the ledger does not judge
    it against a claim it never made; it reports only whether the market ALIGNED
    with or DIVERGED from the read's directional lean over the next ~21 sessions,
    using softer language (aligned / mixed / diverged). A 'diverged' is not a
    model failure — it is the ledger holding our own outputs to a forward test
    they never promised to pass, on purpose, for radical honesty.

Everything is computed from already-persisted records (journal entries, regime
readings, cached benchmark bars) — nothing new is stored, so the ledger is always
current and never fabricates a resolution it cannot compute (those stay pending).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from ..config import HermesConfig
from ..data import store
from ..data.models import utcnow
from ..journal.service import list_entries
from ..regime.engine import reading_history
from ..regime.models import RegimeLabel

# The method-level validation record — Hermes' OWN documented verdicts, including
# the ones that found no edge. Sourced from the engine honesty strings + docs;
# encoded here so the receipts (and the failures) live in one place.
CAMPAIGNS = [
    {"method": "Fixed-fractional sizing", "verdict": "validated",
     "hypothesis": "Risking a fixed % of equity per trade controls path risk.",
     "result": "An established, arithmetic position-sizing method (Van Tharp / Vince) — "
               "it does what it claims: bounds per-trade loss. Not an alpha source."},
    {"method": "Drawdown circuit breaker", "verdict": "validated",
     "hypothesis": "Halting new risk at a drawdown threshold limits ruin.",
     "result": "A standard, mechanical risk halt on the normalized equity index — it "
               "enforces the rule it states; it does not predict the drawdown."},
    {"method": "Regime Label v6.2", "verdict": "heuristic",
     "hypothesis": "A vol-adjusted momentum state machine describes the market regime.",
     "result": "A heuristic derived from historical label-correlation, NOT a backtested "
               "edge. It classifies the present; it does not predict returns."},
    {"method": "Reviewer second-pass", "verdict": "heuristic",
     "hypothesis": "Rule checks catch overfitting / sample / execution problems at entry.",
     "result": "Sensible conventions, not literature-calibrated thresholds. Advisory; "
               "its calibration is tracked on the scorecard, not assumed."},
    {"method": "Minervini Trend Template (as an entry gate)", "verdict": "no_edge",
     "hypothesis": "An 8-point trend filter improves swing-entry outcomes.",
     "result": "Hermes' one validation campaign found filter-style signals did NOT add "
               "value at default parameters — a screening convenience, not evidence."},
    {"method": "Mansfield / cross-sectional RS (as an entry gate)", "verdict": "unvalidated",
     "hypothesis": "Relative-strength leadership predicts forward outperformance.",
     "result": "States a past tilt, not persistence. Never validated as a gate in Hermes; "
               "used to rank what earns a review first, never to trade."},
    {"method": "Dedicated short-side system (AIO v3.5-SHORT, owner-side)", "verdict": "unvalidated",
     "hypothesis": "Relative weakness + a failed-supply-reclaim / bear-flag trigger, gated by "
                   "no-chase, support-room and squeeze-risk filters with a structural stop, "
                   "makes shorting additive versus not shorting at all.",
     "result": "A NEW behavior-changing variant, now the owner's standing operating chart "
               "on TradingView — its order logic is banned from this repo by the "
               "no-order-paths boundary, so only this verdict is recorded here. Adopting it "
               "as the day-to-day chart is NOT validation: a live default is a workflow "
               "choice, not out-of-sample evidence. Not proven: pending the A/B campaign "
               "(v2-shorts vs legacy-mirror vs longs-only, full cycle, out-of-sample, "
               "costs-on) in docs/campaigns/SHORT_SIDE_V2_CAMPAIGN.md. Until it beats "
               "longs-only out of sample, Hermes' honest default stays shorts OFF and this "
               "verdict stays unvalidated no matter how long it runs live."},
]

# What each tool MAY and MAY NOT claim — the epistemic contract, in one place.
EPISTEMIC = [
    {"tool": "Regime classifier", "may": "Describe the current market state with its evidence.",
     "may_not": "Predict returns or the next regime — it disclaims forecasting."},
    {"tool": "Mansfield RS", "may": "Report a symbol's past strength vs the benchmark.",
     "may_not": "Claim that strength persists, or serve as a validated entry signal."},
    {"tool": "Minervini Trend Template", "may": "Flag a confirmed trend structure as a candidate.",
     "may_not": "Imply an edge — the one validation found none at the gate level."},
    {"tool": "Fixed-fractional sizing", "may": "Bound per-trade loss to a chosen % of equity.",
     "may_not": "Add alpha, or promise the empirical Kelly tilt is stationary."},
    {"tool": "Reviewer", "may": "Raise advisory flags on overfitting / sample / execution.",
     "may_not": "Block a trade, or claim its verdicts are proven — the human decides."},
    {"tool": "Drawdown breaker", "may": "Halt new risk at the drawdown limit.",
     "may_not": "Foresee the drawdown, or protect against a gap through the level."},
]

HORIZON_SESSIONS = 21       # ~1 trading month forward test for regime reads
BAND_PCT = 2.0              # benchmark move within ±this is 'flat' over the horizon
SMALL_SAMPLE = 20           # below this a resolved rate is an anecdote
MAX_ENTRIES = 120           # most-recent cap on the returned list (summary counts all)

CLAIM = (
    "A running ledger of individual model claims vs what actually happened: "
    "journaled theses resolved to their own verdict, and regime reads checked "
    "for whether the market aligned with them — each frozen at the time it was made."
)
METHODOLOGY = (
    "Journal entries are claims resolved on close (confirmed / partial / refuted; "
    "open = pending). Regime readings are forward-tested against the benchmark over "
    f"~{HORIZON_SESSIONS} sessions (aligned / mixed / diverged; too recent = pending), "
    "using softer language because a regime label does not claim to predict returns. "
    "All from persisted records + cached bars; nothing new is stored."
)
CAVEAT = (
    "A regime 'diverged' is NOT a model failure — the classifier disclaims "
    "prediction, and the ledger tests it against that unpromised standard on "
    "purpose. Journal verdicts are the operator's own. Resolved rates below 20 are "
    "anecdotes, flagged. Everything is % / verdicts; no dollar figure, no directive."
)


@dataclass(frozen=True)
class LedgerEntry:
    kind: str                   # 'journal' | 'regime'
    subject: str
    claim: str
    as_of: datetime | None
    horizon: str
    status: str                 # journal: confirmed/partial/refuted/pending
    resolved: bool              # regime: aligned/mixed/diverged/pending
    outcome: str
    detail: str


@dataclass(frozen=True)
class KindSummary:
    kind: str
    counts: dict[str, int]
    resolved: int
    rate_label: str             # 'hit rate' | 'alignment'
    rate_pct: float | None
    small_sample: bool
    note: str


@dataclass(frozen=True)
class ValidationLedger:
    generated_at: datetime
    benchmark: str
    entries: list[LedgerEntry] = field(default_factory=list)
    summaries: list[KindSummary] = field(default_factory=list)
    total_entries: int = 0
    campaigns: list[dict] = field(default_factory=list)
    campaign_tally: dict = field(default_factory=dict)     # verdict → count
    epistemic: list[dict] = field(default_factory=list)
    claim: str = CLAIM
    methodology: str = METHODOLOGY
    caveat: str = CAVEAT


# ── journal claims ──────────────────────────────────────────────────────────
_JOURNAL_STATUS = {"yes": "confirmed", "partial": "partial", "no": "refuted"}


def _journal_entries() -> list[LedgerEntry]:
    out: list[LedgerEntry] = []
    for e in list_entries():
        regime = (e.get("signal_state") or {}).get("label") or "no reading"
        review = (e.get("review") or {}).get("verdict") or "—"
        thesis = (e["thesis"] or "").strip()
        claim = f"{e['side']} {e['symbol']} — {thesis[:90]}{'…' if len(thesis) > 90 else ''}"
        detail = f"reviewer {review} · regime-at-entry {regime}"
        if e["status"] != "closed":
            out.append(LedgerEntry(
                "journal", e["symbol"], claim, _asof(e.get("opened_at")),
                "resolves on close", "pending", False,
                "open — not yet resolved", detail))
            continue
        status = _JOURNAL_STATUS.get(e.get("thesis_played_out"), "partial")
        realized = e.get("realized_return_pct")
        alpha = e.get("alpha_pct")
        outcome = (f"thesis {e.get('thesis_played_out')} · realized "
                   f"{_pct(realized)} · alpha {_pct(alpha)}")
        out.append(LedgerEntry(
            "journal", e["symbol"], claim, _asof(e.get("closed_at") or e.get("opened_at")),
            "resolved on close", status, True, outcome, detail))
    return out


# ── regime reads (forward-tested vs the benchmark) ──────────────────────────
def _bench_series(config: HermesConfig) -> list[tuple[datetime, float]]:
    bars = store.get_bars(config.market.benchmark, "1Day", limit=2000)
    return [(b.ts, b.close) for b in bars]


def _forward_return(series: list[tuple[datetime, float]], as_of: datetime | None) -> float | None:
    """Benchmark % return from the bar at/just-before as_of to HORIZON_SESSIONS
    later. None (→ pending) when as_of is unknown or not enough forward bars."""
    if as_of is None or not series:
        return None
    idx = None
    for i, (ts, _) in enumerate(series):
        if ts <= as_of:
            idx = i
        else:
            break
    if idx is None or idx + HORIZON_SESSIONS >= len(series):
        return None
    start = series[idx][1]
    later = series[idx + HORIZON_SESSIONS][1]
    if start <= 0:
        return None
    return (later / start - 1.0) * 100.0


# The directional lean each label implies, for the alignment check only.
_BULLISH = {RegimeLabel.BULL_TREND}
_BEARISH = {RegimeLabel.BEAR_TREND, RegimeLabel.STRESS}


def _regime_status(label: RegimeLabel, fwd: float | None) -> tuple[str, bool, str]:
    if fwd is None:
        return "pending", False, "too recent — not enough forward bars yet"
    outcome = f"benchmark {_pct(fwd)} over the next ~{HORIZON_SESSIONS} sessions"
    if label in _BULLISH:
        st = "aligned" if fwd > BAND_PCT else "diverged" if fwd < -BAND_PCT else "mixed"
    elif label in _BEARISH:
        st = "aligned" if fwd < -BAND_PCT else "diverged" if fwd > BAND_PCT else "mixed"
    else:  # CHOP → aligned if the market stayed range-bound
        st = "aligned" if abs(fwd) <= BAND_PCT else "mixed"
    return st, True, outcome


def _regime_entries(config: HermesConfig) -> list[LedgerEntry]:
    series = _bench_series(config)
    out: list[LedgerEntry] = []
    for r in reading_history(365):
        fwd = _forward_return(series, r.data_asof)
        status, resolved, outcome = _regime_status(r.label, fwd)
        out.append(LedgerEntry(
            "regime", "market regime",
            f"regime read {r.label.display} (confidence {r.confidence:.2f}, "
            f"{r.classifier_version})",
            r.data_asof, f"~{HORIZON_SESSIONS} sessions", status, resolved,
            outcome, f"score {r.score:+.2f}"))
    return out


# ── summaries ───────────────────────────────────────────────────────────────
def _summary(kind: str, entries: list[LedgerEntry], good: set[str],
             rate_label: str) -> KindSummary:
    counts: dict[str, int] = {}
    for e in entries:
        counts[e.status] = counts.get(e.status, 0) + 1
    resolved = sum(1 for e in entries if e.resolved)
    hits = sum(counts.get(g, 0) for g in good)
    rate = round(hits / resolved * 100.0, 1) if resolved else None
    small = resolved < SMALL_SAMPLE
    note = (f"{resolved} resolved — below {SMALL_SAMPLE}, treat the {rate_label.lower()} "
            "as an anecdote" if small and resolved else
            "" if resolved else "nothing resolved yet")
    return KindSummary(kind, counts, resolved, rate_label, rate, small, note)


def build_ledger(config: HermesConfig) -> ValidationLedger:
    journal = _journal_entries()
    regime = _regime_entries(config)
    all_entries = journal + regime
    all_entries.sort(key=lambda e: (e.as_of is None, e.as_of or utcnow()), reverse=True)

    summaries = [
        _summary("journal", journal, {"confirmed"}, "hit rate"),
        _summary("regime", regime, {"aligned"}, "alignment"),
    ]
    tally: dict[str, int] = {}
    for c in CAMPAIGNS:
        tally[c["verdict"]] = tally.get(c["verdict"], 0) + 1

    return ValidationLedger(
        generated_at=utcnow(), benchmark=config.market.benchmark,
        entries=all_entries[:MAX_ENTRIES], summaries=summaries,
        total_entries=len(all_entries),
        campaigns=CAMPAIGNS, campaign_tally=tally, epistemic=EPISTEMIC)


# ── small helpers ───────────────────────────────────────────────────────────
def _pct(v) -> str:
    return "∅" if v is None else f"{v:+.2f}%"


def _asof(iso_str: str | None) -> datetime | None:
    if not iso_str:
        return None
    from ..data.models import parse_iso
    return parse_iso(iso_str)
