"""Bar and snapshot synchronization from the configured provider."""

from __future__ import annotations

from datetime import timedelta

from ..config import HermesConfig
from ..data import store
from ..data.models import utcnow
from ..data.provider import MarketDataProvider, ProviderError

HISTORY_DAYS = 730  # enough for the 252-day vol distribution + 200-day SMA warmup

# How much history to pull per timeframe (C2).
_HISTORY = {
    "1Day": 730,
    "4Hour": 180,   # calendar days of 4H bars
    "1Hour": 60,
    "1Week": 365 * 5,
}


def sync_bars(config: HermesConfig, provider: MarketDataProvider) -> str:
    """Fetch missing bars for benchmark + watchlist across configured timeframes.

    Primary path remains 1Day; additional timeframes in market.timeframes are
    synced when listed (C2). Partial failure is reported per symbol, not hidden.
    """
    symbols = list(dict.fromkeys([config.market.benchmark, *config.market.watchlist]))
    timeframes = list(dict.fromkeys(config.market.timeframes or ["1Day"]))
    end = utcnow()
    ok, failed, total_bars = [], [], 0
    for symbol in symbols:
        for tf in timeframes:
            days = _HISTORY.get(tf, HISTORY_DAYS)
            last = store.latest_bar_ts(symbol, tf)
            start = (last - timedelta(days=5)) if last else end - timedelta(days=days)
            try:
                bars = provider.fetch_bars(symbol, tf, start, end)
                if not bars and tf != "1Day":
                    # Non-daily empty is a skip (provider may not support TF), not a hard fail.
                    continue
                total_bars += store.upsert_bars(bars)
                ok.append(f"{symbol}:{tf}")
            except ProviderError as exc:
                failed.append(f"{symbol}:{tf}({exc.state.value})")
    detail = f"{len(ok)} symbol-tf ok, {total_bars} bars upserted, timeframes={timeframes}"
    if failed:
        # Only hard-fail if the primary daily path failed for any symbol.
        primary = getattr(config.regime, "primary_timeframe", "1Day") or "1Day"
        primary_fails = [f for f in failed if f":{primary}(" in f or f.endswith(f":{primary}")]
        detail += f"; FAILED: {', '.join(failed)}"
        if primary_fails or any(":1Day(" in f for f in failed):
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
