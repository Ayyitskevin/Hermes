import { describe, expect, it } from "vitest";

import { deriveTradeMetricsV1 } from "../core/trade-metrics";
import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  bindReportsView,
  PLAN_CHECK_EVIDENCE_PAGE_SIZE,
  planAdherenceDashboardCard,
  reportsView,
} from "./reports-view";

function demoTrade(symbol: string): TradePreview {
  const trade = DEMO_WORKSPACE.trades.find((candidate) => candidate.symbol === symbol);
  if (trade === undefined) throw new Error(`Missing demo trade ${symbol}.`);
  return trade;
}

function cloneTrade(
  source: TradePreview,
  suffix: string,
  overrides: Partial<TradePreview> = {},
): TradePreview {
  return {
    ...source,
    id: `${source.id}-${suffix}`,
    tradeSubjectId: `${source.tradeSubjectId}-${suffix}`,
    reviewId: source.reviewId === null ? null : `${source.reviewId}-${suffix}`,
    ...overrides,
  };
}

function readyLocalWorkspace(): JournalWorkspaceSnapshot {
  return {
    ...DEMO_WORKSPACE,
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
  };
}

function insufficientDemoWorkspace(): JournalWorkspaceSnapshot {
  return {
    ...DEMO_WORKSPACE,
    trades: DEMO_WORKSPACE.trades.map((trade) => (
      trade.symbol !== "QQQ"
        ? trade
        : {
            ...trade,
            followedPlan: true,
            rules: trade.rules.map((rule) => ({
              ...rule,
              outcome: "followed" as const,
            })),
          }
    )),
  };
}

function insufficientWorkspaceWithIncompleteReview(): JournalWorkspaceSnapshot {
  const snapshot = insufficientDemoWorkspace();
  return {
    ...snapshot,
    trades: [
      ...snapshot.trades,
      cloneTrade(demoTrade("AAPL"), "unfinished", { reviewStatus: "draft" }),
    ],
  };
}

function workspaceWithManyContributors(count = 31): JournalWorkspaceSnapshot {
  const aapl = demoTrade("AAPL");
  const followed = Array.from({ length: count }, (_, index) => {
    const suffix = `bulk-${String(index).padStart(2, "0")}`;
    const tradeSubjectId = `demo-subject-aapl-${suffix}`;
    return cloneTrade(aapl, suffix, {
      tradedOn: "2026-07-10",
      sessionLabel: `Bulk ${String(index).padStart(2, "0")}`,
      rules: aapl.rules.map((rule, ruleIndex) => ({
        ...rule,
        ruleId: `${tradeSubjectId}:rule:${ruleIndex + 1}`,
      })),
    });
  });
  const broken = DEMO_WORKSPACE.trades.filter((trade) => (
    trade.rules.some((rule) => rule.outcome === "broken")
  ));
  return {
    ...DEMO_WORKSPACE,
    trades: [...followed, ...broken],
  };
}

function workspaceWithEscapingAndExclusions(): JournalWorkspaceSnapshot {
  const aapl = demoTrade("AAPL");
  const noRealizedMetrics = deriveTradeMetricsV1({
    assetClass: "stock",
    netRealizedPnl: null,
    initialRisk: aapl.initialRisk,
    fullEntryNotional: { amount: "100", currency: "USD" },
    isPartial: false,
  });
  const escaped = {
    ...aapl,
    symbol: "<AAPL & friends>",
    setup: "<Breakout>",
    sessionLabel: "<Jul 1 & morning>",
    accountLabel: "<Broker & One>",
    rules: aapl.rules.map((rule, index) => ({
      ...rule,
      text: index === 0 ? "<Wait & confirm>" : rule.text,
    })),
  } satisfies TradePreview;
  const open = cloneTrade(aapl, "open", { status: "open" });
  const missing = cloneTrade(aapl, "missing", {
    resultPnl: null,
    resultPnlExact: null,
    resultR: null,
    percentReturn: null,
    resultRMetric: noRealizedMetrics.resultR,
    percentReturnMetric: noRealizedMetrics.percentReturn,
  });
  const draft = cloneTrade(aapl, "draft", { reviewStatus: "draft" });
  const unclassified = cloneTrade(aapl, "unclassified", {
    followedPlan: null,
    rules: aapl.rules.map((rule) => ({ ...rule, outcome: "not_applicable" as const })),
  });
  return {
    ...DEMO_WORKSPACE,
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
    periodLabel: "<all history>",
    timeZone: "<UTC & local>",
    accountLabel: "<all accounts & scope>",
    trades: [
      escaped,
      ...DEMO_WORKSPACE.trades.slice(1),
      open,
      missing,
      draft,
      unclassified,
    ],
  };
}

describe("reports presentation", () => {
  it("renders both versioned evidence reports with the existing headline context", () => {
    const html = reportsView(DEMO_WORKSPACE);

    expect(html).toContain('<section class="card plan-check-card" aria-labelledby="plan-check-title" data-plan-check>');
    expect(html).toContain('<h2 id="plan-check-title">Plan check</h2>');
    expect(html).toContain("FICTIONAL DEMO");
    expect(html).toContain("plan-adherence-report-v1");
    expect(html).toContain("0f092c3bdd6c5051e97f5be0f1c7758a01e3159875adf660b1b0ea00f970ae85");
    expect(html).toContain("Account scope");
    expect(html).toContain(DEMO_WORKSPACE.accountLabel);
    expect(html).toContain("Jul 1–9, 2026");
    expect(html).toContain("USD");
    expect(html).toContain("UTC");
    expect(html).toContain("Completed reviewed closed trades");
    expect(html).toContain("8 of 8 trades");
    expect(html).toContain("0 open or partial · 0 without realized P&amp;L · 0 with an incomplete review · 0 without a classified rule outcome");
    expect(html).toContain('data-plan-check-group="followed"');
    expect(html).toContain('data-plan-check-group="broken"');
    expect(html).toContain("+106 USD expectancy");
    expect(html).toContain("-73.333333333333 USD expectancy");
    expect(html).toContain("+179.333333333333 USD");
    expect(html).toContain("rules followed minus rule broken");
    expect(html).toContain("round half away from zero to 12 decimal places");
    expect(html).toContain("one final division");
    expect(html).toContain("at least 3 trades in both groups");
    expect(html).not.toContain("Hermes waits for 3 classified reviewed closed trades in each group");
    expect(html).toContain("NET P&amp;L");
    expect(html).toContain("WIN RATE");
    expect(html).toContain("PROFIT FACTOR");
    expect(html).toContain("AVG R");
    expect(html).toContain('data-setup-performance');
    expect(html).toContain('<h2 id="setup-performance-title">Setup breakdown</h2>');
    expect(html).toContain("setup-performance-report-v1");
    expect(html).toContain("5779276cbbc4278136f96bbaca167216c60b395cdad4a8bb4cf9c3b5f272601b");
    expect(html).toContain("stable setup-name code-unit order");
    expect(html).toContain("not a performance ranking or recommendation");
    expect(html).toContain("JOURNAL CURVE");
    expect(html).not.toContain("data-review-trade=");

    for (const trade of DEMO_WORKSPACE.trades) {
      expect(html).toContain(`data-plan-check-trade="${trade.tradeSubjectId}"`);
      expect(html).toContain(`data-setup-performance-trade="${trade.tradeSubjectId}"`);
    }
  });

  it("renders ready observational dashboard and report copy with exact values", () => {
    const snapshot = readyLocalWorkspace();
    const dashboard = planAdherenceDashboardCard(snapshot);
    const report = reportsView(snapshot);

    expect(dashboard).toContain("Your process pattern");
    expect(dashboard).toContain("In your reviewed closed trades");
    expect(dashboard).toContain("observed difference");
    expect(dashboard).toContain("Rules followed · 5 trades");
    expect(dashboard).toContain("+106 USD");
    expect(dashboard).toContain("Rule broken · 3 trades");
    expect(dashboard).toContain("-73.333333333333 USD");
    expect(dashboard).toContain('data-route="reports">Open plan check</button>');
    expect(report).toContain("+179.333333333333 USD");
    expect(report).toContain("does not establish cause or predict an outcome");
    expect(report).toContain('data-plan-check-trade="demo-subject-qqq"');
    expect(report).not.toContain("data-review-trade=");
    expect(report).not.toContain("Hermes waits for 3 classified");
  });

  it("escapes evidence and displays every mutually exclusive exclusion count", () => {
    const snapshot = workspaceWithEscapingAndExclusions();
    const html = reportsView(snapshot);

    expect(html).toContain("&lt;AAPL &amp; friends&gt;");
    expect(html).toContain("&lt;Jul 1 &amp; morning&gt;");
    expect(html).toContain("&lt;Broker &amp; One&gt;");
    expect(html).toContain("&lt;Wait &amp; confirm&gt;: followed");
    expect(html).toContain("&lt;Breakout&gt;");
    expect(html).toContain("&lt;all history&gt;");
    expect(html).toContain("&lt;UTC &amp; local&gt;");
    expect(html).toContain("<dt>Account scope</dt><dd>&lt;all accounts &amp; scope&gt;</dd>");
    expect(html).toContain("<dt>Definition checksum</dt><dd>0f092c3bdd6c5051e97f5be0f1c7758a01e3159875adf660b1b0ea00f970ae85</dd>");
    expect(html).not.toContain("<AAPL & friends>");
    expect(html).not.toContain("<Broker & One>");
    expect(html).not.toContain("<all accounts & scope>");
    expect(html).not.toContain("<Wait & confirm>");
    expect(html).toContain("8 of 12 trades");
    expect(html).toContain("1 open or partial · 1 without realized P&amp;L · 1 with an incomplete review · 1 without a classified rule outcome");
    expect(html).not.toContain('data-plan-check-trade="demo-subject-aapl-open"');
    expect(html).not.toContain('data-plan-check-trade="demo-subject-aapl-missing"');
    expect(html).not.toContain('data-plan-check-trade="demo-subject-aapl-draft"');
    expect(html).not.toContain('data-plan-check-trade="demo-subject-aapl-unclassified"');
    expect(html).toContain("Rules followed</strong> means at least one current saved rule is followed and none is broken");
    expect(html).toContain("Draft and pending reviews");
    expect(html).toContain("all unreviewed or not applicable");
  });

  it("keeps insufficient copy honest without inventing a review prompt", () => {
    const html = planAdherenceDashboardCard(insufficientDemoWorkspace());

    expect(html).toContain('data-plan-check-dashboard');
    expect(html).toContain("Small cohort");
    expect(html).toContain("This small cohort cannot support a comparison yet");
    expect(html).toContain("Each group needs at least 3 classified reviewed closed trades");
    expect(html).toContain("Hermes never asks you to trade more for a metric");
    expect(html).not.toContain("existing incomplete review");
    expect(html).not.toContain("review queue");
    expect(html).toContain("Rules followed · 6 trades");
    expect(html).toContain("+80 USD");
    expect(html).toContain("Rule broken · 2 trades");
    expect(html).toContain("-85 USD");
    expect(html).toContain("Open plan check");
  });

  it("mentions only existing incomplete reviews in insufficient copy", () => {
    const snapshot = insufficientWorkspaceWithIncompleteReview();
    const dashboard = planAdherenceDashboardCard(snapshot);
    const report = reportsView(snapshot);

    expect(dashboard).toContain("1 existing incomplete review can be finished from the review queue");
    expect(dashboard).toContain("Hermes never asks you to trade more for a metric");
    expect(report).toContain("1 existing incomplete review can be finished from the review queue");
    expect(report).toContain("1 with an incomplete review");
  });

  it("bounds initial evidence and exposes progressive disclosure controls", () => {
    const snapshot = workspaceWithManyContributors();
    const html = reportsView(snapshot);

    expect(PLAN_CHECK_EVIDENCE_PAGE_SIZE).toBe(25);
    expect(bindReportsView).toBeTypeOf("function");
    expect(html.match(/data-plan-check-trade=/g)).toHaveLength(28);
    expect(html).toContain("Showing 25 of 31 contributing trades");
    expect(html).toContain('data-plan-check-more="followed" aria-controls="plan-check-evidence-followed">Show 6 more</button>');
    expect(html).toContain("Showing 3 of 3 contributing trades");
    expect(html).toContain('data-plan-check-more="broken" aria-controls="plan-check-evidence-broken" hidden>All contributors shown</button>');

    for (let index = 0; index < 25; index += 1) {
      const suffix = String(index).padStart(2, "0");
      expect(html).toContain(`data-plan-check-trade="demo-subject-aapl-bulk-${suffix}"`);
    }
    for (let index = 25; index < 31; index += 1) {
      const suffix = String(index).padStart(2, "0");
      expect(html).not.toContain(`data-plan-check-trade="demo-subject-aapl-bulk-${suffix}"`);
    }
  });

  it("appends bounded evidence pages and focuses status at completion", () => {
    const snapshot = workspaceWithManyContributors(56);
    const inserted: string[] = [];
    const clicks: Array<() => void> = [];
    let statusFocused = false;
    const followedList = {
      insertAdjacentHTML(position: string, html: string): void {
        expect(position).toBe("beforeend");
        inserted.push(html);
      },
    };
    const followedStatus = {
      textContent: "",
      focus(options: FocusOptions): void {
        expect(options).toEqual({ preventScroll: true });
        statusFocused = true;
      },
    };
    const followedButton = {
      hidden: false,
      textContent: "Show 25 more",
      addEventListener(event: string, listener: () => void): void {
        expect(event).toBe("click");
        clicks.push(listener);
      },
    };
    const completeControls = {
      list: { insertAdjacentHTML: (): never => { throw new Error("Unexpected append."); } },
      status: { textContent: "", focus: (): never => { throw new Error("Unexpected focus."); } },
      button: {
        hidden: true,
        textContent: "All contributors shown",
        addEventListener: (): never => { throw new Error("Unexpected listener."); },
      },
    };
    const controls = new Map<string, unknown>([
      ['[data-plan-check-evidence-list="followed"]', followedList],
      ['[data-plan-check-showing="followed"]', followedStatus],
      ['[data-plan-check-more="followed"]', followedButton],
      ['[data-plan-check-evidence-list="broken"]', completeControls.list],
      ['[data-plan-check-showing="broken"]', completeControls.status],
      ['[data-plan-check-more="broken"]', completeControls.button],
    ]);
    const planCheck = {
      querySelector(selector: string): unknown {
        return controls.get(selector) ?? null;
      },
    };
    const root = {
      querySelector(selector: string): unknown {
        if (selector === "[data-setup-performance]") return null;
        expect(selector).toBe("[data-plan-check]");
        return planCheck;
      },
    };

    bindReportsView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    const click = clicks[0];
    if (click === undefined) throw new Error("Missing progressive disclosure listener.");
    click();
    expect(inserted[0]?.match(/data-plan-check-trade=/g)).toHaveLength(25);
    expect(inserted[0]).toContain('data-plan-check-trade="demo-subject-aapl-bulk-49"');
    expect(inserted[0]).not.toContain('data-plan-check-trade="demo-subject-aapl-bulk-50"');
    expect(followedStatus.textContent).toBe("Showing 50 of 56 contributing trades");
    expect(followedButton.textContent).toBe("Show 6 more");
    expect(followedButton.hidden).toBe(false);

    click();
    expect(inserted[1]?.match(/data-plan-check-trade=/g)).toHaveLength(6);
    expect(inserted[1]).toContain('data-plan-check-trade="demo-subject-aapl-bulk-50"');
    expect(inserted[1]).toContain('data-plan-check-trade="demo-subject-aapl-bulk-55"');
    expect(followedStatus.textContent).toBe("Showing 56 of 56 contributing trades");
    expect(followedButton.hidden).toBe(true);
    expect(statusFocused).toBe(true);
  });
});
