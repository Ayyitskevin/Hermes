"""Regime Label v6.2 port: state machine behavior on constructed tapes."""

from __future__ import annotations

from datetime import timedelta

from hermes.data.models import Bar, utcnow
from hermes.regime.models import RegimeLabel
from hermes.regime.v62 import HONESTY, RegimeV62Classifier


def make_bars(rows: list[tuple[float, float]], symbol: str = "SPY") -> list[Bar]:
    """rows = [(open, close)] — highs/lows derived, gap-free unless opens say so."""
    now = utcnow()
    n = len(rows)
    return [
        Bar(symbol=symbol, timeframe="1Day", ts=now - timedelta(days=n - i),
            open=o, high=max(o, c) * 1.004, low=min(o, c) * 0.996, close=c,
            volume=1_000_000, source="test", fetched_at=now)
        for i, (o, c) in enumerate(rows)
    ]


def trend_rows(n: int, start: float, daily: float) -> list[tuple[float, float]]:
    rows, price = [], start
    for _ in range(n):
        nxt = price * (1 + daily)
        rows.append((price, nxt))
        price = nxt
    return rows


def test_bull_tape_reads_bull(config):
    reading = RegimeV62Classifier(config).classify(
        make_bars(trend_rows(560, 100.0, 0.004)), {})
    assert reading.label == RegimeLabel.BULL_TREND
    assert reading.classifier_version == "v62"
    assert reading.confidence > 0.3
    assert "not a backtested edge" in reading.honesty


def test_bear_tape_reads_bear(config):
    rows = trend_rows(400, 100.0, 0.001) + trend_rows(120, 149.0, -0.006)
    reading = RegimeV62Classifier(config).classify(make_bars(rows), {})
    assert reading.label == RegimeLabel.BEAR_TREND


def test_flat_tape_reads_chop(config):
    rows = []
    price = 100.0
    for i in range(400):
        nxt = price * (1 + (0.0015 if i % 2 == 0 else -0.0015))
        rows.append((price, nxt))
        price = nxt
    reading = RegimeV62Classifier(config).classify(make_bars(rows), {})
    assert reading.label == RegimeLabel.CHOP


def test_single_shock_bar_does_not_flip_a_confirmed_regime(config):
    """Confirm-bars + EMA filter: one violent down bar cannot flip a mature
    bull to bear (the candidate must repeat and clear the EMA filter)."""
    rows = trend_rows(560, 100.0, 0.004)
    last_close = rows[-1][1]
    rows.append((last_close, last_close * 0.90))  # one -10% bar, no gap
    reading = RegimeV62Classifier(config).classify(make_bars(rows), {})
    assert reading.label == RegimeLabel.BULL_TREND


def test_gap_shock_delays_the_flip(config):
    """v6.2's gap guard: >4x ATR opening gaps cannot CREATE a flip on their
    own bars — the label holds until the tape earns it without a shock.
    (With enough consecutive gaps, Wilder's ATR adapts and gaps stop
    qualifying as shocks — that adaptation is upstream behavior, so this
    test asserts the DELAY, not a permanent block.)"""
    rows = []
    price = 100.0
    for i in range(400):  # calm, tiny-ATR tape
        nxt = price * (1 + (0.0004 if i % 2 == 0 else -0.0004))
        rows.append((price, nxt))
        price = nxt
    for _ in range(3):    # then pure gap-ups: open +8% above prior close
        o = price * 1.08
        rows.append((o, o * 1.001))
        price = o * 1.001
    reading = RegimeV62Classifier(config).classify(make_bars(rows), {})
    assert reading.label == RegimeLabel.CHOP  # three shock bars: no flip yet
    gap_ev = next(e for e in reading.evidence if e.component == "v62_gap_guard")
    assert "shock" in gap_ev.value


def test_short_history_is_missing_not_guessed(config):
    reading = RegimeV62Classifier(config).classify(
        make_bars(trend_rows(10, 100.0, 0.004)), {})
    assert reading.label == RegimeLabel.CHOP
    assert reading.confidence == 0.0
    assert reading.evidence[0].status == "missing"


def test_every_evidence_has_methodology_and_caveat(config):
    reading = RegimeV62Classifier(config).classify(
        make_bars(trend_rows(560, 100.0, 0.004)), {})
    assert len(reading.evidence) == 5
    for e in reading.evidence:
        assert e.methodology.strip(), e.component
        assert e.caveat.strip(), e.component
        assert e.claim.strip(), e.component
    assert HONESTY == reading.honesty
