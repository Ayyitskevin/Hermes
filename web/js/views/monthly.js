// Monthly performance review — anecdote until n is enough.

import { api, chip, esc, fmtNum, fmtTime } from "../util.js";

export default {
  async mount(outlet) {
    outlet.innerHTML = `<div class="plate rise"><p class="micro">loading monthly…</p></div>`;
    let m;
    try { m = await api("/api/reports/monthly"); }
    catch (e) {
      outlet.innerHTML = `<div class="plate"><p class="micro">${esc(e.message)}</p></div>`;
      return;
    }
    const row = (r) => `<tr>
      <td class="mono">${esc(r.label)}</td>
      <td class="mono">${r.n}</td>
      <td class="mono">${r.win_rate_pct ?? "∅"}</td>
      <td class="mono">${r.avg_return_pct ?? "∅"}</td>
      <td class="mono">${r.avg_alpha_pct ?? "∅"}</td>
      <td class="mono">${r.avg_r ?? "∅"}</td>
      <td class="mono">${r.thesis_hit_pct ?? "∅"}</td>
      <td>${chip(r.sample)}</td>
    </tr>`;
    outlet.innerHTML = `
      <div class="plate rise">
        <h2>Monthly review <span class="chip">${esc(m.sample_status)}</span>
          <span class="micro">${esc(fmtTime(m.generated_at))}</span></h2>
        <p class="micro">${esc(m.note || m.honesty?.claim || "")}</p>
        <p class="mono">closed trades: ${m.closed_trades}</p>
      </div>
      <div class="plate rise" style="margin-top:1rem">
        <h2>By month</h2>
        <table class="data"><thead><tr>
          <th>label</th><th>n</th><th>win%</th><th>avg ret%</th><th>avg α%</th><th>avg R</th><th>thesis%</th><th>sample</th>
        </tr></thead><tbody>
          ${(m.months || []).map(row).join("") || `<tr><td colspan="8" class="micro">no closed trades yet</td></tr>`}
        </tbody></table>
      </div>
      <div class="plate rise" style="margin-top:1rem">
        <h2>By regime at entry</h2>
        <table class="data"><thead><tr>
          <th>label</th><th>n</th><th>win%</th><th>avg ret%</th><th>avg α%</th><th>avg R</th><th>thesis%</th><th>sample</th>
        </tr></thead><tbody>${(m.by_regime_at_entry || []).map(row).join("")}</tbody></table>
      </div>
      <div class="plate rise" style="margin-top:1rem">
        <h2>By setup</h2>
        <table class="data"><thead><tr>
          <th>label</th><th>n</th><th>win%</th><th>avg ret%</th><th>avg α%</th><th>avg R</th><th>thesis%</th><th>sample</th>
        </tr></thead><tbody>${(m.by_setup || []).map(row).join("")}</tbody></table>
        <p class="micro" style="margin-top:0.75rem">${esc(m.honesty?.caveat || "")}</p>
      </div>`;
  },
};