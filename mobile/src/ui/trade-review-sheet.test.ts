import { describe, expect, it } from "vitest";

import { TradeReviewCommitStatusUncertainError } from "../application/journal-application";
import { JournalTradeReviewError } from "../application/journal-store";
import { deriveTradeMetricsV1 } from "../core/trade-metrics";
import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  parseReviewList,
  reviewTradeAction,
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
    expect(html).toMatch(/class="settings-sheet trade-review-sheet"[^>]*tabindex="-1"/u);
    expect(html).not.toContain("Reload journal and reconcile");
    expect(html).not.toMatch(/place order|execute trade|send order/iu);
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
    expect(reviewTradeAction(trade())).toContain('data-review-trade="subject-1"');
    expect(reviewTradeAction(trade())).toContain(
      'aria-label="Edit review for &lt;AAPL&gt; Stock, Jul 1 · Morning"',
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
});
