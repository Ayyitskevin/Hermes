"""Indicator math as small pure functions over plain float lists.

No dataframe dependency: Hermes works on a few hundred daily bars per symbol,
where clear, testable arithmetic beats a heavyweight stack. Each function
returns None when there is not enough data — missing stays missing.
"""

from __future__ import annotations

import math


def sma(values: list[float], window: int) -> float | None:
    if len(values) < window:
        return None
    return sum(values[-window:]) / window


def sma_series(values: list[float], window: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if len(values) < window:
        return out
    rolling = sum(values[:window])
    out[window - 1] = rolling / window
    for i in range(window, len(values)):
        rolling += values[i] - values[i - window]
        out[i] = rolling / window
    return out


def pct_change(values: list[float], periods: int) -> float | None:
    if len(values) <= periods or values[-1 - periods] == 0:
        return None
    return (values[-1] / values[-1 - periods] - 1.0) * 100.0


def daily_returns(values: list[float]) -> list[float]:
    return [
        values[i] / values[i - 1] - 1.0
        for i in range(1, len(values))
        if values[i - 1] != 0
    ]


def realized_vol_annualized(closes: list[float], window: int = 20) -> float | None:
    """Annualized stdev of daily log returns over the window, in percent."""
    if len(closes) < window + 1:
        return None
    rets = [
        math.log(closes[i] / closes[i - 1])
        for i in range(len(closes) - window, len(closes))
        if closes[i - 1] > 0 and closes[i] > 0
    ]
    if len(rets) < 2:
        return None
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    return math.sqrt(var) * math.sqrt(252) * 100.0


def percentile_rank(history: list[float], value: float) -> float | None:
    """Fraction of history <= value, in [0, 100]."""
    if not history:
        return None
    below = sum(1 for h in history if h <= value)
    return below / len(history) * 100.0


def correlation(a: list[float], b: list[float]) -> float | None:
    """Pearson correlation of two equal-length return series."""
    n = min(len(a), len(b))
    if n < 3:
        return None
    a, b = a[-n:], b[-n:]
    ma_, mb = sum(a) / n, sum(b) / n
    cov = sum((x - ma_) * (y - mb) for x, y in zip(a, b, strict=True))
    va = sum((x - ma_) ** 2 for x in a)
    vb = sum((y - mb) ** 2 for y in b)
    if va == 0 or vb == 0:
        return None
    return cov / math.sqrt(va * vb)
