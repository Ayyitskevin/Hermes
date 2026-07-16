import { describe, expect, it } from "vitest";

import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  EMOTION_PATTERNS_EVIDENCE_PAGE_SIZE,
  EMOTION_PATTERNS_GROUP_PAGE_SIZE,
  bindEmotionPatternsView,
  emotionPatternsSection,
} from "./emotion-patterns-view";

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
        emotion: `Emotion ${String(index).padStart(2, "0")}`,
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
        emotion: "Calm",
        tradedOn: "2026-07-10",
        sessionLabel: `Bulk ${String(index).padStart(2, "0")}`,
      });
    }),
  };
}

describe("emotion-patterns presentation", () => {
  it("renders the exact count-only demo cohort, evidence, and governance copy", () => {
    const html = emotionPatternsSection(DEMO_WORKSPACE);

    expect(html).toContain(
      '<section class="card plan-check-card emotion-patterns-card" aria-labelledby="emotion-patterns-title" data-emotion-patterns>',
    );
    expect(html).toContain(
      '<h2 id="emotion-patterns-title" class="report-target" tabindex="-1">Emotion patterns</h2>',
    );
    expect(html).toContain("FICTIONAL DEMO");
    expect(html).toContain("emotion-patterns-report-v1");
    expect(html).toContain(
      "d674eceb0d641512f106f9f1c6b37e23fe1a2ecd0d43e54b7e48865fa594adb4",
    );
    expect(html).toContain("Current completed review heads");
    expect(html).toContain("8 trades of 8 trades");
    expect(html).toContain("8 current assignments");
    expect(html).toContain(
      "0 pending or draft · 0 completed without a saved emotion",
    );
    expect(html).not.toContain("<dt>Currency</dt>");
    expect(html).not.toContain("Cash expectancy");
    expect(html).not.toContain("Average R");
    expect(html).not.toContain("Exact net P&amp;L");

    const calm = html.indexOf("<strong>Calm</strong><span>3 current trades</span>");
    const focused = html.indexOf("<strong>Focused</strong><span>1 current trade</span>");
    const hesitant = html.indexOf("<strong>Hesitant</strong><span>1 current trade</span>");
    const impatient = html.indexOf("<strong>Impatient</strong><span>2 current trades</span>");
    const patient = html.indexOf("<strong>Patient</strong><span>1 current trade</span>");
    expect(calm).toBeGreaterThan(-1);
    expect(focused).toBeGreaterThan(calm);
    expect(hesitant).toBeGreaterThan(focused);
    expect(impatient).toBeGreaterThan(hesitant);
    expect(patient).toBeGreaterThan(impatient);
    expect(Array.from(
      html.matchAll(/data-emotion-patterns-trade="([^"]+)"/g),
      (match) => match[1],
    )).toEqual([
      "demo-subject-meta",
      "demo-subject-aapl",
      "demo-subject-msft",
      "demo-subject-amd",
      "demo-subject-qqq",
      "demo-subject-spy",
      "demo-subject-tsla",
      "demo-subject-nvda",
    ]);
    expect(html.match(/data-trade-review-report-source="emotion-patterns"/g))
      .toHaveLength(8);
    expect(html).toContain(
      'aria-label="Open META trade for saved emotion Calm — Stock, Demo Brokerage, Jul 8 · Morning"',
    );
    expect(html).toContain('datetime="2026-07-08"');
    expect(html).toContain("Older immutable review versions do not compete");
    expect(html).toContain("counts once in exactly one emotion group");
    expect(html).toContain("must equal included trades");
    expect(html).toContain("never count or performance rank");
    expect(html).toContain("do not read results, measure intensity");
  });

  it("escapes exact labels, identities, evidence, and report metadata", () => {
    const spy = cloneTrade(demoTrade("SPY"), "hostile", {
      tradeSubjectId: `subject-" onclick="<hostile>&'`,
      symbol: `<SPY & "friends">`,
      accountLabel: `<Broker & "One">`,
      sessionLabel: `<Jul 7 & "afternoon">`,
      emotion: `<Anxious & "alert">`,
    });
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      provenance: "local",
      periodLabel: `<all & "history">`,
      timeZone: `<UTC & "local">`,
      accountLabel: `<all accounts & "scope">`,
      trades: [spy],
    };
    const html = emotionPatternsSection(snapshot);

    expect(html).toContain("1 trade of 1 trade");
    expect(html).toContain("1 current assignment");
    expect(html.match(/data-emotion-patterns-trade=/g)).toHaveLength(1);
    expect(html).toContain("&lt;SPY &amp; &quot;friends&quot;&gt;");
    expect(html).toContain("&lt;Anxious &amp; &quot;alert&quot;&gt;");
    expect(html).toContain("&lt;Jul 7 &amp; &quot;afternoon&quot;&gt;");
    expect(html).toContain("&lt;Broker &amp; &quot;One&quot;&gt;");
    expect(html).toContain("&lt;all &amp; &quot;history&quot;&gt;");
    expect(html).toContain("&lt;UTC &amp; &quot;local&quot;&gt;");
    expect(html).toContain("&lt;all accounts &amp; &quot;scope&quot;&gt;");
    expect(html).toContain(
      'data-emotion-patterns-trade="subject-&quot; onclick=&quot;&lt;hostile&gt;&amp;&#039;"',
    );
    expect(html).not.toContain(`<SPY & "friends">`);
    expect(html).not.toContain(`<Anxious & "alert">`);
  });

  it("renders a neutral empty cohort without stale vocabulary groups", () => {
    const html = emotionPatternsSection({
      ...DEMO_WORKSPACE,
      provenance: "empty",
      trades: DEMO_WORKSPACE.trades.map((trade) => ({ ...trade, emotion: null })),
      reviewOptions: {
        ...DEMO_WORKSPACE.reviewOptions,
        emotions: ["Stale vocabulary"],
      },
    });

    expect(html).toContain("NEW");
    expect(html).toContain("0 trades of 8 trades");
    expect(html).toContain("0 current assignments");
    expect(html).toContain("0 pending or draft · 8 completed without a saved emotion");
    expect(html).toContain(
      "No current completed reviews with a saved emotion are available.",
    );
    expect(html).not.toContain("Stale vocabulary");
    expect(html).not.toContain("data-emotion-patterns-group-index=");
    expect(html).not.toContain("data-emotion-patterns-trade=");
    expect(html).not.toContain("data-emotion-patterns-more=");
  });

  it("bounds group pages and focuses each newly revealed exact-label group", () => {
    const snapshot = workspaceWithManyGroups(12);
    const html = emotionPatternsSection(snapshot);

    expect(EMOTION_PATTERNS_GROUP_PAGE_SIZE).toBe(5);
    expect(html.match(/data-emotion-patterns-group-index=/g)).toHaveLength(5);
    expect(html).toContain("Showing 5 of 12 emotion groups");
    expect(html).toContain("Show 5 more emotion groups");
    expect(html).toContain("<strong>Emotion 04</strong>");
    expect(html).not.toContain("<strong>Emotion 05</strong>");

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
    const groupStatus = { textContent: "Showing 5 of 12 emotion groups" };
    const groupButton = {
      hidden: false,
      textContent: "Show 5 more emotion groups",
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
      ["[data-emotion-patterns-groups]", groups],
      ["[data-emotion-patterns-groups-showing]", groupStatus],
      ["[data-emotion-patterns-groups-more]", groupButton],
    ]);
    for (let index = 0; index < 12; index += 1) {
      controls.set(`[data-emotion-patterns-evidence-list="${index}"]`, completeControls.list);
      controls.set(`[data-emotion-patterns-showing="${index}"]`, completeControls.status);
      controls.set(`[data-emotion-patterns-more="${index}"]`, completeControls.button);
    }
    const section = { querySelector: (selector: string): unknown => controls.get(selector) ?? null };
    const root = {
      querySelector(selector: string): unknown {
        expect(selector).toBe("[data-emotion-patterns]");
        return section;
      },
    };

    bindEmotionPatternsView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    clicks[0]?.();
    expect(inserted[0]?.match(/data-emotion-patterns-group-index=/g)).toHaveLength(5);
    expect(inserted[0]).toContain('data-emotion-patterns-group-index="5"');
    expect(groupStatus.textContent).toBe("Showing 10 of 12 emotion groups");
    expect(groupButton.textContent).toBe("Show 2 more emotion groups");
    expect(focused).toEqual(['[data-emotion-patterns-group-index="5"] > summary']);

    clicks[0]?.();
    expect(inserted[1]?.match(/data-emotion-patterns-group-index=/g)).toHaveLength(2);
    expect(groupStatus.textContent).toBe("Showing 12 of 12 emotion groups");
    expect(groupButton.hidden).toBe(true);
    expect(focused).toEqual([
      '[data-emotion-patterns-group-index="5"] > summary',
      '[data-emotion-patterns-group-index="10"] > summary',
    ]);
  });

  it("reveals trades in bounded pages and focuses final status", () => {
    const snapshot = workspaceWithManyContributors(56);
    const html = emotionPatternsSection(snapshot);

    expect(EMOTION_PATTERNS_EVIDENCE_PAGE_SIZE).toBe(25);
    expect(html.match(/data-emotion-patterns-trade=/g)).toHaveLength(25);
    expect(html).toContain("Showing 25 of 56 trades");
    expect(html).toContain("Show 25 more");
    expect(html).not.toContain('data-emotion-patterns-trade="demo-subject-spy-bulk-25"');

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
      textContent: "Showing 25 of 56 trades",
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
      ['[data-emotion-patterns-evidence-list="0"]', list],
      ['[data-emotion-patterns-showing="0"]', status],
      ['[data-emotion-patterns-more="0"]', button],
    ]);
    const section = { querySelector: (selector: string): unknown => controls.get(selector) ?? null };
    const root = { querySelector: (): unknown => section };

    bindEmotionPatternsView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    clicks[0]?.();
    expect(inserted[0]?.match(/data-emotion-patterns-trade=/g)).toHaveLength(25);
    expect(inserted[0]).toContain('data-emotion-patterns-trade="demo-subject-spy-bulk-25"');
    expect(inserted[0]).not.toContain('data-emotion-patterns-trade="demo-subject-spy-bulk-50"');
    expect(status.textContent).toBe("Showing 50 of 56 trades");
    expect(button.textContent).toBe("Show 6 more");
    expect(statusFocused).toBe(false);

    clicks[0]?.();
    expect(inserted[1]?.match(/data-emotion-patterns-trade=/g)).toHaveLength(6);
    expect(inserted[1]).toContain('data-emotion-patterns-trade="demo-subject-spy-bulk-55"');
    expect(status.textContent).toBe("Showing 56 of 56 trades");
    expect(button.hidden).toBe(true);
    expect(statusFocused).toBe(true);
  });

  it("fails closed when progressive controls are incomplete", () => {
    const snapshot = workspaceWithManyContributors(26);
    const section = {
      querySelector(selector: string): unknown {
        if (selector === '[data-emotion-patterns-evidence-list="0"]') return {};
        if (selector === '[data-emotion-patterns-more="0"]') return {};
        return null;
      },
    };
    const root = { querySelector: (): unknown => section };

    expect(() => bindEmotionPatternsView(
      root as unknown as HTMLElement,
      snapshot,
    )).toThrow("Emotion-pattern evidence controls are incomplete for group 0.");
  });
});
