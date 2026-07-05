"""Nightly database backup — the whole operation's state is one SQLite file.

`data/hermes.db` holds every journal entry, regime reading, risk event, and
equity-index point. A corrupted disk or a fat-fingered migration would take
all of it, so this job snapshots the database on a schedule and prunes old
snapshots to a retention bound.

The snapshot uses SQLite's online backup API (`Connection.backup`), which is
safe to run against a live WAL-mode database — no need to stop the service.
Each snapshot is a self-contained, restorable `.db` file: to restore, stop
the service and copy the chosen snapshot over `data/hermes.db`.

Like every Hermes job it runs through `runner.run_job`, so it leaves a
`job_runs` row (positive evidence) and is visible to MISSED detection — a
backup that silently stops running is exactly the failure this guards
against, so its own silence must not be evidence either.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from ..config import HermesConfig
from ..data.models import utcnow


def _backup_dir(config: HermesConfig) -> Path:
    return config.data_dir / config.backup.subdir


def _snapshot_path(directory: Path, stamp: str) -> Path:
    """A collision-proof snapshot path for the given timestamp — appends a
    counter if two snapshots land in the same second (as tests can)."""
    candidate = directory / f"hermes-{stamp}.db"
    n = 1
    while candidate.exists():
        candidate = directory / f"hermes-{stamp}-{n}.db"
        n += 1
    return candidate


def list_backups(config: HermesConfig) -> list[Path]:
    """Existing snapshots, oldest first (lexical sort works — the timestamp
    prefix is fixed-width)."""
    directory = _backup_dir(config)
    if not directory.exists():
        return []
    return sorted(directory.glob("hermes-*.db"))


def backup_db(config: HermesConfig) -> str:
    """Snapshot the live database, then prune to the retention bound. Returns
    a one-line summary for the job_runs detail + scheduler log."""
    source = config.data_dir / "hermes.db"
    if not source.exists():
        # Nothing to back up yet is a fact, not a failure — say so plainly.
        return "no database file yet — nothing to back up"

    directory = _backup_dir(config)
    directory.mkdir(parents=True, exist_ok=True)
    stamp = utcnow().strftime("%Y%m%d-%H%M%S")
    target = _snapshot_path(directory, stamp)

    # Online backup against the live WAL database — consistent without a lock.
    src = sqlite3.connect(str(source))
    try:
        dst = sqlite3.connect(str(target))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()

    # Prune oldest beyond the retention count.
    retention = max(1, config.backup.retention)
    snapshots = list_backups(config)
    pruned = 0
    if len(snapshots) > retention:
        for old in snapshots[: len(snapshots) - retention]:
            old.unlink(missing_ok=True)
            pruned += 1

    kept = len(list_backups(config))
    size_kb = target.stat().st_size / 1024
    return (f"wrote {target.name} ({size_kb:.0f} KB), pruned {pruned}, "
            f"{kept} kept (retention {retention})")


def latest_backup(config: HermesConfig) -> dict | None:
    """The most recent snapshot's name + size, or None — for the health surface."""
    snapshots = list_backups(config)
    if not snapshots:
        return None
    newest = snapshots[-1]
    return {"name": newest.name, "size_bytes": newest.stat().st_size}


def restore_check(path: Path) -> bool:
    """True if *path* is a readable SQLite database carrying Hermes' schema —
    a cheap 'is this snapshot actually restorable?' probe (used by tests and
    available for an ops sanity check). Never modifies the file."""
    try:
        conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
        try:
            names = {r[0] for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'")}
        finally:
            conn.close()
    except sqlite3.Error:
        return False
    return "journal_entries" in names and "schema_migrations" in names
