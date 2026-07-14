import { describe, expect, it } from "vitest";

import { DailyJournalCommitStatusUncertainError } from "../application/journal-application";
import type { DailyJournalPreview, JournalWorkspaceSnapshot } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  dailyJournalAction,
  dailyJournalSaveFailureKind,
  dailyJournalSheetTemplate,
  newestAvailableDailyJournalDate,
  parseDailyJournalTags,
  workspaceTodayIsoDate,
} from "./daily-journal-sheet";

function localWorkspace(): JournalWorkspaceSnapshot {
  return {
    ...DEMO_WORKSPACE,
    provenance: "local",
    provenanceLabel: "ON-DEVICE JOURNAL",
  };
}

describe("daily journal sheet", () => {
  it("derives today in the workspace time zone across a UTC date boundary", () => {
    const instant = new Date("2026-07-13T01:30:00.000Z");
    expect(workspaceTodayIsoDate("America/New_York", instant)).toBe("2026-07-12");
    expect(workspaceTodayIsoDate("Asia/Tokyo", instant)).toBe("2026-07-13");
  });

  it("selects the newest unoccupied create date", () => {
    const today = DEMO_WORKSPACE.dailyJournal[0]!;
    const yesterday = { ...today, isoDate: "2026-07-08" };
    expect(newestAvailableDailyJournalDate([], "2026-07-09")).toBe("2026-07-09");
    expect(newestAvailableDailyJournalDate([today], "2026-07-09")).toBe("2026-07-08");
    expect(newestAvailableDailyJournalDate([today, yesterday], "2026-07-09"))
      .toBe("2026-07-07");
  });

  it("renders an escaped, explicit-save create flow", () => {
    const snapshot = {
      ...localWorkspace(),
      reviewOptions: {
        ...localWorkspace().reviewOptions,
        emotions: ["<Focused>"],
      },
    };
    const html = dailyJournalSheetTemplate(null, snapshot, "2026-07-13");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('max="2026-07-13"');
    expect(html).toContain("Save draft");
    expect(html).toContain("Complete reflection");
    expect(html).toContain("&lt;Focused&gt;");
    expect(html).not.toContain("<Focused>");
    expect(html).toContain("never places or routes a trade");
    expect(html).toContain("excluded from performance and Plan Check analytics");
  });

  it("preserves an immutable edit date and escapes every authored value", () => {
    const entry: DailyJournalPreview = {
      ...DEMO_WORKSPACE.dailyJournal[0]!,
      isoDate: "2026-07-09",
      title: "<headline>",
      note: "<script>alert(1)</script>",
      emotion: "<calm>",
      tags: ["<tag>"],
    };
    const html = dailyJournalSheetTemplate(entry, localWorkspace(), "2026-07-13");
    expect(html).toMatch(/id="daily-entry-date"[^>]*value="2026-07-09"[^>]*readonly/u);
    expect(html).toContain("durable identity and cannot be changed");
    expect(html).toContain("&lt;headline&gt;");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("&lt;calm&gt;");
    expect(html).toContain("&lt;tag&gt;");
    expect(html).not.toContain("<script>");
    expect(html).toContain("Save changes");
  });

  it("emits stable accessible triggers and parses comma/newline tags", () => {
    expect(dailyJournalAction(null)).toContain("data-daily-entry-new");
    const action = dailyJournalAction(DEMO_WORKSPACE.dailyJournal[0]!);
    expect(action).toContain('data-daily-entry-edit="2026-07-09"');
    expect(action).toContain("Edit daily reflection for July 9, 2026");
    expect(parseDailyJournalTags(" Patient, Plan followed\nA+ ,, ")).toEqual([
      "Patient",
      "Plan followed",
      "A+",
    ]);
  });

  it("distinguishes uncertain persistence from retryable validation failures", () => {
    expect(dailyJournalSaveFailureKind(
      new DailyJournalCommitStatusUncertainError(new Error("lost response")),
    )).toBe("uncertain");
    expect(dailyJournalSaveFailureKind(new Error("invalid note"))).toBe("retryable");
  });
});
