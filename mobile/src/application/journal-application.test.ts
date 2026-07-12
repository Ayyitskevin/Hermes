import { describe, expect, it } from "vitest";

import { SessionJournalStore } from "../adapters/session-journal-store";
import type { ManualExecutionCommitResult } from "./journal-store";
import {
  JournalApplication,
  ManualExecutionCommitStatusUncertainError,
} from "./journal-application";
import {
  type PreparedManualExecution,
  prepareManualExecution,
} from "./prepare-manual-execution";

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
