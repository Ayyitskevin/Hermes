import { describe, expect, it } from "vitest";

import {
  createJournalExportArtifact,
  type JournalArchive,
  type JournalArchiveJson,
  type JournalArchiveUnsigned,
} from "../application/journal-archive";
import { JournalRestoreError } from "../application/journal-store";
import { prepareCsvImport } from "../application/prepare-csv-import";
import { prepareManualExecution } from "../application/prepare-manual-execution";
import type { PreparedJournalRestore } from "../application/journal-restore";
import {
  sessionJournalLedgerFromPayload,
  sessionJournalReportSha256,
  sessionJournalStateSha256,
  sessionJournalSummary,
  type SessionJournalPayload,
} from "./session-journal-restore";
import { SessionJournalStore } from "./session-journal-store";

function manual(submissionDigit: string, symbol = "AAPL", fee = "0") {
  return prepareManualExecution({
    submissionId: submissionDigit.repeat(64),
    accountName: "Primary brokerage",
    timeZone: "America/New_York",
    defaultCurrency: "USD",
    symbol,
    assetClass: "stock",
    side: "BUY",
    positionEffect: "OPEN",
    quantity: "1",
    price: "100",
    fee,
    executedAt: "2026-07-01T09:30:00",
  });
}

function imported(symbol = "MSFT") {
  return prepareCsvImport({
    rawInput: "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "csv-restore," + symbol + ",BUY,1,200,0,USD,2026-07-01T14:30:00Z",
    sourceName: "restore.csv",
    accountName: "Primary brokerage",
    timeZone: "America/New_York",
    defaultCurrency: "USD",
  });
}

async function sourceArchive(): Promise<{
  readonly store: SessionJournalStore;
  readonly archive: JournalArchive;
  readonly contents: string;
}> {
  let nowMs = 10_000;
  const store = new SessionJournalStore({ nowMs: () => nowMs++ });
  await store.commitManualExecution(manual("a", "AAPL", "92233720368547758.07"));
  const importCommand = imported();
  const receipt = await store.commitCsvImport(importCommand);
  await store.rollbackImport(receipt.receipt.id, "Retain inactive restore history");
  await store.commitCsvImport(importCommand);
  const artifact = await store.exportUserData();
  return { store, archive: artifact.archive, contents: artifact.contents };
}

function rebuild(
  archive: JournalArchive,
  changes: Partial<JournalArchiveUnsigned>,
): string {
  const { archiveSha256: _archiveSha256, ...unsigned } = archive;
  return createJournalExportArtifact({ ...unsigned, ...changes }).contents;
}

async function expectRestoreCode(
  promise: Promise<unknown>,
  code: JournalRestoreError["conflict"]["code"],
): Promise<void> {
  await promise.then(
    () => { throw new Error("Expected restore to fail."); },
    (error: unknown) => {
      expect(error).toBeInstanceOf(JournalRestoreError);
      expect((error as JournalRestoreError).conflict.code).toBe(code);
    },
  );
}

describe("browser session user-data restore", () => {
  it("restores the complete session payload and makes a lost-response retry idempotent", async () => {
    const source = await sourceArchive();
    let nowMs = 20_000;
    const destination = new SessionJournalStore({ nowMs: () => nowMs++ });
    try {
      const prepared = await destination.prepareUserDataRestore(source.contents);
      expect(prepared.preview).toMatchObject({
        payloadKind: "browser-session-state",
        payloadVersion: 1,
        target: "empty",
        stateSha256: source.archive.stateSha256,
        reportSha256: source.archive.reportSha256,
        summary: source.archive.summary,
      });

      const committed = await destination.commitUserDataRestore(prepared);
      expect(committed).toMatchObject({
        outcome: "committed",
        stateSha256: source.archive.stateSha256,
        reportSha256: source.archive.reportSha256,
      });
      expect(await destination.loadUnacknowledgedManualExecutions()).toHaveLength(1);
      expect(committed.ledger.imports).toEqual(expect.arrayContaining([
        expect.objectContaining({ rolledBackAtUs: expect.any(String) }),
        expect.objectContaining({ rolledBackAtUs: null }),
      ]));

      const retry = await destination.commitUserDataRestore(prepared);
      expect(retry.outcome).toBe("already-restored");
      const after = await destination.exportUserData();
      expect(after.archive.stateSha256).toBe(source.archive.stateSha256);
      expect(after.archive.reportSha256).toBe(source.archive.reportSha256);
      expect((await destination.prepareUserDataRestore(source.contents)).preview.target)
        .toBe("already-restored");
    } finally {
      await source.store.close();
      await destination.close();
    }
  });

  it("rejects nonempty and stale-preview destinations without merging state", async () => {
    const source = await sourceArchive();
    const nonempty = new SessionJournalStore();
    const stale = new SessionJournalStore();
    try {
      await nonempty.commitManualExecution(manual("b", "NVDA"));
      const beforeNonempty = await nonempty.exportUserData();
      await expectRestoreCode(
        nonempty.prepareUserDataRestore(source.contents),
        "journal_not_empty",
      );
      expect((await nonempty.exportUserData()).archive.stateSha256)
        .toBe(beforeNonempty.archive.stateSha256);

      const prepared = await stale.prepareUserDataRestore(source.contents);
      await stale.commitManualExecution(manual("c", "TSLA"));
      const beforeCommit = await stale.exportUserData();
      await expectRestoreCode(stale.commitUserDataRestore(prepared), "journal_not_empty");
      expect((await stale.exportUserData()).archive.stateSha256)
        .toBe(beforeCommit.archive.stateSha256);
    } finally {
      await source.store.close();
      await nonempty.close();
      await stale.close();
    }
  });

  it("rejects a self-consistent payload outside the current workspace display range", async () => {
    const source = await sourceArchive();
    const destination = new SessionJournalStore();
    try {
      const payload = structuredClone(
        source.archive.payload.data,
      ) as unknown as SessionJournalPayload;
      if (payload.activeExecutions[0] === undefined) {
        throw new Error("Expected an active execution in the browser restore fixture.");
      }
      const incompatible: SessionJournalPayload = {
        ...payload,
        activeExecutions: payload.activeExecutions.map((execution, index) => (
          index === 0
            ? { ...execution, occurredAtUs: "9223372036854775807" }
            : execution
        )),
      };
      const ledger = sessionJournalLedgerFromPayload(incompatible);
      const archive = source.archive;
      const artifact = createJournalExportArtifact({
        kind: archive.kind,
        formatVersion: archive.formatVersion,
        exportedAtUs: archive.exportedAtUs,
        source: archive.source,
        payload: {
          ...archive.payload,
          data: incompatible as unknown as JournalArchiveJson,
        },
        attachments: archive.attachments,
        summary: sessionJournalSummary(incompatible, ledger),
        stateSha256: sessionJournalStateSha256(incompatible),
        reportSha256: sessionJournalReportSha256(ledger),
      });

      await expect(destination.prepareUserDataRestore(artifact.contents))
        .rejects.toMatchObject({
          conflict: {
            code: "invalid_payload",
            message: expect.stringMatching(/outside the displayable date range/i),
          },
        });
      expect((await destination.load()).workspace).toBeNull();
    } finally {
      await source.store.close();
      await destination.close();
    }
  });

  it("rejects a self-consistent payload with an incomplete import replay index", async () => {
    const source = await sourceArchive();
    const destination = new SessionJournalStore();
    try {
      const payload = structuredClone(
        source.archive.payload.data,
      ) as unknown as SessionJournalPayload;
      expect(payload.receiptByRevision).not.toHaveLength(0);
      expect(payload.receipts.some((receipt) => receipt.rolledBackAtUs === null)).toBe(true);
      const incomplete: SessionJournalPayload = {
        ...payload,
        receiptByRevision: [],
      };
      const ledger = sessionJournalLedgerFromPayload(incomplete);
      const contents = rebuild(source.archive, {
        payload: {
          ...source.archive.payload,
          data: incomplete as unknown as JournalArchiveJson,
        },
        summary: sessionJournalSummary(incomplete, ledger),
        stateSha256: sessionJournalStateSha256(incomplete),
        reportSha256: sessionJournalReportSha256(ledger),
      });

      await expect(destination.prepareUserDataRestore(contents))
        .rejects.toMatchObject({
          conflict: {
            code: "invalid_payload",
            message: expect.stringMatching(/active import receipt.*replay revision index/i),
          },
        });
      expect((await destination.load()).workspace).toBeNull();
    } finally {
      await source.store.close();
      await destination.close();
    }
  });

  it("rejects cross-runtime payloads, deep shape tampering, and false digest claims", async () => {
    const source = await sourceArchive();
    const destination = new SessionJournalStore();
    try {
      const crossRuntime = rebuild(source.archive, {
        payload: { ...source.archive.payload, kind: "sqlite-table-set" },
      });
      await expectRestoreCode(
        destination.prepareUserDataRestore(crossRuntime),
        "unsupported_payload",
      );

      const data = source.archive.payload.data as unknown as Record<string, JournalArchiveJson>;
      const workspace = data.workspace as Record<string, JournalArchiveJson>;
      const deepTamper = rebuild(source.archive, {
        payload: {
          ...source.archive.payload,
          data: {
            ...data,
            workspace: { ...workspace, unsupported: true },
          },
        },
      });
      await expectRestoreCode(
        destination.prepareUserDataRestore(deepTamper),
        "invalid_payload",
      );

      const falseDigest = rebuild(source.archive, {
        stateSha256: "0".repeat(64),
      });
      await expectRestoreCode(
        destination.prepareUserDataRestore(falseDigest),
        "verification_failed",
      );
      expect((await destination.load()).workspace).toBeNull();
    } finally {
      await source.store.close();
      await destination.close();
    }
  });

  it("rechecks selected text and every verified preview claim before mutation", async () => {
    const source = await sourceArchive();
    const destination = new SessionJournalStore();
    try {
      const prepared = await destination.prepareUserDataRestore(source.contents);
      const changedContents = {
        ...prepared,
        contents: prepared.contents + " ",
      } as PreparedJournalRestore;
      await expectRestoreCode(
        destination.commitUserDataRestore(changedContents),
        "preview_changed",
      );

      const changedPreview = {
        ...prepared,
        preview: {
          ...prepared.preview,
          summary: { ...prepared.preview.summary, accounts: "999" },
        },
      } as PreparedJournalRestore;
      await expectRestoreCode(
        destination.commitUserDataRestore(changedPreview),
        "preview_changed",
      );
      expect((await destination.load()).workspace).toBeNull();
    } finally {
      await source.store.close();
      await destination.close();
    }
  });
});
