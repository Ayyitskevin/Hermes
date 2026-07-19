import type {
  JournalWorkspaceSnapshot,
  TradePreview,
  TradeSide,
  TradeStatus,
} from "./types";

export const SYMBOL_BREAKDOWN_REPORT_VERSION =
  "symbol-breakdown-report-v1" as const;

const ASSET_CLASS_ORDER = Object.freeze(["stock", "etf"] as const);
const TRADE_SIDE_VALUES = Object.freeze(["long", "short"] as const);
const POSITION_STATUS_VALUES = Object.freeze(["open", "closed"] as const);
const REVIEW_STATUS_VALUES = Object.freeze([
  "pending",
  "draft",
  "completed",
] as const);
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9._:/-]{0,31}$/u;

/**
 * Canonical count-only report contract. Property and array order are checksum
 * input; changing any semantic requires a new report version.
 */
export const SYMBOL_BREAKDOWN_REPORT_DEFINITION = Object.freeze({
  version: SYMBOL_BREAKDOWN_REPORT_VERSION,
  inputs: Object.freeze({
    projection: "current-full-workspace-projection",
    groupIdentity: "trade.assetClass+trade.symbol",
    evidenceFields: Object.freeze([
      "tradeSubjectId",
      "accountLabel",
      "symbol",
      "assetClass",
      "side",
      "tradedOn",
      "sessionLabel",
      "status",
      "reviewStatus",
    ] as const),
    tradeBrowserScope: "not-consumed",
    dailyJournal: "not-consumed",
    reviewAuthoredContent: "not-consumed;reviewStatus-is-evidence-only",
    resultFields: "not-consumed",
  }),
  cohort: Object.freeze({
    inclusion: "every-current-projection-trade-exactly-once",
    exclusions: "none",
    subjectIdentity:
      "tradeSubjectId:1-256-trimmed-C0-C1-free-and-unique-across-current-projection-or-throw",
    conservation:
      "sum(group.tradeCount)=totalTradeCount;sum(group.evidence.length)=totalTradeCount",
  }),
  symbolValidation: Object.freeze({
    canonical: "uppercase-1-32:A-Z0-9._:/-",
    identity: "exact-assetClass+symbol",
    invalidInput: "throw;never-normalize-repair-drop-or-default",
  }),
  assetClassValidation: Object.freeze({
    allowed: ASSET_CLASS_ORDER,
    invalidInput: "throw;never-repair-drop-or-default",
  }),
  sideValidation: Object.freeze({
    allowed: TRADE_SIDE_VALUES,
    invalidInput: "throw;never-repair-drop-or-default",
  }),
  dateValidation: Object.freeze({
    field: "trade.tradedOn",
    format:
      "real-Gregorian-YYYY-MM-DD-from-1970-01-01-through-9999-12-31",
    invalidInput: "throw;never-repair-drop-or-default",
  }),
  evidenceValidation: Object.freeze({
    positionStatusAllowed: POSITION_STATUS_VALUES,
    reviewStatusAllowed: REVIEW_STATUS_VALUES,
    invalidInput: "throw;never-repair-drop-or-default",
  }),
  groupOrder: "symbol:ascending-code-unit;assetClass:fixed-stock-then-etf",
  evidenceOrder: Object.freeze([
    "tradedOn:descending",
    "tradeSubjectId:ascending",
  ] as const),
  counting: Object.freeze({
    groupTradeCount: "count(current-trades-with-exact-assetClass+symbol)",
    assignmentCardinality: "one-symbol-asset-group-per-current-trade",
    rates: "not-calculated",
    financialValues: "not-calculated",
    rankings: "not-calculated",
  }),
  migration: Object.freeze({
    decision: "derived-only-recompute",
    archiveShapeChange: false,
    exportCompatibility:
      "existing-archives-retain-inputs;current-runtime-recomputes",
  }),
});

export const SYMBOL_BREAKDOWN_REPORT_DEFINITION_CANONICAL_JSON = JSON.stringify(
  SYMBOL_BREAKDOWN_REPORT_DEFINITION,
);

/** Pinned SHA-256 of SYMBOL_BREAKDOWN_REPORT_DEFINITION_CANONICAL_JSON. */
export const SYMBOL_BREAKDOWN_REPORT_DEFINITION_SHA256 =
  "33c47664633d24b75a80cde1dfac46e366f2e04ecccc852ce807792743cb8aef" as const;

type TradeAssetClass = TradePreview["assetClass"];

export interface SymbolBreakdownTradeEvidence {
  readonly tradeSubjectId: string;
  readonly accountLabel: string;
  readonly symbol: string;
  readonly assetClass: TradeAssetClass;
  readonly side: TradeSide;
  readonly tradedOn: string;
  readonly sessionLabel: string;
  readonly status: TradeStatus;
  readonly reviewStatus: TradePreview["reviewStatus"];
}

export interface SymbolBreakdownGroup {
  readonly symbol: string;
  readonly assetClass: TradeAssetClass;
  readonly tradeCount: number;
  readonly tradeSubjectIds: readonly string[];
  readonly evidence: readonly SymbolBreakdownTradeEvidence[];
}

export interface SymbolBreakdownReportMetadata {
  readonly version: typeof SYMBOL_BREAKDOWN_REPORT_VERSION;
  readonly definitionSha256: typeof SYMBOL_BREAKDOWN_REPORT_DEFINITION_SHA256;
  readonly timeZone: string;
  readonly accountLabel: string;
  readonly periodLabel: string;
  readonly totalTradeCount: number;
  readonly totalGroupCount: number;
}

export interface SymbolBreakdownReport {
  readonly metadata: SymbolBreakdownReportMetadata;
  readonly groups: readonly SymbolBreakdownGroup[];
}

interface MutableSymbolGroup {
  readonly symbol: string;
  readonly assetClass: TradeAssetClass;
  readonly evidence: SymbolBreakdownTradeEvidence[];
}

interface CapturedSymbolBreakdownTrade {
  readonly tradeSubjectId: TradePreview["tradeSubjectId"];
  readonly accountLabel: TradePreview["accountLabel"];
  readonly symbol: TradePreview["symbol"];
  readonly assetClass: TradePreview["assetClass"];
  readonly side: TradePreview["side"];
  readonly tradedOn: TradePreview["tradedOn"];
  readonly sessionLabel: TradePreview["sessionLabel"];
  readonly status: TradePreview["status"];
  readonly reviewStatus: TradePreview["reviewStatus"];
}

function ownSnapshotDataValue<Key extends keyof JournalWorkspaceSnapshot>(
  snapshot: JournalWorkspaceSnapshot,
  key: Key,
): JournalWorkspaceSnapshot[Key] {
  const descriptor = Object.getOwnPropertyDescriptor(snapshot, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new Error(
      "Symbol-breakdown snapshot inputs must use own data properties.",
    );
  }
  return descriptor.value as JournalWorkspaceSnapshot[Key];
}

function ownTradeDataValue<Key extends keyof TradePreview>(
  trade: TradePreview,
  key: Key,
): TradePreview[Key] {
  const descriptor = Object.getOwnPropertyDescriptor(trade, key);
  if (descriptor === undefined || !("value" in descriptor)) {
    throw new Error(
      "Symbol-breakdown trade evidence must use own data properties.",
    );
  }
  return descriptor.value as TradePreview[Key];
}

function captureTrade(trade: TradePreview): CapturedSymbolBreakdownTrade {
  return {
    tradeSubjectId: ownTradeDataValue(trade, "tradeSubjectId"),
    accountLabel: ownTradeDataValue(trade, "accountLabel"),
    symbol: ownTradeDataValue(trade, "symbol"),
    assetClass: ownTradeDataValue(trade, "assetClass"),
    side: ownTradeDataValue(trade, "side"),
    tradedOn: ownTradeDataValue(trade, "tradedOn"),
    sessionLabel: ownTradeDataValue(trade, "sessionLabel"),
    status: ownTradeDataValue(trade, "status"),
    reviewStatus: ownTradeDataValue(trade, "reviewStatus"),
  };
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assetClassPosition(assetClass: TradeAssetClass): number {
  return assetClass === "stock" ? 0 : 1;
}

function groupCompare(
  left: Pick<SymbolBreakdownGroup, "symbol" | "assetClass">,
  right: Pick<SymbolBreakdownGroup, "symbol" | "assetClass">,
): number {
  return stableCompare(left.symbol, right.symbol)
    || assetClassPosition(left.assetClass) - assetClassPosition(right.assetClass);
}

function evidenceCompare(
  left: SymbolBreakdownTradeEvidence,
  right: SymbolBreakdownTradeEvidence,
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

function validatedSymbol(trade: CapturedSymbolBreakdownTrade): string {
  const symbol: unknown = trade.symbol;
  if (typeof symbol !== "string" || !SYMBOL_PATTERN.test(symbol)) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} symbol must be canonical uppercase text using 1-32 letters, digits, dots, slashes, colons, underscores, or hyphens.`,
    );
  }
  return symbol;
}

function validatedAssetClass(
  trade: CapturedSymbolBreakdownTrade,
): TradeAssetClass {
  const assetClass: unknown = trade.assetClass;
  if (assetClass !== "stock" && assetClass !== "etf") {
    throw new Error(
      `Trade ${trade.tradeSubjectId} asset class must be exactly stock or etf.`,
    );
  }
  return assetClass;
}

function validatedSide(trade: CapturedSymbolBreakdownTrade): TradeSide {
  const side: unknown = trade.side;
  if (side !== "long" && side !== "short") {
    throw new Error(
      `Trade ${trade.tradeSubjectId} direction must be exactly long or short.`,
    );
  }
  return side;
}

function validatedTradedOn(trade: CapturedSymbolBreakdownTrade): string {
  const tradedOn: unknown = trade.tradedOn;
  if (
    typeof tradedOn !== "string"
    || !/^(?:19[7-9][0-9]|[2-9][0-9]{3})-[0-9]{2}-[0-9]{2}$/.test(
      tradedOn,
    )
  ) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} traded date must be canonical YYYY-MM-DD from 1970 through 9999.`,
    );
  }
  const date = new Date(`${tradedOn}T12:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime())
    || date.toISOString().slice(0, 10) !== tradedOn
  ) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} traded date must be a real Gregorian date.`,
    );
  }
  return tradedOn;
}

function validatedPositionStatus(
  trade: CapturedSymbolBreakdownTrade,
): TradeStatus {
  const status: unknown = trade.status;
  if (status !== "open" && status !== "closed") {
    throw new Error(
      `Trade ${trade.tradeSubjectId} position status must be exactly open or closed.`,
    );
  }
  return status;
}

function validatedReviewStatus(
  trade: CapturedSymbolBreakdownTrade,
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
  trade: CapturedSymbolBreakdownTrade,
  symbol: string,
  assetClass: TradeAssetClass,
): SymbolBreakdownTradeEvidence {
  return Object.freeze({
    tradeSubjectId: trade.tradeSubjectId,
    accountLabel: trade.accountLabel,
    symbol,
    assetClass,
    side: validatedSide(trade),
    tradedOn: validatedTradedOn(trade),
    sessionLabel: trade.sessionLabel,
    status: validatedPositionStatus(trade),
    reviewStatus: validatedReviewStatus(trade),
  });
}

function buildGroup(group: MutableSymbolGroup): SymbolBreakdownGroup {
  const orderedEvidence = Object.freeze([...group.evidence].sort(evidenceCompare));
  const tradeSubjectIds = Object.freeze(
    orderedEvidence.map((trade) => trade.tradeSubjectId),
  );
  return Object.freeze({
    symbol: group.symbol,
    assetClass: group.assetClass,
    tradeCount: orderedEvidence.length,
    tradeSubjectIds,
    evidence: orderedEvidence,
  });
}

export function buildSymbolBreakdownReport(
  snapshot: JournalWorkspaceSnapshot,
): SymbolBreakdownReport {
  const sourceTradeCollection = ownSnapshotDataValue(snapshot, "trades");
  const timeZone = ownSnapshotDataValue(snapshot, "timeZone");
  const accountLabel = ownSnapshotDataValue(snapshot, "accountLabel");
  const periodLabel = ownSnapshotDataValue(snapshot, "periodLabel");
  const sourceLengthDescriptor = Object.getOwnPropertyDescriptor(
    sourceTradeCollection,
    "length",
  );
  if (
    !Array.isArray(sourceTradeCollection)
    || sourceLengthDescriptor === undefined
    || !("value" in sourceLengthDescriptor)
    || !Number.isSafeInteger(sourceLengthDescriptor.value)
    || sourceLengthDescriptor.value < 0
  ) {
    throw new Error(
      "Symbol-breakdown source trades must be a dense indexed data cohort.",
    );
  }
  const sourceTradeCount = sourceLengthDescriptor.value as number;
  const sourceTradeReferences: TradePreview[] = [];
  for (let index = 0; index < sourceTradeCount; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(
      sourceTradeCollection,
      index,
    );
    if (
      descriptor === undefined
      || !("value" in descriptor)
      || descriptor.value === undefined
    ) {
      throw new Error(
        "Symbol-breakdown source trades must be a dense indexed data cohort.",
      );
    }
    sourceTradeReferences.push(descriptor.value as TradePreview);
  }
  const sourceTrades = sourceTradeReferences.map(captureTrade);
  const mutableGroups = new Map<string, MutableSymbolGroup>();
  const tradeSubjectIds = new Set<string>();

  for (const trade of sourceTrades) {
    if (
      !isValidStableIdentifier(trade.tradeSubjectId)
      || tradeSubjectIds.has(trade.tradeSubjectId)
    ) {
      throw new Error(
        "Symbol-breakdown trades require 1-256 character trimmed, control-free, unique subject identities.",
      );
    }
    tradeSubjectIds.add(trade.tradeSubjectId);

    const symbol = validatedSymbol(trade);
    const assetClass = validatedAssetClass(trade);
    const groupKey = `${assetClass}\u0000${symbol}`;
    const existing = mutableGroups.get(groupKey);
    const evidence = evidenceFromTrade(trade, symbol, assetClass);
    if (existing === undefined) {
      mutableGroups.set(groupKey, { symbol, assetClass, evidence: [evidence] });
    } else {
      existing.evidence.push(evidence);
    }
  }

  const groups = Object.freeze(
    [...mutableGroups.values()].map(buildGroup).sort(groupCompare),
  );
  const groupedTradeCount = groups.reduce(
    (total, group) => total + group.tradeCount,
    0,
  );
  const groupedEvidenceCount = groups.reduce(
    (total, group) => total + group.evidence.length,
    0,
  );
  const groupedTradeSubjectIds = groups.flatMap(
    (group) => group.tradeSubjectIds,
  );
  if (
    tradeSubjectIds.size !== sourceTrades.length
    || groupedTradeCount !== sourceTrades.length
    || groupedEvidenceCount !== sourceTrades.length
    || groupedTradeSubjectIds.length !== sourceTrades.length
    || new Set(groupedTradeSubjectIds).size !== sourceTrades.length
    || groups.some((group) => (
      group.tradeCount !== group.tradeSubjectIds.length
      || group.tradeCount !== group.evidence.length
      || group.evidence.some((evidence, index) => (
        evidence.tradeSubjectId !== group.tradeSubjectIds[index]
        || evidence.symbol !== group.symbol
        || evidence.assetClass !== group.assetClass
      ))
    ))
  ) {
    throw new Error(
      "Symbol-breakdown report groups and evidence do not conserve their source trades.",
    );
  }

  const metadata: SymbolBreakdownReportMetadata = Object.freeze({
    version: SYMBOL_BREAKDOWN_REPORT_VERSION,
    definitionSha256: SYMBOL_BREAKDOWN_REPORT_DEFINITION_SHA256,
    timeZone,
    accountLabel,
    periodLabel,
    totalTradeCount: sourceTrades.length,
    totalGroupCount: groups.length,
  });

  return Object.freeze({
    metadata,
    groups,
  });
}
