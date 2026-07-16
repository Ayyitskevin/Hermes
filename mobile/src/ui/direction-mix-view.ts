import {
  DIRECTION_MIX_REPORT_VERSION,
  buildDirectionMixReport,
  type DirectionMixGroup,
} from "../core/direction-mix-report";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot, TradeSide } from "../core/types";
import { reportTradeAction } from "./trade-review-sheet";

export const DIRECTION_MIX_EVIDENCE_PAGE_SIZE = 25 as const;

type DirectionMixTradeEvidence = DirectionMixGroup["evidence"][number];

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function modeLabel(snapshot: JournalWorkspaceSnapshot): string {
  if (snapshot.provenance === "demo") return "FICTIONAL DEMO";
  if (snapshot.provenance === "empty") return "NEW";
  return "LOCAL";
}

function sideLabel(side: TradeSide): "Long" | "Short" {
  return side === "long" ? "Long" : "Short";
}

function positionStateLabel(
  status: DirectionMixTradeEvidence["status"],
): "Open" | "Closed" {
  if (status === "open") return "Open";
  if (status === "closed") return "Closed";
  throw new Error("Direction-mix evidence has an unsupported position status.");
}

function reviewStateLabel(
  status: DirectionMixTradeEvidence["reviewStatus"],
): "Pending" | "Draft" | "Completed" {
  if (status === "pending") return "Pending";
  if (status === "draft") return "Draft";
  if (status === "completed") return "Completed";
  throw new Error("Direction-mix evidence has an unsupported review status.");
}

function validatedGroups(
  groups: readonly DirectionMixGroup[],
): readonly [DirectionMixGroup, DirectionMixGroup] {
  const long = groups[0];
  const short = groups[1];
  if (
    groups.length !== 2
    || long === undefined
    || short === undefined
    || long.direction !== "long"
    || short.direction !== "short"
  ) {
    throw new Error("Direction-mix groups must be the fixed long-then-short pair.");
  }
  return [long, short];
}

function validatedEvidence(
  group: DirectionMixGroup,
): readonly DirectionMixTradeEvidence[] {
  if (
    group.tradeCount !== group.evidence.length
    || group.tradeSubjectIds.length !== group.evidence.length
    || group.evidence.some((evidence, index) => (
      evidence.tradeSubjectId !== group.tradeSubjectIds[index]
      || evidence.side !== group.direction
    ))
  ) {
    throw new Error("Direction-mix contributor evidence is inconsistent.");
  }
  return group.evidence;
}

function evidenceTemplate(
  evidence: DirectionMixTradeEvidence,
  snapshot: JournalWorkspaceSnapshot,
): string {
  const direction = sideLabel(evidence.side);
  return `<article class="plan-check-evidence direction-mix-evidence" data-direction-mix-trade="${escapeHtml(evidence.tradeSubjectId)}">
    <div class="plan-check-evidence-heading">
      <div><strong>${escapeHtml(evidence.symbol)}</strong><span>${escapeHtml(evidence.sessionLabel)} · ${escapeHtml(evidence.accountLabel)}</span></div>
      <strong><time datetime="${escapeHtml(evidence.tradedOn)}">${escapeHtml(evidence.tradedOn)}</time></strong>
    </div>
    <p>${direction} · Position state <strong>${positionStateLabel(evidence.status)}</strong> · Review state <strong>${reviewStateLabel(evidence.reviewStatus)}</strong></p>
    ${reportTradeAction(
      snapshot,
      evidence.tradeSubjectId,
      "direction-mix",
      `the ${evidence.side} direction group`,
    )}
  </article>`;
}

function evidenceShowingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} trades`;
}

function showMoreEvidenceText(shown: number, total: number): string {
  return `Show ${Math.min(DIRECTION_MIX_EVIDENCE_PAGE_SIZE, total - shown)} more`;
}

function groupTemplate(
  group: DirectionMixGroup,
  snapshot: JournalWorkspaceSnapshot,
  groupIndex: number,
): string {
  const contributors = validatedEvidence(group);
  const initialCount = Math.min(
    DIRECTION_MIX_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const evidence = contributors.slice(0, initialCount)
    .map((trade) => evidenceTemplate(trade, snapshot))
    .join("");
  const direction = sideLabel(group.direction);
  return `<details class="plan-check-group direction-mix-group" data-direction-mix-group="${group.direction}" data-direction-mix-group-index="${groupIndex}">
    <summary>
      <span class="plan-check-summary-label"><strong>${direction}</strong><span>${countNoun(group.tradeCount, "current trade")}</span></span>
      <span class="plan-check-summary-value">Fixed direction</span>
    </summary>
    <div class="plan-check-group-body">
      <div class="plan-check-evidence-list direction-mix-evidence-list" id="direction-mix-evidence-${groupIndex}" data-direction-mix-evidence-list="${groupIndex}">
        ${evidence || `<p>No current trades are in the ${group.direction} direction group.</p>`}
      </div>
      <p class="plan-check-showing" data-direction-mix-showing="${groupIndex}" role="status" aria-live="polite" tabindex="-1">${evidenceShowingText(initialCount, contributors.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-direction-mix-more="${groupIndex}" aria-controls="direction-mix-evidence-${groupIndex}"${initialCount >= contributors.length ? " hidden" : ""}>${initialCount >= contributors.length ? "All trades shown" : showMoreEvidenceText(initialCount, contributors.length)}</button>
    </div>
  </details>`;
}

export function directionMixSection(
  snapshot: JournalWorkspaceSnapshot,
): string {
  const report = buildDirectionMixReport(snapshot);
  if (report.metadata.version !== DIRECTION_MIX_REPORT_VERSION) {
    throw new Error("The direction-mix report definition is unsupported.");
  }
  const groups = validatedGroups(report.groups)
    .map((group, index) => groupTemplate(group, snapshot, index))
    .join("");
  return `<section class="card plan-check-card direction-mix-card" aria-labelledby="direction-mix-title" data-direction-mix>
    <div class="section-title"><div><p class="card-label">DIRECTION, WITH EVIDENCE</p><h2 id="direction-mix-title" class="report-target" tabindex="-1">Direction mix</h2></div><div class="report-section-actions"><span>${modeLabel(snapshot)}</span><a class="report-menu-link" href="#reports-navigation-title" data-report-target="reports-navigation-title">Back to report menu</a></div></div>
    <p>Every current trade appears once in a fixed direction group. Counts describe the journal composition without evaluating one direction against the other.</p>
    <dl class="plan-check-meta direction-mix-meta">
      <div><dt>Definition</dt><dd>${escapeHtml(report.metadata.version)}</dd></div>
      <div><dt>Definition checksum</dt><dd>${escapeHtml(report.metadata.definitionSha256)}</dd></div>
      <div><dt>Period</dt><dd>${escapeHtml(report.metadata.periodLabel)}</dd></div>
      <div><dt>Time zone</dt><dd>${escapeHtml(report.metadata.timeZone)}</dd></div>
      <div><dt>Account scope</dt><dd>${escapeHtml(report.metadata.accountLabel)}</dd></div>
      <div><dt>Cohort</dt><dd>Current full-workspace projection</dd></div>
      <div><dt>Included</dt><dd>${countNoun(report.metadata.totalTradeCount, "current trade")}</dd></div>
    </dl>
    <div class="plan-check-groups direction-mix-groups" id="direction-mix-groups" data-direction-mix-groups>${groups}</div>
    <details class="plan-check-disclosure direction-mix-disclosure">
      <summary>How this report works</summary>
      <p>This report counts every current trade once, in fixed long-then-short order, regardless of open or closed position state and pending, draft, or completed review state.</p>
      <p>Grouping does not read results, review fields, or Trades filters. Evidence identifies each projected position and review state for drill-down; neither changes inclusion.</p>
      <p>Evidence within each group uses traded date descending, then trade subject ID ascending, and is revealed in bounded pages. Counts describe current journal composition only; they do not explain outcomes or suggest actions.</p>
    </details>
  </section>`;
}

function bindEvidenceGroup(
  section: HTMLElement,
  group: DirectionMixGroup,
  groupIndex: number,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const contributors = validatedEvidence(group);
  let shown = Math.min(
    DIRECTION_MIX_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const list = section.querySelector<HTMLElement>(
    `[data-direction-mix-evidence-list="${groupIndex}"]`,
  );
  const status = section.querySelector<HTMLElement>(
    `[data-direction-mix-showing="${groupIndex}"]`,
  );
  const button = section.querySelector<HTMLButtonElement>(
    `[data-direction-mix-more="${groupIndex}"]`,
  );
  if (list === null || status === null || button === null) {
    throw new Error(`Direction-mix evidence controls are incomplete for group ${groupIndex}.`);
  }
  if (shown >= contributors.length) return;

  button.addEventListener("click", () => {
    const next = Math.min(
      shown + DIRECTION_MIX_EVIDENCE_PAGE_SIZE,
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

export function bindDirectionMixView(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const section = root.querySelector<HTMLElement>("[data-direction-mix]");
  if (section === null) return;
  const groups = validatedGroups(buildDirectionMixReport(snapshot).groups);
  groups.forEach((group, index) => {
    bindEvidenceGroup(section, group, index, snapshot);
  });
}
