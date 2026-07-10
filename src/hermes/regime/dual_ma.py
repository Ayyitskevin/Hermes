"""dual-ma-v1 — a third-opinion classifier (C8).

A deliberately simple dual moving-average + realized-vol regime labeler.
NOT a fitted ML model, NOT a backtested edge, NOT a replacement for v62.
Ships so Regime Lab / multi-TF can show a transparent second structure when
the operator wants more than v62 vs reference-v1.
"""

from __future__ import annotations

from ..config import HermesConfig
from ..data.models import Bar, utcnow
from .indicators import realized_vol_annualized, sma
from .models import Evidence, RegimeLabel, RegimeReading

VERSION = "dual-ma-v1"

HONESTY = (
    "dual-ma-v1 is a transparent dual moving-average + vol heuristic "
    "(fast 50 / slow 200, vol percentile proxy). It is a teaching second "
    "opinion — not Regime Label v6.2, not a machine-learned edge, and not "
    "validated as a trade filter."
)


class DualMAClassifier:
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
        fast = sma(closes, 50)
        slow = sma(closes, 200)
        if fast is None or slow is None or len(closes) < 60:
            return RegimeReading(
                ts=utcnow(),
                label=RegimeLabel.CHOP,
                score=0.0,
                confidence=0.0,
                classifier_version=VERSION,
                evidence=[Evidence(
                    component="dual_ma",
                    title="Dual MA stack",
                    value="∅ missing",
                    signal=None,
                    claim="No claim — insufficient history.",
                    methodology="50/200 SMA cross structure",
                    caveat="Need ≥200 bars.",
                    status="missing",
                )],
                data_asof=benchmark_bars[-1].ts if benchmark_bars else None,
                data_source=benchmark_bars[-1].source if benchmark_bars else "none",
                honesty=HONESTY,
            )

        dist = (fast / slow - 1.0) * 100.0
        stack_sig = 1.0 if fast > slow else -1.0
        evidence.append(Evidence(
            component="dual_ma",
            title="50 vs 200-day average",
            value=f"fast {dist:+.1f}% vs slow",
            signal=stack_sig,
            claim=(
                "Fast average above slow is evidence of intermediate uptrend "
                "structure (classic dual-MA family)."
            ),
            methodology="Simple dual SMA (50/200) — Brock et al. family of tests",
            caveat="Dual-MA rules are well-studied and often weak after costs.",
            status="ok",
        ))

        vol = realized_vol_annualized(closes, 20)
        # crude high-vol flag vs 60-bar median of rolling 20d vol
        vols = []
        for i in range(20, len(closes)):
            v = realized_vol_annualized(closes[: i + 1], 20)
            if v is not None:
                vols.append(v)
        med = sorted(vols)[len(vols) // 2] if vols else None
        high_vol = vol is not None and med is not None and vol > 1.4 * med
        evidence.append(Evidence(
            component="vol_regime",
            title="Short-horizon realized vol",
            value=(
                f"{vol:.1%} ann." if vol is not None else "∅ missing"
            ) + (f" vs median {med:.1%}" if med is not None else ""),
            signal=-1.0 if high_vol else 0.5,
            claim="Elevated realized vol is evidence of a stress-prone tape.",
            methodology="20-day realized vol vs its recent median",
            caveat="Not a GARCH model; not predictive of the next move.",
            status="ok" if vol is not None else "missing",
        ))

        if high_vol and stack_sig < 0:
            label, score = RegimeLabel.STRESS, -0.9
        elif stack_sig > 0 and not high_vol:
            label, score = RegimeLabel.BULL_TREND, 0.7
        elif stack_sig < 0:
            label, score = RegimeLabel.BEAR_TREND, -0.6
        else:
            label, score = RegimeLabel.CHOP, 0.0

        conf = 0.55 if not high_vol else 0.4
        return RegimeReading(
            ts=utcnow(),
            label=label,
            score=score,
            confidence=conf,
            classifier_version=VERSION,
            evidence=evidence,
            data_asof=benchmark_bars[-1].ts,
            data_source=benchmark_bars[-1].source,
            honesty=HONESTY,
        )
