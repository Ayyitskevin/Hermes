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
        small_sample=len(hist) < SMALL_SAMPLE_READINGS,
    )
