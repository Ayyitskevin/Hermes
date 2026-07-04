"""ReferenceRegimeClassifier ("reference-v1") — the classifier Hermes ships with.

HONESTY, UP FRONT: this is NOT Regime Label v6.2 (the owner's classifier; see
docs/REGIME_V62_PORT.md for the port slot). It is a transparent composite of
established, published methods, each named in its Evidence entry, so the
dashboard is fully functional — and honest about itself — until v6.2 lands.

It classifies the market into four regimes from five components:

1. Price vs 200-day SMA         — Faber (2007), "A Quantitative Approach to
                                  Tactical Asset Allocation" (10-month ≈ 200-day)
2. 50-day SMA slope             — moving-average trend structure; the family
                                  tested in Brock, Lakonishok & LeBaron (1992)
3. Watchlist breadth            — "% above 50-day MA" breadth gauge (standard
                                  market-internals family)
4. Realized-volatility regime   — volatility clustering (Engle 1982 ARCH line
                                  of work): high-vol regimes cluster with drawdowns
5. 12-1 momentum                — Jegadeesh & Titman (1993); time-series form in
                                  Moskowitz, Ooi & Pedersen (2012)

The label logic is explicit rules over these votes — no fitted parameters, so
nothing here can be silently overfit. What this buys is transparency, not edge.
"""

from __future__ import annotations

from ..config import HermesConfig
from ..data.models import Bar, utcnow
from .indicators import (
    percentile_rank,
    realized_vol_annualized,
    sma,
    sma_series,
)
from .models import Evidence, RegimeLabel, RegimeReading

VERSION = "reference-v1"

HONESTY = (
    "reference-v1 is a transparent composite of published trend, breadth, "
    "volatility and momentum measures. It is a heuristic description of the "
    "current market state — not a backtested edge, and not the owner's "
    "Regime Label v6.2, which has not been ported yet."
)


def _missing(component: str, title: str, methodology: str, why: str) -> Evidence:
    return Evidence(
        component=component, title=title, value="no data", signal=None,
        claim="No claim — input data is missing and is shown as missing, not interpolated.",
        methodology=methodology, caveat=why, status="missing",
    )


class ReferenceRegimeClassifier:
    version = VERSION

    def __init__(self, config: HermesConfig):
        self.config = config

    def classify(
        self,
        benchmark_bars: list[Bar],
        watchlist_bars: dict[str, list[Bar]],
    ) -> RegimeReading:
        closes = [b.close for b in benchmark_bars]
        evidence: list[Evidence] = []

        # 1 — Price vs 200-day SMA (Faber 2007)
        ma200 = sma(closes, 200)
        if ma200 is not None:
            dist = (closes[-1] / ma200 - 1.0) * 100.0
            sig = 1.0 if dist > 0 else -1.0
            evidence.append(Evidence(
                component="trend_vs_200sma",
                title="Price vs 200-day average",
                value=f"{dist:+.1f}% {'above' if dist > 0 else 'below'}",
                signal=sig,
                claim=(
                    "The benchmark trading above its 200-day average is evidence the "
                    "primary trend is up; below, that it is down."
                ),
                methodology=(
                    "Faber (2007), 'A Quantitative Approach to Tactical Asset "
                    "Allocation' — the 10-month/200-day timing filter."
                ),
                caveat=(
                    "A trend filter, not a forecast: it lags at turning points and "
                    "whipsaws in flat markets. It says where price is, not where it goes."
                ),
                status="bullish" if sig > 0 else "bearish",
            ))
        else:
            evidence.append(_missing(
                "trend_vs_200sma", "Price vs 200-day average",
                "Faber (2007) 200-day timing filter",
                "Needs 200 daily bars of benchmark history.",
            ))

        # 2 — 50-day SMA slope (dual-MA trend structure)
        ma50s = sma_series(closes, 50)
        recent = [v for v in ma50s[-21:] if v is not None]
        if len(recent) >= 21 and recent[0] != 0:
            slope = (recent[-1] / recent[0] - 1.0) * 100.0
            sig = 1.0 if slope > 0.25 else (-1.0 if slope < -0.25 else 0.0)
            evidence.append(Evidence(
                component="ma50_slope",
                title="50-day average slope (1 month)",
                value=f"{slope:+.2f}%",
                signal=sig,
                claim=(
                    "A rising intermediate average is evidence the swing-scale "
                    "trend supports longs."
                ),
                methodology=(
                    "Moving-average trend structure; the family tested in Brock, "
                    "Lakonishok & LeBaron (1992), 'Simple Technical Trading Rules'."
                ),
                caveat=(
                    "Slope thresholds (±0.25%/month) are a readability choice, not an "
                    "optimized parameter. Flat slope is genuine ambiguity, not a buy signal."
                ),
                status="bullish" if sig > 0 else ("bearish" if sig < 0 else "neutral"),
            ))
        else:
            evidence.append(_missing(
                "ma50_slope", "50-day average slope (1 month)",
                "Moving-average trend structure (Brock et al. 1992)",
                "Needs ~70 daily bars of benchmark history.",
            ))

        # 3 — Watchlist breadth: % above own 50-day SMA
        above, counted = 0, 0
        for bars in watchlist_bars.values():
            wc = [b.close for b in bars]
            m = sma(wc, 50)
            if m is not None:
                counted += 1
                if wc[-1] > m:
                    above += 1
        if counted >= 5:
            pct = above / counted * 100.0
            sig = 1.0 if pct >= 60 else (-1.0 if pct <= 40 else 0.0)
            evidence.append(Evidence(
                component="breadth_50sma",
                title="Watchlist breadth",
                value=f"{above}/{counted} above 50-day ({pct:.0f}%)",
                signal=sig,
                claim=(
                    "Broad participation across sectors is evidence a trend is healthy; "
                    "narrow leadership is evidence it is fragile."
                ),
                methodology=(
                    "'Percent of issues above their 50-day moving average' — a standard "
                    "market-breadth gauge from the market-internals family."
                ),
                caveat=(
                    f"Computed over your {counted}-symbol watchlist, not the whole market — "
                    "a proxy for true breadth, and it inherits your watchlist's biases."
                ),
                status="bullish" if sig > 0 else ("bearish" if sig < 0 else "neutral"),
            ))
        else:
            evidence.append(_missing(
                "breadth_50sma", "Watchlist breadth",
                "Percent-above-50-day-MA breadth gauge",
                "Needs 50-day history for at least 5 watchlist symbols.",
            ))

        # 4 — Realized-volatility regime
        lookback = self.config.regime.vol_percentile_lookback
        vol_now = realized_vol_annualized(closes, 20)
        vol_pctile = None
        if vol_now is not None and len(closes) >= lookback + 21:
            history = [
                v for i in range(len(closes) - lookback, len(closes))
                if (v := realized_vol_annualized(closes[: i + 1], 20)) is not None
            ]
            vol_pctile = percentile_rank(history, vol_now)
        if vol_pctile is not None:
            stress = vol_pctile >= 85
            sig = -1.0 if stress else (0.0 if vol_pctile >= 50 else 0.5)
            evidence.append(Evidence(
                component="vol_regime",
                title="Realized volatility (20-day)",
                value=f"{vol_now:.0f}% ann., {vol_pctile:.0f}th percentile of {lookback}d",
                signal=sig,
                claim=(
                    "Volatility clusters: today's high volatility is evidence tomorrow's "
                    "will be high too, and high-vol regimes coincide with drawdowns."
                ),
                methodology=(
                    "Volatility clustering — the empirical regularity behind Engle (1982) "
                    "ARCH and the volatility-regime literature."
                ),
                caveat=(
                    "Realized vol of the benchmark is a proxy; Hermes has no free VIX feed. "
                    "The 85th-percentile stress line is a convention, not a fitted threshold."
                ),
                status="stress" if stress else ("neutral" if vol_pctile >= 50 else "bullish"),
            ))
        else:
            evidence.append(_missing(
                "vol_regime", "Realized volatility (20-day)",
                "Volatility clustering (Engle 1982 line of work)",
                f"Needs ~{lookback + 21} daily bars to place today's vol in its distribution.",
            ))

        # 5 — 12-1 momentum
        if len(closes) >= 252 and closes[-252] != 0 and closes[-21] != 0:
            mom = (closes[-21] / closes[-252] - 1.0) * 100.0
            sig = 1.0 if mom > 0 else -1.0
            evidence.append(Evidence(
                component="momentum_12_1",
                title="12-month momentum (skip last month)",
                value=f"{mom:+.1f}%",
                signal=sig,
                claim=(
                    "Positive trailing-year return (excluding the most recent month) is "
                    "evidence the uptrend persists over swing horizons."
                ),
                methodology=(
                    "Jegadeesh & Titman (1993) cross-sectional momentum; time-series form "
                    "in Moskowitz, Ooi & Pedersen (2012)."
                ),
                caveat=(
                    "Momentum is a statistical tendency with documented crashes at regime "
                    "turns (Daniel & Moskowitz 2016) — exactly when you most want to be right."
                ),
                status="bullish" if sig > 0 else "bearish",
            ))
        else:
            evidence.append(_missing(
                "momentum_12_1", "12-month momentum (skip last month)",
                "Jegadeesh & Titman (1993) momentum",
                "Needs 252 daily bars of benchmark history.",
            ))

        # ── Compose: explicit rules over the votes ────────────────────────
        votes = [e.signal for e in evidence if e.signal is not None]
        available = len(votes)
        score = sum(votes) / available if available else 0.0

        vol_e = next((e for e in evidence if e.component == "vol_regime"), None)
        in_stress = vol_e is not None and vol_e.status == "stress"
        trend_e = next((e for e in evidence if e.component == "trend_vs_200sma"), None)
        trend_down = trend_e is not None and trend_e.signal is not None and trend_e.signal < 0

        if in_stress and (trend_down or score < 0):
            label = RegimeLabel.STRESS
        elif score >= 0.5:
            label = RegimeLabel.BULL_TREND
        elif score <= -0.5:
            label = RegimeLabel.BEAR_TREND
        else:
            label = RegimeLabel.CHOP

        # Confidence = agreement among available components, discounted for
        # missing ones. A heuristic for display, never presented as probability.
        agreement = abs(score)
        coverage = available / len(evidence) if evidence else 0.0
        confidence = round(agreement * coverage, 2)

        latest = benchmark_bars[-1] if benchmark_bars else None
        return RegimeReading(
            ts=utcnow(),
            label=label,
            score=round(score, 3),
            confidence=confidence,
            classifier_version=self.version,
            evidence=evidence,
            data_asof=latest.ts if latest else None,
            data_source=latest.source if latest else "none",
            honesty=HONESTY,
        )
