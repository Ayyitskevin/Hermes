"""The AI router — local-first, cloud as the deliberate exception.

One entry point (`complete`) selects a backend, falls back visibly, and meters
cloud usage. The policy, stated once:

  * Route to **Ollama by default** (local, zero marginal cost, owner-controlled).
  * Use **cloud only when** `ai.allow_cloud` is true **and** the task opts in
    (see ``CLOUD_OPT_IN_TASKS``) **or** the operator asks for it (`prefer="cloud"`).
  * If the chosen backend is down, **fall back to the other** and label which
    answered — but never cross to cloud when `allow_cloud` is false.
  * If both are down (or cloud is refused and local is down), return the
    **unavailable** state so the view renders "model unavailable" while the
    numbers still show. Never a silent ``None`` dressed as prose.

The AI layer is data-in / prose-out: it receives computed facts and may only
rephrase them. It never sees or emits an order. Cloud spend is metered in USD as
an AI-infrastructure figure confined to `/api/ai/status` — it is not an account
balance, P&L, or position size, and never enters the equity / % domain.
"""

from __future__ import annotations

import threading
import time
from dataclasses import dataclass

from ..config import HermesConfig
from .claude import ClaudeClient, ClaudeUnavailable
from .ollama import OllamaClient, OllamaUnavailable

# Tasks that MAY reach for the cloud automatically when allow_cloud is true.
# Everything else uses cloud only on an explicit operator request (prefer="cloud")
# or as a visible fallback when local is down.
# narrate_daily_check stays local-first (cloud only as fallback when local is
# down and allow_cloud is true) — it is the morning routine, not a premium task.
CLOUD_OPT_IN_TASKS = frozenset({
    "debate", "debate_structured", "coach", "desk_read", "ask", "reflect_trade",
})

# Per-1M-token USD list prices, for the approximate session-usage meter only.
# Deliberately conservative (list, not intro). Missing models fall back to the
# default. These are AI-infrastructure dollars — never equity dollars.
_PRICES = {
    "claude-sonnet-5": (3.0, 15.0),
    "claude-haiku-4-5": (1.0, 5.0),
    "claude-opus-4-8": (5.0, 25.0),
    "_default": (3.0, 15.0),
}


class UsageMeter:
    """Process-lifetime accumulator for cloud AI usage. Reset on restart."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.queries = 0
        self.input_tokens = 0
        self.output_tokens = 0
        self.approx_cost = 0.0

    def record(self, model: str | None, usage: dict | None) -> None:
        if not usage:
            return
        in_tok = int(usage.get("input_tokens", 0))
        out_tok = int(usage.get("output_tokens", 0))
        p_in, p_out = _PRICES.get(model or "", _PRICES["_default"])
        with self._lock:
            self.queries += 1
            self.input_tokens += in_tok
            self.output_tokens += out_tok
            self.approx_cost += in_tok / 1e6 * p_in + out_tok / 1e6 * p_out

    def snapshot(self) -> dict:
        with self._lock:
            return {"queries": self.queries, "approx_cost": round(self.approx_cost, 4)}


@dataclass(frozen=True)
class AIResult:
    """The router's answer. `status == "ok"` carries prose; `"unavailable"` carries
    a note and no text, so the view says "model unavailable" over live numbers."""

    status: str                 # "ok" | "unavailable"
    text: str | None
    backend: str | None         # "ollama" | "claude"
    model: str | None
    latency_ms: float | None
    usage: dict | None          # {input_tokens, output_tokens} for cloud, else None
    note: str


class AIRouter:
    def __init__(
        self,
        config: HermesConfig,
        *,
        ollama: OllamaClient | None = None,
        claude: ClaudeClient | None = None,
        meter: UsageMeter | None = None,
    ) -> None:
        self.config = config
        self.ollama = ollama or OllamaClient(config)
        self.claude = claude or ClaudeClient(config)
        self.meter = meter or UsageMeter()

    # ── policy ───────────────────────────────────────────────────────────
    def _candidates(self, task: str, prefer: str | None) -> tuple[list[str], str]:
        """Ordered backend names to try, plus a note if cloud was refused by policy."""
        cloud_usable = self.config.ai.allow_cloud
        note = ""
        if prefer == "cloud" and not cloud_usable:
            note = "cloud requested but ai.allow_cloud is false — used local"

        want_cloud_first = prefer == "cloud" or (
            prefer is None and task in CLOUD_OPT_IN_TASKS
        )
        if prefer == "local":
            want_cloud_first = False

        if want_cloud_first and cloud_usable:
            return ["claude", "ollama"], note
        # Local-first; cloud only as a permitted fallback when local is down.
        order = ["ollama"]
        if cloud_usable:
            order.append("claude")
        return order, note

    def _invoke(self, backend: str, task: str, **kwargs) -> tuple[str, str | None, dict | None]:
        client = self.ollama if backend == "ollama" else self.claude
        result = getattr(client, task)(**kwargs)
        # Ollama returns str; Claude returns (text, usage). Normalize.
        if isinstance(result, tuple):
            text, usage = result
        else:
            text, usage = result, None
        if backend == "claude":
            model = (usage or {}).get("model", self.claude.model)
            self.meter.record(model, usage)
        else:
            model = self.config.ai.ollama_model
        return text, model, usage

    def complete(self, task: str, *, prefer: str | None = None, **kwargs) -> AIResult:
        candidates, note = self._candidates(task, prefer)
        errors: list[str] = []
        for i, backend in enumerate(candidates):
            try:
                start = time.monotonic()
                text, model, usage = self._invoke(backend, task, **kwargs)
                latency = (time.monotonic() - start) * 1000
                fell_back = i > 0
                answered_note = (
                    f"answered by {backend} (fell back: {', '.join(errors)})"
                    if fell_back else f"answered by {backend}"
                )
                return AIResult(
                    status="ok", text=text, backend=backend, model=model,
                    latency_ms=latency, usage=usage,
                    note="; ".join(p for p in (note, answered_note) if p),
                )
            except (OllamaUnavailable, ClaudeUnavailable) as exc:
                errors.append(f"{backend}: {exc}")
                continue
        detail = "; ".join(p for p in (note, *errors) if p) or "no AI backend permitted"
        return AIResult(
            status="unavailable", text=None, backend=None, model=None,
            latency_ms=None, usage=None,
            note=f"model unavailable — {detail}",
        )

    # ── status (powers the model selector + usage meter) ─────────────────
    def status(self) -> dict:
        ollama_ok = self.ollama.available()
        claude_ok = self.claude.available()
        allow_cloud = self.config.ai.allow_cloud
        if ollama_ok:
            active = "ollama"
        elif allow_cloud and claude_ok:
            active = "claude"
        else:
            active = None
        def priced(model: str) -> dict:
            p_in, p_out = _PRICES.get(model, _PRICES["_default"])
            return {"in_per_mtok": p_in, "out_per_mtok": p_out}

        return {
            "backends": [
                {"name": "ollama", "model": self.config.ai.ollama_model,
                 "reachable": ollama_ok, "kind": "local",
                 "note": "on device · $0 · the default",
                 "price": {"in_per_mtok": 0.0, "out_per_mtok": 0.0}},
                {"name": "claude", "model": self.config.ai.cloud_model,
                 "reachable": claude_ok, "kind": "frontier",
                 "note": ("cloud · the deliberate exception" if allow_cloud
                          else "cloud · disabled — set ai.allow_cloud to enable"),
                 "price": priced(self.config.ai.cloud_model)},
            ],
            "active": active,
            "session_usage": self.meter.snapshot(),
            "allow_cloud": allow_cloud,
        }
