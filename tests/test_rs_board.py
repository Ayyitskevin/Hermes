"""RS leadership board: verdict rules, RS-line alignment, missing honesty."""

from __future__ import annotations

from datetime import timedelta

from hermes.data.models import Bar, utcnow
from hermes.rs.board import _row, _rs_line, _verdict


def make_bars(closes: list[float], symbol: str) -> list[Bar]:
    now = utcnow()
    n = len(closes)
    return [
        Bar(symbol=symbol, timeframe="1Day", ts=now - timedelta(days=n - i),
            open=c, high=c * 1.004, low=c * 0.996, close=c,
            volume=1_000_000, source="test", fetched_at=now)
        for i, c in enumerate(closes)
    ]


def test_verdicts_under_bull_regime():
    # Leader: positive Mansfield, rising, at an RS high → HI-CONV.
    assert _verdict(12.0, 0.5, True, False, True, "Bull")[0] == "HI-CONV"
    # Positive but not at a new high → LONG-OK.
    assert _verdict(8.0, 0.5, False, False, True, "Bull")[0] == "LONG-OK"
    # Positive but falling → WATCH.
    assert _verdict(3.0, -0.4, False, False, True, "Bull")[0] == "WATCH"
    # Negative and falling, or RS new low → SKIP-LAG.
    assert _verdict(-6.0, -0.2, False, False, True, "Bull")[0] == "SKIP-LAG"
    assert _verdict(2.0, 0.1, False, True, True, "Bull")[0] == "SKIP-LAG"


def test_non_bull_regime_caps_at_watch_but_skip_survives():
    verdict, note = _verdict(12.0, 0.5, True, False, False, "Rangebound")
    assert verdict == "WATCH" and "HI-CONV" in note and "Rangebound" in note
    # SKIP-LAG is a refusal, not a permission — no cap applies.
    assert _verdict(-6.0, -0.2, False, False, False, "Rangebound")[0] == "SKIP-LAG"


def test_unknown_slope_is_neither_rising_nor_falling():
    # slope None: positive Mansfield cannot claim HI-CONV (needs rising)…
    assert _verdict(8.0, None, True, False, True, "Bull")[0] == "LONG-OK"
    # …and negative Mansfield cannot be condemned as falling.
    assert _verdict(-3.0, None, False, False, True, "Bull")[0] == "WATCH"


def test_rs_line_aligns_on_shared_dates_only():
    sym = make_bars([10.0, 11.0, 12.0], "AAA")
    bench = make_bars([100.0, 100.0, 100.0], "SPY")[:-1]  # last date missing
    rs, last = _rs_line(sym, bench)
    assert rs == [0.10, 0.11]           # unshared date skipped, not filled
    assert last is not None and last.close == 11.0


def test_short_history_is_missing_never_guessed():
    sym = make_bars([10.0] * 50, "AAA")
    bench = make_bars([100.0] * 50, "SPY")
    row = _row("AAA", sym, bench, True, "Bull", stale_after_minutes=4320)
    assert row.status == "missing" and row.verdict is None
    assert row.mansfield is None and "bars" in row.note


def test_leader_and_laggard_rows_end_to_end():
    n = 260
    bench = make_bars([100.0 * (1.0005 ** i) for i in range(n)], "SPY")
    leader = make_bars([50.0 * (1.003 ** i) for i in range(n)], "LEAD")
    laggard = make_bars([50.0 * (0.999 ** i) for i in range(n)], "LAG")
    lead_row = _row("LEAD", leader, bench, True, "Bull", 4320)
    lag_row = _row("LAG", laggard, bench, True, "Bull", 4320)
    assert lead_row.status == "ok" and lead_row.mansfield > 0
    assert lead_row.verdict in ("HI-CONV", "LONG-OK")
    assert lag_row.verdict == "SKIP-LAG" and lag_row.mansfield < 0
    # Non-bull regime caps the leader, never the laggard.
    capped = _row("LEAD", leader, bench, False, "Rangebound", 4320)
    assert capped.verdict == "WATCH" and "outranks selection" in capped.note
