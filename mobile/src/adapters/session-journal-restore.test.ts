import { describe, expect, it } from "vitest";

import {
  createJournalExportArtifact,
  type JournalArchive,
  type JournalArchiveJson,
  type JournalArchiveUnsigned,
} from "../application/journal-archive";
import { JournalRestoreError } from "../application/journal-store";
import { prepareCsvImport } from "../application/prepare-csv-import";
import {
  prepareManualExecution,
  type ManualExecutionInput,
} from "../application/prepare-manual-execution";
import {
  prepareTradeReview,
  tradeReviewBatchRevision,
} from "../application/prepare-trade-review";
import type { PreparedJournalRestore } from "../application/journal-restore";
import { workspaceSnapshotFromLedger } from "../application/workspace-snapshot";
import { buildPlanAdherenceReport } from "../core/plan-adherence-report";
import { buildSetupPerformanceReport } from "../core/setup-performance-report";
import {
  sessionJournalLedgerFromPayload,
  sessionJournalReportSha256,
  sessionJournalStateSha256,
  sessionJournalSummary,
  type SessionJournalPayload,
} from "./session-journal-restore";
import { SessionJournalStore } from "./session-journal-store";

function manual(
  submissionDigit: string,
  symbol = "AAPL",
  fee = "0",
  overrides: Partial<ManualExecutionInput> = {},
) {
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
    ...overrides,
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

async function reviewedSourceArchive(): Promise<{
  readonly store: SessionJournalStore;
  readonly archive: JournalArchive;
  readonly contents: string;
}> {
  let nowMs = 30_000;
  const store = new SessionJournalStore({ nowMs: () => nowMs++ });
  await store.commitManualExecution(manual("d", "NVDA"));
  await store.commitManualExecution(manual("e", "NVDA", "0", {
    side: "SELL",
    positionEffect: "CLOSE",
    price: "115",
    executedAt: "2026-07-01T10:30:00",
  }));
  const ledger = await store.load();
  const instrument = ledger.instruments.find((candidate) => candidate.symbol === "NVDA");
  const trade = ledger.projection.trades.find((candidate) => (
    candidate.instrumentId === instrument?.id
  ));
  const subject = ledger.tradeSubjects.find((candidate) => (
    candidate.projectionTradeId === trade?.id
  ));
  if (subject === undefined) throw new Error("The reviewed restore fixture has no trade subject.");

  const review = prepareTradeReview({
    submissionId: "f".repeat(64),
    tradeSubjectId: subject.tradeSubjectId,
    expectedPreviousReviewId: null,
    state: "completed",
    note: "Waited for confirmation and followed the exit plan.",
    setup: "Breakout",
    mistakes: [],
    tags: ["Patient entry"],
    emotion: "Focused",
    playbook: {
      name: "Opening Drive",
      rules: [{ name: "Wait for volume", outcome: "followed" }],
    },
    initialRisk: { amount: "10", currency: "USD" },
    plannedStop: "90",
  });
  const batchId = "restore-report-equality";
  await store.commitTradeReviews({
    batchId,
    reviews: [review],
    revision: tradeReviewBatchRevision(batchId, [review]),
  });
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
  it("recomputes identical governed reports after export and restore", async () => {
    const source = await reviewedSourceArchive();
    const destination = new SessionJournalStore();
    try {
      const beforeSnapshot = workspaceSnapshotFromLedger(await source.store.load());
      const beforePlan = buildPlanAdherenceReport(beforeSnapshot);
      const beforeSetup = buildSetupPerformanceReport(beforeSnapshot);
      const prepared = await destination.prepareUserDataRestore(source.contents);
      await destination.commitUserDataRestore(prepared);
      const afterSnapshot = workspaceSnapshotFromLedger(await destination.load());
      const afterPlan = buildPlanAdherenceReport(afterSnapshot);
      const afterSetup = buildSetupPerformanceReport(afterSnapshot);

      expect(afterPlan).toEqual(beforePlan);
      expect(afterSetup).toEqual(beforeSetup);
      expect(afterPlan.metadata.includedTradeCount).toBe(1);
      expect(afterPlan.groups[0]).toMatchObject({
        classification: "followed",
        tradeCount: 1,
        netPnlExact: "15",
        averageRExact: "1.5",
      });
      expect(afterPlan.groups[0].evidence[0]).toMatchObject({
        symbol: "NVDA",
        resultPnlExact: "15",
        resultRExact: "1.5",
      });
      expect(afterSetup.metadata.includedTradeCount).toBe(1);
      expect(afterSetup.groups).toHaveLength(1);
      expect(afterSetup.groups[0]).toMatchObject({
        setup: "Breakout",
        tradeCount: 1,
        winCount: 1,
        netPnlExact: "15",
        cashExpectancyExact: "15",
        averageRExact: "1.5",
        rTradeCount: 1,
      });
      expect(afterSetup.groups[0]?.evidence[0]).toMatchObject({
        symbol: "NVDA",
        resultPnlExact: "15",
        resultRExact: "1.5",
      });
    } finally {
      await source.store.close();
      await destination.close();
    }
  });

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
