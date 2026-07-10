"""Databento fallback adapter — historical REST, honest about live TCP.

REALITY CHECK: Databento has NO recurring free tier (one-time signup credit).
This adapter uses hist.databento.com REST only. Live TCP is intentionally not
implemented — ``failover_drill`` / provider state surface the gap instead of
pretending a websocket exists.

Supported bar schemas (C1 expansion):
  * 1Day  → ohlcv-1d
  * 1Hour → ohlcv-1h
  * 4Hour → ohlcv-1h (resampled 4× hourly) when hourly is available
  * 1Week → not offered by this thin adapter (returns empty, labeled skip)
"""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime, timedelta

import httpx

from .. import oplog
from ..config import HermesConfig
from .models import Bar, ProviderState, Snapshot, utcnow
from .provider import ProviderError

HIST_BASE_URL = "https://hist.databento.com"
DATASET = "EQUS.MINI"
COMPONENT = "data.databento"

_SCHEMA = {
    "1Day": "ohlcv-1d",
    "1Hour": "ohlcv-1h",
}


class DatabentoProvider:
    name = "databento"

    def __init__(self, config: HermesConfig):
        self._key = config.secrets.databento_api_key
        self._state = ProviderState.OK if self._key else ProviderState.NO_KEYS

    def fetch_bars(
        self, symbol: str, timeframe: str, start: datetime, end: datetime
    ) -> list[Bar]:
        if timeframe == "4Hour":
            # Pull hourly and roll up — honest resample, not a native 4H feed.
            hourly = self.fetch_bars(symbol, "1Hour", start, end)
            return _resample_4h(hourly)
        schema = _SCHEMA.get(timeframe)
        if not schema:
            oplog.log(COMPONENT, "fetch_bars", self.name, None, "skip",
                      f"timeframe {timeframe} not supported by Databento REST adapter")
            return []
        if not self._key:
            raise ProviderError(
                "Databento key missing (DATABENTO_API_KEY in .env).",
                ProviderState.NO_KEYS,
            )
        t0 = time.monotonic()
        try:
            resp = httpx.post(
                f"{HIST_BASE_URL}/v0/timeseries.get_range",
                auth=(self._key, ""),
                data={
                    "dataset": DATASET,
                    "symbols": symbol,
                    "schema": schema,
                    "start": start.strftime("%Y-%m-%d"),
                    "end": end.strftime("%Y-%m-%d"),
                    "encoding": "json",
                },
                timeout=60.0,
            )
        except httpx.HTTPError as exc:
            oplog.log(COMPONENT, "timeseries.get_range", self.name,
                      (time.monotonic() - t0) * 1000, "fail", str(exc))
            self._state = ProviderState.UNREACHABLE
            raise ProviderError(f"Databento unreachable: {exc}",
                                ProviderState.UNREACHABLE) from exc
        latency = (time.monotonic() - t0) * 1000
        if resp.status_code in (401, 403):
            self._state = ProviderState.AUTH_ERROR
            oplog.log(COMPONENT, "timeseries.get_range", self.name, latency, "fail",
                      f"HTTP {resp.status_code} auth")
            raise ProviderError("Databento rejected the API key.", ProviderState.AUTH_ERROR)
        if resp.status_code == 429:
            self._state = ProviderState.RATE_LIMITED
            oplog.log(COMPONENT, "timeseries.get_range", self.name, latency, "fail",
                      "429 rate/credit limited")
            raise ProviderError("Databento rate/credit limit hit.",
                                ProviderState.RATE_LIMITED)
        if resp.status_code != 200:
            self._state = ProviderState.UNREACHABLE
            oplog.log(COMPONENT, "timeseries.get_range", self.name, latency, "fail",
                      f"HTTP {resp.status_code}")
            raise ProviderError(f"Databento HTTP {resp.status_code}: {resp.text[:200]}",
                                ProviderState.UNREACHABLE)

        fetched_at = utcnow()
        bars: list[Bar] = []
        for line in resp.text.strip().splitlines():
            if not line.strip():
                continue
            rec = json.loads(line)
            hd = rec.get("hd", rec)
            ts_ns = int(hd.get("ts_event", rec.get("ts_event", 0)))
            scale = 1e-9
            bars.append(Bar(
                symbol=symbol, timeframe=timeframe,
                ts=datetime.fromtimestamp(ts_ns / 1e9, tz=UTC),
                open=rec["open"] * scale, high=rec["high"] * scale,
                low=rec["low"] * scale, close=rec["close"] * scale,
                volume=rec.get("volume"), source=f"{self.name}:{DATASET}:{schema}",
                fetched_at=fetched_at,
            ))
        self._state = ProviderState.OK
        oplog.log(COMPONENT, "timeseries.get_range", self.name, latency, "ok",
                  f"{symbol} {timeframe} {len(bars)} bars")
        return bars

    def fetch_snapshot(self, symbol: str) -> Snapshot:
        raise ProviderError(
            "Databento has no REST snapshot here (live is raw TCP — not implemented). "
            "Use latest daily bar close from cache; it is labeled stale vs live.",
            self._state,
        )

    def state(self) -> ProviderState:
        return self._state


def _resample_4h(hourly: list[Bar]) -> list[Bar]:
    if not hourly:
        return []
    out: list[Bar] = []
    bucket: list[Bar] = []
    bucket_start: datetime | None = None
    for b in hourly:
        # floor to 4H UTC
        floored = b.ts.replace(minute=0, second=0, microsecond=0)
        floored = floored - timedelta(hours=floored.hour % 4)
        if bucket_start is None:
            bucket_start = floored
        if floored != bucket_start and bucket:
            out.append(_roll(bucket, "4Hour"))
            bucket = []
            bucket_start = floored
        bucket.append(b)
    if bucket:
        out.append(_roll(bucket, "4Hour"))
    return out


def _roll(bucket: list[Bar], timeframe: str) -> Bar:
    first, last = bucket[0], bucket[-1]
    return Bar(
        symbol=first.symbol, timeframe=timeframe, ts=first.ts,
        open=first.open,
        high=max(b.high for b in bucket),
        low=min(b.low for b in bucket),
        close=last.close,
        volume=sum(b.volume or 0 for b in bucket) or None,
        source=first.source + ":resampled-4h",
        fetched_at=last.fetched_at,
    )
