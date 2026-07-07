"""Instrument terminal: a full known-symbol payload, the short-history missing
path (missing fields, never zeros), the non-bull posture cap + breach force,
the factors-sum-to-score invariant, search ranking, the AI narrative degrading
visibly, and a no-dollar-figures assertion over the HTTP payload. Mirrors
test_screener's synthetic-bar + store-seeding idioms."""

from __future__ import annotations

import json
from datetime import timedelta

from fastapi.testclient import TestClient

from hermes import db
from hermes.ai.router import AIResult
from hermes.data.models import iso, utcnow
from hermes.instrument.terminal import _posture, build_instrument, search
from hermes.main import create_app
from hermes.regime.engine import store_reading
from hermes.regime.models import RegimeLabel, RegimeReading

STRONG_UP = [50 * 1.004 ** i for i in range(300)]        # >=252 closes, strong uptrend
BENCH = [100 * 1.0005 ** i for i in range(300)]          # slower benchmark → RS rises


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


def seed_regime(label: RegimeLabel) -> None:
    store_reading(RegimeReading(
        ts=utcnow(), label=label, score=0.5, confidence=0.7,
        classifier_version="test-v1", evidence=[], data_asof=utcnow(),
        data_source="test", honesty="test honesty",
    ))


# ── full payload ───────────────────────────────────────────────────────────
def test_known_symbol_full_payload(fresh_db):
    seed_bars("SPY", BENCH)
    seed_bars("XLK", STRONG_UP)
    seed_regime(RegimeLabel.BULL_TREND)
    rep = build_instrument(fresh_db, "XLK")
    assert rep.status == "ok"
    assert rep.mansfield is not None and rep.trend_score is not None and rep.rs is not None
    assert rep.sma50 and rep.sma150 and rep.sma200 and rep.high_52w and rep.low_52w
    tf = rep.thesis_fit
    assert tf.status == "ok" and tf.score is not None
    assert tf.posture in ("ALLOW", "WATCH", "RESTRICT")
    assert len(tf.factors) == 4 and all(f.points is not None for f in tf.factors)
    assert len(rep.series) > 0
    # a strong leader in a bull tape should read ALLOW
    assert tf.posture == "ALLOW"


def test_ohlc_daychange_atr_and_range(fresh_db):
    seed_bars("SPY", BENCH)
    seed_bars("XLK", STRONG_UP)
    seed_regime(RegimeLabel.BULL_TREND)
    rep = build_instrument(fresh_db, "XLK", range_key="3M")
    # day change vs the prior close (STRONG_UP rises, so it's positive)
    assert rep.prev_close is not None and rep.day_change is not None
    assert rep.day_change > 0 and rep.day_change_pct > 0
    assert rep.open is not None and rep.high is not None and rep.low is not None
    assert rep.atr14 is not None and rep.atr14 >= 0
    assert rep.range_key == "3M"
    # the chart window follows the range (3M ≈ 63 sessions)
    assert len(rep.series) == 63
    # an unknown range falls back to 6M, never errors
    assert build_instrument(fresh_db, "XLK", range_key="bogus").range_key == "6M"


def test_factors_sum_to_score(fresh_db):
    seed_bars("SPY", BENCH)
    seed_bars("XLK", STRONG_UP)
    seed_regime(RegimeLabel.BULL_TREND)
    tf = build_instrument(fresh_db, "XLK").thesis_fit
    assert round(sum(f.points for f in tf.factors)) == tf.score


# ── short history: missing, never zero ──────────────────────────────────────
def test_short_history_missing_not_zero(fresh_db):
    seed_bars("SPY", BENCH)
    seed_bars("XLK", [50 * 1.004 ** i for i in range(100)])   # < 200 overlap / 252 bars
    seed_regime(RegimeLabel.BULL_TREND)
    rep = build_instrument(fresh_db, "XLK")
    assert rep.status == "ok"
    assert rep.mansfield is None and rep.trend_score is None     # missing, not 0
    assert rep.thesis_fit.status == "missing" and rep.thesis_fit.score is None
    rf = next(f for f in rep.thesis_fit.factors if f.key == "regime_fit")
    sm = next(f for f in rep.thesis_fit.factors if f.key == "setup_match")
    assert rf.points is None and rf.chip == "missing"
    assert sm.points is None and sm.chip == "missing"


def test_unknown_symbol_is_missing(fresh_db):
    rep = build_instrument(fresh_db, "NOPE")
    assert rep.status == "missing" and rep.thesis_fit is None
    assert "never faked" in rep.note


# ── posture caps (risk outranks selection) ──────────────────────────────────
def test_posture_caps_and_breach_force():
    assert _posture(80, bull=True, breach=False)[0] == "ALLOW"
    p, capped, note = _posture(80, bull=False, breach=False)
    assert p == "WATCH" and capped is True and "not a bull trend" in note
    p2, capped2, note2 = _posture(50, bull=True, breach=True)
    assert p2 == "RESTRICT" and capped2 is True and "breach" in note2


def test_non_bull_build_never_allows(fresh_db):
    seed_bars("SPY", BENCH)
    seed_bars("XLK", STRONG_UP)
    seed_regime(RegimeLabel.CHOP)
    rep = build_instrument(fresh_db, "XLK")
    assert rep.thesis_fit.posture in ("WATCH", "RESTRICT")      # never ALLOW off-bull


# ── search ───────────────────────────────────────────────────────────────────
def test_search_ranks_watchlist(fresh_db):
    seed_bars("XLK", STRONG_UP)
    res = search(fresh_db, "X")
    assert all("X" in r["symbol"] for r in res)
    xlk = next(r for r in res if r["symbol"] == "XLK")
    assert xlk["in_watchlist"] is True and xlk["has_history"] is True
    xle = next(r for r in res if r["symbol"] == "XLE")
    assert xle["has_history"] is False                          # in watchlist, not cached


def test_search_unknown_symbol_is_honest(fresh_db):
    res = search(fresh_db, "ZZZ")
    z = next(r for r in res if r["symbol"] == "ZZZ")
    assert z["in_watchlist"] is False and z["has_history"] is False and z["note"]


# ── AI narrative degrades visibly ───────────────────────────────────────────
class _DownAI:
    def complete(self, task, **kw):
        return AIResult("unavailable", None, None, None, None, None,
                        "model unavailable — both down")


class _UpAI:
    def complete(self, task, **kw):
        assert task == "desk_read" and "Symbol:" in kw["facts_md"]
        return AIResult("ok", "Strong leader, size-disciplined.", "ollama",
                        "llama3.1", 12.0, None, "answered by ollama")


def test_narrative_degrades_visibly(fresh_db):
    seed_bars("SPY", BENCH)
    seed_bars("XLK", STRONG_UP)
    seed_regime(RegimeLabel.BULL_TREND)
    down = build_instrument(fresh_db, "XLK", ai=_DownAI(), narrative=True)
    assert down.narrative["status"] == "unavailable" and down.narrative["text"] is None
    up = build_instrument(fresh_db, "XLK", ai=_UpAI(), narrative=True)
    assert up.narrative["status"] == "ok" and "Strong leader" in up.narrative["text"]


def test_narrative_off_by_default(fresh_db):
    seed_bars("SPY", BENCH)
    seed_bars("XLK", STRONG_UP)
    seed_regime(RegimeLabel.BULL_TREND)
    # narrative not requested → the AI is never consulted, chart stays fast
    rep = build_instrument(fresh_db, "XLK", ai=_UpAI(), narrative=False)
    assert rep.narrative is None


# ── over HTTP + no dollar figures ───────────────────────────────────────────
def test_instrument_over_http_and_no_dollars(config):
    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    seed_bars("SPY", BENCH)
    seed_bars("XLK", STRONG_UP)
    seed_regime(RegimeLabel.BULL_TREND)
    j = client.get("/api/instrument/XLK").json()
    assert j["status"] == "ok"
    assert j["thesis_fit"]["posture"] in ("ALLOW", "WATCH", "RESTRICT")
    assert len(j["thesis_fit"]["factors"]) == 4
    assert "$" not in json.dumps(j)                            # % of equity only, ever
    s = client.get("/api/search?q=X").json()
    assert any(r["symbol"] == "XLK" for r in s["results"])
