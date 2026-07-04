"""APScheduler wiring + MISSED-run detection.

Every scheduled job goes through runner.run_job so it leaves positive
evidence. job_status() then audits the evidence against the schedule: an
expected fire time with no matching job_runs row is reported as MISSED —
the difference between "nothing failed" and "nothing ran" made visible.
"""

from __future__ import annotations

import zoneinfo
from datetime import datetime, timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from ..config import HermesConfig
from ..data.models import utcnow
from ..data.provider import MarketDataProvider
from ..journal.service import list_entries, stale_open_entries
from . import daily_check, runner, sync

MISSED_TOLERANCE = timedelta(minutes=30)


def _parse_min_hour(spec: str) -> tuple[int, int]:
    minute, hour = spec.split()
    return int(minute), int(hour)


def job_definitions(config: HermesConfig, provider: MarketDataProvider) -> dict:
    """name -> (schedule spec, callable). One registry powers both the
    scheduler and the manual-trigger API."""
    return {
        "daily_check": (
            config.schedule.premarket_check,
            lambda: daily_check.daily_check(config, provider),
        ),
        "eod_sync": (
            config.schedule.eod_sync,
            lambda: sync.sync_bars(config, provider),
        ),
        "journal_resolve": (
            config.schedule.journal_resolve,
            lambda: _journal_resolve_nudge(config),
        ),
    }


def _journal_resolve_nudge(config: HermesConfig) -> str:
    """Journal closes need a human (exit price + thesis verdict), so this job
    doesn't close anything — it counts what awaits resolution and surfaces it."""
    stale = stale_open_entries(config)
    open_count = len(list_entries(status="open"))
    return f"{open_count} open entries, {len(stale)} past the staleness window"


def start(config: HermesConfig, provider: MarketDataProvider) -> BackgroundScheduler:
    tz = zoneinfo.ZoneInfo(config.schedule.timezone)
    scheduler = BackgroundScheduler(timezone=tz)
    for name, (spec, fn) in job_definitions(config, provider).items():
        minute, hour = _parse_min_hour(spec)
        scheduler.add_job(
            lambda name=name, fn=fn: runner.run_job(name, fn, trigger="schedule"),
            CronTrigger(minute=minute, hour=hour, day_of_week="mon-fri", timezone=tz),
            id=name,
            name=name,
            misfire_grace_time=3600,
            coalesce=True,
        )
    scheduler.start()
    return scheduler


def _expected_last_fire(spec: str, tz_name: str, now: datetime) -> datetime | None:
    """Most recent weekday fire time at or before now, per 'MIN HOUR' spec."""
    tz = zoneinfo.ZoneInfo(tz_name)
    minute, hour = _parse_min_hour(spec)
    local = now.astimezone(tz)
    candidate = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    for _ in range(8):
        if candidate <= local and candidate.weekday() < 5:
            return candidate
        candidate -= timedelta(days=1)
        candidate = candidate.replace(hour=hour, minute=minute)
    return None


def job_status(config: HermesConfig, provider: MarketDataProvider) -> list[dict]:
    now = utcnow()
    out = []
    for name, (spec, _fn) in job_definitions(config, provider).items():
        runs = runner.last_runs(name, limit=3)
        last = runs[0] if runs else None
        expected = _expected_last_fire(spec, config.schedule.timezone, now)
        missed = False
        if expected is not None and now >= (expected + MISSED_TOLERANCE):
            from ..data.models import parse_iso
            ran_since = last is not None and parse_iso(last["started_at"]) >= (
                expected - timedelta(minutes=5))
            missed = not ran_since
        out.append({
            "job": name,
            "schedule": f"{spec} {config.schedule.timezone} (Mon–Fri)",
            "last_run": last,
            "recent_runs": runs,
            "expected_last_fire": expected.isoformat() if expected else None,
            "missed": missed,
        })
    return out
