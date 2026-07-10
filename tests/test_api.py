"""End-to-end through the HTTP surface with the sample provider: the same
path a stranger's zero-key clone exercises."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from hermes.main import create_app


@pytest.fixture()
def client(config):
    app = create_app(config, with_scheduler=False)
    return TestClient(app)


def test_health_reports_positive_evidence(client):
    h = client.get("/api/health").json()
    assert h["db"]["writable"] is True
    assert h["provider"]["name"] == "sample"
    assert isinstance(h["jobs"], list) and len(h["jobs"]) == 5
    assert "backup" in {j["job"] for j in h["jobs"]}
    assert "backup" in h                      # positive-evidence field present


def test_daily_check_end_to_end(client):
    # Manual trigger (the override path) runs the whole workflow on sample data
    r = client.post("/api/jobs/daily_check/run")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["outcome"] == "ok"
    assert "regime=" in body["detail"]

    d = client.get("/api/dashboard").json()
    assert d["provider"]["name"] == "sample"
    assert d["regime"] is not None
    assert d["regime"]["classifier_version"] == "v62"
    assert len(d["regime"]["evidence"]) == 5
    assert "not a backtested edge" in d["regime"]["honesty"]
    assert d["posture"]["posture"] in ("allow", "restrict", "cash-priority")
    assert d["report"] is not None
    # narrative section exists and is explicit about the local model being down
    # narrative section exists; with Ollama down the router degrades visibly
    assert "## Narrative" in d["report"]["body_md"]
    assert "Unavailable" in d["report"]["body_md"]
    # every watchlist row carries provenance
    for w in d["watchlist"]:
        assert w["source"] == "sample"
        assert w["as_of"]
        assert w["staleness"] in ("live", "stale", "dead")
        assert len(w["series"]) > 0
    # the run left positive evidence
    jobs = {j["job"]: j for j in d["jobs"]}
    assert jobs["daily_check"]["last_run"]["outcome"] == "ok"
    assert jobs["daily_check"]["last_run"]["trigger"] == "manual"


def test_unknown_job_404(client):
    assert client.post("/api/jobs/bake_bread/run").status_code == 404


def test_weekly_review_over_http(client):
    # Before the first run: a null-bodied shape, but the honesty block is
    # always present (the caveat is the product, even when the body is empty).
    pre = client.get("/api/reports/weekly").json()
    assert pre["body_md"] is None and pre["generated_at"] is None
    assert "REVIEW" in pre["honesty"]["caveat"] and pre["honesty"]["methodology"]

    # Manual trigger runs the Sunday job on demand (empty book is fine).
    run = client.post("/api/jobs/weekly_review/run")
    assert run.status_code == 200, run.text
    assert run.json()["outcome"] == "ok"

    post = client.get("/api/reports/weekly").json()
    assert post["generated_at"] is not None
    assert "Weekly portfolio review" in post["body_md"]
    assert "$" not in post["body_md"]                 # % of equity only, ever
    assert post["meta"]["open_count"] == 0            # no positions seeded


def test_journal_flow_over_http(client):
    client.post("/api/jobs/daily_check/run")
    trade_params = {
        "symbol": "XLK", "side": "long", "entry_price": 100.0,
        "stop_price": 94.0, "thesis": "Tech leads while the regime holds bullish structure.",
        "sector": "tech", "setup_tag": "regime-pullback",
    }
    proposal = client.post("/api/journal/propose", json=trade_params)
    assert proposal.status_code == 200, proposal.text
    p = proposal.json()
    assert p["review"]["verdict"] in ("clear", "caution", "blocked")
    # signal state was frozen from the regime reading the daily check stored
    assert p["signal_state"]["label"] is not None

    # Commit takes the RAW params and re-runs the proposal server-side —
    # a client cannot forge sizing/review/signal state.
    commit = client.post("/api/journal/commit", json=trade_params)
    assert commit.status_code == 200
    assert commit.json()["review"]["verdict"] in ("clear", "caution", "blocked")
    assert commit.json()["signal_state"]["label"] is not None
    entry_id = commit.json()["id"]

    listing = client.get("/api/journal").json()
    assert any(e["id"] == entry_id for e in listing["entries"])

    close = client.post(f"/api/journal/{entry_id}/close", json={
        "exit_price": 108.0, "thesis_played_out": "yes",
        "resolution_note": "Leadership persisted; scaled out at target.",
    })
    assert close.status_code == 200
    assert close.json()["realized_return_pct"] == pytest.approx(8.0)


def test_validation_rejects_garbage(client):
    r = client.post("/api/journal/propose", json={
        "symbol": "SPY", "side": "long", "entry_price": 100.0,
        "stop_price": 105.0,  # stop above entry on a long
        "thesis": "This stop is on the wrong side entirely.",
    })
    assert r.status_code == 422


def test_risk_endpoint_and_ack(client):
    risk = client.get("/api/risk").json()
    assert risk["level"] in ("ok", "warn", "breach")
    assert client.post("/api/risk/events/99999/ack").status_code == 404


def test_index_served(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "Limit Rail" in r.text or "riskrail" in r.text
