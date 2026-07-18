import { describe, expect, it } from "vitest";

import type { JournalImportReceipt } from "./journal-store";
import type {
  ImportHistoryPreview,
  JournalWorkspaceSnapshot,
  TradePreview,
} from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  buildImportReceiptReviewContinuation,
} from "./import-receipt-review-continuation";

const RECEIPT_ID = "receipt:csv-review";
const ACCOUNT_ID = DEMO_WORKSPACE.accountOptions[0]!.id;
const ACCOUNT_LABEL = DEMO_WORKSPACE.accountOptions[0]!.label;

function accountTrades(): readonly TradePreview[] {
  return DEMO_WORKSPACE.trades.filter((trade) => trade.accountId === ACCOUNT_ID);
}

function withExecutionIds(
  trade: TradePreview,
  executionIds: readonly string[],
): TradePreview {
  const source = trade.executions[0];
  if (source === undefined) throw new Error("Trade fixture has no execution allocation.");
  return {
    ...trade,
    executions: executionIds.map((executionId, index) => ({
      ...source,
      allocationId: `${source.allocationId}:csv:${index}`,
      executionId,
    })),
  };
}

function receipt(
  overrides: Partial<JournalImportReceipt> = {},
): JournalImportReceipt {
  return {
    id: RECEIPT_ID,
    accountId: ACCOUNT_ID,
    accountName: ACCOUNT_LABEL,
    sourceName: "linked.csv",
    importedAtUs: "1784295000000000",
    sourceRows: 3,
    acceptedRows: 3,
    rejectedRows: 0,
    skippedRows: 0,
    warningCount: 1,
    executionCount: 2,
    rolledBackAtUs: null,
    ...overrides,
  };
}

function history(
  exactReceipt: JournalImportReceipt,
  overrides: Partial<ImportHistoryPreview> = {},
): ImportHistoryPreview {
  return {
    receiptId: exactReceipt.id,
    accountLabel: exactReceipt.accountName,
    sourceLabel: exactReceipt.sourceName,
    importedAtLabel: "Imported Jul 17, 2026 · 9:30 AM",
    executions: exactReceipt.acceptedRows,
    accounts: 1,
    sourceRows: exactReceipt.sourceRows,
    acceptedRows: exactReceipt.acceptedRows,
    executionVersions: exactReceipt.executionCount,
    rejectedRows: exactReceipt.rejectedRows,
    skippedRows: exactReceipt.skippedRows,
    warningCount: exactReceipt.warningCount,
    rolledBack: exactReceipt.rolledBackAtUs !== null,
    rolledBackAtLabel: exactReceipt.rolledBackAtUs === null
      ? null
      : "Rolled back Jul 17, 2026 · 10:30 AM",
    ...overrides,
  };
}

function localSnapshot(
  trades: readonly TradePreview[],
  exactReceipt = receipt(),
): JournalWorkspaceSnapshot {
  const counts = new Map<string, number>();
  for (const trade of trades) {
    counts.set(trade.accountId, (counts.get(trade.accountId) ?? 0) + 1);
  }
  return {
    ...DEMO_WORKSPACE,
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
    accountOptions: DEMO_WORKSPACE.accountOptions.map((account) => ({
      ...account,
      tradeCount: counts.get(account.id) ?? 0,
    })),
    importHistory: [history(exactReceipt)],
    trades,
  };
}

describe("generic CSV receipt-to-review continuation", () => {
  it("conserves accepted occurrences before deduping many executions into one trade", () => {
    const first = withExecutionIds(accountTrades()[0]!, ["execution:a", "execution:b"]);
    const exactReceipt = receipt();
    const snapshot = localSnapshot([
      first,
      ...DEMO_WORKSPACE.trades.filter((trade) => trade.tradeSubjectId !== first.tradeSubjectId),
    ], exactReceipt);

    const continuation = buildImportReceiptReviewContinuation(snapshot, {
      receipt: exactReceipt,
      occurrenceExecutionIds: ["execution:a", "execution:a", "execution:b"],
    });

    expect(continuation).toMatchObject({
      receiptId: RECEIPT_ID,
      accountId: ACCOUNT_ID,
      accountLabel: ACCOUNT_LABEL,
      sourceLabel: "linked.csv",
      importedAtLabel: "Imported Jul 17, 2026 · 9:30 AM",
      acceptedRows: 3,
      executionVersions: 2,
      alreadyPresentRows: 1,
      occurrenceCount: 3,
      uniqueExecutionCount: 2,
      tradeSubjectIds: [first.tradeSubjectId],
    });
    expect(continuation.scope.state).toMatchObject({
      accountId: ACCOUNT_ID,
      activityFrom: null,
      activityThrough: null,
      selectedDay: null,
      query: "",
      assetClass: "all",
      direction: "all",
      positionState: "all",
      reviewState: "all",
      setup: null,
      mistake: null,
      emotion: null,
      tag: null,
    });
    expect(Object.isFrozen(continuation)).toBe(true);
    expect(Object.isFrozen(continuation.tradeSubjectIds)).toBe(true);
  });

  it("routes all-already-present accepted rows and keeps canonical scope order", () => {
    const first = withExecutionIds(accountTrades()[0]!, ["execution:shared"]);
    const second = withExecutionIds(accountTrades()[1]!, ["execution:other"]);
    const exactReceipt = receipt({
      sourceRows: 3,
      acceptedRows: 3,
      warningCount: 3,
      executionCount: 0,
    });
    const snapshot = localSnapshot([
      second,
      ...DEMO_WORKSPACE.trades.filter((trade) => (
        trade.tradeSubjectId !== first.tradeSubjectId
        && trade.tradeSubjectId !== second.tradeSubjectId
      )),
      first,
    ], exactReceipt);

    const continuation = buildImportReceiptReviewContinuation(snapshot, {
      receipt: exactReceipt,
      occurrenceExecutionIds: ["execution:shared", "execution:shared", "execution:other"],
    });
    const expected = continuation.scope.evidence
      .map((evidence) => evidence.trade.tradeSubjectId)
      .filter((subjectId) => (
        subjectId === first.tradeSubjectId || subjectId === second.tradeSubjectId
      ));

    expect(continuation.executionVersions).toBe(0);
    expect(continuation.alreadyPresentRows).toBe(3);
    expect(continuation.uniqueExecutionCount).toBe(2);
    expect(continuation.tradeSubjectIds).toEqual(expected);
  });

  it("supports one exact AUTO reversal execution contributing to two subjects", () => {
    const exitSource = accountTrades()[0]!;
    const entrySource = accountTrades()[1]!;
    const allocation = exitSource.executions[0]!;
    const common = {
      ...allocation,
      executionId: "execution:reversal",
      side: "sell" as const,
      occurredAt: "2026-07-09T15:30:00Z",
      price: "110",
      currency: "USD",
    };
    const exit: TradePreview = {
      ...exitSource,
      side: "long",
      status: "closed",
      executions: [{ ...common, allocationId: "allocation:reversal:exit", effect: "exit" }],
    };
    const entry: TradePreview = {
      ...entrySource,
      accountId: exit.accountId,
      accountLabel: exit.accountLabel,
      symbol: exit.symbol,
      assetClass: exit.assetClass,
      side: "short",
      status: "open",
      executions: [{ ...common, allocationId: "allocation:reversal:entry", effect: "entry" }],
    };
    const exactReceipt = receipt({
      sourceRows: 1,
      acceptedRows: 1,
      warningCount: 0,
      executionCount: 1,
    });
    const snapshot = localSnapshot([
      exit,
      ...DEMO_WORKSPACE.trades.filter((trade) => (
        trade.tradeSubjectId !== exit.tradeSubjectId
        && trade.tradeSubjectId !== entry.tradeSubjectId
      )),
      entry,
    ], exactReceipt);

    const continuation = buildImportReceiptReviewContinuation(snapshot, {
      receipt: exactReceipt,
      occurrenceExecutionIds: ["execution:reversal"],
    });

    expect(continuation.tradeSubjectIds).toEqual(expect.arrayContaining([
      exit.tradeSubjectId,
      entry.tradeSubjectId,
    ]));
    expect(continuation.tradeSubjectIds).toHaveLength(2);
  });

  it("fails closed for rolled-back, mismatched, malformed, missing, and cross-account evidence", () => {
    const first = withExecutionIds(accountTrades()[0]!, ["execution:a"]);
    const baseReceipt = receipt({ sourceRows: 1, acceptedRows: 1, executionCount: 1, warningCount: 0 });
    const snapshot = localSnapshot([
      first,
      ...DEMO_WORKSPACE.trades.filter((trade) => trade.tradeSubjectId !== first.tradeSubjectId),
    ], baseReceipt);

    expect(() => buildImportReceiptReviewContinuation(snapshot, {
      receipt: baseReceipt,
      occurrenceExecutionIds: [],
    })).toThrow(/accepted occurrence/i);
    expect(() => buildImportReceiptReviewContinuation(snapshot, {
      receipt: baseReceipt,
      occurrenceExecutionIds: [" padded "],
    })).toThrow(/execution identity/i);
    expect(() => buildImportReceiptReviewContinuation(snapshot, {
      receipt: baseReceipt,
      occurrenceExecutionIds: ["execution:missing"],
    })).toThrow(/current trade/i);

    const rolledBack = receipt({
      sourceRows: 1,
      acceptedRows: 1,
      executionCount: 1,
      warningCount: 0,
      rolledBackAtUs: "1784298600000000",
    });
    expect(() => buildImportReceiptReviewContinuation(
      localSnapshot(snapshot.trades, rolledBack),
      { receipt: rolledBack, occurrenceExecutionIds: ["execution:a"] },
    )).toThrow(/active receipt/i);

    const otherAccountTrade = withExecutionIds(
      DEMO_WORKSPACE.trades.find((trade) => trade.accountId !== ACCOUNT_ID)!,
      ["execution:other-account"],
    );
    expect(() => buildImportReceiptReviewContinuation(
      localSnapshot([first, otherAccountTrade], receipt({
        sourceRows: 2,
        acceptedRows: 2,
        executionCount: 2,
        warningCount: 0,
      })),
      {
        receipt: receipt({
          sourceRows: 2,
          acceptedRows: 2,
          executionCount: 2,
          warningCount: 0,
        }),
        occurrenceExecutionIds: ["execution:a", "execution:other-account"],
      },
    )).toThrow(/one stable account/i);
  });

  it("rejects demo provenance and receipt facts that do not match the visible history", () => {
    const first = withExecutionIds(accountTrades()[0]!, ["execution:a"]);
    const exactReceipt = receipt({ sourceRows: 1, acceptedRows: 1, executionCount: 1, warningCount: 0 });
    const snapshot = localSnapshot([first], exactReceipt);

    expect(() => buildImportReceiptReviewContinuation(
      { ...snapshot, provenance: "demo" },
      { receipt: exactReceipt, occurrenceExecutionIds: ["execution:a"] },
    )).toThrow(/private local journal/i);
    expect(() => buildImportReceiptReviewContinuation(
      { ...snapshot, importHistory: [history(exactReceipt, { acceptedRows: 2, executions: 2 })] },
      { receipt: exactReceipt, occurrenceExecutionIds: ["execution:a"] },
    )).toThrow(/receipt evidence/i);
  });
});
