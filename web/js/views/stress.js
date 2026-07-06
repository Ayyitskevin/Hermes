// Stress test — shock the current open book against stylized shocks (market
// −5/−10/−20%, all-stops-hit, and a correlations→1 crisis), showing the
// projected drawdown on the 100-based index, which positions hurt most, and
// de-risk POSTURES (never orders). Everything is % of equity. A what-if, not a
// forecast: beta/correlation are backward-looking and the crisis case forces
// correlations to 1 by fiat. /api/stress.

import { api, chip, esc, fmtNum, fmtPct, animateCountUps } from "../util.js";

let outletRef = null;
const $ = (s, r = outletRef) => r.querySelector(s);

export default {
  mount(outlet) {
    outletRef = outlet;
    outlet.innerHTML = `
      <div class="view-head"><h1>Stress</h1>
        <span class="micro">what a shock does to the open book · % of equity · a what-if, never a forecast</span></div>
      <div id="st-body"><div class="plate"><p class="micro"><span class="spinner"></span> shocking the book…</p></div></div>`;
    load(outlet);
  },
};

async function load(outlet) {
  const body = $("#st-body", outlet);
  let d;
  try { d = await api("/api/stress"); }
  catch (err) { body.innerHTML = `<div class="plate"><div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div></div>`; return; }
  if (d.status === "empty") {
    body.innerHTML = `<div class="plate"><div class="placeholder">
      <div class="big">Book is flat</div><p class="micro">${esc(d.note)}</p></div></div>`;
    return;
  }
  render(outlet, d);
}

function render(outlet, d) {
  $("#st-body", outlet).innerHTML = `
    <div class="plate">
      <h2><span class="label-x">Book context</span>
        <span class="micro">betas estimated vs ${esc(d.benchmark)} over ${d.lookback_days} trading days — backward-looking</span></h2>
      <div class="trio">
        <div class="stat"><div class="k">equity index</div>
          <div class="v count" data-cu="${d.current_index}" data-dec="2">100.00</div><div class="sub">drawdown ${fmtNum(d.current_drawdown_pct)}%</div></div>
        <div class="stat"><div class="k">open risk</div>
          <div class="v count" data-cu="${d.open_risk_pct}" data-dec="2" data-suf="%">0%</div><div class="sub">Σ planned risk</div></div>
        <div class="stat"><div class="k">circuit breaker</div>
          <div class="v">${fmtNum(d.max_drawdown_pct)}%</div><div class="sub">max drawdown limit</div></div>
      </div>
    </div>
    <div class="bento" id="st-scen"></div>
    <div class="plate" id="st-hedges"></div>
    <details class="worksheet"><summary><span class="ws-title">what this stress test is claiming</span></summary>
      <div class="ws-body">
        <dl class="ws-row"><dt>Claim</dt><dd>${esc(d.honesty.claim)}</dd></dl>
        <dl class="ws-row"><dt>Method</dt><dd>${esc(d.honesty.methodology)}</dd></dl>
        <dl class="ws-row caveat"><dt>Not proven</dt><dd>${esc(d.honesty.caveat)}</dd></dl></div></details>`;

  $("#st-scen", outlet).innerHTML = d.scenarios.map((s) => scenarioCard(s, d.max_drawdown_pct)).join("");
  renderHedges(outlet, d);
  animateCountUps($("#st-body", outlet));
}

// crisis spans full width; the rest sit two-up
function scenarioCard(s, maxDd) {
  const span = s.key === "crisis" ? "col-12" : "col-6";
  const breach = s.breaches_circuit
    ? chip("breach", "breaches circuit")
    : chip("ok", "within circuit");
  const maxAbs = Math.max(...s.positions.map((p) => Math.abs(p.contribution_pct)), 0.0001);
  const rows = s.positions.map((p) => {
    const w = (Math.abs(p.contribution_pct) / maxAbs * 100).toFixed(0);
    const neg = p.contribution_pct < 0;
    return `<div class="factor ${neg ? "serious" : ""}" style="margin-top:7px">
      <div class="f-head"><strong>${esc(p.symbol)}</strong>
        <span class="micro">${esc(p.side)} · ${fmtNum(p.size_pct, 1)}% ${s.kind === "stops" ? "" : `· β ${fmtNum(p.beta)}${p.beta_estimated ? " est" : ""}`}</span>
        <span class="f-pts ${neg ? "neg" : "pos"}">${fmtPct(p.contribution_pct)}</span></div>
      <div class="f-bar"><i style="width:${w}%${neg ? ";background:var(--serious)" : ""}"></i></div></div>`;
  }).join("");
  return `<div class="plate ${span} ${s.key === "crisis" ? "accent" : ""}">
    <h2><span class="label-x">${esc(s.title)}</span> ${breach}</h2>
    <div class="trio" style="grid-template-columns:1fr 1fr">
      <div class="stat"><div class="k">equity impact</div>
        <div class="v ${s.total_impact_pct < 0 ? "neg" : "pos"}">${fmtPct(s.total_impact_pct)}</div>
        <div class="sub">index → ${fmtNum(s.projected_index)}</div></div>
      <div class="stat"><div class="k">proj. drawdown</div>
        <div class="v ${s.breaches_circuit ? "neg" : ""}">${fmtNum(s.projected_drawdown_pct)}%</div>
        <div class="sub">vs ${fmtNum(maxDd)}% breaker</div></div>
    </div>
    ${rows}</div>`;
}

// ── de-risk postures ────────────────────────────────────────────────────────
const SEV = { serious: "breach", warn: "warn", info: "ok" };
const POSTURE = { "cash-priority": "cash-priority", trim: "trim", diversify: "diversify", note: "note", hold: "hold" };

function renderHedges(outlet, d) {
  $("#st-hedges", outlet).innerHTML = `
    <h2><span class="label-x">De-risk postures</span>
      <span class="micro">context for a human — postures, never orders. Hermes places no trades.</span></h2>
    ${d.hedges.map((h) => `
      <div class="factor ${h.severity === "serious" ? "serious" : h.severity === "warn" ? "warn" : ""}" style="margin-top:9px">
        <div class="f-head">${chip(SEV[h.severity] ?? "ok")}
          <strong>${esc(h.headline)}</strong>
          <span class="f-pts micro">${esc(POSTURE[h.posture] ?? h.posture)}</span></div>
        <div class="f-measured" style="margin-top:5px">${esc(h.rationale)}</div></div>`).join("")}`;
}
