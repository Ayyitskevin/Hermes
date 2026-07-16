import {
  REVIEW_SESSION_COVERAGE_GROUP_ORDER,
  REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_SHA256,
  REVIEW_SESSION_COVERAGE_REPORT_VERSION,
  buildReviewSessionCoverageReport,
  type ReviewSessionCoverageEvidence,
  type ReviewSessionCoverageGroup,
  type ReviewSessionCoverageGroupKey,
  type ReviewSessionCoverageReport,
} from "../core/review-session-coverage-report";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot } from "../core/types";
import { reportTradeAction } from "./trade-review-sheet";

export const REVIEW_SESSION_COVERAGE_EVIDENCE_PAGE_SIZE = 25 as const;

const GROUP_PRESENTATION = Object.freeze({
  current_streak: Object.freeze({
    label: "Current review streak",
    value: "Maximal suffix",
    empty: "No recorded trading sessions are in the current review streak.",
    actionContext: "the current review streak",
  }),
  reviewed_before_streak: Object.freeze({
    label: "Reviewed before current streak",
    value: "Earlier coverage",
    empty: "No reviewed sessions appear before the current streak.",
    actionContext: "reviewed before the current streak",
  }),
  unreviewed: Object.freeze({
    label: "Unreviewed sessions",
    value: "No saved coverage",
    empty: "No recorded trading sessions are currently unreviewed.",
    actionContext: "the unreviewed session group",
  }),
}) satisfies Readonly<Record<ReviewSessionCoverageGroupKey, Readonly<{
  label: string;
  value: string;
  empty: string;
  actionContext: string;
}>>>;

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

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined
      && (codePoint < 32 || (codePoint >= 127 && codePoint <= 159));
  });
}

function isStableIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.trim() === value
    && [...value].length <= 256
    && !hasControlCharacter(value);
}

function canonicalDate(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !/^(?:19[7-9][0-9]|[2-9][0-9]{3})-[0-9]{2}-[0-9]{2}$/.test(value)
  ) {
    throw new Error(`${label} must be canonical YYYY-MM-DD from 1970 through 9999.`);
  }
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a real Gregorian date.`);
  }
  return value;
}

function displayText(value: unknown, label: string): string {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  return value;
}

function safeCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
}

function evidenceCompare(
  left: ReviewSessionCoverageEvidence,
  right: ReviewSessionCoverageEvidence,
): number {
  return stableCompare(right.isoDate, left.isoDate)
    || stableCompare(left.tradeSubjectId, right.tradeSubjectId);
}

function validateEvidenceFields(evidence: ReviewSessionCoverageEvidence): void {
  if (!isStableIdentifier(evidence.tradeSubjectId)) {
    throw new Error("Review-session coverage has an invalid trade subject identity.");
  }
  displayText(evidence.dayLabel, "Review-session day label");
  displayText(evidence.dateLabel, "Review-session date label");
  displayText(evidence.symbol, "Review-session symbol");
  displayText(evidence.accountLabel, "Review-session account label");
  displayText(evidence.sessionLabel, "Review-session trade label");
  if (evidence.assetClass !== "stock" && evidence.assetClass !== "etf") {
    throw new Error("Review-session coverage has an unsupported asset class.");
  }
  if (
    evidence.reviewStatus !== "pending"
    && evidence.reviewStatus !== "draft"
    && evidence.reviewStatus !== "completed"
  ) {
    throw new Error("Review-session coverage has an unsupported review state.");
  }
  if (
    evidence.coverageStatus !== "none"
    && evidence.coverageStatus !== "draft"
    && evidence.coverageStatus !== "completed"
  ) {
    throw new Error("Review-session coverage has an unsupported coverage state.");
  }
  if (
    evidence.coverageStatus !== "none"
    && evidence.coverageStatus !== evidence.reviewStatus
  ) {
    throw new Error("Review-session coverage conflicts with the current review state.");
  }
}

function validatedReport(
  report: ReviewSessionCoverageReport,
): ReviewSessionCoverageReport {
  if (
    report.metadata.version !== REVIEW_SESSION_COVERAGE_REPORT_VERSION
    || report.metadata.definitionSha256
      !== REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_SHA256
  ) {
    throw new Error("The review-session-coverage report definition is unsupported.");
  }
  displayText(report.metadata.periodLabel, "Review-session period");
  displayText(report.metadata.timeZone, "Review-session time zone");
  displayText(report.metadata.accountLabel, "Review-session account scope");
  const totalSessions = safeCount(
    report.metadata.totalSessionCount,
    "Review-session total sessions",
  );
  const reviewedSessions = safeCount(
    report.metadata.reviewedSessionCount,
    "Review-session reviewed sessions",
  );
  const unreviewedSessions = safeCount(
    report.metadata.unreviewedSessionCount,
    "Review-session unreviewed sessions",
  );
  const currentStreakSessions = safeCount(
    report.metadata.currentStreakSessionCount,
    "Review-session current streak",
  );
  const totalAssignments = safeCount(
    report.metadata.totalAssignmentCount,
    "Review-session total assignments",
  );
  if (
    !Array.isArray(report.groups)
    || report.groups.length !== REVIEW_SESSION_COVERAGE_GROUP_ORDER.length
    || report.groups.some((group, index) => (
      group.classification !== REVIEW_SESSION_COVERAGE_GROUP_ORDER[index]
    ))
  ) {
    throw new Error(
      "Review-session coverage groups must use the fixed current-streak, reviewed-before-streak, then unreviewed order.",
    );
  }

  const allSessionDates = new Set<string>();
  const allAssignments = new Set<string>();
  let groupedSessions = 0;
  let groupedAssignments = 0;
  for (const group of report.groups) {
    const sessionCount = safeCount(
      group.sessionCount,
      `Review-session ${group.classification} sessions`,
    );
    const assignmentCount = safeCount(
      group.assignmentCount,
      `Review-session ${group.classification} assignments`,
    );
    if (
      !Array.isArray(group.sessionDates)
      || group.sessionDates.length !== sessionCount
      || !Array.isArray(group.evidence)
      || group.evidence.length !== assignmentCount
    ) {
      throw new Error("Review-session group counts do not match their evidence.");
    }
    const groupDates = new Set<string>();
    let previousSessionDate: string | null = null;
    for (const rawDate of group.sessionDates) {
      const date = canonicalDate(rawDate, "Review-session group date");
      if (
        groupDates.has(date)
        || allSessionDates.has(date)
        || (previousSessionDate !== null
          && stableCompare(previousSessionDate, date) <= 0)
      ) {
        throw new Error(
          "Review-session group dates must be unique, disjoint, and descending.",
        );
      }
      groupDates.add(date);
      allSessionDates.add(date);
      previousSessionDate = date;
    }

    const assignmentsByDate = new Map<string, number>();
    const coveredDates = new Set<string>();
    let previousEvidence: ReviewSessionCoverageEvidence | null = null;
    for (const evidence of group.evidence) {
      validateEvidenceFields(evidence);
      const isoDate = canonicalDate(evidence.isoDate, "Review-session evidence date");
      if (!groupDates.has(isoDate)) {
        throw new Error("Review-session evidence is assigned to the wrong group date.");
      }
      const assignmentIdentity = `${isoDate}\u0000${evidence.tradeSubjectId}`;
      if (allAssignments.has(assignmentIdentity)) {
        throw new Error("Review-session evidence repeats a session-trade assignment.");
      }
      if (previousEvidence !== null && evidenceCompare(previousEvidence, evidence) > 0) {
        throw new Error("Review-session evidence order is inconsistent.");
      }
      if (
        group.classification === "unreviewed"
        && evidence.coverageStatus !== "none"
      ) {
        throw new Error("An unreviewed session cannot contain saved review coverage.");
      }
      if (evidence.coverageStatus !== "none") coveredDates.add(isoDate);
      assignmentsByDate.set(isoDate, (assignmentsByDate.get(isoDate) ?? 0) + 1);
      allAssignments.add(assignmentIdentity);
      previousEvidence = evidence;
    }
    for (const date of groupDates) {
      if ((assignmentsByDate.get(date) ?? 0) === 0) {
        throw new Error("Every review-session date requires contributor evidence.");
      }
      if (
        group.classification !== "unreviewed"
        && !coveredDates.has(date)
      ) {
        throw new Error("Every reviewed session requires saved review coverage.");
      }
    }
    groupedSessions += sessionCount;
    groupedAssignments += assignmentCount;
  }

  const current = report.groups[0];
  const before = report.groups[1];
  const unreviewed = report.groups[2];
  if (
    current === undefined
    || before === undefined
    || unreviewed === undefined
    || groupedSessions !== totalSessions
    || groupedAssignments !== totalAssignments
    || reviewedSessions + unreviewedSessions !== totalSessions
    || current.sessionCount !== currentStreakSessions
    || current.sessionCount + before.sessionCount !== reviewedSessions
    || unreviewed.sessionCount !== unreviewedSessions
  ) {
    throw new Error(
      "Review-session coverage does not conserve sessions and assignments.",
    );
  }
  return report;
}

function reviewStateLabel(
  state: ReviewSessionCoverageEvidence["reviewStatus"],
): "Pending" | "Draft" | "Completed" {
  if (state === "pending") return "Pending";
  if (state === "draft") return "Draft";
  return "Completed";
}

function assetClassLabel(
  assetClass: ReviewSessionCoverageEvidence["assetClass"],
): "Stock" | "ETF" {
  return assetClass === "etf" ? "ETF" : "Stock";
}

function coverageCopy(
  evidence: ReviewSessionCoverageEvidence,
  classification: ReviewSessionCoverageGroupKey,
): string {
  if (evidence.coverageStatus === "draft") {
    return "This trade's saved draft review covers this recorded trading session.";
  }
  if (evidence.coverageStatus === "completed") {
    return "This trade's saved completed review covers this recorded trading session.";
  }
  if (classification === "unreviewed") {
    return "No contributor has a saved draft or completed review covering this recorded trading session.";
  }
  return `Another contributor supplies saved review coverage for this session; this trade's current ${reviewStateLabel(evidence.reviewStatus).toLocaleLowerCase("en-US")} review does not cover this date.`;
}

function evidenceTemplate(
  evidence: ReviewSessionCoverageEvidence,
  classification: ReviewSessionCoverageGroupKey,
  snapshot: JournalWorkspaceSnapshot,
): string {
  const presentation = GROUP_PRESENTATION[classification];
  return `<article class="plan-check-evidence review-session-coverage-evidence" data-review-session-coverage-trade="${escapeHtml(evidence.tradeSubjectId)}">
    <div class="plan-check-evidence-heading">
      <div><strong>${escapeHtml(evidence.symbol)}</strong><span>${assetClassLabel(evidence.assetClass)} · ${escapeHtml(evidence.accountLabel)}</span></div>
      <strong><time datetime="${escapeHtml(evidence.isoDate)}">${escapeHtml(evidence.dateLabel)}</time></strong>
    </div>
    <p>${escapeHtml(evidence.dayLabel)} recorded trading session · ${escapeHtml(evidence.sessionLabel)} · Current review state <strong>${reviewStateLabel(evidence.reviewStatus)}</strong></p>
    <p class="helper-text">${escapeHtml(coverageCopy(evidence, classification))}</p>
    ${reportTradeAction(
      snapshot,
      evidence.tradeSubjectId,
      "review-session-coverage",
      `${presentation.actionContext} on ${evidence.isoDate}`,
    )}
  </article>`;
}

function evidenceShowingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} session–trade assignments`;
}

function showMoreEvidenceText(shown: number, total: number): string {
  return `Show ${Math.min(
    REVIEW_SESSION_COVERAGE_EVIDENCE_PAGE_SIZE,
    total - shown,
  )} more`;
}

function groupTemplate(
  group: ReviewSessionCoverageGroup,
  snapshot: JournalWorkspaceSnapshot,
  groupIndex: number,
): string {
  const presentation = GROUP_PRESENTATION[group.classification];
  const initialCount = Math.min(
    REVIEW_SESSION_COVERAGE_EVIDENCE_PAGE_SIZE,
    group.evidence.length,
  );
  const evidence = group.evidence.slice(0, initialCount)
    .map((item) => evidenceTemplate(item, group.classification, snapshot))
    .join("");
  return `<details class="plan-check-group review-session-coverage-group" data-review-session-coverage-group="${group.classification}" data-review-session-coverage-group-index="${groupIndex}">
    <summary>
      <span class="plan-check-summary-label"><strong>${presentation.label}</strong><span>${countNoun(group.sessionCount, "session")} · ${countNoun(group.assignmentCount, "assignment")}</span></span>
      <span class="plan-check-summary-value">${presentation.value}</span>
    </summary>
    <div class="plan-check-group-body">
      <div class="plan-check-evidence-list review-session-coverage-evidence-list" id="review-session-coverage-evidence-${groupIndex}" data-review-session-coverage-evidence-list="${groupIndex}">
        ${evidence || `<p>${presentation.empty}</p>`}
      </div>
      <p class="plan-check-showing" data-review-session-coverage-showing="${groupIndex}" role="status" aria-live="polite" tabindex="-1">${evidenceShowingText(initialCount, group.evidence.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-review-session-coverage-more="${groupIndex}" aria-controls="review-session-coverage-evidence-${groupIndex}"${initialCount >= group.evidence.length ? " hidden" : ""}>${initialCount >= group.evidence.length ? "All assignments shown" : showMoreEvidenceText(initialCount, group.evidence.length)}</button>
    </div>
  </details>`;
}

export function reviewSessionCoverageSection(
  snapshot: JournalWorkspaceSnapshot,
): string {
  const report = validatedReport(buildReviewSessionCoverageReport(snapshot));
  const groups = report.groups
    .map((group, index) => groupTemplate(group, snapshot, index))
    .join("");
  return `<section class="card plan-check-card review-session-coverage-card" aria-labelledby="review-session-coverage-title" data-review-session-coverage>
    <div class="section-title"><div><p class="card-label">REVIEW HABIT, WITH EVIDENCE</p><h2 id="review-session-coverage-title" class="report-target" tabindex="-1">Review session coverage</h2></div><div class="report-section-actions"><span>${modeLabel(snapshot)}</span><a class="report-menu-link" href="#reports-navigation-title" data-report-target="reports-navigation-title">Back to report menu</a></div></div>
    <p>A recorded trading session is a workspace-local date with at least one durable trade contribution. A session is reviewed when at least one exact contributor has a current saved draft or completed review covering that date.</p>
    <dl class="plan-check-meta review-session-coverage-meta">
      <div><dt>Definition</dt><dd>${escapeHtml(report.metadata.version)}</dd></div>
      <div><dt>Definition checksum</dt><dd>${escapeHtml(report.metadata.definitionSha256)}</dd></div>
      <div><dt>Period</dt><dd>${escapeHtml(report.metadata.periodLabel)}</dd></div>
      <div><dt>Time zone</dt><dd>${escapeHtml(report.metadata.timeZone)}</dd></div>
      <div><dt>Account scope</dt><dd>${escapeHtml(report.metadata.accountLabel)}</dd></div>
      <div><dt>Total sessions</dt><dd>${countNoun(report.metadata.totalSessionCount, "trading session")}</dd></div>
      <div><dt>Reviewed sessions</dt><dd>${countNoun(report.metadata.reviewedSessionCount, "trading session")}</dd></div>
      <div><dt>Unreviewed sessions</dt><dd>${countNoun(report.metadata.unreviewedSessionCount, "trading session")}</dd></div>
      <div><dt>Current streak</dt><dd>${countNoun(report.metadata.currentStreakSessionCount, "trading session")}</dd></div>
      <div><dt>Session–trade assignments</dt><dd>${countNoun(report.metadata.totalAssignmentCount, "assignment")}</dd></div>
    </dl>
    <div class="plan-check-groups review-session-coverage-groups" id="review-session-coverage-groups" data-review-session-coverage-groups>${groups}</div>
    <details class="plan-check-disclosure review-session-coverage-disclosure">
      <summary>How this report works</summary>
      <p>The current streak is the maximal reviewed suffix ending at the latest recorded trading session. It follows trading sessions, not consecutive calendar days, so weekends and no-trade gaps do not break it.</p>
      <p>A saved draft or completed review can cover every recorded session date contributed by that exact trade at save time. One covered contributor makes the session reviewed; it does not mean every trade in that session has been reviewed.</p>
      <p>Every recorded session appears once in fixed current-streak, reviewed-before-streak, then unreviewed order. Every session–trade contribution appears once as evidence and is revealed in bounded pages.</p>
      <p>Counts describe saved review coverage only. Hermes does not score outcomes, set goals, or tell you what to trade.</p>
    </details>
  </section>`;
}

function bindEvidenceGroup(
  section: HTMLElement,
  group: ReviewSessionCoverageGroup,
  groupIndex: number,
  snapshot: JournalWorkspaceSnapshot,
): void {
  let shown = Math.min(
    REVIEW_SESSION_COVERAGE_EVIDENCE_PAGE_SIZE,
    group.evidence.length,
  );
  const list = section.querySelector<HTMLElement>(
    `[data-review-session-coverage-evidence-list="${groupIndex}"]`,
  );
  const status = section.querySelector<HTMLElement>(
    `[data-review-session-coverage-showing="${groupIndex}"]`,
  );
  const button = section.querySelector<HTMLButtonElement>(
    `[data-review-session-coverage-more="${groupIndex}"]`,
  );
  if (list === null || status === null || button === null) {
    throw new Error(
      `Review-session coverage controls are incomplete for group ${groupIndex}.`,
    );
  }
  if (shown >= group.evidence.length) return;

  button.addEventListener("click", () => {
    const next = Math.min(
      shown + REVIEW_SESSION_COVERAGE_EVIDENCE_PAGE_SIZE,
      group.evidence.length,
    );
    list.insertAdjacentHTML(
      "beforeend",
      group.evidence.slice(shown, next)
        .map((item) => evidenceTemplate(item, group.classification, snapshot))
        .join(""),
    );
    shown = next;
    status.textContent = evidenceShowingText(shown, group.evidence.length);
    if (shown >= group.evidence.length) {
      button.hidden = true;
      status.focus({ preventScroll: true });
    } else {
      button.textContent = showMoreEvidenceText(shown, group.evidence.length);
    }
  });
}

export function bindReviewSessionCoverageView(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const section = root.querySelector<HTMLElement>(
    "[data-review-session-coverage]",
  );
  if (section === null) return;
  const report = validatedReport(buildReviewSessionCoverageReport(snapshot));
  report.groups.forEach((group, index) => {
    bindEvidenceGroup(section, group, index, snapshot);
  });
}
