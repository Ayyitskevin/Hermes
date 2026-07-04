"""Indicator math on constructed series — including the None-on-short-data
contract (missing stays missing)."""

from __future__ import annotations

import pytest

from hermes.regime.indicators import (
    correlation,
    daily_returns,
    pct_change,
    percentile_rank,
    realized_vol_annualized,
    sma,
    sma_series,
)


def test_sma_basic_and_short():
    assert sma([1, 2, 3, 4], 2) == 3.5
    assert sma([1, 2], 3) is None


def test_sma_series_rolling_matches_direct():
    values = [float(i % 7 + 1) for i in range(60)]
    series = sma_series(values, 10)
    assert series[8] is None
    for i in range(9, 60):
        assert series[i] == pytest.approx(sum(values[i - 9 : i + 1]) / 10)


def test_pct_change():
    assert pct_change([100, 110], 1) == pytest.approx(10.0)
    assert pct_change([100], 1) is None


def test_daily_returns():
    assert daily_returns([100, 110, 99]) == pytest.approx([0.10, -0.10])


def test_realized_vol_flat_series_is_zero():
    assert realized_vol_annualized([100.0] * 40, 20) == pytest.approx(0.0)


def test_realized_vol_short_data_is_none():
    assert realized_vol_annualized([100.0] * 10, 20) is None


def test_percentile_rank():
    hist = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    assert percentile_rank(hist, 10) == 100.0
    assert percentile_rank(hist, 5) == 50.0
    assert percentile_rank([], 5) is None


def test_correlation_perfect_and_inverse():
    a = [0.01, -0.02, 0.03, 0.01, -0.01]
    assert correlation(a, a) == pytest.approx(1.0)
    assert correlation(a, [-x for x in a]) == pytest.approx(-1.0)


def test_correlation_degenerate():
    assert correlation([0.0, 0.0, 0.0], [0.01, 0.02, 0.03]) is None
    assert correlation([0.01], [0.02]) is None
