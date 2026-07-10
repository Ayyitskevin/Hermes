// Pair-trade candidate screen (C3) — correlation + spread z, never a trade.

import { api, chip, esc, fmtNum, fmtTime } from "../util.js";

export default {
  async mount(outlet) {
    outlet.innerHTML = `<div class="plate rise"><p class="micro">loading pairs…</p></div>`;
    let s;
    try { s = await api("/api/pairs"); }
    catch (e) {
      outlet.innerHTML = `<div class="plate"><p class="micro">${esc(e.message)}</p></div>`;
      return;
    }
    outlet.innerHTML = `
      <div class="plate rise">
        <h2>Pair screen <span class="micro">${esc(fmtTime(s.generated_at))} · lookback ${s.lookback}</span></h2>
        <p class="micro">${esc(s.honesty?.claim || "")}</p>
        <table class="data"><thead><tr>
          <th>a</th><th>b</th><th>corr</th><th>spread z</th><th>verdict</th><th>note</th>
        </tr></thead><tbody>
          ${(s.rows || []).map((r) => `<tr>
            <td class="mono">${esc(r.a)}</td><td class="mono">${esc(r.b)}</td>
            <td class="mono">${r.correlation ?? "∅"}</td>
            <td class="mono">${r.spread_z ?? "∅"}</td>
            <td>${r.verdict ? chip(r.verdict) : "—"}</td>
            <td class="micro">${esc(r.note || "")}</td>
          </tr>`).join("") || `<tr><td colspan="6" class="micro">no pairs</td></tr>`}
        </tbody></table>
        <p class="micro" style="margin-top:0.75rem">${esc(s.honesty?.caveat || "")}</p>
      </div>`;
  },
};
