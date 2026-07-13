import { describe, expect, it } from "vitest";

import { sha256Hex } from "../adapters/sqlite/schema";
import {
  assertPreparedJournalRestoreRevision,
  createPreparedJournalRestore,
  type JournalRestorePreview,
} from "./journal-restore";

function verifiedPreview(
  overrides: Partial<Omit<JournalRestorePreview, "selectedFileSha256">> = {},
): Omit<JournalRestorePreview, "selectedFileSha256"> {
  return {
    archiveSha256: "a".repeat(64),
    stateSha256: "b".repeat(64),
    reportSha256: "c".repeat(64),
    exportedAtUs: "1800000000000000",
    payloadKind: "sqlite-table-set",
    payloadVersion: 1,
    target: "empty",
    summary: {
      workspaceName: "My Journal",
      currency: "USD",
      timeZone: "America/New_York",
      accounts: "1",
      activeExecutions: "2",
      executionVersions: "3",
      importReceipts: "1",
      rolledBackImports: "0",
      currentReviews: "1",
      reviewVersions: "2",
      reviewTerms: "3",
      playbooks: "1",
      attachments: "0",
      attachmentBytes: "0",
    },
    ...overrides,
  };
}

describe("prepared journal restore", () => {
  it("binds the exact selected text and every recomputed preview field", () => {
    const prepared = createPreparedJournalRestore("archive bytes\n", verifiedPreview());

    expect(prepared.preview.selectedFileSha256).toBe(sha256Hex("archive bytes\n"));
    expect(prepared.preview.target).toBe("empty");
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.preview)).toBe(true);
    expect(Object.isFrozen(prepared.preview.summary)).toBe(true);
    expect(() => assertPreparedJournalRestoreRevision(prepared)).not.toThrow();

    const changedTarget = createPreparedJournalRestore(
      "archive bytes\n",
      verifiedPreview({ target: "already-restored" }),
    );
    const changedSummary = createPreparedJournalRestore(
      "archive bytes\n",
      verifiedPreview({
        summary: { ...verifiedPreview().summary, activeExecutions: "3" },
      }),
    );
    const changedBytes = createPreparedJournalRestore("archive bytes ", verifiedPreview());

    expect(changedTarget.revisionSha256).not.toBe(prepared.revisionSha256);
    expect(changedSummary.revisionSha256).not.toBe(prepared.revisionSha256);
    expect(changedBytes.revisionSha256).not.toBe(prepared.revisionSha256);
  });

  it("rejects selected-byte and preview mutation after preparation", () => {
    const prepared = createPreparedJournalRestore("archive bytes\n", verifiedPreview());

    expect(() => assertPreparedJournalRestoreRevision({
      ...prepared,
      contents: "different bytes\n",
    })).toThrow(/changed after preview/i);
    expect(() => assertPreparedJournalRestoreRevision({
      ...prepared,
      preview: {
        ...prepared.preview,
        reportSha256: "d".repeat(64),
      },
    })).toThrow(/changed after preview/i);
    expect(() => assertPreparedJournalRestoreRevision({
      ...prepared,
      preview: {
        ...prepared.preview,
        summary: { ...prepared.preview.summary, accounts: "2" },
      },
    })).toThrow(/changed after preview/i);
  });

  it("rejects invalid compatibility and count claims from adapters", () => {
    expect(() => createPreparedJournalRestore("archive", verifiedPreview({
      archiveSha256: "not-a-hash",
    }))).toThrow(/archive digest/i);
    expect(() => createPreparedJournalRestore("archive", verifiedPreview({
      payloadKind: "future-payload" as never,
    }))).toThrow(/compatibility/i);
    expect(() => createPreparedJournalRestore("archive", verifiedPreview({
      summary: { ...verifiedPreview().summary, accounts: "01" },
    }))).toThrow(/account count/i);
  });
});
