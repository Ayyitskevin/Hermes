"""Shared fixtures: isolated data/log dirs and a sample-provider config."""

from __future__ import annotations

import pytest

from hermes import db, oplog
from hermes.config import (
    AiConfig,
    BackupConfig,
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


@pytest.fixture()
def config(tmp_path) -> HermesConfig:
    return HermesConfig(
        market=MarketConfig(
            benchmark="SPY",
            watchlist=["SPY", "QQQ", "IWM", "XLK", "XLE", "XLF"],
        ),
        data=DataConfig(provider="sample"),
        regime=RegimeConfig(),
        risk=RiskConfig(),
        journal=JournalConfig(),
        # Point Ollama at a dead local port so LLM passes skip fast and visibly.
        ai=AiConfig(ollama_url="http://127.0.0.1:1", ollama_model="test"),
        schedule=ScheduleConfig(),
        backup=BackupConfig(),
        server=ServerConfig(),
        secrets=Secrets(),
        data_dir=tmp_path / "data",
        log_dir=tmp_path / "logs",
        config_path=None,
    )


@pytest.fixture()
def fresh_db(config):
    """Initialized, empty database in a tmp dir (one per test)."""
    oplog.init(config.log_dir)
    db.init(config.data_dir)
    yield config
