// Terminal — search palette → candle chart (+ 50/150/200-DMA + volume) + key
// stats + thesis-fit-vs-your-book + an optional AI desk read. Every number
// carries its source/as-of; short history renders ∅ missing; the AI degrades
// visibly. /api/instrument, /api/search.

import { api, chip, esc, fmtNum, fmtPct, fmtTime } from "../util.js";
import { candleChart } from "../charts.js";

let searchTimer = null;

export default {
  mount(outlet) {
    outlet.innerHTML = layout();
    wireSearch(outlet);
    const sym = new URLSearchParams((location.hash.split("?")[1] || "")).get("sym");
    load(outlet, (sym || "SPY").toUpperCase());
  },
};

const $ = (s, r) => r.querySelector(s);

function layout() {
  return `
    <div class="view-head"><h1>Terminal</h1>
      <span class="micro">search a ticker → chart · stats · thesis-fit vs your book · desk read</span></div>
    <div class="cmd">
      <span class="p" aria-hidden="true">▸</span>
      <input id="cmd-in" placeholder="ticker — try SPY, XLK…" aria-label="Search a ticker"
        autocomplete="off" spellcheck="false">
      <div class="cmd-matches" id="cmd-matches" hidden></div>
    </div>
    <div id="term-body"></div>`;
}

// ── search palette ───────────────────────────────────────────────────────
function wireSearch(outlet) {
  const input = $("#cmd-in", outlet), box = $("#cmd-matches", outlet);
  const hide = () => { box.hidden = true; box.innerHTML = ""; };

  input.addEventListener("input", () => {
    clearTimeout(searchTimer);
    const q = input.value.trim().toUpperCase();
    if (!q) return hide();
    searchTimer = setTimeout(async () => {
      let res;
      try { res = await api(`/api/search?q=${encodeURIComponent(q)}`); }
      catch { return hide(); }
      const rows = res.results.slice(0, 8);
      if (!rows.length) return hide();
      box.hidden = false;
      box.innerHTML = rows.map((r) => `
        <div class="cmd-match" data-sym="${esc(r.symbol)}" data-has="${r.has_history}">
          <span class="m-sym">${esc(r.symbol)}</span>
          ${r.in_watchlist ? chip("ok", "watchlist") : chip("warn", "off-list")}
          <span class="m-note">${r.has_history ? "history cached" : esc(r.note || "no cache — sync it")}</span>
        </div>`).join("");
      box.querySelectorAll(".cmd-match").forEach((m) =>
        m.addEventListener("click", () => { hide(); input.value = m.dataset.sym; load(outlet, m.dataset.sym); }));
    }, 160);
  });

  input.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") { ev.preventDefault(); const v = input.value.trim().toUpperCase(); if (v) { hide(); load(outlet, v); } }
    if (ev.key === "Escape") hide();
  });
  document.addEventListener("click", (ev) => { if (!ev.target.closest(".cmd")) hide(); });
}

// ── instrument load ──────────────────────────────────────────────────────
async function load(outlet, symbol) {
  history.replaceState(null, "", `#/terminal?sym=${encodeURIComponent(symbol)}`);
  const body = $("#term-body", outlet);
  body.innerHTML = `<div class="plate"><p class="micro"><span class="spinner"></span> loading ${esc(symbol)}…</p></div>`;
  let d;
  try { d = await api(`/api/instrument/${encodeURIComponent(symbol)}`); }
  catch (err) { body.innerHTML = `<div class="plate"><div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div></div>`; return; }

  if (d.status === "missing") {
    body.innerHTML = `<div class="plate"><div class="placeholder">
      <div class="big">${esc(d.symbol)} — ∅ missing</div>
      <p class="micro">${esc(d.note)}</p></div></div>`;
    return;
  }
  body.innerHTML = `
    <div class="duo">
      <div class="plate accent">
        <h2><span class="label-x">${esc(d.symbol)}</span>
          <span class="micro">${esc(d.price_source ?? "—")} · ${esc(fmtTime(d.price_as_of))} ${chip(d.staleness)}</span></h2>
        <div id="term-chart"></div>
        <div class="ma-legend"><span><i style="background:var(--violet)"></i>50-DMA</span>
          <span><i style="background:var(--cyan)"></i>150-DMA</span>
          <span><i style="background:var(--ink-muted)"></i>200-DMA</span></div>
      </div>
      <div class="plate" id="term-fit"></div>
    </div>
    <div class="plate"><h2><span class="label-x">Key stats</span>
      <span class="micro">every figure carries its source + as-of</span></h2><div id="term-stats"></div></div>
    <div class="plate coach" id="term-desk"></div>
    <div class="plate coach" id="term-debate"></div>`;

  candleChart($("#term-chart", outlet), d.series);
  renderFit(outlet, d);
  renderStats(outlet, d);
  renderDesk(outlet, d);
  renderDebate(outlet, d);
}

// ── AI desk debate (opt-in; bull → bear → risk; ends in tension) ──────────
function renderDebate(outlet, d) {
  const el = $("#term-debate", outlet);
  el.innerHTML = `
    <h2><span class="label-x">Desk debate</span>
      <span class="micro">bull vs bear over the computed facts — it ends in the tension, never a call</span></h2>
    <p class="micro">A three-voice debate (bull · bear · risk critique) of ${esc(d.symbol)}, local-first. The model
      rephrases the numbers above and invents none; it never tells you to buy or sell.</p>
    <button class="btn-primary" id="debate-btn" style="margin-top:8px">run the debate (uses the model)</button>
    <div id="debate-out" style="margin-top:10px"></div>`;
  $("#debate-btn", outlet).addEventListener("click", async () => {
    const btn = $("#debate-btn", outlet), out = $("#debate-out", outlet);
    btn.disabled = true; out.innerHTML = `<p class="micro"><span class="spinner"></span> the desk is debating ${esc(d.symbol)}…</p>`;
    let r;
    try { r = await api(`/api/debate/${encodeURIComponent(d.symbol)}`); }
    catch (err) { out.innerHTML = `<div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div>`; btn.disabled = false; return; }
    const db = r.debate;
    if (db && db.status === "ok") {
      out.innerHTML = `<div class="ai-head">${chip("ok", `${db.backend} · ${db.model}`)}</div>${debateBody(db)}`;
    } else {
      out.innerHTML = `<div class="ai-unavail">${chip("warn", "model unavailable")} ${esc(db?.note || "no model answered — the facts above stand without it")}</div>`;
    }
    btn.disabled = false;
  });
}

function debateBody(db) {
  const s = db.sections;
  if (!s) return `<div class="prose" style="white-space:pre-wrap">${esc(db.text)}</div>`;
  const block = (label, cls, text) => text
    ? `<div class="factor ${cls}" style="margin-top:8px"><div class="f-head"><strong>${label}</strong></div>
       <div class="prose" style="white-space:pre-wrap;margin-top:4px">${esc(text)}</div></div>` : "";
  return block("Bull case", "", s.bull) + block("Bear case", "serious", s.bear)
    + block("Risk critique", "warn", s.risk);
}

// ── thesis-fit vs the book ───────────────────────────────────────────────
function renderFit(outlet, d) {
  const el = $("#term-fit", outlet), tf = d.thesis_fit;
  if (!tf || tf.status !== "ok") {
    el.innerHTML = `<h2><span class="label-x">Thesis-fit vs your book</span></h2>
      <div class="ai-unavail">${chip("missing")} ${esc(tf?.cap_note || "thesis-fit needs more history")}</div>`;
    return;
  }
  const pcls = tf.posture.toLowerCase();
  el.innerHTML = `
    <h2><span class="label-x">Thesis-fit vs your book</span>
      <span class="micro">a posture, not a directive — you place every trade</span></h2>
    <div class="fit-ring">
      <div><div class="fit-num ${pcls}">${tf.score}<small style="font-size:16px;color:var(--ink-muted)">/100</small></div></div>
      <div><span class="chip st-${pcls === "allow" ? "good" : pcls === "watch" ? "warn" : "serious"}">
        <i class="st-ico">${pcls === "allow" ? "✓" : pcls === "watch" ? "▲" : "■"}</i>${esc(tf.posture)}</span>
        ${tf.capped ? `<div class="micro" style="margin-top:5px">${esc(tf.cap_note)}</div>` : ""}</div>
    </div>
    ${tf.factors.map((f) => f.points === null ? `
      <div class="factor"><div class="f-head">${chip("missing")} <strong>${esc(f.label)}</strong></div>
        <div class="f-measured">${esc(f.measured)}</div></div>` : `
      <div class="factor ${f.chip === "serious" ? "serious" : f.chip === "warn" ? "warn" : ""}">
        <div class="f-head">${chip(f.chip)} <strong>${esc(f.label)}</strong>
          <span class="f-pts">${fmtNum(f.points, 1)} / ${fmtNum(f.max_points, 0)}</span></div>
        <div class="f-bar"><i style="width:${(f.points / f.max_points * 100).toFixed(0)}%"></i></div>
        <div class="f-measured">${esc(f.measured)}</div>
        <div class="f-caveat">${esc(f.caveat)}</div></div>`).join("")}
    <details class="worksheet" style="margin-top:10px"><summary><span class="ws-title">how this fit is built</span></summary>
      <div class="ws-body"><dl class="ws-row"><dt>Method</dt><dd>${esc(tf.honesty.methodology)}</dd></dl>
        <dl class="ws-row caveat"><dt>Not proven</dt><dd>${esc(tf.honesty.caveat)}</dd></dl></div></details>`;
}

// ── key stats ────────────────────────────────────────────────────────────
function renderStats(outlet, d) {
  const miss = (v) => (v === null || v === undefined ? "∅ missing" : v);
  const cell = (k, v) => `<div class="cell"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`;
  const rsv = d.rs_verdict ? chip({ "HI-CONV": "good", "LONG-OK": "ok", "WATCH": "warn", "SKIP-LAG": "serious" }[d.rs_verdict] ?? "warn", d.rs_verdict) : "∅";
  const tv = d.trend_verdict ? chip({ PASS: "good", NEAR: "warn", NO: "serious" }[d.trend_verdict] ?? "warn", `${d.trend_score}/8 ${d.trend_verdict}`) : "∅";
  $("#term-stats", outlet).innerHTML = `<div class="kv">
    ${cell("last", d.price === null ? "∅ missing" : fmtNum(d.price))}
    ${cell("50-DMA", d.sma50 === null ? "∅" : fmtNum(d.sma50))}
    ${cell("150-DMA", d.sma150 === null ? "∅" : fmtNum(d.sma150))}
    ${cell("200-DMA", d.sma200 === null ? "∅" : fmtNum(d.sma200))}
    ${cell("52w range", d.low_52w === null ? "∅" : `${fmtNum(d.low_52w)}–${fmtNum(d.high_52w)}`)}
    ${cell("vs 52w low", d.pct_above_low === null ? "∅" : fmtPct(d.pct_above_low, 0))}
    ${cell("vs 52w high", d.pct_below_high === null ? "∅" : fmtPct(d.pct_below_high, 0))}
    ${cell("Mansfield RS", d.mansfield === null ? "∅" : `${fmtNum(d.mansfield, 1)}%`)}
    ${cell("RS verdict", rsv)}
    ${cell("Trend Template", tv)}
    ${cell("in book", d.in_book ? `${d.book_side} ${fmtNum(d.book_weight_pct, 1)}%` : "no")}
    ${cell("sector", miss(d.sector))}
  </div>
  <p class="micro" style="margin-top:8px">regime: ${esc(d.regime?.label_display ?? "no reading")} · ${d.bars} daily bars cached</p>`;
}

// ── AI desk read (opt-in; degrades visibly) ──────────────────────────────
function renderDesk(outlet, d) {
  const el = $("#term-desk", outlet);
  el.innerHTML = `
    <h2><span class="label-x">Desk read</span>
      <span class="micro">the model rephrases the computed facts — it invents no numbers</span></h2>
    <p class="micro">An AI read of ${esc(d.symbol)}'s thesis-fit, local-first (cloud only if you allow it). Optional — it never blocks the chart.</p>
    <button class="btn-primary" id="desk-btn" style="margin-top:8px">read the desk (uses the model)</button>
    <div id="desk-out" style="margin-top:10px"></div>`;
  $("#desk-btn", outlet).addEventListener("click", async () => {
    const btn = $("#desk-btn", outlet), out = $("#desk-out", outlet);
    btn.disabled = true; out.innerHTML = `<p class="micro"><span class="spinner"></span> the desk is reading ${esc(d.symbol)}…</p>`;
    let r;
    try { r = await api(`/api/instrument/${encodeURIComponent(d.symbol)}?narrative=1`); }
    catch (err) { out.innerHTML = `<div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div>`; btn.disabled = false; return; }
    const nr = r.narrative;
    if (nr && nr.status === "ok") {
      out.innerHTML = `<div class="ai-head">${chip("ok", `${nr.backend} · ${nr.model}`)}</div>
        <div class="prose" style="white-space:pre-wrap">${esc(nr.text)}</div>`;
    } else {
      out.innerHTML = `<div class="ai-unavail">${chip("warn", "model unavailable")} ${esc(nr?.note || "no model answered — the numbers above are complete without it")}</div>`;
    }
    btn.disabled = false;
  });
}
