import { JournalApplication } from "../application/journal-application";
import type { JournalImportReceipt } from "../application/journal-store";
import { OnboardingPreferences } from "../application/onboarding-preferences";
import { buildReviewQueue } from "../application/review-queue";
import {
  buildExactAccountTradeScope,
} from "../application/account-overview";
import {
  buildExactPlaybookTradeScope,
} from "../application/playbook-trade-scope";
import {
  buildManualCaptureReviewContinuation,
  type ManualCaptureCommitReference,
  type ManualCaptureReviewContinuation,
} from "../application/manual-capture-review-continuation";
import {
  buildImportReceiptReviewContinuation,
  type ImportReceiptReviewContinuation,
  type ImportReceiptReviewEvidence,
} from "../application/import-receipt-review-continuation";
import { importReceiptImportedAtLabel } from "../application/workspace-snapshot";
import {
  buildTradeBrowser,
  EMPTY_TRADE_BROWSER_STATE,
  scopedActivityDayNeighbors,
  type ScopedActivityDayDirection,
  type TradeBrowserResult,
  type TradeBrowserState,
} from "../application/trade-browser";
import { escapeHtml } from "../core/html";
import { sizePosition, type PositionSide } from "../core/sizing";
import type { JournalWorkspaceSnapshot, TabId, TradePreview } from "../core/types";
import {
  accountOverviewSection,
  bindAccountOverview,
} from "./account-overview-view";
import {
  calendarDayAnnouncement,
  calendarDaySection,
} from "./calendar-day-view";
import { bindImportForm, importTool } from "./import-tool";
import {
  bindImportReceiptReviewActions,
  focusImportReceiptAfterRefresh,
  importReceiptHistorySection,
  latestImportReceiptCard,
} from "./import-receipt-view";
import {
  bindImportReceiptReviewFailure,
  bindImportReceiptReviewView,
  clearImportReceiptReviewViewBindings,
  IMPORT_RECEIPT_REVIEW_PAGE_SIZE,
  importReceiptReviewFailure,
  importReceiptReviewSection,
  type ImportReceiptReviewFailureContext,
} from "./import-receipt-review-view";
import {
  bindManualExecutionActions,
  manualCaptureCard,
  manualExecutionAction,
  type ManualExecutionRefreshResult,
} from "./manual-execution-sheet";
import {
  bindManualCaptureReviewFailure,
  bindManualCaptureReviewView,
  focusManualCaptureElement,
  manualCaptureReviewFailure,
} from "./manual-capture-review-view";
import {
  bindDailyJournalActions,
  dailyJournalAction,
  validateDailyJournalPreview,
  workspaceTodayIsoDate,
} from "./daily-journal-sheet";
import { dailyReflectionRhythmSection } from "./daily-reflection-rhythm-view";
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
import {
  focusReviewQueueAfterRefresh,
  reviewQueueSection,
} from "./review-queue-view";
import {
  bindPlaybookTradeScope,
  playbookTradeScopeSection,
  preparePlaybookTradeScope,
  type PlaybookTradeScopeProjection,
} from "./playbook-trade-scope-view";
import { bindUserDataExport, userDataExportCard } from "./user-data-export";
import { bindUserDataRestore, userDataRestoreCard } from "./user-data-restore";
import { bindTradesView, tradesView } from "./trades-view";

interface AppDependencies {
  readonly root: HTMLElement;
  readonly application: JournalApplication;
  readonly onboarding: OnboardingPreferences;
}

interface PendingManualCaptureReference extends ManualCaptureCommitReference {
  readonly submissionId: string | null;
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
    || browser.state.setup !== null
    || browser.state.mistake !== null
    || browser.state.emotion !== null
    || browser.state.tag !== null
    || browser.state.playbook !== null;
  return hasFacet && hasSearch
    ? ` Search and card filters show ${browser.visibleEvidence.length} of ${browser.evidence.length} trades.`
    : hasFacet
    ? ` Card filters show ${browser.visibleEvidence.length} of ${browser.evidence.length} trades.`
    : ` Search shows ${browser.visibleEvidence.length} of ${browser.evidence.length} cards.`;
}

const RETAINED_ACTIVITY_DAY_STATE_KEYS = [
  "accountId",
  "activityFrom",
  "activityThrough",
  "query",
  "assetClass",
  "direction",
  "positionState",
  "reviewState",
  "setup",
  "mistake",
  "emotion",
  "tag",
  "playbook",
] as const satisfies readonly (keyof TradeBrowserState)[];

function retainedActivityDayStateMatches(
  current: TradeBrowserState,
  candidate: TradeBrowserState,
): boolean {
  return RETAINED_ACTIVITY_DAY_STATE_KEYS.every((key) => (
    current[key] === candidate[key]
  ));
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
  const assetClass = trade.assetClass === "etf" ? "ETF" : "Stock";
  return `<article class="trade-row" data-recent-trade="${escapeHtml(trade.tradeSubjectId)}">
    <div class="trade-row-identity"><h3>${escapeHtml(trade.symbol)}</h3><span>${assetClass} · ${escapeHtml(trade.accountLabel)} · ${escapeHtml(trade.sessionLabel)}</span><span>${escapeHtml(trade.setup)} · ${escapeHtml(trade.side)}</span></div>
    <div class="numeric"><strong class="${tone}">${escapeHtml(signedCurrency(trade.resultPnl, currency))}</strong><span>${escapeHtml(interim)}${escapeHtml(signedR(trade.resultR, trade.status === "open" ? "Open" : "—"))} · ${escapeHtml(trade.sessionLabel.split(" · ")[0] ?? trade.sessionLabel)}</span></div>
    <div class="trade-row-action">${reviewTradeAction(trade, "Open trade")}</div>
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
  const reviewQueue = buildReviewQueue(snapshot);
  const nextReview = reviewQueue.groups[0].trades[0]
    ?? reviewQueue.groups[1].trades[0];
  const reviewProgressState = nextReview === undefined ? "clear" : "waiting";
  const reviewProgressSubject = nextReview === undefined
    ? ""
    : ` data-dashboard-review-subject="${escapeHtml(nextReview.tradeSubjectId)}"`;
  return `<section class="screen-stack" aria-labelledby="dashboard-title">
    <div class="screen-heading">
      <div><p class="eyebrow">${escapeHtml(snapshot.accountLabel)} · ${escapeHtml(snapshot.periodLabel)}</p><h1 id="dashboard-title">Dashboard</h1></div>
      <span class="source-label">${escapeHtml(snapshot.provenanceLabel)}</span>
    </div>
    ${accountOverviewSection(snapshot)}
    <article class="result-card">
      <p class="card-label">NET P&amp;L</p>
      <strong class="${resultClass(performance.netPnl)}">${escapeHtml(signedCurrency(performance.netPnl, snapshot.currencyCode))}</strong>
      <span>${escapeHtml(signedR(performance.netR, "—"))} · ${countNoun(performance.tradeCount, "trade")} with realized P&amp;L${performance.rTradeCount === performance.tradeCount ? "" : ` · R on ${performance.rTradeCount}`}${hasInterimResults ? " · includes interim partial exits" : ""}</span>
    </article>
    <article class="card review-progress-card" data-dashboard-review-progress="${reviewProgressState}"${reviewProgressSubject}>
      <div class="section-title"><div><p class="card-label">WEEKLY REVIEW RHYTHM</p><h2 id="dashboard-review-progress-title" data-dashboard-review-progress-title="${reviewProgressState}"${reviewProgressSubject} tabindex="-1">${reviewQueue.waitingTradeCount === 0 ? "Review queue clear" : `${countNoun(reviewQueue.waitingTradeCount, "review")} waiting`}</h2></div><strong>${snapshot.reviewProgress.streakSessions} session streak</strong></div>
      <p>${snapshot.reviewProgress.completedTrades} completed · ${countNoun(snapshot.reviewProgress.draftTrades, "draft")} · ${snapshot.reviewProgress.reviewedSessions} of ${snapshot.reviewProgress.tradingSessions} trading sessions reviewed.</p>
      <div class="quick-actions review-progress-actions">
        ${nextReview === undefined ? `<button class="secondary-button" type="button" data-route="journal">Open review journal</button>` : reviewTradeAction(nextReview, nextReview.reviewStatus === "draft" ? "Continue next review" : "Review next trade", "dashboard-review-progress")}
        <button class="text-button" type="button" data-route="reports" data-report-target="review-session-coverage-title">View session evidence</button>
      </div>
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

function journalView(
  snapshot: JournalWorkspaceSnapshot,
  playbookTradeScope: PlaybookTradeScopeProjection,
): string {
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
    ${reviewQueueSection(snapshot)}
    ${dailyReflectionRhythmSection(snapshot, today)}
    <section aria-labelledby="daily-notes-title">
      <div class="section-title"><h2 id="daily-notes-title" tabindex="-1">Daily notes</h2><span>${snapshot.dailyJournal.length} entries</span></div>
      <article class="card daily-journal-intro">
        <div><p class="card-label">DAY-LEVEL PROCESS</p><h3>Reflect beyond individual trades</h3><p>${escapeHtml(dailyModeCopy)}</p></div>
        ${dailyAction}
      </article>
      <div class="journal-list">
        ${snapshot.dailyJournal.map((entry) => {
          validateDailyJournalPreview(entry);
          const session = snapshot.calendar.find((candidate) => candidate.isoDate === entry.isoDate);
          const context = session === undefined
            ? "No executions recorded"
            : `Trading day · ${countNoun(session.tradeCount, "trade")} · ${countNoun(session.allocationCount, "allocation")}`;
          const emotion = entry.emotion === null ? "" : `<span>${escapeHtml(entry.emotion)}</span>`;
          const score = entry.processScorePct === null
            ? ""
            : `<strong aria-label="Self-reported process score ${entry.processScorePct} percent">${entry.processScorePct}% process</strong>`;
          const headingId = `daily-entry-heading-${entry.isoDate}`;
          const accessibleDateLabel = `${entry.dateLabel}, ${entry.isoDate.slice(0, 4)}`;
          return `<article class="card journal-note" data-daily-entry-card="${escapeHtml(entry.isoDate)}" aria-labelledby="${escapeHtml(headingId)}">
          <div class="journal-note-heading"><div><p class="card-label">${escapeHtml(entry.dateLabel)} · ${escapeHtml(context)}</p><h3 id="${escapeHtml(headingId)}" data-daily-entry-heading="${escapeHtml(entry.isoDate)}" tabindex="-1">${escapeHtml(entry.title ?? "Daily reflection")}<span class="sr-only"> · ${escapeHtml(accessibleDateLabel)}</span></h3></div>${score}</div>
          <div class="daily-entry-meta"><span class="status-chip review-${entry.state}">${escapeHtml(entry.state)}</span>${emotion}</div>
          <p class="daily-entry-note">${entry.note.length === 0 ? "No written note." : escapeHtml(entry.note)}</p>
          <div class="tag-row">${entry.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
          ${snapshot.provenance === "local" ? dailyJournalAction(entry) : ""}
        </article>`;
        }).join("")}
        ${snapshot.dailyJournal.length === 0 ? `<article class="empty-state"><h3>No daily reflections yet</h3><p>${snapshot.provenance === "local" ? "Capture process, emotion, or a lesson for any calendar day." : "Daily reflections appear here once your journal is established."}</p></article>` : ""}
      </div>
    </section>
    ${playbookTradeScopeSection(playbookTradeScope)}
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

function moreView(
  snapshot: JournalWorkspaceSnapshot,
  persistence: JournalApplication["persistence"],
  importReceiptReview: ImportReceiptReviewContinuation | null,
  importReceiptReviewPageStart: number,
  pendingImportReceiptReview: ImportReceiptReviewFailureContext | null,
): string {
  const activeHistory = snapshot.importHistory.filter((receipt) => !receipt.rolledBack);
  const confirmedImportRecovery = pendingImportReceiptReview?.origin === "confirmed-post-commit";
  return `<section class="screen-stack" aria-labelledby="more-title">
    <div class="screen-heading"><div><p class="eyebrow">DATA + TOOLS</p><h1 id="more-title">More</h1></div><span class="demo-badge">${modeLabel(snapshot)}</span></div>
    ${snapshot.provenance === "demo" ? `<article class="card"><p class="card-label">FICTIONAL WORKSPACE</p><h2>Demo stays separate</h2><p>Manual entry and CSV import stay in your private journal; demo records are never written to the ledger.</p></article>` : confirmedImportRecovery ? "" : manualCaptureCard()}
    ${snapshot.provenance === "demo" || confirmedImportRecovery ? "" : importTool(snapshot)}
    ${latestImportReceiptCard(snapshot)}
    ${importReceiptHistorySection(snapshot)}
    ${importReceiptReview === null ? "" : importReceiptReviewSection(
      snapshot,
      importReceiptReview,
      importReceiptReviewPageStart,
    )}
    ${pendingImportReceiptReview === null ? "" : importReceiptReviewFailure(
      pendingImportReceiptReview,
    )}
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
  manualCapture: ManualCaptureReviewContinuation | null,
  importReceiptReview: ImportReceiptReviewContinuation | null,
  importReceiptReviewPageStart: number,
  pendingImportReceiptReview: ImportReceiptReviewFailureContext | null,
  playbookTradeScope: PlaybookTradeScopeProjection | null,
): string {
  switch (tab) {
    case "dashboard": return dashboardView(snapshot, browser);
    case "trades": return tradesView(snapshot, browser, manualCapture);
    case "journal":
      if (playbookTradeScope === null) {
        throw new Error("The Journal playbook projection is unavailable.");
      }
      return journalView(snapshot, playbookTradeScope);
    case "reports": return reportsView(snapshot);
    case "more": return moreView(
      snapshot,
      persistence,
      importReceiptReview,
      importReceiptReviewPageStart,
      pendingImportReceiptReview,
    );
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
  snapshot: JournalWorkspaceSnapshot,
  beforeRollback: (receiptId: string) => void,
  refresh: (announcement: string, receiptId: string) => Promise<void>,
): void {
  root.querySelectorAll<HTMLButtonElement>("[data-rollback-receipt]").forEach((button) => {
    const receiptId = button.dataset.rollbackReceipt;
    const row = button.closest<HTMLElement>("[data-import-receipt]");
    const reviewButtons = row === null ? [] : Array.from(
      row.querySelectorAll<HTMLButtonElement>("button[data-review-import-receipt]"),
    );
    const review = reviewButtons[0];
    const matches = snapshot.provenance === "local"
      ? snapshot.importHistory.filter((receipt) => (
        receipt.receiptId === receiptId && !receipt.rolledBack
      ))
      : [];
    const receipt = matches[0];
    if (
      receiptId === undefined
      || matches.length !== 1
      || receipt === undefined
      || row === null
      || row.dataset.importReceipt !== receiptId
      || reviewButtons.length !== 1
      || review === undefined
      || review.dataset.reviewImportReceipt !== receiptId
    ) {
      throw new Error("An import rollback action is inconsistent with active receipt history.");
    }
    button.addEventListener("click", async () => {
      const confirmed = window.confirm(
        `Roll back the import from ${receipt.sourceLabel} in ${receipt.accountLabel} (${receipt.importedAtLabel})? Hermes will deactivate each execution for which this is the last active import reference. Executions covered by another active receipt stay active, and immutable source records remain for audit.`,
      );
      if (!confirmed) return;
      beforeRollback(receiptId);
      button.disabled = true;
      review.disabled = true;
      try {
        await application.rollbackImport(receiptId, "User confirmed rollback from the import history.");
        await refresh("Import rolled back. Its immutable receipt remains in history.", receiptId);
        focusImportReceiptAfterRefresh(root, receiptId);
      } catch (error) {
        button.disabled = false;
        review.disabled = false;
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
      focusReviewQueueAfterRefresh(root);
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
  afterComplete: (mode: "local" | "demo") => Promise<void>,
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
    await afterComplete(mode);
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
  let tradeBrowserState: TradeBrowserState = EMPTY_TRADE_BROWSER_STATE;
  let returnFocus: HTMLElement | null = null;
  let pendingScopeNotice: string | null = null;
  let manualCaptureReference: ManualCaptureCommitReference | null = null;
  let manualCaptureContinuation: ManualCaptureReviewContinuation | null = null;
  let pendingManualCaptureReference: PendingManualCaptureReference | null = null;
  let manualCaptureAttemptGeneration = 0;
  let importReceiptReviewEvidence: ImportReceiptReviewEvidence | null = null;
  let importReceiptReviewContinuation: ImportReceiptReviewContinuation | null = null;
  let importReceiptReviewPageStart = 0;
  let pendingImportReceiptReview: ImportReceiptReviewFailureContext | null = null;
  let importReceiptReviewAttemptGeneration = 0;

  const clearImportReceiptReviewGuidance = () => {
    importReceiptReviewAttemptGeneration += 1;
    importReceiptReviewEvidence = null;
    importReceiptReviewContinuation = null;
    pendingImportReceiptReview = null;
    importReceiptReviewPageStart = 0;
  };
  const clearTransientImportReceiptReviewGuidance = () => {
    const retainedConfirmedRecovery = pendingImportReceiptReview?.origin === "confirmed-post-commit"
      ? pendingImportReceiptReview
      : null;
    clearImportReceiptReviewGuidance();
    pendingImportReceiptReview = retainedConfirmedRecovery;
  };
  const clearImportReceiptReviewGuidanceInPlace = () => {
    clearImportReceiptReviewGuidance();
    clearImportReceiptReviewViewBindings(root);
    root.querySelector("[data-import-receipt-review-continuation]")?.remove();
    root.querySelector("[data-import-receipt-review-failure]")?.remove();
  };

  const clearManualCaptureGuidance = () => {
    manualCaptureAttemptGeneration += 1;
    manualCaptureReference = null;
    manualCaptureContinuation = null;
    pendingManualCaptureReference = null;
  };
  const clearManualCaptureGuidanceInPlace = () => {
    clearManualCaptureGuidance();
    root.querySelector("[data-manual-capture-review-continuation]")?.remove();
    root.querySelector("[data-manual-capture-review-failure]")?.remove();
  };
  const clearAllCaptureGuidance = () => {
    clearManualCaptureGuidance();
    clearTransientImportReceiptReviewGuidance();
  };
  const clearAllCaptureGuidanceForWorkspace = () => {
    clearManualCaptureGuidance();
    clearImportReceiptReviewGuidance();
  };

  const pendingImportReceiptReviewFromReceipt = (
    receipt: JournalImportReceipt,
    origin: ImportReceiptReviewFailureContext["origin"],
    timeZone = snapshot.timeZone,
  ): ImportReceiptReviewFailureContext => Object.freeze({
    receiptId: receipt.id,
    sourceLabel: receipt.sourceName,
    accountLabel: receipt.accountName,
    importedAtLabel: importReceiptImportedAtLabel(receipt, timeZone),
    origin,
  });

  const pendingImportReceiptReviewFromHistory = (
    receiptId: string,
    origin: ImportReceiptReviewFailureContext["origin"] = "history-review",
  ): ImportReceiptReviewFailureContext => {
    const matches = snapshot.importHistory.filter((receipt) => receipt.receiptId === receiptId);
    const receipt = matches[0];
    if (matches.length !== 1 || receipt === undefined) {
      throw new Error("Receipt review recovery requires one exact visible receipt.");
    }
    return Object.freeze({
      receiptId,
      sourceLabel: receipt.sourceLabel,
      accountLabel: receipt.accountLabel,
      importedAtLabel: receipt.importedAtLabel,
      origin,
    });
  };

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
  const focusExactCalendarDay = (isoDate: string) => {
    const cards = Array.from(root.querySelectorAll<HTMLElement>(
      "[data-calendar-day-filter]",
    )).filter((card) => card.dataset.calendarDayFilter === isoDate);
    const headings = Array.from(root.querySelectorAll<HTMLElement>(
      "[data-calendar-day-filter-title]",
    )).filter((heading) => heading.dataset.calendarDayFilterTitle === isoDate);
    const card = cards.length === 1 ? cards[0] : undefined;
    const heading = headings.length === 1 ? headings[0] : undefined;
    if (
      card !== undefined
      && heading !== undefined
      && card.contains(heading)
      && heading.id === "calendar-day-filter-title"
    ) {
      heading.scrollIntoView({ behavior: "auto", block: "start" });
      heading.focus({ preventScroll: true });
      return;
    }
    const screens = root.querySelectorAll<HTMLElement>("#screen");
    if (screens.length === 1) {
      screens[0]?.focus({ preventScroll: true });
    }
  };
  const showCalendarDayStepError = (trigger: HTMLButtonElement) => {
    root.querySelectorAll<HTMLElement>("[data-calendar-day-step-error]")
      .forEach((error) => error.remove());
    const triggerGroup = trigger.isConnected
      ? trigger.closest<HTMLElement>("[data-calendar-day-stepper]")
      : null;
    const selectedCards = root.querySelectorAll<HTMLElement>("[data-calendar-day-filter]");
    const host = triggerGroup !== null && root.contains(triggerGroup)
      ? triggerGroup
      : selectedCards.length === 1
        ? selectedCards[0]
        : screen;
    if (host === null || host === undefined) return;
    const error = document.createElement("p");
    error.className = "form-error calendar-day-step-error";
    error.dataset.calendarDayStepError = "";
    error.id = "calendar-day-step-error";
    error.setAttribute("role", "alert");
    error.tabIndex = -1;
    error.textContent = "Hermes could not safely move to that day. Refresh Trades and try again.";
    host.append(error);
    error.scrollIntoView({ behavior: "auto", block: "center" });
    const errorRect = error.getBoundingClientRect();
    const topbar = root.querySelector<HTMLElement>(".topbar");
    const topbarRect = topbar?.getBoundingClientRect();
    const topbarPosition = topbar === null
      ? ""
      : window.getComputedStyle(topbar).position;
    const topBoundary = (
      (topbarPosition === "sticky" || topbarPosition === "fixed")
      && topbarRect !== undefined
      && topbarRect.bottom > 0
    ) ? topbarRect.bottom : 0;
    const tabbar = root.querySelector<HTMLElement>(".tabbar");
    const tabbarRect = tabbar?.getBoundingClientRect();
    const tabbarPosition = tabbar === null
      ? ""
      : window.getComputedStyle(tabbar).position;
    const bottomBoundary = (
      (tabbarPosition === "sticky" || tabbarPosition === "fixed")
      && tabbarRect !== undefined
      && tabbarRect.top < window.innerHeight
    ) ? tabbarRect.top : window.innerHeight;
    const availableHeight = Math.max(0, bottomBoundary - topBoundary);
    const desiredTop = topBoundary + Math.max(
      0,
      (availableHeight - errorRect.height) / 2,
    );
    window.scrollBy({
      top: errorRect.top - desiredTop,
      left: 0,
      behavior: "auto",
    });
    error.focus({ preventScroll: true });
  };

  const setBackgroundInert = (inert: boolean) => {
    if (inert) {
      manualCaptureAttemptGeneration += 1;
      importReceiptReviewAttemptGeneration += 1;
    }
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
    const pendingHeading = root.querySelector<HTMLElement>(
      "[data-manual-capture-review-failure-title]",
    ) ?? root.querySelector<HTMLElement>(
      "[data-import-receipt-review-failure-title]",
    );
    if (pendingHeading !== null) focusManualCaptureElement(root, pendingHeading);
    else returnFocus?.focus();
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
    if (snapshot.provenance !== "local") {
      clearManualCaptureGuidance();
    } else if (manualCaptureReference !== null) {
      if (
        manualCaptureContinuation !== null
        && (
          browser.state.accountId !== manualCaptureContinuation.accountId
          || browser.state.activityFrom !== null
          || browser.state.activityThrough !== null
          || browser.state.selectedDay !== null
        )
      ) {
        clearManualCaptureGuidance();
      } else {
        try {
          manualCaptureContinuation = buildManualCaptureReviewContinuation(
            snapshot,
            manualCaptureReference,
          );
        } catch {
          pendingManualCaptureReference = Object.freeze({
            ...manualCaptureReference,
            submissionId: null,
          });
          manualCaptureReference = null;
          manualCaptureContinuation = null;
        }
      }
    }
    if (
      snapshot.provenance !== "local"
      && pendingImportReceiptReview?.origin !== "confirmed-post-commit"
    ) {
      clearImportReceiptReviewGuidance();
    } else if (importReceiptReviewEvidence !== null) {
      try {
        importReceiptReviewContinuation = buildImportReceiptReviewContinuation(
          snapshot,
          importReceiptReviewEvidence,
        );
      } catch {
        pendingImportReceiptReview = pendingImportReceiptReview?.receiptId
          === importReceiptReviewEvidence.receipt.id
          ? pendingImportReceiptReview
          : pendingImportReceiptReviewFromReceipt(
            importReceiptReviewEvidence.receipt,
            "history-review",
          );
        importReceiptReviewEvidence = null;
        importReceiptReviewContinuation = null;
      }
    }
    const manualCaptureForView = tab === "trades" ? manualCaptureContinuation : null;
    const playbookTradeScope = tab === "journal"
      ? preparePlaybookTradeScope(snapshot)
      : null;
    if (screen) {
      screen.innerHTML = viewFor(
        tab,
        snapshot,
        application.persistence,
        browser,
        manualCaptureForView,
        tab === "more" ? importReceiptReviewContinuation : null,
        importReceiptReviewPageStart,
        tab === "more" ? pendingImportReceiptReview : null,
        playbookTradeScope,
      );
      clearImportReceiptReviewViewBindings(root);
      if (pendingManualCaptureReference !== null) {
        const heading = screen.querySelector<HTMLElement>(".screen-heading");
        if (heading === null) screen.insertAdjacentHTML("afterbegin", manualCaptureReviewFailure());
        else heading.insertAdjacentHTML("afterend", manualCaptureReviewFailure());
      }
    }
    bindAccountOverview(root, snapshot, {
      openAccount: (accountId) => {
        const candidate = buildExactAccountTradeScope(snapshot, accountId);
        const previousState = tradeBrowserState;
        const previousTab = currentTab;
        const previousManualReference = manualCaptureReference;
        const previousManualContinuation = manualCaptureContinuation;
        const previousPendingManualReference = pendingManualCaptureReference;
        try {
          clearManualCaptureGuidance();
          tradeBrowserState = candidate.state;
          render("trades", false);
          const summary = root.querySelector<HTMLElement>("#trade-scope-summary");
          if (summary === null) {
            throw new Error("The exact account scope summary is unavailable.");
          }
          const topbarBottom = root.querySelector<HTMLElement>(".topbar")
            ?.getBoundingClientRect().bottom ?? 0;
          summary.style.scrollMarginTop = `${Math.max(16, Math.ceil(topbarBottom) + 16)}px`;
          summary.scrollIntoView({ behavior: "auto", block: "start" });
          summary.focus({ preventScroll: true });
          announceStatus(
            `Opened ${candidate.accountLabel} in Trades. All activity dates and ${countNoun(candidate.evidence.length, "current derived trade")}. Temporary dates, day, search, and card filters were cleared.`,
          );
        } catch (caught) {
          tradeBrowserState = previousState;
          manualCaptureReference = previousManualReference;
          manualCaptureContinuation = previousManualContinuation;
          pendingManualCaptureReference = previousPendingManualReference;
          render(previousTab, false);
          throw caught;
        }
      },
      announceFailure: announceStatus,
    });
    if (tab === "journal" && playbookTradeScope !== null) {
      bindPlaybookTradeScope(root, playbookTradeScope, {
        openPlaybook: (playbookName) => {
          const candidate = buildExactPlaybookTradeScope(snapshot, playbookName);
          const previousState = tradeBrowserState;
          const previousTab = currentTab;
          const previousManualReference = manualCaptureReference;
          const previousManualContinuation = manualCaptureContinuation;
          const previousPendingManualReference = pendingManualCaptureReference;
          try {
            clearManualCaptureGuidance();
            tradeBrowserState = candidate.state;
            render("trades", false);
            const summary = root.querySelector<HTMLElement>("#trade-view-filter-summary");
            const disclosure = root.querySelector<HTMLDetailsElement>(
              "[data-trade-filter-disclosure]",
            );
            const review = root.querySelector<HTMLSelectElement>("#trade-filter-review");
            const playbook = root.querySelector<HTMLSelectElement>("#trade-filter-playbook");
            const filterCount = root.querySelector<HTMLElement>(
              "[data-trade-view-filter-count]",
            );
            const cards = Array.from(root.querySelectorAll<HTMLElement>(
              "[data-trade-subject]",
            ));
            const visibleCards = cards.filter((card) => !card.hidden);
            const visibleSubjects = new Set(candidate.visibleEvidence.map(({ trade }) => (
              trade.tradeSubjectId
            )));
            const renderedVisibleSubjects = new Set(visibleCards.map((card) => (
              card.dataset.tradeSubject ?? ""
            )));
            if (
              summary === null
              || disclosure === null
              || !disclosure.open
              || review?.value !== "completed"
              || playbook?.value !== playbookName
              || playbook.disabled
              || filterCount?.textContent?.trim() !== "· 2 active filters"
              || cards.length !== candidate.evidence.length
              || visibleCards.length !== candidate.visibleEvidence.length
              || visibleSubjects.size !== candidate.visibleEvidence.length
              || renderedVisibleSubjects.size !== visibleCards.length
              || [...visibleSubjects].some((subject) => !renderedVisibleSubjects.has(subject))
            ) {
              throw new Error("The exact playbook Trade Browser destination is unavailable.");
            }
            const topbarBottom = root.querySelector<HTMLElement>(".topbar")
              ?.getBoundingClientRect().bottom ?? 0;
            summary.style.scrollMarginTop = `${Math.max(16, Math.ceil(topbarBottom) + 16)}px`;
            summary.scrollIntoView({ behavior: "auto", block: "start" });
            summary.focus({ preventScroll: true });
            announceStatus(
              `Opened ${playbookName} completed reviews in Trades. ${candidate.visibleEvidence.length} of ${candidate.evidence.length} current trades. Temporary account, dates, day, search, and other card filters were cleared.`,
            );
          } catch (caught) {
            tradeBrowserState = previousState;
            manualCaptureReference = previousManualReference;
            manualCaptureContinuation = previousManualContinuation;
            pendingManualCaptureReference = previousPendingManualReference;
            render(previousTab, false);
            throw caught;
          }
        },
        announceFailure: announceStatus,
      });
    }
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
      bindImportReceiptReviewActions(root, snapshot, {
        openReceipt: async (receiptId) => {
          const result = await continueImportReceiptReview(receiptId);
          result.focus();
        },
      });
      if (importReceiptReviewContinuation !== null) {
        bindImportReceiptReviewView(
          root,
          snapshot,
          importReceiptReviewContinuation,
          importReceiptReviewPageStart,
          {
            dismiss: () => {
              const receiptId = importReceiptReviewContinuation?.receiptId ?? null;
              clearImportReceiptReviewGuidance();
              render("more", false);
              announceStatus("Receipt review guide dismissed. The immutable receipt remains in history.");
              if (receiptId !== null) focusImportReceiptAfterRefresh(root, receiptId);
            },
            previousPage: () => {
              importReceiptReviewPageStart = Math.max(
                0,
                importReceiptReviewPageStart - IMPORT_RECEIPT_REVIEW_PAGE_SIZE,
              );
              render("more", false);
              announceStatus("The previous exact receipt-linked trade page is visible.");
              const target = root.querySelector<HTMLElement>(
                "[data-import-receipt-review-trade] h3",
              ) ?? root.querySelector<HTMLElement>("[data-import-receipt-review-title]");
              if (target !== null) {
                target.tabIndex = -1;
                focusManualCaptureElement(root, target, "nearest");
              }
            },
            nextPage: () => {
              importReceiptReviewPageStart += IMPORT_RECEIPT_REVIEW_PAGE_SIZE;
              render("more", false);
              announceStatus("The next exact receipt-linked trade page is visible.");
              const target = root.querySelector<HTMLElement>(
                "[data-import-receipt-review-trade] h3",
              ) ?? root.querySelector<HTMLElement>("[data-import-receipt-review-title]");
              if (target !== null) {
                target.tabIndex = -1;
                focusManualCaptureElement(root, target, "nearest");
              }
            },
          },
        );
      }
      if (pendingImportReceiptReview !== null) {
        const failureContext = pendingImportReceiptReview;
        const receiptId = failureContext.receiptId;
        bindImportReceiptReviewFailure(root, failureContext, {
          retry: async () => {
            const result = await continueImportReceiptReview(receiptId);
            result.focus();
          },
          dismiss: () => {
            clearImportReceiptReviewGuidance();
            render("more", false);
            announceStatus("Receipt review continuation dismissed. The immutable receipt remains in history.");
            focusImportReceiptAfterRefresh(root, receiptId);
          },
        });
      }
    }
    if (tab === "trades") {
      bindTradesView(root, browser, {
        applyScope: (input) => {
          const next = buildTradeBrowser(snapshot, {
            ...tradeBrowserState,
            ...input,
            selectedDay: null,
          });
          clearManualCaptureGuidance();
          tradeBrowserState = next.state;
          render("trades", false);
          const searchAnnouncement = viewFilterAnnouncement(next);
          announceStatus(`Trade browser scope applied. Scope contains ${countNoun(next.evidence.length, "contributing trade")} across ${countNoun(next.activityDayCount, "activity day")}.${searchAnnouncement}`);
          root.querySelector<HTMLElement>("#trade-scope-summary")?.focus();
        },
        clearAll: () => {
          const next = buildTradeBrowser(snapshot, EMPTY_TRADE_BROWSER_STATE);
          clearManualCaptureGuidance();
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
          clearManualCaptureGuidance();
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
            setup: null,
            mistake: null,
            emotion: null,
            tag: null,
            playbook: null,
          });
          clearManualCaptureGuidance();
          tradeBrowserState = next.state;
          render("trades", false);
          announceStatus(`Search and trade card filters cleared. Showing ${countNoun(next.evidence.length, "scoped trade")}.`);
          root.querySelector<HTMLElement>("#trade-view-filter-summary")?.focus();
        },
        updateViewFilters: (input) => {
          const next = buildTradeBrowser(snapshot, {
            ...tradeBrowserState,
            ...input,
          });
          clearManualCaptureGuidanceInPlace();
          tradeBrowserState = next.state;
          return next;
        },
        updateQuery: (query) => {
          const next = buildTradeBrowser(snapshot, {
            ...tradeBrowserState,
            query,
          });
          clearManualCaptureGuidanceInPlace();
          tradeBrowserState = next.state;
          return next;
        },
      });
      if (manualCaptureForView !== null) {
        bindManualCaptureReviewView(root, snapshot, manualCaptureForView, {
          dismiss: () => {
            clearManualCaptureGuidance();
            render("trades", false);
            announceStatus("Saved execution guidance dismissed. The exact account scope remains unchanged.");
            const summary = root.querySelector<HTMLElement>("#trade-scope-summary");
            if (summary !== null) focusManualCaptureElement(root, summary);
          },
        });
      }
    }
    if (pendingManualCaptureReference !== null) {
      const reference = pendingManualCaptureReference;
      bindManualCaptureReviewFailure(root, {
        retry: async () => {
          const result = await continueManualCaptureReview(
            reference,
            "The execution save is already confirmed.",
            false,
          );
          result.focus();
          if (result.status === "complete") {
            await acknowledgeManualCapture(reference);
          }
        },
      });
    }
    bindImportForm(root, application, async (result, announcement) => {
      clearImportReceiptReviewGuidance();
      try {
        snapshot = await application.loadWorkspace();
        render("more", false);
        announceStatus(announcement);
        focusImportReceiptAfterRefresh(root, result.receipt.id);
      } catch {
        const committedWorkspace = result.ledger.workspace;
        if (committedWorkspace === null) {
          throw new Error("A confirmed CSV receipt has no committed workspace identity.");
        }
        pendingImportReceiptReview = pendingImportReceiptReviewFromReceipt(
          result.receipt,
          "confirmed-post-commit",
          committedWorkspace.timeZone,
        );
        render("more", false);
        announceStatus(
          `${announcement} Import saved; retry only its exact receipt continuation.`,
        );
        const heading = root.querySelector<HTMLElement>(
          "[data-import-receipt-review-failure-title]",
        );
        if (heading !== null) focusManualCaptureElement(root, heading);
      }
    }, clearImportReceiptReviewGuidanceInPlace);
    bindManualExecutionActions(
      root,
      application,
      snapshot,
      setBackgroundInert,
      clearAllCaptureGuidance,
      () => {
        render(currentTab, false);
        return root.querySelector<HTMLButtonElement>("[data-manual-execution]");
      },
      async (result, submissionId, announcement) => (
        continueManualCaptureReview(Object.freeze({
          outcome: result.outcome,
          executionId: result.executionId,
          submissionId,
        }), announcement, true)
      ),
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
    if (tab === "journal" || tab === "trades") {
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
        tab === "trades" ? tradeBrowserState.selectedDay : null,
      );
    }
    bindBatchReviewTagging(root, application, setBackgroundInert, async (announcement) => {
      snapshot = await application.loadWorkspace();
      render(currentTab, false);
      announceStatus(announcement);
    });
    bindRollbacks(root, application, snapshot, () => {
      clearImportReceiptReviewGuidance();
    }, async (announcement) => {
      snapshot = await application.loadWorkspace();
      render(currentTab, false);
      announceStatus(announcement);
    });
    root.querySelectorAll<HTMLButtonElement>("button[data-calendar-day-step]").forEach((button) => {
      button.addEventListener("click", () => {
        try {
          if (!button.isConnected || button.disabled) {
            throw new Error("Scoped activity-day trigger is unavailable.");
          }
          const current = buildTradeBrowser(snapshot, tradeBrowserState);
          const neighbors = scopedActivityDayNeighbors(current);
          const directionValue = button.dataset.calendarDayStep;
          if (directionValue !== "previous" && directionValue !== "next") {
            throw new Error("Scoped activity-day direction is unavailable.");
          }
          const direction: ScopedActivityDayDirection = directionValue;
          const selectedDay = neighbors.current.isoDate;
          const cards = Array.from(root.querySelectorAll<HTMLElement>(
            "[data-calendar-day-filter]",
          ));
          const headings = Array.from(root.querySelectorAll<HTMLElement>(
            "[data-calendar-day-filter-title]",
          ));
          const steppers = Array.from(root.querySelectorAll<HTMLElement>(
            "[data-calendar-day-stepper]",
          ));
          const controls = Array.from(root.querySelectorAll<HTMLButtonElement>(
            "button[data-calendar-day-step]",
          ));
          const directionControls = controls.filter((control) => (
            control.dataset.calendarDayStep === direction
          ));
          const previousControls = controls.filter((control) => (
            control.dataset.calendarDayStep === "previous"
          ));
          const nextControls = controls.filter((control) => (
            control.dataset.calendarDayStep === "next"
          ));
          const selectedCard = cards[0];
          const selectedHeading = headings[0];
          const stepper = steppers[0];
          if (
            cards.length !== 1
            || headings.length !== 1
            || steppers.length !== 1
            || controls.length !== 2
            || directionControls.length !== 1
            || previousControls.length !== 1
            || nextControls.length !== 1
            || directionControls[0] !== button
            || selectedCard === undefined
            || selectedHeading === undefined
            || stepper === undefined
            || selectedCard.dataset.calendarDayFilter !== selectedDay
            || selectedHeading.dataset.calendarDayFilterTitle !== selectedDay
            || selectedHeading.id !== "calendar-day-filter-title"
            || !selectedCard.contains(selectedHeading)
            || !selectedCard.contains(stepper)
            || !stepper.contains(button)
            || stepper.dataset.calendarDayStepper !== selectedDay
            || controls.some((control) => (
              control.dataset.calendarDayCurrent !== selectedDay
              || !stepper.contains(control)
            ))
          ) {
            throw new Error("Scoped activity-day markup does not reconcile.");
          }
          const expected = direction === "previous"
            ? neighbors.previous
            : neighbors.next;
          const target = button.dataset.calendarDayTarget;
          if (
            expected === null
            || target === undefined
            || target !== expected.isoDate
          ) {
            throw new Error("Scoped activity-day target is not the exact adjacent day.");
          }

          const candidate = buildTradeBrowser(snapshot, {
            ...current.state,
            selectedDay: target,
            calendarMonth: target.slice(0, 7),
          });
          const candidateNeighbors = scopedActivityDayNeighbors(candidate);
          if (
            candidate.invalidatedSelectedDay !== null
            || candidate.state.selectedDay !== target
            || candidate.state.calendarMonth !== target.slice(0, 7)
            || candidate.selectedSession?.isoDate !== target
            || candidateNeighbors.current.isoDate !== target
            || !retainedActivityDayStateMatches(current.state, candidate.state)
            || current.scopedCalendar.length !== candidate.scopedCalendar.length
            || current.scopedCalendar.some((session, index) => (
              candidate.scopedCalendar[index]?.isoDate !== session.isoDate
            ))
          ) {
            throw new Error("Scoped activity-day candidate does not reconcile.");
          }

          const previousState = tradeBrowserState;
          const previousAnnouncement = announcer?.textContent ?? "";
          try {
            tradeBrowserState = candidate.state;
            render("trades", false);
            const directionLabel = direction === "previous" ? "Previous" : "Next";
            announceStatus(
              `${directionLabel} activity day. ${calendarDayAnnouncement(candidateNeighbors.current, snapshot.currencyCode)} Scoped activity day ${candidateNeighbors.position} of ${candidateNeighbors.count} in retained scope.${viewFilterAnnouncement(candidate)}`,
            );
            focusExactCalendarDay(target);
          } catch (caught) {
            tradeBrowserState = previousState;
            if (announcer !== null) announcer.textContent = previousAnnouncement;
            try {
              render("trades", false);
            } catch {
              // Preserve the last validated state even if a second redraw also fails.
            }
            throw caught;
          }
        } catch {
          showCalendarDayStepError(button);
        }
      });
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
        focusExactCalendarDay(isoDate);
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
        manualCaptureAttemptGeneration += 1;
        importReceiptReviewAttemptGeneration += 1;
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
        clearAllCaptureGuidanceForWorkspace();
        tradeBrowserState = EMPTY_TRADE_BROWSER_STATE;
        render("dashboard");
      });
    });
  };

  async function continueImportReceiptReview(
    receiptId: string,
  ): Promise<ManualExecutionRefreshResult> {
    const retainedFailure = pendingImportReceiptReview?.receiptId === receiptId
      ? pendingImportReceiptReview
      : pendingImportReceiptReviewFromHistory(receiptId);
    importReceiptReviewAttemptGeneration += 1;
    const attemptGeneration = importReceiptReviewAttemptGeneration;
    const superseded = (): ManualExecutionRefreshResult => Object.freeze({
      status: "pending" as const,
      focus: () => undefined,
    });
    const showFailure = (): ManualExecutionRefreshResult => {
      importReceiptReviewEvidence = null;
      importReceiptReviewContinuation = null;
      pendingImportReceiptReview = retainedFailure;
      importReceiptReviewPageStart = 0;
      render("more", false);
      const headings = Array.from(root.querySelectorAll<HTMLElement>(
        "[data-import-receipt-review-failure-title]",
      ));
      const heading = headings.length === 1 ? headings[0] ?? null : null;
      return Object.freeze({
        status: "pending" as const,
        focus: () => {
          if (heading !== null && heading.isConnected) {
            focusManualCaptureElement(root, heading);
          }
        },
      });
    };

    let context: Awaited<ReturnType<JournalApplication["loadImportReceiptReviewContext"]>>;
    try {
      context = await application.loadImportReceiptReviewContext(receiptId);
    } catch {
      if (attemptGeneration !== importReceiptReviewAttemptGeneration) return superseded();
      try {
        const fresh = await application.loadWorkspace();
        const visibleReceipt = fresh.importHistory.find((receipt) => (
          receipt.receiptId === receiptId
        ));
        if (visibleReceipt?.rolledBack === true) {
          snapshot = fresh;
          clearImportReceiptReviewGuidance();
          render("more", false);
          return Object.freeze({
            status: "complete" as const,
            focus: () => {
              announceStatus("This receipt was rolled back. Its review continuation ended, and immutable history remains visible.");
              focusImportReceiptAfterRefresh(root, receiptId);
            },
          });
        }
      } catch {
        // The retry-only surface remains the truthful fallback for unreadable evidence.
      }
      return showFailure();
    }
    if (attemptGeneration !== importReceiptReviewAttemptGeneration) return superseded();

    const evidence: ImportReceiptReviewEvidence = Object.freeze({
      receipt: context.receipt,
      occurrenceExecutionIds: context.occurrenceExecutionIds,
    });
    let continuation: ImportReceiptReviewContinuation;
    try {
      continuation = buildImportReceiptReviewContinuation(context.snapshot, evidence);
    } catch {
      snapshot = context.snapshot;
      return showFailure();
    }
    if (attemptGeneration !== importReceiptReviewAttemptGeneration) return superseded();

    snapshot = context.snapshot;
    clearAllCaptureGuidance();
    importReceiptReviewEvidence = evidence;
    importReceiptReviewContinuation = continuation;
    pendingImportReceiptReview = null;
    importReceiptReviewPageStart = 0;
    let heading: HTMLElement;
    try {
      render("more", false);
      const sections = Array.from(root.querySelectorAll<HTMLElement>(
        "[data-import-receipt-review-continuation]",
      ));
      const headings = Array.from(root.querySelectorAll<HTMLElement>(
        "[data-import-receipt-review-title]",
      ));
      const section = sections[0];
      const candidateHeading = headings[0];
      if (
        sections.length !== 1
        || headings.length !== 1
        || section === undefined
        || candidateHeading === undefined
        || section.dataset.importReceiptReviewContinuation !== receiptId
        || !section.contains(candidateHeading)
        || candidateHeading.id !== "import-receipt-review-title"
      ) {
        throw new Error("The receipt review destination is unavailable.");
      }
      heading = candidateHeading;
    } catch {
      return showFailure();
    }

    return Object.freeze({
      status: "complete" as const,
      focus: () => {
        announceStatus(
          `Receipt reconciled. ${countNoun(continuation.acceptedRows, "accepted row")} resolve to ${countNoun(continuation.tradeSubjectIds.length, "current trade")} in the exact all-activity ${continuation.accountLabel} scope. Review actions are paged and no trade opened automatically.`,
        );
        if (heading.isConnected) focusManualCaptureElement(root, heading);
      },
    });
  }

  async function continueManualCaptureReview(
    reference: PendingManualCaptureReference,
    saveAnnouncement: string,
    allowOwnedManualModal: boolean,
  ): Promise<ManualExecutionRefreshResult> {
    const previousTab = currentTab;
    const previousState = tradeBrowserState;
    manualCaptureAttemptGeneration += 1;
    const attemptGeneration = manualCaptureAttemptGeneration;
    const superseded = (): ManualExecutionRefreshResult => Object.freeze({
      status: "pending" as const,
      focus: () => undefined,
    });
    const showKnownCommitFailure = (): ManualExecutionRefreshResult => {
      manualCaptureReference = null;
      manualCaptureContinuation = null;
      pendingManualCaptureReference = reference;
      tradeBrowserState = previousState;
      render(previousTab, false);
      const headings = Array.from(root.querySelectorAll<HTMLElement>(
        "[data-manual-capture-review-failure-title]",
      ));
      const heading = headings.length === 1 ? headings[0] ?? null : null;
      return Object.freeze({
        status: "pending" as const,
        focus: () => {
          if (heading !== null && heading.isConnected) {
            focusManualCaptureElement(root, heading);
          }
        },
      });
    };
    let freshSnapshot: JournalWorkspaceSnapshot;
    try {
      freshSnapshot = await application.loadWorkspace();
    } catch {
      if (attemptGeneration !== manualCaptureAttemptGeneration) return superseded();
      return showKnownCommitFailure();
    }
    if (attemptGeneration !== manualCaptureAttemptGeneration) return superseded();
    snapshot = freshSnapshot;
    let continuation: ManualCaptureReviewContinuation;
    try {
      continuation = buildManualCaptureReviewContinuation(snapshot, reference);
    } catch {
      return showKnownCommitFailure();
    }
    if (attemptGeneration !== manualCaptureAttemptGeneration) return superseded();

    const visibleReference: ManualCaptureCommitReference = Object.freeze({
      outcome: reference.outcome,
      executionId: reference.executionId,
    });
    manualCaptureReference = visibleReference;
    manualCaptureContinuation = continuation;
    pendingManualCaptureReference = null;
    tradeBrowserState = continuation.scope.state;
    let heading: HTMLElement;
    try {
      render("trades", false);
      const sections = Array.from(root.querySelectorAll<HTMLElement>(
        "[data-manual-capture-review-continuation]",
      ));
      const headings = Array.from(root.querySelectorAll<HTMLElement>(
        "[data-manual-capture-review-title]",
      ));
      const section = sections[0];
      const candidateHeading = headings[0];
      if (
        sections.length !== 1
        || headings.length !== 1
        || section === undefined
        || candidateHeading === undefined
        || !section.contains(candidateHeading)
        || candidateHeading.id !== "manual-capture-review-title"
        || (
          !allowOwnedManualModal
          && (
            screen === null
            || screen.hasAttribute("inert")
            || screen.getAttribute("aria-hidden") === "true"
          )
        )
      ) {
        throw new Error("The manual capture review destination is unavailable.");
      }
      heading = candidateHeading;
    } catch {
      return showKnownCommitFailure();
    }

    return Object.freeze({
      status: "complete" as const,
      focus: () => {
        announceStatus(
          `${saveAnnouncement} Opened ${continuation.accountLabel} in Trades with ${countNoun(continuation.scope.evidence.length, "current trade")}; ${countNoun(continuation.tradeSubjectIds.length, "trade")} linked to this execution. Temporary dates, day, search, and card filters were cleared.`,
        );
        if (heading.isConnected) focusManualCaptureElement(root, heading);
      },
    });
  }

  async function acknowledgeManualCapture(
    reference: PendingManualCaptureReference,
  ): Promise<boolean> {
    if (reference.submissionId === null) return true;
    try {
      await application.acknowledgeManualExecution(reference.submissionId);
      return true;
    } catch {
      window.alert(
        "The execution is visible, but its save confirmation remains pending. Hermes will retry recovery after restart.",
      );
      return false;
    }
  }

  let recoveringManualExecution = false;
  async function recoverNewestManualExecution(): Promise<void> {
    if (recoveringManualExecution || !onboarding.isComplete() || snapshot.provenance !== "local") {
      return;
    }
    recoveringManualExecution = true;
    try {
      const recoveredManualExecutions = await application.loadRecoverableManualExecutions();
      const recoveredCount = recoveredManualExecutions.length;
      const recovered = recoveredManualExecutions.at(-1);
      if (recovered === undefined) return;
      const reference = Object.freeze({
        outcome: "duplicate" as const,
        executionId: recovered.executionId,
        submissionId: recovered.submissionId,
      });
      const result = await continueManualCaptureReview(
        reference,
        recoveredCount === 1
          ? "This execution was already saved and awaiting confirmation; no duplicate was created."
          : `${recoveredCount} executions were already saved and awaiting confirmation; no duplicates were created. Continuing with the newest confirmation.`,
        false,
      );
      result.focus();
      if (result.status === "complete") await acknowledgeManualCapture(reference);
    } catch {
      window.alert(
        "Hermes could not check pending manual save confirmations. The journal remains unchanged; try again after restart.",
      );
    } finally {
      recoveringManualExecution = false;
    }
  }

  const chooseWorkspace = async (mode: "local" | "demo") => {
    snapshot = mode === "local"
      ? await application.startJournal()
      : await application.exploreDemo();
    clearAllCaptureGuidanceForWorkspace();
    tradeBrowserState = EMPTY_TRADE_BROWSER_STATE;
    render("dashboard", false);
  };

  root.querySelectorAll<HTMLButtonElement>("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      manualCaptureAttemptGeneration += 1;
      importReceiptReviewAttemptGeneration += 1;
      render((button.dataset.tab as TabId | undefined) ?? currentTab);
    });
  });
  root.querySelector("#settings-open")?.addEventListener("click", openSettings);
  root.querySelector("#settings-close")?.addEventListener("click", closeSettings);
  root.querySelector("#mode-toggle")?.addEventListener("click", async () => {
    snapshot = snapshot.provenance === "demo"
      ? await application.startJournal()
      : await application.exploreDemo();
    clearAllCaptureGuidanceForWorkspace();
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
    bindOnboarding(root, onboarding, setBackgroundInert, chooseWorkspace, async (mode) => {
      if (mode === "local") await recoverNewestManualExecution();
    });
  });
  render("dashboard", false);
  bindOnboarding(root, onboarding, setBackgroundInert, chooseWorkspace, async (mode) => {
    if (mode === "local") await recoverNewestManualExecution();
  });
  document.addEventListener("keydown", (event) => {
    const welcome = root.querySelector<HTMLElement>(".onboarding");
    const settingsSheet = root.querySelector<HTMLElement>(".settings-sheet");
    if (welcome) trapModalFocus(welcome, event);
    else if (settings && !settings.hidden && settingsSheet) trapModalFocus(settingsSheet, event);
    if (event.key === "Escape" && settings && !settings.hidden) closeSettings();
  });
  if (onboarding.isComplete()) await recoverNewestManualExecution();
}
