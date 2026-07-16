import { describe, expect, it } from "vitest";

import {
  REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_SHA256,
} from "../core/review-session-coverage-report";
import type {
  CalendarSession,
  JournalWorkspaceSnapshot,
  TradePreview,
} from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  REVIEW_SESSION_COVERAGE_EVIDENCE_PAGE_SIZE,
  bindReviewSessionCoverageView,
  reviewSessionCoverageSection,
} from "./review-session-coverage-view";

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

function calendarSession(
  isoDate: string,
  trades: readonly TradePreview[],
  labels: Readonly<{ dayLabel?: string; dateLabel?: string }> = {},
): CalendarSession {
  return {
    isoDate,
    dayLabel: labels.dayLabel ?? "Wed",
    dateLabel: labels.dateLabel ?? "Jul 1",
    pnlExact: "0",
    pnl: 0,
    tradeCount: trades.length,
    allocationCount: trades.length,
    contributions: trades.map((trade) => ({
      tradeSubjectId: trade.tradeSubjectId,
      pnlExact: "0",
      pnl: 0,
      allocationCount: 1,
    })),
  };
}

function singleSessionWorkspace(
  trades: readonly TradePreview[],
  isoDate = "2026-07-01",
  labels: Readonly<{ dayLabel?: string; dateLabel?: string }> = {},
): JournalWorkspaceSnapshot {
  const reviewed = trades.some((trade) => (
    trade.reviewStatus !== "pending"
    && trade.reviewSessionDates.includes(isoDate)
  ));
  return {
    ...DEMO_WORKSPACE,
    trades,
    calendar: [calendarSession(isoDate, trades, labels)],
    reviewProgress: {
      pendingTrades: trades.filter((trade) => trade.reviewStatus === "pending").length,
      draftTrades: trades.filter((trade) => trade.reviewStatus === "draft").length,
      completedTrades: trades.filter((trade) => trade.reviewStatus === "completed").length,
      streakSessions: reviewed ? 1 : 0,
      reviewedSessions: reviewed ? 1 : 0,
      tradingSessions: 1,
    },
  };
}

function workspaceWithManyAssignments(count: number): JournalWorkspaceSnapshot {
  const date = "2026-07-01";
  const source = demoTrade("AAPL");
  const trades = Array.from({ length: count }, (_, index) => {
    const suffix = `bulk-${String(index).padStart(2, "0")}`;
    return cloneTrade(source, suffix, {
      tradedOn: date,
      reviewSessionDates: [date],
      sessionLabel: `Bulk ${String(index).padStart(2, "0")}`,
    });
  });
  return singleSessionWorkspace(trades, date);
}

describe("review-session-coverage presentation", () => {
  it("renders the checksum-pinned demo as six current-streak sessions and eight assignments", () => {
    const html = reviewSessionCoverageSection(DEMO_WORKSPACE);

    expect(html).toContain(
      '<section class="card plan-check-card review-session-coverage-card" aria-labelledby="review-session-coverage-title" data-review-session-coverage>',
    );
    expect(html).toContain(
      '<h2 id="review-session-coverage-title" class="report-target" tabindex="-1">Review session coverage</h2>',
    );
    expect(html).toContain("FICTIONAL DEMO");
    expect(html).toContain("review-session-coverage-report-v1");
    expect(html).toContain(REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_SHA256);
    expect(html).toContain(
      "<strong>Current review streak</strong><span>6 sessions · 8 assignments</span>",
    );
    expect(html).toContain(
      "<strong>Reviewed before current streak</strong><span>0 sessions · 0 assignments</span>",
    );
    expect(html).toContain(
      "<strong>Unreviewed sessions</strong><span>0 sessions · 0 assignments</span>",
    );
    expect(Array.from(
      html.matchAll(/data-review-session-coverage-group="([^"]+)"/g),
      (match) => match[1],
    )).toEqual([
      "current_streak",
      "reviewed_before_streak",
      "unreviewed",
    ]);
    expect(html.match(/data-review-session-coverage-trade=/g)).toHaveLength(8);
    expect(
      html.match(/data-trade-review-report-source="review-session-coverage"/g),
    ).toHaveLength(8);
    expect(html).toContain(
      "Open AAPL trade for the current review streak on 2026-07-01 — Stock, Demo Brokerage, Jul 1 · Morning",
    );
    expect(html).toContain("6 trading sessions");
    expect(html).toContain("8 assignments");
    expect(html).toContain("saved draft or completed review covering that date");
    expect(html).toContain("maximal reviewed suffix");
    expect(html).toContain("not consecutive calendar days");
    expect(html).toContain("does not mean every trade in that session has been reviewed");
  });

  it("renders all three fixed groups when every count is zero", () => {
    const html = reviewSessionCoverageSection({
      ...DEMO_WORKSPACE,
      provenance: "empty",
      trades: [],
      calendar: [],
      reviewProgress: {
        pendingTrades: 0,
        draftTrades: 0,
        completedTrades: 0,
        streakSessions: 0,
        reviewedSessions: 0,
        tradingSessions: 0,
      },
    });

    expect(html).toContain("NEW");
    expect(html.match(/data-review-session-coverage-group=/g)).toHaveLength(3);
    expect(html).toContain(
      "No recorded trading sessions are in the current review streak.",
    );
    expect(html).toContain(
      "No reviewed sessions appear before the current streak.",
    );
    expect(html).toContain(
      "No recorded trading sessions are currently unreviewed.",
    );
    expect(html).toContain("0 trading sessions");
    expect(html).toContain("0 assignments");
    expect(html).not.toContain("data-review-session-coverage-trade=");
    expect(html).not.toContain("data-review-trade=");
  });

  it("renders mixed session groups with separate session and assignment counts", () => {
    const trades = DEMO_WORKSPACE.trades.map((trade) => (
      trade.symbol === "AMD"
        ? {
          ...trade,
          reviewStatus: "pending" as const,
          reviewId: null,
          reviewVersion: null,
          reviewSessionDates: [],
        }
        : trade
    ));
    const html = reviewSessionCoverageSection({
      ...DEMO_WORKSPACE,
      trades,
      reviewProgress: {
        pendingTrades: 1,
        draftTrades: 0,
        completedTrades: 7,
        streakSessions: 3,
        reviewedSessions: 5,
        tradingSessions: 6,
      },
    });

    expect(html).toContain(
      "<strong>Current review streak</strong><span>3 sessions · 3 assignments</span>",
    );
    expect(html).toContain(
      "<strong>Reviewed before current streak</strong><span>2 sessions · 4 assignments</span>",
    );
    expect(html).toContain(
      "<strong>Unreviewed sessions</strong><span>1 session · 1 assignment</span>",
    );
    expect(html).toContain("Current review state <strong>Pending</strong>");
    expect(html).toContain(
      "No contributor has a saved draft or completed review covering this recorded trading session.",
    );
  });

  it("keeps trade-level coverage explicit when one contributor reviews a shared session", () => {
    const date = "2026-07-01";
    const covered = cloneTrade(demoTrade("AAPL"), "covered", {
      reviewSessionDates: [date],
    });
    const uncovered = cloneTrade(demoTrade("MSFT"), "uncovered", {
      reviewStatus: "pending",
      reviewId: null,
      reviewVersion: null,
      reviewSessionDates: [],
    });
    const html = reviewSessionCoverageSection(
      singleSessionWorkspace([covered, uncovered], date),
    );

    expect(html).toContain(
      "<strong>Current review streak</strong><span>1 session · 2 assignments</span>",
    );
    expect(html).toContain(
      "This trade&#039;s saved completed review covers this recorded trading session.",
    );
    expect(html).toContain(
      "Another contributor supplies saved review coverage for this session; this trade&#039;s current pending review does not cover this date.",
    );
    expect(html).toContain("Current review state <strong>Completed</strong>");
    expect(html).toContain("Current review state <strong>Pending</strong>");
  });

  it("escapes metadata, session, trade, account, identity, and coverage fields", () => {
    const date = "2026-07-01";
    const hostile = cloneTrade(demoTrade("AAPL"), "hostile", {
      tradeSubjectId: `subject-" onclick="<hostile>&'`,
      symbol: `<AAPL & "friends">`,
      accountLabel: `<Broker & "One">`,
      sessionLabel: `<Jul 1 & "morning">`,
      reviewSessionDates: [date],
    });
    const base = singleSessionWorkspace([hostile], date, {
      dayLabel: `<Wed & "day">`,
      dateLabel: `<Jul 1 & "date">`,
    });
    const html = reviewSessionCoverageSection({
      ...base,
      provenance: "local",
      periodLabel: `<all & "history">`,
      timeZone: `<UTC & "local">`,
      accountLabel: `<all & "accounts">`,
    });

    expect(html).toContain("&lt;AAPL &amp; &quot;friends&quot;&gt;");
    expect(html).toContain("&lt;Broker &amp; &quot;One&quot;&gt;");
    expect(html).toContain("&lt;Jul 1 &amp; &quot;morning&quot;&gt;");
    expect(html).toContain("&lt;Wed &amp; &quot;day&quot;&gt;");
    expect(html).toContain("&lt;Jul 1 &amp; &quot;date&quot;&gt;");
    expect(html).toContain("&lt;all &amp; &quot;history&quot;&gt;");
    expect(html).toContain("&lt;UTC &amp; &quot;local&quot;&gt;");
    expect(html).toContain("&lt;all &amp; &quot;accounts&quot;&gt;");
    expect(html).toContain(
      'data-review-session-coverage-trade="subject-&quot; onclick=&quot;&lt;hostile&gt;&amp;&#039;"',
    );
    expect(html).not.toContain(`<AAPL & "friends">`);
    expect(html).not.toContain(`<Broker & "One">`);
  });

  it("reveals assignments in bounded pages and focuses the final status", () => {
    const snapshot = workspaceWithManyAssignments(56);
    const html = reviewSessionCoverageSection(snapshot);

    expect(REVIEW_SESSION_COVERAGE_EVIDENCE_PAGE_SIZE).toBe(25);
    expect(html.match(/data-review-session-coverage-trade=/g)).toHaveLength(25);
    expect(html).toContain("Showing 25 of 56 session–trade assignments");
    expect(html).toContain("Show 25 more");
    expect(html).toContain(
      'aria-controls="review-session-coverage-evidence-0"',
    );
    expect(html).toContain('role="status" aria-live="polite" tabindex="-1"');
    expect(html).not.toContain(
      'data-review-session-coverage-trade="demo-subject-aapl-bulk-25"',
    );

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
      textContent: "Showing 25 of 56 session–trade assignments",
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
        textContent: "All assignments shown",
        addEventListener: (): never => {
          throw new Error("Unexpected listener.");
        },
      },
    };
    const controls = new Map<string, unknown>([
      ['[data-review-session-coverage-evidence-list="0"]', list],
      ['[data-review-session-coverage-showing="0"]', status],
      ['[data-review-session-coverage-more="0"]', button],
      ['[data-review-session-coverage-evidence-list="1"]', completeControls.list],
      ['[data-review-session-coverage-showing="1"]', completeControls.status],
      ['[data-review-session-coverage-more="1"]', completeControls.button],
      ['[data-review-session-coverage-evidence-list="2"]', completeControls.list],
      ['[data-review-session-coverage-showing="2"]', completeControls.status],
      ['[data-review-session-coverage-more="2"]', completeControls.button],
    ]);
    const section = {
      querySelector: (selector: string): unknown => controls.get(selector) ?? null,
    };
    const root = {
      querySelector(selector: string): unknown {
        expect(selector).toBe("[data-review-session-coverage]");
        return section;
      },
    };

    bindReviewSessionCoverageView(root as unknown as HTMLElement, snapshot);
    expect(clicks).toHaveLength(1);
    clicks[0]?.();
    expect(inserted[0]?.match(/data-review-session-coverage-trade=/g))
      .toHaveLength(25);
    expect(inserted[0]).toContain(
      'data-review-session-coverage-trade="demo-subject-aapl-bulk-25"',
    );
    expect(inserted[0]).not.toContain(
      'data-review-session-coverage-trade="demo-subject-aapl-bulk-50"',
    );
    expect(status.textContent).toBe("Showing 50 of 56 session–trade assignments");
    expect(button.textContent).toBe("Show 6 more");
    expect(statusFocused).toBe(false);

    clicks[0]?.();
    expect(inserted[1]?.match(/data-review-session-coverage-trade=/g))
      .toHaveLength(6);
    expect(inserted[1]).toContain(
      'data-review-session-coverage-trade="demo-subject-aapl-bulk-55"',
    );
    expect(status.textContent).toBe("Showing 56 of 56 session–trade assignments");
    expect(button.hidden).toBe(true);
    expect(statusFocused).toBe(true);
  });

  it("fails closed for malformed session coherence and incomplete controls", () => {
    expect(() => reviewSessionCoverageSection({
      ...DEMO_WORKSPACE,
      reviewProgress: {
        ...DEMO_WORKSPACE.reviewProgress,
        streakSessions: 5,
      },
    })).toThrow("does not reconcile snapshot review progress");

    const duplicatedSession = DEMO_WORKSPACE.calendar[0];
    if (duplicatedSession === undefined) throw new Error("Demo session is missing.");
    expect(() => reviewSessionCoverageSection({
      ...DEMO_WORKSPACE,
      calendar: [...DEMO_WORKSPACE.calendar, duplicatedSession],
      reviewProgress: {
        ...DEMO_WORKSPACE.reviewProgress,
        tradingSessions: 7,
      },
    })).toThrow("appears more than once");

    const snapshot = workspaceWithManyAssignments(26);
    const section = {
      querySelector(selector: string): unknown {
        if (
          selector === '[data-review-session-coverage-evidence-list="0"]'
        ) return {};
        if (selector === '[data-review-session-coverage-more="0"]') return {};
        return null;
      },
    };
    const root = { querySelector: (): unknown => section };
    expect(() => bindReviewSessionCoverageView(
      root as unknown as HTMLElement,
      snapshot,
    )).toThrow("Review-session coverage controls are incomplete for group 0.");
  });

  it("omits financial outputs, scoring, ranking, and advice while allowing other routes", () => {
    const html = reviewSessionCoverageSection(DEMO_WORKSPACE);

    expect(html).toContain("Back to report menu");
    expect(html).not.toContain("<dt>Currency</dt>");
    expect(html).not.toContain("Net P&amp;L");
    expect(html).not.toContain("Win rate");
    expect(html).not.toContain("Average R");
    expect(html).not.toContain("Expectancy");
    expect(html).not.toContain("ranking");
    expect(html).not.toContain("advice");
    expect(html).not.toContain("performance target");
    expect(() => bindReviewSessionCoverageView({
      querySelector: () => null,
    } as unknown as HTMLElement, DEMO_WORKSPACE)).not.toThrow();
  });
});
