import { describe, expect, it } from "vitest";

import { sha256Hex } from "../adapters/sqlite/schema/checksum";
import { DEMO_WORKSPACE } from "../data/demo";
import {
  REVIEW_SESSION_COVERAGE_GROUP_ORDER,
  REVIEW_SESSION_COVERAGE_REPORT_DEFINITION,
  REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_CANONICAL_JSON,
  REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_SHA256,
  REVIEW_SESSION_COVERAGE_REPORT_VERSION,
  buildReviewSessionCoverageReport,
} from "./review-session-coverage-report";
import type {
  CalendarSession,
  JournalWorkspaceSnapshot,
  TradePreview,
} from "./types";

type ReviewStatus = TradePreview["reviewStatus"];

function baseTrade(): TradePreview {
  const trade = DEMO_WORKSPACE.trades[0];
  if (trade === undefined) throw new Error("The demo has no source trade.");
  return trade;
}

function trade(
  suffix: string,
  reviewStatus: ReviewStatus,
  reviewSessionDates: readonly string[],
  overrides: Partial<TradePreview> = {},
): TradePreview {
  const source = baseTrade();
  return {
    ...source,
    id: `trade-${suffix}`,
    tradeSubjectId: `subject-${suffix}`,
    symbol: suffix.toUpperCase(),
    reviewStatus,
    reviewId: reviewStatus === "pending" ? null : `review-${suffix}`,
    reviewVersion: reviewStatus === "pending" ? null : 1,
    reviewSessionDates: [...reviewSessionDates],
    ...overrides,
  };
}

function calendarSession(
  isoDate: string,
  trades: readonly TradePreview[],
  overrides: Partial<CalendarSession> = {},
): CalendarSession {
  const date = new Date(`${isoDate}T12:00:00.000Z`);
  const contributions = trades.map((item, index) => ({
    tradeSubjectId: item.tradeSubjectId,
    pnlExact: String(index + 1),
    pnl: index + 1,
    allocationCount: index + 1,
  }));
  return {
    isoDate,
    dayLabel: Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("en-US", {
        weekday: "short",
        timeZone: "UTC",
      }).format(date)
      : "Invalid",
    dateLabel: Number.isFinite(date.getTime())
      ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(date)
      : "Invalid",
    pnlExact: "0",
    pnl: 0,
    tradeCount: contributions.length,
    allocationCount: contributions.reduce(
      (total, contribution) => total + contribution.allocationCount,
      0,
    ),
    contributions,
    ...overrides,
  };
}

function derivedProgress(
  trades: readonly TradePreview[],
  calendar: readonly CalendarSession[],
): JournalWorkspaceSnapshot["reviewProgress"] {
  const byId = new Map(trades.map((item) => [item.tradeSubjectId, item]));
  const reviewedDates = new Set(calendar.flatMap((session) => (
    session.contributions.some((contribution) => {
      const item = byId.get(contribution.tradeSubjectId);
      return item !== undefined
        && item.reviewStatus !== "pending"
        && item.reviewSessionDates.includes(session.isoDate);
    }) ? [session.isoDate] : []
  )));
  const dates = calendar.map((session) => session.isoDate).sort();
  let streakSessions = 0;
  for (const date of [...dates].reverse()) {
    if (!reviewedDates.has(date)) break;
    streakSessions += 1;
  }
  return {
    pendingTrades: trades.filter((item) => item.reviewStatus === "pending").length,
    draftTrades: trades.filter((item) => item.reviewStatus === "draft").length,
    completedTrades: trades.filter((item) => item.reviewStatus === "completed").length,
    streakSessions,
    reviewedSessions: reviewedDates.size,
    tradingSessions: calendar.length,
  };
}

function workspace(
  trades: readonly TradePreview[],
  calendar: readonly CalendarSession[],
  overrides: Partial<JournalWorkspaceSnapshot> = {},
): JournalWorkspaceSnapshot {
  return {
    ...DEMO_WORKSPACE,
    trades,
    calendar,
    reviewProgress: derivedProgress(trades, calendar),
    ...overrides,
  };
}

describe("review-session-coverage report v1", () => {
  it("pins a replayable deeply frozen canonical definition", () => {
    expect(REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_CANONICAL_JSON).toBe(
      JSON.stringify(REVIEW_SESSION_COVERAGE_REPORT_DEFINITION),
    );
    expect(
      sha256Hex(REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_CANONICAL_JSON),
    ).toBe(REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_SHA256);
    expect(REVIEW_SESSION_COVERAGE_REPORT_DEFINITION).toMatchObject({
      version: REVIEW_SESSION_COVERAGE_REPORT_VERSION,
      inputs: {
        reviewProgress:
          "cross-check-only:tradingSessions+reviewedSessions+streakSessions",
        pnlAndCurrency: "not-consumed",
        dailyJournal: "not-consumed",
        tradeBrowserScope: "not-consumed",
        outcomeFields: "not-consumed",
      },
      cohort: {
        currentStreak:
          "maximal-reviewed-suffix-ending-at-the-latest-trading-session",
        assignment:
          "one-evidence-assignment-for-each-calendar-date+trade-contribution",
      },
      validation: {
        reviewSessionDates:
          "canonical+unique+strictly-ascending+subset-of-that-trades-calendar-contribution-dates",
        pendingCoverage: "pending-reviewSessionDates-must-be-empty",
        invalidInput: "throw;never-repair-drop-or-default",
      },
      counting: {
        sessionConservation:
          "sum(group.sessionCount)=metadata.totalSessionCount",
        assignmentConservation:
          "sum(group.assignmentCount)=metadata.totalAssignmentCount",
        rates: "not-calculated",
      },
      migration: {
        decision: "derived-only-recompute",
        archiveShapeChange: false,
      },
    });
    for (const value of [
      REVIEW_SESSION_COVERAGE_GROUP_ORDER,
      REVIEW_SESSION_COVERAGE_REPORT_DEFINITION,
      REVIEW_SESSION_COVERAGE_REPORT_DEFINITION.inputs,
      REVIEW_SESSION_COVERAGE_REPORT_DEFINITION.inputs.evidenceFields,
      REVIEW_SESSION_COVERAGE_REPORT_DEFINITION.cohort,
      REVIEW_SESSION_COVERAGE_REPORT_DEFINITION.validation,
      REVIEW_SESSION_COVERAGE_REPORT_DEFINITION.evidenceOrder,
      REVIEW_SESSION_COVERAGE_REPORT_DEFINITION.counting,
      REVIEW_SESSION_COVERAGE_REPORT_DEFINITION.migration,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it("reconciles the demo as six reviewed sessions, eight assignments, and one complete current streak", () => {
    const report = buildReviewSessionCoverageReport(DEMO_WORKSPACE);

    expect(report.metadata).toEqual({
      version: REVIEW_SESSION_COVERAGE_REPORT_VERSION,
      definitionSha256: REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_SHA256,
      timeZone: "UTC",
      accountLabel: "2 demo accounts",
      periodLabel: "Jul 1–9, 2026",
      totalSessionCount: 6,
      reviewedSessionCount: 6,
      unreviewedSessionCount: 0,
      currentStreakSessionCount: 6,
      totalAssignmentCount: 8,
    });
    expect(report.groups.map((group) => [
      group.classification,
      group.sessionCount,
      group.assignmentCount,
    ])).toEqual([
      ["current_streak", 6, 8],
      ["reviewed_before_streak", 0, 0],
      ["unreviewed", 0, 0],
    ]);
    expect(report.groups[0]?.sessionDates).toEqual([
      "2026-07-09",
      "2026-07-08",
      "2026-07-07",
      "2026-07-06",
      "2026-07-02",
      "2026-07-01",
    ]);
    expect(report.groups[0]?.evidence.every((item) => (
      item.reviewStatus === "completed" && item.coverageStatus === "completed"
    ))).toBe(true);
  });

  it("classifies a reviewed history, a gap, and a two-session suffix without treating no-trade dates as gaps", () => {
    const old = trade("old", "completed", ["2026-07-01"]);
    const gap = trade("gap", "pending", []);
    const recentDraft = trade("recent-draft", "draft", ["2026-07-04"]);
    const latest = trade("latest", "completed", ["2026-07-05"]);
    const calendar = [
      calendarSession("2026-07-05", [latest]),
      calendarSession("2026-07-02", [gap]),
      calendarSession("2026-07-01", [old]),
      calendarSession("2026-07-04", [recentDraft]),
    ];
    const report = buildReviewSessionCoverageReport(workspace(
      [old, gap, recentDraft, latest],
      calendar,
    ));

    expect(report.metadata).toMatchObject({
      totalSessionCount: 4,
      reviewedSessionCount: 3,
      unreviewedSessionCount: 1,
      currentStreakSessionCount: 2,
      totalAssignmentCount: 4,
    });
    expect(report.groups.map((group) => [
      group.classification,
      group.sessionDates,
    ])).toEqual([
      ["current_streak", ["2026-07-05", "2026-07-04"]],
      ["reviewed_before_streak", ["2026-07-01"]],
      ["unreviewed", ["2026-07-02"]],
    ]);
  });

  it("counts multi-day and multi-trade sessions while conserving sessions and assignments separately", () => {
    const multiDay = trade("multi", "completed", [
      "2026-07-01",
      "2026-07-02",
    ]);
    const sameDayPending = trade("pending", "pending", []);
    const laterDraft = trade("draft", "draft", ["2026-07-04"]);
    const calendar = [
      calendarSession("2026-07-04", [laterDraft]),
      calendarSession("2026-07-01", [multiDay]),
      calendarSession("2026-07-02", [multiDay, sameDayPending]),
    ];
    const report = buildReviewSessionCoverageReport(workspace(
      [sameDayPending, multiDay, laterDraft],
      calendar,
    ));

    expect(report.metadata).toMatchObject({
      totalSessionCount: 3,
      reviewedSessionCount: 3,
      currentStreakSessionCount: 3,
      totalAssignmentCount: 4,
    });
    expect(report.groups[0]).toMatchObject({
      classification: "current_streak",
      sessionCount: 3,
      assignmentCount: 4,
    });
    expect(report.groups[0]?.evidence.map((item) => [
      item.isoDate,
      item.tradeSubjectId,
      item.coverageStatus,
    ])).toEqual([
      ["2026-07-04", "subject-draft", "draft"],
      ["2026-07-02", "subject-multi", "completed"],
      ["2026-07-02", "subject-pending", "none"],
      ["2026-07-01", "subject-multi", "completed"],
    ]);
    expect(report.groups.reduce(
      (total, group) => total + group.sessionCount,
      0,
    )).toBe(report.metadata.totalSessionCount);
    expect(report.groups.reduce(
      (total, group) => total + group.assignmentCount,
      0,
    )).toBe(report.metadata.totalAssignmentCount);
  });

  it("treats draft and completed coverage as saved while allowing a saved head with zero credited dates", () => {
    const draft = trade("draft", "draft", ["2026-07-01"]);
    const completed = trade("completed", "completed", ["2026-07-02"]);
    const savedWithoutCoverage = trade("saved-zero", "completed", []);
    const calendar = [
      calendarSession("2026-07-01", [draft]),
      calendarSession("2026-07-02", [completed]),
      calendarSession("2026-07-03", [savedWithoutCoverage]),
    ];
    const report = buildReviewSessionCoverageReport(workspace(
      [draft, completed, savedWithoutCoverage],
      calendar,
    ));

    expect(report.metadata).toMatchObject({
      reviewedSessionCount: 2,
      unreviewedSessionCount: 1,
      currentStreakSessionCount: 0,
    });
    expect(report.groups[1]?.evidence.map((item) => item.coverageStatus))
      .toEqual(["completed", "draft"]);
    expect(report.groups[2]?.evidence[0]).toMatchObject({
      reviewStatus: "completed",
      coverageStatus: "none",
    });
  });

  it("does not credit a later allocation until the saved review covers that date", () => {
    const item = trade("temporal", "completed", ["2026-07-01"]);
    const calendar = [
      calendarSession("2026-07-01", [item]),
      calendarSession("2026-07-03", [item]),
    ];
    const report = buildReviewSessionCoverageReport(workspace([item], calendar));

    expect(report.metadata).toMatchObject({
      reviewedSessionCount: 1,
      unreviewedSessionCount: 1,
      currentStreakSessionCount: 0,
      totalAssignmentCount: 2,
    });
    expect(report.groups[1]?.sessionDates).toEqual(["2026-07-01"]);
    expect(report.groups[2]?.sessionDates).toEqual(["2026-07-03"]);
  });

  it.each([
    ["tradingSessions", { tradingSessions: 2 }],
    ["reviewedSessions", { reviewedSessions: 0 }],
    ["streakSessions", { streakSessions: 0 }],
  ])("rejects a mismatched review-progress %s cross-check", (_label, progress) => {
    const item = trade("checked", "completed", ["2026-07-01"]);
    const calendar = [calendarSession("2026-07-01", [item])];
    const source = workspace([item], calendar);

    expect(() => buildReviewSessionCoverageReport({
      ...source,
      reviewProgress: { ...source.reviewProgress, ...progress },
    })).toThrow(/does not reconcile snapshot review progress/u);
  });

  it("does not consume pending, draft, or completed trade counts as progress cross-checks", () => {
    const item = trade("checked", "completed", ["2026-07-01"]);
    const calendar = [calendarSession("2026-07-01", [item])];
    const source = workspace([item], calendar);
    const baseline = buildReviewSessionCoverageReport(source);

    expect(buildReviewSessionCoverageReport({
      ...source,
      reviewProgress: {
        ...source.reviewProgress,
        pendingTrades: 999,
        draftTrades: 998,
        completedTrades: 997,
      },
    })).toEqual(baseline);
  });

  it.each([
    ["non-canonical", "2026-7-01"],
    ["impossible", "2026-02-30"],
    ["too early", "1969-12-31"],
    ["timestamp", "2026-07-01T12:00:00Z"],
  ])("rejects an invalid %s calendar date", (_label, isoDate) => {
    const item = trade("date", "completed", ["2026-07-01"]);
    const invalid = calendarSession(isoDate, [item]);
    expect(() => buildReviewSessionCoverageReport({
      ...workspace([item], [calendarSession("2026-07-01", [item])]),
      calendar: [invalid],
    })).toThrow(/Calendar session date must/u);
  });

  it("rejects duplicate session dates, contribution identities, count mismatch, and empty sessions", () => {
    const item = trade("calendar", "completed", ["2026-07-01"]);
    const valid = calendarSession("2026-07-01", [item]);
    const source = workspace([item], [valid]);

    expect(() => buildReviewSessionCoverageReport({
      ...source,
      calendar: [valid, valid],
    })).toThrow(/appears more than once/u);
    expect(() => buildReviewSessionCoverageReport({
      ...source,
      calendar: [{
        ...valid,
        tradeCount: 2,
        contributions: [valid.contributions[0]!, valid.contributions[0]!],
      }],
    })).toThrow(/repeats on/u);
    expect(() => buildReviewSessionCoverageReport({
      ...source,
      calendar: [{ ...valid, tradeCount: 2 }],
    })).toThrow(/tradeCount must equal/u);
    expect(() => buildReviewSessionCoverageReport({
      ...source,
      calendar: [{ ...valid, tradeCount: 0, contributions: [] }],
    })).toThrow(/at least one trade contribution/u);
  });

  it.each([
    ["minimum positive safe integer", 1, true],
    ["zero", 0, false],
    ["negative", -1, false],
    ["fractional", 1.5, false],
    ["NaN", Number.NaN, false],
    ["positive infinity", Number.POSITIVE_INFINITY, false],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1, false],
  ] as const)("enforces a %s calendar tradeCount", (_label, tradeCount, validCount) => {
    const item = trade("calendar-count", "completed", ["2026-07-01"]);
    const session = calendarSession("2026-07-01", [item], { tradeCount });
    const build = () => buildReviewSessionCoverageReport(workspace(
      [item],
      [session],
    ));

    if (validCount) {
      expect(build().metadata.totalAssignmentCount).toBe(1);
    } else {
      expect(build).toThrow(/tradeCount must equal/u);
    }
  });

  it("rejects invalid, duplicate, unresolved, and orphan current trade identities", () => {
    const item = trade("identity", "completed", ["2026-07-01"]);
    const valid = calendarSession("2026-07-01", [item]);
    const source = workspace([item], [valid]);

    expect(() => buildReviewSessionCoverageReport(workspace([{
      ...item,
      tradeSubjectId: " bad",
    }], [valid]))).toThrow(/unique current trade subject identities/u);
    expect(() => buildReviewSessionCoverageReport(workspace(
      [item, { ...item, id: "other" }],
      [valid],
    ))).toThrow(/unique current trade subject identities/u);
    expect(() => buildReviewSessionCoverageReport({
      ...source,
      calendar: [{
        ...valid,
        contributions: [{
          ...valid.contributions[0]!,
          tradeSubjectId: "unknown-subject",
        }],
      }],
    })).toThrow(/does not resolve to exactly one current trade/u);
    expect(() => buildReviewSessionCoverageReport(workspace(
      [item, trade("orphan", "pending", [])],
      [valid],
    ))).toThrow(/has no calendar contribution/u);
  });

  it.each([
    ["current trade C0 control", "tradeSubjectId", "subject\u0000", /unique current trade subject identities/u],
    ["current trade C1 control", "tradeSubjectId", "subject\u0085", /unique current trade subject identities/u],
    ["current trade 257-code-point", "tradeSubjectId", "😀".repeat(257), /unique current trade subject identities/u],
    ["saved review C0 control", "reviewId", "review\u0000", /coherent current review head/u],
    ["saved review C1 control", "reviewId", "review\u0085", /coherent current review head/u],
    ["saved review 257-code-point", "reviewId", "😀".repeat(257), /coherent current review head/u],
  ] as const)("rejects a %s stable identifier", (_label, field, value, pattern) => {
    const item = {
      ...trade("stable-invalid", "completed", ["2026-07-01"]),
      [field]: value,
    };
    expect(() => buildReviewSessionCoverageReport(workspace(
      [item],
      [calendarSession("2026-07-01", [item])],
    ))).toThrow(pattern);
  });

  it.each([
    ["current trade ASCII", "tradeSubjectId", "x".repeat(256)],
    ["current trade Unicode", "tradeSubjectId", "😀".repeat(256)],
    ["saved review ASCII", "reviewId", "r".repeat(256)],
    ["saved review Unicode", "reviewId", "😀".repeat(256)],
  ] as const)("accepts a %s 256-code-point stable identifier", (_label, field, value) => {
    const item = {
      ...trade("stable-valid", "completed", ["2026-07-01"]),
      [field]: value,
    };
    const report = buildReviewSessionCoverageReport(workspace(
      [item],
      [calendarSession("2026-07-01", [item])],
    ));

    expect(report.metadata.totalAssignmentCount).toBe(1);
    expect(report.groups[0]?.evidence[0]?.tradeSubjectId).toBe(item.tradeSubjectId);
  });

  it("rejects invalid, repeated, descending, out-of-subject, and pending review dates", () => {
    const validDate = calendarSession(
      "2026-07-01",
      [trade("source", "completed", ["2026-07-01"])],
    );
    const secondDate = calendarSession(
      "2026-07-02",
      [trade("source", "completed", ["2026-07-01", "2026-07-02"])],
    );
    const sessionsFor = (item: TradePreview) => [
      calendarSession("2026-07-01", [item]),
      calendarSession("2026-07-02", [item]),
    ];

    for (const [dates, pattern] of [
      [["2026-7-01"], /review session date must/u],
      [["2026-07-01", "2026-07-01"], /repeats review session date/u],
      [["2026-07-02", "2026-07-01"], /strictly ascending/u],
    ] as const) {
      const item = trade("review-dates", "completed", dates);
      expect(() => buildReviewSessionCoverageReport(workspace(
        [item],
        sessionsFor(item),
      ))).toThrow(pattern);
    }

    const subset = trade("subset", "completed", ["2026-07-01", "2026-07-03"]);
    expect(() => buildReviewSessionCoverageReport(workspace(
      [subset],
      sessionsFor(subset),
    ))).toThrow(/not one of that trade's calendar contribution dates/u);

    const pending = trade("pending-claim", "pending", ["2026-07-01"]);
    expect(() => buildReviewSessionCoverageReport(workspace(
      [pending],
      [calendarSession("2026-07-01", [pending])],
    ))).toThrow(/cannot claim review-session coverage/u);

    expect(validDate.isoDate).toBe("2026-07-01");
    expect(secondDate.isoDate).toBe("2026-07-02");
  });

  it.each([
    ["impossible", "2026-02-30"],
    ["pre-1970", "1969-12-31"],
  ] as const)("rejects an %s canonical review-date boundary", (_label, isoDate) => {
    const item = trade("review-date-invalid", "completed", [isoDate]);
    expect(() => buildReviewSessionCoverageReport(workspace(
      [item],
      [calendarSession("2026-07-01", [item])],
    ))).toThrow(/review session date must/u);
  });

  it.each([
    ["real leap day", "2024-02-29"],
    ["upper contract bound", "9999-12-31"],
  ] as const)("accepts a %s canonical review date", (_label, isoDate) => {
    const item = trade("review-date-valid", "completed", [isoDate]);
    const report = buildReviewSessionCoverageReport(workspace(
      [item],
      [calendarSession(isoDate, [item])],
    ));

    expect(report.metadata).toMatchObject({
      totalSessionCount: 1,
      reviewedSessionCount: 1,
      currentStreakSessionCount: 1,
    });
    expect(report.groups[0]?.sessionDates).toEqual([isoDate]);
  });

  it("requires coherent unique current heads for draft and completed reviews", () => {
    const valid = trade("saved", "completed", ["2026-07-01"]);
    const session = calendarSession("2026-07-01", [valid]);
    for (const overrides of [
      { reviewId: null },
      { reviewId: " bad" },
      { reviewVersion: null },
      { reviewVersion: 0 },
      { reviewVersion: 1.5 },
    ] satisfies readonly Partial<TradePreview>[]) {
      const item = { ...valid, ...overrides };
      expect(() => buildReviewSessionCoverageReport(workspace(
        [item],
        [calendarSession("2026-07-01", [item])],
      ))).toThrow(/coherent current review head/u);
    }

    const second = trade("other", "draft", ["2026-07-01"], {
      reviewId: valid.reviewId,
    });
    expect(() => buildReviewSessionCoverageReport(workspace(
      [valid, second],
      [calendarSession("2026-07-01", [valid, second])],
    ))).toThrow(/coherent current review head/u);
    expect(session.tradeCount).toBe(1);
  });

  it.each([
    ["minimum positive safe integer", 1, true],
    ["maximum safe integer", Number.MAX_SAFE_INTEGER, true],
    ["zero", 0, false],
    ["negative", -1, false],
    ["fractional", 1.5, false],
    ["NaN", Number.NaN, false],
    ["positive infinity", Number.POSITIVE_INFINITY, false],
    ["unsafe integer", Number.MAX_SAFE_INTEGER + 1, false],
  ] as const)("enforces a %s saved reviewVersion", (_label, reviewVersion, validVersion) => {
    const item = trade("review-version", "completed", ["2026-07-01"], { reviewVersion });
    const build = () => buildReviewSessionCoverageReport(workspace(
      [item],
      [calendarSession("2026-07-01", [item])],
    ));

    if (validVersion) {
      expect(build().metadata.reviewedSessionCount).toBe(1);
    } else {
      expect(build).toThrow(/coherent current review head/u);
    }
  });

  it("is neutral to outcomes, currency, Daily Journal, financial calendar values, and non-cross-checked progress", () => {
    const item = trade("neutral", "completed", ["2026-07-01"]);
    const calendar = [calendarSession("2026-07-01", [item])];
    const source = workspace([item], calendar);
    const baseline = buildReviewSessionCoverageReport(source);
    const alteredTrade: TradePreview = {
      ...item,
      side: "short",
      status: "open",
      resultPnl: -999_999,
      resultPnlExact: "-999999",
      resultR: -999,
      percentReturn: -999,
      note: "Outcome narrative must stay outside this report.",
      mistakes: ["Ignored"],
      emotion: "Ignored",
      tags: ["Ignored"],
      followedPlan: false,
      tradedOn: "2099-12-31",
    };
    const alteredCalendar = calendar.map((session) => ({
      ...session,
      pnlExact: "999999999",
      pnl: 999_999_999,
      allocationCount: 999,
      contributions: session.contributions.map((contribution) => ({
        ...contribution,
        pnlExact: "-999999999",
        pnl: -999_999_999,
        allocationCount: 999,
      })),
    }));

    expect(buildReviewSessionCoverageReport({
      ...source,
      currencyCode: "EUR",
      performance: {
        ...source.performance,
        netPnl: 999_999,
        winRatePct: 100,
      },
      trades: [alteredTrade],
      calendar: alteredCalendar,
      dailyJournal: source.dailyJournal.map((entry) => ({
        ...entry,
        note: "Private daily content must not enter the report.",
        processScorePct: 100,
      })),
      reviewProgress: {
        ...source.reviewProgress,
        pendingTrades: 123,
        draftTrades: 456,
        completedTrades: 789,
      },
    })).toEqual(baseline);
    expect(JSON.stringify(baseline)).not.toMatch(/P&L|rate|ranking|reward|advice/u);
  });

  it("orders evidence by date descending then stable subject ID ascending", () => {
    const z = trade("z", "completed", ["2026-07-01"], {
      tradeSubjectId: "subject-z",
    });
    const a = trade("a", "draft", ["2026-07-01"], {
      tradeSubjectId: "subject-a",
    });
    const latest = trade("m", "completed", ["2026-07-03"], {
      tradeSubjectId: "subject-m",
    });
    const calendar = [
      calendarSession("2026-07-01", [z, a]),
      calendarSession("2026-07-03", [latest]),
    ];
    const report = buildReviewSessionCoverageReport(workspace(
      [z, latest, a],
      calendar,
    ));

    expect(report.groups[0]?.sessionDates).toEqual([
      "2026-07-03",
      "2026-07-01",
    ]);
    expect(report.groups[0]?.evidence.map((item) => item.tradeSubjectId))
      .toEqual(["subject-m", "subject-a", "subject-z"]);
  });

  it("returns detached deeply frozen output and all fixed groups for an empty workspace", () => {
    const sourceTrade = {
      ...trade("mutable", "completed", ["2026-07-01"]),
      symbol: "BEFORE",
    };
    const sourceContribution = {
      tradeSubjectId: sourceTrade.tradeSubjectId,
      pnlExact: "1",
      pnl: 1,
      allocationCount: 1,
    };
    const sourceSession = {
      ...calendarSession("2026-07-01", [sourceTrade]),
      dayLabel: "Before day",
      contributions: [sourceContribution],
    };
    const trades = [sourceTrade];
    const calendar = [sourceSession];
    const report = buildReviewSessionCoverageReport(workspace(trades, calendar));

    sourceTrade.symbol = "AFTER";
    sourceTrade.reviewSessionDates = [];
    sourceContribution.tradeSubjectId = "changed";
    sourceSession.dayLabel = "After day";
    trades.length = 0;
    calendar.length = 0;

    expect(report.groups[0]?.evidence[0]).toMatchObject({
      symbol: "BEFORE",
      dayLabel: "Before day",
      coverageStatus: "completed",
    });
    for (const value of [
      report,
      report.metadata,
      report.groups,
      ...report.groups,
      ...report.groups.map((group) => group.sessionDates),
      ...report.groups.map((group) => group.evidence),
      ...report.groups.flatMap((group) => group.evidence),
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }

    const empty = buildReviewSessionCoverageReport(workspace([], []));
    expect(empty.metadata).toMatchObject({
      totalSessionCount: 0,
      reviewedSessionCount: 0,
      unreviewedSessionCount: 0,
      currentStreakSessionCount: 0,
      totalAssignmentCount: 0,
    });
    expect(empty.groups.map((group) => [
      group.classification,
      group.sessionCount,
      group.assignmentCount,
      group.sessionDates,
      group.evidence,
    ])).toEqual(REVIEW_SESSION_COVERAGE_GROUP_ORDER.map((classification) => [
      classification,
      0,
      0,
      [],
      [],
    ]));
  });
});
