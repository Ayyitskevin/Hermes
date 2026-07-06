// Desk — the hub. The dominant risk rail lives in the shell (global); the Desk
// carries the posture hero, a % / equity-index P&L snapshot (never dollars),
// the regime signature + teach-in, the daily AI briefing, links out, and the
// Watchboard / Leadership / Screener plates + station log. Every number carries
// its source and as-of; missing stays missing.

import { api, chip, esc, fmtNum, fmtPct, fmtTime, renderMarkdown, animateCountUps, preferParam } from "../util.js";
import { sparkline, regimeStrip, priceChart } from "../charts.js";
import { onDashboard, dashboard, refreshDashboard } from "../store.js";

let outletRef = null, unsub = null;
let jperf = null, aiActive = undefined, rsData = null, scrData = null;

export default {
  mount(outlet) {
    outletRef = outlet;
    jperf = null; aiActive = undefined; rsData = null; scrData = null;
    outlet.innerHTML = skeleton();
    unsub = onDashboard((data, err) => onData(data, err));
    loadSide();
    if (!dashboard()) refreshDashboard();
  },
  unmount() { if (unsub) unsub(); unsub = null; outletRef = null; },
};

const $ = (id) => outletRef?.querySelector(id);

function skeleton() {
  return `
    <div class="view-head"><h1>Desk</h1><span class="micro" id="dk-meta"></span></div>
    <div class="bento">
      <div class="plate hero col-7" id="dk-hero"></div>
      <div class="plate col-5" id="dk-book"></div>
      <div class="plate col-5" id="dk-regime"></div>
      <div class="plate col-7" id="dk-briefing"></div>
      <div class="plate col-7" id="dk-chart">
        <h2><span class="label-x" id="dk-chart-title">Benchmark</span>
          <span class="micro">close + the regime tape on a shared x-scale</span></h2>
        <div id="dk-chart-body"></div></div>
      <div class="plate col-5" id="dk-strip">
        <h2><span class="label-x">Regime signature</span>
          <span class="micro">the last ~90 readings · lane = state, ribbon = confidence</span></h2>
        <div id="dk-strip-body"></div></div>
      <div class="plate col-12" id="dk-surfaces"></div>
    </div>
    <div class="plate watchboard" id="dk-watch">
      <h2><span class="label-x">Watchboard</span><span class="micro">every price carries its source + as-of</span></h2>
      <div class="scroll-x"><table style="min-width:640px"><thead><tr>
        <th>Symbol</th><th class="num">Last</th><th>Freshness</th><th>60 days</th><th>Provenance</th></tr></thead>
        <tbody id="dk-watch-body"></tbody></table></div></div>
    <div class="plate watchboard" id="dk-rs">
      <h2><span class="label-x">Leadership</span><span class="micro">Mansfield RS vs the benchmark — recommends reviews, never trades</span></h2>
      <div class="scroll-x"><table style="min-width:680px"><thead><tr>
        <th>Symbol</th><th>Verdict</th><th class="num">Mansfield</th><th class="num">3-bar Δ</th>
        <th>RS range</th><th>Freshness</th></tr></thead><tbody id="dk-rs-body"></tbody></table></div>
      <div class="calibration micro" id="dk-rs-cal"></div></div>
    <div class="plate watchboard" id="dk-scr">
      <h2><span class="label-x">Screener</span><span class="micro">Minervini Trend Template — candidates for review, never setups</span></h2>
      <div class="scroll-x"><table style="min-width:600px"><thead><tr>
        <th>Symbol</th><th>Verdict</th><th class="num">Score</th><th>Failing criteria</th><th>Freshness</th></tr></thead>
        <tbody id="dk-scr-body"></tbody></table></div>
      <div class="calibration micro" id="dk-scr-cal"></div></div>
    <div class="plate" id="dk-ops">
      <h2><span class="label-x">Station log</span><span class="micro">silence is not evidence — a missing run shows as MISSED</span></h2>
      <div id="dk-ops-body"></div></div>`;
}

function onData(data, err) {
  if (!data) {
    $("#dk-hero").innerHTML = `<div><div class="eyebrow" style="color:rgba(255,255,255,.8)">Desk</div>
      <div class="posture-line">Dashboard unreachable</div><p class="why">${esc(err?.message ?? "")}</p></div>`;
    return;
  }
  $("#dk-meta").textContent = `updated ${fmtTime(data.generated_at)}`;
  renderHero(data); renderBook(); renderRegime(data); renderBriefing();
  renderChart(data); renderStrip(data);
  renderSurfaces(); renderWatchboard(data); renderOps(data);
  animateCountUps(outletRef);
}

function loadSide() {
  api("/api/journal").then((j) => { jperf = j.performance; renderBook(); animateCountUps(outletRef); }).catch(() => {});
  api("/api/ai/status").then((s) => {
    aiActive = s.active ? (s.backends.find((b) => b.name === s.active)?.model ?? null) : null;
    renderBriefing();
  }).catch(() => { aiActive = null; renderBriefing(); });
  api("/api/rs/board").then((b) => { rsData = b; renderLeadership(); })
    .catch((e) => { const el = $("#dk-rs-body"); if (el) el.innerHTML = `<tr><td colspan="6" class="micro">FETCH FAILED — ${esc(e.message)}</td></tr>`; });
  api("/api/screener").then((s) => { scrData = s; renderScreener(); })
    .catch((e) => { const el = $("#dk-scr-body"); if (el) el.innerHTML = `<tr><td colspan="5" class="micro">FETCH FAILED — ${esc(e.message)}</td></tr>`; });
}

const signed = (v, d = 2) => (v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, d)}`);

// ── Hero (posture) ─────────────────────────────────────────────────────────
function renderHero(data) {
  const p = data.posture || {};
  const cls = { allow: "posture-allow", restrict: "posture-restrict", "cash-priority": "posture-cash" }[p.posture] || "";
  const headline = { allow: "You're clear to trade", restrict: "Restricted — A-grade setups only",
                     "cash-priority": "Capital preservation is the trade", unknown: "No reading yet" }[p.posture] || esc(p.posture ?? "—");
  const qual = { allow: "size-disciplined", restrict: "reduced size", "cash-priority": "no new risk" }[p.posture] || "";
  const chk = (data.risk.checks || []).find((c) => /open.?risk/i.test(c.kind));
  let ring = "";
  if (chk) {
    const obs = parseFloat(chk.observed), lim = parseFloat(chk.limit);
    if (lim) {
      const pct = Math.min((obs / lim) * 100, 100), dash = (pct / 100 * 339.29).toFixed(1);
      ring = `<div class="ring-wrap"><svg class="ring-svg" viewBox="0 0 128 128" role="img" aria-label="Open-risk budget used ${Math.round(pct)}%">
        <circle class="track" cx="64" cy="64" r="54"></circle>
        <circle class="arc" cx="64" cy="64" r="54" style="stroke-dasharray:${dash} 999"></circle>
        <text class="rc" x="64" y="61" text-anchor="middle" font-size="22" data-cu="${Math.round(pct)}" data-suf="%">0%</text>
        <text x="64" y="80" text-anchor="middle" font-size="9" fill="rgba(255,255,255,.82)">of budget</text></svg></div>`;
    }
  }
  $("#dk-hero").className = `plate hero col-7 ${cls}`;
  $("#dk-hero").innerHTML = `
    <div style="max-width:360px">
      <div class="eyebrow">Risk · outranks the desk</div>
      <div class="posture-line">${headline}</div>
      <span class="posture-chip"><span class="pw">${esc((p.posture || "—").toUpperCase())}</span>${qual ? `<span class="pq">${esc(qual)}</span>` : ""}</span>
      <p class="why">A posture, not a directive — you place every trade. ${esc(p.why ?? "")}</p>
    </div>${ring}`;
}

// ── Book (% / equity-index P&L snapshot — never dollars) ───────────────────
function renderBook() {
  const data = dashboard(); if (!data) return;
  const r = data.risk;
  const perf = (jperf && jperf.closed_trades)
    ? `<p class="micro">resolved ${jperf.closed_trades} · win ${fmtNum(jperf.win_rate_pct, 0)}% ·
        avg α ${jperf.avg_alpha_pct === null ? "—" : fmtPct(jperf.avg_alpha_pct)} (n=${jperf.alpha_sample})${
        jperf.note ? ` · ${chip("warn", "small sample")}` : ""}</p>`
    : `<p class="micro">${jperf ? "no resolved trades yet" : "…"} — full attribution lands on the P&L surface (Phase F)</p>`;
  $("#dk-book").innerHTML = `
    <h2><span class="label-x">Book</span><span class="micro">% of equity &amp; a 100-based index — never dollars</span></h2>
    <div class="trio">
      <div class="stat"><div class="k">equity index</div>
        <div class="v count" data-cu="${r.equity_index ?? 100}" data-dec="1">—</div><div class="sub">100 = flat start</div></div>
      <div class="stat"><div class="k">drawdown</div>
        <div class="v count ${r.drawdown_pct > 0 ? "neg" : ""}" data-cu="${r.drawdown_pct ?? 0}" data-dec="1" data-suf="%">—</div><div class="sub">from rolling peak</div></div>
      <div class="stat"><div class="k">open risk</div>
        <div class="v count" data-cu="${r.open_risk_pct ?? 0}" data-dec="2" data-suf="%">—</div><div class="sub">Σ planned risk</div></div>
    </div>${perf}`;
  animateCountUps($("#dk-book"));
}

// ── Benchmark chart (close + regime tape) + regime signature strip ─────────
function renderChart(data) {
  const bench = (data.watchlist || [])[0];   // watchlist is [benchmark, …]
  const box = $("#dk-chart-body");
  if (!box) return;
  const titleEl = $("#dk-chart-title");
  if (titleEl && bench) titleEl.textContent = `${bench.symbol} · benchmark`;
  if (!bench || !(bench.series || []).length) {
    box.innerHTML = `<p class="micro">no benchmark bars cached — run a sync</p>`;
    return;
  }
  const regimeByDate = Object.fromEntries(
    (data.regime_history || []).map((h) => [h.ts.slice(0, 10), h.label]));
  priceChart(box, bench.series, regimeByDate);
}

function renderStrip(data) {
  const box = $("#dk-strip-body");
  if (!box) return;
  regimeStrip(box, data.regime_history || []);
}

// ── Regime signature + teach-in ────────────────────────────────────────────
const wsChip = (s) => ({ bullish: "good", bearish: "serious", neutral: "warn", stress: "breach", missing: "missing" }[s] ?? s);
function barsSinceFlip(history) {
  if (!history.length) return 0;
  const last = history[history.length - 1].label; let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i].label === last; i--) n++;
  return n;
}

function renderRegime(data) {
  const reading = data.regime;
  const box = $("#dk-regime");
  if (!reading) {
    box.innerHTML = `<h2><span class="label-x">Regime</span></h2>
      <div class="rg-sig"><div><div class="rg-label">No reading</div>
      <div class="rg-sub">run the daily check to classify the tape</div></div></div>`;
    return;
  }
  const conf = reading.confidence ?? 0;
  const sessions = barsSinceFlip(data.regime_history || []);
  const worksheets = (reading.evidence || []).map((e) => `
    <details class="worksheet"><summary><span class="ws-title">${esc(e.title)}</span>
      ${chip(wsChip(e.status))}<span class="ws-value">${esc(e.value)}</span></summary>
      <div class="ws-body">
        <dl class="ws-row"><dt>Claim</dt><dd>${esc(e.claim)}</dd></dl>
        <dl class="ws-row"><dt>Measured</dt><dd class="mono">${esc(e.value)}${e.signal != null ? ` (vote ${e.signal > 0 ? "+" : ""}${esc(e.signal)})` : ""}</dd></dl>
        <dl class="ws-row"><dt>Method</dt><dd>${esc(e.methodology)}</dd></dl>
        <dl class="ws-row caveat"><dt>Not proven</dt><dd>${esc(e.caveat)}</dd></dl></div></details>`).join("");
  box.innerHTML = `
    <h2><span class="label-x">Regime</span><span class="micro">a heuristic read of the present, not a backtested edge</span></h2>
    <div class="rg-sig">
      <div><div class="rg-label">${esc(reading.label_display)}</div>
        <div class="rg-sub">${sessions} session${sessions === 1 ? "" : "s"} · score ${signed(reading.score)} · ${esc(reading.classifier_version)}</div></div>
      <div class="rg-conf"><div class="v count" data-cu="${conf}" data-dec="2">0.00</div><div class="k">confidence</div></div>
    </div>
    <div class="meter"><div class="meter-label"><span>confidence · agreement × coverage</span><span>${(conf * 100).toFixed(0)}%</span></div>
      <div class="meter-track"><div class="meter-fill" style="width:${(conf * 100).toFixed(0)}%"></div></div></div>
    <div class="calibration micro">inputs as of ${esc(fmtTime(reading.data_asof))} · source ${esc(reading.data_source)} · ${esc(reading.honesty)}</div>
    <button id="dk-teach-btn" aria-expanded="false" style="margin-top:10px;font-size:12px">▸ what is this claiming?</button>
    <a href="#/regime-lab" style="margin-left:12px" class="micro">open Regime Lab →</a>
    <div id="dk-teachin" hidden style="margin-top:8px">${worksheets}</div>`;
  const btn = $("#dk-teach-btn"), panel = $("#dk-teachin");
  btn.addEventListener("click", () => {
    const open = panel.hasAttribute("hidden");
    panel.toggleAttribute("hidden", !open);
    btn.setAttribute("aria-expanded", String(open));
    btn.textContent = open ? "▾ what is this claiming?" : "▸ what is this claiming?";
    if (open) panel.querySelector("details")?.setAttribute("open", "");
  });
  animateCountUps(box);
}

// ── AI briefing (the stored daily-check narrative + model state) ───────────
function renderBriefing() {
  const data = dashboard(); if (!data) return;
  const r = data.report;
  const modelChip = aiActive === undefined ? chip("warn", "checking model…")
    : aiActive ? chip("ok", `model: ${aiActive}`) : chip("warn", "model unavailable");
  $("#dk-briefing").innerHTML = `
    <h2><span class="label-x">Daily briefing</span><span class="micro">the model rephrases computed facts — numbers come from the pipeline</span></h2>
    <div class="ai-head">${modelChip}<span class="micro">${r ? esc(fmtTime(r.ts)) : "not run today"}</span></div>
    ${r ? `<div class="prose">${renderMarkdown(r.body_md)}</div>`
        : `<div class="ai-unavail">No daily check yet — trigger it from the station log below. The numbers above are complete without it.</div>`}
    <div class="ask-box">
      <div class="ask-row"><span class="p" aria-hidden="true">▸</span>
        <input id="dk-ask-in" placeholder="ask the desk — grounded in the numbers above" aria-label="Ask the desk">
        <button class="btn-primary" id="dk-ask-btn">ask</button></div>
      <div class="ask-chips">${["What's my biggest risk right now?", "Why this posture?", "Is the book too correlated?"]
        .map((q) => `<button class="ask-chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
      <div id="dk-ask-out"></div>
      <div style="margin-top:8px"><button class="ask-chip" id="dk-debate-btn">▸ run the desk debate (bull vs bear over the tape)</button></div>
      <div id="dk-debate-out"></div>
      <p class="micro">The model quotes the numbers above and invents none — it explains the state, never a buy/sell. Local-first; degrades visibly.</p>
    </div>`;
  wireAsk();
}

function wireAsk() {
  const input = $("#dk-ask-in"), btn = $("#dk-ask-btn"), out = $("#dk-ask-out");
  if (!input) return;
  const run = async () => {
    const q = input.value.trim();
    if (!q) return;
    btn.disabled = true; out.innerHTML = `<p class="micro"><span class="spinner"></span> the desk is reading the numbers…</p>`;
    let r;
    try { r = await api(`/api/ask?q=${encodeURIComponent(q)}${preferParam()}`); }
    catch (err) { out.innerHTML = `<div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div>`; btn.disabled = false; return; }
    out.innerHTML = r.status === "ok"
      ? `<div class="ai-head">${chip("ok", `${r.backend} · ${r.model}`)}</div><div class="prose" style="white-space:pre-wrap">${esc(r.text)}</div>`
      : `<div class="ai-unavail">${chip("warn", "model unavailable")} ${esc(r.note || "no model answered — the numbers above stand without it")}</div>`;
    btn.disabled = false;
  };
  btn.addEventListener("click", run);
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") run(); });
  outletRef.querySelectorAll(".ask-chip[data-q]").forEach((c) =>
    c.addEventListener("click", () => { input.value = c.dataset.q; run(); }));

  const dbtn = $("#dk-debate-btn"), dout = $("#dk-debate-out");
  dbtn?.addEventListener("click", async () => {
    dbtn.disabled = true; dout.innerHTML = `<p class="micro"><span class="spinner"></span> the desk is debating the tape…</p>`;
    let r;
    try { r = await api(`/api/market-debate?${preferParam("")}`); }
    catch (err) { dout.innerHTML = `<div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div>`; dbtn.disabled = false; return; }
    const db = r.debate;
    if (db && db.status === "ok") {
      const s = db.sections;
      dout.innerHTML = `<div class="ai-head">${chip("ok", `${db.backend} · ${db.model}`)}</div>` + (s
        ? [["Bull case", "", s.bull], ["Bear case", "serious", s.bear], ["Risk critique", "warn", s.risk]]
            .map(([l, cls, t]) => t ? `<div class="factor ${cls}" style="margin-top:8px"><div class="f-head"><strong>${l}</strong></div>
              <div class="prose" style="white-space:pre-wrap;margin-top:4px">${esc(t)}</div></div>` : "").join("")
        : `<div class="prose" style="white-space:pre-wrap">${esc(db.text)}</div>`);
    } else {
      dout.innerHTML = `<div class="ai-unavail">${chip("warn", "model unavailable")} ${esc(db?.note || "no model answered — the numbers above stand without it")}</div>`;
    }
    dbtn.disabled = false;
  });
}

function renderSurfaces() {
  $("#dk-surfaces").innerHTML = `
    <h2><span class="label-x">Surfaces</span><span class="micro">the whole terminal, one hash-router</span></h2>
    <div class="links-out">
      <a href="#/journal">Journal →</a><a href="#/weekly">Weekly →</a><a href="#/terminal">Terminal →</a>
      <a href="#/size">Size →</a><a href="#/pnl">P&amp;L →</a><a href="#/regime-lab">Regime Lab →</a>
      <a href="#/sector">Sector Drill →</a><a href="#/stress">Stress →</a><a href="#/scorecard">Scorecard →</a>
      <a href="#/ledger">Validation →</a></div>`;
}

// ── Watchboard ─────────────────────────────────────────────────────────────
function renderWatchboard(data) {
  const rows = (data.watchlist || []).map((w) => `
    <tr><td class="sym">${esc(w.symbol)}</td>
      <td class="num">${w.price === null ? "∅ missing" : esc(fmtNum(w.price))}</td>
      <td>${chip(w.staleness)}</td>
      <td>${sparkline((w.series || []).map((p) => p.c))}</td>
      <td class="micro">${esc(w.source ?? "—")} · ${esc(fmtTime(w.as_of))}</td></tr>`).join("");
  $("#dk-watch-body").innerHTML = rows || `<tr><td colspan="5" class="micro">no symbols cached yet — run a sync</td></tr>`;
}

// ── Leadership (Mansfield RS) ──────────────────────────────────────────────
const VERDICT_CHIP = { "HI-CONV": "good", "LONG-OK": "ok", "WATCH": "warn", "SKIP-LAG": "serious" };
function renderLeadership() {
  const b = rsData; if (!b) return;
  const rows = (b.rows || []).map((r) => `
    <tr><td class="sym">${esc(r.symbol)}</td>
      <td>${r.verdict ? chip(VERDICT_CHIP[r.verdict] ?? "warn", r.verdict) : chip("missing")}
        ${r.note ? `<div class="micro rs-note">${esc(r.note)}</div>` : ""}</td>
      <td class="num">${r.mansfield === null ? "∅" : `${signed(r.mansfield, 1)}%`}</td>
      <td class="num">${signed(r.slope3)}</td>
      <td class="rs-flag micro">${r.rs_new_high ? `<span class="st-good">↑ new 50-bar high</span>`
        : r.rs_new_low ? `<span class="st-serious">↓ new 50-bar low</span>` : "—"}</td>
      <td>${chip(r.staleness)}</td></tr>`).join("");
  $("#dk-rs-body").innerHTML = rows || `<tr><td colspan="6" class="micro">no watchlist symbols to rank — each needs 200 cached daily bars</td></tr>`;
  const regime = b.regime || {};
  $("#dk-rs-cal").innerHTML =
    `RS = close/${esc(b.benchmark)} · Mansfield zero line = 200-bar avg · regime ${esc(regime.label_display ?? "no reading")}` +
    `${regime.capped ? " — non-bull cap: verdicts top out at WATCH" : ""} · ${esc(b.honesty.caveat)}`;
}

// ── Screener (Minervini Trend Template) ────────────────────────────────────
const SCR_CHIP = { PASS: "good", NEAR: "warn", NO: "serious" };
function renderScreener() {
  const s = scrData; if (!s) return;
  const rows = (s.rows || []).map((r) => {
    const failed = r.status === "ok"
      ? (r.failed.length ? `<div class="micro rs-note">${r.failed.map(esc).join(" · ")}</div>` : `<span class="micro st-good">all eight met</span>`)
      : `<div class="micro rs-note">${esc(r.note)}</div>`;
    return `<tr><td class="sym">${esc(r.symbol)}</td>
      <td>${r.verdict ? chip(SCR_CHIP[r.verdict] ?? "warn", r.verdict) : chip("missing")}
        ${r.regime_note ? `<div class="micro rs-note">${esc(r.regime_note)}</div>` : ""}</td>
      <td class="num">${r.score === null ? "∅" : `${r.score}/8`}</td>
      <td>${failed}</td><td>${chip(r.staleness)}</td></tr>`;
  }).join("");
  $("#dk-scr-body").innerHTML = rows || `<tr><td colspan="5" class="micro">no watchlist symbols to screen — each needs 252 cached daily bars</td></tr>`;
  const regime = s.regime || {};
  $("#dk-scr-cal").innerHTML =
    `Trend Template (Minervini 2013) · PASS 8/8 · NEAR 6–7 · NO &lt;6 · regime ${esc(regime.label_display ?? "no reading")}` +
    `${regime.bull ? "" : " — non-bull: PASS/NEAR rows annotated context-only"} · candidates for review, never setups — ${esc(s.honesty.caveat)}`;
}

// ── Station log ────────────────────────────────────────────────────────────
function renderOps(data) {
  $("#dk-ops-body").innerHTML = (data.jobs || []).map((j) => {
    const last = j.last_run;
    const lastLine = last
      ? `${fmtTime(last.started_at)} · ${esc(last.trigger)} · ${esc(last.outcome ?? "running")} · ${esc(last.detail ?? "")}`
      : "never ran";
    return `<div class="oprow"><span class="jobname">${esc(j.job)}</span>
      ${j.missed ? chip("missed") : (last ? chip(last.outcome ?? "warn") : chip("missing", "no runs"))}
      <span class="micro">${esc(j.schedule)} · last: ${lastLine}</span>
      <button data-run="${esc(j.job)}">run now</button></div>`;
  }).join("");
  outletRef.querySelectorAll("[data-run]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "running…";
      try { await api(`/api/jobs/${b.dataset.run}/run`, { method: "POST" }); }
      catch (err) { alert(`Job failed (recorded in job log): ${err.message}`); }
      b.disabled = false; b.textContent = "run now";
      refreshDashboard();
    }));
}
