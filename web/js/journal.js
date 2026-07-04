// Trade journal: propose → reviewer verdict → commit (two explicit steps),
// close with a thesis verdict, and a performance plate that grades honestly.

import { api, chip, esc, fmtNum, fmtPct, fmtTime, initThemeToggle } from "./util.js";

const $ = (sel) => document.querySelector(sel);
let proposedParams = null; // raw params; commit re-runs the proposal server-side

async function refresh() {
  const j = await api("/api/journal");
  renderPerformance(j.performance);
  renderOpen(j.entries.filter((e) => e.status === "open"), j.stale_open);
  renderClosed(j.entries.filter((e) => e.status === "closed"));
}

// ── Propose form ─────────────────────────────────────────────────────────
$("#propose-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = ev.target;
  const body = {
    symbol: f.symbol.value.trim().toUpperCase(),
    side: f.side.value,
    entry_price: parseFloat(f.entry_price.value),
    stop_price: parseFloat(f.stop_price.value),
    thesis: f.thesis.value.trim(),
    sector: f.sector.value.trim() || null,
    setup_tag: f.setup_tag.value.trim() || null,
    target_price: f.target_price.value ? parseFloat(f.target_price.value) : null,
  };
  $("#verdict").innerHTML = `<p class="micro">running sizing + reviewer second-pass…</p>`;
  try {
    const proposal = await api("/api/journal/propose", { method: "POST", body: JSON.stringify(body) });
    proposedParams = body;
    renderVerdict(proposal);
  } catch (err) {
    proposedParams = null;
    $("#verdict").innerHTML = `<div class="verdict v-blocked">${chip("fail")} ${esc(err.message)}</div>`;
  }
});

function renderVerdict(p) {
  const r = p.review;
  const flags = (r.flags || []).map((f) => `
    <li><strong>${esc(f.check)}</strong> (${esc(f.severity)}): ${esc(f.finding)}</li>`).join("");
  $("#verdict").innerHTML = `
    <div class="verdict v-${esc(r.verdict)}">
      <p>${chip(r.verdict)} <strong class="label-x">Reviewer verdict: ${esc(r.verdict)}</strong>
        <span class="micro">${esc(r.methodology)}</span></p>
      <p class="mono">size ${fmtNum(p.sizing.size_pct_equity)}% of equity ·
        planned risk ${fmtNum(p.sizing.planned_risk_pct)}% ·
        stop ${fmtNum(p.sizing.stop_distance_pct)}% away
        ${p.sizing.capped_by ? ` · capped by ${esc(p.sizing.capped_by)}` : ""}</p>
      <p class="micro">${esc(p.sizing.methodology ?? "")}</p>
      ${flags ? `<ul>${flags}</ul>` : `<p class="micro">no flags raised</p>`}
      ${r.llm_critique
        ? `<details class="worksheet"><summary><span class="ws-title">local model critique</span>
             <span class="micro">${esc(r.llm_source)}</span></summary>
             <div class="ws-body"><p>${esc(r.llm_critique)}</p></div></details>`
        : `<p class="micro">${chip("warn", "local model skipped")} Ollama unavailable — rule checks above still apply.</p>`}
      <p class="micro">signal state frozen at entry:
        ${esc(p.signal_state.label ?? "no reading")} ·
        conf ${esc(fmtNum(p.signal_state.confidence))} ·
        ${esc(p.signal_state.classifier_version ?? "")}</p>
      <button class="btn-primary" id="commit-btn">
        commit entry${r.verdict === "blocked"
          ? " (overriding a blocked verdict — recorded forever)"
          : r.verdict === "caution"
            ? " (cautions travel with the entry)"
            : ""}
      </button>
    </div>`;
  $("#commit-btn").addEventListener("click", async () => {
    // Commit sends the raw params; the server re-runs sizing + reviewer +
    // signal freeze at commit time so nothing client-held can be stale/forged.
    const res = await api("/api/journal/commit",
      { method: "POST", body: JSON.stringify(proposedParams) });
    const rv = res.review?.verdict;
    $("#verdict").innerHTML =
      `<div class="verdict v-clear">${chip("ok")} committed as entry #${res.id}` +
      `${rv && rv !== "clear" ? ` — reviewer verdict at commit: ${esc(rv)} (recorded)` : ""}</div>`;
    $("#propose-form").reset();
    proposedParams = null;
    refresh();
  });
}

// ── Open entries ─────────────────────────────────────────────────────────
function renderOpen(entries, staleIds) {
  $("#open-body").innerHTML = entries.length ? entries.map((e) => `
    <tr>
      <td class="num">#${e.id}</td>
      <td class="sym mono"><strong>${esc(e.symbol)}</strong> ${esc(e.side)}
        ${staleIds.includes(e.id) ? chip("stale", "stale thesis") : ""}</td>
      <td class="num">${fmtNum(e.entry_price)}</td>
      <td class="num">${fmtNum(e.stop_price)}</td>
      <td class="num">${fmtNum(e.size_pct_equity, 1)}%</td>
      <td class="num">${fmtNum(e.planned_risk_pct)}%</td>
      <td>${esc(e.thesis.slice(0, 140))}${e.thesis.length > 140 ? "…" : ""}
        <span class="micro">signal at entry: ${esc(e.signal_state?.label ?? "—")} ·
          reviewer: ${esc(e.review?.verdict ?? "—")}</span></td>
      <td>
        <details>
          <summary>close</summary>
          <form class="close-form" data-id="${e.id}">
            <div class="field"><label>exit price
              <input name="exit_price" type="number" step="0.01" min="0.01" required></label></div>
            <div class="field"><label>thesis played out?
              <select name="thesis_played_out" required>
                <option value="yes">yes</option>
                <option value="partial">partial</option>
                <option value="no">no</option>
              </select></label></div>
            <div class="field"><label>what actually happened vs the thesis
              <textarea name="resolution_note" required minlength="5"></textarea></label></div>
            <button class="btn-primary">close &amp; resolve</button>
          </form>
        </details>
      </td>
    </tr>`).join("")
    : `<tr><td colspan="8" class="micro">no open positions</td></tr>`;

  document.querySelectorAll(".close-form").forEach((form) =>
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const body = {
        exit_price: parseFloat(form.exit_price.value),
        thesis_played_out: form.thesis_played_out.value,
        resolution_note: form.resolution_note.value.trim(),
      };
      try {
        const res = await api(`/api/journal/${form.dataset.id}/close`,
          { method: "POST", body: JSON.stringify(body) });
        alert(`Resolved: ${fmtPct(res.realized_return_pct)} realized, ` +
          `alpha ${res.alpha_pct === null ? "unavailable (no benchmark bars)" : fmtPct(res.alpha_pct)}, ` +
          `equity index ${fmtNum(res.equity_index, 1)}`);
        refresh();
      } catch (err) { alert(err.message); }
    }));
}

// ── Closed entries ───────────────────────────────────────────────────────
function renderClosed(entries) {
  $("#closed-body").innerHTML = entries.length ? entries.map((e) => `
    <tr>
      <td class="num">#${e.id}</td>
      <td class="sym mono"><strong>${esc(e.symbol)}</strong> ${esc(e.side)}</td>
      <td class="micro">${esc(fmtTime(e.opened_at).slice(0, 10))} → ${esc(fmtTime(e.closed_at).slice(0, 10))}</td>
      <td class="num ${cls(e.realized_return_pct)}">${fmtPct(e.realized_return_pct)}</td>
      <td class="num">${e.benchmark_return_pct === null ? "—" : fmtPct(e.benchmark_return_pct)}</td>
      <td class="num ${cls(e.alpha_pct)}">${e.alpha_pct === null ? "—" : fmtPct(e.alpha_pct)}</td>
      <td>${chip(e.thesis_played_out === "yes" ? "good" : e.thesis_played_out === "partial" ? "warn" : "serious", `thesis: ${e.thesis_played_out}`)}</td>
      <td class="micro">${esc(e.resolution_note ?? "")}</td>
    </tr>`).join("")
    : `<tr><td colspan="8" class="micro">no closed trades yet</td></tr>`;
}

const cls = (v) => (v === null || v === undefined ? "" : v >= 0 ? "pos" : "neg");

// ── Performance ──────────────────────────────────────────────────────────
function renderPerformance(p) {
  if (!p || p.closed_trades === 0) {
    $("#performance").innerHTML = `<p class="micro">${esc(p?.note ?? "no closed trades")}</p>`;
    return;
  }
  $("#performance").innerHTML = `
    <p class="mono">closed ${p.closed_trades} · win rate ${fmtNum(p.win_rate_pct, 1)}% ·
      thesis hit rate ${fmtNum(p.thesis_hit_rate_pct, 1)}% ·
      avg alpha ${p.avg_alpha_pct === null ? "—" : fmtPct(p.avg_alpha_pct)} (n=${p.alpha_sample})</p>
    ${p.note ? `<p class="micro">${chip("warn", "small sample")} ${esc(p.note)}</p>` : ""}`;
}

initThemeToggle($("#theme-toggle"));
refresh();
