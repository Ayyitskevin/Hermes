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
    expect(browser.hasViewFilters).toBe(false);
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

  it("ANDs exact card facets with search without changing scope evidence or totals", () => {
    const facets = buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      assetClass: "etf",
      direction: "short",
      positionState: "closed",
      reviewState: "completed",
    });

    expect(facets.hasViewFilters).toBe(true);
    expect(facets.state).toMatchObject({
      assetClass: "etf",
      direction: "short",
      positionState: "closed",
      reviewState: "completed",
    });
    expect(facets.evidence).toHaveLength(8);
    expect(facets.visibleEvidence.map(({ trade }) => trade.symbol)).toEqual(["QQQ"]);
    expect(facets.contributionPnlExact).toBe("310");
    expect(facets.allocationCount).toBe(16);
    expect(facets.activityDayCount).toBe(6);
    expect(facets.calendar).toEqual(buildTradeBrowser(DEMO_WORKSPACE).calendar);
    expect(Object.isFrozen(facets.state)).toBe(true);
    expect(Object.isFrozen(facets.visibleEvidence)).toBe(true);

    const conflictingSearch = buildTradeBrowser(DEMO_WORKSPACE, {
      ...facets.state,
      query: "spy",
    });
    expect(conflictingSearch.evidence).toEqual(facets.evidence);
    expect(conflictingSearch.visibleEvidence).toEqual([]);
    expect(conflictingSearch.contributionPnlExact).toBe("310");
  });

  it("matches every fixed facet against the canonical trade field only", () => {
    const varied: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      trades: DEMO_WORKSPACE.trades.map((trade, index) => Object.freeze({
        ...trade,
        status: index === 0 ? "open" as const : "closed" as const,
        reviewStatus: index === 0
          ? "draft" as const
          : index === 1
            ? "pending" as const
            : "completed" as const,
      })),
    };

    const visible = (overrides: Partial<typeof EMPTY_TRADE_BROWSER_STATE>) => (
      buildTradeBrowser(varied, { ...EMPTY_TRADE_BROWSER_STATE, ...overrides })
        .visibleEvidence.map(({ trade }) => trade.symbol)
    );
    expect(visible({ assetClass: "etf" })).toEqual(["QQQ", "SPY"]);
    expect(visible({ assetClass: "stock" })).toHaveLength(6);
    expect(visible({ direction: "short" })).toEqual(["QQQ", "TSLA"]);
    expect(visible({ direction: "long" })).toHaveLength(6);
    expect(visible({ positionState: "open" })).toEqual(["AAPL"]);
    expect(visible({ positionState: "closed" })).toHaveLength(7);
    expect(visible({ reviewState: "draft" })).toEqual(["AAPL"]);
    expect(visible({ reviewState: "pending" })).toEqual(["MSFT"]);
    expect(visible({ reviewState: "completed" })).toHaveLength(6);
  });

  it("ANDs exact review facets with fixed facets, search, and scope without changing totals", () => {
    const browser = buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      activityFrom: "2026-07-02",
      activityThrough: "2026-07-02",
      query: "tsla",
      assetClass: "stock",
      direction: "short",
      positionState: "closed",
      reviewState: "completed",
      mistake: "Early entry",
      emotion: "Impatient",
      tag: "Invalidation respected",
    });

    expect(browser.state).toMatchObject({
      mistake: "Early entry",
      emotion: "Impatient",
      tag: "Invalidation respected",
    });
    expect(browser.hasViewFilters).toBe(true);
    expect(browser.evidence.map(({ trade }) => trade.symbol)).toEqual(["NVDA", "TSLA"]);
    expect(browser.visibleEvidence.map(({ trade }) => trade.symbol)).toEqual(["TSLA"]);
    expect(browser.contributionPnlExact).toBe("150");
    expect(browser.allocationCount).toBe(4);
    expect(browser.activityDayCount).toBe(1);
    expect(browser.calendar).toEqual(buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      activityFrom: "2026-07-02",
      activityThrough: "2026-07-02",
    }).calendar);
  });

  it("filters each dynamic predicate independently and ANDs pairwise near-matches", () => {
    const visibleSymbols = (
      snapshot: JournalWorkspaceSnapshot,
      filters: {
        readonly mistake?: string;
        readonly emotion?: string;
        readonly tag?: string;
      },
    ) => buildTradeBrowser(snapshot, {
      ...EMPTY_TRADE_BROWSER_STATE,
      ...filters,
    }).visibleEvidence.map(({ trade }) => trade.symbol).sort();

    expect(visibleSymbols(DEMO_WORKSPACE, {
      mistake: "Early entry",
    })).toEqual(["TSLA"]);
    expect(visibleSymbols(DEMO_WORKSPACE, {
      emotion: "Impatient",
    })).toEqual(["SPY", "TSLA"]);
    expect(visibleSymbols(DEMO_WORKSPACE, {
      tag: "Plan followed",
    })).toEqual(["AAPL", "AMD", "META", "MSFT", "NVDA"]);

    const nearMatches: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      trades: DEMO_WORKSPACE.trades.map((trade) => {
        if (trade.symbol === "AAPL") {
          return {
            ...trade,
            mistakes: ["Shared mistake"],
            emotion: "Calm",
            tags: ["Shared tag"],
          };
        }
        if (trade.symbol === "TSLA") {
          return {
            ...trade,
            mistakes: ["Shared mistake"],
            emotion: "Impatient",
            tags: ["Shared tag"],
          };
        }
        if (trade.symbol === "SPY") {
          return {
            ...trade,
            mistakes: ["Other mistake"],
            emotion: "Impatient",
            tags: ["Other tag"],
          };
        }
        return trade;
      }),
    };

    expect(visibleSymbols(nearMatches, {
      mistake: "Shared mistake",
      emotion: "Impatient",
    })).toEqual(["TSLA"]);
    expect(visibleSymbols(nearMatches, {
      emotion: "Impatient",
      tag: "Shared tag",
    })).toEqual(["TSLA"]);
  });

  it("matches any exact member of multi-valued mistake and tag assignments", () => {
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      trades: DEMO_WORKSPACE.trades.map((trade) => (
        trade.symbol === "TSLA"
          ? {
              ...trade,
              mistakes: ["First mistake", "Early entry"],
              tags: ["Invalidation respected", "Secondary tag"],
            }
          : trade
      )),
    };

    const browser = buildTradeBrowser(snapshot, {
      ...EMPTY_TRADE_BROWSER_STATE,
      mistake: "Early entry",
      emotion: "Impatient",
      tag: "Secondary tag",
    });
    expect(browser.visibleEvidence.map(({ trade }) => trade.symbol)).toEqual(["TSLA"]);
  });

  it("derives globally sorted exact review options from current trade assignments only", () => {
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      reviewOptions: Object.freeze({
        setups: Object.freeze([]),
        mistakes: Object.freeze(["Historical mistake"]),
        emotions: Object.freeze(["Day-only emotion"]),
        tags: Object.freeze(["Archived tag"]),
        playbooks: Object.freeze([]),
      }),
    };
    const browser = buildTradeBrowser(snapshot, {
      ...EMPTY_TRADE_BROWSER_STATE,
      accountId: "demo-account-primary",
      activityFrom: "2026-07-08",
      activityThrough: "2026-07-08",
    });

    expect(browser.reviewFacetOptions).toEqual({
      mistakes: ["Chased entry", "Early entry"],
      emotions: ["Calm", "Focused", "Hesitant", "Impatient", "Patient"],
      tags: [
        "Chased entry",
        "Early entry",
        "Early exit",
        "Invalidation respected",
        "Opening range",
        "Patient entry",
        "Plan followed",
        "Protected remainder",
        "Risk reduced",
        "Stop respected",
        "Stopped on plan",
        "Target held",
      ],
    });
    expect(browser.reviewFacetOptions.mistakes).toContain("Chased entry");
    expect(browser.reviewFacetOptions.tags).not.toContain("Archived tag");
    expect(browser.visibleEvidence.map(({ trade }) => trade.symbol)).toEqual(["META"]);
  });

  it("retains well-formed stale review selections and yields zero visible matches", () => {
    const browser = buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      mistake: "No longer assigned mistake",
      emotion: "No longer assigned emotion",
      tag: "No longer assigned tag",
    });

    expect(browser.state).toMatchObject({
      mistake: "No longer assigned mistake",
      emotion: "No longer assigned emotion",
      tag: "No longer assigned tag",
    });
    expect(browser.reviewFacetOptions.mistakes).not.toContain(browser.state.mistake);
    expect(browser.reviewFacetOptions.emotions).not.toContain(browser.state.emotion);
    expect(browser.reviewFacetOptions.tags).not.toContain(browser.state.tag);
    expect(browser.evidence).toHaveLength(8);
    expect(browser.visibleEvidence).toEqual([]);
    expect(browser.contributionPnlExact).toBe("310");
    expect(browser.allocationCount).toBe(16);
    expect(browser.activityDayCount).toBe(6);
  });

  it("normalizes selected review labels with the saved-review label contract", () => {
    const browser = buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      mistake: "  Early   entry  ",
      emotion: " Impatient ",
      tag: " Invalidation   respected ",
    });

    expect(browser.state).toMatchObject({
      mistake: "Early entry",
      emotion: "Impatient",
      tag: "Invalidation respected",
    });
    expect(browser.visibleEvidence.map(({ trade }) => trade.symbol)).toEqual(["TSLA"]);
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

    const stockOnly = buildTradeBrowser(snapshot, {
      ...EMPTY_TRADE_BROWSER_STATE,
      assetClass: "stock",
    });
    const etfOnly = buildTradeBrowser(snapshot, {
      ...EMPTY_TRADE_BROWSER_STATE,
      assetClass: "etf",
    });
    expect(stockOnly.visibleEvidence.map(({ trade }) => ({
      assetClass: trade.assetClass,
      subject: trade.tradeSubjectId,
      symbol: trade.symbol,
    }))).toEqual([{
      assetClass: "stock",
      subject: primary.tradeSubjectId,
      symbol: "AAPL",
    }]);
    expect(etfOnly.visibleEvidence.map(({ trade }) => ({
      assetClass: trade.assetClass,
      subject: trade.tradeSubjectId,
      symbol: trade.symbol,
    }))).toEqual([{
      assetClass: "etf",
      subject: swing.tradeSubjectId,
      symbol: "AAPL",
    }]);
  });

  it("detaches and freezes card evidence from a mutable local snapshot", () => {
    const source = demoTrade("AAPL");
    const mutableTrade = {
      ...source,
      mistakes: [...source.mistakes],
      reviewSessionDates: [...source.reviewSessionDates],
      tags: [...source.tags],
      rules: source.rules.map((rule) => ({ ...rule })),
      initialRisk: source.initialRisk === null ? null : { ...source.initialRisk },
      executions: source.executions.map((execution) => ({ ...execution })),
    };
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      trades: [mutableTrade, ...DEMO_WORKSPACE.trades.slice(1)],
    };
    const browser = buildTradeBrowser(snapshot, {
      ...EMPTY_TRADE_BROWSER_STATE,
      assetClass: "stock",
    });
    const evidence = browser.visibleEvidence.find(({ trade }) => (
      trade.tradeSubjectId === mutableTrade.tradeSubjectId
    ));
    if (evidence === undefined) throw new Error("Missing mutable-source evidence.");

    mutableTrade.assetClass = "etf";
    mutableTrade.tags.push("mutated-after-build");
    if (mutableTrade.executions[0] !== undefined) {
      mutableTrade.executions[0].price = "0";
    }

    expect(evidence.trade.assetClass).toBe("stock");
    expect(evidence.trade.tags).not.toContain("mutated-after-build");
    expect(evidence.trade.executions[0]?.price).not.toBe("0");
    expect(Object.isFrozen(evidence.trade)).toBe(true);
    expect(Object.isFrozen(evidence.trade.tags)).toBe(true);
    expect(Object.isFrozen(evidence.trade.executions[0])).toBe(true);
  });

  it("deeply freezes and detaches review facet options from mutable trade labels", () => {
    const source = demoTrade("AAPL");
    const mutableTrade = {
      ...source,
      mistakes: ["Detached mistake"],
      emotion: "Detached emotion",
      tags: ["Detached tag"],
    };
    const snapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      trades: [mutableTrade, ...DEMO_WORKSPACE.trades.slice(1)],
    };
    const browser = buildTradeBrowser(snapshot);

    mutableTrade.mistakes.push("Mutated mistake");
    mutableTrade.emotion = "Mutated emotion";
    mutableTrade.tags.push("Mutated tag");

    expect(browser.reviewFacetOptions.mistakes).toContain("Detached mistake");
    expect(browser.reviewFacetOptions.emotions).toContain("Detached emotion");
    expect(browser.reviewFacetOptions.tags).toContain("Detached tag");
    expect(browser.reviewFacetOptions.mistakes).not.toContain("Mutated mistake");
    expect(browser.reviewFacetOptions.emotions).not.toContain("Mutated emotion");
    expect(browser.reviewFacetOptions.tags).not.toContain("Mutated tag");
    expect(Object.isFrozen(browser.reviewFacetOptions)).toBe(true);
    expect(Object.isFrozen(browser.reviewFacetOptions.mistakes)).toBe(true);
    expect(Object.isFrozen(browser.reviewFacetOptions.emotions)).toBe(true);
    expect(Object.isFrozen(browser.reviewFacetOptions.tags)).toBe(true);
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
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      assetClass: "option" as never,
    })).toThrow(/Asset class.*not a supported/i);
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      direction: "buy" as never,
    })).toThrow(/Direction.*not a supported/i);
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      positionState: "partial" as never,
    })).toThrow(/Position state.*not a supported/i);
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      reviewState: undefined as never,
    })).toThrow(/Review state.*not a supported/i);
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      mistake: 7 as never,
    })).toThrow(/Mistake filter.*single-line/i);
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      emotion: "",
    })).toThrow(/Emotion filter.*1-120/i);
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      tag: "line\nbreak",
    })).toThrow(/Tag filter.*single-line/i);
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      tag: "x".repeat(121),
    })).toThrow(/Tag filter.*1-120/i);
    expect(() => buildTradeBrowser(DEMO_WORKSPACE, {
      ...EMPTY_TRADE_BROWSER_STATE,
      emotion: "İ".repeat(120),
    })).toThrow(/Emotion filter.*1-120/i);

    for (const [field, value, label] of [
      ["assetClass", "option", "asset class"],
      ["side", "buy", "direction"],
      ["status", "partial", "position state"],
      ["reviewStatus", "unknown", "review state"],
    ] as const) {
      const malformed = {
        ...DEMO_WORKSPACE,
        trades: DEMO_WORKSPACE.trades.map((trade, index) => (
          index === 0 ? { ...trade, [field]: value } : trade
        )),
      } as unknown as JournalWorkspaceSnapshot;
      expect(() => buildTradeBrowser(malformed)).toThrow(
        new RegExp(`Trade .* ${label}.*not a supported`, "i"),
      );
    }

    for (const [field, value, expected] of [
      ["mistakes", "not-a-list", /mistakes.*at most 20/i],
      ["mistakes", [" Early entry "], /mistakes value.*not normalized/i],
      ["emotion", ["Calm"], /emotion.*single-line/i],
      ["tags", ["line\nbreak"], /tags value.*single-line/i],
      [
        "tags",
        Array.from({ length: 21 }, (_, index) => `Tag ${index}`),
        /tags.*at most 20/i,
      ],
    ] as const) {
      const malformed = {
        ...DEMO_WORKSPACE,
        trades: DEMO_WORKSPACE.trades.map((trade, index) => (
          index === 0 ? { ...trade, [field]: value } : trade
        )),
      } as unknown as JournalWorkspaceSnapshot;
      expect(() => buildTradeBrowser(malformed)).toThrow(expected);
    }

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
