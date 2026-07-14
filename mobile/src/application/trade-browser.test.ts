import { describe, expect, it } from "vitest";

import type {
  CalendarSession,
  JournalWorkspaceSnapshot,
  TradePreview,
} from "../core/types";
import { sumSignedDecimals } from "../core/signed-decimal";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  EMPTY_TRADE_BROWSER_STATE,
  TRADE_BROWSER_SEARCH_MAX_CODE_POINTS,
  buildTradeBrowser,
} from "./trade-browser";

function demoTrade(symbol: string): TradePreview {
  const trade = DEMO_WORKSPACE.trades.find((candidate) => candidate.symbol === symbol);
  if (trade === undefined) throw new Error(`Missing demo trade ${symbol}.`);
  return trade;
}

function session(
  isoDate: string,
  contributions: CalendarSession["contributions"],
): CalendarSession {
  const pnlExact = sumSignedDecimals(contributions.map((item) => item.pnlExact));
  return {
    isoDate,
    dayLabel: isoDate,
    dateLabel: isoDate,
    pnlExact,
    pnl: Number(pnlExact),
    tradeCount: contributions.length,
    allocationCount: contributions.reduce((sum, item) => sum + item.allocationCount, 0),
    contributions,
  };
}

describe("trade browser", () => {
  it("builds an exact all-account activity scope without mutating the workspace", () => {
    const before = structuredClone(DEMO_WORKSPACE);
    const browser = buildTradeBrowser(DEMO_WORKSPACE);

    expect(browser.state).toEqual({
      ...EMPTY_TRADE_BROWSER_STATE,
      calendarMonth: "2026-07",
    });
    expect(browser.scopeLabel).toBe("All accounts · All activity dates");
    expect(browser.evidence).toHaveLength(8);
    expect(browser.visibleEvidence).toHaveLength(8);
    expect(browser.contributionPnlExact).toBe("310");
    expect(browser.allocationCount).toBe(16);
    expect(browser.activityDayCount).toBe(6);
    expect(browser.calendar.monthLabel).toBe("July 2026");
    expect(Object.isFrozen(browser)).toBe(true);
    expect(Object.isFrozen(browser.evidence)).toBe(true);
    expect(DEMO_WORKSPACE).toEqual(before);
  });

  it("intersects stable account identity and inclusive allocation dates exactly", () => {
    const swing = buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      accountId: "demo-account-swing",
      activityFrom: "2026-07-07",
      activityThrough: "2026-07-09",
    });

    expect(swing.accountLabel).toBe("Demo Swing");
    expect(swing.dateLabel).toBe("Jul 7, 2026–Jul 9, 2026");
    expect(swing.evidence.map(({ trade }) => trade.symbol)).toEqual(["QQQ", "SPY"]);
    expect(swing.contributionPnlExact).toBe("-150");
    expect(swing.allocationCount).toBe(4);
    expect(swing.activityDayCount).toBe(2);
    expect(swing.scopedCalendar.map((day) => day.isoDate)).toEqual([
      "2026-07-07",
      "2026-07-09",
    ]);

    const day = buildTradeBrowser(DEMO_WORKSPACE, {
      ...swing.state,
      selectedDay: "2026-07-07",
      query: "spy",
    });
    expect(day.selectedSession?.isoDate).toBe("2026-07-07");
    expect(day.evidence.map(({ trade }) => trade.symbol)).toEqual(["SPY"]);
    expect(day.visibleEvidence.map(({ trade }) => trade.symbol)).toEqual(["SPY"]);
    expect(day.contributionPnlExact).toBe("-100");
    expect(day.state.calendarMonth).toBe("2026-07");
  });

  it("keeps text search separate from the exact account/date scope summary", () => {
    const browser = buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      accountId: "demo-account-swing",
      query: " qQq ",
    });
    expect(browser.state.query).toBe("qqq");
    expect(browser.evidence).toHaveLength(3);
    expect(browser.visibleEvidence.map(({ trade }) => trade.symbol)).toEqual(["QQQ"]);
    expect(browser.contributionPnlExact).toBe("-220");
    expect(browser.visibleEvidence[0]?.contributionPnlExact).toBe("-50");
  });

  it("aggregates multi-day and zero-P&L activity without double-counting a trade", () => {
    const primary = { ...demoTrade("AAPL"), resultPnl: 180, resultPnlExact: "180" };
    const swing = { ...demoTrade("QQQ"), resultPnl: -50, resultPnlExact: "-50" };
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      accountOptions: [
        { id: primary.accountId, label: primary.accountLabel, tradeCount: 1 },
        { id: swing.accountId, label: swing.accountLabel, tradeCount: 1 },
      ],
      trades: [primary, swing],
      calendar: [
        session("2024-02-29", [{
          tradeSubjectId: primary.tradeSubjectId,
          pnlExact: "0",
          pnl: 0,
          allocationCount: 1,
        }]),
        session("2026-07-31", [{
          tradeSubjectId: primary.tradeSubjectId,
          pnlExact: "180",
          pnl: 180,
          allocationCount: 1,
        }, {
          tradeSubjectId: swing.tradeSubjectId,
          pnlExact: "-25",
          pnl: -25,
          allocationCount: 1,
        }]),
        session("2026-08-01", [{
          tradeSubjectId: swing.tradeSubjectId,
          pnlExact: "-25",
          pnl: -25,
          allocationCount: 1,
        }]),
      ],
    };

    const july = buildTradeBrowser(snapshot, {
      ...EMPTY_TRADE_BROWSER_STATE,
      activityFrom: "2026-07-31",
      activityThrough: "2026-08-01",
      calendarMonth: "2026-07",
    });
    expect(july.evidence).toHaveLength(2);
    expect(july.evidence.find(({ trade }) => trade.symbol === "QQQ")).toMatchObject({
      contributionPnlExact: "-50",
      allocationCount: 2,
      activityDates: ["2026-07-31", "2026-08-01"],
    });
    expect(july.contributionPnlExact).toBe("130");
    expect(july.calendar.month).toBe("2026-07");
    expect(july.calendar.previousMonth).toBeNull();
    expect(july.calendar.nextMonth).toBe("2026-08");

    const leapDay = buildTradeBrowser(snapshot, {
      ...EMPTY_TRADE_BROWSER_STATE,
      activityFrom: "2024-02-29",
      activityThrough: "2024-02-29",
    });
    expect(leapDay.evidence.map(({ trade }) => trade.symbol)).toEqual(["AAPL"]);
    expect(leapDay.contributionPnlExact).toBe("0");
    expect(leapDay.allocationCount).toBe(1);
  });

  it("isolates same-symbol accounts and aggregates fractional evidence exactly", () => {
    const primary = {
      ...demoTrade("AAPL"),
      resultPnl: 0.3,
      resultPnlExact: "0.3",
    };
    const swingBase = demoTrade("QQQ");
    const swing = {
      ...swingBase,
      symbol: "AAPL",
      resultPnl: -0.05,
      resultPnlExact: "-0.05",
    };
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      accountOptions: [
        { id: primary.accountId, label: primary.accountLabel, tradeCount: 1 },
        { id: swing.accountId, label: swing.accountLabel, tradeCount: 1 },
      ],
      trades: [primary, swing],
      calendar: [
        session("2026-07-01", [{
          tradeSubjectId: primary.tradeSubjectId,
          pnlExact: "0.1",
          pnl: 0.1,
          allocationCount: 1,
        }, {
          tradeSubjectId: swing.tradeSubjectId,
          pnlExact: "-0.05",
          pnl: -0.05,
          allocationCount: 1,
        }]),
        session("2026-07-02", [{
          tradeSubjectId: primary.tradeSubjectId,
          pnlExact: "0.2",
          pnl: 0.2,
          allocationCount: 1,
        }]),
      ],
    };

    const browser = buildTradeBrowser(snapshot, {
      ...EMPTY_TRADE_BROWSER_STATE,
      accountId: primary.accountId,
    });
    expect(browser.evidence).toHaveLength(1);
    expect(browser.evidence[0]).toMatchObject({
      trade: { tradeSubjectId: primary.tradeSubjectId, symbol: "AAPL" },
      contributionPnlExact: "0.3",
      allocationCount: 2,
      activityDates: ["2026-07-01", "2026-07-02"],
    });
    expect(browser.contributionPnlExact).toBe("0.3");
  });

  it("fails closed when a retained selected day is no longer in scope", () => {
    const browser = buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      selectedDay: "2026-07-03",
    });
    expect(browser.invalidatedSelectedDay).toBe("2026-07-03");
    expect(browser.state.selectedDay).toBeNull();
    expect(browser.evidence).toEqual([]);
    expect(browser.visibleEvidence).toEqual([]);
    expect(browser.contributionPnlExact).toBe("0");
    expect(browser.allocationCount).toBe(0);
    expect(browser.activityDayCount).toBe(0);
  });

  it("fails closed for invalid scope, identity, and calendar evidence", () => {
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      activityFrom: "2026-07-10",
      activityThrough: "2026-07-01",
    })).toThrow(/on or before/);
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      activityFrom: "2026-02-30",
    })).toThrow(/valid Gregorian/);
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      accountId: "missing-account",
    })).toThrow(/no longer available/);
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      query: "x".repeat(TRADE_BROWSER_SEARCH_MAX_CODE_POINTS + 1),
    })).toThrow(/cannot exceed/);
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      query: "AAPL\nMSFT",
    })).toThrow(/control characters/);
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      query: "\tAAPL",
    })).toThrow(/control characters/);

    const firstDay = DEMO_WORKSPACE.calendar[0];
    if (firstDay === undefined) throw new Error("Missing demo calendar day.");
    expect(() => buildTradeBrowser({
      ...DEMO_WORKSPACE,
      calendar: [{ ...firstDay, pnlExact: "999", pnl: 999 }],
    })).toThrow(/does not reconcile/);
    expect(() => buildTradeBrowser({
      ...DEMO_WORKSPACE,
      accountOptions: DEMO_WORKSPACE.accountOptions.map((option) => (
        option.id === "demo-account-swing"
          ? { ...option, tradeCount: option.tradeCount + 1 }
          : option
      )),
    })).toThrow(/trade count does not reconcile/);
  });
});
