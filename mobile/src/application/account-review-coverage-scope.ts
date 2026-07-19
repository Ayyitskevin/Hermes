import {
  buildAccountReviewCoverageReport,
  type AccountReviewCoverageReviewState,
} from "../core/account-review-coverage-report";
import type { JournalWorkspaceSnapshot } from "../core/types";
import {
  buildTradeBrowser,
  EMPTY_TRADE_BROWSER_STATE,
  type TradeBrowserResult,
} from "./trade-browser";

export interface ExactAccountReviewCoverageScope {
  readonly accountId: string;
  readonly accountLabel: string;
  readonly accountPosition: number;
  readonly accountCount: number;
  readonly reviewState: AccountReviewCoverageReviewState;
  readonly tradeCount: number;
  readonly tradeSubjectIds: readonly string[];
  readonly scope: TradeBrowserResult;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function expectedBrowserAccountLabel(
  snapshot: JournalWorkspaceSnapshot,
  accountId: string,
): string {
  const index = snapshot.accountOptions.findIndex((account) => (
    account.id === accountId
  ));
  const account = snapshot.accountOptions[index];
  if (account === undefined) {
    throw new Error("The selected account is not available in this journal.");
  }
  const duplicateCount = snapshot.accountOptions.filter((candidate) => (
    candidate.label === account.label
  )).length;
  return duplicateCount > 1
    ? `${account.label} · account ${index + 1} of ${snapshot.accountOptions.length}`
    : account.label;
}

/**
 * Rebuilds one exact account + closed-position + review-state cohort from an
 * empty ephemeral Trade Browser state. No prior scope or card facet survives.
 */
export function buildExactAccountReviewCoverageScope(
  snapshot: JournalWorkspaceSnapshot,
  accountId: string,
  reviewState: AccountReviewCoverageReviewState,
  expectedTradeCount: number,
): ExactAccountReviewCoverageScope {
  if (
    reviewState !== "draft"
    && reviewState !== "pending"
    && reviewState !== "completed"
  ) {
    throw new Error("The selected account review state is unsupported.");
  }
  if (!Number.isSafeInteger(expectedTradeCount) || expectedTradeCount < 1) {
    throw new Error("The selected account review count must be a positive safe integer.");
  }
  const report = buildAccountReviewCoverageReport(snapshot);
  const account = report.accounts.find((candidate) => (
    candidate.accountId === accountId
  ));
  if (account === undefined) {
    throw new Error("The selected account is not available in this journal.");
  }
  const group = account.groups.find((candidate) => (
    candidate.classification === reviewState
  ));
  if (
    group === undefined
    || group.tradeCount !== expectedTradeCount
    || group.tradeCount < 1
  ) {
    throw new Error("The selected account review count is no longer available.");
  }
  const scope = buildTradeBrowser(snapshot, {
    ...EMPTY_TRADE_BROWSER_STATE,
    accountId: account.accountId,
    positionState: "closed",
    reviewState,
  });
  const state = scope.state;
  const visibleSubjects = scope.visibleEvidence
    .map(({ trade }) => trade.tradeSubjectId)
    .sort(stableCompare);
  if (
    state.accountId !== account.accountId
    || state.activityFrom !== null
    || state.activityThrough !== null
    || state.selectedDay !== null
    || state.query !== ""
    || state.assetClass !== "all"
    || state.direction !== "all"
    || state.positionState !== "closed"
    || state.reviewState !== reviewState
    || state.setup !== null
    || state.mistake !== null
    || state.emotion !== null
    || state.tag !== null
    || state.playbook !== null
    || scope.invalidatedSelectedDay !== null
    || !scope.isFiltered
    || !scope.hasViewFilters
    || scope.accountLabel !== expectedBrowserAccountLabel(snapshot, account.accountId)
    || scope.evidence.length !== account.tradeCount
    || scope.visibleEvidence.length !== group.tradeCount
    || new Set(visibleSubjects).size !== group.tradeCount
    || visibleSubjects.some((subjectId, index) => (
      subjectId !== group.tradeSubjectIds[index]
    ))
    || scope.visibleEvidence.some(({ trade }) => (
      trade.accountId !== account.accountId
      || trade.status !== "closed"
      || trade.reviewStatus !== reviewState
    ))
  ) {
    throw new Error("The selected account review scope does not reconcile.");
  }
  return Object.freeze({
    accountId: account.accountId,
    accountLabel: account.accountLabel,
    accountPosition: account.position,
    accountCount: report.metadata.accountCount,
    reviewState,
    tradeCount: group.tradeCount,
    tradeSubjectIds: Object.freeze([...group.tradeSubjectIds]),
    scope,
  });
}
