"""Sector drill — a sector read of the watchlist and the open book.

The default watchlist is largely the SPDR sector ETFs (XLK, XLE, XLF, …), so the
RS board already carries per-sector relative strength. This module composes that,
adds each sector ETF's moving-average structure from cached bars, and overlays the
open book's exposure to show WHERE the book sits against the sector reads:

  * Sector ETFs ranked by Mansfield relative strength vs the benchmark (leading =
    positive Mansfield, lagging = negative) — reusing rs/board verbatim.
  * Each sector's MA stack (close > 50 > 150 > 200) and distance from its 52-week
    range, from cached bars only.
  * The book grouped by the positions' sector tags, best-effort name-matched to a
    sector ETF, so each slug of exposure is labeled a tailwind (in a leading
    sector), a headwind (lagging), or unbenchmarked (no matching ETF).

Coverage is only the sector ETFs actually in your watchlist — not the whole
market — and that is stated. RS is backward-looking; the book's sector tags are
free text matched to ETFs by name heuristically, and unmatched tags are shown, not
force-fit. Everything is % of equity or RS terms; nothing here is a directive.
"""

from __future__ import annotations

from dataclasses import dataclass, field, replace
from datetime import datetime

from ..config import HermesConfig
from ..data import store
from ..regime.indicators import sma
from ..risk import engine as risk
from ..rs import board as rs_board

# The SPDR select-sector ETFs → their sector names.
SECTOR_ETF: dict[str, str] = {
    "XLK": "Technology", "XLF": "Financials", "XLE": "Energy",
    "XLV": "Health Care", "XLI": "Industrials", "XLP": "Consumer Staples",
    "XLU": "Utilities", "XLY": "Consumer Discretionary", "XLB": "Materials",
    "XLRE": "Real Estate", "XLC": "Communication Services",
}
# Best-effort match from a free-text book sector tag → a sector ETF symbol.
_ALIASES: list[tuple[str, str]] = [
    ("technology", "XLK"), ("tech", "XLK"), ("semi", "XLK"), ("software", "XLK"),
    ("financ", "XLF"), ("bank", "XLF"), ("insur", "XLF"),
    ("energy", "XLE"), ("oil", "XLE"), ("gas", "XLE"),
    ("health", "XLV"), ("pharma", "XLV"), ("biotech", "XLV"), ("medical", "XLV"),
    ("industr", "XLI"), ("defense", "XLI"), ("aerospace", "XLI"),
    ("staple", "XLP"), ("consumer staples", "XLP"),
    ("util", "XLU"),
    ("discretion", "XLY"), ("retail", "XLY"), ("consumer discretionary", "XLY"),
    ("material", "XLB"), ("metal", "XLB"), ("mining", "XLB"), ("chemical", "XLB"),
    ("real estate", "XLRE"), ("reit", "XLRE"),
    ("communicat", "XLC"), ("telecom", "XLC"), ("media", "XLC"),
]

LEAD_LAG_BAND = 0.5     # |Mansfield| below this is 'inline', not lead/lag

CLAIM = (
    "A sector read of the watchlist and the book: which SPDR sector ETFs lead or "
    "lag the benchmark on Mansfield relative strength, each sector's trend "
    "structure, and where the open book's exposure sits against those reads."
)
METHODOLOGY = (
    "Sector ETFs (the SPDR XL* family present in the watchlist) ranked by "
    "Mansfield RS vs the benchmark (reused from the RS board), with each ETF's MA "
    "stack from cached bars. The book is grouped by the positions' sector tags and "
    "name-matched to a sector ETF; leading = positive Mansfield, lagging = negative."
)
CAVEAT = (
    "Coverage is only the sector ETFs in your watchlist, not the whole market. RS "
    "is backward-looking — a past tilt, not persistence. Book sector tags are free "
    "text matched to ETFs heuristically; unmatched tags are shown, not force-fit. "
    "Everything is % of equity or RS terms, and nothing here is a directive."
)


def _match_etf(tag: str | None) -> str | None:
    """Best-effort book-tag → sector-ETF match. Longest alias fragment wins, so a
    specific tag ('biotech') beats a generic substring of it ('tech')."""
    if not tag:
        return None
    low = tag.lower()
    for frag, etf in sorted(_ALIASES, key=lambda fe: -len(fe[0])):
        if frag in low:
            return etf
    return None


def _lead_lag(mansfield: float | None) -> str:
    if mansfield is None:
        return "unknown"
    if mansfield > LEAD_LAG_BAND:
        return "leading"
    if mansfield < -LEAD_LAG_BAND:
        return "lagging"
    return "inline"


@dataclass(frozen=True)
class SectorRow:
    symbol: str
    sector: str
    status: str                 # 'ok' | 'missing'
    mansfield: float | None
    verdict: str | None
    lead_lag: str               # 'leading' | 'lagging' | 'inline' | 'unknown'
    close: float | None
    ma_stack: int | None        # 0–3: close>50, 50>150, 150>200
    pct_above_low: float | None
    pct_below_high: float | None
    book_weight_pct: float      # book exposure matched to this sector (% equity)
    source: str | None
    as_of: datetime | None
    staleness: str
    note: str
    slope3: float | None = None     # 3-bar change in the Mansfield RS line
    rs_new_high: bool = False       # RS line at a new 50-bar high
    rs_new_low: bool = False


@dataclass(frozen=True)
class BookSlice:
    tag: str                    # the position's free-text sector tag
    weight_pct: float
    matched_etf: str | None
    matched_sector: str | None
    alignment: str              # 'tailwind' | 'headwind' | 'inline' | 'unbenchmarked'
    mansfield: float | None
    note: str


@dataclass(frozen=True)
class SectorDrill:
    generated_at: datetime
    status: str                 # 'ok' | 'missing'
    note: str
    benchmark: str
    regime_display: str | None
    sectors: list[SectorRow] = field(default_factory=list)
    book: list[BookSlice] = field(default_factory=list)
    covered: list[str] = field(default_factory=list)     # sector ETFs with data
    uncovered: list[str] = field(default_factory=list)   # SPDR sectors not in watchlist
    book_in_leading_pct: float = 0.0
    book_in_lagging_pct: float = 0.0
    book_unbenchmarked_pct: float = 0.0
    claim: str = CLAIM
    methodology: str = METHODOLOGY
    caveat: str = CAVEAT


def _ma_structure(symbol: str) -> tuple[float | None, int | None, float | None, float | None]:
    """(close, ma_stack 0–3, pct_above_52w_low, pct_below_52w_high) from cached bars."""
    bars = store.get_bars(symbol, "1Day", limit=300)
    closes = [b.close for b in bars]
    if not closes:
        return None, None, None, None
    close = closes[-1]
    s50, s150, s200 = sma(closes, 50), sma(closes, 150), sma(closes, 200)
    stack = None
    if None not in (s50, s150, s200):
        stack = int(close > s50) + int(s50 > s150) + int(s150 > s200)
    window = closes[-252:]
    low, high = (min(window), max(window)) if window else (None, None)
    above = round((close / low - 1) * 100, 1) if low else None
    below = round((close / high - 1) * 100, 1) if high else None
    return round(close, 2), stack, above, below


def build_drill(config: HermesConfig) -> SectorDrill:
    board = rs_board.build_board(config)
    regime_display = board.regime_label.display if board.regime_label else None
    by_symbol = {r.symbol: r for r in board.rows}

    watch_etfs = [s for s in config.market.watchlist if s in SECTOR_ETF]
    uncovered = [f"{SECTOR_ETF[s]} ({s})" for s in SECTOR_ETF if s not in config.market.watchlist]

    if not watch_etfs:
        return SectorDrill(
            generated_at=board.ts, status="missing",
            note=("no SPDR sector ETFs (XLK, XLE, …) in the watchlist — there is "
                  "nothing to drill by sector. Missing stays missing, never faked."),
            benchmark=board.benchmark, regime_display=regime_display,
            uncovered=uncovered)

    sectors: list[SectorRow] = []
    covered: list[str] = []
    for sym in watch_etfs:
        row = by_symbol.get(sym)
        close, stack, above, below = _ma_structure(sym)
        mansfield = row.mansfield if row else None
        status = row.status if row else "missing"
        if status == "ok":
            covered.append(SECTOR_ETF[sym])
        sectors.append(SectorRow(
            symbol=sym, sector=SECTOR_ETF[sym], status=status,
            mansfield=mansfield, verdict=row.verdict if row else None,
            lead_lag=_lead_lag(mansfield),
            close=close, ma_stack=stack, pct_above_low=above, pct_below_high=below,
            book_weight_pct=0.0,     # filled in from the book below
            source=row.source if row else None,
            as_of=row.as_of if row else None,
            staleness=row.staleness if row else "missing",
            note=row.note if row else "no cached data for this sector ETF",
            slope3=row.slope3 if row else None,
            rs_new_high=bool(row.rs_new_high) if row else False,
            rs_new_low=bool(row.rs_new_low) if row else False))

    # Book overlay: group open positions by their sector tag, match to an ETF.
    positions = risk.open_positions()
    by_tag: dict[str, float] = {}
    for p in positions:
        tag = (p["sector"] or "").strip() or "Untagged"
        by_tag[tag] = by_tag.get(tag, 0.0) + (p["size_pct_equity"] or 0.0)

    sector_weight: dict[str, float] = {}
    book: list[BookSlice] = []
    lead_pct = lag_pct = unb_pct = 0.0
    for tag, weight in sorted(by_tag.items(), key=lambda kv: -kv[1]):
        etf = _match_etf(tag)
        srow = by_symbol.get(etf) if etf else None
        mansfield = srow.mansfield if srow else None
        if etf is None:
            alignment = "unbenchmarked"
            note = "no sector ETF in the watchlist to benchmark this against"
            unb_pct += weight
        else:
            ll = _lead_lag(mansfield)
            alignment = {"leading": "tailwind", "lagging": "headwind"}.get(ll, "inline")
            mans_txt = mansfield if mansfield is not None else "∅"
            note = f"matched to {SECTOR_ETF[etf]} ({etf}) · Mansfield {mans_txt}"
            sector_weight[etf] = sector_weight.get(etf, 0.0) + weight
            if alignment == "tailwind":
                lead_pct += weight
            elif alignment == "headwind":
                lag_pct += weight
        book.append(BookSlice(
            tag=tag, weight_pct=round(weight, 2), matched_etf=etf,
            matched_sector=SECTOR_ETF.get(etf) if etf else None,
            alignment=alignment, mansfield=mansfield, note=note))

    # Fold matched book weight back onto the sector rows.
    sectors = [
        replace(s, book_weight_pct=round(sector_weight.get(s.symbol, 0.0), 2))
        for s in sectors
    ]
    # Rank: leaders first (highest Mansfield), missing sectors last.
    sectors.sort(key=lambda s: (s.mansfield is None, -(s.mansfield or 0.0)))

    return SectorDrill(
        generated_at=board.ts, status="ok", note="",
        benchmark=board.benchmark, regime_display=regime_display,
        sectors=sectors, book=book, covered=covered, uncovered=uncovered,
        book_in_leading_pct=round(lead_pct, 2),
        book_in_lagging_pct=round(lag_pct, 2),
        book_unbenchmarked_pct=round(unb_pct, 2))
