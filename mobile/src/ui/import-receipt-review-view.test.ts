import { describe, expect, it } from "vitest";

import type { ImportReceiptReviewContinuation } from "../application/import-receipt-review-continuation";
import { buildExactAccountTradeScope } from "../application/account-overview";
import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  IMPORT_RECEIPT_REVIEW_PAGE_SIZE,
  importReceiptReviewFailure,
  importReceiptReviewSection,
} from "./import-receipt-review-view";

function fixture(count = 12): {
  readonly snapshot: JournalWorkspaceSnapshot;
  readonly continuation: ImportReceiptReviewContinuation;
} {
  const account = DEMO_WORKSPACE.accountOptions[0]!;
  const source = DEMO_WORKSPACE.trades.find((trade) => trade.accountId === account.id)!;
  const sourceAllocation = source.executions[0]!;
  const trades: TradePreview[] = Array.from({ length: count }, (_, index) => ({
    ...source,
    id: `${source.id}:receipt:${index}`,
    tradeSubjectId: `${source.tradeSubjectId}:receipt:${index}`,
    symbol: index === 0 ? '<LONG & "TOKEN">' : `CSV${index + 1}`,
    reviewStatus: index % 3 === 0 ? "pending" : index % 3 === 1 ? "draft" : "completed",
    reviewId: index % 3 === 0 ? null : `${source.tradeSubjectId}:review:${index}`,
    reviewVersion: index % 3 === 0 ? null : 1,
    executions: [{
      ...sourceAllocation,
      allocationId: `${sourceAllocation.allocationId}:receipt:${index}`,
      executionId: `execution:receipt:${index}`,
    }],
  }));
  const snapshot: JournalWorkspaceSnapshot = {
    ...DEMO_WORKSPACE,
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
    accountOptions: DEMO_WORKSPACE.accountOptions.map((candidate) => ({
      ...candidate,
      tradeCount: candidate.id === account.id ? count : 0,
    })),
    trades,
  };
  const baseScope = buildExactAccountTradeScope({
    ...DEMO_WORKSPACE,
    provenance: "local",
  }, account.id);
  const baseEvidence = baseScope.evidence[0]!;
  const scope = Object.freeze({
    ...baseScope,
    evidence: Object.freeze(trades.map((trade) => Object.freeze({
      ...baseEvidence,
      trade,
    }))),
  });
  const continuation: ImportReceiptReviewContinuation = Object.freeze({
    receiptId: "receipt:view",
    accountId: account.id,
    accountLabel: account.label,
    sourceLabel: '<very-long-review & "receipt">.csv',
    importedAtLabel: "Imported Jul 17, 2026 · 9:30 AM",
    acceptedRows: 15,
    executionVersions: 11,
    alreadyPresentRows: 4,
    occurrenceCount: 15,
    uniqueExecutionCount: 12,
    tradeSubjectIds: Object.freeze(trades.map((trade) => trade.tradeSubjectId)),
    scope,
  });
  return { snapshot, continuation };
}

describe("import receipt review view", () => {
  it("renders a bounded receipt-first page with exact count and state-qualified actions", () => {
    const { snapshot, continuation } = fixture();
    const html = importReceiptReviewSection(
      snapshot,
      continuation,
      0,
    );

    expect(html).toContain("CSV RECEIPT · RECONCILED");
    expect(html).toContain(
      "Review trades linked to &lt;very-long-review &amp; &quot;receipt&quot;&gt;.csv",
    );
    expect(html).toContain("Imported Jul 17, 2026 · 9:30 AM · Demo Brokerage");
    expect(html).not.toContain('<very-long-review & "receipt">.csv');
    expect(html).toContain("15 accepted rows");
    expect(html).toContain("11 new or restored execution versions");
    expect(html).toContain("4 already-present rows");
    expect(html).toContain("12 stable executions");
    expect(html).toContain("12 current trades");
    expect(html).toContain("Showing 1–10 of 12 linked trades");
    expect(html).toContain("Show next 2 linked trades");
    expect(html).not.toContain("Show previous");
    expect(html.match(/data-import-receipt-review-trade=/g)).toHaveLength(10);
    expect(html).toContain("Review trade · 1 of 12");
    expect(html).toContain("Continue draft · 2 of 12");
    expect(html).toContain("Open completed review · 3 of 12");
    expect(html).toContain("stock-only");
    expect(html).toContain("&lt;LONG &amp; &quot;TOKEN&quot;&gt;");
    expect(html).not.toContain('<LONG & "TOKEN">');
  });

  it("renders only the next fixed-size page with global positions and a previous action", () => {
    const { snapshot, continuation } = fixture();
    const html = importReceiptReviewSection(
      snapshot,
      continuation,
      IMPORT_RECEIPT_REVIEW_PAGE_SIZE,
    );

    expect(html.match(/data-import-receipt-review-trade=/g)).toHaveLength(2);
    expect(html).toContain("Showing 11–12 of 12 linked trades");
    expect(html).toContain("Continue draft · 11 of 12");
    expect(html).toContain("Open completed review · 12 of 12");
    expect(html).toContain("Show previous 10 linked trades");
    expect(html).not.toContain("data-import-receipt-review-next");
  });

  it("fails closed for invalid pagination and duplicate target identity", () => {
    const { snapshot, continuation } = fixture();

    expect(() => importReceiptReviewSection(snapshot, continuation, -1))
      .toThrow(/pagination/i);
    expect(() => importReceiptReviewSection(snapshot, continuation, 1))
      .toThrow(/pagination/i);
    expect(() => importReceiptReviewSection(snapshot, continuation, 20))
      .toThrow(/pagination/i);
    expect(() => importReceiptReviewSection(snapshot, {
      ...continuation,
      tradeSubjectIds: [
        continuation.tradeSubjectIds[0]!,
        continuation.tradeSubjectIds[0]!,
      ],
    }, 0)).toThrow(/targets are inconsistent/i);
  });

  it("uses qualified, escaped known-commit retry-only recovery copy", () => {
    const html = importReceiptReviewFailure({
      receiptId: 'receipt:<unsafe & "id">',
      sourceLabel: '<broker & "one">.csv',
      accountLabel: '<account & "one">',
      importedAtLabel: '<Imported & "now">',
      origin: "confirmed-post-commit",
    });

    expect(html).toContain(
      "Import saved; review for &lt;broker &amp; &quot;one&quot;&gt;.csv needs attention",
    );
    expect(html).toContain("Do not import &lt;broker &amp; &quot;one&quot;&gt;.csv again");
    expect(html).toContain("&lt;Imported &amp; &quot;now&quot;&gt; · &lt;account &amp; &quot;one&quot;&gt;");
    expect(html).toContain("Retry review continuation");
    expect(html).toContain("receipt:&lt;unsafe &amp; &quot;id&quot;&gt;");
    expect(html).not.toContain('<broker & "one">.csv');
    expect(html).not.toContain("data-import-receipt-review-failure-dismiss");
  });

  it("keeps history-review failure copy distinct from a confirmed new commit", () => {
    const html = importReceiptReviewFailure({
      receiptId: "receipt:history",
      sourceLabel: "history.csv",
      accountLabel: "Primary brokerage",
      importedAtLabel: "Imported Jul 17, 2026 · 9:30 AM",
      origin: "history-review",
    });

    expect(html).toContain("CSV RECEIPT · REVIEW UNAVAILABLE");
    expect(html).toContain("Review for history.csv needs attention");
    expect(html).not.toContain("Import saved");
    expect(html).not.toContain("Do not import");
    expect(html).toContain("data-import-receipt-review-failure-dismiss");
  });
});
