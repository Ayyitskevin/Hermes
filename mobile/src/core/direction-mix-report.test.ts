import { describe, expect, it } from "vitest";

import { sha256Hex } from "../adapters/sqlite/schema/checksum";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  DIRECTION_MIX_REPORT_DEFINITION,
  DIRECTION_MIX_REPORT_DEFINITION_CANONICAL_JSON,
  DIRECTION_MIX_REPORT_DEFINITION_SHA256,
  DIRECTION_MIX_REPORT_VERSION,
  buildDirectionMixReport,
} from "./direction-mix-report";
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

describe("direction-mix report v1", () => {
  it("pins the independently replayable deeply immutable definition", () => {
    expect(DIRECTION_MIX_REPORT_DEFINITION_CANONICAL_JSON).toBe(
      JSON.stringify(DIRECTION_MIX_REPORT_DEFINITION),
    );
    expect(sha256Hex(DIRECTION_MIX_REPORT_DEFINITION_CANONICAL_JSON)).toBe(
      DIRECTION_MIX_REPORT_DEFINITION_SHA256,
    );
    expect(DIRECTION_MIX_REPORT_DEFINITION).toMatchObject({
      version: DIRECTION_MIX_REPORT_VERSION,
      inputs: {
        projection: "current-full-workspace-projection",
        direction: "trade.side",
        evidenceFields: [
          "tradeSubjectId",
          "accountLabel",
          "symbol",
          "side",
          "tradedOn",
          "sessionLabel",
          "status",
          "reviewStatus",
        ],
        tradeBrowserScope: "not-consumed",
        reviewAuthoredContent: "not-consumed;reviewStatus-is-evidence-only",
        resultFields: "not-consumed",
      },
      cohort: {
        inclusion: "every-current-projection-trade-exactly-once",
        exclusions: "none",
        conservation: "sum(group.tradeCount)=totalTradeCount",
      },
      directionValidation: {
        allowed: ["long", "short"],
        invalidInput: "throw;never-repair-drop-or-default",
      },
      evidenceValidation: {
        positionStatusAllowed: ["open", "closed"],
        reviewStatusAllowed: ["pending", "draft", "completed"],
        invalidInput: "throw;never-repair-drop-or-default",
      },
      groupOrder: "fixed:long-then-short",
      counting: {
        assignmentCardinality: "one-direction-group-per-current-trade",
        rates: "not-calculated",
      },
      migration: {
        decision: "derived-only-recompute",
        archiveShapeChange: false,
      },
    });
    for (const value of [
      DIRECTION_MIX_REPORT_DEFINITION,
      DIRECTION_MIX_REPORT_DEFINITION.inputs,
      DIRECTION_MIX_REPORT_DEFINITION.inputs.evidenceFields,
      DIRECTION_MIX_REPORT_DEFINITION.cohort,
      DIRECTION_MIX_REPORT_DEFINITION.directionValidation,
      DIRECTION_MIX_REPORT_DEFINITION.directionValidation.allowed,
      DIRECTION_MIX_REPORT_DEFINITION.evidenceValidation,
      DIRECTION_MIX_REPORT_DEFINITION.evidenceValidation.positionStatusAllowed,
      DIRECTION_MIX_REPORT_DEFINITION.evidenceValidation.reviewStatusAllowed,
      DIRECTION_MIX_REPORT_DEFINITION.evidenceOrder,
      DIRECTION_MIX_REPORT_DEFINITION.counting,
      DIRECTION_MIX_REPORT_DEFINITION.migration,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it("counts every demo trade once in fixed long-then-short order", () => {
    const report = buildDirectionMixReport(DEMO_WORKSPACE);

    expect(report.metadata).toEqual({
      version: DIRECTION_MIX_REPORT_VERSION,
      definitionSha256: DIRECTION_MIX_REPORT_DEFINITION_SHA256,
      timeZone: "UTC",
      accountLabel: "2 demo accounts",
      periodLabel: "Jul 1–9, 2026",
      totalTradeCount: 8,
    });
    expect(report.groups.map((group) => [
      group.direction,
      group.tradeCount,
      group.tradeSubjectIds,
    ])).toEqual([
      ["long", 6, [
        "demo-subject-meta",
        "demo-subject-spy",
        "demo-subject-amd",
        "demo-subject-nvda",
        "demo-subject-aapl",
        "demo-subject-msft",
      ]],
      ["short", 2, [
        "demo-subject-qqq",
        "demo-subject-tsla",
      ]],
    ]);
    expect(
      report.groups.reduce((total, group) => total + group.tradeCount, 0),
    ).toBe(report.metadata.totalTradeCount);
  });

  it("keeps position and review status evidence-only and exposes no outcomes", () => {
    const aapl = demoTrade("AAPL");
    const msft = demoTrade("MSFT");
    const trades = [
      cloneTrade(aapl, "open-pending", {
        side: "long",
        status: "open",
        reviewStatus: "pending",
        reviewId: null,
        reviewVersion: null,
        resultPnl: null,
        resultPnlExact: null,
      }),
      cloneTrade(msft, "draft-short", {
        side: "short",
        reviewStatus: "draft",
      }),
      cloneTrade(aapl, "completed-short", {
        side: "short",
        reviewStatus: "completed",
      }),
    ];
    const report = buildDirectionMixReport(snapshot(trades));

    expect(report.groups.map((group) => [group.direction, group.tradeCount]))
      .toEqual([["long", 1], ["short", 2]]);
    const evidence = report.groups.flatMap((group) => group.evidence);
    expect(evidence.map((trade) => [
      trade.tradeSubjectId,
      trade.side,
      trade.status,
      trade.reviewStatus,
    ])).toEqual([
      ["demo-subject-aapl-open-pending", "long", "open", "pending"],
      ["demo-subject-aapl-completed-short", "short", "closed", "completed"],
      ["demo-subject-msft-draft-short", "short", "closed", "draft"],
    ]);
    expect(Object.keys(evidence[0] ?? {})).toEqual([
      "tradeSubjectId",
      "accountLabel",
      "symbol",
      "side",
      "tradedOn",
      "sessionLabel",
      "status",
      "reviewStatus",
    ]);
    expect(Object.keys(report.metadata)).not.toContain("currencyCode");
  });

  it("orders equal-date evidence by stable subject ID and preserves hostile display text", () => {
    const aapl = demoTrade("AAPL");
    const report = buildDirectionMixReport(snapshot([
      cloneTrade(aapl, "z", {
        tradeSubjectId: "subject-z",
        symbol: "<AAPL & friends>",
        sessionLabel: "<late & session>",
        accountLabel: "<Broker & One>",
        tradedOn: "2026-07-12",
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

    expect(report.groups[0]?.tradeSubjectIds).toEqual([
      "subject-a",
      "subject-z",
      "subject-older",
    ]);
    expect(report.groups[0]?.evidence[1]).toMatchObject({
      symbol: "<AAPL & friends>",
      sessionLabel: "<late & session>",
      accountLabel: "<Broker & One>",
    });
  });

  it.each([
    ["blank", ""],
    ["leading whitespace", " subject"],
    ["C0 control", "subject\u0000"],
    ["C1 control", "subject\u0085"],
    ["too long", "x".repeat(257)],
  ])("rejects an invalid %s stable identity", (_label, tradeSubjectId) => {
    expect(() => buildDirectionMixReport(snapshot([
      cloneTrade(demoTrade("AAPL"), "invalid", { tradeSubjectId }),
    ]))).toThrow(/1-256 character trimmed, control-free, unique subject identities/u);
  });

  it("rejects duplicate identities and any unsupported direction", () => {
    const aapl = cloneTrade(demoTrade("AAPL"), "first", {
      tradeSubjectId: "duplicate",
    });
    const msft = cloneTrade(demoTrade("MSFT"), "second", {
      tradeSubjectId: "duplicate",
    });
    expect(() => buildDirectionMixReport(snapshot([aapl, msft])))
      .toThrow(/unique subject identities/u);
    expect(() => buildDirectionMixReport(snapshot([
      cloneTrade(demoTrade("AAPL"), "invalid-side", {
        side: "flat" as TradePreview["side"],
      }),
    ]))).toThrow(/direction must be exactly long or short/u);
  });

  it("rejects unsupported position and review status evidence", () => {
    expect(() => buildDirectionMixReport(snapshot([
      cloneTrade(demoTrade("AAPL"), "invalid-position", {
        status: "settled" as TradePreview["status"],
      }),
    ]))).toThrow(/position status must be exactly open or closed/u);
    expect(() => buildDirectionMixReport(snapshot([
      cloneTrade(demoTrade("AAPL"), "invalid-review", {
        reviewStatus: "approved" as TradePreview["reviewStatus"],
      }),
    ]))).toThrow(/review status must be exactly pending, draft, or completed/u);
  });

  it("returns detached deeply frozen output and fixed empty groups", () => {
    const mutable = { ...cloneTrade(demoTrade("AAPL"), "mutable") };
    const trades = [mutable];
    const report = buildDirectionMixReport(snapshot(trades));
    const originalEvidence = report.groups[0]?.evidence[0];

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

    const empty = buildDirectionMixReport(snapshot([]));
    expect(empty.metadata.totalTradeCount).toBe(0);
    expect(empty.groups.map((group) => [
      group.direction,
      group.tradeCount,
      group.tradeSubjectIds,
    ])).toEqual([
      ["long", 0, []],
      ["short", 0, []],
    ]);
  });
});
