import { describe, expect, it } from "vitest";

import {
  createJournalExportArtifact,
  type JournalArchive,
  type JournalArchiveJson,
  type JournalArchiveUnsigned,
} from "../application/journal-archive";
import { JournalRestoreError } from "../application/journal-store";
import { prepareCsvImport } from "../application/prepare-csv-import";
import { prepareDailyJournalEntry } from "../application/prepare-daily-journal";
import { preparePlaybookDefinition } from "../application/prepare-playbook-definition";
import {
  prepareManualExecution,
  type ManualExecutionInput,
} from "../application/prepare-manual-execution";
import {
  PERCENT_RETURN_METRIC_ID,
  PERCENT_RETURN_METRIC_VERSION,
  RESULT_R_METRIC_ID,
  RESULT_R_METRIC_VERSION,
  prepareTradeReview,
  tradeReviewBatchRevision,
} from "../application/prepare-trade-review";
import type { PreparedJournalRestore } from "../application/journal-restore";
import { workspaceSnapshotFromLedger } from "../application/workspace-snapshot";
import { buildAccountReviewCoverageReport } from "../core/account-review-coverage-report";
import { buildDirectionMixReport } from "../core/direction-mix-report";
import { buildEmotionPatternsReport } from "../core/emotion-patterns-report";
import { buildMistakePatternsReport } from "../core/mistake-patterns-report";
import { buildOpeningWeekdayMixReport } from "../core/opening-weekday-mix-report";
import { buildPlanAdherenceReport } from "../core/plan-adherence-report";
import { buildReviewSessionCoverageReport } from "../core/review-session-coverage-report";
import { buildSetupPerformanceReport } from "../core/setup-performance-report";
import { buildSymbolBreakdownReport } from "../core/symbol-breakdown-report";
import { buildTagPatternsReport } from "../core/tag-patterns-report";
import {
  sessionJournalLedgerFromPayload,
  sessionJournalReportSha256,
  sessionJournalStateSha256,
  sessionJournalSummary,
  type SessionJournalPayload,
  type SessionJournalPayloadV2,
} from "./session-journal-restore";
import { SessionJournalStore } from "./session-journal-store";
import { MOBILE_SCHEMA_MIGRATIONS, sha256Hex } from "./sqlite/schema";

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
  let nowMs = Date.parse("2026-07-01T16:00:00.000Z");
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
    mistakes: ["Late scale-out"],
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
  await store.commitDailyJournalEntry(prepareDailyJournalEntry({
    submissionId: "9".repeat(64),
    isoDate: "2026-07-02",
    expectedPreviousEntryId: null,
    state: "completed",
    title: "Protected the process",
    note: "Skipped a weak setup after the reviewed trade.",
    emotion: "Calm",
    processScorePct: 94,
    tags: ["No trade"],
  }));
  const artifact = await store.exportUserData();
  return { store, archive: artifact.archive, contents: artifact.contents };
}

async function mixedAccountReviewCoverageArchive(): Promise<{
  readonly store: SessionJournalStore;
  readonly contents: string;
}> {
  let nowMs = Date.parse("2026-07-01T16:00:00.000Z");
  const store = new SessionJournalStore({ nowMs: () => nowMs++ });
  await store.commitManualExecution(manual("d", "NVDA"));
  await store.commitManualExecution(manual("e", "NVDA", "0", {
    side: "SELL",
    positionEffect: "CLOSE",
    price: "115",
    executedAt: "2026-07-01T10:30:00",
  }));
  await store.commitManualExecution(manual("1", "AAPL", "0", {
    accountName: "Secondary brokerage",
    executedAt: "2026-07-01T11:00:00",
  }));
  await store.commitManualExecution(manual("2", "MSFT", "0", {
    accountName: "Secondary brokerage",
    executedAt: "2026-07-01T12:00:00",
  }));
  await store.commitManualExecution(manual("3", "MSFT", "0", {
    accountName: "Secondary brokerage",
    side: "SELL",
    positionEffect: "CLOSE",
    price: "205",
    executedAt: "2026-07-01T12:30:00",
  }));
  await store.commitManualExecution(manual("4", "TSLA", "0", {
    executedAt: "2026-07-01T13:00:00",
  }));
  await store.commitManualExecution(manual("5", "TSLA", "0", {
    side: "SELL",
    positionEffect: "CLOSE",
    price: "105",
    executedAt: "2026-07-01T13:30:00",
  }));
  const retained = await store.commitCsvImport(prepareCsvImport({
    rawInput: "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
      + "retained-empty,QQQ,BUY,1,500,0,USD,2026-07-01T18:00:00Z",
    sourceName: "retained-empty.csv",
    accountName: "Retained archive",
    timeZone: "America/New_York",
    defaultCurrency: "USD",
  }));
  await store.rollbackImport(retained.receipt.id, "Retain an empty account");

  const ledger = await store.load();
  const subjectFor = (symbol: string): string => {
    const instrument = ledger.instruments.find((candidate) => candidate.symbol === symbol);
    const trade = ledger.projection.trades.find((candidate) => (
      candidate.instrumentId === instrument?.id
    ));
    const subject = ledger.tradeSubjects.find((candidate) => (
      candidate.projectionTradeId === trade?.id
    ));
    if (subject === undefined) throw new Error(`Missing ${symbol} trade subject.`);
    return subject.tradeSubjectId;
  };
  const completed = prepareTradeReview({
    submissionId: "6".repeat(64),
    tradeSubjectId: subjectFor("NVDA"),
    expectedPreviousReviewId: null,
    state: "completed",
    note: "Completed review retained across restore.",
    setup: "Breakout",
    mistakes: [],
    tags: [],
    emotion: "Focused",
    playbook: null,
    initialRisk: { amount: "10", currency: "USD" },
    plannedStop: "90",
  });
  const draft = prepareTradeReview({
    submissionId: "7".repeat(64),
    tradeSubjectId: subjectFor("TSLA"),
    expectedPreviousReviewId: null,
    state: "draft",
    note: "Draft review retained across restore.",
    setup: null,
    mistakes: [],
    tags: [],
    emotion: null,
    playbook: null,
    initialRisk: null,
    plannedStop: null,
  });
  const batchId = "mixed-account-review-coverage-restore";
  await store.commitTradeReviews({
    batchId,
    reviews: [completed, draft],
    revision: tradeReviewBatchRevision(batchId, [completed, draft]),
  });
  const artifact = await store.exportUserData();
  return { store, contents: artifact.contents };
}

function legacyTradeReviewRevision(
  review: ReturnType<typeof prepareTradeReview>,
): string {
  return sha256Hex(JSON.stringify([
    "hermes-trade-review-v1",
    review.submissionId,
    review.tradeSubjectId,
    review.expectedPreviousReviewId,
    review.state,
    review.note,
    review.setup === null ? null : review.setup.toLocaleLowerCase("en-US"),
    review.mistakes.map((value) => value.toLocaleLowerCase("en-US")),
    review.tags.map((value) => value.toLocaleLowerCase("en-US")),
    review.emotion === null ? null : review.emotion.toLocaleLowerCase("en-US"),
    review.playbook === null
      ? null
      : [
          review.playbook.name.toLocaleLowerCase("en-US"),
          review.playbook.rules.map((rule) => [
            rule.name.toLocaleLowerCase("en-US"),
            rule.outcome,
          ]),
        ],
    review.initialRisk === null
      ? null
      : [review.initialRisk.amount, review.initialRisk.currency],
    review.plannedStop,
    [RESULT_R_METRIC_ID, RESULT_R_METRIC_VERSION],
    [PERCENT_RETURN_METRIC_ID, PERCENT_RETURN_METRIC_VERSION],
  ]));
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
      const beforeAccountReviewCoverage = buildAccountReviewCoverageReport(beforeSnapshot);
      const beforeDirection = buildDirectionMixReport(beforeSnapshot);
      const beforeEmotions = buildEmotionPatternsReport(beforeSnapshot);
      const beforeMistakes = buildMistakePatternsReport(beforeSnapshot);
      const beforeOpeningWeekdays = buildOpeningWeekdayMixReport(beforeSnapshot);
      const beforePlan = buildPlanAdherenceReport(beforeSnapshot);
      const beforeReviewSessions = buildReviewSessionCoverageReport(beforeSnapshot);
      const beforeSetup = buildSetupPerformanceReport(beforeSnapshot);
      const beforeSymbols = buildSymbolBreakdownReport(beforeSnapshot);
      const beforeTags = buildTagPatternsReport(beforeSnapshot);
      const prepared = await destination.prepareUserDataRestore(source.contents);
      await destination.commitUserDataRestore(prepared);
      const afterSnapshot = workspaceSnapshotFromLedger(await destination.load());
      const afterAccountReviewCoverage = buildAccountReviewCoverageReport(afterSnapshot);
      const afterDirection = buildDirectionMixReport(afterSnapshot);
      const afterEmotions = buildEmotionPatternsReport(afterSnapshot);
      const afterMistakes = buildMistakePatternsReport(afterSnapshot);
      const afterOpeningWeekdays = buildOpeningWeekdayMixReport(afterSnapshot);
      const afterPlan = buildPlanAdherenceReport(afterSnapshot);
      const afterReviewSessions = buildReviewSessionCoverageReport(afterSnapshot);
      const afterSetup = buildSetupPerformanceReport(afterSnapshot);
      const afterSymbols = buildSymbolBreakdownReport(afterSnapshot);
      const afterTags = buildTagPatternsReport(afterSnapshot);
      expect(afterSnapshot.calendar).toEqual(beforeSnapshot.calendar);
      expect(afterSnapshot.dailyJournal).toEqual(beforeSnapshot.dailyJournal);

      expect(afterAccountReviewCoverage).toEqual(beforeAccountReviewCoverage);
      expect(afterDirection).toEqual(beforeDirection);
      expect(afterEmotions).toEqual(beforeEmotions);
      expect(afterPlan).toEqual(beforePlan);
      expect(afterReviewSessions).toEqual(beforeReviewSessions);
      expect(afterSetup).toEqual(beforeSetup);
      expect(afterSymbols).toEqual(beforeSymbols);
      expect(afterMistakes).toEqual(beforeMistakes);
      expect(afterOpeningWeekdays).toEqual(beforeOpeningWeekdays);
      expect(afterTags).toEqual(beforeTags);
      expect(afterAccountReviewCoverage.metadata).toMatchObject({
        accountCount: 1,
        totalTradeCount: 1,
        closedTradeCount: 1,
        openTradeCount: 0,
        waitingReviewCount: 0,
        completedReviewCount: 1,
      });
      expect(afterAccountReviewCoverage.accounts).toEqual([
        expect.objectContaining({
          accountLabel: "Primary brokerage",
          position: 1,
          tradeCount: 1,
          groups: [
            expect.objectContaining({ classification: "draft", tradeCount: 0 }),
            expect.objectContaining({ classification: "pending", tradeCount: 0 }),
            expect.objectContaining({
              classification: "completed",
              tradeCount: 1,
              tradeSubjectIds: [expect.any(String)],
            }),
            expect.objectContaining({ classification: "open", tradeCount: 0 }),
          ],
        }),
      ]);
      expect(afterReviewSessions.metadata).toMatchObject({
        totalSessionCount: 1,
        reviewedSessionCount: 1,
        unreviewedSessionCount: 0,
        currentStreakSessionCount: 1,
        totalAssignmentCount: 1,
      });
      expect(afterDirection.metadata.totalTradeCount).toBe(1);
      expect(afterDirection.groups).toEqual([
        expect.objectContaining({
          direction: "long",
          tradeCount: 1,
          tradeSubjectIds: [expect.any(String)],
        }),
        expect.objectContaining({ direction: "short", tradeCount: 0 }),
      ]);
      expect(afterOpeningWeekdays.groups).toEqual([
        expect.objectContaining({ weekday: "monday", tradeCount: 0 }),
        expect.objectContaining({ weekday: "tuesday", tradeCount: 0 }),
        expect.objectContaining({
          weekday: "wednesday",
          tradeCount: 1,
          tradeSubjectIds: [expect.any(String)],
        }),
        expect.objectContaining({ weekday: "thursday", tradeCount: 0 }),
        expect.objectContaining({ weekday: "friday", tradeCount: 0 }),
        expect.objectContaining({ weekday: "saturday", tradeCount: 0 }),
        expect.objectContaining({ weekday: "sunday", tradeCount: 0 }),
      ]);
      expect(afterMistakes.metadata).toMatchObject({
        includedTradeCount: 1,
        totalAssignmentCount: 1,
      });
      expect(afterMistakes.groups).toEqual([
        expect.objectContaining({
          mistake: "Late scale-out",
          assignmentCount: 1,
          tradeSubjectIds: [expect.any(String)],
        }),
      ]);
      expect(afterMistakes.groups[0]?.evidence[0]).toMatchObject({
        symbol: "NVDA",
        mistake: "Late scale-out",
      });
      expect(afterTags.metadata).toMatchObject({
        includedTradeCount: 1,
        totalAssignmentCount: 1,
      });
      expect(afterTags.groups).toEqual([
        expect.objectContaining({
          tag: "Patient entry",
          assignmentCount: 1,
          tradeSubjectIds: [expect.any(String)],
        }),
      ]);
      expect(afterTags.groups[0]?.evidence[0]).toMatchObject({
        symbol: "NVDA",
        tag: "Patient entry",
      });
      expect(afterEmotions.metadata).toMatchObject({
        includedTradeCount: 1,
        exclusions: {
          incompleteReview: 0,
          noEmotionAssigned: 0,
        },
      });
      expect(afterEmotions.groups).toEqual([
        expect.objectContaining({
          emotion: "Focused",
          tradeCount: 1,
          tradeSubjectIds: [expect.any(String)],
        }),
      ]);
      expect(afterEmotions.groups[0]?.evidence[0]).toMatchObject({
        symbol: "NVDA",
        emotion: "Focused",
      });
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

  it("restores mixed account review coverage with zero-trade and four-state evidence", async () => {
    const source = await mixedAccountReviewCoverageArchive();
    const destination = new SessionJournalStore();
    try {
      const before = buildAccountReviewCoverageReport(
        workspaceSnapshotFromLedger(await source.store.load()),
      );
      const prepared = await destination.prepareUserDataRestore(source.contents);
      await destination.commitUserDataRestore(prepared);
      const after = buildAccountReviewCoverageReport(
        workspaceSnapshotFromLedger(await destination.load()),
      );

      expect(after).toEqual(before);
      expect(after.metadata).toMatchObject({
        accountCount: 3,
        totalTradeCount: 4,
        closedTradeCount: 3,
        openTradeCount: 1,
        waitingReviewCount: 2,
        pendingReviewCount: 1,
        draftReviewCount: 1,
        completedReviewCount: 1,
      });
      expect(after.accounts.map((account) => ({
        label: account.accountLabel,
        tradeCount: account.tradeCount,
        groups: account.groups.map((group) => [
          group.classification,
          group.tradeCount,
        ]),
      }))).toEqual([
        {
          label: "Primary brokerage",
          tradeCount: 2,
          groups: [["draft", 1], ["pending", 0], ["completed", 1], ["open", 0]],
        },
        {
          label: "Retained archive",
          tradeCount: 0,
          groups: [["draft", 0], ["pending", 0], ["completed", 0], ["open", 0]],
        },
        {
          label: "Secondary brokerage",
          tradeCount: 2,
          groups: [["draft", 0], ["pending", 1], ["completed", 0], ["open", 1]],
        },
      ]);
    } finally {
      await source.store.close();
      await destination.close();
    }
  });

  it("rejects re-signed daily revisions and poisoned shared vocabulary", async () => {
    const source = await reviewedSourceArchive();
    const destination = new SessionJournalStore();
    try {
      const payload = structuredClone(
        source.archive.payload.data,
      ) as unknown as SessionJournalPayload;
      const first = payload.dailyEntryVersions[0];
      if (first === undefined) throw new Error("Expected a daily entry in the restore fixture.");
      const changed: SessionJournalPayload = {
        ...payload,
        dailyEntryVersions: [{
          ...first,
          note: "Changed after the immutable daily revision was recorded.",
        }],
      };
      const changedLedger = sessionJournalLedgerFromPayload(changed);
      const changedContents = rebuild(source.archive, {
        payload: {
          ...source.archive.payload,
          data: changed as unknown as JournalArchiveJson,
        },
        summary: sessionJournalSummary(changed, changedLedger),
        stateSha256: sessionJournalStateSha256(changed),
        reportSha256: sessionJournalReportSha256(changedLedger),
      });
      await expect(destination.prepareUserDataRestore(changedContents))
        .rejects.toMatchObject({
          conflict: {
            code: "invalid_payload",
            message: expect.stringMatching(/revision does not bind/i),
          },
        });

      const missingVocabulary: SessionJournalPayload = {
        ...payload,
        reviewTerms: payload.reviewTerms.filter((term) => (
          term.name !== "Calm" && term.name !== "No trade"
        )),
      };
      const vocabularyLedger = sessionJournalLedgerFromPayload(missingVocabulary);
      const vocabularyContents = rebuild(source.archive, {
        payload: {
          ...source.archive.payload,
          data: missingVocabulary as unknown as JournalArchiveJson,
        },
        summary: sessionJournalSummary(missingVocabulary, vocabularyLedger),
        stateSha256: sessionJournalStateSha256(missingVocabulary),
        reportSha256: sessionJournalReportSha256(vocabularyLedger),
      });
      await expect(destination.prepareUserDataRestore(vocabularyContents))
        .rejects.toMatchObject({
          conflict: {
            code: "invalid_payload",
            message: expect.stringMatching(/missing shared review vocabulary/i),
          },
        });

      const firstTerm = payload.reviewTerms[0];
      if (firstTerm === undefined) throw new Error("Expected shared review vocabulary.");
      const poisonedVocabulary: SessionJournalPayload = {
        ...payload,
        reviewTerms: payload.reviewTerms.map((term, index) => (
          index === 0 ? { ...term, name: ` ${firstTerm.name}` } : term
        )),
      };
      const poisonedLedger = sessionJournalLedgerFromPayload(poisonedVocabulary);
      const poisonedContents = rebuild(source.archive, {
        payload: {
          ...source.archive.payload,
          data: poisonedVocabulary as unknown as JournalArchiveJson,
        },
        summary: sessionJournalSummary(poisonedVocabulary, poisonedLedger),
        stateSha256: sessionJournalStateSha256(poisonedVocabulary),
        reportSha256: sessionJournalReportSha256(poisonedLedger),
      });
      await expect(destination.prepareUserDataRestore(poisonedContents))
        .rejects.toMatchObject({
          conflict: {
            code: "invalid_payload",
            message: expect.stringMatching(/vocabulary term names must be canonical/i),
          },
        });

      const firstResult = await source.store.load();
      const firstHead = firstResult.dailyEntries[0];
      if (firstHead === undefined) throw new Error("Expected a daily-entry head.");
      await source.store.commitDailyJournalEntry(prepareDailyJournalEntry({
        submissionId: "8".repeat(64),
        isoDate: firstHead.isoDate,
        expectedPreviousEntryId: firstHead.id,
        state: "completed",
        title: null,
        note: "Second immutable version.",
        emotion: "Calm",
        processScorePct: null,
        tags: ["No trade"],
      }));
      const twoVersionArtifact = await source.store.exportUserData();
      const chronological = structuredClone(
        twoVersionArtifact.archive.payload.data,
      ) as unknown as SessionJournalPayload;
      const orderedVersions = [...chronological.dailyEntryVersions]
        .sort((left, right) => left.version - right.version);
      const firstVersion = orderedVersions[0];
      const secondVersion = orderedVersions[1];
      if (firstVersion === undefined || secondVersion === undefined) {
        throw new Error("Expected a two-version daily-entry chain.");
      }
      const reversedChronology: SessionJournalPayload = {
        ...chronological,
        dailyEntryVersions: chronological.dailyEntryVersions.map((entry) => (
          entry.id === secondVersion.id
            ? {
                ...entry,
                recordedAtUs: firstVersion.recordedAtUs,
                completedAtUs: firstVersion.recordedAtUs,
              }
            : entry
        )),
        counters: {
          ...chronological.counters,
          lastDailyEntryRecordedAtMs: String(BigInt(firstVersion.recordedAtUs) / 1_000n),
        },
      };
      const chronologyLedger = sessionJournalLedgerFromPayload(reversedChronology);
      const chronologyContents = rebuild(twoVersionArtifact.archive, {
        payload: {
          ...twoVersionArtifact.archive.payload,
          data: reversedChronology as unknown as JournalArchiveJson,
        },
        summary: sessionJournalSummary(reversedChronology, chronologyLedger),
        stateSha256: sessionJournalStateSha256(reversedChronology),
        reportSha256: sessionJournalReportSha256(chronologyLedger),
      });
      await expect(destination.prepareUserDataRestore(chronologyContents))
        .rejects.toMatchObject({
          conflict: {
            code: "invalid_payload",
            message: expect.stringMatching(/versions are not contiguous/i),
          },
        });
      expect((await destination.load()).workspace).toBeNull();
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
        payloadVersion: 3,
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

      const legacyBrowser = rebuild(source.archive, {
        payload: { ...source.archive.payload, version: 1 },
      });
      await expectRestoreCode(
        destination.prepareUserDataRestore(legacyBrowser),
        "unsupported_payload",
      );

      const data = source.archive.payload.data as unknown as Record<string, JournalArchiveJson>;
      const legacyState = rebuild(source.archive, {
        payload: {
          ...source.archive.payload,
          data: { ...data, stateVersion: 1 },
        },
      });
      await expectRestoreCode(
        destination.prepareUserDataRestore(legacyState),
        "invalid_payload",
      );

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

  it("accepts v2 unlinked and normalized linked reviews but rejects stale exact definitions", async () => {
    let sourceNowMs = Date.parse("2026-07-01T16:00:00.000Z");
    const source = new SessionJournalStore({ nowMs: () => sourceNowMs++ });
    const destination = new SessionJournalStore();
    const tamperDestination = new SessionJournalStore();
    try {
      await source.commitManualExecution(manual("a", "AAPL"));
      await source.commitManualExecution(manual("b", "AAPL", "0", {
        side: "SELL",
        positionEffect: "CLOSE",
        price: "110",
        executedAt: "2026-07-01T10:00:00",
      }));
      await source.commitManualExecution(manual("c", "MSFT", "0", {
        executedAt: "2026-07-01T11:00:00",
      }));
      await source.commitManualExecution(manual("d", "MSFT", "0", {
        side: "SELL",
        positionEffect: "CLOSE",
        price: "120",
        executedAt: "2026-07-01T12:00:00",
      }));

      const created = await source.commitPlaybookDefinition(preparePlaybookDefinition({
        submissionId: "1".repeat(64),
        action: "create",
        playbookId: null,
        expectedPreviousVersionId: null,
        name: "Opening Drive",
        rules: ["Wait for volume", "Respect the stop"],
      }));
      const ledger = await source.load();
      const subjectFor = (symbol: string): string => {
        const instrument = ledger.instruments.find((candidate) => candidate.symbol === symbol);
        const trade = ledger.projection.trades.find((candidate) => (
          candidate.instrumentId === instrument?.id
        ));
        const subject = ledger.tradeSubjects.find((candidate) => (
          candidate.projectionTradeId === trade?.id
        ));
        if (subject === undefined) throw new Error(`Missing ${symbol} trade subject.`);
        return subject.tradeSubjectId;
      };
      const unlinked = prepareTradeReview({
        submissionId: "e".repeat(64),
        tradeSubjectId: subjectFor("AAPL"),
        expectedPreviousReviewId: null,
        state: "completed",
        note: "Creates the shared vocabulary with alternate display casing.",
        setup: null,
        mistakes: [],
        tags: [],
        emotion: null,
        playbook: {
          name: "OPENING DRIVE",
          definition: null,
          rules: [
            { name: "WAIT FOR VOLUME", outcome: "followed" },
            { name: "RESPECT THE STOP", outcome: "followed" },
          ],
        },
        initialRisk: null,
        plannedStop: null,
      });
      const linked = prepareTradeReview({
        submissionId: "f".repeat(64),
        tradeSubjectId: subjectFor("MSFT"),
        expectedPreviousReviewId: null,
        state: "completed",
        note: "Keeps the immutable definition's exact display text.",
        setup: null,
        mistakes: [],
        tags: [],
        emotion: null,
        playbook: {
          name: created.definition.name,
          definition: {
            id: created.definition.id,
            versionId: created.definition.versionId,
            revision: created.definition.revision,
          },
          rules: created.definition.rules.map((rule) => ({
            name: rule,
            outcome: "followed" as const,
          })),
        },
        initialRisk: null,
        plannedStop: null,
      });
      const batchId = "session-restore-definition-casing";
      await source.commitTradeReviews({
        batchId,
        reviews: [unlinked, linked],
        revision: tradeReviewBatchRevision(batchId, [unlinked, linked]),
      });

      const artifact = await source.exportUserData();
      const payload = structuredClone(
        artifact.archive.payload.data,
      ) as unknown as SessionJournalPayload;
      const sharedPlaybook = payload.playbooks[0];
      const storedUnlinked = payload.reviewVersions.find((review) => (
        review.playbookDefinition === null
      ));
      const storedLinked = payload.reviewVersions.find((review) => (
        review.playbookDefinition !== null
      ));
      if (
        sharedPlaybook === undefined
        || storedUnlinked === undefined
        || storedLinked === undefined
      ) {
        throw new Error("Expected shared, linked, and unlinked playbook review snapshots.");
      }
      expect(sharedPlaybook.name).toBe("OPENING DRIVE");
      expect(sharedPlaybook.rules.map((rule) => rule.text).sort()).toEqual([
        "RESPECT THE STOP",
        "WAIT FOR VOLUME",
      ]);
      expect(storedLinked.playbookName).toBe("Opening Drive");
      expect(storedLinked.rules.map((rule) => rule.text)).toEqual([
        "Wait for volume",
        "Respect the stop",
      ]);
      expect(storedUnlinked.revision).toBe(unlinked.revision);
      expect(storedLinked.revision).toBe(linked.revision);

      const prepared = await destination.prepareUserDataRestore(artifact.contents);
      await destination.commitUserDataRestore(prepared);
      const roundTrip = await destination.exportUserData();
      expect(roundTrip.archive.stateSha256).toBe(artifact.archive.stateSha256);
      expect(roundTrip.archive.reportSha256).toBe(artifact.archive.reportSha256);
      expect(roundTrip.archive.summary).toEqual(artifact.archive.summary);

      const staleDefinitionContents = (change: "name" | "rule"): string => {
        const tampered = structuredClone(payload);
        const definition = tampered.playbookDefinitionVersions[0];
        const linkedReview = tampered.reviewVersions.find((review) => (
          review.playbookDefinition !== null
        ));
        const definitionSubmission = definition === undefined
          ? undefined
          : tampered.playbookDefinitionSubmissions.find(([, submission]) => (
              submission.versionId === definition.versionId
            ));
        if (
          definition === undefined
          || linkedReview === undefined
          || linkedReview.playbookDefinition === null
          || definitionSubmission === undefined
        ) {
          throw new Error("Expected one linked definition command to tamper.");
        }
        const linkedDefinition = linkedReview.playbookDefinition;
        const changedName = change === "name" ? "OPENING DRIVE" : definition.name;
        const changedRules = change === "rule"
          ? definition.rules.map((rule, index) => index === 0 ? "WAIT FOR VOLUME" : rule)
          : [...definition.rules];
        const changedDefinition = preparePlaybookDefinition({
          submissionId: definitionSubmission[0],
          action: "create",
          playbookId: null,
          expectedPreviousVersionId: null,
          name: changedName,
          rules: changedRules,
        });
        const changedDefinitionVersions = tampered.playbookDefinitionVersions.map((version) => (
          version.versionId === definition.versionId
            ? {
                ...version,
                revision: changedDefinition.revision,
                name: changedDefinition.name,
                rules: changedDefinition.rules.map((rule) => rule.text),
              }
            : version
        ));
        const changedDefinitionSubmissions = tampered.playbookDefinitionSubmissions.map((entry) => (
          entry[0] === definitionSubmission[0]
            ? [entry[0], {
                ...entry[1],
                revision: changedDefinition.revision,
              }] as const
            : entry
        ));
        const changedReviews = tampered.reviewVersions.map((review) => (
          review.id === linkedReview.id
            ? {
                ...review,
                playbookName: changedDefinition.name,
                playbookDefinition: {
                  ...linkedDefinition,
                  revision: changedDefinition.revision,
                },
                rules: review.rules.map((rule, index) => ({
                  ...rule,
                  text: changedDefinition.rules[index]?.text ?? rule.text,
                })),
              }
            : review
        ));
        const tamperedPayload: SessionJournalPayload = {
          ...tampered,
          playbookDefinitionVersions: changedDefinitionVersions,
          playbookDefinitionSubmissions: changedDefinitionSubmissions,
          reviewVersions: changedReviews,
        };
        const tamperedLedger = sessionJournalLedgerFromPayload(tamperedPayload);
        return rebuild(artifact.archive, {
          payload: {
            ...artifact.archive.payload,
            data: tamperedPayload as unknown as JournalArchiveJson,
          },
          summary: sessionJournalSummary(tamperedPayload, tamperedLedger),
          stateSha256: sessionJournalStateSha256(tamperedPayload),
          reportSha256: sessionJournalReportSha256(tamperedLedger),
        });
      };

      for (const change of ["name", "rule"] as const) {
        await expect(tamperDestination.prepareUserDataRestore(
          staleDefinitionContents(change),
        )).rejects.toMatchObject({
          conflict: {
            code: "invalid_payload",
            message: expect.stringMatching(/review revision does not bind/i),
          },
        });
      }
      expect((await tamperDestination.load()).workspace).toBeNull();
    } finally {
      await source.close();
      await destination.close();
      await tamperDestination.close();
    }
  });

  it("round-trips complete v3 playbook history, rejects tampering, and continues writing", async () => {
    let sourceNowMs = 10_000;
    const source = new SessionJournalStore({ nowMs: () => sourceNowMs++ });
    let destinationNowMs = 20_000;
    const destination = new SessionJournalStore({ nowMs: () => destinationNowMs++ });
    const tamperDestination = new SessionJournalStore();
    const secondDestination = new SessionJournalStore();
    try {
      const create = preparePlaybookDefinition({
        submissionId: "1".repeat(64),
        action: "create",
        playbookId: null,
        expectedPreviousVersionId: null,
        name: "Opening Drive",
        rules: ["Wait for volume", "Respect the stop"],
      });
      const created = await source.commitPlaybookDefinition(create);
      const edit = preparePlaybookDefinition({
        submissionId: "2".repeat(64),
        action: "edit",
        playbookId: created.definition.id,
        expectedPreviousVersionId: created.definition.versionId,
        name: "Opening Drive Revised",
        rules: ["Wait for confirmation", "Respect the stop"],
      });
      const edited = await source.commitPlaybookDefinition(edit);
      const sourceArtifact = await source.exportUserData();
      expect(sourceArtifact.archive.summary.playbooks).toBe("1");
      const sourcePayload = sourceArtifact.archive.payload.data as unknown as SessionJournalPayload;
      expect(sourcePayload.playbookDefinitionIdentities).toHaveLength(1);
      expect(sourcePayload.playbookDefinitionVersions).toHaveLength(2);
      expect(sourcePayload.playbookDefinitionHeads).toEqual([
        [edited.definition.id, edited.definition.versionId],
      ]);
      expect(sourcePayload.playbookDefinitionSubmissions).toHaveLength(2);

      const prepared = await destination.prepareUserDataRestore(sourceArtifact.contents);
      expect(prepared.preview).toMatchObject({
        payloadKind: "browser-session-state",
        payloadVersion: 3,
        target: "empty",
        stateSha256: sourceArtifact.archive.stateSha256,
        summary: { playbooks: "1" },
      });
      await destination.commitUserDataRestore(prepared);
      expect(await destination.loadPlaybookLibrary()).toEqual([edited.definition]);
      const firstRoundTrip = await destination.exportUserData();
      expect(firstRoundTrip.archive.stateSha256).toBe(sourceArtifact.archive.stateSha256);
      expect(firstRoundTrip.archive.reportSha256).toBe(sourceArtifact.archive.reportSha256);

      const restoredHead = (await destination.loadPlaybookLibrary())[0];
      if (restoredHead === undefined) throw new Error("Expected a restored definition head.");
      const archived = await destination.commitPlaybookDefinition(
        preparePlaybookDefinition({
          submissionId: "3".repeat(64),
          action: "archive",
          playbookId: restoredHead.id,
          expectedPreviousVersionId: restoredHead.versionId,
          name: restoredHead.name,
          rules: restoredHead.rules,
        }),
      );
      expect(archived.definition).toMatchObject({
        id: restoredHead.id,
        version: 3,
        state: "archived",
      });
      const continuedArtifact = await destination.exportUserData();
      const continuedPayload = (
        continuedArtifact.archive.payload.data
      ) as unknown as SessionJournalPayload;
      expect(continuedPayload.playbookDefinitionVersions).toHaveLength(3);
      expect(continuedArtifact.archive.summary.playbooks).toBe("1");

      const continuedPrepared = await secondDestination.prepareUserDataRestore(
        continuedArtifact.contents,
      );
      await secondDestination.commitUserDataRestore(continuedPrepared);
      expect(await secondDestination.loadPlaybookLibrary()).toEqual([archived.definition]);
      expect((await secondDestination.exportUserData()).archive.stateSha256)
        .toBe(continuedArtifact.archive.stateSha256);

      const firstVersion = sourcePayload.playbookDefinitionVersions[0];
      if (firstVersion === undefined) throw new Error("Expected immutable definition history.");
      const tampered: SessionJournalPayload = {
        ...sourcePayload,
        playbookDefinitionVersions: sourcePayload.playbookDefinitionVersions.map((version) => (
          version.versionId === firstVersion.versionId
            ? { ...version, name: "Tampered after commit" }
            : version
        )),
      };
      const tamperedLedger = sessionJournalLedgerFromPayload(tampered);
      const tamperedContents = rebuild(sourceArtifact.archive, {
        payload: {
          ...sourceArtifact.archive.payload,
          data: tampered as unknown as JournalArchiveJson,
        },
        summary: sessionJournalSummary(tampered, tamperedLedger),
        stateSha256: sessionJournalStateSha256(tampered),
        reportSha256: sessionJournalReportSha256(tamperedLedger),
      });
      await expect(tamperDestination.prepareUserDataRestore(tamperedContents))
        .rejects.toMatchObject({
          conflict: {
            code: "invalid_payload",
            message: expect.stringMatching(/does not bind/i),
          },
        });
      expect(await tamperDestination.loadPlaybookLibrary()).toEqual([]);
    } finally {
      await source.close();
      await destination.close();
      await tamperDestination.close();
      await secondDestination.close();
    }
  });

  it("accepts a legacy v1 review while verifying v2 claims before v3 migration", async () => {
    const source = await reviewedSourceArchive();
    const destination = new SessionJournalStore();
    const verificationDestination = new SessionJournalStore();
    try {
      const current = structuredClone(
        source.archive.payload.data,
      ) as unknown as SessionJournalPayload;
      const currentReview = current.reviewVersions[0];
      const reviewSubmission = current.reviewSubmissions[0];
      if (
        currentReview === undefined
        || reviewSubmission === undefined
        || current.reviewVersions.length !== 1
        || currentReview.playbookDefinition !== null
        || reviewSubmission[1].reviewId !== currentReview.id
      ) {
        throw new Error("Expected one unlinked review in the legacy migration fixture.");
      }
      const reconstructed = prepareTradeReview({
        submissionId: reviewSubmission[0],
        tradeSubjectId: currentReview.tradeSubjectId,
        expectedPreviousReviewId: null,
        state: currentReview.state,
        note: currentReview.note,
        setup: currentReview.setup,
        mistakes: currentReview.mistakes,
        tags: currentReview.tags,
        emotion: currentReview.emotion,
        playbook: currentReview.playbookId === null
          ? null
          : {
              name: currentReview.playbookName as string,
              definition: null,
              rules: currentReview.rules.map((rule) => ({
                name: rule.text,
                outcome: rule.outcome,
              })),
            },
        initialRisk: currentReview.initialRisk,
        plannedStop: currentReview.plannedStop,
      });
      expect(reconstructed.revision).toBe(currentReview.revision);
      const legacyRevision = legacyTradeReviewRevision(reconstructed);
      expect(legacyRevision).not.toBe(reconstructed.revision);
      const legacyReviewId = `session-review:${sha256Hex(JSON.stringify([
        currentReview.tradeSubjectId,
        reviewSubmission[0],
        legacyRevision,
      ]))}`;
      const { playbookDefinition: _playbookDefinition, ...legacyReview } = currentReview;
      const legacy = {
        ...legacyReview,
        id: legacyReviewId,
        revision: legacyRevision,
      };
      const v2Payload: SessionJournalPayloadV2 = {
        adapter: current.adapter,
        stateVersion: 2,
        workspace: current.workspace,
        accounts: current.accounts,
        instruments: current.instruments,
        activeExecutions: current.activeExecutions,
        inactiveExecutions: current.inactiveExecutions,
        receipts: current.receipts,
        receiptByRevision: current.receiptByRevision,
        manualSubmissions: current.manualSubmissions,
        reviewVersions: [legacy],
        reviewHeads: current.reviewHeads.map(([tradeSubjectId]) => (
          [tradeSubjectId, legacyReviewId] as const
        )),
        reviewTerms: current.reviewTerms,
        playbooks: current.playbooks,
        reviewSubmissions: [[reviewSubmission[0], {
          revision: legacyRevision,
          reviewId: legacyReviewId,
        }]],
        dailyEntryVersions: current.dailyEntryVersions,
        dailyEntryHeads: current.dailyEntryHeads,
        dailyEntrySubmissions: current.dailyEntrySubmissions,
        counters: {
          lastReviewRecordedAtMs: current.counters.lastReviewRecordedAtMs,
          lastDailyEntryRecordedAtMs: current.counters.lastDailyEntryRecordedAtMs,
          nextExecutionSequence: current.counters.nextExecutionSequence,
          nextReceiptOrdinal: current.counters.nextReceiptOrdinal,
        },
      };
      const v2Ledger = sessionJournalLedgerFromPayload(v2Payload);
      const v2Summary = sessionJournalSummary(v2Payload, v2Ledger);
      const v2Migrations = MOBILE_SCHEMA_MIGRATIONS.slice(0, 4);
      const v2Artifact = createJournalExportArtifact({
        kind: source.archive.kind,
        formatVersion: source.archive.formatVersion,
        exportedAtUs: source.archive.exportedAtUs,
        source: {
          schemaUserVersion: 4,
          migrations: v2Migrations.map((migration) => ({
            version: migration.toVersion,
            name: migration.name,
            checksumSha256: migration.checksumSha256,
          })),
        },
        payload: {
          kind: "browser-session-state",
          version: 2,
          data: v2Payload as unknown as JournalArchiveJson,
        },
        attachments: source.archive.attachments,
        summary: v2Summary,
        stateSha256: sessionJournalStateSha256(v2Payload),
        reportSha256: sessionJournalReportSha256(v2Ledger),
      });

      const prepared = await destination.prepareUserDataRestore(v2Artifact.contents);
      expect(prepared.preview).toMatchObject({
        payloadKind: "browser-session-state",
        payloadVersion: 2,
        target: "empty",
        reportSha256: v2Artifact.archive.reportSha256,
        summary: v2Summary,
      });
      await destination.commitUserDataRestore(prepared);
      expect(await destination.loadPlaybookLibrary()).toEqual([]);
      expect((await destination.load()).tradeReviews.every((review) => (
        review.playbookDefinition === null
      ))).toBe(true);

      const migrated = await destination.exportUserData();
      const migratedPayload = (
        migrated.archive.payload.data
      ) as unknown as SessionJournalPayload;
      expect(migrated.archive.payload.version).toBe(3);
      expect(migratedPayload.stateVersion).toBe(3);
      expect(migratedPayload.playbookDefinitionIdentities).toEqual([]);
      expect(migratedPayload.playbookDefinitionVersions).toEqual([]);
      expect(migratedPayload.playbookDefinitionHeads).toEqual([]);
      expect(migratedPayload.playbookDefinitionSubmissions).toEqual([]);
      expect(migratedPayload.reviewVersions.every((review) => (
        review.playbookDefinition === null
      ))).toBe(true);
      expect(migratedPayload.reviewVersions[0]?.revision).toBe(legacyRevision);
      expect(migratedPayload.reviewVersions[0]?.id).toBe(legacyReviewId);
      expect(migrated.archive.reportSha256).toBe(v2Artifact.archive.reportSha256);
      expect(migrated.archive.summary).toEqual(v2Summary);

      await destination.commitPlaybookDefinition(preparePlaybookDefinition({
        submissionId: "7".repeat(64),
        action: "create",
        playbookId: null,
        expectedPreviousVersionId: null,
        name: "First Explicit Definition",
        rules: ["Wait for confirmation"],
      }));
      expect((await destination.exportUserData()).archive.summary.playbooks)
        .toBe(String(Number(v2Summary.playbooks) + 1));

      const falseOriginalClaims = [
        rebuild(v2Artifact.archive, { stateSha256: "0".repeat(64) }),
        rebuild(v2Artifact.archive, { reportSha256: "0".repeat(64) }),
        rebuild(v2Artifact.archive, {
          summary: { ...v2Artifact.archive.summary, playbooks: "999" },
        }),
      ];
      for (const contents of falseOriginalClaims) {
        await expectRestoreCode(
          verificationDestination.prepareUserDataRestore(contents),
          "verification_failed",
        );
      }
      expect((await verificationDestination.load()).workspace).toBeNull();
      expect(await verificationDestination.loadPlaybookLibrary()).toEqual([]);
    } finally {
      await source.store.close();
      await destination.close();
      await verificationDestination.close();
    }
  });
});
