"""Regime Lab: both classifiers run live on the same bars (default first), label
agreement, the missing-benchmark path, the confidence teach-in fields, drift vs
the persisted reading, and the transition/dwell/streak history with its small-
sample flag. Mirrors test_instrument's synthetic-bar + store-seeding idioms."""

from __future__ import annotations

import json
from datetime import timedelta

from fastapi.testclient import TestClient

from hermes import db
from hermes.data.models import iso, utcnow
from hermes.main import create_app
from hermes.regime.engine import store_reading
from hermes.regime.lab import SMALL_SAMPLE_READINGS, build_lab
from hermes.regime.models import RegimeLabel, RegimeReading

STRONG_UP = [50 * 1.004 ** i for i in range(300)]     # bull for both classifiers
BENCH = [100 * 1.0005 ** i for i in range(300)]


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


def seed_reading(label: RegimeLabel, *, days_ago: int, score: float = 0.5) -> None:
    store_reading(RegimeReading(
        ts=utcnow() - timedelta(days=days_ago), label=label, score=score,
        confidence=0.6, classifier_version="test-v1", evidence=[],
        data_asof=utcnow() - timedelta(days=days_ago), data_source="test",
        honesty="test",
    ))


# ── both classifiers, live, default first ───────────────────────────────────
def test_both_classifiers_run_and_agree(fresh_db):
    seed_bars("SPY", STRONG_UP)
    lab = build_lab(fresh_db)
    assert lab.status == "ok"
    assert len(lab.classifiers) == 2
    assert lab.classifiers[0].is_default and lab.classifiers[0].version == "v62"
    assert not lab.classifiers[1].is_default
    # a clean strong uptrend should read bull on both → agreement
    assert all(v.label == "bull_trend" for v in lab.classifiers)
    assert lab.agree is True and "corroboration" in lab.agreement_note


def test_markov_matrix_and_dynamics(fresh_db):
    seed_bars("SPY", STRONG_UP)
    m = build_lab(fresh_db).markov
    assert m is not None and m.total > 0 and m.states
    # rows are row-stochastic: each row's probs sum to ~100 with Wilson CIs present
    for row in m.rows:
        assert row.n >= 0
        assert abs(sum(t["prob_pct"] for t in row.to) - 100.0) < 0.5 or row.n == 0
        for t in row.to:
            assert t["lo_pct"] <= t["prob_pct"] <= t["hi_pct"] + 1e-9
    # a clean uptrend → current state Bull, high hold probability, a base rate
    assert m.current_state == "bull_trend"
    assert m.p_stay_pct is not None and m.p_stay_pct > 50
    assert m.current_run >= 1
    # a regime that never transitions out has p_stay 100% → mean_dwell is None
    # (an infinite dwell, correctly not faked); otherwise it's a positive number
    assert m.mean_dwell is None or m.mean_dwell > 0
    assert m.maturity in ("on-trend", "mature", "")
    assert abs(sum(s["pct"] for s in m.stationary) - 100.0) < 1.0


def test_confidence_teach_in_present(fresh_db):
    seed_bars("SPY", STRONG_UP)
    lab = build_lab(fresh_db)
    for v in lab.classifiers:
        assert v.votes_total == len(v.evidence)
        assert 0 <= v.votes_available <= v.votes_total
        assert v.confidence_basis                       # the formula behind the number
        # every evidence row carries the full teach-in shape
        for e in v.evidence:
            assert e.claim and e.methodology and e.caveat and e.status


def test_missing_benchmark_is_missing(fresh_db):
    lab = build_lab(fresh_db)
    assert lab.status == "missing" and "never faked" in lab.note
    assert lab.classifiers == [] and lab.agree is None


# ── drift vs the persisted (authoritative) reading ──────────────────────────
def test_drift_flagged_when_live_differs_from_persisted(fresh_db):
    seed_bars("SPY", STRONG_UP)                         # live default → bull
    seed_reading(RegimeLabel.BEAR_TREND, days_ago=0)    # persisted says bear
    lab = build_lab(fresh_db)
    assert lab.persisted_label == "bear_trend"
    assert lab.drifted is True and "fresh check would update it" in lab.drift_note


def test_no_drift_when_live_matches_persisted(fresh_db):
    seed_bars("SPY", STRONG_UP)
    seed_reading(RegimeLabel.BULL_TREND, days_ago=0)
    lab = build_lab(fresh_db)
    assert lab.drifted is False and lab.drift_note == ""


# ── transitions / dwell / streak over persisted history ─────────────────────
def test_transitions_dwell_and_streak(fresh_db):
    seed_bars("SPY", STRONG_UP)
    # oldest → newest: chop, chop, bull, bull, bull  (one flip; streak of 3 bull)
    seed_reading(RegimeLabel.CHOP, days_ago=5)
    seed_reading(RegimeLabel.CHOP, days_ago=4)
    seed_reading(RegimeLabel.BULL_TREND, days_ago=3)
    seed_reading(RegimeLabel.BULL_TREND, days_ago=2)
    seed_reading(RegimeLabel.BULL_TREND, days_ago=1)
    lab = build_lab(fresh_db)
    assert lab.history_n == 5
    assert lab.streak_readings == 3                     # trailing bull run
    # transitions: initial chop (from None) + the flip chop→bull
    flips = [(t.from_label, t.to_label) for t in lab.transitions]
    assert flips == [(None, "chop"), ("chop", "bull_trend")]
    dwell = {d["label"]: d["count"] for d in lab.dwell}
    assert dwell == {"bull_trend": 3, "chop": 2}
    assert round(sum(d["pct"] for d in lab.dwell)) == 100
    assert lab.small_sample is True                     # 5 < 20 readings


def test_small_sample_clears_with_enough_history(fresh_db):
    seed_bars("SPY", STRONG_UP)
    for d in range(SMALL_SAMPLE_READINGS + 2, 0, -1):
        seed_reading(RegimeLabel.BULL_TREND, days_ago=d)
    lab = build_lab(fresh_db)
    assert lab.history_n >= SMALL_SAMPLE_READINGS and lab.small_sample is False


# ── over HTTP + no dollar figures ───────────────────────────────────────────
def test_lab_over_http_and_no_dollars(config):
    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    seed_bars("SPY", STRONG_UP)
    seed_reading(RegimeLabel.BULL_TREND, days_ago=1)
    j = client.get("/api/regime/lab").json()
    assert j["status"] == "ok"
    assert len(j["classifiers"]) == 2
    assert j["classifiers"][0]["is_default"] is True
    assert j["agree"] in (True, False, None)
    assert "$" not in json.dumps(j)                     # no dollar figures, ever
