// The persistent app shell: top chrome (brand, nav pills, model selector +
// usage meter, date), a live marquee ticker tape bound to the watchlist +
// provider state, and the Limit Rail — global and dominant on every surface.
// A breach floods the rail and dims the view outlet until acknowledged.

import { api, chip, esc, fmtNum, fmtTime } from "./util.js";
import { onDashboard, refreshDashboard } from "./store.js";
import { currentPath } from "./router.js";

const NAV = [
  { key: "briefing", label: "Briefing", route: "/briefing", digit: "1", live: true },
  { key: "desk", label: "Desk", route: "/desk", digit: "2", live: true },
  { key: "terminal", label: "Terminal", route: "/terminal", digit: "3" },
  { key: "journal", label: "Journal", route: "/journal", digit: "4", live: true },
  { key: "pnl", label: "P&L", route: "/pnl", digit: "5" },
  { key: "parity", label: "Parity", route: "/parity", digit: "6" },
  { key: "weekly", label: "Weekly", route: "/weekly", digit: "7", live: true },
  { key: "monthly", label: "Monthly", route: "/monthly", digit: "8" },
  { key: "campaign", label: "Campaign", route: "/campaign", digit: "9" },
  { key: "ledger", label: "Validation", route: "/ledger", digit: "0" },
  { key: "scorecard", label: "Scorecard", route: "/scorecard", digit: "" },
  { key: "size", label: "Size", route: "/size", digit: "" },
  { key: "sector", label: "Sector", route: "/sector", digit: "" },
  { key: "stress", label: "Stress", route: "/stress", digit: "" },
  { key: "regime-lab", label: "Regime Lab", route: "/regime-lab", digit: "" },
  { key: "multi-tf", label: "Multi-TF", route: "/multi-tf", digit: "" },
  { key: "pairs", label: "Pairs", route: "/pairs", digit: "" },
];

const $ = (s, r = document) => r.querySelector(s);

// ── Chrome ─────────────────────────────────────────────────────────────────
export function buildShell() {
  const chrome = $("#chrome");
  const today = new Date().toISOString().slice(0, 16).replace("T", " ") + "Z";
  chrome.innerHTML = `
    <a class="brand" href="#/desk">Hermes</a>
    <nav class="nav" aria-label="Surfaces" title="press 1–0 to jump between surfaces">
      ${NAV.map((n) => `<a href="#${n.route}" data-key="${n.key}"
        title="${n.digit ? `press ${n.digit}` : ""}">${n.digit ? `<span class="nav-digit">${n.digit}</span>` : ""}${esc(n.label)}</a>`).join("")}
    </nav>
    <span class="live-pill" id="live-pill" aria-label="Risk state"><span class="dot"></span>—</span>
    <div class="search-pill"><span aria-hidden="true">▸</span>
      <input id="tsearch" placeholder="ticker" aria-label="Open a ticker in the Terminal"></div>
    <div class="model-wrap">
      <button class="model-btn off" id="model-btn" aria-haspopup="true" aria-expanded="false">
        <span class="mb-dot"></span><span id="mb-model">model…</span><span aria-hidden="true">▾</span></button>
      <div class="model-pop" id="model-pop" hidden></div>
    </div>
    <span class="chrome-date">${esc(today)}</span>`;

  // Ticker search → Terminal
  $("#tsearch").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target.value.trim()) {
      location.hash = `#/terminal?sym=${encodeURIComponent(ev.target.value.trim().toUpperCase())}`;
      ev.target.value = "";
    }
  });

  // Model popover
  const btn = $("#model-btn"), pop = $("#model-pop");
  btn.addEventListener("click", () => {
    const open = pop.hidden;
    pop.hidden = !open; btn.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".model-wrap")) { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); }
  });

  // Digit hotkeys 1–9,0 → jump (ignored while typing)
  window.addEventListener("keydown", (ev) => {
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(ev.target.tagName)) return;
    const n = NAV.find((x) => x.digit && x.digit === ev.key);
    if (n) location.hash = `#${n.route}`;
  });

  document.addEventListener("route", markActiveNav);
  onDashboard(renderRailAndTape);
  markActiveNav();
  refreshAiStatus();
  setInterval(refreshAiStatus, 20000);
}

function markActiveNav() {
  const path = currentPath();
  document.querySelectorAll(".nav a").forEach((a) => {
    a.classList.toggle("active", a.getAttribute("href") === `#${path}`);
  });
}

// ── Model selector + usage meter (from /api/ai/status) ─────────────────────
async function refreshAiStatus() {
  const btn = $("#model-btn"), model = $("#mb-model"), pop = $("#model-pop");
  if (!btn) return;
  let s;
  try { s = await api("/api/ai/status"); }
  catch { model.textContent = "model unavailable"; btn.className = "model-btn off"; return; }

  const active = s.backends.find((b) => b.name === s.active);
  btn.className = "model-btn " + (s.active === "ollama" ? "local" : s.active === "claude" ? "" : "off");
  model.textContent = active ? active.model : "model unavailable";

  const kindOf = (b) => b.kind || (b.name === "ollama" ? "local" : "frontier");
  const usable = (b) => b.reachable && (b.name === "ollama" || s.allow_cloud);
  const prefer = localStorage.getItem("hermes-prefer");
  const preferName = prefer === "cloud" ? "claude" : prefer === "local" ? "ollama" : null;
  const price = (b) => (b.price && (b.price.in_per_mtok || b.price.out_per_mtok)
    ? `$${b.price.in_per_mtok}/$${b.price.out_per_mtok} per 1M tok` : "$0 · on device");
  pop.innerHTML = `
    <div class="pop-head"><span class="eyebrow">Model · routes this session</span>
      <button aria-label="close" id="pop-x" style="padding:2px 8px">✕</button></div>
    ${s.backends.map((b) => `
      <div class="model-row ${usable(b) ? "" : "disabled"} ${preferName === b.name ? "picked" : ""}" data-name="${b.name}">
        <div class="row-top">
          ${b.name === s.active ? `<span class="live-dot" aria-label="active"></span>` : ""}
          <span class="rname">${esc(b.model)}</span>
          <span class="kind-badge ${kindOf(b)}">${kindOf(b)}</span>
          ${preferName === b.name ? `<span class="kind-badge" style="background:rgba(139,108,255,.2);color:var(--violet-ink)">picked</span>` : ""}
          <span class="rcost">${chip(b.reachable ? "ok" : "unreachable", b.reachable ? "reachable" : "unreachable")}</span>
        </div>
        <span class="rnote">${esc(b.note || "")} · ${esc(price(b))}</span>
      </div>`).join("")}
    <div class="pop-usage">metered · ${s.session_usage.queries} queries · ~$${Number(s.session_usage.approx_cost).toFixed(3)} this session · cloud ${s.allow_cloud ? "allowed" : "off"}${preferName ? ` · picked: ${preferName}` : " · auto (local-first)"}</div>`;
  $("#pop-x").addEventListener("click", () => { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); });
  pop.querySelectorAll(".model-row").forEach((row) =>
    row.addEventListener("click", () => {
      if (row.classList.contains("disabled")) return;
      const pick = row.dataset.name === "ollama" ? "local" : "cloud";
      // Toggle off if re-picking the same one → back to auto (local-first).
      if (localStorage.getItem("hermes-prefer") === pick) localStorage.removeItem("hermes-prefer");
      else localStorage.setItem("hermes-prefer", pick);
      refreshAiStatus();      // re-render the popover so "picked" updates
    }));
}

// ── Ticker tape (marquee) ──────────────────────────────────────────────────
function provTier(state, name) {
  if (String(name || "").toLowerCase() === "sample") return ["prov-sample", "SAMPLE"];
  const s = String(state || "").toLowerCase();
  if (s === "live" || s === "connected") return ["prov-live", "LIVE"];
  if (s.includes("delayed")) return ["prov-delayed", "DELAYED 15m"];
  if (s.includes("rate")) return ["prov-delayed", "RATE-LIMITED"];
  if (s === "eod" || s.includes("historical")) return ["prov-eod", "EOD"];
  if (s === "sample" || s.includes("mock")) return ["prov-sample", "SAMPLE"];
  if (s.includes("no_key") || s.includes("auth") || s.includes("unreachable"))
    return ["prov-sample", "OFFLINE"];
  return ["prov-sample", s.toUpperCase().replace(/_/g, " ") || "—"];
}

function tapeItem(w) {
  const s = w.series || [];
  const chgPct = s.length >= 2 && s[s.length - 2].c
    ? ((s[s.length - 1].c - s[s.length - 2].c) / s[s.length - 2].c) * 100 : null;
  const cls = chgPct === null ? "flat" : chgPct > 0 ? "pos" : chgPct < 0 ? "neg" : "flat";
  const chg = chgPct === null ? "∅" : `${chgPct >= 0 ? "+" : ""}${chgPct.toFixed(2)}%`;
  return `<span class="tick"><span class="tk-sym">${esc(w.symbol)}</span>
    <span class="tk-px">${w.price === null ? "∅" : esc(fmtNum(w.price))}</span>
    <span class="tk-chg ${cls}">${esc(chg)}</span></span>`;
}

function renderTape(data) {
  const tape = $("#tape");
  const rows = data.watchlist || [];
  if (!rows.length) { tape.innerHTML = `<span class="micro" style="padding-left:14px">no symbols cached — run a sync</span>`; return; }
  const items = rows.map(tapeItem).join("");
  const [pcls, plabel] = provTier(data.provider?.state, data.provider?.name);
  tape.innerHTML =
    `<div class="tape-track" aria-hidden="true">${items}${items}</div>
     <span class="tape-badge ${pcls}"><span class="dot"></span>${esc(plabel)} · ${esc(data.provider?.name ?? "")}</span>`;
}

// ── Limit Rail (global, dominant) ──────────────────────────────────────────
function gaugePct(check) {
  const num = (s) => { const m = String(s).match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
  const observed = num(check.observed), limit = num(check.limit);
  if (observed === null || limit === null || limit === 0) return null;
  return (observed / limit) * 84;
}

function renderRail(data) {
  const risk = data.risk;
  document.body.dataset.risk = risk.level;
  const word = { ok: "CLEAR", warn: "WARN", breach: "BREACH" }[risk.level] ?? "—";
  const wordCls = { ok: "st-good", warn: "st-warn", breach: "st-crit" }[risk.level] ?? "";
  const ico = { ok: "✓", warn: "▲", breach: "■" }[risk.level] ?? "·";

  const gauges = (risk.checks || []).map((c) => {
    const pct = gaugePct(c);
    if (pct === null) return "";
    const shortVal = (c.observed.match(/-?\d+(\.\d+)?%?/) || [c.observed])[0];
    const lim = (c.limit.match(/-?\d+(\.\d+)?%?/) || [c.limit])[0];
    const mark = c.level === "breach" ? " ■" : c.level === "warn" ? " ▲" : "";
    return `<div class="gauge ${c.level === "breach" ? "breach" : c.level === "warn" ? "warn" : ""}">
      <div class="gauge-label"><span>${esc(c.kind.replace(/_/g, " "))}${mark}</span>
        <span class="val">${esc(shortVal)} / ${esc(lim)}</span></div>
      <div class="gauge-track" role="img" aria-label="${esc(c.kind)} (${esc(c.level)}): ${esc(c.observed)}, limit ${esc(c.limit)}">
        <div class="gauge-fill" style="width:${Math.min(pct, 100)}%"></div>
        <div class="gauge-limit" style="left:${Math.min(pct >= 100 ? 92 : 84, 92)}%"></div>
      </div></div>`;
  }).join("");

  // The tightest constraint: the check closest to (or past) its limit. Names the
  // binding limit in plain language — risk outranks signal, said out loud.
  const ratios = (risk.checks || []).map((c) => {
    const num = (s) => { const m = String(s).match(/-?\d+(\.\d+)?/); return m ? parseFloat(m[0]) : null; };
    const o = num(c.observed), l = num(c.limit);
    return o !== null && l ? { c, r: Math.abs(o) / Math.abs(l) } : null;
  }).filter(Boolean).sort((a, b) => b.r - a.r);
  const tightest = ratios[0]
    ? `<div class="rail-tightest micro"><strong>${esc(ratios[0].c.kind.replace(/_/g, " "))}</strong> is your tightest constraint —
        ${esc(ratios[0].c.observed)} vs ${esc(ratios[0].c.limit)} (${Math.round(ratios[0].r * 100)}% of the way)</div>`
    : "";

  const missed = (data.jobs || []).filter((j) => j.missed).length;
  const health = `${chip(data.provider.state, `${data.provider.name}: ${data.provider.state.replace(/_/g, " ")}`)}<br>` +
    (missed ? chip("missed", `${missed} job(s) missed`) : `<span class="micro">jobs on schedule</span>`);

  const events = data.risk_events || [];
  const ack = events.length
    ? `<div class="rail-ack-box" style="flex-basis:100%;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
        ${events.map((e) => `<span class="micro">${chip(e.severity || "breach")} ${esc(e.kind)}: ${esc(e.message)}</span>
          <button class="rail-ack" data-ack="${esc(e.id)}">acknowledge</button>`).join("")}</div>`
    : "";

  $("#rail").innerHTML = `
    <div class="rail-state">
      <div class="rail-word"><span class="${wordCls}"><i class="st-ico" aria-hidden="true">${ico}</i>${word}</span></div>
      <div class="rail-big">${esc(fmtNum(risk.open_risk_pct))}%<small> open risk · equity idx ${esc(fmtNum(risk.equity_index, 1))} · DD ${esc(fmtNum(risk.drawdown_pct, 1))}%</small></div>
    </div>
    <div class="rail-gauges">${gauges || `<span class="micro">no active limits — no open positions</span>`}</div>
    <div class="rail-health">${health}</div>
    ${tightest}
    ${ack}`;

  $("#rail").querySelectorAll("[data-ack]").forEach((b) =>
    b.addEventListener("click", async () => {
      b.disabled = true;
      try { await api(`/api/risk/events/${b.dataset.ack}/ack`, { method: "POST" }); }
      catch (err) { alert(err.message); }
      refreshDashboard();
    }));
}

function renderRailAndTape(data, err) {
  if (!data) {
    $("#rail").innerHTML = `<div class="rail-state"><div class="rail-word"><span class="st-crit"><i class="st-ico">✗</i>NO DATA</span></div>
      <div class="rail-big"><small>${esc(err?.message ?? "dashboard unreachable")}</small></div></div>`;
    return;
  }
  renderRail(data);
  renderTape(data);
  const lp = $("#live-pill");
  if (lp) {
    const lvl = data.risk.level;
    lp.className = "live-pill " + (lvl === "breach" ? "breach" : lvl === "warn" ? "warn" : "");
    lp.innerHTML = `<span class="dot"></span>${{ ok: "CLEAR", warn: "WARN", breach: "BREACH" }[lvl] ?? "—"} · ${esc(data.provider.name.toUpperCase())}`;
  }
}
