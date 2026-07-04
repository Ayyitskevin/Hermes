"""Local-first AI inference via the owner's own Ollama.

Routine, recurring analysis runs here — on hardware the owner controls, at
zero marginal cost. Cloud inference is a RESERVED V2 slot: the config knobs
(ai.allow_cloud, ai.cloud_model, ANTHROPIC_API_KEY) exist but no cloud code
path ships in V1 — setting them does nothing yet, and the docs say so.

When Ollama is down the caller gets OllamaUnavailable and must degrade
visibly — narrative sections render as 'local model unavailable', never as
silently missing prose.
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

    def available(self) -> bool:
        try:
            resp = httpx.get(f"{self.url}/api/tags", timeout=3.0)
            resp.raise_for_status()
            return True
        except httpx.HTTPError:
            return False
