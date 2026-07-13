import {
  compareSignedDecimals,
  divideSignedDecimals,
  sumSignedDecimals,
} from "./signed-decimal";
import {
  REPORT_ACCEPTED_COMPLETE_RESULT_R_DEFINITION,
  acceptedCompleteResultRExact,
} from "./report-result-r";
import type {
  JournalWorkspaceSnapshot,
  TradePreview,
  TradeSide,
} from "./types";

export const SETUP_PERFORMANCE_REPORT_VERSION = "setup-performance-report-v1" as const;

/**
 * Canonical derived-report contract. Property and array order are checksum
 * input; changing any semantic requires a new report version.
 */
export const SETUP_PERFORMANCE_REPORT_DEFINITION = Object.freeze({
  version: SETUP_PERFORMANCE_REPORT_VERSION,
  inputs: Object.freeze({
    projection: "current-projection",
    reviews: "current-review-heads",
    cash: "resultPnlExact",
    setup: "current-completed-review.setup",
    setupClassification: "review.setup:null=>unclassified;string=>classified",
    resultR: "resultRMetric.value",
  }),
  cohort: Object.freeze({
    exclusionPrecedence: Object.freeze([
      "status-not-closed=>openOrPartial",
      "missing-resultPnlExact=>missingRealizedPnl",
      "review-status-not-completed=>incompleteReview",
      "hasClassifiedSetup=false=>unclassifiedSetup",
    ] as const),
    inclusion: "closed+exact-realized-pnl+completed-review+classified-setup",
    conservation: "each-trade-counts-exactly-once-across-included-or-excluded",
    groupMembership: "each-included-trade-belongs-to-exactly-one-exact-setup-label",
  }),
  groupOrder: "setup-name:ascending-code-unit",
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
  migration: Object.freeze({
    decision: "derived-only-recompute",
    archiveShapeChange: false,
    exportCompatibility: "existing-archives-retain-inputs;current-runtime-recomputes",
  }),
});

export const SETUP_PERFORMANCE_REPORT_DEFINITION_CANONICAL_JSON = JSON.stringify(
  SETUP_PERFORMANCE_REPORT_DEFINITION,
);

/** Pinned SHA-256 of SETUP_PERFORMANCE_REPORT_DEFINITION_CANONICAL_JSON. */
export const SETUP_PERFORMANCE_REPORT_DEFINITION_SHA256 =
  "5779276cbbc4278136f96bbaca167216c60b395cdad4a8bb4cf9c3b5f272601b" as const;

export interface SetupPerformanceTradeEvidence {
  readonly tradeSubjectId: string;
  readonly accountLabel: string;
  readonly symbol: string;
  readonly side: TradeSide;
  readonly tradedOn: string;
  readonly sessionLabel: string;
  readonly setup: string;
  readonly resultPnlExact: string;
  readonly resultRExact: string | null;
}

export interface SetupPerformanceGroup {
  readonly setup: string;
  readonly tradeCount: number;
  readonly winCount: number;
  readonly netPnlExact: string;
  readonly cashExpectancyExact: string;
  readonly averageRExact: string | null;
  readonly rTradeCount: number;
  readonly tradeSubjectIds: readonly string[];
  readonly evidence: readonly SetupPerformanceTradeEvidence[];
}

export interface SetupPerformanceExclusionCounts {
  readonly openOrPartial: number;
  readonly missingRealizedPnl: number;
  readonly incompleteReview: number;
  readonly unclassifiedSetup: number;
}

export interface SetupPerformanceReportMetadata {
  readonly version: typeof SETUP_PERFORMANCE_REPORT_VERSION;
  readonly definitionSha256: typeof SETUP_PERFORMANCE_REPORT_DEFINITION_SHA256;
  readonly currencyCode: string;
  readonly timeZone: string;
  readonly accountLabel: string;
  readonly periodLabel: string;
  readonly totalTradeCount: number;
  readonly includedTradeCount: number;
  readonly exclusions: SetupPerformanceExclusionCounts;
}

export interface SetupPerformanceReport {
  readonly metadata: SetupPerformanceReportMetadata;
  readonly groups: readonly SetupPerformanceGroup[];
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function evidenceCompare(
  left: SetupPerformanceTradeEvidence,
  right: SetupPerformanceTradeEvidence,
): number {
  return stableCompare(right.tradedOn, left.tradedOn)
    || stableCompare(left.tradeSubjectId, right.tradeSubjectId);
}

function evidenceFromTrade(
  trade: TradePreview,
  expectedCurrency: string,
): SetupPerformanceTradeEvidence {
  if (trade.resultPnlExact === null) {
    throw new Error("Included setup evidence must have exact realized P&L.");
  }
  return Object.freeze({
    tradeSubjectId: trade.tradeSubjectId,
    accountLabel: trade.accountLabel,
    symbol: trade.symbol,
    side: trade.side,
    tradedOn: trade.tradedOn,
    sessionLabel: trade.sessionLabel,
    setup: trade.setup,
    resultPnlExact: trade.resultPnlExact,
    resultRExact: acceptedCompleteResultRExact(trade, expectedCurrency),
  });
}

function buildGroup(
  setup: string,
  evidence: readonly SetupPerformanceTradeEvidence[],
): SetupPerformanceGroup {
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
    setup,
    tradeCount: orderedEvidence.length,
    winCount: orderedEvidence.filter((trade) => (
      compareSignedDecimals(trade.resultPnlExact, "0") > 0
    )).length,
    netPnlExact,
    cashExpectancyExact: divideSignedDecimals(
      netPnlExact,
      String(orderedEvidence.length),
      12,
    ),
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

export function buildSetupPerformanceReport(
  snapshot: JournalWorkspaceSnapshot,
): SetupPerformanceReport {
  const evidenceBySetup = new Map<string, SetupPerformanceTradeEvidence[]>();
  const exclusions = {
    openOrPartial: 0,
    missingRealizedPnl: 0,
    incompleteReview: 0,
    unclassifiedSetup: 0,
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
    if (!trade.hasClassifiedSetup) {
      exclusions.unclassifiedSetup += 1;
      continue;
    }
    const evidence = evidenceFromTrade(trade, snapshot.currencyCode);
    const setupEvidence = evidenceBySetup.get(trade.setup) ?? [];
    setupEvidence.push(evidence);
    evidenceBySetup.set(trade.setup, setupEvidence);
  }

  const groups = Object.freeze(
    [...evidenceBySetup.entries()]
      .sort(([left], [right]) => stableCompare(left, right))
      .map(([setup, evidence]) => buildGroup(setup, evidence)),
  );
  const includedTradeCount = groups.reduce(
    (sum, group) => sum + group.tradeCount,
    0,
  );
  const frozenExclusions = Object.freeze(exclusions);
  const metadata: SetupPerformanceReportMetadata = Object.freeze({
    version: SETUP_PERFORMANCE_REPORT_VERSION,
    definitionSha256: SETUP_PERFORMANCE_REPORT_DEFINITION_SHA256,
    currencyCode: snapshot.currencyCode,
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
