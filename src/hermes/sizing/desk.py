"""Sizing desk — fixed-fractional baseline → empirical half-Kelly → limit-aware cap.

Everything here is a % of equity or a per-share price; Hermes never sees a
dollar balance, and this desk only *suggests* a size — no order path exists in
this codebase, so the human sizes and places every trade.

Three layers, each of them visible on screen:

1. Fixed-fractional baseline. The sober anchor: risk a fixed % of equity per
   trade (``config.risk.max_risk_per_trade_pct``) and let the distance to the
   stop set the size — ``size% = risk% / stop-distance%`` (Van Tharp's % risk
   model; the fixed-fraction family per Ralph Vince).

2. Empirical half-Kelly. Measured from the journal's OWN closed trades, in
   R-multiples (``R = realized_return / planned_risk``): the win rate ``W`` and
   the payoff ratio ``b = avg_win_R / avg_loss_R`` give the Kelly fraction
   ``f* = W - (1 - W) / b``. We take HALF of it (the half-Kelly convention —
   full Kelly is famously too wild) and then SHRINK that toward the fixed
   baseline by a confidence weight ``shrink = n / (n + 30)``: with few trades
   the anchor dominates; only a long real track record earns the Kelly tilt.
   Below 30 closed trades the edge is an anecdote and the payload says so.

3. Limit-aware cap. The blended risk is turned back into a size and then clamped
   by the tightest applicable risk limit — the per-position ceiling, the
   remaining open-risk budget, and (when a sector is given) the sector ceiling.
   The limit that actually bound is named. A high correlation to an open
   position is flagged as a warning, never silently sized in.

Kelly assumes independent, stationary bets; markets are neither, so the number
it hands back is an upper reference, not a prescription — which is exactly why
we halve it, shrink it, and let the hard limits outrank it.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from ..config import HermesConfig
from ..data import store
from ..journal import service as journal
from ..regime.indicators import correlation
from ..risk import engine as risk

CLAIM = (
    "A suggested position size as % of equity, built from the fixed-fractional "
    "risk model, tilted by the journal's own realized edge (half-Kelly, shrunk "
    "to the sample), then clamped by the tightest risk limit. A suggestion for a "
    "human — never an order."
)
METHODOLOGY = (
    "Fixed-fractional baseline (size% = risk% / stop-distance%). An empirical "
    "half-Kelly risk from closed-trade R-multiples (R = realized / planned risk; "
    "kelly = W - (1-W)/payoff), blended toward the baseline by shrink = n/(n+30). "
    "The blended risk becomes a size, then capped by the binding limit — position "
    "ceiling, open-risk budget, or sector ceiling — with the cap named."
)
CAVEAT = (
    "Kelly assumes independent, stationary bets; markets are neither. Half-Kelly, "
    "the sample shrink, and the hard limits deliberately pull the size DOWN — the "
    "Kelly figure is an upper reference, not a target. Below 30 closed trades the "
    "edge is an anecdote. Correlation is backward-looking. Missing history stays "
    "missing. A suggested size is never a trade instruction."
)

_KELLY_PRIOR_N = 30.0     # trades of 'fixed-fractional' prior weight in the shrink


@dataclass(frozen=True)
class KellyEdge:
    """The journal's realized edge, in R-multiples, as an equity-risk %."""

    status: str                    # 'ok' | 'insufficient'
    n: int
    win_rate_pct: float | None
    payoff_ratio: float | None
    kelly_full_pct: float | None   # full-Kelly risk % of equity (reference only)
    half_kelly_pct: float | None   # half-Kelly risk %
    anecdote: bool                 # n < 30 — an anecdote, not an edge
    note: str


@dataclass(frozen=True)
class SizeCap:
    """One ceiling on the position size, in % of equity."""

    key: str                       # 'model' | 'position' | 'open_risk' | 'sector'
    label: str
    ceiling_pct: float             # the largest size this cap permits
    limit_pct: float | None        # the underlying config limit, when there is one
    binding: bool


@dataclass(frozen=True)
class CorrelationFlag:
    status: str                    # 'none' | 'ok' | 'warn' | 'missing'
    peak_symbol: str | None
    peak_rho: float | None
    threshold: float
    note: str


@dataclass(frozen=True)
class SizePlan:
    status: str                    # 'ok' | 'error'
    symbol: str
    note: str
    side: str | None
    # the human's inputs (per-share prices)
    entry: float | None
    stop: float | None
    target: float | None
    stop_distance_pct: float | None
    # cached reference price provenance (context only — the plan uses the inputs)
    cached_last: float | None
    price_source: str | None
    as_of: datetime | None
    staleness: str
    # layered risk %
    fixed_risk_pct: float | None
    shrink: float | None
    blended_risk_pct: float | None
    # result
    size_pct_equity: float | None
    planned_risk_pct: float | None
    reward_risk_ratio: float | None
    binding_constraint: str
    caps: list[SizeCap] = field(default_factory=list)
    kelly: KellyEdge | None = None
    correlation: CorrelationFlag | None = None
    claim: str = CLAIM
    methodology: str = METHODOLOGY
    caveat: str = CAVEAT


def _error(symbol: str, note: str) -> SizePlan:
    return SizePlan(
        status="error", symbol=symbol, note=note, side=None,
        entry=None, stop=None, target=None, stop_distance_pct=None,
        cached_last=None, price_source=None, as_of=None, staleness="missing",
        fixed_risk_pct=None, shrink=None, blended_risk_pct=None,
        size_pct_equity=None, planned_risk_pct=None, reward_risk_ratio=None,
        binding_constraint="none",
    )


# ── empirical edge ──────────────────────────────────────────────────────────
def _kelly_edge(config: HermesConfig) -> KellyEdge:
    """Kelly from the journal's closed-trade R-multiples. Returns 'insufficient'
    (falling back to the fixed baseline) rather than inventing an edge when there
    are no closed trades or no losers to define a payoff ratio."""
    closed = journal.list_entries(status="closed")
    r_multiples = [
        e["realized_return_pct"] / e["planned_risk_pct"]
        for e in closed
        if e.get("realized_return_pct") is not None
        and (e.get("planned_risk_pct") or 0) > 0
    ]
    n = len(r_multiples)
    if n == 0:
        return KellyEdge(
            "insufficient", 0, None, None, None, None, True,
            "no closed trades with a planned risk to measure — sizing stays on the "
            "fixed-fractional baseline")

    winners = [r for r in r_multiples if r > 0]
    losers = [-r for r in r_multiples if r < 0]     # positive magnitudes
    win_rate = len(winners) / n
    avg_loss = sum(losers) / len(losers) if losers else None
    if not avg_loss:
        # No losers yet: a payoff ratio (and therefore Kelly) is undefined. Do
        # NOT extrapolate an edge from an all-wins streak — stay on the baseline.
        return KellyEdge(
            "insufficient", n, round(win_rate * 100, 1), None, None, None, n < 30,
            "no losing trades yet — a payoff ratio (and Kelly) is undefined; staying "
            "on the fixed-fractional baseline")

    avg_win = sum(winners) / len(winners) if winners else 0.0
    payoff = avg_win / avg_loss
    kelly_full = max(0.0, win_rate - (1 - win_rate) / payoff)    # fraction of equity
    kelly_full_pct = kelly_full * 100.0
    anecdote = n < 30
    note = (
        "below 30 closed trades — treat this edge as an anecdote; the size leans on "
        "the fixed baseline until the record grows"
        if anecdote else
        "empirical edge from the journal's closed-trade R-multiples")
    return KellyEdge(
        "ok", n, round(win_rate * 100, 1), round(payoff, 2),
        round(kelly_full_pct, 2), round(kelly_full_pct / 2, 2), anecdote, note)


def _correlation_flag(config: HermesConfig, symbol: str,
                      positions: list[dict]) -> CorrelationFlag:
    thr = config.risk.correlation_warn_threshold
    others = sorted({p["symbol"] for p in positions if p["symbol"] != symbol})
    if not others:
        return CorrelationFlag("none", None, None, thr,
                               "no other open positions to correlate against")
    me = risk._position_returns(symbol, config.risk.correlation_lookback_days)
    peak_sym, peak = None, None
    for s in others:
        c = correlation(me, risk._position_returns(s, config.risk.correlation_lookback_days))
        if c is not None and (peak is None or abs(c) > abs(peak)):
            peak_sym, peak = s, c
    if peak is None:
        return CorrelationFlag("missing", None, None, thr,
                               "not enough cached history to correlate against the book")
    if abs(peak) >= thr:
        return CorrelationFlag("warn", peak_sym, round(peak, 2), thr,
                               f"highly correlated with {peak_sym} (ρ={peak:+.2f}) — a "
                               "correlated add is one position wearing two tickers")
    return CorrelationFlag("ok", peak_sym, round(peak, 2), thr,
                           f"most-correlated open name is {peak_sym} at ρ={peak:+.2f}, "
                           "within tolerance")


# ── the plan ────────────────────────────────────────────────────────────────
def build_size_plan(
    config: HermesConfig, symbol: str, *,
    entry: float, stop: float, target: float | None = None, sector: str | None = None,
) -> SizePlan:
    symbol = symbol.upper().strip()
    if entry <= 0 or stop <= 0:
        return _error(symbol, "entry and stop must be positive per-share prices")
    if stop == entry:
        return _error(symbol, "the stop can't equal entry — the stop distance is zero")

    side = "long" if stop < entry else "short"
    stop_distance_pct = abs(entry - stop) / entry * 100.0

    # Cached reference price (context/provenance only; the plan uses the inputs).
    snap = store.get_snapshot(symbol)
    bars = store.get_bars(symbol, "1Day", limit=1)
    cached_last = snap.price if snap else (bars[-1].close if bars else None)
    price_source = snap.source if snap else (bars[-1].source if bars else None)
    as_of = snap.ts if snap else (bars[-1].ts if bars else None)
    staleness = (store.staleness(as_of, config.market.stale_after_minutes)
                 if as_of else "missing")

    # Layer 1 + 2 — fixed baseline blended with the shrunk half-Kelly edge.
    fixed = config.risk.max_risk_per_trade_pct
    kelly = _kelly_edge(config)
    if kelly.status == "ok" and kelly.half_kelly_pct is not None:
        shrink = kelly.n / (kelly.n + _KELLY_PRIOR_N)
        blended_risk = shrink * kelly.half_kelly_pct + (1 - shrink) * fixed
    else:
        shrink = 0.0
        blended_risk = fixed
    model_size = blended_risk / stop_distance_pct * 100.0

    # Layer 3 — limit-aware ceilings. Each is the largest size it permits.
    r = config.risk
    positions = risk.open_positions()
    held = sum((p["size_pct_equity"] or 0.0) for p in positions if p["symbol"] == symbol)
    open_risk = sum((p["planned_risk_pct"] or 0.0) for p in positions)

    position_ceiling = max(0.0, r.max_position_size_pct - held)
    open_risk_ceiling = max(0.0, r.max_open_risk_pct - open_risk) / stop_distance_pct * 100.0

    caps = [
        SizeCap("model", "Fixed→Kelly model", round(model_size, 2), None, False),
        SizeCap("position", "Per-position ceiling", round(position_ceiling, 2),
                r.max_position_size_pct, False),
        SizeCap("open_risk", "Open-risk budget", round(open_risk_ceiling, 2),
                r.max_open_risk_pct, False),
    ]
    if sector:
        held_sector = sum((p["size_pct_equity"] or 0.0) for p in positions
                          if (p["sector"] or "").lower() == sector.lower())
        caps.append(SizeCap("sector", f"{sector} sector ceiling",
                            round(max(0.0, r.max_sector_exposure_pct - held_sector), 2),
                            r.max_sector_exposure_pct, False))

    final_size = min(c.ceiling_pct for c in caps)
    # Name the binding constraint: a real limit only when it cut BELOW the model;
    # otherwise the model itself is what's binding.
    binding_key = "model"
    if final_size < round(model_size, 2) - 1e-9:
        binding_key = min((c for c in caps if c.key != "model"),
                          key=lambda c: c.ceiling_pct).key
    caps = [SizeCap(c.key, c.label, c.ceiling_pct, c.limit_pct, c.key == binding_key)
            for c in caps]

    planned_risk = final_size * stop_distance_pct / 100.0

    reward_risk = None
    if target is not None and target > 0:
        reward_pct = (target - entry) / entry * 100.0 * (1.0 if side == "long" else -1.0)
        reward_risk = round(reward_pct / stop_distance_pct, 2)

    return SizePlan(
        status="ok", symbol=symbol,
        note=("no room left under the binding limit — this trade would breach it"
              if final_size == 0 else ""),
        side=side,
        entry=round(entry, 2), stop=round(stop, 2),
        target=round(target, 2) if target is not None else None,
        stop_distance_pct=round(stop_distance_pct, 2),
        cached_last=round(cached_last, 2) if cached_last is not None else None,
        price_source=price_source, as_of=as_of, staleness=staleness,
        fixed_risk_pct=round(fixed, 3), shrink=round(shrink, 3),
        blended_risk_pct=round(blended_risk, 3),
        size_pct_equity=round(final_size, 2),
        planned_risk_pct=round(planned_risk, 3),
        reward_risk_ratio=reward_risk,
        binding_constraint=binding_key, caps=caps, kelly=kelly,
        correlation=_correlation_flag(config, symbol, positions),
    )
