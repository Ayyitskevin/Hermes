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
from . import daily_check, runner, sync, weekly_review

MISSED_TOLERANCE = timedelta(minutes=30)

# Python's date.weekday() numbering (Mon=0 … Sun=6), so the MISSED-detection
# day-of-week set lines up with the CronTrigger's own day_of_week grammar.
_DOW_NUM = {"mon": 0, "tue": 1, "wed": 2, "thu": 3, "fri": 4, "sat": 5, "sun": 6}


def _parse_spec(spec: str) -> tuple[int, int, str]:
    """Schedule grammar: 'MIN HOUR' (defaults to Mon–Fri, preserving every
    existing job's behavior byte-for-byte) or 'MIN HOUR DOW', where DOW is an
    APScheduler day_of_week string ('sun', 'mon-fri', 'mon,wed,fri')."""
    parts = spec.split()
    if len(parts) == 2:
        minute, hour = parts
        dow = "mon-fri"
    elif len(parts) == 3:
        minute, hour, dow = parts
    else:
        raise ValueError(f"schedule spec must be 'MIN HOUR' or 'MIN HOUR DOW', got {spec!r}")
    return int(minute), int(hour), dow


def _dow_set(dow_str: str) -> set[int]:
    """Expand an APScheduler day_of_week string into a set of weekday() ints
    (Mon=0 … Sun=6). Handles single days, hyphen ranges (incl. wrap-around like
    'fri-mon'), and comma lists — the same forms _parse_spec accepts."""
    out: set[int] = set()
    for token in dow_str.split(","):
        token = token.strip().lower()
        if "-" in token:
            start, end = (t.strip() for t in token.split("-", 1))
            s, e = _DOW_NUM[start], _DOW_NUM[end]
            out.update(range(s, e + 1) if s <= e else [*range(s, 7), *range(0, e + 1)])
        else:
            out.add(_DOW_NUM[token])
    return out


def _dow_label(dow: str) -> str:
    """Human label for the schedule column, e.g. 'mon-fri' → 'Mon–Fri',
    'sun' → 'Sun'. Preserves the existing 'Mon–Fri' rendering exactly."""
    return dow.replace("-", "–").title()


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
        "weekly_review": (
            config.schedule.weekly_review,
            lambda: weekly_review.weekly_review(config),
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
        minute, hour, dow = _parse_spec(spec)
        scheduler.add_job(
            lambda name=name, fn=fn: runner.run_job(name, fn, trigger="schedule"),
            CronTrigger(minute=minute, hour=hour, day_of_week=dow, timezone=tz),
            id=name,
            name=name,
            misfire_grace_time=3600,
            coalesce=True,
        )
    scheduler.start()
    return scheduler


def _expected_last_fire(spec: str, tz_name: str, now: datetime) -> datetime | None:
    """Most recent fire time at or before now whose weekday is in the spec's
    day-of-week set. A 2-field 'MIN HOUR' spec defaults to Mon–Fri, so the
    existing daily jobs' MISSED detection is unchanged; a 'MIN HOUR sun' spec
    lands on the most recent Sunday. Scans a full week back (8 candidates)."""
    tz = zoneinfo.ZoneInfo(tz_name)
    minute, hour, dow = _parse_spec(spec)
    allowed = _dow_set(dow)
    local = now.astimezone(tz)
    candidate = local.replace(hour=hour, minute=minute, second=0, microsecond=0)
    for _ in range(8):
        if candidate <= local and candidate.weekday() in allowed:
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
        _, _, dow = _parse_spec(spec)
        out.append({
            "job": name,
            "schedule": f"{spec} {config.schedule.timezone} ({_dow_label(dow)})",
            "last_run": last,
            "recent_runs": runs,
            "expected_last_fire": expected.isoformat() if expected else None,
            "missed": missed,
        })
    return out
