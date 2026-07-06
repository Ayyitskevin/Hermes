"""Cloud AI inference via Anthropic's Claude — the deliberate exception.

Local-first is the rule (see ``ai/ollama.py``); cloud is the exception, taken
only when ``ai.allow_cloud`` is true and a task opts in or the operator asks for
it (the router enforces that policy — this module is just the client). Mirrors
``OllamaClient``'s method surface so the router can treat the two backends
interchangeably, and adds the product's new tasks: ``desk_read`` (instrument
thesis-fit narrative), ``coach`` (journal Q&A over the trader's own resolved
entries), and ``debate`` (bull / bear / risk).

Like Ollama, this path is **data-in / prose-out**: the model receives computed
facts and may only rephrase them — it never invents a number, and it never sees
or emits anything that could place a trade. On failure the caller gets
``ClaudeUnavailable`` and must degrade visibly — a narrative renders as "model
unavailable", never as silently missing prose, and the numbers still show.

The only outbound host here is the Anthropic *messages* host,
``api.anthropic.com`` — an AI text-generation host, not a broker host. It is
allow-listed in ``tests/test_no_order_paths.py`` as a reviewed decision; the
no-order-path boundary is unchanged.
"""

from __future__ import annotations

import time

import httpx

from .. import oplog
from ..config import HermesConfig

API_URL = "https://api.anthropic.com/v1/messages"
MODELS_URL = "https://api.anthropic.com/v1/models"
API_VERSION = "2023-06-01"


class ClaudeUnavailable(Exception):
    """Raised when the cloud path cannot answer — no key, unreachable, throttled,
    or an empty/declined response. The caller degrades visibly; numbers still render."""


class ClaudeClient:
    def __init__(self, config: HermesConfig, timeout: float = 60.0):
        self.api_key = config.secrets.anthropic_api_key
        self.model = config.ai.cloud_model
        self.fast_model = config.ai.cloud_fast_model
        self.timeout = timeout

    # ── transport ────────────────────────────────────────────────────────
    def _chat(
        self, system: str, user: str, *, fast: bool = False, max_tokens: int = 400,
    ) -> tuple[str, dict]:
        """One turn over the Messages API. Returns (text, usage) where usage is
        ``{input_tokens, output_tokens, model}`` — the router meters the tokens.

        Thinking is disabled: these tasks rephrase computed facts, they do not
        reason, so the fast, cheap path is the honest one. Restated facts only —
        the model never adds a number."""
        if not self.api_key:
            # No network attempt without a key — fail fast and visibly.
            oplog.log("ai", "claude_chat", "claude", None, "skip", "no ANTHROPIC_API_KEY")
            raise ClaudeUnavailable("No ANTHROPIC_API_KEY set — cloud path unavailable")

        model = self.fast_model if fast else self.model
        start = time.monotonic()
        try:
            resp = httpx.post(
                API_URL,
                headers={
                    "x-api-key": self.api_key,
                    "anthropic-version": API_VERSION,
                    "content-type": "application/json",
                },
                json={
                    "model": model,
                    "max_tokens": max_tokens,
                    "thinking": {"type": "disabled"},
                    "system": system,
                    "messages": [{"role": "user", "content": user}],
                },
                timeout=self.timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            text = "".join(
                b.get("text", "") for b in data.get("content", [])
                if b.get("type") == "text"
            ).strip()
            usage = data.get("usage", {}) or {}
            in_tok = int(usage.get("input_tokens", 0))
            out_tok = int(usage.get("output_tokens", 0))
        except (httpx.HTTPError, ValueError, KeyError, TypeError) as exc:
            latency = (time.monotonic() - start) * 1000
            oplog.log("ai", "claude_chat", model, latency, "fail",
                      f"{type(exc).__name__}: {exc}")
            raise ClaudeUnavailable(
                f"Anthropic API unavailable ({type(exc).__name__})"
            ) from exc

        latency = (time.monotonic() - start) * 1000
        if not text:
            # An empty body (e.g. a safety refusal) is not prose — degrade visibly.
            oplog.log("ai", "claude_chat", model, latency, "fail",
                      f"empty response (in={in_tok} out={out_tok})")
            raise ClaudeUnavailable("Anthropic returned an empty response")
        oplog.log("ai", "claude_chat", model, latency, "ok",
                  f"in={in_tok} out={out_tok} {len(text)} chars")
        return text, {"input_tokens": in_tok, "output_tokens": out_tok, "model": model}

    def available(self) -> bool:
        """Honest reachability: key present AND the account is reachable. Probes
        the models list (no generation, no tokens) — mirrors Ollama's tags ping."""
        if not self.api_key:
            return False
        try:
            resp = httpx.get(
                MODELS_URL,
                headers={"x-api-key": self.api_key, "anthropic-version": API_VERSION},
                timeout=3.0,
            )
            resp.raise_for_status()
            return True
        except httpx.HTTPError:
            return False

    # ── tasks (mirror OllamaClient's surface; return (text, usage)) ──────
    def narrate_daily_check(self, facts_md: str) -> tuple[str, dict]:
        """One tight paragraph over the day's computed facts (max 120 words).
        Restates only the facts given — no new numbers, tickers, or advice."""
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
    ) -> tuple[str, dict]:
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

    def desk_read(self, facts_md: str) -> tuple[str, dict]:
        """Narrate an instrument's thesis-fit vs the book. Rephrases the computed
        factor rows and posture — it never restates a posture as a directive."""
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

    def coach(self, question: str, facts_md: str) -> tuple[str, dict]:
        """Answer a question over the trader's OWN resolved journal entries. Fast
        lane (interactive). Grounded strictly in the supplied resolved history."""
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
            fast=True,
            max_tokens=512,
        )

    def ask(self, question: str, facts_md: str) -> tuple[str, dict]:
        """Answer a question about the desk state, grounded strictly in the
        computed facts. Fast lane (interactive); never a directive."""
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
            fast=True,
            max_tokens=512,
        )

    def debate(self, facts_md: str) -> tuple[str, dict]:
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
            max_tokens=900,
        )
