import type {
  JournalAccountOption,
  JournalWorkspaceSnapshot,
  TradePreview,
} from "./types";

export const ACCOUNT_REVIEW_COVERAGE_REPORT_VERSION =
  "account-review-coverage-report-v1" as const;

export const ACCOUNT_REVIEW_COVERAGE_GROUP_ORDER = Object.freeze([
  "draft",
  "pending",
  "completed",
  "open",
] as const);

export type AccountReviewCoverageClassification =
  (typeof ACCOUNT_REVIEW_COVERAGE_GROUP_ORDER)[number];

export type AccountReviewCoverageReviewState = Exclude<
  AccountReviewCoverageClassification,
  "open"
>;

/**
 * Canonical count-only report contract. Property and array order are checksum
 * input; changing any semantic requires a new report version.
 */
export const ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION = Object.freeze({
  version: ACCOUNT_REVIEW_COVERAGE_REPORT_VERSION,
  inputs: Object.freeze({
    projection: "current-full-workspace-projection",
    accounts:
      "snapshot.accountOptions:retained-stable-account-id-label-and-current-trade-count",
    tradeFields: Object.freeze([
      "tradeSubjectId",
      "accountId",
      "accountLabel",
      "status",
      "reviewStatus",
      "reviewId",
      "reviewVersion",
    ] as const),
    reviewProgress:
      "snapshot.reviewProgress:closed-waiting-draft-and-completed-reconciliation-only",
    tradeBrowserScope: "not-consumed",
    authoredReviewContent: "not-consumed",
    resultFields: "not-consumed",
  }),
  cohort: Object.freeze({
    accountInclusion: "every-retained-account-including-zero-trade-accounts",
    tradeInclusion: "every-current-projection-trade-exactly-once",
    exclusions: "none-from-account-total",
    openTreatment:
      "counted-once-as-open-and-excluded-from-closed-review-state-actions",
    subjectIdentity:
      "tradeSubjectId:1-256-trimmed-C0-C1-free-and-unique-across-current-projection-or-throw",
    accountIdentity:
      "accountId:1-256-trimmed-C0-C1-free-and-unique-across-retained-accounts-or-throw",
    conservation: Object.freeze([
      "sum(account.tradeCount)=totalTradeCount",
      "sum(account.group.tradeCount)=account.tradeCount",
      "closed-waiting=draft+pending",
      "closed-total=draft+pending+completed",
    ] as const),
  }),
  reviewHeadValidation: Object.freeze({
    pending: "reviewId=null-and-reviewVersion=null",
    draftAndCompleted:
      "unique-valid-reviewId-and-positive-safe-integer-reviewVersion",
    invalidInput: "throw;never-repair-drop-or-default",
  }),
  accountOrder: "accountLabel:ascending-code-unit;accountId:ascending-code-unit",
  groupOrder: Object.freeze([
    "draft",
    "pending",
    "completed",
    "open",
  ] as const),
  contributorOrder: "tradeSubjectId:ascending-code-unit",
  counting: Object.freeze({
    draft: "closed-and-reviewStatus=draft",
    pending: "closed-and-reviewStatus=pending",
    completed: "closed-and-reviewStatus=completed",
    open: "status=open;reviewStatus-does-not-change-classification",
    rates: "not-calculated",
    accountComparison: "not-calculated",
  }),
  navigation: Object.freeze({
    actionCohorts: Object.freeze(["draft", "pending", "completed"] as const),
    target:
      "ephemeral-exact-accountId-plus-closed-position-plus-review-state-trade-browser-filter",
    activation: "rederive-and-reconcile-before-state-assignment",
    automaticReviewOpen: false,
  }),
  migration: Object.freeze({
    decision: "derived-only-recompute",
    archiveShapeChange: false,
    exportCompatibility:
      "existing-archives-retain-inputs;current-runtime-recomputes",
  }),
});

export const ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION_CANONICAL_JSON =
  JSON.stringify(ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION);

/** Pinned SHA-256 of ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION_CANONICAL_JSON. */
export const ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION_SHA256 =
  "a4c1021010d1c854db7b10d05475ef4cbe696c4a09e20d8c9e8f83fc711d308a" as const;

export interface AccountReviewCoverageGroup {
  readonly classification: AccountReviewCoverageClassification;
  readonly tradeCount: number;
  readonly tradeSubjectIds: readonly string[];
}

export interface AccountReviewCoverageAccount {
  readonly accountId: string;
  readonly accountLabel: string;
  readonly position: number;
  readonly tradeCount: number;
  readonly groups: readonly AccountReviewCoverageGroup[];
}

export interface AccountReviewCoverageReportMetadata {
  readonly version: typeof ACCOUNT_REVIEW_COVERAGE_REPORT_VERSION;
  readonly definitionSha256:
    typeof ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION_SHA256;
  readonly timeZone: string;
  readonly accountLabel: string;
  readonly periodLabel: string;
  readonly accountCount: number;
  readonly totalTradeCount: number;
  readonly closedTradeCount: number;
  readonly openTradeCount: number;
  readonly waitingReviewCount: number;
  readonly pendingReviewCount: number;
  readonly draftReviewCount: number;
  readonly completedReviewCount: number;
}

export interface AccountReviewCoverageReport {
  readonly metadata: AccountReviewCoverageReportMetadata;
  readonly accounts: readonly AccountReviewCoverageAccount[];
}

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/u;

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateIdentifier(value: unknown, label: string): string {
  if (
    typeof value !== "string"
    || value.trim() !== value
    || Array.from(value).length < 1
    || Array.from(value).length > 256
    || CONTROL_CHARACTERS.test(value)
  ) {
    throw new Error(
      `${label} must contain 1-256 trimmed code points without control characters.`,
    );
  }
  return value;
}

function validateAccountLabel(value: unknown, label: string): string {
  return validateIdentifier(value, label);
}

function validateCount(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
}

function compareAccounts(
  left: Pick<JournalAccountOption, "id" | "label">,
  right: Pick<JournalAccountOption, "id" | "label">,
): number {
  return stableCompare(left.label, right.label)
    || stableCompare(left.id, right.id);
}

function validateReviewHead(
  trade: TradePreview,
  reviewIds: Set<string>,
): TradePreview["reviewStatus"] {
  const status: unknown = trade.reviewStatus;
  if (status !== "pending" && status !== "draft" && status !== "completed") {
    throw new Error(
      `Trade ${trade.tradeSubjectId} has an unsupported review status.`,
    );
  }
  if (status === "pending") {
    if (trade.reviewId !== null || trade.reviewVersion !== null) {
      throw new Error(
        `Pending trade ${trade.tradeSubjectId} must not have a saved review identity.`,
      );
    }
    return status;
  }
  const reviewId = validateIdentifier(
    trade.reviewId,
    `Trade ${trade.tradeSubjectId} review ID`,
  );
  if (
    !Number.isSafeInteger(trade.reviewVersion)
    || (trade.reviewVersion as number) < 1
  ) {
    throw new Error(
      `Trade ${trade.tradeSubjectId} must have a positive saved review version.`,
    );
  }
  if (reviewIds.has(reviewId)) {
    throw new Error(`Current review ID ${reviewId} appears more than once.`);
  }
  reviewIds.add(reviewId);
  return status;
}

function frozenGroup(
  classification: AccountReviewCoverageClassification,
  tradeSubjectIds: readonly string[],
): AccountReviewCoverageGroup {
  const orderedSubjects = Object.freeze([...tradeSubjectIds].sort(stableCompare));
  return Object.freeze({
    classification,
    tradeCount: orderedSubjects.length,
    tradeSubjectIds: orderedSubjects,
  });
}

interface MutableAccountCoverage {
  readonly accountId: string;
  readonly accountLabel: string;
  readonly position: number;
  readonly expectedTradeCount: number;
  readonly subjects: Record<AccountReviewCoverageClassification, string[]>;
}

function mutableAccount(
  account: JournalAccountOption,
  position: number,
): MutableAccountCoverage {
  return {
    accountId: validateIdentifier(account.id, `Account ${position} ID`),
    accountLabel: validateAccountLabel(account.label, `Account ${position} label`),
    position,
    expectedTradeCount: validateCount(
      account.tradeCount,
      `Account ${position} trade count`,
    ),
    subjects: {
      draft: [],
      pending: [],
      completed: [],
      open: [],
    },
  };
}

export function buildAccountReviewCoverageReport(
  snapshot: JournalWorkspaceSnapshot,
): AccountReviewCoverageReport {
  const accountIds = new Set<string>();
  const mutableAccounts = snapshot.accountOptions.map((account, index) => {
    const coverage = mutableAccount(account, index + 1);
    if (accountIds.has(coverage.accountId)) {
      throw new Error(`Account ID ${coverage.accountId} appears more than once.`);
    }
    accountIds.add(coverage.accountId);
    if (
      index > 0
      && compareAccounts(snapshot.accountOptions[index - 1]!, account) > 0
    ) {
      throw new Error(
        "Retained accounts must use stable account-label and account-ID order.",
      );
    }
    return coverage;
  });
  const coverageByAccountId = new Map(
    mutableAccounts.map((account) => [account.accountId, account]),
  );
  const tradeSubjectIds = new Set<string>();
  const reviewIds = new Set<string>();

  for (const trade of snapshot.trades) {
    const subjectId = validateIdentifier(trade.tradeSubjectId, "Trade subject ID");
    if (tradeSubjectIds.has(subjectId)) {
      throw new Error(`Trade subject ID ${subjectId} appears more than once.`);
    }
    tradeSubjectIds.add(subjectId);
    const accountId = validateIdentifier(
      trade.accountId,
      `Trade ${subjectId} account ID`,
    );
    const account = coverageByAccountId.get(accountId);
    if (account === undefined) {
      throw new Error(`Trade ${subjectId} references an unavailable account.`);
    }
    if (trade.accountLabel !== account.accountLabel) {
      throw new Error(`Trade ${subjectId} account label does not reconcile.`);
    }
    const reviewStatus = validateReviewHead(trade, reviewIds);
    const positionStatus: unknown = trade.status;
    if (positionStatus !== "open" && positionStatus !== "closed") {
      throw new Error(`Trade ${subjectId} has an unsupported position status.`);
    }
    const classification: AccountReviewCoverageClassification =
      positionStatus === "open" ? "open" : reviewStatus;
    account.subjects[classification].push(subjectId);
  }

  const accounts = Object.freeze(mutableAccounts.map((account) => {
    const groups = Object.freeze(ACCOUNT_REVIEW_COVERAGE_GROUP_ORDER.map((group) => (
      frozenGroup(group, account.subjects[group])
    )));
    const tradeCount = groups.reduce((total, group) => total + group.tradeCount, 0);
    if (tradeCount !== account.expectedTradeCount) {
      throw new Error(
        `Account ${account.accountId} has ${tradeCount} current trades but its option reports ${account.expectedTradeCount}.`,
      );
    }
    return Object.freeze({
      accountId: account.accountId,
      accountLabel: account.accountLabel,
      position: account.position,
      tradeCount,
      groups,
    });
  }));

  const countGroup = (classification: AccountReviewCoverageClassification): number => (
    accounts.reduce((total, account) => (
      total + (account.groups.find((group) => (
        group.classification === classification
      ))?.tradeCount ?? 0)
    ), 0)
  );
  const draftReviewCount = countGroup("draft");
  const pendingReviewCount = countGroup("pending");
  const completedReviewCount = countGroup("completed");
  const openTradeCount = countGroup("open");
  const waitingReviewCount = draftReviewCount + pendingReviewCount;
  const closedTradeCount = waitingReviewCount + completedReviewCount;
  const totalTradeCount = accounts.reduce(
    (total, account) => total + account.tradeCount,
    0,
  );
  if (
    totalTradeCount !== snapshot.trades.length
    || closedTradeCount + openTradeCount !== totalTradeCount
    || tradeSubjectIds.size !== totalTradeCount
  ) {
    throw new Error("Account review coverage does not conserve current trades.");
  }
  const expectedWaiting = validateCount(
    snapshot.reviewProgress.pendingTrades,
    "Review progress waiting-trade count",
  );
  const expectedDrafts = validateCount(
    snapshot.reviewProgress.draftTrades,
    "Review progress draft-trade count",
  );
  const expectedCompleted = validateCount(
    snapshot.reviewProgress.completedTrades,
    "Review progress completed-trade count",
  );
  if (
    waitingReviewCount !== expectedWaiting
    || draftReviewCount !== expectedDrafts
    || completedReviewCount !== expectedCompleted
  ) {
    throw new Error(
      "Account review coverage does not reconcile with review progress.",
    );
  }

  const metadata: AccountReviewCoverageReportMetadata = Object.freeze({
    version: ACCOUNT_REVIEW_COVERAGE_REPORT_VERSION,
    definitionSha256: ACCOUNT_REVIEW_COVERAGE_REPORT_DEFINITION_SHA256,
    timeZone: snapshot.timeZone,
    accountLabel: snapshot.accountLabel,
    periodLabel: snapshot.periodLabel,
    accountCount: accounts.length,
    totalTradeCount,
    closedTradeCount,
    openTradeCount,
    waitingReviewCount,
    pendingReviewCount,
    draftReviewCount,
    completedReviewCount,
  });
  return Object.freeze({ metadata, accounts });
}
