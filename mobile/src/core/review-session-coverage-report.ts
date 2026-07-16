import type {
  JournalWorkspaceSnapshot,
  TradePreview,
} from "./types";

export const REVIEW_SESSION_COVERAGE_REPORT_VERSION =
  "review-session-coverage-report-v1" as const;

export const REVIEW_SESSION_COVERAGE_GROUP_ORDER = Object.freeze([
  "current_streak",
  "reviewed_before_streak",
  "unreviewed",
] as const);

export type ReviewSessionCoverageGroupKey =
  (typeof REVIEW_SESSION_COVERAGE_GROUP_ORDER)[number];

export type ReviewSessionCoverageStatus = "none" | "draft" | "completed";

/**
 * Canonical count-only report contract. Property and array order are checksum
 * input; changing any semantic requires a new report version.
 */
export const REVIEW_SESSION_COVERAGE_REPORT_DEFINITION = Object.freeze({
  version: REVIEW_SESSION_COVERAGE_REPORT_VERSION,
  inputs: Object.freeze({
    sessions:
      "snapshot.calendar:current-full-workspace-canonical-dates+durable-trade-contribution-identities",
    reviews:
      "current-trade.reviewStatus+reviewSessionDates;draft-or-completed-is-a-saved-head",
    reviewProgress:
      "cross-check-only:tradingSessions+reviewedSessions+streakSessions",
    evidenceFields: Object.freeze([
      "isoDate",
      "dayLabel",
      "dateLabel",
      "tradeSubjectId",
      "symbol",
      "assetClass",
      "accountLabel",
      "sessionLabel",
      "reviewStatus",
      "coverageStatus",
    ] as const),
    pnlAndCurrency: "not-consumed",
    dailyJournal: "not-consumed",
    tradeBrowserScope: "not-consumed",
    outcomeFields: "not-consumed",
  }),
  cohort: Object.freeze({
    tradingSession:
      "each-real-canonical-workspace-local-calendar-date-with-at-least-one-durable-trade-contribution",
    reviewedSession:
      "at-least-one-exactly-resolved-current-trade-has-draft-or-completed-review-covering-that-date",
    currentStreak:
      "maximal-reviewed-suffix-ending-at-the-latest-trading-session",
    assignment:
      "one-evidence-assignment-for-each-calendar-date+trade-contribution",
    exclusions: "none",
  }),
  validation: Object.freeze({
    date:
      "real-Gregorian-YYYY-MM-DD-from-1970-01-01-through-9999-12-31",
    sessionIdentity: "isoDate-unique-across-calendar",
    contributionIdentity:
      "isoDate+tradeSubjectId-unique-across-calendar-and-resolves-one-current-trade",
    subjectIdentity:
      "tradeSubjectId:1-256-trimmed-C0-C1-free-and-unique-across-current-projection",
    calendarTradeCount:
      "positive-safe-integer-equal-to-unique-contribution-count",
    reviewSessionDates:
      "canonical+unique+strictly-ascending+subset-of-that-trades-calendar-contribution-dates",
    savedReviewHead:
      "draft-or-completed=>reviewId:1-256-trimmed-C0-C1-free-and-unique+positive-safe-reviewVersion",
    pendingCoverage: "pending-reviewSessionDates-must-be-empty",
    invalidInput: "throw;never-repair-drop-or-default",
  }),
  groupOrder:
    "fixed:current_streak-then-reviewed_before_streak-then-unreviewed;all-groups-present",
  evidenceOrder: Object.freeze([
    "isoDate:descending",
    "tradeSubjectId:ascending",
  ] as const),
  counting: Object.freeze({
    sessionConservation:
      "sum(group.sessionCount)=metadata.totalSessionCount",
    assignmentConservation:
      "sum(group.assignmentCount)=metadata.totalAssignmentCount",
    progressReconciliation:
      "derived-total+reviewed+current-streak-session-counts-equal-snapshot.reviewProgress",
    rates: "not-calculated",
  }),
  migration: Object.freeze({
    decision: "derived-only-recompute",
    archiveShapeChange: false,
    exportCompatibility:
      "existing-archives-retain-calendar+current-review-inputs;current-runtime-recomputes",
  }),
});

export const REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_CANONICAL_JSON =
  JSON.stringify(REVIEW_SESSION_COVERAGE_REPORT_DEFINITION);

/** Pinned SHA-256 of REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_CANONICAL_JSON. */
export const REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_SHA256 =
  "8fafa15893363476f1d0433c8fbb70d3db000b6c4a75bfd9a621862c52244113" as const;

export interface ReviewSessionCoverageEvidence {
  readonly isoDate: string;
  readonly dayLabel: string;
  readonly dateLabel: string;
  readonly tradeSubjectId: string;
  readonly symbol: string;
  readonly assetClass: TradePreview["assetClass"];
  readonly accountLabel: string;
  readonly sessionLabel: string;
  readonly reviewStatus: TradePreview["reviewStatus"];
  readonly coverageStatus: ReviewSessionCoverageStatus;
}

export interface ReviewSessionCoverageGroup {
  readonly classification: ReviewSessionCoverageGroupKey;
  readonly sessionCount: number;
  readonly assignmentCount: number;
  readonly sessionDates: readonly string[];
  readonly evidence: readonly ReviewSessionCoverageEvidence[];
}

export interface ReviewSessionCoverageReportMetadata {
  readonly version: typeof REVIEW_SESSION_COVERAGE_REPORT_VERSION;
  readonly definitionSha256:
    typeof REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_SHA256;
  readonly timeZone: string;
  readonly accountLabel: string;
  readonly periodLabel: string;
  readonly totalSessionCount: number;
  readonly reviewedSessionCount: number;
  readonly unreviewedSessionCount: number;
  readonly currentStreakSessionCount: number;
  readonly totalAssignmentCount: number;
}

export interface ReviewSessionCoverageReport {
  readonly metadata: ReviewSessionCoverageReportMetadata;
  readonly groups: readonly ReviewSessionCoverageGroup[];
}

interface ValidatedTrade {
  readonly trade: TradePreview;
  readonly reviewStatus: TradePreview["reviewStatus"];
  readonly reviewSessionDates: ReadonlySet<string>;
}

interface ValidatedSession {
  readonly isoDate: string;
  readonly dayLabel: string;
  readonly dateLabel: string;
  readonly evidence: readonly ReviewSessionCoverageEvidence[];
  readonly reviewed: boolean;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined
      && (codePoint < 32 || (codePoint >= 127 && codePoint <= 159));
  });
}

function isValidStableIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.length > 0
    && value.trim() === value
    && [...value].length <= 256
    && !hasControlCharacter(value);
}

function canonicalDate(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || !/^(?:19[7-9][0-9]|[2-9][0-9]{3})-[0-9]{2}-[0-9]{2}$/.test(value)
  ) {
    throw new Error(
      `${label} must be canonical YYYY-MM-DD from 1970 through 9999.`,
    );
  }
  const date = new Date(`${value}T12:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`${label} must be a real Gregorian date.`);
  }
  return value;
}

function displayText(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`${label} must be text.`);
  }
  return value;
}

function validatedReviewStatus(
  trade: TradePreview,
): TradePreview["reviewStatus"] {
  const status: unknown = trade.reviewStatus;
  if (
    status !== "pending"
    && status !== "draft"
    && status !== "completed"
  ) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} review status must be pending, draft, or completed.`,
    );
  }
  return status;
}

function validatedAssetClass(
  trade: TradePreview,
): TradePreview["assetClass"] {
  const assetClass: unknown = trade.assetClass;
  if (assetClass !== "stock" && assetClass !== "etf") {
    throw new Error(
      `Trade ${trade.tradeSubjectId} asset class must be stock or etf.`,
    );
  }
  return assetClass;
}

function evidenceCompare(
  left: ReviewSessionCoverageEvidence,
  right: ReviewSessionCoverageEvidence,
): number {
  return stableCompare(right.isoDate, left.isoDate)
    || stableCompare(left.tradeSubjectId, right.tradeSubjectId);
}

function safeProgressCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`Review progress ${label} must be a non-negative safe integer.`);
  }
  return value as number;
}

function buildGroup(
  classification: ReviewSessionCoverageGroupKey,
  sessions: readonly ValidatedSession[],
): ReviewSessionCoverageGroup {
  const orderedSessions = [...sessions].sort((left, right) => (
    stableCompare(right.isoDate, left.isoDate)
  ));
  const sessionDates = Object.freeze(
    orderedSessions.map((session) => session.isoDate),
  );
  const evidence = Object.freeze(
    orderedSessions
      .flatMap((session) => session.evidence)
      .sort(evidenceCompare),
  );
  return Object.freeze({
    classification,
    sessionCount: sessionDates.length,
    assignmentCount: evidence.length,
    sessionDates,
    evidence,
  });
}

export function buildReviewSessionCoverageReport(
  snapshot: JournalWorkspaceSnapshot,
): ReviewSessionCoverageReport {
  const tradesBySubjectId = new Map<string, ValidatedTrade>();
  const savedReviewIds = new Set<string>();
  for (const trade of snapshot.trades) {
    if (
      !isValidStableIdentifier(trade.tradeSubjectId)
      || tradesBySubjectId.has(trade.tradeSubjectId)
    ) {
      throw new Error(
        "Review-session coverage requires 1-256 character trimmed, control-free, unique current trade subject identities.",
      );
    }
    const reviewStatus = validatedReviewStatus(trade);
    validatedAssetClass(trade);
    const rawReviewSessionDates: unknown = trade.reviewSessionDates;
    if (!Array.isArray(rawReviewSessionDates)) {
      throw new Error(
        `Trade ${trade.tradeSubjectId} review session dates must be an array.`,
      );
    }
    const reviewSessionDates = new Set<string>();
    let previousReviewDate: string | null = null;
    for (const rawDate of rawReviewSessionDates) {
      const date = canonicalDate(
        rawDate,
        `Trade ${trade.tradeSubjectId} review session date`,
      );
      if (reviewSessionDates.has(date)) {
        throw new Error(
          `Trade ${trade.tradeSubjectId} repeats review session date ${date}.`,
        );
      }
      if (
        previousReviewDate !== null
        && stableCompare(previousReviewDate, date) >= 0
      ) {
        throw new Error(
          `Trade ${trade.tradeSubjectId} review session dates must be strictly ascending.`,
        );
      }
      reviewSessionDates.add(date);
      previousReviewDate = date;
    }
    if (reviewStatus === "pending" && reviewSessionDates.size !== 0) {
      throw new Error(
        `Pending trade ${trade.tradeSubjectId} cannot claim review-session coverage.`,
      );
    }
    if (reviewStatus !== "pending") {
      if (
        !isValidStableIdentifier(trade.reviewId)
        || savedReviewIds.has(trade.reviewId)
        || trade.reviewVersion === null
        || !Number.isSafeInteger(trade.reviewVersion)
        || trade.reviewVersion < 1
      ) {
        throw new Error(
          `Saved trade ${trade.tradeSubjectId} requires a coherent current review head.`,
        );
      }
      savedReviewIds.add(trade.reviewId);
    }
    tradesBySubjectId.set(trade.tradeSubjectId, {
      trade,
      reviewStatus,
      reviewSessionDates,
    });
  }

  const sessionDates = new Set<string>();
  const contributionIdentities = new Set<string>();
  const calendarDatesByTrade = new Map<string, Set<string>>();
  const calendarSources: {
    readonly isoDate: string;
    readonly dayLabel: string;
    readonly dateLabel: string;
    readonly contributionSubjectIds: readonly string[];
  }[] = [];

  for (const session of snapshot.calendar) {
    const isoDate = canonicalDate(session.isoDate, "Calendar session date");
    if (sessionDates.has(isoDate)) {
      throw new Error(`Calendar session date ${isoDate} appears more than once.`);
    }
    sessionDates.add(isoDate);
    const rawContributions: unknown = session.contributions;
    if (!Array.isArray(rawContributions) || rawContributions.length === 0) {
      throw new Error(
        `Calendar session ${isoDate} must contain at least one trade contribution.`,
      );
    }
    if (
      !Number.isSafeInteger(session.tradeCount)
      || session.tradeCount <= 0
      || session.tradeCount !== rawContributions.length
    ) {
      throw new Error(
        `Calendar session ${isoDate} tradeCount must equal its unique contribution count.`,
      );
    }

    const contributionSubjectIds: string[] = [];
    for (const contribution of session.contributions) {
      const tradeSubjectId: unknown = contribution.tradeSubjectId;
      if (!isValidStableIdentifier(tradeSubjectId)) {
        throw new Error(
          `Calendar session ${isoDate} has an invalid durable trade contribution identity.`,
        );
      }
      const contributionIdentity = `${isoDate}\u0000${tradeSubjectId}`;
      if (contributionIdentities.has(contributionIdentity)) {
        throw new Error(
          `Calendar contribution ${tradeSubjectId} repeats on ${isoDate}.`,
        );
      }
      contributionIdentities.add(contributionIdentity);
      if (!tradesBySubjectId.has(tradeSubjectId)) {
        throw new Error(
          `Calendar contribution ${tradeSubjectId} on ${isoDate} does not resolve to exactly one current trade.`,
        );
      }
      contributionSubjectIds.push(tradeSubjectId);
      const dates = calendarDatesByTrade.get(tradeSubjectId) ?? new Set<string>();
      dates.add(isoDate);
      calendarDatesByTrade.set(tradeSubjectId, dates);
    }
    calendarSources.push({
      isoDate,
      dayLabel: displayText(session.dayLabel, `Calendar session ${isoDate} day label`),
      dateLabel: displayText(session.dateLabel, `Calendar session ${isoDate} date label`),
      contributionSubjectIds,
    });
  }

  for (const [tradeSubjectId, trade] of tradesBySubjectId) {
    const contributionDates = calendarDatesByTrade.get(tradeSubjectId);
    if (contributionDates === undefined || contributionDates.size === 0) {
      throw new Error(
        `Current trade ${tradeSubjectId} has no calendar contribution.`,
      );
    }
    for (const reviewDate of trade.reviewSessionDates) {
      if (!contributionDates.has(reviewDate)) {
        throw new Error(
          `Trade ${tradeSubjectId} review session date ${reviewDate} is not one of that trade's calendar contribution dates.`,
        );
      }
    }
  }

  const sessions: ValidatedSession[] = calendarSources.map((source) => {
    let reviewed = false;
    const evidence = Object.freeze(source.contributionSubjectIds.map(
      (tradeSubjectId): ReviewSessionCoverageEvidence => {
        const validated = tradesBySubjectId.get(tradeSubjectId);
        if (validated === undefined) {
          throw new Error(
            `Calendar contribution ${tradeSubjectId} lost its current trade.`,
          );
        }
        const coverageStatus: ReviewSessionCoverageStatus =
          validated.reviewStatus !== "pending"
          && validated.reviewSessionDates.has(source.isoDate)
            ? validated.reviewStatus
            : "none";
        if (coverageStatus !== "none") reviewed = true;
        const trade = validated.trade;
        return Object.freeze({
          isoDate: source.isoDate,
          dayLabel: source.dayLabel,
          dateLabel: source.dateLabel,
          tradeSubjectId,
          symbol: displayText(trade.symbol, `Trade ${tradeSubjectId} symbol`),
          assetClass: validatedAssetClass(trade),
          accountLabel: displayText(
            trade.accountLabel,
            `Trade ${tradeSubjectId} account label`,
          ),
          sessionLabel: displayText(
            trade.sessionLabel,
            `Trade ${tradeSubjectId} session label`,
          ),
          reviewStatus: validated.reviewStatus,
          coverageStatus,
        });
      },
    ));
    return Object.freeze({
      isoDate: source.isoDate,
      dayLabel: source.dayLabel,
      dateLabel: source.dateLabel,
      evidence,
      reviewed,
    });
  });

  const sessionsAscending = [...sessions].sort((left, right) => (
    stableCompare(left.isoDate, right.isoDate)
  ));
  const currentStreakDates = new Set<string>();
  for (let index = sessionsAscending.length - 1; index >= 0; index -= 1) {
    const session = sessionsAscending[index];
    if (session === undefined || !session.reviewed) break;
    currentStreakDates.add(session.isoDate);
  }

  const sessionsByClassification: Record<
    ReviewSessionCoverageGroupKey,
    ValidatedSession[]
  > = {
    current_streak: [],
    reviewed_before_streak: [],
    unreviewed: [],
  };
  for (const session of sessions) {
    const classification: ReviewSessionCoverageGroupKey = !session.reviewed
      ? "unreviewed"
      : currentStreakDates.has(session.isoDate)
        ? "current_streak"
        : "reviewed_before_streak";
    sessionsByClassification[classification].push(session);
  }

  const groups = Object.freeze(
    REVIEW_SESSION_COVERAGE_GROUP_ORDER.map((classification) => (
      buildGroup(classification, sessionsByClassification[classification])
    )),
  );
  const reviewedSessionCount = sessions.filter((session) => session.reviewed).length;
  const unreviewedSessionCount = sessions.length - reviewedSessionCount;
  const totalAssignmentCount = sessions.reduce(
    (total, session) => total + session.evidence.length,
    0,
  );
  const groupedSessionCount = groups.reduce(
    (total, group) => total + group.sessionCount,
    0,
  );
  const groupedAssignmentCount = groups.reduce(
    (total, group) => total + group.assignmentCount,
    0,
  );
  if (
    groupedSessionCount !== sessions.length
    || groupedAssignmentCount !== totalAssignmentCount
    || reviewedSessionCount + unreviewedSessionCount !== sessions.length
  ) {
    throw new Error(
      "Review-session coverage does not conserve its sessions and assignments.",
    );
  }

  const progressTradingSessions = safeProgressCount(
    snapshot.reviewProgress.tradingSessions,
    "tradingSessions",
  );
  const progressReviewedSessions = safeProgressCount(
    snapshot.reviewProgress.reviewedSessions,
    "reviewedSessions",
  );
  const progressStreakSessions = safeProgressCount(
    snapshot.reviewProgress.streakSessions,
    "streakSessions",
  );
  if (
    progressTradingSessions !== sessions.length
    || progressReviewedSessions !== reviewedSessionCount
    || progressStreakSessions !== currentStreakDates.size
  ) {
    throw new Error(
      "Review-session coverage does not reconcile snapshot review progress.",
    );
  }

  const metadata: ReviewSessionCoverageReportMetadata = Object.freeze({
    version: REVIEW_SESSION_COVERAGE_REPORT_VERSION,
    definitionSha256: REVIEW_SESSION_COVERAGE_REPORT_DEFINITION_SHA256,
    timeZone: displayText(snapshot.timeZone, "Workspace time zone"),
    accountLabel: displayText(snapshot.accountLabel, "Workspace account label"),
    periodLabel: displayText(snapshot.periodLabel, "Workspace period label"),
    totalSessionCount: sessions.length,
    reviewedSessionCount,
    unreviewedSessionCount,
    currentStreakSessionCount: currentStreakDates.size,
    totalAssignmentCount,
  });

  return Object.freeze({
    metadata,
    groups,
  });
}
