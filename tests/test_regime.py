"""Regime classifier on constructed tapes with known character."""

from __future__ import annotations

import math
from datetime import timedelta

from hermes.data.models import Bar, utcnow
from hermes.regime.engine import latest_reading, store_reading
from hermes.regime.models import RegimeLabel
from hermes.regime.reference import ReferenceRegimeClassifier


def make_bars(closes: list[float], symbol: str = "SPY") -> list[Bar]:
    now = utcnow()
    n = len(closes)
    return [
        Bar(symbol=symbol, timeframe="1Day",
            ts=now - timedelta(days=(n - i)), open=c, high=c * 1.005,
            low=c * 0.995, close=c, volume=1_000_000, source="test",
            fetched_at=now)
        for i, c in enumerate(closes)
    ]


def steady_trend(n: int, start: float, daily: float) -> list[float]:
    return [start * (1 + daily) ** i for i in range(n)]


def wl(closes):  # watchlist of six clones — breadth follows the benchmark
    return {s: make_bars(closes, s) for s in ["QQQ", "IWM", "XLK", "XLE", "XLF", "XLV"]}


def test_bull_tape_reads_bull(config):
    closes = steady_trend(560, 100.0, 0.0006)
    reading = ReferenceRegimeClassifier(config).classify(make_bars(closes), wl(closes))
    assert reading.label == RegimeLabel.BULL_TREND
    assert reading.score > 0.5
    assert reading.confidence > 0.4
    assert all(e.signal is not None for e in reading.evidence)


def test_bear_tape_reads_bear_or_stress(config):
    closes = steady_trend(400, 100.0, 0.0004) + steady_trend(160, 100.0, -0.0035)
    reading = ReferenceRegimeClassifier(config).classify(make_bars(closes), wl(closes))
    assert reading.label in (RegimeLabel.BEAR_TREND, RegimeLabel.STRESS)
    assert reading.score < 0


def test_volatile_decline_reads_stress(config):
    # calm uptrend, then a violent oscillating decline: vol percentile spikes
    calm = steady_trend(500, 100.0, 0.0005)
    crash = []
    price = calm[-1]
    for i in range(60):
        price *= 1 + (-0.045 if i % 2 == 0 else 0.02)
        crash.append(price)
    closes = calm + crash
    reading = ReferenceRegimeClassifier(config).classify(make_bars(closes), wl(closes))
    vol_e = next(e for e in reading.evidence if e.component == "vol_regime")
    assert vol_e.status == "stress"
    assert reading.label == RegimeLabel.STRESS


def test_short_history_is_missing_not_guessed(config):
    closes = steady_trend(30, 100.0, 0.001)
    reading = ReferenceRegimeClassifier(config).classify(make_bars(closes), {})
    missing = [e for e in reading.evidence if e.status == "missing"]
    assert len(missing) >= 3  # 200SMA, vol percentile, momentum, breadth all short
    assert all(e.signal is None for e in missing)
    # confidence is discounted for missing coverage
    assert reading.confidence < 0.6


def test_every_evidence_has_methodology_and_caveat(config):
    closes = steady_trend(560, 100.0, 0.0006)
    reading = ReferenceRegimeClassifier(config).classify(make_bars(closes), wl(closes))
    for e in reading.evidence:
        assert e.methodology.strip(), e.component
        assert e.caveat.strip(), e.component
        assert e.claim.strip(), e.component
    assert "not a backtested edge" in reading.honesty


def test_reading_roundtrip(fresh_db, config):
    closes = steady_trend(560, 100.0, 0.0006)
    reading = ReferenceRegimeClassifier(config).classify(make_bars(closes), wl(closes))
    store_reading(reading)
    loaded = latest_reading()
    assert loaded.label == reading.label
    assert loaded.score == reading.score
    assert len(loaded.evidence) == len(reading.evidence)
    assert loaded.evidence[0].methodology == reading.evidence[0].methodology


def test_v62_slot_refuses_to_guess(config):
    import pytest

    from hermes.regime.v62 import RegimeV62Classifier
    with pytest.raises(NotImplementedError):
        RegimeV62Classifier(config)


def test_reference_has_no_nan_scores(config):
    # degenerate flat tape: everything computable should still be finite
    closes = [100.0] * 560
    reading = ReferenceRegimeClassifier(config).classify(make_bars(closes), wl(closes))
    assert math.isfinite(reading.score)
    assert math.isfinite(reading.confidence)
