"""Bar/snapshot cache over SQLite, plus staleness computation.

The store never invents data: a gap in bars stays a gap, and reads return
exactly what was fetched, with source and as-of intact.
"""

from __future__ import annotations

from datetime import datetime, timedelta

from .. import db
from .models import Bar, Snapshot, iso, parse_iso, utcnow


def upsert_bars(bars: list[Bar]) -> int:
    conn = db.connect()
    conn.executemany(
        """INSERT INTO bars (symbol, timeframe, ts, open, high, low, close, volume,
                             source, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (symbol, timeframe, ts) DO UPDATE SET
             open=excluded.open, high=excluded.high, low=excluded.low,
             close=excluded.close, volume=excluded.volume,
             source=excluded.source, fetched_at=excluded.fetched_at""",
        [
            (b.symbol, b.timeframe, iso(b.ts), b.open, b.high, b.low, b.close,
             b.volume, b.source, iso(b.fetched_at))
            for b in bars
        ],
    )
    conn.commit()
    return len(bars)


def get_bars(symbol: str, timeframe: str, limit: int = 400) -> list[Bar]:
    """Most recent bars, oldest-first."""
    rows = db.connect().execute(
        """SELECT * FROM (
             SELECT * FROM bars WHERE symbol=? AND timeframe=? ORDER BY ts DESC LIMIT ?
           ) ORDER BY ts ASC""",
        (symbol, timeframe, limit),
    ).fetchall()
    return [
        Bar(
            symbol=r["symbol"], timeframe=r["timeframe"], ts=parse_iso(r["ts"]),
            open=r["open"], high=r["high"], low=r["low"], close=r["close"],
            volume=r["volume"], source=r["source"], fetched_at=parse_iso(r["fetched_at"]),
        )
        for r in rows
    ]


def latest_bar_ts(symbol: str, timeframe: str) -> datetime | None:
    row = db.connect().execute(
        "SELECT MAX(ts) AS ts FROM bars WHERE symbol=? AND timeframe=?",
        (symbol, timeframe),
    ).fetchone()
    return parse_iso(row["ts"]) if row and row["ts"] else None


def upsert_snapshot(s: Snapshot) -> None:
    conn = db.connect()
    conn.execute(
        """INSERT INTO snapshots (symbol, price, ts, source, fetched_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT (symbol) DO UPDATE SET
             price=excluded.price, ts=excluded.ts,
             source=excluded.source, fetched_at=excluded.fetched_at""",
        (s.symbol, s.price, iso(s.ts), s.source, iso(s.fetched_at)),
    )
    conn.commit()


def get_snapshot(symbol: str) -> Snapshot | None:
    r = db.connect().execute(
        "SELECT * FROM snapshots WHERE symbol=?", (symbol,)
    ).fetchone()
    if not r:
        return None
    return Snapshot(
        symbol=r["symbol"], price=r["price"], ts=parse_iso(r["ts"]),
        source=r["source"], fetched_at=parse_iso(r["fetched_at"]),
    )


def staleness(as_of: datetime, stale_after_minutes: int, now: datetime | None = None) -> str:
    """'live' | 'stale' | 'dead'. Anything past the threshold is labeled, on
    screen, exactly what it is."""
    now = now or utcnow()
    age = now - as_of
    if age <= timedelta(minutes=stale_after_minutes):
        return "live"
    if age <= timedelta(hours=48):
        return "stale"
    return "dead"
