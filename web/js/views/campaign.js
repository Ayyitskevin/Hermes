// Phase-4 campaign status plate — UNSIGNED until the owner signs.

import { api, chip, esc, fmtTime } from "../util.js";

export default {
  async mount(outlet) {
    outlet.innerHTML = `<div class="plate rise"><p class="micro">loading…</p></div>`;
    await refresh(outlet);
  },
};

async function refresh(outlet) {
  let s;
  try { s = await api("/api/campaign"); }
  catch (e) {
    outlet.innerHTML = `<div class="plate"><p class="micro">${esc(e.message)}</p></div>`;
    return;
  }
  outlet.innerHTML = `
    <div class="plate rise">
      <h2>Campaign status <span class="chip">${esc(s.status || "UNSIGNED")}</span></h2>
      <p class="micro">${esc(s.honesty?.claim || "")}</p>
      <p class="mono">updated ${esc(fmtTime(s.updated_at) || "—")} by ${esc(s.updated_by || "—")}</p>
      <p>${esc(s.verdict || "")}</p>
      <pre class="micro" style="white-space:pre-wrap">${esc(s.evidence || "")}</pre>
      <form id="camp-form" style="display:grid;gap:8px;max-width:32rem;margin-top:1rem">
        <label>status
          <select name="status">
            ${["UNSIGNED","CONDITIONAL","SIGNED","REJECTED"].map((x) =>
              `<option value="${x}" ${x === s.status ? "selected" : ""}>${x}</option>`).join("")}
          </select>
        </label>
        <label>verdict <textarea name="verdict" rows="3">${esc(s.verdict || "")}</textarea></label>
        <label>evidence <textarea name="evidence" rows="4">${esc(s.evidence || "")}</textarea></label>
        <label>updated_by <input name="updated_by" value="operator"></label>
        <button class="btn-primary" type="submit">update status (owner call)</button>
      </form>
      <p class="micro" style="margin-top:0.75rem">${esc(s.honesty?.caveat || "")}</p>
    </div>`;
  outlet.querySelector("#camp-form")?.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const fd = new FormData(ev.target);
    const body = Object.fromEntries(fd.entries());
    try {
      await api("/api/campaign", { method: "POST", body: JSON.stringify(body) });
      await refresh(outlet);
    } catch (e) { alert(e.message); }
  });
}
