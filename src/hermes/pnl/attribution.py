"""P&L & attribution — the resolved journal, graded on the normalized equity index.

NO DOLLARS, ANYWHERE. Performance is a 100-based equity index (100 = flat start),
per-trade results are % of equity, and everything else is percentage points, bps,
or R-multiples. Hermes never sees, stores, or displays an account balance, a
dollar P&L, or a dollar position size — this module inherits that boundary and
adds nothing that could cross it.

It composes three things that already exist:

1. The equity index (`equity_index` table): the 100-based curve the journal moves
   on every close. Each close writes a row whose `cause` is `journal_close:<id>`,
   so the exact index delta each trade contributed is recoverable — that delta is
   the honest attribution weight (it already accounts for position size and the
   compounding order), not a re-derived approximation.

2. The resolved journal (`journal_entries`, status='closed'): realized return %,
   benchmark return % and alpha %, the thesis verdict, and — frozen at entry —
   the regime label, the setup tag, the sector, and the side.

3. `journal.performance_summary()` for the headline win / thesis / alpha figures,
   extended here with index return, max drawdown on the curve, payoff, and
   expectancy in R.

Attribution buckets the closed trades by regime-at-entry, setup, sector, and side,
and reports each bucket's contribution to the index in points. Small samples are
labeled anecdotes on every level — a bucket of three trades is not an edge.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from .. import db
from ..config import HermesConfig
from ..data.models import parse_iso
from ..journal.service import performance_summary
from ..regime.models import RegimeLabel

SMALL_SAMPLE_BOOK = 20      # below this the book-level stats are an anecdote
SMALL_SAMPLE_GROUP = 10     # below this a single attribution bucket is an anecdote

CLAIM = (
    "The resolved journal graded on the normalized equity index: how the book has "
    "done (in % / a 100-based index, never dollars) and which regimes, setups, "
    "sectors, and sides contributed the moves."
)
METHODOLOGY = (
    "Performance is the 100-based equity index the journal moves on each close "
    "(100 = flat start). Each close's exact index delta — recovered from the "
    "equity_index row it wrote — is the attribution weight, so contributions sum "
    "to the index move by construction. Realized/benchmark/alpha are per-trade %; "
    "expectancy is mean R (realized / planned risk); payoff is avg win% / avg loss%."
)
CAVEAT = (
    "A record of what happened, not a forecast of what will. Small samples are "
    "flagged anecdotes (below 20 trades book-wide, below 10 per bucket) — a short "
    "record is noise, not an edge. Alpha is vs the configured benchmark over each "
    "trade's own holding window. Nothing here is a dollar figure, and nothing here "
    "is a directive."
)


@dataclass(frozen=True)
class CurvePoint:
    ts: datetime
    value: float            # 100-based index
    cause: str


@dataclass(frozen=True)
class Headline:
    closed_trades: int
    win_rate_pct: float | None
    thesis_hit_rate_pct: float | None
    avg_alpha_pct: float | None
    alpha_sample: int
    index_start: float
    index_now: float
    index_return_pct: float
    max_drawdown_pct: float
    best_pct: float | None
    worst_pct: float | None
    avg_win_pct: float | None
    avg_loss_pct: float | None
    payoff_ratio: float | None
    expectancy_r: float | None
    r_sample: int
    small_sample: bool
    note: str


@dataclass(frozen=True)
class AttribGroup:
    key: str
    label: str
    n: int
    win_rate_pct: float
    avg_realized_pct: float | None
    avg_alpha_pct: float | None
    alpha_sample: int
    contribution_points: float      # Σ index deltas (points), the honest weight
    small_sample: bool


@dataclass(frozen=True)
class Attribution:
    dimension: str                  # 'regime' | 'setup' | 'sector' | 'side'
    label: str
    groups: list[AttribGroup] = field(default_factory=list)


@dataclass(frozen=True)
class PnLReport:
    generated_at: datetime
    status: str                     # 'ok' | 'empty'
    note: str
    headline: Headline | None
    curve: list[CurvePoint] = field(default_factory=list)
    attributions: list[Attribution] = field(default_factory=list)
    claim: str = CLAIM
    methodology: str = METHODOLOGY
    caveat: str = CAVEAT


# ── equity curve + per-trade index deltas ───────────────────────────────────
def _curve_and_deltas() -> tuple[list[CurvePoint], dict[int, float]]:
    """The 100-based curve and each closing trade's exact index delta (points),
    keyed by entry id. The delta already carries position size + compounding
    order — it is the attribution weight, not a re-derivation."""
    rows = db.connect().execute(
        "SELECT ts, value, cause FROM equity_index ORDER BY ts, id"
    ).fetchall()
    curve: list[CurvePoint] = []
    deltas: dict[int, float] = {}
    prev = 100.0
    for r in rows:
        curve.append(CurvePoint(ts=parse_iso(r["ts"]), value=r["value"], cause=r["cause"] or ""))
        cause = r["cause"] or ""
        if cause.startswith("journal_close:"):
            try:
                deltas[int(cause.split(":", 1)[1])] = round(r["value"] - prev, 4)
            except (ValueError, IndexError):
                pass
        prev = r["value"]
    return curve, deltas


def _max_drawdown(curve: list[CurvePoint]) -> float:
    """Deepest peak-to-trough on the index, in %. Peak seeded at the 100 flat
    start so a book that only ever fell still shows its drawdown."""
    peak, mdd = 100.0, 0.0
    for p in curve:
        peak = max(peak, p.value)
        if peak > 0:
            mdd = max(mdd, (peak - p.value) / peak * 100.0)
    return round(mdd, 2)


# ── headline ────────────────────────────────────────────────────────────────
def _headline(closed: list[dict], curve: list[CurvePoint]) -> Headline:
    perf = performance_summary()
    n = len(closed)
    realized = [e["realized_return_pct"] for e in closed if e["realized_return_pct"] is not None]
    wins = [r for r in realized if r > 0]
    losses = [-r for r in realized if r < 0]
    avg_win = round(sum(wins) / len(wins), 2) if wins else None
    avg_loss = round(sum(losses) / len(losses), 2) if losses else None
    payoff = round(avg_win / avg_loss, 2) if (avg_win and avg_loss) else None

    r_multiples = [
        e["realized_return_pct"] / e["planned_risk_pct"]
        for e in closed
        if e["realized_return_pct"] is not None and (e["planned_risk_pct"] or 0) > 0
    ]
    expectancy = round(sum(r_multiples) / len(r_multiples), 2) if r_multiples else None

    index_now = curve[-1].value if curve else 100.0
    return Headline(
        closed_trades=n,
        win_rate_pct=perf.get("win_rate_pct"),
        thesis_hit_rate_pct=perf.get("thesis_hit_rate_pct"),
        avg_alpha_pct=perf.get("avg_alpha_pct"),
        alpha_sample=perf.get("alpha_sample", 0),
        index_start=100.0,
        index_now=round(index_now, 2),
        index_return_pct=round((index_now / 100.0 - 1.0) * 100.0, 2),
        max_drawdown_pct=_max_drawdown(curve),
        best_pct=round(max(realized), 2) if realized else None,
        worst_pct=round(min(realized), 2) if realized else None,
        avg_win_pct=avg_win, avg_loss_pct=avg_loss, payoff_ratio=payoff,
        expectancy_r=expectancy, r_sample=len(r_multiples),
        small_sample=n < SMALL_SAMPLE_BOOK,
        note=("Sample below 20 closed trades — treat every figure here as an "
              "anecdote, not an edge." if n < SMALL_SAMPLE_BOOK else ""),
    )


# ── attribution ─────────────────────────────────────────────────────────────
def _regime_label(entry: dict) -> tuple[str, str]:
    state = entry.get("signal_state") or {}
    raw = state.get("label")
    if not raw:
        return "no_reading", "No reading at entry"
    try:
        return raw, RegimeLabel(raw).display
    except ValueError:
        return raw, raw


def _key_for(entry: dict, dimension: str) -> tuple[str, str]:
    if dimension == "regime":
        return _regime_label(entry)
    if dimension == "setup":
        tag = entry.get("setup_tag")
        return (tag, tag) if tag else ("untagged", "Untagged")
    if dimension == "sector":
        sec = entry.get("sector")
        return (sec, sec) if sec else ("unspecified", "Unspecified")
    if dimension == "side":
        side = entry.get("side") or "unknown"
        return side, side.capitalize()
    raise ValueError(f"unknown attribution dimension {dimension!r}")


def _group(entries: list[dict], deltas: dict[int, float], key: str, label: str) -> AttribGroup:
    n = len(entries)
    realized = [e["realized_return_pct"] for e in entries if e["realized_return_pct"] is not None]
    alphas = [e["alpha_pct"] for e in entries if e["alpha_pct"] is not None]
    wins = sum(1 for r in realized if r > 0)
    contribution = round(sum(deltas.get(e["id"], 0.0) for e in entries), 4)
    return AttribGroup(
        key=key, label=label, n=n,
        win_rate_pct=round(wins / n * 100.0, 1) if n else 0.0,
        avg_realized_pct=round(sum(realized) / len(realized), 2) if realized else None,
        avg_alpha_pct=round(sum(alphas) / len(alphas), 2) if alphas else None,
        alpha_sample=len(alphas),
        contribution_points=contribution,
        small_sample=n < SMALL_SAMPLE_GROUP,
    )


_DIMENSIONS = [
    ("regime", "By regime at entry"),
    ("setup", "By setup"),
    ("sector", "By sector"),
    ("side", "By side"),
]


def _attribution(closed: list[dict], deltas: dict[int, float], dimension: str,
                 label: str) -> Attribution:
    buckets: dict[str, tuple[str, list[dict]]] = {}
    for e in closed:
        key, disp = _key_for(e, dimension)
        buckets.setdefault(key, (disp, []))[1].append(e)
    groups = [_group(entries, deltas, key, disp) for key, (disp, entries) in buckets.items()]
    # Rank by contribution to the index (largest mover first).
    groups.sort(key=lambda g: g.contribution_points, reverse=True)
    return Attribution(dimension=dimension, label=label, groups=groups)


# ── the report ──────────────────────────────────────────────────────────────
def build_pnl(config: HermesConfig) -> PnLReport:
    from ..data.models import utcnow
    from ..journal.service import list_entries

    closed = list_entries(status="closed")
    curve, deltas = _curve_and_deltas()

    if not closed:
        return PnLReport(
            generated_at=utcnow(), status="empty",
            note=("No closed trades yet — nothing to attribute. The equity index "
                  "sits at its 100 flat start until a journaled trade resolves."),
            headline=None, curve=curve, attributions=[])

    return PnLReport(
        generated_at=utcnow(), status="ok", note="",
        headline=_headline(closed, curve), curve=curve,
        attributions=[_attribution(closed, deltas, dim, label) for dim, label in _DIMENSIONS],
    )
