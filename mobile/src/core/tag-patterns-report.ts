import type {
  JournalWorkspaceSnapshot,
  TradePreview,
  TradeSide,
} from "./types";

export const TAG_PATTERNS_REPORT_VERSION = "tag-patterns-report-v1" as const;

/**
 * Canonical count-only report contract. Property and array order are checksum
 * input; changing any semantic requires a new report version.
 */
export const TAG_PATTERNS_REPORT_DEFINITION = Object.freeze({
  version: TAG_PATTERNS_REPORT_VERSION,
  inputs: Object.freeze({
    projection: "current-projection",
    reviews: "current-review-heads",
    tags: "current-completed-review.tags[]",
    labelIdentity: "exact-canonical-stored-display-string",
  }),
  cohort: Object.freeze({
    exclusionPrecedence: Object.freeze([
      "review-status-not-completed=>incompleteReview",
      "completed-with-no-tag-assignment=>noTagAssigned",
    ] as const),
    inclusion: "current-projection+completed-review+at-least-one-exact-tag-assignment",
    subjectIdentity: "tradeSubjectId:1-256-trimmed-C0-C1-free-and-unique-across-current-projection-or-throw",
    reviewHeadIdentity: "completed=>reviewId:1-256-trimmed-C0-C1-free-and-unique+positive-safe-reviewVersion;incoherent=>throw",
    uniqueTradeConservation: "includedTradeCount+exclusions=totalTradeCount",
    assignmentConservation: "each-exact-label-assignment-counts-once;one-trade-may-count-in-multiple-groups",
    withinTradeUniqueness: "saved-review-case-folded-identity-is-unique",
  }),
  labelValidation: Object.freeze({
    normalization: "NFC+trim+collapse-whitespace",
    content: "C0-C1-control-free-single-line-text",
    maximumCodePoints: 120,
    maximumAssignmentsPerTrade: 20,
    identityFold: "toLocaleLowerCase(en-US)",
    canonicalDisplay: "one-exact-label-per-folded-identity-across-current-completed-reviews",
    invalidInput: "throw;never-normalize-dedupe-or-drop",
  }),
  groupOrder: "tag-name:ascending-code-unit",
  counting: Object.freeze({
    includedTradeCount: "count(included-current-trades)",
    totalAssignmentCount: "sum(included-trade.tags.length)",
    groupAssignmentCount: "count(exact-tag-label-assignments)",
    reconciliation: "sum(group.assignmentCount)=totalAssignmentCount",
  }),
  evidenceOrder: Object.freeze([
    "tradedOn:descending",
    "tradeSubjectId:ascending",
  ] as const),
  migration: Object.freeze({
    decision: "derived-only-recompute",
    archiveShapeChange: false,
    exportCompatibility: "existing-archives-retain-inputs;current-runtime-recomputes",
  }),
});

export const TAG_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON = JSON.stringify(
  TAG_PATTERNS_REPORT_DEFINITION,
);

/** Pinned SHA-256 of TAG_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON. */
export const TAG_PATTERNS_REPORT_DEFINITION_SHA256 =
  "ad24da67086c74558203d89b9fe27f2d8907f6170b29fa5320e0aada88405c27" as const;

export interface TagPatternTradeEvidence {
  readonly tradeSubjectId: string;
  readonly accountLabel: string;
  readonly symbol: string;
  readonly side: TradeSide;
  readonly tradedOn: string;
  readonly sessionLabel: string;
  readonly tag: string;
}

export interface TagPatternGroup {
  readonly tag: string;
  readonly assignmentCount: number;
  readonly tradeSubjectIds: readonly string[];
  readonly evidence: readonly TagPatternTradeEvidence[];
}

export interface TagPatternsExclusionCounts {
  readonly incompleteReview: number;
  readonly noTagAssigned: number;
}

export interface TagPatternsReportMetadata {
  readonly version: typeof TAG_PATTERNS_REPORT_VERSION;
  readonly definitionSha256: typeof TAG_PATTERNS_REPORT_DEFINITION_SHA256;
  readonly timeZone: string;
  readonly accountLabel: string;
  readonly periodLabel: string;
  readonly totalTradeCount: number;
  readonly includedTradeCount: number;
  readonly totalAssignmentCount: number;
  readonly exclusions: TagPatternsExclusionCounts;
}

export interface TagPatternsReport {
  readonly metadata: TagPatternsReportMetadata;
  readonly groups: readonly TagPatternGroup[];
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function evidenceCompare(
  left: TagPatternTradeEvidence,
  right: TagPatternTradeEvidence,
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

function validatedTags(
  trade: TradePreview,
  canonicalLabelByIdentity: Map<string, string>,
): readonly string[] {
  const raw: unknown = trade.tags;
  if (!Array.isArray(raw) || raw.length > 20) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} tags must contain at most 20 labels.`,
    );
  }
  const identities = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string" || hasControlCharacter(value)) {
      throw new Error(
        `Trade ${trade.tradeSubjectId} tag labels must be C0/C1-control-free single-line text.`,
      );
    }
    const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
    const identity = normalized.toLocaleLowerCase("en-US");
    if (
      normalized.length === 0
      || [...normalized].length > 120
      || [...identity].length > 120
    ) {
      throw new Error(
        `Trade ${trade.tradeSubjectId} tag labels must contain 1-120 code points.`,
      );
    }
    if (normalized !== value) {
      throw new Error(`Trade ${trade.tradeSubjectId} has a non-normalized tag label.`);
    }
    if (identities.has(identity)) {
      throw new Error(`Trade ${trade.tradeSubjectId} repeats a tag label.`);
    }
    identities.add(identity);
    const canonicalLabel = canonicalLabelByIdentity.get(identity);
    if (canonicalLabel !== undefined && canonicalLabel !== value) {
      throw new Error(
        `Tag label ${value} conflicts with the saved canonical display label.`,
      );
    }
    canonicalLabelByIdentity.set(identity, value);
  }
  return raw as readonly string[];
}

function evidenceFromTrade(
  trade: TradePreview,
  tag: string,
): TagPatternTradeEvidence {
  return Object.freeze({
    tradeSubjectId: trade.tradeSubjectId,
    accountLabel: trade.accountLabel,
    symbol: trade.symbol,
    side: trade.side,
    tradedOn: trade.tradedOn,
    sessionLabel: trade.sessionLabel,
    tag,
  });
}

function buildGroup(
  tag: string,
  evidence: readonly TagPatternTradeEvidence[],
): TagPatternGroup {
  const orderedEvidence = Object.freeze([...evidence].sort(evidenceCompare));
  const tradeSubjectIds = Object.freeze(
    orderedEvidence.map((trade) => trade.tradeSubjectId),
  );
  return Object.freeze({
    tag,
    assignmentCount: orderedEvidence.length,
    tradeSubjectIds,
    evidence: orderedEvidence,
  });
}

export function buildTagPatternsReport(
  snapshot: JournalWorkspaceSnapshot,
): TagPatternsReport {
  const evidenceByTag = new Map<string, TagPatternTradeEvidence[]>();
  const canonicalLabelByIdentity = new Map<string, string>();
  const tradeSubjectIds = new Set<string>();
  const completedReviewIds = new Set<string>();
  const includedTradeSubjectIds = new Set<string>();
  const exclusions = {
    incompleteReview: 0,
    noTagAssigned: 0,
  };
  let totalAssignmentCount = 0;

  for (const trade of snapshot.trades) {
    if (
      !isValidStableIdentifier(trade.tradeSubjectId)
      || tradeSubjectIds.has(trade.tradeSubjectId)
    ) {
      throw new Error(
        "Tag-pattern trades require 1-256 character trimmed, control-free, unique subject identities.",
      );
    }
    tradeSubjectIds.add(trade.tradeSubjectId);

    if (trade.reviewStatus !== "completed") {
      exclusions.incompleteReview += 1;
      continue;
    }
    if (
      !isValidStableIdentifier(trade.reviewId)
      || completedReviewIds.has(trade.reviewId)
      || trade.reviewVersion === null
      || !Number.isSafeInteger(trade.reviewVersion)
      || trade.reviewVersion < 1
    ) {
      throw new Error(
        `Completed trade ${trade.tradeSubjectId} requires a coherent current review head.`,
      );
    }
    completedReviewIds.add(trade.reviewId);
    const tags = validatedTags(trade, canonicalLabelByIdentity);
    if (tags.length === 0) {
      exclusions.noTagAssigned += 1;
      continue;
    }

    includedTradeSubjectIds.add(trade.tradeSubjectId);
    totalAssignmentCount += tags.length;
    for (const tag of tags) {
      const evidence = evidenceFromTrade(trade, tag);
      const groupEvidence = evidenceByTag.get(tag) ?? [];
      groupEvidence.push(evidence);
      evidenceByTag.set(tag, groupEvidence);
    }
  }

  const groups = Object.freeze(
    [...evidenceByTag.entries()]
      .sort(([left], [right]) => stableCompare(left, right))
      .map(([tag, evidence]) => buildGroup(tag, evidence)),
  );
  const includedTradeCount = includedTradeSubjectIds.size;
  const groupedAssignmentCount = groups.reduce(
    (sum, group) => sum + group.assignmentCount,
    0,
  );
  if (
    includedTradeCount + exclusions.incompleteReview + exclusions.noTagAssigned
      !== snapshot.trades.length
    || groupedAssignmentCount !== totalAssignmentCount
  ) {
    throw new Error("Tag-pattern report counts do not conserve their source trades.");
  }

  const frozenExclusions = Object.freeze(exclusions);
  const metadata: TagPatternsReportMetadata = Object.freeze({
    version: TAG_PATTERNS_REPORT_VERSION,
    definitionSha256: TAG_PATTERNS_REPORT_DEFINITION_SHA256,
    timeZone: snapshot.timeZone,
    accountLabel: snapshot.accountLabel,
    periodLabel: snapshot.periodLabel,
    totalTradeCount: snapshot.trades.length,
    includedTradeCount,
    totalAssignmentCount,
    exclusions: frozenExclusions,
  });

  return Object.freeze({
    metadata,
    groups,
  });
}
