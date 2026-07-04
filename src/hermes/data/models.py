"""Market data types. Every value carries its source and as-of timestamp —
a number without provenance does not exist in Hermes."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from enum import Enum


class ProviderState(str, Enum):
    """Provider health, surfaced verbatim on the dashboard. Degradation is
    always visible: rate-limited and stale states are first-class, never
    quietly mapped to 'fine'."""

    OK = "ok"
    RATE_LIMITED = "rate_limited"
    AUTH_ERROR = "auth_error"
    UNREACHABLE = "unreachable"
    NO_KEYS = "no_keys"


@dataclass(frozen=True)
class Bar:
    symbol: str
    timeframe: str
    ts: datetime  # bar timestamp (UTC)
    open: float
    high: float
    low: float
    close: float
    volume: int | None
    source: str
    fetched_at: datetime


@dataclass(frozen=True)
class Snapshot:
    symbol: str
    price: float
    ts: datetime  # when the price was struck
    source: str
    fetched_at: datetime

    def age_minutes(self, now: datetime | None = None) -> float:
        now = now or datetime.now(UTC)
        return (now - self.ts).total_seconds() / 60.0


def utcnow() -> datetime:
    return datetime.now(UTC)


def iso(dt: datetime) -> str:
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_iso(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00")).astimezone(UTC)
