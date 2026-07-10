"""Premarket one-screen briefing — attention, not a new analysis engine.

Composes posture + regime + open risk + RS leaders/laggards + screener
PASS/NEAR + stale journal + MISSED jobs into one artifact for a ~90s open.
"""

from __future__ import annotations

from ..config import HermesConfig
from ..data.models import iso, utcnow
from ..jobs import daily_check, scheduler
from ..journal import service as journal
from ..regime.engine import latest_reading
from ..risk import engine as risk
from ..rs import board as rs_board
from ..screener import trend_template as screener


def build_briefing(config: HermesConfig, provider) -> dict:
    reading = latest_reading()
    risk_state = risk.evaluate(config)
    posture = (
        daily_check.derive_posture(risk_state, reading)
        if reading
        else {"posture": "unknown", "why": "No regime reading yet — run the daily check."}
    )
    board = rs_board.build_board(config)
    screen = screener.build_screen(config)
    jobs = scheduler.job_status(config, provider)
    stale = journal.stale_open_entries(config)
    open_entries = journal.list_entries(status="open")
    perf = journal.performance_summary()
    report = daily_check.latest_report()

    leaders = [
        {"symbol": r.symbol, "verdict": r.verdict, "mansfield": r.mansfield}
        for r in board.rows
        if r.status == "ok" and r.verdict in ("LONG-OK", "HI-CONV", "LEADER")
    ][:8]
    # Fall back to top positive Mansfield if verdict vocabulary differs.
    if not leaders:
        leaders = [
            {"symbol": r.symbol, "verdict": r.verdict, "mansfield": r.mansfield}
            for r in board.rows
            if r.status == "ok" and (r.mansfield or 0) > 0
        ][:5]
    laggards = [
        {"symbol": r.symbol, "verdict": r.verdict, "mansfield": r.mansfield}
        for r in board.rows
        if r.status == "ok" and (r.verdict in ("SKIP-LAG", "LAGGARD") or (r.mansfield or 0) < 0)
    ][:5]
    candidates = [
        {
            "symbol": r.symbol,
            "verdict": r.verdict,
            "score": r.score,
            "compression": getattr(r, "compression", None),
            "regime_note": r.regime_note,
        }
        for r in screen.rows
        if r.status == "ok" and r.verdict in ("PASS", "NEAR")
    ][:10]
    missed = [j for j in jobs if j.get("missed")]

    md_lines = [
        f"# Premarket briefing — {iso(utcnow())[:10]}",
        "",
        f"## Posture: {(posture.get('posture') or 'unknown').upper()}",
        posture.get("why", ""),
        "",
        f"## Risk: {risk_state.level.upper()} · open risk {risk_state.open_risk_pct:.2f}% · "
        f"DD {risk_state.drawdown_pct:.1f}% · index {risk_state.equity_index:.1f}",
        "",
    ]
    if reading:
        md_lines += [
            f"## Regime: {reading.label.display} "
            f"(score {reading.score:+.2f}, conf {reading.confidence:.2f})",
            f"*{reading.classifier_version} · as-of "
            f"{iso(reading.data_asof) if reading.data_asof else '∅'} · {reading.data_source}*",
            "",
        ]
    else:
        md_lines += ["## Regime: ∅ missing — run daily check", ""]

    md_lines.append("## Leadership (RS)")
    if leaders:
        for L in leaders:
            md_lines.append(f"- {L['symbol']} {L['verdict']} Mansfield {L['mansfield']}")
    else:
        md_lines.append("- ∅ none ranked")
    md_lines.append("")
    md_lines.append("## Laggards")
    if laggards:
        for L in laggards:
            md_lines.append(f"- {L['symbol']} {L['verdict']} Mansfield {L['mansfield']}")
    else:
        md_lines.append("- ∅ none")
    md_lines.append("")
    md_lines.append("## Screener candidates (PASS/NEAR)")
    if candidates:
        for c in candidates:
            comp = c.get("compression") or {}
            flag = f" · VCP-ish {comp.get('flag')}" if comp and comp.get("flag") else ""
            md_lines.append(f"- {c['symbol']} {c['verdict']} {c['score']}/8{flag}")
    else:
        md_lines.append("- ∅ no PASS/NEAR on the field")
    md_lines.append("")
    md_lines.append(
        f"## Journal: {len(open_entries)} open · {len(stale)} stale · "
        f"{perf.get('closed_trades', 0)} closed resolved"
    )
    if perf.get("note"):
        md_lines.append(f"*{perf['note']}*")
    md_lines.append("")
    if missed:
        md_lines.append("## Jobs MISSED")
        for j in missed:
            md_lines.append(f"- ■ {j.get('name') or j.get('job')}")
    else:
        md_lines.append("## Jobs: no MISSED flags")
    md_lines.append("")
    md_lines.append(
        "> Posture is context, not a directive. Every trade is placed by a human."
    )

    return {
        "generated_at": iso(utcnow()),
        "posture": posture,
        "regime": {
            "label": reading.label.value if reading else None,
            "label_display": reading.label.display if reading else None,
            "score": reading.score if reading else None,
            "confidence": reading.confidence if reading else None,
            "classifier_version": reading.classifier_version if reading else None,
            "as_of": iso(reading.data_asof) if reading and reading.data_asof else None,
            "source": reading.data_source if reading else None,
        },
        "risk": {
            "level": risk_state.level,
            "open_risk_pct": risk_state.open_risk_pct,
            "drawdown_pct": risk_state.drawdown_pct,
            "equity_index": risk_state.equity_index,
            "checks": [
                {"kind": c.kind, "level": c.level, "observed": c.observed, "limit": c.limit}
                for c in risk_state.checks
            ],
        },
        "leaders": leaders,
        "laggards": laggards,
        "candidates": candidates,
        "journal": {
            "open": len(open_entries),
            "stale_open": len(stale),
            "closed_resolved": perf.get("closed_trades", 0),
            "habit_gate": 20,
            "habit_status": (
                "PASS" if (perf.get("closed_trades") or 0) >= 20 else "OPEN"
            ),
            "note": perf.get("note", ""),
        },
        "jobs_missed": [
            j.get("name") or j.get("job") for j in missed
        ],
        "jobs": jobs,
        "latest_daily_report_ts": report["ts"] if report else None,
        "body_md": "\n".join(md_lines),
        "honesty": {
            "claim": (
                "One-screen composition of already-computed desk surfaces for a "
                "fast premarket read — not a new measurement."
            ),
            "caveat": (
                "Leaders/candidates are screening context only. Posture is not a "
                "directive. Small journal samples remain anecdote-grade."
            ),
        },
    }
