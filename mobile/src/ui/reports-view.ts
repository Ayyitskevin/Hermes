import {
  buildPlanAdherenceReport,
  PLAN_ADHERENCE_INSIGHT_MIN_TRADES,
  PLAN_ADHERENCE_REPORT_VERSION,
  type PlanAdherenceReport,
} from "../core/plan-adherence-report";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import {
  bindSetupPerformanceView,
  setupPerformanceSection,
} from "./setup-performance-view";

type PlanAdherenceGroup = PlanAdherenceReport["groups"][number];
type PlanAdherenceEvidence = PlanAdherenceGroup["evidence"][number];

export const PLAN_CHECK_EVIDENCE_PAGE_SIZE = 25 as const;

function signedCurrency(value: number | null, currency: string): string {
  if (value === null) return "Open";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    signDisplay: "always",
  }).format(value);
}

function exactSigned(value: string | null, suffix: string): string {
  if (value === null) return "—";
  return `${value.startsWith("-") || value === "0" ? "" : "+"}${value}${suffix}`;
}

function signedR(value: number | null, unavailable = "Open"): string {
  if (value === null) return unavailable;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}R`;
}

function resultClass(value: number | null): "positive" | "negative" | "" {
  if (value === null || value === 0) return "";
  return value > 0 ? "positive" : "negative";
}

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function modeLabel(snapshot: JournalWorkspaceSnapshot): string {
  if (snapshot.provenance === "demo") return "FICTIONAL DEMO";
  if (snapshot.provenance === "empty") return "NEW";
  return "LOCAL";
}

function hasInterimPartialMetrics(trade: TradePreview): boolean {
  return trade.status === "open" && (
    (trade.resultRMetric.isPartial && trade.resultRMetric.value !== null)
    || (trade.percentReturnMetric.isPartial && trade.percentReturnMetric.value !== null)
  );
}

function equityChart(snapshot: JournalWorkspaceSnapshot): string {
  const minimum = Math.min(...snapshot.equityCurve);
  const maximum = Math.max(...snapshot.equityCurve);
  const range = Math.max(maximum - minimum, 1);
  const denominator = Math.max(snapshot.equityCurve.length - 1, 1);
  const coordinates = snapshot.equityCurve.map((value, index) => ({
    x: (index / denominator) * 100,
    y: 92 - ((value - minimum) / range) * 80,
  }));
  const points = coordinates.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const markers = coordinates.map(({ x, y }) => `<circle class="equity-point" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.5" />`).join("");
  return `<svg class="equity-chart" viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label="Cumulative performance changes from ${escapeHtml(signedCurrency(snapshot.equityCurve[0] ?? 0, snapshot.currencyCode))} to ${escapeHtml(signedCurrency(snapshot.equityCurve.at(-1) ?? 0, snapshot.currencyCode))}">
    <line class="equity-grid" x1="0" y1="35" x2="100" y2="35" />
    <line class="equity-grid" x1="0" y1="65" x2="100" y2="65" />
    <polyline class="equity-line" points="${points}" />
    ${markers}
  </svg>`;
}

function groupLabel(classification: PlanAdherenceGroup["classification"]): string {
  return classification === "followed" ? "Rules followed" : "Rule broken";
}

function outcomeLabel(outcome: PlanAdherenceEvidence["rules"][number]["outcome"]): string {
  switch (outcome) {
    case "followed": return "followed";
    case "broken": return "broken";
    case "not_applicable": return "not applicable";
    case "unreviewed": return "unreviewed";
  }
}

function evidenceTemplate(
  evidence: PlanAdherenceEvidence,
  snapshot: JournalWorkspaceSnapshot,
): string {
  const rules = evidence.rules.map((rule) => (
    `<li>${escapeHtml(rule.text)}: ${escapeHtml(outcomeLabel(rule.outcome))}</li>`
  )).join("");
  return `<article class="plan-check-evidence" data-plan-check-trade="${escapeHtml(evidence.tradeSubjectId)}">
    <div class="plan-check-evidence-heading">
      <div><strong>${escapeHtml(evidence.symbol)}</strong><span>${escapeHtml(evidence.sessionLabel)} · ${escapeHtml(evidence.accountLabel)} · ${escapeHtml(evidence.side)}</span></div>
      <strong>${escapeHtml(exactSigned(evidence.resultPnlExact, ` ${snapshot.currencyCode}`))} · ${escapeHtml(exactSigned(evidence.resultRExact, "R"))}</strong>
    </div>
    <p>Current saved rule outcomes</p>
    <ul class="issue-list">${rules}</ul>
  </article>`;
}

function validatedEvidence(group: PlanAdherenceGroup): readonly PlanAdherenceEvidence[] {
  if (
    group.tradeSubjectIds.length !== group.evidence.length
    || group.evidence.some((evidence, index) => (
      evidence.tradeSubjectId !== group.tradeSubjectIds[index]
    ))
  ) {
    throw new Error(`The ${group.classification} plan-adherence contributors are inconsistent.`);
  }
  return group.evidence;
}

function showingText(shown: number, total: number): string {
  return `Showing ${shown} of ${total} contributing trades`;
}

function showMoreText(shown: number, total: number): string {
  return `Show ${Math.min(PLAN_CHECK_EVIDENCE_PAGE_SIZE, total - shown)} more`;
}

function groupTemplate(
  group: PlanAdherenceGroup,
  snapshot: JournalWorkspaceSnapshot,
): string {
  const label = groupLabel(group.classification);
  const expectancy = exactSigned(group.cashExpectancyExact, ` ${snapshot.currencyCode}`);
  const averageR = exactSigned(group.averageRExact, "R");
  const contributors = validatedEvidence(group);
  const initialCount = Math.min(PLAN_CHECK_EVIDENCE_PAGE_SIZE, contributors.length);
  const evidence = contributors.slice(0, initialCount)
    .map((trade) => evidenceTemplate(trade, snapshot))
    .join("");
  return `<details class="plan-check-group" data-plan-check-group="${group.classification}">
    <summary>
      <span class="plan-check-summary-label"><strong>${label}</strong><span>${countNoun(group.tradeCount, "reviewed closed trade")}</span></span>
      <span class="plan-check-summary-value">${escapeHtml(expectancy)} expectancy</span>
    </summary>
    <div class="plan-check-group-body">
      <div class="plan-check-metrics">
        <div class="plan-check-metric"><span>Cash expectancy</span><strong>${escapeHtml(expectancy)}</strong></div>
        <div class="plan-check-metric"><span>Wins</span><strong>${group.winCount} of ${group.tradeCount}</strong></div>
        <div class="plan-check-metric"><span>Average R</span><strong>${escapeHtml(averageR)}</strong><span>${group.rTradeCount} of ${group.tradeCount} with compatible risk</span></div>
        <div class="plan-check-metric"><span>Exact net P&amp;L</span><strong>${escapeHtml(exactSigned(group.netPnlExact, ` ${snapshot.currencyCode}`))}</strong></div>
      </div>
      <div class="plan-check-evidence-list" id="plan-check-evidence-${group.classification}" data-plan-check-evidence-list="${group.classification}">
        ${evidence || `<p>No reviewed closed trades are in this group.</p>`}
      </div>
      <p class="plan-check-showing" data-plan-check-showing="${group.classification}" role="status" aria-live="polite" tabindex="-1">${showingText(initialCount, contributors.length)}</p>
      <button class="secondary-button plan-check-more" type="button" data-plan-check-more="${group.classification}" aria-controls="plan-check-evidence-${group.classification}"${initialCount >= contributors.length ? " hidden" : ""}>${initialCount >= contributors.length ? "All contributors shown" : showMoreText(initialCount, contributors.length)}</button>
    </div>
  </details>`;
}

function exclusionText(report: PlanAdherenceReport): string {
  const exclusions = report.metadata.exclusions;
  return [
    `${exclusions.openOrPartial} open or partial`,
    `${exclusions.missingRealizedPnl} without realized P&L`,
    `${exclusions.incompleteReview} with an incomplete review`,
    `${exclusions.unclassifiedRules} without a classified rule outcome`,
  ].join(" · ");
}

function reportInsight(report: PlanAdherenceReport): string {
  if (report.insight.status === "ready") {
    return `In your reviewed closed trades, the observed cash-expectancy difference (rules followed minus rule broken) is ${exactSigned(report.insight.followedMinusBrokenCashExpectancyExact, ` ${report.metadata.currencyCode}`)}. This describes your saved history; it does not establish cause or predict an outcome.`;
  }
  const incomplete = report.metadata.exclusions.incompleteReview;
  const existingReviewPrompt = incomplete === 0
    ? ""
    : ` ${countNoun(incomplete, "existing incomplete review")} can be finished from the review queue.`;
  return `This small cohort cannot support a comparison yet. Each group needs at least ${PLAN_ADHERENCE_INSIGHT_MIN_TRADES} classified reviewed closed trades.${existingReviewPrompt} Hermes never asks you to trade more for a metric.`;
}

function planCheckSection(snapshot: JournalWorkspaceSnapshot): string {
  const report = buildPlanAdherenceReport(snapshot);
  if (report.metadata.version !== PLAN_ADHERENCE_REPORT_VERSION) {
    throw new Error("The plan-adherence report definition is unsupported.");
  }
  return `<section class="card plan-check-card" aria-labelledby="plan-check-title" data-plan-check>
    <div class="section-title"><div><p class="card-label">PROCESS, WITH EVIDENCE</p><h2 id="plan-check-title">Plan check</h2></div><span>${modeLabel(snapshot)}</span></div>
    <p>${escapeHtml(reportInsight(report))}</p>
    <dl class="plan-check-meta">
      <div><dt>Definition</dt><dd>${escapeHtml(report.metadata.version)}</dd></div>
      <div><dt>Definition checksum</dt><dd>${escapeHtml(report.metadata.definitionSha256)}</dd></div>
      <div><dt>Period</dt><dd>${escapeHtml(report.metadata.periodLabel)}</dd></div>
      <div><dt>Currency</dt><dd>${escapeHtml(report.metadata.currencyCode)}</dd></div>
      <div><dt>Time zone</dt><dd>${escapeHtml(report.metadata.timeZone)}</dd></div>
      <div><dt>Account scope</dt><dd>${escapeHtml(report.metadata.accountLabel)}</dd></div>
      <div><dt>Cohort</dt><dd>Completed reviewed closed trades</dd></div>
      <div><dt>Included</dt><dd>${report.metadata.includedTradeCount} of ${report.metadata.totalTradeCount} trades</dd></div>
      <div><dt>Exclusions</dt><dd>${escapeHtml(exclusionText(report))}</dd></div>
    </dl>
    <div class="plan-check-groups">${report.groups.map((group) => groupTemplate(group, snapshot)).join("")}</div>
    <details class="plan-check-disclosure">
      <summary>How this report works</summary>
      <p><strong>Rules followed</strong> means at least one current saved rule is followed and none is broken. <strong>Rule broken</strong> means at least one current saved rule is broken; broken takes precedence when the same review also contains followed rules.</p>
      <p>Draft and pending reviews, plus completed reviews whose rules are all unreviewed or not applicable, are excluded. Open or partial trades and trades without realized P&amp;L are excluded too. Cash expectancy is exact net realized P&amp;L divided by included trades. Average R uses only trades with compatible, versioned risk evidence.</p>
      <p>Cash and compatible-R means round half away from zero to 12 decimal places. The rules-followed-minus-rule-broken cash difference uses exact group totals with one final division—not subtraction of rounded means—and appears only with at least 3 trades in both groups.</p>
      <p>The comparison is observational, not investment advice or evidence that a rule caused an outcome.</p>
    </details>
  </section>`;
}

export function planAdherenceDashboardCard(snapshot: JournalWorkspaceSnapshot): string {
  const report = buildPlanAdherenceReport(snapshot);
  const followed = report.groups[0];
  const broken = report.groups[1];
  const ready = report.insight.status === "ready";
  const copy = ready
    ? "In your reviewed closed trades, these governed cash-expectancy values show an observed difference. They describe saved history, not cause or a prediction."
    : reportInsight(report);
  return `<article class="card dashboard-plan-check" data-plan-check-dashboard>
    <div class="section-title"><div><p class="card-label">PLAN CHECK</p><h2>${ready ? "Your process pattern" : "Small cohort"}</h2></div><span>${modeLabel(snapshot)}</span></div>
    <p>${copy}</p>
    <div class="plan-check-dashboard-values">
      <div><span>Rules followed · ${countNoun(followed.tradeCount, "trade")}</span><strong>${escapeHtml(exactSigned(followed.cashExpectancyExact, ` ${report.metadata.currencyCode}`))}</strong></div>
      <div><span>Rule broken · ${countNoun(broken.tradeCount, "trade")}</span><strong>${escapeHtml(exactSigned(broken.cashExpectancyExact, ` ${report.metadata.currencyCode}`))}</strong></div>
    </div>
    <button class="secondary-button" type="button" data-route="reports">Open plan check</button>
  </article>`;
}

export function reportsView(snapshot: JournalWorkspaceSnapshot): string {
  const performance = snapshot.performance;
  const hasInterimResults = snapshot.trades.some(hasInterimPartialMetrics);
  return `<section class="screen-stack" aria-labelledby="reports-title">
    <div class="screen-heading"><div><p class="eyebrow">PERFORMANCE ANALYTICS</p><h1 id="reports-title">Reports</h1></div><span class="demo-badge">${modeLabel(snapshot)}</span></div>
    <div class="metric-grid">
      <article class="card"><p class="card-label">NET P&amp;L</p><strong class="metric ${resultClass(performance.netPnl)}">${escapeHtml(signedCurrency(performance.netPnl, snapshot.currencyCode))}</strong><span>${escapeHtml(signedR(performance.netR, "—"))}${hasInterimResults ? " · includes interim partial exits" : ""}</span></article>
      <article class="card"><p class="card-label">WIN RATE</p><strong class="metric">${performance.winRatePct.toFixed(0)}%</strong><span>${countNoun(performance.tradeCount, "trade")} with realized P&amp;L</span></article>
      <article class="card"><p class="card-label">PROFIT FACTOR</p><strong class="metric">${performance.profitFactor?.toFixed(2) ?? "—"}</strong><span>profit relative to loss</span></article>
      <article class="card"><p class="card-label">AVG R</p><strong class="metric">${escapeHtml(signedR(performance.averageR, "—"))}</strong><span>${performance.rTradeCount} of ${performance.tradeCount} with defined risk</span></article>
    </div>
    ${planCheckSection(snapshot)}
    ${setupPerformanceSection(snapshot)}
    <article class="card chart-card"><div class="section-title"><div><p class="card-label">JOURNAL CURVE</p><h2>Cumulative result</h2></div><strong class="${resultClass(performance.netPnl)}">${escapeHtml(signedCurrency(performance.netPnl, snapshot.currencyCode))}</strong></div>${equityChart(snapshot)}</article>
  </section>`;
}

export function bindReportsView(
  root: HTMLElement,
  snapshot: JournalWorkspaceSnapshot,
): void {
  bindSetupPerformanceView(root, snapshot);
  const planCheck = root.querySelector<HTMLElement>("[data-plan-check]");
  if (planCheck === null) return;
  const report = buildPlanAdherenceReport(snapshot);

  for (const group of report.groups) {
    const contributors = validatedEvidence(group);
    let shown = Math.min(PLAN_CHECK_EVIDENCE_PAGE_SIZE, contributors.length);
    const list = planCheck.querySelector<HTMLElement>(
      `[data-plan-check-evidence-list="${group.classification}"]`,
    );
    const status = planCheck.querySelector<HTMLElement>(
      `[data-plan-check-showing="${group.classification}"]`,
    );
    const button = planCheck.querySelector<HTMLButtonElement>(
      `[data-plan-check-more="${group.classification}"]`,
    );
    if (list === null || status === null || button === null) {
      throw new Error(`The ${group.classification} plan-adherence controls are incomplete.`);
    }
    if (shown >= contributors.length) continue;

    button.addEventListener("click", () => {
      const next = Math.min(shown + PLAN_CHECK_EVIDENCE_PAGE_SIZE, contributors.length);
      list.insertAdjacentHTML(
        "beforeend",
        contributors.slice(shown, next)
          .map((evidence) => evidenceTemplate(evidence, snapshot))
          .join(""),
      );
      shown = next;
      status.textContent = showingText(shown, contributors.length);
      if (shown >= contributors.length) {
        button.hidden = true;
        status.focus({ preventScroll: true });
      } else {
        button.textContent = showMoreText(shown, contributors.length);
      }
    });
  }
}
