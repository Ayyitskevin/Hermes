"""Swing screener (Minervini Trend Template): each of the eight criteria,
a clean full PASS, a NO, the missing path, the Mansfield RS proxy, the
non-bull regime annotation, ranking order, and a no-dollar-figures assertion
on the composed output. Follows test_rs_board's synthetic-bar idioms and
test_weekly_review's store-seeding helpers."""

from __future__ import annotations

import json
from dataclasses import asdict
from datetime import timedelta

from hermes import db
from hermes.data.models import Bar, iso, utcnow
from hermes.regime.engine import store_reading
from hermes.regime.models import RegimeLabel, RegimeReading
from hermes.screener.trend_template import (
    _criteria,
    _row,
    _verdict,
    build_screen,
)


# ── synthetic-bar + seeding helpers ──────────────────────────────────────
def make_bars(closes: list[float], symbol: str) -> list[Bar]:
    now = utcnow()
    n = len(closes)
    return [
        Bar(symbol=symbol, timeframe="1Day", ts=now - timedelta(days=n - i),
            open=c, high=c * 1.004, low=c * 0.996, close=c,
            volume=1_000_000, source="test", fetched_at=now)
        for i, c in enumerate(closes)
    ]


def by_key(criteria) -> dict[str, bool]:
    return {c.key: c.passed for c in criteria}


def seed_regime(label: RegimeLabel) -> None:
    store_reading(RegimeReading(
        ts=utcnow(), label=label, score=0.5, confidence=0.7,
        classifier_version="test-v1", evidence=[],
        data_asof=utcnow(), data_source="test", honesty="test honesty",
    ))


def seed_bars(symbol: str, closes: list[float]) -> None:
    conn = db.connect()
    now = utcnow()
    n = len(closes)
    for i, px in enumerate(closes):
        ts = iso(now - timedelta(days=n - i))
        conn.execute(
            """INSERT INTO bars (symbol, timeframe, ts, open, high, low, close,
               volume, source, fetched_at)
               VALUES (?, '1Day', ?, ?, ?, ?, ?, 1, 'test', ?)""",
            (symbol, ts, px, px, px, px, iso(now)),
        )
    conn.commit()


# Canonical series (>= 252 closes so every SMA resolves).
STRONG_UP = [50 * 1.004 ** i for i in range(300)]     # passes all price criteria
DOWNTREND = [300 * 0.997 ** i for i in range(300)]    # fails all price criteria
SLOW_UP = [100 * 1.0005 ** i for i in range(300)]     # up, but < 30% above its low


# ── the eight criteria, one construction at a time ───────────────────────
def test_price_vs_moving_averages_pass_in_strong_uptrend():
    c = by_key(_criteria(STRONG_UP, mansfield=1.0))
    assert c["above_150_200"] is True      # 1
    assert c["ma150_above_200"] is True    # 2
    assert c["ma200_rising"] is True       # 3
    assert c["ma_stack"] is True           # 4
    assert c["above_50"] is True           # 5


def test_close_below_50day_fails_only_that_criterion():
    # Strong uptrend with a fresh dip: close drops below the 50-day but stays
    # above the 150/200-day, so criterion 5 flips and criterion 1 holds.
    dip = STRONG_UP[:-1] + [STRONG_UP[-2] * 0.85]
    c = by_key(_criteria(dip, mansfield=1.0))
    assert c["above_50"] is False          # 5 fails
    assert c["above_150_200"] is True      # 1 still holds


def test_downtrend_fails_the_moving_average_criteria():
    c = by_key(_criteria(DOWNTREND, mansfield=1.0))
    assert c["above_150_200"] is False     # 1
    assert c["ma150_above_200"] is False   # 2
    assert c["ma200_rising"] is False      # 3
    assert c["ma_stack"] is False          # 4
    assert c["above_50"] is False          # 5


def test_distance_above_52w_low_criterion():
    # A slow grind sits only ~13% above its 52-week low → criterion 6 fails,
    # while every moving-average criterion still passes.
    c = by_key(_criteria(SLOW_UP, mansfield=1.0))
    assert c["above_low"] is False         # 6 fails (needs >= 30%)
    assert c["above_150_200"] is True
    assert c["near_high"] is True
    # A strong uptrend clears the 30% floor easily.
    assert by_key(_criteria(STRONG_UP, mansfield=1.0))["above_low"] is True


def test_distance_below_52w_high_criterion():
    # Rise to a peak, then fall ~30% → close sits > 25% below the high.
    rise = [50 * 1.004 ** i for i in range(250)]
    peak = rise[-1]
    fall = [peak * 0.993 ** j for j in range(1, 51)]
    c = by_key(_criteria(rise + fall, mansfield=1.0))
    assert c["near_high"] is False         # 7 fails
    # Monotonic uptrend closes at its high → within 25% trivially.
    assert by_key(_criteria(STRONG_UP, mansfield=1.0))["near_high"] is True


def test_rs_criterion_follows_mansfield_sign():
    assert by_key(_criteria(STRONG_UP, mansfield=1.5))["rs_positive"] is True   # 8
    assert by_key(_criteria(STRONG_UP, mansfield=-1.5))["rs_positive"] is False


# ── full-row verdicts: PASS, NO, missing ─────────────────────────────────
def test_verdict_thresholds():
    assert _verdict(8) == "PASS"
    assert _verdict(7) == "NEAR"
    assert _verdict(6) == "NEAR"
    assert _verdict(5) == "NO"
    assert _verdict(0) == "NO"


def test_clean_full_pass_strong_uptrend_vs_benchmark():
    n = 300
    bench = make_bars([100 * 1.0005 ** i for i in range(n)], "SPY")
    leader = make_bars([50 * 1.004 ** i for i in range(n)], "LEAD")
    row = _row("LEAD", leader, bench, bull_regime=True,
               regime_display="Bull trend", stale_after_minutes=4320)
    assert row.status == "ok"
    assert row.score == 8 and row.verdict == "PASS"
    assert row.failed == []
    assert row.mansfield > 0
    assert row.regime_note == ""           # bull regime → no context-only note


def test_downtrend_row_is_a_no():
    n = 300
    bench = make_bars([100 * 1.0005 ** i for i in range(n)], "SPY")
    lag = make_bars([200 * 0.997 ** i for i in range(n)], "LAG")
    row = _row("LAG", lag, bench, bull_regime=True,
               regime_display="Bull trend", stale_after_minutes=4320)
    assert row.status == "ok"
    assert row.verdict == "NO" and row.score < 6
    assert len(row.failed) >= 3


def test_short_history_is_missing_never_guessed():
    bench = make_bars([100.0] * 300, "SPY")
    sym = make_bars([10 * 1.004 ** i for i in range(120)], "AAA")  # < 252 bars
    row = _row("AAA", sym, bench, True, "Bull trend", stale_after_minutes=4320)
    assert row.status == "missing"
    assert row.verdict is None and row.score is None
    assert row.criteria == [] and "bars" in row.note


# ── the Mansfield RS proxy: leader vs laggard vs benchmark ────────────────
def test_rs_proxy_leader_positive_laggard_negative():
    n = 300
    bench = make_bars([100 * 1.0005 ** i for i in range(n)], "SPY")
    leader = make_bars([50 * 1.004 ** i for i in range(n)], "LEAD")
    laggard = make_bars([50 * 1.0001 ** i for i in range(n)], "LAG")
    lead_row = _row("LEAD", leader, bench, True, "Bull trend", 4320)
    lag_row = _row("LAG", laggard, bench, True, "Bull trend", 4320)
    # Outperformer's RS line is above its 200-bar zero line; laggard's is below.
    assert lead_row.mansfield > 0
    assert by_key(lead_row.criteria)["rs_positive"] is True
    assert lag_row.mansfield < 0
    assert by_key(lag_row.criteria)["rs_positive"] is False


# ── non-bull regime annotation (annotate, never suppress) ────────────────
def test_non_bull_regime_annotates_pass_near_rows():
    n = 300
    bench = make_bars([100 * 1.0005 ** i for i in range(n)], "SPY")
    leader = make_bars([50 * 1.004 ** i for i in range(n)], "LEAD")
    row = _row("LEAD", leader, bench, bull_regime=False,
               regime_display="Rangebound", stale_after_minutes=4320)
    # The match is NOT suppressed — the score and verdict stand…
    assert row.verdict == "PASS" and row.score == 8
    # …but it is annotated context-only, naming the regime.
    assert "context-only" in row.regime_note and "Rangebound" in row.regime_note


# ── build_screen: ranking + regime wiring ────────────────────────────────
def test_build_screen_ranks_and_places_missing_last(fresh_db, config):
    seed_regime(RegimeLabel.BULL_TREND)
    seed_bars("SPY", [100 * 1.001 ** i for i in range(300)])   # benchmark
    seed_bars("QQQ", [50 * 1.004 ** i for i in range(300)])    # strong leader
    seed_bars("XLE", [200 * 0.997 ** i for i in range(300)])   # downtrend
    seed_bars("XLF", [30 * 1.004 ** i for i in range(120)])    # short → missing
    screen = build_screen(config)

    syms = [r.symbol for r in screen.rows]
    assert "SPY" not in syms                       # benchmark is the RS reference
    verdict = {r.symbol: r.verdict for r in screen.rows}
    assert verdict["QQQ"] in ("PASS", "NEAR")
    assert verdict["XLE"] == "NO"
    assert verdict["XLF"] is None                  # missing
    # Rank: candidate (QQQ) before the NO (XLE) before the missing (XLF).
    assert syms.index("QQQ") < syms.index("XLE") < syms.index("XLF")
    assert screen.rows[-1].status == "missing"


def test_build_screen_non_bull_regime_flags_context_only(fresh_db, config):
    seed_regime(RegimeLabel.CHOP)                  # a rangebound tape
    seed_bars("SPY", [100 * 1.0005 ** i for i in range(300)])
    seed_bars("QQQ", [50 * 1.004 ** i for i in range(300)])
    screen = build_screen(config)
    assert screen.bull_regime is False
    qqq = next(r for r in screen.rows if r.symbol == "QQQ")
    assert qqq.verdict in ("PASS", "NEAR")
    assert "context-only" in qqq.regime_note


def test_composed_output_has_no_dollar_figures(fresh_db, config):
    seed_regime(RegimeLabel.BULL_TREND)
    seed_bars("SPY", [100 * 1.0005 ** i for i in range(300)])
    seed_bars("QQQ", [50 * 1.004 ** i for i in range(300)])
    screen = build_screen(config)
    blob = json.dumps(asdict(screen), default=str)
    assert "$" not in blob
