"""Model scorecard: regime stability (flips/dwell/streak + thin→graded),
current classifier agreement, reviewer calibration (thin below sample, ordering
when graded), thesis-judgment calibration, the explicit NOT_TRACKED items, and a
no-dollar-figures assertion over HTTP. The scorecard must fabricate no grade —
thin items say so and carry their sample."""

from __future__ import annotations

import json
from datetime import timedelta

from fastapi.testclient import TestClient

from hermes import db
from hermes.data.models import iso, utcnow
from hermes.main import create_app
from hermes.regime.engine import store_reading
from hermes.regime.models import RegimeLabel, RegimeReading
from hermes.scorecard.report import MIN_TO_GRADE, build_scorecard

STRONG_UP = [50 * 1.004 ** i for i in range(300)]


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


def seed_reading(label: RegimeLabel, *, days_ago: int) -> None:
    store_reading(RegimeReading(
        ts=utcnow() - timedelta(days=days_ago), label=label, score=0.5, confidence=0.6,
        classifier_version="v62", evidence=[], data_asof=utcnow() - timedelta(days=days_ago),
        data_source="test", honesty="t"))


def seed_closed(realized: float, *, verdict: str | None = None, thesis: str = "yes") -> None:
    conn = db.connect()
    now = utcnow()
    review = json.dumps({"verdict": verdict, "flags": []}) if verdict else None
    conn.execute(
        """INSERT INTO journal_entries
           (symbol, side, opened_at, entry_price, stop_price, size_pct_equity,
            planned_risk_pct, thesis, review_json, status, closed_at, exit_price,
            realized_return_pct, thesis_played_out, resolution_note)
           VALUES ('AAA', 'long', ?, 100, 95, 5, 1, 'seed', ?, 'closed', ?, 100, ?, ?, 'seed')""",
        (iso(now - timedelta(days=10)), review, iso(now), realized, thesis),
    )
    conn.commit()


def _item(sc, key):
    return next(it for it in sc.items if it.key == key)


# ── 1. regime stability ──────────────────────────────────────────────────────
def test_stability_flips_dwell_streak(fresh_db):
    # chop,chop,bull,bull,bull → 1 flip, streak 3
    seq = [(5, "chop"), (4, "chop"), (3, "bull_trend"), (2, "bull_trend"), (1, "bull_trend")]
    for d, lbl in seq:
        seed_reading(RegimeLabel(lbl), days_ago=d)
    it = _item(build_scorecard(fresh_db), "regime_stability")
    assert it.status == "thin" and it.n == 5           # 5 < 20 → thin
    assert "1 flip" in it.headline and "streak 3" in it.headline
    assert it.small_sample is True

def test_stability_grades_past_threshold(fresh_db):
    for d in range(MIN_TO_GRADE + 2, 0, -1):
        seed_reading(RegimeLabel.BULL_TREND, days_ago=d)
    it = _item(build_scorecard(fresh_db), "regime_stability")
    assert it.status == "graded" and it.small_sample is False
    assert "0 flips" in it.headline                     # one continuous regime


# ── 2. classifier agreement (now) ────────────────────────────────────────────
def test_agreement_snapshot(fresh_db):
    seed_bars("SPY", STRONG_UP)
    it = _item(build_scorecard(fresh_db), "classifier_agreement")
    assert it.status == "graded"
    assert it.headline in ("classifiers agree", "classifiers disagree")
    assert it.small_sample is True                      # a single instant, flagged

def test_agreement_thin_without_bars(fresh_db):
    it = _item(build_scorecard(fresh_db), "classifier_agreement")
    assert it.status == "thin"


# ── 3. reviewer calibration ──────────────────────────────────────────────────
def test_reviewer_calibration_thin(fresh_db):
    seed_closed(3.0, verdict="clear")
    seed_closed(-1.0, verdict="caution")
    it = _item(build_scorecard(fresh_db), "reviewer_calibration")
    assert it.status == "thin" and it.n == 2
    assert "not enough" in it.headline

def test_reviewer_calibration_graded_ordering(fresh_db):
    for _ in range(15):
        seed_closed(4.0, verdict="clear")               # cleared → winners
    for _ in range(10):
        seed_closed(-3.0, verdict="caution")            # cautioned → losers
    it = _item(build_scorecard(fresh_db), "reviewer_calibration")
    assert it.status == "graded" and it.n == 25
    assert "did outperform" in it.headline
    by = {r.label: r for r in it.rows}
    assert by["clear"].avg_realized_pct == 4.0 and by["caution"].avg_realized_pct == -3.0
    assert by["clear"].win_rate_pct == 100.0 and by["caution"].win_rate_pct == 0.0


# ── 4. thesis calibration ────────────────────────────────────────────────────
def test_thesis_calibration_buckets(fresh_db):
    seed_closed(5.0, thesis="yes")
    seed_closed(-2.0, thesis="no")
    it = _item(build_scorecard(fresh_db), "thesis_calibration")
    labels = {r.label for r in it.rows}
    assert "Thesis played out" in labels and "Thesis failed" in labels
    assert it.status == "thin"                          # 2 < 20


# ── 5 & 6. not tracked, stated not faked ─────────────────────────────────────
def test_not_tracked_items_present(fresh_db):
    sc = build_scorecard(fresh_db)
    for key in ("rs_followthrough", "screener_followthrough"):
        it = _item(sc, key)
        assert it.status == "not_tracked" and it.n == 0 and it.rows == []
        assert "not tracked" in it.headline and "never persisted" in it.detail


# ── over HTTP + no dollars ───────────────────────────────────────────────────
def test_scorecard_over_http_and_no_dollars(config):
    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    seed_bars("SPY", STRONG_UP)
    seed_closed(3.0, verdict="clear")
    j = client.get("/api/scorecard").json()
    assert len(j["items"]) == 6
    assert {it["status"] for it in j["items"]} <= {"graded", "thin", "not_tracked"}
    assert any(it["status"] == "not_tracked" for it in j["items"])
    assert "$" not in json.dumps(j)                     # no dollar figures, ever
