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


def test_benchmark_window_math_with_real_holding_period(fresh_db, config):
    """Pin the benchmark window (opened_at -> closed_at) with a KNOWN nonzero
    benchmark return — a swapped or mis-anchored window cannot pass this."""
    conn = db.connect()
    now = utcnow()
    # Benchmark: 100.0 thirty days ago, rising 0.5/day → known values at both anchors.
    for i in range(0, 31):
        ts = iso(now - timedelta(days=30 - i))
        px = 100.0 + 0.5 * i
        conn.execute(
            """INSERT INTO bars (symbol, timeframe, ts, open, high, low, close,
               volume, source, fetched_at) VALUES ('SPY', '1Day', ?, ?, ?, ?, ?, 1, 'test', ?)""",
            (ts, px, px, px, px, iso(now)),
        )
    # Entry opened 20 days ago (benchmark close then: 100 + 0.5*10 = 105.0);
    # closing now anchors to today's bar (100 + 0.5*30 = 115.0).
    opened_at = iso(now - timedelta(days=20))
    conn.execute(
        """INSERT INTO journal_entries
           (symbol, side, opened_at, entry_price, stop_price, size_pct_equity,
            planned_risk_pct, thesis)
           VALUES ('XLK', 'long', ?, 100, 95, 10.0, 0.5, 'backdated test thesis')""",
        (opened_at,),
    )
    conn.commit()
    entry_id = conn.execute("SELECT MAX(id) AS i FROM journal_entries").fetchone()["i"]

    result = close_entry(config, entry_id, exit_price=112.0,
                         thesis_played_out="partial", resolution_note="Window math test.")
    expected_bench = (115.0 / 105.0 - 1.0) * 100.0
    assert result["benchmark_return_pct"] == pytest.approx(expected_bench, abs=0.01)
    assert result["alpha_pct"] == pytest.approx(12.0 - expected_bench, abs=0.01)


def test_stale_benchmark_anchor_yields_missing_not_truncated(fresh_db, config):
    """If benchmark bars stopped syncing long before the close, alpha must be
    missing — never quietly computed over a truncated window."""
    conn = db.connect()
    now = utcnow()
    # Bars exist only 30..10 days ago; the close 'now' has no fresh anchor.
    for i in range(0, 21):
        ts = iso(now - timedelta(days=30 - i))
        conn.execute(
            """INSERT INTO bars (symbol, timeframe, ts, open, high, low, close,
               volume, source, fetched_at)
               VALUES ('SPY', '1Day', ?, 100, 100, 100, 100, 1, 'test', ?)""",
            (ts, iso(now)),
        )
    opened_at = iso(now - timedelta(days=20))
    conn.execute(
        """INSERT INTO journal_entries
           (symbol, side, opened_at, entry_price, stop_price, size_pct_equity,
            planned_risk_pct, thesis)
           VALUES ('XLE', 'long', ?, 80, 76, 10.0, 0.5, 'stale anchor test')""",
        (opened_at,),
    )
    conn.commit()
    entry_id = conn.execute("SELECT MAX(id) AS i FROM journal_entries").fetchone()["i"]
    result = close_entry(config, entry_id, exit_price=84.0,
                         thesis_played_out="yes", resolution_note="Anchor staleness test.")
    assert result["benchmark_return_pct"] is None
    assert result["alpha_pct"] is None


def test_double_close_rejected_and_equity_moves_once(fresh_db, config):
    p = propose_entry(config, symbol="QQQ", side="long", entry_price=100.0,
                      stop_price=95.0, thesis="Double-close guard test thesis.")
    entry_id = commit_entry(config, p)
    close_entry(config, entry_id, exit_price=105.0, thesis_played_out="yes",
                resolution_note="First close.")
    with pytest.raises(JournalError):
        close_entry(config, entry_id, exit_price=110.0, thesis_played_out="yes",
                    resolution_note="Second close must fail.")
    rows = db.connect().execute("SELECT COUNT(*) AS n FROM equity_index").fetchone()
    assert rows["n"] == 1  # the equity index moved exactly once


def test_missing_benchmark_yields_null_alpha_not_guess(fresh_db, config):
    # No SPY bars at all → benchmark/alpha must be None (missing), not 0
    p = propose_entry(config, symbol="XLE", side="long", entry_price=80.0,
                      stop_price=76.0, thesis="Energy leadership rotation continues.")
    entry_id = commit_entry(config, p)
    result = close_entry(config, entry_id, exit_price=84.0,
                         thesis_played_out="yes", resolution_note="Worked.")
    assert result["benchmark_return_pct"] is None
    assert result["alpha_pct"] is None
