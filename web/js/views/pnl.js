// P&L / attribution — the resolved journal graded on the normalized (100-based)
// equity index. Headline stats + the equity curve + attribution by regime-at-
// entry / setup / sector / side, each bucket ranked by its contribution to the
// index in points. Everything is % of equity or an index — NEVER a dollar.
// Small samples are labeled anecdotes at every level. /api/pnl.

import { api, chip, esc, fmtNum, fmtPct, animateCountUps } from "../util.js";
import { equityCurve } from "../charts.js";

let outletRef = null;
const $ = (s, r = outletRef) => r.querySelector(s);

export default {
  mount(outlet) {
    outletRef = outlet;
    outlet.innerHTML = `
      <div class="view-head"><h1>P&amp;L</h1>
        <span class="micro">the resolved journal on a 100-based equity index · % of equity only, never dollars</span></div>
      <div id="pnl-body"><div class="plate"><p class="micro"><span class="spinner"></span> grading the journal…</p></div></div>`;
    load(outlet);
  },
};

async function load(outlet) {
  const body = $("#pnl-body", outlet);
  let d;
  try { d = await api("/api/pnl"); }
  catch (err) { body.innerHTML = `<div class="plate"><div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div></div>`; return; }
  if (d.status === "empty") {
    body.innerHTML = `<div class="plate"><div class="placeholder">
      <div class="big">Equity index — 100.00</div><p class="micro">${esc(d.note)}</p></div></div>`;
    return;
  }
  render(outlet, d);
}

// index points, signed + colored by sign
const pts = (v) => (v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, 2)} pts`);
const signCls = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

function render(outlet, d) {
  const h = d.headline;
  $("#pnl-body", outlet).innerHTML = `
    <div class="duo">
      <div class="plate accent">
        <h2><span class="label-x">Equity index</span>
          <span class="micro">100 = flat start · position-weighted, compounded on each close</span></h2>
        <div class="fit-ring">
          <div><div class="fit-num ${signCls(h.index_return_pct)}"><span data-cu="${h.index_now}" data-dec="2">100.00</span></div></div>
          <div><div class="v count ${signCls(h.index_return_pct)}" style="font-family:var(--mono);font-weight:700;font-size:20px">${fmtPct(h.index_return_pct)}</div>
            <div class="micro">since the flat start</div>
            ${h.small_sample ? `<div class="micro" style="margin-top:5px">${chip("warn", "anecdote")} ${esc(h.note)}</div>` : ""}</div>
        </div>
        <div id="pnl-curve" style="margin-top:12px"></div>
      </div>
      <div class="plate">
        <h2><span class="label-x">Scorecard</span><span class="micro">every figure is % of equity or an index</span></h2>
        <div class="kv">
          ${cell("closed trades", h.closed_trades)}
          ${cell("max drawdown", h.max_drawdown_pct === null ? "∅" : `${fmtNum(h.max_drawdown_pct)}%`)}
          ${cell("win rate", h.win_rate_pct === null ? "∅" : `${fmtNum(h.win_rate_pct, 0)}%`)}
          ${cell("thesis hit", h.thesis_hit_rate_pct === null ? "∅" : `${fmtNum(h.thesis_hit_rate_pct, 0)}%`)}
          ${cell("avg alpha", h.avg_alpha_pct === null ? "∅" : `${fmtPct(h.avg_alpha_pct)} (n=${h.alpha_sample})`)}
          ${cell("payoff", h.payoff_ratio === null ? "∅" : `${fmtNum(h.payoff_ratio)}×`)}
          ${cell("expectancy", h.expectancy_r === null ? "∅" : `${fmtNum(h.expectancy_r)}R (n=${h.r_sample})`)}
          ${cell("avg win", h.avg_win_pct === null ? "∅" : `${fmtPct(h.avg_win_pct)}`)}
          ${cell("avg loss", h.avg_loss_pct === null ? "∅" : `-${fmtNum(h.avg_loss_pct)}%`)}
          ${cell("best", h.best_pct === null ? "∅" : fmtPct(h.best_pct))}
          ${cell("worst", h.worst_pct === null ? "∅" : fmtPct(h.worst_pct))}
        </div>
      </div>
    </div>
    <div id="pnl-attrib"></div>
    <details class="worksheet"><summary><span class="ws-title">how this P&amp;L is built</span></summary>
      <div class="ws-body">
        <dl class="ws-row"><dt>Claim</dt><dd>${esc(d.honesty.claim)}</dd></dl>
        <dl class="ws-row"><dt>Method</dt><dd>${esc(d.honesty.methodology)}</dd></dl>
        <dl class="ws-row caveat"><dt>Not proven</dt><dd>${esc(d.honesty.caveat)}</dd></dl></div></details>`;

  equityCurve($("#pnl-curve", outlet), d.curve);
  renderAttribution(outlet, d);
  animateCountUps($("#pnl-body", outlet));
}

function cell(k, v) {
  return `<div class="cell"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`;
}

// ── attribution: one plate per dimension, buckets ranked by contribution ────
function renderAttribution(outlet, d) {
  $("#pnl-attrib", outlet).innerHTML = d.attributions.map((a) => {
    const maxAbs = Math.max(...a.groups.map((g) => Math.abs(g.contribution_points)), 0.0001);
    const rows = a.groups.map((g) => {
      const w = (Math.abs(g.contribution_points) / maxAbs * 100).toFixed(0);
      return `<div class="factor ${signCls(g.contribution_points) === "neg" ? "serious" : ""}">
        <div class="f-head">
          <strong>${esc(g.label)}</strong>
          ${g.small_sample ? chip("warn", `n=${g.n} · anecdote`) : chip("ok", `n=${g.n}`)}
          <span class="f-pts ${signCls(g.contribution_points)}">${pts(g.contribution_points)}</span></div>
        <div class="f-bar"><i style="width:${w}%${g.contribution_points < 0 ? ";background:var(--serious)" : ""}"></i></div>
        <div class="f-measured">win ${fmtNum(g.win_rate_pct, 0)}% ·
          avg realized ${g.avg_realized_pct === null ? "∅" : fmtPct(g.avg_realized_pct)} ·
          avg alpha ${g.avg_alpha_pct === null ? "∅" : `${fmtPct(g.avg_alpha_pct)} (n=${g.alpha_sample})`}</div>
      </div>`;
    }).join("");
    return `<div class="plate"><h2><span class="label-x">${esc(a.label)}</span>
      <span class="micro">contribution to the index (points) — largest mover first</span></h2>
      ${rows || `<p class="micro">no closed trades to attribute</p>`}</div>`;
  }).join("");
}
