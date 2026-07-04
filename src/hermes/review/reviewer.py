"""Reviewer — the second pair of eyes a desk would give you for free.

Every proposed trade passes through this module before it can be committed
to the journal. It runs deterministic rule checks always, and adds a local
LLM critique (Ollama) when available. The verdict is advisory: the human can
override it, but the override is recorded with the entry, forever.

Pattern credit: the dedicated strategy-reviewer role in
tradermonty/claude-trading-skills (Strategy Research tier), whose job is
catching overfitting risk, inadequate sample size, and unrealistic execution
assumptions before an idea is treated as usable.
"""

from __future__ import annotations

import json
from dataclasses import asdict

from .. import db, oplog
from ..ai.ollama import OllamaClient, OllamaUnavailable
from ..config import HermesConfig
from ..regime.models import RegimeReading

MIN_SETUP_SAMPLE = 10          # closed trades of a setup before stats mean anything
MIN_STOP_DISTANCE_PCT = 0.35   # stops inside intraday noise get run over
WIDE_STOP_WARN_PCT = 15.0      # a stop this far away is a thesis problem


def _setup_sample_size(setup_tag: str | None) -> int:
    if not setup_tag:
        return 0
    row = db.connect().execute(
        "SELECT COUNT(*) AS n FROM journal_entries WHERE setup_tag=? AND status='closed'",
        (setup_tag,),
    ).fetchone()
    return int(row["n"]) if row else 0


def review_entry(
    config: HermesConfig,
    *,
    symbol: str,
    side: str,
    entry_price: float,
    stop_price: float,
    thesis: str,
    setup_tag: str | None,
    sizing,
    reading: RegimeReading | None,
) -> dict:
    """Deterministic checks + optional local-LLM critique. Returns a verdict
    dict stored verbatim with the journal entry."""
    flags: list[dict] = []

    # Execution realism: stop placement.
    if sizing.stop_distance_pct < MIN_STOP_DISTANCE_PCT:
        flags.append({
            "check": "execution_realism",
            "severity": "high",
            "finding": (
                f"Stop is {sizing.stop_distance_pct:.2f}% from entry — inside normal "
                "daily noise for most liquid names. This stop will likely be hit by "
                "randomness, not by the thesis failing."
            ),
        })
    if sizing.stop_distance_pct > WIDE_STOP_WARN_PCT:
        flags.append({
            "check": "execution_realism",
            "severity": "medium",
            "finding": (
                f"Stop is {sizing.stop_distance_pct:.1f}% away. A stop that wide "
                "usually means the entry is early or the thesis lacks a level it "
                "actually defends."
            ),
        })
    if sizing.capped_by:
        flags.append({
            "check": "sizing",
            "severity": "medium",
            "finding": (
                f"Raw fixed-fractional size exceeded {sizing.capped_by}; size was "
                f"capped to {sizing.size_pct_equity:.1f}% of equity, so actual risk "
                f"({sizing.planned_risk_pct:.2f}%) is below your standard per-trade risk. "
                "Tight stop + big size is how one gap ruins a quarter."
            ),
        })

    # Sample size: has this setup earned statistical trust?
    sample = _setup_sample_size(setup_tag)
    if setup_tag and sample < MIN_SETUP_SAMPLE:
        flags.append({
            "check": "sample_size",
            "severity": "medium",
            "finding": (
                f"Setup '{setup_tag}' has {sample} closed trades in the journal "
                f"(fewer than {MIN_SETUP_SAMPLE}). Any stats you remember about this "
                "setup are anecdotes; size accordingly."
            ),
        })
    if not setup_tag:
        flags.append({
            "check": "sample_size",
            "severity": "low",
            "finding": (
                "No setup tag. Untagged trades can never accumulate a sample, so "
                "this trade will teach the journal nothing about a repeatable edge."
            ),
        })

    # Overfitting smell: a thesis with too many stacked conditions.
    condition_words = ("and", "plus", "also", "combined with", "as long as", "while")
    conditions = sum(thesis.lower().count(w) for w in condition_words)
    if conditions >= 4:
        flags.append({
            "check": "overfitting",
            "severity": "medium",
            "finding": (
                f"Thesis stacks roughly {conditions} conjunctive conditions. Each "
                "'and' shrinks the historical sample that matches this exact picture — "
                "a classic overfitting smell in discretionary form."
            ),
        })

    # Regime coherence: fighting the classifier is allowed, but say so.
    if reading is not None:
        with_trend = (side == "long" and reading.label.value in ("bull_trend",)) or (
            side == "short" and reading.label.value in ("bear_trend", "stress"))
        if not with_trend:
            flags.append({
                "check": "regime_coherence",
                "severity": "medium",
                "finding": (
                    f"This {side} runs against the current regime reading "
                    f"({reading.label.display}, confidence {reading.confidence:.2f}). "
                    "Counter-regime trades need a reason the regime is wrong or turning — "
                    "does the thesis state one?"
                ),
            })

    # Local LLM critique — additive only, never a substitute for the rules.
    llm_critique = None
    llm_source = "none"
    try:
        client = OllamaClient(config)
        llm_critique = client.review_trade(
            symbol=symbol, side=side, entry_price=entry_price, stop_price=stop_price,
            thesis=thesis, regime_label=reading.label.display if reading else "unknown",
        )
        llm_source = f"ollama:{config.ai.ollama_model}"
    except OllamaUnavailable as exc:
        # Degrade visibly: the verdict says the LLM pass did not run.
        oplog.log("reviewer", "llm_critique", "ollama", None, "skip", str(exc))
        llm_critique = None

    severities = [f["severity"] for f in flags]
    verdict = "blocked" if "high" in severities else (
        "caution" if "medium" in severities else "clear")

    return {
        "verdict": verdict,             # clear | caution | blocked (advisory — human decides)
        "flags": flags,
        "llm_critique": llm_critique,   # None when Ollama was unavailable (said openly)
        "llm_source": llm_source,
        "sizing": asdict(sizing),
        "methodology": (
            "Reviewer second-pass per the strategy-reviewer pattern: overfitting "
            "risk, sample-size adequacy, execution realism, regime coherence."
        ),
    }


def serialize(review: dict) -> str:
    return json.dumps(review)
