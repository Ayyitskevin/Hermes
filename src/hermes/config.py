"""Configuration loading: .env for secrets, hermes.toml for parameters.

Precedence: environment variables > config/hermes.toml > built-in defaults.
Secrets only ever come from the environment. The config file must contain no
credentials and no dollar figures — risk is expressed as % of equity.
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv


@dataclass(frozen=True)
class MarketConfig:
    benchmark: str = "SPY"
    # Defaults mirror config/hermes.example.toml so a zero-config clone gets
    # the full experience (breadth needs >=5 symbols with history).
    watchlist: list[str] = field(default_factory=lambda: [
        "SPY", "QQQ", "IWM", "XLK", "XLE", "XLF", "XLV", "XLI", "XLP", "XLU",
    ])
    # RESERVED: V1 workflows hardcode 1Day; this knob is read by nothing yet
    # (V2+ roadmap item covers 4H/weekly timeframes).
    timeframes: list[str] = field(default_factory=lambda: ["1Day"])
    stale_after_minutes: int = 30


@dataclass(frozen=True)
class DataConfig:
    provider: str = "sample"  # safe default: runs with zero keys


@dataclass(frozen=True)
class RegimeConfig:
    # "v62" — Regime Label v6.2, the owner's classifier (ported 2026-07).
    # "reference-v1" — the transparent published-methods composite.
    classifier: str = "v62"
    vol_percentile_lookback: int = 252


@dataclass(frozen=True)
class RiskConfig:
    max_risk_per_trade_pct: float = 1.0
    max_open_risk_pct: float = 4.0
    max_position_size_pct: float = 20.0
    max_sector_exposure_pct: float = 30.0
    max_drawdown_pct: float = 10.0
    correlation_warn_threshold: float = 0.70
    correlation_lookback_days: int = 60


@dataclass(frozen=True)
class JournalConfig:
    stale_open_after_days: int = 45


@dataclass(frozen=True)
class AiConfig:
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.1"
    # RESERVED V2 slot: no cloud code path ships in V1; these knobs are not
    # read by any code yet and are documented as such.
    allow_cloud: bool = False
    cloud_model: str = "claude-sonnet-5"


@dataclass(frozen=True)
class ScheduleConfig:
    timezone: str = "America/New_York"
    premarket_check: str = "0 8"
    eod_sync: str = "30 16"
    journal_resolve: str = "0 17"


@dataclass(frozen=True)
class ServerConfig:
    host: str = "127.0.0.1"
    port: int = 8642


@dataclass(frozen=True)
class Secrets:
    """Credentials, loaded exclusively from the environment."""

    alpaca_key_id: str = ""
    alpaca_secret_key: str = ""
    databento_api_key: str = ""
    anthropic_api_key: str = ""


@dataclass(frozen=True)
class HermesConfig:
    market: MarketConfig
    data: DataConfig
    regime: RegimeConfig
    risk: RiskConfig
    journal: JournalConfig
    ai: AiConfig
    schedule: ScheduleConfig
    server: ServerConfig
    secrets: Secrets
    data_dir: Path
    log_dir: Path
    config_path: Path | None


def _section(raw: dict, name: str, cls):
    known = {f: raw.get(name, {}).get(f) for f in cls.__dataclass_fields__}
    return cls(**{k: v for k, v in known.items() if v is not None})


def load_config(root: Path | None = None) -> HermesConfig:
    """Load configuration relative to *root* (defaults to the working directory)."""
    root = root or Path.cwd()
    load_dotenv(root / ".env")

    config_path = Path(os.environ.get("HERMES_CONFIG", root / "config" / "hermes.toml"))
    raw: dict = {}
    if config_path.exists():
        with open(config_path, "rb") as f:
            raw = tomllib.load(f)

    server = _section(raw, "server", ServerConfig)
    if os.environ.get("HERMES_HOST") or os.environ.get("HERMES_PORT"):
        server = ServerConfig(
            host=os.environ.get("HERMES_HOST", server.host),
            port=int(os.environ.get("HERMES_PORT", server.port)),
        )

    return HermesConfig(
        market=_section(raw, "market", MarketConfig),
        data=_section(raw, "data", DataConfig),
        regime=_section(raw, "regime", RegimeConfig),
        risk=_section(raw, "risk", RiskConfig),
        journal=_section(raw, "journal", JournalConfig),
        ai=_section(raw, "ai", AiConfig),
        schedule=_section(raw, "schedule", ScheduleConfig),
        server=server,
        secrets=Secrets(
            alpaca_key_id=os.environ.get("APCA_API_KEY_ID", ""),
            alpaca_secret_key=os.environ.get("APCA_API_SECRET_KEY", ""),
            databento_api_key=os.environ.get("DATABENTO_API_KEY", ""),
            anthropic_api_key=os.environ.get("ANTHROPIC_API_KEY", ""),
        ),
        data_dir=Path(os.environ.get("HERMES_DATA_DIR", root / "data")),
        log_dir=Path(os.environ.get("HERMES_LOG_DIR", root / "logs")),
        config_path=config_path if config_path.exists() else None,
    )
