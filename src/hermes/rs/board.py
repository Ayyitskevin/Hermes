"""RS leadership board — the "which names first" layer of the premarket read.

For every watchlist symbol against the configured benchmark, from cached
daily bars (never a live fetch):

    RS line     = close_symbol / close_benchmark, aligned by session date
    Mansfield   = (RS / SMA200(RS) − 1) × 100 — the RS line against its
                  ~200-day zero line, the form printed on Mansfield charts
                  and used throughout Weinstein's stage analysis
    slope       = Mansfield change over the last 3 bars
    range flags = RS at a new 50-bar high / low (strict, vs the prior 49)

Verdicts are read AGAINST the current persisted regime reading — risk
outranks selection, so a non-bull regime caps every verdict at WATCH except
SKIP-LAG (a laggard stays a laggard in any regime):

    HI-CONV   Mansfield > 0, rising, RS at a 50-bar high, regime bull_trend
    LONG-OK   Mansfield > 0 and not falling, regime bull_trend
    WATCH     Mansfield > 0 but falling; or Mansfield ≤ 0 and not falling
              (an improving or flat laggard is a watch, not a skip)
    SKIP-LAG  Mansfield < 0 and falling, or RS at a new 50-bar low

Fewer than 200 overlapping bars → status "missing", never interpolated. The
benchmark itself is not ranked (its RS against itself is identically 1 —
noise, not information). Every row carries source + as-of + staleness, like
every other number in Hermes.

The board recommends which names earn a REVIEW first. It never recommends a
trade — no order path exists in this codebase.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from ..config import HermesConfig
from ..data import store
from ..data.models import Bar, utcnow
from ..regime.engine import latest_reading
from ..regime.indicators import sma_series
from ..regime.models import RegimeLabel

MANSFIELD_SMA = 200   # Weinstein's daily zero line (~52-week on weeklies)
SLOPE_BARS = 3        # "rising/falling" window — a readability convention
RANGE_BARS = 50       # "new high/low" window — a readability convention

CLAIM = (
    "Ranks the watchlist by Mansfield relative strength against the benchmark: "
    "a name above its zero line and rising has been outperforming on a ~200-bar "
    "basis and earns the first look in the premarket runbook."
)

METHODOLOGY = (
    "Weinstein (1988), 'Secrets for Profiting in Bull and Bear Markets' — "
    "Mansfield relative strength: the symbol/benchmark RS line measured against "
    "its ~200-day zero line (the Mansfield chart-service convention), from the "
    "Weinstein stage-analysis lineage."
)

CAVEAT = (
    "Weinstein/Mansfield RS states a relative-performance tilt — who HAS been "
    "outperforming — not persistence; the stage framework assumes continuation, "
    "it does not prove it. And the one validation Hermes has run points the "
    "other way at the gate level: the Phase 4 campaign (2026-07-05) found that "
    "RS as an entry gate on index vehicles did not add value at default "
    "parameters. This board makes a different, cross-sectional SELECTION claim "
    "— which watchlist name earns the first look — and that claim is itself "
    "not yet validated. Treat the ranking as a reading order, not an edge."
)


@dataclass(frozen=True)
class RSRow:
    symbol: str
    status: str                 # 'ok' | 'missing'
    verdict: str | None         # 'HI-CONV' | 'LONG-OK' | 'WATCH' | 'SKIP-LAG'
    mansfield: float | None     # (RS / SMA200(RS) − 1) × 100
    slope3: float | None        # Mansfield change over SLOPE_BARS bars
    rs: float | None            # current RS line value
    rs_new_high: bool           # RS strictly above the prior 49 bars
    rs_new_low: bool            # RS strictly below the prior 49 bars
    bars_overlap: int           # aligned daily bars shared with the benchmark
    note: str                   # why missing / why capped — empty when neither
    source: str | None
    as_of: datetime | None      # ts of the latest aligned bar
    staleness: str              # 'live' | 'stale' | 'dead' | 'missing'


@dataclass(frozen=True)
class RSBoard:
    ts: datetime
    benchmark: str
    benchmark_asof: datetime | None
    benchmark_source: str | None
    regime_label: RegimeLabel | None    # None = no reading persisted yet
    regime_asof: datetime | None
    regime_version: str | None
    capped: bool                # True whenever the regime is not bull_trend
    rows: list[RSRow] = field(default_factory=list)
    claim: str = CLAIM
    methodology: str = METHODOLOGY
    caveat: str = CAVEAT


def _rs_line(sym_bars: list[Bar], bench_bars: list[Bar]) -> tuple[list[float], Bar | None]:
    """RS values on session dates both series share, plus the latest aligned
    symbol bar (the row's provenance). Gaps stay gaps — no interpolation."""
    bench_close = {b.ts.date(): b.close for b in bench_bars if b.close != 0}
    rs: list[float] = []
    last: Bar | None = None
    for b in sym_bars:
        bench = bench_close.get(b.ts.date())
        if bench is None:
            continue
        rs.append(b.close / bench)
        last = b
    return rs, last


def _verdict(
    mansfield: float, slope3: float | None, new_high: bool, new_low: bool,
    bull_regime: bool, regime_display: str,
) -> tuple[str, str]:
    """(verdict, note). SKIP-LAG survives any regime; everything else is
    capped at WATCH when the regime is not bull_trend — risk outranks
    selection. An undeterminable slope (None) counts as neither rising nor
    falling; it is never guessed."""
    rising = slope3 is not None and slope3 > 0
    falling = slope3 is not None and slope3 < 0
    if new_low or (mansfield < 0 and falling):
        return "SKIP-LAG", ""
    if mansfield > 0 and not falling:
        uncapped = "HI-CONV" if (rising and new_high) else "LONG-OK"
    else:
        uncapped = "WATCH"
    if not bull_regime and uncapped != "WATCH":
        return "WATCH", (
            f"capped at WATCH (RS alone read {uncapped}) — regime reads "
            f"{regime_display}; risk outranks selection"
        )
    return uncapped, ""


def _row(
    symbol: str, sym_bars: list[Bar], bench_bars: list[Bar],
    bull_regime: bool, regime_display: str, stale_after_minutes: int,
) -> RSRow:
    rs, last = _rs_line(sym_bars, bench_bars)
    overlap = len(rs)
    source = last.source if last else None
    as_of = last.ts if last else None
    staleness = store.staleness(as_of, stale_after_minutes) if as_of else "missing"

    if overlap < MANSFIELD_SMA:
        return RSRow(
            symbol=symbol, status="missing", verdict=None, mansfield=None,
            slope3=None, rs=round(rs[-1], 4) if rs else None,
            rs_new_high=False, rs_new_low=False, bars_overlap=overlap,
            note=(f"{overlap} overlapping daily bars vs the benchmark; Mansfield "
                  f"needs {MANSFIELD_SMA} — shown as missing, never interpolated"),
            source=source, as_of=as_of, staleness=staleness,
        )

    zero_line = sma_series(rs, MANSFIELD_SMA)
    mans = [(r / m - 1.0) * 100.0
            for r, m in zip(rs, zero_line, strict=True) if m is not None]
    mansfield = mans[-1]
    slope3 = (mans[-1] - mans[-1 - SLOPE_BARS]) if len(mans) > SLOPE_BARS else None

    prior = rs[-RANGE_BARS:-1]
    new_high = rs[-1] > max(prior)
    new_low = rs[-1] < min(prior)

    verdict, note = _verdict(mansfield, slope3, new_high, new_low,
                             bull_regime, regime_display)
    return RSRow(
        symbol=symbol, status="ok", verdict=verdict,
        mansfield=round(mansfield, 2),
        slope3=round(slope3, 3) if slope3 is not None else None,
        rs=round(rs[-1], 4), rs_new_high=new_high, rs_new_low=new_low,
        bars_overlap=overlap, note=note,
        source=source, as_of=as_of, staleness=staleness,
    )


def build_board(config: HermesConfig) -> RSBoard:
    """The board, from cached bars and the latest persisted regime reading.
    Rows with data are ranked by Mansfield RS, best first; missing rows keep
    watchlist order at the bottom. No reading yet counts as non-bull — an
    unknown regime never widens permissions."""
    reading = latest_reading()
    bull = reading is not None and reading.label == RegimeLabel.BULL_TREND
    regime_display = reading.label.display if reading else "no reading yet"

    benchmark = config.market.benchmark
    bench_bars = store.get_bars(benchmark, "1Day", limit=400)

    rows = [
        _row(symbol, store.get_bars(symbol, "1Day", limit=400), bench_bars,
             bull, regime_display, config.market.stale_after_minutes)
        for symbol in dict.fromkeys(config.market.watchlist)
        if symbol != benchmark
    ]
    ranked = sorted((r for r in rows if r.status == "ok"),
                    key=lambda r: r.mansfield, reverse=True)
    missing = [r for r in rows if r.status != "ok"]

    latest_bench = bench_bars[-1] if bench_bars else None
    return RSBoard(
        ts=utcnow(),
        benchmark=benchmark,
        benchmark_asof=latest_bench.ts if latest_bench else None,
        benchmark_source=latest_bench.source if latest_bench else None,
        regime_label=reading.label if reading else None,
        regime_asof=reading.ts if reading else None,
        regime_version=reading.classifier_version if reading else None,
        capped=not bull,
        rows=[*ranked, *missing],
    )
