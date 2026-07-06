"""The router's policy: local-first, cloud only when allowed + opted-in, visible
fallback, and never a silent None. Clients are fakes — no network anywhere."""

from __future__ import annotations

import dataclasses

from fastapi.testclient import TestClient

from hermes.ai.claude import ClaudeUnavailable
from hermes.ai.ollama import OllamaUnavailable
from hermes.ai.router import AIRouter, UsageMeter
from hermes.main import create_app


class FakeOllama:
    def __init__(self, up=True):
        self.up = up
        self.calls = 0

    def available(self):
        return self.up

    def _run(self):
        self.calls += 1
        if not self.up:
            raise OllamaUnavailable("local down")
        return "local prose"

    def narrate_daily_check(self, facts_md):
        return self._run()

    def debate(self, facts_md):
        return self._run()


class FakeClaude:
    def __init__(self, up=True):
        self.up = up
        self.calls = 0
        self.model = "claude-sonnet-5"

    def available(self):
        return self.up

    def _run(self):
        self.calls += 1
        if not self.up:
            raise ClaudeUnavailable("cloud down")
        return "cloud prose", {"input_tokens": 100, "output_tokens": 50,
                               "model": "claude-sonnet-5"}

    def narrate_daily_check(self, facts_md):
        return self._run()

    def debate(self, facts_md):
        return self._run()


def _router(config, *, allow_cloud, ollama, claude):
    cfg = dataclasses.replace(config, ai=dataclasses.replace(config.ai,
                                                             allow_cloud=allow_cloud))
    return AIRouter(cfg, ollama=ollama, claude=claude, meter=UsageMeter())


# ── local-first ──────────────────────────────────────────────────────────
def test_local_first_default_task(config):
    oll, cla = FakeOllama(up=True), FakeClaude(up=True)
    r = _router(config, allow_cloud=True, ollama=oll, claude=cla)
    res = r.complete("narrate_daily_check", facts_md="facts")
    assert res.status == "ok" and res.backend == "ollama"
    assert cla.calls == 0  # cloud never touched for a non-opt-in task


# ── cloud only when allowed AND opted-in ──────────────────────────────────
def test_opt_in_task_uses_cloud_when_allowed(config):
    oll, cla = FakeOllama(up=True), FakeClaude(up=True)
    r = _router(config, allow_cloud=True, ollama=oll, claude=cla)
    res = r.complete("debate", facts_md="facts")
    assert res.backend == "claude" and oll.calls == 0


def test_opt_in_task_stays_local_when_cloud_not_allowed(config):
    oll, cla = FakeOllama(up=True), FakeClaude(up=True)
    r = _router(config, allow_cloud=False, ollama=oll, claude=cla)
    res = r.complete("debate", facts_md="facts")
    assert res.backend == "ollama" and cla.calls == 0


def test_prefer_cloud_used_only_when_allowed(config):
    oll, cla = FakeOllama(up=True), FakeClaude(up=True)
    r = _router(config, allow_cloud=True, ollama=oll, claude=cla)
    assert r.complete("narrate_daily_check", prefer="cloud",
                      facts_md="f").backend == "claude"

    oll2, cla2 = FakeOllama(up=True), FakeClaude(up=True)
    r2 = _router(config, allow_cloud=False, ollama=oll2, claude=cla2)
    res = r2.complete("narrate_daily_check", prefer="cloud", facts_md="f")
    assert res.backend == "ollama" and cla2.calls == 0
    assert "allow_cloud is false" in res.note


# ── visible fallback ───────────────────────────────────────────────────────
def test_local_down_falls_back_to_cloud_labeled(config):
    oll, cla = FakeOllama(up=False), FakeClaude(up=True)
    r = _router(config, allow_cloud=True, ollama=oll, claude=cla)
    res = r.complete("narrate_daily_check", facts_md="facts")
    assert res.status == "ok" and res.backend == "claude"
    assert "fell back" in res.note and "ollama" in res.note


def test_both_down_is_visible_unavailable(config):
    oll, cla = FakeOllama(up=False), FakeClaude(up=False)
    r = _router(config, allow_cloud=True, ollama=oll, claude=cla)
    res = r.complete("narrate_daily_check", facts_md="facts")
    assert res.status == "unavailable" and res.text is None
    assert res.note.startswith("model unavailable")


def test_local_down_and_cloud_forbidden_is_unavailable(config):
    oll, cla = FakeOllama(up=False), FakeClaude(up=True)
    r = _router(config, allow_cloud=False, ollama=oll, claude=cla)
    res = r.complete("narrate_daily_check", facts_md="facts")
    assert res.status == "unavailable" and cla.calls == 0


# ── usage accounting ───────────────────────────────────────────────────────
def test_usage_meter_increments_on_cloud(config):
    oll, cla = FakeOllama(up=True), FakeClaude(up=True)
    r = _router(config, allow_cloud=True, ollama=oll, claude=cla)
    r.complete("debate", facts_md="facts")
    snap = r.meter.snapshot()
    assert snap["queries"] == 1 and snap["approx_cost"] > 0


def test_local_answer_does_not_meter(config):
    oll, cla = FakeOllama(up=True), FakeClaude(up=True)
    r = _router(config, allow_cloud=True, ollama=oll, claude=cla)
    r.complete("narrate_daily_check", facts_md="facts")
    assert r.meter.snapshot()["queries"] == 0


# ── status over HTTP (sample config: nothing reachable, no key) ────────────
def test_ai_status_shape_and_visible_unavailable(config):
    client = TestClient(create_app(config, with_scheduler=False))
    s = client.get("/api/ai/status").json()
    assert {b["name"] for b in s["backends"]} == {"ollama", "claude"}
    assert s["allow_cloud"] is False
    assert s["active"] is None                       # nothing usable → honest null
    assert all(b["reachable"] is False for b in s["backends"])
    assert s["session_usage"] == {"queries": 0, "approx_cost": 0.0}


def test_no_cloud_dollars_leak_into_equity_domain(config):
    client = TestClient(create_app(config, with_scheduler=False))
    assert "approx_cost" in client.get("/api/ai/status").text
    dash = client.get("/api/dashboard").text
    assert "approx_cost" not in dash                 # AI cost stays out of %/equity
