"""Model scorecard — the honesty surface that grades Hermes' own models.

This is the module most bound by the doctrine "honesty is the product". It grades
ONLY what the stored evidence can support, and it is loud about what it cannot:

  * GRADED   — there is enough persisted evidence to say something, always with
               its sample size and a nonstationarity caveat attached.
  * THIN     — the mechanism is real but the record is too short to judge yet
               (the sample is stated, and the item says "not enough data").
  * NOT_TRACKED — the thing genuinely cannot be graded from what Hermes stores
               today, with the reason and what it would take.

It fabricates no grade. Where a follow-through study would need historical
snapshots Hermes does not keep (the RS board and screener are computed on demand
and never persisted), the scorecard says so rather than inventing a number.

Graded items, all from stored data:
  1. Regime-classifier stability — flips / dwell / streak over the PERSISTED
     default-classifier readings. Descriptive: stability is not accuracy.
  2. Classifier agreement (now) — do v62 and reference-v1 agree on this instant's
     label? One snapshot, flagged as such (historical agreement is not tracked).
  3. Reviewer calibration — do trades the reviewer cautioned/blocked actually
     realize worse than the ones it cleared? Grouped over closed trades.
  4. Thesis-judgment calibration — does the operator's thesis verdict (yes /
     partial / no) line up with realized outcome? (Grades the human's calls.)

Not tracked (stated, not faked):
  5. RS-board verdict follow-through and 6. screener verdict follow-through —
     would need persisted historical board/screener snapshots.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from ..config import HermesConfig
from ..data.models import utcnow
from ..journal.service import list_entries
from ..regime.engine import reading_history
from ..regime.lab import build_lab

MIN_TO_GRADE = 20      # below this a graded item is THIN (record too short to judge)

CLAIM = (
    "A grade of Hermes' own models on stored evidence only — regime-classifier "
    "stability, live classifier agreement, reviewer calibration, and thesis-"
    "judgment calibration — with an explicit 'not tracked yet' for what the data "
    "cannot support."
)
METHODOLOGY = (
    "Each item is computed from persisted readings or resolved journal trades, "
    "carries its sample size, and is marked GRADED / THIN / NOT_TRACKED. Nothing "
    "is fabricated: follow-through studies that would need historical board or "
    "screener snapshots (which Hermes does not persist) are named as not tracked."
)
CAVEAT = (
    "Every graded number is an in-sample description of a short, nonstationary "
    "record — not a forward guarantee. Stability is not accuracy; agreement is "
    "corroboration between two heuristics that share inputs; calibration below a "
    "meaningful sample is an anecdote, and is labeled one."
)


@dataclass(frozen=True)
class ScoreRow:
    label: str
    n: int
    win_rate_pct: float | None
    avg_realized_pct: float | None
    note: str = ""


@dataclass(frozen=True)
class ScoreItem:
    key: str
    title: str
    status: str                 # 'graded' | 'thin' | 'not_tracked'
    n: int                      # the sample the read rests on
    headline: str
    detail: str
    small_sample: bool
    rows: list[ScoreRow] = field(default_factory=list)
    claim: str = ""
    caveat: str = ""


@dataclass(frozen=True)
class Scorecard:
    generated_at: datetime
    items: list[ScoreItem] = field(default_factory=list)
    claim: str = CLAIM
    methodology: str = METHODOLOGY
    caveat: str = CAVEAT


def _grade(entries: list[dict]) -> tuple[float | None, float | None]:
    """(win rate %, avg realized %) over entries with a realized return."""
    realized = [e["realized_return_pct"] for e in entries if e["realized_return_pct"] is not None]
    if not realized:
        return None, None
    wins = sum(1 for r in realized if r > 0)
    return round(wins / len(realized) * 100.0, 1), round(sum(realized) / len(realized), 2)


# ── 1. Regime-classifier stability ──────────────────────────────────────────
def _stability(history) -> ScoreItem:
    n = len(history)
    claim = "How steady the default classifier's label is over its own readings."
    caveat = ("Stability is a description of behavior, not accuracy: a classifier that "
              "never moves could be missing real turns, and a whippy one is a caution, "
              "not a verdict on correctness.")
    if n < 2:
        return ScoreItem(
            "regime_stability", "Regime-classifier stability", "thin", n,
            "not enough readings yet", "Run the daily check; stability needs a history to measure.",
            True, [], claim, caveat)
    flips = sum(1 for i in range(1, n) if history[i].label != history[i - 1].label)
    flip_rate = round(flips / (n - 1) * 100.0, 1)
    avg_dwell = round(n / (flips + 1), 1)
    streak = 1
    for i in range(n - 1, 0, -1):
        if history[i].label == history[i - 1].label:
            streak += 1
        else:
            break
    counts: dict[str, int] = {}
    for r in history:
        counts[r.label.display] = counts.get(r.label.display, 0) + 1
    rows = [ScoreRow(lbl, c, None, None, f"{round(c / n * 100)}% of readings")
            for lbl, c in sorted(counts.items(), key=lambda kv: -kv[1])]
    thin = n < MIN_TO_GRADE
    return ScoreItem(
        "regime_stability", "Regime-classifier stability",
        "thin" if thin else "graded", n,
        f"{flips} flip{'s' if flips != 1 else ''} over {n} readings · "
        f"avg dwell {avg_dwell} · streak {streak}",
        (f"Flip rate {flip_rate}% of adjacent readings. " + (
            "Too few readings to read as anything but an anecdote." if thin
            else "A low flip rate means a steady label; it does not by itself "
                 "mean a correct one.")),
        thin, rows, claim, caveat)


# ── 2. Classifier agreement (current snapshot) ──────────────────────────────
def _agreement(config: HermesConfig) -> ScoreItem:
    claim = "Whether the two classifiers read the same label on the same bars right now."
    caveat = ("A single instant, not a track record — historical agreement is not "
              "persisted (only the default classifier's readings are). Two heuristics "
              "that share inputs agreeing is corroboration, not proof.")
    lab = build_lab(config)
    ok = [c for c in lab.classifiers if c.status == "ok"]
    if lab.status != "ok" or len(ok) < 2:
        return ScoreItem(
            "classifier_agreement", "Classifier agreement (now)", "thin", len(ok),
            "not enough history for a second opinion",
            "Both classifiers need enough cached bars to read before they can be compared.",
            True, [], claim, caveat)
    rows = [ScoreRow(f"{c.version}{' · default' if c.is_default else ''}", 1, None, None,
                     c.label_display or "—") for c in ok]
    return ScoreItem(
        "classifier_agreement", "Classifier agreement (now)", "graded", 1,
        "classifiers agree" if lab.agree else "classifiers disagree",
        lab.agreement_note, True, rows, claim, caveat)


# ── 3. Reviewer calibration ─────────────────────────────────────────────────
_VERDICT_ORDER = ["clear", "caution", "blocked"]


def _reviewer_calibration(closed: list[dict]) -> ScoreItem:
    claim = ("Whether trades the reviewer cautioned or blocked actually realized worse "
             "than the ones it cleared.")
    caveat = ("Advisory verdicts graded after the fact on a short record. A cleared "
              "trade that lost is not proof the reviewer failed, nor a blocked winner "
              "proof it was wrong — it is one draw from a nonstationary process.")
    reviewed = [e for e in closed if (e.get("review") or {}).get("verdict")]
    n = len(reviewed)
    if n < MIN_TO_GRADE:
        return ScoreItem(
            "reviewer_calibration", "Reviewer calibration", "thin", n,
            f"{n} reviewed closed trades — not enough to judge",
            "The reviewer's calibration needs a longer resolved record before it means anything.",
            True, _verdict_rows(reviewed), claim, caveat)
    rows = _verdict_rows(reviewed)
    by = {r.label: r for r in rows}
    order_ok = None
    if "clear" in by and "caution" in by and by["clear"].avg_realized_pct is not None \
            and by["caution"].avg_realized_pct is not None:
        order_ok = by["clear"].avg_realized_pct >= by["caution"].avg_realized_pct
    headline = ("cleared trades did outperform cautioned ones" if order_ok
                else "cleared trades did NOT outperform cautioned ones" if order_ok is False
                else "not enough verdict spread to order")
    return ScoreItem(
        "reviewer_calibration", "Reviewer calibration", "graded", n, headline,
        "Grouped by the reviewer's advisory verdict at entry, over resolved trades.",
        False, rows, claim, caveat)


def _verdict_rows(reviewed: list[dict]) -> list[ScoreRow]:
    buckets: dict[str, list[dict]] = {}
    for e in reviewed:
        buckets.setdefault(e["review"]["verdict"], []).append(e)
    rows = []
    for v in _VERDICT_ORDER:
        if v in buckets:
            wr, avg = _grade(buckets[v])
            rows.append(ScoreRow(v, len(buckets[v]), wr, avg))
    for v, es in buckets.items():           # any non-standard verdicts, after the known ones
        if v not in _VERDICT_ORDER:
            wr, avg = _grade(es)
            rows.append(ScoreRow(v, len(es), wr, avg))
    return rows


# ── 4. Thesis-judgment calibration ──────────────────────────────────────────
_THESIS_ORDER = ["yes", "partial", "no"]
_THESIS_LABEL = {"yes": "Thesis played out", "partial": "Partial", "no": "Thesis failed"}


def _thesis_calibration(closed: list[dict]) -> ScoreItem:
    claim = ("Whether the operator's own thesis verdict (yes / partial / no) lines up "
             "with the realized outcome. Grades the human's calls, not a Hermes model.")
    caveat = ("A self-audit of judgment, not a model metric. 'Thesis played out' and "
              "'made money' can diverge legitimately — a right call can still lose to "
              "noise, and a wrong one can luck into a gain.")
    graded = [e for e in closed if e.get("thesis_played_out")]
    n = len(graded)
    buckets: dict[str, list[dict]] = {}
    for e in graded:
        buckets.setdefault(e["thesis_played_out"], []).append(e)
    rows = []
    for k in _THESIS_ORDER:
        if k in buckets:
            wr, avg = _grade(buckets[k])
            rows.append(ScoreRow(_THESIS_LABEL[k], len(buckets[k]), wr, avg))
    if n < MIN_TO_GRADE:
        return ScoreItem(
            "thesis_calibration", "Thesis-judgment calibration", "thin", n,
            f"{n} resolved trades with a thesis verdict — not enough to judge",
            "Thesis calibration needs a longer resolved record before it means anything.",
            True, rows, claim, caveat)
    return ScoreItem(
        "thesis_calibration", "Thesis-judgment calibration", "graded", n,
        "thesis-verdict vs realized outcome, over resolved trades",
        "Do the trades you graded 'played out' also carry the better realized returns?",
        False, rows, claim, caveat)


# ── 5 & 6. Not tracked (stated, not faked) ──────────────────────────────────
def _not_tracked(key: str, title: str, what: str) -> ScoreItem:
    return ScoreItem(
        key, title, "not_tracked", 0, "not tracked yet",
        (f"{what} is computed on demand and never persisted, so its forward "
         "follow-through cannot be measured from stored data. Grading it would need "
         "Hermes to snapshot the verdicts over time first — a future roadmap item. "
         "No number is shown rather than a fabricated one."),
        False, [],
        f"Whether {title.lower()} predicted the moves that followed.",
        "Deliberately ungraded: the honest answer is 'we do not store what this needs'.")


# ── the report ──────────────────────────────────────────────────────────────
def build_scorecard(config: HermesConfig) -> Scorecard:
    history = reading_history(365)
    closed = list_entries(status="closed")
    items = [
        _stability(history),
        _agreement(config),
        _reviewer_calibration(closed),
        _thesis_calibration(closed),
        _not_tracked("rs_followthrough", "RS-board verdict follow-through",
                     "The RS leadership board"),
        _not_tracked("screener_followthrough", "Screener verdict follow-through",
                     "The swing screener"),
    ]
    return Scorecard(generated_at=utcnow(), items=items)
