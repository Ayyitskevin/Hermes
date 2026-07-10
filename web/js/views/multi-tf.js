// Multi-timeframe regime read (C2).

import { api, chip, esc, fmtNum, fmtTime } from "../util.js";

export default {
  async mount(outlet) {
    outlet.innerHTML = `<div class="plate rise"><p class="micro">loading multi-TF…</p></div>`;
    let m;
    try { m = await api("/api/regime/multi-tf"); }
    catch (e) {
      outlet.innerHTML = `<div class="plate"><p class="micro">${esc(e.message)}</p></div>`;
      return;
    }
    outlet.innerHTML = `
      <div class="plate rise">
        <h2>Multi-timeframe regime
          <span class="micro">${esc(m.classifier)} · ${esc(fmtTime(m.generated_at))}</span></h2>
        <p class="mono">agree: ${m.agree_across_tf === null ? "∅" : m.agree_across_tf}
          — ${esc(m.agreement_note || "")}</p>
        <p class="micro">${esc(m.honesty?.claim || "")}</p>
        <table class="data"><thead><tr>
          <th>TF</th><th>status</th><th>label</th><th>score</th><th>conf</th><th>bars</th><th>note</th>
        </tr></thead><tbody>
          ${(m.rows || []).map((r) => `<tr>
            <td class="mono">${esc(r.timeframe)}${r.is_primary ? " ★" : ""}</td>
            <td>${chip(r.status)}</td>
            <td class="mono">${esc(r.label_display || r.label || "∅")}</td>
            <td class="mono">${r.score == null ? "∅" : fmtNum(r.score, 2)}</td>
            <td class="mono">${r.confidence == null ? "∅" : fmtNum(r.confidence, 2)}</td>
            <td class="mono">${r.bars ?? "—"}</td>
            <td class="micro">${esc(r.note || "")}</td>
          </tr>`).join("")}
        </tbody></table>
        <p class="micro" style="margin-top:0.75rem">${esc(m.honesty?.caveat || "")}</p>
      </div>`;
  },
};
