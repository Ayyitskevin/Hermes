import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  DIRECTION_MIX_EVIDENCE_PAGE_SIZE,
  bindDirectionMixView,
  directionMixSection,
} from "./direction-mix-view";

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

function workspaceWithManyLongTrades(count: number): JournalWorkspaceSnapshot {
  const aapl = demoTrade("AAPL");
  return {
    ...DEMO_WORKSPACE,
    trades: Array.from({ length: count }, (_, index) => {
      const suffix = `bulk-${String(index).padStart(2, "0")}`;
      return cloneTrade(aapl, suffix, {
        side: "long",
        tradedOn: "2026-07-12",
        sessionLabel: `Bulk ${String(index).padStart(2, "0")}`,
      });
    }),
  };
}

describe("direction-mix presentation", () => {
  it("renders the checksum-pinned demo cohort in fixed direction order", () => {
    const html = directionMixSection(DEMO_WORKSPACE);

    expect(html).toContain(
      '<section class="card plan-check-card direction-mix-card" aria-labelledby="direction-mix-title" data-direction-mix>',
    );
    expect(html).toContain(
      '<h2 id="direction-mix-title" class="report-target" tabindex="-1">Direction mix</h2>',
    );
    expect(html).toContain("direction-mix-report-v1");
    expect(html).toContain(
      "0a55af9905699cc62746c99b5b4e7dd664588d8b526eefb207e9fb2bb77b3ab2",
    );
    expect(html).toContain("Current full-workspace projection");
    expect(html).toContain("8 current trades");
    expect(html).toContain('data-direction-mix-group="long"');
    expect(html).toContain('data-direction-mix-group="short"');
    expect(html.indexOf('data-direction-mix-group="long"')).toBeLessThan(
      html.indexOf('data-direction-mix-group="short"'),
    );
    expect(html).toContain("<strong>Long</strong><span>6 current trades</span>");
    expect(html).toContain("<strong>Short</strong><span>2 current trades</span>");
    expect(html.match(/data-direction-mix-trade=/g)).toHaveLength(8);
    expect(html.match(/data-trade-review-report-source="direction-mix"/g))
      .toHaveLength(8);
    expect(html).toContain(
      "Open AAPL trade for the long direction group — Stock, Demo Brokerage, Jul 1 · Morning",
    );
    expect(html).toContain(
      "Open QQQ trade for the short direction group — ETF, Demo Swing, Jul 9 · Morning",
    );
    expect(html).toContain("Position state <strong>Closed</strong>");
    expect(html).toContain("Review state <strong>Completed</strong>");
    expect(html).not.toContain("Cash expectancy");
    expect(html).not.toContain("Win rate");
    expect(html).not.toContain("Average R");
    expect(html).not.toContain("Net P&amp;L");
    expect(html).not.toContain("Percent return");
  });

  it("escapes every external display and identity field", () => {
    const hostile = cloneTrade(demoTrade("AAPL"), "hostile", {
      tradeSubjectId: 'subject-" onclick="<hostile>&\'',
      symbol: '<AAPL & "friends">',
      sessionLabel: '<Jul 1 & "morning">',
      accountLabel: '<Broker & "One">',
      tradedOn: "2026-07-12",
    });
    const html = directionMixSection({
      ...DEMO_WORKSPACE,
      provenance: "local",
      periodLabel: '<all & "history">',
      timeZone: '<UTC & "local">',
      accountLabel: '<all & "accounts">',
      trades: [hostile],
    });

    expect(html).toContain("&lt;AAPL &amp; &quot;friends&quot;&gt;");
    expect(html).toContain("&lt;Jul 1 &amp; &quot;morning&quot;&gt;");
    expect(html).toContain("&lt;Broker &amp; &quot;One&quot;&gt;");
    expect(html).toContain("&lt;all &amp; &quot;history&quot;&gt;");
    expect(html).toContain("&lt;UTC &amp; &quot;local&quot;&gt;");
    expect(html).toContain("&lt;all &amp; &quot;accounts&quot;&gt;");
    expect(html).toContain(
      'data-direction-mix-trade="subject-&quot; onclick=&quot;&lt;hostile&gt;&amp;&#039;"',
    );
    expect(html).not.toContain('<AAPL & "friends">');
    expect(html).not.toContain('<Broker & "One">');
  });

  it("renders the neutral empty projection as two fixed zero-count groups", () => {
    const html = directionMixSection({
      ...DEMO_WORKSPACE,
      provenance: "empty",
      trades: [],
    });

    expect(html).toContain("NEW");
    expect(html).toContain("0 current trades");
    expect(html).toContain("<strong>Long</strong><span>0 current trades</span>");
    expect(html).toContain("<strong>Short</strong><span>0 current trades</span>");
    expect(html).toContain("No current trades are in the long direction group.");
    expect(html).toContain("No current trades are in the short direction group.");
    expect(html).not.toContain("data-direction-mix-trade=");
    expect(html).not.toContain("data-review-trade=");
  });

  it("reveals each direction's evidence in bounded pages and focuses final status", () => {
    const snapshot = workspaceWithManyLongTrades(56);
    const html = directionMixSection(snapshot);

    expect(DIRECTION_MIX_EVIDENCE_PAGE_SIZE).toBe(25);
    expect(html.match(/data-direction-mix-trade=/g)).toHaveLength(25);
    expect(html).toContain("Showing 25 of 56 trades");
    expect(html).toContain("Show 25 more");
    expect(html).not.toContain('data-direction-mix-trade="demo-subject-aapl-bulk-25"');

    const inserted: string[] = [];
    const clicks: Array<() => void> = [];
    let statusFocused = false;
    const longList = {
      insertAdjacentHTML(position: string, appendedHtml: string): void {
        expect(position).toBe("beforeend");
        inserted.push(appendedHtml);
      },
    };
    const longStatus = {
      textContent: "Showing 25 of 56 trades",
      focus(options: FocusOptions): void {
        expect(options).toEqual({ preventScroll: true });
        statusFocused = true;
      },
    };
    const longButton = {
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
        textContent: "All trades shown",
        addEventListener: (): never => { throw new Error("Unexpected listener."); },
      },
    };
    const controls = new Map<string, unknown>([
      ['[data-direction-mix-evidence-list="0"]', longList],
      ['[data-direction-mix-showing="0"]', longStatus],
      ['[data-direction-mix-more="0"]', longButton],
      ['[data-direction-mix-evidence-list="1"]', completeControls.list],
      ['[data-direction-mix-showing="1"]', completeControls.status],
      ['[data-direction-mix-more="1"]', completeControls.button],
    ]);
    const section = {
      querySelector: (selector: string): unknown => controls.get(selector) ?? null,
    };
    const root = {
      querySelector(selector: string): unknown {
        expect(selector).toBe("[data-direction-mix]");
        return section;
      },
    };

    bindDirectionMixView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    clicks[0]?.();
    expect(inserted[0]?.match(/data-direction-mix-trade=/g)).toHaveLength(25);
    expect(inserted[0]).toContain('data-direction-mix-trade="demo-subject-aapl-bulk-25"');
    expect(inserted[0]).not.toContain('data-direction-mix-trade="demo-subject-aapl-bulk-50"');
    expect(longStatus.textContent).toBe("Showing 50 of 56 trades");
    expect(longButton.textContent).toBe("Show 6 more");
    expect(statusFocused).toBe(false);

    clicks[0]?.();
    expect(inserted[1]?.match(/data-direction-mix-trade=/g)).toHaveLength(6);
    expect(inserted[1]).toContain('data-direction-mix-trade="demo-subject-aapl-bulk-55"');
    expect(longStatus.textContent).toBe("Showing 56 of 56 trades");
    expect(longButton.hidden).toBe(true);
    expect(statusFocused).toBe(true);
  });

  it("fails closed when progressive controls are incomplete", () => {
    const snapshot = workspaceWithManyLongTrades(26);
    const section = {
      querySelector(selector: string): unknown {
        if (selector === '[data-direction-mix-evidence-list="0"]') return {};
        if (selector === '[data-direction-mix-more="0"]') return {};
        return null;
      },
    };
    const root = { querySelector: (): unknown => section };

    expect(() => bindDirectionMixView(
      root as unknown as HTMLElement,
      snapshot,
    )).toThrow("Direction-mix evidence controls are incomplete for group 0.");
  });

  it("does not require a direction section outside Reports", () => {
    expect(() => bindDirectionMixView({
      querySelector: () => null,
    } as unknown as HTMLElement, DEMO_WORKSPACE)).not.toThrow();
  });
});
