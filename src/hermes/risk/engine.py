"""Risk layer — outranks the signal layer, here and on screen.

Everything is % of account equity; Hermes never sees a dollar figure. The
methodology is fixed-fractional position sizing (the % risk model in Van
Tharp's position-sizing work and Ralph Vince's fixed-fraction line): choose
the loss you can tolerate per trade as a % of equity, and let the distance
to your stop determine position size.

    size_pct = risk_pct / stop_distance_pct

The engine computes a single RiskState with three levels — 'ok', 'warn',
'breach' — and 'breach' is a circuit breaker: the dashboard renders it as
the dominant element on the page and the daily report leads with it.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .. import db
from ..config import HermesConfig
from ..data.models import iso, utcnow
from ..regime.indicators import correlation, daily_returns


@dataclass(frozen=True)
class SizingResult:
    """Suggested size for a planned trade. Suggestion only — Hermes has no
    order path; the human sizes and places every trade."""

    size_pct_equity: float
    planned_risk_pct: float
    stop_distance_pct: float
    capped_by: str | None  # limit name if the raw size was reduced
    methodology: str = (
        "Fixed-fractional (% risk) position sizing: size% = risk% / stop-distance%. "
        "Van Tharp's position-sizing model; fixed-fraction family per Ralph Vince."
    )


@dataclass(frozen=True)
class RiskCheck:
    kind: str
    level: str          # 'ok' | 'warn' | 'breach'
    observed: str
    limit: str
    message: str


@dataclass(frozen=True)
class RiskState:
    level: str          # worst of all checks
    checks: list[RiskCheck] = field(default_factory=list)
    open_risk_pct: float = 0.0
    drawdown_pct: float = 0.0
    equity_index: float = 100.0


def size_position(
    config: HermesConfig, entry_price: float, stop_price: float, side: str
) -> SizingResult:
    if entry_price <= 0 or stop_price <= 0:
        raise ValueError("entry and stop must be positive prices")
    if side == "long" and stop_price >= entry_price:
        raise ValueError("a long's stop must sit below entry")
    if side == "short" and stop_price <= entry_price:
        raise ValueError("a short's stop must sit above entry")

    stop_distance_pct = abs(entry_price - stop_price) / entry_price * 100.0
    risk_pct = config.risk.max_risk_per_trade_pct
    raw_size = risk_pct / stop_distance_pct * 100.0

    capped_by = None
    size = raw_size
    if size > config.risk.max_position_size_pct:
        size = config.risk.max_position_size_pct
        capped_by = "max_position_size_pct"

    actual_risk = size * stop_distance_pct / 100.0
    return SizingResult(
        size_pct_equity=round(size, 2),
        planned_risk_pct=round(actual_risk, 3),
        stop_distance_pct=round(stop_distance_pct, 2),
        capped_by=capped_by,
    )


def open_positions() -> list[dict]:
    rows = db.connect().execute(
        "SELECT * FROM journal_entries WHERE status='open' ORDER BY opened_at"
    ).fetchall()
    return [dict(r) for r in rows]


def current_equity_index() -> tuple[float, float]:
    """(current index value, drawdown % from peak). Index starts at 100."""
    rows = db.connect().execute(
        "SELECT value FROM equity_index ORDER BY ts, id"
    ).fetchall()
    values = [r["value"] for r in rows] or [100.0]
    current = values[-1]
    peak = max(values)
    drawdown = (peak - current) / peak * 100.0 if peak > 0 else 0.0
    return current, round(drawdown, 2)


def _position_returns(symbol: str, lookback_days: int) -> list[float]:
    rows = db.connect().execute(
        """SELECT close FROM (
             SELECT close, ts FROM bars WHERE symbol=? AND timeframe='1Day'
             ORDER BY ts DESC LIMIT ?
           ) ORDER BY ts ASC""",
        (symbol, lookback_days + 1),
    ).fetchall()
    return daily_returns([r["close"] for r in rows])


def evaluate(config: HermesConfig) -> RiskState:
    """Run every risk check over current open positions. Persists any new
    warn/breach as a risk_event so the state is durable, not just displayed."""
    r = config.risk
    positions = open_positions()
    checks: list[RiskCheck] = []

    # 1 — Open risk budget
    open_risk = sum(p["planned_risk_pct"] or 0.0 for p in positions)
    level = "breach" if open_risk > r.max_open_risk_pct else (
        "warn" if open_risk > 0.8 * r.max_open_risk_pct else "ok")
    checks.append(RiskCheck(
        kind="max_open_risk", level=level,
        observed=f"{open_risk:.2f}% at risk across {len(positions)} open",
        limit=f"{r.max_open_risk_pct:.2f}% of equity",
        message="Sum of planned stop-losses across all open positions.",
    ))

    # 2 — Single-position concentration
    worst = max(positions, key=lambda p: p["size_pct_equity"], default=None)
    if worst:
        sz = worst["size_pct_equity"]
        level = "breach" if sz > r.max_position_size_pct else (
            "warn" if sz > 0.9 * r.max_position_size_pct else "ok")
        checks.append(RiskCheck(
            kind="concentration", level=level,
            observed=f"largest position {worst['symbol']} = {sz:.1f}% of equity",
            limit=f"{r.max_position_size_pct:.1f}% per position",
            message="No single position may dominate the book.",
        ))
    else:
        checks.append(RiskCheck(
            kind="concentration", level="ok", observed="no open positions",
            limit=f"{r.max_position_size_pct:.1f}% per position",
            message="No single position may dominate the book.",
        ))

    # 3 — Sector exposure
    by_sector: dict[str, float] = {}
    for p in positions:
        sector = p["sector"] or "unspecified"
        by_sector[sector] = by_sector.get(sector, 0.0) + (p["size_pct_equity"] or 0.0)
    hot = max(by_sector.items(), key=lambda kv: kv[1], default=None)
    if hot and hot[0] != "unspecified":
        level = "breach" if hot[1] > r.max_sector_exposure_pct else (
            "warn" if hot[1] > 0.8 * r.max_sector_exposure_pct else "ok")
        checks.append(RiskCheck(
            kind="sector_exposure", level=level,
            observed=f"{hot[0]} = {hot[1]:.1f}% of equity",
            limit=f"{r.max_sector_exposure_pct:.1f}% per sector",
            message="Sector concentration across open positions.",
        ))
    elif by_sector.get("unspecified"):
        checks.append(RiskCheck(
            kind="sector_exposure", level="warn",
            observed=f"{by_sector['unspecified']:.1f}% of equity has no sector tag",
            limit=f"{r.max_sector_exposure_pct:.1f}% per sector",
            message="Untagged positions can hide sector concentration — tag them.",
        ))

    # 4 — Pairwise correlation between open positions
    if len(positions) >= 2:
        symbols = sorted({p["symbol"] for p in positions})
        rets = {s: _position_returns(s, r.correlation_lookback_days) for s in symbols}
        worst_pair, worst_corr = None, None
        for i, a in enumerate(symbols):
            for b in symbols[i + 1:]:
                c = correlation(rets[a], rets[b])
                if c is not None and (worst_corr is None or abs(c) > abs(worst_corr)):
                    worst_pair, worst_corr = (a, b), c
        if worst_corr is not None:
            level = "warn" if abs(worst_corr) >= r.correlation_warn_threshold else "ok"
            checks.append(RiskCheck(
                kind="correlation", level=level,
                observed=f"{worst_pair[0]}/{worst_pair[1]} {r.correlation_lookback_days}d "
                         f"correlation = {worst_corr:+.2f}",
                limit=f"|ρ| < {r.correlation_warn_threshold:.2f}",
                message="Highly correlated positions are one position wearing two tickers.",
            ))
        else:
            checks.append(RiskCheck(
                kind="correlation", level="warn",
                observed="not enough cached bar history to compute correlations",
                limit=f"|ρ| < {r.correlation_warn_threshold:.2f}",
                message="Missing data is shown as missing — run the EOD sync to fill history.",
            ))

    # 5 — Drawdown circuit breaker on the normalized equity index
    equity, drawdown = current_equity_index()
    level = "breach" if drawdown >= r.max_drawdown_pct else (
        "warn" if drawdown >= 0.7 * r.max_drawdown_pct else "ok")
    checks.append(RiskCheck(
        kind="drawdown", level=level,
        observed=f"{drawdown:.1f}% below equity peak (index {equity:.1f})",
        limit=f"{r.max_drawdown_pct:.1f}% max drawdown",
        message="Realized drawdown on the normalized (100-based) equity index. "
                "At breach: stop opening new positions and review.",
    ))

    order = {"ok": 0, "warn": 1, "breach": 2}
    worst_level = max((c.level for c in checks), key=lambda x: order[x], default="ok")

    state = RiskState(
        level=worst_level, checks=checks,
        open_risk_pct=round(open_risk, 2), drawdown_pct=drawdown, equity_index=equity,
    )
    _persist_events(state)
    return state


def _persist_events(state: RiskState) -> None:
    """Record new warn/breach events, skipping duplicates of the most recent
    unacknowledged event of the same kind+severity."""
    conn = db.connect()
    for c in state.checks:
        if c.level == "ok":
            continue
        dup = conn.execute(
            """SELECT id FROM risk_events
               WHERE kind=? AND severity=? AND acknowledged=0
               ORDER BY ts DESC LIMIT 1""",
            (c.kind, c.level),
        ).fetchone()
        if dup:
            continue
        conn.execute(
            "INSERT INTO risk_events (ts, kind, severity, message) VALUES (?, ?, ?, ?)",
            (iso(utcnow()), c.kind, c.level, f"{c.observed} — limit {c.limit}"),
        )
    conn.commit()


def unacknowledged_events() -> list[dict]:
    rows = db.connect().execute(
        "SELECT * FROM risk_events WHERE acknowledged=0 ORDER BY ts DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def acknowledge_event(event_id: int) -> bool:
    conn = db.connect()
    cur = conn.execute(
        "UPDATE risk_events SET acknowledged=1 WHERE id=?", (event_id,)
    )
    conn.commit()
    return cur.rowcount > 0
