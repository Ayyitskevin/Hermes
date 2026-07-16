import { describe, expect, it } from "vitest";

import { sha256Hex } from "../adapters/sqlite/schema/checksum";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  OPENING_WEEKDAY_MIX_REPORT_DEFINITION,
  OPENING_WEEKDAY_MIX_REPORT_DEFINITION_CANONICAL_JSON,
  OPENING_WEEKDAY_MIX_REPORT_DEFINITION_SHA256,
  OPENING_WEEKDAY_MIX_REPORT_VERSION,
  OPENING_WEEKDAY_ORDER,
  buildOpeningWeekdayMixReport,
} from "./opening-weekday-mix-report";
import type { JournalWorkspaceSnapshot, TradePreview } from "./types";

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

function snapshot(trades: readonly TradePreview[]): JournalWorkspaceSnapshot {
  return { ...DEMO_WORKSPACE, trades };
}

describe("opening-weekday-mix report v1", () => {
  it("pins the independently replayable deeply immutable definition", () => {
    expect(OPENING_WEEKDAY_MIX_REPORT_DEFINITION_CANONICAL_JSON).toBe(
      JSON.stringify(OPENING_WEEKDAY_MIX_REPORT_DEFINITION),
    );
    expect(
      sha256Hex(OPENING_WEEKDAY_MIX_REPORT_DEFINITION_CANONICAL_JSON),
    ).toBe(OPENING_WEEKDAY_MIX_REPORT_DEFINITION_SHA256);
    expect(OPENING_WEEKDAY_MIX_REPORT_DEFINITION).toMatchObject({
      version: OPENING_WEEKDAY_MIX_REPORT_VERSION,
      inputs: {
        projection: "current-full-workspace-projection",
        openingDate:
          "trade.tradedOn:workspace-local-opening-date-derived-from-ledger-openedAtUs",
        evidenceFields: [
          "tradeSubjectId",
          "accountLabel",
          "symbol",
          "side",
          "tradedOn",
          "sessionLabel",
          "status",
          "openingWeekday",
        ],
        tradeBrowserScope: "not-consumed",
        reviewStateAndAuthoredContent: "not-consumed",
        resultFields: "not-consumed",
      },
      cohort: {
        inclusion: "every-current-projection-trade-exactly-once",
        exclusions: "none",
        conservation: "sum(group.tradeCount)=totalTradeCount",
      },
      openingDateValidation: {
        format:
          "real-Gregorian-YYYY-MM-DD-from-1970-01-01-through-9999-12-31",
        meaning: "workspace-local-calendar-date-of-first-entry-allocation",
        invalidInput: "throw;never-repair-drop-or-default",
      },
      evidenceValidation: {
        directionAllowed: ["long", "short"],
        positionStatusAllowed: ["open", "closed"],
        invalidInput: "throw;never-repair-drop-or-default",
      },
      groupOrder:
        "fixed:monday-through-sunday;all-seven-groups-always-present",
      counting: {
        assignmentCardinality: "one-opening-weekday-group-per-current-trade",
        rates: "not-calculated",
      },
      migration: {
        decision: "derived-only-recompute",
        archiveShapeChange: false,
      },
    });
    for (const value of [
      OPENING_WEEKDAY_ORDER,
      OPENING_WEEKDAY_MIX_REPORT_DEFINITION,
      OPENING_WEEKDAY_MIX_REPORT_DEFINITION.inputs,
      OPENING_WEEKDAY_MIX_REPORT_DEFINITION.inputs.evidenceFields,
      OPENING_WEEKDAY_MIX_REPORT_DEFINITION.cohort,
      OPENING_WEEKDAY_MIX_REPORT_DEFINITION.openingDateValidation,
      OPENING_WEEKDAY_MIX_REPORT_DEFINITION.evidenceValidation,
      OPENING_WEEKDAY_MIX_REPORT_DEFINITION.evidenceValidation.directionAllowed,
      OPENING_WEEKDAY_MIX_REPORT_DEFINITION.evidenceValidation
        .positionStatusAllowed,
      OPENING_WEEKDAY_MIX_REPORT_DEFINITION.evidenceOrder,
      OPENING_WEEKDAY_MIX_REPORT_DEFINITION.counting,
      OPENING_WEEKDAY_MIX_REPORT_DEFINITION.migration,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it("counts every demo trade once in fixed Monday-through-Sunday order", () => {
    const report = buildOpeningWeekdayMixReport(DEMO_WORKSPACE);

    expect(report.metadata).toEqual({
      version: OPENING_WEEKDAY_MIX_REPORT_VERSION,
      definitionSha256: OPENING_WEEKDAY_MIX_REPORT_DEFINITION_SHA256,
      timeZone: "UTC",
      accountLabel: "2 demo accounts",
      periodLabel: "Jul 1–9, 2026",
      totalTradeCount: 8,
    });
    expect(report.groups.map((group) => [
      group.weekday,
      group.tradeCount,
      group.tradeSubjectIds,
    ])).toEqual([
      ["monday", 1, ["demo-subject-amd"]],
      ["tuesday", 1, ["demo-subject-spy"]],
      ["wednesday", 3, [
        "demo-subject-meta",
        "demo-subject-aapl",
        "demo-subject-msft",
      ]],
      ["thursday", 3, [
        "demo-subject-qqq",
        "demo-subject-nvda",
        "demo-subject-tsla",
      ]],
      ["friday", 0, []],
      ["saturday", 0, []],
      ["sunday", 0, []],
    ]);
    expect(
      report.groups.reduce((total, group) => total + group.tradeCount, 0),
    ).toBe(report.metadata.totalTradeCount);
  });

  it("derives all seven weekdays from the exact opening date", () => {
    const aapl = demoTrade("AAPL");
    const dates = [
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
      "2026-07-11",
      "2026-07-12",
    ] as const;
    const report = buildOpeningWeekdayMixReport(snapshot(
      dates.map((tradedOn, index) => cloneTrade(aapl, String(index), {
        tradedOn,
      })),
    ));

    expect(report.groups.map((group) => [
      group.weekday,
      group.tradeCount,
      group.evidence[0]?.tradedOn,
    ])).toEqual(OPENING_WEEKDAY_ORDER.map((weekday, index) => [
      weekday,
      1,
      dates[index],
    ]));
  });

  it("ignores reviews, results, currency, and browser state while retaining scalar evidence", () => {
    const aapl = demoTrade("AAPL");
    const report = buildOpeningWeekdayMixReport({
      ...snapshot([
        cloneTrade(aapl, "review-neutral", {
          reviewStatus: "approved" as TradePreview["reviewStatus"],
          reviewId: "different-review",
          reviewVersion: 99,
          note: "Authored narrative that must not be consumed.",
          tags: ["Hidden report input"],
          emotion: "Excited",
          mistakes: ["Ignored"],
          resultPnl: 999_999,
          resultPnlExact: "999999",
          resultR: 999,
        }),
      ]),
      currencyCode: "EUR",
    });
    const evidence = report.groups.flatMap((group) => group.evidence);

    expect(evidence).toHaveLength(1);
    expect(Object.keys(evidence[0] ?? {})).toEqual([
      "tradeSubjectId",
      "accountLabel",
      "symbol",
      "side",
      "tradedOn",
      "sessionLabel",
      "status",
      "openingWeekday",
    ]);
    expect(Object.keys(report.metadata)).not.toContain("currencyCode");
    expect(JSON.stringify(report)).not.toContain("Authored narrative");
    expect(JSON.stringify(report)).not.toContain("999999");
  });

  it("is unchanged across positive, negative, and open null outcome fields", () => {
    const aapl = demoTrade("AAPL");
    const openWithoutResult = cloneTrade(aapl, "outcome-neutral", {
      status: "open",
      averageExit: null,
      resultPnl: null,
      resultPnlExact: null,
      resultR: null,
      percentReturn: null,
    });
    const baseline = buildOpeningWeekdayMixReport(snapshot([
      openWithoutResult,
    ]));

    for (const result of [
      {
        averageExit: 110,
        resultPnl: 250,
        resultPnlExact: "250",
        resultR: 2,
        percentReturn: 5,
      },
      {
        averageExit: 90,
        resultPnl: -175,
        resultPnlExact: "-175",
        resultR: -1.4,
        percentReturn: -3.5,
      },
    ] satisfies readonly Partial<TradePreview>[]) {
      expect(buildOpeningWeekdayMixReport(snapshot([{
        ...openWithoutResult,
        ...result,
      }]))).toEqual(baseline);
    }
  });

  it("orders equal-date evidence by stable subject ID and preserves display text", () => {
    const aapl = demoTrade("AAPL");
    const report = buildOpeningWeekdayMixReport(snapshot([
      cloneTrade(aapl, "z", {
        tradeSubjectId: "subject-z",
        symbol: "<AAPL & friends>",
        sessionLabel: "<late & session>",
        accountLabel: "<Broker & One>",
        tradedOn: "2026-07-08",
      }),
      cloneTrade(aapl, "a", {
        tradeSubjectId: "subject-a",
        tradedOn: "2026-07-08",
      }),
      cloneTrade(aapl, "older", {
        tradeSubjectId: "subject-older",
        tradedOn: "2026-07-01",
      }),
    ]));

    expect(report.groups[2]?.tradeSubjectIds).toEqual([
      "subject-a",
      "subject-z",
      "subject-older",
    ]);
    expect(report.groups[2]?.evidence[1]).toMatchObject({
      symbol: "<AAPL & friends>",
      sessionLabel: "<late & session>",
      accountLabel: "<Broker & One>",
    });
  });

  it.each([
    ["before supported range", "1969-12-31"],
    ["non-canonical month", "2026-7-01"],
    ["impossible date", "2026-02-30"],
    ["timestamp instead of date", "2026-07-01T13:30:00Z"],
    ["after supported range", "10000-01-01"],
  ])("rejects an invalid %s opening date", (_label, tradedOn) => {
    expect(() => buildOpeningWeekdayMixReport(snapshot([
      cloneTrade(demoTrade("AAPL"), "invalid-date", { tradedOn }),
    ]))).toThrow(/opening date must/u);
  });

  it.each([
    ["blank", ""],
    ["leading whitespace", " subject"],
    ["C0 control", "subject\u0000"],
    ["C1 control", "subject\u0085"],
    ["too long", "x".repeat(257)],
  ])("rejects an invalid %s stable identity", (_label, tradeSubjectId) => {
    expect(() => buildOpeningWeekdayMixReport(snapshot([
      cloneTrade(demoTrade("AAPL"), "invalid", { tradeSubjectId }),
    ]))).toThrow(/1-256 character trimmed, control-free, unique subject identities/u);
  });

  it("measures the stable-identity limit in Unicode code points", () => {
    for (const tradeSubjectId of ["x".repeat(256), "😀".repeat(256)]) {
      expect(() => buildOpeningWeekdayMixReport(snapshot([
        cloneTrade(demoTrade("AAPL"), "boundary", { tradeSubjectId }),
      ]))).not.toThrow();
    }
    expect(() => buildOpeningWeekdayMixReport(snapshot([
      cloneTrade(demoTrade("AAPL"), "too-many-code-points", {
        tradeSubjectId: "😀".repeat(257),
      }),
    ]))).toThrow(
      /1-256 character trimmed, control-free, unique subject identities/u,
    );
  });

  it("rejects duplicate identities and unsupported scalar evidence", () => {
    const aapl = cloneTrade(demoTrade("AAPL"), "first", {
      tradeSubjectId: "duplicate",
    });
    const msft = cloneTrade(demoTrade("MSFT"), "second", {
      tradeSubjectId: "duplicate",
    });
    expect(() => buildOpeningWeekdayMixReport(snapshot([aapl, msft])))
      .toThrow(/unique subject identities/u);
    expect(() => buildOpeningWeekdayMixReport(snapshot([
      cloneTrade(demoTrade("AAPL"), "invalid-side", {
        side: "flat" as TradePreview["side"],
      }),
    ]))).toThrow(/direction must be exactly long or short/u);
    expect(() => buildOpeningWeekdayMixReport(snapshot([
      cloneTrade(demoTrade("AAPL"), "invalid-position", {
        status: "settled" as TradePreview["status"],
      }),
    ]))).toThrow(/position status must be exactly open or closed/u);
  });

  it("returns detached deeply frozen output and seven fixed empty groups", () => {
    const mutable = { ...cloneTrade(demoTrade("AAPL"), "mutable") };
    const trades = [mutable];
    const report = buildOpeningWeekdayMixReport(snapshot(trades));
    const originalEvidence = report.groups[2]?.evidence[0];

    mutable.symbol = "CHANGED";
    trades.push(cloneTrade(demoTrade("MSFT"), "late"));
    expect(report.metadata.totalTradeCount).toBe(1);
    expect(originalEvidence?.symbol).toBe("AAPL");
    for (const value of [
      report,
      report.metadata,
      report.groups,
      ...report.groups,
      ...report.groups.map((group) => group.tradeSubjectIds),
      ...report.groups.map((group) => group.evidence),
      ...report.groups.flatMap((group) => group.evidence),
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }

    const empty = buildOpeningWeekdayMixReport(snapshot([]));
    expect(empty.metadata.totalTradeCount).toBe(0);
    expect(empty.groups.map((group) => [
      group.weekday,
      group.tradeCount,
      group.tradeSubjectIds,
    ])).toEqual(OPENING_WEEKDAY_ORDER.map((weekday) => [weekday, 0, []]));
  });
});
