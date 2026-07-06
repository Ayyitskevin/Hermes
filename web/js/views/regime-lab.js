// Regime Lab — a deep read of the regime engine. Both classifiers (v62 +
// reference-v1) run live on the SAME cached bars for a side-by-side second
// opinion, each component's evidence is openable, the confidence number is
// broken into its formula, drift vs the last persisted reading is surfaced, and
// the default classifier's transition history (streak · flips · dwell) is drawn.
// Labels compare; scores/confidences are each classifier's own scale. Every
// reading carries its source/as-of; missing stays missing. /api/regime/lab.

import { api, chip, esc, fmtNum, fmtTime, animateCountUps } from "../util.js";
import { regimeStrip } from "../charts.js";

let outletRef = null;
const $ = (s, r = outletRef) => r.querySelector(s);

export default {
  mount(outlet) {
    outletRef = outlet;
    outlet.innerHTML = `
      <div class="view-head"><h1>Regime Lab</h1>
        <span class="micro">both classifiers, live on the same bars · evidence · confidence · transitions</span></div>
      <div id="rl-body"><div class="plate"><p class="micro"><span class="spinner"></span> reading the regime engine…</p></div></div>`;
    load(outlet);
  },
};

async function load(outlet) {
  const body = $("#rl-body", outlet);
  let d;
  try { d = await api("/api/regime/lab"); }
  catch (err) { body.innerHTML = `<div class="plate"><div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div></div>`; return; }
  if (d.status !== "ok") {
    body.innerHTML = `<div class="plate"><div class="placeholder">
      <div class="big">Regime Lab — ∅ missing</div><p class="micro">${esc(d.note)}</p></div></div>`;
    return;
  }
  render(outlet, d);
}

// bullish/bearish/neutral/stress/missing → status-chip state
const wsChip = (s) => ({ bullish: "good", bearish: "serious", neutral: "warn", stress: "breach", missing: "missing" }[s] ?? s);

function render(outlet, d) {
  const body = $("#rl-body", outlet);
  body.innerHTML = `
    ${agreementBanner(d)}
    <div class="duo" id="rl-cards"></div>
    <p class="micro" style="margin:2px 2px 0">Only the <strong>labels</strong> compare across classifiers — each score and
      confidence is on its own scale (see each card's basis). The default is authoritative; the other is a second opinion.</p>
    <div class="plate"><h2><span class="label-x">Transition history</span>
      <span class="micro">${esc(d.default_classifier)} · one reading per daily check · ${d.history_n} readings</span></h2>
      <div id="rl-strip"></div>
      <div id="rl-hist"></div></div>
    <details class="worksheet"><summary><span class="ws-title">what the Lab is claiming</span></summary>
      <div class="ws-body">
        <dl class="ws-row"><dt>Claim</dt><dd>${esc(d.honesty.claim)}</dd></dl>
        <dl class="ws-row"><dt>Method</dt><dd>${esc(d.honesty.methodology)}</dd></dl>
        <dl class="ws-row caveat"><dt>Not proven</dt><dd>${esc(d.honesty.caveat)}</dd></dl></div></details>`;

  $("#rl-cards", outlet).innerHTML = d.classifiers.map(classifierCard).join("");
  regimeStrip($("#rl-strip", outlet), d.history);
  renderHistory(outlet, d);
  animateCountUps(body);
}

// ── agreement + drift banner ────────────────────────────────────────────────
function agreementBanner(d) {
  const agreeChip = d.agree === true ? chip("ok", "classifiers agree")
    : d.agree === false ? chip("warn", "classifiers disagree")
    : chip("missing", "one classifier only");
  const drift = d.persisted.drifted
    ? `<div class="micro" style="margin-top:6px">${chip("warn", "drift")} ${esc(d.persisted.drift_note)}</div>`
    : d.persisted.label_display
      ? `<div class="micro" style="margin-top:6px">${chip("ok")} live default matches the persisted reading (${esc(d.persisted.label_display)}, as of ${esc(fmtTime(d.persisted.asof))})</div>`
      : `<div class="micro" style="margin-top:6px">${chip("missing")} no persisted reading yet — run the daily check</div>`;
  return `<div class="plate accent">
    <div class="ai-head">${agreeChip}<span class="micro">${esc(d.agreement_note)}</span></div>
    ${drift}</div>`;
}

// ── one classifier card ─────────────────────────────────────────────────────
function classifierCard(v) {
  const role = v.is_default ? chip("ok", "default · authoritative") : chip("warn", "second opinion");
  if (v.status !== "ok") {
    return `<div class="plate"><h2><span class="label-x">${esc(v.version)}</span> ${role}</h2>
      <div class="ai-unavail">${chip("missing")} not enough history for this classifier — ${esc(v.honesty)}</div></div>`;
  }
  const conf = v.confidence ?? 0;
  const worksheets = v.evidence.map(evidenceRow).join("");
  return `<div class="plate">
    <h2><span class="label-x">${esc(v.version)}</span> ${role}</h2>
    <div class="rg-sig">
      <div><div class="rg-label">${esc(v.label_display)}</div>
        <div class="rg-sub">score ${signed(v.score)} · ${v.votes_available}/${v.votes_total} components voted</div></div>
      <div class="rg-conf"><div class="v count" data-cu="${conf}" data-dec="2">0.00</div><div class="k">confidence</div></div>
    </div>
    <div class="meter"><div class="meter-label"><span>confidence</span><span>${(conf * 100).toFixed(0)}%</span></div>
      <div class="meter-track"><div class="meter-fill" style="width:${(conf * 100).toFixed(0)}%"></div></div></div>
    <div class="calibration micro">confidence = ${esc(v.confidence_basis)} · inputs as of ${esc(fmtTime(v.data_asof))} · source ${esc(v.data_source)}</div>
    <div class="rl-ev" style="margin-top:10px">${worksheets}</div>
    <div class="calibration micro" style="margin-top:8px">${esc(v.honesty)}</div>
  </div>`;
}

function evidenceRow(e) {
  return `<details class="worksheet"><summary><span class="ws-title">${esc(e.title)}</span>
    ${chip(wsChip(e.status))}<span class="ws-value">${esc(e.value)}</span></summary>
    <div class="ws-body">
      <dl class="ws-row"><dt>Claim</dt><dd>${esc(e.claim)}</dd></dl>
      <dl class="ws-row"><dt>Measured</dt><dd class="mono">${esc(e.value)}${e.signal != null ? ` (vote ${e.signal > 0 ? "+" : ""}${esc(fmtNum(e.signal, 2))})` : ""}</dd></dl>
      <dl class="ws-row"><dt>Method</dt><dd>${esc(e.methodology)}</dd></dl>
      <dl class="ws-row caveat"><dt>Not proven</dt><dd>${esc(e.caveat)}</dd></dl></div></details>`;
}

// ── streak · flips · dwell ──────────────────────────────────────────────────
function renderHistory(outlet, d) {
  const el = $("#rl-hist", outlet);
  if (!d.history_n) { el.innerHTML = `<p class="micro">no readings yet — history accrues one reading per daily check.</p>`; return; }
  const dwellMax = Math.max(...d.dwell.map((x) => x.count), 1);
  const dwellBars = d.dwell.map((x) => `
    <div class="factor" style="margin-top:8px"><div class="f-head">
      <strong>${esc(x.display)}</strong><span class="f-pts">${x.count} · ${fmtNum(x.pct, 0)}%</span></div>
      <div class="f-bar"><i style="width:${(x.count / dwellMax * 100).toFixed(0)}%"></i></div></div>`).join("");
  const flips = d.transitions.filter((t) => t.from_label !== null);
  const flipList = flips.length
    ? flips.slice(-8).reverse().map((t) => `<li class="micro">${esc(fmtTime(t.ts).slice(0, 10))} · ${esc(t.from_display)} → <strong>${esc(t.to_display)}</strong></li>`).join("")
    : `<li class="micro">no label change over the window — one continuous regime</li>`;
  el.innerHTML = `
    <div class="trio" style="margin-top:12px">
      <div class="stat"><div class="k">current streak</div>
        <div class="v count" data-cu="${d.streak_readings}" data-dec="0">0</div><div class="sub">readings at the latest label</div></div>
      <div class="stat"><div class="k">flips</div>
        <div class="v">${flips.length}</div><div class="sub">over ${d.history_n} readings</div></div>
      <div class="stat"><div class="k">sample</div>
        <div class="v">${d.history_n}</div><div class="sub">${d.small_sample ? "anecdote (&lt;20)" : "readings"}</div></div>
    </div>
    ${d.small_sample ? `<div class="micro" style="margin-top:8px">${chip("warn", "small sample")} fewer than 20 readings — treat these transition stats as an anecdote, not a base rate.</div>` : ""}
    <div class="duo" style="margin-top:12px">
      <div><div class="micro" style="margin-bottom:4px">dwell per regime</div>${dwellBars}</div>
      <div><div class="micro" style="margin-bottom:4px">recent flips</div><ul style="list-style:none;padding:0;margin:0;display:grid;gap:5px">${flipList}</ul></div>
    </div>`;
}

const signed = (v, dg = 3) => (v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, dg)}`);
