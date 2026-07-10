"""Campaign status plate — UNSIGNED until the owner signs.

Does not invent edge. Holds the formal state of the Phase 4 validation story
so the desk cannot outrun an unsigned campaign.
"""

from __future__ import annotations

from .. import db
from ..data.models import iso, utcnow

VALID = frozenset({"UNSIGNED", "CONDITIONAL", "SIGNED", "REJECTED"})


def get_status() -> dict:
    row = db.connect().execute(
        "SELECT * FROM campaign_status WHERE id=1"
    ).fetchone()
    if not row:
        return {
            "status": "UNSIGNED",
            "verdict": "No campaign row — treat as UNSIGNED.",
            "evidence": None,
            "updated_at": None,
            "updated_by": None,
        }
    return dict(row)


def set_status(
    status: str,
    *,
    verdict: str | None = None,
    evidence: str | None = None,
    updated_by: str = "operator",
) -> dict:
    status = (status or "").upper()
    if status not in VALID:
        raise ValueError(f"status must be one of {sorted(VALID)}")
    conn = db.connect()
    conn.execute(
        """INSERT INTO campaign_status (id, status, verdict, evidence, updated_at, updated_by)
           VALUES (1, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET
             status=excluded.status,
             verdict=excluded.verdict,
             evidence=excluded.evidence,
             updated_at=excluded.updated_at,
             updated_by=excluded.updated_by""",
        (
            status,
            (verdict or "").strip() or None,
            (evidence or "").strip() or None,
            iso(utcnow()),
            updated_by,
        ),
    )
    conn.commit()
    return get_status()


HONESTY = {
    "claim": (
        "Tracks whether the Phase 4 validation campaign has been formally signed "
        "by the owner — not whether any backtest number looks good today."
    ),
    "caveat": (
        "UNSIGNED means do not treat CONDITIONAL-EDGE draft language as settled. "
        "Only the owner flips status after Strategy Tester cross-check / external review."
    ),
}
