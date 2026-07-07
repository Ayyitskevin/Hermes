// Journal — propose → reviewer second-pass → commit → close → resolve, plus
// per-setup expectancy computed client-side from resolved entries. The AI
// coach is stubbed visibly until its endpoint lands (a later phase); the flow
// itself binds only to the existing journal endpoints.

import { api, chip, esc, fmtNum, fmtPct, fmtTime, preferParam } from "../util.js";

const $ = (s, r = document) => r.querySelector(s);
let proposed = null;   // raw params; commit re-runs the proposal server-side
let openSetup = null;  // drilled-into setup tag

export default {
  mount(outlet) {
    outlet.innerHTML = layout();
    $("#propose-form", outlet).addEventListener("submit", (ev) => onPropose(ev, outlet));
    wireCoach(outlet);
    refresh(outlet);
  },
};

function wireCoach(outlet) {
  const input = $("#jr-ask-in", outlet), btn = $("#jr-ask-btn", outlet), out = $("#jr-ask-out", outlet);
  if (!input) return;
  const run = async () => {
    const q = input.value.trim();
    if (!q) return;
    btn.disabled = true; out.innerHTML = `<p class="micro"><span class="spinner"></span> the coach is reading your resolved trades…</p>`;
    let r;
    try { r = await api(`/api/coach?q=${encodeURIComponent(q)}${preferParam()}`); }
    catch (err) { out.innerHTML = `<div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div>`; btn.disabled = false; return; }
    out.innerHTML = r.status === "ok"
      ? `<div class="ai-head">${chip("ok", `${r.backend} · ${r.model}`)}</div><div class="prose" style="white-space:pre-wrap">${esc(r.text)}</div>`
      : `<div class="ai-unavail">${chip("warn", "model unavailable")} ${esc(r.note || "no model answered — your resolved stats below stand without it")}</div>`;
    btn.disabled = false;
  };
  btn.addEventListener("click", run);
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") run(); });
  outlet.querySelectorAll(".ask-chip").forEach((c) =>
    c.addEventListener("click", () => { input.value = c.dataset.q; run(); }));
}

function layout() {
  return `
  <div class="view-head"><h1>Journal</h1>
    <span class="micro">was the call right ≠ did it make money — three separate questions</span></div>

  <div class="plate coach">
    <h2><span class="label-x">Journal coach</span>
      <span class="micro">answers only from your own resolved trades — never advice to place a trade</span></h2>
    <div class="ask-row">
      <span class="p" aria-hidden="true">▸</span>
      <input id="jr-ask-in" placeholder="ask about your own resolved trades — where's my edge? the leak?" aria-label="Ask the journal coach">
      <button class="btn-primary" id="jr-ask-btn">ask</button>
    </div>
    <div class="ask-chips">${["Where does my edge live?", "What's my biggest leak?", "Which setup should I stop taking?"]
      .map((q) => `<button class="ask-chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
    <div id="jr-ask-out"></div>
    <p class="micro">The coach reads only your resolved history and reflects on it — it never tells you what to trade next. Local-first; degrades visibly.</p>
  </div>

  <div class="plate">
    <h2><span class="label-x">Propose</span>
      <span class="micro">two steps by design: reviewer verdict first, commit second</span></h2>
    <div class="duo">
      <form id="propose-form" class="form-grid" style="align-content:start">
        <div class="field"><label for="j-sym">symbol</label><input id="j-sym" name="symbol" required maxlength="10"></div>
        <div class="field"><label for="j-side">side</label>
          <select id="j-side" name="side"><option value="long">long</option><option value="short">short</option></select></div>
        <div class="field"><label for="j-entry">entry price</label><input id="j-entry" name="entry_price" type="number" step="0.01" min="0.01" required></div>
        <div class="field"><label for="j-stop">stop price</label><input id="j-stop" name="stop_price" type="number" step="0.01" min="0.01" required></div>
        <div class="field"><label for="j-sector">sector <span style="opacity:.6">(optional)</span></label><input id="j-sector" name="sector"></div>
        <div class="field"><label for="j-setup">setup tag <span style="opacity:.6">(optional)</span></label><input id="j-setup" name="setup_tag"></div>
        <div class="field field-wide"><label for="j-thesis">thesis — what must happen, and which level does it defend?</label>
          <textarea id="j-thesis" name="thesis" required minlength="10"></textarea></div>
        <button class="btn-primary field-wide" type="submit">run reviewer + critique</button>
      </form>
      <div id="verdict"><p class="micro">Submit a proposal to see the reviewer's second-pass verdict, sizing, and frozen signal state.</p></div>
    </div>
  </div>

  <div class="plate"><h2><span class="label-x">Performance</span>
    <span class="micro">under 20 closed trades stays anecdote-grade</span></h2><div id="performance"></div></div>

  <div class="plate"><h2><span class="label-x">Setups</span>
    <span class="micro">per-setup expectancy in R — click a row to drill in ▸</span></h2>
    <div class="scroll-x"><table class="tbl" style="min-width:640px"><thead><tr>
      <th>Setup</th><th class="num">n</th><th class="num">Win</th><th class="num">Thesis-hit</th>
      <th class="num">Avg α</th><th class="num">Expectancy</th><th>Verdict</th></tr></thead>
      <tbody id="setups-body"></tbody></table></div>
    <div id="setup-detail"></div></div>

  <div class="plate"><h2><span class="label-x">Open</span>
    <span class="micro">signal state + reviewer verdict frozen at entry</span></h2>
    <div class="scroll-x"><table class="tbl" style="min-width:720px"><thead><tr>
      <th class="num">#</th><th>Trade</th><th class="num">Entry</th><th class="num">Stop</th>
      <th class="num">Size</th><th class="num">Risk</th><th>Thesis / signal at entry</th><th></th></tr></thead>
      <tbody id="open-body"></tbody></table></div></div>

  <div class="plate"><h2><span class="label-x">Resolved</span>
    <span class="micro">realized vs benchmark vs thesis — three separate questions</span></h2>
    <div class="scroll-x"><table class="tbl" style="min-width:760px"><thead><tr>
      <th class="num">#</th><th>Trade</th><th>Held</th><th class="num">Realized</th>
      <th class="num">Benchmark</th><th class="num">Alpha</th><th>Thesis</th><th>Resolution</th></tr></thead>
      <tbody id="closed-body"></tbody></table></div></div>`;
}

async function refresh(outlet) {
  let j;
  try { j = await api("/api/journal"); }
  catch (err) { $("#performance", outlet).innerHTML = `<div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div>`; return; }
  const open = j.entries.filter((e) => e.status === "open");
  const closed = j.entries.filter((e) => e.status === "closed");
  renderPerformance(outlet, j.performance);
  renderSetups(outlet, closed);
  renderOpen(outlet, open, j.stale_open || []);
  renderClosed(outlet, closed);
}

// ── Propose / verdict / commit ─────────────────────────────────────────────
async function onPropose(ev, outlet) {
  ev.preventDefault();
  const f = ev.target;
  const body = {
    symbol: f.symbol.value.trim().toUpperCase(), side: f.side.value,
    entry_price: parseFloat(f.entry_price.value), stop_price: parseFloat(f.stop_price.value),
    thesis: f.thesis.value.trim(),
    sector: f.sector.value.trim() || null, setup_tag: f.setup_tag.value.trim() || null,
  };
  $("#verdict", outlet).innerHTML = `<p class="micro"><span class="spinner"></span> running sizing + reviewer second-pass…</p>`;
  try {
    const p = await api("/api/journal/propose", { method: "POST", body: JSON.stringify(body) });
    proposed = body; renderVerdict(outlet, p);
  } catch (err) {
    proposed = null;
    $("#verdict", outlet).innerHTML = `<div class="verdict v-blocked">${chip("fail")} ${esc(err.message)}</div>`;
  }
}

function renderVerdict(outlet, p) {
  const r = p.review;
  const flags = (r.flags || []).map((fl) =>
    `<li><strong>${esc(fl.check)}</strong> (${esc(fl.severity)}): ${esc(fl.finding)}</li>`).join("");
  $("#verdict", outlet).innerHTML = `
    <div class="verdict v-${esc(r.verdict)}">
      <p>${chip(r.verdict)} <strong class="label-x">Reviewer verdict: ${esc(r.verdict)}</strong></p>
      <p class="mono" style="font-size:12.5px">size ${fmtNum(p.sizing.size_pct_equity)}% of equity ·
        planned risk ${fmtNum(p.sizing.planned_risk_pct)}% · stop ${fmtNum(p.sizing.stop_distance_pct)}% away${
        p.sizing.capped_by ? ` · capped by ${esc(p.sizing.capped_by)}` : ""}</p>
      ${flags ? `<ul style="font-size:13px">${flags}</ul>` : `<p class="micro">no flags raised</p>`}
      ${r.llm_critique
        ? `<div style="border-left:3px solid var(--violet-ink);background:rgba(139,108,255,.08);border-radius:0 10px 10px 0;padding:9px 12px;margin:8px 0">
             <div class="eyebrow" style="color:var(--violet-ink)">◆ model critique · ${esc(r.llm_source || "")}</div>
             <p style="margin:5px 0 0;color:var(--ink-2)">${esc(r.llm_critique)}</p></div>`
        : `<p class="micro">${chip("warn", "local model skipped")} the rule checks above still apply.</p>`}
      <p class="micro">signal frozen at entry: ${esc(p.signal_state.label ?? "no reading")} ·
        conf ${esc(fmtNum(p.signal_state.confidence))} · ${esc(p.signal_state.classifier_version ?? "")}</p>
      <button class="btn-primary" id="commit-btn">commit entry${
        r.verdict === "blocked" ? " (overriding a blocked verdict — recorded forever)"
        : r.verdict === "caution" ? " (cautions travel with the entry)" : ""}</button>
    </div>`;
  $("#commit-btn", outlet).addEventListener("click", async () => {
    const res = await api("/api/journal/commit", { method: "POST", body: JSON.stringify(proposed) });
    const rv = res.review?.verdict;
    $("#verdict", outlet).innerHTML =
      `<div class="verdict v-clear">${chip("ok")} committed as entry #${res.id}${
        rv && rv !== "clear" ? ` — reviewer verdict at commit: ${esc(rv)} (recorded)` : ""}</div>`;
    $("#propose-form", outlet).reset(); proposed = null; refresh(outlet);
  });
}

// ── Open / closed ──────────────────────────────────────────────────────────
function renderOpen(outlet, entries, staleIds) {
  $("#open-body", outlet).innerHTML = entries.length ? entries.map((e) => `
    <tr>
      <td class="num">#${e.id}</td>
      <td class="sym"><strong>${esc(e.symbol)}</strong> ${esc(e.side)}
        ${staleIds.includes(e.id) ? chip("stale", "stale thesis") : ""}</td>
      <td class="num">${fmtNum(e.entry_price)}</td>
      <td class="num">${fmtNum(e.stop_price)}</td>
      <td class="num">${fmtNum(e.size_pct_equity, 1)}%</td>
      <td class="num">${fmtNum(e.planned_risk_pct)}%</td>
      <td>${esc(e.thesis.slice(0, 140))}${e.thesis.length > 140 ? "…" : ""}
        <div class="micro">signal at entry: ${esc(e.signal_state?.label ?? "—")} · reviewer: ${esc(e.review?.verdict ?? "—")}</div></td>
      <td><details><summary>close</summary>
        <form class="close-form" data-id="${e.id}" style="display:grid;gap:8px;margin-top:8px;min-width:200px">
          <div class="field"><label>exit price</label><input name="exit_price" type="number" step="0.01" min="0.01" required></div>
          <div class="field"><label>thesis played out?</label>
            <select name="thesis_played_out"><option>yes</option><option>partial</option><option>no</option></select></div>
          <div class="field"><label>what happened vs the thesis</label><textarea name="resolution_note" required minlength="5"></textarea></div>
          <button class="btn-primary" type="submit">close &amp; resolve</button>
        </form></details></td>
    </tr>`).join("")
    : `<tr><td colspan="8" class="micro">no open positions</td></tr>`;

  outlet.querySelectorAll(".close-form").forEach((form) =>
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const b = {
        exit_price: parseFloat(form.exit_price.value),
        thesis_played_out: form.thesis_played_out.value,
        resolution_note: form.resolution_note.value.trim(),
      };
      try {
        const res = await api(`/api/journal/${form.dataset.id}/close`, { method: "POST", body: JSON.stringify(b) });
        alert(`Resolved: ${fmtPct(res.realized_return_pct)} realized · ` +
          `alpha ${res.alpha_pct === null ? "unavailable (no benchmark bars)" : fmtPct(res.alpha_pct)} · ` +
          `equity index ${fmtNum(res.equity_index, 1)}`);
        refresh(outlet);
      } catch (err) { alert(err.message); }
    }));
}

const signCls = (v) => (v === null || v === undefined ? "" : v >= 0 ? "pos" : "neg");

function renderClosed(outlet, entries) {
  $("#closed-body", outlet).innerHTML = entries.length ? entries.map((e) => `
    <tr>
      <td class="num">#${e.id}</td>
      <td class="sym"><strong>${esc(e.symbol)}</strong> ${esc(e.side)}</td>
      <td class="micro">${esc(fmtTime(e.opened_at).slice(0, 10))} → ${esc(fmtTime(e.closed_at).slice(0, 10))}</td>
      <td class="num ${signCls(e.realized_return_pct)}">${fmtPct(e.realized_return_pct)}</td>
      <td class="num">${e.benchmark_return_pct === null ? "—" : fmtPct(e.benchmark_return_pct)}</td>
      <td class="num ${signCls(e.alpha_pct)}">${e.alpha_pct === null ? "—" : fmtPct(e.alpha_pct)}</td>
      <td>${chip(e.thesis_played_out === "yes" ? "good" : e.thesis_played_out === "partial" ? "warn" : "serious", `thesis: ${e.thesis_played_out}`)}</td>
      <td class="micro">${esc(e.resolution_note ?? "")}</td>
    </tr>`).join("")
    : `<tr><td colspan="8" class="micro">no resolved trades yet</td></tr>`;
}

// ── Performance + per-setup expectancy ─────────────────────────────────────
function renderPerformance(outlet, p) {
  if (!p || p.closed_trades === 0) {
    $("#performance", outlet).innerHTML = `<p class="micro">${esc(p?.note ?? "no closed trades yet")}</p>`;
    return;
  }
  $("#performance", outlet).innerHTML = `
    <p class="mono">closed ${p.closed_trades} · win rate ${fmtNum(p.win_rate_pct, 1)}% ·
      thesis hit rate ${fmtNum(p.thesis_hit_rate_pct, 1)}% ·
      avg alpha ${p.avg_alpha_pct === null ? "—" : fmtPct(p.avg_alpha_pct)} (n=${p.alpha_sample})</p>
    ${p.note ? `<p class="micro">${chip("warn", "small sample")} ${esc(p.note)}</p>` : ""}`;
}

function expectancyBySetup(closed) {
  const groups = {};
  for (const e of closed) {
    const tag = e.setup_tag || "untagged";
    (groups[tag] ||= []).push(e);
  }
  return Object.entries(groups).map(([tag, es]) => {
    const rs = es.map((e) => (e.planned_risk_pct ? e.realized_return_pct / e.planned_risk_pct : null))
      .filter((v) => v !== null && !Number.isNaN(v));
    const exp = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
    const wins = es.filter((e) => e.realized_return_pct > 0).length;
    const hits = es.filter((e) => e.thesis_played_out === "yes").length;
    const alphas = es.map((e) => e.alpha_pct).filter((v) => v !== null && v !== undefined);
    const avgA = alphas.length ? alphas.reduce((a, b) => a + b, 0) / alphas.length : null;
    const n = es.length;
    const verdict = exp === null ? "missing" : exp < 0 ? "serious" : (exp >= 0.5 && n >= 3) ? "good" : "warn";
    const word = exp === null ? "∅" : exp < 0 ? "cut it" : (exp >= 0.5 && n >= 3) ? "keeping" : "building";
    return { tag, n, winPct: (wins / n) * 100, hitPct: (hits / n) * 100, avgA, exp, verdict, word };
  }).sort((a, b) => (b.exp ?? -99) - (a.exp ?? -99));
}

function renderSetups(outlet, closed) {
  const setups = expectancyBySetup(closed);
  $("#setups-body", outlet).innerHTML = setups.length ? setups.map((s) => `
    <tr class="clickable" data-setup="${esc(s.tag)}">
      <td class="sym">${esc(s.tag)}</td>
      <td class="num">${s.n}</td>
      <td class="num">${fmtNum(s.winPct, 0)}%</td>
      <td class="num">${fmtNum(s.hitPct, 0)}%</td>
      <td class="num ${signCls(s.avgA)}">${s.avgA === null ? "—" : fmtPct(s.avgA)}</td>
      <td class="num ${signCls(s.exp)}"><strong>${s.exp === null ? "∅" : `${s.exp >= 0 ? "+" : ""}${s.exp.toFixed(2)}R`}</strong></td>
      <td>${chip(s.verdict, s.word)} <span style="color:var(--violet-ink)">▸</span></td>
    </tr>`).join("")
    : `<tr><td colspan="7" class="micro">no resolved trades yet — expectancy needs closed entries with a planned-risk stamp</td></tr>`;

  outlet.querySelectorAll("[data-setup]").forEach((row) =>
    row.addEventListener("click", () => {
      openSetup = openSetup === row.dataset.setup ? null : row.dataset.setup;
      renderSetupDetail(outlet, closed);
    }));
  renderSetupDetail(outlet, closed);
}

// Expectancy conditioned on the regime FROZEN at entry — does this setup only
// work in its home regime? Uses each entry's signal_state.label (never re-derived).
const REGIME_DISP = { bull_trend: "Bull trend", chop: "Rangebound", bear_trend: "Bear trend", stress: "Stress" };
function regimeBreakdown(es) {
  const groups = {};
  for (const e of es) {
    const lab = e.signal_state?.label || "no reading";
    (groups[lab] ||= []).push(e);
  }
  const rows = Object.entries(groups).map(([lab, xs]) => {
    const rs = xs.map((e) => (e.planned_risk_pct ? e.realized_return_pct / e.planned_risk_pct : null))
      .filter((v) => v !== null && !Number.isNaN(v));
    const exp = rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : null;
    const wins = xs.filter((e) => e.realized_return_pct > 0).length;
    return { lab: REGIME_DISP[lab] || lab, n: xs.length, exp, winPct: (wins / xs.length) * 100 };
  }).sort((a, b) => (b.exp ?? -99) - (a.exp ?? -99));
  if (rows.length < 2) return "";   // only interesting when the setup spans regimes
  const mx = Math.max(...rows.map((r) => Math.abs(r.exp ?? 0)), 0.5);
  const best = rows[0], worst = rows[rows.length - 1];
  const insight = (best.exp ?? 0) > 0 && (worst.exp ?? 0) < 0
    ? `◆ this setup earns its edge in <strong>${esc(best.lab)}</strong> (${best.exp.toFixed(2)}R) and bleeds in
       <strong>${esc(worst.lab)}</strong> (${worst.exp.toFixed(2)}R) — a home-regime setup taken out of regime.`
    : `◆ expectancy conditioned on the regime frozen at entry.`;
  return `<div class="regime-exp">
    <div class="sz-sub" style="margin-top:4px">Expectancy by regime at entry</div>
    ${rows.map((r) => `<div class="re-row">
      <span class="re-lab">${esc(r.lab)}</span>
      <div class="re-bar"><i class="${(r.exp ?? 0) < 0 ? "neg" : "pos"}" style="width:${Math.min(100, Math.abs(r.exp ?? 0) / mx * 100).toFixed(0)}%"></i></div>
      <span class="re-val ${(r.exp ?? 0) < 0 ? "st-serious" : "st-good"}">${r.exp === null ? "∅" : `${r.exp >= 0 ? "+" : ""}${r.exp.toFixed(2)}R`}</span>
      <span class="re-n micro">n=${r.n} · win ${fmtNum(r.winPct, 0)}%</span></div>`).join("")}
    <p class="micro" style="margin-top:6px">${insight}</p></div>`;
}

function renderSetupDetail(outlet, closed) {
  const box = $("#setup-detail", outlet);
  if (!openSetup) { box.innerHTML = ""; return; }
  const es = closed.filter((e) => (e.setup_tag || "untagged") === openSetup);
  const s = expectancyBySetup(es)[0];
  box.innerHTML = `
    <div class="setup-detail">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">
        <strong class="label-x">${esc(openSetup)}</strong> ${chip(s.verdict, s.word)}
        <a href="#" id="setup-clear" style="margin-left:auto">← all setups</a></div>
      <p class="micro">expectancy = mean(realized ÷ planned-risk) over ${s.n} resolved trade${s.n === 1 ? "" : "s"} =
        <strong>${s.exp === null ? "∅ missing" : `${s.exp >= 0 ? "+" : ""}${s.exp.toFixed(2)}R per trade`}</strong>${
        s.n < 30 ? ` · ${chip("warn", "anecdote-grade")}` : ""}</p>
      ${regimeBreakdown(es)}
      <div class="scroll-x"><table class="tbl" style="min-width:480px"><thead><tr>
        <th>Trade</th><th class="num">Realized</th><th class="num">α</th><th>Thesis</th><th class="num">R</th></tr></thead>
        <tbody>${es.map((e) => {
          const R = e.planned_risk_pct ? e.realized_return_pct / e.planned_risk_pct : null;
          return `<tr><td class="sym">${esc(e.symbol)}</td>
            <td class="num ${signCls(e.realized_return_pct)}">${fmtPct(e.realized_return_pct)}</td>
            <td class="num ${signCls(e.alpha_pct)}">${e.alpha_pct === null ? "—" : fmtPct(e.alpha_pct)}</td>
            <td>${chip(e.thesis_played_out === "yes" ? "good" : e.thesis_played_out === "partial" ? "warn" : "serious", e.thesis_played_out)}</td>
            <td class="num ${signCls(R)}">${R === null ? "∅" : `${R >= 0 ? "+" : ""}${R.toFixed(2)}R`}</td></tr>`;
        }).join("")}</tbody></table></div>
    </div>`;
  $("#setup-clear", outlet).addEventListener("click", (ev) => { ev.preventDefault(); openSetup = null; renderSetupDetail(outlet, closed); });
}
