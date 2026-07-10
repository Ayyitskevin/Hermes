// Chart ↔ dashboard parity ritual (P1 one-brain evidence).

import { api, chip, esc, fmtTime } from "../util.js";

export default {
  async mount(outlet) {
    outlet.innerHTML = `<div class="plate rise" id="parity-root"><p class="micro">loading…</p></div>`;
    await refresh(outlet);
  },
};

async function refresh(outlet) {
  let s;
  try { s = await api("/api/parity"); }
  catch (e) {
    outlet.innerHTML = `<div class="plate"><p class="micro">${esc(e.message)}</p></div>`;
    return;
  }
  const today = new Date().toISOString().slice(0, 10);
  outlet.innerHTML = `
    <div class="plate rise">
      <h2>Parity ritual <span class="chip">${esc(s.p1_status)}</span></h2>
      <p class="micro">${esc(s.claim)}</p>
      <p class="mono">consecutive matches: <strong>${s.consecutive_matches}</strong> / ${s.p1_gate}
        · comparable sessions: ${s.comparable_sessions}
        · match rate: ${s.match_rate_pct ?? "∅"}%</p>
      <p class="micro">${esc(s.p1_note)}</p>
      <form id="parity-form" class="form-grid" style="margin-top:1rem;display:grid;gap:8px;max-width:28rem">
        <label>session date <input name="session_date" value="${esc(today)}" required></label>
        <label>chart label
          <select name="chart_label">
            <option value="bull_trend">bull_trend</option>
            <option value="chop">chop / range</option>
            <option value="bear_trend">bear_trend</option>
            <option value="stress">stress</option>
          </select>
        </label>
        <label>symbol (optional, blank = market) <input name="symbol" placeholder=""></label>
        <label>notes <input name="notes" placeholder="optional"></label>
        <button class="btn-primary" type="submit">record chart reading</button>
      </form>
      <p class="micro" style="margin-top:0.5rem">${esc(s.caveat)}</p>
    </div>
    <div class="plate rise" style="margin-top:1rem">
      <h2>Recent sessions</h2>
      <table class="data"><thead><tr><th>date</th><th>match</th><th>checks</th><th>detail</th></tr></thead>
      <tbody>${
        (s.sessions || []).map((sess) => `<tr>
          <td class="mono">${esc(sess.session_date)}</td>
          <td>${sess.match === 1 ? chip("MATCH") : sess.match === 0 ? chip("DRIFT") : "∅"}</td>
          <td class="mono">${sess.n_checks}</td>
          <td class="micro">${esc((sess.checks || []).map((c) =>
            `${c.chart_label}↔${c.hermes_label || "∅"}`).join("; "))}</td>
        </tr>`).join("") || `<tr><td colspan="4" class="micro">no sessions yet — record today's chart label</td></tr>`
      }</tbody></table>
    </div>`;
  outlet.querySelector("#parity-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const body = Object.fromEntries(fd.entries());
    try {
      await api("/api/parity", { method: "POST", body: JSON.stringify(body) });
      await refresh(outlet);
    } catch (e) {
      alert(e.message);
    }
  });
}
