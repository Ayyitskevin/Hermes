"""C-tier expansions: failover, multi-TF, pairs, options posture, dual-ma,
crypto provider surface, fills scaffolding."""

from __future__ import annotations

from datetime import timedelta

from fastapi.testclient import TestClient

from hermes.data.models import iso, utcnow
from hermes.main import create_app
from hermes.pairs.screener import build_pair_screen
from hermes.regime.dual_ma import DualMAClassifier
from hermes.regime.engine import CLASSIFIERS
from hermes.regime.multi_tf import multi_timeframe_read


def _seed_symbol(symbol: str, n: int = 120, drift: float = 0.002):
    from hermes import db

    conn = db.connect()
    now = utcnow()
    px = 100.0
    for i in range(n):
        ts = iso(now - timedelta(days=n - i))
        conn.execute(
            """INSERT INTO bars (symbol, timeframe, ts, open, high, low, close,
               volume, source, fetched_at)
               VALUES (?, '1Day', ?, ?, ?, ?, ?, 1000, 'test', ?)""",
            (symbol, ts, px, px * 1.01, px * 0.99, px, iso(now)),
        )
        px *= 1 + drift
    conn.commit()


def test_dual_ma_registered_and_classifies(fresh_db, config):
    assert "dual-ma-v1" in CLASSIFIERS
    _seed_symbol("SPY", 220, 0.003)
    from hermes.data import store

    b = store.get_bars("SPY", "1Day", limit=400)
    reading = DualMAClassifier(config).classify(b, {})
    assert reading.classifier_version == "dual-ma-v1"
    assert reading.label is not None
    honesty = reading.honesty.lower()
    assert "not" in honesty or "heuristic" in honesty or "opinion" in honesty


def test_pairs_and_options_and_multi_tf_api(fresh_db, config):
    for sym, drift in [
        ("SPY", 0.001),
        ("QQQ", 0.0012),
        ("IWM", 0.0005),
        ("XLK", 0.0015),
        ("XLE", 0.0003),
    ]:
        _seed_symbol(sym, 90, drift)
    screen = build_pair_screen(config, limit=10)
    assert screen.rows is not None

    app = create_app(config, with_scheduler=False)
    client = TestClient(app)
    pairs = client.get("/api/pairs").json()
    assert "rows" in pairs and "honesty" in pairs

    opt = client.get("/api/options/posture/SPY").json()
    assert opt["posture"] in ("ALLOW_RESEARCH", "WATCH", "RESTRICT")
    cave = opt["honesty"]["caveat"].lower()
    assert "chain" in cave or "option" in cave

    mtf = client.get("/api/regime/multi-tf").json()
    assert "rows" in mtf
    assert mtf["primary_timeframe"] in ("1Day", config.regime.primary_timeframe)

    fo = client.get("/api/failover").json()
    assert "providers" in fo or "chain" in fo


def test_crypto_providers_in_registry():
    from hermes.data.registry import PROVIDERS

    assert set(PROVIDERS) >= {
        "binance", "coinbase", "kraken", "alpaca", "databento", "sample",
    }


def test_import_fills_requires_broker_ro(fresh_db, config):
    client = TestClient(create_app(config, with_scheduler=False))
    assert client.post("/api/book/import-fills").status_code == 422


def test_multi_tf_read_missing_without_bars(fresh_db, config):
    out = multi_timeframe_read(config)
    assert out["rows"]
    assert all(r["status"] == "missing" for r in out["rows"])
