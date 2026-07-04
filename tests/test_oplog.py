"""The log-line format is a contract; test it like one."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest

from hermes import oplog


def test_format_line_canonical():
    ts = datetime(2026, 7, 4, 12, 31, 7, tzinfo=UTC)
    line = oplog.format_line("fetch_bars", "alpaca", 132.4, "ok", ts=ts)
    assert line == "2026-07-04T12:31:07Z · fetch_bars · alpaca · 132ms · ok"


def test_format_line_with_detail_and_no_latency():
    ts = datetime(2026, 7, 4, 8, 0, 0, tzinfo=UTC)
    line = oplog.format_line("daily_check", "schedule", None, "fail", "boom", ts=ts)
    assert line == "2026-07-04T08:00:00Z · daily_check · schedule · - · fail · boom"


def test_invalid_outcome_rejected():
    with pytest.raises(ValueError):
        oplog.format_line("x", "y", 1.0, "fine")


def test_per_component_files(tmp_path):
    oplog.init(tmp_path)
    oplog.log("alpha", "a", "s", 1.0, "ok")
    oplog.log("beta", "b", "s", 2.0, "fail", "d")
    assert (tmp_path / "alpha.log").exists()
    assert (tmp_path / "beta.log").exists()
    assert "· a ·" in (tmp_path / "alpha.log").read_text()
    assert "· b ·" in (tmp_path / "beta.log").read_text()


def test_timed_logs_failure_and_reraises(tmp_path):
    oplog.init(tmp_path)
    with pytest.raises(RuntimeError):
        with oplog.timed("gamma", "explode", "test"):
            raise RuntimeError("kaboom")
    content = (tmp_path / "gamma.log").read_text()
    assert "· fail · RuntimeError: kaboom" in content
