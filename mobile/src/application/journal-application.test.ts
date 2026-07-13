import { describe, expect, it } from "vitest";

import { SessionJournalStore } from "../adapters/session-journal-store";
import { parseJournalArchive } from "./journal-archive";
import type {
  ManualExecutionCommitResult,
  PreparedTradeReviewBatch,
  TradeReviewCommitResult,
} from "./journal-store";
import { JournalTradeReviewError } from "./journal-store";
import {
  JournalApplication,
  ManualExecutionCommitStatusUncertainError,
} from "./journal-application";
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
        payload: { kind: "browser-session-state", version: 1 },
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
