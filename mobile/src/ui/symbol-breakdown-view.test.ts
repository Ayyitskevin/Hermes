import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  SYMBOL_BREAKDOWN_EVIDENCE_PAGE_SIZE,
  SYMBOL_BREAKDOWN_GROUP_PAGE_SIZE,
  bindSymbolBreakdownView,
  symbolBreakdownSection,
} from "./symbol-breakdown-view";

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
  const aapl = demoTrade("AAPL");
  return {
    ...DEMO_WORKSPACE,
    trades: Array.from({ length: count }, (_, index) => {
      const suffix = `group-${String(index).padStart(2, "0")}`;
      return cloneTrade(aapl, suffix, {
        symbol: `SYM${String(index).padStart(2, "0")}`,
      });
    }),
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

describe("symbol-breakdown presentation", () => {
  it("renders every demo trade once in the first stable, bounded symbol groups", () => {
    const html = symbolBreakdownSection(DEMO_WORKSPACE);

    expect(html).toContain(
      '<section class="card plan-check-card symbol-breakdown-card" aria-labelledby="symbol-breakdown-title" data-symbol-breakdown>',
    );
    expect(html).toContain(
      '<h2 id="symbol-breakdown-title" class="report-target" tabindex="-1">Symbol breakdown</h2>',
    );
    expect(html).toContain("FICTIONAL DEMO");
    expect(html).toContain("symbol-breakdown-report-v1");
    expect(html).toContain("Current full-workspace projection");
    expect(html).toContain("8 current trades");
    expect(Array.from(
      html.matchAll(/data-symbol-breakdown-group-index="([^"]+)"/g),
      (match) => match[1],
    )).toEqual(["0", "1", "2", "3", "4"]);
    const aapl = html.indexOf("<strong>AAPL · Stock</strong>");
    const amd = html.indexOf("<strong>AMD · Stock</strong>");
    const meta = html.indexOf("<strong>META · Stock</strong>");
    const msft = html.indexOf("<strong>MSFT · Stock</strong>");
    const nvda = html.indexOf("<strong>NVDA · Stock</strong>");
    expect(aapl).toBeGreaterThan(-1);
    expect(amd).toBeGreaterThan(aapl);
    expect(meta).toBeGreaterThan(amd);
    expect(msft).toBeGreaterThan(meta);
    expect(nvda).toBeGreaterThan(msft);
    expect(html).not.toContain("<strong>QQQ · ETF</strong>");
    expect(html).toContain("Showing 5 of 8 symbol groups");
    expect(html).toContain("Show 3 more symbol groups");
    expect(html.match(/data-symbol-breakdown-trade=/g)).toHaveLength(5);
    expect(html.match(/data-trade-review-report-source="symbol-breakdown"/g))
      .toHaveLength(5);
    expect(html).toContain(
      'aria-label="Open AAPL trade for the exact AAPL Stock symbol group — Stock, Demo Brokerage, Jul 1 · Morning"',
    );
    expect(html).toContain("every current trade exactly once");
    expect(html).toContain("never count-ranked or performance-ranked");
    expect(html).toContain(
      "Grouping does not read result values, outcomes, authored review content, or Trades filters. Review state is displayed only as evidence and does not affect inclusion or grouping; opening evidence does not consume or change a Trades filter. These counts do not explain performance, predict future results, rank opportunities, suggest actions, or provide investment advice.",
    );
    expect(html).not.toContain("Cash expectancy");
    expect(html).not.toContain("Win rate");
    expect(html).not.toContain("Average R");
    expect(html).not.toContain("Net P&amp;L");
  });

  it("keeps identical symbols separate by asset class and escapes every field", () => {
    const duplicateSymbol = "DUAL";
    const stock = cloneTrade(demoTrade("AAPL"), "stock-hostile", {
      tradeSubjectId: `subject-" onclick="<stock>&'`,
      symbol: duplicateSymbol,
      assetClass: "stock",
      accountLabel: `<Broker & "One">`,
      sessionLabel: `<Morning & "open">`,
      tradedOn: "2026-07-12",
    });
    const etf = cloneTrade(demoTrade("SPY"), "etf-hostile", {
      symbol: duplicateSymbol,
      assetClass: "etf",
      tradedOn: "2026-07-11",
    });
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      provenance: "local",
      periodLabel: `<all & "history">`,
      timeZone: `<UTC & "local">`,
      accountLabel: `<all accounts & "scope">`,
      trades: [etf, stock],
    };
    const html = symbolBreakdownSection(snapshot);

    const stockGroup = html.indexOf("DUAL · Stock");
    const etfGroup = html.indexOf("DUAL · ETF");
    expect(stockGroup).toBeGreaterThan(-1);
    expect(etfGroup).toBeGreaterThan(stockGroup);
    expect(html.match(/data-symbol-breakdown-group-index=/g)).toHaveLength(2);
    expect(html.match(/data-symbol-breakdown-trade=/g)).toHaveLength(2);
    expect(html).toContain("&lt;Broker &amp; &quot;One&quot;&gt;");
    expect(html).toContain("&lt;Morning &amp; &quot;open&quot;&gt;");
    expect(html).toContain("&lt;all &amp; &quot;history&quot;&gt;");
    expect(html).toContain("&lt;UTC &amp; &quot;local&quot;&gt;");
    expect(html).toContain("&lt;all accounts &amp; &quot;scope&quot;&gt;");
    expect(html).toContain(
      'data-symbol-breakdown-trade="subject-&quot; onclick=&quot;&lt;stock&gt;&amp;&#039;"',
    );
    expect(html).not.toContain(`<Broker & "One">`);
  });

  it("distinguishes otherwise identical contributors by stable group position", () => {
    const aapl = demoTrade("AAPL");
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      provenance: "local",
      trades: [
        cloneTrade(aapl, "same-a"),
        cloneTrade(aapl, "same-b"),
      ],
    };

    const html = symbolBreakdownSection(snapshot);

    expect(html).toContain("Trade 1 of 2 · Jul 1 · Morning · Demo Brokerage");
    expect(html).toContain("Trade 2 of 2 · Jul 1 · Morning · Demo Brokerage");
    expect(html).toContain(
      'aria-label="Open AAPL trade for trade 1 of 2 in the exact AAPL Stock symbol group — Stock, Demo Brokerage, Jul 1 · Morning"',
    );
    expect(html).toContain(
      'aria-label="Open AAPL trade for trade 2 of 2 in the exact AAPL Stock symbol group — Stock, Demo Brokerage, Jul 1 · Morning"',
    );
  });

  it("renders a neutral empty current projection without group controls", () => {
    const html = symbolBreakdownSection({
      ...DEMO_WORKSPACE,
      provenance: "empty",
      trades: [],
    });

    expect(html).toContain("NEW");
    expect(html).toContain("0 current trades");
    expect(html).toContain("No current trades are available for symbol breakdown.");
    expect(html).not.toContain("data-symbol-breakdown-group-index=");
    expect(html).not.toContain("data-symbol-breakdown-trade=");
    expect(html).not.toContain("data-symbol-breakdown-groups-more");
  });

  it("reveals stable symbol groups five at a time and focuses each new page", () => {
    const snapshot = workspaceWithManyGroups(12);
    const html = symbolBreakdownSection(snapshot);

    expect(SYMBOL_BREAKDOWN_GROUP_PAGE_SIZE).toBe(5);
    expect(html.match(/data-symbol-breakdown-group-index=/g)).toHaveLength(5);
    expect(html).toContain("Showing 5 of 12 symbol groups");
    expect(html).toContain("Show 5 more symbol groups");
    expect(html).toContain("<strong>SYM04 · Stock</strong>");
    expect(html).not.toContain("<strong>SYM05 · Stock</strong>");

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
    const groupStatus = { textContent: "Showing 5 of 12 symbol groups" };
    const groupButton = {
      hidden: false,
      textContent: "Show 5 more symbol groups",
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
        textContent: "All trades shown",
        addEventListener: (): never => { throw new Error("Unexpected listener."); },
      },
    };
    const controls = new Map<string, unknown>([
      ["[data-symbol-breakdown-groups]", groups],
      ["[data-symbol-breakdown-groups-showing]", groupStatus],
      ["[data-symbol-breakdown-groups-more]", groupButton],
    ]);
    for (let index = 0; index < 12; index += 1) {
      controls.set(`[data-symbol-breakdown-evidence-list="${index}"]`, completeControls.list);
      controls.set(`[data-symbol-breakdown-showing="${index}"]`, completeControls.status);
      controls.set(`[data-symbol-breakdown-more="${index}"]`, completeControls.button);
    }
    const section = { querySelector: (selector: string): unknown => controls.get(selector) ?? null };
    const root = {
      querySelector(selector: string): unknown {
        expect(selector).toBe("[data-symbol-breakdown]");
        return section;
      },
    };

    bindSymbolBreakdownView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    clicks[0]?.();
    expect(inserted[0]?.match(/data-symbol-breakdown-group-index=/g)).toHaveLength(5);
    expect(inserted[0]).toContain('data-symbol-breakdown-group-index="5"');
    expect(groupStatus.textContent).toBe("Showing 10 of 12 symbol groups");
    expect(groupButton.textContent).toBe("Show 2 more symbol groups");
    expect(focused).toEqual(['[data-symbol-breakdown-group-index="5"] > summary']);

    clicks[0]?.();
    expect(inserted[1]?.match(/data-symbol-breakdown-group-index=/g)).toHaveLength(2);
    expect(groupStatus.textContent).toBe("Showing 12 of 12 symbol groups");
    expect(groupButton.hidden).toBe(true);
    expect(focused).toEqual([
      '[data-symbol-breakdown-group-index="5"] > summary',
      '[data-symbol-breakdown-group-index="10"] > summary',
    ]);
  });

  it("reveals evidence in pages of 25 and focuses each first new trade action", () => {
    const snapshot = workspaceWithManyContributors(56);
    const html = symbolBreakdownSection(snapshot);

    expect(SYMBOL_BREAKDOWN_EVIDENCE_PAGE_SIZE).toBe(25);
    expect(html.match(/data-symbol-breakdown-trade=/g)).toHaveLength(25);
    expect(html).toContain("Showing 25 of 56 trades");
    expect(html).toContain("Show 25 more");
    expect(html).not.toContain('data-symbol-breakdown-trade="demo-subject-aapl-bulk-25"');

    const inserted: string[] = [];
    const clicks: Array<() => void> = [];
    const focusedActions: number[] = [];
    const actions = Array.from({ length: 56 }, (_, index) => ({
      focus(options: FocusOptions): void {
        expect(options).toEqual({ preventScroll: true });
        focusedActions.push(index);
      },
    }));
    const list = {
      insertAdjacentHTML(position: string, appendedHtml: string): void {
        expect(position).toBe("beforeend");
        inserted.push(appendedHtml);
      },
      querySelectorAll(selector: string): readonly {
        focus(options: FocusOptions): void;
      }[] {
        expect(selector).toBe(".report-trade-action");
        return actions;
      },
    };
    const status = {
      textContent: "Showing 25 of 56 trades",
      focus: (): never => { throw new Error("Unexpected status focus."); },
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
      ['[data-symbol-breakdown-evidence-list="0"]', list],
      ['[data-symbol-breakdown-showing="0"]', status],
      ['[data-symbol-breakdown-more="0"]', button],
    ]);
    const section = { querySelector: (selector: string): unknown => controls.get(selector) ?? null };
    const root = { querySelector: (): unknown => section };

    bindSymbolBreakdownView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    clicks[0]?.();
    expect(inserted[0]?.match(/data-symbol-breakdown-trade=/g)).toHaveLength(25);
    expect(inserted[0]).toContain('data-symbol-breakdown-trade="demo-subject-aapl-bulk-25"');
    expect(inserted[0]).not.toContain('data-symbol-breakdown-trade="demo-subject-aapl-bulk-50"');
    expect(status.textContent).toBe("Showing 50 of 56 trades");
    expect(button.textContent).toBe("Show 6 more");
    expect(focusedActions).toEqual([25]);

    clicks[0]?.();
    expect(inserted[1]?.match(/data-symbol-breakdown-trade=/g)).toHaveLength(6);
    expect(inserted[1]).toContain('data-symbol-breakdown-trade="demo-subject-aapl-bulk-55"');
    expect(status.textContent).toBe("Showing 56 of 56 trades");
    expect(button.hidden).toBe(true);
    expect(focusedActions).toEqual([25, 50]);
  });

  it("fails closed when progressive controls are incomplete", () => {
    const snapshot = workspaceWithManyContributors(26);
    const section = {
      querySelector(selector: string): unknown {
        if (selector === '[data-symbol-breakdown-evidence-list="0"]') return {};
        if (selector === '[data-symbol-breakdown-more="0"]') return {};
        return null;
      },
    };
    const root = { querySelector: (): unknown => section };

    expect(() => bindSymbolBreakdownView(
      root as unknown as HTMLElement,
      snapshot,
    )).toThrow("Symbol-breakdown evidence controls are incomplete for group 0.");
  });

  it("does not require a symbol section outside Reports", () => {
    expect(() => bindSymbolBreakdownView({
      querySelector: () => null,
    } as unknown as HTMLElement, DEMO_WORKSPACE)).not.toThrow();
  });
});
