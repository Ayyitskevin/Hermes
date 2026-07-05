"""Nightly database backup: snapshotting, retention pruning, restorability,
and the job's positive evidence."""

from __future__ import annotations

import sqlite3
from dataclasses import replace

from hermes import db
from hermes.jobs import backup, runner


def test_backup_writes_a_restorable_snapshot(fresh_db, config):
    # Seed one journalled row so the snapshot has content to preserve.
    db.connect().execute(
        """INSERT INTO journal_entries
           (symbol, side, sector, opened_at, entry_price, stop_price,
            size_pct_equity, planned_risk_pct, thesis)
           VALUES ('AAPL','long','tech','2026-07-05T00:00:00Z',100,95,10,1,'t')""")
    db.connect().commit()

    summary = backup.backup_db(config)
    assert "wrote hermes-" in summary and "1 kept" in summary

    snaps = backup.list_backups(config)
    assert len(snaps) == 1
    # The snapshot is a valid Hermes database, and carries the seeded row.
    assert backup.restore_check(snaps[0]) is True
    ro = sqlite3.connect(f"file:{snaps[0]}?mode=ro", uri=True)
    n = ro.execute("SELECT COUNT(*) FROM journal_entries").fetchone()[0]
    ro.close()
    assert n == 1


def test_no_database_yet_is_a_fact_not_a_failure(config):
    # data_dir with no hermes.db — reported plainly, no crash, no snapshot.
    config.data_dir.mkdir(parents=True, exist_ok=True)
    assert "nothing to back up" in backup.backup_db(config)
    assert backup.list_backups(config) == []


def test_retention_prunes_oldest_first(fresh_db, config):
    cfg = replace(config, backup=replace(config.backup, retention=3))
    # Pre-seed 5 snapshots with ascending timestamps; the pruner keeps 3.
    d = cfg.data_dir / cfg.backup.subdir
    d.mkdir(parents=True, exist_ok=True)
    for stamp in ("20260101-000000", "20260102-000000", "20260103-000000",
                  "20260104-000000"):
        (d / f"hermes-{stamp}.db").write_bytes(b"old")
    summary = backup.backup_db(cfg)          # writes a 5th (newest) snapshot
    assert "3 kept" in summary
    kept = [p.name for p in backup.list_backups(cfg)]
    assert len(kept) == 3
    # The two oldest were pruned; the newest real snapshot survives.
    assert "hermes-20260101-000000.db" not in kept
    assert "hermes-20260102-000000.db" not in kept


def test_same_second_snapshots_do_not_collide(fresh_db, config):
    a = backup._snapshot_path(config.data_dir, "20260101-000000")
    a.parent.mkdir(parents=True, exist_ok=True)
    a.write_bytes(b"x")
    b = backup._snapshot_path(config.data_dir, "20260101-000000")
    assert a != b and not b.exists()         # counter-suffixed, distinct path


def test_backup_job_leaves_positive_evidence(fresh_db, config):
    result = runner.run_job("backup", lambda: backup.backup_db(config),
                            trigger="manual")
    assert result["outcome"] == "ok"
    row = db.connect().execute(
        "SELECT * FROM job_runs WHERE job='backup' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    assert row is not None and row["outcome"] == "ok"


def test_restore_check_rejects_non_databases(tmp_path):
    junk = tmp_path / "not.db"
    junk.write_bytes(b"this is not sqlite")
    assert backup.restore_check(junk) is False
