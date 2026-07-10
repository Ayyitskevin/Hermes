"""Monthly performance review — regime-conditioned stats once samples exist.

Strictly % / R / index. Below sample floors every bucket is anecdote-grade.
"""

from __future__ import annotations

from collections import defaultdict

from ..config import HermesConfig
from ..data.models import iso, parse_iso, utcnow
from ..journal import service as journal

MIN_TOTAL = 20
MIN_BUCKET = 8


def build_monthly(config: HermesConfig, *, months: int = 6) -> dict:
    closed = journal.list_entries(status="closed", limit=2000)
    by_month: dict[str, list[dict]] = defaultdict(list)
    for e in closed:
        if not e.get("closed_at"):
            continue
        key = parse_iso(e["closed_at"]).strftime("%Y-%m")
        by_month[key].append(e)

    month_keys = sorted(by_month.keys(), reverse=True)[:months]
    month_rows = []
    for key in month_keys:
        es = by_month[key]
        month_rows.append(_stats(key, es))

    # Regime-at-entry buckets across all closed
    by_regime: dict[str, list[dict]] = defaultdict(list)
    by_setup: dict[str, list[dict]] = defaultdict(list)
    for e in closed:
        sig = e.get("signal_state") or {}
        lab = sig.get("label") or "unknown"
        by_regime[lab].append(e)
        by_setup[e.get("setup_tag") or "untagged"].append(e)

    regime_rows = [_stats(k, v) for k, v in sorted(by_regime.items())]
    setup_rows = [_stats(k, v) for k, v in sorted(by_setup.items())]

    n = len(closed)
    return {
        "generated_at": iso(utcnow()),
        "closed_trades": n,
        "sample_status": "GRADED" if n >= MIN_TOTAL else "THIN",
        "note": (
            ""
            if n >= MIN_TOTAL
            else f"n={n} < {MIN_TOTAL}: treat every monthly figure as anecdote, not edge."
        ),
        "months": month_rows,
        "by_regime_at_entry": regime_rows,
        "by_setup": setup_rows,
        "aggregate": _stats("all", closed),
        "honesty": {
            "claim": (
                "Regime-conditioned and monthly aggregates of the resolved journal "
                "on % returns / R-multiples — Pattern A monthly tier, honesty-first."
            ),
            "caveat": (
                f"Buckets with n < {MIN_BUCKET} are anecdote-grade. No dollar figures. "
                "Past months do not imply future edge."
            ),
            "min_total": MIN_TOTAL,
            "min_bucket": MIN_BUCKET,
        },
    }


def _stats(label: str, entries: list[dict]) -> dict:
    n = len(entries)
    if n == 0:
        return {
            "label": label, "n": 0, "win_rate_pct": None, "avg_return_pct": None,
            "avg_alpha_pct": None, "avg_r": None, "thesis_hit_pct": None,
            "sample": "empty",
        }
    rets = [e["realized_return_pct"] for e in entries if e.get("realized_return_pct") is not None]
    alphas = [e["alpha_pct"] for e in entries if e.get("alpha_pct") is not None]
    wins = sum(1 for r in rets if r > 0)
    thesis_yes = sum(1 for e in entries if e.get("thesis_played_out") == "yes")
    r_mults = []
    for e in entries:
        pr = e.get("planned_risk_pct") or 0
        rr = e.get("realized_return_pct")
        if pr and rr is not None and pr > 0:
            # R ≈ realized% / planned_risk% * (size already in return path is not
            # R; approximate trade R as return on risk: realized% of equity /
            # planned_risk% of equity)
            size = e.get("size_pct_equity") or 0
            if size > 0:
                # contribution / risk ≈ (realized * size/100) / planned_risk
                # simpler: price return / stop distance ≈ realized / (planned_risk/size*100)...
                # Use realized_return_pct / (planned_risk_pct / size_pct_equity * 100) no.
                # planned_risk_pct is % equity at risk; position return on equity is
                # realized * size/100. R = equity_pnl% / planned_risk% .
                equity_pnl = rr * (size / 100.0)
                r_mults.append(equity_pnl / pr)
    return {
        "label": label,
        "n": n,
        "win_rate_pct": round(wins / len(rets) * 100.0, 1) if rets else None,
        "avg_return_pct": round(sum(rets) / len(rets), 2) if rets else None,
        "avg_alpha_pct": round(sum(alphas) / len(alphas), 2) if alphas else None,
        "avg_r": round(sum(r_mults) / len(r_mults), 2) if r_mults else None,
        "thesis_hit_pct": round(thesis_yes / n * 100.0, 1),
        "sample": "anecdote" if n < MIN_BUCKET else "usable",
    }
