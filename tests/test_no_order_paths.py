"""The boundary guard.

Hermes' one non-negotiable: no order-placement code, no broker write access,
no path to a live order. This test statically scans the repository for
anything order-shaped and fails the build if it appears. It is deliberately
paranoid — a false positive costs a minute; a false negative costs the
project its premise.

Phase-6 evolution (method-aware RO): the paper trading host may appear ONLY
inside ``src/hermes/broker_ro/``, and only as GET. Live / broker-API hosts
remain fully forbidden. Order-shaped paths remain forbidden everywhere.
"""

from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).parent.parent
THIS_FILE = Path(__file__).resolve()
BROKER_RO_DIR = (REPO / "src" / "hermes" / "broker_ro").resolve()

# Live / multi-tenant write-capable hosts — never allowed anywhere.
FORBIDDEN_HOSTS_ABSOLUTE = [
    "api.alpaca.markets",
    "broker-api.alpaca.markets",
]

# Paper trading host: allowed ONLY inside broker_ro/ (read-only package).
PAPER_HOST = "paper-api.alpaca.markets"

# Order-shaped endpoints/symbols across common broker APIs (Alpaca, Binance,
# Kraken, generic). Matched case-insensitively. Repo-wide, including broker_ro.
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

# Hosts src/ code may talk to. Paper host is further restricted by path.
ALLOWED_SRC_HOSTS = {
    "data.alpaca.markets",   # market data (read-only usage, GET only)
    "hist.databento.com",    # historical bars fallback
    "127.0.0.1",             # local Ollama default
    "localhost",
    "api.anthropic.com",     # Anthropic Messages API (inference, not broker)
    # Public crypto market data (C4) — OHLCV only, no trading hosts.
    "api.binance.com",
    "api.exchange.coinbase.com",
    "api.kraken.com",
    # Paper trading host — ONLY inside broker_ro/ (enforced below).
    PAPER_HOST,
}

# Public methods the sealed RO client may expose (write-surface lock).
BROKER_RO_ALLOWED = {
    "fetch_positions_pct", "available", "source_name", "sync_to_cache",
    "fetch_fills", "propose_from_fills",
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


def _in_broker_ro(path: Path) -> bool:
    try:
        path.resolve().relative_to(BROKER_RO_DIR)
        return True
    except ValueError:
        return False


def test_no_absolute_forbidden_trading_hosts():
    """Live/broker-API hosts are banned everywhere.

    Uses a host-boundary check so ``paper-api.alpaca.markets`` (sealed RO) does
    not false-positive on the substring ``api.alpaca.markets``.
    """
    hits = []
    for path, text in iter_repo_text_files():
        lowered = text.lower()
        for host in FORBIDDEN_HOSTS_ABSOLUTE:
            # Do not match inside a longer hostname (paper-api.…).
            if re.search(rf"(?<![a-z0-9-]){re.escape(host)}", lowered):
                hits.append(f"{path}: {host}")
    assert not hits, f"Broker trading host found: {hits}"


def test_paper_host_only_inside_broker_ro():
    """paper-api may appear only in the sealed RO package (or this guard)."""
    hits = []
    for path, text in iter_repo_text_files():
        if PAPER_HOST not in text.lower():
            continue
        if _in_broker_ro(path):
            continue
        # Docs/skills may discuss the Phase-6 precondition by name — only
        # source under src/ outside broker_ro is a hard fail.
        if "src" in path.parts and path.suffix == ".py":
            hits.append(str(path))
    assert not hits, f"Paper trading host outside broker_ro/: {hits}"


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
            # Paper host only inside broker_ro/
            if host == PAPER_HOST and not _in_broker_ro(path):
                hits.append(f"{path}: paper host outside broker_ro")
    assert not hits, f"URL to non-allowlisted host in src/: {hits}"


def test_alpaca_data_module_uses_data_host_only():
    text = (REPO / "src" / "hermes" / "data" / "alpaca.py").read_text(encoding="utf-8")
    hosts = {m.group(1).lower()
             for m in re.finditer(r"(?i)https?://([a-z0-9.\-]+)", text)}
    assert hosts == {"data.alpaca.markets"}, (
        f"alpaca.py may only reference the data host, found: {hosts}"
    )


def test_broker_ro_is_get_only_and_surface_locked():
    """Sealed RO client: only GET against paper host; public surface locked."""
    mod = REPO / "src" / "hermes" / "broker_ro" / "alpaca_paper.py"
    text = mod.read_text(encoding="utf-8")
    # Must not issue write verbs against the paper host.
    for verb in ("httpx.post", "httpx.put", "httpx.patch", "httpx.delete",
                 "requests.post", "requests.put", "requests.delete"):
        assert verb not in text, f"broker_ro uses write verb {verb}"
    # Must use httpx.get for transport.
    assert "httpx.get" in text

    from pathlib import Path as _P

    from hermes.broker_ro.alpaca_paper import ALLOWED_METHODS, AlpacaPaperRO
    from hermes.config import (
        AiConfig,
        BackupConfig,
        BrokerROConfig,
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

    cfg = HermesConfig(
        market=MarketConfig(), data=DataConfig(), regime=RegimeConfig(),
        risk=RiskConfig(), journal=JournalConfig(), ai=AiConfig(),
        schedule=ScheduleConfig(), backup=BackupConfig(),
        broker_ro=BrokerROConfig(enabled=True),
        server=ServerConfig(),
        secrets=Secrets(), data_dir=_P("/tmp"), log_dir=_P("/tmp"), config_path=None,
    )
    client = AlpacaPaperRO(cfg)
    public = {
        m for m in dir(client)
        if not m.startswith("_") and callable(getattr(client, m))
    }
    public.discard("name")
    extra = public - ALLOWED_METHODS - BROKER_RO_ALLOWED
    assert not extra, f"broker_ro grew unexpected surface: {extra}"
    assert ALLOWED_METHODS == BROKER_RO_ALLOWED


def test_provider_write_surface_locked():
    """The Protocol AND every concrete provider (the classes holding
    credentials) expose exactly the read-only surface — a generic POST helper
    or an order method on any of them fails this lock."""
    from hermes.config import (
        AiConfig,
        BackupConfig,
        BrokerROConfig,
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
        schedule=ScheduleConfig(), backup=BackupConfig(),
        broker_ro=BrokerROConfig(),
        server=ServerConfig(),
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
