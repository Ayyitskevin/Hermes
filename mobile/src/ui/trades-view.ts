import type {
  TradeBrowserEvidence,
  TradeBrowserResult,
} from "../application/trade-browser";
import { TRADE_BROWSER_SEARCH_MAX_CODE_POINTS } from "../application/trade-browser";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import {
  calendarDayFilterCard,
  calendarTradeContributionCard,
} from "./calendar-day-view";
import { manualExecutionAction } from "./manual-execution-sheet";
import { reviewTradeAction } from "./trade-review-sheet";

export interface TradeScopeInput {
  readonly accountId: string | null;
  readonly activityFrom: string | null;
  readonly activityThrough: string | null;
}

export interface TradesViewHandlers {
  readonly applyScope: (input: TradeScopeInput) => void;
  readonly clearAll: () => void;
  readonly clearSelectedDay: () => void;
  readonly updateQuery: (query: string) => TradeBrowserResult;
}

function signedCurrency(value: number | null, currency: string): string {
  if (value === null) return "Open";
  if (!Number.isFinite(value)) throw new Error("Trade value is not finite enough to display.");
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    signDisplay: "always",
  }).format(value);
}

function currencyValue(value: number, currency: string): string {
  if (!Number.isFinite(value)) throw new Error("Trade price is not finite enough to display.");
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

function signedPercent(value: number | null, unavailable = "—"): string {
  if (value === null) return unavailable;
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
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

function activityDateCopy(dates: readonly string[]): string {
  if (dates.length === 0) throw new Error("Scoped trade evidence has no activity date.");
  if (dates.length === 1) return `on ${dates[0]}`;
  return `across ${dates.length} activity days`;
}

function scopedContributionCard(
  browser: TradeBrowserResult,
  evidence: TradeBrowserEvidence,
  currency: string,
): string {
  if (browser.selectedSession !== null) {
    const contribution = browser.selectedSession.contributions.find((candidate) => (
      candidate.tradeSubjectId === evidence.trade.tradeSubjectId
    ));
    if (contribution === undefined) {
      throw new Error("Selected activity day is missing scoped trade evidence.");
    }
    return calendarTradeContributionCard(browser.selectedSession, contribution, currency);
  }
  if (!browser.isFiltered) return "";
  return `<div class="calendar-trade-contribution ${resultClass(evidence.contributionPnl)}" data-trade-scope-contribution="${escapeHtml(evidence.trade.tradeSubjectId)}" data-trade-scope-pnl-exact="${escapeHtml(evidence.contributionPnlExact)}">
    <span>Scoped allocation contribution</span>
    <strong>${escapeHtml(signedCurrency(evidence.contributionPnl, currency))}</strong>
    <small>${countNoun(evidence.allocationCount, "allocation")} ${escapeHtml(activityDateCopy(evidence.activityDates))}</small>
  </div>`;
}

function tradeCard(
  evidence: TradeBrowserEvidence,
  browser: TradeBrowserResult,
  currency: string,
  visible: boolean,
): string {
  const trade = evidence.trade;
  const tone = resultClass(trade.resultPnl);
  const interim = hasInterimPartialMetrics(trade) ? "Interim partial · " : "";
  return `<article class="card trade-card" data-trade-subject="${escapeHtml(trade.tradeSubjectId)}" ${visible ? "" : "hidden"}>
    <div class="trade-card-heading">
      <div>
        <span class="status-chip">${escapeHtml(trade.side)}</span>
        <span class="status-chip">${escapeHtml(trade.status)}</span>
        <span class="status-chip review-${trade.reviewStatus}">${escapeHtml(trade.reviewStatus)}</span>
        <h2>${escapeHtml(trade.symbol)}</h2>
        <p>${escapeHtml(trade.setup)} · ${escapeHtml(trade.sessionLabel)}</p>
        <p class="trade-account">${escapeHtml(trade.accountLabel)}</p>
      </div>
      <div class="journal-metrics">
        <strong class="${tone}">${escapeHtml(signedCurrency(trade.resultPnl, currency))}</strong>
        <span>Whole trade · ${escapeHtml(interim)}${escapeHtml(signedR(trade.resultR, trade.status === "open" ? "Open" : "—"))} · ${escapeHtml(signedPercent(trade.percentReturn, trade.status === "open" ? "Partial unavailable" : "—"))}</span>
      </div>
    </div>
    ${scopedContributionCard(browser, evidence, currency)}
    <dl class="execution-grid">
      <div><dt>Quantity</dt><dd>${trade.quantity}</dd></div>
      <div><dt>Average in</dt><dd>${escapeHtml(currencyValue(trade.averageEntry, currency))}</dd></div>
      <div><dt>Average out</dt><dd>${trade.averageExit === null ? "Open" : escapeHtml(currencyValue(trade.averageExit, currency))}</dd></div>
    </dl>
    <p>${escapeHtml(trade.note)}</p>
    <div class="tag-row">${trade.tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
    <div class="quick-actions">${reviewTradeAction(trade)}</div>
  </article>`;
}

function scopeForm(snapshot: JournalWorkspaceSnapshot, browser: TradeBrowserResult): string {
  const options = snapshot.accountOptions.map((account) => (
    `<option value="${escapeHtml(account.id)}" ${browser.state.accountId === account.id ? "selected" : ""}>${escapeHtml(account.label)} · ${countNoun(account.tradeCount, "trade")}</option>`
  )).join("");
  return `<form class="card trade-scope-form" id="trade-scope-form" novalidate>
    <div>
      <p class="card-label">TRADE BROWSER</p>
      <h2>Account and activity dates</h2>
      <p>Dates are inclusive workspace-local allocation dates. Filters are session-only and never change governed report totals.</p>
    </div>
    <div class="trade-scope-fields">
      <label>Account
        <select id="trade-scope-account" name="account" aria-describedby="trade-scope-error">
          <option value="">All accounts</option>
          ${options}
        </select>
      </label>
      <label>Activity from
        <input id="trade-scope-from" name="from" type="date" min="1970-01-01" max="9999-12-31" aria-describedby="trade-scope-error" value="${escapeHtml(browser.state.activityFrom ?? "")}" />
      </label>
      <label>Activity through
        <input id="trade-scope-through" name="through" type="date" min="1970-01-01" max="9999-12-31" aria-describedby="trade-scope-error" value="${escapeHtml(browser.state.activityThrough ?? "")}" />
      </label>
    </div>
    <p class="form-error" id="trade-scope-error" role="alert" tabindex="-1" hidden></p>
    <div class="quick-actions">
      <button class="primary-button" type="submit">Apply scope</button>
      <button class="secondary-button" type="button" data-trade-scope-clear>Clear all</button>
    </div>
  </form>`;
}

function scopeSummary(browser: TradeBrowserResult, currency: string): string {
  const dayRefinement = browser.selectedSession === null
    ? ""
    : ` · Selected day: ${browser.selectedSession.isoDate}`;
  return `<article class="card trade-scope-summary" id="trade-scope-summary" tabindex="-1" aria-labelledby="trade-scope-summary-title">
    <div class="section-title">
      <div><p class="card-label">ALLOCATION EVIDENCE${escapeHtml(dayRefinement)}</p><h2 id="trade-scope-summary-title">${escapeHtml(browser.scopeLabel)}</h2></div>
      <strong class="${resultClass(browser.contributionPnl)}">${escapeHtml(signedCurrency(browser.contributionPnl, currency))}</strong>
    </div>
    <p>${countNoun(browser.evidence.length, "contributing trade")} · ${countNoun(browser.allocationCount, "allocation")} · ${countNoun(browser.activityDayCount, "activity day")}. This exact scoped contribution is separate from each card's whole-trade realized-to-date result.</p>
    <p class="scope-boundary">Dashboard headline metrics, review progress, equity curve, Plan Check, and Setup Breakdown remain whole-workspace.</p>
  </article>`;
}

export function tradesView(
  snapshot: JournalWorkspaceSnapshot,
  browser: TradeBrowserResult,
): string {
  const total = browser.evidence.length;
  const visibleSubjects = new Set(
    browser.visibleEvidence.map((evidence) => evidence.trade.tradeSubjectId),
  );
  const selected = browser.selectedSession;
  const scopeLabel = selected === null
    ? total === 1 ? "SCOPED TRADE" : "SCOPED TRADES"
    : total === 1 ? "ALLOCATION-DAY CONTRIBUTOR" : "ALLOCATION-DAY CONTRIBUTORS";
  const cards = browser.evidence.map((evidence) => tradeCard(
    evidence,
    browser,
    snapshot.currencyCode,
    visibleSubjects.has(evidence.trade.tradeSubjectId),
  )).join("");
  const searchLabel = selected === null
    ? "Search scoped trades"
    : `Search ${selected.dateLabel} scoped trades`;
  const visibleCount = browser.visibleEvidence.length;
  return `<section class="screen-stack" aria-labelledby="trades-title">
    <div class="screen-heading"><div><p class="eyebrow">${total} ${scopeLabel}</p><h1 id="trades-title">Trades</h1></div><span class="demo-badge">${snapshot.provenance === "demo" ? "DEMO" : snapshot.provenance === "empty" ? "NEW" : "LOCAL"}</span></div>
    ${snapshot.accountOptions.length === 0 ? "" : scopeForm(snapshot, browser)}
    ${selected === null ? "" : calendarDayFilterCard(selected, snapshot.currencyCode, browser.scopeLabel)}
    ${snapshot.accountOptions.length === 0 ? "" : scopeSummary(browser, snapshot.currencyCode)}
    ${snapshot.provenance === "demo" ? "" : manualExecutionAction()}
    <label class="search-field"><span class="sr-only">${escapeHtml(searchLabel)}</span><input id="trade-search" type="search" maxlength="${TRADE_BROWSER_SEARCH_MAX_CODE_POINTS}" aria-describedby="trade-search-error" placeholder="Search symbol, account, setup, or tag" autocomplete="off" value="${escapeHtml(browser.state.query)}" /></label>
    <p class="form-error" id="trade-search-error" role="alert" hidden></p>
    <p class="result-count" id="trade-count" role="status">${browser.state.query.length > 0 ? `Showing ${visibleCount} of ${countNoun(total, "trade")}` : `Showing ${countNoun(total, "trade")}`}</p>
    <div class="journal-list">${cards}</div>
    <article class="empty-state" id="trade-empty" ${visibleCount === 0 ? "" : "hidden"}><h2>${snapshot.trades.length === 0 ? "No trades yet" : total === 0 ? "No activity matches this scope" : "No trades match this search"}</h2><p>${snapshot.trades.length === 0 ? "Add an execution or import a CSV to build your journal." : total === 0 ? "Clear or widen the account and activity-date scope." : "Try another symbol, account, setup, side, or tag."}</p></article>
  </section>`;
}

function updateSearchResult(root: HTMLElement, browser: TradeBrowserResult): void {
  const visible = new Set(
    browser.visibleEvidence.map((evidence) => evidence.trade.tradeSubjectId),
  );
  root.querySelectorAll<HTMLElement>("[data-trade-subject]").forEach((card) => {
    card.hidden = !visible.has(card.dataset.tradeSubject ?? "");
  });
  const count = root.querySelector<HTMLElement>("#trade-count");
  if (count !== null) {
    count.textContent = browser.state.query.length > 0
      ? `Showing ${browser.visibleEvidence.length} of ${countNoun(browser.evidence.length, "trade")}`
      : `Showing ${countNoun(browser.evidence.length, "trade")}`;
  }
  const empty = root.querySelector<HTMLElement>("#trade-empty");
  if (empty !== null) empty.hidden = browser.visibleEvidence.length !== 0;
}

export function bindTradesView(
  root: HTMLElement,
  browser: TradeBrowserResult,
  handlers: TradesViewHandlers,
): void {
  const form = root.querySelector<HTMLFormElement>("#trade-scope-form");
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    const error = form.querySelector<HTMLElement>("#trade-scope-error");
    const controls = Array.from(form.querySelectorAll<HTMLElement>(
      "#trade-scope-account, #trade-scope-from, #trade-scope-through",
    ));
    controls.forEach((control) => control.removeAttribute("aria-invalid"));
    if (error !== null) {
      error.hidden = true;
      error.textContent = "";
    }
    try {
      const account = form.querySelector<HTMLSelectElement>("#trade-scope-account")?.value ?? "";
      const from = form.querySelector<HTMLInputElement>("#trade-scope-from")?.value ?? "";
      const through = form.querySelector<HTMLInputElement>("#trade-scope-through")?.value ?? "";
      handlers.applyScope({
        accountId: account.length === 0 ? null : account,
        activityFrom: from.length === 0 ? null : from,
        activityThrough: through.length === 0 ? null : through,
      });
    } catch (caught) {
      if (error === null) return;
      controls.forEach((control) => control.setAttribute("aria-invalid", "true"));
      error.hidden = false;
      error.textContent = caught instanceof Error ? caught.message : "The trade scope is invalid.";
      error.focus();
    }
  });
  root.querySelector<HTMLButtonElement>("[data-trade-scope-clear]")?.addEventListener(
    "click",
    handlers.clearAll,
  );
  root.querySelector<HTMLButtonElement>("[data-calendar-day-clear]")?.addEventListener(
    "click",
    handlers.clearSelectedDay,
  );

  const search = root.querySelector<HTMLInputElement>("#trade-search");
  const searchError = root.querySelector<HTMLElement>("#trade-search-error");
  search?.addEventListener("input", () => {
    try {
      const result = handlers.updateQuery(search.value);
      search.removeAttribute("aria-invalid");
      if (searchError !== null) searchError.hidden = true;
      updateSearchResult(root, result);
    } catch (caught) {
      search.setAttribute("aria-invalid", "true");
      if (searchError !== null) {
        searchError.hidden = false;
        searchError.textContent = caught instanceof Error
          ? caught.message
          : "The trade search is invalid.";
      }
    }
  });
  updateSearchResult(root, browser);
}
