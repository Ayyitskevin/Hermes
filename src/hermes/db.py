"""SQLite storage: single file, WAL mode, explicit migrations.

Migrations are numbered SQL files in src/hermes/migrations/, applied in order
and recorded in schema_migrations — so a fresh clone and a year-old install
converge on the same schema by the same visible path.
"""

from __future__ import annotations

import sqlite3
import threading
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).parent / "migrations"

_local = threading.local()
_db_path: Path | None = None


def init(data_dir: Path) -> None:
    """Create/open the database and bring the schema up to date."""
    global _db_path
    data_dir.mkdir(parents=True, exist_ok=True)
    _db_path = data_dir / "hermes.db"
    conn = connect()
    apply_migrations(conn)


def connect() -> sqlite3.Connection:
    """One connection per thread (APScheduler jobs and API handlers run on
    worker threads; sqlite3 objects must not cross threads)."""
    if _db_path is None:
        raise RuntimeError("db.init() must be called before connect()")
    conn = getattr(_local, "conn", None)
    if conn is None or getattr(_local, "path", None) != _db_path:
        conn = sqlite3.connect(_db_path)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA foreign_keys=ON")
        _local.conn = conn
        _local.path = _db_path
    return conn


def apply_migrations(conn: sqlite3.Connection) -> list[str]:
    conn.execute(
        "CREATE TABLE IF NOT EXISTS schema_migrations ("
        " name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT (datetime('now')))"
    )
    done = {r["name"] for r in conn.execute("SELECT name FROM schema_migrations")}
    applied = []
    for path in sorted(MIGRATIONS_DIR.glob("*.sql")):
        if path.name in done:
            continue
        conn.executescript(path.read_text(encoding="utf-8"))
        conn.execute("INSERT INTO schema_migrations (name) VALUES (?)", (path.name,))
        conn.commit()
        applied.append(path.name)
    return applied
