import { describe, expect, it } from "vitest";

import {
  createManualExecutionSubmissionId,
  prepareManualExecution,
  verifyPreparedManualExecution,
  type ManualExecutionInput,
} from "./prepare-manual-execution";

function input(overrides: Partial<ManualExecutionInput> = {}): ManualExecutionInput {
  return {
    submissionId: "a".repeat(64),
    accountName: "Main brokerage",
    timeZone: "America/New_York",
    defaultCurrency: "USD",
    symbol: "AAPL",
    assetClass: "stock",
    side: "BUY",
    positionEffect: "OPEN",
    quantity: "2",
    price: "100",
    fee: "0.10",
    executedAt: "2026-07-12T09:30:00",
    ...overrides,
  };
}

describe("prepared manual execution", () => {
  it("creates a stable reviewed command and reverifies it", () => {
    const prepared = prepareManualExecution(input());
    expect(prepared.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(verifyPreparedManualExecution(prepared)).toEqual(prepared);
  });

  it("detects any post-review mutation", () => {
    const prepared = prepareManualExecution(input());
    expect(() => verifyPreparedManualExecution({
      ...prepared,
      price: "101",
    })).toThrow(/changed after review/);
  });

  it("does not treat two independent identical fills as one submission", () => {
    const first = prepareManualExecution(input({ submissionId: "1".repeat(64) }));
    const second = prepareManualExecution(input({ submissionId: "2".repeat(64) }));
    expect(first.revision).not.toBe(second.revision);
  });

  it("requires a 256-bit lowercase hex submission identifier", () => {
    expect(() => prepareManualExecution(input({ submissionId: "not-an-id" })))
      .toThrow(/submission ID is invalid/);
  });

  it("creates cryptographically shaped identifiers", () => {
    const first = createManualExecutionSubmissionId();
    const second = createManualExecutionSubmissionId();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });
});
