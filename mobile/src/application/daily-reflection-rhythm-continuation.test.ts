import { describe, expect, it } from "vitest";

import type {
  CalendarSession,
  DailyJournalPreview,
  JournalWorkspaceSnapshot,
} from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import { resolveDailyReflectionRhythmContinuation } from "./daily-reflection-rhythm-continuation";

function entry(
  isoDate: string,
  state: DailyJournalPreview["state"],
): DailyJournalPreview {
  return {
    ...DEMO_WORKSPACE.dailyJournal[0]!,
    isoDate,
    dateLabel: isoDate,
    entryVersionId: `daily-${isoDate}`,
    version: state === "draft" ? 2 : 3,
    state,
    revision: isoDate.replaceAll("-", "").padEnd(64, "0"),
    completedAtUs: state === "completed" ? "1783616400000000" : null,
  };
}

function localWorkspace(
  overrides: Partial<JournalWorkspaceSnapshot> = {},
): JournalWorkspaceSnapshot {
  return {
    ...DEMO_WORKSPACE,
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
    ...overrides,
  };
}

function tenSessions(): readonly CalendarSession[] {
  const base = DEMO_WORKSPACE.calendar[0]!;
  return Array.from({ length: 10 }, (_, index) => ({
    ...base,
    isoDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
  }));
}

describe("daily reflection rhythm continuation", () => {
  it("resolves exact missing, draft, and completed rows with frozen head identity", () => {
    const snapshot = localWorkspace({
      calendar: [
        { ...DEMO_WORKSPACE.calendar[0]!, isoDate: "2026-07-07" },
        { ...DEMO_WORKSPACE.calendar[1]!, isoDate: "2026-07-08" },
        { ...DEMO_WORKSPACE.calendar[2]!, isoDate: "2026-07-09" },
      ],
      dailyJournal: [entry("2026-07-08", "draft"), entry("2026-07-09", "completed")],
    });

    const missing = resolveDailyReflectionRhythmContinuation(
      snapshot,
      "2026-07-07",
      "2026-07-10",
    );
    const draft = resolveDailyReflectionRhythmContinuation(
      snapshot,
      "2026-07-08",
      "2026-07-10",
    );
    const completed = resolveDailyReflectionRhythmContinuation(
      snapshot,
      "2026-07-09",
      "2026-07-10",
    );

    expect(missing).toEqual({ isoDate: "2026-07-07", status: "missing", entry: null });
    expect(draft).toMatchObject({
      isoDate: "2026-07-08",
      status: "draft",
      entry: {
        entryVersionId: "daily-2026-07-08",
        version: 2,
        state: "draft",
      },
    });
    expect(completed).toMatchObject({
      isoDate: "2026-07-09",
      status: "completed",
      entry: {
        entryVersionId: "daily-2026-07-09",
        version: 3,
        state: "completed",
      },
    });
    expect(Object.isFrozen(missing)).toBe(true);
    expect(Object.isFrozen(draft)).toBe(true);
    expect(Object.isFrozen(draft.entry)).toBe(true);
  });

  it.each([
    ["fictional provenance", DEMO_WORKSPACE, "2026-07-09", "2026-07-10"],
    ["future target", localWorkspace(), "2026-07-09", "2026-07-08"],
    ["noncanonical target", localWorkspace(), "2026-7-9", "2026-07-10"],
    ["outside the latest seven", localWorkspace({ calendar: tenSessions(), dailyJournal: [] }), "2026-07-03", "2026-07-10"],
    ["duplicate session", localWorkspace({ calendar: [DEMO_WORKSPACE.calendar[0]!, DEMO_WORKSPACE.calendar[0]!] }), "2026-07-01", "2026-07-10"],
    ["duplicate daily head", localWorkspace({ dailyJournal: [DEMO_WORKSPACE.dailyJournal[0]!, DEMO_WORKSPACE.dailyJournal[0]!] }), "2026-07-09", "2026-07-10"],
    ["malformed head identity", localWorkspace({ dailyJournal: [{ ...DEMO_WORKSPACE.dailyJournal[0]!, entryVersionId: " tampered " }] }), "2026-07-09", "2026-07-10"],
    ["malformed head revision", localWorkspace({ dailyJournal: [{ ...DEMO_WORKSPACE.dailyJournal[0]!, revision: "not-a-revision" }] }), "2026-07-09", "2026-07-10"],
    ["incoherent completion", localWorkspace({ dailyJournal: [{ ...DEMO_WORKSPACE.dailyJournal[0]!, state: "draft", completedAtUs: "1783616400000000" }] }), "2026-07-09", "2026-07-10"],
  ] satisfies readonly [string, JournalWorkspaceSnapshot, string, string][])(
    "rejects %s",
    (_label, snapshot, isoDate, maximumDate) => {
      expect(() => resolveDailyReflectionRhythmContinuation(
        snapshot,
        isoDate,
        maximumDate,
      )).toThrow();
    },
  );
});
