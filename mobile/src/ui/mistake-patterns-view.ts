import {
  MISTAKE_PATTERNS_REPORT_VERSION,
  buildMistakePatternsReport,
  type MistakePatternGroup,
  type MistakePatternsReport,
  type MistakePatternTradeEvidence,
} from "../core/mistake-patterns-report";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot } from "../core/types";
import { reportTradeAction } from "./trade-review-sheet";

export const MISTAKE_PATTERNS_EVIDENCE_PAGE_SIZE = 25 as const;
export const MISTAKE_PATTERNS_GROUP_PAGE_SIZE = 5 as const;

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function modeLabel(snapshot: JournalWorkspaceSnapshot): string {
  if (snapshot.provenance === "demo") return "FICTIONAL DEMO";
  if (snapshot.provenance === "empty") return "NEW";
  return "LOCAL";
}

function validatedEvidence(
  group: MistakePatternGroup,
): readonly MistakePatternTradeEvidence[] {
  if (
    group.assignmentCount !== group.evidence.length
    || group.tradeSubjectIds.length !== group.evidence.length
    || group.evidence.some((evidence, index) => (
      evidence.tradeSubjectId !== group.tradeSubjectIds[index]
      || evidence.mistake !== group.mistake
    ))
  ) {
    throw new Error("Mistake-pattern contributor evidence is inconsistent.");
  }
  return group.evidence;
}

function evidenceTemplate(
  evidence: MistakePatternTradeEvidence,
  snapshot: JournalWorkspaceSnapshot,
): string {
  return `<article class="plan-check-evidence mistake-patterns-evidence" data-mistake-patterns-trade="${escapeHtml(evidence.tradeSubjectId)}">
    <div class="plan-check-evidence-heading">
      <div><strong>${escapeHtml(evidence.symbol)}</strong><span>${escapeHtml(evidence.sessionLabel)} · ${escapeHtml(evidence.accountLabel)} · ${escapeHtml(evidence.side)}</span></div>
      <strong><time datetime="${escapeHtml(evidence.tradedOn)}">${escapeHtml(evidence.tradedOn)}</time></strong>
    </div>
    <p>Current completed review · saved mistake <strong>${escapeHtml(evidence.mistake)}</strong></p>
    ${reportTradeAction(
      snapshot,
      evidence.tradeSubjectId,
      "mistake-patterns",
      `saved mistake ${evidence.mistake}`,
    )}
  </article>`;
}

function evidenceShowingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} assigned trades`;
}

function showMoreEvidenceText(shown: number, total: number): string {
  return `Show ${Math.min(MISTAKE_PATTERNS_EVIDENCE_PAGE_SIZE, total - shown)} more`;
}

function groupShowingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} mistake groups`;
}

function showMoreGroupsText(shown: number, total: number): string {
  return `Show ${Math.min(MISTAKE_PATTERNS_GROUP_PAGE_SIZE, total - shown)} more mistake groups`;
}

function groupTemplate(
  group: MistakePatternGroup,
  snapshot: JournalWorkspaceSnapshot,
  groupIndex: number,
): string {
  const contributors = validatedEvidence(group);
  const initialCount = Math.min(
    MISTAKE_PATTERNS_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const evidence = contributors.slice(0, initialCount)
    .map((trade) => evidenceTemplate(trade, snapshot))
    .join("");
  return `<details class="plan-check-group mistake-patterns-group" data-mistake-patterns-group-index="${groupIndex}">
    <summary>
      <span class="plan-check-summary-label"><strong>${escapeHtml(group.mistake)}</strong><span>${countNoun(group.assignmentCount, "saved assignment")}</span></span>
      <span class="plan-check-summary-value">Current heads</span>
    </summary>
    <div class="plan-check-group-body">
      <div class="plan-check-evidence-list mistake-patterns-evidence-list" id="mistake-patterns-evidence-${groupIndex}" data-mistake-patterns-evidence-list="${groupIndex}">
        ${evidence || "<p>No current assignments are in this group.</p>"}
      </div>
      <p class="plan-check-showing" data-mistake-patterns-showing="${groupIndex}" role="status" aria-live="polite" tabindex="-1">${evidenceShowingText(initialCount, contributors.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-mistake-patterns-more="${groupIndex}" aria-controls="mistake-patterns-evidence-${groupIndex}"${initialCount >= contributors.length ? " hidden" : ""}>${initialCount >= contributors.length ? "All assigned trades shown" : showMoreEvidenceText(initialCount, contributors.length)}</button>
    </div>
  </details>`;
}

function exclusionText(report: MistakePatternsReport): string {
  const exclusions = report.metadata.exclusions;
  return [
    `${exclusions.incompleteReview} pending or draft`,
    `${exclusions.noMistakeAssigned} completed without a saved mistake`,
  ].join(" · ");
}

export function mistakePatternsSection(
  snapshot: JournalWorkspaceSnapshot,
): string {
  const report = buildMistakePatternsReport(snapshot);
  if (report.metadata.version !== MISTAKE_PATTERNS_REPORT_VERSION) {
    throw new Error("The mistake-patterns report definition is unsupported.");
  }
  const initialGroupCount = Math.min(
    MISTAKE_PATTERNS_GROUP_PAGE_SIZE,
    report.groups.length,
  );
  const groups = report.groups.length === 0
    ? "<p>No current completed reviews with a saved mistake label are available.</p>"
    : report.groups.slice(0, initialGroupCount)
      .map((group, index) => groupTemplate(group, snapshot, index))
      .join("");
  const groupPaging = report.groups.length === 0
    ? ""
    : `<p class="plan-check-showing" data-mistake-patterns-groups-showing role="status" aria-live="polite" tabindex="-1">${groupShowingText(initialGroupCount, report.groups.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-mistake-patterns-groups-more aria-controls="mistake-patterns-groups"${initialGroupCount >= report.groups.length ? " hidden" : ""}>${initialGroupCount >= report.groups.length ? "All mistake groups shown" : showMoreGroupsText(initialGroupCount, report.groups.length)}</button>`;
  return `<section class="card plan-check-card mistake-patterns-card" aria-labelledby="mistake-patterns-title" data-mistake-patterns>
    <div class="section-title"><div><p class="card-label">SELF-REVIEW, WITH EVIDENCE</p><h2 id="mistake-patterns-title" class="report-target" tabindex="-1">Mistake patterns</h2></div><div class="report-section-actions"><span>${modeLabel(snapshot)}</span><a class="report-menu-link" href="#reports-navigation-title" data-report-target="reports-navigation-title">Back to report menu</a></div></div>
    <p>These are exact mistake labels on current completed reviews. Counts show how labels are assigned in your saved journal; they do not measure severity, rank behavior, explain outcomes, or provide advice.</p>
    <dl class="plan-check-meta mistake-patterns-meta">
      <div><dt>Definition</dt><dd>${escapeHtml(report.metadata.version)}</dd></div>
      <div><dt>Definition checksum</dt><dd>${escapeHtml(report.metadata.definitionSha256)}</dd></div>
      <div><dt>Period</dt><dd>${escapeHtml(report.metadata.periodLabel)}</dd></div>
      <div><dt>Time zone</dt><dd>${escapeHtml(report.metadata.timeZone)}</dd></div>
      <div><dt>Account scope</dt><dd>${escapeHtml(report.metadata.accountLabel)}</dd></div>
      <div><dt>Cohort</dt><dd>Current completed review heads</dd></div>
      <div><dt>Included</dt><dd>${report.metadata.includedTradeCount} unique trades of ${report.metadata.totalTradeCount} trades</dd></div>
      <div><dt>Assignments</dt><dd>${countNoun(report.metadata.totalAssignmentCount, "saved mistake assignment")}</dd></div>
      <div><dt>Exclusions</dt><dd>${escapeHtml(exclusionText(report))}</dd></div>
    </dl>
    <div class="plan-check-groups mistake-patterns-groups" id="mistake-patterns-groups" data-mistake-patterns-groups>${groups}</div>
    ${groupPaging}
    <details class="plan-check-disclosure mistake-patterns-disclosure">
      <summary>How this report works</summary>
      <p>Only each trade's current completed review head is eligible. Pending and draft reviews are excluded first; completed reviews without a saved mistake are excluded next. Older immutable review versions do not compete with the current head.</p>
      <p>Each included trade counts once in the unique included-trade total and once in every exact saved mistake group assigned to it. A trade can have multiple labels, so total assignments and summed group counts can exceed unique included trades.</p>
      <p>Groups use stable mistake-name code-unit order, never count or performance rank. Groups and evidence are progressively bounded. Evidence uses traded date descending, then trade subject ID ascending.</p>
      <p>These observations do not measure severity, establish cause, predict future results, or provide investment advice.</p>
    </details>
  </section>`;
}

function bindEvidenceGroup(
  section: HTMLElement,
  group: MistakePatternGroup,
  groupIndex: number,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const contributors = validatedEvidence(group);
  let shown = Math.min(
    MISTAKE_PATTERNS_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const list = section.querySelector<HTMLElement>(
    `[data-mistake-patterns-evidence-list="${groupIndex}"]`,
  );
  const status = section.querySelector<HTMLElement>(
    `[data-mistake-patterns-showing="${groupIndex}"]`,
  );
  const button = section.querySelector<HTMLButtonElement>(
    `[data-mistake-patterns-more="${groupIndex}"]`,
  );
  if (list === null || status === null || button === null) {
    throw new Error(`Mistake-pattern evidence controls are incomplete for group ${groupIndex}.`);
  }
  if (shown >= contributors.length) return;

  button.addEventListener("click", () => {
    const next = Math.min(
      shown + MISTAKE_PATTERNS_EVIDENCE_PAGE_SIZE,
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

export function bindMistakePatternsView(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const section = root.querySelector<HTMLElement>("[data-mistake-patterns]");
  if (section === null) return;
  const report = buildMistakePatternsReport(snapshot);
  if (report.groups.length === 0) return;

  let shown = Math.min(MISTAKE_PATTERNS_GROUP_PAGE_SIZE, report.groups.length);
  for (let index = 0; index < shown; index += 1) {
    const group = report.groups[index];
    if (group === undefined) throw new Error("A mistake-pattern group is missing.");
    bindEvidenceGroup(section, group, index, snapshot);
  }
  if (shown >= report.groups.length) return;

  const groups = section.querySelector<HTMLElement>("[data-mistake-patterns-groups]");
  const status = section.querySelector<HTMLElement>(
    "[data-mistake-patterns-groups-showing]",
  );
  const button = section.querySelector<HTMLButtonElement>(
    "[data-mistake-patterns-groups-more]",
  );
  if (groups === null || status === null || button === null) {
    throw new Error("The mistake-pattern group controls are incomplete.");
  }

  button.addEventListener("click", () => {
    const previous = shown;
    const next = Math.min(
      shown + MISTAKE_PATTERNS_GROUP_PAGE_SIZE,
      report.groups.length,
    );
    groups.insertAdjacentHTML(
      "beforeend",
      report.groups.slice(previous, next)
        .map((group, index) => groupTemplate(group, snapshot, previous + index))
        .join(""),
    );
    const firstRevealedSummary = groups.querySelector<HTMLElement>(
      `[data-mistake-patterns-group-index="${previous}"] > summary`,
    );
    if (firstRevealedSummary === null) {
      throw new Error("A revealed mistake-pattern group cannot receive focus.");
    }
    shown = next;
    for (let index = previous; index < shown; index += 1) {
      const group = report.groups[index];
      if (group === undefined) throw new Error("A mistake-pattern group is missing.");
      bindEvidenceGroup(section, group, index, snapshot);
    }
    status.textContent = groupShowingText(shown, report.groups.length);
    if (shown >= report.groups.length) {
      button.hidden = true;
    } else {
      button.textContent = showMoreGroupsText(shown, report.groups.length);
    }
    firstRevealedSummary.focus({ preventScroll: true });
  });
}
