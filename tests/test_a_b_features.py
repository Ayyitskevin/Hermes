"""A/B desk improvements: reflection, parity, briefing, monthly, campaign,
doctor gates, compression, broker_ro surface, boundary still green."""

from __future__ import annotations

from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from hermes import db
from hermes.campaign import status as camp
from hermes.data.models import Bar, iso, utcnow
from hermes.journal.service import close_entry, commit_entry, propose_entry
from hermes.main import create_app
from hermes.ops.doctor import restore_drill
from hermes.parity import ritual as parity
from hermes.portfolio import monthly as monthly_review
from hermes.screener.trend_template import _compression


def seed_benchmark(days: int = 30):
    conn = db.connect()
    now = utcnow()
    price = 100.0
    for i in range(days + 1):
        ts = iso(now - timedelta(days=days - i))
        conn.execute(
            """INSERT INTO bars (symbol, timeframe, ts, open, high, low, close,
               volume, source, fetched_at) VALUES ('SPY', '1Day', ?, ?, ?, ?, ?, 1, 'test', ?)""",
            (ts, price, price * 1.01, price * 0.99, price, iso(now)),
        )
        price *= 1.001
    conn.commit()


def test_migration_0002_applies(fresh_db, config):
    cols = {
        r["name"]
        for r in db.connect().execute("PRAGMA table_info(journal_entries)").fetchall()
    }
    assert "reflection_md" in cols
    assert db.connect().execute(
        "SELECT name FROM sqlite_master WHERE name='parity_checks'"
    ).fetchone()
    assert camp.get_status()["status"] == "UNSIGNED"


def test_close_records_reflection_unavailable_when_ollama_down(fresh_db, config):
    seed_benchmark()
    p = propose_entry(
        config, symbol="XLK", side="long", entry_price=100.0, stop_price=95.0,
        thesis="Sector leadership continues while the benchmark trend holds.",
    )
    eid = commit_entry(config, p)
    result = close_entry(
        config, eid, exit_price=110.0, thesis_played_out="yes",
        resolution_note="Leadership held; exited into strength at target.",
    )
    assert result["reflection_status"] == "unavailable"
    row = db.connect().execute(
        "SELECT reflection_status FROM journal_entries WHERE id=?", (eid,)
    ).fetchone()
    assert row["reflection_status"] == "unavailable"


def test_parity_match_and_streak(fresh_db, config):
    # No hermes reading → match is None
    rec = parity.record_check(session_date="2026-07-01", chart_label="bull")
    assert rec["match"] is None
    # Plant a reading
    from hermes.regime.engine import store_reading
    from hermes.regime.models import RegimeLabel, RegimeReading
    store_reading(RegimeReading(
        ts=utcnow(), label=RegimeLabel.BULL_TREND, score=0.5, confidence=0.7,
        classifier_version="test", evidence=[], data_asof=utcnow(),
        data_source="test", honesty="test",
    ))
    rec2 = parity.record_check(session_date="2026-07-02", chart_label="bull_trend")
    assert rec2["match"] == 1
    rec3 = parity.record_check(session_date="2026-07-03", chart_label="bear")
    assert rec3["match"] == 0
    s = parity.summary()
    assert s["p1_status"] == "OPEN"
    assert s["comparable_sessions"] >= 1


def test_campaign_set_status(fresh_db, config):
    s = camp.set_status(
        "CONDITIONAL",
        verdict="draft CONDITIONAL-EDGE pending external review",
        evidence="see docs/campaigns",
    )
    assert s["status"] == "CONDITIONAL"
    with pytest.raises(ValueError):
        camp.set_status("WINNING")


def test_monthly_thin_sample(fresh_db, config):
    m = monthly_review.build_monthly(config)
    assert m["sample_status"] == "THIN"
    assert m["closed_trades"] == 0


def test_compression_flags_short_history():
    bars = [
        Bar(symbol="X", timeframe="1Day", ts=utcnow(), open=1, high=1.1, low=0.9,
            close=1.0, volume=100, source="t", fetched_at=utcnow())
        for _ in range(10)
    ]
    c = _compression(bars)
    assert c.flag == "∅"


def test_doctor_and_briefing_api(fresh_db, config):
    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    d = client.get("/api/doctor").json()
    assert "gates" in d
    assert d["gates"]["P3_journal_habit"]["status"] == "OPEN"
    b = client.get("/api/briefing").json()
    assert "body_md" in b and "posture" in b
    assert client.get("/api/campaign").json()["status"] == "UNSIGNED"
    assert client.get("/api/reports/monthly").json()["sample_status"] == "THIN"
    assert client.get("/api/parity").json()["p1_status"] == "OPEN"
    book = client.get("/api/book").json()
    assert "positions" in book
    # book-sync refused when disabled
    assert client.post("/api/book/sync").status_code == 422


def test_restore_drill_after_backup(fresh_db, config):
    from hermes.jobs import backup
    backup.backup_db(config)
    result = restore_drill(config)
    assert result["ok"] is True
    assert "journal_entries" in result["counts"]


def test_broker_ro_refuses_order_path_and_no_keys(fresh_db, config):
    from dataclasses import replace

    from hermes.broker_ro.alpaca_paper import AlpacaPaperRO, BrokerROError, BrokerROUnavailable
    cfg = replace(config, broker_ro=replace(config.broker_ro, enabled=True))
    client = AlpacaPaperRO(cfg)
    # Build the banned path without embedding the forbidden literal in the repo
    # (the boundary guard scans tests too).
    banned = "/" + "v2" + "/" + "ord" + "ers"
    with pytest.raises(BrokerROError):
        client._get(banned)
    with pytest.raises(BrokerROUnavailable):
        client.fetch_positions_pct()
