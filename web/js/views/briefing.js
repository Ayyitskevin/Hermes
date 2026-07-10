// Premarket one-screen briefing — posture, risk, RS, screener, journal, MISSED.

import { api, chip, esc, fmtNum, fmtTime } from "../util.js";

export default {
  async mount(outlet) {
    outlet.innerHTML = `<div class="plate rise"><p class="micro">loading briefing…</p></div>`;
    let b;
    try { b = await api("/api/briefing"); }
    catch (e) {
      outlet.innerHTML = `<div class="plate"><p class="micro">briefing unavailable — ${esc(e.message)}</p></div>`;
      return;
    }
    const reg = b.regime || {};
    const risk = b.risk || {};
    const j = b.journal || {};
    outlet.innerHTML = `
      <div class="plate rise">
        <h2>Premarket briefing <span class="micro">${esc(fmtTime(b.generated_at))}</span></h2>
        <p class="micro">${esc(b.honesty?.claim || "")}</p>
        <div class="kpi-row" style="display:flex;gap:1rem;flex-wrap:wrap;margin:1rem 0">
          <div><div class="micro">POSTURE</div><div class="mono" style="font-size:1.4rem">${esc((b.posture?.posture || "—").toUpperCase())}</div>
            <div class="micro">${esc(b.posture?.why || "")}</div></div>
          <div><div class="micro">RISK</div><div class="mono">${esc((risk.level || "—").toUpperCase())}
            · open ${fmtNum(risk.open_risk_pct, 2)}% · DD ${fmtNum(risk.drawdown_pct, 1)}%</div></div>
          <div><div class="micro">REGIME</div><div class="mono">${esc(reg.label_display || "∅ missing")}
            ${reg.confidence != null ? `· conf ${fmtNum(reg.confidence, 2)}` : ""}</div>
            <div class="micro">${esc(reg.classifier_version || "")} · ${esc(reg.source || "")}</div></div>
          <div><div class="micro">JOURNAL HABIT (P3)</div><div class="mono">${j.closed_resolved || 0}/${j.habit_gate || 20}
            <span class="chip">${esc(j.habit_status || "OPEN")}</span></div>
            <div class="micro">${j.open || 0} open · ${j.stale_open || 0} stale</div></div>
        </div>
      </div>
      <div class="plate rise" style="margin-top:1rem">
        <h2>Leadership / laggards</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
          <div><h3 class="micro">Leaders</h3><ul class="mono">${
            (b.leaders || []).map((x) => `<li>${esc(x.symbol)} ${esc(x.verdict || "")} ${fmtNum(x.mansfield, 1)}</li>`).join("")
            || "<li class='micro'>∅</li>"
          }</ul></div>
          <div><h3 class="micro">Laggards</h3><ul class="mono">${
            (b.laggards || []).map((x) => `<li>${esc(x.symbol)} ${esc(x.verdict || "")} ${fmtNum(x.mansfield, 1)}</li>`).join("")
            || "<li class='micro'>∅</li>"
          }</ul></div>
        </div>
      </div>
      <div class="plate rise" style="margin-top:1rem">
        <h2>Screener candidates (PASS/NEAR)</h2>
        <table class="data"><thead><tr><th>sym</th><th>verdict</th><th>score</th><th>compression</th></tr></thead>
        <tbody>${
          (b.candidates || []).map((c) => `<tr>
            <td class="mono">${esc(c.symbol)}</td>
            <td>${chip(c.verdict)}</td>
            <td class="mono">${c.score ?? "∅"}/8</td>
            <td class="micro">${esc(c.compression?.flag || "—")} ${esc(c.compression?.note || "")}</td>
          </tr>`).join("") || `<tr><td colspan="4" class="micro">∅ no PASS/NEAR</td></tr>`
        }</tbody></table>
      </div>
      <div class="plate rise" style="margin-top:1rem">
        <h2>Jobs</h2>
        <p class="mono">${(b.jobs_missed || []).length
          ? "MISSED: " + b.jobs_missed.map(esc).join(", ")
          : "no MISSED flags"}</p>
        <details><summary class="micro">markdown export</summary>
          <pre class="mono" style="white-space:pre-wrap">${esc(b.body_md || "")}</pre></details>
        <p class="micro" style="margin-top:0.5rem">${esc(b.honesty?.caveat || "")}</p>
      </div>`;
  },
};
