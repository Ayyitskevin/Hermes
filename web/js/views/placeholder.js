// Honest placeholder for surfaces whose engine + endpoint land in a later
// phase. The shell (nav, model selector, live tape, dominant risk rail) is
// already wired around it; only the view's data is pending.

import { esc } from "../util.js";

export function placeholder(title, phase) {
  return {
    mount(outlet) {
      outlet.innerHTML = `
        <div class="view-head"><h1>${esc(title)}</h1></div>
        <div class="plate"><div class="placeholder">
          <div class="big">${esc(title)}</div>
          ${phase
            ? `<p class="micro">This surface lands in <strong>Phase ${esc(phase)}</strong> — its
                 engine and endpoint aren't built yet. Missing stays missing: nothing here is faked.</p>`
            : `<p class="micro">No such surface.</p>`}
          <p class="micro">The shell, model selector, live tape, and the dominant risk rail are
            already wired; this view arrives with its data.</p>
        </div></div>`;
    },
  };
}
