import { OnboardingPreferences } from "../application/onboarding-preferences";
import { escapeHtml } from "../core/html";
import { summarizeSetups } from "../core/performance";
import { sizePosition, type PositionSide } from "../core/sizing";
import type { JournalWorkspaceSnapshot, TabId, TradePreview } from "../core/types";
import type { JournalDataSource } from "../data/demo";

interface AppDependencies {
  readonly root: HTMLElement;
  readonly dataSource: JournalDataSource;
  readonly onboarding: OnboardingPreferences;
}

const TABS: ReadonlyArray<{ id: TabId; label: string; glyph: string }> = [
  { id: "dashboard", label: "Dashboard", glyph: "◉" },
  { id: "trades", label: "Trades", glyph: "⌁" },
  { id: "journal", label: "Journal", glyph: "✎" },
  { id: "reports", label: "Reports", glyph: "↗" },
  { id: "more", label: "More", glyph: "•••" },
];

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  signDisplay: "always",
});

function signedCurrency(value: number | null): string {
  return value === null ? "Open" : usd.format(value);
}

function signedR(value: number | null, unavailable = "Open"): string {
  if (value === null) return unavailable;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}R`;
}

function resultClass(value: number | null): "positive" | "negative" | "" {
  if (value === null || value === 0) return "";
  return value > 0 ? "positive" : "negative";
}

function tabTemplate(tab: { id: TabId; label: string; glyph: string }): string {
  return `<button class="tab" type="button" data-tab="${tab.id}" aria-label="${escapeHtml(tab.label)}">
    <span class="tab-glyph" aria-hidden="true">${escapeHtml(tab.glyph)}</span>
    <span>${escapeHtml(tab.label)}</span>
  </button>`;
}

function shellTemplate(): string {
  return `
    <div class="app-shell">
      <a class="skip-link" href="#screen">Skip to content</a>
      <header class="topbar">
        <div>
          <p class="eyebrow">TRADING JOURNAL</p>
          <p class="wordmark">HERMES</p>
        </div>
        <div class="topbar-actions">
          <span class="demo-badge">DEMO</span>
          <button class="icon-button" id="settings-open" type="button" aria-label="Open settings">•••</button>
        </div>
      </header>

      <p id="route-announcer" class="sr-only" aria-live="polite"></p>
      <main id="screen" tabindex="-1"></main>
      <nav class="tabbar" aria-label="Primary navigation">
        ${TABS.map(tabTemplate).join("")}
      </nav>

      <div class="sheet-backdrop" id="settings" hidden>
        <section class="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div class="sheet-handle" aria-hidden="true"></div>
          <div class="sheet-heading">
            <div><p class="eyebrow">HERMES JOURNAL</p><h2 id="settings-title">Settings</h2></div>
            <button class="icon-button" id="settings-close" type="button" aria-label="Close settings">×</button>
          </div>
          <div class="settings-block">
            <span class="demo-badge">DEMO DATA</span>
            <h3>Private foundation build</h3>
            <p>This demo uses bundled fictional records, makes no network requests, and stores no financial records.</p>
          </div>
          <button class="text-button" id="onboarding-reset" type="button">Replay welcome</button>
        </section>
      </div>
    </div>`;
}

function equityChart(snapshot: JournalWorkspaceSnapshot): string {
  const minimum = Math.min(...snapshot.equityCurve);
  const maximum = Math.max(...snapshot.equityCurve);
  const range = Math.max(maximum - minimum, 1);
  const denominator = Math.max(snapshot.equityCurve.length - 1, 1);
  const coordinates = snapshot.equityCurve.map((value, index) => ({
    x: (index / denominator) * 100,
    y: 92 - ((value - minimum) / range) * 80,
  }));
  const points = coordinates.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const markers = coordinates.map(({ x, y }) => `<circle class="equity-point" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.5" />`).join("");
  return `<svg class="equity-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Demo cumulative performance changes from ${escapeHtml(signedCurrency(snapshot.equityCurve[0] ?? 0))} to ${escapeHtml(signedCurrency(snapshot.equityCurve.at(-1) ?? 0))}">
    <line class="equity-grid" x1="0" y1="35" x2="100" y2="35" />
    <line class="equity-grid" x1="0" y1="65" x2="100" y2="65" />
    <polyline class="equity-line" points="${points}" />
    ${markers}
  </svg>`;
}

function compactTradeRow(trade: TradePreview): string {
  const tone = resultClass(trade.resultPnl);
  return `<article class="trade-row">
    <div><strong>${escapeHtml(trade.symbol)}</strong><span>${escapeHtml(trade.setup)} · ${escapeHtml(trade.side)}</span></div>
    <div class="numeric"><strong class="${tone}">${escapeHtml(signedCurrency(trade.resultPnl))}</strong><span>${escapeHtml(signedR(trade.resultR, trade.status === "open" ? "Open" : "—"))} · ${escapeHtml(trade.sessionLabel.split(" · ")[0] ?? trade.sessionLabel)}</span></div>
  </article>`;
}

function dashboardView(snapshot: JournalWorkspaceSnapshot): string {
  const performance = snapshot.performance;
  const bestSetup = summarizeSetups(snapshot.trades)[0];
  const recentTrades = [...snapshot.trades].reverse().slice(0, 4);
  return `<section class="screen-stack" aria-labelledby="dashboard-title">
    <div class="screen-heading">
      <div><p class="eyebrow">${escapeHtml(snapshot.accountLabel)} · ${escapeHtml(snapshot.periodLabel)}</p><h1 id="dashboard-title">Dashboard</h1></div>
      <span class="source-label">${escapeHtml(snapshot.provenanceLabel)}</span>
    </div>
    <article class="result-card">
      <p class="card-label">NET P&amp;L</p>
      <strong class="${resultClass(performance.netPnl)}">${escapeHtml(signedCurrency(performance.netPnl))}</strong>
      <span>${escapeHtml(signedR(performance.netR, "—"))} · ${performance.tradeCount} closed trades${performance.rTradeCount === performance.tradeCount ? "" : ` · R on ${performance.rTradeCount}`}</span>
    </article>
    <div class="metric-grid">
      <article class="card"><p class="card-label">WIN RATE</p><strong class="metric">${performance.winRatePct.toFixed(0)}%</strong><span>wins versus losses</span></article>
      <article class="card"><p class="card-label">PROFIT FACTOR</p><strong class="metric">${performance.profitFactor?.toFixed(2) ?? "—"}</strong><span>gross profit ÷ gross loss</span></article>
      <article class="card"><p class="card-label">AVG TRADE</p><strong class="metric">${escapeHtml(signedR(performance.averageR, "—"))}</strong><span>${performance.rTradeCount} of ${performance.tradeCount} with defined risk</span></article>
      <article class="card"><p class="card-label">PLAN FOLLOWED</p><strong class="metric">${performance.ruleAdherencePct.toFixed(0)}%</strong><span>${Math.round(performance.tradeCount * performance.ruleAdherencePct / 100)} of ${performance.tradeCount} trades</span></article>
    </div>
    <article class="card chart-card">
      <div class="section-title"><div><p class="card-label">CUMULATIVE RESULT</p><h2>Performance trend</h2></div><strong class="${resultClass(performance.netPnl)}">${escapeHtml(signedCurrency(performance.netPnl))}</strong></div>
      ${equityChart(snapshot)}
    </article>
    <section aria-labelledby="calendar-title">
      <div class="section-title"><h2 id="calendar-title">Trading days</h2><span>Demo journal</span></div>
      <div class="calendar-grid">
        ${snapshot.calendar.map((session) => `<article class="calendar-day ${session.pnl > 0 ? "gain" : session.pnl < 0 ? "loss" : ""}"><span>${escapeHtml(session.dayLabel)}</span><strong>${escapeHtml(session.dateLabel.replace("Jul ", ""))}</strong><small>${escapeHtml(signedCurrency(session.pnl))}</small></article>`).join("")}
      </div>
    </section>
    <article class="card review-card">
      <div><p class="card-label">BEST SETUP</p><h2>${escapeHtml(bestSetup?.name ?? "No closed trades")}</h2></div>
      <strong class="${resultClass(bestSetup?.netR ?? null)}">${escapeHtml(signedR(bestSetup?.netR ?? null, "—"))}</strong>
      <p>${performance.ruleAdherencePct.toFixed(0)}% plan adherence in this fictional journal. Review the two process mistakes before the next session.</p>
    </article>
    <div class="quick-actions" aria-label="Dashboard shortcuts">
      <button class="secondary-button" type="button" data-route="trades">Review trades</button>
      <button class="secondary-button" type="button" data-route="journal">Open journal</button>
    </div>
    <section aria-labelledby="recent-title">
      <div class="section-title"><h2 id="recent-title">Recent trades</h2><span>Fictional</span></div>
      <div class="trade-list">${recentTrades.map(compactTradeRow).join("")}</div>
    </section>
  </section>`;
}

function tradeCard(trade: TradePreview): string {
  const searchable = [trade.symbol, trade.side, trade.setup, trade.accountLabel, ...trade.tags].join(" ").toLowerCase();
  const tone = resultClass(trade.resultPnl);
  return `<article class="card trade-card" data-trade-search="${escapeHtml(searchable)}">
    <div class="trade-card-heading">
      <div><span class="status-chip">${escapeHtml(trade.side)}</span><h2>${escapeHtml(trade.symbol)}</h2><p>${escapeHtml(trade.setup)} · ${escapeHtml(trade.sessionLabel)}</p></div>
      <div class="journal-metrics"><strong class="${tone}">${escapeHtml(signedCurrency(trade.resultPnl))}</strong><span>${escapeHtml(signedR(trade.resultR, trade.status === "open" ? "Open" : "—"))}</span></div>
    </div>
    <dl class="execution-grid">
      <div><dt>Quantity</dt><dd>${trade.quantity}</dd></div>
      <div><dt>Average in</dt><dd>$${trade.averageEntry.toFixed(2)}</dd></div>
      <div><dt>Average out</dt><dd>${trade.averageExit === null ? "Open" : `$${trade.averageExit.toFixed(2)}`}</dd></div>
    </dl>
    <p>${escapeHtml(trade.note)}</p>
    <div class="tag-row">${trade.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
  </article>`;
}

function tradesView(snapshot: JournalWorkspaceSnapshot): string {
  return `<section class="screen-stack" aria-labelledby="trades-title">
    <div class="screen-heading"><div><p class="eyebrow">${snapshot.trades.length} FICTIONAL RECORDS</p><h1 id="trades-title">Trades</h1></div><span class="demo-badge">DEMO</span></div>
    <label class="search-field"><span class="sr-only">Search demo trades</span><input id="trade-search" type="search" placeholder="Search symbol, setup, or tag" autocomplete="off" /></label>
    <p class="result-count" id="trade-count" role="status">Showing ${snapshot.trades.length} trades</p>
    <div class="journal-list">${[...snapshot.trades].reverse().map(tradeCard).join("")}</div>
    <article class="empty-state" id="trade-empty" hidden><h2>No trades match</h2><p>Try another symbol, setup, side, or tag.</p></article>
  </section>`;
}

function journalView(snapshot: JournalWorkspaceSnapshot): string {
  return `<section class="screen-stack" aria-labelledby="journal-title">
    <div class="screen-heading"><div><p class="eyebrow">DAILY REVIEWS + PLAYBOOKS</p><h1 id="journal-title">Journal</h1></div><span class="demo-badge">DEMO</span></div>
    <section aria-labelledby="daily-notes-title">
      <div class="section-title"><h2 id="daily-notes-title">Daily notes</h2><span>${snapshot.dailyJournal.length} entries</span></div>
      <div class="journal-list">
        ${snapshot.dailyJournal.map((entry) => `<article class="card journal-note">
          <div class="journal-note-heading"><div><p class="card-label">${escapeHtml(entry.dateLabel)} · ${escapeHtml(entry.emotion)}</p><h2>${escapeHtml(entry.title)}</h2></div><strong>${entry.disciplineScore}%</strong></div>
          <p>${escapeHtml(entry.note)}</p>
          <div class="tag-row">${entry.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        </article>`).join("")}
      </div>
    </section>
    <section aria-labelledby="playbooks-title">
      <div class="section-title"><h2 id="playbooks-title">Playbooks</h2><span>Rules + results</span></div>
      <div class="journal-list">
        ${snapshot.playbooks.map((playbook) => `<article class="card playbook-card">
          <div><span class="status-chip">${playbook.tradeCount} trades</span><h2>${escapeHtml(playbook.name)}</h2></div>
          <strong class="${resultClass(playbook.netR)}">${escapeHtml(signedR(playbook.netR))}</strong>
          <p>${playbook.winRatePct.toFixed(0)}% win rate</p>
          <ul>${playbook.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul>
        </article>`).join("")}
      </div>
    </section>
  </section>`;
}

function reportsView(snapshot: JournalWorkspaceSnapshot): string {
  const setups = summarizeSetups(snapshot.trades);
  const performance = snapshot.performance;
  return `<section class="screen-stack" aria-labelledby="reports-title">
    <div class="screen-heading"><div><p class="eyebrow">PERFORMANCE ANALYTICS</p><h1 id="reports-title">Reports</h1></div><span class="demo-badge">DEMO</span></div>
    <div class="metric-grid">
      <article class="card"><p class="card-label">NET P&amp;L</p><strong class="metric ${resultClass(performance.netPnl)}">${escapeHtml(signedCurrency(performance.netPnl))}</strong><span>${escapeHtml(signedR(performance.netR, "—"))}</span></article>
      <article class="card"><p class="card-label">WIN RATE</p><strong class="metric">${performance.winRatePct.toFixed(0)}%</strong><span>${performance.tradeCount} closed trades</span></article>
      <article class="card"><p class="card-label">PROFIT FACTOR</p><strong class="metric">${performance.profitFactor?.toFixed(2) ?? "—"}</strong><span>profit relative to loss</span></article>
      <article class="card"><p class="card-label">EXPECTANCY</p><strong class="metric">${escapeHtml(signedR(performance.averageR, "—"))}</strong><span>${performance.rTradeCount} of ${performance.tradeCount} with defined risk</span></article>
    </div>
    <article class="card report-table-card">
      <div class="section-title"><div><p class="card-label">BY SETUP</p><h2>What is working</h2></div><span>${setups.length} setups</span></div>
      <div class="report-table" role="table" aria-label="Demo performance by setup">
        <div class="report-row report-header" role="row"><span role="columnheader">Setup</span><span role="columnheader">Trades</span><span role="columnheader">Win rate</span><span role="columnheader">Net</span></div>
        ${setups.map((setup) => `<div class="report-row" role="row"><strong role="cell">${escapeHtml(setup.name)}</strong><span role="cell">${setup.tradeCount}</span><span role="cell">${setup.winRatePct.toFixed(0)}%</span><span role="cell" class="${resultClass(setup.netR)}">${escapeHtml(signedR(setup.netR, "—"))}</span></div>`).join("")}
      </div>
    </article>
    <article class="card chart-card"><div class="section-title"><div><p class="card-label">JOURNAL CURVE</p><h2>Cumulative result</h2></div><strong class="${resultClass(performance.netPnl)}">${escapeHtml(signedCurrency(performance.netPnl))}</strong></div>${equityChart(snapshot)}</article>
  </section>`;
}

function sizingTool(): string {
  return `<article class="card">
    <p class="card-label">PLANNING TOOL</p><h2>Position size</h2>
    <p>Estimate a position as a percentage of equity from entry, stop, and risk limits.</p>
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
  </article>`;
}

function moreView(snapshot: JournalWorkspaceSnapshot): string {
  return `<section class="screen-stack" aria-labelledby="more-title">
    <div class="screen-heading"><div><p class="eyebrow">DATA + TOOLS</p><h1 id="more-title">More</h1></div><span class="demo-badge">DEMO</span></div>
    <article class="card import-receipt">
      <p class="card-label">DEMO IMPORT RECEIPT</p>
      <h2>${escapeHtml(snapshot.importSummary.sourceLabel)}</h2>
      <p>${escapeHtml(snapshot.importSummary.importedAtLabel)} · ${escapeHtml(snapshot.accountLabel)}</p>
      <div class="receipt-metrics">
        <div><strong>${snapshot.importSummary.trades}</strong><span>trades</span></div>
        <div><strong>${snapshot.importSummary.accounts}</strong><span>account</span></div>
        <div><strong>${snapshot.importSummary.rejectedRows}</strong><span>rejected</span></div>
      </div>
    </article>
    ${sizingTool()}
    <article class="card privacy-card"><p class="card-label">PRODUCT BOUNDARY</p><h2>Journal and retrospective analytics</h2><p>Hermes is being built to keep journal records on-device, support user-controlled exports, and never place or modify a brokerage order. This foundation currently stores only the welcome preference.</p></article>
  </section>`;
}

function viewFor(tab: TabId, snapshot: JournalWorkspaceSnapshot): string {
  switch (tab) {
    case "dashboard": return dashboardView(snapshot);
    case "trades": return tradesView(snapshot);
    case "journal": return journalView(snapshot);
    case "reports": return reportsView(snapshot);
    case "more": return moreView(snapshot);
  }
}

function onboardingTemplate(): string {
  return `<div class="onboarding" role="dialog" aria-modal="true" aria-label="Hermes Journal welcome">
    <div class="onboarding-brand"><span class="brand-mark" aria-hidden="true">H</span><span>HERMES JOURNAL</span></div>
    <div class="onboarding-pages">
      <section class="onboarding-page" data-page="0">
        <p class="eyebrow">01 · CAPTURE</p><h1 id="onboarding-title" tabindex="-1">See your trading clearly.</h1>
        <p>Bring every trade into one journal and review P&amp;L, R-multiple, notes, and consistency together.</p>
      </section>
      <section class="onboarding-page" data-page="1" hidden>
        <p class="eyebrow">02 · REVIEW</p><h1 tabindex="-1">Find the patterns.</h1>
        <p>Compare setups, mistakes, tags, symbols, and habits to understand what is actually working.</p>
      </section>
      <section class="onboarding-page" data-page="2" hidden>
        <p class="eyebrow">03 · OWN YOUR DATA</p><h1 tabindex="-1">Private by default.</h1>
        <p>Your journal is designed to stay on this device, with backups and exports under your control.</p>
      </section>
    </div>
    <div class="onboarding-footer">
      <div class="dots" role="progressbar" aria-label="Welcome progress" aria-valuemin="1" aria-valuemax="3" aria-valuenow="1" aria-valuetext="Step 1 of 3"><span class="active"></span><span></span><span></span></div>
      <button class="primary-button" id="onboarding-next" type="button">Continue</button>
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
      const sizing = sizePosition({ entryPrice: read("entry"), stopPrice: read("stop"), side, maxRiskPerTradePct: read("risk"), maxPositionSizePct: read("cap") });
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

function bindTradeSearch(root: HTMLElement, total: number): void {
  const input = root.querySelector<HTMLInputElement>("#trade-search");
  const count = root.querySelector<HTMLElement>("#trade-count");
  const empty = root.querySelector<HTMLElement>("#trade-empty");
  if (!input || !count || !empty) return;
  input.addEventListener("input", () => {
    const query = input.value.trim().toLowerCase();
    let visible = 0;
    root.querySelectorAll<HTMLElement>("[data-trade-search]").forEach((card) => {
      const matches = (card.dataset.tradeSearch ?? "").includes(query);
      card.hidden = !matches;
      if (matches) visible += 1;
    });
    count.textContent = query ? `Showing ${visible} of ${total} trades` : `Showing ${total} trades`;
    empty.hidden = visible !== 0;
  });
}

function bindOnboarding(
  root: HTMLElement,
  preferences: OnboardingPreferences,
  setBackgroundInert: (inert: boolean) => void,
): void {
  if (preferences.isComplete()) return;
  setBackgroundInert(true);
  root.insertAdjacentHTML("beforeend", onboardingTemplate());
  let page = 0;
  const next = root.querySelector<HTMLButtonElement>("#onboarding-next");
  const progress = root.querySelector<HTMLElement>(".dots");
  const update = () => {
    root.querySelectorAll<HTMLElement>("[data-page]").forEach((element, index) => {
      element.hidden = index !== page;
    });
    root.querySelectorAll<HTMLElement>(".dots span").forEach((dot, index) => {
      dot.classList.toggle("active", index === page);
    });
    if (next) next.textContent = page === 2 ? "Explore demo journal" : "Continue";
    progress?.setAttribute("aria-valuenow", String(page + 1));
    progress?.setAttribute("aria-valuetext", `Step ${page + 1} of 3`);
    root.querySelector<HTMLElement>(`[data-page="${page}"] h1`)?.focus({ preventScroll: true });
  };
  const finish = () => {
    preferences.complete();
    root.querySelector(".onboarding")?.remove();
    setBackgroundInert(false);
    root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
  };
  next?.addEventListener("click", () => page < 2 ? (page += 1, update()) : finish());
  update();
}

export async function startApp({ root, dataSource, onboarding }: AppDependencies): Promise<void> {
  const snapshot = await dataSource.loadWorkspace();
  root.innerHTML = shellTemplate();
  const screen = root.querySelector<HTMLElement>("#screen");
  const announcer = root.querySelector<HTMLElement>("#route-announcer");
  const settings = root.querySelector<HTMLElement>("#settings");
  let currentTab: TabId = "dashboard";
  let returnFocus: HTMLElement | null = null;

  const setBackgroundInert = (inert: boolean) => {
    document.body.classList.toggle("modal-open", inert);
    root.querySelectorAll<HTMLElement>(".skip-link, .topbar, #screen, .tabbar").forEach((element) => {
      if (inert) {
        element.setAttribute("inert", "");
        element.setAttribute("aria-hidden", "true");
      } else {
        element.removeAttribute("inert");
        element.removeAttribute("aria-hidden");
      }
    });
  };

  const openSettings = () => {
    const active = document.activeElement;
    returnFocus = active instanceof HTMLElement && active !== document.body
      ? active
      : root.querySelector<HTMLElement>("#settings-open") ?? screen;
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
    if (screen) screen.innerHTML = viewFor(tab, snapshot);
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
    if (tab === "more") bindSizingForm(root);
    if (tab === "trades") bindTradeSearch(root, snapshot.trades.length);
    root.querySelectorAll<HTMLButtonElement>("[data-route]").forEach((button) => {
      button.addEventListener("click", () => render((button.dataset.route as TabId | undefined) ?? currentTab));
    });
  };

  root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => render((button.dataset.tab as TabId | undefined) ?? currentTab));
  });
  root.querySelector("#settings-open")?.addEventListener("click", openSettings);
  root.querySelector("#settings-close")?.addEventListener("click", closeSettings);
  settings?.addEventListener("click", (event) => {
    if (event.target === settings) closeSettings();
  });
  root.querySelector("#onboarding-reset")?.addEventListener("click", () => {
    onboarding.reset();
    closeSettings();
    bindOnboarding(root, onboarding, setBackgroundInert);
  });
  document.addEventListener("keydown", (event) => {
    const welcome = root.querySelector<HTMLElement>(".onboarding");
    const settingsSheet = root.querySelector<HTMLElement>(".settings-sheet");
    if (welcome) trapModalFocus(welcome, event);
    else if (settings && !settings.hidden && settingsSheet) trapModalFocus(settingsSheet, event);
    if (event.key === "Escape" && settings && !settings.hidden) closeSettings();
  });

  render("dashboard", false);
  bindOnboarding(root, onboarding, setBackgroundInert);
}
