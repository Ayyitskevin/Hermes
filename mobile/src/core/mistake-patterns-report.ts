import type {
  JournalWorkspaceSnapshot,
  TradePreview,
  TradeSide,
} from "./types";

export const MISTAKE_PATTERNS_REPORT_VERSION = "mistake-patterns-report-v1" as const;

/**
 * Canonical count-only report contract. Property and array order are checksum
 * input; changing any semantic requires a new report version.
 */
export const MISTAKE_PATTERNS_REPORT_DEFINITION = Object.freeze({
  version: MISTAKE_PATTERNS_REPORT_VERSION,
  inputs: Object.freeze({
    projection: "current-projection",
    reviews: "current-review-heads",
    mistakes: "current-completed-review.mistakes[]",
    labelIdentity: "exact-canonical-stored-display-string",
  }),
  cohort: Object.freeze({
    exclusionPrecedence: Object.freeze([
      "review-status-not-completed=>incompleteReview",
      "completed-with-no-mistake-assignment=>noMistakeAssigned",
    ] as const),
    inclusion: "current-projection+completed-review+at-least-one-exact-mistake-assignment",
    subjectIdentity: "tradeSubjectId:1-256-trimmed-C0-C1-free-and-unique-across-current-projection-or-throw",
    reviewHeadIdentity: "completed=>reviewId:1-256-trimmed-C0-C1-free-and-unique+positive-safe-reviewVersion;incoherent=>throw",
    uniqueTradeConservation: "includedTradeCount+exclusions=totalTradeCount",
    assignmentConservation: "each-exact-label-assignment-counts-once;one-trade-may-count-in-multiple-groups",
    withinTradeUniqueness: "saved-review-case-folded-identity-is-unique",
  }),
  labelValidation: Object.freeze({
    normalization: "NFC+trim+collapse-whitespace",
    content: "visible-single-line-text",
    maximumCodePoints: 120,
    maximumAssignmentsPerTrade: 20,
    identityFold: "toLocaleLowerCase(en-US)",
    canonicalDisplay: "one-exact-label-per-folded-identity-across-current-completed-reviews",
    invalidInput: "throw;never-normalize-dedupe-or-drop",
  }),
  groupOrder: "mistake-name:ascending-code-unit",
  counting: Object.freeze({
    includedTradeCount: "count(included-current-trades)",
    totalAssignmentCount: "sum(included-trade.mistakes.length)",
    groupAssignmentCount: "count(exact-mistake-label-assignments)",
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

export const MISTAKE_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON = JSON.stringify(
  MISTAKE_PATTERNS_REPORT_DEFINITION,
);

/** Pinned SHA-256 of MISTAKE_PATTERNS_REPORT_DEFINITION_CANONICAL_JSON. */
export const MISTAKE_PATTERNS_REPORT_DEFINITION_SHA256 =
  "f94fc896308348f55a665aeafba665f0f3d4ee50fc225c4dba1087bc2babad3c" as const;

export interface MistakePatternTradeEvidence {
  readonly tradeSubjectId: string;
  readonly accountLabel: string;
  readonly symbol: string;
  readonly side: TradeSide;
  readonly tradedOn: string;
  readonly sessionLabel: string;
  readonly mistake: string;
}

export interface MistakePatternGroup {
  readonly mistake: string;
  readonly assignmentCount: number;
  readonly tradeSubjectIds: readonly string[];
  readonly evidence: readonly MistakePatternTradeEvidence[];
}

export interface MistakePatternsExclusionCounts {
  readonly incompleteReview: number;
  readonly noMistakeAssigned: number;
}

export interface MistakePatternsReportMetadata {
  readonly version: typeof MISTAKE_PATTERNS_REPORT_VERSION;
  readonly definitionSha256: typeof MISTAKE_PATTERNS_REPORT_DEFINITION_SHA256;
  readonly timeZone: string;
  readonly accountLabel: string;
  readonly periodLabel: string;
  readonly totalTradeCount: number;
  readonly includedTradeCount: number;
  readonly totalAssignmentCount: number;
  readonly exclusions: MistakePatternsExclusionCounts;
}

export interface MistakePatternsReport {
  readonly metadata: MistakePatternsReportMetadata;
  readonly groups: readonly MistakePatternGroup[];
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function evidenceCompare(
  left: MistakePatternTradeEvidence,
  right: MistakePatternTradeEvidence,
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

function validatedMistakes(
  trade: TradePreview,
  canonicalLabelByIdentity: Map<string, string>,
): readonly string[] {
  const raw: unknown = trade.mistakes;
  if (!Array.isArray(raw) || raw.length > 20) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} mistakes must contain at most 20 labels.`,
    );
  }
  const identities = new Set<string>();
  for (const value of raw) {
    if (typeof value !== "string" || hasControlCharacter(value)) {
      throw new Error(
        `Trade ${trade.tradeSubjectId} mistake labels must use visible single-line text.`,
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
        `Trade ${trade.tradeSubjectId} mistake labels must contain 1-120 visible characters.`,
      );
    }
    if (normalized !== value) {
      throw new Error(`Trade ${trade.tradeSubjectId} has a non-normalized mistake label.`);
    }
    if (identities.has(identity)) {
      throw new Error(`Trade ${trade.tradeSubjectId} repeats a mistake label.`);
    }
    identities.add(identity);
    const canonicalLabel = canonicalLabelByIdentity.get(identity);
    if (canonicalLabel !== undefined && canonicalLabel !== value) {
      throw new Error(
        `Mistake label ${value} conflicts with the saved canonical display label.`,
      );
    }
    canonicalLabelByIdentity.set(identity, value);
  }
  return raw as readonly string[];
}

function evidenceFromTrade(
  trade: TradePreview,
  mistake: string,
): MistakePatternTradeEvidence {
  return Object.freeze({
    tradeSubjectId: trade.tradeSubjectId,
    accountLabel: trade.accountLabel,
    symbol: trade.symbol,
    side: trade.side,
    tradedOn: trade.tradedOn,
    sessionLabel: trade.sessionLabel,
    mistake,
  });
}

function buildGroup(
  mistake: string,
  evidence: readonly MistakePatternTradeEvidence[],
): MistakePatternGroup {
  const orderedEvidence = Object.freeze([...evidence].sort(evidenceCompare));
  const tradeSubjectIds = Object.freeze(
    orderedEvidence.map((trade) => trade.tradeSubjectId),
  );
  return Object.freeze({
    mistake,
    assignmentCount: orderedEvidence.length,
    tradeSubjectIds,
    evidence: orderedEvidence,
  });
}

export function buildMistakePatternsReport(
  snapshot: JournalWorkspaceSnapshot,
): MistakePatternsReport {
  const evidenceByMistake = new Map<string, MistakePatternTradeEvidence[]>();
  const canonicalLabelByIdentity = new Map<string, string>();
  const tradeSubjectIds = new Set<string>();
  const completedReviewIds = new Set<string>();
  const includedTradeSubjectIds = new Set<string>();
  const exclusions = {
    incompleteReview: 0,
    noMistakeAssigned: 0,
  };
  let totalAssignmentCount = 0;

  for (const trade of snapshot.trades) {
    if (
      !isValidStableIdentifier(trade.tradeSubjectId)
      || tradeSubjectIds.has(trade.tradeSubjectId)
    ) {
      throw new Error(
        "Mistake-pattern trades require 1-256 character trimmed, control-free, unique subject identities.",
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
    const mistakes = validatedMistakes(trade, canonicalLabelByIdentity);
    if (mistakes.length === 0) {
      exclusions.noMistakeAssigned += 1;
      continue;
    }

    includedTradeSubjectIds.add(trade.tradeSubjectId);
    totalAssignmentCount += mistakes.length;
    for (const mistake of mistakes) {
      const evidence = evidenceFromTrade(trade, mistake);
      const groupEvidence = evidenceByMistake.get(mistake) ?? [];
      groupEvidence.push(evidence);
      evidenceByMistake.set(mistake, groupEvidence);
    }
  }

  const groups = Object.freeze(
    [...evidenceByMistake.entries()]
      .sort(([left], [right]) => stableCompare(left, right))
      .map(([mistake, evidence]) => buildGroup(mistake, evidence)),
  );
  const includedTradeCount = includedTradeSubjectIds.size;
  const groupedAssignmentCount = groups.reduce(
    (sum, group) => sum + group.assignmentCount,
    0,
  );
  if (
    includedTradeCount + exclusions.incompleteReview + exclusions.noMistakeAssigned
      !== snapshot.trades.length
    || groupedAssignmentCount !== totalAssignmentCount
  ) {
    throw new Error("Mistake-pattern report counts do not conserve their source trades.");
  }

  const frozenExclusions = Object.freeze(exclusions);
  const metadata: MistakePatternsReportMetadata = Object.freeze({
    version: MISTAKE_PATTERNS_REPORT_VERSION,
    definitionSha256: MISTAKE_PATTERNS_REPORT_DEFINITION_SHA256,
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
