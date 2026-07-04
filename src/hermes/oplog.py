"""Operational logging in Hermes' canonical line format.

Every automated action writes one line:

    timestamp · action · source · latency · outcome (ok/retry/fail)

to a per-component log file (logs/<component>.log) — never a shared file —
and mirrors it to stdout so systemd's journal captures it too. A trailing
free-text detail field is allowed after the outcome.

This is deliberately not the stdlib logging module dressed up: the format is
a contract the dashboard and the operator both read, so it is constructed
explicitly and tested (tests/test_oplog.py).
"""

from __future__ import annotations

import sys
import threading
import time
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

SEP = " · "
OUTCOMES = ("ok", "retry", "fail", "skip")

_lock = threading.Lock()
_log_dir: Path | None = None


def init(log_dir: Path) -> None:
    global _log_dir
    log_dir.mkdir(parents=True, exist_ok=True)
    _log_dir = log_dir


def format_line(
    action: str,
    source: str,
    latency_ms: float | None,
    outcome: str,
    detail: str = "",
    *,
    ts: datetime | None = None,
) -> str:
    if outcome not in OUTCOMES:
        raise ValueError(f"outcome must be one of {OUTCOMES}, got {outcome!r}")
    stamp = (ts or datetime.now(UTC)).strftime("%Y-%m-%dT%H:%M:%SZ")
    latency = f"{latency_ms:.0f}ms" if latency_ms is not None else "-"
    parts = [stamp, action, source, latency, outcome]
    if detail:
        parts.append(detail)
    return SEP.join(parts)


def log(
    component: str,
    action: str,
    source: str,
    latency_ms: float | None,
    outcome: str,
    detail: str = "",
) -> str:
    """Write one canonical line to the component's own log file and stdout."""
    line = format_line(action, source, latency_ms, outcome, detail)
    with _lock:
        if _log_dir is not None:
            with open(_log_dir / f"{component}.log", "a", encoding="utf-8") as f:
                f.write(line + "\n")
        print(f"[{component}] {line}", file=sys.stdout, flush=True)
    return line


@contextmanager
def timed(component: str, action: str, source: str):
    """Time a block and log ok/fail with real latency. Failures re-raise —
    Hermes surfaces errors, it never swallows them."""
    start = time.monotonic()

    class _Note:
        detail = ""

    note = _Note()
    try:
        yield note
    except Exception as exc:
        latency = (time.monotonic() - start) * 1000
        log(component, action, source, latency, "fail", f"{type(exc).__name__}: {exc}")
        raise
    latency = (time.monotonic() - start) * 1000
    log(component, action, source, latency, "ok", note.detail)
