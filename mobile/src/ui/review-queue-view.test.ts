import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  focusReviewQueueAfterRefresh,
  reviewQueueSection,
} from "./review-queue-view";

function reviewQueueWorkspace(
  provenance: JournalWorkspaceSnapshot["provenance"] = "local",
): JournalWorkspaceSnapshot {
  const pending: TradePreview = {
    ...DEMO_WORKSPACE.trades[0]!,
    reviewStatus: "pending",
    reviewId: null,
    reviewVersion: null,
    reviewSessionDates: [],
  };
  const draft: TradePreview = {
    ...DEMO_WORKSPACE.trades[1]!,
    reviewStatus: "draft",
  };
  return {
    ...DEMO_WORKSPACE,
    provenance,
    provenanceLabel: provenance === "demo" ? "FICTIONAL DEMO" : "ON-DEVICE JOURNAL",
    trades: [pending, draft, ...DEMO_WORKSPACE.trades.slice(2)],
    reviewProgress: {
      ...DEMO_WORKSPACE.reviewProgress,
      pendingTrades: 2,
      draftTrades: 1,
      completedTrades: DEMO_WORKSPACE.trades.length - 2,
    },
  };
}

describe("review queue view", () => {
  it("renders fixed draft-then-pending groups with focus targets and stable controls", () => {
    const html = reviewQueueSection(reviewQueueWorkspace());

    expect(html).toContain("data-review-queue");
    expect(html).toContain('<h2 id="review-queue-title" tabindex="-1">Trade review queue</h2><span>2 waiting</span>');
    expect(html).toContain('id="batch-review-form"');
    expect(html).toContain('id="batch-review-error" role="alert" tabindex="-1" hidden');
    expect(html).toContain('data-review-queue-group="draft"');
    expect(html).toContain('id="review-queue-group-draft-title" tabindex="-1" data-review-queue-group-title="draft">Drafts</h3><span>1 trade</span>');
    expect(html).toContain('data-review-queue-group="pending"');
    expect(html).toContain('id="review-queue-group-pending-title" tabindex="-1" data-review-queue-group-title="pending">Not started</h3><span>1 trade</span>');
    expect(html.indexOf('data-review-queue-group="draft"')).toBeLessThan(
      html.indexOf('data-review-queue-group="pending"'),
    );
    expect(html).toContain(`data-review-queue-trade="${DEMO_WORKSPACE.trades[1]!.tradeSubjectId}"`);
    expect(html).toContain(`value="${DEMO_WORKSPACE.trades[1]!.tradeSubjectId}"`);
    expect(html).toContain("Continue draft");
    expect(html).toContain(`data-review-queue-trade="${DEMO_WORKSPACE.trades[0]!.tradeSubjectId}"`);
    expect(html).toContain(`value="${DEMO_WORKSPACE.trades[0]!.tradeSubjectId}"`);
    expect(html).toContain(">Review</button>");
  });

  it("keeps a fictional queue inspectable without exposing write controls", () => {
    const html = reviewQueueSection(reviewQueueWorkspace("demo"));

    expect(html).toContain('data-review-queue-group="draft"');
    expect(html).toContain('data-review-queue-group="pending"');
    expect(html).not.toContain('id="batch-review-form"');
    expect(html).not.toContain("data-batch-review-subject");
    expect(html).toContain("Continue draft");
    expect(html).toContain(">Review</button>");
  });

  it("keeps duplicate symbols bound to their distinct stable subjects", () => {
    const base = reviewQueueWorkspace();
    const duplicateSymbol: JournalWorkspaceSnapshot = {
      ...base,
      trades: [
        { ...base.trades[0]!, symbol: base.trades[1]!.symbol },
        ...base.trades.slice(1),
      ],
    };
    const html = reviewQueueSection(duplicateSymbol);
    const pendingSubject = base.trades[0]!.tradeSubjectId;
    const draftSubject = base.trades[1]!.tradeSubjectId;

    expect(html.match(new RegExp(`<h4>${base.trades[1]!.symbol}</h4>`, "g"))).toHaveLength(2);
    expect(html).toContain(`data-review-queue-trade="${pendingSubject}"`);
    expect(html).toContain(`data-review-trade="${pendingSubject}"`);
    expect(html).toContain(`value="${pendingSubject}"`);
    expect(html).toContain(`data-review-queue-trade="${draftSubject}"`);
    expect(html).toContain(`data-review-trade="${draftSubject}"`);
    expect(html).toContain(`value="${draftSubject}"`);
  });

  it("preserves the existing all-reviewed empty state without empty group headings", () => {
    const html = reviewQueueSection(DEMO_WORKSPACE);

    expect(html).toContain('id="review-queue-clear-title" tabindex="-1"');
    expect(html).toContain("Review queue clear");
    expect(html).toContain("Every closed trade has a completed, versioned reflection.");
    expect(html).toContain("0 waiting");
    expect(html).not.toContain("data-review-queue-group=");
    expect(html).not.toContain('id="batch-review-form"');
  });

  it("escapes review labels, stable identities, and batch vocabulary", () => {
    const base = reviewQueueWorkspace();
    const hostile = {
      ...base.trades[0]!,
      tradeSubjectId: 'subject-" onclick="hostile<&',
      symbol: '<AAPL & "pending">',
      sessionLabel: '<Jul 1 & "Morning">',
    };
    const snapshot: JournalWorkspaceSnapshot = {
      ...base,
      trades: [hostile, ...base.trades.slice(1)],
      reviewOptions: {
        ...base.reviewOptions,
        tags: ['Tag <& "one">'],
      },
    };
    const html = reviewQueueSection(snapshot);

    expect(html).toContain('data-review-queue-trade="subject-&quot; onclick=&quot;hostile&lt;&amp;"');
    expect(html).toContain('&lt;AAPL &amp; &quot;pending&quot;&gt;');
    expect(html).toContain('&lt;Jul 1 &amp; &quot;Morning&quot;&gt;');
    expect(html).toContain('value="Tag &lt;&amp; &quot;one&quot;&gt;"');
    expect(html).not.toContain('onclick="hostile');
  });

  it("focuses the first rendered group below live chrome after a refresh", () => {
    const actions: string[] = [];
    const groupTitle = {
      style: { scrollMarginTop: "" },
      scrollIntoView(options: ScrollIntoViewOptions): void {
        expect(options).toEqual({ behavior: "auto", block: "start" });
        actions.push("scroll");
      },
      focus(options: FocusOptions): void {
        expect(options).toEqual({ preventScroll: true });
        actions.push("focus");
      },
    };
    const root = {
      querySelector(selector: string): unknown {
        if (selector === "[data-review-queue-group-title]") return groupTitle;
        if (selector === ".topbar") {
          return { getBoundingClientRect: () => ({ bottom: 72.2 }) };
        }
        return null;
      },
    };

    focusReviewQueueAfterRefresh(root as unknown as HTMLElement);

    expect(groupTitle.style.scrollMarginTop).toBe("89px");
    expect(actions).toEqual(["scroll", "focus"]);
  });

  it("falls back to the stable queue title when no group remains", () => {
    let focused = false;
    const queueTitle = {
      style: { scrollMarginTop: "" },
      scrollIntoView(): void {},
      focus(): void { focused = true; },
    };
    const root = {
      querySelector(selector: string): unknown {
        if (selector === "#review-queue-title") return queueTitle;
        return null;
      },
    };

    focusReviewQueueAfterRefresh(root as unknown as HTMLElement);

    expect(queueTitle.style.scrollMarginTop).toBe("16px");
    expect(focused).toBe(true);
  });
});
