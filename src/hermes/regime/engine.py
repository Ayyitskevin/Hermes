"""Classifier registry and persistence of regime readings."""

from __future__ import annotations

import json

from .. import db
from ..config import HermesConfig
from ..data.models import iso, parse_iso
from .models import Evidence, RegimeLabel, RegimeReading
from .reference import ReferenceRegimeClassifier
from .v62 import RegimeV62Classifier

CLASSIFIERS = {
    "reference-v1": ReferenceRegimeClassifier,
    "v62": RegimeV62Classifier,
}


def build_classifier(config: HermesConfig):
    name = config.regime.classifier
    if name not in CLASSIFIERS:
        raise ValueError(
            f"Unknown regime classifier {name!r}; known: {sorted(CLASSIFIERS)}"
        )
    return CLASSIFIERS[name](config)


def store_reading(reading: RegimeReading) -> int:
    conn = db.connect()
    cur = conn.execute(
        """INSERT INTO regime_readings
           (ts, label, score, confidence, classifier_version, evidence_json,
            data_asof, data_source, honesty)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            iso(reading.ts), reading.label.value, reading.score, reading.confidence,
            reading.classifier_version, reading.evidence_json(),
            iso(reading.data_asof) if reading.data_asof else "",
            reading.data_source, reading.honesty,
        ),
    )
    conn.commit()
    return int(cur.lastrowid)


def _row_to_reading(r) -> RegimeReading:
    return RegimeReading(
        ts=parse_iso(r["ts"]),
        label=RegimeLabel(r["label"]),
        score=r["score"],
        confidence=r["confidence"],
        classifier_version=r["classifier_version"],
        evidence=[Evidence(**e) for e in json.loads(r["evidence_json"])],
        data_asof=parse_iso(r["data_asof"]) if r["data_asof"] else None,
        data_source=r["data_source"],
        honesty=r["honesty"],
    )


def latest_reading() -> RegimeReading | None:
    r = db.connect().execute(
        "SELECT * FROM regime_readings ORDER BY ts DESC LIMIT 1"
    ).fetchone()
    return _row_to_reading(r) if r else None


def reading_history(limit: int = 90) -> list[RegimeReading]:
    """Most recent readings, oldest-first — feeds the regime timeline strip."""
    rows = db.connect().execute(
        "SELECT * FROM (SELECT * FROM regime_readings ORDER BY ts DESC LIMIT ?) ORDER BY ts ASC",
        (limit,),
    ).fetchall()
    return [_row_to_reading(r) for r in rows]
