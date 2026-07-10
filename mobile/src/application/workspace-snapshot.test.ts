import { describe, expect, it } from "vitest";

import type { LedgerExecution } from "../core/ledger";
import { normalizeTrades } from "../core/normalize-trades";
import type { JournalLedgerSnapshot } from "./journal-store";
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
  return {
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
    executions: [],
    // Deliberately stale in mapping tests: the adapter recomputes from facts.
    projection: normalizeTrades([]),
    imports: [],
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
        { isoDate: "2026-07-01", dayLabel: "Wed", dateLabel: "Jul 1", pnl: -1, tradeCount: 1 },
        { isoDate: "2026-07-02", dayLabel: "Thu", dateLabel: "Jul 2", pnl: 99, tradeCount: 1 },
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
      tradedOn: "2026-07-01",
      sessionLabel: "Jul 1 · 9:30 PM",
      accountLabel: "Main Brokerage",
    })]);
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
    });
    expect(snapshot.performance).toMatchObject({ netPnl: 40, tradeCount: 1 });
    expect(snapshot.equityCurve).toEqual([0, 0, 40]);
    expect(snapshot.calendar).toEqual([
      expect.objectContaining({ isoDate: "2026-07-01", pnl: 0, tradeCount: 1 }),
      expect.objectContaining({ isoDate: "2026-07-02", pnl: 40, tradeCount: 1 }),
    ]);
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
    expect(after.calendar).toEqual([
      expect.objectContaining({ isoDate: "2026-07-01", pnl: 0, tradeCount: 1 }),
      expect.objectContaining({ isoDate: "2026-07-02", pnl: 40, tradeCount: 1 }),
      expect.objectContaining({ isoDate: "2026-07-03", pnl: 90, tradeCount: 1 }),
    ]);
    expect(after.equityCurve).toEqual([0, 0, 40, 130]);
    expect(after.trades[0]).toMatchObject({ status: "closed", resultPnl: 130 });
    expect(after.performance).toMatchObject({ netPnl: 130, tradeCount: 1 });
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
  });
});
