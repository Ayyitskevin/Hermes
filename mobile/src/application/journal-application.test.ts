import { describe, expect, it } from "vitest";

import { SessionJournalStore } from "../adapters/session-journal-store";
import { parseJournalArchive } from "./journal-archive";
import type {
  DailyJournalCommitResult,
  JournalRestoreCommitResult,
  ManualExecutionCommitResult,
  PreparedTradeReviewBatch,
  TradeReviewCommitResult,
} from "./journal-store";
import {
  JournalDailyEntryError,
  JournalRestoreError,
  JournalTradeReviewError,
} from "./journal-store";
import {
  DailyJournalCommitStatusUncertainError,
  JournalApplication,
  JournalRestoreCommitStatusUncertainError,
  ManualExecutionCommitStatusUncertainError,
  TradeReviewCommitStatusUncertainError,
} from "./journal-application";
import type { PreparedDailyJournalEntry } from "./prepare-daily-journal";
import { prepareDailyJournalEntry } from "./prepare-daily-journal";
import type { PreparedJournalRestore } from "./journal-restore";
import {
  type PreparedManualExecution,
  prepareManualExecution,
} from "./prepare-manual-execution";
import {
  prepareTradeReview,
  tradeReviewBatchRevision,
  type TradeReviewInput,
} from "./prepare-trade-review";

async function openTrade(
  store: SessionJournalStore,
  symbol: string,
  submissionCharacter: string,
  hour: number,
): Promise<string> {
  const result = await store.commitManualExecution(prepareManualExecution({
    submissionId: submissionCharacter.repeat(64),
    accountName: "Primary brokerage",
    timeZone: "UTC",
    defaultCurrency: "USD",
    symbol,
    assetClass: "stock",
    side: "BUY",
    positionEffect: "OPEN",
    quantity: "1",
    price: "100",
    fee: "0",
    executedAt: `2026-07-12T${String(hour).padStart(2, "0")}:30:00`,
  }));
  const instrument = result.ledger.instruments.find((candidate) => candidate.symbol === symbol);
  const trade = result.ledger.projection.trades.find((candidate) => (
    candidate.instrumentId === instrument?.id
  ));
  const subject = result.ledger.tradeSubjects.find((candidate) => (
    candidate.projectionTradeId === trade?.id
  ));
  if (subject === undefined) throw new Error(`Could not find the ${symbol} trade subject.`);
  return subject.tradeSubjectId;
}

function reviewInput(
  submissionId: string,
  tradeSubjectId: string,
  overrides: Partial<TradeReviewInput> = {},
): TradeReviewInput {
  return {
    submissionId,
    tradeSubjectId,
    expectedPreviousReviewId: null,
    state: "completed",
    note: "Waited for the planned entry.",
    setup: "Opening range break",
    mistakes: ["Entered early"],
    tags: ["Morning"],
    emotion: "Focused",
    playbook: {
      name: "ORB",
      rules: [{ name: "Wait for volume", outcome: "followed" }],
    },
    initialRisk: { amount: "100", currency: "USD" },
    plannedStop: "95",
    ...overrides,
  };
}

describe("JournalApplication manual recovery", () => {
  it("reads a committed execution before acknowledging a lost save response", async () => {
    const store = new SessionJournalStore();
    const application = new JournalApplication(store, "browser-session");
    const command = prepareManualExecution({
      submissionId: "d".repeat(64),
      accountName: "Primary brokerage",
      timeZone: "UTC",
      defaultCurrency: "USD",
      symbol: "AAPL",
      assetClass: "stock",
      side: "BUY",
      positionEffect: "OPEN",
      quantity: "1",
      price: "100",
      fee: "0",
      executedAt: "2026-07-12T14:30:00",
    });
    try {
      const committed = await store.commitManualExecution(command);
      const recoverable = await application.loadRecoverableManualExecutions();
      expect(recoverable).toEqual([{
        submissionId: command.submissionId,
        executionId: committed.executionId,
        symbol: "AAPL",
        side: "BUY",
      }]);

      await application.acknowledgeManualExecution(command.submissionId);
      expect(await application.loadRecoverableManualExecutions()).toEqual([]);
      expect((await application.loadWorkspace()).trades).toHaveLength(1);
    } finally {
      await application.close();
    }
  });

  it("reconciles a committed execution when every bridge commit response is lost", async () => {
    class LostResponseStore extends SessionJournalStore {
      override async commitManualExecution(
        command: PreparedManualExecution,
      ): Promise<ManualExecutionCommitResult> {
        await super.commitManualExecution(command);
        throw new Error("Native bridge response was lost.");
      }
    }
    const store = new LostResponseStore();
    const application = new JournalApplication(store, "browser-session");
    const command = prepareManualExecution({
      submissionId: "e".repeat(64),
      accountName: "Primary brokerage",
      timeZone: "UTC",
      defaultCurrency: "USD",
      symbol: "MSFT",
      assetClass: "stock",
      side: "BUY",
      positionEffect: "OPEN",
      quantity: "1",
      price: "200",
      fee: "0",
      executedAt: "2026-07-12T15:30:00",
    });
    try {
      const recovered = await application.commitManualSafely(command);
      expect(recovered).toMatchObject({ outcome: "duplicate" });
      expect(recovered.ledger.executions).toHaveLength(1);
      expect(await store.loadUnacknowledgedManualExecutions()).toHaveLength(1);
      await application.acknowledgeManualExecution(command.submissionId);
      expect((await store.load()).executions).toHaveLength(1);
    } finally {
      await application.close();
    }
  });

  it("keeps an unqueryable commit status explicit instead of allowing a new submission", async () => {
    class UnavailableStore extends SessionJournalStore {
      override async commitManualExecution(_command: PreparedManualExecution): Promise<never> {
        throw new Error("Native bridge is unavailable.");
      }

      override async loadUnacknowledgedManualExecutions(): Promise<never> {
        throw new Error("Native bridge is unavailable.");
      }
    }
    const store = new UnavailableStore();
    const application = new JournalApplication(store, "browser-session");
    const command = prepareManualExecution({
      submissionId: "f".repeat(64),
      accountName: "Primary brokerage",
      timeZone: "UTC",
      defaultCurrency: "USD",
      symbol: "NVDA",
      assetClass: "stock",
      side: "BUY",
      positionEffect: "OPEN",
      quantity: "1",
      price: "100",
      fee: "0",
      executedAt: "2026-07-12T16:30:00",
    });
    try {
      await expect(application.commitManualSafely(command))
        .rejects.toBeInstanceOf(ManualExecutionCommitStatusUncertainError);
    } finally {
      await application.close();
    }
  });
});

describe("JournalApplication trade review workflow", () => {
  it("prepares and saves one immutable review only in the local journal", async () => {
    const store = new SessionJournalStore();
    const application = new JournalApplication(store, "browser-session");
    try {
      await application.exploreDemo();
      expect(() => application.createReviewSubmissionId()).toThrow(/read-only/);
      await application.startJournal();

      const tradeSubjectId = await openTrade(store, "AAPL", "1", 10);
      const submissionId = application.createReviewSubmissionId();
      expect(submissionId).toMatch(/^[a-f0-9]{64}$/);
      const review = application.prepareReview(reviewInput(submissionId, tradeSubjectId));
      const batch = application.prepareReviewBatch([review], "single-review");

      const saved = await application.commitReviews(batch);
      expect(saved).toMatchObject({ outcome: "committed" });
      expect(saved.reviewIds).toHaveLength(1);
      expect(saved.ledger.tradeReviews).toEqual([
        expect.objectContaining({
          id: saved.reviewIds[0],
          tradeSubjectId,
          version: 1,
          state: "completed",
          revision: review.revision,
          note: "Waited for the planned entry.",
          tags: ["Morning"],
        }),
      ]);
      expect(Object.isFrozen(batch)).toBe(true);
      expect(Object.isFrozen(batch.reviews)).toBe(true);
    } finally {
      await application.close();
    }
  });

  it("reconciles current immutable heads after every commit response is lost", async () => {
    class LostReviewResponseStore extends SessionJournalStore {
      override async commitTradeReviews(
        command: PreparedTradeReviewBatch,
      ): Promise<TradeReviewCommitResult> {
        await super.commitTradeReviews(command);
        throw new Error("Native bridge response was lost.");
      }
    }

    const store = new LostReviewResponseStore();
    const application = new JournalApplication(store, "browser-session");
    try {
      const tradeSubjectId = await openTrade(store, "MSFT", "2", 11);
      const review = application.prepareReview(reviewInput(
        application.createReviewSubmissionId(),
        tradeSubjectId,
      ));
      const recovered = await application.commitReviewsSafely(
        application.prepareReviewBatch([review], "lost-response"),
      );

      expect(recovered.outcome).toBe("duplicate");
      expect(recovered.reviewIds).toEqual([recovered.ledger.tradeReviews[0]?.id]);
      expect(recovered.ledger.tradeReviews).toHaveLength(1);
      expect(recovered.ledger.tradeReviews[0]?.revision).toBe(review.revision);
    } finally {
      await application.close();
    }
  });

  it.each([
    "submission_changed",
    "review_changed",
    "trade_changed",
  ] as const)(
    "keeps a %s response uncertain after an earlier commit response was unknown",
    async (code) => {
      class AmbiguousThenDomainStore extends SessionJournalStore {
        commitCalls = 0;

        override async commitTradeReviews(
          _command: PreparedTradeReviewBatch,
        ): Promise<TradeReviewCommitResult> {
          this.commitCalls += 1;
          if (this.commitCalls === 1) {
            throw new Error("Native bridge response was lost.");
          }
          throw new JournalTradeReviewError({
            code,
            message: "Adapter state changed before exact receipt proof.",
          });
        }
      }

      const store = new AmbiguousThenDomainStore();
      const application = new JournalApplication(store, "browser-session");
      try {
        const tradeSubjectId = await openTrade(store, "IBM", "a", 11);
        const review = application.prepareReview(reviewInput(
          "b".repeat(64),
          tradeSubjectId,
        ));
        await expect(application.commitReviewsSafely(
          application.prepareReviewBatch([review], "ambiguous-domain"),
        )).rejects.toBeInstanceOf(TradeReviewCommitStatusUncertainError);
        expect(store.commitCalls).toBe(2);
        expect((await store.load()).tradeReviews).toEqual([]);
      } finally {
        await application.close();
      }
    },
  );

  it("keeps a later domain response uncertain when the first rejection reason is undefined", async () => {
    class UndefinedThenDomainStore extends SessionJournalStore {
      commitCalls = 0;

      override async commitTradeReviews(
        _command: PreparedTradeReviewBatch,
      ): Promise<TradeReviewCommitResult> {
        this.commitCalls += 1;
        if (this.commitCalls === 1) throw undefined;
        throw new JournalTradeReviewError({
          code: "review_changed",
          message: "A later domain response is not prior-attempt proof.",
        });
      }
    }

    const store = new UndefinedThenDomainStore();
    const application = new JournalApplication(store, "browser-session");
    try {
      const tradeSubjectId = await openTrade(store, "SAP", "6", 11);
      const review = application.prepareReview(reviewInput(
        "7".repeat(64),
        tradeSubjectId,
      ));
      await expect(application.commitReviewsSafely(
        application.prepareReviewBatch([review], "undefined-then-domain"),
      )).rejects.toBeInstanceOf(TradeReviewCommitStatusUncertainError);
      expect(store.commitCalls).toBe(2);
      expect((await store.load()).tradeReviews).toEqual([]);
    } finally {
      await application.close();
    }
  });

  it("recovers an exact committed review batch by receipt after newer heads advance", async () => {
    class ReceiptRecoveryReviewStore extends SessionJournalStore {
      commitCalls = 0;
      blockLoads = false;

      override async load(): ReturnType<SessionJournalStore["load"]> {
        if (this.blockLoads) throw new Error("Native read response is unavailable.");
        return super.load();
      }

      seed(command: PreparedTradeReviewBatch): Promise<TradeReviewCommitResult> {
        return super.commitTradeReviews(command);
      }

      override async commitTradeReviews(
        command: PreparedTradeReviewBatch,
      ): Promise<TradeReviewCommitResult> {
        this.commitCalls += 1;
        return super.commitTradeReviews(command);
      }
    }

    const store = new ReceiptRecoveryReviewStore();
    const application = new JournalApplication(store, "browser-session");
    try {
      const firstSubject = await openTrade(store, "ORCL", "c", 12);
      const secondSubject = await openTrade(store, "CSCO", "d", 13);
      const first = application.prepareReview(reviewInput(
        "e".repeat(64),
        firstSubject,
      ));
      const second = application.prepareReview(reviewInput(
        "f".repeat(64),
        secondSubject,
        { note: "Protected the second setup." },
      ));
      const exactBatch = application.prepareReviewBatch(
        [second, first],
        "historical-exact-batch",
      );
      expect(Object.isFrozen(exactBatch)).toBe(true);
      expect(Object.isFrozen(exactBatch.reviews)).toBe(true);

      store.blockLoads = true;
      await expect(application.commitReviewsSafely(exactBatch))
        .rejects.toBeInstanceOf(TradeReviewCommitStatusUncertainError);
      expect(store.commitCalls).toBe(2);

      store.blockLoads = false;
      const committed = await store.load();
      const originalBySubject = new Map(
        committed.tradeReviews.map((review) => [review.tradeSubjectId, review] as const),
      );
      const laterFirst = prepareTradeReview(reviewInput(
        "1".repeat(64),
        firstSubject,
        {
          expectedPreviousReviewId: originalBySubject.get(firstSubject)?.id ?? null,
          note: "A later first-subject review.",
        },
      ));
      const laterSecond = prepareTradeReview(reviewInput(
        "2".repeat(64),
        secondSubject,
        {
          expectedPreviousReviewId: originalBySubject.get(secondSubject)?.id ?? null,
          note: "A later second-subject review.",
        },
      ));
      await store.seed({
        batchId: "later-heads",
        revision: tradeReviewBatchRevision("later-heads", [laterFirst, laterSecond]),
        reviews: [laterFirst, laterSecond],
      });

      const recovered = await application.commitReviewsSafely(exactBatch);
      expect(recovered).toMatchObject({ outcome: "duplicate" });
      expect(recovered.reviewIds).toEqual([
        originalBySubject.get(secondSubject)?.id,
        originalBySubject.get(firstSubject)?.id,
      ]);
      expect(recovered.ledger.tradeReviews).toEqual(expect.arrayContaining([
        expect.objectContaining({
          tradeSubjectId: firstSubject,
          version: 2,
          revision: laterFirst.revision,
        }),
        expect.objectContaining({
          tradeSubjectId: secondSubject,
          version: 2,
          revision: laterSecond.revision,
        }),
      ]));
      expect(store.commitCalls).toBe(3);
    } finally {
      await application.close();
    }
  });

  it("does not prove identical review content saved under a different submission", async () => {
    class SameContentDifferentReviewSubmissionStore extends SessionJournalStore {
      commitCalls = 0;

      seed(command: PreparedTradeReviewBatch): Promise<TradeReviewCommitResult> {
        return super.commitTradeReviews(command);
      }

      override async commitTradeReviews(
        _command: PreparedTradeReviewBatch,
      ): Promise<TradeReviewCommitResult> {
        this.commitCalls += 1;
        throw new Error("Native bridge is unavailable.");
      }
    }

    const store = new SameContentDifferentReviewSubmissionStore();
    const application = new JournalApplication(store, "browser-session");
    try {
      const tradeSubjectId = await openTrade(store, "INTC", "3", 14);
      const exact = application.prepareReview(reviewInput(
        "4".repeat(64),
        tradeSubjectId,
      ));
      const differentSubmission = application.prepareReview(reviewInput(
        "5".repeat(64),
        tradeSubjectId,
      ));
      expect(differentSubmission.revision).not.toBe(exact.revision);
      await store.seed({
        batchId: "different-submission",
        revision: tradeReviewBatchRevision(
          "different-submission",
          [differentSubmission],
        ),
        reviews: [differentSubmission],
      });

      await expect(application.commitReviewsSafely(
        application.prepareReviewBatch([exact], "exact-missing-submission"),
      )).rejects.toBeInstanceOf(TradeReviewCommitStatusUncertainError);
      expect(store.commitCalls).toBe(2);
      expect((await store.load()).tradeReviews).toEqual([
        expect.objectContaining({
          revision: differentSubmission.revision,
          note: exact.note,
        }),
      ]);
    } finally {
      await application.close();
    }
  });

  it("atomically tags selected heads without changing review state, content, or executions", async () => {
    const store = new SessionJournalStore({ nowMs: () => 1_800_000_000_000 });
    const application = new JournalApplication(store, "browser-session");
    try {
      const completedSubject = await openTrade(store, "NVDA", "3", 12);
      const draftSubject = await openTrade(store, "TSLA", "4", 13);
      const newSubject = await openTrade(store, "AMD", "5", 14);
      const completed = application.prepareReview(reviewInput(
        "6".repeat(64),
        completedSubject,
      ));
      const draft = application.prepareReview(reviewInput(
        "7".repeat(64),
        draftSubject,
        {
          state: "draft",
          note: "Draft reflection.",
          setup: null,
          mistakes: [],
          tags: ["Watchlist"],
          emotion: null,
          playbook: null,
          initialRisk: null,
          plannedStop: null,
        },
      ));
      await application.commitReviews(application.prepareReviewBatch(
        [completed, draft],
        "seed-review-heads",
      ));
      const executionsBefore = (await store.load()).executions;

      const result = await application.addTagToTrades(
        [completedSubject, draftSubject, newSubject],
        "  Earnings   day  ",
      );
      const bySubject = new Map(
        result.ledger.tradeReviews.map((review) => [review.tradeSubjectId, review] as const),
      );

      expect(bySubject.get(completedSubject)).toMatchObject({
        version: 2,
        state: "completed",
        note: "Waited for the planned entry.",
        setup: "Opening range break",
        mistakes: ["Entered early"],
        emotion: "Focused",
        tags: ["Morning", "Earnings day"],
        playbookName: "ORB",
      });
      expect(bySubject.get(draftSubject)).toMatchObject({
        version: 2,
        state: "draft",
        note: "Draft reflection.",
        tags: ["Watchlist", "Earnings day"],
      });
      expect(bySubject.get(newSubject)).toMatchObject({
        version: 1,
        state: "draft",
        note: "",
        tags: ["Earnings day"],
        completedAtUs: null,
      });
      expect(result.ledger.executions).toEqual(executionsBefore);
    } finally {
      await application.close();
    }
  });

  it("passes through a stale-head conflict and leaves the rest of the tag batch untouched", async () => {
    class ConcurrentReviewStore extends SessionJournalStore {
      private injectConcurrentHead = true;

      override async commitTradeReviews(
        command: PreparedTradeReviewBatch,
      ): Promise<TradeReviewCommitResult> {
        if (!this.injectConcurrentHead) return super.commitTradeReviews(command);
        this.injectConcurrentHead = false;
        const target = command.reviews[0];
        if (target === undefined) throw new Error("Expected a target review.");
        const competing = prepareTradeReview({
          submissionId: "b".repeat(64),
          tradeSubjectId: target.tradeSubjectId,
          expectedPreviousReviewId: target.expectedPreviousReviewId,
          state: "draft",
          note: "Concurrent edit.",
          setup: null,
          mistakes: [],
          tags: [],
          emotion: null,
          playbook: null,
          initialRisk: null,
          plannedStop: null,
        });
        await super.commitTradeReviews({
          batchId: "concurrent-review",
          revision: tradeReviewBatchRevision("concurrent-review", [competing]),
          reviews: [competing],
        });
        return super.commitTradeReviews(command);
      }
    }

    const store = new ConcurrentReviewStore();
    const application = new JournalApplication(store, "browser-session");
    try {
      const staleSubject = await openTrade(store, "META", "8", 15);
      const untouchedSubject = await openTrade(store, "GOOG", "9", 16);
      const executionsBefore = (await store.load()).executions;

      const conflict = await application.addTagToTrades(
        [staleSubject, untouchedSubject],
        "Gap up",
      ).then(
        () => { throw new Error("Expected the stale review batch to fail."); },
        (error: unknown) => error,
      );

      expect(conflict).toBeInstanceOf(JournalTradeReviewError);
      expect((conflict as JournalTradeReviewError).conflict.code).toBe("review_changed");
      const ledger = await store.load();
      expect(ledger.tradeReviews).toHaveLength(1);
      expect(ledger.tradeReviews[0]).toMatchObject({
        tradeSubjectId: staleSubject,
        note: "Concurrent edit.",
        tags: [],
      });
      expect(ledger.tradeReviews.some((review) => (
        review.tradeSubjectId === untouchedSubject
      ))).toBe(false);
      expect(ledger.executions).toEqual(executionsBefore);
    } finally {
      await application.close();
    }
  });
});

describe("JournalApplication daily-journal recovery", () => {
  function preparedDaily(): PreparedDailyJournalEntry {
    return prepareDailyJournalEntry({
      submissionId: "9".repeat(64),
      isoDate: "2026-07-13",
      expectedPreviousEntryId: null,
      state: "completed",
      title: "Protected the process",
      note: "Waited for confirmation.",
      emotion: "Focused",
      processScorePct: 90,
      tags: ["Patient"],
    });
  }

  it("passes through one deterministic stale-head failure and exposes only the competing head", async () => {
    class ConcurrentDailyStore extends SessionJournalStore {
      commitCalls = 0;
      private injectConcurrentHead = true;

      override async commitDailyJournalEntry(
        command: PreparedDailyJournalEntry,
      ): Promise<DailyJournalCommitResult> {
        this.commitCalls += 1;
        if (!this.injectConcurrentHead) return super.commitDailyJournalEntry(command);
        this.injectConcurrentHead = false;
        const competing = prepareDailyJournalEntry({
          submissionId: "8".repeat(64),
          isoDate: command.isoDate,
          expectedPreviousEntryId: command.expectedPreviousEntryId,
          state: "draft",
          title: "Saved on another screen",
          note: "The newer immutable daily reflection.",
          emotion: "Calm",
          processScorePct: 80,
          tags: ["Concurrent"],
        });
        await super.commitDailyJournalEntry(competing);
        return super.commitDailyJournalEntry(command);
      }
    }

    const store = new ConcurrentDailyStore();
    const application = new JournalApplication(store, "browser-session");
    try {
      await openTrade(store, "AAPL", "7", 11);
      const conflict = await application.commitDailyJournalSafely(preparedDaily()).then(
        () => { throw new Error("Expected the stale daily reflection to fail."); },
        (error: unknown) => error,
      );

      expect(conflict).toBeInstanceOf(JournalDailyEntryError);
      expect((conflict as JournalDailyEntryError).conflict.code).toBe("entry_changed");
      expect(store.commitCalls).toBe(1);
      const fresh = await application.loadWorkspace();
      expect(fresh.dailyJournal).toEqual([
        expect.objectContaining({
          isoDate: "2026-07-13",
          version: 1,
          title: "Saved on another screen",
          note: "The newer immutable daily reflection.",
        }),
      ]);
    } finally {
      await application.close();
    }
  });

  it("reconciles a committed daily reflection after both bridge responses are lost", async () => {
    class LostDailyResponseStore extends SessionJournalStore {
      commitCalls = 0;

      override async commitDailyJournalEntry(
        command: PreparedDailyJournalEntry,
      ): Promise<DailyJournalCommitResult> {
        this.commitCalls += 1;
        await super.commitDailyJournalEntry(command);
        throw new Error("Native bridge lost the committed response.");
      }
    }

    const store = new LostDailyResponseStore();
    const application = new JournalApplication(store, "browser-session");
    try {
      await openTrade(store, "AAPL", "8", 10);
      const command = preparedDaily();
      const result = await application.commitDailyJournalSafely(command);
      expect(result).toMatchObject({
        outcome: "duplicate",
        entryVersionId: result.ledger.dailyEntries[0]?.id,
      });
      expect(store.commitCalls).toBe(2);
      expect(result.ledger.dailyEntries).toEqual([
        expect.objectContaining({ revision: command.revision, version: 1 }),
      ]);
    } finally {
      await application.close();
    }
  });

  it("recovers the exact committed submission by receipt after a newer head advances", async () => {
    class ReceiptRecoveryDailyStore extends SessionJournalStore {
      commitCalls = 0;
      blockLoads = false;

      override async load(): ReturnType<SessionJournalStore["load"]> {
        if (this.blockLoads) throw new Error("Native read response is unavailable.");
        return super.load();
      }

      override async commitDailyJournalEntry(
        command: PreparedDailyJournalEntry,
      ): Promise<DailyJournalCommitResult> {
        this.commitCalls += 1;
        return super.commitDailyJournalEntry(command);
      }
    }

    const store = new ReceiptRecoveryDailyStore();
    const application = new JournalApplication(store, "browser-session");
    try {
      await openTrade(store, "AAPL", "8", 10);
      const exactCommand = preparedDaily();
      expect(Object.isFrozen(exactCommand)).toBe(true);
      expect(Object.isFrozen(exactCommand.tags)).toBe(true);

      store.blockLoads = true;
      await expect(application.commitDailyJournalSafely(exactCommand))
        .rejects.toBeInstanceOf(DailyJournalCommitStatusUncertainError);
      expect(store.commitCalls).toBe(2);

      store.blockLoads = false;
      const committedHead = (await store.load()).dailyEntries[0];
      if (committedHead === undefined) throw new Error("Expected the uncertain save to have committed.");
      const competing = prepareDailyJournalEntry({
        submissionId: "8".repeat(64),
        isoDate: exactCommand.isoDate,
        expectedPreviousEntryId: committedHead.id,
        state: "draft",
        title: "Saved after the lost response",
        note: "A later writer advanced the current head.",
        emotion: "Calm",
        processScorePct: 80,
        tags: ["Later"],
      });
      await store.commitDailyJournalEntry(competing);

      const recovered = await application.commitDailyJournalSafely(exactCommand);
      expect(recovered).toMatchObject({
        outcome: "duplicate",
        entryVersionId: committedHead.id,
      });
      expect(recovered.ledger.dailyEntries).toEqual([
        expect.objectContaining({
          version: 2,
          revision: competing.revision,
          title: "Saved after the lost response",
        }),
      ]);
      expect(store.commitCalls).toBe(4);
    } finally {
      await application.close();
    }
  });

  it("does not reconcile identical authored content from a different submission", async () => {
    class SameContentDifferentSubmissionStore extends SessionJournalStore {
      commitCalls = 0;

      seed(command: PreparedDailyJournalEntry): Promise<DailyJournalCommitResult> {
        return super.commitDailyJournalEntry(command);
      }

      override async commitDailyJournalEntry(
        _command: PreparedDailyJournalEntry,
      ): Promise<DailyJournalCommitResult> {
        this.commitCalls += 1;
        throw new Error("Native bridge is unavailable.");
      }
    }

    const store = new SameContentDifferentSubmissionStore();
    const application = new JournalApplication(store, "browser-session");
    try {
      await openTrade(store, "AAPL", "8", 10);
      const exactCommand = preparedDaily();
      const differentSubmission = prepareDailyJournalEntry({
        submissionId: "7".repeat(64),
        isoDate: exactCommand.isoDate,
        expectedPreviousEntryId: exactCommand.expectedPreviousEntryId,
        state: exactCommand.state,
        title: exactCommand.title,
        note: exactCommand.note,
        emotion: exactCommand.emotion,
        processScorePct: exactCommand.processScorePct,
        tags: exactCommand.tags,
      });
      expect(differentSubmission.revision).not.toBe(exactCommand.revision);
      await store.seed(differentSubmission);

      await expect(application.commitDailyJournalSafely(exactCommand))
        .rejects.toBeInstanceOf(DailyJournalCommitStatusUncertainError);
      expect(store.commitCalls).toBe(2);
      expect((await store.load()).dailyEntries).toEqual([
        expect.objectContaining({
          revision: differentSubmission.revision,
          note: exactCommand.note,
        }),
      ]);
    } finally {
      await application.close();
    }
  });

  it("keeps an unqueryable daily-reflection save explicitly uncertain", async () => {
    class UnavailableDailyStore extends SessionJournalStore {
      commitCalls = 0;

      override async commitDailyJournalEntry(
        _command: PreparedDailyJournalEntry,
      ): Promise<DailyJournalCommitResult> {
        this.commitCalls += 1;
        throw new Error("Native bridge is unavailable.");
      }
    }

    const store = new UnavailableDailyStore();
    const application = new JournalApplication(store, "browser-session");
    try {
      await openTrade(store, "AAPL", "7", 11);
      await expect(application.commitDailyJournalSafely(preparedDaily()))
        .rejects.toBeInstanceOf(DailyJournalCommitStatusUncertainError);
      expect(store.commitCalls).toBe(2);
      expect((await store.load()).dailyEntries).toEqual([]);
    } finally {
      await application.close();
    }
  });
});

describe("JournalApplication user-data export", () => {
  it("delegates a local export and returns a self-verifying archive artifact", async () => {
    const store = new SessionJournalStore({ nowMs: () => 1_750_000_000_000 });
    const application = new JournalApplication(store, "browser-session");
    try {
      const artifact = await application.exportUserData();
      const parsed = parseJournalArchive(artifact.contents);

      expect(parsed).toEqual(artifact.archive);
      expect(parsed).toMatchObject({
        kind: "hermes-journal-export",
        formatVersion: 1,
        payload: { kind: "browser-session-state", version: 2 },
      });
      expect(artifact.fileName).toMatch(/^hermes-journal-export-.*\.json$/);
    } finally {
      await application.close();
    }
  });

  it("never exports the hidden local journal while the fictional demo is visible", async () => {
    class ObservedStore extends SessionJournalStore {
      exportCalls = 0;

      override async exportUserData() {
        this.exportCalls += 1;
        return super.exportUserData();
      }
    }

    const store = new ObservedStore();
    const application = new JournalApplication(store, "browser-session");
    try {
      await application.exploreDemo();
      await expect(application.exportUserData()).rejects.toThrow(/local journal/);
      expect(store.exportCalls).toBe(0);

      await application.startJournal();
      await application.exportUserData();
      expect(store.exportCalls).toBe(1);
    } finally {
      await application.close();
    }
  });
});

describe("JournalApplication user-data restore", () => {
  it("reconciles an exact committed restore after the first bridge response is lost", async () => {
    class LostRestoreResponseStore extends SessionJournalStore {
      commitCalls = 0;

      override async commitUserDataRestore(
        command: PreparedJournalRestore,
      ): Promise<JournalRestoreCommitResult> {
        this.commitCalls += 1;
        const result = await super.commitUserDataRestore(command);
        if (this.commitCalls === 1) throw new Error("Native bridge response was lost.");
        return result;
      }
    }

    const source = new SessionJournalStore({ nowMs: () => 1_750_000_000_000 });
    const destination = new LostRestoreResponseStore({ nowMs: () => 1_750_000_001_000 });
    const application = new JournalApplication(destination, "browser-session");
    try {
      await openTrade(source, "AAPL", "a", 10);
      const artifact = await source.exportUserData();
      const prepared = await application.prepareUserDataRestore(artifact.contents);

      expect(prepared.preview.target).toBe("empty");
      const recovered = await application.commitUserDataRestoreSafely(prepared);

      expect(recovered.outcome).toBe("already-restored");
      expect(destination.commitCalls).toBe(2);
      expect(recovered.ledger.executions).toHaveLength(1);
      expect((await destination.load()).executions).toHaveLength(1);
    } finally {
      await application.close();
      await source.close();
    }
  });

  it("does not retry a deterministic restore conflict", async () => {
    class ConflictStore extends SessionJournalStore {
      commitCalls = 0;

      override async commitUserDataRestore(
        _command: PreparedJournalRestore,
      ): Promise<JournalRestoreCommitResult> {
        this.commitCalls += 1;
        throw new JournalRestoreError({
          code: "journal_not_empty",
          message: "Restore requires an empty journal.",
        });
      }
    }

    const source = new SessionJournalStore();
    const destination = new ConflictStore();
    const application = new JournalApplication(destination, "browser-session");
    try {
      await openTrade(source, "MSFT", "b", 11);
      const prepared = await application.prepareUserDataRestore(
        (await source.exportUserData()).contents,
      );

      await expect(application.commitUserDataRestoreSafely(prepared))
        .rejects.toBeInstanceOf(JournalRestoreError);
      expect(destination.commitCalls).toBe(1);
    } finally {
      await application.close();
      await source.close();
    }
  });

  it("never reaches the private restore store while the fictional demo is visible", async () => {
    class ObservedRestoreStore extends SessionJournalStore {
      prepareCalls = 0;
      commitCalls = 0;

      override async prepareUserDataRestore(contents: string): Promise<PreparedJournalRestore> {
        this.prepareCalls += 1;
        return super.prepareUserDataRestore(contents);
      }

      override async commitUserDataRestore(
        command: PreparedJournalRestore,
      ): Promise<JournalRestoreCommitResult> {
        this.commitCalls += 1;
        return super.commitUserDataRestore(command);
      }
    }

    const source = new SessionJournalStore();
    const destination = new ObservedRestoreStore();
    const application = new JournalApplication(destination, "browser-session");
    try {
      await openTrade(source, "NVDA", "c", 12);
      const contents = (await source.exportUserData()).contents;
      const prepared = await application.prepareUserDataRestore(contents);
      expect(destination.prepareCalls).toBe(1);

      await application.exploreDemo();
      await expect(application.prepareUserDataRestore(contents)).rejects.toThrow(/local journal/);
      await expect(application.commitUserDataRestore(prepared)).rejects.toThrow(/local journal/);
      expect(destination.prepareCalls).toBe(1);
      expect(destination.commitCalls).toBe(0);
    } finally {
      await application.close();
      await source.close();
    }
  });

  it("keeps a repeatedly unqueryable restore status explicit", async () => {
    class UnavailableRestoreStore extends SessionJournalStore {
      commitCalls = 0;

      override async commitUserDataRestore(
        _command: PreparedJournalRestore,
      ): Promise<JournalRestoreCommitResult> {
        this.commitCalls += 1;
        throw new Error("Native bridge is unavailable.");
      }
    }

    const source = new SessionJournalStore();
    const destination = new UnavailableRestoreStore();
    const application = new JournalApplication(destination, "browser-session");
    try {
      await openTrade(source, "META", "d", 13);
      const prepared = await application.prepareUserDataRestore(
        (await source.exportUserData()).contents,
      );

      await expect(application.commitUserDataRestoreSafely(prepared))
        .rejects.toBeInstanceOf(JournalRestoreCommitStatusUncertainError);
      expect(destination.commitCalls).toBe(2);
      expect((await destination.load()).executions).toHaveLength(0);
    } finally {
      await application.close();
      await source.close();
    }
  });
});
