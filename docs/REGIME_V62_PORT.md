# Porting Regime Label v6.2

Regime Label v6.2 is the owner's classifier — the one genuinely
differentiated Market Regime asset in this project. Its specification lives
outside this repository, so Hermes ships with `reference-v1` (five named
published methods, honestly labeled a placeholder) and this contract for the
real thing. **Hermes does not guess at v6.2**: `regime/v62.py` raises a loud
`NotImplementedError` until the port is real.

## The contract

Implement `RegimeV62Classifier` in `src/hermes/regime/v62.py`:

```python
class RegimeV62Classifier:
    version = "v62"

    def __init__(self, config: HermesConfig): ...

    def classify(
        self,
        benchmark_bars: list[Bar],            # oldest-first daily bars
        watchlist_bars: dict[str, list[Bar]], # per-symbol, oldest-first
    ) -> RegimeReading: ...
```

Requirements, in order of importance:

1. **Port the output faithfully.** Map v6.2's native labels onto
   `RegimeLabel` — or extend the enum if v6.2's vocabulary doesn't collapse
   into four states. NOTE: the frontend strip hardcodes its four lanes
   (`LANES` in `web/js/charts.js`) and renders unknown labels on the RANGE
   lane — extending the enum means extending `LANES` by hand in the same
   change.
2. **Carry v6.2's honesty statement verbatim** into `RegimeReading.honesty`:
   it is *a heuristic derived from historical label-correlation, not a
   backtested edge*. The calibration row renders this string on the
   instrument's face. Do not soften it.
3. **One `Evidence` entry per v6.2 component**, each with:
   - `claim` — what the component asserts, in one plain sentence
   - `methodology` — v6.2's own rule, named as the owner's validated rule
     (this is the "or my own validated rules" branch of the traceability
     requirement)
   - `caveat` — what it does not prove; never empty
   - `status: "missing"` with `signal=None` when an input is unavailable —
     never interpolate
4. **Set `classifier_version = "v62"`** so every stored reading and every
   journal entry's frozen signal state records which brain produced it.
5. If v6.2 has per-label historical stats (hit rates, sample sizes), put
   them in each `Evidence.caveat` or `claim` so the teach-in worksheets can
   show them — the interface teaches; v6.2 should teach its own numbers.

## Switching it on

```toml
# config/hermes.toml
[regime]
classifier = "v62"
```

Nothing else changes: storage, strip, tape, posture, journal freezing, and
the teach-in all run off the `RegimeReading` shape.

## Suggested port tests

- Golden-file test: known input bars → expected v6.2 label sequence
  (port the owner's reference outputs, if any exist, as fixtures).
- Missing-data test: truncated history yields `missing` evidence and reduced
  confidence, not an exception and not a guess.
- Round-trip test: store + reload a reading; evidence survives JSON intact
  (see `tests/test_regime.py::test_reading_roundtrip` for the pattern).
