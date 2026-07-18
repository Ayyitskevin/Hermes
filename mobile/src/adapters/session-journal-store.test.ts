import { describe, expect, it } from "vitest";

import { prepareCsvImport } from "../application/prepare-csv-import";
import {
  prepareManualExecution,
  type ManualExecutionInput,
} from "../application/prepare-manual-execution";
import { SessionJournalStore } from "./session-journal-store";

const IMPORT_A = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
  + "fill-1,AAPL,BUY,1,100,0,USD,2026-07-01T13:30:00Z";

const IMPORT_B = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
  + "fill-1,AAPL,BUY,1,100,0,USD,2026-07-01T13:30:00Z\r\n"
  + "fill-2,AAPL,SELL,1,110,0,USD,2026-07-01T14:30:00Z";

function prepared(rawInput: string, sourceName: string) {
  return prepareCsvImport({
    rawInput,
    sourceName,
    accountName: "Primary brokerage",
    timeZone: "America/New_York",
    defaultCurrency: "USD",
  });
}

function manual(
  submissionDigit: string,
  overrides: Partial<ManualExecutionInput> = {},
) {
  return prepareManualExecution({
    submissionId: submissionDigit.repeat(64),
    accountName: "Primary brokerage",
    timeZone: "America/New_York",
    defaultCurrency: "USD",
    symbol: "AAPL",
    assetClass: "stock",
    side: "BUY",
    positionEffect: "OPEN",
    quantity: "1",
    price: "100",
    fee: "0",
    executedAt: "2026-07-01T09:30:00",
    ...overrides,
  });
}

describe("browser session journal ownership", () => {
  it("keeps manual fills idempotent and outside CSV rollback ownership", async () => {
    let nowMs = 1_800_000_000_000;
    const store = new SessionJournalStore({ nowMs: () => nowMs++ });
    try {
      const entryCommand = manual("7");
      const entry = await store.commitManualExecution(entryCommand);
      const duplicate = await store.commitManualExecution(entryCommand);
      expect(duplicate).toMatchObject({
        outcome: "duplicate",
        executionId: entry.executionId,
      });
      expect(await store.loadUnacknowledgedManualExecutions()).toEqual([{
        submissionId: entryCommand.submissionId,
        executionId: entry.executionId,
        symbol: "AAPL",
        side: "BUY",
      }]);
      await store.acknowledgeManualExecution(entryCommand.submissionId);
      expect(await store.loadUnacknowledgedManualExecutions()).toEqual([]);

      const imported = await store.commitCsvImport(prepared(
        "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
          + "csv-exit,AAPL,STC,1,110,0,USD,2026-07-01T14:30:00Z",
        "exit.csv",
      ));
      const rolledBack = await store.rollbackImport(
        imported.receipt.id,
        "Remove only the imported exit",
      );
      expect(rolledBack.executions).toHaveLength(1);
      expect(rolledBack.executions[0]?.id).toBe(entry.executionId);
      expect(rolledBack.projection.trades[0]).toMatchObject({
        status: "OPEN",
        remainingQuantity: "1",
      });
    } finally {
      await store.close();
    }
  });

  it("keeps manual ETF and generic-CSV stock identities separate by asset class", async () => {
    const store = new SessionJournalStore();
    try {
      const manualEtf = await store.commitManualExecution(manual("9", {
        symbol: "SPY",
        assetClass: "etf",
      }));
      const imported = await store.commitCsvImport(prepared(
        "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
          + "csv-spy,SPY,BUY,1,500,0,USD,2026-07-01T14:30:00Z",
        "spy.csv",
      ));
      expect(imported.ledger.instruments
        .filter((instrument) => instrument.symbol === "SPY")
        .map((instrument) => instrument.assetClass)
        .sort()).toEqual(["etf", "stock"]);
      expect(imported.ledger.executions.find((execution) => execution.id === manualEtf.executionId)
        ?.instrumentId).not.toBe(imported.ledger.executions.find((execution) => (
        execution.id !== manualEtf.executionId
      ))?.instrumentId);
    } finally {
      await store.close();
    }
  });

  it("leaves browser state unchanged when a manual close cannot normalize", async () => {
    const store = new SessionJournalStore();
    try {
      const before = await store.load();
      await expect(store.commitManualExecution(manual("8", {
        side: "SELL",
        positionEffect: "CLOSE",
      }))).rejects.toThrow(/CLOSE execution cannot act on a flat position/);
      expect(await store.load()).toEqual(before);
    } finally {
      await store.close();
    }
  });

  it("keeps shared fills active while a later overlapping receipt remains active", async () => {
    let nowMs = 1_800_000_000_000;
    const store = new SessionJournalStore({ nowMs: () => nowMs++ });
    try {
      const first = await store.commitCsvImport(prepared(IMPORT_A, "first.csv"));
      const second = await store.commitCsvImport(prepared(IMPORT_B, "second.csv"));
      expect(second.ledger.executions).toHaveLength(2);
      expect(second.receipt).toMatchObject({ acceptedRows: 2, executionCount: 1 });
      const firstEvidence = await store.loadImportReviewEvidence(first.receipt.id);
      const secondEvidence = await store.loadImportReviewEvidence(second.receipt.id);
      expect(firstEvidence.occurrenceExecutionIds).toHaveLength(1);
      expect(secondEvidence.occurrenceExecutionIds).toHaveLength(2);
      expect(new Set(secondEvidence.occurrenceExecutionIds).size).toBe(2);
      expect(secondEvidence.receipt).toEqual(second.receipt);
      expect(Object.isFrozen(secondEvidence.occurrenceExecutionIds)).toBe(true);

      const afterFirstRollback = await store.rollbackImport(
        first.receipt.id,
        "Remove the earlier overlapping import",
      );
      expect(afterFirstRollback.executions).toHaveLength(2);
      expect(afterFirstRollback.projection.trades[0]?.moneyTotals[0]?.netPnl).toBe("10");
      await expect(store.loadImportReviewEvidence(first.receipt.id))
        .rejects.toThrow(/active receipt/i);
      await expect(store.loadImportReviewEvidence(second.receipt.id))
        .resolves.toMatchObject({ occurrenceExecutionIds: secondEvidence.occurrenceExecutionIds });

      const duplicate = await store.commitCsvImport(prepared(IMPORT_B, "second.csv"));
      expect(duplicate.outcome).toBe("duplicate");
      expect(duplicate.ledger.executions).toHaveLength(2);
      expect((await store.loadImportReviewEvidence(duplicate.receipt.id)).occurrenceExecutionIds)
        .toEqual(secondEvidence.occurrenceExecutionIds);

      const afterSecondRollback = await store.rollbackImport(
        second.receipt.id,
        "Remove the remaining overlapping import",
      );
      expect(afterSecondRollback.executions).toEqual([]);
      await expect(store.loadImportReviewEvidence(second.receipt.id))
        .rejects.toThrow(/active receipt/i);

      const restored = await store.commitCsvImport(prepared(IMPORT_B, "restored.csv"));
      expect(restored.receipt.id).not.toBe(second.receipt.id);
      expect((await store.loadImportReviewEvidence(restored.receipt.id)).occurrenceExecutionIds)
        .toEqual(secondEvidence.occurrenceExecutionIds);
    } finally {
      await store.close();
    }
  });

  it("creates a distinct zero-version receipt when identical content is renamed", async () => {
    const store = new SessionJournalStore();
    try {
      const first = await store.commitCsvImport(prepared(IMPORT_B, "fills.csv"));
      const renamed = await store.commitCsvImport(prepared(IMPORT_B, "renamed-fills.csv"));

      expect(renamed.outcome).toBe("committed");
      expect(renamed.receipt.id).not.toBe(first.receipt.id);
      expect(renamed.receipt).toMatchObject({
        sourceName: "renamed-fills.csv",
        acceptedRows: 2,
        executionCount: 0,
      });
      expect(renamed.ledger.executions).toHaveLength(2);
      expect(renamed.ledger.imports).toHaveLength(2);
      expect((await store.loadImportReviewEvidence(renamed.receipt.id)).occurrenceExecutionIds)
        .toEqual((await store.loadImportReviewEvidence(first.receipt.id)).occurrenceExecutionIds);
    } finally {
      await store.close();
    }
  });

  it("preserves repeated accepted-row occurrence multiplicity for one execution", async () => {
    const store = new SessionJournalStore();
    const repeated = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "same-fill,AAPL,BUY,1,100,0,USD,2026-07-01T13:30:00Z\r\n"
      + "same-fill,AAPL,BUY,1,100,0,USD,2026-07-01T13:30:00Z";
    try {
      const committed = await store.commitCsvImport(prepared(repeated, "repeated.csv"));
      const evidence = await store.loadImportReviewEvidence(committed.receipt.id);

      expect(committed.receipt).toMatchObject({ acceptedRows: 2, executionCount: 1 });
      expect(evidence.occurrenceExecutionIds).toHaveLength(2);
      expect(new Set(evidence.occurrenceExecutionIds).size).toBe(1);
      expect(evidence.occurrenceExecutionIds[0]).toBe(evidence.occurrenceExecutionIds[1]);
    } finally {
      await store.close();
    }
  });

  it("leaves session state unchanged when a dependent rollback cannot normalize", async () => {
    let nowMs = 1_800_000_000_000;
    const store = new SessionJournalStore({ nowMs: () => nowMs++ });
    const entryCsv = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "entry,AAPL,BTO,1,100,0,USD,2026-07-01T13:30:00Z";
    const exitCsv = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "exit,AAPL,STC,1,110,0,USD,2026-07-01T14:30:00Z";
    try {
      const entry = await store.commitCsvImport(prepared(entryCsv, "entry.csv"));
      await store.commitCsvImport(prepared(exitCsv, "exit.csv"));
      const before = await store.load();

      await expect(store.rollbackImport(
        entry.receipt.id,
        "Attempt an invalid dependent rollback",
      )).rejects.toThrow(/CLOSE execution cannot act on a flat position/);

      expect(await store.load()).toEqual(before);
    } finally {
      await store.close();
    }
  });

  it("uses stable global ordering for equal-timestamp imports and reordered restoration", async () => {
    let nowMs = 1_800_000_000_000;
    const store = new SessionJournalStore({ nowMs: () => nowMs++ });
    const entry = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "z-entry,AAPL,BTO,1,100,0,USD,2026-07-01T13:30:00Z";
    const exit = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "a-exit,AAPL,STC,1,110,0,USD,2026-07-01T13:30:00Z";
    try {
      await store.commitCsvImport(prepared(entry, "entry.csv"));
      const closed = await store.commitCsvImport(prepared(exit, "exit.csv"));
      expect(closed.ledger.executions.map((execution) => execution.ledgerSequence)).toEqual(["1", "2"]);
      expect(closed.ledger.projection.trades[0]?.moneyTotals[0]?.netPnl).toBe("10");
    } finally {
      await store.close();
    }

    const restoreStore = new SessionJournalStore({ nowMs: () => nowMs++ });
    const original = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "entry,AAPL,BTO,1,100,0,USD,2026-07-01T13:30:00Z\r\n"
      + "exit,AAPL,STC,1,110,0,USD,2026-07-01T13:30:00Z";
    const reversed = "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "exit,AAPL,STC,1,110,0,USD,2026-07-01T13:30:00Z\r\n"
      + "entry,AAPL,BTO,1,100,0,USD,2026-07-01T13:30:00Z";
    try {
      const first = await restoreStore.commitCsvImport(prepared(original, "original.csv"));
      await restoreStore.rollbackImport(first.receipt.id, "Restore in reverse source order");
      const restored = await restoreStore.commitCsvImport(prepared(reversed, "reversed.csv"));

      expect(restored.ledger.executions.map((execution) => execution.ledgerSequence)).toEqual(["2", "1"]);
      expect(restored.ledger.projection.trades[0]?.moneyTotals[0]?.netPnl).toBe("10");
    } finally {
      await restoreStore.close();
    }
  });

  it("clamps rollback audit time when the browser clock moves backward", async () => {
    const times = [2_000, 1_000];
    const store = new SessionJournalStore({ nowMs: () => times.shift() ?? 1_000 });
    try {
      const committed = await store.commitCsvImport(prepared(IMPORT_A, "clock.csv"));
      const rolledBack = await store.rollbackImport(
        committed.receipt.id,
        "Clock moved backward after import",
      );

      expect(committed.receipt.importedAtUs).toBe("2000000");
      expect(rolledBack.imports[0]?.rolledBackAtUs).toBe("2000000");
    } finally {
      await store.close();
    }
  });
});
