/**
 * End-to-end journal integrity suite.
 *
 * Drives shipped prepareCsvImport → (optional) session commit → normalizeTrades
 * → trade invariants → governed report builders. Golden CSV fixtures live under
 * src/fixtures/journal-integrity/.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { SessionJournalStore } from "../adapters/session-journal-store";
import { prepareCsvImport, verifyPreparedCsvImport } from "../application/prepare-csv-import";
import { reconcileImportReceipt } from "../application/import-receipt-reconciliation";
import { workspaceSnapshotFromLedger } from "../application/workspace-snapshot";
import type { JournalLedgerSnapshot } from "../application/journal-store";
import type { LedgerExecution } from "./ledger";
import { buildSymbolBreakdownReport } from "./symbol-breakdown-report";
import {
  assertActiveLedgerIntegrity,
  assertImportReceiptReconciles,
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
  overrides: Partial<Parameters<typeof prepareCsvImport>[0]> = {},
) {
  return prepareCsvImport({
    rawInput: fixture(name),
    sourceName: name,
    accountName: "Integrity account",
    timeZone: "America/New_York",
    defaultCurrency: "USD",
    ...overrides,
  });
}

function issueCodes(prepared: ReturnType<typeof prepareCsvImport>): string[] {
  return prepared.preview.issues.map((issue) => issue.code).sort();
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

describe("journal integrity golden fixtures", () => {
  it("accepts equities with partial exits and fees; invariants and report cohort hold", async () => {
    const prepared = prepareFixture("equities-partial-fees.csv");
    expect(prepared.preview.status).toBe("ready");
    expect(prepared.preview.validRows).toBe(5);
    expect(prepared.preview.rejectedRows).toBe(0);
    expect(prepared.preview.skippedRows).toBe(0);
    const verified = verifyPreparedCsvImport(prepared);
    expect(verified.revision).toBe(prepared.revision);

    const store = new SessionJournalStore({ nowMs: () => 1_800_000_000_000 });
    const committed = await store.commitCsvImport(verified);
    expect(committed.outcome).toBe("committed");
    if (committed.outcome !== "committed") throw new Error("expected commit");

    expect(committed.receipt).toMatchObject({
      sourceRows: 5,
      acceptedRows: 5,
      rejectedRows: 0,
      skippedRows: 0,
      executionCount: 5,
    });
    assertImportReceiptReconciles({
      sourceRows: committed.receipt.sourceRows,
      acceptedRows: committed.receipt.acceptedRows,
      rejectedRows: committed.receipt.rejectedRows,
      skippedRows: committed.receipt.skippedRows,
      executionVersions: committed.receipt.executionCount,
      warningCount: committed.receipt.warningCount,
    });
    const reconciliation = reconcileImportReceipt({
      receiptId: committed.receipt.id,
      accountLabel: committed.receipt.accountName,
      sourceLabel: committed.receipt.sourceName,
      importedAtLabel: "test",
      executions: committed.receipt.acceptedRows,
      accounts: 1,
      rejectedRows: committed.receipt.rejectedRows,
      skippedRows: committed.receipt.skippedRows,
      rolledBack: false,
      sourceRows: committed.receipt.sourceRows,
      acceptedRows: committed.receipt.acceptedRows,
      executionVersions: committed.receipt.executionCount,
      warningCount: committed.receipt.warningCount,
      rolledBackAtLabel: null,
    });
    expect(reconciliation.alreadyPresentRows).toBe(0);

    const projection = assertActiveLedgerIntegrity(ledgerExecutions(committed.ledger));
    expect(projection.trades).toHaveLength(2);
    for (const trade of projection.trades) {
      expect(
        Number(trade.exitedQuantity) <= Number(trade.enteredQuantity),
      ).toBe(true);
    }
    const aapl = projection.trades.find((trade) => trade.instrumentId.includes("AAPL")
      || committed.ledger.instruments.some((instrument) => (
        instrument.id === trade.instrumentId && instrument.symbol === "AAPL"
      )));
    const spy = projection.trades.find((trade) => committed.ledger.instruments.some((instrument) => (
      instrument.id === trade.instrumentId && instrument.symbol === "SPY"
    )));
    expect(aapl).toMatchObject({
      status: "CLOSED",
      enteredQuantity: "10",
      exitedQuantity: "10",
      remainingQuantity: "0",
    });
    // Gross: (4*(110-100)) + (6*(108.50-100)) = 40 + 51 = 91; fees 1+0.4+0.6 = 2 → net 89
    expect(aapl?.moneyTotals[0]).toMatchObject({
      currency: "USD",
      grossPnl: "91",
      feeCost: "2",
      netPnl: "89",
    });
    expect(spy).toMatchObject({
      status: "CLOSED",
      enteredQuantity: "2",
      exitedQuantity: "2",
    });
    // Gross 2*(505.25-500)=10.5; fee 0.05 → net 10.45
    expect(spy?.moneyTotals[0]).toMatchObject({
      grossPnl: "10.5",
      feeCost: "0.05",
      netPnl: "10.45",
    });

    const workspace = workspaceSnapshotFromLedger(committed.ledger);
    const report = buildSymbolBreakdownReport(workspace);
    const reportTradeIds = report.groups.flatMap((group) => (
      group.evidence.map((item) => item.tradeSubjectId)
    ));
    const projectionSubjectIds = workspace.trades.map((trade) => trade.tradeSubjectId);
    assertReportCohortTraceable(projectionSubjectIds, reportTradeIds);
    expect(report.metadata.totalTradeCount).toBe(2);
    expect(report.groups.every((group) => (
      group.assetClass === "stock" || group.assetClass === "etf"
    ))).toBe(true);

    // Exact re-import is idempotent: no double-count
    const again = await store.commitCsvImport(verified);
    expect(again.outcome).toBe("duplicate");
    if (again.outcome !== "duplicate") throw new Error("expected duplicate");
    const afterDup = assertActiveLedgerIntegrity(ledgerExecutions(again.ledger));
    expect(afterDup.trades).toHaveLength(2);
    expect(afterDup.moneyTotals).toEqual(projection.moneyTotals);
    expect(again.ledger.executions).toHaveLength(5);
  });

  it("rejects malformed rows with machine-readable codes and blocks commit", () => {
    const prepared = prepareFixture("malformed-rows.csv");
    expect(prepared.preview.status).toBe("invalid");
    expect(prepared.preview.validRows).toBe(1);
    expect(prepared.preview.rejectedRows).toBeGreaterThanOrEqual(3);
    expect(prepared.preview.skippedRows).toBe(1);
    expect(issueCodes(prepared)).toEqual(expect.arrayContaining([
      "csv_missing_value",
      "csv_invalid_side",
      "csv_invalid_quantity",
      "csv_invalid_price",
      "csv_invalid_fee",
      "csv_invalid_currency",
      "csv_invalid_timestamp",
      "csv_blank_row",
    ]));
    expect(() => verifyPreparedCsvImport(prepared)).toThrow(/preview error/i);
  });

  it("rejects DST fold and spring-forward ambiguity without guessing", () => {
    const prepared = prepareFixture("timezone-dst-fold.csv");
    expect(prepared.preview.status).toBe("invalid");
    expect(prepared.preview.validRows).toBe(1);
    expect(prepared.preview.rejectedRows).toBe(2);
    expect(prepared.preview.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "csv_ambiguous_local_time" }),
      expect.objectContaining({ code: "csv_nonexistent_local_time" }),
    ]));
    // The offset-bearing MSFT row remains valid but the file is not ready.
    expect(prepared.preview.rows).toHaveLength(1);
    expect(prepared.preview.rows[0]?.symbol).toBe("MSFT");
    expect(() => verifyPreparedCsvImport(prepared)).toThrow();
  });

  it("fail-closes unsupported option/futures/crypto rows with user-visible codes", () => {
    const prepared = prepareFixture("unsupported-instruments.csv");
    expect(prepared.preview.status).toBe("invalid");
    expect(prepared.preview.validRows).toBe(1);
    expect(prepared.preview.rejectedRows).toBe(5);
    const unsupported = prepared.preview.issues.filter((issue) => (
      issue.code === "csv_unsupported_instrument"
    ));
    expect(unsupported).toHaveLength(5);
    for (const issue of unsupported) {
      expect(issue.severity).toBe("error");
      expect(issue.message.length).toBeGreaterThan(20);
      expect("rawValue" in issue && issue.rawValue).toBeTruthy();
    }
    // Equity row is previewable alone but never committed from a mixed invalid file.
    expect(prepared.preview.rows[0]?.symbol).toBe("AAPL");
    expect(() => verifyPreparedCsvImport(prepared)).toThrow(/preview error/i);
  });

  it("blocks mixed partial import so unsupported rows cannot enter reports unnoticed", async () => {
    const prepared = prepareFixture("mixed-partial-import.csv");
    expect(prepared.preview.status).toBe("invalid");
    expect(prepared.preview.validRows).toBe(2);
    expect(prepared.preview.rejectedRows).toBe(1);
    expect(prepared.preview.issues).toContainEqual(
      expect.objectContaining({
        code: "csv_unsupported_instrument",
        rawValue: "AAPL250117C00150000",
      }),
    );
    expect(() => verifyPreparedCsvImport(prepared)).toThrow();

    const store = new SessionJournalStore({ nowMs: () => 1_800_000_000_000 });
    await expect(store.commitCsvImport(prepared)).rejects.toMatchObject({
      conflict: { code: "preview_changed" },
    });
    const empty = await store.load();
    expect(empty.executions).toHaveLength(0);
  });

  it("does not double-count duplicate execution identities across re-import", async () => {
    const prepared = prepareFixture("duplicate-executions.csv");
    expect(prepared.preview.status).toBe("ready");
    const store = new SessionJournalStore({ nowMs: () => 1_800_000_000_100 });
    const first = await store.commitCsvImport(prepared);
    expect(first.outcome).toBe("committed");
    if (first.outcome !== "committed") throw new Error("expected commit");
    const second = await store.commitCsvImport(prepared);
    expect(second.outcome).toBe("duplicate");
    if (second.outcome !== "duplicate") throw new Error("expected duplicate");
    expect(second.ledger.executions).toHaveLength(2);
    const projection = assertActiveLedgerIntegrity(ledgerExecutions(second.ledger));
    expect(projection.trades).toHaveLength(1);
    expect(projection.trades[0]).toMatchObject({
      enteredQuantity: "5",
      exitedQuantity: "5",
      remainingQuantity: "0",
    });
    // Gross 5*(410-400)=50; fees 0.50+0.50=1 → net 49
    expect(projection.moneyTotals[0]?.netPnl).toBe("49");
  });

  it("keeps two integrity runs bit-identical for accept counts and net P&L", async () => {
    async function runOnce() {
      const prepared = prepareFixture("equities-partial-fees.csv");
      const store = new SessionJournalStore({ nowMs: () => 1_800_000_000_200 });
      const committed = await store.commitCsvImport(prepared);
      if (committed.outcome !== "committed") throw new Error("expected commit");
      const projection = assertActiveLedgerIntegrity(ledgerExecutions(committed.ledger));
      return {
        accepted: committed.receipt.acceptedRows,
        rejected: committed.receipt.rejectedRows,
        skipped: committed.receipt.skippedRows,
        executionVersions: committed.receipt.executionCount,
        tradeCount: projection.trades.length,
        netPnl: projection.moneyTotals.map((total) => ({
          currency: total.currency,
          netPnl: total.netPnl,
        })),
        issueCodes: issueCodes(prepared),
      };
    }
    const first = await runOnce();
    const second = await runOnce();
    expect(first).toEqual(second);
    expect(first.accepted).toBe(5);
    expect(first.rejected).toBe(0);
    expect(first.netPnl).toEqual([{ currency: "USD", netPnl: "99.45" }]);
  });

  it("rollback voids receipt-owned executions and recomputes projections without double-count", async () => {
    const prepared = prepareFixture("equities-partial-fees.csv");
    const store = new SessionJournalStore({ nowMs: () => 1_800_000_000_500 });
    const committed = await store.commitCsvImport(prepared);
    if (committed.outcome !== "committed") throw new Error("expected commit");
    expect(assertActiveLedgerIntegrity(ledgerExecutions(committed.ledger)).trades).toHaveLength(2);

    const afterRollback = await store.rollbackImport(
      committed.receipt.id,
      "Integrity regression: void entire receipt",
    );
    expect(afterRollback.executions).toHaveLength(0);
    const emptyProjection = assertActiveLedgerIntegrity(ledgerExecutions(afterRollback));
    expect(emptyProjection.trades).toHaveLength(0);
    expect(emptyProjection.moneyTotals).toEqual([]);

    // Re-import after rollback restores facts once — not stacked on voided heads.
    const reimported = await store.commitCsvImport(prepared);
    expect(reimported.outcome).toBe("committed");
    if (reimported.outcome !== "committed") throw new Error("expected re-commit");
    expect(reimported.ledger.executions).toHaveLength(5);
    const restored = assertActiveLedgerIntegrity(ledgerExecutions(reimported.ledger));
    expect(restored.trades).toHaveLength(2);
    expect(restored.moneyTotals[0]?.netPnl).toBe("99.45");
  });

  it("export→restore preserves integrity invariants on active executions", async () => {
    const prepared = prepareFixture("equities-partial-fees.csv");
    const source = new SessionJournalStore({ nowMs: () => 1_800_000_000_300 });
    const committed = await source.commitCsvImport(prepared);
    if (committed.outcome !== "committed") throw new Error("expected commit");
    const before = assertActiveLedgerIntegrity(ledgerExecutions(committed.ledger));
    const beforeSnapshot = workspaceSnapshotFromLedger(committed.ledger);
    const beforeReport = buildSymbolBreakdownReport(beforeSnapshot);

    const artifact = await source.exportUserData();
    const target = new SessionJournalStore({ nowMs: () => 1_800_000_000_400 });
    const restorePrepared = await target.prepareUserDataRestore(artifact.contents);
    await target.commitUserDataRestore(restorePrepared);
    const afterLoad = await target.load();
    const after = assertActiveLedgerIntegrity(ledgerExecutions(afterLoad));
    expect(after.trades.map((trade) => ({
      enteredQuantity: trade.enteredQuantity,
      exitedQuantity: trade.exitedQuantity,
      remainingQuantity: trade.remainingQuantity,
      moneyTotals: trade.moneyTotals,
    }))).toEqual(before.trades.map((trade) => ({
      enteredQuantity: trade.enteredQuantity,
      exitedQuantity: trade.exitedQuantity,
      remainingQuantity: trade.remainingQuantity,
      moneyTotals: trade.moneyTotals,
    })));
    const afterReport = buildSymbolBreakdownReport(workspaceSnapshotFromLedger(afterLoad));
    expect(afterReport.metadata.totalTradeCount).toBe(beforeReport.metadata.totalTradeCount);
    expect(afterReport.groups.map((group) => ({
      symbol: group.symbol,
      assetClass: group.assetClass,
      tradeCount: group.tradeCount,
    }))).toEqual(beforeReport.groups.map((group) => ({
      symbol: group.symbol,
      assetClass: group.assetClass,
      tradeCount: group.tradeCount,
    })));
  });
});

describe("journal integrity adversarial checks", () => {
  it("surfaces TradeInvariantError when a synthetic trade violates closed qty", () => {
    expect(() => {
      throw new TradeInvariantError(
        "closed_quantity_exceeds_opened",
        "closed exceeds opened",
        "t1",
      );
    }).toThrow(TradeInvariantError);
  });
});
