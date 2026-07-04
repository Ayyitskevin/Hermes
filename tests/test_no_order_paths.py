"""The boundary guard.

Hermes' one non-negotiable: no order-placement code, no broker write access,
no path to a live order. This test statically scans the source tree for
anything order-shaped and fails the build if it appears. It is deliberately
paranoid — a false positive costs a minute; a false negative costs the
project its premise.
"""

from __future__ import annotations

import re
from pathlib import Path

SRC = Path(__file__).parent.parent / "src"
WEB = Path(__file__).parent.parent / "web"

# Broker trading hosts (write-capable APIs). The data host is allowed.
FORBIDDEN_HOSTS = [
    "api.alpaca.markets",
    "paper-api.alpaca.markets",
    "broker-api.alpaca.markets",
]

# Order-shaped endpoints/symbols from common broker APIs.
FORBIDDEN_PATTERNS = [
    r"/v2/orders",
    r"submit_order",
    r"place_order",
    r"cancel_order",
    r"replace_order",
    r"OrderRequest",
    r"create_order",
    r"/orders\b",
]


def iter_source_files():
    for root in (SRC, WEB):
        for path in root.rglob("*"):
            if path.suffix in {".py", ".js", ".html", ".sql", ".toml"}:
                yield path


def test_no_trading_hosts():
    hits = []
    for path in iter_source_files():
        text = path.read_text(encoding="utf-8")
        for host in FORBIDDEN_HOSTS:
            if host in text:
                hits.append(f"{path}: {host}")
    assert not hits, f"Broker trading host found in source: {hits}"


def test_no_order_endpoints():
    hits = []
    for path in iter_source_files():
        text = path.read_text(encoding="utf-8")
        for pattern in FORBIDDEN_PATTERNS:
            for m in re.finditer(pattern, text):
                line = text[: m.start()].count("\n") + 1
                hits.append(f"{path}:{line}: {pattern}")
    assert not hits, f"Order-shaped code found in source: {hits}"


def test_alpaca_module_uses_data_host_only():
    text = (SRC / "hermes" / "data" / "alpaca.py").read_text(encoding="utf-8")
    hosts = set(re.findall(r"https://([a-z0-9.\-]+)", text))
    assert hosts == {"data.alpaca.markets"}, (
        f"alpaca.py may only reference the data host, found: {hosts}"
    )


def test_provider_protocol_has_no_write_surface():
    from hermes.data.provider import MarketDataProvider

    methods = {m for m in dir(MarketDataProvider) if not m.startswith("_")}
    annotations = set(getattr(MarketDataProvider, "__annotations__", {}))
    assert methods == {"fetch_bars", "fetch_snapshot", "state"}, (
        "MarketDataProvider grew unexpected surface — verify it stays read-only: "
        f"{methods}"
    )
    assert annotations == {"name"}, f"unexpected protocol attributes: {annotations}"
