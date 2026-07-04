"""Job execution wrapper — every run leaves positive evidence.

'Silence is not evidence': a job that ran writes a job_runs row with a real
outcome; a job that never ran writes nothing, and the dashboard flags the
absence as MISSED by comparing this table against the schedule. An empty
error log proves only that nothing crashed — this table proves work happened.
"""

from __future__ import annotations

from collections.abc import Callable

from .. import db, oplog
from ..data.models import iso, utcnow


def run_job(name: str, fn: Callable[[], str], trigger: str = "schedule") -> dict:
    """Execute a job function, recording start/finish/outcome. The function
    returns a human-readable detail string; exceptions are recorded as 'fail'
    and re-raised into the scheduler's error listener — never swallowed."""
    conn = db.connect()
    started = utcnow()
    cur = conn.execute(
        "INSERT INTO job_runs (job, started_at, trigger) VALUES (?, ?, ?)",
        (name, iso(started), trigger),
    )
    run_id = cur.lastrowid
    conn.commit()

    try:
        with oplog.timed("jobs", name, trigger) as note:
            detail = fn()
            note.detail = detail or ""
    except Exception as exc:
        conn.execute(
            "UPDATE job_runs SET finished_at=?, outcome='fail', detail=? WHERE id=?",
            (iso(utcnow()), f"{type(exc).__name__}: {exc}", run_id),
        )
        conn.commit()
        raise

    conn.execute(
        "UPDATE job_runs SET finished_at=?, outcome='ok', detail=? WHERE id=?",
        (iso(utcnow()), detail or "", run_id),
    )
    conn.commit()
    return {"id": run_id, "job": name, "outcome": "ok", "detail": detail}


def last_runs(job: str, limit: int = 5) -> list[dict]:
    rows = db.connect().execute(
        "SELECT * FROM job_runs WHERE job=? ORDER BY started_at DESC LIMIT ?",
        (job, limit),
    ).fetchall()
    return [dict(r) for r in rows]
