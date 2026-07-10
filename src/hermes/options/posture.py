"""Options posture worksheet — decision-support without an options feed.

Hermes has no options chain. This surface grades whether the UNDERLYING's
regime, vol context, and risk state make *defined-risk thinking* relevant —
never a strike recommendation, never a multi-leg order.
"""

from __future__ import annotations

from ..config import HermesConfig
from ..data import store
from ..data.models import iso, utcnow
from ..regime.engine import latest_reading
from ..regime.indicators import realized_vol_annualized, sma
from ..regime.models import RegimeLabel
from ..risk import engine as risk

CLAIM = (
    "States whether the book and underlying context invite defined-risk "
    "thinking (options as risk shape) — not which strike to buy."
)
METHODOLOGY = (
    "Uses cached equity bars (realized vol, MA stack) + current risk level + "
    "regime label. No options chain, no IV surface, no Greeks."
)
CAVEAT = (
    "Without a chain this cannot size a debit/credit or check open interest. "
    "Any option still requires a human broker ticket. Not financial advice."
)


def build_options_posture(config: HermesConfig, symbol: str) -> dict:
    symbol = symbol.upper()
    bars = store.get_bars(symbol, "1Day", limit=260)
    reading = latest_reading()
    risk_state = risk.evaluate(config)
    closes = [b.close for b in bars]
    vol20 = realized_vol_annualized(closes, 20) if len(closes) >= 21 else None
    ma50 = sma(closes, 50)
    ma200 = sma(closes, 200)
    last = bars[-1] if bars else None

    factors = []
    score = 0
    if reading and reading.label == RegimeLabel.BULL_TREND:
        factors.append({"key": "regime", "ok": True, "detail": "bull_trend — long bias context"})
        score += 1
    elif reading and reading.label in (RegimeLabel.BEAR_TREND, RegimeLabel.STRESS):
        factors.append({
            "key": "regime", "ok": False,
            "detail": f"{reading.label.value} — defined-risk / hedge thinking may matter more than naked long",
        })
    else:
        factors.append({"key": "regime", "ok": None, "detail": "regime chop/missing — no directional lean"})

    if risk_state.level == "breach":
        factors.append({
            "key": "risk", "ok": False,
            "detail": "risk BREACH — cash-priority outranks any options idea",
        })
        score -= 2
    elif risk_state.level == "warn":
        factors.append({"key": "risk", "ok": False, "detail": "risk WARN — reduce novelty"})
        score -= 1
    else:
        factors.append({"key": "risk", "ok": True, "detail": "risk ok"})
        score += 1

    if vol20 is not None and vol20 > 0.35:
        factors.append({
            "key": "vol", "ok": True,
            "detail": f"realized vol ~{vol20:.0%} — premium/hedge conversations are live (still no chain)",
        })
        score += 1
    elif vol20 is not None:
        factors.append({
            "key": "vol", "ok": None,
            "detail": f"realized vol ~{vol20:.0%} — calm tape; options are optional, not required",
        })
    else:
        factors.append({"key": "vol", "ok": None, "detail": "∅ vol missing"})

    if ma50 and ma200:
        factors.append({
            "key": "structure",
            "ok": ma50 > ma200,
            "detail": (
                "50>200 stack intact" if ma50 > ma200 else "50<200 — uptrend structure broken"
            ),
        })
        score += 1 if ma50 > ma200 else 0

    if score >= 3 and risk_state.level == "ok":
        posture = "ALLOW_RESEARCH"
        why = "Context supports researching defined-risk expressions — still not a ticket."
    elif risk_state.level == "breach":
        posture = "RESTRICT"
        why = "Risk breach — no new risk, options included."
    else:
        posture = "WATCH"
        why = "Mixed context; options research is optional and secondary to equity plan."

    return {
        "generated_at": iso(utcnow()),
        "symbol": symbol,
        "posture": posture,
        "why": why,
        "score": score,
        "factors": factors,
        "underlying": {
            "price": last.close if last else None,
            "as_of": iso(last.ts) if last else None,
            "source": last.source if last else None,
            "vol20_ann": round(vol20, 3) if vol20 is not None else None,
            "ma50": round(ma50, 2) if ma50 else None,
            "ma200": round(ma200, 2) if ma200 else None,
        },
        "regime": {
            "label": reading.label.value if reading else None,
            "display": reading.label.display if reading else None,
        },
        "risk_level": risk_state.level,
        "honesty": {"claim": CLAIM, "methodology": METHODOLOGY, "caveat": CAVEAT},
    }
