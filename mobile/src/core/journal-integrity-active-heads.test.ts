/**
 * Active-head integrity follow-up (post PR #14).
 *
 * Proves void/rollback and partial-close receipt removal reproject active heads
 * so governed reports never republish voided subjects or closed-round-trip P&L
 * after the closing legs are voided.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SessionJournalStore } from "../adapters/session-journal-store";
import { prepareCsvImport } from "../application/prepare-csv-import";
import { workspaceSnapshotFromLedger } from "../application/workspace-snapshot";
import type { JournalLedgerSnapshot } from "../application/journal-store";
import type { LedgerExecution } from "./ledger";
import { buildSetupPerformanceReport } from "./setup-performance-report";
import { buildSymbolBreakdownReport } from "./symbol-breakdown-report";
import {
  assertActiveHeadProjectionIntegrity,
  assertPublishedReportsExcludeVoided,
  assertReportCohortTraceable,
  TradeInvariantError,
} from "./trade-invariants";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../fixtures/journal-integrity",
);

function fixture(name: string): string {
  return readFileSync(join(FIXTURE_DIR, name), "utf8");
}

function prepareFixture(
  name: string,
  sourceName = name,
) {
  return prepareCsvImport({
    rawInput: fixture(name),
    sourceName,
    accountName: "Active-head account",
    timeZone: "America/New_York",
    defaultCurrency: "USD",
  });
}

function ledgerExecutions(snapshot: JournalLedgerSnapshot): LedgerExecution[] {
  return snapshot.executions.map((execution) => ({
    id: execution.id,
    accountId: execution.accountId,
    instrumentId: execution.instrumentId,
    occurredAtUs: execution.occurredAtUs,
    ledgerSequence: execution.ledgerSequence,
    side: execution.side,
    positionEffect: execution.positionEffect,
    quantity: execution.quantity,
    price: execution.price,
    quoteCurrency: execution.quoteCurrency,
    multiplier: execution.multiplier,
    fees: execution.fees,
  }));
}

function publishedSubjectIds(snapshot: JournalLedgerSnapshot): string[] {
  const workspace = workspaceSnapshotFromLedger(snapshot);
  const symbolReport = buildSymbolBreakdownReport(workspace);
  return symbolReport.groups.flatMap((group) => [...group.tradeSubjectIds]);
}

describe("active-head void/rollback report exclusion", () => {
  it("removes voided subjects from governed reports and headline performance", async () => {
    const prepared = prepareFixture("equities-partial-fees.csv");
    const store = new SessionJournalStore({ nowMs: () => 1_800_000_001_000 });
    const committed = await store.commitCsvImport(prepared);
    expect(committed.outcome).toBe("committed");
    if (committed.outcome !== "committed") throw new Error("expected commit");

    const beforeProjection = assertActiveHeadProjectionIntegrity(
      ledgerExecutions(committed.ledger),
    );
    expect(beforeProjection.trades).toHaveLength(2);

    const beforeWorkspace = workspaceSnapshotFromLedger(committed.ledger);
    const beforeSubjects = beforeWorkspace.trades.map((trade) => trade.tradeSubjectId);
    expect(beforeSubjects).toHaveLength(2);
    const beforeSymbol = buildSymbolBreakdownReport(beforeWorkspace);
    assertReportCohortTraceable(beforeSubjects, beforeSymbol.groups.flatMap((g) => [...g.tradeSubjectIds]));
    expect(beforeSymbol.metadata.totalTradeCount).toBe(2);
    expect(beforeWorkspace.performance.netPnl).not.toBe(0);
    expect(beforeWorkspace.performance.tradeCount).toBe(2);

    const afterRollback = await store.rollbackImport(
      committed.receipt.id,
      "Void receipt so reports cannot publish inactive heads",
    );
    expect(afterRollback.executions).toHaveLength(0);
    const afterProjection = assertActiveHeadProjectionIntegrity(
      ledgerExecutions(afterRollback),
    );
    expect(afterProjection.trades).toHaveLength(0);
    expect(afterProjection.moneyTotals).toEqual([]);

    const afterWorkspace = workspaceSnapshotFromLedger(afterRollback);
    const afterSubjects = afterWorkspace.trades.map((trade) => trade.tradeSubjectId);
    expect(afterSubjects).toEqual([]);
    const afterSymbol = buildSymbolBreakdownReport(afterWorkspace);
    expect(afterSymbol.metadata.totalTradeCount).toBe(0);
    expect(afterSymbol.groups).toHaveLength(0);
    assertPublishedReportsExcludeVoided(afterSubjects, publishedSubjectIds(afterRollback), beforeSubjects);

    expect(afterWorkspace.performance).toMatchObject({
      netPnl: 0,
      tradeCount: 0,
      netR: null,
    });

    const afterSetup = buildSetupPerformanceReport(afterWorkspace);
    expect(afterSetup.metadata.totalTradeCount).toBe(0);
    expect(afterSetup.metadata.includedTradeCount).toBe(0);
    // Closed-only setup report has empty included cohort after void.
    expect(afterSetup.groups).toHaveLength(0);
  });

  it("rolling back a later close receipt reopens the partial without double-count", async () => {
    const store = new SessionJournalStore({ nowMs: () => 1_800_000_002_000 });
    const openPrepared = prepareFixture("open-partial-remaining.csv", "open-partial.csv");
    const openCommit = await store.commitCsvImport(openPrepared);
    expect(openCommit.outcome).toBe("committed");
    if (openCommit.outcome !== "committed") throw new Error("expected open commit");

    const openProjection = assertActiveHeadProjectionIntegrity(
      ledgerExecutions(openCommit.ledger),
    );
    expect(openProjection.trades).toHaveLength(1);
    expect(openProjection.trades[0]).toMatchObject({
      status: "OPEN",
      enteredQuantity: "10",
      exitedQuantity: "4",
      remainingQuantity: "6",
    });
    // Gross 4*(110-100)=40; fees 1.00+0.40=1.40 → net 38.60
    expect(openProjection.trades[0]?.moneyTotals[0]).toMatchObject({
      grossPnl: "40",
      feeCost: "1.4",
      netPnl: "38.6",
    });

    const openWorkspace = workspaceSnapshotFromLedger(openCommit.ledger);
    expect(openWorkspace.trades).toHaveLength(1);
    expect(openWorkspace.trades[0]).toMatchObject({
      status: "open",
      resultPnlExact: "38.6",
    });
    const openSetup = buildSetupPerformanceReport(openWorkspace);
    // Open/partial must not enter closed setup cohorts.
    expect(openSetup.groups).toHaveLength(0);
    expect(openSetup.metadata.exclusions.openOrPartial).toBeGreaterThanOrEqual(1);

    const openSubjects = openWorkspace.trades.map((trade) => trade.tradeSubjectId);
    const openSymbol = buildSymbolBreakdownReport(openWorkspace);
    expect(openSymbol.metadata.totalTradeCount).toBe(1);
    assertReportCohortTraceable(openSubjects, openSymbol.groups.flatMap((g) => [...g.tradeSubjectIds]));

    const closePrepared = prepareFixture("close-partial-remaining.csv", "close-partial.csv");
    const closeCommit = await store.commitCsvImport(closePrepared);
    expect(closeCommit.outcome).toBe("committed");
    if (closeCommit.outcome !== "committed") throw new Error("expected close commit");

    const closedProjection = assertActiveHeadProjectionIntegrity(
      ledgerExecutions(closeCommit.ledger),
    );
    expect(closedProjection.trades).toHaveLength(1);
    expect(closedProjection.trades[0]).toMatchObject({
      status: "CLOSED",
      enteredQuantity: "10",
      exitedQuantity: "10",
      remainingQuantity: "0",
    });
    // Gross 40 + 6*(108.50-100)=40+51=91; fees 1+0.4+0.6=2 → net 89
    expect(closedProjection.moneyTotals[0]?.netPnl).toBe("89");

    const closedWorkspace = workspaceSnapshotFromLedger(closeCommit.ledger);
    const closedSubjects = closedWorkspace.trades.map((trade) => trade.tradeSubjectId);
    expect(closedWorkspace.trades[0]?.status).toBe("closed");
    expect(closedWorkspace.performance.tradeCount).toBe(1);
    expect(closedWorkspace.performance.netPnl).toBe(89);

    // Void only the closing receipt — opening legs remain active heads.
    const afterCloseRollback = await store.rollbackImport(
      closeCommit.receipt.id,
      "Remove close fill; keep open partial active head",
    );
    expect(afterCloseRollback.executions).toHaveLength(2);
    const reopened = assertActiveHeadProjectionIntegrity(
      ledgerExecutions(afterCloseRollback),
    );
    expect(reopened.trades).toHaveLength(1);
    expect(reopened.trades[0]).toMatchObject({
      status: "OPEN",
      enteredQuantity: "10",
      exitedQuantity: "4",
      remainingQuantity: "6",
    });
    expect(reopened.moneyTotals[0]?.netPnl).toBe("38.6");

    const reopenedWorkspace = workspaceSnapshotFromLedger(afterCloseRollback);
    expect(reopenedWorkspace.trades).toHaveLength(1);
    expect(reopenedWorkspace.trades[0]).toMatchObject({
      status: "open",
      resultPnlExact: "38.6",
    });
    // Must not keep the closed-round-trip net 89 after close void.
    expect(reopenedWorkspace.performance.netPnl).toBe(38.6);
    expect(reopenedWorkspace.performance.tradeCount).toBe(1);

    const reopenedSubjects = reopenedWorkspace.trades.map((trade) => trade.tradeSubjectId);
    const reopenedPublished = publishedSubjectIds(afterCloseRollback);
    assertPublishedReportsExcludeVoided(
      reopenedSubjects,
      reopenedPublished,
      // Subjects that only existed while fully closed and are no longer active.
      closedSubjects.filter((id) => !reopenedSubjects.includes(id)),
    );
    assertReportCohortTraceable(reopenedSubjects, reopenedPublished);

    const reopenedSetup = buildSetupPerformanceReport(reopenedWorkspace);
    expect(reopenedSetup.groups).toHaveLength(0);
    expect(reopenedSetup.metadata.exclusions.openOrPartial).toBeGreaterThanOrEqual(1);
  });

  it("two integrity runs of open-partial→close→void-close yield identical nets", async () => {
    async function runOnce() {
      const store = new SessionJournalStore({ nowMs: () => 1_800_000_003_000 });
      await store.commitCsvImport(prepareFixture("open-partial-remaining.csv", "a.csv"));
      const closed = await store.commitCsvImport(
        prepareFixture("close-partial-remaining.csv", "b.csv"),
      );
      if (closed.outcome !== "committed") throw new Error("close");
      const afterVoid = await store.rollbackImport(closed.receipt.id, "void close");
      const projection = assertActiveHeadProjectionIntegrity(ledgerExecutions(afterVoid));
      const workspace = workspaceSnapshotFromLedger(afterVoid);
      return {
        tradeCount: projection.trades.length,
        status: projection.trades[0]?.status,
        remaining: projection.trades[0]?.remainingQuantity,
        netPnl: projection.moneyTotals[0]?.netPnl ?? null,
        perfNet: workspace.performance.netPnl,
        published: publishedSubjectIds(afterVoid).length,
      };
    }
    const first = await runOnce();
    const second = await runOnce();
    expect(first).toEqual(second);
    expect(first).toEqual({
      tradeCount: 1,
      status: "OPEN",
      remaining: "6",
      netPnl: "38.6",
      perfNet: 38.6,
      published: 1,
    });
  });
});

describe("active-head pure invariant failures", () => {
  it("detects a published report that retains a voided subject", () => {
    expect(() => assertPublishedReportsExcludeVoided(
      ["active-1"],
      ["active-1", "voided-1"],
      ["voided-1"],
    )).toThrow(TradeInvariantError);
    try {
      assertPublishedReportsExcludeVoided(["active-1"], ["active-1", "voided-1"], ["voided-1"]);
    } catch (error) {
      expect((error as TradeInvariantError).code).toBe("report_includes_unknown_trade");
    }
  });
});
