"""Regime Lab — a deep read of the regime engine, composed from what already exists.

Nothing here is a new measurement. It does three things over CACHED bars (never
a live fetch):

1. Runs BOTH classifiers — `v62` (the owner's, default) and `reference-v1` (the
   transparent published-methods composite) — on the SAME benchmark + watchlist
   bars, so the two can be read side by side as a second opinion. The LABELS are
   directly comparable (the same four-state enum); the per-classifier score and
   confidence are each on their OWN scale and are deliberately NOT presented as
   cross-comparable numbers.

2. Opens each classifier's evidence (the same teach-in shape the Desk uses) and
   breaks out the confidence number into its own formula, so it is not a black box.

3. Reads the transition history of the AUTHORITATIVE (persisted) default
   classifier — the current streak, the recent flips, and the dwell per label —
   from the stored readings, and is honest when that history is too short to mean
   much.

The two classifiers running live here are a READ: they are not persisted, so the
Lab never pollutes the history that the scheduled daily check owns. If the live
default label differs from the last persisted one, that drift is surfaced — it
means a fresh daily check would move the label.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime

from ..config import HermesConfig
from ..data import store
from ..data.models import utcnow
from .engine import CLASSIFIERS, latest_reading, reading_history
from .models import Evidence, RegimeLabel, RegimeReading

CLAIM = (
    "A deep read of the regime engine: both classifiers run live on the same "
    "cached bars for a side-by-side second opinion, each component's evidence "
    "opened, the confidence number broken out, and the recent transition history "
    "of the authoritative (persisted) classifier."
)
METHODOLOGY = (
    "Runs v62 and reference-v1 over the same benchmark + watchlist bars (cached, "
    "never a live fetch). Labels share the four-state enum and are compared "
    "directly; scores/confidences are each classifier's own scale and are not "
    "cross-comparable. Streak, transitions, and dwell are computed over the "
    "persisted readings of the default classifier."
)
CAVEAT = (
    "A description of the present, not a forecast. Two classifiers agreeing is "
    "corroboration, not proof — they share inputs and both are heuristics, not "
    "backtested edges. Transition statistics over a short reading history are an "
    "anecdote, and are labeled as one. Missing history stays missing."
)

SMALL_SAMPLE_READINGS = 20     # below this, transition stats are an anecdote
MARKOV_LOOKBACK = 220          # bars to replay the default classifier over
_WILSON_Z = 1.96               # 95% two-sided


@dataclass(frozen=True)
class MarkovRow:
    from_label: str
    from_display: str
    n: int                     # transitions observed out of this state
    to: list[dict]             # [{label, display, count, prob_pct, lo_pct, hi_pct}]


@dataclass(frozen=True)
class Markov:
    status: str                # 'ok' | 'thin'
    lookback: int
    total: int                 # transitions counted
    states: list[str]
    rows: list[MarkovRow] = field(default_factory=list)
    current_state: str | None = None
    current_display: str | None = None
    p_stay_pct: float | None = None
    mean_dwell: float | None = None       # 1/(1-p_stay), in sessions
    current_run: int = 0
    maturity: str = ""                    # 'on-trend' | 'mature' | ''
    stationary: list[dict] = field(default_factory=list)   # [{label, display, pct}]
    note: str = ""


def _wilson(count: int, n: int) -> tuple[float, float, float]:
    """(p, lo, hi) — Wilson 95% score interval for a proportion, in [0,1]."""
    if n == 0:
        return 0.0, 0.0, 0.0
    p = count / n
    z2 = _WILSON_Z ** 2
    denom = 1 + z2 / n
    center = (p + z2 / (2 * n)) / denom
    half = (_WILSON_Z / denom) * math.sqrt(p * (1 - p) / n + z2 / (4 * n * n))
    return p, max(0.0, center - half), min(1.0, center + half)


def _state_series(config: HermesConfig, benchmark_bars, watchlist_bars) -> list[RegimeLabel]:
    """Replay the DEFAULT classifier over expanding windows of the cached bars to
    recover the historical regime sequence — real n, not the thin persisted log.
    (v62, the default, is single-symbol so the watchlist slice is a no-op for it.)"""
    default = CLASSIFIERS[config.regime.classifier](config)
    n = len(benchmark_bars)
    start = max(21, n - MARKOV_LOOKBACK)
    out: list[RegimeLabel] = []
    for i in range(start, n + 1):
        wl = {s: b[:i] for s, b in watchlist_bars.items()}
        out.append(default.classify(benchmark_bars[:i], wl).label)
    return out


def _markov(series: list[RegimeLabel]) -> Markov:
    if len(series) < 3:
        return Markov("thin", MARKOV_LOOKBACK, 0, [],
                      note="not enough classified history to estimate transitions")
    # Ordered states actually seen (keeps the display stable and honest).
    seen = [lab for lab in (RegimeLabel.BULL_TREND, RegimeLabel.CHOP,
                            RegimeLabel.BEAR_TREND, RegimeLabel.STRESS) if lab in series]
    counts = {a: {b: 0 for b in seen} for a in seen}
    for a, b in zip(series[:-1], series[1:], strict=True):
        counts[a][b] += 1
    total = len(series) - 1

    rows = []
    for a in seen:
        row_n = sum(counts[a].values())
        to = []
        for b in seen:
            p, lo, hi = _wilson(counts[a][b], row_n)
            to.append({"label": b.value, "display": b.display, "count": counts[a][b],
                       "prob_pct": round(p * 100, 1), "lo_pct": round(lo * 100, 1),
                       "hi_pct": round(hi * 100, 1)})
        rows.append(MarkovRow(a.value, a.display, row_n, to))

    # Stationary distribution via power iteration on the row-stochastic matrix.
    idx = {lab: i for i, lab in enumerate(seen)}
    P = [[(counts[a][b] / sum(counts[a].values())) if sum(counts[a].values()) else
          (1.0 if a == b else 0.0) for b in seen] for a in seen]
    pi = [1.0 / len(seen)] * len(seen)
    for _ in range(200):
        pi = [sum(pi[i] * P[i][j] for i in range(len(seen))) for j in range(len(seen))]
        s = sum(pi) or 1.0
        pi = [x / s for x in pi]
    stationary = [{"label": lab.value, "display": lab.display, "pct": round(pi[idx[lab]] * 100, 1)}
                  for lab in seen]

    # Current-state dynamics.
    cur = series[-1]
    run = 0
    for lab in reversed(series):
        if lab == cur:
            run += 1
        else:
            break
    p_stay = counts[cur][cur] / sum(counts[cur].values()) if sum(counts[cur].values()) else None
    mean_dwell = round(1.0 / (1.0 - p_stay), 1) if (p_stay is not None and p_stay < 1.0) else None
    maturity = ("" if mean_dwell is None else
                "mature" if run > mean_dwell else "on-trend")
    thin = total < SMALL_SAMPLE_READINGS
    return Markov(
        "thin" if thin else "ok", MARKOV_LOOKBACK, total, [s.value for s in seen], rows,
        current_state=cur.value, current_display=cur.display,
        p_stay_pct=round(p_stay * 100, 1) if p_stay is not None else None,
        mean_dwell=mean_dwell, current_run=run, maturity=maturity, stationary=stationary,
        note=("estimated over a short window — treat as indicative" if thin else ""))


@dataclass(frozen=True)
class ClassifierView:
    version: str
    is_default: bool
    status: str                 # 'ok' | 'missing'
    label: str | None
    label_display: str | None
    score: float | None         # this classifier's OWN scale — not cross-comparable
    confidence: float | None
    confidence_basis: str       # the actual formula behind `confidence`
    votes_available: int        # evidence components that cast a signal
    votes_total: int
    evidence: list[Evidence] = field(default_factory=list)
    data_asof: datetime | None = None
    data_source: str = ""
    honesty: str = ""


@dataclass(frozen=True)
class Transition:
    ts: datetime
    from_label: str | None
    from_display: str | None
    to_label: str
    to_display: str


@dataclass(frozen=True)
class RegimeLab:
    generated_at: datetime
    benchmark: str
    status: str                 # 'ok' | 'missing'
    note: str
    default_classifier: str
    agree: bool | None          # do the two LIVE classifiers agree on the label?
    agreement_note: str
    classifiers: list[ClassifierView] = field(default_factory=list)
    # persisted (authoritative) context
    persisted_label: str | None = None
    persisted_display: str | None = None
    persisted_asof: datetime | None = None
    drifted: bool = False       # live default label != last persisted label
    drift_note: str = ""
    # transition history of the default classifier
    history: list[dict] = field(default_factory=list)
    streak_readings: int = 0
    transitions: list[Transition] = field(default_factory=list)
    dwell: list[dict] = field(default_factory=list)
    history_n: int = 0
    small_sample: bool = True
    markov: Markov | None = None
    claim: str = CLAIM
    methodology: str = METHODOLOGY
    caveat: str = CAVEAT


_CONF_BASIS = {
    "reference-v1": "agreement (|score|) × coverage (components that voted ÷ total)",
    "v62": "signal strength (|z| vs the entry threshold) in a regime; "
           "band-centeredness (how far inside ±enter) when Neutral",
}


def _view(version: str, reading: RegimeReading, *, is_default: bool) -> ClassifierView:
    ev = reading.evidence
    available = sum(1 for e in ev if e.signal is not None)
    missing_only = available == 0 and all(e.status == "missing" for e in ev)
    return ClassifierView(
        version=version, is_default=is_default,
        status="missing" if missing_only else "ok",
        label=None if missing_only else reading.label.value,
        label_display=None if missing_only else reading.label.display,
        score=None if missing_only else reading.score,
        confidence=None if missing_only else reading.confidence,
        confidence_basis=_CONF_BASIS.get(version, "classifier-specific"),
        votes_available=available, votes_total=len(ev),
        evidence=ev, data_asof=reading.data_asof, data_source=reading.data_source,
        honesty=reading.honesty,
    )


def _transitions_and_dwell(
    history: list[RegimeReading],
) -> tuple[list[Transition], list[dict], int]:
    """Flips (label changes) and per-label dwell over the reading window, plus the
    current streak (consecutive most-recent readings at the latest label)."""
    transitions: list[Transition] = []
    prev: RegimeReading | None = None
    for r in history:
        if prev is None or r.label != prev.label:
            transitions.append(Transition(
                ts=r.ts,
                from_label=prev.label.value if prev else None,
                from_display=prev.label.display if prev else None,
                to_label=r.label.value, to_display=r.label.display,
            ))
        prev = r

    counts: dict[RegimeLabel, int] = {}
    for r in history:
        counts[r.label] = counts.get(r.label, 0) + 1
    total = len(history)
    dwell = [
        {"label": lbl.value, "display": lbl.display, "count": c,
         "pct": round(c / total * 100.0, 1) if total else 0.0}
        for lbl, c in sorted(counts.items(), key=lambda kv: -kv[1])
    ]

    streak = 0
    if history:
        last = history[-1].label
        for r in reversed(history):
            if r.label == last:
                streak += 1
            else:
                break
    return transitions, dwell, streak


def build_lab(config: HermesConfig, *, history_limit: int = 90) -> RegimeLab:
    benchmark = config.market.benchmark
    default_version = config.regime.classifier
    benchmark_bars = store.get_bars(benchmark, "1Day", limit=600)
    watchlist_bars = {
        s: store.get_bars(s, "1Day", limit=120) for s in config.market.watchlist
    }

    if not benchmark_bars:
        return RegimeLab(
            generated_at=utcnow(), benchmark=benchmark, status="missing",
            note=(f"no cached {benchmark} bars — run the daily check / a sync. "
                  "Missing stays missing, never faked."),
            default_classifier=default_version, agree=None,
            agreement_note="", small_sample=True, history_n=0)

    # Run BOTH classifiers live on the same bars (a read — never persisted).
    # Default first so the UI leads with the authoritative one.
    order = [default_version] + [v for v in CLASSIFIERS if v != default_version]
    views: list[ClassifierView] = []
    for version in order:
        classifier = CLASSIFIERS[version](config)
        reading = classifier.classify(benchmark_bars, watchlist_bars)
        views.append(_view(version, reading, is_default=(version == default_version)))

    ok_views = [v for v in views if v.status == "ok"]
    if len(ok_views) >= 2:
        agree = ok_views[0].label == ok_views[1].label
        agreement_note = (
            "both classifiers read the same regime — corroboration, not proof (they "
            "share inputs)" if agree else
            "the classifiers disagree — the default is authoritative; the other is a "
            "second opinion worth reading, not a tiebreaker")
    else:
        agree, agreement_note = None, "only one classifier has enough history to read"

    # Persisted (authoritative) context + drift vs the live default.
    persisted = latest_reading()
    default_view = views[0]
    drifted, drift_note = False, ""
    if persisted is not None and default_view.label is not None:
        drifted = persisted.label.value != default_view.label
        if drifted:
            drift_note = (
                f"the live {default_version} label ({default_view.label_display}) differs "
                f"from the last persisted one ({persisted.label.display}) — bars moved "
                "since the last daily check; a fresh check would update it")

    markov = _markov(_state_series(config, benchmark_bars, watchlist_bars))

    hist = reading_history(history_limit)
    transitions, dwell, streak = _transitions_and_dwell(hist)
    history_payload = [
        {"ts": r.ts, "label": r.label.value, "display": r.label.display,
         "score": r.score, "confidence": r.confidence, "asof": r.data_asof}
        for r in hist
    ]

    return RegimeLab(
        generated_at=utcnow(), benchmark=benchmark, status="ok", note="",
        default_classifier=default_version, agree=agree, agreement_note=agreement_note,
        classifiers=views,
        persisted_label=persisted.label.value if persisted else None,
        persisted_display=persisted.label.display if persisted else None,
        persisted_asof=persisted.data_asof if persisted else None,
        drifted=drifted, drift_note=drift_note,
        history=history_payload, streak_readings=streak,
        transitions=transitions, dwell=dwell, history_n=len(hist),
        small_sample=len(hist) < SMALL_SAMPLE_READINGS, markov=markov,
    )
