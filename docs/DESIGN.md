# Hermes — Design

> **Legacy desktop reference — not the active mobile design.** The Station
> direction below documents the frozen `web/` cockpit. Use the
> [mobile product blueprint](mobile/PRODUCT_BLUEPRINT.md) and
> [iOS roadmap](mobile/IOS_ROADMAP.md) for the current iPhone-first experience.

*The visual half of the Phase 1 proposal. Produced in two passes, as
required: three independent design directions were drafted and each was
adversarially critiqued for genericness before this synthesis. What was
rejected, and why, is recorded at the bottom — the critique is part of the
design.*

## Direction: **Station**

A working instrument, daylight-legible, built from the owner's own
professional vocabularies — color-managed neutral surfaces (photography),
observable telemetry (self-hosted systemd), and graded, falsifiable claims
(self-taught systematic trading). Not a terminal, not a portfolio site, not
an editorial page.

## Palette

Machine-validated with the dataviz six-check validator on both surfaces
(lightness band, chroma floor, CVD adjacency, contrast) — receipts below.

| Role | Light | Dark | Name |
|---|---|---|---|
| Page surface | `#F1F4F3` | `#22303A` | Station Grey / Watch Slate |
| Plate surface | `#F8FAFA` | `#2A3944` | — |
| Primary ink | `#1A2127` | `#E3EAED` | Carbon Ink |
| Muted ink | `#5A6268` | `#9DAAB2` | — |
| Hairline | `#C7D1D1` | `#3D4C57` | — |
| **Identity accent** | `#B3266E` | `#CB4A8A` | **Course Magenta** |
| Status: good | `#1E7A44` | `#2E9861` | — |
| Status: warn | `#B58200` | `#C08A1E` | — |
| Status: serious | `#B0350C` | `#CC5A28` | — |
| Status: critical | `#96222A` | `#D14B50` | — |
| Regime tape (constant, both modes) | `#C9CFCC` / `#99A1A4` / `#6A7276` / `#3D4448` | same | bull / range / bear / stress |

Validator results: light set (good/warn/serious/critical/accent on
`#F1F4F3`) — **all four checks pass** (worst adjacent CVD ΔE 18.1 deutan).
Dark set on `#22303A` — **all pass** (CVD 10.6 sits in the 8–12 floor band,
which is legal only with secondary encoding — and every status use in Hermes
ships icon + text label by rule, never color alone).

Color grammar (enforceable, not vibes):

- **Course Magenta = provenance and attention**: focus rings, teach-in
  affordances (dotted underlines), the regime confidence ribbon, links.
  **Banned inside the Limit Rail. Never used for P&L or status.**
- **Status colors are reserved** for state, always icon + label, and hold
  **area-scale monopoly inside the Limit Rail** — elsewhere they may only
  appear as small chips. So the rail always carries the page's chroma mass.
- **The regime tape grays are identical in light and dark mode** — a
  calibration constant, like a gray card taped to the set: a reference must
  not shift with ambient. Regime identity is carried by *position* (strip
  lanes) and *lightness* (tape), never by hue — CVD-proof by construction.
- The dark surface is petrol slate with visible hue, deliberately not
  near-black — the panel's critics flagged two near-black candidates as
  drifting toward the banned "trading app" look, and they were corrected.

## Type

Two OFL faces, vendored into `web/fonts/` (no CDN, license texts included):

- **Archivo** (variable) — the UI voice. Its width axis provides the
  *equipment-label register*: wide, letterspaced caps for state words
  (CLEAR / BREACH, posture words, plate headings) without loading a second
  family.
- **B612 Mono** — every machine fact: prices, timestamps, provenance lines,
  calibration row, tables. Designed for cockpit displays (Airbus/ENAC);
  chosen here for what that actually buys at 10–13px — unambiguous 0/O/1/l,
  open counters, solid tabular alignment. The panel's critics called both
  B612-sans-as-story and IBM-Plex-everywhere reflexive picks; this pairing
  keeps the mono's legibility engineering and gives the UI voice to a face
  with a genuinely useful axis instead.

## Layout — the daily view

A single vertical stack whose order *is* the hierarchy: *limits, then
signal, then evidence, then plumbing.* Sections are **plates** — 2px ink
borders, sharp corners, no shadows, no card grid.

1. **The Limit Rail** (risk state) — first in DOM, the only sticky element,
   owner of the page's largest numerals. See "Risk dominance" below.
2. **The Regime Strip** — the signature element (below).
3. **Posture + Daily report** — allow / restrict / cash-priority, "a posture,
   not a directive," beside the morning report with its narrative section
   visibly marked when the local model was unavailable.
4. **Benchmark chart** with the **regime tape glued to the same x-scale** —
   regime history is an annotation *on* price history, not a separate widget.
5. **Watchboard** — price · freshness chip · 60-day sparkline · provenance,
   for every symbol. Every number wears its source and as-of stamp.
6. **Station log** — per-job evidence: schedule, last run, outcome, and a
   **MISSED** flag computed from the absence of evidence, with a manual
   "run now" path per job.

Mobile: same DOM order, one column; the rail stays sticky and compresses.

## Signature element — the Regime Strip

A strip-chart recorder for market weather. The classifier's states are
horizontal **lanes** (BULL / RANGE / BEAR / STRESS, mono microcaps in the
left gutter); the last ~90 readings draw as a single 2.5px stepped **ink
trace** that jumps lanes on regime flips — identity by *position*, like a
logic-analyzer channel, readable under every kind of color vision with no
color at all. Behind the trace runs the **confidence ribbon** in 18%-opacity
Course Magenta, its half-height tracking the classifier's confidence bar by
bar: a fat ribbon is a confident reading; a ribbon pinched to a hairline is
the classifier saying *don't lean on me* — uncertainty drawn continuously,
honestly. At the right terminus, the **reading head**: current regime in
mono caps, confidence, readings-since-flip — a real button that opens the
teach-in panel. Below, the **calibration row** prints the instrument's own
provenance on its face: classifier version, composite score, inputs as-of,
data source, and its honesty statement ("a heuristic … not a backtested
edge").

## Risk dominance — mechanisms, not vibes

1. **Position & persistence**: the rail is first in DOM and the page's only
   sticky element; it is on screen at every scroll position.
2. **Scale**: the rail owns the only display-size numerals (open risk %,
   equity index). The regime reading head caps a full step smaller.
3. **Color monopoly**: area-scale status color exists only in the rail;
   the signature element is deliberately ink + one 18% ribbon. Even in the
   calm state the rail carries the state word + chip — dominance holds on
   ordinary days, not just during alarms (a direct fix of a panel critique).
4. **Breach**: `body[data-risk=breach]` floods the rail with the critical
   wash and applies `grayscale + opacity` to *everything below it* until the
   breach event is explicitly acknowledged in the rail. The signal layer
   literally cannot compete. No motion involved — dominance by position,
   area, and suppression, so `prefers-reduced-motion` is satisfied by
   construction. (The rail lives outside the filtered subtree — a documented
   DOM constraint, since CSS filters create containing blocks.)

## Teach-in — the disclosure grammar

Every claim-bearing element opens, in place, a **worksheet** (`<details>`,
keyboardable for free) with one fixed four-row template the owner learns
once:

> **CLAIM** — what this observation is evidence for, in one plain sentence.
> **MEASURED** — the actual value that fired, in mono.
> **METHOD** — the named, citable methodology it draws from.
> **NOT PROVEN** — what it does *not* establish. Always present.

The affordance is a dotted Course Magenta underline (magenta = overprint =
"this number has provenance", the nautical-chart convention). Missing data
renders as an explicit `∅ missing` worksheet — absence is displayed, never
papered over.

## Quality floor

Responsive to mobile (single-column collapse, rail compression, horizontal
scroll contained to table/chart containers); visible keyboard focus (2.5px
Course Magenta ring, 2px offset, both modes); `prefers-reduced-motion`
strips all transitions; charts pair hover crosshairs with a keyboard range
scrubber mirroring the same readout (no hover-only information); status is
never color-alone; light and dark are separately validated, not flipped.

---

## The genericness critique — what the panel rejected

Three directions were drafted from different starting points (photographic
instrumentation; field/scientific instruments; annotated field-notes) and
each critiqued against one test: *would a competent designer produce this
part for any similar brief?* All three survived as "distinctive," and all
three had parts that did not:

- **Near-black dark surfaces** asserted as "not near-black" in prose while
  being ~87% black in fact (two directions). → Fixed: Watch Slate `#22303A`
  keeps measurable hue and lightness distance from the terminal look.
- **Calm-state dominance inversion**: one direction's risk rail was so quiet
  that the magenta signature outranked it on ordinary days. → Fixed: the
  rail keeps scale + state word + chroma monopoly in every state.
- **Stock dashboard skeletons** (12-col grid with chart-left/cards-right;
  KPI-band-plus-sidebar) renamed with evocative labels. → Rejected: the
  daily view is a strict vertical stack whose order is the argument.
- **Reflexive type picks** (B612-because-cockpit-story; Plex-because-
  credibility). → Replaced with a pairing argued from what each face does
  at the sizes used.
- **Chroma leaks** (a 30-frame colored contact strip outside the rail that
  broke its own color-monopoly rule). → The regime tape uses the constant
  grays instead; the monopoly holds.
- **Tailwind orange-700 verbatim** inside a "hand-mixed" palette. → All
  status steps re-derived and machine-validated on both surfaces.
- Kept from the panel besides the strip: the posture vocabulary, the
  worksheet grammar (a fusion of two directions' CLAIM/RULE/EVIDENCE ideas),
  the calibration row, constant-hex regime grays, breach-as-suppression, and
  the color grammar. Buildability fixes from the critiques (HTML reading
  head overlaying the SVG rather than sticky-inside-SVG; keyboard scrubbers
  instead of hover-only tooltips; filter/DOM boundary) are all implemented.
