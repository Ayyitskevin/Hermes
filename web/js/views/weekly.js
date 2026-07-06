// Weekly Review — renders the real /api/reports/weekly output: the stored
// markdown body plus its honesty block (claim / methodology / caveat), and an
// honest empty state before the first run. (The prototype mocked a structured
// dashboard; the backend's actual product is the markdown review + caveat.)

import { api, chip, esc, fmtTime, renderMarkdown } from "../util.js";

async function load(outlet) {
  const body = outlet.querySelector("#wk-body");
  body.innerHTML = `<p class="micro"><span class="spinner"></span> loading…</p>`;
  let r;
  try { r = await api("/api/reports/weekly"); }
  catch (err) { body.innerHTML = `<div class="ai-unavail">${chip("fail")} ${esc(err.message)}</div>`; return; }

  const h = r.honesty || {};
  if (!r.body_md) {
    body.innerHTML = `
      <div class="placeholder">
        <div class="big">No weekly review yet</div>
        <p class="micro">The Sunday portfolio review hasn't run. Trigger it on demand — an empty book is fine:</p>
        <p><button class="btn-primary" id="wk-run">run weekly review now</button></p>
      </div>`;
    outlet.querySelector("#wk-run")?.addEventListener("click", async (ev) => {
      ev.target.disabled = true; ev.target.textContent = "running…";
      try { await api("/api/jobs/weekly_review/run", { method: "POST" }); }
      catch (err) { alert(err.message); }
      load(outlet);
    });
  } else {
    body.innerHTML = `<div class="prose">${renderMarkdown(r.body_md)}</div>`;
  }

  outlet.querySelector("#wk-honesty").innerHTML = `
    <div class="eyebrow">what this review proves — and what it does not</div>
    ${h.claim ? `<p style="margin:8px 0 0;font-size:16px;color:var(--ink)">${esc(h.claim)}</p>` : ""}
    <div class="methodology-note">${esc(h.methodology ?? "")}${h.caveat ? `<br>${esc(h.caveat)}` : ""}</div>`;
  outlet.querySelector("#wk-meta").textContent = r.generated_at ? `generated ${fmtTime(r.generated_at)}` : "not yet run";
}

export default {
  mount(outlet) {
    outlet.innerHTML = `
      <div class="view-head"><h1>Weekly Review</h1><span class="micro" id="wk-meta"></span></div>
      <div class="plate honesty-hero" id="wk-honesty"></div>
      <div class="plate">
        <h2><span class="label-x">Portfolio review</span>
          <span class="micro">a re-reading, not a new signal — recommends a review this Sunday, never a trade</span></h2>
        <div id="wk-body"></div>
      </div>`;
    load(outlet);
  },
};
