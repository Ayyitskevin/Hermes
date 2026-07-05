"""Migrations, staleness, sample determinism, scheduler MISSED logic."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from hermes import db
from hermes.data.models import utcnow
from hermes.data.sample import SampleProvider
from hermes.data.store import staleness
from hermes.jobs.scheduler import _dow_set, _expected_last_fire, _parse_spec


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


def test_parse_spec_two_and_three_field():
    # 2-field spec keeps defaulting to Mon–Fri (existing jobs unchanged).
    assert _parse_spec("0 8") == (0, 8, "mon-fri")
    assert _parse_spec("30 16") == (30, 16, "mon-fri")
    # 3-field spec carries an explicit day-of-week string.
    assert _parse_spec("0 18 sun") == (0, 18, "sun")
    assert _parse_spec("15 9 mon,wed,fri") == (15, 9, "mon,wed,fri")


def test_dow_set_mapping():
    # weekday() numbering: Mon=0 … Sun=6.
    assert _dow_set("mon-fri") == {0, 1, 2, 3, 4}
    assert _dow_set("sun") == {6}
    assert _dow_set("mon,wed,fri") == {0, 2, 4}
    assert _dow_set("sat-sun") == {5, 6}
    assert _dow_set("fri-mon") == {4, 5, 6, 0}  # wrap-around


def test_daily_jobs_missed_detection_unchanged_regression():
    """The scheduler generalization must not shift any existing daily job's
    expected fire. Every 2-field spec still lands on a weekday, never a weekend,
    exactly as before the optional DOW field existed."""
    tz = "America/New_York"
    for spec, hour, minute in (("0 8", 8, 0), ("30 16", 16, 30), ("0 17", 17, 0)):
        # From a Saturday, the most recent fire is the prior Friday.
        sat = datetime(2026, 7, 4, 23, 0, tzinfo=UTC)
        fire = _expected_last_fire(spec, tz, sat)
        assert fire is not None and fire.weekday() == 4
        assert fire.hour == hour and fire.minute == minute
        # From a Sunday, likewise the prior Friday (weekend is skipped).
        sun = datetime(2026, 7, 5, 23, 0, tzinfo=UTC)
        assert _expected_last_fire(spec, tz, sun).weekday() == 4
        # From a mid-week Wednesday afternoon, the same day's fire (if past).
        wed = datetime(2026, 7, 8, 23, 0, tzinfo=UTC)
        assert _expected_last_fire(spec, tz, wed).weekday() == 2


def test_weekly_expected_last_fire_is_most_recent_sunday():
    # Wednesday 2026-07-08 → the most recent "0 18 sun" fire is Sunday 07-05.
    now = datetime(2026, 7, 8, 23, 0, tzinfo=UTC)
    fire = _expected_last_fire("0 18 sun", "America/New_York", now)
    assert fire is not None
    assert fire.weekday() == 6           # Sunday
    assert fire.date().isoformat() == "2026-07-05"
    assert fire.hour == 18 and fire.minute == 0
