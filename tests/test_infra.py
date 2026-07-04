"""Migrations, staleness, sample determinism, scheduler MISSED logic."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from hermes import db
from hermes.data.models import utcnow
from hermes.data.sample import SampleProvider
from hermes.data.store import staleness
from hermes.jobs.scheduler import _expected_last_fire


def test_last_runs_breaks_same_second_ties_by_id(fresh_db):
    """Two runs starting within the same second: the later row (higher id)
    must win, or /api/health reports a stale outcome as the latest run."""
    from hermes.jobs.runner import last_runs

    conn = db.connect()
    ts = "2026-07-04T23:27:06Z"
    for outcome in ("fail", "ok"):
        conn.execute(
            "INSERT INTO job_runs (job, started_at, finished_at, outcome, detail, trigger)"
            " VALUES ('daily_check', ?, ?, ?, ?, 'manual')",
            (ts, ts, outcome, f"seeded {outcome}"),
        )
    conn.commit()
    runs = last_runs("daily_check", limit=2)
    assert [r["outcome"] for r in runs] == ["ok", "fail"]


def test_migrations_idempotent(fresh_db):
    conn = db.connect()
    applied_again = db.apply_migrations(conn)
    assert applied_again == []  # second pass applies nothing
    names = [r["name"] for r in conn.execute("SELECT name FROM schema_migrations")]
    assert "0001_init.sql" in names


def test_staleness_ladder():
    now = utcnow()
    assert staleness(now - timedelta(minutes=5), 30, now) == "live"
    assert staleness(now - timedelta(hours=3), 30, now) == "stale"
    assert staleness(now - timedelta(days=3), 30, now) == "dead"


def test_sample_provider_is_deterministic(config):
    a = SampleProvider(config)
    b = SampleProvider(config)
    start = utcnow() - timedelta(days=800)
    end = utcnow()
    bars_a = a.fetch_bars("SPY", "1Day", start, end)
    bars_b = b.fetch_bars("SPY", "1Day", start, end)
    assert len(bars_a) == len(bars_b) > 400
    assert [x.close for x in bars_a] == [x.close for x in bars_b]
    assert all(x.source == "sample" for x in bars_a)


def test_sample_provider_labels_unsupported_timeframe(config):
    p = SampleProvider(config)
    assert p.fetch_bars("SPY", "4Hour", utcnow() - timedelta(days=10), utcnow()) == []


def test_expected_last_fire_skips_weekends():
    # Saturday 2026-07-04 18:00 UTC → last weekday fire is Friday 07-03
    now = datetime(2026, 7, 4, 18, 0, tzinfo=UTC)
    fire = _expected_last_fire("0 8", "America/New_York", now)
    assert fire is not None
    assert fire.weekday() == 4  # Friday
    assert fire.hour == 8 and fire.minute == 0
