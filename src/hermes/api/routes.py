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
from ..ai.router import AIRouter
from ..config import HermesConfig
from ..data import store
from ..data.models import iso, parse_iso, utcnow
from ..data.provider import MarketDataProvider
from ..instrument import terminal as instrument
from ..jobs import backup, daily_check, runner, scheduler, weekly_review
from ..journal import service as journal
from ..pnl import attribution as pnl
from ..portfolio import review as portfolio_review
from ..regime import lab as regime_lab
from ..regime.engine import latest_reading, reading_history
from ..risk import engine as risk
from ..rs import board as rs_board
from ..scorecard import report as scorecard
from ..screener import trend_template as screener
from ..sector import drill as sector
from ..sizing import desk as sizing
from ..stress import scenarios as stress
from ..validation import ledger as validation


def build_router(config: HermesConfig, provider: MarketDataProvider) -> APIRouter:
    r = APIRouter(prefix="/api")

    # One AI router for the app's lifetime — its usage meter accumulates across
    # requests (session = server process). Local-first; cloud is the exception.
    ai = AIRouter(config)

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

    # ── Swing-opportunity screener (Minervini Trend Template) ────────────
    @r.get("/screener")
    def screener_route() -> dict:
        """Watchlist scored against Minervini's eight-point Trend Template.
        Rows are CANDIDATES worth a closer look — never setups, never trades.
        A candidate becomes a setup only via a journaled proposal, which runs
        the reviewer second-pass at propose time; this screen never calls it."""
        s = screener.build_screen(config)
        return {
            "generated_at": iso(s.ts),
            "asof": iso(s.benchmark_asof) if s.benchmark_asof else None,
            "benchmark": s.benchmark,
            "benchmark_source": s.benchmark_source,
            "regime": {
                "label": s.regime_label.value if s.regime_label else None,
                "label_display": s.regime_label.display if s.regime_label else None,
                "asof": iso(s.regime_asof) if s.regime_asof else None,
                "classifier_version": s.regime_version,
                "bull": s.bull_regime,
            },
            "rows": [
                {
                    "symbol": row.symbol, "status": row.status,
                    "verdict": row.verdict, "score": row.score,
                    "criteria": [
                        {"key": c.key, "label": c.label, "passed": c.passed}
                        for c in row.criteria
                    ],
                    "failed": row.failed,
                    "close": row.close, "sma50": row.sma50, "sma150": row.sma150,
                    "sma200": row.sma200, "low_52w": row.low_52w,
                    "high_52w": row.high_52w, "mansfield": row.mansfield,
                    "pct_above_low": row.pct_above_low,
                    "pct_below_high": row.pct_below_high, "bars": row.bars,
                    "regime_note": row.regime_note, "note": row.note,
                    "source": row.source,
                    "as_of": iso(row.as_of) if row.as_of else None,
                    "staleness": row.staleness,
                }
                for row in s.rows
            ],
            "honesty": {
                "claim": s.claim,
                "methodology": s.methodology,
                "caveat": s.caveat,
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
        structured = _weekly_structured()
        if rpt is None:
            return {"generated_at": None, "body_md": None, "meta": {},
                    "structured": structured, "honesty": honesty}
        return {
            "generated_at": rpt["ts"],
            "body_md": rpt["body_md"],
            "meta": rpt["meta"],
            "structured": structured,
            "honesty": honesty,
        }

    _DEFENSIVE_ETF = {"XLP", "XLU", "XLV", "XLRE"}   # staples/utilities/health/reits

    def _weekly_structured() -> dict:
        """The weekly review as DATA (heatmap, sector ballast, exposure gauges,
        thesis-staleness) — computed live from the current book, distinct from the
        stored markdown narrative of the last scheduled run."""
        rev = portfolio_review.build_review(config)
        heat, defensive_pct, cyclical_pct = [], 0.0, 0.0
        for s in rev.sector_heat:
            etf = sector._match_etf(s.sector) if not s.untagged else None
            is_def = etf in _DEFENSIVE_ETF
            heat.append({"sector": s.sector, "pct_equity": s.pct_equity,
                         "over_limit": s.over_limit, "untagged": s.untagged,
                         "defensive": is_def})
            if not s.untagged:
                if is_def:
                    defensive_pct += s.pct_equity
                else:
                    cyclical_pct += s.pct_equity
        now = utcnow()
        stale = []
        for p in risk.open_positions():
            held = (now - parse_iso(p["opened_at"])).days
            stale.append({
                "symbol": p["symbol"], "side": p["side"],
                "sector": p["sector"] or "unspecified",
                "size_pct": p["size_pct_equity"], "days_held": held,
                "stale": held >= config.journal.stale_open_after_days,
                "thesis": (p["thesis"] or "")[:180]})
        _cur, dd = risk.current_equity_index()
        r = config.risk
        return {
            "regime": {"display": rev.regime_display, "version": rev.regime_version,
                       "asof": iso(rev.regime_asof) if rev.regime_asof else None},
            "coherence": {"counts": rev.coherence_counts,
                          "positions": [asdict(p) for p in rev.positions]},
            "sector_heat": heat, "defensive_pct": round(defensive_pct, 1),
            "cyclical_pct": round(cyclical_pct, 1), "untagged_pct": rev.untagged_pct,
            "sector_leader": rev.sector_leader,
            "corr": {"symbols": rev.corr_symbols, "matrix": rev.corr_matrix,
                     "flags": rev.corr_flags, "lookback": rev.corr_lookback_days,
                     "threshold": rev.corr_warn_threshold,
                     "worst_pair": rev.worst_pair, "worst_corr": rev.worst_corr},
            "exposure": {
                "open_count": rev.open_count, "open_risk_pct": rev.open_risk_pct,
                "max_open_risk": r.max_open_risk_pct, "max_sector_pct": rev.max_sector_pct,
                "max_sector_limit": r.max_sector_exposure_pct,
                "drawdown_pct": dd, "max_drawdown": r.max_drawdown_pct},
            "stale": stale,
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

    # ── AI: model selector + session usage meter ─────────────────────────
    @r.get("/ai/status")
    def ai_status() -> dict:
        """Which backends are reachable, which one the local-first policy would
        use now, and the session's cloud usage. `approx_cost` is AI-infrastructure
        USD (never an account figure) and is confined to this endpoint. When no
        backend is usable, `active` is null so the UI renders 'model unavailable'
        while every computed number still shows."""
        return ai.status()

    # ── Instrument / Terminal ─────────────────────────────────────────────
    @r.get("/instrument/{symbol}")
    def instrument_route(symbol: str, narrative: bool = False, prefer: str | None = None,
                         range: str = "6M") -> dict:
        """A per-symbol read composed from cached bars + existing engines:
        price/staleness, MA structure, RS + Trend-Template, in-book context, and
        a transparent thesis-fit (0–100 + posture ALLOW/WATCH/RESTRICT). The AI
        desk-read runs only when ?narrative=1 (keeps the chart free + fast); it
        degrades visibly when no model answers. Never a live fetch, never a trade."""
        rep = instrument.build_instrument(config, symbol, ai=ai, narrative=narrative,
                                          prefer=prefer, range_key=range)
        return _instrument_payload(rep)

    @r.get("/search")
    def search_route(q: str = "") -> dict:
        rows = instrument.search(config, q)
        return {"query": q, "results": [
            {**{k: v for k, v in row.items() if k != "as_of"},
             "as_of": iso(row["as_of"]) if row.get("as_of") else None}
            for row in rows]}

    def _instrument_payload(rep: instrument.InstrumentReport) -> dict:
        tf = rep.thesis_fit
        return {
            "symbol": rep.symbol, "status": rep.status, "note": rep.note,
            "price": rep.price, "price_source": rep.price_source,
            "price_as_of": iso(rep.price_as_of) if rep.price_as_of else None,
            "staleness": rep.staleness,
            "close": rep.close, "sma50": rep.sma50, "sma150": rep.sma150, "sma200": rep.sma200,
            "low_52w": rep.low_52w, "high_52w": rep.high_52w,
            "pct_above_low": rep.pct_above_low, "pct_below_high": rep.pct_below_high,
            "bars": rep.bars,
            "open": rep.open, "high": rep.high, "low": rep.low, "prev_close": rep.prev_close,
            "day_change": rep.day_change, "day_change_pct": rep.day_change_pct,
            "day_range_pct": rep.day_range_pct, "atr14": rep.atr14, "range_key": rep.range_key,
            "rs": rep.rs, "mansfield": rep.mansfield, "rs_verdict": rep.rs_verdict,
            "trend_score": rep.trend_score, "trend_verdict": rep.trend_verdict,
            "in_book": rep.in_book, "book_weight_pct": rep.book_weight_pct,
            "book_side": rep.book_side, "sector": rep.sector,
            "regime": {"label": rep.regime_label, "label_display": rep.regime_display,
                       "asof": iso(rep.regime_asof) if rep.regime_asof else None},
            "thesis_fit": None if tf is None else {
                "status": tf.status, "score": tf.score, "posture": tf.posture,
                "capped": tf.capped, "cap_note": tf.cap_note,
                "factors": [asdict(f) for f in tf.factors],
                "honesty": {"claim": tf.claim, "methodology": tf.methodology, "caveat": tf.caveat},
            },
            "series": [{**p, "t": iso(p["t"])} for p in rep.series],
            "narrative": rep.narrative,
        }

    # ── AI debate (opt-in; degrades visibly) ─────────────────────────────
    @r.get("/debate/{symbol}")
    def debate_route(symbol: str, prefer: str | None = None) -> dict:
        """A three-voice desk debate (bull → bear → risk critique) over one
        symbol's COMPUTED facts, routed local-first through the AI router (cloud
        only if opted in). The model rephrases the facts and invents no numbers;
        it ends in the tension between views, never a directive. Degrades visibly
        when no model answers — the facts stand without it. Never a trade."""
        rep = instrument.build_instrument(config, symbol)
        if rep.status != "ok":
            return {"symbol": rep.symbol, "status": "missing", "note": rep.note,
                    "facts": None, "debate": None}
        facts = instrument.facts_from_report(rep)
        res = ai.complete("debate", facts_md=facts, prefer=prefer)
        debate = ({"status": "ok", "sections": _split_debate(res.text), "text": res.text,
                   "backend": res.backend, "model": res.model, "note": res.note}
                  if res.status == "ok" else
                  {"status": "unavailable", "text": None, "note": res.note})
        return {"symbol": rep.symbol, "status": "ok", "note": "", "facts": facts,
                "debate": debate}

    def _split_debate(text: str) -> dict | None:
        """Light split into bull / bear / risk on the fixed section headings; None
        when the model didn't use them (the raw text is always returned too)."""
        if not text:
            return None
        import re
        marks = list(re.finditer(r"(?im)^\s*(BULL CASE|BEAR CASE|RISK CRITIQUE)\s*:?\s*$", text))
        if len(marks) < 2:
            return None
        keys = {"BULL CASE": "bull", "BEAR CASE": "bear", "RISK CRITIQUE": "risk"}
        out: dict[str, str] = {}
        for i, m in enumerate(marks):
            end = marks[i + 1].start() if i + 1 < len(marks) else len(text)
            out[keys[m.group(1).upper()]] = text[m.end():end].strip()
        return out or None

    # ── AI: ask the desk / journal coach (grounded Q&A, opt-in) ──────────
    def _ai_answer(task: str, question: str, facts: str, prefer: str | None) -> dict:
        if not question.strip():
            raise HTTPException(422, "a question is required")
        res = ai.complete(task, question=question, facts_md=facts, prefer=prefer)
        if res.status == "ok":
            return {"status": "ok", "text": res.text, "facts": facts,
                    "backend": res.backend, "model": res.model, "note": res.note}
        return {"status": "unavailable", "text": None, "facts": facts, "note": res.note}

    @r.get("/ask")
    def ask_route(q: str = "", prefer: str | None = None) -> dict:
        """Ask the desk: a grounded Q&A over the CURRENT computed desk facts —
        regime, risk limits, posture, watchlist. The model quotes the numbers it
        was given and invents none; it explains the state, never a buy/sell.
        Degrades visibly. Never a trade."""
        reading = latest_reading()
        risk_state = risk.evaluate(config)
        posture = (daily_check.derive_posture(risk_state, reading) if reading
                   else {"posture": "unknown", "why": "no regime reading yet"})
        reg = reading.label.display if reading else "no reading"
        if reading:
            reg += f" (confidence {reading.confidence:.2f}, {reading.classifier_version})"
        lines = [
            f"Regime: {reg}",
            f"Posture: {posture.get('posture')} — {posture.get('why', '')}",
            f"Risk state: {risk_state.level} · open risk {risk_state.open_risk_pct:.2f}% · "
            f"drawdown {risk_state.drawdown_pct:.1f}% · equity index {risk_state.equity_index:.1f}",
        ]
        lines += [f"  · {c.kind}: {c.observed} (limit {c.limit}) [{c.level}]"
                  for c in risk_state.checks]
        return _ai_answer("ask", q, "\n".join(lines), prefer)

    @r.get("/coach")
    def coach_route(q: str = "", prefer: str | None = None) -> dict:
        """Journal coach: a grounded Q&A over the trader's OWN resolved journal —
        per-setup stats + the aggregate performance. Reflects on what happened;
        never says what to trade next. Degrades visibly."""
        perf = journal.performance_summary()
        closed = journal.list_entries(status="closed")
        lines = [f"Resolved trades: {perf.get('closed_trades', 0)} · win rate "
                 f"{perf.get('win_rate_pct', '∅')}% · thesis hit "
                 f"{perf.get('thesis_hit_rate_pct', '∅')}% · "
                 f"avg alpha {perf.get('avg_alpha_pct', '∅')}%",
                 perf.get("note", "")]
        by_setup: dict[str, list] = {}
        for e in closed:
            by_setup.setdefault(e.get("setup_tag") or "untagged", []).append(e)
        for tag, es in by_setup.items():
            rs = [x["realized_return_pct"] for x in es if x["realized_return_pct"] is not None]
            wr = round(sum(1 for x in rs if x > 0) / len(rs) * 100, 0) if rs else 0
            avg = round(sum(rs) / len(rs), 2) if rs else 0
            lines.append(f"  · setup {tag}: n={len(es)} · win {wr}% · avg realized {avg}%")
        return _ai_answer("coach", q, "\n".join(lines), prefer)

    @r.get("/market-debate")
    def market_debate_route(prefer: str | None = None) -> dict:
        """A three-voice desk debate (bull → bear → risk critique) over the whole
        TAPE — the current regime, posture, risk state, and leadership — not one
        symbol. Ends in the tension between views, never a directive; degrades
        visibly. Never a trade."""
        reading = latest_reading()
        risk_state = risk.evaluate(config)
        posture = (daily_check.derive_posture(risk_state, reading) if reading
                   else {"posture": "unknown", "why": "no regime reading yet"})
        board = rs_board.build_board(config)
        leaders = [f"{row.symbol} {row.verdict} (Mansfield {row.mansfield})"
                   for row in board.rows if row.status == "ok" and row.verdict][:5]
        facts = "\n".join([
            f"Regime: {reading.label.display if reading else 'no reading'}"
            + (f" (confidence {reading.confidence:.2f})" if reading else ""),
            f"Posture: {posture.get('posture')} — {posture.get('why', '')}",
            f"Risk: {risk_state.level} · open risk {risk_state.open_risk_pct:.2f}% "
            f"· drawdown {risk_state.drawdown_pct:.1f}%",
            "Leadership (Mansfield RS): " + ("; ".join(leaders) if leaders else "no ranked names"),
        ])
        res = ai.complete("debate", facts_md=facts, prefer=prefer)
        debate = ({"status": "ok", "sections": _split_debate(res.text), "text": res.text,
                   "backend": res.backend, "model": res.model, "note": res.note}
                  if res.status == "ok" else
                  {"status": "unavailable", "text": None, "note": res.note})
        return {"facts": facts, "debate": debate}

    # ── Validation ledger ─────────────────────────────────────────────────
    @r.get("/ledger")
    def ledger_route() -> dict:
        """The honest capstone: individual model claims vs what happened. Journaled
        theses resolved to their own verdict, and regime reads checked for whether
        the market aligned with them over ~21 sessions — each frozen when made,
        computed from persisted records only. % / verdicts, never a trade."""
        return _ledger_payload(validation.build_ledger(config))

    def _ledger_payload(led: validation.ValidationLedger) -> dict:
        return {
            "generated_at": iso(led.generated_at), "benchmark": led.benchmark,
            "total_entries": led.total_entries,
            "campaigns": led.campaigns, "campaign_tally": led.campaign_tally,
            "epistemic": led.epistemic,
            "summaries": [asdict(s) for s in led.summaries],
            "entries": [
                {"kind": e.kind, "subject": e.subject, "claim": e.claim,
                 "as_of": iso(e.as_of) if e.as_of else None, "horizon": e.horizon,
                 "status": e.status, "resolved": e.resolved, "outcome": e.outcome,
                 "detail": e.detail}
                for e in led.entries
            ],
            "honesty": {"claim": led.claim, "methodology": led.methodology, "caveat": led.caveat},
        }

    # ── Sector drill ──────────────────────────────────────────────────────
    @r.get("/sector")
    def sector_route() -> dict:
        """A sector read: the SPDR sector ETFs in the watchlist ranked by Mansfield
        relative strength vs the benchmark (leading / lagging), each sector's trend
        structure, and where the open book's exposure sits against those reads
        (tailwind / headwind). % of equity + RS terms only; never a trade."""
        return _sector_payload(sector.build_drill(config))

    def _sector_payload(d: sector.SectorDrill) -> dict:
        return {
            "generated_at": iso(d.generated_at), "status": d.status, "note": d.note,
            "benchmark": d.benchmark, "regime_display": d.regime_display,
            "sectors": [
                {"symbol": s.symbol, "sector": s.sector, "status": s.status,
                 "mansfield": s.mansfield, "verdict": s.verdict, "lead_lag": s.lead_lag,
                 "close": s.close, "ma_stack": s.ma_stack,
                 "pct_above_low": s.pct_above_low, "pct_below_high": s.pct_below_high,
                 "book_weight_pct": s.book_weight_pct, "source": s.source,
                 "as_of": iso(s.as_of) if s.as_of else None,
                 "staleness": s.staleness, "note": s.note,
                 "slope3": s.slope3, "rs_new_high": s.rs_new_high, "rs_new_low": s.rs_new_low}
                for s in d.sectors
            ],
            "book": [asdict(b) for b in d.book],
            "covered": d.covered, "uncovered": d.uncovered,
            "book_in_leading_pct": d.book_in_leading_pct,
            "book_in_lagging_pct": d.book_in_lagging_pct,
            "book_unbenchmarked_pct": d.book_unbenchmarked_pct,
            "honesty": {"claim": d.claim, "methodology": d.methodology, "caveat": d.caveat},
        }

    # ── Stress test ───────────────────────────────────────────────────────
    @r.get("/stress")
    def stress_route() -> dict:
        """Shocks the CURRENT open book against stylized shocks (market −5/−10/−20%,
        all-stops-hit, and a correlations→1 crisis), reporting the projected
        drawdown on the 100-based index, which positions hurt most, and de-risk
        POSTURES. A what-if, % of equity only — never a forecast, never a trade."""
        return _stress_payload(stress.build_stress(config))

    def _stress_payload(rep: stress.StressReport) -> dict:
        return {
            "generated_at": iso(rep.generated_at), "status": rep.status, "note": rep.note,
            "benchmark": rep.benchmark, "lookback_days": rep.lookback_days,
            "current_index": rep.current_index, "current_drawdown_pct": rep.current_drawdown_pct,
            "max_drawdown_pct": rep.max_drawdown_pct, "open_risk_pct": rep.open_risk_pct,
            "scenarios": [
                {"key": s.key, "title": s.title, "kind": s.kind,
                 "market_move_pct": s.market_move_pct, "total_impact_pct": s.total_impact_pct,
                 "projected_index": s.projected_index,
                 "projected_drawdown_pct": s.projected_drawdown_pct,
                 "breaches_circuit": s.breaches_circuit,
                 "positions": [asdict(p) for p in s.positions], "note": s.note}
                for s in rep.scenarios
            ],
            "hedges": [asdict(h) for h in rep.hedges],
            "honesty": {"claim": rep.claim, "methodology": rep.methodology, "caveat": rep.caveat},
        }

    # ── Model scorecard ───────────────────────────────────────────────────
    @r.get("/scorecard")
    def scorecard_route() -> dict:
        """Grades Hermes' own models on STORED evidence only — regime stability,
        live classifier agreement, reviewer calibration, thesis-judgment
        calibration — each marked GRADED / THIN / NOT_TRACKED with its sample. It
        fabricates no grade; what the data can't support is named, not faked."""
        return _scorecard_payload(scorecard.build_scorecard(config))

    def _scorecard_payload(sc: scorecard.Scorecard) -> dict:
        return {
            "generated_at": iso(sc.generated_at),
            "items": [
                {"key": it.key, "title": it.title, "status": it.status, "n": it.n,
                 "headline": it.headline, "detail": it.detail,
                 "small_sample": it.small_sample,
                 "rows": [asdict(row) for row in it.rows],
                 "claim": it.claim, "caveat": it.caveat}
                for it in sc.items
            ],
            "honesty": {"claim": sc.claim, "methodology": sc.methodology, "caveat": sc.caveat},
        }

    # ── P&L / attribution ─────────────────────────────────────────────────
    @r.get("/pnl")
    def pnl_route() -> dict:
        """The resolved journal graded on the normalized (100-based) equity index:
        headline stats, the equity curve, and attribution by regime-at-entry /
        setup / sector / side. Everything is % of equity or an index — NO dollar
        figure is ever emitted. Never a trade."""
        return _pnl_payload(pnl.build_pnl(config))

    def _pnl_payload(rep: pnl.PnLReport) -> dict:
        h = rep.headline
        return {
            "generated_at": iso(rep.generated_at), "status": rep.status, "note": rep.note,
            "headline": None if h is None else asdict(h),
            "curve": [{"ts": iso(p.ts), "value": p.value, "cause": p.cause} for p in rep.curve],
            "attributions": [
                {"dimension": a.dimension, "label": a.label,
                 "groups": [asdict(g) for g in a.groups]}
                for a in rep.attributions
            ],
            "honesty": {"claim": rep.claim, "methodology": rep.methodology, "caveat": rep.caveat},
        }

    # ── Regime Lab ────────────────────────────────────────────────────────
    @r.get("/regime/lab")
    def regime_lab_route() -> dict:
        """A deep read of the regime engine: BOTH classifiers run live on the same
        cached bars (a read — never persisted), each component's evidence, the
        confidence formula broken out, drift vs the last persisted reading, and the
        transition history of the default classifier. Never a live fetch, never a
        trade."""
        return _lab_payload(regime_lab.build_lab(config))

    def _cview_payload(v: regime_lab.ClassifierView) -> dict:
        return {
            "version": v.version, "is_default": v.is_default, "status": v.status,
            "label": v.label, "label_display": v.label_display,
            "score": v.score, "confidence": v.confidence,
            "confidence_basis": v.confidence_basis,
            "votes_available": v.votes_available, "votes_total": v.votes_total,
            "evidence": [asdict(e) for e in v.evidence],
            "data_asof": iso(v.data_asof) if v.data_asof else None,
            "data_source": v.data_source, "honesty": v.honesty,
        }

    def _lab_payload(lab: regime_lab.RegimeLab) -> dict:
        return {
            "generated_at": iso(lab.generated_at), "benchmark": lab.benchmark,
            "status": lab.status, "note": lab.note,
            "default_classifier": lab.default_classifier,
            "agree": lab.agree, "agreement_note": lab.agreement_note,
            "classifiers": [_cview_payload(v) for v in lab.classifiers],
            "persisted": {
                "label": lab.persisted_label, "label_display": lab.persisted_display,
                "asof": iso(lab.persisted_asof) if lab.persisted_asof else None,
                "drifted": lab.drifted, "drift_note": lab.drift_note,
            },
            "history": [
                {**h, "ts": iso(h["ts"]), "asof": iso(h["asof"]) if h["asof"] else None}
                for h in lab.history
            ],
            "streak_readings": lab.streak_readings,
            "transitions": [
                {"ts": iso(t.ts), "from_label": t.from_label, "from_display": t.from_display,
                 "to_label": t.to_label, "to_display": t.to_display}
                for t in lab.transitions
            ],
            "dwell": lab.dwell, "history_n": lab.history_n, "small_sample": lab.small_sample,
            "markov": None if lab.markov is None else {
                **{k: v for k, v in asdict(lab.markov).items() if k != "rows"},
                "rows": [asdict(row) for row in lab.markov.rows],
            },
            "honesty": {"claim": lab.claim, "methodology": lab.methodology, "caveat": lab.caveat},
        }

    # ── Sizing desk ───────────────────────────────────────────────────────
    @r.get("/size")
    def size_route(
        symbol: str, entry: float, stop: float,
        target: float | None = None, sector: str | None = None,
    ) -> dict:
        """Suggest a position size (% of equity) for a planned trade: the
        fixed-fractional baseline, tilted by the journal's own realized edge
        (half-Kelly, shrunk to the sample size), then clamped by the binding risk
        limit. Side is inferred from stop-vs-entry. A suggestion only — Hermes has
        no order path; the human sizes and places every trade."""
        plan = sizing.build_size_plan(
            config, symbol, entry=entry, stop=stop, target=target, sector=sector)
        return _size_payload(plan)

    def _size_payload(plan: sizing.SizePlan) -> dict:
        return {
            "status": plan.status, "symbol": plan.symbol, "note": plan.note,
            "side": plan.side, "entry": plan.entry, "stop": plan.stop,
            "target": plan.target, "stop_distance_pct": plan.stop_distance_pct,
            "cached_last": plan.cached_last, "price_source": plan.price_source,
            "as_of": iso(plan.as_of) if plan.as_of else None, "staleness": plan.staleness,
            "fixed_risk_pct": plan.fixed_risk_pct, "shrink": plan.shrink,
            "blended_risk_pct": plan.blended_risk_pct,
            "size_pct_equity": plan.size_pct_equity,
            "planned_risk_pct": plan.planned_risk_pct,
            "reward_risk_ratio": plan.reward_risk_ratio,
            "binding_constraint": plan.binding_constraint,
            "caps": [asdict(c) for c in plan.caps],
            "kelly": None if plan.kelly is None else asdict(plan.kelly),
            "correlation": None if plan.correlation is None else asdict(plan.correlation),
            "honesty": {"claim": plan.claim, "methodology": plan.methodology,
                        "caveat": plan.caveat},
        }

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
            # Positive evidence the state is being snapshotted — null until the
            # first backup runs (the MISSED flag on the 'backup' job catches a
            # backup that stopped firing; this shows the most recent snapshot).
            "backup": backup.latest_backup(config),
        }

    return r
