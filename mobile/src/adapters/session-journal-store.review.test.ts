import { describe, expect, it } from "vitest";

import {
  JournalTradeReviewError,
  type PreparedTradeReviewBatch,
} from "../application/journal-store";
import { prepareCsvImport } from "../application/prepare-csv-import";
import {
  prepareManualExecution,
  type ManualExecutionInput,
} from "../application/prepare-manual-execution";
import {
  prepareTradeReview,
  tradeReviewBatchRevision,
  type PreparedTradeReview,
  type TradeReviewInput,
} from "../application/prepare-trade-review";
import { SessionJournalStore } from "./session-journal-store";

function manual(
  submissionDigit: string,
  symbol: string,
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
    fee: "0",
    executedAt: "2026-07-01T09:30:00",
    ...overrides,
  });
}

async function addClosedTrade(
  store: SessionJournalStore,
  symbol: string,
  entryDigit: string,
  exitDigit: string,
): Promise<string> {
  await store.commitManualExecution(manual(entryDigit, symbol));
  await store.commitManualExecution(manual(exitDigit, symbol, {
    side: "SELL",
    positionEffect: "CLOSE",
    price: "110",
    executedAt: "2026-07-01T10:30:00",
  }));
  const ledger = await store.load();
  const instrument = ledger.instruments.find((candidate) => candidate.symbol === symbol);
  const trade = ledger.projection.trades.find((candidate) => (
    candidate.instrumentId === instrument?.id
  ));
  const subject = ledger.tradeSubjects.find((candidate) => (
    candidate.projectionTradeId === trade?.id
  ));
  if (subject === undefined) throw new Error(`Trade subject for ${symbol} is missing.`);
  return subject.tradeSubjectId;
}

function review(
  submissionDigit: string,
  tradeSubjectId: string,
  overrides: Partial<TradeReviewInput> = {},
): PreparedTradeReview {
  return prepareTradeReview({
    submissionId: submissionDigit.repeat(64),
    tradeSubjectId,
    expectedPreviousReviewId: null,
    state: "completed",
    note: "Waited for confirmation and managed the exit deliberately.",
    setup: "Breakout",
    mistakes: ["FOMO"],
    tags: ["A+"],
    emotion: "Focused",
    playbook: {
      name: "Opening Drive",
      rules: [{ name: "Wait for volume", outcome: "followed" }],
    },
    initialRisk: { amount: "100", currency: "USD" },
    plannedStop: "95",
    ...overrides,
  });
}

function batch(batchId: string, reviews: readonly PreparedTradeReview[]): PreparedTradeReviewBatch {
  return {
    batchId,
    reviews,
    revision: tradeReviewBatchRevision(batchId, reviews),
  };
}

function expectConflictCode(error: unknown, code: JournalTradeReviewError["conflict"]["code"]): void {
  expect(error).toBeInstanceOf(JournalTradeReviewError);
  expect((error as JournalTradeReviewError).conflict.code).toBe(code);
}

describe("browser session trade reviews", () => {
  it("keeps immutable versions idempotent while reusing normalized review vocabulary", async () => {
    const times = [2_000, 1_000];
    const store = new SessionJournalStore({ nowMs: () => times.shift() ?? 1_000 });
    try {
      const tradeSubjectId = await addClosedTrade(store, "AAPL", "1", "2");
      const firstCommand = review("a", tradeSubjectId);
      const first = await store.commitTradeReviews(batch("first-review", [firstCommand]));
      const firstHead = first.ledger.tradeReviews[0];
      expect(first.outcome).toBe("committed");
      expect(firstHead).toMatchObject({
        id: first.reviewIds[0],
        tradeSubjectId,
        version: 1,
        state: "completed",
        resultRMetricId: "result-r",
        resultRMetricVersion: 1,
        percentReturnMetricId: "percent-return",
        percentReturnMetricVersion: 1,
        recordedAtUs: "2000000",
        completedAtUs: "2000000",
      });

      const duplicate = await store.commitTradeReviews(batch("first-review", [firstCommand]));
      expect(duplicate).toMatchObject({ outcome: "duplicate", reviewIds: first.reviewIds });

      if (firstHead === undefined) throw new Error("Expected the first review head.");
      const editCommand = review("b", tradeSubjectId, {
        expectedPreviousReviewId: firstHead.id,
        note: "Added a second immutable reflection.",
        setup: "breakout",
        mistakes: ["fomo"],
        tags: ["a+", "Momentum"],
        emotion: "focused",
        playbook: {
          name: "opening drive",
          rules: [
            { name: "wait for volume", outcome: "broken" },
            { name: "Respect the stop", outcome: "followed" },
          ],
        },
      });
      const edited = await store.commitTradeReviews(batch("edited-review", [editCommand]));
      expect(edited.outcome).toBe("committed");
      expect(edited.ledger.tradeReviews).toEqual([expect.objectContaining({
        id: edited.reviewIds[0],
        version: 2,
        setup: "Breakout",
        mistakes: ["FOMO"],
        tags: ["A+", "Momentum"],
        emotion: "Focused",
        playbookName: "Opening Drive",
        recordedAtUs: "2001000",
        completedAtUs: "2001000",
      })]);
      expect(edited.ledger.reviewTerms).toHaveLength(5);
      expect(edited.ledger.reviewTerms).toEqual(expect.arrayContaining([
        expect.objectContaining({ category: "setup", name: "Breakout" }),
        expect.objectContaining({ category: "mistake", name: "FOMO" }),
        expect.objectContaining({ category: "emotion", name: "Focused" }),
        expect.objectContaining({ category: "tag", name: "A+" }),
        expect.objectContaining({ category: "tag", name: "Momentum" }),
      ]));
      expect(edited.ledger.playbooks).toEqual([expect.objectContaining({
        name: "Opening Drive",
        rules: [
          expect.objectContaining({ text: "Wait for volume" }),
          expect.objectContaining({ text: "Respect the stop" }),
        ],
      })]);
      const visibleEdit = edited.ledger.tradeReviews[0];
      if (visibleEdit === undefined) throw new Error("Expected the edited review head.");
      expect(prepareTradeReview({
        submissionId: editCommand.submissionId,
        tradeSubjectId: visibleEdit.tradeSubjectId,
        expectedPreviousReviewId: editCommand.expectedPreviousReviewId,
        state: visibleEdit.state,
        note: visibleEdit.note,
        setup: visibleEdit.setup,
        mistakes: visibleEdit.mistakes,
        tags: visibleEdit.tags,
        emotion: visibleEdit.emotion,
        playbook: visibleEdit.playbookName === null ? null : {
          name: visibleEdit.playbookName,
          rules: visibleEdit.rules.map((rule) => ({
            name: rule.text,
            outcome: rule.outcome,
          })),
        },
        initialRisk: visibleEdit.initialRisk,
        plannedStop: visibleEdit.plannedStop,
      }).revision).toBe(visibleEdit.revision);

      const oldRetry = await store.commitTradeReviews(batch("first-review", [firstCommand]));
      expect(oldRetry).toMatchObject({ outcome: "duplicate", reviewIds: first.reviewIds });
      expect(oldRetry.ledger.tradeReviews[0]?.id).toBe(edited.reviewIds[0]);

      const changedSubmission = review("b", tradeSubjectId, {
        expectedPreviousReviewId: firstHead.id,
        note: "Same submission ID, changed values.",
      });
      await store.commitTradeReviews(batch("changed-submission", [changedSubmission]))
        .then(() => { throw new Error("Expected a submission conflict."); })
        .catch((error: unknown) => expectConflictCode(error, "submission_changed"));
      const staleEdit = review("c", tradeSubjectId, {
        expectedPreviousReviewId: firstHead.id,
        note: "Stale edit.",
      });
      await store.commitTradeReviews(batch("stale-edit", [staleEdit]))
        .then(() => { throw new Error("Expected an optimistic-lock conflict."); })
        .catch((error: unknown) => expectConflictCode(error, "review_changed"));
      expect((await store.load()).tradeReviews[0]?.id).toBe(edited.reviewIds[0]);
    } finally {
      await store.close();
    }
  });

  it("validates a whole batch before mutation and assigns monotonic review times", async () => {
    const store = new SessionJournalStore({ nowMs: () => 5_000 });
    try {
      const firstSubject = await addClosedTrade(store, "AAPL", "1", "2");
      const secondSubject = await addClosedTrade(store, "MSFT", "3", "4");
      const seedCommand = review("a", secondSubject);
      const seed = await store.commitTradeReviews(batch("seed", [seedCommand]));
      const seedHead = seed.ledger.tradeReviews[0];
      if (seedHead === undefined) throw new Error("Expected a seed review.");
      const beforeFailure = await store.load();
      const wouldLeak = review("d", firstSubject, {
        setup: "Would Leak",
        mistakes: [],
        tags: [],
        emotion: null,
        playbook: null,
      });
      await store.commitTradeReviews(batch("mixed-retry", [seedCommand, wouldLeak]))
        .then(() => { throw new Error("Expected a mixed retry conflict."); })
        .catch((error: unknown) => expectConflictCode(error, "submission_changed"));
      expect(await store.load()).toEqual(beforeFailure);
      const stale = review("e", secondSubject, {
        expectedPreviousReviewId: null,
        note: "Stale batch member.",
      });

      await store.commitTradeReviews(batch("atomic-failure", [wouldLeak, stale]))
        .then(() => { throw new Error("Expected an atomic batch conflict."); })
        .catch((error: unknown) => expectConflictCode(error, "review_changed"));
      expect(await store.load()).toEqual(beforeFailure);

      const tamperedBatch = { ...batch("tampered", [wouldLeak]), revision: "0".repeat(64) };
      await store.commitTradeReviews(tamperedBatch)
        .then(() => { throw new Error("Expected a batch-integrity conflict."); })
        .catch((error: unknown) => expectConflictCode(error, "review_changed"));
      const tamperedMember = {
        ...wouldLeak,
        note: "Changed after preparation.",
      } as PreparedTradeReview;
      await store.commitTradeReviews({
        ...batch("tampered-member", [wouldLeak]),
        reviews: [tamperedMember],
      })
        .then(() => { throw new Error("Expected a review-integrity conflict."); })
        .catch((error: unknown) => expectConflictCode(error, "review_changed"));
      const missingTrade = review("f", "session-trade:missing");
      await store.commitTradeReviews(batch("missing-trade", [missingTrade]))
        .then(() => { throw new Error("Expected an active-trade conflict."); })
        .catch((error: unknown) => expectConflictCode(error, "trade_changed"));
      const wrongRiskCurrency = review("0", firstSubject, {
        initialRisk: { amount: "100", currency: "EUR" },
      });
      await store.commitTradeReviews(batch("wrong-risk-currency", [wrongRiskCurrency]))
        .then(() => { throw new Error("Expected a risk-currency conflict."); })
        .catch((error: unknown) => expectConflictCode(error, "trade_changed"));

      const validEdit = review("e", secondSubject, {
        expectedPreviousReviewId: seedHead.id,
        note: "Fresh batch member.",
      });
      const validBatch = batch("atomic-success", [wouldLeak, validEdit]);
      const committed = await store.commitTradeReviews(validBatch);
      expect(committed.outcome).toBe("committed");
      expect(committed.reviewIds).toHaveLength(2);
      expect(committed.ledger.tradeReviews.map((item) => item.recordedAtUs)).toEqual([
        "5001000",
        "5002000",
      ]);
      expect(committed.ledger.tradeReviews.find((item) => item.tradeSubjectId === firstSubject))
        .toMatchObject({ setup: "Would Leak", version: 1 });
      expect(committed.ledger.tradeReviews.find((item) => item.tradeSubjectId === secondSubject))
        .toMatchObject({ version: 2 });
      expect(await store.commitTradeReviews(validBatch)).toMatchObject({
        outcome: "duplicate",
        reviewIds: committed.reviewIds,
      });
    } finally {
      await store.close();
    }
  });

  it("keeps a review through ordinary rebuilds but never transfers it to a new opening subject", async () => {
    const store = new SessionJournalStore({ nowMs: () => 7_000 });
    try {
      await store.commitManualExecution(manual("1", "AAPL"));
      const opened = await store.load();
      const originalSubject = opened.tradeSubjects[0]?.tradeSubjectId;
      if (originalSubject === undefined) throw new Error("Expected an open trade subject.");
      const saved = await store.commitTradeReviews(batch("open-review", [review(
        "a",
        originalSubject,
        { state: "draft", note: "Draft while the trade is open." },
      )]));
      await store.commitManualExecution(manual("2", "AAPL", {
        side: "SELL",
        positionEffect: "CLOSE",
        price: "110",
        executedAt: "2026-07-01T10:30:00",
      }));
      const rebuilt = await store.load();
      expect(rebuilt.tradeSubjects[0]?.tradeSubjectId).toBe(originalSubject);
      expect(rebuilt.tradeReviews[0]?.id).toBe(saved.reviewIds[0]);
    } finally {
      await store.close();
    }

    let nowMs = 8_000;
    const replacementStore = new SessionJournalStore({ nowMs: () => nowMs++ });
    const openingCsv = (executionId: string) => prepareCsvImport({
      rawInput: "Execution ID,Symbol,Side,Quantity,Price,Fee,Currency,Timestamp\r\n"
        + `${executionId},AAPL,BTO,1,100,0,USD,2026-07-01T13:30:00Z`,
      sourceName: `${executionId}.csv`,
      accountName: "Primary brokerage",
      timeZone: "America/New_York",
      defaultCurrency: "USD",
    });
    try {
      const firstImport = await replacementStore.commitCsvImport(openingCsv("original-open"));
      const originalSubject = firstImport.ledger.tradeSubjects[0]?.tradeSubjectId;
      if (originalSubject === undefined) throw new Error("Expected an imported trade subject.");
      const saved = await replacementStore.commitTradeReviews(batch("original-review", [
        review("b", originalSubject),
      ]));
      await replacementStore.rollbackImport(firstImport.receipt.id, "Replace the opening fill");
      const replacement = await replacementStore.commitCsvImport(openingCsv("replacement-open"));
      const replacementSubject = replacement.ledger.tradeSubjects[0]?.tradeSubjectId;
      expect(replacementSubject).toBeDefined();
      expect(replacementSubject).not.toBe(originalSubject);
      expect(replacement.ledger.tradeReviews).toEqual([expect.objectContaining({
        id: saved.reviewIds[0],
        tradeSubjectId: originalSubject,
      })]);
      expect(replacement.ledger.tradeReviews.some((item) => (
        item.tradeSubjectId === replacementSubject
      ))).toBe(false);
    } finally {
      await replacementStore.close();
    }
  });
});
