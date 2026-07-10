"""The daily market check — Hermes' core workflow.

Modeled on Pattern A's market-regime-daily (tradermonty/claude-trading-skills):
a ~15-minute-of-value morning read whose output is a POSTURE — allow,
restrict, or cash-priority — not a directive. Hermes computes; the human
decides. Steps, each observable:

  1. sync bars + snapshots from the provider (degradation is visible)
  2. classify the regime and persist the reading with its evidence
  3. run the full risk sweep — risk outranks signal, so a breach leads the report
  4. derive the posture from risk state first, regime second
  5. compose the morning report (every number carries source + as-of)
  6. optionally add an AI narrative via the local-first AIRouter (cloud only
     when allowed; both down → section says so — never silently missing)
"""

from __future__ import annotations

import json

from .. import db
from ..ai.router import AIRouter
from ..config import HermesConfig
from ..data import store
from ..data.models import iso, utcnow
from ..data.provider import MarketDataProvider
from ..regime.engine import build_classifier, store_reading
from ..regime.models import RegimeLabel, RegimeReading
from ..risk.engine import RiskState, evaluate
from . import sync


def derive_posture(risk_state: RiskState, reading: RegimeReading) -> dict:
    """Risk first, regime second — the risk layer outranks the signal layer."""
    if risk_state.level == "breach":
        return {
            "posture": "cash-priority",
            "why": "A risk limit is breached. No new risk until the breach is "
                   "resolved and acknowledged — regime does not override risk.",
        }
    if reading.label in (RegimeLabel.BEAR_TREND, RegimeLabel.STRESS):
        return {
            "posture": "cash-priority",
            "why": f"Regime reads {reading.label.display}: swing longs are "
                   "fighting the tape. Capital preservation is the trade.",
        }
    if risk_state.level == "warn" or reading.label == RegimeLabel.CHOP:
        return {
            "posture": "restrict",
            "why": "Elevated risk usage or a rangebound tape: A-grade setups "
                   "only, reduced size, no new correlated exposure.",
        }
    return {
        "posture": "allow",
        "why": f"Regime reads {reading.label.display} with no risk flags: "
               "normal position sizing per the fixed-fractional rules.",
    }


def compose_report(
    config: HermesConfig,
    reading: RegimeReading,
    risk_state: RiskState,
    posture: dict,
    sync_detail: str,
) -> str:
    lines: list[str] = []
    now = utcnow()
    lines.append(f"# Daily market check — {now.strftime('%Y-%m-%d')}")
    lines.append("")

    # Risk leads. Always.
    lines.append(f"## Risk: {risk_state.level.upper()}")
    for c in risk_state.checks:
        flag = {"ok": "·", "warn": "▲", "breach": "■"}[c.level]
        lines.append(f"- {flag} **{c.kind}** — {c.observed} (limit: {c.limit})")
    lines.append("")

    lines.append(f"## Posture: {posture['posture'].upper()}")
    lines.append(posture["why"])
    lines.append("")

    asof = iso(reading.data_asof) if reading.data_asof else "unknown"
    lines.append(
        f"## Regime: {reading.label.display} "
        f"(score {reading.score:+.2f}, confidence {reading.confidence:.2f})"
    )
    lines.append(f"*Classifier {reading.classifier_version} · data as of {asof} · "
                 f"source {reading.data_source}*")
    for e in reading.evidence:
        lines.append(f"- **{e.title}**: {e.value} — {e.claim}")
    lines.append("")
    lines.append(f"> {reading.honesty}")
    lines.append("")

    lines.append("## Data")
    lines.append(f"- Sync: {sync_detail}")
    lines.append(f"- Benchmark: {config.market.benchmark} · "
                 f"watchlist {len(config.market.watchlist)} symbols")
    return "\n".join(lines)


def daily_check(config: HermesConfig, provider: MarketDataProvider) -> str:
    # 1 — data first; a partial sync aborts the check loudly rather than
    # classifying a regime from silently incomplete data.
    sync_detail = sync.sync_bars(config, provider)
    snap_detail = sync.sync_snapshots(config, provider)

    # 2 — regime on the configured primary timeframe (default 1Day; C2 multi-TF
    # comparison lives on GET /api/regime/multi-tf and does not replace this).
    primary_tf = getattr(config.regime, "primary_timeframe", "1Day") or "1Day"
    classifier = build_classifier(config)
    benchmark_bars = store.get_bars(config.market.benchmark, primary_tf, limit=600)
    watchlist_bars = {
        s: store.get_bars(s, primary_tf, limit=120) for s in config.market.watchlist
    }
    reading = classifier.classify(benchmark_bars, watchlist_bars)
    store_reading(reading)

    # 3 — risk sweep (persists warn/breach events as a side effect)
    risk_state = evaluate(config)

    # 4 — posture
    posture = derive_posture(risk_state, reading)

    # 5 — report
    body = compose_report(config, reading, risk_state, posture,
                          f"{sync_detail}; {snap_detail}")

    # 6 — narrative via AIRouter (local-first; cloud only when allow_cloud)
    narrative_source = "none"
    res = AIRouter(config).complete("narrate_daily_check", facts_md=body)
    if res.status == "ok" and res.text:
        body += f"\n\n## Narrative ({res.backend or 'model'})\n{res.text}"
        narrative_source = f"{res.backend}:{res.model}" if res.backend else "ok"
        if res.note:
            body += f"\n\n*{res.note}*"
    else:
        body += (
            "\n\n## Narrative\n"
            f"*Unavailable — {res.note}. The numbers above are complete without it.*"
        )
        narrative_source = "unavailable"

    conn = db.connect()
    conn.execute(
        "INSERT INTO reports (ts, kind, body_md, meta_json) VALUES (?, ?, ?, ?)",
        (iso(utcnow()), "daily_check", body, json.dumps({
            "regime": reading.label.value,
            "risk_level": risk_state.level,
            "posture": posture["posture"],
            "narrative_source": narrative_source,
        })),
    )
    conn.commit()
    return (f"regime={reading.label.value} risk={risk_state.level} "
            f"posture={posture['posture']}")


def latest_report() -> dict | None:
    r = db.connect().execute(
        "SELECT * FROM reports WHERE kind='daily_check' ORDER BY ts DESC LIMIT 1"
    ).fetchone()
    if not r:
        return None
    out = dict(r)
    out["meta"] = json.loads(out.pop("meta_json") or "{}")
    return out
