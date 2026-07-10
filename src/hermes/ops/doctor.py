"""Hermes doctor — positive-evidence health + master-plan gate progress.

Habit gates (P2/P3) are the owner's to close; this surface only measures and
labels them so the desk cannot pretend they are done.
"""

from __future__ import annotations

from pathlib import Path

from .. import __version__, db
from ..ai.ollama import OllamaClient
from ..ai.router import AIRouter
from ..config import HermesConfig
from ..data.provider import MarketDataProvider
from ..jobs import backup, scheduler
from ..journal import service as journal
from ..parity import ritual as parity


def run_doctor(config: HermesConfig, provider: MarketDataProvider) -> dict:
    conn = db.connect()
    bars = conn.execute("SELECT COUNT(*) AS n FROM bars").fetchone()["n"]
    readings = conn.execute("SELECT COUNT(*) AS n FROM regime_readings").fetchone()["n"]
    closed = journal.performance_summary().get("closed_trades", 0)
    open_n = len(journal.list_entries(status="open"))
    parity_sum = parity.summary()
    jobs = scheduler.job_status(config, provider)
    missed = [j for j in jobs if j.get("missed")]
    latest_bak = backup.latest_backup(config)
    ollama_ok = OllamaClient(config).available()
    ai = AIRouter(config).status()

    # DB write probe
    writable = True
    try:
        conn.execute("CREATE TABLE IF NOT EXISTS _doctor_probe (x INTEGER)")
        conn.execute("INSERT INTO _doctor_probe (x) VALUES (1)")
        conn.execute("DELETE FROM _doctor_probe")
        conn.commit()
    except Exception:
        writable = False

    gates = {
        "P1_one_brain": {
            "status": parity_sum["p1_status"],
            "detail": parity_sum["p1_note"],
            "consecutive_matches": parity_sum["consecutive_matches"],
            "gate": parity_sum["p1_gate"],
        },
        "P2_deploy": {
            "status": "OPEN",  # habit: 10 days zero MISSED — measured live
            "detail": (
                f"{len(missed)} job(s) currently MISSED; "
                "gate is 10 trading days zero MISSED + zero manual restarts"
            ),
            "missed_now": [j.get("name") or j.get("job") for j in missed],
        },
        "P3_journal_habit": {
            "status": "PASS" if closed >= 20 else "OPEN",
            "detail": f"{closed}/20 closed fully-resolved journal entries",
            "closed_resolved": closed,
            "gate": 20,
        },
        "P4_campaign": _campaign_gate(),
    }

    return {
        "hermes_version": __version__,
        "config_path": str(config.config_path) if config.config_path else None,
        "data_dir": str(config.data_dir),
        "db": {
            "path": str(config.data_dir / "hermes.db"),
            "writable": writable,
            "bars": bars,
            "regime_readings": readings,
        },
        "provider": {"name": provider.name, "state": provider.state().value},
        "ai": {
            "ollama_reachable": ollama_ok,
            "ollama_url": config.ai.ollama_url,
            "allow_cloud": config.ai.allow_cloud,
            "router": ai,
        },
        "classifier": config.regime.classifier,
        "journal": {"open": open_n, "closed_resolved": closed},
        "backup": latest_bak,
        "jobs": jobs,
        "gates": gates,
        "ok": writable and provider.state().value != "error",
    }


def _campaign_gate() -> dict:
    from ..campaign import status as camp

    try:
        s = camp.get_status()
    except Exception as exc:
        return {"status": "OPEN", "detail": f"campaign status unavailable: {exc}"}
    st = s.get("status", "UNSIGNED")
    return {
        "status": "PASS" if st in ("SIGNED", "CONDITIONAL") else "OPEN",
        "detail": f"campaign {st}: {s.get('verdict') or ''}",
        "campaign_status": st,
    }


def format_doctor_text(report: dict) -> str:
    lines = [
        f"hermes v{report['hermes_version']}",
        f"config: {report['config_path'] or '(defaults — no hermes.toml found)'}",
        f"db: {report['db']['path']} "
        f"({report['db']['bars']} bars, writable={report['db']['writable']})",
        f"provider: {report['provider']['name']} state={report['provider']['state']}",
        f"ollama: {'reachable' if report['ai']['ollama_reachable'] else 'UNREACHABLE'} "
        f"at {report['ai']['ollama_url']}",
        f"cloud: allow_cloud={report['ai']['allow_cloud']}",
        f"classifier: {report['classifier']}",
        f"journal: {report['journal']['closed_resolved']} closed · "
        f"{report['journal']['open']} open",
        f"backup: {report['backup']['name'] if report['backup'] else '∅ none yet'}",
        "gates:",
    ]
    for name, g in report["gates"].items():
        lines.append(f"  · {name}: {g['status']} — {g['detail']}")
    return "\n".join(lines)


def restore_drill(config: HermesConfig, snapshot: Path | None = None) -> dict:
    """Verify a backup is restorable WITHOUT overwriting the live DB.

    Opens the snapshot read-only, checks schema + row counts, reports what a
    real restore would replace. Never mutates live state (R14).
    """
    snaps = backup.list_backups(config)
    if snapshot is None:
        if not snaps:
            return {"ok": False, "error": "no backups available"}
        snapshot = snaps[-1]
    snapshot = Path(snapshot)
    if not snapshot.exists():
        return {"ok": False, "error": f"snapshot not found: {snapshot}"}
    if not backup.restore_check(snapshot):
        return {"ok": False, "error": f"not a restorable Hermes DB: {snapshot.name}"}

    import sqlite3

    ro = sqlite3.connect(f"file:{snapshot}?mode=ro", uri=True)
    ro.row_factory = sqlite3.Row
    try:
        tables = {
            r[0]
            for r in ro.execute("SELECT name FROM sqlite_master WHERE type='table'")
        }
        counts = {}
        for t in ("journal_entries", "regime_readings", "bars", "equity_index", "job_runs"):
            if t in tables:
                counts[t] = ro.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0]
    finally:
        ro.close()

    return {
        "ok": True,
        "snapshot": snapshot.name,
        "size_bytes": snapshot.stat().st_size,
        "tables": sorted(tables),
        "counts": counts,
        "live_db": str(config.data_dir / "hermes.db"),
        "restore_instructions": (
            "To restore for real: systemctl stop hermes; "
            f"cp {snapshot} {config.data_dir / 'hermes.db'}; "
            "systemctl start hermes. This drill did NOT copy anything."
        ),
    }
