"""Regime Label v6.2 — the owner's classifier, ported from the TradingView
Pine source (v6.2 Professional, 2026-07).

THE MODEL (verbatim from the source, Daily preset):

    window_log_ret      = ln(close / close[20])
    one_bar_log_ret     = ln(close / close[1])
    realized_window_vol = population stdev(one_bar_log_ret, 20) * sqrt(20)
    regime_z            = window_log_ret / realized_window_vol

    vol_factor = max(0.50, 1 + ((vol_percentile - 50) / 100) * 0.25)
    enter_z    = max(0.10, 0.85 * vol_factor)
    exit_z     = max(0.05, min(0.55 * vol_factor, enter_z - 0.05))

with an EMA(100) direction filter (bull needs close > EMA, bear below),
enter/exit hysteresis, a 4x ATR(14) gap-shock guard that refuses to let an
overnight shock CREATE a flip, and 2-bar confirmation. The whole state
machine is replayed over the supplied history so today's confirmed label is
exactly what the machine, run bar by bar, arrives at — no shortcuts.

PORT FIDELITY NOTES (deviations, all declared):
  * Daily preset only (lookback 20 / enter 0.85 / exit 0.55 / confirm 2) —
    Hermes' V1 workflow runs daily bars; the 4H/Weekly presets come with the
    multi-timeframe roadmap item.
  * Omitted, as in the upstream defaults: the fixed-% threshold mode, the
    optional HTF confirmation vote (upstream default OFF), the wider-neutral
    band, and the probabilistic strength variant. The regime-side quality
    filter is Off (upstream default); trend quality is still computed and
    reported as evidence (chop risk), as the playbook layer uses it.
  * Recursive indicators (EMA/RMA/ATR/ADX) are seeded per standard Wilder
    convention; warmup differences vs Pine decay geometrically and are
    negligible at the >=500 bars of history Hermes feeds this classifier.
  * v6.2 is a single-symbol classifier: watchlist bars are accepted per the
    Hermes classifier contract and deliberately unused.
  * score/confidence are Hermes PRESENTATION mappings of v6.2's z and
    strength (documented on the fields below); the label logic itself is
    the ported machine, untouched.
  * Parity target updated 2026-07-06: the owner now runs this core embedded
    as the regime module of the Five-Tool Confluence AIO v3.4.1. Re-verified
    line-by-line against that module — at its daily-chart defaults it is
    this exact model (same constants, same state machine). Its extra
    selectable options (EWMA/ATR% vol models, Custom preset, alternate gap
    modes, external override) all default to the ported behavior. v3.3/v3.4/
    v3.4.1 changed only readout/validation layers, NOT the regime engine:
    the entry/exit/threshold math is unchanged from the v3.2 this was cut
    from, so no code change was required. v3.4.1 additionally carries an
    on-chart empirical Markov transition readout that mirrors this repo's
    /api/regime/lab markov block (see docs/REGIME_V62_PORT.md).

The honesty statement is carried verbatim per docs/REGIME_V62_PORT.md:
this is a heuristic derived from historical label-correlation, not a
backtested edge.
"""

from __future__ import annotations

import math

from ..config import HermesConfig
from ..data.models import Bar, utcnow
from .models import Evidence, RegimeLabel, RegimeReading

VERSION = "v62"

# Daily preset + upstream defaults (Pine input defaults, verbatim).
LOOKBACK = 20
ENTER_Z_BASE = 0.85
EXIT_Z_BASE = 0.55
CONFIRM_BARS = 2
EMA_LEN = 100
ADX_LEN = 14
ADX_SMOOTHING = 14
ADX_THRESHOLD = 20.0
ER_LEN = 20
ER_THRESHOLD = 0.25
GAP_ATR_LEN = 14
GAP_ATR_MULT = 4.0
VOL_PCT_LEN = 252
PCT_SENSITIVITY = 0.25
EXTENSION_STRENGTH = 85.0

HONESTY = (
    "Regime Label v6.2 — the owner's classifier, ported from its TradingView "
    "source: a volatility-adjusted momentum state machine with hysteresis. "
    "A heuristic derived from historical label-correlation, not a backtested "
    "edge. It classifies the current market state; it does not predict returns."
)


# ── Small numeric helpers (population semantics to match Pine defaults) ──

def _pstdev(values: list[float]) -> float | None:
    n = len(values)
    if n == 0:
        return None
    mean = sum(values) / n
    return math.sqrt(sum((v - mean) ** 2 for v in values) / n)


def _ema_series(values: list[float], length: int) -> list[float]:
    alpha = 2.0 / (length + 1)
    out: list[float] = []
    prev = values[0] if values else 0.0
    for v in values:
        prev = v * alpha + prev * (1 - alpha)
        out.append(prev)
    return out


def _rma_series(values: list[float | None], length: int) -> list[float | None]:
    """Wilder smoothing (alpha = 1/length), seeded with the SMA of the first
    full window of non-None values."""
    out: list[float | None] = [None] * len(values)
    window: list[float] = []
    prev: float | None = None
    for i, v in enumerate(values):
        if v is None:
            continue
        if prev is None:
            window.append(v)
            if len(window) == length:
                prev = sum(window) / length
                out[i] = prev
        else:
            prev = (prev * (length - 1) + v) / length
            out[i] = prev
    return out


def _percentrank(history: list[float], current: float, length: int) -> float | None:
    """Pine ta.percentrank: % of the previous `length` values <= current."""
    if len(history) < length:
        return None
    window = history[-length:]
    return sum(1 for h in window if h <= current) / length * 100.0


class RegimeV62Classifier:
    version = VERSION

    def __init__(self, config: HermesConfig):
        self.config = config

    # v6.2 is single-symbol: watchlist_bars accepted per contract, unused.
    def classify(
        self, benchmark_bars: list[Bar], watchlist_bars: dict[str, list[Bar]]
    ) -> RegimeReading:
        closes = [b.close for b in benchmark_bars]
        opens = [b.open for b in benchmark_bars]
        highs = [b.high for b in benchmark_bars]
        lows = [b.low for b in benchmark_bars]
        n = len(closes)

        if n < LOOKBACK + 1:
            return self._insufficient(benchmark_bars, needed=LOOKBACK + 1, have=n)

        # ── Per-bar series ────────────────────────────────────────────────
        one_bar: list[float | None] = [None] * n
        for i in range(1, n):
            if closes[i] > 0 and closes[i - 1] > 0:
                one_bar[i] = math.log(closes[i] / closes[i - 1])

        window_ret: list[float | None] = [None] * n
        for i in range(LOOKBACK, n):
            if closes[i] > 0 and closes[i - LOOKBACK] > 0:
                window_ret[i] = math.log(closes[i] / closes[i - LOOKBACK])

        vol: list[float | None] = [None] * n
        for i in range(LOOKBACK, n):
            rets = [r for r in one_bar[i - LOOKBACK + 1 : i + 1] if r is not None]
            if len(rets) == LOOKBACK:
                sd = _pstdev(rets)
                if sd is not None:
                    vol[i] = sd * math.sqrt(LOOKBACK)

        ema = _ema_series(closes, EMA_LEN)

        # True range → ATR(14) via Wilder RMA.
        tr: list[float | None] = [None] * n
        for i in range(n):
            if i == 0:
                tr[i] = highs[i] - lows[i]
            else:
                tr[i] = max(highs[i] - lows[i], abs(highs[i] - closes[i - 1]),
                            abs(lows[i] - closes[i - 1]))
        atr = _rma_series(tr, GAP_ATR_LEN)

        # ADX (Wilder DMI) for the chop-risk evidence.
        plus_dm: list[float | None] = [None] * n
        minus_dm: list[float | None] = [None] * n
        for i in range(1, n):
            up = highs[i] - highs[i - 1]
            dn = lows[i - 1] - lows[i]
            plus_dm[i] = up if up > dn and up > 0 else 0.0
            minus_dm[i] = dn if dn > up and dn > 0 else 0.0
        atr_adx = _rma_series(tr, ADX_LEN)
        plus_s = _rma_series(plus_dm, ADX_LEN)
        minus_s = _rma_series(minus_dm, ADX_LEN)
        dx: list[float | None] = [None] * n
        for i in range(n):
            if atr_adx[i] and plus_s[i] is not None and minus_s[i] is not None:
                pdi = 100.0 * plus_s[i] / atr_adx[i]
                mdi = 100.0 * minus_s[i] / atr_adx[i]
                denom = pdi + mdi
                dx[i] = 100.0 * abs(pdi - mdi) / denom if denom > 0 else 0.0
        adx = _rma_series(dx, ADX_SMOOTHING)

        # Efficiency ratio (v6.2 form).
        er: list[float | None] = [None] * n
        for i in range(ER_LEN, n):
            chgs = [abs(closes[k] - closes[k - 1]) for k in range(i - ER_LEN + 1, i + 1)]
            den = (sum(chgs) / ER_LEN) * ER_LEN
            if den > 0:
                er[i] = abs(closes[i] - closes[i - ER_LEN]) / den

        # ── Replay the v6.2 state machine over the whole history ─────────
        vol_history: list[float] = []
        confirmed: int | None = None       # v6.2 coding: 1 Bull, 2 Bear, 0 Neutral
        candidates: list[int | None] = []
        bars_in_regime = 0
        z_last: float | None = None
        enter_last, exit_last = ENTER_Z_BASE, EXIT_Z_BASE
        gap_last = False

        for i in range(n):
            v = vol[i]
            pct = None
            if v is not None:
                pct = _percentrank(vol_history, v, VOL_PCT_LEN)
                vol_history.append(v)

            factor = (max(0.50, 1.0 + ((pct - 50.0) / 100.0) * PCT_SENSITIVITY)
                      if pct is not None else 1.0)
            enter_z = max(0.10, ENTER_Z_BASE * factor)
            exit_z = max(0.05, min(EXIT_Z_BASE * factor, enter_z - 0.05))

            z = (window_ret[i] / v) if (window_ret[i] is not None and v and v > 0) else None

            prev = confirmed if confirmed is not None else 0
            if z is None:
                cand: int | None = None
            else:
                bull_trend_ok = closes[i] > ema[i]
                bear_trend_ok = closes[i] < ema[i]
                raw_enter = (1 if z > enter_z and bull_trend_ok
                             else 2 if z < -enter_z and bear_trend_ok else 0)
                # Hysteresis: an in-force regime holds at the (lower) exit threshold.
                if prev == 1 and z > exit_z and bull_trend_ok:
                    cand = 1
                elif prev == 2 and z < -exit_z and bear_trend_ok:
                    cand = 2
                else:
                    cand = raw_enter
                # Gap-shock guard: a >4x ATR open gap cannot CREATE a flip.
                gap_abs = abs(opens[i] - closes[i - 1]) if i > 0 else None
                shock = (gap_abs is not None and atr[i] is not None
                         and gap_abs > GAP_ATR_MULT * atr[i])
                if shock and cand != prev:
                    cand = 0
                if i == n - 1:
                    gap_last = bool(shock)

            candidates.append(cand)

            # Confirmation: identical candidate for CONFIRM_BARS consecutive bars.
            if (len(candidates) >= CONFIRM_BARS
                    and all(c is not None and c == cand
                            for c in candidates[-CONFIRM_BARS:])):
                new_confirmed = cand
            else:
                new_confirmed = confirmed

            if new_confirmed is None:
                bars_in_regime = 0
            elif confirmed is None or new_confirmed != confirmed:
                bars_in_regime = 1
            else:
                bars_in_regime += 1
            confirmed = new_confirmed

            if i == n - 1:
                z_last, enter_last, exit_last = z, enter_z, exit_z

        # ── Today's derived readouts (v6.2 formulas) ──────────────────────
        state = confirmed if confirmed is not None else 0
        abs_z = abs(z_last) if z_last is not None else None
        strength = (min(100.0, abs_z / max(enter_last * 1.5, 1e-4) * 100.0)
                    if abs_z is not None else None)
        adx_ok = adx[-1] is not None and adx[-1] >= ADX_THRESHOLD
        er_ok = er[-1] is not None and er[-1] >= ER_THRESHOLD
        chop_risk = 0 if (adx_ok and er_ok) else 1 if (adx_ok or er_ok) else 2
        extension = (state != 0 and strength is not None
                     and strength >= EXTENSION_STRENGTH and bars_in_regime > LOOKBACK)

        label = (RegimeLabel.BULL_TREND if state == 1
                 else RegimeLabel.BEAR_TREND if state == 2 else RegimeLabel.CHOP)

        # Hermes presentation mappings (NOT v6.2 outputs; documented):
        # score = signed z scaled by the strength denominator, clipped to ±1;
        # confidence = strength/100 in a regime, band-centeredness in neutral.
        if z_last is None:
            score = 0.0
            confidence = 0.0
        else:
            score = max(-1.0, min(1.0, z_last / max(enter_last * 1.5, 1e-4)))
            if state == 0:
                confidence = max(0.0, min(1.0, 1.0 - abs(z_last) / max(enter_last, 1e-4)))
            else:
                confidence = (strength or 0.0) / 100.0

        evidence = self._evidence(
            z_last, enter_last, exit_last, closes[-1], ema[-1], adx[-1], er[-1],
            adx_ok, er_ok, chop_risk, gap_last, bars_in_regime, extension, strength,
        )

        latest = benchmark_bars[-1]
        return RegimeReading(
            ts=utcnow(),
            label=label,
            score=round(score, 3),
            confidence=round(confidence, 2),
            classifier_version=self.version,
            evidence=evidence,
            data_asof=latest.ts,
            data_source=latest.source,
            honesty=HONESTY,
        )

    # ── Evidence (the teach-in payload) ───────────────────────────────────

    def _evidence(self, z, enter_z, exit_z, close, ema_v, adx_v, er_v,
                  adx_ok, er_ok, chop_risk, gap_shock, bars_in, extension,
                  strength) -> list[Evidence]:
        ev: list[Evidence] = []

        ev.append(Evidence(
            component="v62_zscore",
            title="Vol-adjusted momentum z",
            value=(f"z {z:+.2f} vs enter ±{enter_z:.2f} / exit ±{exit_z:.2f}"
                   if z is not None else "no data"),
            signal=None if z is None else max(-1.0, min(1.0, z / enter_z)),
            claim=(
                "The 20-day log return, measured in units of its own realized "
                "volatility, is far enough from zero to call a directional state — "
                "or it isn't, and the state is Neutral."
            ),
            methodology=(
                "Regime Label v6.2 (the owner's validated rule): windowed log "
                "return / realized window volatility, with volatility-percentile "
                "adaptive thresholds and enter/exit hysteresis."
            ),
            caveat=(
                "A heuristic derived from historical label-correlation, not a "
                "backtested edge. The z-score describes the recent past; regimes "
                "are recognized late by construction (that is the price of "
                "confirmation)."
            ),
            status=("missing" if z is None else
                    "bullish" if z > enter_z else
                    "bearish" if z < -enter_z else "neutral"),
        ))

        ev.append(Evidence(
            component="v62_ema_filter",
            title="EMA(100) direction filter",
            value=(f"close {close:.2f} {'above' if close > ema_v else 'below'} "
                   f"EMA {ema_v:.2f}"),
            signal=1.0 if close > ema_v else -1.0,
            claim="A directional state must agree with the long average: no Bull "
                  "call below the EMA(100), no Bear call above it.",
            methodology="Regime Label v6.2's direction filter (EMA 100, default on).",
            caveat="A location filter, not a forecast; it lags at turns like every "
                   "long average.",
            status="bullish" if close > ema_v else "bearish",
        ))

        ev.append(Evidence(
            component="v62_quality",
            title="Trend quality (ADX / efficiency ratio)",
            value=(f"ADX {adx_v:.1f} ({'≥' if adx_ok else '<'}{ADX_THRESHOLD:.0f}) · "
                   f"ER {er_v:.2f} ({'≥' if er_ok else '<'}{ER_THRESHOLD:.2f}) → "
                   f"chop {'LOW' if chop_risk == 0 else 'MED' if chop_risk == 1 else 'HIGH'}"
                   if adx_v is not None and er_v is not None else "warming up"),
            signal=None,
            claim="Both quality gauges agreeing means the tape is trending, not "
                  "churning; disagreement means grade every signal down.",
            methodology="Wilder's ADX (1978) and Kaufman's efficiency ratio, as "
                        "composed in v6.2's chop-risk gauge.",
            caveat="Informational for the regime label (v6.2 ships the regime-side "
                   "quality gate Off); the playbook layer is where it gates.",
            status="neutral" if chop_risk < 2 else "stress",
        ))

        ev.append(Evidence(
            component="v62_gap_guard",
            title="Gap-shock guard (4× ATR)",
            value="shock bar — new flips neutralized" if gap_shock else "no shock",
            signal=None,
            claim="An overnight gap beyond four ATRs is news, not trend; it is not "
                  "allowed to CREATE a regime flip on its own bar.",
            methodology="Regime Label v6.2's gap guard (|open − prior close| > 4×ATR(14), "
                        "neutralize-new-flips mode).",
            caveat="The guard delays recognition after true shock-driven turns by "
                   "design — it prefers a late label to a panicked one.",
            status="stress" if gap_shock else "neutral",
        ))

        ev.append(Evidence(
            component="v62_persistence",
            title="Confirmation & regime age",
            value=(f"{bars_in} confirmed bars in regime"
                   + (f" · strength {strength:.0f}" if strength is not None else "")
                   + (" · EXTENDED" if extension else "")),
            signal=None,
            claim="The label only changes after 2 identical candidate bars; age and "
                  "strength together flag mature, extended regimes.",
            methodology="Regime Label v6.2's confirm-bars and extension logic "
                        f"(strength ≥ {EXTENSION_STRENGTH:.0f} and age > {LOOKBACK}).",
            caveat="Extension is a de-risking caution, not a reversal signal.",
            status="stress" if extension else "neutral",
        ))

        return ev

    def _insufficient(self, bars: list[Bar], *, needed: int, have: int) -> RegimeReading:
        latest = bars[-1] if bars else None
        return RegimeReading(
            ts=utcnow(),
            label=RegimeLabel.CHOP,
            score=0.0,
            confidence=0.0,
            classifier_version=self.version,
            evidence=[Evidence(
                component="v62_zscore",
                title="Vol-adjusted momentum z",
                value="no data",
                signal=None,
                claim="No claim — input history is missing and is shown as missing, "
                      "not interpolated.",
                methodology="Regime Label v6.2 (the owner's validated rule).",
                caveat=f"Needs at least {needed} daily bars; have {have}.",
                status="missing",
            )],
            data_asof=latest.ts if latest else None,
            data_source=latest.source if latest else "none",
            honesty=HONESTY,
        )
