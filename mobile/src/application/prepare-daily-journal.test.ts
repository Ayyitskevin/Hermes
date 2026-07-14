import { describe, expect, it } from "vitest";

import {
  DAILY_JOURNAL_LABEL_LIMIT,
  DAILY_JOURNAL_LIST_LIMIT,
  DAILY_JOURNAL_NOTE_LIMIT,
  createDailyJournalSubmissionId,
  dailyJournalEntryRevision,
  prepareDailyJournalEntry,
  verifyPreparedDailyJournalEntry,
  type DailyJournalEntryInput,
  type PreparedDailyJournalEntry,
} from "./prepare-daily-journal";

function input(
  overrides: Partial<DailyJournalEntryInput> = {},
): DailyJournalEntryInput {
  return {
    submissionId: "a".repeat(64),
    isoDate: "2026-07-13",
    expectedPreviousEntryId: null,
    state: "completed",
    title: "Protected the process",
    note: "Waited for confirmation.",
    emotion: "Focused",
    processScorePct: 88,
    tags: ["Plan followed"],
    ...overrides,
  };
}

function rehashed(
  entry: PreparedDailyJournalEntry,
  changes: Partial<PreparedDailyJournalEntry>,
): PreparedDailyJournalEntry {
  const changed = { ...entry, ...changes };
  const { revision: _revision, ...payload } = changed;
  return { ...changed, revision: dailyJournalEntryRevision(payload) };
}

describe("prepared daily journal entry", () => {
  it("normalizes Unicode content and creates a stable immutable revision", () => {
    const prepared = prepareDailyJournalEntry(input({
      title: "  Protected   the process ",
      note: "  Cafe\u0301\r\nStayed patient.  ",
      emotion: "  Calm  ",
      tags: ["Plan followed", " plan FOLLOWED ", "Patient"],
    }));
    expect(prepared).toMatchObject({
      title: "Protected the process",
      note: "Café\nStayed patient.",
      emotion: "Calm",
      tags: ["Plan followed", "Patient"],
    });
    expect(prepared.revision).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.tags)).toBe(true);
    expect(verifyPreparedDailyJournalEntry(prepared)).toEqual(prepared);
  });

  it("accepts real leap days and rejects malformed, impossible, and out-of-range dates", () => {
    expect(prepareDailyJournalEntry(input({ isoDate: "2024-02-29" })).isoDate)
      .toBe("2024-02-29");
    for (const isoDate of [
      "2023-02-29",
      "2026-13-01",
      "2026-7-13",
      "1969-12-31",
      "10000-01-01",
    ]) {
      expect(() => prepareDailyJournalEntry(input({ isoDate }))).toThrow(/date/i);
    }
  });

  it("enforces code-point limits rather than UTF-16 length", () => {
    expect(prepareDailyJournalEntry(input({
      title: "🙂".repeat(DAILY_JOURNAL_LABEL_LIMIT),
      note: "🙂".repeat(DAILY_JOURNAL_NOTE_LIMIT),
    }))).toMatchObject({
      title: "🙂".repeat(DAILY_JOURNAL_LABEL_LIMIT),
      note: "🙂".repeat(DAILY_JOURNAL_NOTE_LIMIT),
    });
    expect(() => prepareDailyJournalEntry(input({
      title: "🙂".repeat(DAILY_JOURNAL_LABEL_LIMIT + 1),
    }))).toThrow(/120/);
    expect(() => prepareDailyJournalEntry(input({
      note: "🙂".repeat(DAILY_JOURNAL_NOTE_LIMIT + 1),
    }))).toThrow(/5000/);
    expect(() => prepareDailyJournalEntry(input({
      emotion: "İ".repeat(DAILY_JOURNAL_LABEL_LIMIT),
    }))).toThrow(/normalized identity.*120/i);
    expect(() => prepareDailyJournalEntry(input({
      tags: ["İ".repeat(DAILY_JOURNAL_LABEL_LIMIT)],
    }))).toThrow(/normalized identity.*120/i);
  });

  it("rejects unsupported controls, invalid scores, and excess tags", () => {
    expect(() => prepareDailyJournalEntry(input({ note: "Visible\u0000hidden" })))
      .toThrow(/control/i);
    expect(() => prepareDailyJournalEntry(input({ tags: ["line\nbreak"] })))
      .toThrow(/single-line/i);
    for (const processScorePct of [-1, -0, 1.5, 101, Number.NaN]) {
      expect(() => prepareDailyJournalEntry(input({ processScorePct })))
        .toThrow(/0 through 100/);
    }
    expect(() => prepareDailyJournalEntry(input({
      tags: Array.from({ length: DAILY_JOURNAL_LIST_LIMIT + 1 }, (_, index) => `tag ${index}`),
    }))).toThrow(/at most 20/);
  });

  it("requires one authored signal while allowing sparse drafts and zero scores", () => {
    const empty = {
      title: null,
      note: "",
      emotion: null,
      processScorePct: null,
      tags: [],
    } as const;
    expect(() => prepareDailyJournalEntry(input(empty))).toThrow(/authored signal/i);
    expect(prepareDailyJournalEntry(input({
      ...empty,
      state: "draft",
      processScorePct: 0,
    }))).toMatchObject({ state: "draft", processScorePct: 0 });
  });

  it("binds identity, date, predecessor, state, authored content, and vocabulary identity", () => {
    const prepared = prepareDailyJournalEntry(input());
    for (const changed of [
      { ...prepared, isoDate: "2026-07-12" },
      { ...prepared, expectedPreviousEntryId: "prior-entry" },
      { ...prepared, state: "draft" as const },
      { ...prepared, note: "Changed" },
      { ...prepared, processScorePct: 89 },
    ]) {
      expect(() => verifyPreparedDailyJournalEntry(changed)).toThrow(/changed after review/i);
    }
    const alternateCase = prepareDailyJournalEntry(input({
      emotion: "FOCUSED",
      tags: ["plan FOLLOWED"],
    }));
    expect(alternateCase.revision).toBe(prepared.revision);
  });

  it("detects rehashed noncanonical values and validates secure identifiers", () => {
    const prepared = prepareDailyJournalEntry(input());
    expect(() => verifyPreparedDailyJournalEntry(rehashed(prepared, {
      tags: [" plan followed "],
    }))).toThrow(/normalized values/i);
    expect(() => prepareDailyJournalEntry(input({ submissionId: "A".repeat(64) })))
      .toThrow(/lowercase hexadecimal/i);
    expect(() => prepareDailyJournalEntry(input({ expectedPreviousEntryId: " bad " })))
      .toThrow(/trimmed visible/i);
    expect(prepareDailyJournalEntry(input({
      expectedPreviousEntryId: "🙂".repeat(256),
    })).expectedPreviousEntryId).toBe("🙂".repeat(256));
    expect(() => prepareDailyJournalEntry(input({
      expectedPreviousEntryId: "🙂".repeat(257),
    }))).toThrow(/1-256/);
    expect(() => prepareDailyJournalEntry(input({
      expectedPreviousEntryId: "previous\u0000entry",
    }))).toThrow(/trimmed visible/i);
  });

  it("creates independent cryptographically shaped submission IDs", () => {
    const first = createDailyJournalSubmissionId();
    const second = createDailyJournalSubmissionId();
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(second).toMatch(/^[0-9a-f]{64}$/);
    expect(second).not.toBe(first);
  });
});
