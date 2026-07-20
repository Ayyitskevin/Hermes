/**
 * Active-head integrity follow-up (post PR #14) — adversarial coverage.
 *
 * Proves void/rollback and partial-close receipt removal reproject active heads
 * so governed reports, dashboard calendar/performance, and export/restore
 * projections never republish voided subjects or closed-round-trip P&L after
 * closing legs are voided.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SessionJournalStore } from "../adapters/session-journal-store";
import { prepareCsvImport, verifyPreparedCsvImport } from "../application/prepare-csv-import";
import { workspaceSnapshotFromLedger } from "../application/workspace-snapshot";
import type { JournalLedgerSnapshot } from "../application/journal-store";
import type { JournalWorkspaceSnapshot } from "./types";
import type { LedgerExecution } from "./ledger";
import { buildAccountReviewCoverageReport } from "./account-review-coverage-report";
import { buildDirectionMixReport } from "./direction-mix-report";
import { buildEmotionPatternsReport } from "./emotion-patterns-report";
import { buildMistakePatternsReport } from "./mistake-patterns-report";
import { buildOpeningWeekdayMixReport } from "./opening-weekday-mix-report";
import { buildPlanAdherenceReport } from "./plan-adherence-report";
import { buildReviewSessionCoverageReport } from "./review-session-coverage-report";
import { buildSetupPerformanceReport } from "./setup-performance-report";
import { buildSymbolBreakdownReport } from "./symbol-breakdown-report";
import { buildTagPatternsReport } from "./tag-patterns-report";
import { previewGenericCsvImport } from "./csv";
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

/** Harvest every trade subject ID published by any of the ten governed reports. */
function allGovernedReportSubjects(workspace: JournalWorkspaceSnapshot): {
  readonly subjects: readonly string[];
  readonly byReport: Readonly<Record<string, readonly string[]>>;
  readonly totalTradeCounts: Readonly<Record<string, number>>;
} {
  const symbol = buildSymbolBreakdownReport(workspace);
  const setup = buildSetupPerformanceReport(workspace);
  const direction = buildDirectionMixReport(workspace);
  const plan = buildPlanAdherenceReport(workspace);
  const emotion = buildEmotionPatternsReport(workspace);
  const mistake = buildMistakePatternsReport(workspace);
  const tag = buildTagPatternsReport(workspace);
  const weekday = buildOpeningWeekdayMixReport(workspace);
  const account = buildAccountReviewCoverageReport(workspace);
  const reviewSessions = buildReviewSessionCoverageReport(workspace);

  const byReport: Record<string, string[]> = {
    symbol: symbol.groups.flatMap((group) => [...group.tradeSubjectIds]),
    setup: setup.groups.flatMap((group) => [...group.tradeSubjectIds]),
    direction: direction.groups.flatMap((group) => [...group.tradeSubjectIds]),
    plan: plan.groups.flatMap((group) => [...group.tradeSubjectIds]),
    emotion: emotion.groups.flatMap((group) => [...group.tradeSubjectIds]),
    mistake: mistake.groups.flatMap((group) => [...group.tradeSubjectIds]),
    tag: tag.groups.flatMap((group) => [...group.tradeSubjectIds]),
    weekday: weekday.groups.flatMap((group) => [...group.tradeSubjectIds]),
    account: account.accounts.flatMap((entry) => (
      entry.groups.flatMap((group) => [...group.tradeSubjectIds])
    )),
    // Review-session coverage is session-keyed; evidence still must not invent
    // subjects outside the current workspace trade set.
    reviewSessions: workspace.trades.map((trade) => trade.tradeSubjectId),
  };

  const totalTradeCounts = {
    symbol: symbol.metadata.totalTradeCount,
    setup: setup.metadata.totalTradeCount,
    direction: direction.metadata.totalTradeCount,
    plan: plan.metadata.totalTradeCount,
    emotion: emotion.metadata.totalTradeCount,
    mistake: mistake.metadata.totalTradeCount,
    tag: tag.metadata.totalTradeCount,
    weekday: weekday.metadata.totalTradeCount,
    account: account.metadata.totalTradeCount,
    // Session-keyed report: bound by assignment/session counts, not trade total.
    reviewSessions: reviewSessions.metadata.totalAssignmentCount,
  };

  // Flatten unique published subjects (setup/plan may exclude open; still must
  // never include voided IDs).
  const subjects = [...new Set(Object.values(byReport).flat())];
  return {
    subjects,
    byReport,
    totalTradeCounts,
  };
}

function calendarSubjectIds(workspace: JournalWorkspaceSnapshot): string[] {
  return [...new Set(
    workspace.calendar.flatMap((session) => (
      session.contributions.map((contribution) => contribution.tradeSubjectId)
    )),
  )];
}

function calendarNetExact(workspace: JournalWorkspaceSnapshot): string {
  // Sum session pnlExact strings via exact decimals in the assertion path.
  return workspace.calendar.map((session) => session.pnlExact).join("|");
}

function exportActiveExecutionCount(artifact: Awaited<ReturnType<SessionJournalStore["exportUserData"]>>): number {
  const payload = artifact.archive.payload;
  if (payload.kind !== "browser-session-state") {
    throw new Error(`Unexpected export payload kind ${payload.kind}`);
  }
  const data = payload.data as {
    readonly activeExecutions?: readonly unknown[];
    readonly inactiveExecutions?: readonly unknown[];
  };
  return data.activeExecutions?.length ?? -1;
}

function exportInactiveExecutionCount(artifact: Awaited<ReturnType<SessionJournalStore["exportUserData"]>>): number {
  const payload = artifact.archive.payload;
  if (payload.kind !== "browser-session-state") {
    throw new Error(`Unexpected export payload kind ${payload.kind}`);
  }
  const data = payload.data as {
    readonly inactiveExecutions?: readonly unknown[];
  };
  return data.inactiveExecutions?.length ?? -1;
}

describe("active-head void/rollback report exclusion", () => {
  it("removes voided subjects from every governed report, calendar, and export projection", async () => {
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
    const beforePublished = allGovernedReportSubjects(beforeWorkspace);
    for (const [name, count] of Object.entries(beforePublished.totalTradeCounts)) {
      if (name === "reviewSessions") {
        // Session assignments come from execution-day coverage of current trades.
        expect(count).toBeGreaterThan(0);
        continue;
      }
      expect(count).toBe(2);
    }
    expect(beforeWorkspace.performance.netPnl).not.toBe(0);
    expect(beforeWorkspace.performance.tradeCount).toBe(2);
    expect(beforeWorkspace.calendar.length).toBeGreaterThan(0);
    expect(calendarSubjectIds(beforeWorkspace).sort()).toEqual([...beforeSubjects].sort());

    const exportBefore = await store.exportUserData();
    expect(exportActiveExecutionCount(exportBefore)).toBe(5);
    expect(exportInactiveExecutionCount(exportBefore)).toBe(0);

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
    const afterPublished = allGovernedReportSubjects(afterWorkspace);
    for (const count of Object.values(afterPublished.totalTradeCounts)) {
      expect(count).toBe(0);
    }
    expect(afterPublished.subjects).toEqual([]);
    for (const [name, subjects] of Object.entries(afterPublished.byReport)) {
      expect(subjects, `${name} subjects after void`).toEqual([]);
    }
    assertPublishedReportsExcludeVoided(
      afterSubjects,
      afterPublished.subjects,
      beforeSubjects,
    );

    expect(afterWorkspace.performance).toMatchObject({
      netPnl: 0,
      tradeCount: 0,
      netR: null,
    });
    expect(afterWorkspace.calendar).toEqual([]);
    expect(calendarSubjectIds(afterWorkspace)).toEqual([]);

    const afterSetup = buildSetupPerformanceReport(afterWorkspace);
    expect(afterSetup.metadata.includedTradeCount).toBe(0);
    expect(afterSetup.groups).toHaveLength(0);

    // Export: no active heads; voided facts may remain inactive for history.
    const exportAfter = await store.exportUserData();
    expect(exportActiveExecutionCount(exportAfter)).toBe(0);
    expect(exportInactiveExecutionCount(exportAfter)).toBe(5);

    // Restore of post-void export into empty store never resurrects active heads.
    const restoredStore = new SessionJournalStore({ nowMs: () => 1_800_000_001_100 });
    const restorePrepared = await restoredStore.prepareUserDataRestore(exportAfter.contents);
    await restoredStore.commitUserDataRestore(restorePrepared);
    const restoredLedger = await restoredStore.load();
    expect(restoredLedger.executions).toHaveLength(0);
    assertActiveHeadProjectionIntegrity(ledgerExecutions(restoredLedger));
    const restoredWorkspace = workspaceSnapshotFromLedger(restoredLedger);
    expect(restoredWorkspace.trades).toHaveLength(0);
    expect(restoredWorkspace.performance.netPnl).toBe(0);
    expect(allGovernedReportSubjects(restoredWorkspace).subjects).toEqual([]);
    expect(restoredWorkspace.calendar).toEqual([]);

    // Pre-void export still restores active heads into a fresh empty journal.
    const resurrect = new SessionJournalStore({ nowMs: () => 1_800_000_001_200 });
    const resurrectPrepared = await resurrect.prepareUserDataRestore(exportBefore.contents);
    await resurrect.commitUserDataRestore(resurrectPrepared);
    const resurrected = await resurrect.load();
    expect(resurrected.executions).toHaveLength(5);
    const resurrectedProjection = assertActiveHeadProjectionIntegrity(
      ledgerExecutions(resurrected),
    );
    expect(resurrectedProjection.trades).toHaveLength(2);
    expect(resurrectedProjection.moneyTotals[0]?.netPnl).toBe("99.45");
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
    const openPublished = allGovernedReportSubjects(openWorkspace);
    // Symbol/direction include open trades; closed-only reports exclude them.
    expect(openPublished.totalTradeCounts.symbol).toBe(1);
    expect(openPublished.totalTradeCounts.setup).toBe(1);
    expect(openSetup.metadata.includedTradeCount).toBe(0);
    assertReportCohortTraceable(openSubjects, openPublished.byReport.symbol ?? []);
    expect(calendarSubjectIds(openWorkspace).sort()).toEqual([...openSubjects].sort());
    const openCalendarFingerprint = calendarNetExact(openWorkspace);

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
    const closedCalendarFingerprint = calendarNetExact(closedWorkspace);
    expect(closedCalendarFingerprint).not.toBe(openCalendarFingerprint);

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
    // Calendar must revert to open-partial fingerprint (no close-day contribution).
    expect(calendarNetExact(reopenedWorkspace)).toBe(openCalendarFingerprint);

    const reopenedSubjects = reopenedWorkspace.trades.map((trade) => trade.tradeSubjectId);
    const reopenedPublished = allGovernedReportSubjects(reopenedWorkspace);
    assertPublishedReportsExcludeVoided(
      reopenedSubjects,
      reopenedPublished.subjects,
      closedSubjects.filter((id) => !reopenedSubjects.includes(id)),
    );
    assertReportCohortTraceable(reopenedSubjects, reopenedPublished.byReport.symbol ?? []);
    expect(reopenedPublished.totalTradeCounts.symbol).toBe(1);

    const reopenedSetup = buildSetupPerformanceReport(reopenedWorkspace);
    expect(reopenedSetup.groups).toHaveLength(0);
    expect(reopenedSetup.metadata.exclusions.openOrPartial).toBeGreaterThanOrEqual(1);
    expect(reopenedSetup.metadata.includedTradeCount).toBe(0);

    // Export after void-close: only two active open-partial executions.
    const exportReopened = await store.exportUserData();
    expect(exportActiveExecutionCount(exportReopened)).toBe(2);
    const restoreTarget = new SessionJournalStore({ nowMs: () => 1_800_000_002_500 });
    await restoreTarget.commitUserDataRestore(
      await restoreTarget.prepareUserDataRestore(exportReopened.contents),
    );
    const restored = await restoreTarget.load();
    const restoredProjection = assertActiveHeadProjectionIntegrity(ledgerExecutions(restored));
    expect(restoredProjection.trades[0]).toMatchObject({
      status: "OPEN",
      remainingQuantity: "6",
    });
    expect(restoredProjection.moneyTotals[0]?.netPnl).toBe("38.6");
    const restoredWorkspace = workspaceSnapshotFromLedger(restored);
    expect(restoredWorkspace.performance.netPnl).toBe(38.6);
    expect(allGovernedReportSubjects(restoredWorkspace).totalTradeCounts.symbol).toBe(1);
  });

  it("exact re-import after full void is idempotent and does not double-count", async () => {
    const prepared = prepareFixture("duplicate-executions.csv");
    verifyPreparedCsvImport(prepared);
    const store = new SessionJournalStore({ nowMs: () => 1_800_000_004_000 });
    const first = await store.commitCsvImport(prepared);
    expect(first.outcome).toBe("committed");
    if (first.outcome !== "committed") throw new Error("first commit");
    const beforeNet = assertActiveHeadProjectionIntegrity(
      ledgerExecutions(first.ledger),
    ).moneyTotals[0]?.netPnl;
    expect(beforeNet).toBe("49");

    // Exact same command is duplicate while receipt is active.
    const dup = await store.commitCsvImport(prepared);
    expect(dup.outcome).toBe("duplicate");
    expect(dup.ledger.executions).toHaveLength(2);

    await store.rollbackImport(first.receipt.id, "void for re-import integrity");
    const empty = await store.load();
    expect(empty.executions).toHaveLength(0);
    expect(workspaceSnapshotFromLedger(empty).performance.netPnl).toBe(0);

    // After void, same content imports once as new receipt (not stacked on inactive).
    const again = await store.commitCsvImport(prepared);
    expect(again.outcome).toBe("committed");
    if (again.outcome !== "committed") throw new Error("re-commit");
    expect(again.ledger.executions).toHaveLength(2);
    const after = assertActiveHeadProjectionIntegrity(ledgerExecutions(again.ledger));
    expect(after.trades).toHaveLength(1);
    expect(after.moneyTotals[0]?.netPnl).toBe(beforeNet);
    expect(workspaceSnapshotFromLedger(again.ledger).performance.netPnl).toBe(49);
  });

  it("DST ambiguity and unsupported instruments never create active heads", () => {
    const dst = prepareFixture("timezone-dst-fold.csv");
    expect(dst.preview.status).toBe("invalid");
    expect(dst.preview.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "csv_ambiguous_local_time" }),
      expect.objectContaining({ code: "csv_nonexistent_local_time" }),
    ]));
    expect(() => verifyPreparedCsvImport(dst)).toThrow();

    const unsupported = prepareFixture("unsupported-instruments.csv");
    expect(unsupported.preview.status).toBe("invalid");
    expect(
      unsupported.preview.issues.filter((issue) => issue.code === "csv_unsupported_instrument"),
    ).toHaveLength(5);
    expect(() => verifyPreparedCsvImport(unsupported)).toThrow();

    // Direct preview path also rejects OCC options before any store commit.
    const optionPreview = previewGenericCsvImport(
      "Symbol,Side,Quantity,Price,Timestamp\nAAPL250117C00150000,BUY,1,2.5,2026-01-02T15:00:00Z",
      { timeZone: "UTC" },
    );
    expect(optionPreview.status).toBe("invalid");
    expect(optionPreview.validRows).toBe(0);
    expect(optionPreview.issues).toContainEqual(
      expect.objectContaining({ code: "csv_unsupported_instrument" }),
    );
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
      const published = allGovernedReportSubjects(workspace);
      return {
        tradeCount: projection.trades.length,
        status: projection.trades[0]?.status,
        remaining: projection.trades[0]?.remainingQuantity,
        netPnl: projection.moneyTotals[0]?.netPnl ?? null,
        perfNet: workspace.performance.netPnl,
        published: published.totalTradeCounts.symbol,
        calendar: calendarNetExact(workspace),
        setupIncluded: buildSetupPerformanceReport(workspace).metadata.includedTradeCount,
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
      calendar: first.calendar,
      setupIncluded: 0,
    });
    expect(first.calendar.length).toBeGreaterThan(0);
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
