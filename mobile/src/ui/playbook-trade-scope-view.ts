import {
  buildPlaybookLibrary,
  type PlaybookLibrary,
} from "../application/playbook-trade-scope";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot } from "../core/types";

export const PLAYBOOK_SCOPE_UNAVAILABLE_MESSAGE =
  "This playbook link is no longer available. No Trade Browser filters changed.";
export const PLAYBOOK_SCOPE_RECONCILIATION_MESSAGE =
  "Playbook links are unavailable because the current journal evidence did not reconcile. No Trade Browser filters changed.";

export interface PlaybookTradeScopeActions {
  readonly openPlaybook: (playbookName: string) => void;
  readonly announceFailure: (message: string) => void;
}


export type PlaybookTradeScopeProjection =
  | {
    readonly status: "ready";
    readonly library: PlaybookLibrary;
  }
  | {
    readonly status: "unavailable";
    readonly library: null;
  };

export function preparePlaybookTradeScope(
  snapshot: JournalWorkspaceSnapshot,
): PlaybookTradeScopeProjection {
  try {
    return Object.freeze({ status: "ready", library: buildPlaybookLibrary(snapshot) });
  } catch {
    return Object.freeze({ status: "unavailable", library: null });
  }
}
function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function signedR(value: number | null): string {
  if (value === null) return "—";
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}R`;
}

function resultClass(value: number | null): "positive" | "negative" | "" {
  if (value === null || value === 0) return "";
  return value > 0 ? "positive" : "negative";
}

function playbookCard(
  playbook: PlaybookLibrary["playbooks"][number],
  index: number,
  playbookCount: number,
): string {
  const position = index + 1;
  const label = `Open ${playbook.name} completed reviews in Trades, playbook ${position} of ${playbookCount}`;
  return `<article class="card playbook-card" data-playbook-trade-scope-card="${escapeHtml(playbook.name)}" data-playbook-trade-scope-position="${position}" data-playbook-trade-scope-count="${playbook.tradeCount}">
    <div><span class="status-chip">${countNoun(playbook.tradeCount, "trade")}</span><h3>${escapeHtml(playbook.name)}</h3></div>
    <strong class="${resultClass(playbook.netR)}">${escapeHtml(signedR(playbook.netR))}</strong>
    <p>${playbook.winRatePct.toFixed(0)}% win rate</p>
    <ul>${playbook.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ul>
    <div class="quick-actions">
      <button class="secondary-button" type="button" data-playbook-trade-scope-route="${escapeHtml(playbook.name)}" data-playbook-trade-scope-position="${position}" data-playbook-trade-scope-count="${playbook.tradeCount}" aria-label="${escapeHtml(label)}">Open completed reviews</button>
    </div>
  </article>`;
}

export function playbookTradeScopeSection(
  projection: PlaybookTradeScopeProjection,
): string {
  const library = projection.library;
  const cards = library === null
    ? `<article class="empty-state"><h3>Playbook links unavailable</h3><p>Hermes kept the rest of this journal available without opening an unverified Trade Browser cohort.</p></article>`
    : `${library.playbooks.map((playbook, index) => (
      playbookCard(playbook, index, library.playbooks.length)
    )).join("")}
      ${library.playbooks.length === 0 ? `<article class="empty-state"><h3>No playbooks yet</h3><p>Setup classification will turn imported trades into playbook analytics.</p></article>` : ""}`;
  return `<section data-playbook-trade-scope aria-labelledby="playbooks-title">
    <div class="section-title"><h2 id="playbooks-title">Playbooks</h2><span>Rules + results</span></div>
    <p class="helper-text">Open the exact completed reviews behind a playbook card. Temporary account, date, day, search, and other card filters are cleared so the card count and visible Trades agree.</p>
    <div class="journal-list">
      ${cards}
    </div>
    <p class="form-error playbook-trade-scope-status" id="playbook-trade-scope-status" role="status" tabindex="-1" ${projection.status === "ready" ? "hidden" : ""}>${projection.status === "unavailable" ? PLAYBOOK_SCOPE_RECONCILIATION_MESSAGE : ""}</p>
  </section>`;
}

function showUnavailable(
  root: HTMLElement,
  announceFailure: (message: string) => void,
): void {
  const status = root.querySelector<HTMLElement>("#playbook-trade-scope-status");
  if (status !== null) {
    status.hidden = false;
    status.textContent = PLAYBOOK_SCOPE_UNAVAILABLE_MESSAGE;
    status.scrollIntoView({ behavior: "auto", block: "center" });
    status.focus({ preventScroll: true });
    return;
  }
  announceFailure(PLAYBOOK_SCOPE_UNAVAILABLE_MESSAGE);
}

export function bindPlaybookTradeScope(
  root: HTMLElement,
  projection: PlaybookTradeScopeProjection,
  actions: PlaybookTradeScopeActions,
): void {
  if (projection.status === "unavailable") return;
  const { library } = projection;
  const sections = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-playbook-trade-scope]",
  ));
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>(
    "button[data-playbook-trade-scope-route]",
  ));
  const cards = Array.from(root.querySelectorAll<HTMLElement>(
    "[data-playbook-trade-scope-card]",
  ));
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const playbookName = button.dataset.playbookTradeScopeRoute;
      const rawPosition = button.dataset.playbookTradeScopePosition;
      const rawCount = button.dataset.playbookTradeScopeCount;
      const position = rawPosition === undefined ? Number.NaN : Number(rawPosition);
      const tradeCount = rawCount === undefined ? Number.NaN : Number(rawCount);
      const expected = Number.isSafeInteger(position) && position > 0
        ? library.playbooks[position - 1]
        : undefined;
      const matchingButtons = buttons.filter((candidate) => (
        candidate.dataset.playbookTradeScopeRoute === playbookName
        && candidate.dataset.playbookTradeScopePosition === rawPosition
        && candidate.dataset.playbookTradeScopeCount === rawCount
      ));
      const matchingCards = cards.filter((candidate) => (
        candidate.dataset.playbookTradeScopeCard === playbookName
        && candidate.dataset.playbookTradeScopePosition === rawPosition
        && candidate.dataset.playbookTradeScopeCount === rawCount
      ));
      const section = sections[0];
      const card = matchingCards[0];
      const expectedAriaLabel = expected === undefined
        ? null
        : `Open ${expected.name} completed reviews in Trades, playbook ${position} of ${library.playbooks.length}`;
      if (
        !button.isConnected
        || sections.length !== 1
        || section === undefined
        || !section.contains(button)
        || playbookName === undefined
        || expected === undefined
        || expected.name !== playbookName
        || expected.tradeCount !== tradeCount
        || buttons.length !== library.playbooks.length
        || cards.length !== library.playbooks.length
        || matchingButtons.length !== 1
        || matchingButtons[0] !== button
        || matchingCards.length !== 1
        || card === undefined
        || !card.contains(button)
        || card.querySelectorAll("button[data-playbook-trade-scope-route]").length !== 1
        || button.getAttribute("aria-label") !== expectedAriaLabel
      ) {
        showUnavailable(root, actions.announceFailure);
        return;
      }
      try {
        actions.openPlaybook(playbookName);
      } catch {
        showUnavailable(root, actions.announceFailure);
      }
    });
  });
}
