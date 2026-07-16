import { buildReviewQueue } from "../application/review-queue";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { reviewTradeAction } from "./trade-review-sheet";

const REVIEW_QUEUE_GROUP_LABEL = Object.freeze({
  draft: "Drafts",
  pending: "Not started",
} satisfies Readonly<Record<"draft" | "pending", string>>);

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function signedCurrency(value: number | null, currency: string): string {
  if (value === null) return "Open";
  if (!Number.isFinite(value)) {
    throw new Error("Review queue P&L is not finite enough to display.");
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    signDisplay: "always",
  }).format(value);
}

function queueTradeCard(
  trade: TradePreview,
  snapshot: JournalWorkspaceSnapshot,
): string {
  const action = trade.reviewStatus === "draft" ? "Continue draft" : "Review";
  const checkbox = snapshot.provenance === "demo"
    ? ""
    : `<label class="review-select"><input type="checkbox" data-batch-review-subject value="${escapeHtml(trade.tradeSubjectId)}" /><span class="sr-only">Select ${escapeHtml(trade.symbol)}, ${escapeHtml(trade.sessionLabel)}, for batch tagging</span></label>`;
  return `<article class="card review-queue-item" data-review-queue-trade="${escapeHtml(trade.tradeSubjectId)}">
    ${checkbox}
    <div><span class="status-chip review-${trade.reviewStatus}">${escapeHtml(trade.reviewStatus)}</span><h4>${escapeHtml(trade.symbol)}</h4><p>${escapeHtml(trade.sessionLabel)} · ${escapeHtml(signedCurrency(trade.resultPnl, snapshot.currencyCode))}</p></div>
    ${reviewTradeAction(trade, action)}
  </article>`;
}

function queueGroup(
  group: ReturnType<typeof buildReviewQueue>["groups"][number],
  snapshot: JournalWorkspaceSnapshot,
): string {
  if (group.tradeCount === 0) return "";
  const label = REVIEW_QUEUE_GROUP_LABEL[group.classification];
  const titleId = `review-queue-group-${group.classification}-title`;
  return `<section class="review-queue-group" aria-labelledby="${titleId}" data-review-queue-group="${group.classification}">
    <div class="section-title"><h3 id="${titleId}" tabindex="-1" data-review-queue-group-title="${group.classification}">${label}</h3><span>${countNoun(group.tradeCount, "trade")}</span></div>
    <div class="journal-list review-queue-list">${group.trades.map((trade) => queueTradeCard(trade, snapshot)).join("")}</div>
  </section>`;
}

function batchTagForm(snapshot: JournalWorkspaceSnapshot): string {
  return `<form class="card batch-review-form" id="batch-review-form" novalidate>
    <datalist id="batch-tag-options">${snapshot.reviewOptions.tags.map((tag) => `<option value="${escapeHtml(tag)}"></option>`).join("")}</datalist>
    <div><p class="card-label">ATOMIC BATCH ACTION</p><h3>Tag selected trades</h3><p>Select queue items below. Hermes saves every tag revision together or saves none.</p></div>
    <label>Tag<input id="batch-review-tag" type="text" maxlength="120" list="batch-tag-options" placeholder="e.g. Earnings day" required /></label>
    <p class="form-error" id="batch-review-error" role="alert" tabindex="-1" hidden></p>
    <button class="secondary-button" type="submit">Apply tag to selected</button>
  </form>`;
}

export function reviewQueueSection(snapshot: JournalWorkspaceSnapshot): string {
  const queue = buildReviewQueue(snapshot);
  const groups = queue.groups.map((group) => queueGroup(group, snapshot)).join("");
  const batch = snapshot.provenance === "local" && queue.waitingTradeCount > 0
    ? batchTagForm(snapshot)
    : "";
  const content = queue.waitingTradeCount === 0
    ? `<article class="empty-state"><h3 id="review-queue-clear-title" tabindex="-1" data-review-queue-clear-title>Review queue clear</h3><p>Every closed trade has a completed, versioned reflection.</p></article>`
    : `<div class="review-queue-groups">${groups}</div>`;
  return `<section aria-labelledby="review-queue-title" data-review-queue>
    <div class="section-title"><h2 id="review-queue-title" tabindex="-1">Trade review queue</h2><span>${queue.waitingTradeCount} waiting</span></div>
    ${batch}
    ${content}
  </section>`;
}

export function focusReviewQueueAfterRefresh(root: HTMLElement): void {
  const target = root.querySelector<HTMLElement>("[data-review-queue-group-title]")
    ?? root.querySelector<HTMLElement>("#review-queue-title");
  if (target === null) return;
  const topbarBottom = root.querySelector<HTMLElement>(".topbar")
    ?.getBoundingClientRect().bottom ?? 0;
  target.style.scrollMarginTop = `${Math.ceil(Math.max(0, topbarBottom) + 16)}px`;
  target.scrollIntoView({ behavior: "auto", block: "start" });
  target.focus({ preventScroll: true });
}
