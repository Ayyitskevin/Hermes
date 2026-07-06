// Sector drill — the SPDR sector ETFs in the watchlist ranked by Mansfield RS
// (leaders → laggards), each sector's trend structure, and where the open book's
// exposure sits against those reads (tailwind / headwind / unbenchmarked).
// Everything is % of equity or RS terms; coverage is only the sector ETFs you
// actually watch, stated plainly. /api/sector.

import { api, chip, esc, fmtNum, fmtPct, animateCountUps } from "../util.js";

let outletRef = null;
const $ = (s, r = outletRef) => r.querySelector(s);

export default {
  mount(outlet) {
    outletRef = outlet;
    outlet.innerHTML = `
      <div class="view-head"><h1>Sector Drill</h1>
        <span class="micro">sector-ETF relative strength · where the book sits vs the sector reads</span></div>
      <div id="se-body"><div class="plate"><p class="micro"><span class="spinner"></span> drilling by sector…</p></div></div>`;
    load(outlet);
  },
};

async function load(outlet) {
  const body = $("#se-body", outlet);
  let d;
  try { d = await api("/api/sector"); }
  catch (err) { body.innerHTML = `<div class="plate"><div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div></div>`; return; }
  if (d.status !== "ok") {
    body.innerHTML = `<div class="plate"><div class="placeholder">
      <div class="big">Sector Drill — ∅ missing</div><p class="micro">${esc(d.note)}</p></div></div>`;
    return;
  }
  render(outlet, d);
}

const LL = { leading: ["good", "leading"], lagging: ["serious", "lagging"], inline: ["warn", "inline"], unknown: ["missing", "∅"] };
const ALIGN = { tailwind: ["good", "tailwind"], headwind: ["serious", "headwind"], inline: ["warn", "inline"], unbenchmarked: ["missing", "unbenchmarked"] };

function render(outlet, d) {
  $("#se-body", outlet).innerHTML = `
    <div class="plate">
      <h2><span class="label-x">Book vs sectors</span>
        <span class="micro">RS vs ${esc(d.benchmark)} · regime ${esc(d.regime_display ?? "no reading")} · leading = positive Mansfield</span></h2>
      <div class="trio">
        <div class="stat"><div class="k">in leading sectors</div>
          <div class="v count pos" data-cu="${d.book_in_leading_pct}" data-dec="2" data-suf="%">0%</div><div class="sub">tailwind exposure</div></div>
        <div class="stat"><div class="k">in lagging sectors</div>
          <div class="v count ${d.book_in_lagging_pct > 0 ? "neg" : ""}" data-cu="${d.book_in_lagging_pct}" data-dec="2" data-suf="%">0%</div><div class="sub">headwind exposure</div></div>
        <div class="stat"><div class="k">unbenchmarked</div>
          <div class="v count" data-cu="${d.book_unbenchmarked_pct}" data-dec="2" data-suf="%">0%</div><div class="sub">no matching sector ETF</div></div>
      </div>
      ${d.covered.length ? `<p class="micro" style="margin-top:8px">covered: ${d.covered.map(esc).join(" · ")}</p>` : ""}
    </div>

    <div class="plate watchboard">
      <h2><span class="label-x">Sectors</span><span class="micro">ranked by Mansfield RS — leaders first; RS is a past tilt, not persistence</span></h2>
      <div class="scroll-x"><table style="min-width:720px"><thead><tr>
        <th>Sector</th><th>Read</th><th class="num">Mansfield</th><th>Verdict</th>
        <th class="num">MA stack</th><th class="num">vs 52w</th><th class="num">Book</th><th>Freshness</th></tr></thead>
        <tbody id="se-rows"></tbody></table></div></div>

    <div class="plate" id="se-book"></div>
    ${d.uncovered.length ? `<div class="plate"><h2><span class="label-x">Not covered</span>
      <span class="micro">SPDR sectors not in your watchlist — no read is shown rather than a faked one</span></h2>
      <p class="micro">${d.uncovered.map(esc).join(" · ")}</p></div>` : ""}

    <details class="worksheet"><summary><span class="ws-title">what this drill is claiming</span></summary>
      <div class="ws-body">
        <dl class="ws-row"><dt>Claim</dt><dd>${esc(d.honesty.claim)}</dd></dl>
        <dl class="ws-row"><dt>Method</dt><dd>${esc(d.honesty.methodology)}</dd></dl>
        <dl class="ws-row caveat"><dt>Not proven</dt><dd>${esc(d.honesty.caveat)}</dd></dl></div></details>`;

  renderRows(outlet, d);
  renderBook(outlet, d);
  animateCountUps($("#se-body", outlet));
}

function renderRows(outlet, d) {
  $("#se-rows", outlet).innerHTML = d.sectors.map((s) => {
    const [llc, lll] = LL[s.lead_lag] ?? ["missing", "∅"];
    const stack = s.ma_stack === null ? "∅" : `<span class="${s.ma_stack === 3 ? "st-good" : s.ma_stack === 0 ? "st-serious" : ""}">${s.ma_stack}/3</span>`;
    const vs52 = s.pct_below_high === null ? "∅" : `${fmtPct(s.pct_below_high, 0)} vs high`;
    return `<tr>
      <td class="sym">${esc(s.sector)} <span class="micro">${esc(s.symbol)}</span></td>
      <td>${chip(llc, lll)}</td>
      <td class="num ${(s.mansfield ?? 0) < 0 ? "st-serious" : "st-good"}">${s.mansfield === null ? "∅" : `${fmtNum(s.mansfield, 1)}%`}</td>
      <td>${s.verdict ? chip({ "HI-CONV": "good", "LONG-OK": "ok", "WATCH": "warn", "SKIP-LAG": "serious" }[s.verdict] ?? "warn", s.verdict) : "∅"}</td>
      <td class="num">${stack}</td>
      <td class="num micro">${vs52}</td>
      <td class="num">${s.book_weight_pct > 0 ? `${fmtNum(s.book_weight_pct, 1)}%` : "—"}</td>
      <td>${chip(s.staleness)}</td></tr>`;
  }).join("");
}

function renderBook(outlet, d) {
  const el = $("#se-book", outlet);
  if (!d.book.length) {
    el.innerHTML = `<h2><span class="label-x">Book exposure</span></h2>
      <p class="micro">no open positions — nothing to place against the sector reads.</p>`;
    return;
  }
  const maxW = Math.max(...d.book.map((b) => b.weight_pct), 0.0001);
  el.innerHTML = `<h2><span class="label-x">Book exposure by sector tag</span>
    <span class="micro">your positions' tags, name-matched to a sector ETF — unmatched tags shown, not force-fit</span></h2>
    ${d.book.map((b) => {
      const [ac, al] = ALIGN[b.alignment] ?? ["missing", b.alignment];
      const w = (b.weight_pct / maxW * 100).toFixed(0);
      const neg = b.alignment === "headwind";
      return `<div class="factor ${neg ? "serious" : ""}" style="margin-top:8px">
        <div class="f-head">${chip(ac, al)} <strong>${esc(b.tag)}</strong>
          <span class="f-pts">${fmtNum(b.weight_pct, 1)}% of equity</span></div>
        <div class="f-bar"><i style="width:${w}%${neg ? ";background:var(--serious)" : ""}"></i></div>
        <div class="f-measured">${esc(b.note)}</div></div>`;
    }).join("")}`;
}
