import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  bindSetupPerformanceView,
  SETUP_BREAKDOWN_EVIDENCE_PAGE_SIZE,
  SETUP_BREAKDOWN_GROUP_PAGE_SIZE,
  setupPerformanceSection,
} from "./setup-performance-view";

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

function workspaceWithEscapingAndExclusions(): JournalWorkspaceSnapshot {
  const aapl = demoTrade("AAPL");
  const escaped = cloneTrade(aapl, "escaped", {
    tradeSubjectId: `subject-" onclick="<hostile>&'`,
    symbol: `<AAPL & "friends">`,
    setup: `<Breakout & "fast">`,
    sessionLabel: `<Jul 1 & "morning">`,
    accountLabel: `<Broker & "One">`,
  });
  const open = cloneTrade(aapl, "open", { status: "open" });
  const missing = cloneTrade(aapl, "missing", {
    resultPnl: null,
    resultPnlExact: null,
  });
  const draft = cloneTrade(aapl, "draft", { reviewStatus: "draft" });
  const unclassified = cloneTrade(aapl, "unclassified", {
    setup: "Unclassified",
    hasClassifiedSetup: false,
  });

  return {
    ...DEMO_WORKSPACE,
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
    periodLabel: `<all & "history">`,
    timeZone: `<UTC & "local">`,
    accountLabel: `<all accounts & "scope">`,
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

function workspaceWithManyContributors(count: number): JournalWorkspaceSnapshot {
  const aapl = demoTrade("AAPL");
  return {
    ...DEMO_WORKSPACE,
    trades: Array.from({ length: count }, (_, index) => {
      const suffix = `bulk-${String(index).padStart(2, "0")}`;
      return cloneTrade(aapl, suffix, {
        tradedOn: "2026-07-10",
        sessionLabel: `Bulk ${String(index).padStart(2, "0")}`,
      });
    }),
  };
}

function workspaceWithManySetupGroups(count: number): JournalWorkspaceSnapshot {
  const aapl = demoTrade("AAPL");
  return {
    ...DEMO_WORKSPACE,
    trades: Array.from({ length: count }, (_, index) => {
      const suffix = `group-${String(index).padStart(2, "0")}`;
      return cloneTrade(aapl, suffix, {
        setup: `Setup ${String(index).padStart(2, "0")}`,
        hasClassifiedSetup: true,
      });
    }),
  };
}

describe("setup-performance presentation", () => {
  it("renders exact demo groups, values, evidence order, metadata, and disclosure", () => {
    const html = setupPerformanceSection(DEMO_WORKSPACE);

    expect(html).toContain(
      '<section class="card plan-check-card setup-performance-card" aria-labelledby="setup-performance-title" data-setup-performance>',
    );
    expect(html).toContain('<h2 id="setup-performance-title" class="report-target" tabindex="-1">Setup breakdown</h2>');
    expect(html).toContain("FICTIONAL DEMO");
    expect(html).toContain("setup-performance-report-v1");
    expect(html).toContain(
      "5779276cbbc4278136f96bbaca167216c60b395cdad4a8bb4cf9c3b5f272601b",
    );
    expect(html).toContain("Jul 1–9, 2026");
    expect(html).toContain("USD");
    expect(html).toContain("UTC");
    expect(html).toContain("Demo Brokerage");
    expect(html).toContain("Completed reviewed closed trades with a classified setup");
    expect(html).toContain("8 of 8 trades");
    expect(html).toContain(
      "0 open or partial · 0 without realized P&amp;L · 0 with an incomplete review · 0 with an unclassified setup",
    );

    expect(html.match(/data-setup-performance-group-index=/g)).toHaveLength(3);
    const breakout = html.indexOf(
      "<strong>Breakout</strong><span>3 reviewed closed trades</span>",
    );
    const pullback = html.indexOf(
      "<strong>Pullback</strong><span>3 reviewed closed trades</span>",
    );
    const reversal = html.indexOf(
      "<strong>Reversal</strong><span>2 reviewed closed trades</span>",
    );
    expect(breakout).toBeGreaterThan(-1);
    expect(pullback).toBeGreaterThan(breakout);
    expect(reversal).toBeGreaterThan(pullback);

    for (const expected of [
      "+56.666666666667 USD expectancy",
      "+86.666666666667 USD expectancy",
      "-60 USD expectancy",
      "+0.566666666667R",
      "+0.866666666667R",
      "-0.6R",
      "+170 USD",
      "+260 USD",
      "-120 USD",
      "2 of 3",
      "0 of 2",
    ]) {
      expect(html).toContain(expected);
    }
    expect(Array.from(
      html.matchAll(/data-setup-performance-trade="([^"]+)"/g),
      (match) => match[1],
    )).toEqual([
      "demo-subject-spy",
      "demo-subject-amd",
      "demo-subject-aapl",
      "demo-subject-meta",
      "demo-subject-nvda",
      "demo-subject-msft",
      "demo-subject-qqq",
      "demo-subject-tsla",
    ]);

    expect(html).toContain("How this report works");
    expect(html).toContain(
      "Open or partial trades, trades without exact realized P&amp;L, incomplete reviews, and completed reviews without a saved setup are excluded in that order.",
    );
    expect(html).toContain("Saved setup text and absence are tracked separately");
    expect(html).toContain("Every included trade appears in exactly one setup group.");
    expect(html).toContain("zero is not a win");
    expect(html).toContain("round half away from zero to 12 decimal places");
    expect(html).toContain("setup-name code-unit order, never performance rank");
    expect(html).toContain("do not establish cause, predict future results, or provide investment advice");
  });

  it("escapes hostile evidence and metadata while showing every exclusion", () => {
    const html = setupPerformanceSection(workspaceWithEscapingAndExclusions());

    expect(html).toContain("&lt;AAPL &amp; &quot;friends&quot;&gt;");
    expect(html).toContain("&lt;Breakout &amp; &quot;fast&quot;&gt;");
    expect(html).toContain("&lt;Jul 1 &amp; &quot;morning&quot;&gt;");
    expect(html).toContain("&lt;Broker &amp; &quot;One&quot;&gt;");
    expect(html).toContain("&lt;all &amp; &quot;history&quot;&gt;");
    expect(html).toContain("&lt;UTC &amp; &quot;local&quot;&gt;");
    expect(html).toContain("&lt;all accounts &amp; &quot;scope&quot;&gt;");
    expect(html).toContain(
      'data-setup-performance-trade="subject-&quot; onclick=&quot;&lt;hostile&gt;&amp;&#039;"',
    );
    expect(html).not.toContain(`<AAPL & "friends">`);
    expect(html).not.toContain(`<Breakout & "fast">`);
    expect(html).not.toContain(`<Broker & "One">`);
    expect(html).not.toContain(`<all accounts & "scope">`);

    expect(html).toContain("8 of 12 trades");
    expect(html).toContain(
      "1 open or partial · 1 without realized P&amp;L · 1 with an incomplete review · 1 with an unclassified setup",
    );
    for (const suffix of ["open", "missing", "draft", "unclassified"]) {
      expect(html).not.toContain(`data-setup-performance-trade="demo-subject-aapl-${suffix}"`);
    }
  });

  it("renders a neutral empty cohort without disclosure controls for groups", () => {
    const html = setupPerformanceSection({
      ...DEMO_WORKSPACE,
      provenance: "empty",
      provenanceLabel: "EMPTY JOURNAL",
      trades: [],
    });

    expect(html).toContain('<h2 id="setup-performance-title" class="report-target" tabindex="-1">Setup breakdown</h2>');
    expect(html).toContain("NEW");
    expect(html).toContain("0 of 0 trades");
    expect(html).toContain(
      "0 open or partial · 0 without realized P&amp;L · 0 with an incomplete review · 0 with an unclassified setup",
    );
    expect(html).toContain(
      "No completed reviewed closed trades with a classified setup are available.",
    );
    expect(html).not.toContain("data-setup-performance-group-index=");
    expect(html).not.toContain("data-setup-performance-trade=");
    expect(html).not.toContain("data-setup-performance-more=");
  });

  it("bounds group pages and focuses each newly revealed group", () => {
    const snapshot = workspaceWithManySetupGroups(12);
    const html = setupPerformanceSection(snapshot);

    expect(SETUP_BREAKDOWN_GROUP_PAGE_SIZE).toBe(5);
    expect(html.match(/data-setup-performance-group-index=/g)).toHaveLength(5);
    expect(html.match(/data-setup-performance-trade=/g)).toHaveLength(5);
    expect(html).toContain("Showing 5 of 12 setup groups");
    expect(html).toContain(
      'data-setup-performance-groups-more aria-controls="setup-performance-groups">Show 5 more setup groups</button>',
    );
    expect(html).toContain("<strong>Setup 00</strong>");
    expect(html).toContain("<strong>Setup 04</strong>");
    expect(html).not.toContain("<strong>Setup 05</strong>");

    const inserted: string[] = [];
    const clicks: Array<() => void> = [];
    const focusedGroupSelectors: string[] = [];
    const groups = {
      insertAdjacentHTML(position: string, appendedHtml: string): void {
        expect(position).toBe("beforeend");
        inserted.push(appendedHtml);
      },
      querySelector(selector: string): { focus(options: FocusOptions): void } {
        return {
          focus(options: FocusOptions): void {
            expect(options).toEqual({ preventScroll: true });
            focusedGroupSelectors.push(selector);
          },
        };
      },
    };
    const groupStatus = {
      textContent: "Showing 5 of 12 setup groups",
      focus(): never {
        throw new Error("Group status must not take focus from revealed content.");
      },
    };
    const groupButton = {
      hidden: false,
      textContent: "Show 5 more setup groups",
      addEventListener(event: string, listener: () => void): void {
        expect(event).toBe("click");
        clicks.push(listener);
      },
    };
    const completeControls = {
      list: { insertAdjacentHTML: (): never => { throw new Error("Unexpected evidence append."); } },
      status: { textContent: "", focus: (): never => { throw new Error("Unexpected evidence focus."); } },
      button: {
        hidden: true,
        textContent: "All contributors shown",
        addEventListener: (): never => { throw new Error("Unexpected evidence listener."); },
      },
    };
    const controls = new Map<string, unknown>([
      ["[data-setup-performance-groups]", groups],
      ["[data-setup-performance-groups-showing]", groupStatus],
      ["[data-setup-performance-groups-more]", groupButton],
    ]);
    for (let index = 0; index < 12; index += 1) {
      controls.set(`[data-setup-performance-evidence-list="${index}"]`, completeControls.list);
      controls.set(`[data-setup-performance-showing="${index}"]`, completeControls.status);
      controls.set(`[data-setup-performance-more="${index}"]`, completeControls.button);
    }
    const section = {
      querySelector(selector: string): unknown {
        return controls.get(selector) ?? null;
      },
    };
    const root = {
      querySelector(selector: string): unknown {
        expect(selector).toBe("[data-setup-performance]");
        return section;
      },
    };

    bindSetupPerformanceView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    const click = clicks[0];
    if (click === undefined) throw new Error("Missing group disclosure listener.");

    click();
    expect(inserted[0]?.match(/data-setup-performance-group-index=/g)).toHaveLength(5);
    expect(inserted[0]?.match(/data-setup-performance-trade=/g)).toHaveLength(5);
    expect(inserted[0]).toContain('data-setup-performance-group-index="5"');
    expect(inserted[0]).toContain('data-setup-performance-group-index="9"');
    expect(inserted[0]).not.toContain('data-setup-performance-group-index="10"');
    expect(groupStatus.textContent).toBe("Showing 10 of 12 setup groups");
    expect(groupButton.textContent).toBe("Show 2 more setup groups");
    expect(groupButton.hidden).toBe(false);
    expect(focusedGroupSelectors).toEqual([
      '[data-setup-performance-group-index="5"] > summary',
    ]);

    click();
    expect(inserted[1]?.match(/data-setup-performance-group-index=/g)).toHaveLength(2);
    expect(inserted[1]?.match(/data-setup-performance-trade=/g)).toHaveLength(2);
    expect(inserted[1]).toContain('data-setup-performance-group-index="10"');
    expect(inserted[1]).toContain('data-setup-performance-group-index="11"');
    expect(groupStatus.textContent).toBe("Showing 12 of 12 setup groups");
    expect(groupButton.hidden).toBe(true);
    expect(focusedGroupSelectors).toEqual([
      '[data-setup-performance-group-index="5"] > summary',
      '[data-setup-performance-group-index="10"] > summary',
    ]);
  });

  it("reveals contributors in bounded pages and focuses status at completion", () => {
    const snapshot = workspaceWithManyContributors(56);
    const html = setupPerformanceSection(snapshot);

    expect(SETUP_BREAKDOWN_EVIDENCE_PAGE_SIZE).toBe(25);
    expect(bindSetupPerformanceView).toBeTypeOf("function");
    expect(html.match(/data-setup-performance-trade=/g)).toHaveLength(25);
    expect(html).toContain("Showing 25 of 56 contributing trades");
    expect(html).toContain(
      'data-setup-performance-more="0" aria-controls="setup-performance-evidence-0">Show 25 more</button>',
    );
    expect(html).toContain('data-setup-performance-trade="demo-subject-aapl-bulk-00"');
    expect(html).toContain('data-setup-performance-trade="demo-subject-aapl-bulk-24"');
    expect(html).not.toContain('data-setup-performance-trade="demo-subject-aapl-bulk-25"');

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
      textContent: "Showing 25 of 56 contributing trades",
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
      ['[data-setup-performance-evidence-list="0"]', list],
      ['[data-setup-performance-showing="0"]', status],
      ['[data-setup-performance-more="0"]', button],
    ]);
    const section = {
      querySelector(selector: string): unknown {
        return controls.get(selector) ?? null;
      },
    };
    const root = {
      querySelector(selector: string): unknown {
        expect(selector).toBe("[data-setup-performance]");
        return section;
      },
    };

    bindSetupPerformanceView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    const click = clicks[0];
    if (click === undefined) throw new Error("Missing progressive disclosure listener.");

    click();
    expect(inserted[0]?.match(/data-setup-performance-trade=/g)).toHaveLength(25);
    expect(inserted[0]).toContain(
      'data-setup-performance-trade="demo-subject-aapl-bulk-25"',
    );
    expect(inserted[0]).toContain(
      'data-setup-performance-trade="demo-subject-aapl-bulk-49"',
    );
    expect(inserted[0]).not.toContain(
      'data-setup-performance-trade="demo-subject-aapl-bulk-50"',
    );
    expect(status.textContent).toBe("Showing 50 of 56 contributing trades");
    expect(button.textContent).toBe("Show 6 more");
    expect(button.hidden).toBe(false);
    expect(statusFocused).toBe(false);

    click();
    expect(inserted[1]?.match(/data-setup-performance-trade=/g)).toHaveLength(6);
    expect(inserted[1]).toContain(
      'data-setup-performance-trade="demo-subject-aapl-bulk-50"',
    );
    expect(inserted[1]).toContain(
      'data-setup-performance-trade="demo-subject-aapl-bulk-55"',
    );
    expect(status.textContent).toBe("Showing 56 of 56 contributing trades");
    expect(button.hidden).toBe(true);
    expect(statusFocused).toBe(true);
  });
});
