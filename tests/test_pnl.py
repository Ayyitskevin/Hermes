"""P&L / attribution: the equity curve + exact per-trade index deltas, the
contributions-sum-to-the-index-move invariant, headline stats (index return, max
drawdown, payoff, expectancy R), attribution bucketing by regime/setup/sector/
side ranked by contribution, the small-sample flags, the empty path, and a
no-dollar-figures assertion over HTTP."""

from __future__ import annotations

import json
from datetime import timedelta

from fastapi.testclient import TestClient

from hermes import db
from hermes.data.models import iso, utcnow
from hermes.main import create_app
from hermes.pnl.attribution import SMALL_SAMPLE_BOOK, SMALL_SAMPLE_GROUP, build_pnl


def seed_closed(realized: float, *, alpha: float | None = None, size: float = 5.0,
                risk: float = 1.0, side: str = "long", sector: str | None = None,
                setup: str | None = None, regime: str | None = None) -> int:
    """Insert one CLOSED journal entry with chosen attribution fields."""
    conn = db.connect()
    now = utcnow()
    signal = json.dumps({"label": regime}) if regime else None
    bench = (realized - alpha) if alpha is not None else None
    cur = conn.execute(
        """INSERT INTO journal_entries
           (symbol, side, sector, setup_tag, opened_at, entry_price, stop_price,
            size_pct_equity, planned_risk_pct, thesis, signal_json, status,
            closed_at, exit_price, realized_return_pct, benchmark_return_pct,
            alpha_pct, thesis_played_out, resolution_note)
           VALUES ('AAA', ?, ?, ?, ?, 100, 95, ?, ?, 'seed', ?, 'closed', ?, 100,
                   ?, ?, ?, ?, 'seed')""",
        (side, sector, setup, iso(now - timedelta(days=10)), size, risk, signal,
         iso(now), realized, bench, alpha, "yes" if realized > 0 else "no"),
    )
    conn.commit()
    return int(cur.lastrowid)


class _Index:
    """Appends equity_index rows in order, each producing a chosen delta."""

    def __init__(self) -> None:
        self.v = 100.0

    def move(self, entry_id: int, delta: float) -> None:
        self.v = round(self.v + delta, 4)
        conn = db.connect()
        conn.execute(
            "INSERT INTO equity_index (ts, value, cause) VALUES (?, ?, ?)",
            (iso(utcnow()), self.v, f"journal_close:{entry_id}"),
        )
        conn.commit()


# ── curve, deltas, and the contribution invariant ───────────────────────────
def test_curve_and_contributions_sum_to_index_move(fresh_db):
    idx = _Index()
    idx.move(seed_closed(4.0, regime="bull_trend"), +2.0)
    idx.move(seed_closed(-2.0, regime="chop"), -1.0)
    idx.move(seed_closed(6.0, regime="bull_trend"), +3.0)
    rep = build_pnl(fresh_db)
    assert rep.status == "ok"
    h = rep.headline
    assert h.closed_trades == 3
    assert h.index_now == 104.0                       # 100 +2 -1 +3
    assert h.index_return_pct == 4.0
    assert h.best_pct == 6.0 and h.worst_pct == -2.0
    # every dimension's contributions sum to the index move (deltas are the weight)
    for a in rep.attributions:
        total = round(sum(g.contribution_points for g in a.groups), 4)
        assert total == 4.0


def test_max_drawdown_on_curve(fresh_db):
    idx = _Index()
    idx.move(seed_closed(10.0), +10.0)                # peak 110
    idx.move(seed_closed(-5.0), -11.0)                # trough 99 → dd = 11/110
    rep = build_pnl(fresh_db)
    assert rep.headline.max_drawdown_pct == 10.0      # (110-99)/110*100


def test_payoff_and_expectancy(fresh_db):
    idx = _Index()
    # wins +4R, +4R (realized 4, risk 1); loss -2R (realized -2, risk 1)
    for r in (4.0, 4.0, -2.0):
        idx.move(seed_closed(r), r)
    h = build_pnl(fresh_db).headline
    assert h.avg_win_pct == 4.0 and h.avg_loss_pct == 2.0
    assert h.payoff_ratio == 2.0                       # 4 / 2
    assert h.expectancy_r == 2.0                        # mean R = (4+4-2)/3


# ── attribution bucketing ────────────────────────────────────────────────────
def test_attribution_by_regime_ranked_by_contribution(fresh_db):
    idx = _Index()
    idx.move(seed_closed(3.0, regime="bull_trend"), +3.0)
    idx.move(seed_closed(2.0, regime="bull_trend"), +2.0)
    idx.move(seed_closed(-1.0, regime="chop"), -1.0)
    rep = build_pnl(fresh_db)
    regime = next(a for a in rep.attributions if a.dimension == "regime")
    # ranked by contribution: bull (+5) before chop (-1)
    assert regime.groups[0].label == "Bull trend"
    assert regime.groups[0].n == 2 and regime.groups[0].contribution_points == 5.0
    assert regime.groups[1].label == "Rangebound" and regime.groups[1].contribution_points == -1.0


def test_untagged_and_no_reading_labeled_honestly(fresh_db):
    idx = _Index()
    idx.move(seed_closed(1.0), +1.0)                   # no regime, no setup, no sector
    rep = build_pnl(fresh_db)
    regime = next(a for a in rep.attributions if a.dimension == "regime")
    setup = next(a for a in rep.attributions if a.dimension == "setup")
    sector = next(a for a in rep.attributions if a.dimension == "sector")
    assert regime.groups[0].label == "No reading at entry"
    assert setup.groups[0].label == "Untagged"
    assert sector.groups[0].label == "Unspecified"


def test_dimensions_present(fresh_db):
    idx = _Index()
    idx.move(seed_closed(1.0, side="short", sector="Tech", setup="pullback"), +1.0)
    dims = {a.dimension for a in build_pnl(fresh_db).attributions}
    assert dims == {"position", "regime", "setup", "sector", "side"}


def test_per_position_attribution(fresh_db):
    idx = _Index()
    idx.move(seed_closed(4.0), +3.0)                    # AAA is seeded as symbol 'AAA'
    idx.move(seed_closed(-2.0), -1.0)
    rep = build_pnl(fresh_db)
    pos = next(a for a in rep.attributions if a.dimension == "position")
    # both closed trades are AAA → one bucket carrying the full move
    assert pos.groups[0].label == "AAA" and pos.groups[0].n == 2
    assert round(pos.groups[0].contribution_points, 4) == 2.0


# ── small-sample honesty ─────────────────────────────────────────────────────
def test_small_sample_flags(fresh_db):
    idx = _Index()
    for _ in range(3):
        idx.move(seed_closed(1.0, regime="bull_trend"), +1.0)
    rep = build_pnl(fresh_db)
    assert rep.headline.small_sample is True           # 3 < 20 book-wide
    regime = next(a for a in rep.attributions if a.dimension == "regime")
    assert regime.groups[0].small_sample is True        # 3 < 10 per bucket
    assert "anecdote" in rep.headline.note


def test_book_small_sample_clears_past_threshold(fresh_db):
    idx = _Index()
    for _ in range(SMALL_SAMPLE_BOOK + 1):
        idx.move(seed_closed(1.0), +0.5)
    assert build_pnl(fresh_db).headline.small_sample is False
    # a bucket of that size clears its own (lower) threshold too
    assert SMALL_SAMPLE_GROUP < SMALL_SAMPLE_BOOK


# ── empty + over HTTP ────────────────────────────────────────────────────────
def test_empty_when_no_closed_trades(fresh_db):
    rep = build_pnl(fresh_db)
    assert rep.status == "empty" and rep.headline is None
    assert "100 flat start" in rep.note


def test_pnl_over_http_and_no_dollars(config):
    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    idx = _Index()
    idx.move(seed_closed(4.0, alpha=1.5, regime="bull_trend", sector="Tech"), +2.0)
    j = client.get("/api/pnl").json()
    assert j["status"] == "ok"
    assert j["headline"]["index_now"] == 102.0
    assert len(j["attributions"]) == 5      # position + regime/setup/sector/side
    assert "$" not in json.dumps(j)                     # % / index only, ever
