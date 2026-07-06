// Boot: build the persistent shell, register routes, start the hash-router,
// and keep the shared dashboard fresh. No build step — plain ES modules.

import { buildShell } from "./shell.js";
import { refreshDashboard } from "./store.js";
import { register, start } from "./router.js";
import desk from "./views/desk.js";
import journal from "./views/journal.js";
import weekly from "./views/weekly.js";
import { placeholder } from "./views/placeholder.js";

buildShell();

register("/desk", desk);
register("/journal", journal);
register("/weekly", weekly);

// Surfaces whose engines/endpoints land in later phases — navigable now,
// honest about what's not built yet.
const SOON = [
  ["/terminal", "Terminal", "C"], ["/size", "Sizing desk", "D"],
  ["/regime-lab", "Regime Lab", "E"], ["/pnl", "P&L / attribution", "F"],
  ["/scorecard", "Model scorecard", "G"], ["/stress", "Stress test", "H"],
  ["/sector", "Sector drill", "I"], ["/ledger", "Validation ledger", "J"],
];
for (const [route, title, phase] of SOON) register(route, placeholder(title, phase));
register("*", placeholder("Not found", null));

start(document.querySelector("#view"));

refreshDashboard();
setInterval(() => { if (!document.hidden) refreshDashboard(); }, 5 * 60 * 1000);

document.querySelector("#edgeprint").innerHTML =
  `<span class="micro">HERMES · decision-support only — no order paths exist in this codebase · every trade is placed by a human</span>`;
