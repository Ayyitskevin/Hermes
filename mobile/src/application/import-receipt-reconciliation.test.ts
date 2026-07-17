import { describe, expect, it } from "vitest";

import type { ImportHistoryPreview } from "../core/types";
import { reconcileImportReceipt } from "./import-receipt-reconciliation";

function receipt(
  overrides: Partial<ImportHistoryPreview> = {},
): ImportHistoryPreview {
  return {
    receiptId: "receipt-1",
    accountLabel: "Primary brokerage",
    sourceLabel: "broker.csv",
    importedAtLabel: "Imported Jul 17, 2026 · 9:30 AM",
    executions: 4,
    accounts: 1,
    sourceRows: 6,
    acceptedRows: 4,
    executionVersions: 3,
    rejectedRows: 1,
    skippedRows: 1,
    warningCount: 2,
    rolledBack: false,
    rolledBackAtLabel: null,
    ...overrides,
  };
}

describe("import receipt reconciliation", () => {
  it("detaches and freezes exact row and execution-version accounting", () => {
    const result = reconcileImportReceipt(receipt());

    expect(result).toEqual({
      sourceRows: 6,
      acceptedRows: 4,
      rejectedRows: 1,
      skippedRows: 1,
      warningCount: 2,
      executionVersions: 3,
      alreadyPresentRows: 1,
      otherWarningCount: 1,
    });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it("allows a fully duplicated accepted cohort without calling it new", () => {
    expect(reconcileImportReceipt(receipt({
      executions: 2,
      sourceRows: 2,
      acceptedRows: 2,
      executionVersions: 0,
      rejectedRows: 0,
      skippedRows: 0,
      warningCount: 2,
    }))).toMatchObject({
      acceptedRows: 2,
      executionVersions: 0,
      alreadyPresentRows: 2,
      otherWarningCount: 0,
    });
  });

  it.each([
    ["missing receipt identity", { receiptId: "" }],
    ["negative count", { warningCount: -1 }],
    ["fractional count", { sourceRows: 6.5 }],
    ["row equation", { sourceRows: 7 }],
    ["legacy accepted alias", { executions: 3 }],
    ["execution-version ceiling", { executionVersions: 5 }],
    ["overlap warning floor", { warningCount: 0 }],
    ["active rollback label", { rolledBackAtLabel: "Rolled back later" }],
    ["missing rollback label", { rolledBack: true, rolledBackAtLabel: null }],
  ])("fails loudly for an invalid %s", (_label, overrides) => {
    expect(() => reconcileImportReceipt(receipt(overrides))).toThrow();
  });
});
