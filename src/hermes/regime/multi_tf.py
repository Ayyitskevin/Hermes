"""Multi-timeframe regime read (C2) — same classifier, several bar cadences.

Uses cached bars only (no live fetch). The daily-check still owns the
persisted primary reading; this surface is a READ for comparison.
"""

from __future__ import annotations

from ..config import HermesConfig
from ..data import store
from ..data.models import iso, utcnow
from .engine import CLASSIFIERS, build_classifier, latest_reading


def multi_timeframe_read(config: HermesConfig) -> dict:
    tfs = list(dict.fromkeys(config.market.timeframes or ["1Day"]))
    primary = getattr(config.regime, "primary_timeframe", "1Day") or "1Day"
    if primary not in tfs:
        tfs = [primary, *tfs]
    classifier = build_classifier(config)
    rows = []
    for tf in tfs:
        # Warmup length scales with timeframe
        limit = 600 if tf == "1Day" else 400
        bench = store.get_bars(config.market.benchmark, tf, limit=limit)
        watch = {
            s: store.get_bars(s, tf, limit=min(limit, 200))
            for s in config.market.watchlist
        }
        if len(bench) < 50:
            rows.append({
                "timeframe": tf,
                "status": "missing",
                "label": None,
                "label_display": None,
                "score": None,
                "confidence": None,
                "bars": len(bench),
                "note": f"∅ only {len(bench)} {tf} bars cached — run sync",
                "is_primary": tf == primary,
            })
            continue
        reading = classifier.classify(bench, watch)
        rows.append({
            "timeframe": tf,
            "status": "ok",
            "label": reading.label.value,
            "label_display": reading.label.display,
            "score": reading.score,
            "confidence": reading.confidence,
            "classifier_version": reading.classifier_version,
            "bars": len(bench),
            "data_asof": iso(reading.data_asof) if reading.data_asof else None,
            "data_source": reading.data_source,
            "is_primary": tf == primary,
            "note": "",
        })

    labels = {r["label"] for r in rows if r["status"] == "ok" and r["label"]}
    agree = len(labels) == 1 if labels else None
    persisted = latest_reading()
    return {
        "generated_at": iso(utcnow()),
        "classifier": config.regime.classifier,
        "primary_timeframe": primary,
        "rows": rows,
        "agree_across_tf": agree,
        "agreement_note": (
            "all timeframes with data share one label"
            if agree else
            "timeframes disagree — primary daily remains authoritative for the desk"
            if agree is False else
            "not enough multi-TF data to compare"
        ),
        "persisted_primary": {
            "label": persisted.label.value if persisted else None,
            "classifier_version": persisted.classifier_version if persisted else None,
        },
        "available_classifiers": sorted(CLASSIFIERS),
        "honesty": {
            "claim": (
                "Runs the configured classifier on each cached timeframe so the "
                "operator can see whether 4H/weekly structure matches daily."
            ),
            "caveat": (
                "Multi-TF agreement is not edge. Daily remains the default decision "
                "cadence for the journal/risk loop unless you change operating doctrine."
            ),
        },
    }
