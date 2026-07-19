import {
  ACCOUNT_REVIEW_COVERAGE_REPORT_VERSION,
  buildAccountReviewCoverageReport,
  type AccountReviewCoverageAccount,
  type AccountReviewCoverageReviewState,
} from "../core/account-review-coverage-report";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot } from "../core/types";

export const ACCOUNT_REVIEW_COVERAGE_UNAVAILABLE_MESSAGE =
  "This account review link is no longer available. No Trade Browser filters changed.";

const accountReviewCoverageBindings = new WeakMap<HTMLElement, AbortController>();

export interface AccountReviewCoverageActions {
  readonly openCohort: (
    accountId: string,
    reviewState: AccountReviewCoverageReviewState,
    expectedTradeCount: number,
  ) => void;
  readonly announceFailure: (message: string) => void;
}

function countNoun(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function modeLabel(snapshot: JournalWorkspaceSnapshot): string {
  if (snapshot.provenance === "demo") return "FICTIONAL DEMO";
  if (snapshot.provenance === "empty") return "NEW";
  return "LOCAL";
}

function stateLabel(
  reviewState: AccountReviewCoverageReviewState,
): string {
  switch (reviewState) {
    case "draft": return "Draft reviews";
    case "pending": return "Not started";
    case "completed": return "Completed reviews";
  }
}

function actionText(
  reviewState: AccountReviewCoverageReviewState,
): string {
  switch (reviewState) {
    case "draft": return "Open drafts";
    case "pending": return "Open not-started";
    case "completed": return "Open completed";
  }
}

function actionAriaState(
  reviewState: AccountReviewCoverageReviewState,
): string {
  switch (reviewState) {
    case "draft": return "draft reviews";
    case "pending": return "not-started reviews";
    case "completed": return "completed reviews";
  }
}

function group(
  account: AccountReviewCoverageAccount,
  classification: AccountReviewCoverageAccount["groups"][number]["classification"],
): AccountReviewCoverageAccount["groups"][number] {
  const matches = account.groups.filter((candidate) => (
    candidate.classification === classification
  ));
  if (matches.length !== 1 || matches[0] === undefined) {
    throw new Error(
      `Account ${account.accountId} review coverage group ${classification} is unavailable.`,
    );
  }
  return matches[0];
}

function cohortAction(
  account: AccountReviewCoverageAccount,
  accountCount: number,
  reviewState: AccountReviewCoverageReviewState,
): string {
  const cohort = group(account, reviewState);
  if (cohort.tradeCount === 0) return "";
  const accessibleName = `Open ${account.accountLabel} ${actionAriaState(reviewState)} in Trades, account ${account.position} of ${accountCount}`;
  return `<button class="secondary-button" type="button" data-account-review-coverage-route="${escapeHtml(account.accountId)}" data-account-review-coverage-position="${account.position}" data-account-review-coverage-review-state="${reviewState}" data-account-review-coverage-count="${cohort.tradeCount}" aria-label="${escapeHtml(accessibleName)}">${actionText(reviewState)}</button>`;
}

function accountTemplate(
  account: AccountReviewCoverageAccount,
  accountCount: number,
): string {
  const draft = group(account, "draft");
  const pending = group(account, "pending");
  const completed = group(account, "completed");
  const open = group(account, "open");
  const waiting = draft.tradeCount + pending.tradeCount;
  return `<details class="plan-check-group account-review-coverage-account" data-account-review-coverage-account="${escapeHtml(account.accountId)}" data-account-review-coverage-position="${account.position}" data-account-review-coverage-trade-count="${account.tradeCount}" data-account-review-coverage-draft-count="${draft.tradeCount}" data-account-review-coverage-pending-count="${pending.tradeCount}" data-account-review-coverage-completed-count="${completed.tradeCount}" data-account-review-coverage-open-count="${open.tradeCount}">
    <summary>
      <span class="plan-check-summary-label"><strong>${escapeHtml(account.accountLabel)}</strong><span>Account ${account.position} of ${accountCount} · ${countNoun(account.tradeCount, "current trade")}</span></span>
      <span class="plan-check-summary-value">${countNoun(waiting, "review")} waiting</span>
    </summary>
    <div class="plan-check-group-body">
      <div class="plan-check-metrics account-review-coverage-counts">
        <div class="plan-check-metric"><span>${stateLabel("draft")}</span><strong>${draft.tradeCount}</strong></div>
        <div class="plan-check-metric"><span>${stateLabel("pending")}</span><strong>${pending.tradeCount}</strong></div>
        <div class="plan-check-metric"><span>${stateLabel("completed")}</span><strong>${completed.tradeCount}</strong></div>
        <div class="plan-check-metric"><span>Open positions</span><strong>${open.tradeCount}</strong></div>
      </div>
      <div class="quick-actions account-review-coverage-actions">
        ${cohortAction(account, accountCount, "draft")}
        ${cohortAction(account, accountCount, "pending")}
        ${cohortAction(account, accountCount, "completed")}
      </div>
      <p class="helper-text">${countNoun(open.tradeCount, "open position")} ${open.tradeCount === 1 ? "is" : "are"} counted in this account total and excluded from closed-review actions.</p>
    </div>
  </details>`;
}

export function accountReviewCoverageSection(
  snapshot: JournalWorkspaceSnapshot,
): string {
  const report = buildAccountReviewCoverageReport(snapshot);
  if (report.metadata.version !== ACCOUNT_REVIEW_COVERAGE_REPORT_VERSION) {
    throw new Error("The account-review-coverage report definition is unsupported.");
  }
  const accounts = report.accounts.length === 0
    ? `<article class="empty-state"><h3>No retained accounts</h3><p>Account review coverage appears after the first local account is established.</p></article>`
    : report.accounts.map((account) => (
        accountTemplate(account, report.metadata.accountCount)
      )).join("");
  return `<section class="card plan-check-card account-review-coverage-card" aria-labelledby="account-review-coverage-title" data-account-review-coverage>
    <div class="section-title"><div><p class="card-label">ACCOUNT WORKFLOW, RECONCILED</p><h2 id="account-review-coverage-title" class="report-target" tabindex="-1">Account review coverage</h2></div><div class="report-section-actions"><span>${modeLabel(snapshot)}</span><a class="report-menu-link" href="#reports-navigation-title" data-report-target="reports-navigation-title">Back to report menu</a></div></div>
    <p>Every retained account appears once, including accounts with no current trades. Closed trades are partitioned into draft, not-started, and completed review states; open positions stay explicit and outside review actions.</p>
    <dl class="plan-check-meta account-review-coverage-meta">
      <div><dt>Definition</dt><dd>${escapeHtml(report.metadata.version)}</dd></div>
      <div><dt>Definition checksum</dt><dd>${escapeHtml(report.metadata.definitionSha256)}</dd></div>
      <div><dt>Period</dt><dd>${escapeHtml(report.metadata.periodLabel)}</dd></div>
      <div><dt>Time zone</dt><dd>${escapeHtml(report.metadata.timeZone)}</dd></div>
      <div><dt>Account scope</dt><dd>${escapeHtml(report.metadata.accountLabel)}</dd></div>
      <div><dt>Retained accounts</dt><dd>${countNoun(report.metadata.accountCount, "account")}</dd></div>
      <div><dt>Current trades</dt><dd>${countNoun(report.metadata.totalTradeCount, "trade")}</dd></div>
      <div><dt>Closed reviews</dt><dd>${report.metadata.draftReviewCount} draft · ${report.metadata.pendingReviewCount} not started · ${report.metadata.completedReviewCount} completed</dd></div>
      <div><dt>Open exclusions</dt><dd>${countNoun(report.metadata.openTradeCount, "open position")}</dd></div>
    </dl>
    <div class="plan-check-groups account-review-coverage-groups">${accounts}</div>
    <details class="plan-check-disclosure account-review-coverage-disclosure">
      <summary>How this report works</summary>
      <p>Accounts use retained stable ledger IDs and appear in account-label then account-ID order. Duplicate display labels remain separate by account position.</p>
      <p>Each current trade belongs to exactly one account and one state. Draft and not-started counts add to the global waiting count; completed closed trades reconcile separately. Open positions are conserved but never offered as closed-review cohorts.</p>
      <p>Actions rebuild an exact account plus closed-position plus review-state Trade Browser view from empty temporary filters. They never open a review automatically or change journal data.</p>
      <p>Counts describe review workflow coverage only. Hermes does not calculate rates, rank accounts, reward trade count, compare outcomes, or recommend activity.</p>
    </details>
    <p class="form-error account-review-coverage-status" id="account-review-coverage-status" role="status" tabindex="-1" hidden></p>
  </section>`;
}

function showUnavailable(
  root: HTMLElement,
  announceFailure: (message: string) => void,
): void {
  const status = root.querySelector<HTMLElement>(
    "#account-review-coverage-status",
  );
  if (status !== null) {
    status.hidden = false;
    status.textContent = ACCOUNT_REVIEW_COVERAGE_UNAVAILABLE_MESSAGE;
    status.scrollIntoView({ behavior: "auto", block: "center" });
    status.focus({ preventScroll: true });
    return;
  }
  announceFailure(ACCOUNT_REVIEW_COVERAGE_UNAVAILABLE_MESSAGE);
}

export function bindAccountReviewCoverageView(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
  actions: AccountReviewCoverageActions,
): void {
  accountReviewCoverageBindings.get(root)?.abort();
  const report = buildAccountReviewCoverageReport(snapshot);
  const boundButtons = Array.from(root.querySelectorAll<HTMLButtonElement>(
    "button[data-account-review-coverage-route]",
  ));
  const binding = new AbortController();
  accountReviewCoverageBindings.set(root, binding);
  let activating = false;
  root.addEventListener("click", (event) => {
    const eventTarget = event.target;
    const button = eventTarget instanceof Element
      ? eventTarget.closest<HTMLButtonElement>("button")
      : null;
    if (button === null) return;
    const claimedSection = button.closest<HTMLElement>(
      "[data-account-review-coverage]",
    );
    if (
      !boundButtons.includes(button)
      && !button.hasAttribute("data-account-review-coverage-route")
      && claimedSection === null
    ) return;
    if (activating) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    activating = true;

    const sections = Array.from(root.querySelectorAll<HTMLElement>(
      "[data-account-review-coverage]",
    ));
    const cards = Array.from(root.querySelectorAll<HTMLElement>(
      "[data-account-review-coverage-account]",
    ));
    const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(
      "button[data-account-review-coverage-route]",
    ));
    const accountId = button.dataset.accountReviewCoverageRoute;
    const rawPosition = button.dataset.accountReviewCoveragePosition;
    const rawReviewState = button.dataset.accountReviewCoverageReviewState;
    const rawCount = button.dataset.accountReviewCoverageCount;
    const reviewState: AccountReviewCoverageReviewState | undefined =
      rawReviewState === "draft"
      || rawReviewState === "pending"
      || rawReviewState === "completed"
        ? rawReviewState
        : undefined;
    const position = rawPosition === undefined ? Number.NaN : Number(rawPosition);
    const tradeCount = rawCount === undefined ? Number.NaN : Number(rawCount);
    const expected = Number.isSafeInteger(position) && position > 0
      ? report.accounts[position - 1]
      : undefined;
    const expectedGroup = expected === undefined || reviewState === undefined
      ? undefined
      : group(expected, reviewState);
    const expectedActionCount = report.accounts.reduce((total, account) => (
      total + (["draft", "pending", "completed"] as const).filter((state) => (
        group(account, state).tradeCount > 0
      )).length
    ), 0);
    const expectedCardActionCount = expected === undefined
      ? Number.NaN
      : (["draft", "pending", "completed"] as const).filter((state) => (
          group(expected, state).tradeCount > 0
        )).length;
    const matchingButtons = buttons.filter((candidate) => (
      candidate.dataset.accountReviewCoverageRoute === accountId
      && candidate.dataset.accountReviewCoveragePosition === rawPosition
      && candidate.dataset.accountReviewCoverageReviewState === rawReviewState
      && candidate.dataset.accountReviewCoverageCount === rawCount
    ));
    const matchingCards = cards.filter((candidate) => (
      candidate.dataset.accountReviewCoverageAccount === accountId
      && candidate.dataset.accountReviewCoveragePosition === rawPosition
      && candidate.dataset.accountReviewCoverageTradeCount
        === String(expected?.tradeCount)
      && candidate.dataset.accountReviewCoverageDraftCount
        === String(expected === undefined ? undefined : group(expected, "draft").tradeCount)
      && candidate.dataset.accountReviewCoveragePendingCount
        === String(expected === undefined ? undefined : group(expected, "pending").tradeCount)
      && candidate.dataset.accountReviewCoverageCompletedCount
        === String(expected === undefined ? undefined : group(expected, "completed").tradeCount)
      && candidate.dataset.accountReviewCoverageOpenCount
        === String(expected === undefined ? undefined : group(expected, "open").tradeCount)
    ));
    const section = sections[0];
    const card = matchingCards[0];
    const expectedAriaLabel = expected === undefined || reviewState === undefined
      ? null
      : `Open ${expected.accountLabel} ${actionAriaState(reviewState)} in Trades, account ${position} of ${report.metadata.accountCount}`;
    if (
      !boundButtons.includes(button)
      || !button.isConnected
      || sections.length !== 1
      || section === undefined
      || claimedSection !== section
      || !section.contains(button)
      || accountId === undefined
      || reviewState === undefined
      || expected === undefined
      || expectedGroup === undefined
      || expected.accountId !== accountId
      || rawPosition !== String(position)
      || rawCount !== String(tradeCount)
      || tradeCount !== expectedGroup.tradeCount
      || tradeCount < 1
      || buttons.length !== expectedActionCount
      || cards.length !== report.accounts.length
      || matchingButtons.length !== 1
      || matchingButtons[0] !== button
      || matchingCards.length !== 1
      || card === undefined
      || !card.contains(button)
      || card.querySelectorAll("button[data-account-review-coverage-route]").length
        !== expectedCardActionCount
      || button.getAttribute("aria-label") !== expectedAriaLabel
      || button.textContent?.trim() !== actionText(reviewState)
    ) {
      showUnavailable(root, actions.announceFailure);
      return;
    }
    try {
      actions.openCohort(accountId, reviewState, tradeCount);
    } catch {
      showUnavailable(root, actions.announceFailure);
    }
  }, { capture: true, signal: binding.signal });
}
