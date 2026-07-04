"""Databento fallback adapter — thin, honest, and optional.

REALITY CHECK (verified 2026-07): Databento has NO recurring free tier. New
accounts get a one-time $125 credit (expires ~6 months); ongoing use is
usage-based or subscription. What makes it interesting as a fallback anyway:
the DBEQ.BASIC and EQUS.MINI US equities datasets carry zero exchange license
fees and explicitly permit commercial/display use — relevant the moment a
self-hosted Hermes is shared with others. (Redistribution rights attach to an
active subscription; check current terms before relying on them.)

This adapter covers exactly what Hermes needs from a fallback — daily bars
(schema ohlcv-1d) via the historical REST API — and nothing more:

    POST https://hist.databento.com/v0/timeseries.get_range
    HTTP Basic auth: API key as username, empty password
    form fields: dataset, symbols, schema, start, end, encoding=json

Snapshots are not implemented: Databento's live feed is a raw TCP protocol
(not REST), out of scope for a fallback. Hermes surfaces that gap instead of
hiding it.
"""

from __future__ import annotations

import json
import time
from datetime import UTC, datetime

import httpx

from .. import oplog
from ..config import HermesConfig
from .models import Bar, ProviderState, Snapshot, utcnow
from .provider import ProviderError

HIST_BASE_URL = "https://hist.databento.com"
DATASET = "EQUS.MINI"
COMPONENT = "data.databento"


class DatabentoProvider:
    name = "databento"

    def __init__(self, config: HermesConfig):
        self._key = config.secrets.databento_api_key
        self._state = ProviderState.OK if self._key else ProviderState.NO_KEYS

    def fetch_bars(
        self, symbol: str, timeframe: str, start: datetime, end: datetime
    ) -> list[Bar]:
        if timeframe != "1Day":
            # Fallback scope is daily bars only; the gap is explicit.
            oplog.log(COMPONENT, "fetch_bars", self.name, None, "skip",
                      f"timeframe {timeframe} not supported by fallback adapter")
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
                    "schema": "ohlcv-1d",
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
        # JSON-lines: one record per line; ts_event in nanoseconds since epoch,
        # prices scaled by 1e-9 per DBN convention.
        for line in resp.text.strip().splitlines():
            if not line.strip():
                continue
            rec = json.loads(line)
            hd = rec.get("hd", rec)
            ts_ns = int(hd.get("ts_event", rec.get("ts_event", 0)))
            scale = 1e-9
            bars.append(Bar(
                symbol=symbol, timeframe="1Day",
                ts=datetime.fromtimestamp(ts_ns / 1e9, tz=UTC),
                open=rec["open"] * scale, high=rec["high"] * scale,
                low=rec["low"] * scale, close=rec["close"] * scale,
                volume=rec.get("volume"), source=f"{self.name}:{DATASET}",
                fetched_at=fetched_at,
            ))
        self._state = ProviderState.OK
        oplog.log(COMPONENT, "timeseries.get_range", self.name, latency, "ok",
                  f"{symbol} {len(bars)} bars")
        return bars

    def fetch_snapshot(self, symbol: str) -> Snapshot:
        raise ProviderError(
            "Databento fallback has no snapshot support (live feed is raw TCP, "
            "out of adapter scope). Latest daily close from bars is the freshest "
            "value this provider offers — and it is labeled as such.",
            self._state,
        )

    def state(self) -> ProviderState:
        return self._state
