import {
  TAG_PATTERNS_REPORT_VERSION,
  buildTagPatternsReport,
  type TagPatternGroup,
  type TagPatternsReport,
  type TagPatternTradeEvidence,
} from "../core/tag-patterns-report";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot } from "../core/types";
import { reportTradeAction } from "./trade-review-sheet";

export const TAG_PATTERNS_EVIDENCE_PAGE_SIZE = 25 as const;
export const TAG_PATTERNS_GROUP_PAGE_SIZE = 5 as const;

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function modeLabel(snapshot: JournalWorkspaceSnapshot): string {
  if (snapshot.provenance === "demo") return "FICTIONAL DEMO";
  if (snapshot.provenance === "empty") return "NEW";
  return "LOCAL";
}

function validatedEvidence(
  group: TagPatternGroup,
): readonly TagPatternTradeEvidence[] {
  if (
    group.assignmentCount !== group.evidence.length
    || group.tradeSubjectIds.length !== group.evidence.length
    || group.evidence.some((evidence, index) => (
      evidence.tradeSubjectId !== group.tradeSubjectIds[index]
      || evidence.tag !== group.tag
    ))
  ) {
    throw new Error("Tag-pattern contributor evidence is inconsistent.");
  }
  return group.evidence;
}

function evidenceTemplate(
  evidence: TagPatternTradeEvidence,
  snapshot: JournalWorkspaceSnapshot,
): string {
  return `<article class="plan-check-evidence tag-patterns-evidence" data-tag-patterns-trade="${escapeHtml(evidence.tradeSubjectId)}">
    <div class="plan-check-evidence-heading">
      <div><strong>${escapeHtml(evidence.symbol)}</strong><span>${escapeHtml(evidence.sessionLabel)} · ${escapeHtml(evidence.accountLabel)} · ${escapeHtml(evidence.side)}</span></div>
      <strong><time datetime="${escapeHtml(evidence.tradedOn)}">${escapeHtml(evidence.tradedOn)}</time></strong>
    </div>
    <p>Current completed review · saved tag <strong>${escapeHtml(evidence.tag)}</strong></p>
    ${reportTradeAction(
      snapshot,
      evidence.tradeSubjectId,
      "tag-patterns",
      `saved tag ${evidence.tag}`,
    )}
  </article>`;
}

function evidenceShowingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} assigned trades`;
}

function showMoreEvidenceText(shown: number, total: number): string {
  return `Show ${Math.min(TAG_PATTERNS_EVIDENCE_PAGE_SIZE, total - shown)} more`;
}

function groupShowingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} tag groups`;
}

function showMoreGroupsText(shown: number, total: number): string {
  return `Show ${Math.min(TAG_PATTERNS_GROUP_PAGE_SIZE, total - shown)} more tag groups`;
}

function groupTemplate(
  group: TagPatternGroup,
  snapshot: JournalWorkspaceSnapshot,
  groupIndex: number,
): string {
  const contributors = validatedEvidence(group);
  const initialCount = Math.min(
    TAG_PATTERNS_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const evidence = contributors.slice(0, initialCount)
    .map((trade) => evidenceTemplate(trade, snapshot))
    .join("");
  return `<details class="plan-check-group tag-patterns-group" data-tag-patterns-group-index="${groupIndex}">
    <summary>
      <span class="plan-check-summary-label"><strong>${escapeHtml(group.tag)}</strong><span>${countNoun(group.assignmentCount, "saved assignment")}</span></span>
      <span class="plan-check-summary-value">Current heads</span>
    </summary>
    <div class="plan-check-group-body">
      <div class="plan-check-evidence-list tag-patterns-evidence-list" id="tag-patterns-evidence-${groupIndex}" data-tag-patterns-evidence-list="${groupIndex}">
        ${evidence || "<p>No current assignments are in this group.</p>"}
      </div>
      <p class="plan-check-showing" data-tag-patterns-showing="${groupIndex}" role="status" aria-live="polite" tabindex="-1">${evidenceShowingText(initialCount, contributors.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-tag-patterns-more="${groupIndex}" aria-controls="tag-patterns-evidence-${groupIndex}"${initialCount >= contributors.length ? " hidden" : ""}>${initialCount >= contributors.length ? "All assigned trades shown" : showMoreEvidenceText(initialCount, contributors.length)}</button>
    </div>
  </details>`;
}

function exclusionText(report: TagPatternsReport): string {
  const exclusions = report.metadata.exclusions;
  return [
    `${exclusions.incompleteReview} pending or draft`,
    `${exclusions.noTagAssigned} completed without a saved tag`,
  ].join(" · ");
}

export function tagPatternsSection(
  snapshot: JournalWorkspaceSnapshot,
): string {
  const report = buildTagPatternsReport(snapshot);
  if (report.metadata.version !== TAG_PATTERNS_REPORT_VERSION) {
    throw new Error("The tag-patterns report definition is unsupported.");
  }
  const initialGroupCount = Math.min(
    TAG_PATTERNS_GROUP_PAGE_SIZE,
    report.groups.length,
  );
  const groups = report.groups.length === 0
    ? "<p>No current completed reviews with a saved tag are available.</p>"
    : report.groups.slice(0, initialGroupCount)
      .map((group, index) => groupTemplate(group, snapshot, index))
      .join("");
  const groupPaging = report.groups.length === 0
    ? ""
    : `<p class="plan-check-showing" data-tag-patterns-groups-showing role="status" aria-live="polite" tabindex="-1">${groupShowingText(initialGroupCount, report.groups.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-tag-patterns-groups-more aria-controls="tag-patterns-groups"${initialGroupCount >= report.groups.length ? " hidden" : ""}>${initialGroupCount >= report.groups.length ? "All tag groups shown" : showMoreGroupsText(initialGroupCount, report.groups.length)}</button>`;
  return `<section class="card plan-check-card tag-patterns-card" aria-labelledby="tag-patterns-title" data-tag-patterns>
    <div class="section-title"><div><p class="card-label">REVIEW TAGS, WITH EVIDENCE</p><h2 id="tag-patterns-title" class="report-target" tabindex="-1">Tag patterns</h2></div><div class="report-section-actions"><span>${modeLabel(snapshot)}</span><a class="report-menu-link" href="#reports-navigation-title" data-report-target="reports-navigation-title">Back to report menu</a></div></div>
    <p>These are exact tags on current completed trade reviews. Counts show how tags are assigned in your saved journal; they do not measure importance, rank behavior, explain outcomes, or provide advice.</p>
    <dl class="plan-check-meta tag-patterns-meta">
      <div><dt>Definition</dt><dd>${escapeHtml(report.metadata.version)}</dd></div>
      <div><dt>Definition checksum</dt><dd>${escapeHtml(report.metadata.definitionSha256)}</dd></div>
      <div><dt>Period</dt><dd>${escapeHtml(report.metadata.periodLabel)}</dd></div>
      <div><dt>Time zone</dt><dd>${escapeHtml(report.metadata.timeZone)}</dd></div>
      <div><dt>Account scope</dt><dd>${escapeHtml(report.metadata.accountLabel)}</dd></div>
      <div><dt>Cohort</dt><dd>Current completed review heads</dd></div>
      <div><dt>Included</dt><dd>${countNoun(report.metadata.includedTradeCount, "unique trade")} of ${countNoun(report.metadata.totalTradeCount, "trade")}</dd></div>
      <div><dt>Assignments</dt><dd>${countNoun(report.metadata.totalAssignmentCount, "saved tag assignment")}</dd></div>
      <div><dt>Exclusions</dt><dd>${escapeHtml(exclusionText(report))}</dd></div>
    </dl>
    <div class="plan-check-groups tag-patterns-groups" id="tag-patterns-groups" data-tag-patterns-groups>${groups}</div>
    ${groupPaging}
    <details class="plan-check-disclosure tag-patterns-disclosure">
      <summary>How this report works</summary>
      <p>Only each trade's current completed review head is eligible. Pending and draft reviews are excluded first; completed reviews without a saved tag are excluded next. Older immutable review versions do not compete with the current head.</p>
      <p>Each included trade counts once in the unique included-trade total and once in every exact saved tag group assigned to it. A trade can have multiple tags, so total assignments and summed group counts can exceed unique included trades.</p>
      <p>Groups use stable tag-name code-unit order, never count or performance rank. Groups and evidence are progressively bounded. Evidence uses traded date descending, then trade subject ID ascending.</p>
      <p>This report does not read tag vocabulary, Daily Journal tags, trade results, or Trades filters. These observations do not establish importance or cause, predict future results, or provide investment advice.</p>
    </details>
  </section>`;
}

function bindEvidenceGroup(
  section: HTMLElement,
  group: TagPatternGroup,
  groupIndex: number,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const contributors = validatedEvidence(group);
  let shown = Math.min(
    TAG_PATTERNS_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const list = section.querySelector<HTMLElement>(
    `[data-tag-patterns-evidence-list="${groupIndex}"]`,
  );
  const status = section.querySelector<HTMLElement>(
    `[data-tag-patterns-showing="${groupIndex}"]`,
  );
  const button = section.querySelector<HTMLButtonElement>(
    `[data-tag-patterns-more="${groupIndex}"]`,
  );
  if (list === null || status === null || button === null) {
    throw new Error(`Tag-pattern evidence controls are incomplete for group ${groupIndex}.`);
  }
  if (shown >= contributors.length) return;

  button.addEventListener("click", () => {
    const next = Math.min(
      shown + TAG_PATTERNS_EVIDENCE_PAGE_SIZE,
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

export function bindTagPatternsView(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const section = root.querySelector<HTMLElement>("[data-tag-patterns]");
  if (section === null) return;
  const report = buildTagPatternsReport(snapshot);
  if (report.groups.length === 0) return;

  let shown = Math.min(TAG_PATTERNS_GROUP_PAGE_SIZE, report.groups.length);
  for (let index = 0; index < shown; index += 1) {
    const group = report.groups[index];
    if (group === undefined) throw new Error("A tag-pattern group is missing.");
    bindEvidenceGroup(section, group, index, snapshot);
  }
  if (shown >= report.groups.length) return;

  const groups = section.querySelector<HTMLElement>("[data-tag-patterns-groups]");
  const status = section.querySelector<HTMLElement>(
    "[data-tag-patterns-groups-showing]",
  );
  const button = section.querySelector<HTMLButtonElement>(
    "[data-tag-patterns-groups-more]",
  );
  if (groups === null || status === null || button === null) {
    throw new Error("The tag-pattern group controls are incomplete.");
  }

  button.addEventListener("click", () => {
    const previous = shown;
    const next = Math.min(
      shown + TAG_PATTERNS_GROUP_PAGE_SIZE,
      report.groups.length,
    );
    groups.insertAdjacentHTML(
      "beforeend",
      report.groups.slice(previous, next)
        .map((group, index) => groupTemplate(group, snapshot, previous + index))
        .join(""),
    );
    const firstRevealedSummary = groups.querySelector<HTMLElement>(
      `[data-tag-patterns-group-index="${previous}"] > summary`,
    );
    if (firstRevealedSummary === null) {
      throw new Error("A revealed tag-pattern group cannot receive focus.");
    }
    shown = next;
    for (let index = previous; index < shown; index += 1) {
      const group = report.groups[index];
      if (group === undefined) throw new Error("A tag-pattern group is missing.");
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
