"""Bar and snapshot synchronization from the configured provider."""

from __future__ import annotations

from datetime import timedelta

from ..config import HermesConfig
from ..data import store
from ..data.models import utcnow
from ..data.provider import MarketDataProvider, ProviderError

HISTORY_DAYS = 730  # enough for the 252-day vol distribution + 200-day SMA warmup


def sync_bars(config: HermesConfig, provider: MarketDataProvider) -> str:
    """Fetch missing daily bars for benchmark + watchlist. Incremental after
    the first run. Partial failure is reported per symbol, not hidden."""
    symbols = list(dict.fromkeys([config.market.benchmark, *config.market.watchlist]))
    end = utcnow()
    ok, failed, total_bars = [], [], 0
    for symbol in symbols:
        last = store.latest_bar_ts(symbol, "1Day")
        start = (last - timedelta(days=5)) if last else end - timedelta(days=HISTORY_DAYS)
        try:
            bars = provider.fetch_bars(symbol, "1Day", start, end)
            total_bars += store.upsert_bars(bars)
            ok.append(symbol)
        except ProviderError as exc:
            failed.append(f"{symbol}({exc.state.value})")
    detail = f"{len(ok)}/{len(symbols)} symbols, {total_bars} bars upserted"
    if failed:
        detail += f"; FAILED: {', '.join(failed)}"
        # A partial sync is a failed sync from the operator's point of view.
        raise RuntimeError(detail)
    return detail


def sync_snapshots(config: HermesConfig, provider: MarketDataProvider) -> str:
    symbols = list(dict.fromkeys([config.market.benchmark, *config.market.watchlist]))
    ok, failed = [], []
    for symbol in symbols:
        try:
            store.upsert_snapshot(provider.fetch_snapshot(symbol))
            ok.append(symbol)
        except ProviderError as exc:
            failed.append(f"{symbol}({exc.state.value})")
    detail = f"{len(ok)}/{len(symbols)} snapshots"
    if failed:
        detail += f"; FAILED: {', '.join(failed)}"
    return detail
