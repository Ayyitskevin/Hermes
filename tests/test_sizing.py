"""Sizing desk: the fixed-fractional baseline, the empirical half-Kelly tilt and
its shrink toward that baseline with small n, the limit-aware cap naming the
binding constraint, side inference, input validation, and a no-dollar-figures
assertion over the HTTP payload. Seeds closed journal trades directly so the
edge is exercised without the propose/commit path."""

from __future__ import annotations

import json
from datetime import timedelta

from fastapi.testclient import TestClient

from hermes import db
from hermes.data.models import iso, utcnow
from hermes.main import create_app
from hermes.sizing.desk import build_size_plan


def seed_closed_trade(symbol: str, realized_pct: float, planned_risk_pct: float,
                      *, side: str = "long", size_pct: float = 5.0,
                      sector: str | None = None) -> None:
    """Insert one CLOSED journal entry with a realized R-multiple. Bypasses
    propose/commit — we only need realized_return_pct / planned_risk_pct."""
    conn = db.connect()
    now = utcnow()
    conn.execute(
        """INSERT INTO journal_entries
           (symbol, side, sector, opened_at, entry_price, stop_price,
            size_pct_equity, planned_risk_pct, thesis, status, closed_at,
            exit_price, realized_return_pct, thesis_played_out, resolution_note)
           VALUES (?, ?, ?, ?, 100, 95, ?, ?, 'seed', 'closed', ?, 100, ?,
                   'yes', 'seed')""",
        (symbol, side, sector, iso(now - timedelta(days=10)), size_pct,
         planned_risk_pct, iso(now), realized_pct),
    )
    conn.commit()


def seed_open_position(symbol: str, *, size_pct: float, risk_pct: float,
                       side: str = "long", sector: str | None = None) -> None:
    conn = db.connect()
    conn.execute(
        """INSERT INTO journal_entries
           (symbol, side, sector, opened_at, entry_price, stop_price,
            size_pct_equity, planned_risk_pct, thesis, status)
           VALUES (?, ?, ?, ?, 100, 95, ?, ?, 'seed', 'open')""",
        (symbol, side, sector, iso(utcnow()), size_pct, risk_pct),
    )
    conn.commit()


# ── layer 1: fixed-fractional baseline ──────────────────────────────────────
def test_baseline_when_no_edge(fresh_db):
    """With no closed trades, the blended risk IS the fixed baseline and Kelly
    reports 'insufficient' rather than inventing an edge."""
    plan = build_size_plan(fresh_db, "XLK", entry=100.0, stop=95.0)
    assert plan.status == "ok"
    assert plan.kelly.status == "insufficient"
    assert plan.blended_risk_pct == plan.fixed_risk_pct == 1.0
    assert plan.shrink == 0.0
    # 1% risk over a 5% stop → 20% of equity, then capped by the 20% position ceiling.
    assert plan.size_pct_equity == 20.0
    assert plan.planned_risk_pct == 1.0


def test_all_wins_stays_on_baseline(fresh_db):
    """An all-wins streak leaves the payoff ratio undefined — the desk must NOT
    extrapolate an edge; it stays on the baseline."""
    for _ in range(5):
        seed_closed_trade("AAA", realized_pct=3.0, planned_risk_pct=1.0)
    plan = build_size_plan(fresh_db, "XLK", entry=100.0, stop=90.0)
    assert plan.kelly.status == "insufficient"
    assert "undefined" in plan.kelly.note
    assert plan.blended_risk_pct == plan.fixed_risk_pct


# ── layer 2: half-Kelly shrinks toward the baseline with small n ─────────────
def _seed_edge(n: int) -> None:
    """A positive edge: 60% winners at +2R, 40% losers at -1R → payoff 2,
    Kelly = 0.6 - 0.4/2 = 0.40 → 40% full, 20% half."""
    for i in range(n):
        if i % 5 < 3:
            seed_closed_trade("AAA", realized_pct=2.0, planned_risk_pct=1.0)
        else:
            seed_closed_trade("AAA", realized_pct=-1.0, planned_risk_pct=1.0)


def test_kelly_shrinks_with_small_n(fresh_db):
    """Same edge, more trades → the blended risk moves further from the fixed
    baseline toward half-Kelly. Shrink = n/(n+30) is strictly increasing in n."""
    _seed_edge(10)
    small = build_size_plan(fresh_db, "XLK", entry=100.0, stop=95.0)

    # add more trades of the identical edge
    _seed_edge(50)   # AAA now has 60 closed trades total
    big = build_size_plan(fresh_db, "XLK", entry=100.0, stop=95.0)

    assert small.kelly.status == "ok" and big.kelly.status == "ok"
    # identical edge stats regardless of n
    assert small.kelly.half_kelly_pct == big.kelly.half_kelly_pct
    # but the shrink pulls the small sample much closer to the 1% baseline
    assert small.kelly.anecdote is True and big.kelly.anecdote is False
    assert small.shrink < big.shrink
    assert small.blended_risk_pct < big.blended_risk_pct
    # both sit above the pure baseline (there IS a positive edge) …
    assert big.blended_risk_pct > small.blended_risk_pct > 1.0
    # … and below the raw half-Kelly (the shrink never overshoots it)
    assert big.blended_risk_pct < big.kelly.half_kelly_pct


def test_kelly_math(fresh_db):
    _seed_edge(100)
    plan = build_size_plan(fresh_db, "XLK", entry=100.0, stop=95.0)
    k = plan.kelly
    assert k.win_rate_pct == 60.0
    assert k.payoff_ratio == 2.0
    assert k.kelly_full_pct == 40.0
    assert k.half_kelly_pct == 20.0
    # design-parity extras: quarter Kelly, expectancy, avg win/loss, R strip, curve
    assert k.quarter_kelly_pct == 10.0
    assert k.expectancy_r == round((60 * 2 + 40 * -1) / 100, 2)   # 0.8R
    assert k.avg_win_r == 2.0 and k.avg_loss_r == 1.0
    assert len(k.r_multiples) == 100 and k.r_multiples == sorted(k.r_multiples)
    # growth curve peaks at (or before) full Kelly and turns down past it
    assert len(k.growth_curve) > 10
    peak = max(k.growth_curve, key=lambda p: p["g"])
    assert 0 < peak["f_pct"] <= k.kelly_full_pct + 5
    assert k.growth_curve[-1]["g"] < peak["g"]           # ruin drag past the peak


# ── layer 3: the tightest limit binds, and is named ─────────────────────────
def test_position_ceiling_binds(fresh_db):
    """A tight stop wants a huge size; the per-position ceiling clamps it and is
    named as the binding constraint."""
    plan = build_size_plan(fresh_db, "XLK", entry=100.0, stop=99.0)   # 1% stop
    assert plan.binding_constraint == "position"
    assert plan.size_pct_equity == 20.0                               # max_position_size_pct
    assert next(c for c in plan.caps if c.key == "position").binding is True


def test_open_risk_budget_binds(fresh_db):
    """With most of the open-risk budget already spent, the remaining budget —
    not the position ceiling — is what binds."""
    seed_open_position("AAA", size_pct=10.0, risk_pct=3.5)   # 3.5% of the 4% budget gone
    plan = build_size_plan(fresh_db, "XLK", entry=100.0, stop=95.0)  # 5% stop
    # remaining budget 0.5% over a 5% stop → 10% size, below the 20% position cap
    assert plan.binding_constraint == "open_risk"
    assert plan.size_pct_equity == 10.0
    assert plan.planned_risk_pct == 0.5


def test_no_budget_left_is_zero_not_negative(fresh_db):
    seed_open_position("AAA", size_pct=10.0, risk_pct=4.0)   # full budget spent
    plan = build_size_plan(fresh_db, "XLK", entry=100.0, stop=95.0)
    assert plan.size_pct_equity == 0.0
    assert plan.binding_constraint == "open_risk"
    assert "no room" in plan.note


def test_sector_ceiling_binds(fresh_db):
    seed_open_position("AAA", size_pct=25.0, risk_pct=0.5, sector="Tech")
    plan = build_size_plan(fresh_db, "XLK", entry=100.0, stop=99.0, sector="Tech")
    # 30% sector cap, 25% already in Tech → 5% headroom, tighter than the 20% position cap
    assert plan.binding_constraint == "sector"
    assert plan.size_pct_equity == 5.0


def test_model_binds_when_no_limit_cuts(fresh_db):
    """A wide stop makes the model size small enough that no risk limit reduces
    it — the model itself is reported as binding."""
    plan = build_size_plan(fresh_db, "XLK", entry=100.0, stop=50.0)   # 50% stop
    # 1% risk / 50% stop → 2% size, well under every ceiling
    assert plan.size_pct_equity == 2.0
    assert plan.binding_constraint == "model"


# ── side inference + reward:risk ─────────────────────────────────────────────
def test_side_inferred_and_reward_risk(fresh_db):
    long = build_size_plan(fresh_db, "XLK", entry=100.0, stop=95.0, target=110.0)
    assert long.side == "long"
    assert long.reward_risk_ratio == 2.0            # +10% reward / 5% stop
    short = build_size_plan(fresh_db, "XLK", entry=100.0, stop=105.0, target=90.0)
    assert short.side == "short"
    assert short.reward_risk_ratio == 2.0           # +10% reward (down) / 5% stop


# ── validation ───────────────────────────────────────────────────────────────
def test_invalid_inputs_error(fresh_db):
    assert build_size_plan(fresh_db, "XLK", entry=0.0, stop=95.0).status == "error"
    assert build_size_plan(fresh_db, "XLK", entry=100.0, stop=100.0).status == "error"
    assert build_size_plan(fresh_db, "XLK", entry=100.0, stop=-5.0).status == "error"


# ── over HTTP + no dollar figures ───────────────────────────────────────────
def test_size_over_http_and_no_dollars(config):
    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    _seed_edge(40)
    j = client.get("/api/size?symbol=XLK&entry=100&stop=95&target=115").json()
    assert j["status"] == "ok"
    assert j["side"] == "long"
    assert j["size_pct_equity"] is not None
    assert j["binding_constraint"] in ("model", "position", "open_risk", "sector")
    assert j["kelly"]["status"] == "ok"
    assert "$" not in json.dumps(j)                  # % of equity only, ever
