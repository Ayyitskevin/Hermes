import type {
  JournalWorkspaceSnapshot,
  TradePreview,
  TradeSide,
  TradeStatus,
} from "./types";

export const DIRECTION_MIX_REPORT_VERSION = "direction-mix-report-v1" as const;

const DIRECTION_ORDER = Object.freeze(["long", "short"] as const);
const POSITION_STATUS_VALUES = Object.freeze(["open", "closed"] as const);
const REVIEW_STATUS_VALUES = Object.freeze([
  "pending",
  "draft",
  "completed",
] as const);

/**
 * Canonical count-only report contract. Property and array order are checksum
 * input; changing any semantic requires a new report version.
 */
export const DIRECTION_MIX_REPORT_DEFINITION = Object.freeze({
  version: DIRECTION_MIX_REPORT_VERSION,
  inputs: Object.freeze({
    projection: "current-full-workspace-projection",
    direction: "trade.side",
    evidenceFields: Object.freeze([
      "tradeSubjectId",
      "accountLabel",
      "symbol",
      "side",
      "tradedOn",
      "sessionLabel",
      "status",
      "reviewStatus",
    ] as const),
    tradeBrowserScope: "not-consumed",
    reviewAuthoredContent: "not-consumed;reviewStatus-is-evidence-only",
    resultFields: "not-consumed",
  }),
  cohort: Object.freeze({
    inclusion: "every-current-projection-trade-exactly-once",
    exclusions: "none",
    subjectIdentity:
      "tradeSubjectId:1-256-trimmed-C0-C1-free-and-unique-across-current-projection-or-throw",
    conservation: "sum(group.tradeCount)=totalTradeCount",
  }),
  directionValidation: Object.freeze({
    allowed: DIRECTION_ORDER,
    invalidInput: "throw;never-repair-drop-or-default",
  }),
  evidenceValidation: Object.freeze({
    positionStatusAllowed: POSITION_STATUS_VALUES,
    reviewStatusAllowed: REVIEW_STATUS_VALUES,
    invalidInput: "throw;never-repair-drop-or-default",
  }),
  groupOrder: "fixed:long-then-short",
  evidenceOrder: Object.freeze([
    "tradedOn:descending",
    "tradeSubjectId:ascending",
  ] as const),
  counting: Object.freeze({
    groupTradeCount: "count(current-trades-with-exact-direction)",
    assignmentCardinality: "one-direction-group-per-current-trade",
    rates: "not-calculated",
  }),
  migration: Object.freeze({
    decision: "derived-only-recompute",
    archiveShapeChange: false,
    exportCompatibility: "existing-archives-retain-inputs;current-runtime-recomputes",
  }),
});

export const DIRECTION_MIX_REPORT_DEFINITION_CANONICAL_JSON = JSON.stringify(
  DIRECTION_MIX_REPORT_DEFINITION,
);

/** Pinned SHA-256 of DIRECTION_MIX_REPORT_DEFINITION_CANONICAL_JSON. */
export const DIRECTION_MIX_REPORT_DEFINITION_SHA256 =
  "0a55af9905699cc62746c99b5b4e7dd664588d8b526eefb207e9fb2bb77b3ab2" as const;

export interface DirectionMixTradeEvidence {
  readonly tradeSubjectId: string;
  readonly accountLabel: string;
  readonly symbol: string;
  readonly side: TradeSide;
  readonly tradedOn: string;
  readonly sessionLabel: string;
  readonly status: TradeStatus;
  readonly reviewStatus: TradePreview["reviewStatus"];
}

export interface DirectionMixGroup {
  readonly direction: TradeSide;
  readonly tradeCount: number;
  readonly tradeSubjectIds: readonly string[];
  readonly evidence: readonly DirectionMixTradeEvidence[];
}

export interface DirectionMixReportMetadata {
  readonly version: typeof DIRECTION_MIX_REPORT_VERSION;
  readonly definitionSha256: typeof DIRECTION_MIX_REPORT_DEFINITION_SHA256;
  readonly timeZone: string;
  readonly accountLabel: string;
  readonly periodLabel: string;
  readonly totalTradeCount: number;
}

export interface DirectionMixReport {
  readonly metadata: DirectionMixReportMetadata;
  readonly groups: readonly DirectionMixGroup[];
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function evidenceCompare(
  left: DirectionMixTradeEvidence,
  right: DirectionMixTradeEvidence,
): number {
  return stableCompare(right.tradedOn, left.tradedOn)
    || stableCompare(left.tradeSubjectId, right.tradeSubjectId);
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

function validatedReviewStatus(
  trade: TradePreview,
): TradePreview["reviewStatus"] {
  const reviewStatus: unknown = trade.reviewStatus;
  if (
    reviewStatus !== "pending"
    && reviewStatus !== "draft"
    && reviewStatus !== "completed"
  ) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} review status must be exactly pending, draft, or completed.`,
    );
  }
  return reviewStatus;
}

function evidenceFromTrade(
  trade: TradePreview,
  direction: TradeSide,
): DirectionMixTradeEvidence {
  return Object.freeze({
    tradeSubjectId: trade.tradeSubjectId,
    accountLabel: trade.accountLabel,
    symbol: trade.symbol,
    side: direction,
    tradedOn: trade.tradedOn,
    sessionLabel: trade.sessionLabel,
    status: validatedPositionStatus(trade),
    reviewStatus: validatedReviewStatus(trade),
  });
}

function buildGroup(
  direction: TradeSide,
  evidence: readonly DirectionMixTradeEvidence[],
): DirectionMixGroup {
  const orderedEvidence = Object.freeze([...evidence].sort(evidenceCompare));
  const tradeSubjectIds = Object.freeze(
    orderedEvidence.map((trade) => trade.tradeSubjectId),
  );
  return Object.freeze({
    direction,
    tradeCount: orderedEvidence.length,
    tradeSubjectIds,
    evidence: orderedEvidence,
  });
}

export function buildDirectionMixReport(
  snapshot: JournalWorkspaceSnapshot,
): DirectionMixReport {
  const evidenceByDirection: Record<TradeSide, DirectionMixTradeEvidence[]> = {
    long: [],
    short: [],
  };
  const tradeSubjectIds = new Set<string>();

  for (const trade of snapshot.trades) {
    if (
      !isValidStableIdentifier(trade.tradeSubjectId)
      || tradeSubjectIds.has(trade.tradeSubjectId)
    ) {
      throw new Error(
        "Direction-mix trades require 1-256 character trimmed, control-free, unique subject identities.",
      );
    }
    tradeSubjectIds.add(trade.tradeSubjectId);
    const direction = validatedDirection(trade);
    evidenceByDirection[direction].push(evidenceFromTrade(trade, direction));
  }

  const groups = Object.freeze(
    DIRECTION_ORDER.map((direction) => (
      buildGroup(direction, evidenceByDirection[direction])
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
    throw new Error("Direction-mix report counts do not conserve their source trades.");
  }

  const metadata: DirectionMixReportMetadata = Object.freeze({
    version: DIRECTION_MIX_REPORT_VERSION,
    definitionSha256: DIRECTION_MIX_REPORT_DEFINITION_SHA256,
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
