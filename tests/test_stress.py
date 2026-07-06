"""Stress test: the empty-book path, beta-driven shock direction (long loses /
short gains in a drop), the crisis beta floor deepening the hit, all-stops-hit =
Σ planned risk, circuit-breach detection + the cash-priority hedge, the
beta-estimated flag for missing history, projected drawdown from the index peak,
and a no-dollar-figures assertion over HTTP."""

from __future__ import annotations

import json
from datetime import timedelta

from fastapi.testclient import TestClient

from hermes import db
from hermes.data.models import iso, utcnow
from hermes.main import create_app
from hermes.stress.scenarios import build_stress

# A varying benchmark return path (nonzero variance) → clean betas.
_R = [0.01, -0.02, 0.015, -0.01, 0.02, -0.005] * 25          # 150 returns


def _closes_from_returns(rets: list[float], start: float = 100.0) -> list[float]:
    closes = [start]
    for r in rets:
        closes.append(closes[-1] * (1.0 + r))
    return closes


def seed_bars(symbol: str, closes: list[float]) -> None:
    conn = db.connect()
    now = utcnow()
    n = len(closes)
    for i, px in enumerate(closes):
        conn.execute(
            "INSERT INTO bars (symbol, timeframe, ts, open, high, low, close, "
            "volume, source, fetched_at) VALUES (?, '1Day', ?, ?, ?, ?, ?, 1, 'test', ?)",
            (symbol, iso(now - timedelta(days=n - i)), px, px, px, px, iso(now)),
        )
    conn.commit()


def seed_open(symbol: str, *, side: str = "long", size: float = 10.0,
              risk: float = 1.0, sector: str | None = None) -> None:
    conn = db.connect()
    conn.execute(
        """INSERT INTO journal_entries
           (symbol, side, sector, opened_at, entry_price, stop_price, size_pct_equity,
            planned_risk_pct, thesis, status)
           VALUES (?, ?, ?, ?, 100, 95, ?, ?, 'seed', 'open')""",
        (symbol, side, sector, iso(utcnow()), size, risk),
    )
    conn.commit()


def seed_index(*values: float) -> None:
    conn = db.connect()
    now = utcnow()
    for k, v in enumerate(values):
        conn.execute("INSERT INTO equity_index (ts, value, cause) VALUES (?, ?, ?)",
                     (iso(now - timedelta(days=len(values) - k)), v, "seed"))
    conn.commit()


def _scn(rep, key):
    return next(s for s in rep.scenarios if s.key == key)


# ── empty book ───────────────────────────────────────────────────────────────
def test_empty_book(fresh_db):
    rep = build_stress(fresh_db)
    assert rep.status == "empty" and rep.scenarios == [] and rep.hedges == []
    assert "flat" in rep.note


# ── beta shock direction ─────────────────────────────────────────────────────
def test_long_loses_short_gains_in_a_drop(fresh_db):
    seed_bars("SPY", _closes_from_returns(_R))
    seed_bars("AAA", _closes_from_returns(_R))            # identical returns → beta 1.0
    seed_open("AAA", side="long", size=10.0)
    rep = build_stress(fresh_db)
    bear = _scn(rep, "bear_leg")                          # −10%
    pos = bear.positions[0]
    assert pos.beta == 1.0 and pos.beta_estimated is False
    # long, 10% weight, β1, −10% → −1.0% of equity
    assert pos.contribution_pct == -1.0
    assert bear.total_impact_pct == -1.0

    # a short of the same name gains in the drop
    seed_open("AAA", side="short", size=10.0)
    rep2 = build_stress(fresh_db)
    bear2 = _scn(rep2, "bear_leg")
    shorts = [p for p in bear2.positions if p.side == "short"]
    assert shorts and shorts[0].contribution_pct == 1.0   # +1.0% of equity


def test_crisis_floor_deepens_low_beta_longs(fresh_db):
    seed_bars("SPY", _closes_from_returns(_R))
    seed_bars("LOW", _closes_from_returns([0.5 * r for r in _R]))   # β ≈ 0.5
    seed_open("LOW", side="long", size=20.0)
    rep = build_stress(fresh_db)
    crash = _scn(rep, "crash")                            # β0.5, −20% → −2.0%
    crisis = _scn(rep, "crisis")                          # β floored to 1.0 → −4.0%
    assert crash.positions[0].beta == 0.5
    assert crisis.positions[0].beta == 1.0
    assert crisis.total_impact_pct < crash.total_impact_pct     # crisis hurts more
    # the diversify posture isolates the correlation effect at the SAME −20% move
    div = next((h for h in rep.hedges if h.posture == "diversify"), None)
    assert div is not None
    assert f"{crash.total_impact_pct:.1f}%" in div.rationale
    assert f"{crisis.total_impact_pct:.1f}%" in div.rationale


# ── all stops hit ────────────────────────────────────────────────────────────
def test_all_stops_hit_is_sum_of_planned_risk(fresh_db):
    seed_bars("SPY", _closes_from_returns(_R))
    seed_bars("AAA", _closes_from_returns(_R))
    seed_open("AAA", side="long", size=10.0, risk=1.5)
    seed_open("AAA", side="long", size=8.0, risk=1.0)
    rep = build_stress(fresh_db)
    stops = _scn(rep, "stops")
    assert stops.total_impact_pct == -2.5                 # −(1.5 + 1.0)
    assert rep.open_risk_pct == 2.5


# ── circuit breach + hedge ───────────────────────────────────────────────────
def test_breach_triggers_cash_priority_hedge(fresh_db):
    seed_bars("SPY", _closes_from_returns(_R))
    seed_bars("BIG", _closes_from_returns(_R))            # β1
    seed_open("BIG", side="long", size=60.0)             # −20% → −12% > 10% breaker
    rep = build_stress(fresh_db)
    assert _scn(rep, "crash").breaches_circuit is True
    postures = {h.posture for h in rep.hedges}
    assert "cash-priority" in postures
    serious = [h for h in rep.hedges if h.severity == "serious"]
    assert serious and "circuit breaker" in serious[0].rationale


# ── missing history → beta 1.0, flagged ──────────────────────────────────────
def test_missing_history_beta_estimated(fresh_db):
    seed_bars("SPY", _closes_from_returns(_R))
    seed_open("NOHIST", side="long", size=10.0)          # no bars for NOHIST
    rep = build_stress(fresh_db)
    pos = _scn(rep, "bear_leg").positions[0]
    assert pos.beta == 1.0 and pos.beta_estimated is True


# ── projected drawdown measured from the peak ────────────────────────────────
def test_projected_drawdown_from_peak(fresh_db):
    seed_bars("SPY", _closes_from_returns(_R))
    seed_bars("AAA", _closes_from_returns(_R))
    seed_open("AAA", side="long", size=10.0)
    seed_index(110.0, 100.0)                              # peak 110, current 100
    rep = build_stress(fresh_db)
    assert rep.current_index == 100.0
    bear = _scn(rep, "bear_leg")                          # impact −1% → index 99
    # drawdown from the 110 peak: (110 − 99)/110 = 10.0%
    assert bear.projected_drawdown_pct == 10.0


# ── over HTTP + no dollars ───────────────────────────────────────────────────
def test_stress_over_http_and_no_dollars(config):
    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    seed_bars("SPY", _closes_from_returns(_R))
    seed_bars("AAA", _closes_from_returns(_R))
    seed_open("AAA", side="long", size=15.0, sector="Tech")
    j = client.get("/api/stress").json()
    assert j["status"] == "ok"
    assert len(j["scenarios"]) == 5
    assert any(h["posture"] == "note" and "stop" in h["headline"].lower() for h in j["hedges"])
    assert "$" not in json.dumps(j)                      # % of equity only, ever
