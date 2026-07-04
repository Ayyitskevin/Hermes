"""Regime types.

A RegimeReading is not just a label and a color: it carries the evidence that
produced it — each component's claim, the named methodology behind the claim,
and an explicit caveat about what the component does NOT prove. The dashboard
renders that evidence in place (the teach-in requirement): a label you can
open and interrogate without leaving the page.
"""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime
from enum import StrEnum


class RegimeLabel(StrEnum):
    BULL_TREND = "bull_trend"
    BEAR_TREND = "bear_trend"
    CHOP = "chop"
    STRESS = "stress"

    @property
    def display(self) -> str:
        return {
            RegimeLabel.BULL_TREND: "Bull trend",
            RegimeLabel.BEAR_TREND: "Bear trend",
            RegimeLabel.CHOP: "Rangebound",
            RegimeLabel.STRESS: "Stress",
        }[self]


@dataclass(frozen=True)
class Evidence:
    """One component's contribution, in language a self-taught trader can
    interrogate: what it measured, what that claims, where the method comes
    from, and what it does not prove."""

    component: str          # machine key, e.g. 'trend_vs_200sma'
    title: str              # human name, e.g. 'Price vs 200-day average'
    value: str              # formatted observation, e.g. '+4.2% above'
    signal: float | None    # vote in [-1, +1]; None when data was missing
    claim: str              # what this observation is evidence FOR
    methodology: str        # the named, citable method it draws from
    caveat: str             # what it does NOT prove — always present
    status: str             # 'bullish' | 'bearish' | 'neutral' | 'stress' | 'missing'


@dataclass(frozen=True)
class RegimeReading:
    ts: datetime
    label: RegimeLabel
    score: float            # composite in [-1, +1]
    confidence: float       # component agreement in [0, 1] — a heuristic, not a probability
    classifier_version: str
    evidence: list[Evidence] = field(default_factory=list)
    data_asof: datetime | None = None
    data_source: str = ""
    honesty: str = ""       # the classifier's own statement of its epistemic status

    def evidence_json(self) -> str:
        return json.dumps([asdict(e) for e in self.evidence])
