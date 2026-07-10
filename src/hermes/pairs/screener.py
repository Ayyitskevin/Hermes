"""Pair-trade screener — correlation + spread z-score, never a trade.

Scans the configured watchlist for pairs with high absolute correlation and
an extreme residual (log-spread z-score). Outputs CANDIDATES for research;
a pair becomes actionable only via a journaled proposal the human commits.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from itertools import combinations

from ..config import HermesConfig
from ..data import store
from ..data.models import iso, utcnow
from ..regime.indicators import correlation, daily_returns

LOOKBACK = 60
MIN_BARS = 60
CORR_MIN = 0.80
Z_ENTRY = 2.0

CLAIM = (
    "Ranks watchlist pairs by absolute correlation and residual z-score of the "
    "log price spread — a cointegration *proxy*, not a Johansen test."
)
METHODOLOGY = (
    "Pearson correlation of daily returns over ~60 sessions; log-spread "
    "z-score = (spread − mean) / std on the same window. Classic pairs "
    "literature (Gatev, Goetzmann, Rouwenhorst 2006) uses richer formation "
    "tests — this screen is a shortlist, not that paper."
)
CAVEAT = (
    "High correlation ≠ mean-reverting spread. No hedge ratio is fitted. "
    "Outputs are candidates only — never orders, never dollar notionals."
)


@dataclass(frozen=True)
class PairRow:
    a: str
    b: str
    correlation: float | None
    spread_z: float | None
    status: str          # ok | missing
    verdict: str | None  # WATCH | STRETCHED | QUIET
    note: str
    source: str | None
    as_of: str | None


@dataclass(frozen=True)
class PairScreen:
    ts: str
    lookback: int
    rows: list[PairRow] = field(default_factory=list)
    claim: str = CLAIM
    methodology: str = METHODOLOGY
    caveat: str = CAVEAT


def _log_spread_z(closes_a: list[float], closes_b: list[float]) -> float | None:
    n = min(len(closes_a), len(closes_b))
    if n < MIN_BARS:
        return None
    a = closes_a[-n:]
    b = closes_b[-n:]
    spreads = [
        math.log(x) - math.log(y)
        for x, y in zip(a, b, strict=True)
        if x > 0 and y > 0
    ]
    if len(spreads) < MIN_BARS:
        return None
    window = spreads[-LOOKBACK:]
    mu = sum(window) / len(window)
    var = sum((s - mu) ** 2 for s in window) / max(len(window) - 1, 1)
    sd = math.sqrt(var) if var > 0 else 0.0
    if sd == 0:
        return None
    return (window[-1] - mu) / sd


def build_pair_screen(config: HermesConfig, *, limit: int = 40) -> PairScreen:
    symbols = [s for s in dict.fromkeys(config.market.watchlist)
               if s != config.market.benchmark]
    cache: dict[str, list[float]] = {}
    meta: dict[str, tuple[str | None, str | None]] = {}
    for s in symbols:
        bars = store.get_bars(s, "1Day", limit=LOOKBACK + 20)
        cache[s] = [b.close for b in bars]
        if bars:
            meta[s] = (bars[-1].source, iso(bars[-1].ts))
        else:
            meta[s] = (None, None)

    rows: list[PairRow] = []
    for a, b in combinations(symbols, 2):
        ca, cb = cache[a], cache[b]
        if len(ca) < MIN_BARS or len(cb) < MIN_BARS:
            rows.append(PairRow(
                a=a, b=b, correlation=None, spread_z=None, status="missing",
                verdict=None, note="short history",
                source=meta[a][0], as_of=meta[a][1],
            ))
            continue
        ra = daily_returns(ca[-(LOOKBACK + 1):])
        rb = daily_returns(cb[-(LOOKBACK + 1):])
        corr = correlation(ra, rb)
        z = _log_spread_z(ca, cb)
        if corr is None:
            verdict, note = None, "correlation undefined"
            status = "missing"
        else:
            status = "ok"
            if abs(corr) >= CORR_MIN and z is not None and abs(z) >= Z_ENTRY:
                verdict, note = "STRETCHED", "high corr + extreme spread z — research only"
            elif abs(corr) >= CORR_MIN:
                verdict, note = "WATCH", "high corr, spread not extreme"
            else:
                verdict, note = "QUIET", "correlation below screen floor"
        rows.append(PairRow(
            a=a, b=b,
            correlation=round(corr, 3) if corr is not None else None,
            spread_z=round(z, 2) if z is not None else None,
            status=status, verdict=verdict, note=note,
            source=meta[a][0], as_of=meta[a][1],
        ))

    ranked = sorted(
        (r for r in rows if r.status == "ok"),
        key=lambda r: (
            0 if r.verdict == "STRETCHED" else 1 if r.verdict == "WATCH" else 2,
            -(abs(r.spread_z) if r.spread_z is not None else 0),
            -(abs(r.correlation) if r.correlation is not None else 0),
        ),
    )[:limit]
    return PairScreen(ts=iso(utcnow()), lookback=LOOKBACK, rows=ranked)
