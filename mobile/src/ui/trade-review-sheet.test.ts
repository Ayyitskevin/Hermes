import { describe, expect, it } from "vitest";

import { TradeReviewCommitStatusUncertainError } from "../application/journal-application";
import { JournalTradeReviewError } from "../application/journal-store";
import { deriveTradeMetricsV1 } from "../core/trade-metrics";
import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  parseReviewList,
  reportTradeAction,
  reviewTradeAction,
  tradeReviewLatestVersionTemplate,
  tradeReviewReconciliationHead,
  tradeReviewSaveFailureKind,
  tradeReviewSheetTemplate,
} from "./trade-review-sheet";

function trade(): TradePreview {
  const metrics = deriveTradeMetricsV1({
    assetClass: "stock",
    netRealizedPnl: { amount: "19.8", currency: "USD" },
    initialRisk: { amount: "10", currency: "USD" },
    fullEntryNotional: { amount: "200", currency: "USD" },
    isPartial: false,
  });
  return {
    ...DEMO_WORKSPACE.trades[0]!,
    id: "subject-1",
    tradeSubjectId: "subject-1",
    symbol: "<AAPL>",
    resultPnl: 19.8,
    resultPnlExact: "19.8",
    resultR: 1.98,
    percentReturn: 9.9,
    resultRMetric: metrics.resultR,
    percentReturnMetric: metrics.percentReturn,
    note: "<reflect>",
    reviewId: "review-1",
    reviewVersion: 2,
    executions: [{
      allocationId: "allocation-123456789",
      executionId: "execution-1",
      effect: "entry",
      side: "buy",
      occurredAt: "Jul 1, 2026 · 9:30 AM",
      quantity: "2",
      price: "100",
      fee: "0.1",
      currency: "USD",
    }],
  };
}

function localWorkspace(): JournalWorkspaceSnapshot {
  return {
    ...DEMO_WORKSPACE,
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
    trades: [trade()],
  };
}

describe("trade review sheet", () => {
  it("renders escaped execution facts, exact metric evidence, and versioned review inputs", () => {
    const html = tradeReviewSheetTemplate(trade(), localWorkspace());
    expect(html).toContain("&lt;AAPL&gt; trade review · Stock");
    expect(html).not.toContain("<AAPL>");
    expect(html).toContain("19.8 USD ÷ 10 USD");
    expect(html).toContain("1.98R");
    expect(html).toContain("result-r-v1");
    expect(html).toContain("19.8 USD ÷ 200 USD × 100");
    expect(html).toContain("percent-return-v1");
    expect(html).toContain("Saved metric evidence");
    expect(html).toContain("Unsaved risk changes are not included.");
    expect(html).toContain("Review version 2");
    expect(html).toContain("immutable allocation allocation-1");
    expect(html).toContain("Save review changes");
    expect(html).not.toContain("Save draft");
    expect(html).not.toContain("Mark reviewed");
    expect(html).toContain("User-confirmed amount");
    expect(html).toContain('id="trade-review-reconcile"');
    expect(html).toMatch(/id="trade-review-reconcile"[^>]*hidden/u);
    expect(html).toContain("Retry this exact save");
    expect(html).toContain('id="trade-review-conflict"');
    expect(html).toContain("Hermes does not merge fields");
    expect(html).toContain('id="trade-review-status" role="status"');
    expect(html).toMatch(/class="settings-sheet trade-review-sheet"[^>]*tabindex="-1"/u);
    expect(html).not.toContain("Reload journal and reconcile");
    expect(html).not.toMatch(/place order|execute trade|send order/iu);
  });

  it("labels exact report origins without changing the trade or browser scope", () => {
    const html = tradeReviewSheetTemplate(trade(), localWorkspace(), "plan-check");
    const mistakeHtml = tradeReviewSheetTemplate(
      trade(),
      localWorkspace(),
      "mistake-patterns",
    );

    expect(html).toContain(
      "&lt;AAPL&gt; trade review · Stock · Demo Brokerage · Jul 1 · Morning",
    );
    expect(html).toContain('data-trade-review-report-context="plan-check"');
    expect(html).toContain("Opened from Plan check.");
    expect(html).toContain(
      "This full-workspace report does not use or change your Trades filters.",
    );
    expect(mistakeHtml).toContain(
      'data-trade-review-report-context="mistake-patterns"',
    );
    expect(mistakeHtml).toContain("Opened from Mistake patterns.");
  });

  it("renders complete escaped evidence for one coherent saved review", () => {
    const latest = {
      ...trade(),
      accountLabel: "<Primary & account>",
      sessionLabel: "<Morning>",
      setup: "<script>setup</script>",
      hasClassifiedSetup: true,
      note: "<img src=x onerror=alert(1)>",
      mistakes: ["<mistake>"],
      emotion: "<emotion>",
      tags: ["<tag>"],
      playbook: "<playbook>",
      rules: [{
        ruleId: "rule-1",
        text: "<rule>",
        outcome: "broken" as const,
      }],
      initialRisk: { amount: "<100>", currency: "<USD>" },
      plannedStop: "<95>",
      reviewStatus: "completed" as const,
      reviewId: "opaque-review-id-should-not-render",
      reviewVersion: 3,
    } satisfies TradePreview;

    const html = tradeReviewLatestVersionTemplate(latest);

    expect(html).toContain('data-trade-review-latest-version="3"');
    expect(html).toContain("Version 3 · completed");
    expect(html).toContain("&lt;Primary &amp; account&gt;");
    expect(html).toContain("&lt;script&gt;setup&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
    expect(html).toContain("&lt;rule&gt; — Broken");
    expect(html).toContain("&lt;100&gt; &lt;USD&gt;");
    expect(html).toContain("<div><dt>Execution allocations</dt><dd>1</dd></div>");
    expect(html).toContain("<div><dt>Result R</dt><dd>1.98R</dd></div>");
    expect(html).toContain("<div><dt>Percent return</dt><dd>9.9%</dd></div>");
    expect(html).not.toContain("opaque-review-id-should-not-render");
    expect(html).not.toContain("<script>setup</script>");
    expect(html).not.toContain("<img src=x");
  });

  it("selects only the sole coherent different newer local review head", () => {
    const latest = trade();
    const workspace = { ...localWorkspace(), trades: [latest] };

    expect(tradeReviewReconciliationHead(
      workspace,
      latest.tradeSubjectId,
      "review-previous",
      1,
    )).toBe(latest);
    expect(tradeReviewReconciliationHead(
      { ...workspace, provenance: "demo" },
      latest.tradeSubjectId,
      "review-previous",
      1,
    )).toBeNull();
    expect(tradeReviewReconciliationHead(
      workspace,
      latest.tradeSubjectId,
      latest.reviewId,
      1,
    )).toBeNull();
    expect(tradeReviewReconciliationHead(
      workspace,
      latest.tradeSubjectId,
      "review-previous",
      latest.reviewVersion ?? 0,
    )).toBeNull();
    expect(tradeReviewReconciliationHead(
      { ...workspace, trades: [] },
      latest.tradeSubjectId,
      "review-previous",
      1,
    )).toBeNull();
    expect(tradeReviewReconciliationHead(
      { ...workspace, trades: [latest, { ...latest }] },
      latest.tradeSubjectId,
      "review-previous",
      1,
    )).toBeNull();
    expect(tradeReviewReconciliationHead(
      {
        ...workspace,
        trades: [{
          ...latest,
          reviewStatus: "pending",
          reviewId: null,
          reviewVersion: null,
        }],
      },
      latest.tradeSubjectId,
      "review-previous",
      1,
    )).toBeNull();
    expect(tradeReviewReconciliationHead(
      workspace,
      latest.tradeSubjectId,
      "review-previous",
      -1,
    )).toBeNull();
  });

  it("refuses to render comparison evidence without a coherent saved identity", () => {
    expect(() => tradeReviewLatestVersionTemplate({
      ...trade(),
      reviewStatus: "pending",
      reviewId: null,
      reviewVersion: null,
    })).toThrow(/coherent saved version/u);
  });

  it("keeps saved Unclassified text editable while blanking an absent setup", () => {
    const savedLabel = {
      ...trade(),
      setup: "Unclassified",
      hasClassifiedSetup: true,
    } satisfies TradePreview;
    const absentSetup = {
      ...savedLabel,
      hasClassifiedSetup: false,
    } satisfies TradePreview;

    const savedHtml = tradeReviewSheetTemplate(savedLabel, {
      ...localWorkspace(),
      trades: [savedLabel],
    });
    const absentHtml = tradeReviewSheetTemplate(absentSetup, {
      ...localWorkspace(),
      trades: [absentSetup],
    });

    expect(savedHtml).toMatch(/id="review-setup"[^>]*value="Unclassified"/u);
    expect(absentHtml).toMatch(/id="review-setup"[^>]*value=""/u);
  });

  it("makes demo reviews explicitly read-only", () => {
    const html = tradeReviewSheetTemplate(DEMO_WORKSPACE.trades[0]!, DEMO_WORKSPACE);
    expect(html).toContain("fictional demo review is read-only");
    expect(html).not.toContain("Save draft");
    expect(html).not.toContain("Mark reviewed");
    expect(html).toContain("disabled");
  });

  it("allows pending reviews to be saved as a draft or completed", () => {
    const pending = {
      ...trade(),
      reviewStatus: "pending" as const,
      reviewId: null,
      reviewVersion: null,
    };
    const html = tradeReviewSheetTemplate(pending, {
      ...localWorkspace(),
      trades: [pending],
    });
    expect(html).toContain("Save draft");
    expect(html).toContain("Mark reviewed");
    expect(html).not.toContain("Save review changes");
  });

  it("preserves a saved risk currency and exposes the trade currency for correction", () => {
    const metrics = deriveTradeMetricsV1({
      assetClass: "stock",
      netRealizedPnl: { amount: "19.8", currency: "USD" },
      initialRisk: { amount: "10", currency: "EUR" },
      fullEntryNotional: { amount: "200", currency: "USD" },
      isPartial: false,
    });
    const mismatch = {
      ...trade(),
      initialRisk: { amount: "10", currency: "EUR" },
      resultR: null,
      resultRMetric: metrics.resultR,
    } satisfies TradePreview;

    const html = tradeReviewSheetTemplate(mismatch, {
      ...localWorkspace(),
      trades: [mismatch],
    });

    expect(html).toContain("Initial risk (EUR)");
    expect(html).toContain('<option value="EUR" selected>EUR</option>');
    expect(html).toContain('<option value="USD">USD</option>');
    expect(html).toContain("different currencies");
  });

  it.each([
    {
      label: "completed version zero",
      reviewStatus: "completed" as const,
      reviewId: "review-invalid",
      reviewVersion: 0,
    },
    {
      label: "draft without a version",
      reviewStatus: "draft" as const,
      reviewId: "review-invalid",
      reviewVersion: null,
    },
    {
      label: "pending state with a saved identity",
      reviewStatus: "pending" as const,
      reviewId: "review-invalid",
      reviewVersion: 1,
    },
  ])("fails closed for an incoherent $label identity", (identity) => {
    const invalid = { ...trade(), ...identity } satisfies TradePreview;
    const html = tradeReviewSheetTemplate(invalid, {
      ...localWorkspace(),
      trades: [invalid],
    });

    expect(html).toContain("REVIEW STATE · VERSION UNAVAILABLE");
    expect(html).toContain("Version unavailable");
    expect(html).toContain("Saving is blocked");
    expect(html).not.toContain("Save review changes");
    expect(html).not.toContain("Save draft");
    expect(html).not.toContain("Mark reviewed");
    expect(html).toContain("disabled");
  });

  it("normalizes list separators and emits stable review triggers", () => {
    expect(parseReviewList(" FOMO, Early entry\nA+ ,, ")).toEqual([
      "FOMO",
      "Early entry",
      "A+",
    ]);
    const action = reviewTradeAction(trade());
    expect(action).toContain('data-review-trade="subject-1"');
    expect(action).toContain('aria-haspopup="dialog"');
    expect(action).toContain(
      'aria-label="Edit review for &lt;AAPL&gt; Stock, Demo Brokerage, Jul 1 · Morning"',
    );
    expect(reviewTradeAction(trade(), "Open <review>")).toContain("Open &lt;review&gt;");
    expect(tradeReviewSaveFailureKind(new Error("preparation failed"))).toBe("retryable");
    expect(tradeReviewSaveFailureKind(
      new TradeReviewCommitStatusUncertainError(new Error("bridge response lost")),
    )).toBe("uncertain");
    expect(tradeReviewSaveFailureKind(new JournalTradeReviewError({
      code: "review_changed",
      message: "stale",
    }))).toBe("stale");
    expect(tradeReviewSaveFailureKind(new JournalTradeReviewError({
      code: "submission_changed",
      message: "collision",
    }))).toBe("blocked");
    expect(tradeReviewSaveFailureKind(new JournalTradeReviewError({
      code: "trade_changed",
      message: "missing trade",
    }))).toBe("blocked");
  });

  it("renders report actions by one exact stable ID and fails closed otherwise", () => {
    const primary = trade();
    const secondary = {
      ...trade(),
      id: "subject-2",
      tradeSubjectId: "subject-2",
      accountLabel: "Secondary & retirement",
      sessionLabel: "Jul 2 · Afternoon",
    };
    const snapshot = {
      ...localWorkspace(),
      trades: [primary, secondary],
    };
    const action = reportTradeAction(snapshot, "subject-2", "setup-performance");

    expect(action).toContain('data-review-trade="subject-2"');
    expect(action).toContain(
      'data-trade-review-report-source="setup-performance"',
    );
    expect(action).toContain('aria-haspopup="dialog"');
    expect(action).toContain(
      "Open &lt;AAPL&gt; trade — Stock, Secondary &amp; retirement, Jul 2 · Afternoon",
    );
    expect(action).not.toContain('data-review-trade="subject-1"');

    const mistakeAction = reportTradeAction(
      snapshot,
      "subject-2",
      "mistake-patterns",
      "saved mistake Early entry",
    );
    expect(mistakeAction).toContain(
      'data-trade-review-report-source="mistake-patterns"',
    );
    expect(mistakeAction).toContain(
      "Open &lt;AAPL&gt; trade for saved mistake Early entry — Stock, Secondary &amp; retirement, Jul 2 · Afternoon",
    );

    expect(() => reportTradeAction(snapshot, "missing", "plan-check")).toThrow(
      /exactly one trade/u,
    );
    expect(() => reportTradeAction({
      ...snapshot,
      trades: [primary, { ...secondary, tradeSubjectId: "subject-1" }],
    }, "subject-1", "plan-check")).toThrow(/exactly one trade/u);
  });
});
