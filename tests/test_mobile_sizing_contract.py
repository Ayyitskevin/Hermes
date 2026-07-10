"""Shared CPython oracle for the mobile fixed-fractional sizing port."""

from __future__ import annotations

import json
from dataclasses import replace
from pathlib import Path

import pytest

from hermes.risk.engine import size_position

FIXTURE = json.loads(
    (Path(__file__).parent.parent / "contracts" / "fixtures" / "risk" / "sizing.json")
    .read_text(encoding="utf-8")
)


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda case: case["id"])
def test_mobile_sizing_fixture_matches_python_oracle(case, config):
    values = case["input"]
    expected = case["expected"]
    risk = replace(
        config.risk,
        max_risk_per_trade_pct=values["maxRiskPerTradePct"],
        max_position_size_pct=values["maxPositionSizePct"],
    )
    configured = replace(config, risk=risk)

    result = size_position(
        configured,
        entry_price=values["entryPrice"],
        stop_price=values["stopPrice"],
        side=values["side"],
    )

    assert result.size_pct_equity == expected["sizePctEquity"]
    assert result.planned_risk_pct == expected["plannedRiskPct"]
    assert result.stop_distance_pct == expected["stopDistancePct"]
    assert result.capped_by == expected["cappedBy"]
