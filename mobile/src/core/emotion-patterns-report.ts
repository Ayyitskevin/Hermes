import type {
  JournalWorkspaceSnapshot,
  TradePreview,
  TradeSide,
} from "./types";

export const EMOTION_PATTERNS_REPORT_VERSION = "emotion-patterns-report-v1" as const;

/**
 * Canonical count-only report contract. Property and array order are checksum
 * input; changing any semantic requires a new report version.
 */
export const EMOTION_PATTERNS_REPORT_DEFINITION = Object.freeze({
  version: EMOTION_PATTERNS_REPORT_VERSION,
  inputs: Object.freeze({
    projection: "current-projection",
    reviews: "current-review-heads",
    emotion: "current-completed-review.emotion",
    labelIdentity: "exact-canonical-stored-display-string",
  }),
  cohort: Object.freeze({
    exclusionPrecedence: Object.freeze([
      "review-status-not-completed=>incompleteReview",
      "completed-with-no-emotion=>noEmotionAssigned",
    ] as const),
    inclusion: "current-projection+completed-review+one-exact-emotion",
    subjectIdentity: "tradeSubjectId:1-256-trimmed-C0-C1-free-and-unique-across-current-projection-or-throw",
    reviewHeadIdentity: "completed=>reviewId:1-256-trimmed-C0-C1-free-and-unique+positive-safe-reviewVersion;incoherent=>throw",
    uniqueTradeConservation: "includedTradeCount+exclusions=totalTradeCount",
    assignmentCardinality: "one-exact-emotion-group-per-included-trade",
  }),
  labelValidation: Object.freeze({
    normalization: "NFC+trim+collapse-whitespace",
    content: "visible-single-line-text",
    maximumCodePoints: 120,
    identityFold: "toLocaleLowerCase(en-US)",
    canonicalDisplay: "one-exact-label-per-folded-identity-across-current-completed-reviews",
    invalidInput: "throw;never-normalize-repair-or-drop",
  }),
  groupOrder: "emotion-name:ascending-code-unit",
  counting: Object.freeze({
    includedTradeCount: "count(included-current-trades)",
    groupTradeCount: "count(exact-emotion-label-assignments)",
    reconciliation: "sum(group.tradeCount)=includedTradeCount",
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

export const EMOTION_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON = JSON.stringify(
  EMOTION_PATTERNS_REPORT_DEFINITION,
);

/** Pinned SHA-256 of EMOTION_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON. */
export const EMOTION_PATTERNS_REPORT_DEFINITION_SHA256 =
  "d674eceb0d641512f106f9f1c6b37e23fe1a2ecd0d43e54b7e48865fa594adb4" as const;

export interface EmotionPatternTradeEvidence {
  readonly tradeSubjectId: string;
  readonly accountLabel: string;
  readonly symbol: string;
  readonly side: TradeSide;
  readonly tradedOn: string;
  readonly sessionLabel: string;
  readonly emotion: string;
}

export interface EmotionPatternGroup {
  readonly emotion: string;
  readonly tradeCount: number;
  readonly tradeSubjectIds: readonly string[];
  readonly evidence: readonly EmotionPatternTradeEvidence[];
}

export interface EmotionPatternsExclusionCounts {
  readonly incompleteReview: number;
  readonly noEmotionAssigned: number;
}

export interface EmotionPatternsReportMetadata {
  readonly version: typeof EMOTION_PATTERNS_REPORT_VERSION;
  readonly definitionSha256: typeof EMOTION_PATTERNS_REPORT_DEFINITION_SHA256;
  readonly timeZone: string;
  readonly accountLabel: string;
  readonly periodLabel: string;
  readonly totalTradeCount: number;
  readonly includedTradeCount: number;
  readonly exclusions: EmotionPatternsExclusionCounts;
}

export interface EmotionPatternsReport {
  readonly metadata: EmotionPatternsReportMetadata;
  readonly groups: readonly EmotionPatternGroup[];
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function evidenceCompare(
  left: EmotionPatternTradeEvidence,
  right: EmotionPatternTradeEvidence,
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

function validatedEmotion(
  trade: TradePreview,
  canonicalLabelByIdentity: Map<string, string>,
): string | null {
  const raw: unknown = trade.emotion;
  if (raw === null) return null;
  if (typeof raw !== "string" || hasControlCharacter(raw)) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} emotion must use visible single-line text.`,
    );
  }
  const normalized = raw.normalize("NFC").trim().replace(/\s+/gu, " ");
  const identity = normalized.toLocaleLowerCase("en-US");
  if (
    normalized.length === 0
    || [...normalized].length > 120
    || [...identity].length > 120
  ) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} emotion must contain 1-120 visible characters.`,
    );
  }
  if (normalized !== raw) {
    throw new Error(`Trade ${trade.tradeSubjectId} has a non-normalized emotion label.`);
  }
  const canonicalLabel = canonicalLabelByIdentity.get(identity);
  if (canonicalLabel !== undefined && canonicalLabel !== raw) {
    throw new Error(
      `Emotion label ${raw} conflicts with the saved canonical display label.`,
    );
  }
  canonicalLabelByIdentity.set(identity, raw);
  return raw;
}

function evidenceFromTrade(
  trade: TradePreview,
  emotion: string,
): EmotionPatternTradeEvidence {
  return Object.freeze({
    tradeSubjectId: trade.tradeSubjectId,
    accountLabel: trade.accountLabel,
    symbol: trade.symbol,
    side: trade.side,
    tradedOn: trade.tradedOn,
    sessionLabel: trade.sessionLabel,
    emotion,
  });
}

function buildGroup(
  emotion: string,
  evidence: readonly EmotionPatternTradeEvidence[],
): EmotionPatternGroup {
  const orderedEvidence = Object.freeze([...evidence].sort(evidenceCompare));
  const tradeSubjectIds = Object.freeze(
    orderedEvidence.map((trade) => trade.tradeSubjectId),
  );
  return Object.freeze({
    emotion,
    tradeCount: orderedEvidence.length,
    tradeSubjectIds,
    evidence: orderedEvidence,
  });
}

export function buildEmotionPatternsReport(
  snapshot: JournalWorkspaceSnapshot,
): EmotionPatternsReport {
  const evidenceByEmotion = new Map<string, EmotionPatternTradeEvidence[]>();
  const canonicalLabelByIdentity = new Map<string, string>();
  const tradeSubjectIds = new Set<string>();
  const completedReviewIds = new Set<string>();
  const includedTradeSubjectIds = new Set<string>();
  const exclusions = {
    incompleteReview: 0,
    noEmotionAssigned: 0,
  };

  for (const trade of snapshot.trades) {
    if (
      !isValidStableIdentifier(trade.tradeSubjectId)
      || tradeSubjectIds.has(trade.tradeSubjectId)
    ) {
      throw new Error(
        "Emotion-pattern trades require 1-256 character trimmed, control-free, unique subject identities.",
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
    const emotion = validatedEmotion(trade, canonicalLabelByIdentity);
    if (emotion === null) {
      exclusions.noEmotionAssigned += 1;
      continue;
    }

    includedTradeSubjectIds.add(trade.tradeSubjectId);
    const evidence = evidenceFromTrade(trade, emotion);
    const groupEvidence = evidenceByEmotion.get(emotion) ?? [];
    groupEvidence.push(evidence);
    evidenceByEmotion.set(emotion, groupEvidence);
  }

  const groups = Object.freeze(
    [...evidenceByEmotion.entries()]
      .sort(([left], [right]) => stableCompare(left, right))
      .map(([emotion, evidence]) => buildGroup(emotion, evidence)),
  );
  const includedTradeCount = includedTradeSubjectIds.size;
  const groupedTradeCount = groups.reduce(
    (sum, group) => sum + group.tradeCount,
    0,
  );
  if (
    includedTradeCount + exclusions.incompleteReview + exclusions.noEmotionAssigned
      !== snapshot.trades.length
    || groupedTradeCount !== includedTradeCount
  ) {
    throw new Error("Emotion-pattern report counts do not conserve their source trades.");
  }

  const frozenExclusions = Object.freeze(exclusions);
  const metadata: EmotionPatternsReportMetadata = Object.freeze({
    version: EMOTION_PATTERNS_REPORT_VERSION,
    definitionSha256: EMOTION_PATTERNS_REPORT_DEFINITION_SHA256,
    timeZone: snapshot.timeZone,
    accountLabel: snapshot.accountLabel,
    periodLabel: snapshot.periodLabel,
    totalTradeCount: snapshot.trades.length,
    includedTradeCount,
    exclusions: frozenExclusions,
  });

  return Object.freeze({
    metadata,
    groups,
  });
}
