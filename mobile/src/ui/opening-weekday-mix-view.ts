import {
  OPENING_WEEKDAY_MIX_REPORT_VERSION,
  OPENING_WEEKDAY_ORDER,
  buildOpeningWeekdayMixReport,
  type OpeningWeekday,
  type OpeningWeekdayMixGroup,
} from "../core/opening-weekday-mix-report";
import { escapeHtml } from "../core/html";
import type {
  JournalWorkspaceSnapshot,
  TradeSide,
} from "../core/types";
import { reportTradeAction } from "./trade-review-sheet";

export const OPENING_WEEKDAY_MIX_EVIDENCE_PAGE_SIZE = 25 as const;

type OpeningWeekdayMixTradeEvidence =
  OpeningWeekdayMixGroup["evidence"][number];

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

function weekdayLabel(weekday: OpeningWeekday): string {
  switch (weekday) {
    case "monday": return "Monday";
    case "tuesday": return "Tuesday";
    case "wednesday": return "Wednesday";
    case "thursday": return "Thursday";
    case "friday": return "Friday";
    case "saturday": return "Saturday";
    case "sunday": return "Sunday";
  }
}

function sideLabel(side: TradeSide): "Long" | "Short" {
  if (side === "long") return "Long";
  if (side === "short") return "Short";
  throw new Error("Opening-weekday evidence has an unsupported direction.");
}

function positionStateLabel(
  status: OpeningWeekdayMixTradeEvidence["status"],
): "Open" | "Closed" {
  if (status === "open") return "Open";
  if (status === "closed") return "Closed";
  throw new Error(
    "Opening-weekday evidence has an unsupported position status.",
  );
}

function validatedGroups(
  groups: readonly OpeningWeekdayMixGroup[],
): readonly OpeningWeekdayMixGroup[] {
  if (
    groups.length !== OPENING_WEEKDAY_ORDER.length
    || groups.some((group, index) => (
      group.weekday !== OPENING_WEEKDAY_ORDER[index]
    ))
  ) {
    throw new Error(
      "Opening-weekday groups must be the fixed Monday-through-Sunday sequence.",
    );
  }
  return groups;
}

function validatedEvidence(
  group: OpeningWeekdayMixGroup,
): readonly OpeningWeekdayMixTradeEvidence[] {
  if (
    group.tradeCount !== group.evidence.length
    || group.tradeSubjectIds.length !== group.evidence.length
    || group.evidence.some((evidence, index) => (
      evidence.tradeSubjectId !== group.tradeSubjectIds[index]
      || evidence.openingWeekday !== group.weekday
    ))
  ) {
    throw new Error("Opening-weekday contributor evidence is inconsistent.");
  }
  return group.evidence;
}

function evidenceTemplate(
  evidence: OpeningWeekdayMixTradeEvidence,
  snapshot: JournalWorkspaceSnapshot,
): string {
  const weekday = weekdayLabel(evidence.openingWeekday);
  return `<article class="plan-check-evidence opening-weekday-mix-evidence" data-opening-weekday-mix-trade="${escapeHtml(evidence.tradeSubjectId)}">
    <div class="plan-check-evidence-heading">
      <div><strong>${escapeHtml(evidence.symbol)}</strong><span>${escapeHtml(evidence.sessionLabel)} · ${escapeHtml(evidence.accountLabel)}</span></div>
      <strong><time datetime="${escapeHtml(evidence.tradedOn)}">${escapeHtml(evidence.tradedOn)}</time></strong>
    </div>
    <p>${weekday} opening · ${sideLabel(evidence.side)} · Position state <strong>${positionStateLabel(evidence.status)}</strong></p>
    ${reportTradeAction(
      snapshot,
      evidence.tradeSubjectId,
      "opening-weekday-mix",
      `the ${weekday} opening group`,
    )}
  </article>`;
}

function evidenceShowingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} trades`;
}

function showMoreEvidenceText(shown: number, total: number): string {
  return `Show ${Math.min(
    OPENING_WEEKDAY_MIX_EVIDENCE_PAGE_SIZE,
    total - shown,
  )} more`;
}

function groupTemplate(
  group: OpeningWeekdayMixGroup,
  snapshot: JournalWorkspaceSnapshot,
  groupIndex: number,
): string {
  const contributors = validatedEvidence(group);
  const initialCount = Math.min(
    OPENING_WEEKDAY_MIX_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const evidence = contributors.slice(0, initialCount)
    .map((trade) => evidenceTemplate(trade, snapshot))
    .join("");
  const weekday = weekdayLabel(group.weekday);
  return `<details class="plan-check-group opening-weekday-mix-group" data-opening-weekday-mix-group="${group.weekday}" data-opening-weekday-mix-group-index="${groupIndex}">
    <summary>
      <span class="plan-check-summary-label"><strong>${weekday}</strong><span>${countNoun(group.tradeCount, "current trade")}</span></span>
      <span class="plan-check-summary-value">Opening weekday</span>
    </summary>
    <div class="plan-check-group-body">
      <div class="plan-check-evidence-list opening-weekday-mix-evidence-list" id="opening-weekday-mix-evidence-${groupIndex}" data-opening-weekday-mix-evidence-list="${groupIndex}">
        ${evidence || `<p>No current trades opened on ${weekday}.</p>`}
      </div>
      <p class="plan-check-showing" data-opening-weekday-mix-showing="${groupIndex}" role="status" aria-live="polite" tabindex="-1">${evidenceShowingText(initialCount, contributors.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-opening-weekday-mix-more="${groupIndex}" aria-controls="opening-weekday-mix-evidence-${groupIndex}"${initialCount >= contributors.length ? " hidden" : ""}>${initialCount >= contributors.length ? "All trades shown" : showMoreEvidenceText(initialCount, contributors.length)}</button>
    </div>
  </details>`;
}

export function openingWeekdayMixSection(
  snapshot: JournalWorkspaceSnapshot,
): string {
  const report = buildOpeningWeekdayMixReport(snapshot);
  if (report.metadata.version !== OPENING_WEEKDAY_MIX_REPORT_VERSION) {
    throw new Error(
      "The opening-weekday-mix report definition is unsupported.",
    );
  }
  const groups = validatedGroups(report.groups)
    .map((group, index) => groupTemplate(group, snapshot, index))
    .join("");
  return `<section class="card plan-check-card opening-weekday-mix-card" aria-labelledby="opening-weekday-mix-title" data-opening-weekday-mix>
    <div class="section-title"><div><p class="card-label">OPENING DAY, WITH EVIDENCE</p><h2 id="opening-weekday-mix-title" class="report-target" tabindex="-1">Opening weekday mix</h2></div><div class="report-section-actions"><span>${modeLabel(snapshot)}</span><a class="report-menu-link" href="#reports-navigation-title" data-report-target="reports-navigation-title">Back to report menu</a></div></div>
    <p>Every current trade appears once according to its workspace-local opening weekday. Counts describe existing journal composition; they are not goals or performance comparisons.</p>
    <dl class="plan-check-meta opening-weekday-mix-meta">
      <div><dt>Definition</dt><dd>${escapeHtml(report.metadata.version)}</dd></div>
      <div><dt>Definition checksum</dt><dd>${escapeHtml(report.metadata.definitionSha256)}</dd></div>
      <div><dt>Period</dt><dd>${escapeHtml(report.metadata.periodLabel)}</dd></div>
      <div><dt>Time zone</dt><dd>${escapeHtml(report.metadata.timeZone)}</dd></div>
      <div><dt>Account scope</dt><dd>${escapeHtml(report.metadata.accountLabel)}</dd></div>
      <div><dt>Cohort</dt><dd>Current full-workspace projection</dd></div>
      <div><dt>Included</dt><dd>${countNoun(report.metadata.totalTradeCount, "current trade")}</dd></div>
    </dl>
    <div class="plan-check-groups opening-weekday-mix-groups" id="opening-weekday-mix-groups" data-opening-weekday-mix-groups>${groups}</div>
    <details class="plan-check-disclosure opening-weekday-mix-disclosure">
      <summary>How this report works</summary>
      <p>The opening date is the first-entry date already derived from the immutable ledger in the workspace time zone. Later allocation, exit, and review dates do not move a trade between weekday groups.</p>
      <p>Every current trade is counted once in fixed Monday-through-Sunday order. Reviews, results, currency, and Trades filters are not grouping inputs.</p>
      <p>Evidence within each weekday uses opening date descending, then trade subject ID ascending, and is revealed in bounded pages. Counts describe recorded history only; Hermes does not reward trade count or suggest that any weekday is better.</p>
    </details>
  </section>`;
}

function bindEvidenceGroup(
  section: HTMLElement,
  group: OpeningWeekdayMixGroup,
  groupIndex: number,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const contributors = validatedEvidence(group);
  let shown = Math.min(
    OPENING_WEEKDAY_MIX_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const list = section.querySelector<HTMLElement>(
    `[data-opening-weekday-mix-evidence-list="${groupIndex}"]`,
  );
  const status = section.querySelector<HTMLElement>(
    `[data-opening-weekday-mix-showing="${groupIndex}"]`,
  );
  const button = section.querySelector<HTMLButtonElement>(
    `[data-opening-weekday-mix-more="${groupIndex}"]`,
  );
  if (list === null || status === null || button === null) {
    throw new Error(
      `Opening-weekday evidence controls are incomplete for group ${groupIndex}.`,
    );
  }
  if (shown >= contributors.length) return;

  button.addEventListener("click", () => {
    const next = Math.min(
      shown + OPENING_WEEKDAY_MIX_EVIDENCE_PAGE_SIZE,
      contributors.length,
    );
    list.insertAdjacentHTML(
      "beforeend",
      contributors.slice(shown, next)
        .map((evidence) => evidenceTemplate(evidence, snapshot))
        .join(""),
    );
    shown = next;
    status.textContent = evidenceShowingText(shown, contributors.length);
    if (shown >= contributors.length) {
      button.hidden = true;
      status.focus({ preventScroll: true });
    } else {
      button.textContent = showMoreEvidenceText(shown, contributors.length);
    }
  });
}

export function bindOpeningWeekdayMixView(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const section = root.querySelector<HTMLElement>(
    "[data-opening-weekday-mix]",
  );
  if (section === null) return;
  const groups = validatedGroups(buildOpeningWeekdayMixReport(snapshot).groups);
  groups.forEach((group, index) => {
    bindEvidenceGroup(section, group, index, snapshot);
  });
}
