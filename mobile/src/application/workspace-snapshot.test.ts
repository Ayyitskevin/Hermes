import { describe, expect, it } from "vitest";

import type { LedgerExecution } from "../core/ledger";
import { normalizeTrades } from "../core/normalize-trades";
import { buildPlanAdherenceReport } from "../core/plan-adherence-report";
import { buildSetupPerformanceReport } from "../core/setup-performance-report";
import type {
  JournalLedgerSnapshot,
  JournalTradeReviewRecord,
} from "./journal-store";
import {
  EMPTY_WORKSPACE,
  workspaceSnapshotFromLedger,
} from "./workspace-snapshot";

function timestampUs(iso: string): string {
  const milliseconds = Date.parse(iso);
  if (!Number.isFinite(milliseconds)) throw new Error(`Invalid test timestamp ${iso}`);
  return String(BigInt(milliseconds) * 1_000n);
}

function execution(overrides: Partial<LedgerExecution> = {}): LedgerExecution {
  return {
    id: "execution-1",
    accountId: "account-1",
    instrumentId: "instrument-1",
    occurredAtUs: timestampUs("2026-07-02T01:30:00Z"),
    side: "BUY",
    quantity: "10",
    price: "100",
    quoteCurrency: "USD",
    multiplier: "1",
    fees: [],
    ...overrides,
  };
}

function ledger(overrides: Partial<JournalLedgerSnapshot> = {}): JournalLedgerSnapshot {
  const executions = overrides.executions ?? [];
  const currentProjection = normalizeTrades(executions);
  const snapshot: JournalLedgerSnapshot = {
    workspace: {
      id: "workspace-1",
      name: "Trading Journal",
      defaultCurrency: "USD",
      timeZone: "America/New_York",
    },
    accounts: [{
      id: "account-1",
      name: "Main Brokerage",
      baseCurrency: "USD",
    }],
    instruments: [{
      id: "instrument-1",
      symbol: "AAPL",
      assetClass: "stock",
      quoteCurrency: "USD",
      multiplier: "1",
    }],
    executions,
    // Deliberately stale in mapping tests: the adapter recomputes from facts.
    projection: normalizeTrades([]),
    tradeSubjects: currentProjection.trades.map((trade) => ({
      projectionTradeId: trade.id,
      tradeSubjectId: `subject:${trade.id}`,
    })),
    tradeReviews: [],
    reviewTerms: [],
    playbooks: [],
    dailyEntries: [],
    imports: [],
    ...overrides,
  };
  return {
    ...snapshot,
    tradeSubjects: overrides.tradeSubjects ?? snapshot.tradeSubjects,
    tradeReviews: overrides.tradeReviews ?? snapshot.tradeReviews,
    reviewTerms: overrides.reviewTerms ?? snapshot.reviewTerms,
    playbooks: overrides.playbooks ?? snapshot.playbooks,
  };
}

function review(
  tradeSubjectId: string,
  overrides: Partial<JournalTradeReviewRecord> = {},
): JournalTradeReviewRecord {
  return {
    id: "review-1",
    tradeSubjectId,
    version: 1,
    state: "completed",
    revision: "a".repeat(64),
    note: "Waited for confirmation and respected the original plan.",
    setup: "Breakout",
    mistakes: ["Late scale-out"],
    emotion: "Focused",
    tags: ["A+"],
    playbookId: "playbook-1",
    playbookName: "Momentum",
    rules: [{
      ruleId: "rule-1",
      text: "Wait for confirmation",
      outcome: "followed",
    }],
    initialRisk: { amount: "40", currency: "USD" },
    plannedStop: "96",
    resultRMetricId: "result-r",
    resultRMetricVersion: 1,
    percentReturnMetricId: "percent-return",
    percentReturnMetricVersion: 1,
    recordedAtUs: timestampUs("2026-07-02T03:00:00Z"),
    completedAtUs: timestampUs("2026-07-02T03:00:00Z"),
    ...overrides,
  };
}

describe("journal workspace snapshot", () => {
  it("exports a coherent immutable empty workspace", () => {
    expect(workspaceSnapshotFromLedger(ledger({
      workspace: null,
      accounts: [],
      instruments: [],
    }))).toBe(EMPTY_WORKSPACE);
    expect(EMPTY_WORKSPACE).toMatchObject({
      provenance: "empty",
      currencyCode: "USD",
      accountLabel: "No account",
      periodLabel: "No trades yet",
      performance: { netPnl: 0, tradeCount: 0 },
      importSummary: { receiptId: null, executions: 0, accounts: 0 },
      equityCurve: [0],
      calendar: [],
      trades: [],
    });
    expect(Object.isFrozen(EMPTY_WORKSPACE)).toBe(true);
    expect(Object.isFrozen(EMPTY_WORKSPACE.equityCurve)).toBe(true);
  });

  it("recomputes trades and maps timezone-aware performance, calendar, and imports", () => {
    const snapshot = workspaceSnapshotFromLedger(ledger({
      executions: [
        execution({
          id: "entry",
          fees: [{ category: "COMMISSION", currency: "USD", costMinor: "100", minorUnit: 2 }],
        }),
        execution({
          id: "exit",
          occurredAtUs: timestampUs("2026-07-02T14:30:00Z"),
          side: "SELL",
          price: "110",
          fees: [{ category: "COMMISSION", currency: "USD", costMinor: "100", minorUnit: 2 }],
        }),
      ],
      imports: [
        {
          id: "older-import",
          accountId: "account-1",
          accountName: "Main Brokerage",
          sourceName: "older.csv",
          importedAtUs: timestampUs("2026-07-01T23:30:00Z"),
          sourceRows: 1,
          acceptedRows: 1,
          rejectedRows: 0,
          skippedRows: 0,
          warningCount: 0,
          executionCount: 1,
          rolledBackAtUs: null,
        },
        {
          id: "latest-import",
          accountId: "account-1",
          accountName: "Main Brokerage",
          sourceName: "latest.csv",
          importedAtUs: timestampUs("2026-07-03T01:00:00Z"),
          sourceRows: 3,
          acceptedRows: 2,
          rejectedRows: 1,
          skippedRows: 0,
          warningCount: 1,
          executionCount: 2,
          rolledBackAtUs: timestampUs("2026-07-03T02:00:00Z"),
        },
      ],
    }));

    expect(snapshot).toMatchObject({
      provenance: "local",
      provenanceLabel: "ON-DEVICE JOURNAL",
      currencyCode: "USD",
      accountLabel: "Main Brokerage",
      periodLabel: "Jul 1–2, 2026",
      performance: {
        netPnl: 98,
        winRatePct: 100,
        profitFactor: null,
        averageR: null,
        rTradeCount: 0,
        ruleAdherencePct: null,
        ruleReviewCount: 0,
        tradeCount: 1,
      },
      equityCurve: [0, -1, 98],
      calendar: [
        {
          isoDate: "2026-07-01",
          dayLabel: "Wed",
          dateLabel: "Jul 1",
          pnlExact: "-1",
          pnl: -1,
          tradeCount: 1,
          allocationCount: 1,
        },
        {
          isoDate: "2026-07-02",
          dayLabel: "Thu",
          dateLabel: "Jul 2",
          pnlExact: "99",
          pnl: 99,
          tradeCount: 1,
          allocationCount: 1,
        },
      ],
      importSummary: {
        receiptId: "latest-import",
        accountLabel: "Main Brokerage",
        sourceLabel: "latest.csv",
        importedAtLabel: "Imported Jul 2, 2026 · 9:00 PM",
        executions: 2,
        accounts: 1,
        rejectedRows: 1,
        rolledBack: true,
      },
    });
    expect(snapshot.trades).toEqual([expect.objectContaining({
      symbol: "AAPL",
      assetClass: "stock",
      side: "long",
      status: "closed",
      quantity: 10,
      averageEntry: 100,
      averageExit: 110,
      resultPnl: 98,
      resultR: null,
      percentReturn: 9.8,
      tradedOn: "2026-07-01",
      sessionLabel: "Jul 1 · 9:30 PM",
      accountLabel: "Main Brokerage",
    })]);
    expect(snapshot.trades[0]?.resultRMetric).toMatchObject({
      value: null,
      nullReason: "missing_initial_risk",
      definitionVersion: "result-r-v1",
    });
    expect(snapshot.trades[0]?.percentReturnMetric).toMatchObject({
      value: "9.8",
      numerator: { amount: "98", currency: "USD" },
      denominator: { amount: "1000", currency: "USD" },
      definitionVersion: "percent-return-v1",
    });
    expect(snapshot.importHistory.map((receipt) => receipt.receiptId))
      .toEqual(["latest-import", "older-import"]);
    expect(snapshot.dailyJournal).toEqual([]);
    expect(snapshot.playbooks).toEqual([]);
  });

  it("reports partial realized P&L while keeping the remaining position open", () => {
    const snapshot = workspaceSnapshotFromLedger(ledger({
      executions: [
        execution({ id: "entry" }),
        execution({
          id: "partial-exit",
          occurredAtUs: timestampUs("2026-07-02T14:30:00Z"),
          side: "SELL",
          quantity: "4",
          price: "110",
        }),
      ],
    }));

    expect(snapshot.trades[0]).toMatchObject({
      status: "open",
      quantity: 10,
      averageEntry: 100,
      averageExit: 110,
      resultPnl: 40,
      resultR: null,
      percentReturn: 4,
    });
    expect(snapshot.trades[0]?.percentReturnMetric).toMatchObject({
      value: "4",
      isPartial: true,
      denominator: { amount: "1000", currency: "USD" },
    });
    expect(snapshot.performance).toMatchObject({ netPnl: 40, tradeCount: 1 });
    expect(snapshot.equityCurve).toEqual([0, 0, 40]);
    expect(snapshot.calendar).toEqual([
      expect.objectContaining({ isoDate: "2026-07-01", pnl: 0, tradeCount: 1 }),
      expect.objectContaining({ isoDate: "2026-07-02", pnl: 40, tradeCount: 1 }),
    ]);
  });

  it("maps completed review metadata, versioned metrics, options, and session progress", () => {
    const executions = [
      execution({ id: "review-entry" }),
      execution({
        id: "review-exit",
        occurredAtUs: timestampUs("2026-07-03T14:30:00Z"),
        side: "SELL" as const,
        price: "110",
      }),
    ];
    const projection = normalizeTrades(executions);
    const projectionTradeId = projection.trades[0]?.id;
    if (projectionTradeId === undefined) throw new Error("Expected one projected trade.");
    const tradeSubjectId = `subject:${projectionTradeId}`;
    const snapshot = workspaceSnapshotFromLedger(ledger({
      executions,
      tradeReviews: [review(tradeSubjectId)],
      reviewTerms: [
        { id: "setup-1", category: "setup", name: "Breakout" },
        { id: "mistake-1", category: "mistake", name: "Late scale-out" },
        { id: "emotion-1", category: "emotion", name: "Focused" },
        { id: "tag-1", category: "tag", name: "A+" },
      ],
      playbooks: [{
        id: "playbook-1",
        name: "Momentum",
        rules: [{ id: "rule-1", playbookId: "playbook-1", text: "Wait for confirmation" }],
      }],
    }));

    expect(snapshot.trades[0]).toMatchObject({
      id: tradeSubjectId,
      tradeSubjectId,
      reviewStatus: "completed",
      reviewId: "review-1",
      reviewVersion: 1,
      setup: "Breakout",
      mistakes: ["Late scale-out"],
      emotion: "Focused",
      tags: ["A+"],
      playbook: "Momentum",
      followedPlan: true,
      initialRisk: { amount: "40", currency: "USD" },
      plannedStop: "96",
      resultPnlExact: "100",
      resultR: 2.5,
      percentReturn: 10,
    });
    expect(snapshot.trades[0]?.resultRMetric).toMatchObject({
      value: "2.5",
      numerator: { amount: "100", currency: "USD" },
      denominator: { amount: "40", currency: "USD" },
      definitionVersion: "result-r-v1",
    });
    expect(snapshot.trades[0]?.executions).toHaveLength(2);
    expect(snapshot.performance).toMatchObject({
      netR: 2.5,
      averageR: 2.5,
      rTradeCount: 1,
      ruleAdherencePct: 100,
    });
    expect(snapshot.reviewProgress).toEqual({
      pendingTrades: 0,
      draftTrades: 0,
      completedTrades: 1,
      streakSessions: 0,
      reviewedSessions: 1,
      tradingSessions: 2,
    });
    expect(snapshot.reviewOptions).toEqual({
      setups: ["Breakout"],
      mistakes: ["Late scale-out"],
      emotions: ["Focused"],
      tags: ["A+"],
      playbooks: [{ name: "Momentum", rules: ["Wait for confirmation"] }],
    });
    expect(snapshot.playbooks).toEqual([{
      name: "Momentum",
      tradeCount: 1,
      netR: 2.5,
      winRatePct: 100,
      rules: ["Wait for confirmation"],
    }]);
  });

  it("tracks saved setup text separately from absent classification", () => {
    const executions = [
      execution({ id: "classification-entry" }),
      execution({
        id: "classification-exit",
        occurredAtUs: timestampUs("2026-07-03T14:30:00Z"),
        side: "SELL",
        price: "110",
      }),
    ];
    const projectionTradeId = normalizeTrades(executions).trades[0]?.id;
    if (projectionTradeId === undefined) throw new Error("Expected one projected trade.");
    const tradeSubjectId = `subject:${projectionTradeId}`;
    const savedLabel = workspaceSnapshotFromLedger(ledger({
      executions,
      tradeReviews: [review(tradeSubjectId, { setup: "Unclassified" })],
    }));
    const absentSetup = workspaceSnapshotFromLedger(ledger({
      executions,
      tradeReviews: [review(tradeSubjectId, { setup: null })],
    }));
    const absentReview = workspaceSnapshotFromLedger(ledger({ executions }));

    expect(savedLabel.trades[0]).toMatchObject({
      setup: "Unclassified",
      hasClassifiedSetup: true,
    });
    expect(absentSetup.trades[0]).toMatchObject({
      setup: "Unclassified",
      hasClassifiedSetup: false,
    });
    expect(absentReview.trades[0]).toMatchObject({
      setup: "Unclassified",
      hasClassifiedSetup: false,
      reviewStatus: "pending",
    });
  });

  it("moves only the current review head between plan-adherence evidence groups", () => {
    const executions = [
      execution({ id: "report-entry" }),
      execution({
        id: "report-exit",
        occurredAtUs: timestampUs("2026-07-03T14:30:00Z"),
        side: "SELL",
        price: "110",
      }),
    ];
    const projectionTradeId = normalizeTrades(executions).trades[0]?.id;
    if (projectionTradeId === undefined) throw new Error("Expected one projected trade.");
    const tradeSubjectId = `subject:${projectionTradeId}`;
    const followedHead = review(tradeSubjectId, {
      recordedAtUs: timestampUs("2026-07-03T15:00:00Z"),
      completedAtUs: timestampUs("2026-07-03T15:00:00Z"),
    });
    const brokenHead = review(tradeSubjectId, {
      id: "review-2",
      version: 2,
      revision: "b".repeat(64),
      rules: [{
        ruleId: "rule-1",
        text: "Wait for confirmation",
        outcome: "broken",
      }],
      recordedAtUs: timestampUs("2026-07-03T16:00:00Z"),
      completedAtUs: timestampUs("2026-07-03T16:00:00Z"),
    });

    const followedSnapshot = workspaceSnapshotFromLedger(ledger({
      executions,
      tradeReviews: [followedHead],
    }));
    const brokenSnapshot = workspaceSnapshotFromLedger(ledger({
      executions,
      tradeReviews: [brokenHead],
    }));
    const followedReport = buildPlanAdherenceReport(followedSnapshot);
    const brokenReport = buildPlanAdherenceReport(brokenSnapshot);

    expect(brokenSnapshot.trades[0]?.executions)
      .toEqual(followedSnapshot.trades[0]?.executions);
    expect(followedReport.groups.map((group) => group.tradeSubjectIds))
      .toEqual([[tradeSubjectId], []]);
    expect(brokenReport.groups.map((group) => group.tradeSubjectIds))
      .toEqual([[], [tradeSubjectId]]);
    expect(brokenSnapshot.trades[0]).toMatchObject({
      reviewId: "review-2",
      reviewVersion: 2,
      followedPlan: false,
    });
  });

  it("requires a later review before a future execution session is credited", () => {
    const entry = execution({ id: "temporal-entry" });
    const initialProjection = normalizeTrades([entry]);
    const projectionTradeId = initialProjection.trades[0]?.id;
    if (projectionTradeId === undefined) throw new Error("Expected one projected trade.");
    const tradeSubjectId = "subject:" + projectionTradeId;
    const savedBeforeExit = review(tradeSubjectId);

    const beforeExit = workspaceSnapshotFromLedger(ledger({
      executions: [entry],
      tradeReviews: [savedBeforeExit],
    }));
    expect(beforeExit.reviewProgress).toMatchObject({
      streakSessions: 1,
      reviewedSessions: 1,
      tradingSessions: 1,
    });

    const exit = execution({
      id: "temporal-exit",
      occurredAtUs: timestampUs("2026-07-03T14:30:00Z"),
      side: "SELL",
      price: "110",
    });
    const afterExit = workspaceSnapshotFromLedger(ledger({
      executions: [entry, exit],
      tradeReviews: [savedBeforeExit],
    }));
    expect(afterExit.reviewProgress).toMatchObject({
      streakSessions: 0,
      reviewedSessions: 1,
      tradingSessions: 2,
    });

    const savedAfterExit = review(tradeSubjectId, {
      id: "review-2",
      version: 2,
      revision: "b".repeat(64),
      recordedAtUs: timestampUs("2026-07-03T15:00:00Z"),
      completedAtUs: timestampUs("2026-07-03T15:00:00Z"),
    });
    const afterReview = workspaceSnapshotFromLedger(ledger({
      executions: [entry, exit],
      tradeReviews: [savedAfterExit],
    }));
    expect(afterReview.reviewProgress).toMatchObject({
      streakSessions: 2,
      reviewedSessions: 2,
      tradingSessions: 2,
    });
  });

  it("credits a session when at least one trade from that execution date has a saved review", () => {
    const executions = [
      execution({ id: "first-entry", quantity: "1" }),
      execution({
        id: "first-exit",
        occurredAtUs: timestampUs("2026-07-02T02:00:00Z"),
        side: "SELL" as const,
        quantity: "1",
        price: "101",
      }),
      execution({
        id: "second-entry",
        occurredAtUs: timestampUs("2026-07-02T02:15:00Z"),
        quantity: "1",
        price: "102",
      }),
      execution({
        id: "second-exit",
        occurredAtUs: timestampUs("2026-07-02T02:30:00Z"),
        side: "SELL" as const,
        quantity: "1",
        price: "103",
      }),
    ];
    const projection = normalizeTrades(executions);
    const [firstTrade, secondTrade] = projection.trades;
    if (firstTrade === undefined || secondTrade === undefined) {
      throw new Error("Expected two projected trades in one local review session.");
    }
    const firstSubject = `subject:${firstTrade.id}`;
    const snapshot = workspaceSnapshotFromLedger(ledger({
      executions,
      tradeReviews: [review(firstSubject)],
    }));

    expect(snapshot.reviewProgress).toEqual({
      pendingTrades: 1,
      draftTrades: 0,
      completedTrades: 1,
      streakSessions: 1,
      reviewedSessions: 1,
      tradingSessions: 1,
    });
  });

  it("keeps earlier realized days stable when a later partial exit arrives", () => {
    const firstExecutions = [
      execution({ id: "entry" }),
      execution({
        id: "first-exit",
        occurredAtUs: timestampUs("2026-07-02T14:30:00Z"),
        side: "SELL" as const,
        quantity: "4",
        price: "110",
      }),
    ];
    const before = workspaceSnapshotFromLedger(ledger({ executions: firstExecutions }));
    const after = workspaceSnapshotFromLedger(ledger({
      executions: [
        ...firstExecutions,
        execution({
          id: "final-exit",
          occurredAtUs: timestampUs("2026-07-03T14:30:00Z"),
          side: "SELL",
          quantity: "6",
          price: "115",
        }),
      ],
    }));

    expect(before.calendar.find((day) => day.isoDate === "2026-07-02")?.pnl).toBe(40);
    expect(before.calendar.find((day) => day.isoDate === "2026-07-02")?.contributions).toEqual([{
      tradeSubjectId: before.trades[0]?.tradeSubjectId,
      pnlExact: "40",
      pnl: 40,
      allocationCount: 1,
    }]);
    expect(after.calendar).toEqual([
      expect.objectContaining({ isoDate: "2026-07-01", pnl: 0, tradeCount: 1 }),
      expect.objectContaining({ isoDate: "2026-07-02", pnl: 40, tradeCount: 1 }),
      expect.objectContaining({ isoDate: "2026-07-03", pnl: 90, tradeCount: 1 }),
    ]);
    expect(after.calendar.map((day) => day.pnlExact)).toEqual(["0", "40", "90"]);
    expect(after.calendar.every((day) => day.allocationCount === 1)).toBe(true);
    expect(after.calendar.flatMap((day) => day.contributions).every((contribution) => (
      contribution.tradeSubjectId === after.trades[0]?.tradeSubjectId
    ))).toBe(true);
    expect(after.equityCurve).toEqual([0, 0, 40, 130]);
    expect(after.trades[0]).toMatchObject({ status: "closed", resultPnl: 130 });
    expect(after.performance).toMatchObject({ netPnl: 130, tradeCount: 1 });
  });

  it("maps one reversal fill into two exact calendar contributors without losing fees", () => {
    const snapshot = workspaceSnapshotFromLedger(ledger({
      executions: [
        execution({
          id: "reversal-entry",
          occurredAtUs: timestampUs("2026-07-01T14:30:00Z"),
          quantity: "10",
          price: "100",
        }),
        execution({
          id: "reversal-fill",
          occurredAtUs: timestampUs("2026-07-02T14:30:00Z"),
          side: "SELL",
          quantity: "15",
          price: "90",
          fees: [{ category: "COMMISSION", currency: "USD", costMinor: "5", minorUnit: 2 }],
        }),
      ],
    }));
    const long = snapshot.trades.find((trade) => trade.side === "long");
    const short = snapshot.trades.find((trade) => trade.side === "short");
    const reversalDay = snapshot.calendar.find((day) => day.isoDate === "2026-07-02");
    if (long === undefined || short === undefined || reversalDay === undefined) {
      throw new Error("Expected both reversal trades and their allocation day.");
    }

    expect(long).toMatchObject({ status: "closed", resultPnlExact: "-100.03" });
    expect(short).toMatchObject({ status: "open", resultPnlExact: null });
    expect(reversalDay).toMatchObject({
      pnlExact: "-100.05",
      pnl: -100.05,
      tradeCount: 2,
      allocationCount: 2,
    });
    const contributionBySubject = new Map(
      reversalDay.contributions.map((contribution) => [contribution.tradeSubjectId, contribution]),
    );
    expect(contributionBySubject.get(long.tradeSubjectId)).toMatchObject({
      pnlExact: "-100.03",
      allocationCount: 1,
    });
    expect(contributionBySubject.get(short.tradeSubjectId)).toMatchObject({
      pnlExact: "-0.02",
      allocationCount: 1,
    });
    expect(reversalDay.contributions.map((contribution) => contribution.tradeSubjectId)).toEqual(
      [long.tradeSubjectId, short.tradeSubjectId].sort((left, right) => (
        left < right ? -1 : left > right ? 1 : 0
      )),
    );
    expect(snapshot.calendar.map((day) => day.pnlExact)).toEqual(["0", "-100.05"]);
    expect(snapshot.performance.netPnl).toBe(-100.05);
  });

  it("aggregates realized decimals exactly before converting display values", () => {
    const snapshot = workspaceSnapshotFromLedger(ledger({
      executions: [
        execution({ id: "entry-1", quantity: "1", price: "9007199254740992.1" }),
        execution({
          id: "exit-1",
          occurredAtUs: timestampUs("2026-07-02T02:30:00Z"),
          side: "SELL",
          quantity: "1",
          price: "9007199254740992.2",
        }),
        execution({
          id: "entry-2",
          occurredAtUs: timestampUs("2026-07-02T03:30:00Z"),
          quantity: "1",
          price: "9007199254740992.1",
        }),
        execution({
          id: "exit-2",
          occurredAtUs: timestampUs("2026-07-02T04:30:00Z"),
          side: "SELL",
          quantity: "1",
          price: "9007199254740992.3",
        }),
      ],
    }));

    expect(snapshot.trades.map((trade) => trade.resultPnl)).toEqual([0.1, 0.2]);
    expect(snapshot.performance.netPnl).toBe(0.3);
    expect(snapshot.equityCurve.at(-1)).toBe(0.3);
    expect(snapshot.calendar.map((day) => day.pnlExact)).toEqual(["0.1", "0.2"]);
    expect(snapshot.calendar.map((day) => day.allocationCount)).toEqual([3, 1]);
    expect(snapshot.calendar.map((day) => day.tradeCount)).toEqual([2, 1]);
    for (const day of snapshot.calendar) {
      expect(day.contributions.map((contribution) => contribution.tradeSubjectId)).toEqual(
        day.contributions
          .map((contribution) => contribution.tradeSubjectId)
          .sort((left, right) => left < right ? -1 : left > right ? 1 : 0),
      );
    }
    const secondTrade = snapshot.trades[1];
    expect(secondTrade).toBeDefined();
    expect(snapshot.calendar[0]?.contributions).toContainEqual({
      tradeSubjectId: secondTrade?.tradeSubjectId,
      pnlExact: "0",
      pnl: 0,
      allocationCount: 1,
    });
  });

  it("keeps independent accounts separate in labels and projections", () => {
    const snapshot = workspaceSnapshotFromLedger(ledger({
      accounts: [
        { id: "account-1", name: "Primary", baseCurrency: "USD" },
        { id: "account-2", name: "Secondary", baseCurrency: "USD" },
      ],
      executions: [
        execution({ id: "primary", accountId: "account-1" }),
        execution({ id: "secondary", accountId: "account-2", occurredAtUs: timestampUs("2026-07-02T02:00:00Z") }),
      ],
    }));

    expect(snapshot.accountLabel).toBe("2 accounts");
    expect(snapshot.trades.map((candidate) => candidate.accountLabel)).toEqual(["Primary", "Secondary"]);
    expect(snapshot.calendar).toEqual([expect.objectContaining({
      pnlExact: "0",
      tradeCount: 2,
      allocationCount: 2,
    })]);
    expect(snapshot.calendar[0]?.contributions.map((contribution) => contribution.tradeSubjectId)).toEqual(
      snapshot.trades.map((trade) => trade.tradeSubjectId).sort((left, right) => (
        left < right ? -1 : left > right ? 1 : 0
      )),
    );
  });

  it("keeps each receipt attributed to its own account after rollback", () => {
    const snapshot = workspaceSnapshotFromLedger(ledger({
      accounts: [
        { id: "account-1", name: "Account Alpha", baseCurrency: "USD" },
        { id: "account-2", name: "Account Beta", baseCurrency: "USD" },
      ],
      executions: [execution({ id: "alpha-entry", accountId: "account-1" })],
      imports: [{
        id: "beta-import",
        accountId: "account-2",
        accountName: "Account Beta",
        sourceName: "beta.csv",
        importedAtUs: timestampUs("2026-07-03T01:00:00Z"),
        sourceRows: 1,
        acceptedRows: 1,
        rejectedRows: 0,
        skippedRows: 0,
        warningCount: 0,
        executionCount: 1,
        rolledBackAtUs: timestampUs("2026-07-03T02:00:00Z"),
      }],
    }));

    expect(snapshot.accountLabel).toBe("Account Alpha");
    expect(snapshot.importSummary.accountLabel).toBe("Account Beta");
    expect(snapshot.importHistory[0]).toMatchObject({
      sourceLabel: "beta.csv",
      accountLabel: "Account Beta",
      rolledBack: true,
    });
  });

  it("maps one current daily-entry head per date in newest-first order", () => {
    const dailyEntries = [{
      id: "daily-new",
      isoDate: "2026-07-13",
      version: 2,
      state: "completed" as const,
      revision: "a".repeat(64),
      title: "Protected the process",
      note: "Stayed patient.",
      emotion: "Focused",
      processScorePct: 91,
      tags: ["Patient"],
      recordedAtUs: timestampUs("2026-07-13T15:00:00Z"),
      completedAtUs: timestampUs("2026-07-13T15:00:00Z"),
    }, {
      id: "daily-old",
      isoDate: "2026-07-12",
      version: 1,
      state: "draft" as const,
      revision: "b".repeat(64),
      title: null,
      note: "No-trade reset day.",
      emotion: null,
      processScorePct: null,
      tags: [],
      recordedAtUs: timestampUs("2026-07-12T15:00:00Z"),
      completedAtUs: null,
    }];
    const snapshot = workspaceSnapshotFromLedger(ledger({ dailyEntries }));
    expect(snapshot.dailyJournal).toEqual([
      expect.objectContaining({
        isoDate: "2026-07-13",
        dateLabel: "Jul 13",
        entryVersionId: "daily-new",
        version: 2,
        state: "completed",
        processScorePct: 91,
      }),
      expect.objectContaining({
        isoDate: "2026-07-12",
        dateLabel: "Jul 12",
        state: "draft",
      }),
    ]);
    const rescored = workspaceSnapshotFromLedger(ledger({
      dailyEntries: dailyEntries.map((entry, index) => (
        index === 0 ? { ...entry, processScorePct: 7 } : entry
      )),
    }));
    const { dailyJournal: _dailyJournal, ...snapshotWithoutDailyJournal } = snapshot;
    const { dailyJournal: _rescoredDailyJournal, ...rescoredWithoutDailyJournal } = rescored;
    expect(rescoredWithoutDailyJournal).toEqual(snapshotWithoutDailyJournal);
    expect(buildPlanAdherenceReport(rescored)).toEqual(buildPlanAdherenceReport(snapshot));
    expect(buildSetupPerformanceReport(rescored)).toEqual(buildSetupPerformanceReport(snapshot));
    expect(() => workspaceSnapshotFromLedger(ledger({
      dailyEntries: [...dailyEntries, { ...dailyEntries[0]!, id: "duplicate-head" }],
    }))).toThrow(/more than one head/);
  });

  it("rejects every active path that would require implicit FX", () => {
    expect(() => workspaceSnapshotFromLedger(ledger({
      executions: [execution({
        fees: [{ category: "COMMISSION", currency: "EUR", costMinor: "1", minorUnit: 2 }],
      })],
    }))).toThrow(/fee requires FX from EUR/);

    expect(() => workspaceSnapshotFromLedger(ledger({
      instruments: [{
        id: "instrument-1",
        symbol: "SAP",
        assetClass: "stock",
        quoteCurrency: "EUR",
        multiplier: "1",
      }],
      executions: [execution({ quoteCurrency: "EUR" })],
    }))).toThrow(/requires FX from EUR/);
  });

  it("fails loudly for missing lookups and unsupported preview asset classes", () => {
    expect(() => workspaceSnapshotFromLedger(ledger({
      executions: [execution({ accountId: "missing" })],
    }))).toThrow(/missing account missing/);
    expect(() => workspaceSnapshotFromLedger(ledger({
      executions: [execution({ instrumentId: "missing" })],
    }))).toThrow(/missing instrument missing/);
    expect(() => workspaceSnapshotFromLedger(ledger({
      instruments: [{
        id: "instrument-1",
        symbol: "ES",
        assetClass: "future",
        quoteCurrency: "USD",
        multiplier: "1",
      }],
      executions: [execution()],
    }))).toThrow(/asset class future cannot be represented/);
  });

  it("rejects invalid workspace dates and orphaned facts", () => {
    expect(() => workspaceSnapshotFromLedger(ledger({
      workspace: {
        id: "workspace-1",
        name: "Journal",
        defaultCurrency: "USD",
        timeZone: "Mars/Olympus_Mons",
      },
    }))).toThrow(/unsupported time zone/);
    expect(() => workspaceSnapshotFromLedger(ledger({
      workspace: null,
      executions: [execution()],
    }))).toThrow(/facts exist without a workspace/);
    expect(() => workspaceSnapshotFromLedger(ledger({
      workspace: null,
      accounts: [],
      instruments: [],
      reviewTerms: [{
        id: "orphan-term",
        category: "tag",
        name: "Orphaned",
      }],
    }))).toThrow(/facts exist without a workspace/);
  });
});
