"""The boundary guard.

Hermes' one non-negotiable: no order-placement code, no broker write access,
no path to a live order. This test statically scans the repository for
anything order-shaped and fails the build if it appears. It is deliberately
paranoid — a false positive costs a minute; a false negative costs the
project its premise.

Hardened after the Phase 3 audit: repo-wide coverage (not just src/ and
web/), case-insensitive matching, non-Alpaca order shapes, an outbound-host
allowlist for source code, and a write-surface lock on the concrete
providers (the classes that actually hold credentials), not just the
Protocol.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).parent.parent
THIS_FILE = Path(__file__).resolve()

# Broker trading hosts (write-capable APIs). The data host is allowed.
FORBIDDEN_HOSTS = [
    "api.alpaca.markets",
    "paper-api.alpaca.markets",
    "broker-api.alpaca.markets",
]

# Order-shaped endpoints/symbols across common broker APIs (Alpaca, Binance,
# Kraken, generic). Matched case-insensitively.
FORBIDDEN_PATTERNS = [
    r"/v2/orders",
    r"/api/v3/order\b",     # Binance
    r"\bAddOrder\b",        # Kraken
    r"\bnewOrder\b",
    r"submit[_-]?order",
    r"place[_-]?order",
    r"cancel[_-]?order",
    r"replace[_-]?order",
    r"create[_-]?order",
    r"OrderRequest",
    r"/orders\b",
]

# Hosts src/ code may talk to. Anything else appearing in a URL fails.
ALLOWED_SRC_HOSTS = {
    "data.alpaca.markets",   # market data (read-only usage, GET only)
    "hist.databento.com",    # historical bars fallback
    "127.0.0.1",             # local Ollama default
    "localhost",
}

EXCLUDED_DIRS = {".git", ".venv", "venv", "__pycache__", ".pytest_cache",
                 ".ruff_cache", "data", "logs", "node_modules", "dist", "build"}
EXCLUDED_SUFFIXES = {".ttf", ".woff", ".woff2", ".png", ".jpg", ".db", ".pyc"}


def iter_repo_text_files():
    """Every tracked-ish text file in the repository, excluding binaries,
    runtime dirs, and this guard file itself (it names the forbidden strings)."""
    for path in REPO.rglob("*"):
        if not path.is_file():
            continue
        if any(part in EXCLUDED_DIRS for part in path.parts):
            continue
        if path.suffix in EXCLUDED_SUFFIXES:
            continue
        if path.resolve() == THIS_FILE:
            continue
        try:
            yield path, path.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue


def test_no_trading_hosts_anywhere():
    hits = []
    for path, text in iter_repo_text_files():
        lowered = text.lower()
        for host in FORBIDDEN_HOSTS:
            if host in lowered:
                hits.append(f"{path}: {host}")
    assert not hits, f"Broker trading host found: {hits}"


def test_no_order_shaped_code_anywhere():
    hits = []
    for path, text in iter_repo_text_files():
        for pattern in FORBIDDEN_PATTERNS:
            for m in re.finditer(pattern, text, flags=re.IGNORECASE):
                line = text[: m.start()].count("\n") + 1
                hits.append(f"{path}:{line}: {pattern}")
    assert not hits, f"Order-shaped code found: {hits}"


def test_src_urls_are_allowlisted():
    """Every URL in src/ must point at an explicitly allowed host — a new
    outbound destination is a deliberate, reviewed decision, never a drive-by."""
    src = REPO / "src"
    hits = []
    for path in src.rglob("*.py"):
        text = path.read_text(encoding="utf-8")
        for m in re.finditer(r"(?i)https?://([a-z0-9.\-]+)", text):
            host = m.group(1).lower()
            if host not in ALLOWED_SRC_HOSTS:
                hits.append(f"{path}: {host}")
    assert not hits, f"URL to non-allowlisted host in src/: {hits}"


def test_alpaca_module_uses_data_host_only():
    text = (REPO / "src" / "hermes" / "data" / "alpaca.py").read_text(encoding="utf-8")
    hosts = {m.group(1).lower()
             for m in re.finditer(r"(?i)https?://([a-z0-9.\-]+)", text)}
    assert hosts == {"data.alpaca.markets"}, (
        f"alpaca.py may only reference the data host, found: {hosts}"
    )


def test_provider_write_surface_locked():
    """The Protocol AND every concrete provider (the classes holding
    credentials) expose exactly the read-only surface — a generic POST helper
    or an order method on any of them fails this lock."""
    from hermes.config import (
        AiConfig,
        BackupConfig,
        DataConfig,
        HermesConfig,
        JournalConfig,
        MarketConfig,
        RegimeConfig,
        RiskConfig,
        ScheduleConfig,
        Secrets,
        ServerConfig,
    )
    from hermes.data.provider import MarketDataProvider
    from hermes.data.registry import PROVIDERS

    proto_methods = {m for m in dir(MarketDataProvider) if not m.startswith("_")}
    assert proto_methods == {"fetch_bars", "fetch_snapshot", "state"}
    assert set(getattr(MarketDataProvider, "__annotations__", {})) == {"name"}

    from pathlib import Path as _P
    cfg = HermesConfig(
        market=MarketConfig(), data=DataConfig(), regime=RegimeConfig(),
        risk=RiskConfig(), journal=JournalConfig(), ai=AiConfig(),
        schedule=ScheduleConfig(), backup=BackupConfig(), server=ServerConfig(),
        secrets=Secrets(), data_dir=_P("/tmp"), log_dir=_P("/tmp"), config_path=None,
    )
    allowed = {"fetch_bars", "fetch_snapshot", "state", "name"}
    for name, cls in PROVIDERS.items():
        instance = cls(cfg)
        public = {
            m for m in dir(instance)
            if not m.startswith("_") and callable(getattr(instance, m))
        } | {a for a in vars(type(instance)).get("__annotations__", {})}
        public.discard("name")
        extra = {m for m in public if m not in allowed}
        assert not extra, (
            f"Provider {name!r} grew write-capable-looking surface: {extra}"
        )
