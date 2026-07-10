"""Chart ↔ dashboard regime parity ritual.

Records the owner's TradingView (chart) regime label alongside Hermes' live
reading so the P1 one-brain gate is measurable: consecutive session matches.
Missing Hermes readings stay missing — never faked into a match.
"""

from __future__ import annotations

from .. import db
from ..data.models import iso, utcnow
from ..regime.engine import latest_reading
from ..regime.models import RegimeLabel

# Labels accepted from the chart (map common aliases → RegimeLabel values).
_LABEL_ALIASES = {
    "bull": "bull_trend",
    "bull_trend": "bull_trend",
    "bullish": "bull_trend",
    "range": "chop",
    "chop": "chop",
    "rangebound": "chop",
    "sideways": "chop",
    "bear": "bear_trend",
    "bear_trend": "bear_trend",
    "bearish": "bear_trend",
    "stress": "stress",
    "crisis": "stress",
}


def normalize_label(raw: str) -> str:
    key = (raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    if key not in _LABEL_ALIASES:
        raise ValueError(
            f"Unknown regime label {raw!r}. Use bull_trend / chop / bear_trend / stress "
            "(aliases: bull, range, bear, stress)."
        )
    return _LABEL_ALIASES[key]


def record_check(
    *,
    session_date: str,
    chart_label: str,
    symbol: str = "",
    notes: str | None = None,
) -> dict:
    """Record one parity observation for a session date (YYYY-MM-DD)."""
    chart = normalize_label(chart_label)
    reading = latest_reading()
    hermes = reading.label.value if reading else None
    match: int | None
    if hermes is None:
        match = None
    else:
        match = 1 if hermes == chart else 0

    conn = db.connect()
    cur = conn.execute(
        """INSERT INTO parity_checks
           (session_date, symbol, chart_label, hermes_label, match, notes,
            recorded_at, classifier_version)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            session_date,
            (symbol or "").upper(),
            chart,
            hermes,
            match,
            (notes or "").strip() or None,
            iso(utcnow()),
            reading.classifier_version if reading else None,
        ),
    )
    conn.commit()
    return {
        "id": int(cur.lastrowid),
        "session_date": session_date,
        "symbol": (symbol or "").upper(),
        "chart_label": chart,
        "hermes_label": hermes,
        "match": match,
        "notes": notes,
        "classifier_version": reading.classifier_version if reading else None,
        "display": {
            "chart": (
                RegimeLabel(chart).display
                if chart in RegimeLabel._value2member_map_
                else chart
            ),
            "hermes": reading.label.display if reading else "∅ missing",
        },
    }


def summary(limit_sessions: int = 30) -> dict:
    """Aggregate recent sessions for the P1 gate (10 consecutive matches)."""
    conn = db.connect()
    rows = conn.execute(
        """SELECT * FROM parity_checks ORDER BY session_date DESC, recorded_at DESC
           LIMIT 500"""
    ).fetchall()
    by_session: dict[str, list[dict]] = {}
    for r in rows:
        d = dict(r)
        by_session.setdefault(d["session_date"], []).append(d)

    sessions = []
    for date in sorted(by_session.keys(), reverse=True)[:limit_sessions]:
        checks = by_session[date]
        # Session match = all checks that day matched (and none missing).
        vals = [c["match"] for c in checks]
        if any(v is None for v in vals):
            session_match = None
        else:
            session_match = 1 if all(v == 1 for v in vals) else 0
        sessions.append({
            "session_date": date,
            "match": session_match,
            "checks": checks,
            "n_checks": len(checks),
        })

    # Consecutive match streak from the most recent fully-matched session.
    streak = 0
    for s in sessions:
        if s["match"] == 1:
            streak += 1
        elif s["match"] is None:
            continue  # incomplete day does not break or count
        else:
            break

    comparable = [s for s in sessions if s["match"] is not None]
    matches = sum(1 for s in comparable if s["match"] == 1)
    gate = 10
    return {
        "sessions": sessions,
        "comparable_sessions": len(comparable),
        "match_rate_pct": round(matches / len(comparable) * 100.0, 1) if comparable else None,
        "consecutive_matches": streak,
        "p1_gate": gate,
        "p1_status": "PASS" if streak >= gate else "OPEN",
        "p1_note": (
            f"{streak}/{gate} consecutive matching sessions"
            if streak < gate
            else f"P1 gate met: {streak} consecutive matching sessions"
        ),
        "claim": (
            "Measures whether the chart (TradingView AIO regime) and Hermes "
            "(v62) report the same regime label on the same session."
        ),
        "caveat": (
            "A match is label equality only — not proof of edge. Missing Hermes "
            "readings stay missing. The operator is the chart source of truth."
        ),
    }
