import { JournalApplication } from "../application/journal-application";
import type { PreparedCsvImport } from "../application/journal-store";
import { OnboardingPreferences } from "../application/onboarding-preferences";
import {
  DEFAULT_CSV_LIMITS,
  type CsvHeaderMapping,
  type CsvImportField,
} from "../core/csv";
import { escapeHtml } from "../core/html";
import { summarizeSetups } from "../core/performance";
import { sizePosition, type PositionSide } from "../core/sizing";
import type { JournalWorkspaceSnapshot, TabId, TradePreview } from "../core/types";

interface AppDependencies {
  readonly root: HTMLElement;
  readonly application: JournalApplication;
  readonly onboarding: OnboardingPreferences;
}

const TABS: ReadonlyArray<{ id: TabId; label: string; glyph: string }> = [
  { id: "dashboard", label: "Dashboard", glyph: "◉" },
  { id: "trades", label: "Trades", glyph: "⌁" },
  { id: "journal", label: "Journal", glyph: "✎" },
  { id: "reports", label: "Reports", glyph: "↗" },
  { id: "more", label: "More", glyph: "•••" },
];

const CSV_FIELDS: ReadonlyArray<{ readonly id: CsvImportField; readonly label: string }> = [
  { id: "executionId", label: "Execution ID (optional)" },
  { id: "symbol", label: "Symbol" },
  { id: "side", label: "Side" },
  { id: "quantity", label: "Quantity" },
  { id: "price", label: "Price" },
  { id: "fee", label: "Fee (optional)" },
  { id: "currency", label: "Currency (optional)" },
  { id: "executedAt", label: "Executed at" },
];

function signedCurrency(value: number | null, currency: string): string {
  if (value === null) return "Open";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    signDisplay: "always",
  }).format(value);
}

function currencyValue(value: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 6,
  }).format(value);
}

function signedR(value: number | null, unavailable = "Open"): string {
  if (value === null) return unavailable;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}R`;
}

function resultClass(value: number | null): "positive" | "negative" | "" {
  if (value === null || value === 0) return "";
  return value > 0 ? "positive" : "negative";
}

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function modeLabel(snapshot: JournalWorkspaceSnapshot): string {
  if (snapshot.provenance === "demo") return "DEMO";
  if (snapshot.provenance === "empty") return "NEW";
  return "LOCAL";
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
          <span class="demo-badge" id="mode-badge">LOCAL</span>
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
            <span class="demo-badge" id="storage-badge">ON DEVICE</span>
            <h3 id="storage-title">Private local journal</h3>
            <p id="storage-copy">Execution records are encrypted in the native iOS database and are never sent to Hermes servers.</p>
          </div>
          <button class="secondary-button" id="mode-toggle" type="button">Explore demo journal</button>
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
  return `<svg class="equity-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Cumulative performance changes from ${escapeHtml(signedCurrency(snapshot.equityCurve[0] ?? 0, snapshot.currencyCode))} to ${escapeHtml(signedCurrency(snapshot.equityCurve.at(-1) ?? 0, snapshot.currencyCode))}">
    <line class="equity-grid" x1="0" y1="35" x2="100" y2="35" />
    <line class="equity-grid" x1="0" y1="65" x2="100" y2="65" />
    <polyline class="equity-line" points="${points}" />
    ${markers}
  </svg>`;
}

function compactTradeRow(trade: TradePreview, currency: string): string {
  const tone = resultClass(trade.resultPnl);
  return `<article class="trade-row">
    <div><strong>${escapeHtml(trade.symbol)}</strong><span>${escapeHtml(trade.setup)} · ${escapeHtml(trade.side)}</span></div>
    <div class="numeric"><strong class="${tone}">${escapeHtml(signedCurrency(trade.resultPnl, currency))}</strong><span>${escapeHtml(signedR(trade.resultR, trade.status === "open" ? "Open" : "—"))} · ${escapeHtml(trade.sessionLabel.split(" · ")[0] ?? trade.sessionLabel)}</span></div>
  </article>`;
}

function importTool(snapshot: JournalWorkspaceSnapshot): string {
  const defaultTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const accountValue = "";
  return `<article class="card import-tool" aria-labelledby="import-tool-title">
    <p class="card-label">GENERIC BROKER CSV</p>
    <h2 id="import-tool-title">Import executions</h2>
    <p>Hermes previews and validates the file before one atomic on-device commit. Required columns: symbol, side, quantity, price, and execution time.</p>
    <form id="csv-import-form" novalidate>
      <div class="field-grid">
        <label>Account name<input id="import-account" name="account" type="text" maxlength="256" value="${escapeHtml(accountValue)}" placeholder="e.g. Brokerage" autocomplete="off" required /></label>
        <label>Time zone<input id="import-time-zone" name="timeZone" type="text" maxlength="100" value="${escapeHtml(snapshot.provenance === "empty" ? defaultTimeZone : snapshot.timeZone)}" autocomplete="off" required /></label>
        <label>Workspace currency<input id="import-currency" name="currency" type="text" maxlength="3" value="${escapeHtml(snapshot.currencyCode)}" autocapitalize="characters" required /></label>
        <label>CSV file<input id="import-file" name="file" type="file" accept=".csv,text/csv,text/plain" required /></label>
      </div>
      <p class="helper-text">Timestamps without an offset use the selected IANA time zone. The first journal version intentionally prevents mixed-currency aggregation.</p>
      <button class="primary-button" type="submit">Preview CSV</button>
      <p id="import-status" class="result-count" role="status" aria-live="polite"></p>
      <div id="import-preview"></div>
    </form>
  </article>`;
}

function emptyDashboardView(snapshot: JournalWorkspaceSnapshot): string {
  return `<section class="screen-stack" aria-labelledby="dashboard-title">
    <div class="screen-heading">
      <div><p class="eyebrow">PRIVATE · EXECUTION FIRST</p><h1 id="dashboard-title">Build your journal</h1></div>
      <span class="source-label">EMPTY JOURNAL</span>
    </div>
    <article class="result-card empty-result-card">
      <p class="card-label">YOUR DATA, YOUR DEVICE</p>
      <strong>Import. Review. Improve.</strong>
      <span>No subscription, broker credentials, order placement, or Hermes cloud account.</span>
    </article>
    ${importTool(snapshot)}
    <article class="card">
      <p class="card-label">WANT TO LOOK AROUND FIRST?</p>
      <h2>Explore a fictional journal</h2>
      <p>The demo is clearly labeled and never mixes with your imported records.</p>
      <button class="secondary-button" type="button" data-explore-demo>Explore demo journal</button>
    </article>
  </section>`;
}

function dashboardView(snapshot: JournalWorkspaceSnapshot): string {
  if (snapshot.provenance === "empty") return emptyDashboardView(snapshot);
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
      <strong class="${resultClass(performance.netPnl)}">${escapeHtml(signedCurrency(performance.netPnl, snapshot.currencyCode))}</strong>
      <span>${escapeHtml(signedR(performance.netR, "—"))} · ${countNoun(performance.tradeCount, "trade")} with realized P&amp;L${performance.rTradeCount === performance.tradeCount ? "" : ` · R on ${performance.rTradeCount}`}</span>
    </article>
    <div class="metric-grid">
      <article class="card"><p class="card-label">WIN RATE</p><strong class="metric">${performance.winRatePct.toFixed(0)}%</strong><span>wins versus losses</span></article>
      <article class="card"><p class="card-label">PROFIT FACTOR</p><strong class="metric">${performance.profitFactor?.toFixed(2) ?? "—"}</strong><span>gross profit ÷ gross loss</span></article>
      <article class="card"><p class="card-label">AVG TRADE</p><strong class="metric">${escapeHtml(signedR(performance.averageR, "—"))}</strong><span>${performance.rTradeCount} of ${performance.tradeCount} with defined risk</span></article>
      <article class="card"><p class="card-label">PLAN FOLLOWED</p><strong class="metric">${performance.ruleAdherencePct === null ? "—" : `${performance.ruleAdherencePct.toFixed(0)}%`}</strong><span>${performance.ruleAdherencePct === null ? "Not classified" : `${Math.round(performance.ruleReviewCount * performance.ruleAdherencePct / 100)} of ${performance.ruleReviewCount} reviewed trades`}</span></article>
    </div>
    <article class="card chart-card">
      <div class="section-title"><div><p class="card-label">CUMULATIVE RESULT</p><h2>Performance trend</h2></div><strong class="${resultClass(performance.netPnl)}">${escapeHtml(signedCurrency(performance.netPnl, snapshot.currencyCode))}</strong></div>
      ${equityChart(snapshot)}
    </article>
    <section aria-labelledby="calendar-title">
      <div class="section-title"><h2 id="calendar-title">Trading days</h2><span>${snapshot.provenance === "demo" ? "Demo journal" : "Local journal"}</span></div>
      <div class="calendar-grid">
        ${snapshot.calendar.map((session) => `<article class="calendar-day ${session.pnl > 0 ? "gain" : session.pnl < 0 ? "loss" : ""}"><span>${escapeHtml(session.dayLabel)}</span><strong>${escapeHtml(session.dateLabel)}</strong><small>${escapeHtml(signedCurrency(session.pnl, snapshot.currencyCode))}</small></article>`).join("")}
      </div>
    </section>
    <article class="card review-card">
      <div><p class="card-label">BEST SETUP</p><h2>${escapeHtml(bestSetup?.name ?? "No trades with realized P&L")}</h2></div>
      <strong class="${resultClass(bestSetup?.netR ?? null)}">${escapeHtml(signedR(bestSetup?.netR ?? null, "—"))}</strong>
      <p>${snapshot.provenance === "demo" && performance.ruleAdherencePct !== null ? `${performance.ruleAdherencePct.toFixed(0)}% plan adherence in this fictional journal.` : "Classify setups and add journal notes to make this review more useful."}</p>
    </article>
    <div class="quick-actions" aria-label="Dashboard shortcuts">
      <button class="secondary-button" type="button" data-route="trades">Review trades</button>
      <button class="secondary-button" type="button" data-route="journal">Open journal</button>
    </div>
    <section aria-labelledby="recent-title">
      <div class="section-title"><h2 id="recent-title">Recent trades</h2><span>${snapshot.provenance === "demo" ? "Fictional" : "On device"}</span></div>
      <div class="trade-list">${recentTrades.map((trade) => compactTradeRow(trade, snapshot.currencyCode)).join("")}</div>
    </section>
  </section>`;
}

function tradeCard(trade: TradePreview, currency: string): string {
  const searchable = [trade.symbol, trade.side, trade.setup, trade.accountLabel, ...trade.tags].join(" ").toLowerCase();
  const tone = resultClass(trade.resultPnl);
  return `<article class="card trade-card" data-trade-search="${escapeHtml(searchable)}">
    <div class="trade-card-heading">
      <div><span class="status-chip">${escapeHtml(trade.side)}</span><h2>${escapeHtml(trade.symbol)}</h2><p>${escapeHtml(trade.setup)} · ${escapeHtml(trade.sessionLabel)}</p></div>
      <div class="journal-metrics"><strong class="${tone}">${escapeHtml(signedCurrency(trade.resultPnl, currency))}</strong><span>${escapeHtml(signedR(trade.resultR, trade.status === "open" ? "Open" : "—"))}</span></div>
    </div>
    <dl class="execution-grid">
      <div><dt>Quantity</dt><dd>${trade.quantity}</dd></div>
      <div><dt>Average in</dt><dd>${escapeHtml(currencyValue(trade.averageEntry, currency))}</dd></div>
      <div><dt>Average out</dt><dd>${trade.averageExit === null ? "Open" : escapeHtml(currencyValue(trade.averageExit, currency))}</dd></div>
    </dl>
    <p>${escapeHtml(trade.note)}</p>
    <div class="tag-row">${trade.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
  </article>`;
}

function tradesView(snapshot: JournalWorkspaceSnapshot): string {
  return `<section class="screen-stack" aria-labelledby="trades-title">
    <div class="screen-heading"><div><p class="eyebrow">${snapshot.trades.length} ${snapshot.provenance === "demo" ? "FICTIONAL" : "EXECUTION-DERIVED"} ${snapshot.trades.length === 1 ? "RECORD" : "RECORDS"}</p><h1 id="trades-title">Trades</h1></div><span class="demo-badge">${modeLabel(snapshot)}</span></div>
    <label class="search-field"><span class="sr-only">Search trades</span><input id="trade-search" type="search" placeholder="Search symbol, setup, or tag" autocomplete="off" /></label>
    <p class="result-count" id="trade-count" role="status">Showing ${countNoun(snapshot.trades.length, "trade")}</p>
    <div class="journal-list">${[...snapshot.trades].reverse().map((trade) => tradeCard(trade, snapshot.currencyCode)).join("")}</div>
    <article class="empty-state" id="trade-empty" ${snapshot.trades.length === 0 ? "" : "hidden"}><h2>${snapshot.trades.length === 0 ? "No trades yet" : "No trades match"}</h2><p>${snapshot.trades.length === 0 ? "Import executions from the More tab to build your journal." : "Try another symbol, setup, side, or tag."}</p></article>
  </section>`;
}

function journalView(snapshot: JournalWorkspaceSnapshot): string {
  return `<section class="screen-stack" aria-labelledby="journal-title">
    <div class="screen-heading"><div><p class="eyebrow">DAILY REVIEWS + PLAYBOOKS</p><h1 id="journal-title">Journal</h1></div><span class="demo-badge">${modeLabel(snapshot)}</span></div>
    <section aria-labelledby="daily-notes-title">
      <div class="section-title"><h2 id="daily-notes-title">Daily notes</h2><span>${snapshot.dailyJournal.length} entries</span></div>
      <div class="journal-list">
        ${snapshot.dailyJournal.map((entry) => `<article class="card journal-note">
          <div class="journal-note-heading"><div><p class="card-label">${escapeHtml(entry.dateLabel)} · ${escapeHtml(entry.emotion)}</p><h2>${escapeHtml(entry.title)}</h2></div><strong>${entry.disciplineScore}%</strong></div>
          <p>${escapeHtml(entry.note)}</p>
          <div class="tag-row">${entry.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
        </article>`).join("")}
        ${snapshot.dailyJournal.length === 0 ? `<article class="empty-state"><h2>Journal notes are next</h2><p>Your execution ledger is ready for the review and playbook layer.</p></article>` : ""}
      </div>
    </section>
    <section aria-labelledby="playbooks-title">
      <div class="section-title"><h2 id="playbooks-title">Playbooks</h2><span>Rules + results</span></div>
      <div class="journal-list">
        ${snapshot.playbooks.map((playbook) => `<article class="card playbook-card">
          <div><span class="status-chip">${countNoun(playbook.tradeCount, "trade")}</span><h2>${escapeHtml(playbook.name)}</h2></div>
          <strong class="${resultClass(playbook.netR)}">${escapeHtml(signedR(playbook.netR))}</strong>
          <p>${playbook.winRatePct.toFixed(0)}% win rate</p>
          <ul>${playbook.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul>
        </article>`).join("")}
        ${snapshot.playbooks.length === 0 ? `<article class="empty-state"><h2>No playbooks yet</h2><p>Setup classification will turn imported trades into playbook analytics.</p></article>` : ""}
      </div>
    </section>
  </section>`;
}

function reportsView(snapshot: JournalWorkspaceSnapshot): string {
  const setups = summarizeSetups(snapshot.trades);
  const performance = snapshot.performance;
  return `<section class="screen-stack" aria-labelledby="reports-title">
    <div class="screen-heading"><div><p class="eyebrow">PERFORMANCE ANALYTICS</p><h1 id="reports-title">Reports</h1></div><span class="demo-badge">${modeLabel(snapshot)}</span></div>
    <div class="metric-grid">
      <article class="card"><p class="card-label">NET P&amp;L</p><strong class="metric ${resultClass(performance.netPnl)}">${escapeHtml(signedCurrency(performance.netPnl, snapshot.currencyCode))}</strong><span>${escapeHtml(signedR(performance.netR, "—"))}</span></article>
      <article class="card"><p class="card-label">WIN RATE</p><strong class="metric">${performance.winRatePct.toFixed(0)}%</strong><span>${countNoun(performance.tradeCount, "trade")} with realized P&amp;L</span></article>
      <article class="card"><p class="card-label">PROFIT FACTOR</p><strong class="metric">${performance.profitFactor?.toFixed(2) ?? "—"}</strong><span>profit relative to loss</span></article>
      <article class="card"><p class="card-label">EXPECTANCY</p><strong class="metric">${escapeHtml(signedR(performance.averageR, "—"))}</strong><span>${performance.rTradeCount} of ${performance.tradeCount} with defined risk</span></article>
    </div>
    <article class="card report-table-card">
      <div class="section-title"><div><p class="card-label">BY SETUP</p><h2>What is working</h2></div><span>${setups.length} setups</span></div>
      <div class="report-table" role="table" aria-label="Performance by setup">
        <div class="report-row report-header" role="row"><span role="columnheader">Setup</span><span role="columnheader">Trades</span><span role="columnheader">Win rate</span><span role="columnheader">Net</span></div>
        ${setups.map((setup) => `<div class="report-row" role="row"><strong role="cell">${escapeHtml(setup.name)}</strong><span role="cell">${setup.tradeCount}</span><span role="cell">${setup.winRatePct.toFixed(0)}%</span><span role="cell" class="${resultClass(setup.netR)}">${escapeHtml(signedR(setup.netR, "—"))}</span></div>`).join("")}
      </div>
    </article>
    <article class="card chart-card"><div class="section-title"><div><p class="card-label">JOURNAL CURVE</p><h2>Cumulative result</h2></div><strong class="${resultClass(performance.netPnl)}">${escapeHtml(signedCurrency(performance.netPnl, snapshot.currencyCode))}</strong></div>${equityChart(snapshot)}</article>
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
  const activeHistory = snapshot.importHistory.filter((receipt) => !receipt.rolledBack);
  return `<section class="screen-stack" aria-labelledby="more-title">
    <div class="screen-heading"><div><p class="eyebrow">DATA + TOOLS</p><h1 id="more-title">More</h1></div><span class="demo-badge">${modeLabel(snapshot)}</span></div>
    ${snapshot.provenance === "demo" ? `<article class="card"><p class="card-label">FICTIONAL WORKSPACE</p><h2>Demo stays separate</h2><p>Importing a CSV switches back to your private journal; demo records are never written to the ledger.</p></article>` : importTool(snapshot)}
    <article class="card import-receipt">
      <p class="card-label">${snapshot.importSummary.rolledBack ? "LATEST RECEIPT · ROLLED BACK" : "LATEST IMPORT RECEIPT"}</p>
      <h2>${escapeHtml(snapshot.importSummary.sourceLabel)}</h2>
      <p>${escapeHtml(snapshot.importSummary.importedAtLabel)} · ${escapeHtml(snapshot.importSummary.accountLabel)}</p>
      <div class="receipt-metrics">
        <div><strong>${snapshot.importSummary.executions}</strong><span>${snapshot.importSummary.executions === 1 ? "execution" : "executions"}</span></div>
        <div><strong>${snapshot.importSummary.rejectedRows}</strong><span>rejected</span></div>
        <div><strong>${snapshot.importSummary.skippedRows}</strong><span>skipped</span></div>
      </div>
    </article>
    ${snapshot.importHistory.length === 0 ? "" : `<section aria-labelledby="import-history-title">
      <div class="section-title"><h2 id="import-history-title">Import history</h2><span>${snapshot.importHistory.length} receipts</span></div>
      <div class="journal-list">${snapshot.importHistory.map((receipt) => `<article class="card import-history-row">
        <div class="section-title"><div><p class="card-label">${receipt.rolledBack ? "ROLLED BACK" : "COMMITTED"}</p><h3>${escapeHtml(receipt.sourceLabel)}</h3></div><strong>${countNoun(receipt.executions, "execution")}</strong></div>
        <p>${escapeHtml(receipt.importedAtLabel)} · ${escapeHtml(receipt.accountLabel)} · ${countNoun(receipt.warningCount, "warning")} · ${receipt.skippedRows} skipped</p>
        ${receipt.receiptId !== null && !receipt.rolledBack ? `<button class="text-button" type="button" data-rollback-receipt="${escapeHtml(receipt.receiptId)}">Roll back this import</button>` : ""}
      </article>`).join("")}</div>
    </section>`}
    ${sizingTool()}
    <article class="card privacy-card"><p class="card-label">PRODUCT BOUNDARY</p><h2>Journal and retrospective analytics</h2><p>Hermes stores execution facts locally, derives trades deterministically, and never places or modifies a brokerage order.${snapshot.importHistory.length === 0 ? " Import a CSV to create the first immutable receipt." : activeHistory.length === 0 ? " Every recorded import is rolled back; re-import the intended file with its account selected explicitly." : " Every active import can be rolled back from its receipt."}</p></article>
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
        <p>Your journal is designed to stay on this device. Export and restore controls arrive before release.</p>
      </section>
    </div>
    <div class="onboarding-footer">
      <div class="dots" role="progressbar" aria-label="Welcome progress" aria-valuemin="1" aria-valuemax="3" aria-valuenow="1" aria-valuetext="Step 1 of 3"><span class="active"></span><span></span><span></span></div>
      <button class="primary-button" id="onboarding-next" type="button">Continue</button>
      <button class="secondary-button" id="onboarding-demo" type="button" hidden>Explore fictional demo</button>
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
    count.textContent = query
      ? `Showing ${visible} of ${countNoun(total, "trade")}`
      : `Showing ${countNoun(total, "trade")}`;
    empty.hidden = visible !== 0;
  });
}

function mappingFromControls(container: HTMLElement): CsvHeaderMapping {
  const read = (field: CsvImportField): number | null => {
    const value = container.querySelector<HTMLSelectElement>(`[data-csv-field="${field}"]`)?.value ?? "";
    return value === "" ? null : Number(value);
  };
  return {
    executionId: read("executionId"),
    symbol: read("symbol"),
    side: read("side"),
    quantity: read("quantity"),
    price: read("price"),
    fee: read("fee"),
    currency: read("currency"),
    executedAt: read("executedAt"),
  };
}

function preparedPreviewTemplate(prepared: PreparedCsvImport): string {
  const preview = prepared.preview;
  const mapping = preview.mapping;
  const headers = preview.header?.cells.map((cell) => cell.value) ?? [];
  const issueRows = preview.issues.slice(0, 8).map((issue) => `<li class="${issue.severity === "error" ? "negative" : ""}">
    <strong>${escapeHtml(issue.code.replaceAll("_", " "))}</strong> ${escapeHtml(issue.message)}
  </li>`).join("");
  const remainingIssueCount = Math.max(preview.issues.length - 8, 0);
  const sampleRows = preview.rows.slice(0, 5).map((row) => `<div class="report-row" role="row">
    <strong role="cell">${escapeHtml(row.symbol)}</strong>
    <span role="cell">${escapeHtml(row.side.toUpperCase())}</span>
    <span role="cell">${escapeHtml(row.quantity)}</span>
    <span role="cell">${escapeHtml(row.price)}</span>
  </div>`).join("");
  const selects = CSV_FIELDS.map((field) => `<label>${escapeHtml(field.label)}<select data-csv-field="${field.id}">
    <option value="">Not mapped</option>
    ${headers.map((header, index) => `<option value="${index}" ${mapping?.[field.id] === index ? "selected" : ""}>${escapeHtml(header || `Column ${index + 1}`)}</option>`).join("")}
  </select></label>`).join("");
  return `<section class="import-preview-card" aria-labelledby="preview-title">
    <div class="section-title"><div><p class="card-label">VALIDATION PREVIEW</p><h3 id="preview-title">${preview.status === "ready" ? "Ready to import" : "Needs attention"}</h3></div><span>${preview.validRows} valid · ${preview.rejectedRows} rejected · ${preview.skippedRows} skipped</span></div>
    ${headers.length === 0 ? "" : `<details class="mapping-details" ${preview.status === "invalid" ? "open" : ""}><summary>Review column mapping</summary><div class="field-grid">${selects}</div></details>`}
    ${issueRows.length === 0 ? "" : `<ul class="issue-list">${issueRows}${remainingIssueCount === 0 ? "" : `<li>And ${remainingIssueCount} more issues. Correct the source file or mapping and preview again.</li>`}</ul>`}
    ${sampleRows.length === 0 ? "" : `<div class="report-table" role="table" aria-label="Execution preview"><div class="report-row report-header" role="row"><span role="columnheader">Symbol</span><span role="columnheader">Side</span><span role="columnheader">Qty</span><span role="columnheader">Price</span></div>${sampleRows}</div>`}
    ${preview.status === "ready" ? `<button class="primary-button" id="commit-import" type="button">Import ${countNoun(preview.validRows, "execution")}</button>` : ""}
  </section>`;
}

function bindImportForm(
  root: HTMLElement,
  application: JournalApplication,
  refresh: (announcement: string) => Promise<void>,
): void {
  const form = root.querySelector<HTMLFormElement>("#csv-import-form");
  const fileInput = root.querySelector<HTMLInputElement>("#import-file");
  const previewContainer = root.querySelector<HTMLElement>("#import-preview");
  const status = root.querySelector<HTMLElement>("#import-status");
  if (!form || !fileInput || !previewContainer || !status) return;

  let rawInput: string | null = null;
  let sourceName: string | null = null;
  let prepared: PreparedCsvImport | null = null;

  const selection = (mapping?: CsvHeaderMapping) => ({
    rawInput: rawInput ?? "",
    sourceName: sourceName ?? "broker.csv",
    accountName: root.querySelector<HTMLInputElement>("#import-account")?.value.trim() ?? "",
    timeZone: root.querySelector<HTMLInputElement>("#import-time-zone")?.value.trim() ?? "",
    defaultCurrency: root.querySelector<HTMLInputElement>("#import-currency")?.value.trim().toUpperCase() ?? "",
    ...(mapping === undefined ? {} : { mapping }),
  });

  const renderPrepared = (next: PreparedCsvImport, focusField?: CsvImportField): void => {
    prepared = next;
    previewContainer.innerHTML = preparedPreviewTemplate(next);
    previewContainer.querySelectorAll<HTMLSelectElement>("[data-csv-field]").forEach((select) => {
      select.addEventListener("change", () => {
        try {
          const changedField = select.dataset.csvField as CsvImportField | undefined;
          renderPrepared(
            application.prepareCsv(selection(mappingFromControls(previewContainer))),
            changedField,
          );
          status.textContent = "Column mapping updated.";
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : "Could not update the mapping.";
        }
      });
    });
    const commitButton = previewContainer.querySelector<HTMLButtonElement>("#commit-import");
    commitButton?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      if (!(button instanceof HTMLButtonElement) || prepared === null) return;
      button.disabled = true;
      status.textContent = "Writing one atomic journal transaction…";
      try {
        const result = await application.commitCsv(prepared);
        const alreadyPresent = result.receipt.acceptedRows - result.receipt.executionCount;
        const announcement = result.outcome === "duplicate"
          ? "This exact CSV was already imported; no records were duplicated."
          : `${countNoun(result.receipt.acceptedRows, "execution")} accepted with a reversible receipt${alreadyPresent === 0 ? "." : `; ${countNoun(alreadyPresent, "execution")} already existed.`}`;
        status.textContent = announcement;
        await refresh(announcement);
        root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
      } catch (error) {
        button.disabled = false;
        status.textContent = error instanceof Error ? error.message : "The import was rolled back after an unexpected error.";
      }
    });
    if (focusField !== undefined) {
      if (next.preview.status === "ready") commitButton?.focus();
      else previewContainer.querySelector<HTMLSelectElement>(`[data-csv-field="${focusField}"]`)?.focus();
    }
  };

  const invalidateOptions = (): void => {
    if (prepared === null) return;
    prepared = null;
    previewContainer.innerHTML = "";
    status.textContent = "Import options changed. Preview the CSV again before committing.";
  };
  for (const id of ["#import-account", "#import-time-zone", "#import-currency"]) {
    root.querySelector<HTMLInputElement>(id)?.addEventListener("input", invalidateOptions);
  }

  fileInput.addEventListener("change", () => {
    prepared = null;
    rawInput = null;
    sourceName = null;
    previewContainer.innerHTML = "";
    const file = fileInput.files?.[0];
    status.textContent = file === undefined ? "Choose a CSV file." : `${file.name} selected. Preview it before import.`;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (file === undefined) {
      status.textContent = "Choose a CSV file first.";
      return;
    }
    if (file.size > DEFAULT_CSV_LIMITS.maxBytes) {
      status.textContent = `CSV is ${file.size} bytes; the limit is ${DEFAULT_CSV_LIMITS.maxBytes} bytes.`;
      previewContainer.innerHTML = "";
      return;
    }
    status.textContent = "Reading and validating locally…";
    try {
      rawInput = await file.text();
      sourceName = file.name.trim() || "broker.csv";
      renderPrepared(application.prepareCsv(selection()));
      status.textContent = prepared?.preview.status === "ready"
        ? "Preview is ready. Confirm the mapping and execution count."
        : "Resolve the preview errors before import.";
    } catch (error) {
      previewContainer.innerHTML = "";
      status.textContent = error instanceof Error ? error.message : "Could not preview this CSV.";
    }
  });
}

function bindRollbacks(
  root: HTMLElement,
  application: JournalApplication,
  refresh: (announcement: string) => Promise<void>,
): void {
  root.querySelectorAll<HTMLButtonElement>("[data-rollback-receipt]").forEach((button) => {
    button.addEventListener("click", async () => {
      const receiptId = button.dataset.rollbackReceipt;
      if (receiptId === undefined) return;
      const confirmed = window.confirm("Roll back this receipt? Hermes will deactivate each execution for which this is the last active import reference. Executions covered by another active receipt stay active, and immutable source records remain for audit.");
      if (!confirmed) return;
      button.disabled = true;
      try {
        await application.rollbackImport(receiptId, "User confirmed rollback from the import history.");
        await refresh("Import rolled back. Its immutable receipt remains in history.");
        root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
      } catch (error) {
        button.disabled = false;
        window.alert(error instanceof Error ? error.message : "The rollback could not be completed.");
      }
    });
  });
}

function bindOnboarding(
  root: HTMLElement,
  preferences: OnboardingPreferences,
  setBackgroundInert: (inert: boolean) => void,
  chooseWorkspace: (mode: "local" | "demo") => Promise<void>,
): void {
  if (preferences.isComplete()) return;
  setBackgroundInert(true);
  root.insertAdjacentHTML("beforeend", onboardingTemplate());
  let page = 0;
  const next = root.querySelector<HTMLButtonElement>("#onboarding-next");
  const demo = root.querySelector<HTMLButtonElement>("#onboarding-demo");
  const progress = root.querySelector<HTMLElement>(".dots");
  const update = () => {
    root.querySelectorAll<HTMLElement>("[data-page]").forEach((element, index) => {
      element.hidden = index !== page;
    });
    root.querySelectorAll<HTMLElement>(".dots span").forEach((dot, index) => {
      dot.classList.toggle("active", index === page);
    });
    if (next) next.textContent = page === 2 ? "Start my journal" : "Continue";
    if (demo) demo.hidden = page !== 2;
    progress?.setAttribute("aria-valuenow", String(page + 1));
    progress?.setAttribute("aria-valuetext", `Step ${page + 1} of 3`);
    root.querySelector<HTMLElement>(`[data-page="${page}"] h1`)?.focus({ preventScroll: true });
  };
  const finish = async (mode: "local" | "demo") => {
    if (next) next.disabled = true;
    if (demo) demo.disabled = true;
    await chooseWorkspace(mode);
    preferences.complete();
    root.querySelector(".onboarding")?.remove();
    setBackgroundInert(false);
    root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
  };
  next?.addEventListener("click", () => {
    if (page < 2) {
      page += 1;
      update();
    } else {
      void finish("local");
    }
  });
  demo?.addEventListener("click", () => { void finish("demo"); });
  update();
}

export async function startApp({ root, application, onboarding }: AppDependencies): Promise<void> {
  let snapshot = await application.loadWorkspace();
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
  const updateChrome = () => {
    const badge = root.querySelector<HTMLElement>("#mode-badge");
    const storageBadge = root.querySelector<HTMLElement>("#storage-badge");
    const storageTitle = root.querySelector<HTMLElement>("#storage-title");
    const storageCopy = root.querySelector<HTMLElement>("#storage-copy");
    const modeToggle = root.querySelector<HTMLButtonElement>("#mode-toggle");
    if (badge) badge.textContent = modeLabel(snapshot);
    if (snapshot.provenance === "demo") {
      if (storageBadge) storageBadge.textContent = "FICTIONAL";
      if (storageTitle) storageTitle.textContent = "Bundled demo journal";
      if (storageCopy) storageCopy.textContent = "Demo records are fictional, make no network requests, and never mix with your local journal.";
      if (modeToggle) modeToggle.textContent = "Return to my journal";
    } else {
      const native = application.persistence === "encrypted-device";
      if (storageBadge) storageBadge.textContent = native ? "ENCRYPTED" : "BROWSER SESSION";
      if (storageTitle) storageTitle.textContent = native ? "Private local journal" : "Ephemeral development preview";
      if (storageCopy) storageCopy.textContent = native
        ? "Execution records are encrypted in the iOS database and are never sent to Hermes servers."
        : "Browser-preview financial records stay in memory and disappear on reload; the iOS app uses encrypted SQLite.";
      if (modeToggle) modeToggle.textContent = "Explore demo journal";
    }
  };
  const render = (tab: TabId, announce = true) => {
    currentTab = tab;
    updateChrome();
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
    bindImportForm(root, application, async (announcement) => {
      snapshot = await application.loadWorkspace();
      render(currentTab, false);
      if (announcer) announcer.textContent = announcement;
    });
    bindRollbacks(root, application, async (announcement) => {
      snapshot = await application.loadWorkspace();
      render(currentTab, false);
      if (announcer) announcer.textContent = announcement;
    });
    root.querySelectorAll<HTMLButtonElement>("[data-route]").forEach((button) => {
      button.addEventListener("click", () => render((button.dataset.route as TabId | undefined) ?? currentTab));
    });
    root.querySelectorAll<HTMLButtonElement>("[data-explore-demo]").forEach((button) => {
      button.addEventListener("click", async () => {
        snapshot = await application.exploreDemo();
        render("dashboard");
      });
    });
  };

  const chooseWorkspace = async (mode: "local" | "demo") => {
    snapshot = mode === "local"
      ? await application.startJournal()
      : await application.exploreDemo();
    render("dashboard", false);
  };

  root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => render((button.dataset.tab as TabId | undefined) ?? currentTab));
  });
  root.querySelector("#settings-open")?.addEventListener("click", openSettings);
  root.querySelector("#settings-close")?.addEventListener("click", closeSettings);
  root.querySelector("#mode-toggle")?.addEventListener("click", async () => {
    snapshot = snapshot.provenance === "demo"
      ? await application.startJournal()
      : await application.exploreDemo();
    closeSettings();
    render("dashboard");
  });
  settings?.addEventListener("click", (event) => {
    if (event.target === settings) closeSettings();
  });
  root.querySelector("#onboarding-reset")?.addEventListener("click", () => {
    onboarding.reset();
    closeSettings();
    bindOnboarding(root, onboarding, setBackgroundInert, chooseWorkspace);
  });
  document.addEventListener("keydown", (event) => {
    const welcome = root.querySelector<HTMLElement>(".onboarding");
    const settingsSheet = root.querySelector<HTMLElement>(".settings-sheet");
    if (welcome) trapModalFocus(welcome, event);
    else if (settings && !settings.hidden && settingsSheet) trapModalFocus(settingsSheet, event);
    if (event.key === "Escape" && settings && !settings.hidden) closeSettings();
  });

  render("dashboard", false);
  bindOnboarding(root, onboarding, setBackgroundInert, chooseWorkspace);
}
