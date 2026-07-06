// Weekly Review — renders the real /api/reports/weekly output: the stored
// markdown body plus its honesty block (claim / methodology / caveat), and an
// honest empty state before the first run. (The prototype mocked a structured
// dashboard; the backend's actual product is the markdown review + caveat.)

import { api, chip, esc, fmtNum, fmtPct, fmtTime, renderMarkdown } from "../util.js";

const $ = (s, r) => r.querySelector(s);

async function load(outlet) {
  const body = outlet.querySelector("#wk-body");
  body.innerHTML = `<p class="micro"><span class="spinner"></span> loading…</p>`;
  let r;
  try { r = await api("/api/reports/weekly"); }
  catch (err) { body.innerHTML = `<div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div>`; return; }

  const h = r.honesty || {};
  if (!r.body_md) {
    body.innerHTML = `
      <div class="placeholder">
        <div class="big">No weekly review yet</div>
        <p class="micro">The Sunday portfolio review hasn't run. Trigger it on demand — an empty book is fine:</p>
        <p><button class="btn-primary" id="wk-run">run weekly review now</button></p>
      </div>`;
    outlet.querySelector("#wk-run")?.addEventListener("click", async (ev) => {
      ev.target.disabled = true; ev.target.textContent = "running…";
      try { await api("/api/jobs/weekly_review/run", { method: "POST" }); }
      catch (err) { alert(err.message); }
      load(outlet);
    });
  } else {
    body.innerHTML = `<div class="prose">${renderMarkdown(r.body_md)}</div>`;
  }

  renderStructured(outlet, r.structured);

  outlet.querySelector("#wk-honesty").innerHTML = `
    <div class="eyebrow">what this review proves — and what it does not</div>
    ${h.claim ? `<p style="margin:8px 0 0;font-size:16px;color:var(--ink)">${esc(h.claim)}</p>` : ""}
    <div class="methodology-note">${esc(h.methodology ?? "")}${h.caveat ? `<br>${esc(h.caveat)}` : ""}</div>`;
  outlet.querySelector("#wk-meta").textContent = r.generated_at ? `generated ${fmtTime(r.generated_at)}` : "not yet run";
}

// ── the review as DATA: exposure gauges, correlation heatmap, sector ballast,
//    thesis-staleness — computed live from the current book (vs the stored text).
function renderStructured(outlet, s) {
  const box = $("#wk-structured", outlet);
  if (!s || !s.exposure) { box.innerHTML = ""; return; }
  const ex = s.exposure;
  if (!ex.open_count) {
    box.innerHTML = `<div class="plate"><p class="micro">book is flat — no open positions to review this week.</p></div>`;
    return;
  }
  box.innerHTML = `
    <div class="duo">
      <div class="plate">
        <h2><span class="label-x">Exposure vs limits</span><span class="micro">current book · % of equity</span></h2>
        ${gauge("open risk", ex.open_risk_pct, 0.8 * ex.max_open_risk, ex.max_open_risk)}
        ${gauge("top sector", ex.max_sector_pct, 0.8 * ex.max_sector_limit, ex.max_sector_limit)}
        ${gauge("drawdown", ex.drawdown_pct, 0.7 * ex.max_drawdown, ex.max_drawdown)}
        <div class="micro" style="margin-top:8px">${coherenceLine(s.coherence)}</div>
      </div>
      <div class="plate">
        <h2><span class="label-x">Sector ballast</span><span class="micro">cyclical vs defensive — is there ballast if the tape rolls?</span></h2>
        ${ballast(s)}
      </div>
    </div>
    <div class="plate">
      <h2><span class="label-x">Correlation</span>
        <span class="micro">|ρ| of daily returns · ${s.corr.lookback}d · warn at ≥ ${fmtNum(s.corr.threshold)}</span></h2>
      ${heatmap(s.corr)}
    </div>
    <div class="plate">
      <h2><span class="label-x">Open book · thesis age</span>
        <span class="micro">a thesis left unexamined is unlearned — stale past ${s.stale[0]?.days_held >= 0 ? "45" : "45"} days</span></h2>
      ${staleTable(s.stale)}
    </div>`;
}

function gauge(label, val, warn, limit) {
  const scale = limit * 1.1 || 1;
  const at = (v) => Math.min(100, (v / scale) * 100);
  const lvl = val >= limit ? "breach" : val >= warn ? "warn" : "ok";
  const cls = { breach: "neg", warn: "warn", ok: "" }[lvl];
  return `<div class="wk-gauge">
    <div class="wk-g-head micro"><span>${esc(label)}</span>
      <span class="${cls === "neg" ? "st-serious" : cls === "warn" ? "st-warn" : ""}">${fmtNum(val)}% / ${fmtNum(limit)}%</span></div>
    <div class="wk-g-track">
      <div class="wk-g-fill ${cls}" style="width:${at(val)}%"></div>
      <div class="wk-g-mark warn" style="left:${at(warn)}%"></div>
      <div class="wk-g-mark limit" style="left:${at(limit)}%"></div></div></div>`;
}

function coherenceLine(c) {
  if (!c) return "";
  const k = c.counts || {};
  return `regime coherence: ${chip("ok", `${k.coherent || 0} coherent`)}
    ${chip("warn", `${k.fighting || 0} fighting`)} ${chip("missing", `${k.unknown || 0} unknown`)}`;
}

function ballast(s) {
  const cyc = s.cyclical_pct || 0, def = s.defensive_pct || 0, un = s.untagged_pct || 0;
  const total = cyc + def + un || 1;
  const bar = (label, v, cls) => `<div class="re-row"><span class="re-lab">${label}</span>
    <div class="re-bar"><i class="${cls}" style="width:${(v / Math.max(total, 1) * 100).toFixed(0)}%"></i></div>
    <span class="re-val">${fmtNum(v)}%</span><span class="re-n micro"></span></div>`;
  const warn = def === 0 && cyc > 0
    ? `<div class="micro" style="margin-top:8px">${chip("warn")} 0% defensive — no ballast if the tape rolls; the book is a directional bet.</div>`
    : def > 0 ? `<div class="micro" style="margin-top:8px">${chip("ok")} ${fmtNum(def)}% defensive ballast against a ${fmtNum(cyc)}% cyclical tilt.</div>` : "";
  return `${bar("cyclical", cyc, "neg")}${bar("defensive", def, "pos")}${un ? bar("untagged", un, "warn") : ""}${warn}`;
}

function heatmap(corr) {
  const syms = corr.symbols || [];
  if (syms.length < 2) return `<p class="micro">need ≥2 open positions with cached history to correlate.</p>`;
  const cell = (v) => {
    if (v === null || v === undefined) return `<td class="cx-cell cx-missing" title="missing history">∅</td>`;
    const a = Math.min(0.85, Math.abs(v) * 0.9);
    const hot = Math.abs(v) >= corr.threshold;
    return `<td class="cx-cell ${hot ? "cx-hot" : ""}" style="background:rgba(${v < 0 ? "34,211,238" : "251,113,133"},${a.toFixed(2)})"
      title="ρ=${fmtNum(v)}">${fmtNum(v, 2)}</td>`;
  };
  const head = syms.map((s) => `<th class="num">${esc(s)}</th>`).join("");
  const rows = corr.matrix.map((row, i) => `<tr><th class="cx-from">${esc(syms[i])}</th>${row.map(cell).join("")}</tr>`).join("");
  const wp = corr.worst_pair
    ? `<p class="micro" style="margin-top:8px">worst pair: <strong>${esc(corr.worst_pair[0])}/${esc(corr.worst_pair[1])}</strong>
       ρ=${fmtNum(corr.worst_corr)}${Math.abs(corr.worst_corr) >= corr.threshold ? ` · ${chip("warn", "one bet, two tickers")}` : ""}</p>`
    : "";
  return `<div class="scroll-x"><table class="cx-table"><thead><tr><th></th>${head}</tr></thead><tbody>${rows}</tbody></table></div>${wp}`;
}

function staleTable(stale) {
  if (!stale || !stale.length) return `<p class="micro">no open positions.</p>`;
  const rows = [...stale].sort((a, b) => b.days_held - a.days_held).map((p) => `<tr>
    <td class="sym">${esc(p.symbol)} <span class="micro">${esc(p.side)}</span></td>
    <td class="micro">${esc(p.sector)}</td>
    <td class="num">${fmtNum(p.size_pct, 1)}%</td>
    <td class="num">${p.days_held}d ${p.stale ? chip("warn", "stale") : ""}</td>
    <td class="micro">${esc(p.thesis)}</td></tr>`).join("");
  return `<div class="scroll-x"><table style="min-width:640px"><thead><tr>
    <th>Position</th><th>Sector</th><th class="num">Size</th><th class="num">Held</th><th>Standing thesis</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

export default {
  mount(outlet) {
    outlet.innerHTML = `
      <div class="view-head"><h1>Weekly Review</h1><span class="micro" id="wk-meta"></span></div>
      <div class="plate honesty-hero" id="wk-honesty"></div>
      <div id="wk-structured"></div>
      <div class="plate">
        <h2><span class="label-x">Portfolio review</span>
          <span class="micro">a re-reading, not a new signal — recommends a review this Sunday, never a trade</span></h2>
        <div id="wk-body"></div>
      </div>`;
    load(outlet);
  },
};
