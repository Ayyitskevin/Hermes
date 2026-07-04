"""Provider selection — one place, config-driven, explicit."""

from __future__ import annotations

from ..config import HermesConfig
from .alpaca import AlpacaProvider
from .databento import DatabentoProvider
from .provider import MarketDataProvider
from .sample import SampleProvider

PROVIDERS = {
    "alpaca": AlpacaProvider,
    "databento": DatabentoProvider,
    "sample": SampleProvider,
}


def build_provider(config: HermesConfig) -> MarketDataProvider:
    name = config.data.provider
    if name not in PROVIDERS:
        raise ValueError(f"Unknown data provider {name!r}; known: {sorted(PROVIDERS)}")
    return PROVIDERS[name](config)
