"""Validation ledger: journal claims resolved to their own verdict (confirmed/
partial/refuted/pending), regime reads forward-tested vs the benchmark (aligned/
mixed/diverged/pending) with the softer vocabulary, the pending path when a read
is too recent, per-kind summaries with small-sample honesty, and a no-dollar-
figures assertion over HTTP. Plus the debate route degrading visibly."""

from __future__ import annotations

import json
from datetime import timedelta

from fastapi.testclient import TestClient

from hermes import db
from hermes.data.models import iso, utcnow
from hermes.main import create_app
from hermes.regime.engine import store_reading
from hermes.regime.models import RegimeLabel, RegimeReading
from hermes.validation.ledger import HORIZON_SESSIONS, build_ledger


def seed_closed(symbol: str, *, thesis_played_out: str, realized: float,
                verdict: str = "clear", regime: str = "bull_trend") -> None:
    conn = db.connect()
    now = utcnow()
    signal = json.dumps({"label": regime})
    review = json.dumps({"verdict": verdict, "flags": []})
    conn.execute(
        """INSERT INTO journal_entries
           (symbol, side, opened_at, entry_price, stop_price, size_pct_equity,
            planned_risk_pct, thesis, signal_json, review_json, status, closed_at,
            exit_price, realized_return_pct, alpha_pct, thesis_played_out, resolution_note)
           VALUES (?, 'long', ?, 100, 95, 5, 1, 'regime pullback long', ?, ?, 'closed',
                   ?, 100, ?, ?, ?, 'seed')""",
        (symbol, iso(now - timedelta(days=30)), signal, review, iso(now - timedelta(days=1)),
         realized, realized - 1.0, thesis_played_out),
    )
    conn.commit()


def seed_open(symbol: str) -> None:
    conn = db.connect()
    conn.execute(
        """INSERT INTO journal_entries
           (symbol, side, opened_at, entry_price, stop_price, size_pct_equity,
            planned_risk_pct, thesis, status)
           VALUES (?, 'long', ?, 100, 95, 5, 1, 'still open', 'open')""",
        (symbol, iso(utcnow() - timedelta(days=3))),
    )
    conn.commit()


def seed_bench(closes: list[float], *, end_days_ago: int = 0) -> None:
    """Benchmark bars ending `end_days_ago` days before now."""
    conn = db.connect()
    now = utcnow()
    n = len(closes)
    for i, px in enumerate(closes):
        ts = now - timedelta(days=end_days_ago + (n - i))
        conn.execute(
            "INSERT INTO bars (symbol, timeframe, ts, open, high, low, close, "
            "volume, source, fetched_at) VALUES ('SPY', '1Day', ?, ?, ?, ?, ?, 1, 'test', ?)",
            (iso(ts), px, px, px, px, iso(now)),
        )
    conn.commit()


def seed_reading(label: RegimeLabel, *, days_ago: int) -> None:
    ts = utcnow() - timedelta(days=days_ago)
    store_reading(RegimeReading(
        ts=ts, label=label, score=0.5, confidence=0.6, classifier_version="v62",
        evidence=[], data_asof=ts, data_source="test", honesty="t"))


def _kind(led, kind):
    return next(s for s in led.summaries if s.kind == kind)


# ── journal claims ───────────────────────────────────────────────────────────
def test_journal_claim_resolution(fresh_db):
    seed_closed("AAA", thesis_played_out="yes", realized=6.0)
    seed_closed("BBB", thesis_played_out="no", realized=-4.0)
    seed_closed("CCC", thesis_played_out="partial", realized=1.0)
    seed_open("DDD")
    led = build_ledger(fresh_db)
    j = [e for e in led.entries if e.kind == "journal"]
    by_sym = {e.subject: e for e in j}
    assert by_sym["AAA"].status == "confirmed" and by_sym["AAA"].resolved
    assert by_sym["BBB"].status == "refuted"
    assert by_sym["CCC"].status == "partial"
    assert by_sym["DDD"].status == "pending" and not by_sym["DDD"].resolved
    js = _kind(led, "journal")
    assert js.counts["confirmed"] == 1 and js.resolved == 3
    assert js.rate_pct == round(1 / 3 * 100, 1) and js.small_sample is True


# ── regime reads forward-tested ──────────────────────────────────────────────
def test_regime_aligned_and_diverged(fresh_db):
    # 60 rising bars: a bull read HORIZON sessions back sees a positive forward move.
    seed_bench([100 * 1.01 ** i for i in range(60)])
    seed_reading(RegimeLabel.BULL_TREND, days_ago=40)     # resolvable, market rose → aligned
    led = build_ledger(fresh_db)
    reg = [e for e in led.entries if e.kind == "regime"]
    assert reg and reg[0].status == "aligned" and reg[0].resolved
    assert "over the next" in reg[0].outcome
    # softer vocabulary — never 'confirmed/refuted' for a regime read
    assert reg[0].status in ("aligned", "mixed", "diverged", "pending")


def test_regime_bull_into_selloff_diverges(fresh_db):
    seed_bench([100 * 0.99 ** i for i in range(60)])       # falling tape
    seed_reading(RegimeLabel.BULL_TREND, days_ago=40)      # bull read, market fell → diverged
    reg = [e for e in build_ledger(fresh_db).entries if e.kind == "regime"]
    assert reg[0].status == "diverged"


def test_regime_recent_read_is_pending(fresh_db):
    seed_bench([100 * 1.01 ** i for i in range(60)])
    seed_reading(RegimeLabel.BULL_TREND, days_ago=1)       # too recent → no forward bars
    reg = [e for e in build_ledger(fresh_db).entries if e.kind == "regime"]
    assert reg[0].status == "pending" and not reg[0].resolved
    assert "too recent" in reg[0].outcome
    assert _kind(build_ledger(fresh_db), "regime").rate_pct is None


def test_horizon_constant_sane():
    assert 5 <= HORIZON_SESSIONS <= 63       # ~a week to a quarter of sessions


# ── over HTTP + no dollars ───────────────────────────────────────────────────
def test_ledger_over_http_and_no_dollars(config):
    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    seed_closed("AAA", thesis_played_out="yes", realized=5.0)
    seed_bench([100 * 1.01 ** i for i in range(60)])
    seed_reading(RegimeLabel.BULL_TREND, days_ago=40)
    j = client.get("/api/ledger").json()
    assert j["total_entries"] >= 2
    assert {s["kind"] for s in j["summaries"]} == {"journal", "regime"}
    assert "$" not in json.dumps(j)                        # % / verdicts only, ever


# ── debate route degrades visibly ────────────────────────────────────────────
def test_debate_degrades_visibly(config):
    # A full instrument so build_instrument returns ok; the config fixture points
    # Ollama at a dead port, so the AI is genuinely unavailable and must say so.
    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    bench = [100 * 1.0005 ** i for i in range(300)]
    strong = [50 * 1.004 ** i for i in range(300)]
    conn = db.connect()
    now = utcnow()
    for sym, closes in (("SPY", bench), ("XLK", strong)):
        for i, px in enumerate(closes):
            conn.execute(
                "INSERT INTO bars (symbol, timeframe, ts, open, high, low, close, "
                "volume, source, fetched_at) VALUES (?, '1Day', ?, ?, ?, ?, ?, 1, 'test', ?)",
                (sym, iso(now - timedelta(days=len(closes) - i)), px, px, px, px, iso(now)),
            )
    conn.commit()
    j = client.get("/api/debate/XLK").json()
    assert j["status"] == "ok" and j["facts"] and "Symbol: XLK" in j["facts"]
    # the local Ollama is pointed at a dead port in the config fixture → unavailable
    assert j["debate"]["status"] == "unavailable" and j["debate"]["text"] is None
    # the model-picker preference is accepted and still degrades visibly
    jp = client.get("/api/debate/XLK?prefer=cloud").json()
    assert jp["debate"]["status"] == "unavailable"


def test_ask_and_coach_grounded_and_degrade(config):
    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    seed_bench([100 * 1.01 ** i for i in range(30)])
    seed_reading(RegimeLabel.BULL_TREND, days_ago=1)
    seed_closed("AAA", thesis_played_out="yes", realized=5.0)
    ask = client.get("/api/ask?q=what is my biggest risk?").json()
    # grounded facts are assembled + returned; the AI is down (dead-port Ollama)
    assert "Regime:" in ask["facts"] and "Risk state:" in ask["facts"]
    assert ask["status"] == "unavailable" and ask["text"] is None
    coach = client.get("/api/coach?q=where is my edge?").json()
    assert "Resolved trades:" in coach["facts"]
    assert coach["status"] == "unavailable"
    # an empty question is a 422, not a silent call
    assert client.get("/api/ask?q=").status_code == 422


def test_ledger_campaigns_and_epistemic(fresh_db):
    from hermes.validation.ledger import build_ledger
    led = build_ledger(fresh_db)
    # the honest record includes methods that found NO edge, not only wins
    verdicts = {c["verdict"] for c in led.campaigns}
    assert "validated" in verdicts and "no_edge" in verdicts and "heuristic" in verdicts
    assert led.campaign_tally.get("no_edge", 0) >= 1     # the failures are counted
    # every campaign carries hypothesis + result; epistemic rows carry may/may_not
    assert all(c.get("hypothesis") and c.get("result") for c in led.campaigns)
    assert all(e.get("may") and e.get("may_not") for e in led.epistemic)


def test_ai_status_exposes_pricing_and_notes(config):
    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    s = client.get("/api/ai/status").json()
    assert {b["name"] for b in s["backends"]} == {"ollama", "claude"}
    for b in s["backends"]:
        assert b["kind"] in ("local", "frontier") and b["note"]
        assert "in_per_mtok" in b["price"] and "out_per_mtok" in b["price"]
    # local is free; the priced meter stays AI-infra dollars (never equity)
    ollama = next(b for b in s["backends"] if b["name"] == "ollama")
    assert ollama["price"]["in_per_mtok"] == 0.0


def test_market_debate_grounded_and_degrades(config):
    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    seed_bench([100 * 1.01 ** i for i in range(30)])
    seed_reading(RegimeLabel.BULL_TREND, days_ago=1)
    j = client.get("/api/market-debate").json()
    # market-level facts (regime + posture + risk + leadership), AI down → visible
    assert "Regime:" in j["facts"] and "Leadership" in j["facts"]
    assert j["debate"]["status"] == "unavailable" and j["debate"]["text"] is None
