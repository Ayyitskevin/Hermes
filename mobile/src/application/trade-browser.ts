import {
  addSignedDecimals,
  compareSignedDecimals,
  sumSignedDecimals,
} from "../core/signed-decimal";
import type {
  CalendarSession,
  JournalWorkspaceSnapshot,
  TradePreview,
} from "../core/types";
import {
  TRADE_REVIEW_LABEL_LIMIT,
  TRADE_REVIEW_LIST_LIMIT,
} from "./prepare-trade-review";

export const TRADE_BROWSER_SEARCH_MAX_CODE_POINTS = 200;

export type TradeBrowserAssetClassFilter = "all" | "stock" | "etf";
export type TradeBrowserDirectionFilter = "all" | "long" | "short";
export type TradeBrowserPositionFilter = "all" | "open" | "closed";
export type TradeBrowserReviewFilter = "all" | "pending" | "draft" | "completed";

export interface TradeBrowserState {
  /** One stable ledger account ID, or null for every account. */
  readonly accountId: string | null;
  /** Inclusive workspace-local allocation/activity date lower bound. */
  readonly activityFrom: string | null;
  /** Inclusive workspace-local allocation/activity date upper bound. */
  readonly activityThrough: string | null;
  /** Optional one-day refinement within the account/range scope. */
  readonly selectedDay: string | null;
  /** Activity month shown on Dashboard; null selects the newest available month. */
  readonly calendarMonth: string | null;
  /** Ephemeral text filter over already scoped trade cards. */
  readonly query: string;
  /** Ephemeral exact facets over visible cards; they never redefine financial scope. */
  readonly assetClass: TradeBrowserAssetClassFilter;
  readonly direction: TradeBrowserDirectionFilter;
  readonly positionState: TradeBrowserPositionFilter;
  readonly reviewState: TradeBrowserReviewFilter;
  /** Exact current trade-review labels, or null for every assigned value. */
  readonly mistake: string | null;
  readonly emotion: string | null;
  readonly tag: string | null;
}

export const EMPTY_TRADE_BROWSER_STATE: TradeBrowserState = Object.freeze({
  accountId: null,
  activityFrom: null,
  activityThrough: null,
  selectedDay: null,
  calendarMonth: null,
  query: "",
  assetClass: "all",
  direction: "all",
  positionState: "all",
  reviewState: "all",
  mistake: null,
  emotion: null,
  tag: null,
});

export interface TradeBrowserEvidence {
  readonly trade: TradePreview;
  /** Exact allocation P&L inside the selected account/date/day scope. */
  readonly contributionPnlExact: string;
  readonly contributionPnl: number;
  readonly allocationCount: number;
  readonly activityDates: readonly string[];
}

export interface TradeBrowserCalendar {
  readonly month: string | null;
  readonly monthLabel: string;
  readonly previousMonth: string | null;
  readonly nextMonth: string | null;
  readonly sessions: readonly CalendarSession[];
  readonly scopedSessionCount: number;
}

export interface TradeBrowserReviewFacetOptions {
  readonly mistakes: readonly string[];
  readonly emotions: readonly string[];
  readonly tags: readonly string[];
}

export interface TradeBrowserResult {
  readonly state: TradeBrowserState;
  /** A stale day request is reported with empty evidence so callers cannot broaden silently. */
  readonly invalidatedSelectedDay: string | null;
  readonly isFiltered: boolean;
  /** Search/facets affect visible cards only, never scope evidence or totals. */
  readonly hasViewFilters: boolean;
  readonly accountLabel: string;
  readonly dateLabel: string;
  readonly scopeLabel: string;
  /** Account/date sessions before optional selected-day refinement. */
  readonly scopedCalendar: readonly CalendarSession[];
  readonly calendar: TradeBrowserCalendar;
  readonly selectedSession: CalendarSession | null;
  /** Exact current trade assignments across the whole workspace, independent of scope. */
  readonly reviewFacetOptions: TradeBrowserReviewFacetOptions;
  /** Account/date/day scoped trades before text search. */
  readonly evidence: readonly TradeBrowserEvidence[];
  /** Search/facet result. Visibility filters never change the exact scope summary. */
  readonly visibleEvidence: readonly TradeBrowserEvidence[];
  readonly contributionPnlExact: string;
  readonly contributionPnl: number;
  readonly allocationCount: number;
  readonly activityDayCount: number;
}

const FULL_DATE = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const MONTH_LABEL = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  timeZone: "UTC",
});

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalIsoDate(raw: string | null, label: string): string | null {
  if (raw === null) return null;
  if (!/^(?:19[7-9][0-9]|[2-9][0-9]{3})-[0-9]{2}-[0-9]{2}$/.test(raw)) {
    throw new Error(`${label} must be a canonical date from 1970-01-01 through 9999-12-31.`);
  }
  const parsed = new Date(`${raw}T12:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) {
    throw new Error(`${label} is not a valid Gregorian date.`);
  }
  return raw;
}

function canonicalMonth(raw: string | null): string | null {
  if (raw === null) return null;
  if (!/^(?:19[7-9][0-9]|[2-9][0-9]{3})-(?:0[1-9]|1[0-2])$/.test(raw)) {
    throw new Error("Calendar month must be a canonical month from 1970-01 through 9999-12.");
  }
  return raw;
}

function displayDate(raw: string): string {
  return FULL_DATE.format(new Date(`${raw}T12:00:00.000Z`));
}

function displayMonth(raw: string): string {
  return MONTH_LABEL.format(new Date(`${raw}-15T12:00:00.000Z`));
}

function canonicalSearchQuery(raw: string): string {
  if (typeof raw !== "string") throw new Error("Trade search must be text.");
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(raw)) {
    throw new Error("Trade search cannot contain control characters.");
  }
  const normalized = raw.normalize("NFKC").trim().toLocaleLowerCase("en-US");
  if (Array.from(normalized).length > TRADE_BROWSER_SEARCH_MAX_CODE_POINTS) {
    throw new Error(
      `Trade search cannot exceed ${TRADE_BROWSER_SEARCH_MAX_CODE_POINTS} characters.`,
    );
  }
  return normalized;
}

function canonicalFacet<Value extends string>(
  raw: unknown,
  allowed: readonly Value[],
  label: string,
): Value {
  if (typeof raw !== "string" || !allowed.includes(raw as Value)) {
    throw new Error(`${label} is not a supported trade-card filter.`);
  }
  return raw as Value;
}

function characterCount(value: string): number {
  return [...value].length;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined
      && (codePoint < 32 || (codePoint >= 127 && codePoint <= 159));
  });
}

/** Mirrors the normalized label contract used by prepareTradeReview. */
function normalizedReviewLabel(raw: unknown, label: string): string {
  if (typeof raw !== "string" || hasControlCharacter(raw)) {
    throw new Error(`${label} must use visible single-line text.`);
  }
  const normalized = raw.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    normalized.length === 0
    || characterCount(normalized) > TRADE_REVIEW_LABEL_LIMIT
    || characterCount(normalized.toLocaleLowerCase("en-US")) > TRADE_REVIEW_LABEL_LIMIT
  ) {
    throw new Error(
      `${label} must contain 1-${TRADE_REVIEW_LABEL_LIMIT} visible characters.`,
    );
  }
  return normalized;
}

function canonicalReviewFacet(raw: unknown, label: string): string | null {
  return raw === null ? null : normalizedReviewLabel(raw, label);
}

function validateCurrentReviewLabels(
  raw: unknown,
  label: string,
  tradeSubjectId: string,
): void {
  if (!Array.isArray(raw) || raw.length > TRADE_REVIEW_LIST_LIMIT) {
    throw new Error(
      `Trade ${tradeSubjectId} ${label} must contain at most ${TRADE_REVIEW_LIST_LIMIT} labels.`,
    );
  }
  const identities = new Set<string>();
  for (const value of raw) {
    const normalized = normalizedReviewLabel(
      value,
      `Trade ${tradeSubjectId} ${label} value`,
    );
    if (normalized !== value) {
      throw new Error(`Trade ${tradeSubjectId} ${label} value is not normalized.`);
    }
    const identity = normalized.toLocaleLowerCase("en-US");
    if (identities.has(identity)) {
      throw new Error(`Trade ${tradeSubjectId} ${label} repeats a label.`);
    }
    identities.add(identity);
  }
}

function validateCurrentOptionalReviewLabel(
  raw: unknown,
  label: string,
  tradeSubjectId: string,
): void {
  if (raw === null) return;
  const normalized = normalizedReviewLabel(raw, `Trade ${tradeSubjectId} ${label}`);
  if (normalized !== raw) {
    throw new Error(`Trade ${tradeSubjectId} ${label} is not normalized.`);
  }
}

function freezeMetricEvidence(
  metric: TradePreview["resultRMetric"],
): TradePreview["resultRMetric"] {
  return Object.freeze({
    ...metric,
    numerator: metric.numerator === null
      ? null
      : Object.freeze({ ...metric.numerator }),
    denominator: metric.denominator === null
      ? null
      : Object.freeze({ ...metric.denominator }),
  }) as TradePreview["resultRMetric"];
}

function freezeTradePreview(trade: TradePreview): TradePreview {
  return Object.freeze({
    ...trade,
    resultRMetric: freezeMetricEvidence(trade.resultRMetric),
    percentReturnMetric: freezeMetricEvidence(trade.percentReturnMetric),
    mistakes: Object.freeze([...trade.mistakes]),
    reviewSessionDates: Object.freeze([...trade.reviewSessionDates]),
    tags: Object.freeze([...trade.tags]),
    rules: Object.freeze(trade.rules.map((rule) => Object.freeze({ ...rule }))),
    initialRisk: trade.initialRisk === null
      ? null
      : Object.freeze({ ...trade.initialRisk }),
    executions: Object.freeze(
      trade.executions.map((execution) => Object.freeze({ ...execution })),
    ),
  });
}

function displayNumber(raw: string, label: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} is not finite enough to display.`);
  }
  return value;
}

function validateSnapshotIdentity(snapshot: JournalWorkspaceSnapshot): Map<string, TradePreview> {
  const accounts = new Map<string, string>();
  for (const option of snapshot.accountOptions) {
    if (
      option.id.length === 0
      || option.id.trim() !== option.id
      || option.label.length === 0
      || option.label.trim() !== option.label
      || !Number.isSafeInteger(option.tradeCount)
      || option.tradeCount < 0
    ) {
      throw new Error("Trade browser received an invalid account option.");
    }
    if (accounts.has(option.id)) {
      throw new Error(`Trade browser received duplicate account ID ${option.id}.`);
    }
    accounts.set(option.id, option.label);
  }

  const trades = new Map<string, TradePreview>();
  const counts = new Map<string, number>();
  for (const trade of snapshot.trades) {
    if (trades.has(trade.tradeSubjectId)) {
      throw new Error(`Trade browser received duplicate subject ${trade.tradeSubjectId}.`);
    }
    const accountLabel = accounts.get(trade.accountId);
    if (accountLabel === undefined) {
      throw new Error(
        `Trade ${trade.tradeSubjectId} references unavailable account ${trade.accountId}.`,
      );
    }
    if (accountLabel !== trade.accountLabel) {
      throw new Error(
        `Trade ${trade.tradeSubjectId} account label does not match its stable account.`,
      );
    }
    canonicalFacet(
      trade.assetClass,
      ["stock", "etf"] as const,
      `Trade ${trade.tradeSubjectId} asset class`,
    );
    canonicalFacet(
      trade.side,
      ["long", "short"] as const,
      `Trade ${trade.tradeSubjectId} direction`,
    );
    canonicalFacet(
      trade.status,
      ["open", "closed"] as const,
      `Trade ${trade.tradeSubjectId} position state`,
    );
    canonicalFacet(
      trade.reviewStatus,
      ["pending", "draft", "completed"] as const,
      `Trade ${trade.tradeSubjectId} review state`,
    );
    validateCurrentReviewLabels(trade.mistakes, "mistakes", trade.tradeSubjectId);
    validateCurrentOptionalReviewLabel(trade.emotion, "emotion", trade.tradeSubjectId);
    validateCurrentReviewLabels(trade.tags, "tags", trade.tradeSubjectId);
    trades.set(trade.tradeSubjectId, freezeTradePreview(trade));
    counts.set(trade.accountId, (counts.get(trade.accountId) ?? 0) + 1);
  }
  for (const option of snapshot.accountOptions) {
    if ((counts.get(option.id) ?? 0) !== option.tradeCount) {
      throw new Error(`Account ${option.id} trade count does not reconcile.`);
    }
  }
  return trades;
}

function reviewFacetOptions(
  trades: ReadonlyMap<string, TradePreview>,
): TradeBrowserReviewFacetOptions {
  const mistakes = new Set<string>();
  const emotions = new Set<string>();
  const tags = new Set<string>();
  for (const trade of trades.values()) {
    for (const mistake of trade.mistakes) mistakes.add(mistake);
    if (trade.emotion !== null) emotions.add(trade.emotion);
    for (const tag of trade.tags) tags.add(tag);
  }
  return Object.freeze({
    mistakes: Object.freeze([...mistakes].sort(stableCompare)),
    emotions: Object.freeze([...emotions].sort(stableCompare)),
    tags: Object.freeze([...tags].sort(stableCompare)),
  });
}

function validateSession(
  session: CalendarSession,
  trades: ReadonlyMap<string, TradePreview>,
): void {
  canonicalIsoDate(session.isoDate, "Calendar activity date");
  if (
    !Number.isSafeInteger(session.tradeCount)
    || session.tradeCount <= 0
    || session.tradeCount !== session.contributions.length
  ) {
    throw new Error(`Calendar day ${session.isoDate} has an invalid trade count.`);
  }
  if (!Number.isSafeInteger(session.allocationCount) || session.allocationCount <= 0) {
    throw new Error(`Calendar day ${session.isoDate} has an invalid allocation count.`);
  }
  const subjects = new Set<string>();
  let allocations = 0;
  for (const contribution of session.contributions) {
    if (!trades.has(contribution.tradeSubjectId)) {
      throw new Error(
        `Calendar day ${session.isoDate} references missing trade ${contribution.tradeSubjectId}.`,
      );
    }
    if (subjects.has(contribution.tradeSubjectId)) {
      throw new Error(
        `Calendar day ${session.isoDate} repeats trade ${contribution.tradeSubjectId}.`,
      );
    }
    subjects.add(contribution.tradeSubjectId);
    if (!Number.isSafeInteger(contribution.allocationCount) || contribution.allocationCount <= 0) {
      throw new Error(
        `Calendar trade ${contribution.tradeSubjectId} has an invalid allocation count.`,
      );
    }
    if (
      !Number.isFinite(contribution.pnl)
      || displayNumber(contribution.pnlExact, "Calendar contribution P&L") !== contribution.pnl
    ) {
      throw new Error(
        `Calendar trade ${contribution.tradeSubjectId} has inconsistent P&L.`,
      );
    }
    allocations += contribution.allocationCount;
  }
  if (allocations !== session.allocationCount) {
    throw new Error(`Calendar day ${session.isoDate} allocation count does not reconcile.`);
  }
  if (
    compareSignedDecimals(
      sumSignedDecimals(session.contributions.map((item) => item.pnlExact)),
      session.pnlExact,
    ) !== 0
    || displayNumber(session.pnlExact, "Calendar day P&L") !== session.pnl
  ) {
    throw new Error(`Calendar day ${session.isoDate} P&L does not reconcile.`);
  }
}

function scopeSession(
  session: CalendarSession,
  accountId: string | null,
  trades: ReadonlyMap<string, TradePreview>,
): CalendarSession | null {
  const contributions = session.contributions
    .filter((contribution) => (
      accountId === null || trades.get(contribution.tradeSubjectId)?.accountId === accountId
    ))
    .map((contribution) => Object.freeze({ ...contribution }));
  if (contributions.length === 0) return null;
  const pnlExact = sumSignedDecimals(contributions.map((item) => item.pnlExact));
  const allocationCount = contributions.reduce(
    (sum, contribution) => sum + contribution.allocationCount,
    0,
  );
  return Object.freeze({
    isoDate: session.isoDate,
    dayLabel: session.dayLabel,
    dateLabel: session.dateLabel,
    pnlExact,
    pnl: displayNumber(pnlExact, `Scoped calendar P&L for ${session.isoDate}`),
    tradeCount: contributions.length,
    allocationCount,
    contributions: Object.freeze(contributions),
  });
}

function evidenceForSessions(
  sessions: readonly CalendarSession[],
  trades: ReadonlyMap<string, TradePreview>,
): readonly TradeBrowserEvidence[] {
  const bySubject = new Map<string, {
    pnlExact: string;
    allocationCount: number;
    readonly dates: Set<string>;
  }>();
  for (const session of sessions) {
    for (const contribution of session.contributions) {
      const existing = bySubject.get(contribution.tradeSubjectId);
      if (existing === undefined) {
        bySubject.set(contribution.tradeSubjectId, {
          pnlExact: contribution.pnlExact,
          allocationCount: contribution.allocationCount,
          dates: new Set([session.isoDate]),
        });
      } else {
        existing.pnlExact = addSignedDecimals(existing.pnlExact, contribution.pnlExact);
        existing.allocationCount += contribution.allocationCount;
        existing.dates.add(session.isoDate);
      }
    }
  }
  return Object.freeze(
    [...bySubject.entries()]
      .map(([tradeSubjectId, evidence]) => {
        const trade = trades.get(tradeSubjectId);
        if (trade === undefined) {
          throw new Error(`Scoped evidence references missing trade ${tradeSubjectId}.`);
        }
        return Object.freeze({
          trade,
          contributionPnlExact: evidence.pnlExact,
          contributionPnl: displayNumber(
            evidence.pnlExact,
            `Scoped contribution for ${tradeSubjectId}`,
          ),
          allocationCount: evidence.allocationCount,
          activityDates: Object.freeze([...evidence.dates].sort(stableCompare)),
        });
      })
      .sort((left, right) => (
        stableCompare(right.trade.tradedOn, left.trade.tradedOn)
        || stableCompare(left.trade.tradeSubjectId, right.trade.tradeSubjectId)
      )),
  );
}

function matchesSearch(evidence: TradeBrowserEvidence, query: string): boolean {
  if (query.length === 0) return true;
  const trade = evidence.trade;
  const searchable = [
    trade.symbol,
    trade.accountLabel,
    trade.side,
    trade.status,
    trade.reviewStatus,
    trade.setup,
    trade.emotion ?? "",
    ...trade.mistakes,
    ...trade.tags,
  ].join(" ").normalize("NFKC").toLocaleLowerCase("en-US");
  return searchable.includes(query);
}

function matchesFacets(
  evidence: TradeBrowserEvidence,
  facets: Pick<
    TradeBrowserState,
    | "assetClass"
    | "direction"
    | "positionState"
    | "reviewState"
    | "mistake"
    | "emotion"
    | "tag"
  >,
): boolean {
  const trade = evidence.trade;
  return (facets.assetClass === "all" || trade.assetClass === facets.assetClass)
    && (facets.direction === "all" || trade.side === facets.direction)
    && (facets.positionState === "all" || trade.status === facets.positionState)
    && (facets.reviewState === "all" || trade.reviewStatus === facets.reviewState)
    && (facets.mistake === null || trade.mistakes.includes(facets.mistake))
    && (facets.emotion === null || trade.emotion === facets.emotion)
    && (facets.tag === null || trade.tags.includes(facets.tag));
}

function dateLabel(from: string | null, through: string | null): string {
  if (from === null && through === null) return "All activity dates";
  if (from !== null && through !== null) {
    return from === through
      ? displayDate(from)
      : `${displayDate(from)}–${displayDate(through)}`;
  }
  return from === null
    ? `Through ${displayDate(through as string)}`
    : `From ${displayDate(from)}`;
}

export function buildTradeBrowser(
  snapshot: JournalWorkspaceSnapshot,
  input: TradeBrowserState = EMPTY_TRADE_BROWSER_STATE,
): TradeBrowserResult {
  const trades = validateSnapshotIdentity(snapshot);
  const availableReviewFacets = reviewFacetOptions(trades);
  const activityFrom = canonicalIsoDate(input.activityFrom, "Activity start");
  const activityThrough = canonicalIsoDate(input.activityThrough, "Activity end");
  if (
    activityFrom !== null
    && activityThrough !== null
    && stableCompare(activityFrom, activityThrough) > 0
  ) {
    throw new Error("Activity start must be on or before activity end.");
  }
  if (
    input.accountId !== null
    && !snapshot.accountOptions.some((option) => option.id === input.accountId)
  ) {
    throw new Error("The selected account is no longer available in this journal.");
  }
  const query = canonicalSearchQuery(input.query);
  const assetClass = canonicalFacet(
    input.assetClass,
    ["all", "stock", "etf"] as const,
    "Asset class",
  );
  const direction = canonicalFacet(
    input.direction,
    ["all", "long", "short"] as const,
    "Direction",
  );
  const positionState = canonicalFacet(
    input.positionState,
    ["all", "open", "closed"] as const,
    "Position state",
  );
  const reviewState = canonicalFacet(
    input.reviewState,
    ["all", "pending", "draft", "completed"] as const,
    "Review state",
  );
  const mistake = canonicalReviewFacet(input.mistake, "Mistake filter");
  const emotion = canonicalReviewFacet(input.emotion, "Emotion filter");
  const tag = canonicalReviewFacet(input.tag, "Tag filter");
  const requestedDay = canonicalIsoDate(input.selectedDay, "Selected activity day");
  const requestedMonth = canonicalMonth(input.calendarMonth);

  const seenDates = new Set<string>();
  const scopedCalendar = Object.freeze(
    snapshot.calendar
      .map((session) => {
        validateSession(session, trades);
        if (seenDates.has(session.isoDate)) {
          throw new Error(`Trade browser received duplicate calendar day ${session.isoDate}.`);
        }
        seenDates.add(session.isoDate);
        if (
          (activityFrom !== null && stableCompare(session.isoDate, activityFrom) < 0)
          || (activityThrough !== null && stableCompare(session.isoDate, activityThrough) > 0)
        ) {
          return null;
        }
        return scopeSession(session, input.accountId, trades);
      })
      .filter((session): session is CalendarSession => session !== null)
      .sort((left, right) => stableCompare(left.isoDate, right.isoDate)),
  );

  const selectedSession = requestedDay === null
    ? null
    : scopedCalendar.find((session) => session.isoDate === requestedDay) ?? null;
  const invalidatedSelectedDay = requestedDay !== null && selectedSession === null
    ? requestedDay
    : null;
  const evidenceSessions = requestedDay === null
    ? scopedCalendar
    : selectedSession === null
      ? []
      : [selectedSession];
  const evidence = evidenceForSessions(evidenceSessions, trades);
  const visibleEvidence = Object.freeze(
    evidence.filter((item) => (
      matchesFacets(item, {
        assetClass,
        direction,
        positionState,
        reviewState,
        mistake,
        emotion,
        tag,
      })
      && matchesSearch(item, query)
    )),
  );
  const contributionPnlExact = sumSignedDecimals(
    evidence.map((item) => item.contributionPnlExact),
  );
  const allocationCount = evidence.reduce(
    (sum, item) => sum + item.allocationCount,
    0,
  );

  const months = [...new Set(scopedCalendar.map((session) => session.isoDate.slice(0, 7)))]
    .sort(stableCompare);
  const selectedDayMonth = selectedSession?.isoDate.slice(0, 7) ?? null;
  const month = selectedDayMonth !== null
    ? selectedDayMonth
    : requestedMonth !== null && months.includes(requestedMonth)
      ? requestedMonth
      : months.at(-1) ?? null;
  const monthIndex = month === null ? -1 : months.indexOf(month);
  const monthSessions = month === null
    ? Object.freeze([] as CalendarSession[])
    : Object.freeze(scopedCalendar.filter((session) => session.isoDate.startsWith(`${month}-`)));
  const accountLabel = input.accountId === null
    ? snapshot.accountOptions.length === 0
      ? "No accounts"
      : snapshot.accountOptions.length === 1
        ? snapshot.accountOptions[0]?.label ?? "All accounts"
        : "All accounts"
    : snapshot.accountOptions.find((option) => option.id === input.accountId)?.label
      ?? "Unavailable account";
  const scopeDateLabel = dateLabel(activityFrom, activityThrough);
  const state = Object.freeze({
    accountId: input.accountId,
    activityFrom,
    activityThrough,
    selectedDay: selectedSession?.isoDate ?? null,
    calendarMonth: month,
    query,
    assetClass,
    direction,
    positionState,
    reviewState,
    mistake,
    emotion,
    tag,
  });

  return Object.freeze({
    state,
    invalidatedSelectedDay,
    isFiltered: input.accountId !== null || activityFrom !== null || activityThrough !== null,
    hasViewFilters: query.length > 0
      || assetClass !== "all"
      || direction !== "all"
      || positionState !== "all"
      || reviewState !== "all"
      || mistake !== null
      || emotion !== null
      || tag !== null,
    accountLabel,
    dateLabel: scopeDateLabel,
    scopeLabel: `${accountLabel} · ${scopeDateLabel}`,
    scopedCalendar,
    calendar: Object.freeze({
      month,
      monthLabel: month === null ? "No activity" : displayMonth(month),
      previousMonth: monthIndex > 0 ? months[monthIndex - 1] ?? null : null,
      nextMonth: monthIndex >= 0 && monthIndex < months.length - 1
        ? months[monthIndex + 1] ?? null
        : null,
      sessions: monthSessions,
      scopedSessionCount: scopedCalendar.length,
    }),
    selectedSession,
    reviewFacetOptions: availableReviewFacets,
    evidence,
    visibleEvidence,
    contributionPnlExact,
    contributionPnl: displayNumber(contributionPnlExact, "Scoped activity P&L"),
    allocationCount,
    activityDayCount: evidenceSessions.length,
  });
}
