"""Public crypto market-data providers — READ-ONLY, decision-support only.

No trading hosts, no API keys required for public OHLCV. Symbols use the
exchange's native pair form (e.g. BTCUSDT on Binance). Hermes never places
crypto orders; these adapters only fill bars/snapshots for regime/journal work
if crypto enters the watchlist.
"""

from __future__ import annotations

import time
from datetime import UTC, datetime

import httpx

from .. import oplog
from ..config import HermesConfig
from .models import Bar, ProviderState, Snapshot, utcnow
from .provider import ProviderError

# Binance public REST (market data only).
BINANCE_BASE = "https://api.binance.com"
# Coinbase Exchange public candles.
COINBASE_BASE = "https://api.exchange.coinbase.com"
# Kraken public OHLC.
KRAKEN_BASE = "https://api.kraken.com"

_TF_BINANCE = {
    "1Day": "1d",
    "4Hour": "4h",
    "1Hour": "1h",
    "1Week": "1w",
}
_TF_COINBASE = {
    "1Day": 86400,
    "4Hour": 14400,
    "1Hour": 3600,
    "1Week": 604800,
}


class BinancePublicProvider:
    name = "binance"

    def __init__(self, config: HermesConfig):
        self._state = ProviderState.OK
        self._client = httpx.Client(base_url=BINANCE_BASE, timeout=30.0)

    def fetch_bars(
        self, symbol: str, timeframe: str, start: datetime, end: datetime
    ) -> list[Bar]:
        interval = _TF_BINANCE.get(timeframe)
        if not interval:
            oplog.log("data.binance", "fetch_bars", self.name, None, "skip",
                      f"timeframe {timeframe} unsupported")
            return []
        t0 = time.monotonic()
        try:
            resp = self._client.get(
                "/api/v3/klines",
                params={
                    "symbol": symbol.upper(),
                    "interval": interval,
                    "startTime": int(start.timestamp() * 1000),
                    "endTime": int(end.timestamp() * 1000),
                    "limit": 1000,
                },
            )
        except httpx.HTTPError as exc:
            self._state = ProviderState.UNREACHABLE
            raise ProviderError(f"Binance unreachable: {exc}",
                                ProviderState.UNREACHABLE) from exc
        latency = (time.monotonic() - t0) * 1000
        if resp.status_code == 429:
            self._state = ProviderState.RATE_LIMITED
            raise ProviderError("Binance rate limited", ProviderState.RATE_LIMITED)
        if resp.status_code != 200:
            self._state = ProviderState.UNREACHABLE
            raise ProviderError(f"Binance HTTP {resp.status_code}",
                                ProviderState.UNREACHABLE)
        fetched = utcnow()
        bars = []
        for row in resp.json():
            # [open_time, o, h, l, c, volume, ...]
            bars.append(Bar(
                symbol=symbol.upper(), timeframe=timeframe,
                ts=datetime.fromtimestamp(row[0] / 1000, tz=UTC),
                open=float(row[1]), high=float(row[2]), low=float(row[3]),
                close=float(row[4]), volume=float(row[5]),
                source=f"{self.name}:public", fetched_at=fetched,
            ))
        self._state = ProviderState.OK
        oplog.log("data.binance", "klines", self.name, latency, "ok",
                  f"{symbol} {len(bars)}")
        return bars

    def fetch_snapshot(self, symbol: str) -> Snapshot:
        t0 = time.monotonic()
        try:
            resp = self._client.get("/api/v3/ticker/price",
                                    params={"symbol": symbol.upper()})
        except httpx.HTTPError as exc:
            self._state = ProviderState.UNREACHABLE
            raise ProviderError(str(exc), ProviderState.UNREACHABLE) from exc
        latency = (time.monotonic() - t0) * 1000
        if resp.status_code != 200:
            raise ProviderError(f"Binance ticker HTTP {resp.status_code}",
                                ProviderState.UNREACHABLE)
        price = float(resp.json()["price"])
        oplog.log("data.binance", "ticker", self.name, latency, "ok", symbol)
        return Snapshot(
            symbol=symbol.upper(), price=price, ts=utcnow(),
            source=f"{self.name}:public", fetched_at=utcnow(),
        )

    def state(self) -> ProviderState:
        return self._state


class CoinbasePublicProvider:
    name = "coinbase"

    def __init__(self, config: HermesConfig):
        self._state = ProviderState.OK
        self._client = httpx.Client(base_url=COINBASE_BASE, timeout=30.0)

    def fetch_bars(
        self, symbol: str, timeframe: str, start: datetime, end: datetime
    ) -> list[Bar]:
        gran = _TF_COINBASE.get(timeframe)
        if not gran:
            return []
        # Coinbase product ids look like BTC-USD
        product = symbol.upper().replace("USDT", "-USD").replace("USD", "-USD")
        if product.count("-") == 0:
            product = f"{product}-USD"
        product = product.replace("--", "-")
        t0 = time.monotonic()
        try:
            resp = self._client.get(
                f"/products/{product}/candles",
                params={
                    "granularity": gran,
                    "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                },
            )
        except httpx.HTTPError as exc:
            self._state = ProviderState.UNREACHABLE
            raise ProviderError(str(exc), ProviderState.UNREACHABLE) from exc
        if resp.status_code != 200:
            self._state = ProviderState.UNREACHABLE
            raise ProviderError(f"Coinbase HTTP {resp.status_code}",
                                ProviderState.UNREACHABLE)
        fetched = utcnow()
        bars = []
        # [time, low, high, open, close, volume] newest first
        for row in sorted(resp.json(), key=lambda r: r[0]):
            bars.append(Bar(
                symbol=symbol.upper(), timeframe=timeframe,
                ts=datetime.fromtimestamp(row[0], tz=UTC),
                open=float(row[3]), high=float(row[2]), low=float(row[1]),
                close=float(row[4]), volume=float(row[5]),
                source=f"{self.name}:public", fetched_at=fetched,
            ))
        self._state = ProviderState.OK
        oplog.log("data.coinbase", "candles", self.name,
                  (time.monotonic() - t0) * 1000, "ok", f"{product} {len(bars)}")
        return bars

    def fetch_snapshot(self, symbol: str) -> Snapshot:
        product = symbol.upper().replace("USDT", "-USD")
        if "-" not in product:
            product = f"{product}-USD"
        resp = self._client.get(f"/products/{product}/ticker")
        if resp.status_code != 200:
            raise ProviderError(f"Coinbase ticker HTTP {resp.status_code}",
                                ProviderState.UNREACHABLE)
        data = resp.json()
        return Snapshot(
            symbol=symbol.upper(), price=float(data["price"]),
            ts=utcnow(), source=f"{self.name}:public", fetched_at=utcnow(),
        )

    def state(self) -> ProviderState:
        return self._state


class KrakenPublicProvider:
    name = "kraken"

    def __init__(self, config: HermesConfig):
        self._state = ProviderState.OK
        self._client = httpx.Client(base_url=KRAKEN_BASE, timeout=30.0)

    def fetch_bars(
        self, symbol: str, timeframe: str, start: datetime, end: datetime
    ) -> list[Bar]:
        # Kraken interval in minutes
        minutes = {"1Hour": 60, "4Hour": 240, "1Day": 1440, "1Week": 10080}.get(timeframe)
        if not minutes:
            return []
        pair = symbol.upper().replace("BTC", "XBT")
        t0 = time.monotonic()
        try:
            resp = self._client.get(
                "/0/public/OHLC",
                params={"pair": pair, "interval": minutes,
                        "since": int(start.timestamp())},
            )
        except httpx.HTTPError as exc:
            self._state = ProviderState.UNREACHABLE
            raise ProviderError(str(exc), ProviderState.UNREACHABLE) from exc
        if resp.status_code != 200:
            raise ProviderError(f"Kraken HTTP {resp.status_code}",
                                ProviderState.UNREACHABLE)
        payload = resp.json()
        if payload.get("error"):
            raise ProviderError(f"Kraken error: {payload['error']}",
                                ProviderState.UNREACHABLE)
        result = payload.get("result") or {}
        # first key that is not 'last'
        series = next((v for k, v in result.items() if k != "last"), [])
        fetched = utcnow()
        bars = []
        end_ts = end.timestamp()
        for row in series:
            ts = float(row[0])
            if ts > end_ts:
                continue
            bars.append(Bar(
                symbol=symbol.upper(), timeframe=timeframe,
                ts=datetime.fromtimestamp(ts, tz=UTC),
                open=float(row[1]), high=float(row[2]), low=float(row[3]),
                close=float(row[4]), volume=float(row[6]),
                source=f"{self.name}:public", fetched_at=fetched,
            ))
        self._state = ProviderState.OK
        oplog.log("data.kraken", "OHLC", self.name,
                  (time.monotonic() - t0) * 1000, "ok", f"{pair} {len(bars)}")
        return bars

    def fetch_snapshot(self, symbol: str) -> Snapshot:
        pair = symbol.upper().replace("BTC", "XBT")
        resp = self._client.get("/0/public/Ticker", params={"pair": pair})
        if resp.status_code != 200:
            raise ProviderError(f"Kraken ticker HTTP {resp.status_code}",
                                ProviderState.UNREACHABLE)
        payload = resp.json()
        result = payload.get("result") or {}
        if not result:
            raise ProviderError("Kraken ticker empty", ProviderState.UNREACHABLE)
        first = next(iter(result.values()))
        # c = last trade closed [price, lot volume]
        price = float(first["c"][0])
        return Snapshot(
            symbol=symbol.upper(), price=price, ts=utcnow(),
            source=f"{self.name}:public", fetched_at=utcnow(),
        )

    def state(self) -> ProviderState:
        return self._state
