// Size — the sizing desk. Enter a planned trade (symbol · entry · stop, plus an
// optional target / sector) and get a suggested position size as % of equity:
// the fixed-fractional baseline, tilted by the journal's OWN realized edge
// (half-Kelly, shrunk to the sample), then clamped by the binding risk limit —
// which is named. Every figure is % of equity or a per-share price; never a
// dollar. A suggestion for a human — Hermes has no order path. /api/size.

import { api, chip, esc, fmtNum, fmtPct, fmtTime, animateCountUps } from "../util.js";

export default {
  mount(outlet) {
    outletRef = outlet;
    outlet.innerHTML = layout();
    wireForm(outlet);
    const q = new URLSearchParams(location.hash.split("?")[1] || "");
    if (q.get("symbol") && q.get("entry") && q.get("stop")) {
      fill(outlet, q);
      run(outlet);
    }
  },
};

let outletRef = null;
const $ = (s, r = outletRef) => r.querySelector(s);

function layout() {
  return `
    <div class="view-head"><h1>Size</h1>
      <span class="micro">plan a trade → a suggested size as % of equity · fixed-fractional → your own half-Kelly → the binding limit</span></div>
    <div class="plate">
      <h2><span class="label-x">The plan</span>
        <span class="micro">per-share prices in — % of equity out. Side is inferred from stop vs entry.</span></h2>
      <form id="sz-form" class="form-grid" autocomplete="off">
        <div class="field"><label for="sz-sym">symbol</label>
          <input id="sz-sym" name="symbol" placeholder="XLK" spellcheck="false" required style="text-transform:uppercase"></div>
        <div class="field"><label for="sz-entry">entry (per share)</label>
          <input id="sz-entry" name="entry" type="number" step="any" min="0" placeholder="100.00" required></div>
        <div class="field"><label for="sz-stop">stop (per share)</label>
          <input id="sz-stop" name="stop" type="number" step="any" min="0" placeholder="95.00" required></div>
        <div class="field"><label for="sz-target">target — optional</label>
          <input id="sz-target" name="target" type="number" step="any" min="0" placeholder="reward:risk"></div>
        <div class="field"><label for="sz-sector">sector — optional</label>
          <input id="sz-sector" name="sector" placeholder="e.g. Tech (sector-cap check)"></div>
        <div class="field" style="justify-content:flex-end">
          <button class="btn-primary" type="submit">size it</button></div>
      </form>
      <p class="micro" style="margin-top:8px">A suggestion only — no order path exists in this codebase; you place every trade.</p>
    </div>
    <div id="sz-out"></div>`;
}

function fill(outlet, q) {
  for (const k of ["symbol", "entry", "stop", "target", "sector"]) {
    const v = q.get(k);
    if (v) $(`[name=${k}]`, outlet).value = v;
  }
}

function wireForm(outlet) {
  $("#sz-form", outlet).addEventListener("submit", (ev) => { ev.preventDefault(); run(outlet); });
}

async function run(outlet) {
  const f = $("#sz-form", outlet);
  const params = new URLSearchParams();
  for (const k of ["symbol", "entry", "stop", "target", "sector"]) {
    const v = f.elements[k].value.trim();
    if (v) params.set(k, v);
  }
  if (!params.get("symbol") || !params.get("entry") || !params.get("stop")) return;
  history.replaceState(null, "", `#/size?${params.toString()}`);
  const out = $("#sz-out", outlet);
  out.innerHTML = `<div class="plate"><p class="micro"><span class="spinner"></span> sizing…</p></div>`;
  let d;
  try { d = await api(`/api/size?${params.toString()}`); }
  catch (err) { out.innerHTML = `<div class="plate"><div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div></div>`; return; }
  if (d.status !== "ok") {
    out.innerHTML = `<div class="plate"><div class="ai-unavail">${chip("warn", "can't size this")} ${esc(d.note)}</div></div>`;
    return;
  }
  render(outlet, d);
}

// ── result ───────────────────────────────────────────────────────────────────
// Green when the model itself is binding (a proven edge, uncapped); amber when a
// risk limit cut the size; red when there's no room at all.
const SIZE_CLS = (d) => (d.size_pct_equity === 0 ? "restrict"
  : d.binding_constraint === "model" ? "allow" : "watch");

function render(outlet, d) {
  const out = $("#sz-out", outlet);
  const sideChip = chip(d.side === "long" ? "good" : "warn", d.side);
  const prov = d.cached_last === null ? "no cached price on file"
    : `cached last ${fmtNum(d.cached_last)} · ${esc(d.price_source ?? "—")} · ${esc(fmtTime(d.as_of))} ${chip(d.staleness)}`;
  out.innerHTML = `
    <div class="duo">
      <div class="plate accent">
        <h2><span class="label-x">${esc(d.symbol)} — suggested size</span>
          <span class="micro">a posture on size, not a directive</span></h2>
        <div class="fit-ring">
          <div><div class="fit-num ${SIZE_CLS(d)}"><span data-cu="${d.size_pct_equity}" data-dec="2" data-suf="%">0%</span>
            <small style="font-size:15px;color:var(--ink-muted)"> of equity</small></div></div>
          <div>${sideChip}
            <div class="micro" style="margin-top:6px">bound by <strong>${esc(bindLabel(d))}</strong></div>
            ${d.note ? `<div class="micro" style="margin-top:4px">${chip("warn")} ${esc(d.note)}</div>` : ""}</div>
        </div>
        <div class="trio" style="margin-top:14px">
          <div class="stat"><div class="k">planned risk</div>
            <div class="v"><span data-cu="${d.planned_risk_pct}" data-dec="2" data-suf="%">0%</span></div><div class="sub">if stopped out</div></div>
          <div class="stat"><div class="k">stop distance</div>
            <div class="v">${fmtNum(d.stop_distance_pct)}%</div><div class="sub">${fmtNum(d.entry)} → ${fmtNum(d.stop)}</div></div>
          <div class="stat"><div class="k">reward : risk</div>
            <div class="v">${d.reward_risk_ratio === null ? "∅" : `${fmtNum(d.reward_risk_ratio)}×`}</div>
            <div class="sub">${d.target === null ? "no target set" : `target ${fmtNum(d.target)}`}</div></div>
        </div>
        <div class="calibration micro" style="margin-top:10px">${prov}</div>
      </div>
      <div class="plate" id="sz-model"></div>
    </div>
    <div class="plate"><h2><span class="label-x">Limit ladder</span>
      <span class="micro">the tightest ceiling binds — risk outranks the model</span></h2><div id="sz-caps"></div></div>
    <div class="plate" id="sz-corr"></div>
    <details class="worksheet"><summary><span class="ws-title">how this size is built</span></summary>
      <div class="ws-body">
        <dl class="ws-row"><dt>Claim</dt><dd>${esc(d.honesty.claim)}</dd></dl>
        <dl class="ws-row"><dt>Method</dt><dd>${esc(d.honesty.methodology)}</dd></dl>
        <dl class="ws-row caveat"><dt>Not proven</dt><dd>${esc(d.honesty.caveat)}</dd></dl></div></details>`;

  renderModel(outlet, d);
  renderCaps(outlet, d);
  renderCorr(outlet, d);
  animateCountUps(out);
}

function bindLabel(d) {
  const c = d.caps.find((x) => x.binding);
  return c ? c.label : d.binding_constraint;
}

// ── layer 1 + 2: fixed baseline → shrunk half-Kelly ─────────────────────────
function renderModel(outlet, d) {
  const k = d.kelly || {};
  const el = $("#sz-model", outlet);
  // the shrink pulls the risk from the fixed baseline toward the half-Kelly edge
  const shrunkPct = Math.round((d.shrink ?? 0) * 100);
  const edgeBlock = k.status === "ok" ? `
    <div class="kv" style="margin-top:10px">
      <div class="cell"><div class="k">win rate</div><div class="v">${fmtNum(k.win_rate_pct, 0)}%</div></div>
      <div class="cell"><div class="k">payoff (R)</div><div class="v">${fmtNum(k.payoff_ratio)}×</div></div>
      <div class="cell"><div class="k">expectancy</div><div class="v ${(k.expectancy_r ?? 0) < 0 ? "neg" : "pos"}">${fmtNum(k.expectancy_r)}R</div></div>
      <div class="cell"><div class="k">avg win</div><div class="v pos">+${fmtNum(k.avg_win_r)}R</div></div>
      <div class="cell"><div class="k">avg loss</div><div class="v neg">−${fmtNum(k.avg_loss_r)}R</div></div>
      <div class="cell"><div class="k">sample</div><div class="v">n=${k.n}</div></div>
    </div>
    ${k.anecdote ? `<div class="micro" style="margin-top:8px">${chip("warn", "anecdote")} ${esc(k.note)}</div>`
                 : `<div class="micro" style="margin-top:8px">${chip("ok")} ${esc(k.note)}</div>`}
    ${discountLadder(k, d)}
    ${growthCurve(k, d)}
    ${rHistory(k)}`
    : `<div class="ai-unavail" style="margin-top:10px">${chip("missing")} ${esc(k.note || "no edge to measure")}</div>`;

  el.innerHTML = `
    <h2><span class="label-x">Risk model</span>
      <span class="micro">fixed baseline → your realized edge, shrunk to the sample</span></h2>
    <div class="trio">
      <div class="stat"><div class="k">fixed baseline</div>
        <div class="v">${fmtNum(d.fixed_risk_pct)}%</div><div class="sub">risk / trade</div></div>
      <div class="stat"><div class="k">edge weight</div>
        <div class="v">${shrunkPct}%</div><div class="sub">n / (n+30)</div></div>
      <div class="stat"><div class="k">blended risk</div>
        <div class="v pos">${fmtNum(d.blended_risk_pct)}%</div><div class="sub">used to size</div></div>
    </div>
    <div class="meter"><div class="meter-label"><span>fixed ${fmtNum(d.fixed_risk_pct)}% ← blended → half-Kelly ${k.half_kelly_pct == null ? "∅" : fmtNum(k.half_kelly_pct) + "%"}</span>
        <span>${shrunkPct}% edge</span></div>
      <div class="meter-track"><div class="meter-fill ${k.anecdote ? "warn" : ""}" style="width:${shrunkPct}%"></div></div></div>
    ${edgeBlock}`;
}

// Kelly discount ladder: full → half → quarter → Hermes-blended, each a bar
// against the per-trade risk you'd take. Full Kelly is a reference, never a target.
function discountLadder(k, d) {
  const rows = [
    ["Full Kelly", k.kelly_full_pct, "reference — too wild to trade", "serious"],
    ["Half Kelly", k.half_kelly_pct, "the convention", "warn"],
    ["Quarter Kelly", k.quarter_kelly_pct, "many desks live here", ""],
    ["Hermes blended", d.blended_risk_pct, "half-Kelly shrunk to your sample → used to size", "pos"],
  ];
  const ref = Math.max(k.kelly_full_pct || 1, d.blended_risk_pct || 1, 0.1);
  return `<div class="sz-sub">Kelly discount ladder <span class="micro">— risk % per trade; more is not more</span></div>
    ${rows.map(([label, val, note, cls]) => val == null ? "" : `
      <div class="ladder-row">
        <span class="ladder-lbl">${label}</span>
        <div class="ladder-bar"><i class="${cls}" style="width:${Math.min(100, (val / ref) * 100).toFixed(0)}%"></i></div>
        <span class="ladder-val ${cls}">${fmtNum(val)}%</span>
        <span class="ladder-note micro">${note}</span></div>`).join("")}`;
}

// The "why more is not more" curve: expected per-trade log-growth vs risk
// fraction, peaking at full Kelly and turning negative past the ruin drag.
function growthCurve(k, d) {
  const pts = k.growth_curve || [];
  if (pts.length < 2) return "";
  const W = 460, H = 132, padL = 6, padR = 6, padT = 10, padB = 20;
  const xmax = Math.max(...pts.map((p) => p.f_pct)) || 1;
  const gs = pts.map((p) => p.g);
  const gmin = Math.min(...gs, 0), gmax = Math.max(...gs), gspan = (gmax - gmin) || 1;
  const xAt = (f) => padL + (f / xmax) * (W - padL - padR);
  const yAt = (g) => padT + (1 - (g - gmin) / gspan) * (H - padT - padB);
  const path = pts.map((p, i) => `${i ? "L" : "M"}${xAt(p.f_pct).toFixed(1)},${yAt(p.g).toFixed(1)}`).join("");
  const y0 = yAt(0);
  const vmark = (f, cls, label) => (f == null || f > xmax) ? "" :
    `<line x1="${xAt(f).toFixed(1)}" y1="${padT}" x2="${xAt(f).toFixed(1)}" y2="${H - padB}" class="gc-mark ${cls}"/>
     <text x="${xAt(f).toFixed(1)}" y="${H - 6}" text-anchor="middle" class="gc-lbl">${label}</text>`;
  return `<div class="sz-sub">Growth curve <span class="micro">— expected log-growth per trade vs risk fraction</span></div>
    <svg viewBox="0 0 ${W} ${H}" class="gc-svg" role="img" aria-label="Kelly growth curve — log-growth peaks at full Kelly and falls past it">
      <line x1="${padL}" y1="${y0.toFixed(1)}" x2="${W - padR}" y2="${y0.toFixed(1)}" class="gc-zero"/>
      <path d="${path}" class="gc-line"/>
      ${vmark(k.kelly_full_pct, "full", "full")}
      ${vmark(k.half_kelly_pct, "half", "½")}
      ${vmark(k.quarter_kelly_pct, "quarter", "¼")}
      ${vmark(d.blended_risk_pct, "rec", "rec")}
    </svg>
    <p class="micro">peak at full Kelly (${fmtNum(k.kelly_full_pct)}%); past it, growth falls — the same reason Hermes sizes well below it.</p>`;
}

// The raw edge: every closed trade's R-multiple, sorted, as up/down bars.
function rHistory(k) {
  const rs = k.r_multiples || [];
  if (!rs.length) return "";
  const mx = Math.max(...rs.map(Math.abs), 1);
  return `<div class="sz-sub">The ${rs.length} trades, sorted (R) <span class="micro">— the distribution behind the number</span></div>
    <div class="rhist">${rs.map((r) => {
      const h = Math.max(2, (Math.abs(r) / mx) * 26).toFixed(0);
      return `<span class="rbar ${r >= 0 ? "up" : "dn"}" style="height:${h}px" title="${r}R"></span>`;
    }).join("")}</div>`;
}

// ── layer 3: the limit ladder ────────────────────────────────────────────────
function renderCaps(outlet, d) {
  const ref = Math.max(...d.caps.map((c) => c.ceiling_pct), 1);
  $("#sz-caps", outlet).innerHTML = d.caps.map((c) => {
    const w = Math.min(100, (c.ceiling_pct / ref) * 100).toFixed(0);
    return `<div class="factor ${c.binding ? "serious" : ""}">
      <div class="f-head">${c.binding ? chip("breach", "binds") : chip("ok", "slack")}
        <strong>${esc(c.label)}</strong>
        <span class="f-pts">ceiling ${fmtNum(c.ceiling_pct)}%${c.limit_pct !== null ? ` · limit ${fmtNum(c.limit_pct, 0)}%` : ""}</span></div>
      <div class="f-bar"><i style="width:${w}%"></i></div>
    </div>`;
  }).join("");
}

// ── correlation to the open book ────────────────────────────────────────────
function renderCorr(outlet, d) {
  const c = d.correlation || {};
  const st = { warn: "warn", ok: "ok", missing: "missing", none: "ok" }[c.status] || "warn";
  $("#sz-corr", outlet).innerHTML = `
    <h2><span class="label-x">Correlation to the book</span>
      <span class="micro">a warning, never a silent size — a correlated add is one position wearing two tickers</span></h2>
    <div style="margin-top:6px">${chip(st)} <span class="micro">${esc(c.note || "—")}</span></div>
    ${c.peak_symbol ? `<p class="micro" style="margin-top:6px">peak |ρ| vs ${esc(c.peak_symbol)} = ${fmtPct(c.peak_rho)} · warn at |ρ| ≥ ${fmtNum(c.threshold)}</p>` : ""}`;
}
