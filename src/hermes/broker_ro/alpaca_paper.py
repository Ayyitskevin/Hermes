"""Alpaca paper account — READ-ONLY position sync.

Host: paper-api.alpaca.markets (allowed only inside broker_ro/, GET only).
Surface lock: fetch_positions_pct, available, source_name — nothing that
submits, cancels, or replaces an order.

Dollar amounts from the broker are used ONLY as intermediate denominators
to compute % of equity, then discarded. Hermes never persists account
balances or dollar P&L.
"""

from __future__ import annotations

import time

import httpx

from .. import db, oplog
from ..config import HermesConfig
from ..data.models import iso, utcnow

# Sealed: the only trading host Hermes may contact, and only from this module.
PAPER_HOST = "https://paper-api.alpaca.markets"
# GET-only paths. Order-shaped paths are banned repo-wide by the boundary guard.
_POSITIONS_PATH = "/v2/positions"
_ACCOUNT_PATH = "/v2/account"

# Public surface lock — mirrored by the boundary guard for this package.
ALLOWED_METHODS = frozenset({"fetch_positions_pct", "available", "source_name", "sync_to_cache"})


class BrokerROUnavailable(Exception):
    pass


class BrokerROError(Exception):
    pass


class AlpacaPaperRO:
    """Read-only client. Credentials are the same APCA_* keys; intent is RO
    but Alpaca keys are account-wide — safety is code-path isolation + GET only."""

    name = "alpaca_paper_ro"

    def __init__(self, config: HermesConfig, timeout: float = 15.0):
        self.config = config
        self.timeout = timeout
        self.key = config.secrets.alpaca_key_id
        self.secret = config.secrets.alpaca_secret_key

    def source_name(self) -> str:
        return self.name

    def available(self) -> bool:
        if not self.key or not self.secret:
            return False
        if not getattr(self.config, "broker_ro", None):
            return False
        if not self.config.broker_ro.enabled:
            return False
        try:
            self._get(_ACCOUNT_PATH)
            return True
        except (BrokerROUnavailable, BrokerROError, httpx.HTTPError):
            return False

    def _headers(self) -> dict:
        return {
            "APCA-API-KEY-ID": self.key,
            "APCA-API-SECRET-KEY": self.secret,
        }

    def _get(self, path: str) -> object:
        """GET only — never POST/PUT/DELETE/PATCH against the trading host."""
        if not path.startswith("/v2/"):
            raise BrokerROError(f"refusing non-v2 path: {path}")
        # Explicit deny of order-shaped suffixes even if someone passes them.
        lower = path.lower()
        if "order" in lower:
            raise BrokerROError(f"order-shaped path refused: {path}")
        if not self.key or not self.secret:
            raise BrokerROUnavailable("APCA keys not set")
        url = f"{PAPER_HOST}{path}"
        start = time.monotonic()
        try:
            resp = httpx.get(url, headers=self._headers(), timeout=self.timeout)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as exc:
            latency = (time.monotonic() - start) * 1000
            oplog.log("broker_ro", f"GET {path}", self.name, latency, "fail",
                      f"{type(exc).__name__}: {exc}")
            raise BrokerROUnavailable(str(exc)) from exc
        latency = (time.monotonic() - start) * 1000
        oplog.log("broker_ro", f"GET {path}", self.name, latency, "ok", "")
        return data

    def fetch_positions_pct(self) -> list[dict]:
        """Return open paper positions as % of equity. No dollar fields leave
        this method in the returned dicts."""
        account = self._get(_ACCOUNT_PATH)
        if not isinstance(account, dict):
            raise BrokerROError("account payload unexpected")
        # equity is a dollar figure — use once as denominator, never return it.
        try:
            equity = float(account.get("equity") or account.get("portfolio_value") or 0)
        except (TypeError, ValueError) as exc:
            raise BrokerROError("account equity unreadable") from exc
        if equity <= 0:
            raise BrokerROError("account equity is zero or missing — cannot form %")

        raw = self._get(_POSITIONS_PATH)
        if not isinstance(raw, list):
            raise BrokerROError("positions payload unexpected")

        out: list[dict] = []
        now = iso(utcnow())
        for p in raw:
            try:
                symbol = str(p.get("symbol") or "").upper()
                qty = float(p.get("qty") or 0)
                if not symbol or qty == 0:
                    continue
                side = "long" if qty > 0 else "short"
                mv = abs(float(p.get("market_value") or 0))
                avg = float(p.get("avg_entry_price") or 0) or None
                cur = float(p.get("current_price") or 0) or None
                # unrealized_plpc is already a fraction from Alpaca (e.g. 0.05 = 5%)
                uplpc = p.get("unrealized_plpc")
                unrealized_pct = round(float(uplpc) * 100.0, 3) if uplpc is not None else None
                size_pct = round(mv / equity * 100.0, 3)
            except (TypeError, ValueError):
                continue
            out.append({
                "symbol": symbol,
                "side": side,
                "size_pct_equity": size_pct,
                "avg_entry_price": avg,
                "current_price": cur,
                "unrealized_pct": unrealized_pct,
                "source": self.name,
                "as_of": now,
                "fetched_at": now,
                # planned_risk_pct unknown without stops — risk engine treats missing as 0
                "planned_risk_pct": 0.0,
                "book_source": "broker_ro",
            })
        return out

    def sync_to_cache(self) -> str:
        """Replace book_positions cache with a fresh RO snapshot (% only)."""
        positions = self.fetch_positions_pct()
        conn = db.connect()
        conn.execute("DELETE FROM book_positions")
        for p in positions:
            conn.execute(
                """INSERT INTO book_positions
                   (symbol, side, size_pct_equity, avg_entry_price, current_price,
                    unrealized_pct, source, as_of, fetched_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    p["symbol"], p["side"], p["size_pct_equity"],
                    p["avg_entry_price"], p["current_price"], p["unrealized_pct"],
                    p["source"], p["as_of"], p["fetched_at"],
                ),
            )
        conn.commit()
        return f"synced {len(positions)} paper positions (% equity only) via {self.name}"


def cached_book_positions() -> list[dict]:
    rows = db.connect().execute(
        "SELECT * FROM book_positions ORDER BY size_pct_equity DESC"
    ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["planned_risk_pct"] = 0.0  # unknown without stops
        d["book_source"] = "broker_ro_cache"
        out.append(d)
    return out
