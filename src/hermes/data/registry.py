"""Provider selection — one place, config-driven, explicit."""

from __future__ import annotations

from ..config import HermesConfig
from .alpaca import AlpacaProvider
from .crypto import BinancePublicProvider, CoinbasePublicProvider, KrakenPublicProvider
from .databento import DatabentoProvider
from .provider import MarketDataProvider
from .sample import SampleProvider

PROVIDERS = {
    "alpaca": AlpacaProvider,
    "databento": DatabentoProvider,
    "sample": SampleProvider,
    "binance": BinancePublicProvider,
    "coinbase": CoinbasePublicProvider,
    "kraken": KrakenPublicProvider,
}


def build_provider(config: HermesConfig) -> MarketDataProvider:
    """Build the configured provider, optionally wrapping a failover chain (C1)."""
    name = config.data.provider
    if name not in PROVIDERS:
        raise ValueError(f"Unknown data provider {name!r}; known: {sorted(PROVIDERS)}")
    use_fo = getattr(config.data, "use_failover", True)
    chain = list(getattr(config.data, "failover", None) or [])
    if use_fo and chain:
        from .failover import FailoverProvider
        return FailoverProvider(config)
    return PROVIDERS[name](config)
