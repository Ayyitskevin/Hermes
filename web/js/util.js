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
