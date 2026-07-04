"""Regime Label v6.2 — port slot for the owner's classifier.

This is the one genuinely differentiated Market Regime component of Hermes,
and it is NOT here yet: the v6.2 specification lives outside this repository.
Rather than fake it, this module is an explicit, loud placeholder.

The port contract (full details in docs/REGIME_V62_PORT.md):

  * implement `classify(benchmark_bars, watchlist_bars) -> RegimeReading`
  * map v6.2's native labels onto RegimeLabel (or extend the enum)
  * emit one Evidence entry per v6.2 component, each with its claim and caveat
  * carry v6.2's own honesty statement verbatim into `RegimeReading.honesty`:
    it is a heuristic derived from historical label-correlation, not a
    backtested edge — the dashboard must keep saying so

Switch it on in config/hermes.toml with `regime.classifier = "v62"`.
"""

from __future__ import annotations

from ..config import HermesConfig
from ..data.models import Bar
from .models import RegimeReading

VERSION = "v62"


class RegimeV62Classifier:
    version = VERSION

    def __init__(self, config: HermesConfig):
        raise NotImplementedError(
            "Regime Label v6.2 has not been ported into this repository yet. "
            "Hermes refuses to guess at it: run with regime.classifier = "
            "'reference-v1' until the port lands. See docs/REGIME_V62_PORT.md "
            "for the exact contract."
        )

    def classify(
        self, benchmark_bars: list[Bar], watchlist_bars: dict[str, list[Bar]]
    ) -> RegimeReading:
        raise NotImplementedError
