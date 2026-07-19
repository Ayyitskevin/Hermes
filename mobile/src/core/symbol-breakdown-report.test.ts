import { describe, expect, it } from "vitest";

import { sha256Hex } from "../adapters/sqlite/schema/checksum";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  SYMBOL_BREAKDOWN_REPORT_DEFINITION,
  SYMBOL_BREAKDOWN_REPORT_DEFINITION_CANONICAL_JSON,
  SYMBOL_BREAKDOWN_REPORT_DEFINITION_SHA256,
  SYMBOL_BREAKDOWN_REPORT_VERSION,
  buildSymbolBreakdownReport,
} from "./symbol-breakdown-report";
import type { JournalWorkspaceSnapshot, TradePreview } from "./types";

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

function snapshot(trades: readonly TradePreview[]): JournalWorkspaceSnapshot {
  return { ...DEMO_WORKSPACE, trades };
}

describe("symbol-breakdown report v1", () => {
  it("pins the independently replayable deeply immutable definition", () => {
    expect(SYMBOL_BREAKDOWN_REPORT_DEFINITION_CANONICAL_JSON).toBe(
      JSON.stringify(SYMBOL_BREAKDOWN_REPORT_DEFINITION),
    );
    expect(sha256Hex(SYMBOL_BREAKDOWN_REPORT_DEFINITION_CANONICAL_JSON)).toBe(
      SYMBOL_BREAKDOWN_REPORT_DEFINITION_SHA256,
    );
    expect(SYMBOL_BREAKDOWN_REPORT_DEFINITION).toMatchObject({
      version: SYMBOL_BREAKDOWN_REPORT_VERSION,
      inputs: {
        projection: "current-full-workspace-projection",
        groupIdentity: "trade.assetClass+trade.symbol",
        evidenceFields: [
          "tradeSubjectId",
          "accountLabel",
          "symbol",
          "assetClass",
          "side",
          "tradedOn",
          "sessionLabel",
          "status",
          "reviewStatus",
        ],
        tradeBrowserScope: "not-consumed",
        dailyJournal: "not-consumed",
        reviewAuthoredContent: "not-consumed;reviewStatus-is-evidence-only",
        resultFields: "not-consumed",
      },
      cohort: {
        inclusion: "every-current-projection-trade-exactly-once",
        exclusions: "none",
        conservation:
          "sum(group.tradeCount)=totalTradeCount;sum(group.evidence.length)=totalTradeCount",
      },
      symbolValidation: {
        canonical: "uppercase-1-32:A-Z0-9._:/-",
        identity: "exact-assetClass+symbol",
        invalidInput: "throw;never-normalize-repair-drop-or-default",
      },
      assetClassValidation: {
        allowed: ["stock", "etf"],
      },
      sideValidation: {
        allowed: ["long", "short"],
      },
      dateValidation: {
        field: "trade.tradedOn",
        format:
          "real-Gregorian-YYYY-MM-DD-from-1970-01-01-through-9999-12-31",
        invalidInput: "throw;never-repair-drop-or-default",
      },
      evidenceValidation: {
        positionStatusAllowed: ["open", "closed"],
        reviewStatusAllowed: ["pending", "draft", "completed"],
      },
      groupOrder: "symbol:ascending-code-unit;assetClass:fixed-stock-then-etf",
      evidenceOrder: [
        "tradedOn:descending",
        "tradeSubjectId:ascending",
      ],
      counting: {
        assignmentCardinality: "one-symbol-asset-group-per-current-trade",
        rates: "not-calculated",
        financialValues: "not-calculated",
        rankings: "not-calculated",
      },
      migration: {
        decision: "derived-only-recompute",
        archiveShapeChange: false,
      },
    });
    for (const value of [
      SYMBOL_BREAKDOWN_REPORT_DEFINITION,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.inputs,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.inputs.evidenceFields,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.cohort,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.symbolValidation,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.assetClassValidation,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.assetClassValidation.allowed,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.sideValidation,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.sideValidation.allowed,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.dateValidation,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.evidenceValidation,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.evidenceValidation.positionStatusAllowed,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.evidenceValidation.reviewStatusAllowed,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.evidenceOrder,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.counting,
      SYMBOL_BREAKDOWN_REPORT_DEFINITION.migration,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it("counts every demo trade once in stable symbol and asset-class order", () => {
    const report = buildSymbolBreakdownReport(DEMO_WORKSPACE);

    expect(report.metadata).toEqual({
      version: SYMBOL_BREAKDOWN_REPORT_VERSION,
      definitionSha256: SYMBOL_BREAKDOWN_REPORT_DEFINITION_SHA256,
      timeZone: "UTC",
      accountLabel: "2 demo accounts",
      periodLabel: "Jul 1–9, 2026",
      totalTradeCount: 8,
      totalGroupCount: 8,
    });
    expect(report.groups.map((group) => [
      group.symbol,
      group.assetClass,
      group.tradeCount,
      group.tradeSubjectIds,
    ])).toEqual([
      ["AAPL", "stock", 1, ["demo-subject-aapl"]],
      ["AMD", "stock", 1, ["demo-subject-amd"]],
      ["META", "stock", 1, ["demo-subject-meta"]],
      ["MSFT", "stock", 1, ["demo-subject-msft"]],
      ["NVDA", "stock", 1, ["demo-subject-nvda"]],
      ["QQQ", "etf", 1, ["demo-subject-qqq"]],
      ["SPY", "etf", 1, ["demo-subject-spy"]],
      ["TSLA", "stock", 1, ["demo-subject-tsla"]],
    ]);
    expect(
      report.groups.reduce((total, group) => total + group.tradeCount, 0),
    ).toBe(report.metadata.totalTradeCount);
    expect(
      report.groups.reduce((total, group) => total + group.evidence.length, 0),
    ).toBe(report.metadata.totalTradeCount);
  });

  it("groups the same exact symbol and asset across accounts", () => {
    const aapl = demoTrade("AAPL");
    const report = buildSymbolBreakdownReport(snapshot([
      cloneTrade(aapl, "account-a", {
        accountId: "account-a",
        accountLabel: "Broker A",
        tradedOn: "2026-07-12",
      }),
      cloneTrade(aapl, "account-b", {
        accountId: "account-b",
        accountLabel: "Broker B",
        tradedOn: "2026-07-13",
      }),
    ]));

    expect(report.metadata).toMatchObject({
      totalTradeCount: 2,
      totalGroupCount: 1,
    });
    expect(report.groups[0]).toMatchObject({
      symbol: "AAPL",
      assetClass: "stock",
      tradeCount: 2,
      tradeSubjectIds: [
        "demo-subject-aapl-account-b",
        "demo-subject-aapl-account-a",
      ],
    });
    expect(report.groups[0]?.evidence.map((trade) => trade.accountLabel))
      .toEqual(["Broker B", "Broker A"]);
  });

  it("keeps an identical symbol in different asset classes separate", () => {
    const aapl = demoTrade("AAPL");
    const report = buildSymbolBreakdownReport(snapshot([
      cloneTrade(aapl, "etf", { assetClass: "etf" }),
      cloneTrade(aapl, "stock", { assetClass: "stock" }),
    ]));

    expect(report.groups.map((group) => [
      group.symbol,
      group.assetClass,
      group.tradeCount,
    ])).toEqual([
      ["AAPL", "stock", 1],
      ["AAPL", "etf", 1],
    ]);
  });

  it("includes every exact position, review, and direction state as evidence only", () => {
    const aapl = demoTrade("AAPL");
    const trades = [
      cloneTrade(aapl, "open-pending-long", {
        tradeSubjectId: "subject-open-pending-long",
        side: "long",
        status: "open",
        reviewStatus: "pending",
        reviewId: null,
        reviewVersion: null,
        tradedOn: "2026-07-15",
      }),
      cloneTrade(aapl, "closed-draft-short", {
        tradeSubjectId: "subject-closed-draft-short",
        side: "short",
        status: "closed",
        reviewStatus: "draft",
        tradedOn: "2026-07-14",
      }),
      cloneTrade(aapl, "open-completed-short", {
        tradeSubjectId: "subject-open-completed-short",
        side: "short",
        status: "open",
        reviewStatus: "completed",
        tradedOn: "2026-07-13",
      }),
      cloneTrade(aapl, "closed-pending-short", {
        tradeSubjectId: "subject-closed-pending-short",
        side: "short",
        status: "closed",
        reviewStatus: "pending",
        reviewId: null,
        reviewVersion: null,
        tradedOn: "2026-07-12",
      }),
      cloneTrade(aapl, "open-draft-long", {
        tradeSubjectId: "subject-open-draft-long",
        side: "long",
        status: "open",
        reviewStatus: "draft",
        tradedOn: "2026-07-11",
      }),
      cloneTrade(aapl, "closed-completed-long", {
        tradeSubjectId: "subject-closed-completed-long",
        side: "long",
        status: "closed",
        reviewStatus: "completed",
        tradedOn: "2026-07-10",
      }),
    ];
    const report = buildSymbolBreakdownReport(snapshot(trades));
    const evidence = report.groups[0]?.evidence ?? [];

    expect(report.groups[0]?.tradeCount).toBe(6);
    expect(evidence.map((trade) => [
      trade.tradeSubjectId,
      trade.side,
      trade.status,
      trade.reviewStatus,
    ])).toEqual([
      ["subject-open-pending-long", "long", "open", "pending"],
      ["subject-closed-draft-short", "short", "closed", "draft"],
      ["subject-open-completed-short", "short", "open", "completed"],
      ["subject-closed-pending-short", "short", "closed", "pending"],
      ["subject-open-draft-long", "long", "open", "draft"],
      ["subject-closed-completed-long", "long", "closed", "completed"],
    ]);
    expect(Object.keys(evidence[0] ?? {})).toEqual([
      "tradeSubjectId",
      "accountLabel",
      "symbol",
      "assetClass",
      "side",
      "tradedOn",
      "sessionLabel",
      "status",
      "reviewStatus",
    ]);
    expect(Object.keys(report.metadata)).not.toContain("currencyCode");
  });

  it("is neutral to result fields and authored review content", () => {
    const source = cloneTrade(demoTrade("AAPL"), "neutral", {
      tradeSubjectId: "subject-neutral",
    });
    const baseline = buildSymbolBreakdownReport(snapshot([source]));
    const changed = buildSymbolBreakdownReport(snapshot([{
      ...source,
      resultPnl: -999,
      resultPnlExact: "-999",
      resultR: -42,
      percentReturn: -88,
      setup: "Different setup",
      hasClassifiedSetup: true,
      mistakes: ["Different mistake"],
      emotion: "Different emotion",
      note: "Different authored note",
      tags: ["Different tag"],
      followedPlan: false,
      playbook: "Different playbook",
      rules: [],
      initialRisk: { amount: "777", currency: "USD" },
      plannedStop: "1",
      reviewId: "different-review-id",
      reviewVersion: 999,
    }]));

    expect(changed).toEqual(baseline);
  });

  it("orders groups by symbol then fixed asset class and evidence by date then subject", () => {
    const aapl = demoTrade("AAPL");
    const report = buildSymbolBreakdownReport(snapshot([
      cloneTrade(aapl, "msft", {
        tradeSubjectId: "subject-msft",
        symbol: "MSFT",
      }),
      cloneTrade(aapl, "aapl-etf", {
        tradeSubjectId: "subject-aapl-etf",
        assetClass: "etf",
      }),
      cloneTrade(aapl, "z", {
        tradeSubjectId: "subject-z",
        tradedOn: "2026-07-12",
        accountLabel: "<Broker & One>",
        sessionLabel: "<late & session>",
      }),
      cloneTrade(aapl, "a", {
        tradeSubjectId: "subject-a",
        tradedOn: "2026-07-12",
      }),
      cloneTrade(aapl, "older", {
        tradeSubjectId: "subject-older",
        tradedOn: "2026-07-11",
      }),
    ]));

    expect(report.groups.map((group) => [group.symbol, group.assetClass]))
      .toEqual([
        ["AAPL", "stock"],
        ["AAPL", "etf"],
        ["MSFT", "stock"],
      ]);
    expect(report.groups[0]?.tradeSubjectIds).toEqual([
      "subject-a",
      "subject-z",
      "subject-older",
    ]);
    expect(report.groups[0]?.evidence[1]).toMatchObject({
      accountLabel: "<Broker & One>",
      sessionLabel: "<late & session>",
    });
  });

  it.each([
    ["blank", ""],
    ["leading whitespace", " subject"],
    ["C0 control", "subject\u0000"],
    ["C1 control", "subject\u0085"],
    ["too long", "x".repeat(257)],
  ])("rejects an invalid %s stable identity", (_label, tradeSubjectId) => {
    expect(() => buildSymbolBreakdownReport(snapshot([
      cloneTrade(demoTrade("AAPL"), "invalid", { tradeSubjectId }),
    ]))).toThrow(/1-256 character trimmed, control-free, unique subject identities/u);
  });

  it("rejects duplicate subject identities", () => {
    const aapl = cloneTrade(demoTrade("AAPL"), "first", {
      tradeSubjectId: "duplicate",
    });
    const msft = cloneTrade(demoTrade("MSFT"), "second", {
      tradeSubjectId: "duplicate",
    });

    expect(() => buildSymbolBreakdownReport(snapshot([aapl, msft])))
      .toThrow(/unique subject identities/u);
  });

  it.each([
    ["lowercase symbol", { symbol: "aapl" }, /symbol must be canonical uppercase/u],
    ["whitespace symbol", { symbol: " AAPL" }, /symbol must be canonical uppercase/u],
    ["invalid symbol character", { symbol: "AAPL$" }, /symbol must be canonical uppercase/u],
    ["overlong symbol", { symbol: "A".repeat(33) }, /symbol must be canonical uppercase/u],
    ["asset class", { assetClass: "option" }, /asset class must be exactly stock or etf/u],
    ["direction", { side: "flat" }, /direction must be exactly long or short/u],
    ["position status", { status: "settled" }, /position status must be exactly open or closed/u],
    ["review status", { reviewStatus: "approved" }, /review status must be exactly pending, draft, or completed/u],
  ])("rejects invalid exact %s evidence", (_label, overrides, message) => {
    expect(() => buildSymbolBreakdownReport(snapshot([
      cloneTrade(demoTrade("AAPL"), "invalid", overrides as Partial<TradePreview>),
    ]))).toThrow(message);
  });

  it.each([
    ["non-canonical month", "2026-7-01", /canonical YYYY-MM-DD/u],
    ["before supported range", "1969-12-31", /canonical YYYY-MM-DD/u],
    ["non-leap date", "2026-02-29", /real Gregorian date/u],
    ["invalid month", "2026-13-01", /real Gregorian date/u],
  ])("rejects an invalid %s traded date", (_label, tradedOn, message) => {
    expect(() => buildSymbolBreakdownReport(snapshot([
      cloneTrade(demoTrade("AAPL"), "invalid-date", { tradedOn }),
    ]))).toThrow(message);
  });

  it("rejects an accessor-backed source cohort without invoking it", () => {
    let reads = 0;
    const changingSnapshot: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      get trades(): readonly TradePreview[] {
        reads += 1;
        return [cloneTrade(demoTrade("AAPL"), "accessor-cohort")];
      },
    };

    expect(() => buildSymbolBreakdownReport(changingSnapshot))
      .toThrow(/snapshot inputs must use own data properties/u);
    expect(reads).toBe(0);
  });

  it("rejects a metadata accessor before it can mutate retained evidence", () => {
    const first = cloneTrade(demoTrade("AAPL"), "metadata-first");
    const second = { ...cloneTrade(demoTrade("MSFT"), "metadata-second") };
    const originalSecondId = second.tradeSubjectId;
    let reads = 0;
    const mutatingSnapshot: JournalWorkspaceSnapshot = {
      ...snapshot([first, second]),
      get timeZone(): string {
        reads += 1;
        second.tradeSubjectId = "replacement-second";
        return DEMO_WORKSPACE.timeZone;
      },
    };

    expect(() => buildSymbolBreakdownReport(mutatingSnapshot))
      .toThrow(/snapshot inputs must use own data properties/u);
    expect(reads).toBe(0);
    expect(second.tradeSubjectId).toBe(originalSecondId);
  });

  it("captures the exact indexed cohort without trusting its iterator", () => {
    const trades = [
      cloneTrade(demoTrade("AAPL"), "indexed-a"),
      cloneTrade(demoTrade("MSFT"), "indexed-b"),
    ];
    let iteratorReads = 0;
    Object.defineProperty(trades, Symbol.iterator, {
      configurable: true,
      value: function* manipulatedIterator(): Generator<TradePreview> {
        iteratorReads += 1;
        yield trades[0] as TradePreview;
      },
    });

    const report = buildSymbolBreakdownReport(snapshot(trades));

    expect(iteratorReads).toBe(0);
    expect(report.metadata.totalTradeCount).toBe(2);
    expect(report.groups.map((group) => group.symbol)).toEqual(["AAPL", "MSFT"]);
  });

  it("rejects an array-like cohort without invoking its length accessor", () => {
    let reads = 0;
    const arrayLike = {
      0: cloneTrade(demoTrade("AAPL"), "array-like"),
      get length(): number {
        reads += 1;
        return 1;
      },
    } as unknown as readonly TradePreview[];

    expect(() => buildSymbolBreakdownReport({
      ...DEMO_WORKSPACE,
      trades: arrayLike,
    })).toThrow(/dense indexed data cohort/u);
    expect(reads).toBe(0);
  });

  it("rejects an accessor-backed indexed slot without invoking it", () => {
    const trade = cloneTrade(demoTrade("AAPL"), "accessor-slot");
    const trades = [trade];
    let reads = 0;
    Object.defineProperty(trades, "0", {
      configurable: true,
      enumerable: true,
      get(): TradePreview {
        reads += 1;
        return trade;
      },
    });

    expect(() => buildSymbolBreakdownReport(snapshot(trades)))
      .toThrow(/dense indexed data cohort/u);
    expect(reads).toBe(0);
  });

  it("rejects an inherited value in a sparse indexed cohort", () => {
    const trades = new Array<TradePreview>(2);
    trades[0] = cloneTrade(demoTrade("AAPL"), "dense-first");
    const inherited = Object.create(Array.prototype) as TradePreview[];
    inherited[1] = cloneTrade(demoTrade("MSFT"), "inherited-second");
    Object.setPrototypeOf(trades, inherited);

    expect(() => buildSymbolBreakdownReport(snapshot(trades)))
      .toThrow(/dense indexed data cohort/u);
  });

  it("rejects a trade accessor before it can replace a later reference", () => {
    const first = cloneTrade(demoTrade("AAPL"), "reference-first");
    const originalSecond = cloneTrade(demoTrade("MSFT"), "reference-original");
    const replacementSecond = cloneTrade(demoTrade("AMD"), "reference-replacement");
    const trades = [first, originalSecond];
    let symbolReads = 0;
    Object.defineProperty(first, "symbol", {
      configurable: true,
      enumerable: true,
      get(): string {
        symbolReads += 1;
        trades[1] = replacementSecond;
        return "AAPL";
      },
    });

    expect(() => buildSymbolBreakdownReport(snapshot(trades)))
      .toThrow(/own data properties/u);
    expect(symbolReads).toBe(0);
    expect(trades[1]).toBe(originalSecond);
  });

  it("rejects an accessor-backed stable identity without invoking it", () => {
    const trade = cloneTrade(demoTrade("AAPL"), "accessor-identity");
    let reads = 0;
    Object.defineProperty(trade, "tradeSubjectId", {
      configurable: true,
      enumerable: true,
      get(): string {
        reads += 1;
        return "accessor-subject";
      },
    });

    expect(() => buildSymbolBreakdownReport(snapshot([trade])))
      .toThrow(/own data properties/u);
    expect(reads).toBe(0);
  });

  it("returns detached deeply frozen output and an empty dynamic cohort", () => {
    const mutable = { ...cloneTrade(demoTrade("AAPL"), "mutable") };
    const trades = [mutable];
    const report = buildSymbolBreakdownReport(snapshot(trades));
    const originalEvidence = report.groups[0]?.evidence[0];

    mutable.symbol = "CHANGED";
    mutable.accountLabel = "Changed account";
    trades.push(cloneTrade(demoTrade("MSFT"), "late"));
    expect(report.metadata).toMatchObject({
      totalTradeCount: 1,
      totalGroupCount: 1,
    });
    expect(originalEvidence).toMatchObject({
      symbol: "AAPL",
      accountLabel: demoTrade("AAPL").accountLabel,
    });
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

    const empty = buildSymbolBreakdownReport(snapshot([]));
    expect(empty.metadata).toMatchObject({
      totalTradeCount: 0,
      totalGroupCount: 0,
    });
    expect(empty.groups).toEqual([]);
    expect(Object.isFrozen(empty.groups)).toBe(true);
  });
});
