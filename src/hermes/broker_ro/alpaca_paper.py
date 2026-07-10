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
ALLOWED_METHODS = frozenset({
    "fetch_positions_pct", "available", "source_name", "sync_to_cache",
    "fetch_fills", "propose_from_fills",
})


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


    def fetch_fills(self, *, limit: int = 50) -> list[dict]:
        """GET account FILL activities — prices only, no dollar P&L retained.

        Path deliberately avoids any order-shaped URL. Each fill is reduced to
        symbol / side / qty / price / ts for journal proposal drafting.
        """
        raw = self._get(f"/v2/account/activities?activity_types=FILL&page_size={int(limit)}")
        if not isinstance(raw, list):
            # Some Alpaca shapes return a single object or dict wrapper
            if isinstance(raw, dict):
                raw = raw.get("activities") or raw.get("data") or []
            else:
                raise BrokerROError("fills payload unexpected")
        out = []
        for a in raw:
            try:
                symbol = str(a.get("symbol") or "").upper()
                side = str(a.get("side") or "").lower()
                if side in ("buy", "buy_to_open"):
                    side = "long"
                elif side in ("sell", "sell_to_open", "sell_short"):
                    side = "short" if "short" in str(a.get("side", "")).lower() else "long"
                # activity side for sell of long is still a closing sell — mark long exit
                qty = abs(float(a.get("qty") or a.get("quantity") or 0))
                price = float(a.get("price") or a.get("fill_price") or 0)
                if not symbol or price <= 0:
                    continue
                out.append({
                    "symbol": symbol,
                    "side_hint": side if side in ("long", "short") else "long",
                    "qty": qty,
                    "price": price,
                    "ts": a.get("transaction_time") or a.get("date") or iso(utcnow()),
                    "activity_id": a.get("id") or a.get("activity_id"),
                    "source": self.name,
                })
            except (TypeError, ValueError):
                continue
        return out

    def propose_from_fills(self, config: HermesConfig, *, limit: int = 20) -> list[dict]:
        """Draft journal proposals from recent fills (C7). Never commits.

        Stop is inferred as 2% adverse from fill price (explicitly labeled) so
        sizing can run; the human must edit thesis/stop before commit.
        """
        from ..journal import service as journal

        fills = self.fetch_fills(limit=limit)
        drafts = []
        for f in fills:
            side = f["side_hint"]
            entry = f["price"]
            stop = entry * (0.98 if side == "long" else 1.02)
            thesis = (
                f"Imported from paper FILL activity {f.get('activity_id') or ''} "
                f"at {f['ts']}. Thesis REQUIRED — replace this placeholder before commit. "
                f"Default stop is a 2% scaffold, not a strategy stop."
            )
            try:
                prop = journal.propose_entry(
                    config,
                    symbol=f["symbol"],
                    side=side,
                    entry_price=entry,
                    stop_price=round(stop, 4),
                    thesis=thesis,
                    setup_tag="broker-import",
                )
                prop["import_meta"] = {
                    "activity_id": f.get("activity_id"),
                    "fill_ts": f.get("ts"),
                    "source": f.get("source"),
                    "note": "scaffold stop 2%; human must edit before commit",
                }
                drafts.append(prop)
            except Exception as exc:  # noqa: BLE001 — surface per-fill, continue
                drafts.append({
                    "error": str(exc),
                    "symbol": f["symbol"],
                    "import_meta": f,
                })
        return drafts



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
