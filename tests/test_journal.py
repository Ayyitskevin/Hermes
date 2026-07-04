"""Journal lifecycle: propose → reviewer → commit → close → resolution."""

from __future__ import annotations

from datetime import timedelta

import pytest

from hermes import db
from hermes.data.models import iso, utcnow
from hermes.journal.service import (
    JournalError,
    close_entry,
    commit_entry,
    list_entries,
    performance_summary,
    propose_entry,
)


def seed_benchmark(returns_pct_total: float, days: int = 30):
    """Plant benchmark bars so alpha resolution has something to measure."""
    conn = db.connect()
    now = utcnow()
    price = 100.0
    daily = (1 + returns_pct_total / 100.0) ** (1 / days) - 1
    for i in range(days + 1):
        ts = iso(now - timedelta(days=days - i))
        conn.execute(
            """INSERT INTO bars (symbol, timeframe, ts, open, high, low, close,
               volume, source, fetched_at) VALUES ('SPY', '1Day', ?, ?, ?, ?, ?, 1, 'test', ?)""",
            (ts, price, price, price, price, iso(now)),
        )
        price *= 1 + daily
    conn.commit()


def test_propose_requires_thesis(fresh_db, config):
    with pytest.raises(JournalError):
        propose_entry(config, symbol="SPY", side="long", entry_price=100,
                      stop_price=95, thesis="   ")


def test_propose_returns_review_and_frozen_signal(fresh_db, config):
    p = propose_entry(
        config, symbol="spy", side="long", entry_price=100.0, stop_price=95.0,
        thesis="Breakout above the 50-day defends the 95 level on sector strength.",
        setup_tag="regime-pullback",
    )
    assert p["symbol"] == "SPY"
    assert p["sizing"]["size_pct_equity"] == pytest.approx(20.0)
    assert p["review"]["verdict"] in ("clear", "caution", "blocked")
    # No regime reading exists yet → signal state is frozen as None, not faked
    assert p["signal_state"]["label"] is None
    # Ollama is dead in tests → the skipped LLM pass is explicit
    assert p["review"]["llm_critique"] is None
    assert p["review"]["llm_source"] == "none"
    # sample-size flag must fire: this setup has no closed trades
    assert any(f["check"] == "sample_size" for f in p["review"]["flags"])


def test_commit_and_close_resolves_against_benchmark(fresh_db, config):
    seed_benchmark(returns_pct_total=2.0)
    p = propose_entry(
        config, symbol="XLK", side="long", entry_price=100.0, stop_price=95.0,
        thesis="Sector leadership continues while the benchmark trend holds.",
    )
    entry_id = commit_entry(config, p)

    result = close_entry(
        config, entry_id, exit_price=110.0, thesis_played_out="yes",
        resolution_note="Leadership held; exited into strength at target.",
    )
    assert result["realized_return_pct"] == pytest.approx(10.0)
    # benchmark over ~0 days of holding ≈ 0; alpha ≈ realized
    assert result["benchmark_return_pct"] is not None
    assert result["alpha_pct"] == pytest.approx(
        result["realized_return_pct"] - result["benchmark_return_pct"])
    # equity index moved by size-weighted realized return: 20% * 10% = +2%
    assert result["equity_index"] == pytest.approx(102.0)

    entry = list_entries(status="closed")[0]
    assert entry["thesis_played_out"] == "yes"
    assert entry["resolution_note"].startswith("Leadership held")


def test_close_requires_thesis_verdict_and_note(fresh_db, config):
    p = propose_entry(config, symbol="IWM", side="long", entry_price=50.0,
                      stop_price=47.5, thesis="Small caps reclaim the range low.")
    entry_id = commit_entry(config, p)
    with pytest.raises(JournalError):
        close_entry(config, entry_id, exit_price=51.0,
                    thesis_played_out="maybe", resolution_note="note here")
    with pytest.raises(JournalError):
        close_entry(config, entry_id, exit_price=51.0,
                    thesis_played_out="yes", resolution_note=" ")


def test_short_side_return_math(fresh_db, config):
    p = propose_entry(config, symbol="QQQ", side="short", entry_price=100.0,
                      stop_price=105.0, thesis="Failed retest of the broken level.")
    entry_id = commit_entry(config, p)
    result = close_entry(config, entry_id, exit_price=90.0,
                         thesis_played_out="yes", resolution_note="Broke down as expected.")
    assert result["realized_return_pct"] == pytest.approx(10.0)


def test_performance_summary_small_sample_honesty(fresh_db, config):
    p = propose_entry(config, symbol="SPY", side="long", entry_price=100.0,
                      stop_price=95.0, thesis="Trend continuation off the weekly level.")
    entry_id = commit_entry(config, p)
    close_entry(config, entry_id, exit_price=104.0, thesis_played_out="partial",
                resolution_note="Half worked; chopped out of the rest.")
    perf = performance_summary()
    assert perf["closed_trades"] == 1
    assert "anecdote" in perf["note"]


def test_missing_benchmark_yields_null_alpha_not_guess(fresh_db, config):
    # No SPY bars at all → benchmark/alpha must be None (missing), not 0
    p = propose_entry(config, symbol="XLE", side="long", entry_price=80.0,
                      stop_price=76.0, thesis="Energy leadership rotation continues.")
    entry_id = commit_entry(config, p)
    result = close_entry(config, entry_id, exit_price=84.0,
                         thesis_played_out="yes", resolution_note="Worked.")
    assert result["benchmark_return_pct"] is None
    assert result["alpha_pct"] is None
