"""Instrument terminal — a per-symbol read composed from existing engines.

Nothing here invents data. For one symbol, from CACHED daily bars (never a
live fetch), it assembles: price + staleness (data/store), the 50/150/200-day
SMAs and 52-week range (regime/indicators), RS + Mansfield and the RS verdict
(rs/board), the Minervini Trend-Template score (screener/trend_template), the
in-book flag + weight and sector (risk/journal), and the current regime
(regime/engine).

On top of those it computes a **thesis-fit**: a transparent 0–100 sum of four
factors — regime-fit, setup-match, sizing-posture, book-impact — each carrying
the same teach-in shape the regime evidence uses ({label, chip, claim,
measured, caveat}) so the number is never a black box. The four factor points
sum to the score by construction. Posture is ALLOW / WATCH / RESTRICT, capped
BELOW ALLOW whenever the regime is not a bull trend (mirroring the RS board's
cap — risk outranks selection) and forced to RESTRICT on a risk breach.

Short history stays missing: a symbol without enough bars for the RS/Trend
factors returns those fields as None (never 0) and a null thesis-fit score.

This is decision-support only. A posture is context for a human decision — it
is never a directive, and no order path exists in this codebase.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime

from ..config import HermesConfig
from ..data import store
from ..regime.engine import latest_reading
from ..regime.indicators import correlation, sma, sma_series
from ..regime.models import RegimeLabel
from ..risk import engine as risk
from ..rs import board as rs_board
from ..screener import trend_template as screener

CLAIM = (
    "A transparent 0–100 fit of this instrument against the book: regime-fit, "
    "setup-match, sizing-posture, and book-impact, each a named measurement. "
    "The posture (ALLOW / WATCH / RESTRICT) is context for a human decision."
)
METHODOLOGY = (
    "A weighted sum of four factors, each traced to an existing Hermes engine: "
    "regime-fit (MA stack + Mansfield RS + the current regime), setup-match "
    "(Minervini Trend-Template score + the RS verdict), sizing-posture (the "
    "risk engine's open-risk / concentration / correlation headroom), and "
    "book-impact (in-book weight + correlation to open positions). The four "
    "factor points sum to the score."
)
CAVEAT = (
    "A composite of already-caveated readings, not a new edge or a forecast. "
    "Its inputs inherit their own caveats (RS states a past tilt not "
    "persistence; the Trend Template is a filter Hermes' one validation did not "
    "support at the gate level; sizing headroom is arithmetic over % of "
    "equity). Non-bull regimes cap the posture below ALLOW and a risk breach "
    "forces RESTRICT — risk outranks selection. Short history renders missing, "
    "never interpolated. A posture is never a trade instruction."
)


@dataclass(frozen=True)
class FitFactor:
    key: str
    label: str
    chip: str                 # 'good' | 'warn' | 'serious' | 'missing'
    claim: str
    measured: str
    caveat: str
    points: float | None      # None when the factor could not be computed
    max_points: float


@dataclass(frozen=True)
class ThesisFit:
    status: str               # 'ok' | 'missing'
    score: int | None         # 0–100; None when a core factor is missing
    posture: str | None       # 'ALLOW' | 'WATCH' | 'RESTRICT'; None when missing
    capped: bool              # posture held below ALLOW by a non-bull regime / breach
    cap_note: str
    factors: list[FitFactor] = field(default_factory=list)
    claim: str = CLAIM
    methodology: str = METHODOLOGY
    caveat: str = CAVEAT


@dataclass(frozen=True)
class InstrumentReport:
    symbol: str
    status: str               # 'ok' | 'missing'
    note: str
    # price / provenance
    price: float | None
    price_source: str | None
    price_as_of: datetime | None
    staleness: str
    # structure (None when short history — never 0)
    close: float | None
    sma50: float | None
    sma150: float | None
    sma200: float | None
    low_52w: float | None
    high_52w: float | None
    pct_above_low: float | None
    pct_below_high: float | None
    bars: int
    # relative strength + screen
    rs: float | None
    mansfield: float | None
    rs_verdict: str | None
    trend_score: int | None
    trend_verdict: str | None
    # book
    in_book: bool
    book_weight_pct: float | None
    book_side: str | None
    sector: str | None
    # context
    regime_label: str | None
    regime_display: str | None
    regime_asof: datetime | None
    thesis_fit: ThesisFit | None
    series: list[dict] = field(default_factory=list)   # [{t, c}] for the chart
    narrative: dict | None = None                      # AI desk-read, when requested


# ── factor helpers ───────────────────────────────────────────────────────────
def _chip(points: float | None, mx: float) -> str:
    if points is None:
        return "missing"
    r = points / mx if mx else 0
    return "good" if r >= 0.7 else "warn" if r >= 0.4 else "serious"


_REGIME_PTS = {RegimeLabel.BULL_TREND: 9.0, RegimeLabel.CHOP: 5.0,
               RegimeLabel.BEAR_TREND: 0.0, RegimeLabel.STRESS: 0.0}


def _regime_fit(close, sma50_, sma150_, sma200_, mansfield, label, display) -> FitFactor:
    mx = 25.0
    if mansfield is None or sma200_ is None:
        return FitFactor(
            "regime_fit", "Regime fit", "missing",
            "Whether price structure, relative strength, and the market regime line up.",
            "∅ missing — needs the 200-day MA and the Mansfield RS line",
            "Alignment is a description of the present, not a forecast.",
            None, mx)
    stack = [close > sma50_, sma50_ > sma150_, sma150_ > sma200_]
    ma_pts = sum(stack) / 3 * 8
    rs_pts = 8.0 if mansfield > 0 else 0.0
    reg_pts = _REGIME_PTS.get(label, 4.0)   # no reading → middling; caps still apply
    pts = round(ma_pts + rs_pts + reg_pts, 1)
    return FitFactor(
        "regime_fit", "Regime fit", _chip(pts, mx),
        "Whether price structure (MA stack), relative strength, and the market regime agree.",
        f"MA stack {sum(stack)}/3 · Mansfield {mansfield:+.1f}% · regime {display}",
        "The MA stack and RS describe the past window; the regime is a heuristic "
        "read of the present, not a backtested edge.",
        pts, mx)


_RS_VERDICT_PTS = {"HI-CONV": 8.0, "LONG-OK": 6.0, "WATCH": 3.0, "SKIP-LAG": 0.0}


def _setup_match(trend_score, trend_verdict, rs_verdict) -> FitFactor:
    mx = 25.0
    if trend_score is None or rs_verdict is None:
        return FitFactor(
            "setup_match", "Setup match", "missing",
            "How completely the name matches a trend-following setup right now.",
            "∅ missing — needs 252 daily bars and 200 benchmark-overlap bars",
            "A trend filter describes a confirmed uptrend; it does not predict one.",
            None, mx)
    tt_pts = trend_score / 8 * 17
    rv_pts = _RS_VERDICT_PTS.get(rs_verdict, 3.0)
    pts = round(tt_pts + rv_pts, 1)
    return FitFactor(
        "setup_match", "Setup match", _chip(pts, mx),
        "The Minervini Trend-Template score plus the RS board's verdict.",
        f"Trend Template {trend_score}/8 ({trend_verdict}) · RS verdict {rs_verdict}",
        "The Phase-4 campaign found filter-style signals did not add value at "
        "default parameters — a match is a screening convenience, not evidence.",
        pts, mx)


def _sizing_posture(config: HermesConfig, state: risk.RiskState) -> FitFactor:
    mx = 25.0
    r = config.risk
    headroom = max(0.0, (r.max_open_risk_pct - state.open_risk_pct) / r.max_open_risk_pct)
    base = 15.0 * headroom
    conc = next((c for c in state.checks if c.kind == "concentration"), None)
    corr = next((c for c in state.checks if c.kind == "correlation"), None)
    base += 5.0 if (conc is None or conc.level == "ok") else 0.0
    base += 5.0 if (corr is None or corr.level == "ok") else 0.0
    if state.level == "breach":
        base = min(base, 3.0)     # the circuit breaker dominates
    pts = round(base, 1)
    return FitFactor(
        "sizing_posture", "Sizing posture", _chip(pts, mx),
        "How much room the risk layer leaves for a new position — open-risk "
        "budget, concentration, and correlation headroom.",
        f"open risk {state.open_risk_pct:.2f}% / {r.max_open_risk_pct:.2f}% budget · "
        f"risk state {state.level}",
        "Headroom is arithmetic over % of equity; it says there is room, not "
        "that the trade is good. Risk outranks selection.",
        pts, mx)


def _book_impact(config: HermesConfig, symbol: str, positions: list[dict],
                 in_book: bool, book_weight: float | None) -> FitFactor:
    mx = 25.0
    div_pts = 15.0 if not in_book else max(0.0, 15.0 - (book_weight or 0.0))
    others = [p["symbol"] for p in positions if p["symbol"] != symbol]
    max_abs_corr = None
    if others:
        me = risk._position_returns(symbol, config.risk.correlation_lookback_days)
        for s in others:
            c = correlation(me, risk._position_returns(s, config.risk.correlation_lookback_days))
            if c is not None and (max_abs_corr is None or abs(c) > max_abs_corr):
                max_abs_corr = abs(c)
    corr_pts = 10.0 if max_abs_corr is None else round((1 - max_abs_corr) * 10, 1)
    pts = round(div_pts + corr_pts, 1)
    corr_txt = "no open positions to correlate against" if max_abs_corr is None \
        else f"max |ρ| to the book = {max_abs_corr:.2f}"
    held = f"already held at {book_weight:.1f}% of equity" if in_book else "not in the book"
    return FitFactor(
        "book_impact", "Book impact", _chip(pts, mx),
        "What adding this name does to the book — concentration and correlation.",
        f"{held} · {corr_txt}",
        "Correlation is backward-looking over the lookback window; a highly "
        "correlated add is one position wearing two tickers.",
        pts, mx)


def _posture(score: int, bull: bool, breach: bool) -> tuple[str, bool, str]:
    raw = "ALLOW" if score >= 67 else "WATCH" if score >= 34 else "RESTRICT"
    if breach:
        return "RESTRICT", raw != "RESTRICT", (
            "forced to RESTRICT — the risk layer is in breach; risk outranks selection")
    if not bull and raw == "ALLOW":
        return "WATCH", True, (
            "capped at WATCH — the regime is not a bull trend; risk outranks selection")
    return raw, False, ""


# ── the report ───────────────────────────────────────────────────────────────
def build_instrument(
    config: HermesConfig, symbol: str, *, ai=None, narrative: bool = False,
    prefer: str | None = None,
) -> InstrumentReport:
    symbol = symbol.upper().strip()
    benchmark = config.market.benchmark
    stale_min = config.market.stale_after_minutes
    sym_bars = store.get_bars(symbol, "1Day", limit=400)
    snap = store.get_snapshot(symbol)
    price = snap.price if snap else (sym_bars[-1].close if sym_bars else None)
    price_source = snap.source if snap else (sym_bars[-1].source if sym_bars else None)
    price_as_of = snap.ts if snap else (sym_bars[-1].ts if sym_bars else None)
    st = store.staleness(price_as_of, stale_min) if price_as_of else "missing"

    reading = latest_reading()
    bull = reading is not None and reading.label == RegimeLabel.BULL_TREND
    regime_display = reading.label.display if reading else "no reading yet"

    if not sym_bars:
        return InstrumentReport(
            symbol=symbol, status="missing",
            note=(f"no cached daily bars for {symbol} — it is not in the watchlist "
                  "or has not been synced. Missing stays missing, never faked."),
            price=price, price_source=price_source, price_as_of=price_as_of, staleness=st,
            close=None, sma50=None, sma150=None, sma200=None, low_52w=None, high_52w=None,
            pct_above_low=None, pct_below_high=None, bars=0,
            rs=None, mansfield=None, rs_verdict=None, trend_score=None, trend_verdict=None,
            in_book=False, book_weight_pct=None, book_side=None, sector=None,
            regime_label=reading.label.value if reading else None,
            regime_display=regime_display if reading else None,
            regime_asof=reading.data_asof if reading else None,
            thesis_fit=None, series=[], narrative=None)

    closes = [b.close for b in sym_bars]
    bench_bars = store.get_bars(benchmark, "1Day", limit=400)
    # Rolling MA series for the chart overlays (computed over full history, then
    # sliced to the visible window — None where history is too short, never faked).
    ma50s, ma150s, ma200s = (sma_series(closes, w) for w in (50, 150, 200))
    window_n = 120
    chart = [
        {"t": b.ts, "o": b.open, "h": b.high, "low": b.low, "c": b.close, "v": b.volume,
         "ma50": ma50s[i], "ma150": ma150s[i], "ma200": ma200s[i]}
        for i, b in enumerate(sym_bars)
    ][-window_n:]

    # Reuse the board + screener single-symbol builders verbatim (no reinvention).
    rs_row = rs_board._row(symbol, sym_bars, bench_bars, bull, regime_display, stale_min)
    scr_row = screener._row(symbol, sym_bars, bench_bars, bull, regime_display, stale_min)

    close = closes[-1]
    window = closes[-screener.LOOKBACK_52W:]
    low_52w = min(window) if window else None
    high_52w = max(window) if window else None

    # Book context
    positions = risk.open_positions()
    mine = next((p for p in positions if p["symbol"] == symbol), None)
    in_book = mine is not None
    book_weight = mine["size_pct_equity"] if mine else None
    book_side = mine["side"] if mine else None
    sector = mine["sector"] if mine else None
    state = risk.evaluate(config)

    # Four factors
    factors = [
        _regime_fit(close, sma(closes, 50), sma(closes, 150), sma(closes, 200),
                    rs_row.mansfield, reading.label if reading else None, regime_display),
        _setup_match(scr_row.score, scr_row.verdict, rs_row.verdict),
        _sizing_posture(config, state),
        _book_impact(config, symbol, positions, in_book, book_weight),
    ]
    if all(f.points is not None for f in factors):
        score = round(sum(f.points for f in factors))
        posture, capped, cap_note = _posture(score, bull, state.level == "breach")
        fit = ThesisFit("ok", score, posture, capped, cap_note, factors)
    else:
        fit = ThesisFit(
            "missing", None, None, False,
            "insufficient history for a full thesis-fit — needs 252 daily bars "
            "and 200 benchmark-overlap bars for the regime-fit and setup-match factors",
            factors)

    report = InstrumentReport(
        symbol=symbol, status="ok", note="",
        price=round(price, 2) if price is not None else None,
        price_source=price_source, price_as_of=price_as_of, staleness=st,
        close=round(close, 2),
        sma50=round(sma(closes, 50), 2) if sma(closes, 50) is not None else None,
        sma150=round(sma(closes, 150), 2) if sma(closes, 150) is not None else None,
        sma200=round(sma(closes, 200), 2) if sma(closes, 200) is not None else None,
        low_52w=round(low_52w, 2) if low_52w is not None else None,
        high_52w=round(high_52w, 2) if high_52w is not None else None,
        pct_above_low=round((close / low_52w - 1) * 100, 1) if low_52w else None,
        pct_below_high=round((close / high_52w - 1) * 100, 1) if high_52w else None,
        bars=len(closes),
        rs=rs_row.rs, mansfield=rs_row.mansfield, rs_verdict=rs_row.verdict,
        trend_score=scr_row.score, trend_verdict=scr_row.verdict,
        in_book=in_book, book_weight_pct=book_weight, book_side=book_side, sector=sector,
        regime_label=reading.label.value if reading else None,
        regime_display=regime_display if reading else None,
        regime_asof=reading.data_asof if reading else None,
        thesis_fit=fit,
        series=chart,
        narrative=_desk_read(ai, report_facts(symbol, close, fit, rs_row, scr_row,
                                              regime_display, in_book, book_weight), prefer)
        if (narrative and ai is not None) else None,
    )
    return report


def report_facts(symbol, close, fit, rs_row, scr_row, regime_display, in_book, weight) -> str:
    """Compact computed-facts block handed to the AI desk-read. Numbers only —
    the model rephrases, it never adds a value."""
    lines = [
        f"Symbol: {symbol}  ·  last close {close}",
        f"Regime: {regime_display}",
        f"Mansfield RS: {rs_row.mansfield}  ·  RS verdict {rs_row.verdict}",
        f"Trend Template: {scr_row.score}/8 ({scr_row.verdict})",
        f"In book: {'yes, ' + str(weight) + '% of equity' if in_book else 'no'}",
    ]
    if fit.score is not None:
        lines.append(f"Thesis-fit: {fit.score}/100 → posture {fit.posture}"
                     + (f" ({fit.cap_note})" if fit.capped else ""))
        lines += [f"  · {f.label}: {f.points}/{f.max_points} — {f.measured}"
                  for f in fit.factors]
    else:
        lines.append("Thesis-fit: ∅ missing (short history)")
    return "\n".join(lines)


def facts_from_report(rep: InstrumentReport) -> str:
    """Computed-facts block built from a finished InstrumentReport's PUBLIC fields
    — for the debate route, which has the report but not the internal rows. Numbers
    only; the model rephrases and invents nothing."""
    lines = [
        f"Symbol: {rep.symbol}  ·  last close {rep.close}",
        f"Regime: {rep.regime_display or 'no reading'}",
        f"Mansfield RS: {rep.mansfield}  ·  RS verdict {rep.rs_verdict}",
        f"Trend Template: {rep.trend_score}/8 ({rep.trend_verdict})",
        f"In book: {'yes, ' + str(rep.book_weight_pct) + '% of equity' if rep.in_book else 'no'}",
    ]
    tf = rep.thesis_fit
    if tf is not None and tf.score is not None:
        lines.append(f"Thesis-fit: {tf.score}/100 → posture {tf.posture}"
                     + (f" ({tf.cap_note})" if tf.capped else ""))
        lines += [f"  · {f.label}: {f.points}/{f.max_points} — {f.measured}"
                  for f in tf.factors]
    else:
        lines.append("Thesis-fit: ∅ missing (short history)")
    return "\n".join(lines)


def _desk_read(ai, facts_md: str, prefer: str | None = None) -> dict:
    """Optional AI narrative over the computed facts, degrading visibly."""
    res = ai.complete("desk_read", facts_md=facts_md, prefer=prefer)
    if res.status == "ok":
        return {"status": "ok", "text": res.text, "backend": res.backend,
                "model": res.model, "note": res.note}
    return {"status": "unavailable", "text": None, "note": res.note}


# ── search ───────────────────────────────────────────────────────────────────
def search(config: HermesConfig, q: str) -> list[dict]:
    """Rank the configured watchlist (+ benchmark) by a query against the ticker.
    A symbol outside the watchlist that has cached bars is still resolvable;
    anything with no cached history returns honestly as unknown — this read path
    never does a live fetch."""
    q = (q or "").upper().strip()
    universe = list(dict.fromkeys([config.market.benchmark, *config.market.watchlist]))
    results = []
    for sym in universe:
        if q and q not in sym:
            continue
        bars = store.latest_bar_ts(sym, "1Day")
        results.append({
            "symbol": sym, "in_watchlist": True, "has_history": bars is not None,
            "as_of": bars, "rank": 0 if sym.startswith(q) else 1,
        })
    if q and not any(r["symbol"] == q for r in results):
        # An exact ticker outside the watchlist: resolvable only if we cached it.
        has = store.latest_bar_ts(q, "1Day")
        results.append({
            "symbol": q, "in_watchlist": False, "has_history": has is not None,
            "as_of": has, "rank": 0,
            "note": None if has else "not in the watchlist or cache — sync it to load history",
        })
    results.sort(key=lambda r: (r["rank"], r["symbol"]))
    return results


def report_dict(report: InstrumentReport) -> dict:
    """Route-facing serialization (datetimes → iso handled by the route)."""
    return asdict(report)
