"""Sector drill: sector ETFs ranked by Mansfield RS (leaders first), lead/lag
classification, the MA stack from cached bars, book exposure name-matched to a
sector ETF (tailwind/headwind) with unmatched tags shown honestly, coverage vs
uncovered SPDR sectors, and a no-dollar-figures assertion over HTTP."""

from __future__ import annotations

import json
from datetime import timedelta

from fastapi.testclient import TestClient

from hermes import db
from hermes.config import (
    AiConfig,
    BackupConfig,
    BrokerROConfig,
    DataConfig,
    HermesConfig,
    JournalConfig,
    MarketConfig,
    RegimeConfig,
    RiskConfig,
    ScheduleConfig,
    Secrets,
    ServerConfig,
)
from hermes.data.models import iso, utcnow
from hermes.main import create_app
from hermes.sector.drill import _lead_lag, _match_etf, build_drill

# A benchmark and two sector ETFs: a strong leader (XLK) and a laggard (XLU).
BENCH = [100 * 1.0006 ** i for i in range(320)]
LEADER = [50 * 1.004 ** i for i in range(320)]           # rises faster → +Mansfield
LAGGARD = [80 * 1.0001 ** i for i in range(320)]         # rises slower → −Mansfield


def _sector_config(tmp_path) -> HermesConfig:
    return HermesConfig(
        market=MarketConfig(benchmark="SPY", watchlist=["SPY", "XLK", "XLU"]),
        data=DataConfig(provider="sample"), regime=RegimeConfig(), risk=RiskConfig(),
        journal=JournalConfig(), ai=AiConfig(ollama_url="http://127.0.0.1:1"),
        schedule=ScheduleConfig(),
        backup=BackupConfig(),
        broker_ro=BrokerROConfig(),
        server=ServerConfig(),
        secrets=Secrets(),
        data_dir=tmp_path / "data",
        log_dir=tmp_path / "logs",
        config_path=None,
    )


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


def seed_open(symbol: str, *, size: float, sector: str, side: str = "long") -> None:
    conn = db.connect()
    conn.execute(
        """INSERT INTO journal_entries
           (symbol, side, sector, opened_at, entry_price, stop_price, size_pct_equity,
            planned_risk_pct, thesis, status)
           VALUES (?, ?, ?, ?, 100, 95, ?, 1, 'seed', 'open')""",
        (symbol, side, sector, iso(utcnow()), size),
    )
    conn.commit()


def _init_db(config):
    from hermes import db as _db
    from hermes import oplog
    oplog.init(config.log_dir)
    _db.init(config.data_dir)
    return config


# ── unit: helpers ────────────────────────────────────────────────────────────
def test_match_etf_aliases():
    assert _match_etf("Tech") == "XLK"
    assert _match_etf("regional banks") == "XLF"
    assert _match_etf("biotech") == "XLV"
    assert _match_etf("crypto") is None
    assert _match_etf(None) is None


def test_lead_lag_band():
    assert _lead_lag(5.0) == "leading"
    assert _lead_lag(-5.0) == "lagging"
    assert _lead_lag(0.2) == "inline"
    assert _lead_lag(None) == "unknown"


# ── ranking + lead/lag ───────────────────────────────────────────────────────
def test_sectors_ranked_leaders_first(tmp_path):
    cfg = _init_db(_sector_config(tmp_path))
    seed_bars("SPY", BENCH)
    seed_bars("XLK", LEADER)
    seed_bars("XLU", LAGGARD)
    d = build_drill(cfg)
    assert d.status == "ok"
    assert [s.symbol for s in d.sectors] == ["XLK", "XLU"]     # leader first
    assert d.sectors[0].lead_lag == "leading" and d.sectors[0].mansfield > 0
    assert d.sectors[1].lead_lag == "lagging" and d.sectors[1].mansfield < 0
    assert d.sectors[0].ma_stack == 3                          # clean uptrend
    assert set(d.covered) == {"Technology", "Utilities"}


def test_uncovered_sectors_listed(tmp_path):
    cfg = _init_db(_sector_config(tmp_path))
    seed_bars("SPY", BENCH)
    seed_bars("XLK", LEADER)
    d = build_drill(cfg)
    # XLU is in the watchlist; Energy/Financials/etc are not → listed as uncovered
    assert any("Energy" in u for u in d.uncovered)
    assert not any("Technology" in u for u in d.uncovered)


# ── book overlay ─────────────────────────────────────────────────────────────
def test_book_tailwind_headwind_and_unbenchmarked(tmp_path):
    cfg = _init_db(_sector_config(tmp_path))
    seed_bars("SPY", BENCH)
    seed_bars("XLK", LEADER)
    seed_bars("XLU", LAGGARD)
    seed_open("AAPL", size=12.0, sector="Technology")         # → XLK, leading → tailwind
    seed_open("DUK", size=8.0, sector="Utilities")            # → XLU, lagging → headwind
    seed_open("BTC", size=5.0, sector="Crypto")               # no ETF → unbenchmarked
    d = build_drill(cfg)
    by_tag = {b.tag: b for b in d.book}
    tech = by_tag["Technology"]
    assert tech.alignment == "tailwind" and tech.matched_etf == "XLK"
    assert by_tag["Utilities"].alignment == "headwind"
    assert by_tag["Crypto"].alignment == "unbenchmarked" and by_tag["Crypto"].matched_etf is None
    assert d.book_in_leading_pct == 12.0
    assert d.book_in_lagging_pct == 8.0
    assert d.book_unbenchmarked_pct == 5.0
    # matched weight folds back onto the sector row
    xlk = next(s for s in d.sectors if s.symbol == "XLK")
    assert xlk.book_weight_pct == 12.0


def test_no_sector_etfs_is_missing(tmp_path):
    cfg = _sector_config(tmp_path)
    cfg = HermesConfig(**{**cfg.__dict__,
                          "market": MarketConfig(benchmark="SPY", watchlist=["SPY", "QQQ"])})
    _init_db(cfg)
    seed_bars("SPY", BENCH)
    d = build_drill(cfg)
    assert d.status == "missing" and "nothing to drill" in d.note


# ── over HTTP + no dollars ───────────────────────────────────────────────────
def test_sector_over_http_and_no_dollars(tmp_path):
    cfg = _init_db(_sector_config(tmp_path))
    app = create_app(cfg, with_scheduler=False)
    client = TestClient(app)
    seed_bars("SPY", BENCH)
    seed_bars("XLK", LEADER)
    seed_bars("XLU", LAGGARD)
    seed_open("AAPL", size=12.0, sector="Technology")
    j = client.get("/api/sector").json()
    assert j["status"] == "ok"
    assert j["sectors"][0]["symbol"] == "XLK"
    assert j["book_in_leading_pct"] == 12.0
    assert "$" not in json.dumps(j)                            # % / RS only, ever
