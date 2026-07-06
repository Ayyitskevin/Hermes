// Shared helpers: API access, formatting, status chips, theme, tiny markdown.

export async function api(path, opts = {}) {
  const resp = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!resp.ok) {
    let detail = resp.statusText;
    try { detail = (await resp.json()).detail ?? detail; } catch { /* keep statusText */ }
    throw new Error(`${resp.status}: ${detail}`);
  }
  return resp.json();
}

// The model the operator picked in the chrome popover routes every AI call.
// Stored by shell.js; read here so views append ?prefer= to the AI endpoints.
export const aiPrefer = () => localStorage.getItem("hermes-prefer") || null;
export const preferParam = (sep = "&") => {
  const p = aiPrefer();
  return p ? `${sep}prefer=${encodeURIComponent(p)}` : "";
};

export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

export const fmtPct = (v, digits = 2) =>
  v === null || v === undefined ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(digits)}%`;

export const fmtNum = (v, digits = 2) =>
  v === null || v === undefined ? "—" : Number(v).toFixed(digits);

export const fmtTime = (iso) => (iso ? iso.replace("T", " ").replace(":00Z", "Z") : "—");

// Status chips: icon + label, never color alone.
const CHIP = {
  live:    ["st-good",    "●", "live"],
  ok:      ["st-good",    "✓", "ok"],
  good:    ["st-good",    "✓", "good"],
  clear:   ["st-good",    "✓", "clear"],
  stale:   ["st-warn",    "◐", "stale"],
  warn:    ["st-warn",    "▲", "warn"],
  caution: ["st-warn",    "▲", "caution"],
  retry:   ["st-warn",    "▲", "retry"],
  rate_limited: ["st-warn", "▲", "rate-limited"],
  serious: ["st-serious", "◆", "serious"],
  dead:    ["st-serious", "○", "dead"],
  fail:    ["st-serious", "✗", "fail"],
  no_keys: ["st-serious", "✗", "no keys"],
  auth_error: ["st-serious", "✗", "auth error"],
  unreachable: ["st-serious", "✗", "unreachable"],
  breach:  ["st-crit",    "■", "breach"],
  blocked: ["st-crit",    "■", "blocked"],
  missing: ["st-serious", "∅", "missing"],
  missed:  ["st-crit",    "■", "missed"],
};
export function chip(state, labelOverride = null) {
  const [cls, ico, label] = CHIP[state] ?? ["", "·", state];
  return `<span class="chip ${cls}"><i class="st-ico" aria-hidden="true">${ico}</i>${esc(labelOverride ?? label)}</span>`;
}

// Theme cycling: auto → light → dark, persisted.
export function initThemeToggle(button) {
  const KEY = "hermes-theme";
  const apply = (mode) => {
    if (mode === "auto") delete document.documentElement.dataset.theme;
    else document.documentElement.dataset.theme = mode;
    button.textContent = `theme: ${mode}`;
  };
  let mode = localStorage.getItem(KEY) || "auto";
  apply(mode);
  button.addEventListener("click", () => {
    mode = { auto: "light", light: "dark", dark: "auto" }[mode];
    localStorage.setItem(KEY, mode);
    apply(mode);
  });
}

// Minimal markdown for the daily report: escape first, then transform.
export function renderMarkdown(md) {
  const lines = esc(md).split("\n");
  const out = [];
  let inList = false;
  for (const line of lines) {
    if (line.startsWith("- ")) {
      if (!inList) { out.push("<ul>"); inList = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (inList) { out.push("</ul>"); inList = false; }
    if (line.startsWith("### ")) out.push(`<h4>${inline(line.slice(4))}</h4>`);
    else if (line.startsWith("## ")) out.push(`<h3>${inline(line.slice(3))}</h3>`);
    else if (line.startsWith("# ")) out.push(`<h2>${inline(line.slice(2))}</h2>`);
    else if (line.startsWith("&gt; ")) out.push(`<blockquote class="micro">${inline(line.slice(5))}</blockquote>`);
    else if (line.trim() === "") out.push("");
    else out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push("</ul>");
  return out.join("\n");
  function inline(s) {
    return s
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/\*([^*]+)\*/g, "<em>$1</em>");
  }
}

// Spring count-up on [data-cu] numbers (ease-out cubic, ~1.1s, runs once).
// Honors data-dec (decimals), data-pre, data-suf. Under reduced-motion the
// animation is skipped but the FINAL value is written immediately — a reduced-
// motion reader must see the real number, never the "0" placeholder.
export function animateCountUps(root = document) {
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  root.querySelectorAll("[data-cu]").forEach((el) => {
    if (el.dataset.cuDone) return;
    el.dataset.cuDone = "1";
    const to = parseFloat(el.dataset.cu) || 0;
    const dec = parseInt(el.dataset.dec || "0", 10);
    const pre = el.dataset.pre || "", suf = el.dataset.suf || "";
    const final = pre + to.toFixed(dec) + suf;
    if (reduce) { el.textContent = final; return; }
    const dur = 1100, t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 3);
      el.textContent = p < 1 ? pre + (to * e).toFixed(dec) + suf : final;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
