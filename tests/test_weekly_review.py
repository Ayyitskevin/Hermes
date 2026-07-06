"""Weekly portfolio review: regime coherence, sector heat, the full
correlation matrix, the journal-informed exposure summary, and the job that
stores it. Scheduler spec-grammar tests live in test_infra alongside the
existing MISSED-detection tests."""

from __future__ import annotations

from datetime import timedelta

from hermes import db
from hermes.data.models import iso, utcnow
from hermes.jobs.weekly_review import latest_weekly_review, weekly_review
from hermes.portfolio.review import (
    COHERENT,
    FIGHTING,
    UNKNOWN,
    _coherence,
    build_review,
    compose_review_md,
)
from hermes.regime.engine import store_reading
from hermes.regime.models import RegimeLabel, RegimeReading


# ── seeding helpers ──────────────────────────────────────────────────────
def seed_regime(label: RegimeLabel) -> None:
    store_reading(RegimeReading(
        ts=utcnow(), label=label, score=0.5, confidence=0.7,
        classifier_version="test-v1", evidence=[],
        data_asof=utcnow(), data_source="test", honesty="test honesty",
    ))


def insert_position(symbol, size_pct, risk_pct, sector=None, side="long"):
    conn = db.connect()
    conn.execute(
        """INSERT INTO journal_entries
           (symbol, side, sector, opened_at, entry_price, stop_price,
            size_pct_equity, planned_risk_pct, thesis)
           VALUES (?, ?, ?, ?, 100, 95, ?, ?, 'test thesis')""",
        (symbol, side, sector, iso(utcnow()), size_pct, risk_pct),
    )
    conn.commit()


def seed_bars(symbol, closes):
    """Ascending-ts daily bars so _position_returns has history to correlate."""
    conn = db.connect()
    now = utcnow()
    n = len(closes)
    for i, px in enumerate(closes):
        ts = iso(now - timedelta(days=n - i))
        conn.execute(
            """INSERT INTO bars (symbol, timeframe, ts, open, high, low, close,
               volume, source, fetched_at)
               VALUES (?, '1Day', ?, ?, ?, ?, ?, 1, 'test', ?)""",
            (symbol, ts, px, px, px, px, iso(now)),
        )
    conn.commit()


# ── coherence rule ───────────────────────────────────────────────────────
def test_coherence_rule_long_and_short():
    # A long is coherent only in a bull trend; fights bear / chop / stress.
    assert _coherence("long", RegimeLabel.BULL_TREND) == COHERENT
    assert _coherence("long", RegimeLabel.BEAR_TREND) == FIGHTING
    assert _coherence("long", RegimeLabel.CHOP) == FIGHTING
    assert _coherence("long", RegimeLabel.STRESS) == FIGHTING
    # No reading → never guessed.
    assert _coherence("long", None) == UNKNOWN
    # A short inverts: coherent in bear / stress, fighting in a bull.
    assert _coherence("short", RegimeLabel.BEAR_TREND) == COHERENT
    assert _coherence("short", RegimeLabel.STRESS) == COHERENT
    assert _coherence("short", RegimeLabel.BULL_TREND) == FIGHTING
    assert _coherence("short", RegimeLabel.CHOP) == FIGHTING


def test_weekly_structured_endpoint(config):
    import json

    from fastapi.testclient import TestClient

    from hermes.main import create_app
    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    seed_regime(RegimeLabel.BULL_TREND)
    insert_position("AAPL", 18.0, 1.2, sector="Technology")
    insert_position("DUK", 8.0, 1.0, sector="Utilities")     # a defensive sector
    s = client.get("/api/reports/weekly").json()["structured"]
    assert s["exposure"]["open_count"] == 2
    # sector ballast classifies utilities as defensive, tech as cyclical
    assert s["defensive_pct"] == 8.0 and s["cyclical_pct"] == 18.0
    heat = {h["sector"]: h for h in s["sector_heat"]}
    assert heat["Utilities"]["defensive"] is True and heat["Technology"]["defensive"] is False
    # the staleness table carries per-position age + the standing thesis
    assert {p["symbol"] for p in s["stale"]} == {"AAPL", "DUK"}
    assert all("days_held" in p and "thesis" in p for p in s["stale"])
    assert "$" not in json.dumps(s)                           # % of equity only


# ── build_review: coherence cases ────────────────────────────────────────
def test_build_review_coherent_case(fresh_db, config):
    seed_regime(RegimeLabel.BULL_TREND)
    insert_position("AAPL", 12.0, 1.0, sector="tech")
    review = build_review(config)
    assert review.open_count == 1
    assert review.regime_label == RegimeLabel.BULL_TREND
    assert review.positions[0].coherence == COHERENT
    assert review.coherence_counts == {COHERENT: 1, FIGHTING: 0, UNKNOWN: 0}


def test_build_review_fighting_case(fresh_db, config):
    seed_regime(RegimeLabel.CHOP)          # a long fights a rangebound tape
    insert_position("AAPL", 12.0, 1.0, sector="tech")
    review = build_review(config)
    assert review.positions[0].coherence == FIGHTING
    assert review.coherence_counts[FIGHTING] == 1


def test_build_review_no_reading_is_unknown(fresh_db, config):
    insert_position("AAPL", 12.0, 1.0, sector="tech")  # no regime reading seeded
    review = build_review(config)
    assert review.regime_label is None
    assert review.positions[0].coherence == UNKNOWN
    assert review.coherence_counts[UNKNOWN] == 1


def test_build_review_empty_book_does_not_crash(fresh_db, config):
    review = build_review(config)
    assert review.open_count == 0
    assert review.coherence_counts == {COHERENT: 0, FIGHTING: 0, UNKNOWN: 0}
    assert review.sector_heat == []
    assert review.corr_symbols == []
    assert review.sector_leader is None
    md = compose_review_md(review)
    assert "Weekly portfolio review" in md
    assert "No open positions" in md


# ── sector heat ──────────────────────────────────────────────────────────
def test_sector_aggregation_and_untagged_flag(fresh_db, config):
    insert_position("AAPL", 12.0, 1.0, sector="tech")
    insert_position("MSFT", 8.0, 1.0, sector="tech")
    insert_position("XLE", 5.0, 1.0, sector="energy")
    insert_position("NOTAG", 10.0, 1.0, sector=None)
    review = build_review(config)
    heat = {s.sector: s for s in review.sector_heat}
    assert heat["tech"].pct_equity == 20.0
    assert heat["energy"].pct_equity == 5.0
    assert review.sector_leader == ("tech", 20.0)     # hottest TAGGED sector
    assert review.untagged_pct == 10.0
    assert heat["unspecified"].untagged is True
    assert heat["tech"].over_limit is False           # 20% < 30% limit


def test_sector_over_limit_flagged(fresh_db, config):
    insert_position("AAPL", 35.0, 1.0, sector="tech")  # over the 30% sector limit
    review = build_review(config)
    heat = {s.sector: s for s in review.sector_heat}
    assert heat["tech"].over_limit is True
    md = compose_review_md(review)
    assert "over the per-sector limit" in md


# ── correlation matrix ───────────────────────────────────────────────────
def test_correlation_matrix_shape_and_missing(fresh_db, config):
    # AAA and BBB move identically → correlation +1.00; CCC has too little
    # history → correlation is missing (None), never 0.
    price_a, price_b = 100.0, 50.0
    closes_a, closes_b = [], []
    for i in range(70):
        move = 0.01 if i % 3 else -0.008
        price_a *= 1 + move
        price_b *= 1 + move
        closes_a.append(price_a)
        closes_b.append(price_b)
    seed_bars("AAA", closes_a)
    seed_bars("BBB", closes_b)
    seed_bars("CCC", [10.0, 10.1])            # 1 return → insufficient
    insert_position("AAA", 10.0, 1.0, "tech")
    insert_position("BBB", 10.0, 1.0, "tech")
    insert_position("CCC", 10.0, 1.0, "tech")

    review = build_review(config)
    assert review.corr_symbols == ["AAA", "BBB", "CCC"]
    m = review.corr_matrix
    assert len(m) == 3 and all(len(row) == 3 for row in m)
    # Diagonal is the identity, not a data-derived claim.
    assert m[0][0] == 1.0 and m[1][1] == 1.0 and m[2][2] == 1.0
    # AAA/BBB fully correlated; symmetric.
    assert m[0][1] == 1.0 and m[1][0] == 1.0
    # CCC short history → missing both ways, never 0.
    assert m[0][2] is None and m[2][0] is None
    # Worst pair + flags reflect the +1.00 pair.
    assert review.worst_pair == ("AAA", "BBB") and review.worst_corr == 1.0
    assert ("AAA", "BBB", 1.0) in review.corr_flags
    # The matrix renders with ∅ for the missing cells.
    assert "∅" in compose_review_md(review)


def test_single_position_has_no_pairs(fresh_db, config):
    insert_position("AAPL", 10.0, 1.0, "tech")
    review = build_review(config)
    assert review.corr_matrix == [[1.0]]
    assert review.corr_flags == []
    assert review.worst_pair is None


# ── journal-informed exposure ────────────────────────────────────────────
def test_journal_exposure_summary(fresh_db, config):
    insert_position("AAPL", 12.0, 1.5, sector="tech")
    insert_position("MSFT", 8.0, 1.0, sector="tech")
    review = build_review(config)
    assert review.open_count == 2
    assert review.open_risk_pct == 2.5                    # Σ planned risk
    assert review.performance["closed_trades"] == 0       # nothing closed yet
    assert review.stale_count == 0                        # fresh entries


# ── the job ──────────────────────────────────────────────────────────────
def test_weekly_review_job_writes_report(fresh_db, config):
    seed_regime(RegimeLabel.BULL_TREND)
    insert_position("AAPL", 22.0, 1.0, sector="tech")
    insert_position("MSFT", 8.0, 1.0, sector="tech")
    summary = weekly_review(config)
    assert "2 open" in summary
    assert "hottest sector tech" in summary

    row = db.connect().execute(
        "SELECT * FROM reports WHERE kind='weekly_review'"
    ).fetchone()
    assert row is not None
    assert "Weekly portfolio review" in row["body_md"]

    latest = latest_weekly_review()
    assert latest["meta"]["open_count"] == 2
    assert latest["meta"]["coherence"][COHERENT] == 2
    assert latest["meta"]["sector_leader"]["sector"] == "tech"


def test_review_md_has_no_dollar_figures(fresh_db, config):
    seed_regime(RegimeLabel.BULL_TREND)
    insert_position("AAPL", 12.0, 1.0, sector="tech")
    md = compose_review_md(build_review(config))
    assert "$" not in md
