import type {
  JournalWorkspaceSnapshot,
  TradePreview,
  TradeSide,
  TradeStatus,
} from "./types";

export const OPENING_WEEKDAY_MIX_REPORT_VERSION =
  "opening-weekday-mix-report-v1" as const;

export const OPENING_WEEKDAY_ORDER = Object.freeze([
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const);

export type OpeningWeekday = (typeof OPENING_WEEKDAY_ORDER)[number];

const WEEKDAY_BY_UTC_DAY = Object.freeze([
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const);

/**
 * Canonical count-only report contract. Property and array order are checksum
 * input; changing any semantic requires a new report version.
 */
export const OPENING_WEEKDAY_MIX_REPORT_DEFINITION = Object.freeze({
  version: OPENING_WEEKDAY_MIX_REPORT_VERSION,
  inputs: Object.freeze({
    projection: "current-full-workspace-projection",
    openingDate:
      "trade.tradedOn:workspace-local-opening-date-derived-from-ledger-openedAtUs",
    timeZone:
      "snapshot.timeZone:opening-date-context-only;weekday-is-derived-from-canonical-date",
    evidenceFields: Object.freeze([
      "tradeSubjectId",
      "accountLabel",
      "symbol",
      "side",
      "tradedOn",
      "sessionLabel",
      "status",
      "openingWeekday",
    ] as const),
    tradeBrowserScope: "not-consumed",
    reviewStateAndAuthoredContent: "not-consumed",
    resultFields: "not-consumed",
  }),
  cohort: Object.freeze({
    inclusion: "every-current-projection-trade-exactly-once",
    exclusions: "none",
    subjectIdentity:
      "tradeSubjectId:1-256-trimmed-C0-C1-free-and-unique-across-current-projection-or-throw",
    conservation: "sum(group.tradeCount)=totalTradeCount",
  }),
  openingDateValidation: Object.freeze({
    format: "real-Gregorian-YYYY-MM-DD-from-1970-01-01-through-9999-12-31",
    meaning: "workspace-local-calendar-date-of-first-entry-allocation",
    invalidInput: "throw;never-repair-drop-or-default",
  }),
  evidenceValidation: Object.freeze({
    directionAllowed: Object.freeze(["long", "short"] as const),
    positionStatusAllowed: Object.freeze(["open", "closed"] as const),
    invalidInput: "throw;never-repair-drop-or-default",
  }),
  groupOrder: "fixed:monday-through-sunday;all-seven-groups-always-present",
  evidenceOrder: Object.freeze([
    "tradedOn:descending",
    "tradeSubjectId:ascending",
  ] as const),
  counting: Object.freeze({
    groupTradeCount: "count(current-trades-with-exact-opening-weekday)",
    assignmentCardinality: "one-opening-weekday-group-per-current-trade",
    rates: "not-calculated",
  }),
  migration: Object.freeze({
    decision: "derived-only-recompute",
    archiveShapeChange: false,
    exportCompatibility:
      "existing-archives-retain-inputs;current-runtime-recomputes",
  }),
});

export const OPENING_WEEKDAY_MIX_REPORT_DEFINITION_CANONICAL_JSON =
  JSON.stringify(OPENING_WEEKDAY_MIX_REPORT_DEFINITION);

/** Pinned SHA-256 of OPENING_WEEKDAY_MIX_REPORT_DEFINITION_CANONICAL_JSON. */
export const OPENING_WEEKDAY_MIX_REPORT_DEFINITION_SHA256 =
  "6f205c00826d547f1f0640bec0acceac836e707c4a95287d2e35f4ae62e01cf8" as const;

export interface OpeningWeekdayMixTradeEvidence {
  readonly tradeSubjectId: string;
  readonly accountLabel: string;
  readonly symbol: string;
  readonly side: TradeSide;
  readonly tradedOn: string;
  readonly sessionLabel: string;
  readonly status: TradeStatus;
  readonly openingWeekday: OpeningWeekday;
}

export interface OpeningWeekdayMixGroup {
  readonly weekday: OpeningWeekday;
  readonly tradeCount: number;
  readonly tradeSubjectIds: readonly string[];
  readonly evidence: readonly OpeningWeekdayMixTradeEvidence[];
}

export interface OpeningWeekdayMixReportMetadata {
  readonly version: typeof OPENING_WEEKDAY_MIX_REPORT_VERSION;
  readonly definitionSha256:
    typeof OPENING_WEEKDAY_MIX_REPORT_DEFINITION_SHA256;
  readonly timeZone: string;
  readonly accountLabel: string;
  readonly periodLabel: string;
  readonly totalTradeCount: number;
}

export interface OpeningWeekdayMixReport {
  readonly metadata: OpeningWeekdayMixReportMetadata;
  readonly groups: readonly OpeningWeekdayMixGroup[];
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

function openingWeekday(trade: TradePreview): {
  readonly tradedOn: string;
  readonly weekday: OpeningWeekday;
} {
  const tradedOn: unknown = trade.tradedOn;
  if (
    typeof tradedOn !== "string"
    || !/^(?:19[7-9][0-9]|[2-9][0-9]{3})-[0-9]{2}-[0-9]{2}$/.test(
      tradedOn,
    )
  ) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} opening date must be canonical YYYY-MM-DD from 1970 through 9999.`,
    );
  }
  const date = new Date(`${tradedOn}T12:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== tradedOn
  ) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} opening date must be a real Gregorian date.`,
    );
  }
  const weekday = WEEKDAY_BY_UTC_DAY[date.getUTCDay()];
  if (weekday === undefined) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} opening weekday could not be derived.`,
    );
  }
  return { tradedOn, weekday };
}

function validatedDirection(trade: TradePreview): TradeSide {
  const direction: unknown = trade.side;
  if (direction !== "long" && direction !== "short") {
    throw new Error(
      `Trade ${trade.tradeSubjectId} direction must be exactly long or short.`,
    );
  }
  return direction;
}

function validatedPositionStatus(trade: TradePreview): TradeStatus {
  const status: unknown = trade.status;
  if (status !== "open" && status !== "closed") {
    throw new Error(
      `Trade ${trade.tradeSubjectId} position status must be exactly open or closed.`,
    );
  }
  return status;
}

function evidenceFromTrade(
  trade: TradePreview,
  tradedOn: string,
  weekday: OpeningWeekday,
): OpeningWeekdayMixTradeEvidence {
  return Object.freeze({
    tradeSubjectId: trade.tradeSubjectId,
    accountLabel: trade.accountLabel,
    symbol: trade.symbol,
    side: validatedDirection(trade),
    tradedOn,
    sessionLabel: trade.sessionLabel,
    status: validatedPositionStatus(trade),
    openingWeekday: weekday,
  });
}

function evidenceCompare(
  left: OpeningWeekdayMixTradeEvidence,
  right: OpeningWeekdayMixTradeEvidence,
): number {
  return stableCompare(right.tradedOn, left.tradedOn)
    || stableCompare(left.tradeSubjectId, right.tradeSubjectId);
}

function buildGroup(
  weekday: OpeningWeekday,
  evidence: readonly OpeningWeekdayMixTradeEvidence[],
): OpeningWeekdayMixGroup {
  const orderedEvidence = Object.freeze([...evidence].sort(evidenceCompare));
  return Object.freeze({
    weekday,
    tradeCount: orderedEvidence.length,
    tradeSubjectIds: Object.freeze(
      orderedEvidence.map((trade) => trade.tradeSubjectId),
    ),
    evidence: orderedEvidence,
  });
}

export function buildOpeningWeekdayMixReport(
  snapshot: JournalWorkspaceSnapshot,
): OpeningWeekdayMixReport {
  const evidenceByWeekday: Record<
    OpeningWeekday,
    OpeningWeekdayMixTradeEvidence[]
  > = {
    monday: [],
    tuesday: [],
    wednesday: [],
    thursday: [],
    friday: [],
    saturday: [],
    sunday: [],
  };
  const tradeSubjectIds = new Set<string>();

  for (const trade of snapshot.trades) {
    if (
      !isValidStableIdentifier(trade.tradeSubjectId)
      || tradeSubjectIds.has(trade.tradeSubjectId)
    ) {
      throw new Error(
        "Opening-weekday trades require 1-256 character trimmed, control-free, unique subject identities.",
      );
    }
    tradeSubjectIds.add(trade.tradeSubjectId);
    const opening = openingWeekday(trade);
    evidenceByWeekday[opening.weekday].push(
      evidenceFromTrade(trade, opening.tradedOn, opening.weekday),
    );
  }

  const groups = Object.freeze(
    OPENING_WEEKDAY_ORDER.map((weekday) => (
      buildGroup(weekday, evidenceByWeekday[weekday])
    )),
  );
  const groupedTradeCount = groups.reduce(
    (total, group) => total + group.tradeCount,
    0,
  );
  if (
    tradeSubjectIds.size !== snapshot.trades.length
    || groupedTradeCount !== snapshot.trades.length
  ) {
    throw new Error(
      "Opening-weekday report counts do not conserve their source trades.",
    );
  }

  const metadata: OpeningWeekdayMixReportMetadata = Object.freeze({
    version: OPENING_WEEKDAY_MIX_REPORT_VERSION,
    definitionSha256: OPENING_WEEKDAY_MIX_REPORT_DEFINITION_SHA256,
    timeZone: snapshot.timeZone,
    accountLabel: snapshot.accountLabel,
    periodLabel: snapshot.periodLabel,
    totalTradeCount: snapshot.trades.length,
  });

  return Object.freeze({
    metadata,
    groups,
  });
}
