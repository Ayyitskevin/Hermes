import {
  buildSetupPerformanceReport,
  SETUP_PERFORMANCE_REPORT_VERSION,
  type SetupPerformanceGroup,
  type SetupPerformanceReport,
  type SetupPerformanceTradeEvidence,
} from "../core/setup-performance-report";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot } from "../core/types";
import { reportTradeAction } from "./trade-review-sheet";

export const SETUP_BREAKDOWN_EVIDENCE_PAGE_SIZE = 25 as const;
export const SETUP_BREAKDOWN_GROUP_PAGE_SIZE = 5 as const;

function exactSigned(value: string | null, suffix: string): string {
  if (value === null) return "—";
  return `${value.startsWith("-") || value === "0" ? "" : "+"}${value}${suffix}`;
}

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function modeLabel(snapshot: JournalWorkspaceSnapshot): string {
  if (snapshot.provenance === "demo") return "FICTIONAL DEMO";
  if (snapshot.provenance === "empty") return "NEW";
  return "LOCAL";
}

function evidenceTemplate(
  evidence: SetupPerformanceTradeEvidence,
  snapshot: JournalWorkspaceSnapshot,
): string {
  return `<article class="plan-check-evidence setup-performance-evidence" data-setup-performance-trade="${escapeHtml(evidence.tradeSubjectId)}">
    <div class="plan-check-evidence-heading">
      <div><strong>${escapeHtml(evidence.symbol)}</strong><span>${escapeHtml(evidence.sessionLabel)} · ${escapeHtml(evidence.accountLabel)} · ${escapeHtml(evidence.side)}</span></div>
      <strong>${escapeHtml(exactSigned(evidence.resultPnlExact, ` ${snapshot.currencyCode}`))} · ${escapeHtml(exactSigned(evidence.resultRExact, "R"))}</strong>
    </div>
    <p>Current saved setup · <strong>${escapeHtml(evidence.setup)}</strong> · ${escapeHtml(evidence.tradedOn)}</p>
    ${reportTradeAction(snapshot, evidence.tradeSubjectId, "setup-performance")}
  </article>`;
}

function validatedEvidence(group: SetupPerformanceGroup): readonly SetupPerformanceTradeEvidence[] {
  if (
    group.tradeSubjectIds.length !== group.evidence.length
    || group.evidence.some((evidence, index) => (
      evidence.tradeSubjectId !== group.tradeSubjectIds[index]
    ))
  ) {
    throw new Error("Setup-performance contributor evidence is inconsistent.");
  }
  return group.evidence;
}

function evidenceShowingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} contributing trades`;
}

function showMoreEvidenceText(shown: number, total: number): string {
  return `Show ${Math.min(SETUP_BREAKDOWN_EVIDENCE_PAGE_SIZE, total - shown)} more`;
}

function groupShowingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} setup groups`;
}

function showMoreGroupsText(shown: number, total: number): string {
  return `Show ${Math.min(SETUP_BREAKDOWN_GROUP_PAGE_SIZE, total - shown)} more setup groups`;
}

function groupTemplate(
  group: SetupPerformanceGroup,
  snapshot: JournalWorkspaceSnapshot,
  groupIndex: number,
): string {
  const expectancy = exactSigned(group.cashExpectancyExact, ` ${snapshot.currencyCode}`);
  const averageR = exactSigned(group.averageRExact, "R");
  const contributors = validatedEvidence(group);
  const initialCount = Math.min(
    SETUP_BREAKDOWN_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const evidence = contributors.slice(0, initialCount)
    .map((trade) => evidenceTemplate(trade, snapshot))
    .join("");
  return `<details class="plan-check-group setup-performance-group" data-setup-performance-group-index="${groupIndex}">
    <summary>
      <span class="plan-check-summary-label"><strong>${escapeHtml(group.setup)}</strong><span>${countNoun(group.tradeCount, "reviewed closed trade")}</span></span>
      <span class="plan-check-summary-value">${escapeHtml(expectancy)} expectancy</span>
    </summary>
    <div class="plan-check-group-body">
      <div class="plan-check-metrics">
        <div class="plan-check-metric"><span>Cash expectancy</span><strong>${escapeHtml(expectancy)}</strong></div>
        <div class="plan-check-metric"><span>Wins</span><strong>${group.winCount} of ${group.tradeCount}</strong></div>
        <div class="plan-check-metric"><span>Average R</span><strong>${escapeHtml(averageR)}</strong><span>${group.rTradeCount} of ${group.tradeCount} with compatible risk</span></div>
        <div class="plan-check-metric"><span>Exact net P&amp;L</span><strong>${escapeHtml(exactSigned(group.netPnlExact, ` ${snapshot.currencyCode}`))}</strong></div>
      </div>
      <div class="plan-check-evidence-list setup-performance-evidence-list" id="setup-performance-evidence-${groupIndex}" data-setup-performance-evidence-list="${groupIndex}">
        ${evidence || "<p>No reviewed closed trades are in this group.</p>"}
      </div>
      <p class="plan-check-showing" data-setup-performance-showing="${groupIndex}" role="status" aria-live="polite" tabindex="-1">${evidenceShowingText(initialCount, contributors.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-setup-performance-more="${groupIndex}" aria-controls="setup-performance-evidence-${groupIndex}"${initialCount >= contributors.length ? " hidden" : ""}>${initialCount >= contributors.length ? "All contributors shown" : showMoreEvidenceText(initialCount, contributors.length)}</button>
    </div>
  </details>`;
}

function exclusionText(report: SetupPerformanceReport): string {
  const exclusions = report.metadata.exclusions;
  return [
    `${exclusions.openOrPartial} open or partial`,
    `${exclusions.missingRealizedPnl} without realized P&L`,
    `${exclusions.incompleteReview} with an incomplete review`,
    `${exclusions.unclassifiedSetup} with an unclassified setup`,
  ].join(" · ");
}

export function setupPerformanceSection(
  snapshot: JournalWorkspaceSnapshot,
): string {
  const report = buildSetupPerformanceReport(snapshot);
  if (report.metadata.version !== SETUP_PERFORMANCE_REPORT_VERSION) {
    throw new Error("The setup-performance report definition is unsupported.");
  }
  const initialGroupCount = Math.min(
    SETUP_BREAKDOWN_GROUP_PAGE_SIZE,
    report.groups.length,
  );
  const groups = report.groups.length === 0
    ? "<p>No completed reviewed closed trades with a classified setup are available.</p>"
    : report.groups.slice(0, initialGroupCount)
      .map((group, index) => groupTemplate(group, snapshot, index))
      .join("");
  const groupPaging = report.groups.length === 0
    ? ""
    : `<p class="plan-check-showing" data-setup-performance-groups-showing role="status" aria-live="polite" tabindex="-1">${groupShowingText(initialGroupCount, report.groups.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-setup-performance-groups-more aria-controls="setup-performance-groups"${initialGroupCount >= report.groups.length ? " hidden" : ""}>${initialGroupCount >= report.groups.length ? "All setup groups shown" : showMoreGroupsText(initialGroupCount, report.groups.length)}</button>`;
  return `<section class="card plan-check-card setup-performance-card" aria-labelledby="setup-performance-title" data-setup-performance>
    <div class="section-title"><div><p class="card-label">SETUP, WITH EVIDENCE</p><h2 id="setup-performance-title" class="report-target" tabindex="-1">Setup breakdown</h2></div><div class="report-section-actions"><span>${modeLabel(snapshot)}</span><a class="report-menu-link" href="#reports-navigation-title" data-report-target="reports-navigation-title">Back to report menu</a></div></div>
    <p>Completed reviewed closed trades use stable setup-name code-unit order. This is descriptive context, not a performance ranking or recommendation.</p>
    <dl class="plan-check-meta setup-performance-meta">
      <div><dt>Definition</dt><dd>${escapeHtml(report.metadata.version)}</dd></div>
      <div><dt>Definition checksum</dt><dd>${escapeHtml(report.metadata.definitionSha256)}</dd></div>
      <div><dt>Period</dt><dd>${escapeHtml(report.metadata.periodLabel)}</dd></div>
      <div><dt>Currency</dt><dd>${escapeHtml(report.metadata.currencyCode)}</dd></div>
      <div><dt>Time zone</dt><dd>${escapeHtml(report.metadata.timeZone)}</dd></div>
      <div><dt>Account scope</dt><dd>${escapeHtml(report.metadata.accountLabel)}</dd></div>
      <div><dt>Cohort</dt><dd>Completed reviewed closed trades with a classified setup</dd></div>
      <div><dt>Included</dt><dd>${report.metadata.includedTradeCount} of ${report.metadata.totalTradeCount} trades</dd></div>
      <div><dt>Exclusions</dt><dd>${escapeHtml(exclusionText(report))}</dd></div>
    </dl>
    <div class="plan-check-groups setup-performance-groups" id="setup-performance-groups" data-setup-performance-groups>${groups}</div>
    ${groupPaging}
    <details class="plan-check-disclosure setup-performance-disclosure">
      <summary>How this report works</summary>
      <p>Open or partial trades, trades without exact realized P&amp;L, incomplete reviews, and completed reviews without a saved setup are excluded in that order. Saved setup text and absence are tracked separately, so a saved label is never treated as missing because of its wording. Every included trade appears in exactly one setup group.</p>
      <p>Cash expectancy is exact net realized P&amp;L divided by included trades. A win requires exact realized P&amp;L above zero; zero is not a win. Average R includes only strict replay-validated, versioned risk evidence and shows its coverage.</p>
      <p>Cash and compatible-R means round half away from zero to 12 decimal places. Groups use stable setup-name code-unit order, never performance rank. Groups and evidence are progressively bounded. Evidence uses traded date descending, then trade subject ID ascending.</p>
      <p>These observations do not establish cause, predict future results, or provide investment advice.</p>
    </details>
  </section>`;
}

function bindEvidenceGroup(
  section: HTMLElement,
  group: SetupPerformanceGroup,
  groupIndex: number,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const contributors = validatedEvidence(group);
  let shown = Math.min(
    SETUP_BREAKDOWN_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const list = section.querySelector<HTMLElement>(
    `[data-setup-performance-evidence-list="${groupIndex}"]`,
  );
  const status = section.querySelector<HTMLElement>(
    `[data-setup-performance-showing="${groupIndex}"]`,
  );
  const button = section.querySelector<HTMLButtonElement>(
    `[data-setup-performance-more="${groupIndex}"]`,
  );
  if (list === null || status === null || button === null) {
    throw new Error(`Setup-performance evidence controls are incomplete for group ${groupIndex}.`);
  }
  if (shown >= contributors.length) return;

  button.addEventListener("click", () => {
    const next = Math.min(
      shown + SETUP_BREAKDOWN_EVIDENCE_PAGE_SIZE,
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

export function bindSetupPerformanceView(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const section = root.querySelector<HTMLElement>("[data-setup-performance]");
  if (section === null) return;
  const report = buildSetupPerformanceReport(snapshot);
  if (report.groups.length === 0) return;

  let shown = Math.min(SETUP_BREAKDOWN_GROUP_PAGE_SIZE, report.groups.length);
  for (let index = 0; index < shown; index += 1) {
    const group = report.groups[index];
    if (group === undefined) throw new Error("A setup-performance group is missing.");
    bindEvidenceGroup(section, group, index, snapshot);
  }
  if (shown >= report.groups.length) return;

  const groups = section.querySelector<HTMLElement>("[data-setup-performance-groups]");
  const status = section.querySelector<HTMLElement>(
    "[data-setup-performance-groups-showing]",
  );
  const button = section.querySelector<HTMLButtonElement>(
    "[data-setup-performance-groups-more]",
  );
  if (groups === null || status === null || button === null) {
    throw new Error("The setup-performance group controls are incomplete.");
  }

  button.addEventListener("click", () => {
    const previous = shown;
    const next = Math.min(
      shown + SETUP_BREAKDOWN_GROUP_PAGE_SIZE,
      report.groups.length,
    );
    groups.insertAdjacentHTML(
      "beforeend",
      report.groups.slice(previous, next)
        .map((group, index) => groupTemplate(group, snapshot, previous + index))
        .join(""),
    );
    const firstRevealedSummary = groups.querySelector<HTMLElement>(
      `[data-setup-performance-group-index="${previous}"] > summary`,
    );
    if (firstRevealedSummary === null) {
      throw new Error("A revealed setup-performance group cannot receive focus.");
    }
    shown = next;
    for (let index = previous; index < shown; index += 1) {
      const group = report.groups[index];
      if (group === undefined) throw new Error("A setup-performance group is missing.");
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
