import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  OPENING_WEEKDAY_MIX_EVIDENCE_PAGE_SIZE,
  bindOpeningWeekdayMixView,
  openingWeekdayMixSection,
} from "./opening-weekday-mix-view";

function demoTrade(symbol: string): TradePreview {
  const trade = DEMO_WORKSPACE.trades.find(
    (candidate) => candidate.symbol === symbol,
  );
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

function workspaceWithManyMondayTrades(
  count: number,
): JournalWorkspaceSnapshot {
  const aapl = demoTrade("AAPL");
  return {
    ...DEMO_WORKSPACE,
    trades: Array.from({ length: count }, (_, index) => {
      const suffix = `bulk-${String(index).padStart(2, "0")}`;
      return cloneTrade(aapl, suffix, {
        tradedOn: "2026-07-06",
        sessionLabel: `Bulk ${String(index).padStart(2, "0")}`,
      });
    }),
  };
}

describe("opening-weekday-mix presentation", () => {
  it("renders the checksum-pinned demo cohort in fixed weekday order", () => {
    const html = openingWeekdayMixSection(DEMO_WORKSPACE);

    expect(html).toContain(
      '<section class="card plan-check-card opening-weekday-mix-card" aria-labelledby="opening-weekday-mix-title" data-opening-weekday-mix>',
    );
    expect(html).toContain(
      '<h2 id="opening-weekday-mix-title" class="report-target" tabindex="-1">Opening weekday mix</h2>',
    );
    expect(html).toContain("opening-weekday-mix-report-v1");
    expect(html).toContain(
      "6f205c00826d547f1f0640bec0acceac836e707c4a95287d2e35f4ae62e01cf8",
    );
    expect(html).toContain("Current full-workspace projection");
    expect(html).toContain("8 current trades");
    const weekdays = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    for (const [index, weekday] of weekdays.entries()) {
      expect(html).toContain(
        `data-opening-weekday-mix-group="${weekday}"`,
      );
      if (index > 0) {
        expect(
          html.indexOf(
            `data-opening-weekday-mix-group="${weekdays[index - 1]}"`,
          ),
        ).toBeLessThan(
          html.indexOf(`data-opening-weekday-mix-group="${weekday}"`),
        );
      }
    }
    expect(html).toContain("<strong>Monday</strong><span>1 current trade</span>");
    expect(html).toContain("<strong>Wednesday</strong><span>3 current trades</span>");
    expect(html).toContain("<strong>Sunday</strong><span>0 current trades</span>");
    expect(html.match(/data-opening-weekday-mix-trade=/g)).toHaveLength(8);
    expect(
      html.match(/data-trade-review-report-source="opening-weekday-mix"/g),
    ).toHaveLength(8);
    expect(html).toContain(
      "Open AAPL trade for the Wednesday opening group — Stock, Demo Brokerage, Jul 1 · Morning",
    );
    expect(html).toContain(
      "Open QQQ trade for the Thursday opening group — ETF, Demo Swing, Jul 9 · Morning",
    );
    expect(html).toContain("Position state <strong>Closed</strong>");
    expect(html).toContain("not goals or performance comparisons");
    expect(html).toContain("does not reward trade count");
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
      tradedOn: "2026-07-08",
    });
    const html = openingWeekdayMixSection({
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
      'data-opening-weekday-mix-trade="subject-&quot; onclick=&quot;&lt;hostile&gt;&amp;&#039;"',
    );
    expect(html).not.toContain('<AAPL & "friends">');
    expect(html).not.toContain('<Broker & "One">');
  });

  it("renders an empty projection as seven fixed zero-count groups", () => {
    const html = openingWeekdayMixSection({
      ...DEMO_WORKSPACE,
      provenance: "empty",
      trades: [],
    });

    expect(html).toContain("NEW");
    expect(html).toContain("0 current trades");
    expect(html).toContain("<strong>Monday</strong><span>0 current trades</span>");
    expect(html).toContain("<strong>Sunday</strong><span>0 current trades</span>");
    expect(html).toContain("No current trades opened on Monday.");
    expect(html).toContain("No current trades opened on Sunday.");
    expect(html).not.toContain("data-opening-weekday-mix-trade=");
    expect(html).not.toContain("data-review-trade=");
  });

  it("reveals each weekday's evidence in bounded pages and focuses final status", () => {
    const snapshot = workspaceWithManyMondayTrades(56);
    const html = openingWeekdayMixSection(snapshot);

    expect(OPENING_WEEKDAY_MIX_EVIDENCE_PAGE_SIZE).toBe(25);
    expect(html.match(/data-opening-weekday-mix-trade=/g)).toHaveLength(25);
    expect(html).toContain("Showing 25 of 56 trades");
    expect(html).toContain("Show 25 more");
    expect(html).not.toContain(
      'data-opening-weekday-mix-trade="demo-subject-aapl-bulk-25"',
    );

    const inserted: string[] = [];
    const clicks: Array<() => void> = [];
    let statusFocused = false;
    const mondayList = {
      insertAdjacentHTML(position: string, appendedHtml: string): void {
        expect(position).toBe("beforeend");
        inserted.push(appendedHtml);
      },
    };
    const mondayStatus = {
      textContent: "Showing 25 of 56 trades",
      focus(options: FocusOptions): void {
        expect(options).toEqual({ preventScroll: true });
        statusFocused = true;
      },
    };
    const mondayButton = {
      hidden: false,
      textContent: "Show 25 more",
      addEventListener(event: string, listener: () => void): void {
        expect(event).toBe("click");
        clicks.push(listener);
      },
    };
    const completeControls = {
      list: {
        insertAdjacentHTML: (): never => {
          throw new Error("Unexpected append.");
        },
      },
      status: {
        textContent: "",
        focus: (): never => {
          throw new Error("Unexpected focus.");
        },
      },
      button: {
        hidden: true,
        textContent: "All trades shown",
        addEventListener: (): never => {
          throw new Error("Unexpected listener.");
        },
      },
    };
    const controls = new Map<string, unknown>([
      ['[data-opening-weekday-mix-evidence-list="0"]', mondayList],
      ['[data-opening-weekday-mix-showing="0"]', mondayStatus],
      ['[data-opening-weekday-mix-more="0"]', mondayButton],
    ]);
    for (let index = 1; index < 7; index += 1) {
      controls.set(
        `[data-opening-weekday-mix-evidence-list="${index}"]`,
        completeControls.list,
      );
      controls.set(
        `[data-opening-weekday-mix-showing="${index}"]`,
        completeControls.status,
      );
      controls.set(
        `[data-opening-weekday-mix-more="${index}"]`,
        completeControls.button,
      );
    }
    const section = {
      querySelector: (selector: string): unknown => controls.get(selector) ?? null,
    };
    const root = {
      querySelector(selector: string): unknown {
        expect(selector).toBe("[data-opening-weekday-mix]");
        return section;
      },
    };

    bindOpeningWeekdayMixView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    clicks[0]?.();
    expect(inserted[0]?.match(/data-opening-weekday-mix-trade=/g))
      .toHaveLength(25);
    expect(inserted[0]).toContain(
      'data-opening-weekday-mix-trade="demo-subject-aapl-bulk-25"',
    );
    expect(inserted[0]).not.toContain(
      'data-opening-weekday-mix-trade="demo-subject-aapl-bulk-50"',
    );
    expect(mondayStatus.textContent).toBe("Showing 50 of 56 trades");
    expect(mondayButton.textContent).toBe("Show 6 more");
    expect(statusFocused).toBe(false);

    clicks[0]?.();
    expect(inserted[1]?.match(/data-opening-weekday-mix-trade=/g))
      .toHaveLength(6);
    expect(inserted[1]).toContain(
      'data-opening-weekday-mix-trade="demo-subject-aapl-bulk-55"',
    );
    expect(mondayStatus.textContent).toBe("Showing 56 of 56 trades");
    expect(mondayButton.hidden).toBe(true);
    expect(statusFocused).toBe(true);
  });

  it("fails closed when progressive controls are incomplete", () => {
    const snapshot = workspaceWithManyMondayTrades(26);
    const section = {
      querySelector(selector: string): unknown {
        if (
          selector === '[data-opening-weekday-mix-evidence-list="0"]'
        ) return {};
        if (selector === '[data-opening-weekday-mix-more="0"]') return {};
        return null;
      },
    };
    const root = { querySelector: (): unknown => section };

    expect(() => bindOpeningWeekdayMixView(
      root as unknown as HTMLElement,
      snapshot,
    )).toThrow(
      "Opening-weekday evidence controls are incomplete for group 0.",
    );
  });

  it("does not require an opening-weekday section outside Reports", () => {
    expect(() => bindOpeningWeekdayMixView({
      querySelector: () => null,
    } as unknown as HTMLElement, DEMO_WORKSPACE)).not.toThrow();
  });
});
