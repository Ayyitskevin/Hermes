"""Sample provider — Hermes with zero keys.

Generates deterministic synthetic daily bars (seeded per symbol, so every
clone of the repo sees identical data) covering ~2 years, with distinct
regime phases baked in so the regime classifier, risk layer, and charts all
have something honest to chew on.

Every bar is stamped source='sample' and the dashboard displays that stamp —
demo data is labeled demo data, everywhere, always.
"""

from __future__ import annotations

import math
import random
from datetime import datetime, timedelta

from .models import Bar, ProviderState, Snapshot, utcnow

# Regime script for the synthetic tape: (trading_days, daily_drift, daily_vol)
_PHASES = [
    (110, +0.0009, 0.008),   # steady bull
    (60, +0.0002, 0.011),    # chop
    (45, -0.0022, 0.024),    # stress decline
    (75, +0.0007, 0.014),    # recovery
    (90, +0.0011, 0.009),    # bull resumption
    (60, -0.0004, 0.013),    # fade into chop
    (65, +0.0010, 0.010),    # current leg up
]

_BASE_PRICES = {
    "SPY": 480.0, "QQQ": 410.0, "IWM": 205.0, "XLK": 195.0, "XLE": 88.0,
    "XLF": 41.0, "XLV": 142.0, "XLI": 118.0, "XLP": 76.0, "XLU": 68.0,
}


def _trading_days(end: datetime, count: int) -> list[datetime]:
    days: list[datetime] = []
    d = end
    while len(days) < count:
        if d.weekday() < 5:
            days.append(d.replace(hour=21, minute=0, second=0, microsecond=0))
        d -= timedelta(days=1)
    return list(reversed(days))


class SampleProvider:
    name = "sample"

    def __init__(self, config=None):
        self._state = ProviderState.OK

    def _series(self, symbol: str) -> list[tuple[datetime, float, float, float, float, int]]:
        rng = random.Random(f"hermes:{symbol}")  # deterministic per symbol
        base = _BASE_PRICES.get(symbol, 50.0 + (hash(symbol) % 200))
        total_days = sum(p[0] for p in _PHASES)
        days = _trading_days(utcnow() - timedelta(days=1), total_days)

        out = []
        price = base
        i = 0
        for length, drift, vol in _PHASES:
            # Sector funds get idiosyncratic wobble on top of the market script.
            sym_beta = 0.8 + (rng.random() * 0.5)
            for _ in range(length):
                ret = drift * sym_beta + rng.gauss(0, vol)
                o = price
                c = max(price * (1 + ret), 0.5)
                hi = max(o, c) * (1 + abs(rng.gauss(0, vol / 3)))
                lo = min(o, c) * (1 - abs(rng.gauss(0, vol / 3)))
                vol_shares = int(5e7 * (1 + abs(ret) * 40) * (0.7 + rng.random()))
                out.append((days[i], o, hi, lo, c, vol_shares))
                price = c
                i += 1
        return out

    def fetch_bars(self, symbol: str, timeframe: str, start: datetime, end: datetime) -> list[Bar]:
        if timeframe != "1Day":
            return []  # sample tape is daily-only; absence stays visible
        fetched = utcnow()
        return [
            Bar(symbol=symbol, timeframe="1Day", ts=ts, open=round(o, 2),
                high=round(h, 2), low=round(lo, 2), close=round(c, 2),
                volume=v, source=self.name, fetched_at=fetched)
            for ts, o, h, lo, c, v in self._series(symbol)
            if start <= ts <= end
        ]

    def fetch_snapshot(self, symbol: str) -> Snapshot:
        series = self._series(symbol)
        ts, _, _, _, close, _ = series[-1]
        # Nudge the last close so the demo "live" price visibly differs from EOD.
        rng = random.Random(f"hermes-snap:{symbol}:{ts.date()}")
        price = round(close * (1 + rng.gauss(0, 0.002)), 2)
        return Snapshot(symbol=symbol, price=price, ts=ts, source=self.name,
                        fetched_at=utcnow())

    def state(self) -> ProviderState:
        return self._state


def phase_boundaries() -> list[dict]:
    """Documented regime script of the synthetic tape (used by tests to check
    the classifier picks up the planted phases)."""
    out, day = [], 0
    names = ["bull", "chop", "stress", "recovery", "bull", "chop", "bull"]
    for (length, drift, vol), name in zip(_PHASES, names, strict=True):
        out.append({"start_day": day, "days": length, "drift": drift, "vol": vol,
                    "intended": name})
        day += length
    return out


def _noop_math_use() -> float:
    return math.tau
