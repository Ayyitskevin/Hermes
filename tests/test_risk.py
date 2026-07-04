"""Risk engine: sizing arithmetic, limits, drawdown breaker, correlation."""

from __future__ import annotations

import json

import pytest

from hermes import db
from hermes.data.models import iso, utcnow
from hermes.risk.engine import (
    current_equity_index,
    evaluate,
    size_position,
    unacknowledged_events,
)


def test_fixed_fractional_sizing(config):
    # 1% risk, stop 5% away → 20% position
    r = size_position(config, entry_price=100.0, stop_price=95.0, side="long")
    assert r.size_pct_equity == pytest.approx(20.0)
    assert r.planned_risk_pct == pytest.approx(1.0)
    assert r.capped_by is None


def test_sizing_caps_at_max_position(config):
    # stop 1% away → raw 100% position → capped at 20%, risk shrinks to 0.2%
    r = size_position(config, entry_price=100.0, stop_price=99.0, side="long")
    assert r.size_pct_equity == pytest.approx(config.risk.max_position_size_pct)
    assert r.capped_by == "max_position_size_pct"
    assert r.planned_risk_pct == pytest.approx(0.2)


def test_sizing_rejects_stops_on_wrong_side(config):
    with pytest.raises(ValueError):
        size_position(config, entry_price=100.0, stop_price=105.0, side="long")
    with pytest.raises(ValueError):
        size_position(config, entry_price=100.0, stop_price=95.0, side="short")


def _insert_position(symbol, size_pct, risk_pct, sector=None):
    db.connect().execute(
        """INSERT INTO journal_entries
           (symbol, side, sector, opened_at, entry_price, stop_price,
            size_pct_equity, planned_risk_pct, thesis)
           VALUES (?, 'long', ?, ?, 100, 95, ?, ?, 'test thesis')""",
        (symbol, sector, iso(utcnow()), size_pct, risk_pct),
    )
    db.connect().commit()


def test_open_risk_breach_detected_and_persisted(fresh_db, config):
    for i in range(5):
        _insert_position(f"SYM{i}", 10.0, 1.0)  # 5% total > 4% cap
    state = evaluate(config)
    assert state.level == "breach"
    open_risk = next(c for c in state.checks if c.kind == "max_open_risk")
    assert open_risk.level == "breach"
    events = unacknowledged_events()
    assert any(e["kind"] == "max_open_risk" and e["severity"] == "breach" for e in events)


def test_untagged_sector_warns(fresh_db, config):
    _insert_position("AAA", 10.0, 1.0, sector=None)
    state = evaluate(config)
    sector = next(c for c in state.checks if c.kind == "sector_exposure")
    assert sector.level == "warn"
    assert "no sector tag" in sector.observed


def test_drawdown_circuit_breaker(fresh_db, config):
    conn = db.connect()
    now = iso(utcnow())
    for value in (100.0, 112.0, 100.5):  # 10.27% off the 112 peak > 10% limit
        conn.execute(
            "INSERT INTO equity_index (ts, value, cause) VALUES (?, ?, 'test')",
            (now, value),
        )
    conn.commit()
    equity, drawdown = current_equity_index()
    assert equity == pytest.approx(100.5)
    assert drawdown == pytest.approx(10.27, abs=0.01)
    state = evaluate(config)
    dd = next(c for c in state.checks if c.kind == "drawdown")
    assert dd.level == "breach"
    assert state.level == "breach"


def test_correlated_positions_warn(fresh_db, config):
    # Two symbols with identical planted return streams → correlation 1.0
    conn = db.connect()
    now = utcnow()
    price_a, price_b = 100.0, 50.0
    from datetime import timedelta
    for i in range(70):
        move = 0.01 if i % 3 else -0.008
        price_a *= 1 + move
        price_b *= 1 + move
        ts = iso(now - timedelta(days=70 - i))
        for sym, px in (("AAA", price_a), ("BBB", price_b)):
            conn.execute(
                """INSERT INTO bars (symbol, timeframe, ts, open, high, low, close,
                   volume, source, fetched_at) VALUES (?, '1Day', ?, ?, ?, ?, ?, 1, 'test', ?)""",
                (sym, ts, px, px, px, px, iso(now)),
            )
    conn.commit()
    _insert_position("AAA", 10.0, 1.0, "tech")
    _insert_position("BBB", 10.0, 1.0, "tech")
    state = evaluate(config)
    corr = next(c for c in state.checks if c.kind == "correlation")
    assert corr.level == "warn"
    assert "+1.00" in corr.observed


def test_no_dollar_figures_in_risk_output(fresh_db, config):
    _insert_position("AAA", 10.0, 1.0, "tech")
    state = evaluate(config)
    dumped = json.dumps([c.__dict__ for c in state.checks])
    assert "$" not in dumped
