// Daily view: risk rail first, regime strip signature, posture, chart+tape,
// watchboard, station log. Data refreshes every 5 minutes; every number on
// screen carries its source and as-of stamp.

import { api, chip, esc, fmtPct, fmtNum, fmtTime, initThemeToggle, renderMarkdown } from "./util.js";
import { regimeStrip, priceChart, sparkline } from "./charts.js";

const $ = (sel) => document.querySelector(sel);
let data = null;
let rsData = null;
let scrData = null;

async function refresh() {
  $("#refresh-state").textContent = "fetching…";
  try {
    data = await api("/api/dashboard");
    render();
    $("#refresh-state").textContent = `updated ${fmtTime(data.generated_at)}`;
  } catch (err) {
    $("#refresh-state").textContent = `FETCH FAILED — ${err.message}`;
  }
  // The leadership board fetches separately: a board failure is shown in its
  // own plate and never takes the risk rail or regime read down with it.
  try {
    rsData = await api("/api/rs/board");
    renderLeadership();
  } catch (err) {
    $("#rs-body").innerHTML =
      `<tr><td colspan="7" class="micro">FETCH FAILED — ${esc(err.message)}</td></tr>`;
    $("#rs-calibration").innerHTML = "";
  }
  // The screener fetches separately too: a candidate screen is decision-support
  // sugar, so its failure must never take the rail, regime, or leadership down.
  try {
    scrData = await api("/api/screener");
    renderScreener();
  } catch (err) {
    $("#scr-body").innerHTML =
      `<tr><td colspan="6" class="micro">FETCH FAILED — ${esc(err.message)}</td></tr>`;
    $("#scr-calibration").innerHTML = "";
  }
}

function render() {
  renderRail();
  renderRegime();
  renderPosture();
  renderReport();
  renderChart();
  renderWatchboard();
  renderOps();
  renderEdge();
}

// ── Limit Rail ───────────────────────────────────────────────────────────
function renderRail() {
  const risk = data.risk;
  document.body.dataset.risk = risk.level;
  const word = { ok: "CLEAR", warn: "WARN", breach: "BREACH" }[risk.level];
  const wordCls = { ok: "st-good", warn: "st-warn", breach: "st-crit" }[risk.level];
  const ico = { ok: "✓", warn: "▲", breach: "■" }[risk.level];
  $("#rail-word").innerHTML =
    `<span class="${wordCls}"><i class="st-ico" aria-hidden="true">${ico}</i>${word}</span>`;
  $("#rail-big").innerHTML =
    `${esc(fmtNum(risk.open_risk_pct))}%<small> open risk · equity idx ${esc(fmtNum(risk.equity_index, 1))}</small>`;

  const gauges = [];
  for (const c of risk.checks) {
    const pct = gaugePct(c);
    if (pct === null) continue;
    const shortVal = (c.observed.match(/-?\d+(\.\d+)?%/) || [c.observed])[0];
    // Never color-alone: warn/breach levels also carry their icon glyph.
    const levelMark = c.level === "breach" ? " ■" : c.level === "warn" ? " ▲" : "";
    gauges.push(`
      <div class="gauge ${c.level === "breach" ? "breach" : c.level === "warn" ? "warn" : ""}">
        <div class="gauge-label"><span>${esc(c.kind.replace(/_/g, " "))}${levelMark}</span>
          <span class="val">${esc(shortVal)} / ${esc((c.limit.match(/-?\d+(\.\d+)?%/) || [c.limit])[0])}</span></div>
        <div class="gauge-track" role="img" aria-label="${esc(c.kind)} (${esc(c.level)}): ${esc(c.observed)}, limit ${esc(c.limit)}">
          <div class="gauge-fill" style="width:${Math.min(pct, 100)}%"></div>
          <div class="gauge-limit" style="left:${Math.min(pct >= 100 ? 92 : 84, 92)}%"></div>
        </div>
      </div>`);
  }
  $("#rail-gauges").innerHTML = gauges.join("");

  const provider = data.provider;
  const missed = data.jobs.filter((j) => j.missed).length;
  $("#rail-health").innerHTML =
    `${chip(provider.state, `${provider.name}: ${provider.state.replace("_", " ")}`)}<br>` +
    (missed ? chip("missed", `${missed} job(s) missed`) : `<span class="micro">jobs on schedule</span>`);

  const ackBox = $("#rail-ack-box");
  const events = data.risk_events || [];
  if (events.length) {
    ackBox.innerHTML = events.map((e) =>
      `<div class="micro">${chip(e.severity)} ${esc(e.kind)}: ${esc(e.message)}
       <button class="rail-ack" data-ack="${esc(e.id)}">acknowledge</button></div>`).join("");
    ackBox.querySelectorAll("[data-ack]").forEach((b) =>
      b.addEventListener("click", async () => {
        await api(`/api/risk/events/${b.dataset.ack}/ack`, { method: "POST" });
        refresh();
      }));
  } else ackBox.innerHTML = "";
}

function gaugePct(check) {
  // observed vs limit as a fill fraction where the limit tick sits at 84%.
  const num = (s) => { const m = String(s).match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  const observed = num(check.observed), limit = num(check.limit);
  if (observed === null || limit === null || limit === 0) return null;
  return (observed / limit) * 84;
}

// ── Regime (signature) ───────────────────────────────────────────────────
function renderRegime() {
  const reading = data.regime;
  const headWide = window.innerWidth > 640 ? 190 : 0;
  regimeStrip($("#strip"), data.regime_history || [], { headWidth: headWide });

  const head = $("#reading-head");
  if (!reading) {
    head.innerHTML = `<span class="rh-label">NO READING</span>
      <span class="rh-sub">run the daily check</span>`;
    $("#calibration").textContent = "";
    $("#teachin").innerHTML = "";
    return;
  }
  const barsSince = barsSinceFlip(data.regime_history || []);
  head.innerHTML = `
    <span class="rh-label">${esc(reading.label_display)}</span>
    <span class="rh-sub">CONF ${fmtNum(reading.confidence)} · ${barsSince} reading${barsSince === 1 ? "" : "s"}</span>
    <span class="rh-hint">▸ what is this claiming?</span>`;

  $("#calibration").innerHTML =
    `<span class="micro">${esc(reading.classifier_version.toUpperCase())} · score ${esc(fmtNum(reading.score))} · ` +
    `inputs as of ${esc(fmtTime(reading.data_asof))} · source ${esc(reading.data_source)} · ` +
    `${esc(reading.honesty)}</span>`;

  // Teach-in worksheets: one per evidence component —
  // CLAIM / MEASURED / METHOD / NOT PROVEN, plus the missing-data state.
  $("#teachin").innerHTML = (reading.evidence || []).map((e) => `
    <details class="worksheet">
      <summary><span class="ws-title">${esc(e.title)}</span>
        ${chip(wsChip(e.status))}
        <span class="ws-value">${esc(e.value)}</span></summary>
      <div class="ws-body">
        <dl class="ws-row"><dt>Claim</dt><dd>${esc(e.claim)}</dd></dl>
        <dl class="ws-row"><dt>Measured</dt><dd class="mono">${esc(e.value)}${e.signal != null ? ` (vote ${e.signal > 0 ? "+" : ""}${esc(e.signal)})` : ""}</dd></dl>
        <dl class="ws-row"><dt>Method</dt><dd>${esc(e.methodology)}</dd></dl>
        <dl class="ws-row caveat"><dt>Not proven</dt><dd>${esc(e.caveat)}</dd></dl>
      </div>
    </details>`).join("");
}

const wsChip = (status) =>
  ({ bullish: "good", bearish: "serious", neutral: "warn", stress: "breach", missing: "missing" }[status] ?? status);

function barsSinceFlip(history) {
  if (!history.length) return 0;
  const last = history[history.length - 1].label;
  let n = 0;
  for (let i = history.length - 1; i >= 0 && history[i].label === last; i--) n++;
  return n;
}

$("#reading-head").addEventListener("click", () => {
  const panel = $("#teachin");
  const open = panel.hasAttribute("hidden");
  panel.toggleAttribute("hidden", !open);
  $("#reading-head").setAttribute("aria-expanded", String(open));
  const hint = $("#reading-head .rh-hint");
  if (hint) hint.textContent = open ? "▾ what is this claiming?" : "▸ what is this claiming?";
  if (open) panel.querySelector("details")?.setAttribute("open", "");
});

// ── Posture & report ─────────────────────────────────────────────────────
function renderPosture() {
  const p = data.posture;
  const cls = { allow: "posture-allow", restrict: "posture-restrict",
                "cash-priority": "posture-cash" }[p.posture] ?? "";
  $("#posture").className = `plate ${cls}`;
  $("#posture").innerHTML = `
    <h2><span class="label-x">Posture</span>
      <span class="micro">a posture, not a directive — you place every trade</span></h2>
    <div class="posture-word label-x">${esc(p.posture)}</div>
    <p>${esc(p.why)}</p>`;
}

function renderReport() {
  const r = data.report;
  $("#report").innerHTML = `
    <h2><span class="label-x">Daily check</span>
      <span class="micro">${r ? esc(fmtTime(r.ts)) : "not yet run today"}</span></h2>
    ${r ? renderMarkdown(r.body_md) :
      `<p class="micro">No report yet. Trigger the daily check from the station log below.</p>`}`;
}

// ── Chart + watchboard ───────────────────────────────────────────────────
function renderChart() {
  const bench = (data.watchlist || [])[0];
  const regimeByDate = {};
  for (const h of data.regime_history || []) {
    // Key the tape by the data the reading described, not the wall-clock run time.
    regimeByDate[(h.asof || h.ts).slice(0, 10)] = h.label;
  }
  $("#chart-title").innerHTML = `<span class="label-x">${esc(bench?.symbol ?? "benchmark")}</span>
    <span class="micro">daily close · source ${esc(bench?.bar_source ?? "—")} · bar as of ${esc(fmtTime(bench?.bar_as_of))}</span>`;
  priceChart($("#chart"), bench?.series ?? [], regimeByDate);
}

function renderWatchboard() {
  const rows = (data.watchlist || []).map((w) => `
    <tr>
      <td class="sym">${esc(w.symbol)}</td>
      <td class="num">${esc(fmtNum(w.price))}</td>
      <td>${chip(w.staleness)}</td>
      <td>${sparkline((w.series || []).map((p) => p.c))}</td>
      <td class="micro">${esc(w.source ?? "—")} · ${esc(fmtTime(w.as_of))}</td>
    </tr>`).join("");
  $("#watchboard-body").innerHTML = rows ||
    `<tr><td colspan="5" class="micro">no symbols cached yet — run a sync</td></tr>`;
}

// ── Leadership board (Mansfield RS) ──────────────────────────────────────
// Verdict chips reuse the existing status palette — no new colors, and the
// verdict word itself carries the meaning, never color alone.
const VERDICT_CHIP = {
  "HI-CONV": "good", "LONG-OK": "ok", "WATCH": "warn", "SKIP-LAG": "serious",
};

function renderLeadership() {
  const b = rsData;
  const signed = (v, digits = 2) =>
    v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${fmtNum(v, digits)}`;
  const rows = (b.rows || []).map((r) => `
    <tr>
      <td class="sym">${esc(r.symbol)}</td>
      <td>${r.verdict ? chip(VERDICT_CHIP[r.verdict] ?? "warn", r.verdict) : chip("missing")}
        ${r.note ? `<div class="micro rs-note">${esc(r.note)}</div>` : ""}</td>
      <td class="num">${r.mansfield === null ? "—" : `${signed(r.mansfield, 1)}%`}</td>
      <td class="num">${signed(r.slope3)}</td>
      <td class="rs-flag micro">${r.rs_new_high ? `<span class="st-good">↑ new 50-bar high</span>`
        : r.rs_new_low ? `<span class="st-serious">↓ new 50-bar low</span>` : "—"}</td>
      <td>${chip(r.staleness)}</td>
      <td class="micro">${esc(r.source ?? "—")} · ${esc(fmtTime(r.as_of))}</td>
    </tr>`).join("");
  $("#rs-body").innerHTML = rows ||
    `<tr><td colspan="7" class="micro">no watchlist symbols to rank — every name needs 200 cached daily bars</td></tr>`;
  const regime = b.regime || {};
  $("#rs-calibration").innerHTML =
    `<span class="micro">RS = close/${esc(b.benchmark)} · Mansfield zero line = 200-bar avg of RS · ` +
    `regime ${esc(regime.label_display ?? "no reading yet")}` +
    `${regime.capped ? " — non-bull cap: verdicts top out at WATCH" : ""} · ` +
    `bars as of ${esc(fmtTime(b.asof))} · ${esc(b.honesty.methodology)} ${esc(b.honesty.caveat)}</span>`;
}

// ── Swing screener (Minervini Trend Template) ────────────────────────────
// Verdict chips reuse the existing status palette — the verdict word carries
// the meaning, never color alone. A row is a CANDIDATE, never a setup.
const SCR_CHIP = { PASS: "good", NEAR: "warn", NO: "serious" };

function renderScreener() {
  const s = scrData;
  const rows = (s.rows || []).map((r) => {
    const failed = r.status === "ok"
      ? (r.failed.length
          ? `<div class="micro rs-note">${r.failed.map(esc).join(" · ")}</div>`
          : `<span class="micro st-good">all eight met</span>`)
      : `<div class="micro rs-note">${esc(r.note)}</div>`;
    return `
    <tr>
      <td class="sym">${esc(r.symbol)}</td>
      <td>${r.verdict ? chip(SCR_CHIP[r.verdict] ?? "warn", r.verdict) : chip("missing")}
        ${r.regime_note ? `<div class="micro rs-note">${esc(r.regime_note)}</div>` : ""}</td>
      <td class="num">${r.score === null ? "—" : `${r.score}/8`}</td>
      <td>${failed}</td>
      <td>${chip(r.staleness)}</td>
      <td class="micro">${esc(r.source ?? "—")} · ${esc(fmtTime(r.as_of))}</td>
    </tr>`;
  }).join("");
  $("#scr-body").innerHTML = rows ||
    `<tr><td colspan="6" class="micro">no watchlist symbols to screen — each needs 252 cached daily bars</td></tr>`;
  const regime = s.regime || {};
  $("#scr-calibration").innerHTML =
    `<span class="micro">Trend Template (Minervini 2013) · 8 criteria · ` +
    `PASS 8/8 · NEAR 6–7 · NO &lt;6 · regime ${esc(regime.label_display ?? "no reading yet")}` +
    `${regime.bull ? "" : " — non-bull: PASS/NEAR rows annotated context-only"} · ` +
    `bars as of ${esc(fmtTime(s.asof))} · candidates for review, never setups — ${esc(s.honesty.caveat)}</span>`;
}

// ── Station log ──────────────────────────────────────────────────────────
function renderOps() {
  $("#ops").innerHTML = (data.jobs || []).map((j) => {
    const last = j.last_run;
    const lastLine = last
      ? `${fmtTime(last.started_at)} · ${esc(last.trigger)} · ${esc(last.outcome ?? "running")} · ${esc(last.detail ?? "")}`
      : "never ran";
    return `
      <div class="oprow">
        <span class="jobname">${esc(j.job)}</span>
        ${j.missed ? chip("missed") : (last ? chip(last.outcome ?? "warn") : chip("missing", "no runs"))}
        <span class="micro">${esc(j.schedule)} · last: ${lastLine}</span>
        <button data-run="${esc(j.job)}">run now</button>
      </div>`;
  }).join("");
  $("#ops").querySelectorAll("[data-run]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true; b.textContent = "running…";
      try { await api(`/api/jobs/${b.dataset.run}/run`, { method: "POST" }); }
      catch (err) { alert(`Job failed (recorded in job log): ${err.message}`); }
      b.disabled = false; b.textContent = "run now";
      refresh();
    }));
}

function renderEdge() {
  $("#edgeprint").innerHTML =
    `<span class="micro">HERMES · provider ${esc(data.provider.name)} (${esc(data.provider.state)}) · ` +
    `decision-support only — no order paths exist in this codebase · ` +
    `every trade is placed by a human</span>`;
}

// ── Boot ─────────────────────────────────────────────────────────────────
initThemeToggle($("#theme-toggle"));
$("#refresh-btn").addEventListener("click", refresh);
refresh();
setInterval(() => { if (!document.hidden) refresh(); }, 5 * 60 * 1000);

// Debounced, width-gated resize: mobile URL-bar show/hide fires resize on
// scroll, and a naive re-render would snap open teach-in worksheets shut.
let lastWidth = window.innerWidth;
let resizeTimer = null;
window.addEventListener("resize", () => {
  if (window.innerWidth === lastWidth || !data) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    lastWidth = window.innerWidth;
    const openIdx = [...document.querySelectorAll("#teachin details")]
      .map((d, i) => (d.open ? i : -1)).filter((i) => i >= 0);
    const teachOpen = !$("#teachin").hasAttribute("hidden");
    renderRegime();
    renderChart();
    if (teachOpen) {
      $("#teachin").removeAttribute("hidden");
      $("#reading-head").setAttribute("aria-expanded", "true");
      const details = document.querySelectorAll("#teachin details");
      openIdx.forEach((i) => details[i]?.setAttribute("open", ""));
    }
  }, 150);
});
