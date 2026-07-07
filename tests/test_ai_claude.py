"""Cloud client: parses usage, meters nothing itself, degrades visibly, and
never touches the network without a key. No real network — httpx is mocked."""

from __future__ import annotations

import dataclasses

import httpx
import pytest

from hermes.ai import claude as claude_mod
from hermes.ai.claude import ClaudeClient, ClaudeUnavailable
from hermes.config import Secrets


class FakeResponse:
    def __init__(self, payload: dict, *, status_ok: bool = True):
        self._payload = payload
        self._status_ok = status_ok

    def raise_for_status(self):
        if not self._status_ok:
            raise httpx.HTTPStatusError("boom", request=None, response=None)

    def json(self):
        return self._payload


def _client_with_key(config, key="sk-test"):
    cfg = dataclasses.replace(config, secrets=Secrets(anthropic_api_key=key))
    return ClaudeClient(cfg)


def test_no_key_never_touches_network(config, monkeypatch):
    called = {"post": False}
    monkeypatch.setattr(claude_mod.httpx, "post",
                        lambda *a, **k: called.__setitem__("post", True))
    client = ClaudeClient(config)  # sample config has no key
    assert client.api_key == ""
    with pytest.raises(ClaudeUnavailable):
        client.narrate_daily_check("facts")
    assert called["post"] is False


def test_chat_parses_text_and_usage(config, monkeypatch):
    payload = {
        "content": [{"type": "text", "text": "A calm bull day."}],
        "usage": {"input_tokens": 120, "output_tokens": 40},
        "model": "claude-sonnet-5",
    }
    monkeypatch.setattr(claude_mod.httpx, "post", lambda *a, **k: FakeResponse(payload))
    text, usage = _client_with_key(config).narrate_daily_check("facts")
    assert text == "A calm bull day."
    assert usage["input_tokens"] == 120 and usage["output_tokens"] == 40
    assert usage["model"] == "claude-sonnet-5"


def test_http_error_degrades_visibly(config, monkeypatch):
    def _raise(*a, **k):
        raise httpx.ConnectError("no route")
    monkeypatch.setattr(claude_mod.httpx, "post", _raise)
    with pytest.raises(ClaudeUnavailable):
        _client_with_key(config).review_trade(
            symbol="XLK", side="long", entry_price=100.0, stop_price=94.0,
            thesis="Tech leads.", regime_label="Bull Trend")


def test_empty_response_is_unavailable(config, monkeypatch):
    payload = {"content": [], "usage": {"input_tokens": 5, "output_tokens": 0}}
    monkeypatch.setattr(claude_mod.httpx, "post", lambda *a, **k: FakeResponse(payload))
    with pytest.raises(ClaudeUnavailable):
        _client_with_key(config).desk_read("facts")


def test_coach_uses_the_fast_lane(config, monkeypatch):
    seen = {}

    def _capture(url, **kwargs):
        seen["model"] = kwargs["json"]["model"]
        return FakeResponse({"content": [{"type": "text", "text": "ok"}],
                             "usage": {"input_tokens": 1, "output_tokens": 1}})

    monkeypatch.setattr(claude_mod.httpx, "post", _capture)
    client = _client_with_key(config)
    client.coach("How did my pullbacks do?", "n=8 wins 5")
    assert seen["model"] == client.fast_model  # claude-haiku-4-5, not the default


def test_available_probes_without_a_key(config):
    assert ClaudeClient(config).available() is False  # no key → no probe, no network


def test_available_true_on_reachable(config, monkeypatch):
    monkeypatch.setattr(claude_mod.httpx, "get", lambda *a, **k: FakeResponse({}))
    assert _client_with_key(config).available() is True
