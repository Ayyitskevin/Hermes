import { describe, expect, it } from "vitest";

import { prepareCsvImport } from "../application/prepare-csv-import";
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

describe("browser session journal ownership", () => {
  it("keeps shared fills active while a later overlapping receipt remains active", async () => {
    let nowMs = 1_800_000_000_000;
    const store = new SessionJournalStore({ nowMs: () => nowMs++ });
    try {
      const first = await store.commitCsvImport(prepared(IMPORT_A, "first.csv"));
      const second = await store.commitCsvImport(prepared(IMPORT_B, "second.csv"));
      expect(second.ledger.executions).toHaveLength(2);
      expect(second.receipt).toMatchObject({ acceptedRows: 2, executionCount: 1 });

      const afterFirstRollback = await store.rollbackImport(
        first.receipt.id,
        "Remove the earlier overlapping import",
      );
      expect(afterFirstRollback.executions).toHaveLength(2);
      expect(afterFirstRollback.projection.trades[0]?.moneyTotals[0]?.netPnl).toBe("10");

      const duplicate = await store.commitCsvImport(prepared(IMPORT_B, "second.csv"));
      expect(duplicate.outcome).toBe("duplicate");
      expect(duplicate.ledger.executions).toHaveLength(2);

      const afterSecondRollback = await store.rollbackImport(
        second.receipt.id,
        "Remove the remaining overlapping import",
      );
      expect(afterSecondRollback.executions).toEqual([]);
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
