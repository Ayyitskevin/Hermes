"""Alpaca market data provider — the default.

Free ("Basic") Alpaca accounts get REAL-TIME quotes/trades/bars from the IEX
exchange plus deep historical daily bars (back to ~2016). A paper-trading
account is enough; no funding required. For daily/4H/weekly regime-following,
IEX top-of-book is functionally identical to consolidated SIP.

READ-ONLY BY CONSTRUCTION — this is the hard boundary of the whole project:
the only base URL in this module is the DATA host (data.alpaca.markets).
Alpaca's trading hosts and every order endpoint are absent — deliberately
not even named in this file — and tests/test_no_order_paths.py fails the
build if anything order-shaped ever appears in this codebase.

Known limits handled here, visibly:
  * 200 requests/min on the free tier → HTTP 429 becomes state=RATE_LIMITED,
    shown on the dashboard, never papered over with a stale number.
  * IEX-only volume (~2-3% of consolidated) → bars for thin symbols may be
    missing; missing stays missing.

Endpoint facts verified against the official alpaca-py SDK source (2026-07).
"""

from __future__ import annotations

import time
from datetime import datetime

import httpx

from .. import oplog
from ..config import HermesConfig
from .models import Bar, ProviderState, Snapshot, parse_iso, utcnow
from .provider import ProviderError

DATA_BASE_URL = "https://data.alpaca.markets"
COMPONENT = "data.alpaca"


class AlpacaProvider:
    name = "alpaca"

    def __init__(self, config: HermesConfig):
        key = config.secrets.alpaca_key_id
        secret = config.secrets.alpaca_secret_key
        self._state = ProviderState.OK if key and secret else ProviderState.NO_KEYS
        self._headers = {
            "APCA-API-KEY-ID": key,
            "APCA-API-SECRET-KEY": secret,
            "Accept": "application/json",
        }
        self._client = httpx.Client(base_url=DATA_BASE_URL, headers=self._headers,
                                    timeout=30.0)

    def _get(self, path: str, params: dict) -> dict:
        """One GET with a single retry on 429 — and both attempts logged."""
        if self._state == ProviderState.NO_KEYS:
            raise ProviderError(
                "Alpaca keys missing (APCA_API_KEY_ID / APCA_API_SECRET_KEY). "
                "Set them in .env, or switch data.provider to 'sample'.",
                ProviderState.NO_KEYS,
            )
        for attempt in (1, 2):
            start = time.monotonic()
            try:
                resp = self._client.get(path, params=params)
            except httpx.HTTPError as exc:
                latency = (time.monotonic() - start) * 1000
                oplog.log(COMPONENT, f"GET {path}", self.name, latency, "fail",
                          f"{type(exc).__name__}: {exc}")
                self._state = ProviderState.UNREACHABLE
                raise ProviderError(f"Alpaca unreachable: {exc}",
                                    ProviderState.UNREACHABLE) from exc
            latency = (time.monotonic() - start) * 1000

            if resp.status_code == 429:
                self._state = ProviderState.RATE_LIMITED
                if attempt == 1:
                    oplog.log(COMPONENT, f"GET {path}", self.name, latency, "retry",
                              "429 rate-limited; backing off 3s")
                    time.sleep(3)
                    continue
                oplog.log(COMPONENT, f"GET {path}", self.name, latency, "fail",
                          "429 rate-limited after retry")
                raise ProviderError(
                    "Alpaca free-tier rate limit hit (200 req/min).",
                    ProviderState.RATE_LIMITED,
                )
            if resp.status_code in (401, 403):
                self._state = ProviderState.AUTH_ERROR
                oplog.log(COMPONENT, f"GET {path}", self.name, latency, "fail",
                          f"HTTP {resp.status_code} auth")
                raise ProviderError("Alpaca rejected the API keys.",
                                    ProviderState.AUTH_ERROR)
            if resp.status_code != 200:
                oplog.log(COMPONENT, f"GET {path}", self.name, latency, "fail",
                          f"HTTP {resp.status_code}")
                self._state = ProviderState.UNREACHABLE
                raise ProviderError(f"Alpaca HTTP {resp.status_code}: {resp.text[:200]}",
                                    ProviderState.UNREACHABLE)

            self._state = ProviderState.OK
            oplog.log(COMPONENT, f"GET {path}", self.name, latency, "ok",
                      params.get("symbols", ""))
            return resp.json()
        raise AssertionError("unreachable")

    def fetch_bars(
        self, symbol: str, timeframe: str, start: datetime, end: datetime
    ) -> list[Bar]:
        """Historical bars via GET /v2/stocks/{symbol}/bars, feed=iex,
        split+dividend adjusted, paginated until exhausted."""
        bars: list[Bar] = []
        page_token: str | None = None
        fetched_at = utcnow()
        while True:
            params = {
                "timeframe": timeframe,
                "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
                "feed": "iex",
                "adjustment": "all",
                "limit": 10000,
                "sort": "asc",
            }
            if page_token:
                params["page_token"] = page_token
            payload = self._get(f"/v2/stocks/{symbol}/bars", params)
            for raw in payload.get("bars") or []:
                bars.append(Bar(
                    symbol=symbol, timeframe=timeframe, ts=parse_iso(raw["t"]),
                    open=raw["o"], high=raw["h"], low=raw["l"], close=raw["c"],
                    volume=raw.get("v"), source=f"{self.name}:iex",
                    fetched_at=fetched_at,
                ))
            page_token = payload.get("next_page_token")
            if not page_token:
                return bars

    def fetch_snapshot(self, symbol: str) -> Snapshot:
        """Latest state via GET /v2/stocks/{symbol}/snapshot (feed=iex).
        Prefers the latest trade; falls back to the latest daily bar close,
        carrying that bar's own (older) timestamp — staleness stays truthful."""
        payload = self._get(f"/v2/stocks/{symbol}/snapshot", {"feed": "iex"})
        trade = payload.get("latestTrade")
        if trade and trade.get("p"):
            return Snapshot(symbol=symbol, price=trade["p"], ts=parse_iso(trade["t"]),
                            source=f"{self.name}:iex", fetched_at=utcnow())
        daily = payload.get("dailyBar")
        if daily and daily.get("c"):
            return Snapshot(symbol=symbol, price=daily["c"], ts=parse_iso(daily["t"]),
                            source=f"{self.name}:iex:dailyBar", fetched_at=utcnow())
        raise ProviderError(
            f"Alpaca snapshot for {symbol} contained no trade or daily bar "
            "(thin IEX coverage?) — shown as missing, not guessed.",
            ProviderState.OK,
        )

    def state(self) -> ProviderState:
        return self._state
