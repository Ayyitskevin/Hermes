import { describe, expect, it, vi } from "vitest";

import type { ImportHistoryPreview, JournalWorkspaceSnapshot } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  focusImportReceiptAfterRefresh,
  importReceiptHistorySection,
  latestImportReceiptCard,
} from "./import-receipt-view";

function receipt(
  overrides: Partial<ImportHistoryPreview> = {},
): ImportHistoryPreview {
  return {
    receiptId: "receipt-1",
    accountLabel: "Primary brokerage",
    sourceLabel: "broker.csv",
    importedAtLabel: "Imported Jul 17, 2026 · 9:30 AM",
    executions: 4,
    accounts: 1,
    sourceRows: 6,
    acceptedRows: 4,
    executionVersions: 3,
    rejectedRows: 1,
    skippedRows: 1,
    warningCount: 2,
    rolledBack: false,
    rolledBackAtLabel: null,
    ...overrides,
  };
}

function snapshot(
  provenance: JournalWorkspaceSnapshot["provenance"] = "local",
  history: readonly ImportHistoryPreview[] = [receipt()],
): JournalWorkspaceSnapshot {
  return {
    ...DEMO_WORKSPACE,
    provenance,
    provenanceLabel: provenance === "demo" ? "FICTIONAL DEMO" : "ON-DEVICE JOURNAL",
    importHistory: history,
  };
}

describe("import receipt view", () => {
  it("shows the latest exact accepted and version counts without relabeling them", () => {
    const html = latestImportReceiptCard(snapshot());

    expect(html).toContain("LATEST IMPORT RECEIPT");
    expect(html).toContain("Primary brokerage");
    expect(html).toContain("4</strong><span>accepted rows");
    expect(html).toContain("3</strong><span>new or restored");
    expect(html).toContain("1</strong><span>rejected");
    expect(html).toContain("1</strong><span>skipped");
  });

  it("renders an accessible reconciliation disclosure and a local-only rollback action", () => {
    const html = importReceiptHistorySection(snapshot());

    expect(html).toContain('aria-labelledby="import-history-title"');
    expect(html).toContain("1 receipt");
    expect(html).toContain("Reconcile receipt");
    expect(html).toContain("6 source rows = 4 accepted + 1 rejected + 1 skipped.");
    expect(html).toContain("4 accepted rows = 3 new or restored execution versions + 1 already present.");
    expect(html).toContain("2 warnings = 1 already-present warning + 1 other preview warning.");
    expect(html).toContain('data-review-import-receipt="receipt-1"');
    expect(html).toContain("Review linked trades");
    expect(html).toContain('data-rollback-receipt="receipt-1"');
    expect(html).toContain(
      'aria-label="Roll back broker.csv from Primary brokerage, Imported Jul 17, 2026 · 9:30 AM, receipt 1 of 1"',
    );

    const demo = importReceiptHistorySection(snapshot("demo"));
    expect(demo).toContain("Reconcile receipt");
    expect(demo).not.toContain("data-review-import-receipt");
    expect(demo).not.toContain("data-rollback-receipt");
  });

  it("qualifies same-minute receipt actions by immutable history position", () => {
    const html = importReceiptHistorySection(snapshot("local", [
      receipt({ receiptId: "receipt-newer" }),
      receipt({ receiptId: "receipt-older" }),
    ]));

    expect(html).toContain("receipt 1 of 2");
    expect(html).toContain("receipt 2 of 2");
    expect(html).toContain(
      "Review trades linked to broker.csv, Primary brokerage, Imported Jul 17, 2026 · 9:30 AM, receipt 1 of 2",
    );
    expect(html).toContain(
      "Review trades linked to broker.csv, Primary brokerage, Imported Jul 17, 2026 · 9:30 AM, receipt 2 of 2",
    );
  });

  it("keeps rolled-back receipts inspectable with exact history and no repeat action", () => {
    const html = importReceiptHistorySection(snapshot("local", [receipt({
      rolledBack: true,
      rolledBackAtLabel: "Rolled back Jul 17, 2026 · 10:15 AM",
    })]));

    expect(html).toContain("ROLLED BACK");
    expect(html).toContain("Rolled back Jul 17, 2026 · 10:15 AM");
    expect(html).toContain("The immutable receipt remains in history.");
    expect(html).not.toContain("data-review-import-receipt");
    expect(html).not.toContain("data-rollback-receipt");
  });

  it("escapes retained labels and omits empty receipt surfaces", () => {
    const hostile = receipt({
      sourceLabel: '<broker & "one">.csv',
      accountLabel: '<account & "one">',
      importedAtLabel: '<Imported & "now">',
    });
    const html = importReceiptHistorySection(snapshot("local", [hostile]));

    expect(html).toContain("&lt;broker &amp; &quot;one&quot;&gt;.csv");
    expect(html).toContain("&lt;account &amp; &quot;one&quot;&gt;");
    expect(html).toContain("&lt;Imported &amp; &quot;now&quot;&gt;");
    expect(html).not.toContain('<broker & "one">');
    expect(latestImportReceiptCard(snapshot("local", []))).toBe("");
    expect(importReceiptHistorySection(snapshot("local", []))).toBe("");
  });

  it("focuses one exact rebuilt receipt and otherwise falls back to the screen", () => {
    const actions: string[] = [];
    const heading = {
      dataset: { importReceiptHeading: "receipt-1" },
      style: { scrollMarginTop: "", scrollMarginBottom: "" },
      closest: () => null,
      getBoundingClientRect: () => ({ top: 84, bottom: 104, height: 20 }),
      scrollIntoView(options: ScrollIntoViewOptions): void {
        expect(options).toEqual({ behavior: "auto", block: "start" });
        actions.push("scroll");
      },
      focus(options: FocusOptions): void {
        expect(options).toEqual({ preventScroll: true });
        actions.push("heading");
      },
    };
    const screen = { focus: () => actions.push("screen") };
    const root = {
      querySelectorAll: () => [heading],
      querySelector(selector: string): unknown {
        if (selector === ".topbar") return { getBoundingClientRect: () => ({ bottom: 71.2 }) };
        if (selector === ".tabbar") return null;
        if (selector === "#screen") return screen;
        return null;
      },
    };

    vi.stubGlobal("window", {
      innerHeight: 844,
      getComputedStyle: () => ({ position: "sticky" }),
      scrollBy: () => actions.push("adjust"),
    });
    try {
      focusImportReceiptAfterRefresh(root as unknown as HTMLElement, "receipt-1");
      expect(heading.style.scrollMarginTop).toBe("84px");
      expect(heading.style.scrollMarginBottom).toBe("12px");
      expect(actions).toEqual(["scroll", "heading"]);

      heading.dataset.importReceiptHeading = "other";
      focusImportReceiptAfterRefresh(root as unknown as HTMLElement, "receipt-1");
      expect(actions).toEqual(["scroll", "heading", "screen"]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
