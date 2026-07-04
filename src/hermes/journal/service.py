"""Trade journal — the memory that grades itself against reality.

Every entry freezes three things at the moment of entry: the thesis, the
regime signal state, and the planned risk. Closing a trade is not the end of
its record: resolution computes realized return, benchmark return over the
same holding period, alpha versus that benchmark, and demands an answer to
the harder question — did the THESIS play out, not just the P&L?

Pattern credit: the resolve-against-reality loop is modeled on the decision
log in TauricResearch/TradingAgents and the Trade Memory tier of
tradermonty/claude-trading-skills.
"""

from __future__ import annotations

import json
from dataclasses import asdict

from .. import db
from ..config import HermesConfig
from ..data.models import iso, parse_iso, utcnow
from ..regime.engine import latest_reading
from ..review.reviewer import review_entry
from ..risk.engine import size_position


class JournalError(Exception):
    pass


def propose_entry(
    config: HermesConfig,
    *,
    symbol: str,
    side: str,
    entry_price: float,
    stop_price: float,
    thesis: str,
    sector: str | None = None,
    setup_tag: str | None = None,
    target_price: float | None = None,
) -> dict:
    """Stage 1 of 2: compute suggested sizing and run the reviewer second
    pass. Returns the full proposal (sizing + review verdict + frozen signal
    state) WITHOUT writing anything — the human decides whether to commit."""
    if not thesis or not thesis.strip():
        raise JournalError("A thesis is required — 'it looks strong' is not a thesis.")

    sizing = size_position(config, entry_price, stop_price, side)
    reading = latest_reading()
    review = review_entry(
        config,
        symbol=symbol, side=side, entry_price=entry_price, stop_price=stop_price,
        thesis=thesis, setup_tag=setup_tag, sizing=sizing, reading=reading,
    )
    return {
        "symbol": symbol.upper(),
        "side": side,
        "sector": sector,
        "setup_tag": setup_tag,
        "entry_price": entry_price,
        "stop_price": stop_price,
        "target_price": target_price,
        "thesis": thesis.strip(),
        "sizing": asdict(sizing),
        "review": review,
        "signal_state": {
            "label": reading.label.value if reading else None,
            "score": reading.score if reading else None,
            "confidence": reading.confidence if reading else None,
            "classifier_version": reading.classifier_version if reading else None,
            "as_of": iso(reading.ts) if reading else None,
        },
    }


def commit_entry(config: HermesConfig, proposal: dict) -> int:
    """Stage 2: write the journal row. The reviewer verdict travels with the
    entry forever — including a verdict the human chose to override."""
    sizing = proposal["sizing"]
    conn = db.connect()
    cur = conn.execute(
        """INSERT INTO journal_entries
           (symbol, side, sector, setup_tag, opened_at, entry_price, stop_price,
            target_price, size_pct_equity, planned_risk_pct, thesis, signal_json,
            review_json)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            proposal["symbol"], proposal["side"], proposal.get("sector"),
            proposal.get("setup_tag"), iso(utcnow()), proposal["entry_price"],
            proposal["stop_price"], proposal.get("target_price"),
            sizing["size_pct_equity"], sizing["planned_risk_pct"],
            proposal["thesis"], json.dumps(proposal["signal_state"]),
            json.dumps(proposal["review"]),
        ),
    )
    conn.commit()
    return int(cur.lastrowid)


def _benchmark_return(config: HermesConfig, start_iso: str, end_iso: str) -> float | None:
    """Benchmark close-to-close return between two timestamps, from cached
    bars. None (shown as missing) when history is absent — never guessed."""
    conn = db.connect()
    row_start = conn.execute(
        """SELECT close FROM bars WHERE symbol=? AND timeframe='1Day' AND ts<=?
           ORDER BY ts DESC LIMIT 1""",
        (config.market.benchmark, start_iso),
    ).fetchone()
    row_end = conn.execute(
        """SELECT close FROM bars WHERE symbol=? AND timeframe='1Day' AND ts<=?
           ORDER BY ts DESC LIMIT 1""",
        (config.market.benchmark, end_iso),
    ).fetchone()
    if not row_start or not row_end or row_start["close"] == 0:
        return None
    return (row_end["close"] / row_start["close"] - 1.0) * 100.0


def close_entry(
    config: HermesConfig,
    entry_id: int,
    *,
    exit_price: float,
    thesis_played_out: str,
    resolution_note: str,
) -> dict:
    """Close and resolve in one motion. Requires the thesis verdict — a trade
    is not resolved by its P&L alone."""
    if thesis_played_out not in ("yes", "partial", "no"):
        raise JournalError("thesis_played_out must be yes / partial / no")
    if not resolution_note or not resolution_note.strip():
        raise JournalError(
            "A resolution note is required: what actually happened vs the thesis?"
        )

    conn = db.connect()
    row = conn.execute(
        "SELECT * FROM journal_entries WHERE id=?", (entry_id,)
    ).fetchone()
    if not row:
        raise JournalError(f"No journal entry #{entry_id}")
    if row["status"] == "closed":
        raise JournalError(f"Entry #{entry_id} is already closed")

    direction = 1.0 if row["side"] == "long" else -1.0
    realized = (exit_price / row["entry_price"] - 1.0) * 100.0 * direction
    closed_at = iso(utcnow())
    bench = _benchmark_return(config, row["opened_at"], closed_at)
    alpha = realized - bench if bench is not None else None

    conn.execute(
        """UPDATE journal_entries SET
             status='closed', closed_at=?, exit_price=?, realized_return_pct=?,
             benchmark_return_pct=?, alpha_pct=?, thesis_played_out=?, resolution_note=?
           WHERE id=?""",
        (closed_at, exit_price, round(realized, 3),
         round(bench, 3) if bench is not None else None,
         round(alpha, 3) if alpha is not None else None,
         thesis_played_out, resolution_note.strip(), entry_id),
    )

    # Move the normalized equity index by the position-weighted realized return.
    size_frac = (row["size_pct_equity"] or 0.0) / 100.0
    prev = conn.execute(
        "SELECT value FROM equity_index ORDER BY ts DESC, id DESC LIMIT 1"
    ).fetchone()
    prev_value = prev["value"] if prev else 100.0
    new_value = prev_value * (1.0 + realized / 100.0 * size_frac)
    conn.execute(
        "INSERT INTO equity_index (ts, value, cause) VALUES (?, ?, ?)",
        (closed_at, round(new_value, 4), f"journal_close:{entry_id}"),
    )
    conn.commit()

    return {
        "id": entry_id,
        "realized_return_pct": round(realized, 3),
        "benchmark_return_pct": round(bench, 3) if bench is not None else None,
        "alpha_pct": round(alpha, 3) if alpha is not None else None,
        "thesis_played_out": thesis_played_out,
        "equity_index": round(new_value, 4),
    }


def list_entries(status: str | None = None, limit: int = 200) -> list[dict]:
    conn = db.connect()
    if status:
        rows = conn.execute(
            "SELECT * FROM journal_entries WHERE status=? ORDER BY opened_at DESC LIMIT ?",
            (status, limit),
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT * FROM journal_entries ORDER BY opened_at DESC LIMIT ?", (limit,)
        ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["signal_state"] = json.loads(d.pop("signal_json") or "null")
        d["review"] = json.loads(d.pop("review_json") or "null")
        out.append(d)
    return out


def stale_open_entries(config: HermesConfig) -> list[dict]:
    """Open trades older than the configured staleness window — the journal
    nags about theses left unexamined, because unresolved is unlearned."""
    cutoff_days = config.journal.stale_open_after_days
    now = utcnow()
    out = []
    for e in list_entries(status="open"):
        age_days = (now - parse_iso(e["opened_at"])).days
        if age_days >= cutoff_days:
            e["age_days"] = age_days
            out.append(e)
    return out


def performance_summary() -> dict:
    """Aggregates the journal grades itself by: win rate, thesis accuracy,
    average alpha. Small-sample honesty: below 20 closed trades these are
    anecdotes, and the payload says so."""
    closed = list_entries(status="closed")
    n = len(closed)
    if n == 0:
        return {"closed_trades": 0, "note": "No closed trades yet — nothing to grade."}
    wins = sum(1 for e in closed if (e["realized_return_pct"] or 0) > 0)
    thesis_yes = sum(1 for e in closed if e["thesis_played_out"] == "yes")
    alphas = [e["alpha_pct"] for e in closed if e["alpha_pct"] is not None]
    return {
        "closed_trades": n,
        "win_rate_pct": round(wins / n * 100.0, 1),
        "thesis_hit_rate_pct": round(thesis_yes / n * 100.0, 1),
        "avg_alpha_pct": round(sum(alphas) / len(alphas), 2) if alphas else None,
        "alpha_sample": len(alphas),
        "note": (
            "Sample below 20 closed trades: treat every statistic here as an "
            "anecdote, not an edge." if n < 20 else ""
        ),
    }
