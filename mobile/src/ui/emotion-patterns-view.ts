import {
  EMOTION_PATTERNS_REPORT_VERSION,
  buildEmotionPatternsReport,
  type EmotionPatternGroup,
  type EmotionPatternsReport,
  type EmotionPatternTradeEvidence,
} from "../core/emotion-patterns-report";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot } from "../core/types";
import { reportTradeAction } from "./trade-review-sheet";

export const EMOTION_PATTERNS_EVIDENCE_PAGE_SIZE = 25 as const;
export const EMOTION_PATTERNS_GROUP_PAGE_SIZE = 5 as const;

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function modeLabel(snapshot: JournalWorkspaceSnapshot): string {
  if (snapshot.provenance === "demo") return "FICTIONAL DEMO";
  if (snapshot.provenance === "empty") return "NEW";
  return "LOCAL";
}

function validatedEvidence(
  group: EmotionPatternGroup,
): readonly EmotionPatternTradeEvidence[] {
  if (
    group.tradeCount !== group.evidence.length
    || group.tradeSubjectIds.length !== group.evidence.length
    || group.evidence.some((evidence, index) => (
      evidence.tradeSubjectId !== group.tradeSubjectIds[index]
      || evidence.emotion !== group.emotion
    ))
  ) {
    throw new Error("Emotion-pattern contributor evidence is inconsistent.");
  }
  return group.evidence;
}

function evidenceTemplate(
  evidence: EmotionPatternTradeEvidence,
  snapshot: JournalWorkspaceSnapshot,
): string {
  return `<article class="plan-check-evidence emotion-patterns-evidence" data-emotion-patterns-trade="${escapeHtml(evidence.tradeSubjectId)}">
    <div class="plan-check-evidence-heading">
      <div><strong>${escapeHtml(evidence.symbol)}</strong><span>${escapeHtml(evidence.sessionLabel)} · ${escapeHtml(evidence.accountLabel)} · ${escapeHtml(evidence.side)}</span></div>
      <strong><time datetime="${escapeHtml(evidence.tradedOn)}">${escapeHtml(evidence.tradedOn)}</time></strong>
    </div>
    <p>Current completed review · saved emotion <strong>${escapeHtml(evidence.emotion)}</strong></p>
    ${reportTradeAction(
      snapshot,
      evidence.tradeSubjectId,
      "emotion-patterns",
      `saved emotion ${evidence.emotion}`,
    )}
  </article>`;
}

function evidenceShowingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} trades`;
}

function showMoreEvidenceText(shown: number, total: number): string {
  return `Show ${Math.min(EMOTION_PATTERNS_EVIDENCE_PAGE_SIZE, total - shown)} more`;
}

function groupShowingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} emotion groups`;
}

function showMoreGroupsText(shown: number, total: number): string {
  return `Show ${Math.min(EMOTION_PATTERNS_GROUP_PAGE_SIZE, total - shown)} more emotion groups`;
}

function groupTemplate(
  group: EmotionPatternGroup,
  snapshot: JournalWorkspaceSnapshot,
  groupIndex: number,
): string {
  const contributors = validatedEvidence(group);
  const initialCount = Math.min(
    EMOTION_PATTERNS_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const evidence = contributors.slice(0, initialCount)
    .map((trade) => evidenceTemplate(trade, snapshot))
    .join("");
  return `<details class="plan-check-group emotion-patterns-group" data-emotion-patterns-group-index="${groupIndex}">
    <summary>
      <span class="plan-check-summary-label"><strong>${escapeHtml(group.emotion)}</strong><span>${countNoun(group.tradeCount, "current trade")}</span></span>
      <span class="plan-check-summary-value">Current heads</span>
    </summary>
    <div class="plan-check-group-body">
      <div class="plan-check-evidence-list emotion-patterns-evidence-list" id="emotion-patterns-evidence-${groupIndex}" data-emotion-patterns-evidence-list="${groupIndex}">
        ${evidence || "<p>No current trades are in this group.</p>"}
      </div>
      <p class="plan-check-showing" data-emotion-patterns-showing="${groupIndex}" role="status" aria-live="polite" tabindex="-1">${evidenceShowingText(initialCount, contributors.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-emotion-patterns-more="${groupIndex}" aria-controls="emotion-patterns-evidence-${groupIndex}"${initialCount >= contributors.length ? " hidden" : ""}>${initialCount >= contributors.length ? "All trades shown" : showMoreEvidenceText(initialCount, contributors.length)}</button>
    </div>
  </details>`;
}

function exclusionText(report: EmotionPatternsReport): string {
  const exclusions = report.metadata.exclusions;
  return [
    `${exclusions.incompleteReview} pending or draft`,
    `${exclusions.noEmotionAssigned} completed without a saved emotion`,
  ].join(" · ");
}

export function emotionPatternsSection(
  snapshot: JournalWorkspaceSnapshot,
): string {
  const report = buildEmotionPatternsReport(snapshot);
  if (report.metadata.version !== EMOTION_PATTERNS_REPORT_VERSION) {
    throw new Error("The emotion-patterns report definition is unsupported.");
  }
  const initialGroupCount = Math.min(
    EMOTION_PATTERNS_GROUP_PAGE_SIZE,
    report.groups.length,
  );
  const groups = report.groups.length === 0
    ? "<p>No current completed reviews with a saved emotion are available.</p>"
    : report.groups.slice(0, initialGroupCount)
      .map((group, index) => groupTemplate(group, snapshot, index))
      .join("");
  const groupPaging = report.groups.length === 0
    ? ""
    : `<p class="plan-check-showing" data-emotion-patterns-groups-showing role="status" aria-live="polite" tabindex="-1">${groupShowingText(initialGroupCount, report.groups.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-emotion-patterns-groups-more aria-controls="emotion-patterns-groups"${initialGroupCount >= report.groups.length ? " hidden" : ""}>${initialGroupCount >= report.groups.length ? "All emotion groups shown" : showMoreGroupsText(initialGroupCount, report.groups.length)}</button>`;
  return `<section class="card plan-check-card emotion-patterns-card" aria-labelledby="emotion-patterns-title" data-emotion-patterns>
    <div class="section-title"><div><p class="card-label">REFLECTION, WITH EVIDENCE</p><h2 id="emotion-patterns-title" class="report-target" tabindex="-1">Emotion patterns</h2></div><div class="report-section-actions"><span>${modeLabel(snapshot)}</span><a class="report-menu-link" href="#reports-navigation-title" data-report-target="reports-navigation-title">Back to report menu</a></div></div>
    <p>These are exact emotion labels on current completed reviews. Counts show where each saved emotion appears in your journal; they do not measure intensity, rank behavior, explain outcomes, or provide advice.</p>
    <dl class="plan-check-meta emotion-patterns-meta">
      <div><dt>Definition</dt><dd>${escapeHtml(report.metadata.version)}</dd></div>
      <div><dt>Definition checksum</dt><dd>${escapeHtml(report.metadata.definitionSha256)}</dd></div>
      <div><dt>Period</dt><dd>${escapeHtml(report.metadata.periodLabel)}</dd></div>
      <div><dt>Time zone</dt><dd>${escapeHtml(report.metadata.timeZone)}</dd></div>
      <div><dt>Account scope</dt><dd>${escapeHtml(report.metadata.accountLabel)}</dd></div>
      <div><dt>Cohort</dt><dd>Current completed review heads</dd></div>
      <div><dt>Included</dt><dd>${countNoun(report.metadata.includedTradeCount, "trade")} of ${countNoun(report.metadata.totalTradeCount, "trade")}</dd></div>
      <div><dt>Saved emotions</dt><dd>${countNoun(report.metadata.includedTradeCount, "current assignment")}</dd></div>
      <div><dt>Exclusions</dt><dd>${escapeHtml(exclusionText(report))}</dd></div>
    </dl>
    <div class="plan-check-groups emotion-patterns-groups" id="emotion-patterns-groups" data-emotion-patterns-groups>${groups}</div>
    ${groupPaging}
    <details class="plan-check-disclosure emotion-patterns-disclosure">
      <summary>How this report works</summary>
      <p>Only each trade's current completed review head is eligible. Pending and draft reviews are excluded first; completed reviews without a saved emotion are excluded next. Older immutable review versions do not compete with the current head.</p>
      <p>Emotion is a single optional saved field. Each included trade therefore counts once in exactly one emotion group, and summed group counts must equal included trades.</p>
      <p>Groups use stable emotion-name code-unit order, never count or performance rank. Groups and evidence are progressively bounded. Evidence uses traded date descending, then trade subject ID ascending.</p>
      <p>These observations do not read results, measure intensity, establish cause, predict future behavior, or provide investment advice.</p>
    </details>
  </section>`;
}

function bindEvidenceGroup(
  section: HTMLElement,
  group: EmotionPatternGroup,
  groupIndex: number,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const contributors = validatedEvidence(group);
  let shown = Math.min(
    EMOTION_PATTERNS_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const list = section.querySelector<HTMLElement>(
    `[data-emotion-patterns-evidence-list="${groupIndex}"]`,
  );
  const status = section.querySelector<HTMLElement>(
    `[data-emotion-patterns-showing="${groupIndex}"]`,
  );
  const button = section.querySelector<HTMLButtonElement>(
    `[data-emotion-patterns-more="${groupIndex}"]`,
  );
  if (list === null || status === null || button === null) {
    throw new Error(`Emotion-pattern evidence controls are incomplete for group ${groupIndex}.`);
  }
  if (shown >= contributors.length) return;

  button.addEventListener("click", () => {
    const next = Math.min(
      shown + EMOTION_PATTERNS_EVIDENCE_PAGE_SIZE,
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

export function bindEmotionPatternsView(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const section = root.querySelector<HTMLElement>("[data-emotion-patterns]");
  if (section === null) return;
  const report = buildEmotionPatternsReport(snapshot);
  if (report.groups.length === 0) return;

  let shown = Math.min(EMOTION_PATTERNS_GROUP_PAGE_SIZE, report.groups.length);
  for (let index = 0; index < shown; index += 1) {
    const group = report.groups[index];
    if (group === undefined) throw new Error("An emotion-pattern group is missing.");
    bindEvidenceGroup(section, group, index, snapshot);
  }
  if (shown >= report.groups.length) return;

  const groups = section.querySelector<HTMLElement>("[data-emotion-patterns-groups]");
  const status = section.querySelector<HTMLElement>(
    "[data-emotion-patterns-groups-showing]",
  );
  const button = section.querySelector<HTMLButtonElement>(
    "[data-emotion-patterns-groups-more]",
  );
  if (groups === null || status === null || button === null) {
    throw new Error("The emotion-pattern group controls are incomplete.");
  }

  button.addEventListener("click", () => {
    const previous = shown;
    const next = Math.min(
      shown + EMOTION_PATTERNS_GROUP_PAGE_SIZE,
      report.groups.length,
    );
    groups.insertAdjacentHTML(
      "beforeend",
      report.groups.slice(previous, next)
        .map((group, index) => groupTemplate(group, snapshot, previous + index))
        .join(""),
    );
    const firstRevealedSummary = groups.querySelector<HTMLElement>(
      `[data-emotion-patterns-group-index="${previous}"] > summary`,
    );
    if (firstRevealedSummary === null) {
      throw new Error("A revealed emotion-pattern group cannot receive focus.");
    }
    shown = next;
    for (let index = previous; index < shown; index += 1) {
      const group = report.groups[index];
      if (group === undefined) throw new Error("An emotion-pattern group is missing.");
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
