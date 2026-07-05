"""Weekly portfolio review — the Sunday synthesis layer.

Not a new measurement: a scheduled RE-READING of things Hermes already
computes daily, framed for a once-a-week "what should I look at again?"
decision. It braids four existing threads into one stored markdown report:

  1. Regime coherence — for every open position, does it still fit the
     single benchmark-wide regime reading? A long is COHERENT in a bull
     trend and FIGHTING when the tape is bear/chop/stress (a short inverts).
     This is the "which open positions now fight the regime" list.
  2. Sector heat — exposure aggregated by sector across open positions, the
     same aggregation the risk engine's sector check runs (% of equity only;
     untagged positions surface as 'unspecified' and are flagged).
  3. Correlation matrix — the FULL pairwise correlation of open-position
     daily returns, not just the worst pair. Insufficient history is shown
     as missing (∅), never as zero.
  4. Journal-informed exposure — open count, total open risk, the journal's
     own performance summary (which labels small samples as anecdotes), and
     the count of stale open theses that are overdue for a challenge.

Everything is % of account equity; Hermes never sees a dollar figure. Every
number carries its source/as-of where one applies. The review recommends a
REVIEW focus for the week — never a trade. No order path exists in Hermes.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from ..config import HermesConfig
from ..data.models import utcnow
from ..journal.service import performance_summary, stale_open_entries
from ..regime.engine import latest_reading
from ..regime.indicators import correlation
from ..regime.models import RegimeLabel
from ..risk.engine import _position_returns, open_positions

# Coherence tags — a long fits a bull; a short fits a bear/stress; chop fits
# neither directional book. Missing reading is never guessed at.
COHERENT = "coherent"
FIGHTING = "fighting"
UNKNOWN = "unknown"

_LONG_FAVORABLE = {RegimeLabel.BULL_TREND}
_SHORT_FAVORABLE = {RegimeLabel.BEAR_TREND, RegimeLabel.STRESS}

UNTAGGED = "unspecified"

CLAIM = (
    "A weekly synthesis of Hermes' existing risk checks and regime read into a "
    "single review focus: which open positions now fight the regime, where "
    "sector and correlation exposure is concentrated, and which theses are "
    "overdue for a challenge — everything as a percentage of equity."
)

METHODOLOGY = (
    "A re-composition of already-computed layers, not a new measurement: the "
    "fixed-fractional open-risk and sector-heat aggregations from the risk "
    "engine (Van Tharp / Ralph Vince position-sizing lineage), Pearson "
    "correlation of daily returns between open positions, and regime coherence "
    "in the Weinstein (1988) stage sense — a long is with the tape in a bull "
    "trend and against it otherwise. The journal contributes its own "
    "self-graded performance summary."
)

CAVEAT = (
    "This recommends where to focus a REVIEW, never a trade — no order path "
    "exists in this codebase. It is a weekly snapshot: on a Sunday cadence the "
    "underlying data can be up to a week stale between runs. Coherence is judged "
    "against a single benchmark-wide regime reading, not a per-symbol regime; "
    "correlations are backward-looking over a fixed lookback and say who HAS "
    "moved together, not who will. Small journal samples are anecdotes, and the "
    "summary says so."
)


@dataclass(frozen=True)
class PositionCoherence:
    symbol: str
    side: str
    size_pct_equity: float
    sector: str
    coherence: str              # 'coherent' | 'fighting' | 'unknown'


@dataclass(frozen=True)
class SectorHeat:
    sector: str
    pct_equity: float
    over_limit: bool            # exposure exceeds max_sector_exposure_pct
    untagged: bool              # sector tag is missing ('unspecified')


@dataclass(frozen=True)
class WeeklyReview:
    ts: datetime
    # Regime + its provenance
    regime_label: RegimeLabel | None
    regime_display: str
    regime_asof: datetime | None
    regime_version: str | None
    # Coherence
    positions: list[PositionCoherence]
    coherence_counts: dict[str, int]        # coherent / fighting / unknown
    # Sector heat
    sector_heat: list[SectorHeat]
    sector_leader: tuple[str, float] | None  # hottest TAGGED sector, % equity
    untagged_pct: float
    max_sector_pct: float
    # Correlation matrix
    corr_symbols: list[str]
    corr_matrix: list[list[float | None]]    # NxN; diagonal 1.0; None = missing
    corr_flags: list[tuple[str, str, float]]  # pairs with |ρ| >= threshold
    corr_lookback_days: int
    corr_warn_threshold: float
    worst_pair: tuple[str, str] | None
    worst_corr: float | None
    # Journal-informed exposure
    open_count: int
    open_risk_pct: float
    performance: dict
    stale_count: int
    # Honesty block
    claim: str = CLAIM
    methodology: str = METHODOLOGY
    caveat: str = CAVEAT


def _coherence(side: str, label: RegimeLabel | None) -> str:
    """A position's fit against the single benchmark-wide regime reading.
    None reading → UNKNOWN (missing stays missing, never guessed)."""
    if label is None:
        return UNKNOWN
    favorable = _LONG_FAVORABLE if side == "long" else _SHORT_FAVORABLE
    return COHERENT if label in favorable else FIGHTING


def build_review(config: HermesConfig) -> WeeklyReview:
    """Synthesize the weekly review from the current book, the latest persisted
    regime reading, and cached bars. Reads only — persistence is the job's."""
    r = config.risk
    reading = latest_reading()
    label = reading.label if reading else None
    positions = open_positions()

    # 1 — Regime coherence, per position + a count summary.
    pos_coherence = [
        PositionCoherence(
            symbol=p["symbol"], side=p["side"],
            size_pct_equity=p["size_pct_equity"] or 0.0,
            sector=p["sector"] or UNTAGGED,
            coherence=_coherence(p["side"], label),
        )
        for p in positions
    ]
    counts = {COHERENT: 0, FIGHTING: 0, UNKNOWN: 0}
    for pc in pos_coherence:
        counts[pc.coherence] += 1

    # 2 — Sector heat (same aggregation as risk engine check #3).
    by_sector: dict[str, float] = {}
    for p in positions:
        sector = p["sector"] or UNTAGGED
        by_sector[sector] = by_sector.get(sector, 0.0) + (p["size_pct_equity"] or 0.0)
    sector_heat = [
        SectorHeat(
            sector=sector, pct_equity=round(pct, 2),
            over_limit=(sector != UNTAGGED and pct > r.max_sector_exposure_pct),
            untagged=(sector == UNTAGGED),
        )
        for sector, pct in sorted(by_sector.items(), key=lambda kv: kv[1], reverse=True)
    ]
    tagged = [(s, pct) for s, pct in by_sector.items() if s != UNTAGGED]
    sector_leader = max(tagged, key=lambda kv: kv[1], default=None)
    if sector_leader is not None:
        sector_leader = (sector_leader[0], round(sector_leader[1], 2))
    untagged_pct = round(by_sector.get(UNTAGGED, 0.0), 2)

    # 3 — Full pairwise correlation matrix over open-position symbols.
    symbols = sorted({p["symbol"] for p in positions})
    rets = {s: _position_returns(s, r.correlation_lookback_days) for s in symbols}
    matrix: list[list[float | None]] = []
    flags: list[tuple[str, str, float]] = []
    worst_pair: tuple[str, str] | None = None
    worst_corr: float | None = None
    for i, a in enumerate(symbols):
        row: list[float | None] = []
        for j, b in enumerate(symbols):
            if i == j:
                row.append(1.0)          # identity, not a data-derived claim
                continue
            c = correlation(rets[a], rets[b])
            row.append(round(c, 2) if c is not None else None)
            if c is not None and j > i:
                if abs(c) >= r.correlation_warn_threshold:
                    flags.append((a, b, round(c, 2)))
                if worst_corr is None or abs(c) > abs(worst_corr):
                    worst_pair, worst_corr = (a, b), round(c, 2)
        matrix.append(row)

    # 4 — Journal-informed exposure summary.
    open_risk = sum(p["planned_risk_pct"] or 0.0 for p in positions)
    stale_count = len(stale_open_entries(config))

    return WeeklyReview(
        ts=utcnow(),
        regime_label=label,
        regime_display=reading.label.display if reading else "no reading yet",
        regime_asof=reading.data_asof if reading else None,
        regime_version=reading.classifier_version if reading else None,
        positions=pos_coherence,
        coherence_counts=counts,
        sector_heat=sector_heat,
        sector_leader=sector_leader,
        untagged_pct=untagged_pct,
        max_sector_pct=r.max_sector_exposure_pct,
        corr_symbols=symbols,
        corr_matrix=matrix,
        corr_flags=flags,
        corr_lookback_days=r.correlation_lookback_days,
        corr_warn_threshold=r.correlation_warn_threshold,
        worst_pair=worst_pair,
        worst_corr=worst_corr,
        open_count=len(positions),
        open_risk_pct=round(open_risk, 2),
        performance=performance_summary(),
        stale_count=stale_count,
    )


_COHERENCE_FLAG = {COHERENT: "·", FIGHTING: "■", UNKNOWN: "▲"}


def _fmt_corr(c: float | None) -> str:
    return "∅" if c is None else f"{c:+.2f}"


def compose_review_md(review: WeeklyReview) -> str:
    """Render the review as markdown, mirroring the daily check's report style:
    sections, flag glyphs, every number labeled with its unit and provenance."""
    lines: list[str] = []
    now = review.ts
    lines.append(f"# Weekly portfolio review — {now.strftime('%Y-%m-%d')}")
    lines.append("")
    lines.append("*Decision support only — this recommends where to focus a REVIEW "
                 "this week, never a trade. No order path exists in Hermes.*")
    lines.append("")

    # ── Regime coherence ────────────────────────────────────────────────
    lines.append("## Regime coherence")
    if review.regime_label is None:
        lines.append("No regime reading persisted yet — coherence is UNKNOWN for "
                     "every open position. Run the daily check to classify a regime.")
    else:
        asof = review.regime_asof.strftime("%Y-%m-%d") if review.regime_asof else "unknown"
        lines.append(f"Regime reads **{review.regime_display}** "
                     f"(classifier {review.regime_version} · data as of {asof}). "
                     "Judged against the single benchmark-wide reading:")
    c = review.coherence_counts
    lines.append(f"- {c[COHERENT]} coherent · {c[FIGHTING]} fighting · "
                 f"{c[UNKNOWN]} unknown, across {review.open_count} open")
    if review.positions:
        lines.append("")
        lines.append("| Symbol | Side | Size (% equity) | Sector | Coherence |")
        lines.append("|---|---|---|---|---|")
        for p in review.positions:
            flag = _COHERENCE_FLAG[p.coherence]
            lines.append(f"| {p.symbol} | {p.side} | {p.size_pct_equity:.1f}% | "
                         f"{p.sector} | {flag} {p.coherence} |")
    else:
        lines.append("- No open positions — nothing to grade against the regime.")
    lines.append("")

    # ── Sector heat ─────────────────────────────────────────────────────
    lines.append("## Sector heat")
    lines.append(f"Exposure aggregated by sector across open positions "
                 f"(% of equity; limit {review.max_sector_pct:.1f}% per sector):")
    tagged_rows = [s for s in review.sector_heat if not s.untagged]
    if tagged_rows:
        for s in tagged_rows:
            warn = s.pct_equity > 0.8 * review.max_sector_pct
            flag = "■" if s.over_limit else ("▲" if warn else "·")
            note = " — over the per-sector limit" if s.over_limit else ""
            lines.append(f"- {flag} **{s.sector}** = {s.pct_equity:.1f}% of equity{note}")
    else:
        lines.append("- No sector-tagged open positions.")
    if review.untagged_pct > 0:
        lines.append(f"- ▲ {review.untagged_pct:.1f}% of equity has **no sector tag** — "
                     "untagged positions can hide sector concentration; tag them.")
    lines.append("")

    # ── Correlation matrix ──────────────────────────────────────────────
    lines.append("## Position correlation")
    if len(review.corr_symbols) < 2:
        lines.append("- Fewer than two open positions — no pairwise correlation to compute.")
    else:
        lines.append(f"Full pairwise Pearson correlation of daily returns over the last "
                     f"{review.corr_lookback_days} sessions. Missing history shows as ∅, "
                     "never as 0.")
        lines.append("")
        header = "|  | " + " | ".join(review.corr_symbols) + " |"
        lines.append(header)
        lines.append("|---|" + "---|" * len(review.corr_symbols))
        for i, sym in enumerate(review.corr_symbols):
            cells = " | ".join(_fmt_corr(v) for v in review.corr_matrix[i])
            lines.append(f"| **{sym}** | {cells} |")
        lines.append("")
        if review.corr_flags:
            lines.append(f"Flagged pairs (|ρ| ≥ {review.corr_warn_threshold:.2f} — "
                         "correlated positions are one position wearing two tickers):")
            for a, b, corr in review.corr_flags:
                lines.append(f"- ■ {a} / {b} = {corr:+.2f}")
        else:
            lines.append(f"- · No pair at or above |ρ| {review.corr_warn_threshold:.2f}.")
    lines.append("")

    # ── Journal-informed exposure ───────────────────────────────────────
    lines.append("## Journal-informed exposure")
    lines.append(f"- Open positions: {review.open_count}")
    lines.append(f"- Total open risk: {review.open_risk_pct:.2f}% of equity "
                 "(Σ planned stop-losses across the book)")
    lines.append(f"- Theses to challenge (open past the staleness window): {review.stale_count}")
    perf = review.performance
    if perf.get("closed_trades", 0) == 0:
        lines.append(f"- Performance: {perf.get('note', 'no closed trades yet')}")
    else:
        line = (f"- Performance: win rate {perf['win_rate_pct']:.1f}%, "
                f"thesis hit rate {perf['thesis_hit_rate_pct']:.1f}% over "
                f"{perf['closed_trades']} closed trades")
        if perf.get("avg_alpha_pct") is not None:
            line += f", avg alpha {perf['avg_alpha_pct']:+.2f}% (n={perf['alpha_sample']})"
        if perf.get("note"):
            line += f" — {perf['note']}"
        lines.append(line)
    lines.append("")

    # ── Honesty block ───────────────────────────────────────────────────
    lines.append(f"> **Claim.** {review.claim}")
    lines.append(">")
    lines.append(f"> **Methodology.** {review.methodology}")
    lines.append(">")
    lines.append(f"> **Caveat.** {review.caveat}")
    return "\n".join(lines)
