"""Local-first AI inference via the owner's own Ollama.

Routine, recurring analysis runs here — on hardware the owner controls, at
zero marginal cost. This is the DEFAULT path. Cloud (Claude) is the deliberate
exception, off unless ai.allow_cloud is set; the router (ai/router.py) chooses
between the two and both share this method surface.

When Ollama is down the caller gets OllamaUnavailable and must degrade
visibly — narrative sections render as 'local model unavailable', never as
silently missing prose. (The router turns that into a labeled fallback or a
visible 'model unavailable' state; the numbers always still render.)
"""

from __future__ import annotations

import time

import httpx

from .. import oplog
from ..config import HermesConfig


class OllamaUnavailable(Exception):
    pass


class OllamaClient:
    def __init__(self, config: HermesConfig, timeout: float = 60.0):
        self.url = config.ai.ollama_url.rstrip("/")
        self.model = config.ai.ollama_model
        self.timeout = timeout

    def _chat(self, system: str, user: str) -> str:
        start = time.monotonic()
        try:
            resp = httpx.post(
                f"{self.url}/api/chat",
                json={
                    "model": self.model,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": user},
                    ],
                    "stream": False,
                },
                timeout=self.timeout,
            )
            resp.raise_for_status()
            content = resp.json().get("message", {}).get("content", "").strip()
        except (httpx.HTTPError, ValueError, KeyError) as exc:
            latency = (time.monotonic() - start) * 1000
            oplog.log("ai", "ollama_chat", self.model, latency, "fail",
                      f"{type(exc).__name__}: {exc}")
            raise OllamaUnavailable(
                f"Ollama at {self.url} unavailable ({type(exc).__name__})"
            ) from exc
        latency = (time.monotonic() - start) * 1000
        if not content:
            oplog.log("ai", "ollama_chat", self.model, latency, "fail", "empty response")
            raise OllamaUnavailable("Ollama returned an empty response")
        oplog.log("ai", "ollama_chat", self.model, latency, "ok",
                  f"{len(content)} chars")
        return content

    def narrate_daily_check(self, facts_md: str) -> str:
        """One tight paragraph over the day's computed facts. The model may
        rephrase facts, never add new ones — numbers come from the pipeline."""
        return self._chat(
            system=(
                "You are the narrator of a personal trading dashboard. You receive "
                "computed facts (regime label, evidence, risk state). Write ONE "
                "plain-English paragraph (max 120 words) summarizing what kind of "
                "day this is for a regime-following swing trader. Restate only the "
                "facts given — do not invent numbers, tickers, predictions, or "
                "advice to buy or sell anything."
            ),
            user=facts_md,
        )

    def review_trade(
        self, *, symbol: str, side: str, entry_price: float, stop_price: float,
        thesis: str, regime_label: str,
    ) -> str:
        """Skeptical second-pass critique of a trade thesis (max ~150 words)."""
        return self._chat(
            system=(
                "You are a skeptical trading desk reviewer. Critique the proposed "
                "trade's THESIS in under 150 words: is it falsifiable, does it name "
                "a level it defends, does it depend on too many things going right, "
                "is it coherent with the stated market regime? You do not predict "
                "prices and you do not approve or reject — you name weaknesses a "
                "solo trader would miss. No financial advice; this is decision support."
            ),
            user=(
                f"Regime: {regime_label}\nProposed: {side.upper()} {symbol} @ "
                f"{entry_price}, stop {stop_price}\nThesis: {thesis}"
            ),
        )

    def desk_read(self, facts_md: str) -> str:
        """Narrate an instrument's thesis-fit vs the book — rephrases the computed
        factor rows and posture, never restating a posture as a directive."""
        return self._chat(
            system=(
                "You are a trading desk analyst reading one instrument against a "
                "regime-following swing book. You receive computed facts: the "
                "regime, the name's RS and trend structure, its thesis-fit score "
                "and per-factor rows, and its posture (ALLOW / WATCH / RESTRICT). "
                "Write at most 120 words explaining what the posture reflects and "
                "which factors drive it. Restate only the facts given — invent no "
                "numbers. Posture is context for a human decision, never a "
                "directive: do not tell anyone to buy, sell, or size anything."
            ),
            user=facts_md,
        )

    def coach(self, question: str, facts_md: str) -> str:
        """Answer a question over the trader's OWN resolved journal entries,
        grounded strictly in the supplied resolved history."""
        return self._chat(
            system=(
                "You are a trading journal coach. Answer the trader's question "
                "using ONLY the resolved journal entries and per-setup statistics "
                "provided — their own realized history. Quote the numbers you were "
                "given; invent none. If a sample is small (n < 30) say it is "
                "anecdote-grade. You reflect on what happened; you never tell them "
                "what to trade next."
            ),
            user=f"Question: {question}\n\nResolved history:\n{facts_md}",
        )

    def ask(self, question: str, facts_md: str) -> str:
        """Answer a question about the desk state (regime, risk, posture, book),
        grounded strictly in the supplied computed facts — never a directive."""
        return self._chat(
            system=(
                "You are Hermes' desk assistant. Answer the operator's question "
                "using ONLY the computed desk facts provided (regime, risk limits, "
                "posture, watchlist). Quote the numbers you were given and cite "
                "which fact you used; invent none. Everything is % of equity or an "
                "index — never a dollar. You explain the current state; you never "
                "tell them to buy or sell, and you never override the risk layer."
            ),
            user=f"Question: {question}\n\nDesk facts:\n{facts_md}",
        )

    def debate(self, facts_md: str) -> str:
        """Bull case → bear case → risk critique over a symbol/thesis. Decision
        support only; ends in context, never a directive."""
        return self._chat(
            system=(
                "You run a three-voice desk debate over a symbol and thesis, using "
                "only the computed facts provided. Produce three short sections in "
                "this fixed order: BULL CASE, BEAR CASE, RISK CRITIQUE. Restate "
                "only the given facts — invent no numbers or catalysts. This is "
                "decision support for a human: end in the tension between the "
                "views, never a recommendation to buy or sell."
            ),
            user=facts_md,
        )

    def available(self) -> bool:
        try:
            resp = httpx.get(f"{self.url}/api/tags", timeout=3.0)
            resp.raise_for_status()
            return True
        except httpx.HTTPError:
            return False
