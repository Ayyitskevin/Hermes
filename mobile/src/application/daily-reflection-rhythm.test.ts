import { describe, expect, it } from "vitest";

import type {
  CalendarSession,
  DailyJournalPreview,
  JournalWorkspaceSnapshot,
} from "../core/types";
import { DEMO_WORKSPACE } from "../data/demo";
import { buildDailyReflectionRhythm } from "./daily-reflection-rhythm";

function workspace(
  overrides: Partial<JournalWorkspaceSnapshot> = {},
): JournalWorkspaceSnapshot {
  return { ...DEMO_WORKSPACE, ...overrides };
}

function dailyEntry(
  isoDate: string,
  state: DailyJournalPreview["state"] = "completed",
): DailyJournalPreview {
  return {
    ...DEMO_WORKSPACE.dailyJournal[0]!,
    isoDate,
    dateLabel: isoDate,
    entryVersionId: `daily-${isoDate}`,
    state,
    revision: isoDate.replaceAll("-", "").padEnd(64, "0"),
    completedAtUs: state === "completed" ? "1783616400000000" : null,
  };
}

describe("daily reflection rhythm", () => {
  it("classifies the fictional trading sessions and freezes a detached latest-seven projection", () => {
    const rhythm = buildDailyReflectionRhythm(DEMO_WORKSPACE);

    expect(rhythm).toMatchObject({
      tradingSessions: 6,
      completedSessions: 2,
      draftSessions: 0,
      missingSessions: 4,
      currentCompletedRun: 2,
      noTradeReflections: 0,
    });
    expect(rhythm.recentSessions).toEqual([
      { isoDate: "2026-07-01", status: "missing" },
      { isoDate: "2026-07-02", status: "missing" },
      { isoDate: "2026-07-06", status: "missing" },
      { isoDate: "2026-07-07", status: "missing" },
      { isoDate: "2026-07-08", status: "completed" },
      { isoDate: "2026-07-09", status: "completed" },
    ]);
    expect(Object.isFrozen(rhythm)).toBe(true);
    expect(Object.isFrozen(rhythm.recentSessions)).toBe(true);
    expect(rhythm.recentSessions.every(Object.isFrozen)).toBe(true);
  });

  it("does not bridge a latest draft or missing trading session", () => {
    const draftLatest = workspace({
      dailyJournal: [
        { ...DEMO_WORKSPACE.dailyJournal[0]!, state: "draft", completedAtUs: null },
        DEMO_WORKSPACE.dailyJournal[1]!,
      ],
    });
    expect(buildDailyReflectionRhythm(draftLatest)).toMatchObject({
      completedSessions: 1,
      draftSessions: 1,
      missingSessions: 4,
      currentCompletedRun: 0,
    });

    const missingLatest = workspace({ dailyJournal: [DEMO_WORKSPACE.dailyJournal[1]!] });
    expect(buildDailyReflectionRhythm(missingLatest)).toMatchObject({
      completedSessions: 1,
      draftSessions: 0,
      missingSessions: 5,
      currentCompletedRun: 0,
    });
  });

  it("counts no-trade reflections separately without extending or breaking the run", () => {
    const rhythm = buildDailyReflectionRhythm(workspace({
      dailyJournal: [...DEMO_WORKSPACE.dailyJournal, dailyEntry("2026-07-05")],
    }));

    expect(rhythm).toMatchObject({
      tradingSessions: 6,
      completedSessions: 2,
      currentCompletedRun: 2,
      noTradeReflections: 1,
    });
  });

  it("ignores financial outcomes, trade-review state, and authored reflection content", () => {
    const baseline = buildDailyReflectionRhythm(DEMO_WORKSPACE);
    const changed: JournalWorkspaceSnapshot = {
      ...DEMO_WORKSPACE,
      performance: { ...DEMO_WORKSPACE.performance, netPnl: -999_999 },
      calendar: DEMO_WORKSPACE.calendar.map((session) => ({
        ...session,
        pnl: -999_999,
        pnlExact: "-999999",
        tradeCount: 999,
      })),
      trades: DEMO_WORKSPACE.trades.map((trade) => ({
        ...trade,
        resultPnl: -999_999,
        reviewStatus: "pending" as const,
      })),
      dailyJournal: DEMO_WORKSPACE.dailyJournal.map((entry) => ({
        ...entry,
        title: "Changed",
        note: "Changed",
        emotion: "Changed",
        processScorePct: 0,
        tags: ["Changed"],
      })),
    };

    expect(buildDailyReflectionRhythm(changed)).toEqual(baseline);
  });

  it("bounds the visible sequence to the latest seven trading sessions", () => {
    const base = DEMO_WORKSPACE.calendar[0]!;
    const calendar: CalendarSession[] = Array.from({ length: 10 }, (_, index) => ({
      ...base,
      isoDate: `2026-07-${String(index + 1).padStart(2, "0")}`,
    }));
    const rhythm = buildDailyReflectionRhythm(workspace({ calendar, dailyJournal: [] }));

    expect(rhythm.tradingSessions).toBe(10);
    expect(rhythm.recentSessions.map((session) => session.isoDate)).toEqual([
      "2026-07-04",
      "2026-07-05",
      "2026-07-06",
      "2026-07-07",
      "2026-07-08",
      "2026-07-09",
      "2026-07-10",
    ]);
  });

  it.each([
    ["noncanonical session date", { calendar: [{ ...DEMO_WORKSPACE.calendar[0]!, isoDate: "2026-7-1" }] }],
    ["invalid session date", { calendar: [{ ...DEMO_WORKSPACE.calendar[0]!, isoDate: "2026-02-30" }] }],
    ["duplicate session date", { calendar: [DEMO_WORKSPACE.calendar[0]!, DEMO_WORKSPACE.calendar[0]!] }],
    ["unordered sessions", { calendar: [...DEMO_WORKSPACE.calendar].reverse() }],
    ["duplicate daily head", { dailyJournal: [DEMO_WORKSPACE.dailyJournal[0]!, DEMO_WORKSPACE.dailyJournal[0]!] }],
    ["invalid daily state", { dailyJournal: [{ ...DEMO_WORKSPACE.dailyJournal[0]!, state: "pending" }] }],
  ])("fails loudly for %s", (_label, overrides) => {
    expect(() => buildDailyReflectionRhythm(workspace(
      overrides as Partial<JournalWorkspaceSnapshot>,
    ))).toThrow();
  });
});
