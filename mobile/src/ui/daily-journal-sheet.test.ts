import { describe, expect, it } from "vitest";

import { DailyJournalCommitStatusUncertainError } from "../application/journal-application";
import { JournalDailyEntryError } from "../application/journal-store";
import type { DailyJournalPreview, JournalWorkspaceSnapshot } from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  dailyJournalAction,
  dailyJournalLatestVersionTemplate,
  dailyJournalReconciliationHead,
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
    expect(html).toContain("Retry this exact save");
    expect(html).toContain("Review latest saved version");
    expect(html).toContain("Continue with my unsaved changes");
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

  it("locks an exact calendar create date while leaving generic create dates editable", () => {
    const exact = dailyJournalSheetTemplate(
      null,
      localWorkspace(),
      "2026-07-13",
      "2026-07-08",
      "2026-07-08",
    );
    expect(exact).toMatch(
      /id="daily-entry-date"[^>]*value="2026-07-08"[^>]*readonly/u,
    );
    expect(exact).toContain(
      "The selected calendar day is this entry’s durable identity and cannot be changed here.",
    );

    const generic = dailyJournalSheetTemplate(
      null,
      localWorkspace(),
      "2026-07-13",
      "2026-07-08",
    );
    expect(generic).toMatch(
      /id="daily-entry-date"[^>]*value="2026-07-08"/u,
    );
    expect(generic).not.toMatch(/id="daily-entry-date"[^>]*readonly/u);
    expect(generic).not.toContain("daily-entry-date-hint");
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
    const uncertain = new DailyJournalCommitStatusUncertainError(new Error("private path"));
    expect(dailyJournalSaveFailureKind(uncertain)).toBe("uncertain");
    expect(uncertain.message).toContain("retry the same save");
    expect(uncertain.message).not.toContain("private path");
    expect(dailyJournalSaveFailureKind(new JournalDailyEntryError({
      code: "entry_changed",
      message: "A newer head exists.",
    }))).toBe("stale");
    expect(dailyJournalSaveFailureKind(new JournalDailyEntryError({
      code: "submission_changed",
      message: "The receipt belongs to different values.",
    }))).toBe("blocked");
    expect(dailyJournalSaveFailureKind(new Error("invalid note"))).toBe("retryable");
  });

  it("renders every latest-version comparison value as escaped read-only evidence", () => {
    const entry: DailyJournalPreview = {
      ...DEMO_WORKSPACE.dailyJournal[0]!,
      dateLabel: "<July 9>",
      version: 7,
      state: "completed",
      title: "<newer headline>",
      note: "<script>alert('newer')</script>\nsecond line",
      emotion: "<steady>",
      processScorePct: 91,
      tags: ["<patient>", "A&B"],
    };
    const html = dailyJournalLatestVersionTemplate(entry);
    expect(html).toContain('data-daily-entry-latest-version="7"');
    expect(html).toContain('id="daily-entry-latest-title"');
    expect(html).toContain("Version 7 · completed");
    expect(html).toContain("&lt;July 9&gt;");
    expect(html).toContain("&lt;newer headline&gt;");
    expect(html).toContain("&lt;script&gt;alert(&#039;newer&#039;)&lt;/script&gt;\nsecond line");
    expect(html).toContain("&lt;steady&gt;");
    expect(html).toContain("91%");
    expect(html).toContain("&lt;patient&gt;, A&amp;B");
    expect(html).not.toContain("<script>");
  });

  it("accepts only a different newer local head for the exact conflicted date", () => {
    const current = DEMO_WORKSPACE.dailyJournal[0]!;
    const snapshot = localWorkspace();
    expect(dailyJournalReconciliationHead(
      snapshot,
      current.isoDate,
      "obsolete-head",
      current.version - 1,
    )).toBe(current);
    expect(dailyJournalReconciliationHead(
      snapshot,
      current.isoDate,
      current.entryVersionId,
      current.version - 1,
    )).toBeNull();
    expect(dailyJournalReconciliationHead(
      snapshot,
      current.isoDate,
      "different-head",
      current.version,
    )).toBeNull();
    expect(dailyJournalReconciliationHead(
      snapshot,
      "2026-01-01",
      "obsolete-head",
      0,
    )).toBeNull();
    expect(dailyJournalReconciliationHead(
      DEMO_WORKSPACE,
      current.isoDate,
      "obsolete-head",
      current.version - 1,
    )).toBeNull();
  });
});
