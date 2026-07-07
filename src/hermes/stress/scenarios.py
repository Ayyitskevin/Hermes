"""Stress test — shock the CURRENT open book against a few stylized shocks and
read out the projected drawdown on the normalized equity index, which positions
hurt most, and de-risk POSTURES (never order instructions).

Everything is % of equity or a 100-based index; no dollar figure appears. The
open book is the set of open journal entries (each carries its size % of equity,
planned risk %, side, and sector).

Scenarios, all deliberately simple and each honest about its assumption:

  * Market −5 / −10 / −20% — each position moves by its BETA to the benchmark
    (estimated by regressing the position's daily returns on the benchmark's over
    a lookback), with side handled: a long loses in a drop, a short gains.
  * All stops hit — the deterministic worst case the book has already committed
    to: every open stop is taken, costing exactly the sum of planned risk %. No
    model, no beta — just the risk the positions already carry.
  * Crisis: −20% with correlations → 1 — the stylized regime where diversification
    fails and everything falls together. Effective beta is floored at 1.0 for
    longs, so low-beta names no longer cushion. The gap between this and the plain
    −20% scenario is the diversification cushion a crisis removes.

This is a WHAT-IF, not a forecast. Beta and correlation are backward-looking over
the lookback window and compress exactly when you need them; the crisis case
forces correlations to 1 by fiat. The postures are context for a human — Hermes
has no order path, and none of this is a trade instruction.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from ..config import HermesConfig
from ..data import store
from ..data.models import utcnow
from ..regime.indicators import beta, daily_returns
from ..risk import engine as risk

STRESS_LOOKBACK = 120       # trading days for the beta estimate
CRISIS_MOVE_PCT = -20.0
CRISIS_BETA_FLOOR = 1.0     # correlations→1: longs fall at least with the market

CLAIM = (
    "A what-if on the current open book: how a market drop, a full stop-out, or a "
    "correlations-to-1 crisis would move the 100-based equity index, which "
    "positions carry the most shock, and what de-risk posture that argues for."
)
METHODOLOGY = (
    "Each position is moved by its beta to the benchmark (daily-return regression "
    "over a lookback), with side handled; contributions are position weight × "
    "beta × market move as % of equity. 'All stops hit' is the exact sum of "
    "planned risk %. The crisis case floors long betas at 1.0 (correlations→1). "
    "Projected drawdown is measured from the equity index's running peak."
)
CAVEAT = (
    "Beta and correlation are backward-looking over the lookback and compress in "
    "real crises — so the beta scenarios understate a true panic, which is why the "
    "correlations-to-1 case exists as a floor, itself a stylized assumption, not a "
    "prediction. A position with no cached history is shocked at beta 1.0 and "
    "flagged. Everything is % of equity; the postures are context, never orders — "
    "no order path exists in this codebase."
)


@dataclass(frozen=True)
class PositionShock:
    symbol: str
    side: str
    size_pct: float
    beta: float
    beta_estimated: bool        # True when history was missing and 1.0 was assumed
    contribution_pct: float     # impact on equity in percentage points (signed)


@dataclass(frozen=True)
class Scenario:
    key: str
    title: str
    kind: str                   # 'market' | 'stops' | 'crisis'
    market_move_pct: float | None
    total_impact_pct: float     # Σ contributions, % of equity (signed)
    projected_index: float
    projected_drawdown_pct: float
    breaches_circuit: bool
    positions: list[PositionShock] = field(default_factory=list)
    note: str = ""


@dataclass(frozen=True)
class Hedge:
    posture: str                # 'cash-priority' | 'trim' | 'diversify' | 'hold' | 'note'
    severity: str               # 'serious' | 'warn' | 'info'
    headline: str
    rationale: str


@dataclass(frozen=True)
class StressReport:
    generated_at: datetime
    status: str                 # 'ok' | 'empty'
    note: str
    benchmark: str
    lookback_days: int
    current_index: float
    current_drawdown_pct: float
    max_drawdown_pct: float
    open_risk_pct: float
    scenarios: list[Scenario] = field(default_factory=list)
    hedges: list[Hedge] = field(default_factory=list)
    claim: str = CLAIM
    methodology: str = METHODOLOGY
    caveat: str = CAVEAT


def _betas(config: HermesConfig, positions: list[dict]) -> dict[str, tuple[float, bool]]:
    """symbol → (beta, estimated?). A symbol with too little overlapping history
    is shocked at market beta 1.0 (conservative for a drop) and flagged."""
    bench_closes = [b.close for b in store.get_bars(config.market.benchmark, "1Day",
                                                    limit=STRESS_LOOKBACK + 1)]
    bench_ret = daily_returns(bench_closes)
    out: dict[str, tuple[float, bool]] = {}
    for sym in {p["symbol"] for p in positions}:
        closes = [b.close for b in store.get_bars(sym, "1Day", limit=STRESS_LOOKBACK + 1)]
        b = beta(daily_returns(closes), bench_ret)
        out[sym] = (round(b, 2), False) if b is not None else (CRISIS_BETA_FLOOR, True)
    return out


def _shock(positions: list[dict], betas: dict[str, tuple[float, bool]],
           move_pct: float, *, crisis: bool) -> list[PositionShock]:
    shocks: list[PositionShock] = []
    for p in positions:
        size = p["size_pct_equity"] or 0.0
        direction = 1.0 if p["side"] == "long" else -1.0
        b, est = betas[p["symbol"]]
        b_eff = max(b, CRISIS_BETA_FLOOR) if (crisis and direction > 0) else b
        # position P&L% of its own value = direction × beta × market move;
        # contribution to equity = weight × that.
        contribution = size / 100.0 * direction * b_eff * move_pct
        shocks.append(PositionShock(
            symbol=p["symbol"], side=p["side"], size_pct=round(size, 2),
            beta=round(b_eff, 2), beta_estimated=est,
            contribution_pct=round(contribution, 3)))
    shocks.sort(key=lambda s: s.contribution_pct)      # worst (most negative) first
    return shocks


def _stops_shock(positions: list[dict]) -> list[PositionShock]:
    shocks = [
        PositionShock(
            symbol=p["symbol"], side=p["side"], size_pct=round(p["size_pct_equity"] or 0.0, 2),
            beta=0.0, beta_estimated=False,
            contribution_pct=round(-(p["planned_risk_pct"] or 0.0), 3))
        for p in positions
    ]
    shocks.sort(key=lambda s: s.contribution_pct)
    return shocks


def _scenario(key: str, title: str, kind: str, move: float | None,
              shocks: list[PositionShock], peak: float, cur: float,
              max_dd: float) -> Scenario:
    total = round(sum(s.contribution_pct for s in shocks), 3)
    projected = round(cur * (1.0 + total / 100.0), 2)
    dd = round((peak - projected) / peak * 100.0, 2) if peak > 0 else 0.0
    dd = max(dd, 0.0)
    return Scenario(
        key=key, title=title, kind=kind, market_move_pct=move,
        total_impact_pct=total, projected_index=projected,
        projected_drawdown_pct=dd, breaches_circuit=dd >= max_dd,
        positions=shocks)


def _hedges(report_scen: list[Scenario], config: HermesConfig, open_risk: float,
            net_beta_exposure: float) -> list[Hedge]:
    r = config.risk
    hedges: list[Hedge] = []
    breaching = [s for s in report_scen if s.breaches_circuit]
    if breaching:
        worst = min(breaching, key=lambda s: s.projected_index)
        hedges.append(Hedge(
            "cash-priority", "serious",
            "Reduce gross exposure — the book can't take this shock intact",
            f"{worst.title} projects a {worst.projected_drawdown_pct:.1f}% drawdown, past your "
            f"{r.max_drawdown_pct:.1f}% circuit breaker. A cash-priority posture (no new risk, "
            "trim the most exposed) is the context here — you place any trade."))

    crisis = next((s for s in report_scen if s.kind == "crisis"), None)
    if crisis and crisis.positions:
        worst_pos = crisis.positions[0]
        if worst_pos.contribution_pct < 0:
            hedges.append(Hedge(
                "trim", "warn",
                f"{worst_pos.symbol} carries the most shock",
                f"In the crisis case {worst_pos.symbol} ({worst_pos.side}, "
                f"{worst_pos.size_pct:.1f}% of equity, β {worst_pos.beta:.2f}) would cost "
                f"{abs(worst_pos.contribution_pct):.2f}% of equity — trimming it removes "
                "the most drawdown per unit sold."))

    # Same −20% move both ways, so the gap isolates the correlation effect alone.
    crash = next((s for s in report_scen if s.key == "crash"), None)
    if crisis and crash:
        gap = round(crash.total_impact_pct - crisis.total_impact_pct, 2)  # crisis is more negative
        if gap > 0.5:
            hedges.append(Hedge(
                "diversify", "warn",
                "The diversification you're relying on thins in a crisis",
                f"At the same −20% move, your betas cushion the book to "
                f"{crash.total_impact_pct:.1f}% of equity, but correlations→1 deepens it to "
                f"{crisis.total_impact_pct:.1f}% — a {gap:.1f}%-of-equity cushion that a real "
                "panic removes. Uncorrelated exposure is what widens it."))

    if net_beta_exposure > 0:
        hedges.append(Hedge(
            "note", "info", "The book is net long the market",
            f"Net beta-weighted exposure is +{net_beta_exposure:.1f}% of equity — the book "
            "falls in a broad drop. A genuine hedge would need net exposure nearer flat, "
            "not more longs."))
    elif net_beta_exposure < 0:
        hedges.append(Hedge(
            "note", "info", "The book is net short the market",
            f"Net beta-weighted exposure is {net_beta_exposure:.1f}% of equity — the book "
            "gains in a broad drop but bleeds in a rally. The same what-if runs in reverse "
            "on the upside."))

    stops_cost = open_risk
    hedges.append(Hedge(
        "note", "info", "If every stop is hit",
        f"The deterministic worst case is {stops_cost:.2f}% of equity — the sum of planned "
        f"risk you have already committed, against your {r.max_open_risk_pct:.1f}% open-risk "
        "budget. This one needs no model; it is the risk the positions carry."))
    return hedges


def build_stress(config: HermesConfig) -> StressReport:
    positions = risk.open_positions()
    cur, cur_dd = risk.current_equity_index()
    peak = cur / (1.0 - cur_dd / 100.0) if cur_dd < 100.0 else cur
    max_dd = config.risk.max_drawdown_pct
    open_risk = round(sum(p["planned_risk_pct"] or 0.0 for p in positions), 2)

    if not positions:
        return StressReport(
            generated_at=utcnow(), status="empty",
            note=("no open positions to stress — the book is flat, so every scenario "
                  "is a no-op. Missing stays missing; nothing is invented."),
            benchmark=config.market.benchmark, lookback_days=STRESS_LOOKBACK,
            current_index=round(cur, 2), current_drawdown_pct=cur_dd,
            max_drawdown_pct=max_dd, open_risk_pct=0.0)

    betas = _betas(config, positions)
    scenarios = [
        _scenario("correction", "Market −5%", "market", -5.0,
                  _shock(positions, betas, -5.0, crisis=False), peak, cur, max_dd),
        _scenario("bear_leg", "Market −10%", "market", -10.0,
                  _shock(positions, betas, -10.0, crisis=False), peak, cur, max_dd),
        _scenario("crash", "Market −20%", "market", -20.0,
                  _shock(positions, betas, -20.0, crisis=False), peak, cur, max_dd),
        _scenario("stops", "All stops hit", "stops", None,
                  _stops_shock(positions), peak, cur, max_dd),
        _scenario("crisis", "Crisis: −20% + correlations→1", "crisis", CRISIS_MOVE_PCT,
                  _shock(positions, betas, CRISIS_MOVE_PCT, crisis=True),
                  peak, cur, max_dd),
    ]
    # Net beta-weighted directional exposure (% of equity).
    net_beta_exposure = round(sum(
        (p["size_pct_equity"] or 0.0) * (1.0 if p["side"] == "long" else -1.0)
        * betas[p["symbol"]][0]
        for p in positions), 1)

    # Hedges read the market/crisis scenarios (not the stops one) for breaches.
    hedges = _hedges([s for s in scenarios if s.kind in ("market", "crisis")],
                     config, open_risk, net_beta_exposure)

    return StressReport(
        generated_at=utcnow(), status="ok", note="",
        benchmark=config.market.benchmark, lookback_days=STRESS_LOOKBACK,
        current_index=round(cur, 2), current_drawdown_pct=cur_dd,
        max_drawdown_pct=max_dd, open_risk_pct=open_risk,
        scenarios=scenarios, hedges=hedges)
