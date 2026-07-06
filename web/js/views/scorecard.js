// Model scorecard — the honesty surface that grades Hermes' own models on STORED
// evidence only. Each item is GRADED (enough record to say something, with its
// sample + a nonstationarity caveat), THIN (real mechanism, record too short —
// says so), or NOT_TRACKED (genuinely ungradeable from what Hermes stores, with
// the reason). It shows no fabricated grade. /api/scorecard.

import { api, chip, esc, fmtNum, fmtPct } from "../util.js";

let outletRef = null;
const $ = (s, r = outletRef) => r.querySelector(s);

export default {
  mount(outlet) {
    outletRef = outlet;
    outlet.innerHTML = `
      <div class="view-head"><h1>Scorecard</h1>
        <span class="micro">grading the models on stored evidence — graded · thin · not tracked, never faked</span></div>
      <div id="sc-body"><div class="plate"><p class="micro"><span class="spinner"></span> grading the models…</p></div></div>`;
    load(outlet);
  },
};

async function load(outlet) {
  const body = $("#sc-body", outlet);
  let d;
  try { d = await api("/api/scorecard"); }
  catch (err) { body.innerHTML = `<div class="plate"><div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div></div>`; return; }
  render(outlet, d);
}

// GRADED green · THIN amber · NOT_TRACKED grey
const STATUS = {
  graded: ["ok", "graded"], thin: ["warn", "thin"], not_tracked: ["missing", "not tracked"],
};

function render(outlet, d) {
  const legend = `<div class="plate"><div class="ai-head">
    ${chip("ok", "graded")}<span class="micro">enough stored record to say something — with its sample + caveat</span></div>
    <div class="ai-head" style="margin-top:6px">${chip("warn", "thin")}<span class="micro">real mechanism, record too short to judge yet — the sample is shown</span></div>
    <div class="ai-head" style="margin-top:6px">${chip("missing", "not tracked")}<span class="micro">genuinely ungradeable from what Hermes stores — the reason is named, no number faked</span></div></div>`;

  $("#sc-body", outlet).innerHTML = `
    ${legend}
    <div class="bento">${d.items.map(card).join("")}</div>
    <details class="worksheet"><summary><span class="ws-title">what this scorecard is claiming</span></summary>
      <div class="ws-body">
        <dl class="ws-row"><dt>Claim</dt><dd>${esc(d.honesty.claim)}</dd></dl>
        <dl class="ws-row"><dt>Method</dt><dd>${esc(d.honesty.methodology)}</dd></dl>
        <dl class="ws-row caveat"><dt>Not proven</dt><dd>${esc(d.honesty.caveat)}</dd></dl></div></details>`;
}

function card(it) {
  const [state, label] = STATUS[it.status] ?? ["warn", it.status];
  const sampleTxt = it.status === "not_tracked" ? "" : ` · n=${it.n}`;
  const rows = it.rows.length ? `<div class="sc-rows">${it.rows.map(row).join("")}</div>` : "";
  return `<div class="plate col-6">
    <h2><span class="label-x">${esc(it.title)}</span> ${chip(state, label)}</h2>
    <div class="sc-headline ${it.status}">${esc(it.headline)}${sampleTxt ? `<span class="micro"> ${esc(sampleTxt)}</span>` : ""}</div>
    <p class="micro" style="margin:6px 0">${esc(it.detail)}</p>
    ${it.small_sample && it.status !== "not_tracked" ? `<div class="micro">${chip("warn", "anecdote")} treat as indicative, not conclusive</div>` : ""}
    ${rows}
    <details class="worksheet" style="margin-top:10px"><summary><span class="ws-title">what it grades · what it can't</span></summary>
      <div class="ws-body">
        <dl class="ws-row"><dt>Grades</dt><dd>${esc(it.claim)}</dd></dl>
        <dl class="ws-row caveat"><dt>Caveat</dt><dd>${esc(it.caveat)}</dd></dl></div></details>
  </div>`;
}

// A row shows realized stats when present, else its descriptive note.
function row(r) {
  const hasStats = r.win_rate_pct !== null || r.avg_realized_pct !== null;
  const right = hasStats
    ? `<span class="sc-stat">win ${r.win_rate_pct === null ? "∅" : fmtNum(r.win_rate_pct, 0) + "%"}</span>
       <span class="sc-stat ${(r.avg_realized_pct ?? 0) < 0 ? "neg" : "pos"}">avg ${r.avg_realized_pct === null ? "∅" : fmtPct(r.avg_realized_pct)}</span>`
    : `<span class="sc-stat micro">${esc(r.note || "—")}</span>`;
  return `<div class="sc-row"><span class="sc-label">${esc(r.label)}</span>
    <span class="sc-n micro">n=${r.n}</span><span class="sc-right">${right}</span></div>`;
}
