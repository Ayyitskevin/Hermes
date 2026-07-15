import { JournalApplication } from "../application/journal-application";
import { OnboardingPreferences } from "../application/onboarding-preferences";
import {
  buildTradeBrowser,
  EMPTY_TRADE_BROWSER_STATE,
  type TradeBrowserResult,
  type TradeBrowserState,
} from "../application/trade-browser";
import { escapeHtml } from "../core/html";
import { sizePosition, type PositionSide } from "../core/sizing";
import type { JournalWorkspaceSnapshot, TabId, TradePreview } from "../core/types";
import {
  calendarDayAnnouncement,
  calendarDaySection,
} from "./calendar-day-view";
import { bindImportForm, importTool } from "./import-tool";
import {
  bindManualExecutionActions,
  manualCaptureCard,
  manualExecutionAction,
} from "./manual-execution-sheet";
import {
  bindDailyJournalActions,
  dailyJournalAction,
  workspaceTodayIsoDate,
} from "./daily-journal-sheet";
import {
  bindTradeReviewActions,
  reviewTradeAction,
} from "./trade-review-sheet";
import {
  bindReportsView,
  focusReportSection,
  planAdherenceDashboardCard,
  reportsView,
} from "./reports-view";
import { bindUserDataExport, userDataExportCard } from "./user-data-export";
import { bindUserDataRestore, userDataRestoreCard } from "./user-data-restore";
import { bindTradesView, tradesView } from "./trades-view";

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

function signedCurrency(value: number | null, currency: string): string {
  if (value === null) return "Open";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    signDisplay: "always",
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

function hasInterimPartialMetrics(trade: TradePreview): boolean {
  return trade.status === "open" && (
    (trade.resultRMetric.isPartial && trade.resultRMetric.value !== null)
    || (trade.percentReturnMetric.isPartial && trade.percentReturnMetric.value !== null)
  );
}

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function viewFilterAnnouncement(browser: TradeBrowserResult): string {
  if (!browser.hasViewFilters) return "";
  const hasSearch = browser.state.query.length > 0;
  const hasFacet = browser.state.assetClass !== "all"
    || browser.state.direction !== "all"
    || browser.state.positionState !== "all"
    || browser.state.reviewState !== "all"
    || browser.state.mistake !== null
    || browser.state.emotion !== null
    || browser.state.tag !== null;
  return hasFacet && hasSearch
    ? ` Search and card filters show ${browser.visibleEvidence.length} of ${browser.evidence.length} trades.`
    : hasFacet
    ? ` Card filters show ${browser.visibleEvidence.length} of ${browser.evidence.length} trades.`
    : ` Search shows ${browser.visibleEvidence.length} of ${browser.evidence.length} cards.`;
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
  const interim = hasInterimPartialMetrics(trade) ? "Interim partial · " : "";
  return `<article class="trade-row">
    <div><strong>${escapeHtml(trade.symbol)}</strong><span>${escapeHtml(trade.setup)} · ${escapeHtml(trade.side)}</span></div>
    <div class="numeric"><strong class="${tone}">${escapeHtml(signedCurrency(trade.resultPnl, currency))}</strong><span>${escapeHtml(interim)}${escapeHtml(signedR(trade.resultR, trade.status === "open" ? "Open" : "—"))} · ${escapeHtml(trade.sessionLabel.split(" · ")[0] ?? trade.sessionLabel)}</span></div>
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
      <span>No required subscription, broker credentials, order placement, or Hermes cloud account.</span>
    </article>
    ${manualCaptureCard()}
    ${importTool(snapshot)}
    <article class="card">
      <p class="card-label">WANT TO LOOK AROUND FIRST?</p>
      <h2>Explore a fictional journal</h2>
      <p>The demo is clearly labeled and never mixes with your imported records.</p>
      <button class="secondary-button" type="button" data-explore-demo>Explore demo journal</button>
    </article>
  </section>`;
}

function dashboardView(
  snapshot: JournalWorkspaceSnapshot,
  browser: TradeBrowserResult,
): string {
  if (snapshot.provenance === "empty") return emptyDashboardView(snapshot);
  const performance = snapshot.performance;
  const recentTrades = [...snapshot.trades].reverse().slice(0, 4);
  const hasInterimResults = snapshot.trades.some(hasInterimPartialMetrics);
  const nextReview = snapshot.trades.find((trade) => (
    trade.status === "closed" && trade.reviewStatus === "draft"
  )) ?? snapshot.trades.find((trade) => (
    trade.status === "closed" && trade.reviewStatus === "pending"
  ));
  return `<section class="screen-stack" aria-labelledby="dashboard-title">
    <div class="screen-heading">
      <div><p class="eyebrow">${escapeHtml(snapshot.accountLabel)} · ${escapeHtml(snapshot.periodLabel)}</p><h1 id="dashboard-title">Dashboard</h1></div>
      <span class="source-label">${escapeHtml(snapshot.provenanceLabel)}</span>
    </div>
    <article class="result-card">
      <p class="card-label">NET P&amp;L</p>
      <strong class="${resultClass(performance.netPnl)}">${escapeHtml(signedCurrency(performance.netPnl, snapshot.currencyCode))}</strong>
      <span>${escapeHtml(signedR(performance.netR, "—"))} · ${countNoun(performance.tradeCount, "trade")} with realized P&amp;L${performance.rTradeCount === performance.tradeCount ? "" : ` · R on ${performance.rTradeCount}`}${hasInterimResults ? " · includes interim partial exits" : ""}</span>
    </article>
    <article class="card review-progress-card">
      <div class="section-title"><div><p class="card-label">WEEKLY REVIEW RHYTHM</p><h2>${snapshot.reviewProgress.pendingTrades === 0 ? "Review queue clear" : `${countNoun(snapshot.reviewProgress.pendingTrades, "review")} waiting`}</h2></div><strong>${snapshot.reviewProgress.streakSessions} session streak</strong></div>
      <p>${snapshot.reviewProgress.completedTrades} completed · ${snapshot.reviewProgress.draftTrades} drafts · ${snapshot.reviewProgress.reviewedSessions} of ${snapshot.reviewProgress.tradingSessions} trading sessions reviewed.</p>
      ${nextReview === undefined ? `<button class="secondary-button" type="button" data-route="journal">Open review journal</button>` : reviewTradeAction(nextReview, nextReview.reviewStatus === "draft" ? "Continue next review" : "Review next trade")}
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
    ${calendarDaySection(snapshot, browser)}
    ${planAdherenceDashboardCard(snapshot)}
    <div class="quick-actions" aria-label="Dashboard shortcuts">
      ${snapshot.provenance === "demo" ? "" : manualExecutionAction("Add execution")}
      <button class="secondary-button" type="button" data-route="trades">Review trades</button>
      <button class="secondary-button" type="button" data-route="journal">Open journal</button>
    </div>
    <section aria-labelledby="recent-title">
      <div class="section-title"><h2 id="recent-title">Recent trades</h2><span>${snapshot.provenance === "demo" ? "Fictional" : "On device"}</span></div>
      <div class="trade-list">${recentTrades.map((trade) => compactTradeRow(trade, snapshot.currencyCode)).join("")}</div>
    </section>
  </section>`;
}

function journalView(snapshot: JournalWorkspaceSnapshot): string {
  const queue = snapshot.trades.filter((trade) => (
    trade.status === "closed" && trade.reviewStatus !== "completed"
  ));
  const today = snapshot.provenance === "local"
    ? workspaceTodayIsoDate(snapshot.timeZone)
    : null;
  const todayEntry = today === null
    ? null
    : snapshot.dailyJournal.find((entry) => entry.isoDate === today) ?? null;
  const dailyAction = snapshot.provenance === "local"
    ? todayEntry === null
      ? dailyJournalAction(null, "Write daily reflection")
      : `<div class="quick-actions daily-journal-intro-actions">
          ${dailyJournalAction(todayEntry, "Edit today's reflection")}
          ${dailyJournalAction(null, "Write another date")}
        </div>`
    : "";
  const dailyModeCopy = snapshot.provenance === "demo"
    ? "Fictional examples are read-only and stay separate from your journal."
    : snapshot.provenance === "empty"
      ? "Add an execution or import a CSV first to establish your journal currency and time zone."
      : "Write on trading or no-trade days. Each explicit save creates immutable version evidence on this device.";
  return `<section class="screen-stack" aria-labelledby="journal-title">
    <div class="screen-heading"><div><p class="eyebrow">DAILY REVIEWS + PLAYBOOKS</p><h1 id="journal-title">Journal</h1></div><span class="demo-badge">${modeLabel(snapshot)}</span></div>
    <article class="result-card review-queue-summary">
      <p class="card-label">REVIEW COMPLETION</p>
      <strong>${snapshot.reviewProgress.completedTrades} completed</strong>
      <span>${snapshot.reviewProgress.pendingTrades} waiting · ${snapshot.reviewProgress.draftTrades} drafts · ${snapshot.reviewProgress.streakSessions} consecutive reviewed sessions</span>
    </article>
    <section aria-labelledby="review-queue-title">
      <div class="section-title"><h2 id="review-queue-title">Trade review queue</h2><span>${queue.length} waiting</span></div>
      ${snapshot.provenance === "demo" || queue.length === 0 ? "" : `<form class="card batch-review-form" id="batch-review-form" novalidate>
        <datalist id="batch-tag-options">${snapshot.reviewOptions.tags.map((tag) => `<option value="${escapeHtml(tag)}"></option>`).join("")}</datalist>
        <div><p class="card-label">ATOMIC BATCH ACTION</p><h3>Tag selected trades</h3><p>Select queue items below. Hermes saves every tag revision together or saves none.</p></div>
        <label>Tag<input id="batch-review-tag" type="text" maxlength="120" list="batch-tag-options" placeholder="e.g. Earnings day" required /></label>
        <p class="form-error" id="batch-review-error" role="alert" tabindex="-1" hidden></p>
        <button class="secondary-button" type="submit">Apply tag to selected</button>
      </form>`}
      <div class="journal-list review-queue-list">
        ${queue.map((trade) => `<article class="card review-queue-item">
          ${snapshot.provenance === "demo" ? "" : `<label class="review-select"><input type="checkbox" data-batch-review-subject value="${escapeHtml(trade.tradeSubjectId)}" /><span class="sr-only">Select ${escapeHtml(trade.symbol)}, ${escapeHtml(trade.sessionLabel)}, for batch tagging</span></label>`}
          <div><span class="status-chip review-${trade.reviewStatus}">${escapeHtml(trade.reviewStatus)}</span><h3>${escapeHtml(trade.symbol)}</h3><p>${escapeHtml(trade.sessionLabel)} · ${escapeHtml(signedCurrency(trade.resultPnl, snapshot.currencyCode))}</p></div>
          ${reviewTradeAction(trade, trade.reviewStatus === "draft" ? "Continue draft" : "Review")}
        </article>`).join("")}
        ${queue.length === 0 ? `<article class="empty-state"><h2>Review queue clear</h2><p>Every closed trade has a completed, versioned reflection.</p></article>` : ""}
      </div>
    </section>
    <section aria-labelledby="daily-notes-title">
      <div class="section-title"><h2 id="daily-notes-title">Daily notes</h2><span>${snapshot.dailyJournal.length} entries</span></div>
      <article class="card daily-journal-intro">
        <div><p class="card-label">DAY-LEVEL PROCESS</p><h3>Reflect beyond individual trades</h3><p>${escapeHtml(dailyModeCopy)}</p></div>
        ${dailyAction}
      </article>
      <div class="journal-list">
        ${snapshot.dailyJournal.map((entry) => {
          const session = snapshot.calendar.find((candidate) => candidate.isoDate === entry.isoDate);
          const context = session === undefined
            ? "No executions recorded"
            : `Trading day · ${countNoun(session.tradeCount, "trade")} · ${countNoun(session.allocationCount, "allocation")}`;
          const emotion = entry.emotion === null ? "" : `<span>${escapeHtml(entry.emotion)}</span>`;
          const score = entry.processScorePct === null
            ? ""
            : `<strong aria-label="Self-reported process score ${entry.processScorePct} percent">${entry.processScorePct}% process</strong>`;
          return `<article class="card journal-note">
          <div class="journal-note-heading"><div><p class="card-label">${escapeHtml(entry.dateLabel)} · ${escapeHtml(context)}</p><h3>${escapeHtml(entry.title ?? "Daily reflection")}</h3></div>${score}</div>
          <div class="daily-entry-meta"><span class="status-chip review-${entry.state}">${escapeHtml(entry.state)}</span>${emotion}</div>
          <p class="daily-entry-note">${entry.note.length === 0 ? "No written note." : escapeHtml(entry.note)}</p>
          <div class="tag-row">${entry.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
          ${snapshot.provenance === "local" ? dailyJournalAction(entry) : ""}
        </article>`;
        }).join("")}
        ${snapshot.dailyJournal.length === 0 ? `<article class="empty-state"><h3>No daily reflections yet</h3><p>${snapshot.provenance === "local" ? "Capture process, emotion, or a lesson for any calendar day." : "Daily reflections appear here once your journal is established."}</p></article>` : ""}
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

function latestImportReceipt(snapshot: JournalWorkspaceSnapshot): string {
  if (snapshot.importHistory.length === 0) return "";
  return `<article class="card import-receipt">
    <p class="card-label">${snapshot.importSummary.rolledBack ? "LATEST RECEIPT · ROLLED BACK" : "LATEST IMPORT RECEIPT"}</p>
    <h2>${escapeHtml(snapshot.importSummary.sourceLabel)}</h2>
    <p>${escapeHtml(snapshot.importSummary.importedAtLabel)} · ${escapeHtml(snapshot.importSummary.accountLabel)}</p>
    <div class="receipt-metrics">
      <div><strong>${snapshot.importSummary.executions}</strong><span>${snapshot.importSummary.executions === 1 ? "execution" : "executions"}</span></div>
      <div><strong>${snapshot.importSummary.rejectedRows}</strong><span>rejected</span></div>
      <div><strong>${snapshot.importSummary.skippedRows}</strong><span>skipped</span></div>
    </div>
  </article>`;
}

function moreView(snapshot: JournalWorkspaceSnapshot, persistence: JournalApplication["persistence"]): string {
  const activeHistory = snapshot.importHistory.filter((receipt) => !receipt.rolledBack);
  return `<section class="screen-stack" aria-labelledby="more-title">
    <div class="screen-heading"><div><p class="eyebrow">DATA + TOOLS</p><h1 id="more-title">More</h1></div><span class="demo-badge">${modeLabel(snapshot)}</span></div>
    ${snapshot.provenance === "demo" ? `<article class="card"><p class="card-label">FICTIONAL WORKSPACE</p><h2>Demo stays separate</h2><p>Manual entry and CSV import stay in your private journal; demo records are never written to the ledger.</p></article>` : manualCaptureCard()}
    ${snapshot.provenance === "demo" ? "" : importTool(snapshot)}
    ${latestImportReceipt(snapshot)}
    ${snapshot.importHistory.length === 0 ? "" : `<section aria-labelledby="import-history-title">
      <div class="section-title"><h2 id="import-history-title">Import history</h2><span>${snapshot.importHistory.length} receipts</span></div>
      <div class="journal-list">${snapshot.importHistory.map((receipt) => `<article class="card import-history-row">
        <div class="section-title"><div><p class="card-label">${receipt.rolledBack ? "ROLLED BACK" : "COMMITTED"}</p><h3>${escapeHtml(receipt.sourceLabel)}</h3></div><strong>${countNoun(receipt.executions, "execution")}</strong></div>
        <p>${escapeHtml(receipt.importedAtLabel)} · ${escapeHtml(receipt.accountLabel)} · ${countNoun(receipt.warningCount, "warning")} · ${receipt.skippedRows} skipped</p>
        ${receipt.receiptId !== null && !receipt.rolledBack ? `<button class="text-button" type="button" data-rollback-receipt="${escapeHtml(receipt.receiptId)}">Roll back this import</button>` : ""}
      </article>`).join("")}</div>
    </section>`}
    ${snapshot.provenance === "demo" ? "" : userDataExportCard(persistence)}
    ${snapshot.provenance === "demo" ? "" : userDataRestoreCard(snapshot.provenance === "empty", persistence)}
    ${sizingTool()}
    <article class="card privacy-card"><p class="card-label">PRODUCT BOUNDARY</p><h2>Review, never trade</h2><p>Hermes stores execution facts locally, derives trades deterministically, and never places or modifies a brokerage order.${snapshot.importHistory.length === 0 ? " Manual fills remain independent facts; CSV imports also create reversible receipts." : activeHistory.length === 0 ? " Every recorded import is rolled back; manual facts remain independent." : " Every active import can be rolled back from its receipt."}</p></article>
  </section>`;
}

function viewFor(
  tab: TabId,
  snapshot: JournalWorkspaceSnapshot,
  persistence: JournalApplication["persistence"],
  browser: TradeBrowserResult,
): string {
  switch (tab) {
    case "dashboard": return dashboardView(snapshot, browser);
    case "trades": return tradesView(snapshot, browser);
    case "journal": return journalView(snapshot);
    case "reports": return reportsView(snapshot);
    case "more": return moreView(snapshot, persistence);
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
        <p>Your journal is designed to stay on this device. Export and verified empty-journal restore are available; Delete All Data remains under recovery work.</p>
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

function bindBatchReviewTagging(
  root: HTMLElement,
  application: JournalApplication,
  setBackgroundInert: (inert: boolean) => void,
  refresh: (announcement: string) => Promise<void>,
): void {
  const form = root.querySelector<HTMLFormElement>("#batch-review-form");
  if (form === null) return;
  const batchControls = Array.from(root.querySelectorAll<
    HTMLButtonElement | HTMLInputElement
  >(
    "#batch-review-form button, #batch-review-form input, [data-batch-review-subject]",
  ));
  const initiallyDisabled = new Map(batchControls.map((control) => (
    [control, control.disabled] as const
  )));
  let commitState: "ready" | "saving" | "committed" = "ready";
  let refreshing = false;

  const setBatchControlsLocked = (locked: boolean) => {
    batchControls.forEach((control) => {
      control.disabled = locked || (initiallyDisabled.get(control) ?? false);
    });
  };

  const createRefreshRecovery = () => {
    if (root.querySelector("#batch-review-refresh-recovery") !== null) {
      throw new Error("Another saved batch refresh is already active.");
    }
    (root.querySelector(".app-shell") ?? root).insertAdjacentHTML(
      "beforeend",
      `<div class="sheet-backdrop" id="batch-review-refresh-recovery" hidden>
        <section class="settings-sheet batch-review-refresh-sheet" role="alertdialog" aria-modal="true" aria-labelledby="batch-review-refresh-title" aria-describedby="batch-review-refresh-copy batch-review-refresh-status" tabindex="-1">
          <div class="sheet-handle" aria-hidden="true"></div>
          <div class="sheet-heading">
            <div><p class="eyebrow">ATOMIC BATCH ACTION</p><h2 id="batch-review-refresh-title">Saving batch tag</h2></div>
          </div>
          <p id="batch-review-refresh-copy">Hermes is saving the selected review successors together. Keep this screen open.</p>
          <p class="form-error" id="batch-review-refresh-status" role="alert" tabindex="-1"></p>
          <button class="primary-button" id="batch-review-refresh-retry" type="button" hidden disabled>Retry journal refresh</button>
        </section>
      </div>`,
    );
    const backdrop = root.querySelector<HTMLElement>("#batch-review-refresh-recovery");
    const sheet = backdrop?.querySelector<HTMLElement>(".batch-review-refresh-sheet");
    const title = backdrop?.querySelector<HTMLElement>("#batch-review-refresh-title");
    const copy = backdrop?.querySelector<HTMLElement>("#batch-review-refresh-copy");
    const status = backdrop?.querySelector<HTMLElement>("#batch-review-refresh-status");
    const retry = backdrop?.querySelector<HTMLButtonElement>("#batch-review-refresh-retry");
    if (
      backdrop === null
      || sheet === undefined
      || sheet === null
      || title === undefined
      || title === null
      || copy === undefined
      || copy === null
      || status === undefined
      || status === null
      || retry === undefined
      || retry === null
    ) {
      backdrop?.remove();
      throw new Error("The saved batch refresh recovery surface is unavailable.");
    }
    sheet.addEventListener("keydown", (event) => {
      if (event.key === "Escape") event.preventDefault();
      if (event.key === "Tab" && (retry.hidden || retry.disabled)) {
        event.preventDefault();
        sheet.focus({ preventScroll: true });
        return;
      }
      trapModalFocus(sheet, event);
    });
    return { backdrop, sheet, title, copy, status, retry };
  };

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (commitState !== "ready") return;
    const selected = Array.from(
      root.querySelectorAll<HTMLInputElement>("[data-batch-review-subject]:checked"),
    ).map((input) => input.value);
    const tag = form.querySelector<HTMLInputElement>("#batch-review-tag")?.value ?? "";
    const error = form.querySelector<HTMLElement>("#batch-review-error");
    const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (error === null || submit === null) return;
    if (selected.length === 0) {
      error.hidden = false;
      error.textContent = "Select at least one queued trade.";
      return;
    }
    let recovery: ReturnType<typeof createRefreshRecovery>;
    try {
      recovery = createRefreshRecovery();
    } catch {
      error.hidden = false;
      error.textContent = "Hermes cannot safely start this batch because refresh recovery is unavailable.";
      error.focus();
      return;
    }
    commitState = "saving";
    setBatchControlsLocked(true);
    form.setAttribute("aria-busy", "true");
    error.hidden = true;
    recovery.backdrop.hidden = false;
    recovery.status.textContent = "Saving one atomic review batch on this device.";
    setBackgroundInert(true);
    recovery.sheet.focus({ preventScroll: true });
    let commitOutcome: "committed" | "duplicate";
    try {
      const result = await application.addTagToTrades(selected, tag);
      commitOutcome = result.outcome;
    } catch (caught) {
      commitState = "ready";
      setBatchControlsLocked(false);
      recovery.backdrop.remove();
      setBackgroundInert(false);
      form.setAttribute("aria-busy", "false");
      error.hidden = false;
      error.textContent = caught instanceof Error ? caught.message : "The batch tag was not saved.";
      error.focus();
      return;
    }
    commitState = "committed";
    form.setAttribute("aria-busy", "false");
    const directlyCommitted = commitOutcome === "committed";
    recovery.title.textContent = directlyCommitted
      ? "Batch tag saved"
      : "Review updates already present";
    recovery.copy.textContent = directlyCommitted
      ? "Hermes received a committed result for the selected atomic review batch. Do not apply the tag again. Only the journal screen still needs to reload."
      : "Hermes reconciled the selected review revisions, but no durable receipt proves one atomic batch identity. Do not apply the tag again. Only the journal screen still needs to reload.";
    const announcement = directlyCommitted
      ? `${tag.trim()} added to ${countNoun(selected.length, "trade")} in one atomic review batch.`
      : "The selected review updates were already present. Hermes did not submit them again.";
    const retryRefresh = async () => {
      if (commitState !== "committed" || refreshing) return;
      refreshing = true;
      recovery.sheet.focus({ preventScroll: true });
      recovery.retry.disabled = true;
      recovery.retry.hidden = true;
      recovery.status.textContent = "Reloading the journal without submitting the saved batch again.";
      try {
        await refresh(announcement);
      } catch {
        refreshing = false;
        recovery.backdrop.hidden = false;
        setBackgroundInert(true);
        recovery.retry.hidden = false;
        recovery.retry.disabled = false;
        recovery.status.textContent = "Hermes could not redraw the journal. The selected review updates remain on this device; retry only the journal refresh.";
        recovery.status.focus({ preventScroll: true });
        return;
      }
      refreshing = false;
      recovery.backdrop.remove();
      setBackgroundInert(false);
      root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
    };
    recovery.retry.addEventListener("click", () => { void retryRefresh(); });
    await retryRefresh();
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
  const recoveredManualExecutions = await application.loadRecoverableManualExecutions();
  let snapshot = await application.loadWorkspace();
  root.innerHTML = shellTemplate();
  const screen = root.querySelector<HTMLElement>("#screen");
  const announcer = root.querySelector<HTMLElement>("#route-announcer");
  const settings = root.querySelector<HTMLElement>("#settings");
  let currentTab: TabId = "dashboard";
  let tradeBrowserState: TradeBrowserState = EMPTY_TRADE_BROWSER_STATE;
  let returnFocus: HTMLElement | null = null;
  let pendingScopeNotice: string | null = null;

  const queueScopeNotice = (notice: string) => {
    pendingScopeNotice = pendingScopeNotice === null
      ? notice
      : `${pendingScopeNotice} ${notice}`;
  };
  const announceStatus = (message: string) => {
    if (announcer === null) return;
    announcer.textContent = pendingScopeNotice === null
      ? message
      : `${message} ${pendingScopeNotice}`;
    pendingScopeNotice = null;
  };

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
    if (
      tradeBrowserState.accountId !== null
      && !snapshot.accountOptions.some((account) => account.id === tradeBrowserState.accountId)
    ) {
      tradeBrowserState = {
        ...tradeBrowserState,
        accountId: null,
        selectedDay: null,
        calendarMonth: null,
      };
      queueScopeNotice(
        "The selected account is no longer available. Hermes reset the account and day filters while retaining the activity dates, search, and exact trade filters.",
      );
    }
    let browser = buildTradeBrowser(snapshot, tradeBrowserState);
    if (browser.invalidatedSelectedDay !== null) {
      const invalidatedDay = browser.invalidatedSelectedDay;
      tradeBrowserState = {
        ...browser.state,
        selectedDay: null,
      };
      browser = buildTradeBrowser(snapshot, tradeBrowserState);
      queueScopeNotice(
        `The selected activity day ${invalidatedDay} is no longer available. Hermes retained the account and date scope plus card filters and cleared only the day refinement.`,
      );
    }
    tradeBrowserState = browser.state;
    if (screen) screen.innerHTML = viewFor(tab, snapshot, application.persistence, browser);
    root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
      const active = button.dataset.tab === tab;
      button.classList.toggle("active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    if (announce) {
      announceStatus(`${TABS.find((item) => item.id === tab)?.label ?? "Screen"} screen`);
    }
    if (announce) {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
      screen?.focus({ preventScroll: true });
    }
    if (tab === "reports") bindReportsView(root, snapshot);
    if (tab === "more") {
      bindSizingForm(root);
      bindUserDataExport(root, application);
      bindUserDataRestore(root, application, async (announcement) => {
        snapshot = await application.loadWorkspace();
        render(currentTab, false);
        announceStatus(announcement);
      });
    }
    if (tab === "trades") {
      bindTradesView(root, browser, {
        applyScope: (input) => {
          const next = buildTradeBrowser(snapshot, {
            ...tradeBrowserState,
            ...input,
            selectedDay: null,
          });
          tradeBrowserState = next.state;
          render("trades", false);
          const searchAnnouncement = viewFilterAnnouncement(next);
          announceStatus(`Trade browser scope applied. Scope contains ${countNoun(next.evidence.length, "contributing trade")} across ${countNoun(next.activityDayCount, "activity day")}.${searchAnnouncement}`);
          root.querySelector<HTMLElement>("#trade-scope-summary")?.focus();
        },
        clearAll: () => {
          const next = buildTradeBrowser(snapshot, EMPTY_TRADE_BROWSER_STATE);
          tradeBrowserState = next.state;
          render("trades", false);
          announceStatus(`Trade browser scope cleared. Showing ${countNoun(next.evidence.length, "trade")}.`);
          root.querySelector<HTMLSelectElement>("#trade-scope-account")?.focus();
        },
        clearSelectedDay: () => {
          const next = buildTradeBrowser(snapshot, {
            ...tradeBrowserState,
            selectedDay: null,
          });
          tradeBrowserState = next.state;
          render("trades", false);
          const searchAnnouncement = viewFilterAnnouncement(next);
          announceStatus(`Calendar day filter cleared. Retained scope contains ${countNoun(next.evidence.length, "trade")}.${searchAnnouncement}`);
          root.querySelector<HTMLInputElement>("#trade-search")?.focus();
        },
        clearViewFilters: () => {
          const next = buildTradeBrowser(snapshot, {
            ...tradeBrowserState,
            query: "",
            assetClass: "all",
            direction: "all",
            positionState: "all",
            reviewState: "all",
            mistake: null,
            emotion: null,
            tag: null,
          });
          tradeBrowserState = next.state;
          render("trades", false);
          announceStatus(`Search and trade card filters cleared. Showing ${countNoun(next.evidence.length, "scoped trade")}.`);
          root.querySelector<HTMLSelectElement>("#trade-filter-asset-class")?.focus();
        },
        updateViewFilters: (input) => {
          const next = buildTradeBrowser(snapshot, {
            ...tradeBrowserState,
            ...input,
          });
          tradeBrowserState = next.state;
          return next;
        },
        updateQuery: (query) => {
          const next = buildTradeBrowser(snapshot, {
            ...tradeBrowserState,
            query,
          });
          tradeBrowserState = next.state;
          return next;
        },
      });
    }
    bindImportForm(root, application, async (announcement) => {
      snapshot = await application.loadWorkspace();
      render(currentTab, false);
      announceStatus(announcement);
    });
    bindManualExecutionActions(
      root,
      application,
      snapshot,
      setBackgroundInert,
      async (announcement) => {
        snapshot = await application.loadWorkspace();
        render(currentTab, false);
        announceStatus(announcement);
      },
    );
    bindTradeReviewActions(
      root,
      application,
      snapshot,
      setBackgroundInert,
      async (announcement) => {
        snapshot = await application.loadWorkspace();
        render(currentTab, false);
        announceStatus(announcement);
        return snapshot;
      },
    );
    if (tab === "journal") {
      bindDailyJournalActions(
        root,
        application,
        snapshot,
        setBackgroundInert,
        async (announcement) => {
          snapshot = await application.loadWorkspace();
          render(currentTab, false);
          announceStatus(announcement);
          return snapshot;
        },
      );
    }
    bindBatchReviewTagging(root, application, setBackgroundInert, async (announcement) => {
      snapshot = await application.loadWorkspace();
      render(currentTab, false);
      announceStatus(announcement);
    });
    bindRollbacks(root, application, async (announcement) => {
      snapshot = await application.loadWorkspace();
      render(currentTab, false);
      announceStatus(announcement);
    });
    root.querySelectorAll<HTMLButtonElement>("button[data-calendar-day]").forEach((button) => {
      button.addEventListener("click", () => {
        const isoDate = button.dataset.calendarDay;
        if (isoDate === undefined) return;
        const next = buildTradeBrowser(snapshot, {
          ...tradeBrowserState,
          selectedDay: isoDate,
          calendarMonth: isoDate.slice(0, 7),
        });
        const day = next.selectedSession;
        if (day === null) return;
        tradeBrowserState = next.state;
        render("trades", false);
        announceStatus(
          `${calendarDayAnnouncement(day, snapshot.currencyCode)}${viewFilterAnnouncement(next)}`,
        );
        root.querySelector<HTMLElement>("#calendar-day-filter-title")?.focus();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("button[data-calendar-month]").forEach((button) => {
      button.addEventListener("click", () => {
        const month = button.dataset.calendarMonth;
        if (month === undefined || month.length === 0) return;
        const next = buildTradeBrowser(snapshot, {
          ...tradeBrowserState,
          selectedDay: null,
          calendarMonth: month,
        });
        tradeBrowserState = next.state;
        render(currentTab, false);
        announceStatus(`Showing ${next.calendar.monthLabel} trading activity.`);
        root.querySelector<HTMLElement>("#calendar-month-title")?.focus();
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-route]").forEach((button) => {
      button.addEventListener("click", () => {
        const destination = (button.dataset.route as TabId | undefined) ?? currentTab;
        const reportTarget = button.dataset.reportTarget;
        render(destination);
        if (destination === "reports" && reportTarget !== undefined) {
          focusReportSection(root, reportTarget);
        }
      });
    });
    root.querySelectorAll<HTMLButtonElement>("[data-explore-demo]").forEach((button) => {
      button.addEventListener("click", async () => {
        snapshot = await application.exploreDemo();
        tradeBrowserState = EMPTY_TRADE_BROWSER_STATE;
        render("dashboard");
      });
    });
  };

  const chooseWorkspace = async (mode: "local" | "demo") => {
    snapshot = mode === "local"
      ? await application.startJournal()
      : await application.exploreDemo();
    tradeBrowserState = EMPTY_TRADE_BROWSER_STATE;
    render("dashboard", false);
  };

  root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      render((button.dataset.tab as TabId | undefined) ?? currentTab);
    });
  });
  root.querySelector("#settings-open")?.addEventListener("click", openSettings);
  root.querySelector("#settings-close")?.addEventListener("click", closeSettings);
  root.querySelector("#mode-toggle")?.addEventListener("click", async () => {
    snapshot = snapshot.provenance === "demo"
      ? await application.startJournal()
      : await application.exploreDemo();
    tradeBrowserState = EMPTY_TRADE_BROWSER_STATE;
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
  render("dashboard", false);
  bindOnboarding(root, onboarding, setBackgroundInert, chooseWorkspace);
  document.addEventListener("keydown", (event) => {
    const welcome = root.querySelector<HTMLElement>(".onboarding");
    const settingsSheet = root.querySelector<HTMLElement>(".settings-sheet");
    if (welcome) trapModalFocus(welcome, event);
    else if (settings && !settings.hidden && settingsSheet) trapModalFocus(settingsSheet, event);
    if (event.key === "Escape" && settings && !settings.hidden) closeSettings();
  });
  if (recoveredManualExecutions.length > 0) {
    const recoveredCount = recoveredManualExecutions.length;
    if (announcer) {
      announcer.textContent = `${recoveredCount} ${recoveredCount === 1 ? "execution was" : "executions were"} already saved before Hermes restarted; no duplicate was created.`;
    }
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    try {
      for (const item of recoveredManualExecutions) {
        await application.acknowledgeManualExecution(item.submissionId);
      }
    } catch {
      if (announcer) {
        announcer.textContent = "The recovered execution is visible, but its confirmation remains pending and will be retried next launch.";
      }
    }
  }
}
