"""HTTP API — decision support in, decisions out, nothing that touches a broker.

Manual override paths live here too: POST /api/jobs/{name}/run triggers any
scheduled job on demand, because automation you can't override isn't a tool,
it's a liability.

(No `from __future__ import annotations` here: FastAPI must resolve the
closure-local Pydantic models at runtime, and stringified annotations from
that import break the lookup.)
"""

from dataclasses import asdict

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from .. import db
from ..ai.ollama import OllamaClient
from ..config import HermesConfig
from ..data import store
from ..data.models import iso, utcnow
from ..data.provider import MarketDataProvider
from ..jobs import daily_check, runner, scheduler, weekly_review
from ..journal import service as journal
from ..portfolio import review as portfolio_review
from ..regime.engine import latest_reading, reading_history
from ..risk import engine as risk
from ..rs import board as rs_board


def build_router(config: HermesConfig, provider: MarketDataProvider) -> APIRouter:
    r = APIRouter(prefix="/api")

    # ── Dashboard ────────────────────────────────────────────────────────
    @r.get("/dashboard")
    def dashboard() -> dict:
        reading = latest_reading()
        risk_state = risk.evaluate(config)
        posture = (daily_check.derive_posture(risk_state, reading)
                   if reading else {"posture": "unknown",
                                    "why": "No regime reading yet — run the daily check."})
        watch = []
        for symbol in dict.fromkeys([config.market.benchmark, *config.market.watchlist]):
            snap = store.get_snapshot(symbol)
            bars = store.get_bars(symbol, "1Day", limit=60)
            watch.append({
                "symbol": symbol,
                "price": snap.price if snap else None,
                "as_of": iso(snap.ts) if snap else None,
                "source": snap.source if snap else None,
                "staleness": (store.staleness(snap.ts, config.market.stale_after_minutes)
                              if snap else "missing"),
                "series": [{"t": iso(b.ts), "c": b.close} for b in bars],
                "bar_source": bars[-1].source if bars else None,
                "bar_as_of": iso(bars[-1].ts) if bars else None,
            })
        return {
            "generated_at": iso(utcnow()),
            "provider": {"name": provider.name, "state": provider.state().value},
            "regime": _reading_payload(reading),
            "regime_history": [
                {"ts": iso(h.ts), "label": h.label.value, "score": h.score,
                 "confidence": h.confidence,
                 "asof": iso(h.data_asof) if h.data_asof else None}
                for h in reading_history(90)
            ],
            "risk": _risk_payload(risk_state),
            "risk_events": risk.unacknowledged_events(),
            "posture": posture,
            "watchlist": watch,
            "report": daily_check.latest_report(),
            "jobs": scheduler.job_status(config, provider),
        }

    def _reading_payload(reading) -> dict | None:
        if reading is None:
            return None
        return {
            "ts": iso(reading.ts),
            "label": reading.label.value,
            "label_display": reading.label.display,
            "score": reading.score,
            "confidence": reading.confidence,
            "classifier_version": reading.classifier_version,
            "evidence": [asdict(e) for e in reading.evidence],
            "data_asof": iso(reading.data_asof) if reading.data_asof else None,
            "data_source": reading.data_source,
            "honesty": reading.honesty,
        }

    def _risk_payload(state: risk.RiskState) -> dict:
        return {
            "level": state.level,
            "open_risk_pct": state.open_risk_pct,
            "drawdown_pct": state.drawdown_pct,
            "equity_index": state.equity_index,
            "checks": [asdict(c) for c in state.checks],
        }

    # ── Journal ──────────────────────────────────────────────────────────
    class ProposeBody(BaseModel):
        symbol: str = Field(min_length=1, max_length=10)
        side: str = Field(pattern="^(long|short)$")
        entry_price: float = Field(gt=0)
        stop_price: float = Field(gt=0)
        thesis: str = Field(min_length=10)
        sector: str | None = None
        setup_tag: str | None = None
        target_price: float | None = None

    @r.post("/journal/propose")
    def propose(body: ProposeBody) -> dict:
        try:
            return journal.propose_entry(config, **body.model_dump())
        except (journal.JournalError, ValueError) as exc:
            raise HTTPException(422, str(exc)) from exc

    @r.post("/journal/commit")
    def commit(body: ProposeBody) -> dict:
        """Commit takes the same raw parameters as propose and re-runs the
        proposal SERVER-SIDE: the reviewer verdict and the frozen signal state
        are rebuilt at commit time, so neither can be forged by the client nor
        go stale between propose and commit."""
        try:
            proposal = journal.propose_entry(config, **body.model_dump())
            entry_id = journal.commit_entry(config, proposal)
        except (journal.JournalError, ValueError) as exc:
            raise HTTPException(422, str(exc)) from exc
        return {"id": entry_id, "review": proposal["review"],
                "signal_state": proposal["signal_state"]}

    @r.get("/journal")
    def list_journal(status: str | None = None) -> dict:
        return {
            "entries": journal.list_entries(status=status),
            "performance": journal.performance_summary(),
            "stale_open": [e["id"] for e in journal.stale_open_entries(config)],
        }

    class CloseBody(BaseModel):
        exit_price: float = Field(gt=0)
        thesis_played_out: str = Field(pattern="^(yes|partial|no)$")
        resolution_note: str = Field(min_length=5)

    @r.post("/journal/{entry_id}/close")
    def close(entry_id: int, body: CloseBody) -> dict:
        try:
            return journal.close_entry(config, entry_id, **body.model_dump())
        except journal.JournalError as exc:
            raise HTTPException(422, str(exc)) from exc

    # ── Risk ─────────────────────────────────────────────────────────────
    @r.get("/risk")
    def risk_detail() -> dict:
        return _risk_payload(risk.evaluate(config))

    @r.post("/risk/events/{event_id}/ack")
    def ack_event(event_id: int) -> dict:
        if not risk.acknowledge_event(event_id):
            raise HTTPException(404, f"No risk event #{event_id}")
        return {"acknowledged": event_id}

    # ── RS leadership board ──────────────────────────────────────────────
    @r.get("/rs/board")
    def rs_leadership() -> dict:
        """Watchlist ranked by Mansfield relative strength vs the benchmark,
        verdicts read against the current regime. Recommends which names earn
        a review first — never a trade."""
        b = rs_board.build_board(config)
        return {
            "generated_at": iso(b.ts),
            "asof": iso(b.benchmark_asof) if b.benchmark_asof else None,
            "benchmark": b.benchmark,
            "benchmark_source": b.benchmark_source,
            "regime": {
                "label": b.regime_label.value if b.regime_label else None,
                "label_display": b.regime_label.display if b.regime_label else None,
                "asof": iso(b.regime_asof) if b.regime_asof else None,
                "classifier_version": b.regime_version,
                "capped": b.capped,
            },
            "rows": [
                {
                    "symbol": row.symbol, "status": row.status,
                    "verdict": row.verdict, "mansfield": row.mansfield,
                    "slope3": row.slope3, "rs": row.rs,
                    "rs_new_high": row.rs_new_high, "rs_new_low": row.rs_new_low,
                    "bars_overlap": row.bars_overlap, "note": row.note,
                    "source": row.source,
                    "as_of": iso(row.as_of) if row.as_of else None,
                    "staleness": row.staleness,
                }
                for row in b.rows
            ],
            "honesty": {
                "claim": b.claim,
                "methodology": b.methodology,
                "caveat": b.caveat,
            },
        }

    # ── Weekly portfolio review ──────────────────────────────────────────
    @r.get("/reports/weekly")
    def weekly_report() -> dict:
        """The latest stored weekly portfolio review. Returns a null-bodied
        shape (honesty block still present) before the first run — the manual
        trigger is POST /api/jobs/weekly_review/run."""
        honesty = {
            "claim": portfolio_review.CLAIM,
            "methodology": portfolio_review.METHODOLOGY,
            "caveat": portfolio_review.CAVEAT,
        }
        rpt = weekly_review.latest_weekly_review()
        if rpt is None:
            return {"generated_at": None, "body_md": None, "meta": {}, "honesty": honesty}
        return {
            "generated_at": rpt["ts"],
            "body_md": rpt["body_md"],
            "meta": rpt["meta"],
            "honesty": honesty,
        }

    # ── Jobs: observability + manual override ───────────────────────────
    @r.get("/jobs")
    def jobs() -> list[dict]:
        return scheduler.job_status(config, provider)

    @r.post("/jobs/{name}/run")
    def run_now(name: str) -> dict:
        defs = scheduler.job_definitions(config, provider)
        if name not in defs:
            raise HTTPException(404, f"No job named {name!r}; known: {sorted(defs)}")
        _spec, fn = defs[name]
        try:
            return runner.run_job(name, fn, trigger="manual")
        except Exception as exc:
            # The failure is already recorded in job_runs; surface it raw.
            raise HTTPException(502, f"{name} failed: {exc}") from exc

    # ── Health: positive evidence only ───────────────────────────────────
    @r.get("/health")
    def health() -> dict:
        conn = db.connect()
        # Positive evidence of WRITABILITY, not just reachability: acquiring
        # a reserved write lock fails on a read-only database file.
        try:
            conn.execute("BEGIN IMMEDIATE")
            conn.rollback()
            db_ok = True
        except Exception:
            db_ok = False
        bar_count = conn.execute("SELECT COUNT(*) FROM bars").fetchone()[0]
        return {
            "time": iso(utcnow()),
            "db": {"writable": db_ok, "bars_cached": bar_count},
            "provider": {"name": provider.name, "state": provider.state().value},
            "ollama": {"available": OllamaClient(config).available(),
                       "url": config.ai.ollama_url},
            "jobs": [{"job": s["job"], "missed": s["missed"],
                      "last_outcome": (s["last_run"] or {}).get("outcome")}
                     for s in scheduler.job_status(config, provider)],
        }

    return r
