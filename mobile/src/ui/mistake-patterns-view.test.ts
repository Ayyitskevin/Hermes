import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  MISTAKE_PATTERNS_EVIDENCE_PAGE_SIZE,
  MISTAKE_PATTERNS_GROUP_PAGE_SIZE,
  bindMistakePatternsView,
  mistakePatternsSection,
} from "./mistake-patterns-view";

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
        mistakes: [`Mistake ${String(index).padStart(2, "0")}`],
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
        mistakes: ["Chased entry"],
        tradedOn: "2026-07-10",
        sessionLabel: `Bulk ${String(index).padStart(2, "0")}`,
      });
    }),
  };
}

describe("mistake-patterns presentation", () => {
  it("renders the exact count-only demo cohort, evidence, and governance copy", () => {
    const html = mistakePatternsSection(DEMO_WORKSPACE);

    expect(html).toContain(
      '<section class="card plan-check-card mistake-patterns-card" aria-labelledby="mistake-patterns-title" data-mistake-patterns>',
    );
    expect(html).toContain(
      '<h2 id="mistake-patterns-title" class="report-target" tabindex="-1">Mistake patterns</h2>',
    );
    expect(html).toContain("FICTIONAL DEMO");
    expect(html).toContain("mistake-patterns-report-v1");
    expect(html).toContain(
      "f94fc896308348f55a665aeafba665f0f3d4ee50fc225c4dba1087bc2babad3c",
    );
    expect(html).toContain("Current completed review heads");
    expect(html).toContain("2 unique trades of 8 trades");
    expect(html).toContain("2 saved mistake assignments");
    expect(html).toContain(
      "0 pending or draft · 6 completed without a saved mistake",
    );
    expect(html).not.toContain("<dt>Currency</dt>");
    expect(html).not.toContain("Cash expectancy");
    expect(html).not.toContain("Average R");
    expect(html).not.toContain("Exact net P&amp;L");

    const chased = html.indexOf("<strong>Chased entry</strong><span>1 saved assignment</span>");
    const early = html.indexOf("<strong>Early entry</strong><span>1 saved assignment</span>");
    expect(chased).toBeGreaterThan(-1);
    expect(early).toBeGreaterThan(chased);
    expect(Array.from(
      html.matchAll(/data-mistake-patterns-trade="([^"]+)"/g),
      (match) => match[1],
    )).toEqual(["demo-subject-spy", "demo-subject-tsla"]);
    expect(html.match(/data-trade-review-report-source="mistake-patterns"/g))
      .toHaveLength(2);
    expect(html).toContain(
      'aria-label="Open SPY trade for saved mistake Chased entry — ETF, Demo Swing, Jul 7 · Afternoon"',
    );
    expect(html).toContain('datetime="2026-07-07"');
    expect(html).toContain("Older immutable review versions do not compete");
    expect(html).toContain("once in every exact saved mistake group");
    expect(html).toContain("can exceed unique included trades");
    expect(html).toContain("never count or performance rank");
    expect(html).toContain("do not measure severity, establish cause");
  });

  it("separates overlapping assignments from unique trades and escapes exact evidence", () => {
    const spy = cloneTrade(demoTrade("SPY"), "hostile", {
      tradeSubjectId: `subject-" onclick="<hostile>&'`,
      symbol: `<SPY & "friends">`,
      accountLabel: `<Broker & "One">`,
      sessionLabel: `<Jul 7 & "afternoon">`,
      mistakes: [`<Chased & "entry">`, "Early entry"],
    });
    const tsla = cloneTrade(demoTrade("TSLA"), "overlap", {
      mistakes: ["Early entry"],
    });
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      provenance: "local",
      periodLabel: `<all & "history">`,
      timeZone: `<UTC & "local">`,
      accountLabel: `<all accounts & "scope">`,
      trades: [spy, tsla],
    };
    const html = mistakePatternsSection(snapshot);

    expect(html).toContain("2 unique trades of 2 trades");
    expect(html).toContain("3 saved mistake assignments");
    expect(html.match(/data-mistake-patterns-trade=/g)).toHaveLength(3);
    expect(html).toContain("&lt;SPY &amp; &quot;friends&quot;&gt;");
    expect(html).toContain("&lt;Chased &amp; &quot;entry&quot;&gt;");
    expect(html).toContain("&lt;Jul 7 &amp; &quot;afternoon&quot;&gt;");
    expect(html).toContain("&lt;Broker &amp; &quot;One&quot;&gt;");
    expect(html).toContain("&lt;all &amp; &quot;history&quot;&gt;");
    expect(html).toContain("&lt;UTC &amp; &quot;local&quot;&gt;");
    expect(html).toContain("&lt;all accounts &amp; &quot;scope&quot;&gt;");
    expect(html).toContain(
      'data-mistake-patterns-trade="subject-&quot; onclick=&quot;&lt;hostile&gt;&amp;&#039;"',
    );
    expect(html).not.toContain(`<SPY & "friends">`);
    expect(html).not.toContain(`<Chased & "entry">`);
  });

  it("renders a neutral empty assigned cohort without stale vocabulary groups", () => {
    const html = mistakePatternsSection({
      ...DEMO_WORKSPACE,
      provenance: "empty",
      trades: DEMO_WORKSPACE.trades.map((trade) => ({ ...trade, mistakes: [] })),
      reviewOptions: {
        ...DEMO_WORKSPACE.reviewOptions,
        mistakes: ["Stale vocabulary"],
      },
    });

    expect(html).toContain("NEW");
    expect(html).toContain("0 unique trades of 8 trades");
    expect(html).toContain("0 saved mistake assignments");
    expect(html).toContain("0 pending or draft · 8 completed without a saved mistake");
    expect(html).toContain(
      "No current completed reviews with a saved mistake label are available.",
    );
    expect(html).not.toContain("Stale vocabulary");
    expect(html).not.toContain("data-mistake-patterns-group-index=");
    expect(html).not.toContain("data-mistake-patterns-trade=");
    expect(html).not.toContain("data-mistake-patterns-more=");
  });

  it("bounds group pages and focuses each newly revealed exact-label group", () => {
    const snapshot = workspaceWithManyGroups(12);
    const html = mistakePatternsSection(snapshot);

    expect(MISTAKE_PATTERNS_GROUP_PAGE_SIZE).toBe(5);
    expect(html.match(/data-mistake-patterns-group-index=/g)).toHaveLength(5);
    expect(html).toContain("Showing 5 of 12 mistake groups");
    expect(html).toContain("Show 5 more mistake groups");
    expect(html).toContain("<strong>Mistake 04</strong>");
    expect(html).not.toContain("<strong>Mistake 05</strong>");

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
    const groupStatus = { textContent: "Showing 5 of 12 mistake groups" };
    const groupButton = {
      hidden: false,
      textContent: "Show 5 more mistake groups",
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
      ["[data-mistake-patterns-groups]", groups],
      ["[data-mistake-patterns-groups-showing]", groupStatus],
      ["[data-mistake-patterns-groups-more]", groupButton],
    ]);
    for (let index = 0; index < 12; index += 1) {
      controls.set(`[data-mistake-patterns-evidence-list="${index}"]`, completeControls.list);
      controls.set(`[data-mistake-patterns-showing="${index}"]`, completeControls.status);
      controls.set(`[data-mistake-patterns-more="${index}"]`, completeControls.button);
    }
    const section = { querySelector: (selector: string): unknown => controls.get(selector) ?? null };
    const root = {
      querySelector(selector: string): unknown {
        expect(selector).toBe("[data-mistake-patterns]");
        return section;
      },
    };

    bindMistakePatternsView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    clicks[0]?.();
    expect(inserted[0]?.match(/data-mistake-patterns-group-index=/g)).toHaveLength(5);
    expect(inserted[0]).toContain('data-mistake-patterns-group-index="5"');
    expect(groupStatus.textContent).toBe("Showing 10 of 12 mistake groups");
    expect(groupButton.textContent).toBe("Show 2 more mistake groups");
    expect(focused).toEqual(['[data-mistake-patterns-group-index="5"] > summary']);

    clicks[0]?.();
    expect(inserted[1]?.match(/data-mistake-patterns-group-index=/g)).toHaveLength(2);
    expect(groupStatus.textContent).toBe("Showing 12 of 12 mistake groups");
    expect(groupButton.hidden).toBe(true);
    expect(focused).toEqual([
      '[data-mistake-patterns-group-index="5"] > summary',
      '[data-mistake-patterns-group-index="10"] > summary',
    ]);
  });

  it("reveals assigned trades in bounded pages and focuses final status", () => {
    const snapshot = workspaceWithManyContributors(56);
    const html = mistakePatternsSection(snapshot);

    expect(MISTAKE_PATTERNS_EVIDENCE_PAGE_SIZE).toBe(25);
    expect(html.match(/data-mistake-patterns-trade=/g)).toHaveLength(25);
    expect(html).toContain("Showing 25 of 56 assigned trades");
    expect(html).toContain("Show 25 more");
    expect(html).not.toContain('data-mistake-patterns-trade="demo-subject-spy-bulk-25"');

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
      ['[data-mistake-patterns-evidence-list="0"]', list],
      ['[data-mistake-patterns-showing="0"]', status],
      ['[data-mistake-patterns-more="0"]', button],
    ]);
    const section = { querySelector: (selector: string): unknown => controls.get(selector) ?? null };
    const root = { querySelector: (): unknown => section };

    bindMistakePatternsView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    clicks[0]?.();
    expect(inserted[0]?.match(/data-mistake-patterns-trade=/g)).toHaveLength(25);
    expect(inserted[0]).toContain('data-mistake-patterns-trade="demo-subject-spy-bulk-25"');
    expect(inserted[0]).not.toContain('data-mistake-patterns-trade="demo-subject-spy-bulk-50"');
    expect(status.textContent).toBe("Showing 50 of 56 assigned trades");
    expect(button.textContent).toBe("Show 6 more");
    expect(statusFocused).toBe(false);

    clicks[0]?.();
    expect(inserted[1]?.match(/data-mistake-patterns-trade=/g)).toHaveLength(6);
    expect(inserted[1]).toContain('data-mistake-patterns-trade="demo-subject-spy-bulk-55"');
    expect(status.textContent).toBe("Showing 56 of 56 assigned trades");
    expect(button.hidden).toBe(true);
    expect(statusFocused).toBe(true);
  });

  it("fails closed when progressive controls are incomplete", () => {
    const snapshot = workspaceWithManyContributors(26);
    const section = {
      querySelector(selector: string): unknown {
        if (selector === '[data-mistake-patterns-evidence-list="0"]') return {};
        if (selector === '[data-mistake-patterns-more="0"]') return {};
        return null;
      },
    };
    const root = { querySelector: (): unknown => section };

    expect(() => bindMistakePatternsView(
      root as unknown as HTMLElement,
      snapshot,
    )).toThrow("Mistake-pattern evidence controls are incomplete for group 0.");
  });
});
