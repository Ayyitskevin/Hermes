"""MarketDataProvider protocol — the seam between Hermes and any data vendor.

Providers are READ-ONLY by contract and by construction: the protocol has no
method that could express an order, and providers are forbidden (and CI-checked,
see tests/test_no_order_paths.py) from talking to any trading endpoint.
"""

from __future__ import annotations

from datetime import datetime
from typing import Protocol

from .models import Bar, ProviderState, Snapshot


class ProviderError(Exception):
    """Raised on fetch failure. state tells the dashboard what to display —
    failures degrade visibly, they are never swallowed."""

    def __init__(self, message: str, state: ProviderState):
        super().__init__(message)
        self.state = state


class MarketDataProvider(Protocol):
    name: str

    def fetch_bars(
        self, symbol: str, timeframe: str, start: datetime, end: datetime
    ) -> list[Bar]: ...

    def fetch_snapshot(self, symbol: str) -> Snapshot: ...

    def state(self) -> ProviderState:
        """Last-known provider health (updated by fetch calls)."""
        ...
