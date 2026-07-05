"""The weekly portfolio review — Hermes' Sunday synthesis job.

Mirrors the daily check's shape exactly: gather → compose markdown → INSERT
INTO reports → return a one-line summary. It writes no order, moves no money,
and stores a `kind='weekly_review'` report row alongside a compact meta_json
(coherence counts, worst correlation pair, sector-heat leader) so the summary
and the API can read the headline numbers without re-parsing the body.

See `portfolio.review` for the synthesis itself; this module is only the
persistence + summary wrapper the scheduler and the manual-trigger API call.
"""

from __future__ import annotations

import json

from .. import db
from ..config import HermesConfig
from ..data.models import iso, utcnow
from ..portfolio.review import build_review, compose_review_md


def weekly_review(config: HermesConfig) -> str:
    review = build_review(config)
    body = compose_review_md(review)

    meta = {
        "open_count": review.open_count,
        "coherence": review.coherence_counts,
        "regime": review.regime_label.value if review.regime_label else None,
        "open_risk_pct": review.open_risk_pct,
        "worst_pair": list(review.worst_pair) if review.worst_pair else None,
        "worst_corr": review.worst_corr,
        "sector_leader": (
            {"sector": review.sector_leader[0], "pct_equity": review.sector_leader[1]}
            if review.sector_leader else None
        ),
        "stale_count": review.stale_count,
    }

    conn = db.connect()
    conn.execute(
        "INSERT INTO reports (ts, kind, body_md, meta_json) VALUES (?, ?, ?, ?)",
        (iso(utcnow()), "weekly_review", body, json.dumps(meta)),
    )
    conn.commit()

    # One-line summary — the job_runs detail string and the scheduler log.
    fighting = review.coherence_counts["fighting"]
    parts = [f"{review.open_count} open", f"{fighting} fighting regime"]
    if review.sector_leader:
        parts.append(f"hottest sector {review.sector_leader[0]} "
                     f"{review.sector_leader[1]:.0f}%")
    if review.worst_pair:
        parts.append(f"worst ρ {review.worst_pair[0]}/{review.worst_pair[1]} "
                     f"{review.worst_corr:+.2f}")
    return ", ".join(parts)


def latest_weekly_review() -> dict | None:
    r = db.connect().execute(
        "SELECT * FROM reports WHERE kind='weekly_review' ORDER BY ts DESC LIMIT 1"
    ).fetchone()
    if not r:
        return None
    out = dict(r)
    out["meta"] = json.loads(out.pop("meta_json") or "{}")
    return out
