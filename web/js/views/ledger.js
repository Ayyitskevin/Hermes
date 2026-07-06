// Validation ledger — the honest capstone. Every model claim vs what actually
// happened, frozen when it was made: journaled theses resolved to their own
// verdict (confirmed/partial/refuted/pending), and regime reads forward-tested
// against the benchmark for whether the market ALIGNED with them (aligned/mixed/
// diverged/pending — softer language, because a regime label doesn't claim to
// predict). Computed from persisted records only; % / verdicts, never a trade.
// /api/ledger.

import { api, chip, esc, fmtNum, fmtTime } from "../util.js";

let outletRef = null;
const $ = (s, r = outletRef) => r.querySelector(s);

export default {
  mount(outlet) {
    outletRef = outlet;
    outlet.innerHTML = `
      <div class="view-head"><h1>Validation Ledger</h1>
        <span class="micro">every model claim vs what happened — the receipts behind the terminal</span></div>
      <div id="lg-body"><div class="plate"><p class="micro"><span class="spinner"></span> reconciling claims against reality…</p></div></div>`;
    load(outlet);
  },
};

async function load(outlet) {
  const body = $("#lg-body", outlet);
  let d;
  try { d = await api("/api/ledger"); }
  catch (err) { body.innerHTML = `<div class="plate"><div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div></div>`; return; }
  render(outlet, d);
}

// status → [chip-state, label]
const STATUS = {
  confirmed: ["good", "confirmed"], partial: ["warn", "partial"], refuted: ["serious", "refuted"],
  aligned: ["good", "aligned"], mixed: ["warn", "mixed"], diverged: ["serious", "diverged"],
  pending: ["missing", "pending"],
};

function render(outlet, d) {
  const empty = d.total_entries === 0;
  $("#lg-body", outlet).innerHTML = `
    <div class="bento">${d.summaries.map(summaryCard).join("")}</div>
    <div class="plate watchboard">
      <h2><span class="label-x">The ledger</span>
        <span class="micro">${d.total_entries} claims · newest first · each frozen when it was made</span></h2>
      ${empty ? `<p class="micro">no claims yet — journal a trade or run the daily check, and the ledger fills as reality resolves them.</p>`
        : `<div class="scroll-x"><table style="min-width:780px"><thead><tr>
          <th>Kind</th><th>Subject</th><th>Claim</th><th>As of</th><th>Verdict</th><th>What happened</th></tr></thead>
          <tbody id="lg-rows"></tbody></table></div>`}
    </div>
    <details class="worksheet"><summary><span class="ws-title">what this ledger is claiming</span></summary>
      <div class="ws-body">
        <dl class="ws-row"><dt>Claim</dt><dd>${esc(d.honesty.claim)}</dd></dl>
        <dl class="ws-row"><dt>Method</dt><dd>${esc(d.honesty.methodology)}</dd></dl>
        <dl class="ws-row caveat"><dt>Not proven</dt><dd>${esc(d.honesty.caveat)}</dd></dl></div></details>`;
  if (!empty) renderRows(outlet, d);
}

function summaryCard(s) {
  const order = s.kind === "journal"
    ? ["confirmed", "partial", "refuted", "pending"]
    : ["aligned", "mixed", "diverged", "pending"];
  const title = s.kind === "journal" ? "Journal claims" : "Regime reads";
  const sub = s.kind === "journal"
    ? "a journaled thesis IS a claim — resolved to your own verdict on close"
    : "a regime label doesn't claim to predict — this only checks if the market went with it";
  const pills = order.filter((k) => s.counts[k]).map((k) => {
    const [st, lab] = STATUS[k];
    return `${chip(st, `${lab} ${s.counts[k]}`)}`;
  }).join(" ");
  return `<div class="plate col-6">
    <h2><span class="label-x">${title}</span></h2>
    <p class="micro" style="margin:2px 0 8px">${sub}</p>
    <div class="fit-ring">
      <div><div class="fit-num ${s.rate_pct === null ? "" : s.rate_pct >= 50 ? "allow" : "watch"}">
        ${s.rate_pct === null ? "∅" : `${fmtNum(s.rate_pct, 0)}<small style="font-size:15px;color:var(--ink-muted)">%</small>`}</div>
        <div class="micro">${esc(s.rate_label)}${s.resolved ? ` · ${s.resolved} resolved` : ""}</div></div>
      <div style="display:flex;flex-wrap:wrap;gap:5px;align-content:flex-start">${pills || chip("missing", "nothing yet")}</div>
    </div>
    ${s.small_sample && s.resolved ? `<div class="micro" style="margin-top:8px">${chip("warn", "anecdote")} ${esc(s.note)}</div>` : ""}</div>`;
}

function renderRows(outlet, d) {
  $("#lg-rows", outlet).innerHTML = d.entries.map((e) => {
    const [st, lab] = STATUS[e.status] ?? ["missing", e.status];
    const kindChip = e.kind === "journal" ? chip("ok", "journal") : chip("warn", "regime");
    return `<tr>
      <td>${kindChip}</td>
      <td class="sym">${esc(e.subject)}</td>
      <td><div>${esc(e.claim)}</div><div class="micro">${esc(e.detail)}</div></td>
      <td class="micro">${e.as_of ? esc(fmtTime(e.as_of).slice(0, 10)) : "—"}<div>${esc(e.horizon)}</div></td>
      <td>${chip(st, lab)}</td>
      <td class="micro">${esc(e.outcome)}</td></tr>`;
  }).join("");
}
