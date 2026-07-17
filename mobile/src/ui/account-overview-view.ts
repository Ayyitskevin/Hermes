import { buildAccountOverview, type AccountOverview } from "../application/account-overview";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot } from "../core/types";

const UNAVAILABLE_MESSAGE = "This account link is no longer available. No Trade Browser scope changed.";

export interface AccountOverviewActions {
  readonly openAccount: (accountId: string) => void;
  readonly announceFailure: (message: string) => void;
}

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function accountItem(
  account: AccountOverview["accounts"][number],
  index: number,
  accountCount: number,
): string {
  const position = index + 1;
  const activity = account.tradeCount === 0
    ? "No current trade projection."
    : `${countNoun(account.tradeCount, "current derived trade")}`;
  return `<li class="account-overview-item" data-account-overview-account="${escapeHtml(account.accountId)}" data-account-overview-position="${position}">
    <div>
      <p class="card-label">ACCOUNT ${position} OF ${accountCount}</p>
      <h3>${escapeHtml(account.label)}</h3>
      <p>${activity}</p>
    </div>
    <button
      class="secondary-button"
      type="button"
      data-account-overview-route="${escapeHtml(account.accountId)}"
      data-account-overview-position="${position}"
      aria-label="Open ${escapeHtml(account.label)} in Trades, account ${position} of ${accountCount}"
    >Open in Trades</button>
  </li>`;
}

export function accountOverviewSection(
  snapshot: JournalWorkspaceSnapshot,
): string {
  const overview = buildAccountOverview(snapshot);
  if (overview.accountCount === 0) return "";
  const hasTradeEvidence = overview.accountsWithActivity > 0;
  const heading = hasTradeEvidence
    ? "Trace one review to its account evidence"
    : "Inspect retained accounts before a review exists";
  const modeCopy = overview.provenance === "demo"
    ? "Fictional and read-only. Follow how an account leads to exact trade evidence and an inspectable review; nothing is saved to your private journal."
    : hasTradeEvidence
      ? "Current journal guidance. Choose one account, inspect its current trade evidence, then open a review from those exact records. This path is derived from the journal in front of you and never marks activation complete."
      : "Current journal guidance. These retained accounts have no current trade projection, so Hermes can open their empty exact scope but cannot offer a review yet.";
  return `<section class="card account-overview" data-account-overview aria-labelledby="account-overview-title">
    <div class="section-title">
      <div>
        <p class="card-label">GUIDED START · READ ONLY</p>
        <h2 id="account-overview-title" tabindex="-1">${heading}</h2>
      </div>
      <span>${countNoun(overview.accountCount, "account")}</span>
    </div>
    <p class="account-overview-copy">${modeCopy}</p>
    <ol class="account-overview-steps" aria-label="Account review path">
      <li>Choose an account</li>
      <li>Inspect all activity</li>
      <li>${hasTradeEvidence ? "Open one trade review" : "Add trade evidence before reviewing"}</li>
    </ol>
    <div class="account-overview-summary">${overview.accountsWithActivity} with trade evidence</div>
    <ul class="account-overview-list">
      ${overview.accounts.map((account, index) => (
        accountItem(account, index, overview.accountCount)
      )).join("")}
    </ul>
    <p class="helper-text">Opening an account resets temporary dates, day, search, and card filters so Trades matches this overview. Dashboard totals and governed Reports stay whole-workspace.</p>
    <p class="form-error account-overview-status" id="account-overview-status" role="status" tabindex="-1" hidden></p>
  </section>`;
}

function showUnavailable(
  root: HTMLElement,
  announceFailure: (message: string) => void,
): void {
  const status = root.querySelector<HTMLElement>("#account-overview-status");
  if (status !== null) {
    status.hidden = false;
    status.textContent = UNAVAILABLE_MESSAGE;
    status.scrollIntoView({ behavior: "auto", block: "center" });
    status.focus({ preventScroll: true });
    return;
  }
  announceFailure(UNAVAILABLE_MESSAGE);
}

export function bindAccountOverview(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
  actions: AccountOverviewActions,
): void {
  const overview = buildAccountOverview(snapshot);
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(
    "button[data-account-overview-route]",
  ));
  const cards = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-account-overview-account]",
  ));
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const accountId = button.dataset.accountOverviewRoute;
      const rawPosition = button.dataset.accountOverviewPosition;
      const position = rawPosition === undefined ? Number.NaN : Number(rawPosition);
      const expected = Number.isSafeInteger(position) && position > 0
        ? overview.accounts[position - 1]
        : undefined;
      const matchingButtons = buttons.filter((candidate) => (
        candidate.dataset.accountOverviewRoute === accountId
        && candidate.dataset.accountOverviewPosition === rawPosition
      ));
      const matchingCards = cards.filter((candidate) => (
        candidate.dataset.accountOverviewAccount === accountId
        && candidate.dataset.accountOverviewPosition === rawPosition
      ));
      const card = matchingCards[0];
      const expectedAriaLabel = expected === undefined
        ? null
        : `Open ${expected.label} in Trades, account ${position} of ${overview.accountCount}`;
      if (
        !button.isConnected
        || accountId === undefined
        || expected === undefined
        || expected.accountId !== accountId
        || buttons.length !== overview.accountCount
        || cards.length !== overview.accountCount
        || matchingButtons.length !== 1
        || matchingButtons[0] !== button
        || matchingCards.length !== 1
        || card === undefined
        || !card.contains(button)
        || card.querySelectorAll("button[data-account-overview-route]").length !== 1
        || button.getAttribute("aria-label") !== expectedAriaLabel
      ) {
        showUnavailable(root, actions.announceFailure);
        return;
      }
      try {
        actions.openAccount(accountId);
      } catch {
        showUnavailable(root, actions.announceFailure);
      }
    });
  });
}
