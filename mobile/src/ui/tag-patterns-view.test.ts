import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  TAG_PATTERNS_EVIDENCE_PAGE_SIZE,
  TAG_PATTERNS_GROUP_PAGE_SIZE,
  bindTagPatternsView,
  tagPatternsSection,
} from "./tag-patterns-view";

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

function workspaceWithManyGroups(count: number): JournalWorkspaceSnapshot {
  const spy = demoTrade("SPY");
  return {
    ...DEMO_WORKSPACE,
    trades: Array.from({ length: count }, (_, index) => {
      const suffix = `group-${String(index).padStart(2, "0")}`;
      return cloneTrade(spy, suffix, {
        tags: [`Tag ${String(index).padStart(2, "0")}`],
      });
    }),
  };
}

function workspaceWithManyContributors(count: number): JournalWorkspaceSnapshot {
  const spy = demoTrade("SPY");
  return {
    ...DEMO_WORKSPACE,
    trades: Array.from({ length: count }, (_, index) => {
      const suffix = `bulk-${String(index).padStart(2, "0")}`;
      return cloneTrade(spy, suffix, {
        tags: ["Plan followed"],
        tradedOn: "2026-07-10",
        sessionLabel: `Bulk ${String(index).padStart(2, "0")}`,
      });
    }),
  };
}

describe("tag-patterns presentation", () => {
  it("renders the exact count-only demo cohort, first bounded groups, and governance copy", () => {
    const html = tagPatternsSection(DEMO_WORKSPACE);

    expect(html).toContain(
      '<section class="card plan-check-card tag-patterns-card" aria-labelledby="tag-patterns-title" data-tag-patterns>',
    );
    expect(html).toContain(
      '<h2 id="tag-patterns-title" class="report-target" tabindex="-1">Tag patterns</h2>',
    );
    expect(html).toContain("FICTIONAL DEMO");
    expect(html).toContain("tag-patterns-report-v1");
    expect(html).toContain(
      "ad24da67086c74558203d89b9fe27f2d8907f6170b29fa5320e0aada88405c27",
    );
    expect(html).toContain("Current completed review heads");
    expect(html).toContain("8 unique trades of 8 trades");
    expect(html).toContain("16 saved tag assignments");
    expect(html).toContain(
      "0 pending or draft · 0 completed without a saved tag",
    );
    expect(html).not.toContain("<dt>Currency</dt>");
    expect(html).not.toContain("Cash expectancy");
    expect(html).not.toContain("Average R");
    expect(html).not.toContain("Exact net P&amp;L");

    expect(Array.from(
      html.matchAll(/data-tag-patterns-group-index="([^"]+)"/g),
      (match) => match[1],
    )).toEqual(["0", "1", "2", "3", "4"]);
    const chased = html.indexOf("<strong>Chased entry</strong><span>1 saved assignment</span>");
    const earlyEntry = html.indexOf("<strong>Early entry</strong><span>1 saved assignment</span>");
    const earlyExit = html.indexOf("<strong>Early exit</strong><span>1 saved assignment</span>");
    const invalidation = html.indexOf("<strong>Invalidation respected</strong>");
    const opening = html.indexOf("<strong>Opening range</strong>");
    expect(chased).toBeGreaterThan(-1);
    expect(earlyEntry).toBeGreaterThan(chased);
    expect(earlyExit).toBeGreaterThan(earlyEntry);
    expect(invalidation).toBeGreaterThan(earlyExit);
    expect(opening).toBeGreaterThan(invalidation);
    expect(html).not.toContain("<strong>Patient entry</strong>");
    expect(html).toContain("Showing 5 of 12 tag groups");
    expect(html).toContain("Show 5 more tag groups");
    expect(Array.from(
      html.matchAll(/data-tag-patterns-trade="([^"]+)"/g),
      (match) => match[1],
    )).toEqual([
      "demo-subject-spy",
      "demo-subject-tsla",
      "demo-subject-qqq",
      "demo-subject-tsla",
      "demo-subject-aapl",
    ]);
    expect(html.match(/data-trade-review-report-source="tag-patterns"/g))
      .toHaveLength(5);
    expect(html).toContain(
      'aria-label="Open SPY trade for saved tag Chased entry — ETF, Demo Swing, Jul 7 · Afternoon"',
    );
    expect(html).toContain("total assignments and summed group counts can exceed");
    expect(html).toContain("never count or performance rank");
    expect(html).toContain("does not read tag vocabulary, Daily Journal tags");
    expect(html).toContain("do not establish importance or cause");
  });

  it("separates overlapping assignments from unique trades and escapes evidence", () => {
    const spy = cloneTrade(demoTrade("SPY"), "hostile", {
      tradeSubjectId: `subject-" onclick="<hostile>&'`,
      symbol: `<SPY & "friends">`,
      accountLabel: `<Broker & "One">`,
      sessionLabel: `<Jul 7 & "afternoon">`,
      tags: [`<Chased & "entry">`, "Early entry"],
    });
    const tsla = cloneTrade(demoTrade("TSLA"), "overlap", {
      tags: ["Early entry"],
    });
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      provenance: "local",
      periodLabel: `<all & "history">`,
      timeZone: `<UTC & "local">`,
      accountLabel: `<all accounts & "scope">`,
      trades: [spy, tsla],
    };
    const html = tagPatternsSection(snapshot);

    expect(html).toContain("2 unique trades of 2 trades");
    expect(html).toContain("3 saved tag assignments");
    expect(html.match(/data-tag-patterns-trade=/g)).toHaveLength(3);
    expect(html).toContain("&lt;SPY &amp; &quot;friends&quot;&gt;");
    expect(html).toContain("&lt;Chased &amp; &quot;entry&quot;&gt;");
    expect(html).toContain("&lt;Jul 7 &amp; &quot;afternoon&quot;&gt;");
    expect(html).toContain("&lt;Broker &amp; &quot;One&quot;&gt;");
    expect(html).toContain("&lt;all &amp; &quot;history&quot;&gt;");
    expect(html).toContain("&lt;UTC &amp; &quot;local&quot;&gt;");
    expect(html).toContain("&lt;all accounts &amp; &quot;scope&quot;&gt;");
    expect(html).toContain(
      'data-tag-patterns-trade="subject-&quot; onclick=&quot;&lt;hostile&gt;&amp;&#039;"',
    );
    expect(html).not.toContain(`<SPY & "friends">`);
    expect(html).not.toContain(`<Chased & "entry">`);
  });

  it("renders a neutral empty assigned cohort without vocabulary or Daily Journal groups", () => {
    const html = tagPatternsSection({
      ...DEMO_WORKSPACE,
      provenance: "empty",
      trades: DEMO_WORKSPACE.trades.map((trade) => ({ ...trade, tags: [] })),
      reviewOptions: {
        ...DEMO_WORKSPACE.reviewOptions,
        tags: ["Stale vocabulary"],
      },
    });

    expect(html).toContain("NEW");
    expect(html).toContain("0 unique trades of 8 trades");
    expect(html).toContain("0 saved tag assignments");
    expect(html).toContain("0 pending or draft · 8 completed without a saved tag");
    expect(html).toContain(
      "No current completed reviews with a saved tag are available.",
    );
    expect(html).not.toContain("Stale vocabulary");
    expect(html).not.toContain("Reversal");
    expect(html).not.toContain("data-tag-patterns-group-index=");
    expect(html).not.toContain("data-tag-patterns-trade=");
    expect(html).not.toContain("data-tag-patterns-more=");
  });

  it("bounds group pages and focuses each newly revealed exact-label group", () => {
    const snapshot = workspaceWithManyGroups(12);
    const html = tagPatternsSection(snapshot);

    expect(TAG_PATTERNS_GROUP_PAGE_SIZE).toBe(5);
    expect(html.match(/data-tag-patterns-group-index=/g)).toHaveLength(5);
    expect(html).toContain("Showing 5 of 12 tag groups");
    expect(html).toContain("Show 5 more tag groups");
    expect(html).toContain("<strong>Tag 04</strong>");
    expect(html).not.toContain("<strong>Tag 05</strong>");

    const inserted: string[] = [];
    const clicks: Array<() => void> = [];
    const focused: string[] = [];
    const groups = {
      insertAdjacentHTML(position: string, appendedHtml: string): void {
        expect(position).toBe("beforeend");
        inserted.push(appendedHtml);
      },
      querySelector(selector: string): { focus(options: FocusOptions): void } {
        return { focus(options: FocusOptions): void {
          expect(options).toEqual({ preventScroll: true });
          focused.push(selector);
        } };
      },
    };
    const groupStatus = { textContent: "Showing 5 of 12 tag groups" };
    const groupButton = {
      hidden: false,
      textContent: "Show 5 more tag groups",
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
        textContent: "All assigned trades shown",
        addEventListener: (): never => { throw new Error("Unexpected listener."); },
      },
    };
    const controls = new Map<string, unknown>([
      ["[data-tag-patterns-groups]", groups],
      ["[data-tag-patterns-groups-showing]", groupStatus],
      ["[data-tag-patterns-groups-more]", groupButton],
    ]);
    for (let index = 0; index < 12; index += 1) {
      controls.set(`[data-tag-patterns-evidence-list="${index}"]`, completeControls.list);
      controls.set(`[data-tag-patterns-showing="${index}"]`, completeControls.status);
      controls.set(`[data-tag-patterns-more="${index}"]`, completeControls.button);
    }
    const section = { querySelector: (selector: string): unknown => controls.get(selector) ?? null };
    const root = {
      querySelector(selector: string): unknown {
        expect(selector).toBe("[data-tag-patterns]");
        return section;
      },
    };

    bindTagPatternsView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    clicks[0]?.();
    expect(inserted[0]?.match(/data-tag-patterns-group-index=/g)).toHaveLength(5);
    expect(inserted[0]).toContain('data-tag-patterns-group-index="5"');
    expect(groupStatus.textContent).toBe("Showing 10 of 12 tag groups");
    expect(groupButton.textContent).toBe("Show 2 more tag groups");
    expect(focused).toEqual(['[data-tag-patterns-group-index="5"] > summary']);

    clicks[0]?.();
    expect(inserted[1]?.match(/data-tag-patterns-group-index=/g)).toHaveLength(2);
    expect(groupStatus.textContent).toBe("Showing 12 of 12 tag groups");
    expect(groupButton.hidden).toBe(true);
    expect(focused).toEqual([
      '[data-tag-patterns-group-index="5"] > summary',
      '[data-tag-patterns-group-index="10"] > summary',
    ]);
  });

  it("reveals assigned trades in bounded pages and focuses final status", () => {
    const snapshot = workspaceWithManyContributors(56);
    const html = tagPatternsSection(snapshot);

    expect(TAG_PATTERNS_EVIDENCE_PAGE_SIZE).toBe(25);
    expect(html.match(/data-tag-patterns-trade=/g)).toHaveLength(25);
    expect(html).toContain("Showing 25 of 56 assigned trades");
    expect(html).toContain("Show 25 more");
    expect(html).not.toContain('data-tag-patterns-trade="demo-subject-spy-bulk-25"');

    const inserted: string[] = [];
    const clicks: Array<() => void> = [];
    let statusFocused = false;
    const list = {
      insertAdjacentHTML(position: string, appendedHtml: string): void {
        expect(position).toBe("beforeend");
        inserted.push(appendedHtml);
      },
    };
    const status = {
      textContent: "Showing 25 of 56 assigned trades",
      focus(options: FocusOptions): void {
        expect(options).toEqual({ preventScroll: true });
        statusFocused = true;
      },
    };
    const button = {
      hidden: false,
      textContent: "Show 25 more",
      addEventListener(event: string, listener: () => void): void {
        expect(event).toBe("click");
        clicks.push(listener);
      },
    };
    const controls = new Map<string, unknown>([
      ['[data-tag-patterns-evidence-list="0"]', list],
      ['[data-tag-patterns-showing="0"]', status],
      ['[data-tag-patterns-more="0"]', button],
    ]);
    const section = { querySelector: (selector: string): unknown => controls.get(selector) ?? null };
    const root = { querySelector: (): unknown => section };

    bindTagPatternsView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    clicks[0]?.();
    expect(inserted[0]?.match(/data-tag-patterns-trade=/g)).toHaveLength(25);
    expect(inserted[0]).toContain('data-tag-patterns-trade="demo-subject-spy-bulk-25"');
    expect(inserted[0]).not.toContain('data-tag-patterns-trade="demo-subject-spy-bulk-50"');
    expect(status.textContent).toBe("Showing 50 of 56 assigned trades");
    expect(button.textContent).toBe("Show 6 more");
    expect(statusFocused).toBe(false);

    clicks[0]?.();
    expect(inserted[1]?.match(/data-tag-patterns-trade=/g)).toHaveLength(6);
    expect(inserted[1]).toContain('data-tag-patterns-trade="demo-subject-spy-bulk-55"');
    expect(status.textContent).toBe("Showing 56 of 56 assigned trades");
    expect(button.hidden).toBe(true);
    expect(statusFocused).toBe(true);
  });

  it("fails closed when progressive controls are incomplete", () => {
    const snapshot = workspaceWithManyContributors(26);
    const section = {
      querySelector(selector: string): unknown {
        if (selector === '[data-tag-patterns-evidence-list="0"]') return {};
        if (selector === '[data-tag-patterns-more="0"]') return {};
        return null;
      },
    };
    const root = { querySelector: (): unknown => section };

    expect(() => bindTagPatternsView(
      root as unknown as HTMLElement,
      snapshot,
    )).toThrow("Tag-pattern evidence controls are incomplete for group 0.");
  });
});
