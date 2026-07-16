import type {
  TradeBrowserAssetClassFilter,
  TradeBrowserDirectionFilter,
  TradeBrowserEvidence,
  TradeBrowserPositionFilter,
  TradeBrowserReviewFilter,
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

export interface TradeViewFilterInput {
  readonly assetClass: TradeBrowserAssetClassFilter;
  readonly direction: TradeBrowserDirectionFilter;
  readonly positionState: TradeBrowserPositionFilter;
  readonly reviewState: TradeBrowserReviewFilter;
  readonly mistake: string | null;
  readonly emotion: string | null;
  readonly tag: string | null;
}

export interface TradesViewHandlers {
  readonly applyScope: (input: TradeScopeInput) => void;
  readonly clearAll: () => void;
  readonly clearSelectedDay: () => void;
  readonly clearViewFilters: () => void;
  readonly updateViewFilters: (input: TradeViewFilterInput) => TradeBrowserResult;
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
  qualifyHeading: boolean,
): string {
  const trade = evidence.trade;
  const tone = resultClass(trade.resultPnl);
  const interim = hasInterimPartialMetrics(trade) ? "Interim partial · " : "";
  const assetClass = trade.assetClass === "etf" ? "ETF" : "Stock";
  const headingQualifier = qualifyHeading
    ? `<span class="sr-only"> · ${assetClass} · ${escapeHtml(trade.accountLabel)} · ${escapeHtml(trade.sessionLabel)}</span>`
    : "";
  return `<article class="card trade-card" data-trade-subject="${escapeHtml(trade.tradeSubjectId)}" ${visible ? "" : "hidden"}>
    <div class="trade-card-heading">
      <div>
        <span class="status-chip">${assetClass}</span>
        <span class="status-chip">${escapeHtml(trade.side)}</span>
        <span class="status-chip">${escapeHtml(trade.status)}</span>
        <span class="status-chip review-${trade.reviewStatus}">${escapeHtml(trade.reviewStatus)}</span>
        <h2>${escapeHtml(trade.symbol)}${headingQualifier}</h2>
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

function selected(current: string, candidate: string): string {
  return current === candidate ? "selected" : "";
}

function reviewFacetOptions(
  current: string | null,
  available: readonly string[],
  allLabel: string,
): string {
  const stale = current !== null && !available.includes(current)
    ? `<option value="${escapeHtml(current)}" selected>${escapeHtml(current)} (not currently assigned)</option>`
    : "";
  return `<option value="" ${current === null ? "selected" : ""}>${escapeHtml(allLabel)}</option>
    ${stale}
    ${available.map((value) => (
      `<option value="${escapeHtml(value)}" ${current === value ? "selected" : ""}>${escapeHtml(value)}</option>`
    )).join("")}`;
}

function disabledWithoutOptions(current: string | null, available: readonly string[]): string {
  return current === null && available.length === 0 ? "disabled" : "";
}

function exactViewFacetCount(browser: TradeBrowserResult): number {
  return Number(browser.state.assetClass !== "all")
    + Number(browser.state.direction !== "all")
    + Number(browser.state.positionState !== "all")
    + Number(browser.state.reviewState !== "all")
    + Number(browser.state.mistake !== null)
    + Number(browser.state.emotion !== null)
    + Number(browser.state.tag !== null);
}

function exactViewFacetCountLabel(count: number): string {
  return count === 0 ? "none active" : countNoun(count, "active filter");
}

function viewFilters(browser: TradeBrowserResult): string {
  const controls = "trade-card-list trade-count trade-empty";
  const describedBy = "trade-view-filter-boundary trade-view-filter-error";
  const activeFilterCount = exactViewFacetCount(browser);
  return `<section class="card trade-view-filters" aria-labelledby="trade-view-filter-title">
    <div>
      <p class="card-label">VISIBLE CARDS</p>
      <h2 id="trade-view-filter-title">Exact trade filters</h2>
      <p id="trade-view-filter-boundary">These session-only filters change visible cards and search results. They never change allocation scope, P&amp;L totals, the calendar, Dashboard metrics, or Reports.</p>
    </div>
    <details class="trade-view-filter-disclosure" data-trade-filter-disclosure ${activeFilterCount > 0 ? "open" : ""}>
      <summary id="trade-view-filter-summary">
        <strong>Filter controls</strong>
        <span data-trade-view-filter-count>· ${exactViewFacetCountLabel(activeFilterCount)}</span>
      </summary>
      <div class="trade-view-filter-body">
        <div class="trade-scope-fields">
          <label>Asset class
            <select id="trade-filter-asset-class" aria-controls="${controls}" aria-describedby="${describedBy}">
              <option value="all" ${selected(browser.state.assetClass, "all")}>All asset classes</option>
              <option value="stock" ${selected(browser.state.assetClass, "stock")}>Stock</option>
              <option value="etf" ${selected(browser.state.assetClass, "etf")}>ETF</option>
            </select>
          </label>
          <label>Direction
            <select id="trade-filter-direction" aria-controls="${controls}" aria-describedby="${describedBy}">
              <option value="all" ${selected(browser.state.direction, "all")}>All directions</option>
              <option value="long" ${selected(browser.state.direction, "long")}>Long</option>
              <option value="short" ${selected(browser.state.direction, "short")}>Short</option>
            </select>
          </label>
          <label>Position state
            <select id="trade-filter-position" aria-controls="${controls}" aria-describedby="${describedBy}">
              <option value="all" ${selected(browser.state.positionState, "all")}>Open and closed</option>
              <option value="open" ${selected(browser.state.positionState, "open")}>Open</option>
              <option value="closed" ${selected(browser.state.positionState, "closed")}>Closed</option>
            </select>
          </label>
          <label>Review state
            <select id="trade-filter-review" aria-controls="${controls}" aria-describedby="${describedBy}">
              <option value="all" ${selected(browser.state.reviewState, "all")}>All review states</option>
              <option value="pending" ${selected(browser.state.reviewState, "pending")}>Pending</option>
              <option value="draft" ${selected(browser.state.reviewState, "draft")}>Draft</option>
              <option value="completed" ${selected(browser.state.reviewState, "completed")}>Completed</option>
            </select>
          </label>
          <label>Mistake
            <select id="trade-filter-mistake" aria-controls="${controls}" aria-describedby="${describedBy}" ${disabledWithoutOptions(browser.state.mistake, browser.reviewFacetOptions.mistakes)}>
              ${reviewFacetOptions(browser.state.mistake, browser.reviewFacetOptions.mistakes, "All mistakes")}
            </select>
          </label>
          <label>Emotion
            <select id="trade-filter-emotion" aria-controls="${controls}" aria-describedby="${describedBy}" ${disabledWithoutOptions(browser.state.emotion, browser.reviewFacetOptions.emotions)}>
              ${reviewFacetOptions(browser.state.emotion, browser.reviewFacetOptions.emotions, "All emotions")}
            </select>
          </label>
          <label>Tag
            <select id="trade-filter-tag" aria-controls="${controls}" aria-describedby="${describedBy}" ${disabledWithoutOptions(browser.state.tag, browser.reviewFacetOptions.tags)}>
              ${reviewFacetOptions(browser.state.tag, browser.reviewFacetOptions.tags, "All tags")}
            </select>
          </label>
        </div>
        <p class="form-error" id="trade-view-filter-error" role="alert" hidden></p>
      </div>
    </details>
    <div class="quick-actions">
      <button class="secondary-button" type="button" data-trade-view-clear ${browser.hasViewFilters ? "" : "disabled"}>Clear search and filters</button>
    </div>
  </section>`;
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
    <p class="scope-boundary">Dashboard headline metrics, review progress, equity curve, Direction Mix, Plan Check, Mistake Patterns, Emotion Patterns, and Setup Breakdown remain whole-workspace.</p>
  </article>`;
}

function hasExactViewFacet(browser: TradeBrowserResult): boolean {
  return exactViewFacetCount(browser) > 0;
}

function noMatchTitle(browser: TradeBrowserResult): string {
  return hasExactViewFacet(browser)
    ? "No trades match these filters"
    : "No trades match this search";
}

function noMatchCopy(browser: TradeBrowserResult): string {
  return hasExactViewFacet(browser)
    ? "Change or clear the search and exact trade filters."
    : "Try another symbol, account, setup, side, or tag.";
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
  const symbolCounts = new Map<string, number>();
  for (const trade of snapshot.trades) {
    symbolCounts.set(trade.symbol, (symbolCounts.get(trade.symbol) ?? 0) + 1);
  }
  const scopeLabel = selected === null
    ? total === 1 ? "SCOPED TRADE" : "SCOPED TRADES"
    : total === 1 ? "ALLOCATION-DAY CONTRIBUTOR" : "ALLOCATION-DAY CONTRIBUTORS";
  const cards = browser.evidence.map((evidence) => tradeCard(
    evidence,
    browser,
    snapshot.currencyCode,
    visibleSubjects.has(evidence.trade.tradeSubjectId),
    (symbolCounts.get(evidence.trade.symbol) ?? 0) > 1,
  )).join("");
  const searchLabel = selected === null
    ? "Search scoped trades"
    : `Search ${selected.dateLabel} scoped trades`;
  const visibleCount = browser.visibleEvidence.length;
  const searchDescribedBy = snapshot.accountOptions.length === 0
    ? "trade-search-error"
    : "trade-search-error trade-view-filter-boundary";
  return `<section class="screen-stack" aria-labelledby="trades-title">
    <div class="screen-heading"><div><p class="eyebrow">${total} ${scopeLabel}</p><h1 id="trades-title">Trades</h1></div><span class="demo-badge">${snapshot.provenance === "demo" ? "DEMO" : snapshot.provenance === "empty" ? "NEW" : "LOCAL"}</span></div>
    ${snapshot.accountOptions.length === 0 ? "" : scopeForm(snapshot, browser)}
    ${selected === null ? "" : calendarDayFilterCard(selected, snapshot.currencyCode, browser.scopeLabel)}
    ${snapshot.accountOptions.length === 0 ? "" : scopeSummary(browser, snapshot.currencyCode)}
    ${snapshot.provenance === "demo" ? "" : manualExecutionAction()}
    ${snapshot.accountOptions.length === 0 ? "" : viewFilters(browser)}
    <label class="search-field"><span class="sr-only">${escapeHtml(searchLabel)}</span><input id="trade-search" type="search" maxlength="${TRADE_BROWSER_SEARCH_MAX_CODE_POINTS}" aria-describedby="${searchDescribedBy}" aria-controls="trade-card-list trade-count trade-empty" placeholder="Search symbol, account, setup, or tag" autocomplete="off" value="${escapeHtml(browser.state.query)}" /></label>
    <p class="form-error" id="trade-search-error" role="alert" hidden></p>
    <p class="result-count" id="trade-count" role="status">${browser.hasViewFilters ? `Showing ${visibleCount} of ${countNoun(total, "trade")}` : `Showing ${countNoun(total, "trade")}`}</p>
    <div class="journal-list" id="trade-card-list">${cards}</div>
    <article class="empty-state" id="trade-empty" ${visibleCount === 0 ? "" : "hidden"}><h2 data-trade-empty-title>${snapshot.trades.length === 0 ? "No trades yet" : total === 0 ? "No activity matches this scope" : noMatchTitle(browser)}</h2><p data-trade-empty-copy>${snapshot.trades.length === 0 ? "Add an execution or import a CSV to build your journal." : total === 0 ? "Clear or widen the account and activity-date scope." : noMatchCopy(browser)}</p></article>
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
    count.textContent = browser.hasViewFilters
      ? `Showing ${browser.visibleEvidence.length} of ${countNoun(browser.evidence.length, "trade")}`
      : `Showing ${countNoun(browser.evidence.length, "trade")}`;
  }
  const empty = root.querySelector<HTMLElement>("#trade-empty");
  if (empty !== null) empty.hidden = browser.visibleEvidence.length !== 0;
  if (browser.evidence.length > 0) {
    const title = root.querySelector<HTMLElement>("[data-trade-empty-title]");
    const copy = root.querySelector<HTMLElement>("[data-trade-empty-copy]");
    if (title !== null) title.textContent = noMatchTitle(browser);
    if (copy !== null) copy.textContent = noMatchCopy(browser);
  }
  const clear = root.querySelector<HTMLButtonElement>("[data-trade-view-clear]");
  if (clear !== null) clear.disabled = !browser.hasViewFilters;
  const activeFilterCount = exactViewFacetCount(browser);
  const filterCount = root.querySelector<HTMLElement>("[data-trade-view-filter-count]");
  if (filterCount !== null) {
    filterCount.textContent = `· ${exactViewFacetCountLabel(activeFilterCount)}`;
  }
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

  const facetControls = Array.from(root.querySelectorAll<HTMLSelectElement>(
    "#trade-filter-asset-class, #trade-filter-direction, #trade-filter-position, #trade-filter-review, #trade-filter-mistake, #trade-filter-emotion, #trade-filter-tag",
  ));
  const filterError = root.querySelector<HTMLElement>("#trade-view-filter-error");
  const applyViewFilters = () => {
    try {
      const result = handlers.updateViewFilters({
        assetClass: root.querySelector<HTMLSelectElement>("#trade-filter-asset-class")
          ?.value as TradeBrowserAssetClassFilter ?? "all",
        direction: root.querySelector<HTMLSelectElement>("#trade-filter-direction")
          ?.value as TradeBrowserDirectionFilter ?? "all",
        positionState: root.querySelector<HTMLSelectElement>("#trade-filter-position")
          ?.value as TradeBrowserPositionFilter ?? "all",
        reviewState: root.querySelector<HTMLSelectElement>("#trade-filter-review")
          ?.value as TradeBrowserReviewFilter ?? "all",
        mistake: root.querySelector<HTMLSelectElement>("#trade-filter-mistake")?.value || null,
        emotion: root.querySelector<HTMLSelectElement>("#trade-filter-emotion")?.value || null,
        tag: root.querySelector<HTMLSelectElement>("#trade-filter-tag")?.value || null,
      });
      facetControls.forEach((control) => control.removeAttribute("aria-invalid"));
      if (filterError !== null) {
        filterError.hidden = true;
        filterError.textContent = "";
      }
      updateSearchResult(root, result);
      const filterDisclosure = root.querySelector<HTMLDetailsElement>(
        "[data-trade-filter-disclosure]",
      );
      if (filterDisclosure !== null) {
        filterDisclosure.open = hasExactViewFacet(result);
        if (!filterDisclosure.open) {
          root.querySelector<HTMLElement>("#trade-view-filter-summary")?.focus();
        }
      }
    } catch (caught) {
      facetControls.forEach((control) => control.setAttribute("aria-invalid", "true"));
      if (filterError !== null) {
        filterError.hidden = false;
        filterError.textContent = caught instanceof Error
          ? caught.message
          : "The exact trade filters are invalid.";
      }
    }
  };
  facetControls.forEach((control) => control.addEventListener("change", applyViewFilters));
  root.querySelector<HTMLButtonElement>("[data-trade-view-clear]")?.addEventListener(
    "click",
    handlers.clearViewFilters,
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
