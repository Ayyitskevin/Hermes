import { describe, expect, it } from "vitest";

import type { DailyJournalEntryInput } from "../application/prepare-daily-journal";
import { prepareDailyJournalEntry } from "../application/prepare-daily-journal";
import { prepareManualExecution } from "../application/prepare-manual-execution";
import { SessionJournalStore } from "./session-journal-store";

function establishWorkspace(store: SessionJournalStore) {
  return store.commitManualExecution(prepareManualExecution({
    submissionId: "a".repeat(64),
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
    executedAt: "2026-07-13T09:30:00",
  }));
}

function daily(
  submissionDigit: string,
  overrides: Partial<DailyJournalEntryInput> = {},
) {
  return prepareDailyJournalEntry({
    submissionId: submissionDigit.repeat(64),
    isoDate: "2026-07-13",
    expectedPreviousEntryId: null,
    state: "draft",
    title: "Protected the process",
    note: "Waited for confirmation.",
    emotion: "Focused",
    processScorePct: 88,
    tags: ["Patient"],
    ...overrides,
  });
}

describe("browser-session durable daily journal", () => {
  it("keeps one optimistic immutable chain per date with exact retry identity", async () => {
    let nowMs = 20_000;
    const store = new SessionJournalStore({ nowMs: () => nowMs++ });
    try {
      const emptyBefore = await store.exportUserData();
      await expect(store.commitDailyJournalEntry(daily("b"))).rejects.toMatchObject({
        conflict: { code: "workspace_changed" },
      });
      expect((await store.exportUserData()).archive.stateSha256)
        .toBe(emptyBefore.archive.stateSha256);

      await establishWorkspace(store);
      const firstCommand = daily("b");
      const first = await store.commitDailyJournalEntry(firstCommand);
      expect(first).toMatchObject({ outcome: "committed" });
      expect(first.ledger.dailyEntries).toEqual([
        expect.objectContaining({
          id: first.entryVersionId,
          version: 1,
          state: "draft",
          emotion: "Focused",
          tags: ["Patient"],
        }),
      ]);

      const duplicate = await store.commitDailyJournalEntry(firstCommand);
      expect(duplicate).toMatchObject({
        outcome: "duplicate",
        entryVersionId: first.entryVersionId,
      });

      await expect(store.commitDailyJournalEntry(daily("b", {
        note: "Same submission, different authored content.",
      }))).rejects.toMatchObject({ conflict: { code: "submission_changed" } });

      const editCommand = daily("c", {
        expectedPreviousEntryId: first.entryVersionId,
        state: "completed",
        title: null,
        note: "Stayed patient and skipped a weak setup.",
        emotion: "focused",
        processScorePct: 92,
        tags: ["patient", "No trade"],
      });
      const edit = await store.commitDailyJournalEntry(editCommand);
      expect(edit.ledger.dailyEntries).toEqual([
        expect.objectContaining({
          id: edit.entryVersionId,
          version: 2,
          state: "completed",
          title: null,
          emotion: "Focused",
          tags: ["Patient", "No trade"],
          completedAtUs: expect.any(String),
        }),
      ]);
      const beforeStale = await store.exportUserData();
      await expect(store.commitDailyJournalEntry(daily("d", {
        expectedPreviousEntryId: first.entryVersionId,
      }))).rejects.toMatchObject({ conflict: { code: "entry_changed" } });
      expect((await store.exportUserData()).archive.stateSha256)
        .toBe(beforeStale.archive.stateSha256);

      const payload = (await store.exportUserData()).archive.payload.data as unknown as {
        dailyEntryVersions: readonly unknown[];
        dailyEntryHeads: readonly unknown[];
        dailyEntrySubmissions: readonly unknown[];
      };
      expect(payload.dailyEntryVersions).toHaveLength(2);
      expect(payload.dailyEntryHeads).toHaveLength(1);
      expect(payload.dailyEntrySubmissions).toHaveLength(2);
    } finally {
      await store.close();
    }
  });

  it("round-trips a maximum code-point note and all immutable history", async () => {
    let nowMs = 30_000;
    const source = new SessionJournalStore({ nowMs: () => nowMs++ });
    const destination = new SessionJournalStore({ nowMs: () => nowMs++ });
    const replay = new SessionJournalStore({ nowMs: () => nowMs++ });
    try {
      await establishWorkspace(source);
      const note = "🙂".repeat(5_000);
      const first = await source.commitDailyJournalEntry(daily("e", {
        isoDate: "2026-07-12",
        note,
        title: null,
        emotion: "Focused",
        processScorePct: null,
        tags: ["Patient"],
      }));
      await source.commitDailyJournalEntry(daily("f", {
        isoDate: "2026-07-12",
        expectedPreviousEntryId: first.entryVersionId,
        state: "completed",
        note,
        title: null,
        emotion: "focused",
        processScorePct: null,
        tags: ["patient"],
      }));

      const artifact = await source.exportUserData();
      expect(artifact.archive.payload).toMatchObject({
        kind: "browser-session-state",
        version: 2,
      });
      const prepared = await destination.prepareUserDataRestore(artifact.contents);
      const restored = await destination.commitUserDataRestore(prepared);
      expect(restored.ledger.dailyEntries).toEqual([
        expect.objectContaining({
          version: 2,
          state: "completed",
          note,
          emotion: "Focused",
          tags: ["Patient"],
        }),
      ]);
      expect((await destination.exportUserData()).archive.stateSha256)
        .toBe(artifact.archive.stateSha256);

      const restoredHead = restored.ledger.dailyEntries[0];
      if (restoredHead === undefined) throw new Error("Restored daily head is missing.");
      await destination.commitDailyJournalEntry(daily("7", {
        isoDate: restoredHead.isoDate,
        expectedPreviousEntryId: restoredHead.id,
        state: "completed",
        note,
        title: null,
        emotion: "FOCUSED",
        processScorePct: null,
        tags: ["PATIENT"],
      }));
      const continued = await destination.exportUserData();
      const replayPrepared = await replay.prepareUserDataRestore(continued.contents);
      const replayed = await replay.commitUserDataRestore(replayPrepared);
      expect(replayed.ledger.dailyEntries).toEqual([
        expect.objectContaining({
          version: 3,
          emotion: "Focused",
          tags: ["Patient"],
          note,
        }),
      ]);
      expect((await replay.exportUserData()).archive.stateSha256)
        .toBe(continued.archive.stateSha256);
    } finally {
      await source.close();
      await destination.close();
      await replay.close();
    }
  });
});
