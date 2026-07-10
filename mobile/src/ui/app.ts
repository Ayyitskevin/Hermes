import { OnboardingPreferences } from "../application/onboarding-preferences";
import { escapeHtml } from "../core/html";
import { deriveRiskPresentation } from "../core/risk-presentation";
import { sizePosition, type PositionSide } from "../core/sizing";
import type { DashboardSnapshot, TabId } from "../core/types";
import type { DashboardDataSource } from "../data/sample";

interface AppDependencies {
  readonly root: HTMLElement;
  readonly dataSource: DashboardDataSource;
  readonly onboarding: OnboardingPreferences;
}

const TABS: ReadonlyArray<{ id: TabId; label: string; glyph: string }> = [
  { id: "today", label: "Today", glyph: "◉" },
  { id: "trades", label: "Trades", glyph: "⌁" },
  { id: "journal", label: "Journal", glyph: "✎" },
  { id: "insights", label: "Insights", glyph: "↗" },
  { id: "more", label: "More", glyph: "•••" },
];

function signedR(value: number | null): string {
  if (value === null) return "Open";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}R`;
}

function tabTemplate(tab: { id: TabId; label: string; glyph: string }): string {
  return `<button class="tab" type="button" data-tab="${tab.id}" aria-label="${escapeHtml(tab.label)}">
    <span class="tab-glyph" aria-hidden="true">${escapeHtml(tab.glyph)}</span>
    <span>${escapeHtml(tab.label)}</span>
  </button>`;
}

function shellTemplate(snapshot: DashboardSnapshot): string {
  const risk = deriveRiskPresentation(snapshot.risk);
  return `
    <div class="app-shell">
      <a class="skip-link" href="#screen">Skip to content</a>
      <header class="topbar">
        <div>
          <p class="eyebrow">RISK BEFORE SIGNAL</p>
          <p class="wordmark">HERMES</p>
        </div>
        <div class="topbar-actions">
          <span class="sample-badge">SAMPLE</span>
          <button class="icon-button" id="settings-open" type="button" aria-label="Open settings">•••</button>
        </div>
      </header>

      <section class="risk-rail risk-${snapshot.risk.level}" aria-live="${risk.liveMode}">
        <button id="risk-toggle" class="risk-toggle" type="button" aria-expanded="false">
          <span class="risk-state"><span aria-hidden="true">●</span> ${escapeHtml(risk.label)}</span>
          <span class="risk-number">${snapshot.risk.openRiskPct.toFixed(1)} / ${snapshot.risk.limitPct.toFixed(1)}%</span>
          <span class="chevron" aria-hidden="true">⌄</span>
        </button>
        <div class="risk-details" id="risk-details" hidden>
          <span>Binding limit</span><strong>${escapeHtml(snapshot.risk.bindingLimit)}</strong>
          <span>Provenance</span><strong>${escapeHtml(snapshot.freshnessLabel)}</strong>
        </div>
      </section>

      <p id="route-announcer" class="sr-only" aria-live="polite"></p>
      <main id="screen" tabindex="-1"></main>
      <nav class="tabbar" aria-label="Primary navigation">
        ${TABS.map(tabTemplate).join("")}
      </nav>

      <div class="sheet-backdrop" id="settings" hidden>
        <section class="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div class="sheet-handle" aria-hidden="true"></div>
          <div class="sheet-heading">
            <div><p class="eyebrow">LOCAL-FIRST</p><h2 id="settings-title">Settings</h2></div>
            <button class="icon-button" id="settings-close" type="button" aria-label="Close settings">×</button>
          </div>
          <div class="settings-block">
            <span class="sample-badge">SAMPLE</span>
            <p>This foundation build uses only a bundled teaching tape. It makes no network requests and stores no financial records.</p>
          </div>
          <button class="secondary-button" id="connect-preview" type="button">Connected data status</button>
          <p class="inline-note" id="connect-status" role="status" tabindex="-1" hidden>Connection stays locked until provider distribution rights and the read-only adapter are verified.</p>
          <button class="text-button" id="onboarding-reset" type="button">Replay introduction</button>
        </section>
      </div>
    </div>`;
}

function dashboardView(snapshot: DashboardSnapshot): string {
  return `<section class="screen-stack" aria-labelledby="dashboard-title">
    <div class="screen-heading">
      <div><p class="eyebrow">JOURNAL · TEACHING DATA</p><h1 id="dashboard-title">Trading dashboard</h1></div>
      <span class="source-label">${escapeHtml(snapshot.provenanceLabel)}</span>
    </div>
    <article class="posture-card">
      <p class="card-label">RISK POSTURE</p>
      <strong>${escapeHtml(snapshot.posture)}</strong>
      <span>Risk budget intact in this sample scenario</span>
    </article>
    <div class="metric-grid">
      <article class="card"><p class="card-label">NET RESULT</p><strong class="metric">${signedR(snapshot.performance.netR)}</strong><span>${snapshot.performance.tradeCount} sample trades</span></article>
      <article class="card"><p class="card-label">WIN RATE</p><strong class="metric">${snapshot.performance.winRatePct.toFixed(1)}%</strong><span>${snapshot.performance.ruleAdherencePct.toFixed(0)}% rule adherence</span></article>
    </div>
    <article class="card regime-card">
      <div><p class="card-label">MARKET CONTEXT</p><h2>${escapeHtml(snapshot.regime)}</h2></div>
      <div class="confidence" aria-label="Confidence ${snapshot.confidencePct} percent">
        <strong>${snapshot.confidencePct}</strong><span>% confidence</span>
      </div>
    </article>
    <article class="card">
      <p class="card-label">PROCESS BRIEF</p>
      <p class="brief">${escapeHtml(snapshot.processBrief)}</p>
    </article>
    <section aria-labelledby="recent-title">
      <div class="section-title"><h2 id="recent-title">Recent trades</h2><span>Sample</span></div>
      <div class="trade-list">
        ${snapshot.journal.map((entry) => `<article class="trade-row">
          <div><strong>${escapeHtml(entry.symbol)}</strong><span>${escapeHtml(entry.setup)}</span></div>
          <div class="numeric"><strong class="${entry.resultR === null ? "" : entry.resultR >= 0 ? "positive" : "negative"}">${signedR(entry.resultR)}</strong><span>${escapeHtml(entry.sessionLabel)}</span></div>
        </article>`).join("")}
      </div>
    </section>
  </section>`;
}

function moreView(snapshot: DashboardSnapshot): string {
  return `<section class="screen-stack" aria-labelledby="more-title">
    <div class="screen-heading"><div><p class="eyebrow">LOCAL WORKSPACE</p><h1 id="more-title">More</h1></div></div>
    <article class="notice-card"><strong>Sample receipt only</strong><p>The durable importer lands with local SQLite. This screen makes no connection and cannot modify records yet.</p></article>
    <article class="card import-receipt">
      <p class="card-label">IMPORT · SAMPLE RECEIPT</p>
      <h2>${escapeHtml(snapshot.importSummary.sourceLabel)}</h2>
      <div class="receipt-metrics">
        <div><strong>${snapshot.importSummary.trades}</strong><span>trades</span></div>
        <div><strong>${snapshot.importSummary.accounts}</strong><span>account</span></div>
        <div><strong>${snapshot.importSummary.rejectedRows}</strong><span>rejected</span></div>
      </div>
    </article>
    <div class="two-up">
      <article class="card"><p class="card-label">CSV FIRST</p><h3>Broker export</h3><p>Map executions, fees, accounts, and timestamps on-device.</p></article>
      <article class="card"><p class="card-label">MANUAL</p><h3>Quick entry</h3><p>Record a trade without connecting an account.</p></article>
    </div>
  </section>`;
}

function journalView(): string {
  return `<section class="screen-stack" aria-labelledby="journal-title">
    <div class="screen-heading"><div><p class="eyebrow">NOTES + RULES</p><h1 id="journal-title">Journal</h1></div></div>
    <article class="notice-card"><strong>Notebook foundation</strong><p>Session notes, screenshots, mistake tags, emotions, and reusable templates land with local persistence.</p></article>
    <article class="card playbook-card">
      <div><span class="status-chip">sample playbook</span><h2>Breakout continuation</h2></div>
      <strong>+2.8R · 6 trades</strong>
      <ul><li>Confirmed trend and leadership</li><li>Entry inside the planned zone</li><li>Invalidation fixed before entry</li></ul>
    </article>
    <article class="card">
      <p class="card-label">POSITION SIZE TOOL</p>
      <form id="sizing-form" novalidate>
        <div class="segmented" role="group" aria-label="Position side">
          <button type="button" data-side="long" aria-pressed="true">Long</button>
          <button type="button" data-side="short" aria-pressed="false">Short</button>
        </div>
        <div class="field-grid">
          <label>Entry price<input id="entry" name="entry" type="number" inputmode="decimal" min="0" step="0.01" value="100" required /></label>
          <label>Stop price<input id="stop" name="stop" type="number" inputmode="decimal" min="0" step="0.01" value="95" required /></label>
          <label>Risk per trade, %<input id="risk" name="risk" type="number" inputmode="decimal" min="0" step="0.1" value="1" required /></label>
          <label>Position cap, %<input id="cap" name="cap" type="number" inputmode="decimal" min="0" step="0.1" value="20" required /></label>
        </div>
        <p class="form-error" id="sizing-error" role="alert" hidden></p>
        <button class="primary-button" type="submit">Calculate plan</button>
      </form>
      <div class="sizing-result" id="sizing-result" aria-live="polite" hidden>
        <div><span>Position</span><strong id="result-size">—</strong></div>
        <div><span>Planned risk</span><strong id="result-risk">—</strong></div>
        <div><span>Stop distance</span><strong id="result-stop">—</strong></div>
        <p id="result-cap"></p>
      </div>
    </article>
    <article class="card muted-card"><p class="card-label">PLAYBOOK REVIEW</p><h2>Rules become measurable</h2><p>Imported trades will be tagged to a playbook so analytics can separate edge from execution mistakes.</p></article>
  </section>`;
}

function tradesView(snapshot: DashboardSnapshot): string {
  return `<section class="screen-stack" aria-labelledby="trades-title">
    <div class="screen-heading"><div><p class="eyebrow">SAMPLE RECORDS</p><h1 id="trades-title">Trades</h1></div></div>
    <article class="notice-card"><strong>Read-only foundation</strong><p>These examples are bundled. Durable on-device journal records arrive in the persistence slice.</p></article>
    <div class="journal-list">
      ${snapshot.journal.map((entry) => `<article class="card journal-row">
        <div><span class="status-chip">${escapeHtml(entry.status)}</span><h2>${escapeHtml(entry.symbol)} · ${escapeHtml(entry.side)}</h2></div>
        <div class="journal-metrics"><strong class="${entry.resultR === null ? "" : entry.resultR >= 0 ? "positive" : "negative"}">${signedR(entry.resultR)}</strong><span>${entry.plannedRiskPct.toFixed(1)}% planned risk</span></div>
        <p class="journal-setup">${escapeHtml(entry.setup)} · ${escapeHtml(entry.sessionLabel)}</p>
        <p>${escapeHtml(entry.thesis)}</p>
      </article>`).join("")}
    </div>
  </section>`;
}

function insightsView(snapshot: DashboardSnapshot): string {
  return `<section class="screen-stack" aria-labelledby="insights-title">
    <div class="screen-heading"><div><p class="eyebrow">PERFORMANCE</p><h1 id="insights-title">Insights</h1></div></div>
    <div class="metric-grid">
      <article class="card"><p class="card-label">PROFIT FACTOR</p><strong class="metric">${snapshot.performance.profitFactor.toFixed(2)}</strong><span>sample journal</span></article>
      <article class="card"><p class="card-label">AVERAGE TRADE</p><strong class="metric">${signedR(snapshot.performance.averageR)}</strong><span>expectancy in R</span></article>
      <article class="card"><p class="card-label">WIN RATE</p><strong class="metric">${snapshot.performance.winRatePct.toFixed(1)}%</strong><span>wins versus losses</span></article>
      <article class="card"><p class="card-label">PROCESS</p><strong class="metric">${snapshot.performance.ruleAdherencePct.toFixed(0)}%</strong><span>rules followed</span></article>
    </div>
    <article class="card"><p class="card-label">REPORTS</p><h2>Find the pattern behind the result</h2><p>Filters by setup, tag, day, time, direction, account, and instrument arrive with the normalized import model.</p></article>
    <article class="card"><p class="card-label">HERMES DIFFERENTIATOR</p><h2>Risk and regime beside performance</h2><p>The journal will compare execution quality with the risk posture and market context frozen when the trade was planned.</p></article>
  </section>`;
}

function viewFor(tab: TabId, snapshot: DashboardSnapshot): string {
  switch (tab) {
    case "today": return dashboardView(snapshot);
    case "trades": return tradesView(snapshot);
    case "journal": return journalView();
    case "insights": return insightsView(snapshot);
    case "more": return moreView(snapshot);
  }
}

function onboardingTemplate(): string {
  return `<div class="onboarding" role="dialog" aria-modal="true" aria-label="Hermes introduction">
    <div class="onboarding-brand"><span class="brand-mark" aria-hidden="true">H</span><span>HERMES</span></div>
    <div class="onboarding-pages">
      <section class="onboarding-page" data-page="0">
        <p class="eyebrow">01 · THE RULE</p><h1 id="onboarding-title" tabindex="-1">Risk before signal.</h1>
        <p>Import, journal, and analyze every trade around the risk and rules you chose first.</p>
      </section>
      <section class="onboarding-page" data-page="1" hidden>
        <p class="eyebrow">02 · THE BOUNDARY</p><h1 tabindex="-1">Decision support only.</h1>
        <p>Hermes analyzes and teaches. It cannot execute a trade. You remain the final decision-maker.</p>
      </section>
      <section class="onboarding-page" data-page="2" hidden>
        <p class="eyebrow">03 · START LOCAL</p><h1 tabindex="-1">Explore a frozen sample.</h1>
        <p>The first workspace is bundled on your device, clearly labeled, and works with no connection or account.</p>
      </section>
    </div>
    <div class="onboarding-footer">
      <div class="dots" role="progressbar" aria-label="Introduction progress" aria-valuemin="1" aria-valuemax="3" aria-valuenow="1" aria-valuetext="Step 1 of 3"><span class="active"></span><span></span><span></span></div>
      <button class="primary-button" id="onboarding-next" type="button">Continue</button>
      <button class="text-button" id="onboarding-connect" type="button" hidden>Connect data</button>
    </div>
  </div>`;
}

function trapModalFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(
    'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hidden && element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  const activeIsInTabOrder = active instanceof HTMLElement && focusable.includes(active);
  if (!container.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (!activeIsInTabOrder && active instanceof HTMLElement) {
    const destination = event.shiftKey
      ? [...focusable].reverse().find((element) => (
        element.compareDocumentPosition(active) & Node.DOCUMENT_POSITION_FOLLOWING
      )) ?? last
      : focusable.find((element) => (
        active.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING
      )) ?? first;
    event.preventDefault();
    destination.focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function bindSizingForm(root: HTMLElement): void {
  const form = root.querySelector<HTMLFormElement>("#sizing-form");
  if (!form) return;

  let side: PositionSide = "long";
  form.querySelectorAll<HTMLButtonElement>("[data-side]").forEach((button) => {
    button.addEventListener("click", () => {
      side = button.dataset.side === "short" ? "short" : "long";
      form.querySelectorAll<HTMLButtonElement>("[data-side]").forEach((candidate) => {
        candidate.setAttribute("aria-pressed", String(candidate === button));
      });
    });
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const error = root.querySelector<HTMLElement>("#sizing-error");
    const result = root.querySelector<HTMLElement>("#sizing-result");
    if (!error || !result) return;
    try {
      const read = (id: string) => Number(root.querySelector<HTMLInputElement>(`#${id}`)?.value);
      const sizing = sizePosition({
        entryPrice: read("entry"),
        stopPrice: read("stop"),
        side,
        maxRiskPerTradePct: read("risk"),
        maxPositionSizePct: read("cap"),
      });
      error.hidden = true;
      result.hidden = false;
      const size = root.querySelector<HTMLElement>("#result-size");
      const risk = root.querySelector<HTMLElement>("#result-risk");
      const stop = root.querySelector<HTMLElement>("#result-stop");
      const cap = root.querySelector<HTMLElement>("#result-cap");
      if (size) size.textContent = `${sizing.sizePctEquity.toFixed(2)}%`;
      if (risk) risk.textContent = `${sizing.plannedRiskPct.toFixed(3)}%`;
      if (stop) stop.textContent = `${sizing.stopDistancePct.toFixed(2)}%`;
      if (cap) cap.textContent = sizing.cappedBy ? "Reduced by the position-size ceiling." : "No limit reduced this plan.";
    } catch (caught) {
      result.hidden = true;
      error.hidden = false;
      error.textContent = caught instanceof Error ? caught.message : "Check the plan inputs.";
    }
  });
}

function bindOnboarding(
  root: HTMLElement,
  preferences: OnboardingPreferences,
  openSettings: (returnTo?: HTMLElement) => void,
  setBackgroundInert: (inert: boolean) => void,
): void {
  if (preferences.isComplete()) return;
  setBackgroundInert(true);
  root.insertAdjacentHTML("beforeend", onboardingTemplate());
  let page = 0;
  const next = root.querySelector<HTMLButtonElement>("#onboarding-next");
  const connect = root.querySelector<HTMLButtonElement>("#onboarding-connect");
  const progress = root.querySelector<HTMLElement>(".dots");
  const update = () => {
    root.querySelectorAll<HTMLElement>("[data-page]").forEach((element, index) => {
      element.hidden = index !== page;
    });
    root.querySelectorAll<HTMLElement>(".dots span").forEach((dot, index) => {
      dot.classList.toggle("active", index === page);
    });
    if (next) next.textContent = page === 2 ? "Explore sample" : "Continue";
    if (connect) connect.hidden = page !== 2;
    progress?.setAttribute("aria-valuenow", String(page + 1));
    progress?.setAttribute("aria-valuetext", `Step ${page + 1} of 3`);
    root.querySelector<HTMLElement>(`[data-page="${page}"] h1`)?.focus({ preventScroll: true });
  };
  const finish = (connectAfter: boolean) => {
    preferences.complete();
    root.querySelector(".onboarding")?.remove();
    setBackgroundInert(false);
    if (connectAfter) {
      const fallback = root.querySelector<HTMLElement>("#settings-open") ?? undefined;
      openSettings(fallback);
    }
    else root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
  };
  next?.addEventListener("click", () => page < 2 ? (page += 1, update()) : finish(false));
  connect?.addEventListener("click", () => finish(true));
  update();
}

export async function startApp({ root, dataSource, onboarding }: AppDependencies): Promise<void> {
  const snapshot = await dataSource.loadSnapshot();
  root.innerHTML = shellTemplate(snapshot);
  const screen = root.querySelector<HTMLElement>("#screen");
  const announcer = root.querySelector<HTMLElement>("#route-announcer");
  const settings = root.querySelector<HTMLElement>("#settings");
  const riskPresentation = deriveRiskPresentation(snapshot.risk);
  let currentTab: TabId = "today";
  let returnFocus: HTMLElement | null = null;

  const setBackgroundInert = (inert: boolean) => {
    document.body.classList.toggle("modal-open", inert);
    root.querySelectorAll<HTMLElement>(".skip-link, .topbar, .risk-rail, #screen, .tabbar").forEach((element) => {
      const blockedByRisk = element.id === "screen" && riskPresentation.contentInert;
      if (inert || blockedByRisk) {
        element.setAttribute("inert", "");
        element.setAttribute("aria-hidden", "true");
      } else {
        element.removeAttribute("inert");
        element.removeAttribute("aria-hidden");
      }
    });
  };

  const openSettings = (returnTo?: HTMLElement) => {
    const active = document.activeElement;
    returnFocus = returnTo ?? (
      active instanceof HTMLElement && active !== document.body
        ? active
        : root.querySelector<HTMLElement>("#settings-open") ?? screen
    );
    setBackgroundInert(true);
    if (settings) settings.hidden = false;
    root.querySelector<HTMLElement>("#settings-close")?.focus();
  };
  const closeSettings = () => {
    if (settings) settings.hidden = true;
    setBackgroundInert(false);
    returnFocus?.focus();
  };
  const render = (tab: TabId, announce = true) => {
    currentTab = tab;
    if (screen) {
      screen.innerHTML = viewFor(tab, snapshot);
      if (riskPresentation.contentInert) screen.setAttribute("inert", "");
      else screen.removeAttribute("inert");
    }
    root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (announce && announcer) announcer.textContent = `${TABS.find((item) => item.id === tab)?.label ?? "Screen"} screen`;
    if (announce) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      screen?.focus({ preventScroll: true });
    }
    if (tab === "journal") bindSizingForm(root);
  };

  root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => render((button.dataset.tab as TabId | undefined) ?? currentTab));
  });
  root.querySelector("#risk-toggle")?.addEventListener("click", () => {
    const toggle = root.querySelector<HTMLButtonElement>("#risk-toggle");
    const details = root.querySelector<HTMLElement>("#risk-details");
    if (!toggle || !details) return;
    const expanded = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!expanded));
    details.hidden = expanded;
  });
  root.querySelector("#settings-open")?.addEventListener("click", () => openSettings());
  root.querySelector("#settings-close")?.addEventListener("click", closeSettings);
  settings?.addEventListener("click", (event) => {
    if (event.target === settings) closeSettings();
  });
  root.querySelector("#connect-preview")?.addEventListener("click", () => {
    const status = root.querySelector<HTMLElement>("#connect-status");
    if (status) {
      status.hidden = false;
      status.focus({ preventScroll: true });
    }
  });
  root.querySelector("#onboarding-reset")?.addEventListener("click", () => {
    onboarding.reset();
    closeSettings();
    bindOnboarding(root, onboarding, openSettings, setBackgroundInert);
  });
  document.addEventListener("keydown", (event) => {
    const introduction = root.querySelector<HTMLElement>(".onboarding");
    const settingsSheet = root.querySelector<HTMLElement>(".settings-sheet");
    if (introduction) trapModalFocus(introduction, event);
    else if (settings && !settings.hidden && settingsSheet) trapModalFocus(settingsSheet, event);
    if (event.key === "Escape" && settings && !settings.hidden) closeSettings();
  });

  render("today", false);
  bindOnboarding(root, onboarding, openSettings, setBackgroundInert);
}
