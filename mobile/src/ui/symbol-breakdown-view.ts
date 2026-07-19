import {
  SYMBOL_BREAKDOWN_REPORT_VERSION,
  buildSymbolBreakdownReport,
  type SymbolBreakdownGroup,
  type SymbolBreakdownReport,
  type SymbolBreakdownTradeEvidence,
} from "../core/symbol-breakdown-report";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot } from "../core/types";
import { reportTradeAction } from "./trade-review-sheet";

export const SYMBOL_BREAKDOWN_EVIDENCE_PAGE_SIZE = 25 as const;
export const SYMBOL_BREAKDOWN_GROUP_PAGE_SIZE = 5 as const;

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function modeLabel(snapshot: JournalWorkspaceSnapshot): string {
  if (snapshot.provenance === "demo") return "FICTIONAL DEMO";
  if (snapshot.provenance === "empty") return "NEW";
  return "LOCAL";
}

function assetClassLabel(assetClass: SymbolBreakdownGroup["assetClass"]): "Stock" | "ETF" {
  if (assetClass === "stock") return "Stock";
  if (assetClass === "etf") return "ETF";
  throw new Error("Symbol-breakdown evidence has an unsupported asset class.");
}

function sideLabel(side: SymbolBreakdownTradeEvidence["side"]): "Long" | "Short" {
  if (side === "long") return "Long";
  if (side === "short") return "Short";
  throw new Error("Symbol-breakdown evidence has an unsupported direction.");
}

function positionStateLabel(
  status: SymbolBreakdownTradeEvidence["status"],
): "Open" | "Closed" {
  if (status === "open") return "Open";
  if (status === "closed") return "Closed";
  throw new Error("Symbol-breakdown evidence has an unsupported position status.");
}

function reviewStateLabel(
  status: SymbolBreakdownTradeEvidence["reviewStatus"],
): "Pending" | "Draft" | "Completed" {
  if (status === "pending") return "Pending";
  if (status === "draft") return "Draft";
  if (status === "completed") return "Completed";
  throw new Error("Symbol-breakdown evidence has an unsupported review status.");
}

function validatedEvidence(
  group: SymbolBreakdownGroup,
): readonly SymbolBreakdownTradeEvidence[] {
  if (
    group.tradeCount !== group.evidence.length
    || group.tradeSubjectIds.length !== group.evidence.length
    || group.evidence.some((evidence, index) => (
      evidence.tradeSubjectId !== group.tradeSubjectIds[index]
      || evidence.symbol !== group.symbol
      || evidence.assetClass !== group.assetClass
    ))
  ) {
    throw new Error("Symbol-breakdown contributor evidence is inconsistent.");
  }
  return group.evidence;
}

function evidenceTemplate(
  evidence: SymbolBreakdownTradeEvidence,
  snapshot: JournalWorkspaceSnapshot,
  position: number,
  groupTradeCount: number,
): string {
  const assetClass = assetClassLabel(evidence.assetClass);
  const positionLabel = groupTradeCount === 1
    ? ""
    : "Trade " + (position + 1) + " of " + groupTradeCount + " · ";
  const accessibleContext = groupTradeCount === 1
    ? "the exact " + evidence.symbol + " " + assetClass + " symbol group"
    : "trade " + (position + 1) + " of " + groupTradeCount
      + " in the exact " + evidence.symbol + " " + assetClass + " symbol group";
  return `<article class="plan-check-evidence symbol-breakdown-evidence" data-symbol-breakdown-trade="${escapeHtml(evidence.tradeSubjectId)}">
    <div class="plan-check-evidence-heading">
      <div><strong>${escapeHtml(evidence.symbol)} · ${assetClass}</strong><span>${positionLabel}${escapeHtml(evidence.sessionLabel)} · ${escapeHtml(evidence.accountLabel)}</span></div>
      <strong><time datetime="${escapeHtml(evidence.tradedOn)}">${escapeHtml(evidence.tradedOn)}</time></strong>
    </div>
    <p>${sideLabel(evidence.side)} · Position state <strong>${positionStateLabel(evidence.status)}</strong> · Review state <strong>${reviewStateLabel(evidence.reviewStatus)}</strong></p>
    ${reportTradeAction(
      snapshot,
      evidence.tradeSubjectId,
      "symbol-breakdown",
      accessibleContext,
    )}
  </article>`;
}

function evidenceShowingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} trades`;
}

function showMoreEvidenceText(shown: number, total: number): string {
  return `Show ${Math.min(SYMBOL_BREAKDOWN_EVIDENCE_PAGE_SIZE, total - shown)} more`;
}

function groupShowingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} symbol groups`;
}

function showMoreGroupsText(shown: number, total: number): string {
  return `Show ${Math.min(SYMBOL_BREAKDOWN_GROUP_PAGE_SIZE, total - shown)} more symbol groups`;
}

function groupTemplate(
  group: SymbolBreakdownGroup,
  snapshot: JournalWorkspaceSnapshot,
  groupIndex: number,
): string {
  const contributors = validatedEvidence(group);
  const initialCount = Math.min(
    SYMBOL_BREAKDOWN_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const evidence = contributors.slice(0, initialCount)
    .map((trade, index) => (
      evidenceTemplate(trade, snapshot, index, contributors.length)
    ))
    .join("");
  const assetClass = assetClassLabel(group.assetClass);
  return `<details class="plan-check-group symbol-breakdown-group" data-symbol-breakdown-group-index="${groupIndex}" data-symbol-breakdown-symbol="${escapeHtml(group.symbol)}" data-symbol-breakdown-asset-class="${group.assetClass}">
    <summary>
      <span class="plan-check-summary-label"><strong>${escapeHtml(group.symbol)} · ${assetClass}</strong><span>${countNoun(group.tradeCount, "current trade")}</span></span>
      <span class="plan-check-summary-value">Exact symbol + asset</span>
    </summary>
    <div class="plan-check-group-body">
      <div class="plan-check-evidence-list symbol-breakdown-evidence-list" id="symbol-breakdown-evidence-${groupIndex}" data-symbol-breakdown-evidence-list="${groupIndex}">
        ${evidence || "<p>No current trades are in this group.</p>"}
      </div>
      <p class="plan-check-showing" data-symbol-breakdown-showing="${groupIndex}" role="status" aria-live="polite" tabindex="-1">${evidenceShowingText(initialCount, contributors.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-symbol-breakdown-more="${groupIndex}" aria-controls="symbol-breakdown-evidence-${groupIndex}"${initialCount >= contributors.length ? " hidden" : ""}>${initialCount >= contributors.length ? "All trades shown" : showMoreEvidenceText(initialCount, contributors.length)}</button>
    </div>
  </details>`;
}

function validatedReport(report: SymbolBreakdownReport): SymbolBreakdownReport {
  const groupedTradeCount = report.groups.reduce((total, group) => (
    total + validatedEvidence(group).length
  ), 0);
  const subjectIds = report.groups.flatMap((group) => group.tradeSubjectIds);
  if (
    report.metadata.totalGroupCount !== report.groups.length
    || groupedTradeCount !== report.metadata.totalTradeCount
    || subjectIds.length !== report.metadata.totalTradeCount
    || new Set(subjectIds).size !== subjectIds.length
  ) {
    throw new Error("Symbol-breakdown groups do not conserve the current trade cohort.");
  }
  return report;
}

export function symbolBreakdownSection(
  snapshot: JournalWorkspaceSnapshot,
): string {
  const report = validatedReport(buildSymbolBreakdownReport(snapshot));
  if (report.metadata.version !== SYMBOL_BREAKDOWN_REPORT_VERSION) {
    throw new Error("The symbol-breakdown report definition is unsupported.");
  }
  const initialGroupCount = Math.min(
    SYMBOL_BREAKDOWN_GROUP_PAGE_SIZE,
    report.groups.length,
  );
  const groups = report.groups.length === 0
    ? "<p>No current trades are available for symbol breakdown.</p>"
    : report.groups.slice(0, initialGroupCount)
      .map((group, index) => groupTemplate(group, snapshot, index))
      .join("");
  const groupPaging = report.groups.length === 0
    ? ""
    : `<p class="plan-check-showing" data-symbol-breakdown-groups-showing role="status" aria-live="polite" tabindex="-1">${groupShowingText(initialGroupCount, report.groups.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-symbol-breakdown-groups-more aria-controls="symbol-breakdown-groups"${initialGroupCount >= report.groups.length ? " hidden" : ""}>${initialGroupCount >= report.groups.length ? "All symbol groups shown" : showMoreGroupsText(initialGroupCount, report.groups.length)}</button>`;
  return `<section class="card plan-check-card symbol-breakdown-card" aria-labelledby="symbol-breakdown-title" data-symbol-breakdown>
    <div class="section-title"><div><p class="card-label">SYMBOLS, WITH EVIDENCE</p><h2 id="symbol-breakdown-title" class="report-target" tabindex="-1">Symbol breakdown</h2></div><div class="report-section-actions"><span>${modeLabel(snapshot)}</span><a class="report-menu-link" href="#reports-navigation-title" data-report-target="reports-navigation-title">Back to report menu</a></div></div>
    <p>Every current trade appears once in its exact symbol and asset-class group. Counts describe journal composition; groups are never ordered by count or performance and do not evaluate one symbol against another.</p>
    <dl class="plan-check-meta symbol-breakdown-meta">
      <div><dt>Definition</dt><dd>${escapeHtml(report.metadata.version)}</dd></div>
      <div><dt>Definition checksum</dt><dd>${escapeHtml(report.metadata.definitionSha256)}</dd></div>
      <div><dt>Period</dt><dd>${escapeHtml(report.metadata.periodLabel)}</dd></div>
      <div><dt>Time zone</dt><dd>${escapeHtml(report.metadata.timeZone)}</dd></div>
      <div><dt>Account scope</dt><dd>${escapeHtml(report.metadata.accountLabel)}</dd></div>
      <div><dt>Cohort</dt><dd>Current full-workspace projection</dd></div>
      <div><dt>Included</dt><dd>${countNoun(report.metadata.totalTradeCount, "current trade")}</dd></div>
      <div><dt>Groups</dt><dd>${countNoun(report.metadata.totalGroupCount, "symbol group")}</dd></div>
    </dl>
    <div class="plan-check-groups symbol-breakdown-groups" id="symbol-breakdown-groups" data-symbol-breakdown-groups>${groups}</div>
    ${groupPaging}
    <details class="plan-check-disclosure symbol-breakdown-disclosure">
      <summary>How this report works</summary>
      <p>This report counts every current trade exactly once by its exact saved symbol plus asset class, regardless of open or closed position state and pending, draft, or completed review state. The same symbol remains separate across Stock and ETF groups.</p>
      <p>Groups use stable symbol code-unit order, then Stock before ETF for an identical symbol. They are never count-ranked or performance-ranked. Groups and evidence are revealed in bounded pages; evidence uses traded date descending, then trade subject ID ascending.</p>
      <p>Grouping does not read result values, outcomes, authored review content, or Trades filters. Review state is displayed only as evidence and does not affect inclusion or grouping; opening evidence does not consume or change a Trades filter. These counts do not explain performance, predict future results, rank opportunities, suggest actions, or provide investment advice.</p>
    </details>
  </section>`;
}

function bindEvidenceGroup(
  section: HTMLElement,
  group: SymbolBreakdownGroup,
  groupIndex: number,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const contributors = validatedEvidence(group);
  let shown = Math.min(
    SYMBOL_BREAKDOWN_EVIDENCE_PAGE_SIZE,
    contributors.length,
  );
  const list = section.querySelector<HTMLElement>(
    `[data-symbol-breakdown-evidence-list="${groupIndex}"]`,
  );
  const status = section.querySelector<HTMLElement>(
    `[data-symbol-breakdown-showing="${groupIndex}"]`,
  );
  const button = section.querySelector<HTMLButtonElement>(
    `[data-symbol-breakdown-more="${groupIndex}"]`,
  );
  if (list === null || status === null || button === null) {
    throw new Error(`Symbol-breakdown evidence controls are incomplete for group ${groupIndex}.`);
  }
  if (shown >= contributors.length) return;

  button.addEventListener("click", () => {
    const previous = shown;
    const next = Math.min(
      shown + SYMBOL_BREAKDOWN_EVIDENCE_PAGE_SIZE,
      contributors.length,
    );
    list.insertAdjacentHTML(
      "beforeend",
      contributors.slice(shown, next)
        .map((evidence, index) => (
          evidenceTemplate(
            evidence,
            snapshot,
            previous + index,
            contributors.length,
          )
        ))
        .join(""),
    );
    const firstRevealedAction = Array.from(
      list.querySelectorAll<HTMLButtonElement>(".report-trade-action"),
    )[previous];
    if (firstRevealedAction === undefined) {
      throw new Error(
        "Symbol-breakdown evidence page " + previous + " cannot receive focus.",
      );
    }
    shown = next;
    status.textContent = evidenceShowingText(shown, contributors.length);
    if (shown >= contributors.length) {
      button.hidden = true;
    } else {
      button.textContent = showMoreEvidenceText(shown, contributors.length);
    }
    firstRevealedAction.focus({ preventScroll: true });
  });
}

export function bindSymbolBreakdownView(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
): void {
  const section = root.querySelector<HTMLElement>("[data-symbol-breakdown]");
  if (section === null) return;
  const report = validatedReport(buildSymbolBreakdownReport(snapshot));
  if (report.groups.length === 0) return;

  let shown = Math.min(SYMBOL_BREAKDOWN_GROUP_PAGE_SIZE, report.groups.length);
  for (let index = 0; index < shown; index += 1) {
    const group = report.groups[index];
    if (group === undefined) throw new Error("A symbol-breakdown group is missing.");
    bindEvidenceGroup(section, group, index, snapshot);
  }
  if (shown >= report.groups.length) return;

  const groups = section.querySelector<HTMLElement>("[data-symbol-breakdown-groups]");
  const status = section.querySelector<HTMLElement>(
    "[data-symbol-breakdown-groups-showing]",
  );
  const button = section.querySelector<HTMLButtonElement>(
    "[data-symbol-breakdown-groups-more]",
  );
  if (groups === null || status === null || button === null) {
    throw new Error("The symbol-breakdown group controls are incomplete.");
  }

  button.addEventListener("click", () => {
    const previous = shown;
    const next = Math.min(
      shown + SYMBOL_BREAKDOWN_GROUP_PAGE_SIZE,
      report.groups.length,
    );
    groups.insertAdjacentHTML(
      "beforeend",
      report.groups.slice(previous, next)
        .map((group, index) => groupTemplate(group, snapshot, previous + index))
        .join(""),
    );
    const firstRevealedSummary = groups.querySelector<HTMLElement>(
      `[data-symbol-breakdown-group-index="${previous}"] > summary`,
    );
    if (firstRevealedSummary === null) {
      throw new Error("A revealed symbol-breakdown group cannot receive focus.");
    }
    shown = next;
    for (let index = previous; index < shown; index += 1) {
      const group = report.groups[index];
      if (group === undefined) throw new Error("A symbol-breakdown group is missing.");
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
