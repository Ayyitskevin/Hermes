"""Swing-opportunity screener — Minervini's Trend Template, honestly labeled.

For every watchlist symbol, from cached daily closes (never a live fetch),
this computes the eight price/moving-average criteria of Mark Minervini's
Trend Template and reports how completely the symbol matches:

    1. close above the 150- and 200-day SMA
    2. 150-day SMA above the 200-day SMA
    3. 200-day SMA trending up for ~1 month (now > 22 bars ago)
    4. 50-day SMA > 150-day SMA > 200-day SMA (stacked)
    5. close above the 50-day SMA
    6. close ≥ 30% above the 52-week low
    7. close within 25% of the 52-week high (≥ 75% of it)
    8. relative strength positive — a Mansfield RS PROXY vs the benchmark,
       standing in for Minervini's market-wide RS rating (which needs the
       whole market universe Hermes does not have)

A symbol scores 0–8 and gets a verdict: PASS (8/8), NEAR (6–7), NO (<6).
Fewer than 252 daily bars (or too little benchmark overlap for the RS proxy)
→ status 'missing', never interpolated. The benchmark is not screened — it is
the RS reference. Every row carries source + as-of + staleness, like every
other number in Hermes.

WHAT THIS IS, STATED PLAINLY — the screen outputs CANDIDATES, never "setups."
A candidate is a starting point for research. It becomes a setup ONLY when the
human creates a journaled trade proposal, which runs the reviewer second-pass
(`review.reviewer.review_entry`) at propose time. This screen does NOT call the
reviewer and does NOT bypass it — the reviewer gate lives at propose time, not
here. The Trend Template is a trend-following FILTER, not a validated edge; the
Phase 4 validation campaign (2026-07-05) found filter-style signals did not add
value at default parameters, so passing the screen is a screening convenience,
not forward evidence. CANSLIM's fundamental criteria (earnings, sales,
institutional sponsorship) are deliberately OMITTED because Hermes has no
fundamentals feed. No order path exists in this codebase.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from ..config import HermesConfig
from ..data import store
from ..data.models import Bar, utcnow
from ..regime.engine import latest_reading
from ..regime.indicators import sma, sma_series
from ..regime.models import RegimeLabel
from ..rs.board import _rs_line

MIN_BARS = 252            # ~52 weeks of daily closes — the template's floor
SMA_FAST = 50
SMA_MID = 150
SMA_SLOW = 200
TREND_LOOKBACK_BARS = 22  # "~1 month" for the 200-SMA rising check
LOOKBACK_52W = 252        # 52-week high/low window
ABOVE_LOW_PCT = 30.0      # close must sit ≥ this far above the 52-week low
WITHIN_HIGH_PCT = 25.0    # close must sit within this much of the 52-week high
RS_SMA = 200              # 200-bar zero line of the RS line (Mansfield form)

PASS_SCORE = 8            # all eight criteria
NEAR_MIN = 6              # 6–7 of eight

CLAIM = (
    "Flags watchlist symbols that currently satisfy Minervini's eight-point "
    "Trend Template — a trend-following filter — as CANDIDATES worth a closer "
    "look, ranked by how completely they match and how near the 52-week high "
    "they sit. A candidate is a place to start research, never a trade signal."
)

METHODOLOGY = (
    "Mark Minervini (2013), 'Trade Like a Stock Market Wizard' — the Trend "
    "Template: eight price/moving-average criteria (close vs the 50/150/200-day "
    "SMAs, MA stacking and slope, and distance from the 52-week high and low), "
    "computed from daily closes. The eighth criterion, market-wide relative "
    "strength, is approximated by a Mansfield RS proxy vs the configured "
    "benchmark — the rs board's RS line (Weinstein 1988) measured against its "
    "200-bar zero line — because Hermes has no full-market universe to compute "
    "Minervini's own RS rating."
)

CAVEAT = (
    "The Trend Template is a trend-following FILTER, not a validated edge: it "
    "describes a stock already in a confirmed uptrend, and the one validation "
    "Hermes has run (the Phase 4 campaign, 2026-07-05) found filter-style "
    "signals did not add value at default parameters — passing the screen is a "
    "screening convenience, not forward evidence. A row here is a CANDIDATE, "
    "never a 'setup': a candidate becomes a setup only by creating a journaled "
    "trade proposal, which runs the reviewer second-pass at propose time — this "
    "screen does not call the reviewer and does not bypass it. Minervini's "
    "template is only the price half of his method; CANSLIM's fundamental "
    "criteria (earnings, sales, institutional sponsorship) are deliberately "
    "OMITTED because Hermes has no fundamentals feed — a match is not a "
    "fundamental endorsement. Criterion 8 is a Mansfield-vs-benchmark PROXY for "
    "Minervini's market-wide RS rating, which needs a full market universe "
    "Hermes lacks. Matches are read against the current regime: when the tape "
    "is not a bull trend, PASS/NEAR rows are annotated context-only, because "
    "the template is a per-symbol trend measure and the regime is the market "
    "context. Fewer than 252 daily bars → the symbol shows as missing, never "
    "interpolated."
)


@dataclass(frozen=True)
class Criterion:
    key: str
    label: str
    passed: bool


@dataclass(frozen=True)
class ScreenRow:
    symbol: str
    status: str                 # 'ok' | 'missing'
    verdict: str | None         # 'PASS' | 'NEAR' | 'NO'
    score: int | None           # 0–8; None when missing
    criteria: list[Criterion]   # the eight, in template sequence
    failed: list[str]           # labels of the criteria that did NOT pass
    close: float | None
    sma50: float | None
    sma150: float | None
    sma200: float | None
    low_52w: float | None
    high_52w: float | None
    mansfield: float | None     # (RS / SMA200(RS) − 1) × 100 vs the benchmark
    pct_above_low: float | None    # close vs 52-week low, in %
    pct_below_high: float | None   # close vs 52-week high, in % (≤ 0)
    bars: int                   # daily closes available for this symbol
    regime_note: str            # non-empty only for a context-only annotation
    note: str                   # why missing — empty otherwise
    source: str | None
    as_of: datetime | None
    staleness: str              # 'live' | 'stale' | 'dead' | 'missing'


@dataclass(frozen=True)
class Screen:
    ts: datetime
    benchmark: str
    benchmark_asof: datetime | None
    benchmark_source: str | None
    regime_label: RegimeLabel | None    # None = no reading persisted yet
    regime_display: str
    regime_asof: datetime | None
    regime_version: str | None
    bull_regime: bool                   # True only when the reading is bull_trend
    rows: list[ScreenRow] = field(default_factory=list)
    claim: str = CLAIM
    methodology: str = METHODOLOGY
    caveat: str = CAVEAT


def _criteria(closes: list[float], mansfield: float) -> list[Criterion]:
    """The eight Trend-Template booleans over daily closes, with the RS
    criterion supplied as a precomputed Mansfield value. Assumes
    len(closes) >= MIN_BARS (the caller gates on that; missing stays missing)."""
    close = closes[-1]
    sma50 = sma(closes, SMA_FAST)
    sma150 = sma(closes, SMA_MID)
    sma200 = sma(closes, SMA_SLOW)
    sma200_series = sma_series(closes, SMA_SLOW)
    sma200_prev = sma200_series[-1 - TREND_LOOKBACK_BARS]

    window = closes[-LOOKBACK_52W:]
    low_52w = min(window)
    high_52w = max(window)

    return [
        Criterion("above_150_200", "Close above the 150- and 200-day MA",
                  close > sma150 and close > sma200),
        Criterion("ma150_above_200", "150-day MA above the 200-day MA",
                  sma150 > sma200),
        Criterion("ma200_rising", "200-day MA trending up (≥ ~1 month)",
                  sma200_prev is not None and sma200 > sma200_prev),
        Criterion("ma_stack", "50-day above 150-day above 200-day MA",
                  sma50 > sma150 > sma200),
        Criterion("above_50", "Close above the 50-day MA",
                  close > sma50),
        Criterion("above_low", f"≥ {ABOVE_LOW_PCT:.0f}% above the 52-week low",
                  close >= low_52w * (1 + ABOVE_LOW_PCT / 100)),
        Criterion("near_high", f"Within {WITHIN_HIGH_PCT:.0f}% of the 52-week high",
                  close >= high_52w * (1 - WITHIN_HIGH_PCT / 100)),
        Criterion("rs_positive", "Mansfield RS positive vs the benchmark",
                  mansfield > 0),
    ]


def _verdict(score: int) -> str:
    if score >= PASS_SCORE:
        return "PASS"
    if score >= NEAR_MIN:
        return "NEAR"
    return "NO"


def _row(
    symbol: str, sym_bars: list[Bar], bench_bars: list[Bar],
    bull_regime: bool, regime_display: str, stale_after_minutes: int,
) -> ScreenRow:
    closes = [b.close for b in sym_bars]
    rs, _ = _rs_line(sym_bars, bench_bars)

    last = sym_bars[-1] if sym_bars else None
    source = last.source if last else None
    as_of = last.ts if last else None
    staleness = store.staleness(as_of, stale_after_minutes) if as_of else "missing"

    def _missing(note: str) -> ScreenRow:
        return ScreenRow(
            symbol=symbol, status="missing", verdict=None, score=None,
            criteria=[], failed=[], close=round(closes[-1], 2) if closes else None,
            sma50=None, sma150=None, sma200=None, low_52w=None, high_52w=None,
            mansfield=None, pct_above_low=None, pct_below_high=None,
            bars=len(closes), regime_note="", note=note,
            source=source, as_of=as_of, staleness=staleness,
        )

    if len(closes) < MIN_BARS:
        return _missing(
            f"{len(closes)} daily bars; the Trend Template needs {MIN_BARS} — "
            "shown as missing, never interpolated"
        )
    if len(rs) < RS_SMA:
        return _missing(
            f"{len(rs)} overlapping bars vs the benchmark; the Mansfield RS proxy "
            f"needs {RS_SMA} — shown as missing, never interpolated"
        )

    mansfield = (rs[-1] / sma(rs, RS_SMA) - 1.0) * 100.0
    criteria = _criteria(closes, mansfield)
    score = sum(1 for c in criteria if c.passed)
    verdict = _verdict(score)
    failed = [c.label for c in criteria if not c.passed]

    close = closes[-1]
    window = closes[-LOOKBACK_52W:]
    low_52w, high_52w = min(window), max(window)

    regime_note = ""
    if verdict in ("PASS", "NEAR") and not bull_regime:
        regime_note = (
            f"context-only — regime reads {regime_display}; a Trend-Template match "
            "is a per-symbol trend measure, not confirmation from the market "
            "context (risk outranks selection)"
        )

    return ScreenRow(
        symbol=symbol, status="ok", verdict=verdict, score=score,
        criteria=criteria, failed=failed,
        close=round(close, 2),
        sma50=round(sma(closes, SMA_FAST), 2),
        sma150=round(sma(closes, SMA_MID), 2),
        sma200=round(sma(closes, SMA_SLOW), 2),
        low_52w=round(low_52w, 2), high_52w=round(high_52w, 2),
        mansfield=round(mansfield, 2),
        pct_above_low=round((close / low_52w - 1.0) * 100.0, 1),
        pct_below_high=round((close / high_52w - 1.0) * 100.0, 1),
        bars=len(closes), regime_note=regime_note, note="",
        source=source, as_of=as_of, staleness=staleness,
    )


_VERDICT_RANK = {"PASS": 0, "NEAR": 1, "NO": 2}


def build_screen(config: HermesConfig) -> Screen:
    """The screen, from cached bars and the latest persisted regime reading.
    Symbols with data rank PASS → NEAR → NO, then by score (high first), then
    by proximity to the 52-week high; missing symbols keep watchlist order at
    the bottom. No reading yet counts as non-bull — an unknown regime never
    turns a context-only annotation off."""
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
    ranked = sorted(
        (r for r in rows if r.status == "ok"),
        key=lambda r: (_VERDICT_RANK[r.verdict], -r.score, -r.pct_below_high),
    )
    missing = [r for r in rows if r.status != "ok"]

    latest_bench = bench_bars[-1] if bench_bars else None
    return Screen(
        ts=utcnow(),
        benchmark=benchmark,
        benchmark_asof=latest_bench.ts if latest_bench else None,
        benchmark_source=latest_bench.source if latest_bench else None,
        regime_label=reading.label if reading else None,
        regime_display=regime_display,
        regime_asof=reading.data_asof if reading else None,
        regime_version=reading.classifier_version if reading else None,
        bull_regime=bull,
        rows=[*ranked, *missing],
    )
