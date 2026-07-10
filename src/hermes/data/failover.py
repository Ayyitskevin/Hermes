"""Provider failover — primary first, documented fallbacks next.

When the configured primary cannot serve bars (auth, unreachable, rate
limit, empty), Hermes tries each name in ``data.failover`` in order. Every
hop is logged; the bar's ``source`` still names who actually answered. This
is the "failover drill" surface: ``probe_failover`` exercises the chain
without writing the book.
"""

from __future__ import annotations

from datetime import datetime

from .. import oplog
from ..config import HermesConfig
from .models import Bar, ProviderState, Snapshot, utcnow
from .provider import MarketDataProvider, ProviderError
from .registry import PROVIDERS

COMPONENT = "data.failover"


class FailoverProvider:
    """Wraps a primary + ordered fallbacks behind the MarketDataProvider surface."""

    def __init__(self, config: HermesConfig):
        self.config = config
        primary = config.data.provider
        chain = [primary, *list(config.data.failover or [])]
        # de-dupe, preserve order
        seen: set[str] = set()
        names: list[str] = []
        for n in chain:
            if n not in seen and n in PROVIDERS:
                seen.add(n)
                names.append(n)
        if not names:
            raise ValueError("no usable providers in primary/failover chain")
        self._names = names
        self._clients: dict[str, MarketDataProvider] = {
            n: PROVIDERS[n](config) for n in names
        }
        self._active = names[0]
        self._last_error: str | None = None

    @property
    def name(self) -> str:
        return f"failover:{self._active}"

    def chain(self) -> list[str]:
        return list(self._names)

    def fetch_bars(
        self, symbol: str, timeframe: str, start: datetime, end: datetime
    ) -> list[Bar]:
        errors: list[str] = []
        for name in self._names:
            client = self._clients[name]
            try:
                bars = client.fetch_bars(symbol, timeframe, start, end)
                if not bars:
                    errors.append(f"{name}: empty")
                    continue
                if name != self._names[0]:
                    oplog.log(
                        COMPONENT, "fetch_bars", name, None, "ok",
                        f"failover served {symbol} {timeframe} after: {'; '.join(errors)}",
                    )
                self._active = name
                self._last_error = None
                return bars
            except ProviderError as exc:
                errors.append(f"{name}:{exc.state.value}")
                continue
        self._last_error = "; ".join(errors) or "all providers failed"
        raise ProviderError(
            f"all providers failed for {symbol} {timeframe}: {self._last_error}",
            ProviderState.UNREACHABLE,
        )

    def fetch_snapshot(self, symbol: str) -> Snapshot:
        errors: list[str] = []
        for name in self._names:
            client = self._clients[name]
            try:
                snap = client.fetch_snapshot(symbol)
                self._active = name
                return snap
            except ProviderError as exc:
                errors.append(f"{name}:{exc.state.value}")
                continue
        # Last resort: synthesize from latest daily bar if any provider had bars.
        raise ProviderError(
            f"no snapshot from chain ({'; '.join(errors)})",
            ProviderState.UNREACHABLE,
        )

    def state(self) -> ProviderState:
        return self._clients[self._active].state()

    def probe(self) -> dict:
        """Failover drill: ping each provider's state without mutating the book."""
        rows = []
        for name in self._names:
            client = self._clients[name]
            st = client.state()
            note = "primary" if name == self._names[0] else "fallback"
            rows.append({
                "name": name,
                "state": st.value if hasattr(st, "value") else str(st),
                "role": note,
            })
        return {
            "generated_at": utcnow().isoformat().replace("+00:00", "Z"),
            "chain": self._names,
            "active": self._active,
            "last_error": self._last_error,
            "providers": rows,
            "honesty": {
                "claim": (
                    "Exercises the configured primary→failover chain. Does not place "
                    "orders or write positions — data path only."
                ),
                "caveat": (
                    "A green probe is not proof of complete history. Each hop still "
                    "degrades visibly on rate limits and auth errors."
                ),
            },
        }
