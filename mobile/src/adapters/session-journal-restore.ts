import {
  journalArchiveReportSha256,
  journalArchiveSummary,
} from "../application/journal-archive-derived";
import {
  canonicalJournalArchiveJson,
  parseJournalArchive,
  type JournalArchive,
  type JournalArchiveJson,
  type JournalArchiveSummary,
} from "../application/journal-archive";
import type {
  JournalAccountRecord,
  JournalImportReceipt,
  JournalInstrumentRecord,
  JournalLedgerSnapshot,
  JournalPlaybookRecord,
  JournalReviewTermRecord,
  JournalTradeReviewRecord,
  JournalWorkspaceRecord,
  UnacknowledgedManualExecution,
} from "../application/journal-store";
import { workspaceSnapshotFromLedger } from "../application/workspace-snapshot";
import { currencyMinorUnit } from "../core/currency";
import { canonicalizeDecimal } from "../core/decimal";
import type {
  ExecutionFee,
  LedgerExecution,
  TradeNormalizationResult,
} from "../core/ledger";
import { normalizeTrades } from "../core/normalize-trades";
import { MOBILE_SCHEMA_MIGRATIONS, sha256Hex } from "./sqlite/schema";
import { stableTradeSubjectHash } from "./sqlite/trade-subject";

const MAX_SQLITE_INTEGER = 9_223_372_036_854_775_807n;
const MIN_SQLITE_INTEGER = -9_223_372_036_854_775_808n;
const MAX_SAFE_INTEGER = BigInt(Number.MAX_SAFE_INTEGER);
const HASH_PATTERN = /^[0-9a-f]{64}$/;

export interface SessionExecution extends LedgerExecution {
  readonly ledgerSequence: string;
  readonly positionEffect: "AUTO" | "OPEN" | "CLOSE";
  readonly fees: readonly ExecutionFee[];
  readonly sourceIdentity: string;
  readonly payloadHash: string;
  readonly receiptIds: readonly string[];
}

export interface SessionManualSubmission extends UnacknowledgedManualExecution {
  readonly acknowledged: boolean;
}

export interface SessionReviewSubmission {
  readonly revision: string;
  readonly reviewId: string;
}

export interface SessionJournalState {
  readonly workspace: JournalWorkspaceRecord | null;
  readonly accounts: readonly JournalAccountRecord[];
  readonly instruments: readonly JournalInstrumentRecord[];
  readonly executions: readonly SessionExecution[];
  readonly inactiveExecutions: ReadonlyMap<string, SessionExecution>;
  readonly receipts: readonly JournalImportReceipt[];
  readonly receiptByRevision: ReadonlyMap<string, string>;
  readonly manualSubmissions: ReadonlyMap<string, SessionManualSubmission>;
  readonly reviewVersions: readonly JournalTradeReviewRecord[];
  readonly reviewHeads: ReadonlyMap<string, string>;
  readonly reviewTerms: readonly JournalReviewTermRecord[];
  readonly playbooks: readonly JournalPlaybookRecord[];
  readonly reviewSubmissions: ReadonlyMap<string, SessionReviewSubmission>;
  readonly lastReviewRecordedAtMs: number;
  readonly nextExecutionSequence: number;
  readonly nextReceiptOrdinal: number;
}

export interface SessionJournalPayload {
  readonly adapter: "browser-session";
  readonly stateVersion: 1;
  readonly workspace: JournalWorkspaceRecord | null;
  readonly accounts: readonly JournalAccountRecord[];
  readonly instruments: readonly JournalInstrumentRecord[];
  readonly activeExecutions: readonly SessionExecution[];
  readonly inactiveExecutions: readonly (readonly [string, SessionExecution])[];
  readonly receipts: readonly JournalImportReceipt[];
  readonly receiptByRevision: readonly (readonly [string, string])[];
  readonly manualSubmissions: readonly (readonly [string, SessionManualSubmission])[];
  readonly reviewVersions: readonly JournalTradeReviewRecord[];
  readonly reviewHeads: readonly (readonly [string, string])[];
  readonly reviewTerms: readonly JournalReviewTermRecord[];
  readonly playbooks: readonly JournalPlaybookRecord[];
  readonly reviewSubmissions: readonly (readonly [string, SessionReviewSubmission])[];
  readonly counters: {
    readonly lastReviewRecordedAtMs: string;
    readonly nextExecutionSequence: string;
    readonly nextReceiptOrdinal: string;
  };
}

export type SessionRestoreValidationCode =
  | "invalid_archive"
  | "unsupported_payload"
  | "incompatible_schema"
  | "invalid_payload"
  | "verification_failed";

export class SessionRestoreValidationError extends Error {
  constructor(
    readonly code: SessionRestoreValidationCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "SessionRestoreValidationError";
  }
}

export interface VerifiedSessionRestoreCandidate {
  readonly archive: JournalArchive;
  readonly payload: SessionJournalPayload;
  readonly ledger: JournalLedgerSnapshot;
  readonly summary: JournalArchiveSummary;
  readonly stateSha256: string;
  readonly reportSha256: string;
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function byId<Value extends { readonly id: string }>(
  values: readonly Value[],
): readonly Value[] {
  return [...values].sort((left, right) => stableCompare(left.id, right.id));
}

function byKey<Value>(
  values: Iterable<readonly [string, Value]>,
): readonly (readonly [string, Value])[] {
  return [...values]
    .sort(([left], [right]) => stableCompare(left, right))
    .map(([key, value]) => Object.freeze([key, value] as const));
}

export function sessionJournalPayloadFromState(
  state: SessionJournalState,
): SessionJournalPayload {
  return {
    adapter: "browser-session",
    stateVersion: 1,
    workspace: state.workspace,
    accounts: byId(state.accounts),
    instruments: byId(state.instruments),
    activeExecutions: byId(state.executions),
    inactiveExecutions: byKey(state.inactiveExecutions.entries()),
    receipts: byId(state.receipts),
    receiptByRevision: byKey(state.receiptByRevision.entries()),
    manualSubmissions: byKey(state.manualSubmissions.entries()),
    reviewVersions: byId(state.reviewVersions),
    reviewHeads: byKey(state.reviewHeads.entries()),
    reviewTerms: byId(state.reviewTerms),
    playbooks: byId(state.playbooks).map((playbook) => ({
      ...playbook,
      rules: byId(playbook.rules),
    })),
    reviewSubmissions: byKey(state.reviewSubmissions.entries()),
    counters: {
      lastReviewRecordedAtMs: String(state.lastReviewRecordedAtMs),
      nextExecutionSequence: String(state.nextExecutionSequence),
      nextReceiptOrdinal: String(state.nextReceiptOrdinal),
    },
  };
}

function tradeSubjectsForProjection(
  projection: TradeNormalizationResult,
): JournalLedgerSnapshot["tradeSubjects"] {
  return projection.trades.map((trade) => ({
    projectionTradeId: trade.id,
    tradeSubjectId: "session-trade:" + stableTradeSubjectHash(trade, projection.allocations),
  }));
}

export function sessionJournalLedgerFromPayload(
  payload: SessionJournalPayload,
): JournalLedgerSnapshot {
  const executions: readonly LedgerExecution[] = payload.activeExecutions;
  const projection = normalizeTrades(executions);
  const headIds = new Set(payload.reviewHeads.map(([, reviewId]) => reviewId));
  const tradeReviews = payload.reviewVersions
    .filter((review) => headIds.has(review.id))
    .sort((left, right) => (
      BigInt(left.recordedAtUs) < BigInt(right.recordedAtUs) ? -1
        : BigInt(left.recordedAtUs) > BigInt(right.recordedAtUs) ? 1
          : stableCompare(left.id, right.id)
    ));
  return {
    workspace: payload.workspace,
    accounts: [...payload.accounts],
    instruments: [...payload.instruments],
    executions,
    projection,
    tradeSubjects: tradeSubjectsForProjection(projection),
    tradeReviews,
    reviewTerms: [...payload.reviewTerms].sort((left, right) => (
      stableCompare(left.category, right.category)
      || stableCompare(normalizedName(left.name), normalizedName(right.name))
      || stableCompare(left.id, right.id)
    )),
    playbooks: [...payload.playbooks]
      .sort((left, right) => (
        stableCompare(normalizedName(left.name), normalizedName(right.name))
        || stableCompare(left.id, right.id)
      ))
      .map((playbook) => ({ ...playbook, rules: [...playbook.rules] })),
    imports: [...payload.receipts],
  };
}

export function sessionJournalSummary(
  payload: SessionJournalPayload,
  ledger: JournalLedgerSnapshot,
): JournalArchiveSummary {
  return journalArchiveSummary(ledger, {
    executionVersions: String(
      payload.activeExecutions.length + payload.inactiveExecutions.length,
    ),
    importReceipts: String(payload.receipts.length),
    rolledBackImports: String(
      payload.receipts.filter((receipt) => receipt.rolledBackAtUs !== null).length,
    ),
    reviewVersions: String(payload.reviewVersions.length),
    reviewTerms: String(payload.reviewTerms.length),
    playbooks: String(payload.playbooks.length),
  });
}

export function sessionJournalStateSha256(payload: SessionJournalPayload): string {
  return sha256Hex(canonicalJournalArchiveJson(payload as unknown as JournalArchiveJson));
}

export function sessionJournalReportSha256(ledger: JournalLedgerSnapshot): string {
  return journalArchiveReportSha256(ledger);
}

export function sessionJournalPayloadsEqual(
  left: SessionJournalPayload,
  right: SessionJournalPayload,
): boolean {
  return canonicalJournalArchiveJson(left as unknown as JournalArchiveJson)
    === canonicalJournalArchiveJson(right as unknown as JournalArchiveJson);
}

export function isEmptySessionJournalPayload(payload: SessionJournalPayload): boolean {
  return payload.workspace === null
    && payload.accounts.length === 0
    && payload.instruments.length === 0
    && payload.activeExecutions.length === 0
    && payload.inactiveExecutions.length === 0
    && payload.receipts.length === 0
    && payload.receiptByRevision.length === 0
    && payload.manualSubmissions.length === 0
    && payload.reviewVersions.length === 0
    && payload.reviewHeads.length === 0
    && payload.reviewTerms.length === 0
    && payload.playbooks.length === 0
    && payload.reviewSubmissions.length === 0
    && payload.counters.lastReviewRecordedAtMs === "-1"
    && payload.counters.nextExecutionSequence === "1"
    && payload.counters.nextReceiptOrdinal === "0";
}
type Validator = (value: unknown, label: string) => void;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function objectShape(fields: Readonly<Record<string, Validator>>): Validator {
  return (value, label) => {
    if (!isRecord(value)) throw new Error(label + " must be an object.");
    const actual = Object.keys(value).sort();
    const expected = Object.keys(fields).sort();
    if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
      throw new Error(label + " has missing or unsupported fields.");
    }
    for (const [key, validator] of Object.entries(fields)) {
      validator(value[key], label + " " + key);
    }
  };
}

function arrayOf(validator: Validator): Validator {
  return (value, label) => {
    if (!Array.isArray(value)) throw new Error(label + " must be an array.");
    value.forEach((item, index) => validator(item, label + " item " + String(index + 1)));
  };
}

function tupleOf(left: Validator, right: Validator): Validator {
  return (value, label) => {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new Error(label + " must be a two-value tuple.");
    }
    left(value[0], label + " key");
    right(value[1], label + " value");
  };
}

function nullable(validator: Validator): Validator {
  return (value, label) => {
    if (value !== null) validator(value, label);
  };
}

function oneOf(...values: readonly unknown[]): Validator {
  return (value, label) => {
    if (!values.includes(value)) throw new Error(label + " is unsupported.");
  };
}

function boundedString(
  value: unknown,
  label: string,
  maximum = 5_000,
  allowEmpty = false,
): asserts value is string {
  if (
    typeof value !== "string"
    || value.length > maximum
    || (!allowEmpty && value.length === 0)
  ) {
    throw new Error(label + " must be bounded text.");
  }
}

const text: Validator = (value, label) => boundedString(value, label);
const optionalText: Validator = (value, label) => boundedString(value, label, 5_000, true);
const identifier: Validator = (value, label) => {
  boundedString(value, label, 2_048);
  if ((value as string).trim() !== value) throw new Error(label + " must be trimmed.");
};
const hash: Validator = (value, label) => {
  boundedString(value, label, 64);
  if (!HASH_PATTERN.test(value as string)) throw new Error(label + " must be a SHA-256 digest.");
};
const bool: Validator = (value, label) => {
  if (typeof value !== "boolean") throw new Error(label + " must be boolean.");
};
const safeCount: Validator = (value, label) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(label + " must be a non-negative safe integer.");
  }
};
const positiveSafeInteger: Validator = (value, label) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(label + " must be a positive safe integer.");
  }
};
const canonicalUnsignedInteger: Validator = (value, label) => {
  boundedString(value, label, 32);
  if (!/^(?:0|[1-9][0-9]*)$/.test(value as string)) {
    throw new Error(label + " must be a canonical non-negative integer.");
  }
  if (BigInt(value as string) > MAX_SQLITE_INTEGER) throw new Error(label + " is too large.");
};
const canonicalCounter: Validator = (value, label) => {
  boundedString(value, label, 32);
  if (!/^(?:0|-?[1-9][0-9]*)$/.test(value as string)) {
    throw new Error(label + " must be a canonical integer.");
  }
  const parsed = BigInt(value as string);
  if (parsed < -1n || parsed > MAX_SAFE_INTEGER) throw new Error(label + " is out of range.");
};
const canonicalSqliteInteger: Validator = (value, label) => {
  boundedString(value, label, 32);
  if (!/^(?:0|-?[1-9][0-9]*)$/.test(value as string)) {
    throw new Error(label + " must be a canonical signed integer.");
  }
  const parsed = BigInt(value as string);
  if (parsed < MIN_SQLITE_INTEGER || parsed > MAX_SQLITE_INTEGER) {
    throw new Error(label + " is outside SQLite's signed integer range.");
  }
};
const canonicalDecimal: Validator = (value, label) => {
  boundedString(value, label, 64);
  const parsed = canonicalizeDecimal(value as string, {
    maxIntegerDigits: 38,
    maxFractionDigits: 18,
    maxTotalDigits: 38,
  });
  if (!parsed.ok || parsed.value !== value) throw new Error(label + " must be a canonical decimal.");
};
const currency: Validator = (value, label) => {
  boundedString(value, label, 12);
  if (currencyMinorUnit(value as string) === null) throw new Error(label + " is unsupported.");
};

const workspaceShape = objectShape({
  id: identifier,
  name: text,
  defaultCurrency: currency,
  timeZone: text,
});
const accountShape = objectShape({
  id: identifier,
  name: text,
  baseCurrency: currency,
});
const instrumentShape = objectShape({
  id: identifier,
  symbol: text,
  assetClass: oneOf("stock", "etf", "option", "future", "forex", "crypto", "other"),
  quoteCurrency: currency,
  multiplier: canonicalDecimal,
});
const feeShape = objectShape({
  category: oneOf("COMMISSION", "REGULATORY", "EXCHANGE", "ROUTING", "OTHER"),
  currency,
  costMinor: canonicalSqliteInteger,
  minorUnit: safeCount,
});
const executionShape = objectShape({
  id: identifier,
  accountId: identifier,
  instrumentId: identifier,
  occurredAtUs: canonicalUnsignedInteger,
  ledgerSequence: canonicalUnsignedInteger,
  side: oneOf("BUY", "SELL"),
  positionEffect: oneOf("AUTO", "OPEN", "CLOSE"),
  quantity: canonicalDecimal,
  price: canonicalDecimal,
  quoteCurrency: currency,
  multiplier: canonicalDecimal,
  fees: arrayOf(feeShape),
  sourceIdentity: identifier,
  payloadHash: hash,
  receiptIds: arrayOf(identifier),
});
const receiptShape = objectShape({
  id: identifier,
  accountId: identifier,
  accountName: text,
  sourceName: text,
  importedAtUs: canonicalUnsignedInteger,
  sourceRows: safeCount,
  acceptedRows: safeCount,
  rejectedRows: safeCount,
  skippedRows: safeCount,
  warningCount: safeCount,
  executionCount: safeCount,
  rolledBackAtUs: nullable(canonicalUnsignedInteger),
});
const manualSubmissionShape = objectShape({
  submissionId: hash,
  executionId: identifier,
  symbol: text,
  side: oneOf("BUY", "SELL"),
  acknowledged: bool,
});
const reviewTermShape = objectShape({
  id: identifier,
  category: oneOf("setup", "mistake", "emotion", "tag"),
  name: text,
});
const playbookRuleShape = objectShape({
  id: identifier,
  playbookId: identifier,
  text,
});
const playbookShape = objectShape({
  id: identifier,
  name: text,
  rules: arrayOf(playbookRuleShape),
});
const reviewRuleShape = objectShape({
  ruleId: identifier,
  text,
  outcome: oneOf("followed", "broken", "not_applicable", "unreviewed"),
});
const reviewShape = objectShape({
  id: identifier,
  tradeSubjectId: identifier,
  version: positiveSafeInteger,
  state: oneOf("draft", "completed"),
  revision: hash,
  note: optionalText,
  setup: nullable(text),
  mistakes: arrayOf(text),
  emotion: nullable(text),
  tags: arrayOf(text),
  playbookId: nullable(identifier),
  playbookName: nullable(text),
  rules: arrayOf(reviewRuleShape),
  initialRisk: nullable(objectShape({ amount: canonicalDecimal, currency })),
  plannedStop: nullable(canonicalDecimal),
  resultRMetricId: oneOf("result-r"),
  resultRMetricVersion: oneOf(1),
  percentReturnMetricId: oneOf("percent-return"),
  percentReturnMetricVersion: oneOf(1),
  recordedAtUs: canonicalUnsignedInteger,
  completedAtUs: nullable(canonicalUnsignedInteger),
});
const reviewSubmissionShape = objectShape({
  revision: hash,
  reviewId: identifier,
});

const payloadShape = objectShape({
  adapter: oneOf("browser-session"),
  stateVersion: oneOf(1),
  workspace: nullable(workspaceShape),
  accounts: arrayOf(accountShape),
  instruments: arrayOf(instrumentShape),
  activeExecutions: arrayOf(executionShape),
  inactiveExecutions: arrayOf(tupleOf(identifier, executionShape)),
  receipts: arrayOf(receiptShape),
  receiptByRevision: arrayOf(tupleOf(hash, identifier)),
  manualSubmissions: arrayOf(tupleOf(hash, manualSubmissionShape)),
  reviewVersions: arrayOf(reviewShape),
  reviewHeads: arrayOf(tupleOf(identifier, identifier)),
  reviewTerms: arrayOf(reviewTermShape),
  playbooks: arrayOf(playbookShape),
  reviewSubmissions: arrayOf(tupleOf(hash, reviewSubmissionShape)),
  counters: objectShape({
    lastReviewRecordedAtMs: canonicalCounter,
    nextExecutionSequence: canonicalCounter,
    nextReceiptOrdinal: canonicalCounter,
  }),
});
function assertStrictOrder(values: readonly string[], label: string): void {
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1];
    const current = values[index];
    if (previous === undefined || current === undefined || stableCompare(previous, current) >= 0) {
      throw new Error(label + " must use unique canonical order.");
    }
  }
}

function assertPayloadOrder(payload: SessionJournalPayload): void {
  assertStrictOrder(payload.accounts.map((value) => value.id), "Session accounts");
  assertStrictOrder(payload.instruments.map((value) => value.id), "Session instruments");
  assertStrictOrder(payload.activeExecutions.map((value) => value.id), "Active executions");
  assertStrictOrder(payload.inactiveExecutions.map(([key]) => key), "Inactive executions");
  assertStrictOrder(payload.receipts.map((value) => value.id), "Import receipts");
  assertStrictOrder(payload.receiptByRevision.map(([key]) => key), "Receipt revision index");
  assertStrictOrder(payload.manualSubmissions.map(([key]) => key), "Manual submission index");
  assertStrictOrder(payload.reviewVersions.map((value) => value.id), "Review versions");
  assertStrictOrder(payload.reviewHeads.map(([key]) => key), "Review heads");
  assertStrictOrder(payload.reviewTerms.map((value) => value.id), "Review terms");
  assertStrictOrder(payload.playbooks.map((value) => value.id), "Playbooks");
  assertStrictOrder(payload.reviewSubmissions.map(([key]) => key), "Review submissions");
  payload.playbooks.forEach((playbook) => (
    assertStrictOrder(playbook.rules.map((rule) => rule.id), "Playbook rules")
  ));
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(label + " contains duplicates.");
}

function assertPayloadSemantics(
  payload: SessionJournalPayload,
  ledger: JournalLedgerSnapshot,
): void {
  assertPayloadOrder(payload);
  if (payload.workspace === null) {
    if (!isEmptySessionJournalPayload(payload)) {
      throw new Error("A browser session without a workspace must be exactly empty.");
    }
    return;
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: payload.workspace.timeZone }).format(new Date(0));
  } catch {
    throw new Error("The browser session workspace time zone is invalid.");
  }

  const accounts = new Map(payload.accounts.map((account) => [account.id, account]));
  const instruments = new Map(payload.instruments.map((instrument) => [instrument.id, instrument]));
  const receipts = new Map(payload.receipts.map((receipt) => [receipt.id, receipt]));
  const activeById = new Map(payload.activeExecutions.map((execution) => [execution.id, execution]));
  const inactiveBySource = new Map(payload.inactiveExecutions);
  const inactive = payload.inactiveExecutions.map(([, execution]) => execution);
  const allExecutions = [...payload.activeExecutions, ...inactive];

  if (
    accounts.size !== payload.accounts.length
    || instruments.size !== payload.instruments.length
    || receipts.size !== payload.receipts.length
    || activeById.size !== payload.activeExecutions.length
    || inactiveBySource.size !== payload.inactiveExecutions.length
  ) {
    throw new Error("Browser session identifiers are not unique.");
  }
  assertUnique(allExecutions.map((execution) => execution.id), "Execution IDs");
  assertUnique(allExecutions.map((execution) => execution.sourceIdentity), "Execution sources");
  assertUnique(allExecutions.map((execution) => execution.ledgerSequence), "Execution sequences");

  for (const account of payload.accounts) {
    if (account.baseCurrency !== payload.workspace.defaultCurrency) {
      throw new Error("An account currency conflicts with the workspace.");
    }
  }
  for (const instrument of payload.instruments) {
    if (instrument.quoteCurrency !== payload.workspace.defaultCurrency) {
      throw new Error("An instrument currency conflicts with the workspace.");
    }
  }
  for (const [sourceIdentity, execution] of payload.inactiveExecutions) {
    if (sourceIdentity !== execution.sourceIdentity || execution.receiptIds.length !== 0) {
      throw new Error("The inactive execution index is inconsistent.");
    }
  }
  for (const execution of allExecutions) {
    const account = accounts.get(execution.accountId);
    const instrument = instruments.get(execution.instrumentId);
    if (account === undefined || instrument === undefined) {
      throw new Error("An execution references missing account or instrument metadata.");
    }
    if (
      execution.quoteCurrency !== instrument.quoteCurrency
      || execution.multiplier !== instrument.multiplier
    ) {
      throw new Error("An execution conflicts with its instrument metadata.");
    }
    for (const fee of execution.fees) {
      if (
        fee.currency !== execution.quoteCurrency
        || fee.minorUnit !== currencyMinorUnit(fee.currency)
      ) {
        throw new Error("An execution fee conflicts with its currency metadata.");
      }
    }
  }

  const sequences = allExecutions.map((execution) => BigInt(execution.ledgerSequence));
  const nextSequence = sequences.length === 0
    ? 1n
    : sequences.reduce((maximum, value) => value > maximum ? value : maximum, 0n) + 1n;
  if (BigInt(payload.counters.nextExecutionSequence) !== nextSequence) {
    throw new Error("The next execution sequence is inconsistent.");
  }
  if (BigInt(payload.counters.nextReceiptOrdinal) < BigInt(payload.receipts.length)) {
    throw new Error("The next receipt ordinal precedes retained receipts.");
  }

  const indexedReceiptIds = payload.receiptByRevision.map(([, receiptId]) => {
    if (!receipts.has(receiptId)) throw new Error("The receipt index references a missing receipt.");
    return receiptId;
  });
  assertUnique(indexedReceiptIds, "Receipt index values");
  const indexedReceiptIdSet = new Set(indexedReceiptIds);
  for (const receipt of payload.receipts) {
    const account = accounts.get(receipt.accountId);
    if (account === undefined || account.name !== receipt.accountName) {
      throw new Error("An import receipt has inconsistent account metadata.");
    }
    if (receipt.rolledBackAtUs === null && !indexedReceiptIdSet.has(receipt.id)) {
      throw new Error(
        "Every active import receipt must remain in the exact-replay revision index.",
      );
    }
    if (
      receipt.sourceRows !== receipt.acceptedRows + receipt.rejectedRows + receipt.skippedRows
      || receipt.executionCount > receipt.acceptedRows
    ) {
      throw new Error("An import receipt has inconsistent row counts.");
    }
    if (
      receipt.rolledBackAtUs !== null
      && BigInt(receipt.rolledBackAtUs) < BigInt(receipt.importedAtUs)
    ) {
      throw new Error("An import rollback precedes its receipt.");
    }
  }
  for (const execution of payload.activeExecutions) {
    for (const receiptId of execution.receiptIds) {
      const receipt = receipts.get(receiptId);
      if (receipt === undefined || receipt.rolledBackAtUs !== null) {
        throw new Error("An active execution references an unavailable receipt.");
      }
    }
  }

  const manualExecutionIds = new Set<string>();
  for (const [submissionId, submission] of payload.manualSubmissions) {
    const execution = activeById.get(submission.executionId);
    const instrument = execution === undefined ? undefined : instruments.get(execution.instrumentId);
    if (
      submissionId !== submission.submissionId
      || execution === undefined
      || instrument === undefined
      || execution.sourceIdentity !== "manual:v1:" + submissionId
      || execution.receiptIds.length !== 0
      || execution.side !== submission.side
      || instrument.symbol !== submission.symbol
    ) {
      throw new Error("A manual submission has inconsistent execution ownership.");
    }
    manualExecutionIds.add(execution.id);
  }
  for (const execution of payload.activeExecutions) {
    const manual = execution.sourceIdentity.startsWith("manual:v1:");
    if (manual !== manualExecutionIds.has(execution.id)) {
      throw new Error("Manual execution ownership is incomplete.");
    }
    if (!manual && execution.receiptIds.length === 0) {
      throw new Error("An active imported execution has no receipt owner.");
    }
  }
  if (inactive.some((execution) => execution.sourceIdentity.startsWith("manual:v1:"))) {
    throw new Error("Manual executions cannot appear in inactive import history.");
  }

  const reviews = new Map(payload.reviewVersions.map((review) => [review.id, review]));
  const headSubjects = new Set<string>();
  for (const [tradeSubjectId, reviewId] of payload.reviewHeads) {
    const review = reviews.get(reviewId);
    if (
      review === undefined
      || review.tradeSubjectId !== tradeSubjectId
      || headSubjects.has(tradeSubjectId)
    ) {
      throw new Error("A review head is inconsistent.");
    }
    headSubjects.add(tradeSubjectId);
  }
  const chains = new Map<string, JournalTradeReviewRecord[]>();
  let maximumReviewMs = -1n;
  for (const review of payload.reviewVersions) {
    const chain = chains.get(review.tradeSubjectId) ?? [];
    chain.push(review);
    chains.set(review.tradeSubjectId, chain);
    const recorded = BigInt(review.recordedAtUs);
    if (
      recorded % 1_000n !== 0n
      || (review.state === "completed" && review.completedAtUs !== review.recordedAtUs)
      || (review.state === "draft" && review.completedAtUs !== null)
    ) {
      throw new Error("A review timestamp or completion state is inconsistent.");
    }
    const milliseconds = recorded / 1_000n;
    if (milliseconds > maximumReviewMs) maximumReviewMs = milliseconds;
  }
  if (chains.size !== payload.reviewHeads.length) {
    throw new Error("Review heads do not cover every review chain.");
  }
  for (const [tradeSubjectId, chain] of chains) {
    chain.sort((left, right) => left.version - right.version);
    chain.forEach((review, index) => {
      if (review.version !== index + 1) throw new Error("Review versions are not contiguous.");
    });
    if (payload.reviewHeads.find(([subject]) => subject === tradeSubjectId)?.[1] !== chain.at(-1)?.id) {
      throw new Error("A review head is not the latest immutable version.");
    }
  }
  if (BigInt(payload.counters.lastReviewRecordedAtMs) !== maximumReviewMs) {
    throw new Error("The review timestamp counter is inconsistent.");
  }

  const submissionsByReview = new Set<string>();
  for (const [submissionId, submission] of payload.reviewSubmissions) {
    if (submissionId.length !== 64) throw new Error("A review submission ID is invalid.");
    const review = reviews.get(submission.reviewId);
    if (
      review === undefined
      || review.revision !== submission.revision
      || submissionsByReview.has(submission.reviewId)
    ) {
      throw new Error("The review submission index is inconsistent.");
    }
    submissionsByReview.add(submission.reviewId);
  }
  if (submissionsByReview.size !== payload.reviewVersions.length) {
    throw new Error("The review submission index does not cover every review.");
  }

  const playbooks = new Map(payload.playbooks.map((playbook) => [playbook.id, playbook]));
  for (const playbook of payload.playbooks) {
    if (playbook.rules.some((rule) => rule.playbookId !== playbook.id)) {
      throw new Error("A playbook rule references a different playbook.");
    }
  }
  for (const review of payload.reviewVersions) {
    if (review.playbookId === null) {
      if (review.playbookName !== null || review.rules.length !== 0) {
        throw new Error("A review without a playbook contains playbook data.");
      }
      continue;
    }
    const playbook = playbooks.get(review.playbookId);
    if (playbook === undefined || playbook.name !== review.playbookName) {
      throw new Error("A review references missing playbook metadata.");
    }
    const rules = new Map(playbook.rules.map((rule) => [rule.id, rule]));
    if (review.rules.some((rule) => rules.get(rule.ruleId)?.text !== rule.text)) {
      throw new Error("A review rule snapshot conflicts with its playbook.");
    }
  }

  if (ledger.tradeSubjects.length !== ledger.projection.trades.length) {
    throw new Error("The active trade-subject projection is inconsistent.");
  }
}

function assertCurrentSchema(archive: JournalArchive): void {
  const expectedVersion = MOBILE_SCHEMA_MIGRATIONS.at(-1)?.toVersion ?? 0;
  if (
    archive.source.schemaUserVersion !== expectedVersion
    || archive.source.migrations.length !== MOBILE_SCHEMA_MIGRATIONS.length
  ) {
    throw new Error("The browser-session schema version is incompatible.");
  }
  archive.source.migrations.forEach((migration, index) => {
    const expected = MOBILE_SCHEMA_MIGRATIONS[index];
    if (
      expected === undefined
      || migration.version !== expected.toVersion
      || migration.name !== expected.name
      || migration.checksumSha256 !== expected.checksumSha256
    ) {
      throw new Error("The browser-session migration history is incompatible.");
    }
  });
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJournalArchiveJson(left as JournalArchiveJson)
    === canonicalJournalArchiveJson(right as JournalArchiveJson);
}

function deepFreeze<Value>(value: Value): Value {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

export function verifySessionJournalRestore(
  contents: string,
): VerifiedSessionRestoreCandidate {
  let archive: JournalArchive;
  try {
    archive = parseJournalArchive(contents);
  } catch (error) {
    throw new SessionRestoreValidationError(
      "invalid_archive",
      error instanceof Error ? error.message : "The selected file is not a valid journal archive.",
      { cause: error },
    );
  }
  if (archive.payload.kind !== "browser-session-state" || archive.payload.version !== 1) {
    throw new SessionRestoreValidationError(
      "unsupported_payload",
      "The browser journal restores only browser-session-state version 1 exports.",
    );
  }
  try {
    assertCurrentSchema(archive);
  } catch (error) {
    throw new SessionRestoreValidationError(
      "incompatible_schema",
      error instanceof Error ? error.message : "The browser-session schema is incompatible.",
      { cause: error },
    );
  }

  let payload: SessionJournalPayload;
  let ledger: JournalLedgerSnapshot;
  let summary: JournalArchiveSummary;
  try {
    payloadShape(archive.payload.data, "Browser session payload");
    payload = archive.payload.data as unknown as SessionJournalPayload;
    ledger = sessionJournalLedgerFromPayload(payload);
    assertPayloadSemantics(payload, ledger);
    workspaceSnapshotFromLedger(ledger);
    summary = sessionJournalSummary(payload, ledger);
  } catch (error) {
    throw new SessionRestoreValidationError(
      "invalid_payload",
      error instanceof Error ? error.message : "The browser session payload is invalid.",
      { cause: error },
    );
  }

  const stateSha256 = sessionJournalStateSha256(payload);
  const reportSha256 = sessionJournalReportSha256(ledger);
  if (
    stateSha256 !== archive.stateSha256
    || reportSha256 !== archive.reportSha256
    || !sameJson(summary, archive.summary)
  ) {
    throw new SessionRestoreValidationError(
      "verification_failed",
      "The browser-session state, report input, or summary does not match its payload.",
    );
  }
  return deepFreeze({
    archive,
    payload,
    ledger,
    summary,
    stateSha256,
    reportSha256,
  });
}
