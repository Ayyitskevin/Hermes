import {
  addSignedDecimals,
  compareSignedDecimals,
  divideSignedDecimals,
  multiplySignedDecimals,
  negateSignedDecimal,
  sumSignedDecimals,
} from "./signed-decimal";
import {
  REPORT_ACCEPTED_COMPLETE_RESULT_R_DEFINITION,
  acceptedCompleteResultRExact,
} from "./report-result-r";
import type {
  JournalWorkspaceSnapshot,
  TradePreview,
  TradeRuleReviewPreview,
  TradeSide,
} from "./types";

export const PLAN_ADHERENCE_REPORT_VERSION = "plan-adherence-report-v1" as const;
export const PLAN_ADHERENCE_INSIGHT_MIN_TRADES = 3 as const;

/**
 * Canonical formula contract for a derived report. Property and array order are
 * part of the checksum input; changing any semantic requires a new version.
 */
export const PLAN_ADHERENCE_REPORT_DEFINITION = Object.freeze({
  version: PLAN_ADHERENCE_REPORT_VERSION,
  inputs: Object.freeze({
    projection: "current-projection",
    reviews: "current-review-heads",
    cash: "resultPnlExact",
    resultR: "resultRMetric.value",
  }),
  cohort: Object.freeze({
    exclusionPrecedence: Object.freeze([
      "status-not-closed=>openOrPartial",
      "missing-resultPnlExact=>missingRealizedPnl",
      "review-status-not-completed=>incompleteReview",
      "completed-with-no-broken-or-followed-rule=>unclassifiedRules",
    ] as const),
    classificationPrecedence: Object.freeze([
      "any-broken-rule=>broken",
      "else-any-followed-rule=>followed",
      "else=>unclassifiedRules",
    ] as const),
    conservation: "each-trade-counts-exactly-once",
  }),
  groupOrder: Object.freeze(["followed", "broken"] as const),
  aggregation: Object.freeze({
    netPnl: "exact-sum(resultPnlExact)",
    winCount: "count(resultPnlExact>0);zero-is-not-win",
    cashExpectancy: "round-half-away-from-zero(exact-net-pnl/trade-count,12)",
    averageR: "round-half-away-from-zero(exact-defined-r-sum/r-trade-count,12)",
    missingR: "exclude-from-r-mean-and-retain-rTradeCount-coverage",
  }),
  acceptedR: REPORT_ACCEPTED_COMPLETE_RESULT_R_DEFINITION,
  evidenceOrder: Object.freeze([
    "tradedOn:descending",
    "tradeSubjectId:ascending",
  ] as const),
  insight: Object.freeze({
    minimumTradesPerGroup: PLAN_ADHERENCE_INSIGHT_MIN_TRADES,
    formula: "round-half-away-from-zero(((followed-net*broken-count)-(broken-net*followed-count))/(followed-count*broken-count),12)",
    rounding: "one-final-division",
  }),
  migration: Object.freeze({
    decision: "derived-only-recompute",
    archiveShapeChange: false,
    exportCompatibility: "existing-archives-retain-inputs;current-runtime-recomputes",
  }),
});

export const PLAN_ADHERENCE_REPORT_DEFINITION_CANONICAL_JSON = JSON.stringify(
  PLAN_ADHERENCE_REPORT_DEFINITION,
);

/** Pinned SHA-256 of PLAN_ADHERENCE_REPORT_DEFINITION_CANONICAL_JSON. */
export const PLAN_ADHERENCE_REPORT_DEFINITION_SHA256 =
  "0f092c3bdd6c5051e97f5be0f1c7758a01e3159875adf660b1b0ea00f970ae85" as const;

export type PlanAdherenceClassification = "followed" | "broken";

export interface PlanAdherenceRuleEvidence {
  readonly ruleId: string;
  readonly text: string;
  readonly outcome: TradeRuleReviewPreview["outcome"];
}

export interface PlanAdherenceTradeEvidence {
  readonly tradeSubjectId: string;
  readonly accountLabel: string;
  readonly symbol: string;
  readonly side: TradeSide;
  readonly tradedOn: string;
  readonly sessionLabel: string;
  readonly resultPnlExact: string;
  readonly resultRExact: string | null;
  readonly rules: readonly PlanAdherenceRuleEvidence[];
}

export interface PlanAdherenceGroup {
  readonly classification: PlanAdherenceClassification;
  readonly tradeCount: number;
  readonly winCount: number;
  readonly netPnlExact: string;
  readonly cashExpectancyExact: string | null;
  readonly averageRExact: string | null;
  readonly rTradeCount: number;
  readonly tradeSubjectIds: readonly string[];
  readonly evidence: readonly PlanAdherenceTradeEvidence[];
}

export interface PlanAdherenceExclusionCounts {
  readonly openOrPartial: number;
  readonly missingRealizedPnl: number;
  readonly incompleteReview: number;
  readonly unclassifiedRules: number;
}

export interface PlanAdherenceReportMetadata {
  readonly version: typeof PLAN_ADHERENCE_REPORT_VERSION;
  readonly definitionSha256: typeof PLAN_ADHERENCE_REPORT_DEFINITION_SHA256;
  readonly currencyCode: string;
  readonly timeZone: string;
  readonly accountLabel: string;
  readonly periodLabel: string;
  readonly totalTradeCount: number;
  readonly includedTradeCount: number;
  readonly exclusions: PlanAdherenceExclusionCounts;
}

export type PlanAdherenceInsight =
  | {
      readonly status: "ready";
      readonly minimumTradesPerGroup: typeof PLAN_ADHERENCE_INSIGHT_MIN_TRADES;
      readonly followedMinusBrokenCashExpectancyExact: string;
    }
  | {
      readonly status: "insufficient";
      readonly minimumTradesPerGroup: typeof PLAN_ADHERENCE_INSIGHT_MIN_TRADES;
      readonly followedTradeCount: number;
      readonly brokenTradeCount: number;
    };

export interface PlanAdherenceReport {
  readonly metadata: PlanAdherenceReportMetadata;
  /** Fixed order: followed, then broken. */
  readonly groups: readonly [PlanAdherenceGroup, PlanAdherenceGroup];
  readonly insight: PlanAdherenceInsight;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function evidenceCompare(
  left: PlanAdherenceTradeEvidence,
  right: PlanAdherenceTradeEvidence,
): number {
  return stableCompare(right.tradedOn, left.tradedOn)
    || stableCompare(left.tradeSubjectId, right.tradeSubjectId);
}

function freezeRule(rule: TradeRuleReviewPreview): PlanAdherenceRuleEvidence {
  return Object.freeze({
    ruleId: rule.ruleId,
    text: rule.text,
    outcome: rule.outcome,
  });
}

function evidenceFromTrade(
  trade: TradePreview,
  expectedCurrency: string,
): PlanAdherenceTradeEvidence {
  if (trade.resultPnlExact === null) {
    throw new Error("Included plan-adherence evidence must have exact realized P&L.");
  }
  return Object.freeze({
    tradeSubjectId: trade.tradeSubjectId,
    accountLabel: trade.accountLabel,
    symbol: trade.symbol,
    side: trade.side,
    tradedOn: trade.tradedOn,
    sessionLabel: trade.sessionLabel,
    resultPnlExact: trade.resultPnlExact,
    resultRExact: acceptedCompleteResultRExact(trade, expectedCurrency),
    rules: Object.freeze(trade.rules.map(freezeRule)),
  });
}

function buildGroup(
  classification: PlanAdherenceClassification,
  evidence: readonly PlanAdherenceTradeEvidence[],
): PlanAdherenceGroup {
  const orderedEvidence = Object.freeze([...evidence].sort(evidenceCompare));
  const tradeSubjectIds = Object.freeze(
    orderedEvidence.map((trade) => trade.tradeSubjectId),
  );
  const netPnlExact = sumSignedDecimals(
    orderedEvidence.map((trade) => trade.resultPnlExact),
  );
  const exactRValues = orderedEvidence
    .map((trade) => trade.resultRExact)
    .filter((value): value is string => value !== null);
  return Object.freeze({
    classification,
    tradeCount: orderedEvidence.length,
    winCount: orderedEvidence.filter((trade) => (
      compareSignedDecimals(trade.resultPnlExact, "0") > 0
    )).length,
    netPnlExact,
    cashExpectancyExact: orderedEvidence.length === 0
      ? null
      : divideSignedDecimals(netPnlExact, String(orderedEvidence.length), 12),
    averageRExact: exactRValues.length === 0
      ? null
      : divideSignedDecimals(
          sumSignedDecimals(exactRValues),
          String(exactRValues.length),
          12,
        ),
    rTradeCount: exactRValues.length,
    tradeSubjectIds,
    evidence: orderedEvidence,
  });
}

function classifyCompletedTrade(
  trade: TradePreview,
): PlanAdherenceClassification | null {
  if (trade.rules.some((rule) => rule.outcome === "broken")) return "broken";
  if (trade.rules.some((rule) => rule.outcome === "followed")) return "followed";
  return null;
}

function exactExpectationDifference(
  followed: PlanAdherenceGroup,
  broken: PlanAdherenceGroup,
): string {
  const numerator = addSignedDecimals(
    multiplySignedDecimals(followed.netPnlExact, String(broken.tradeCount)),
    negateSignedDecimal(
      multiplySignedDecimals(broken.netPnlExact, String(followed.tradeCount)),
    ),
  );
  const denominator = multiplySignedDecimals(
    String(followed.tradeCount),
    String(broken.tradeCount),
  );
  return divideSignedDecimals(numerator, denominator, 12);
}

export function buildPlanAdherenceReport(
  snapshot: JournalWorkspaceSnapshot,
): PlanAdherenceReport {
  const followedEvidence: PlanAdherenceTradeEvidence[] = [];
  const brokenEvidence: PlanAdherenceTradeEvidence[] = [];
  const exclusions = {
    openOrPartial: 0,
    missingRealizedPnl: 0,
    incompleteReview: 0,
    unclassifiedRules: 0,
  };

  for (const trade of snapshot.trades) {
    if (trade.status !== "closed") {
      exclusions.openOrPartial += 1;
      continue;
    }
    if (trade.resultPnlExact === null) {
      exclusions.missingRealizedPnl += 1;
      continue;
    }
    if (trade.reviewStatus !== "completed") {
      exclusions.incompleteReview += 1;
      continue;
    }
    const classification = classifyCompletedTrade(trade);
    if (classification === null) {
      exclusions.unclassifiedRules += 1;
      continue;
    }
    const evidence = evidenceFromTrade(trade, snapshot.currencyCode);
    if (classification === "followed") followedEvidence.push(evidence);
    else brokenEvidence.push(evidence);
  }

  const followed = buildGroup("followed", followedEvidence);
  const broken = buildGroup("broken", brokenEvidence);
  const frozenExclusions = Object.freeze(exclusions);
  const metadata: PlanAdherenceReportMetadata = Object.freeze({
    version: PLAN_ADHERENCE_REPORT_VERSION,
    definitionSha256: PLAN_ADHERENCE_REPORT_DEFINITION_SHA256,
    currencyCode: snapshot.currencyCode,
    timeZone: snapshot.timeZone,
    accountLabel: snapshot.accountLabel,
    periodLabel: snapshot.periodLabel,
    totalTradeCount: snapshot.trades.length,
    includedTradeCount: followed.tradeCount + broken.tradeCount,
    exclusions: frozenExclusions,
  });
  const insight: PlanAdherenceInsight = followed.tradeCount >= PLAN_ADHERENCE_INSIGHT_MIN_TRADES
    && broken.tradeCount >= PLAN_ADHERENCE_INSIGHT_MIN_TRADES
    && followed.cashExpectancyExact !== null
    && broken.cashExpectancyExact !== null
    ? Object.freeze({
        status: "ready",
        minimumTradesPerGroup: PLAN_ADHERENCE_INSIGHT_MIN_TRADES,
        followedMinusBrokenCashExpectancyExact: exactExpectationDifference(
          followed,
          broken,
        ),
      })
    : Object.freeze({
        status: "insufficient",
        minimumTradesPerGroup: PLAN_ADHERENCE_INSIGHT_MIN_TRADES,
        followedTradeCount: followed.tradeCount,
        brokenTradeCount: broken.tradeCount,
      });

  const groups = Object.freeze([followed, broken] as const);
  return Object.freeze({
    metadata,
    groups,
    insight,
  });
}
