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
  JournalDailyEntryRecord,
  JournalImportReceipt,
  JournalInstrumentRecord,
  JournalLedgerSnapshot,
  JournalPlaybookDefinitionRecord,
  JournalPlaybookRecord,
  JournalReviewTermRecord,
  JournalTradeReviewRecord,
  JournalWorkspaceRecord,
  UnacknowledgedManualExecution,
} from "../application/journal-store";
import { prepareDailyJournalEntry } from "../application/prepare-daily-journal";
import {
  preparePlaybookDefinition,
  type PlaybookDefinitionAction,
  type PlaybookDefinitionState,
} from "../application/prepare-playbook-definition";
import {
  PERCENT_RETURN_METRIC_ID,
  PERCENT_RETURN_METRIC_VERSION,
  prepareTradeReview,
  RESULT_R_METRIC_ID,
  RESULT_R_METRIC_VERSION,
} from "../application/prepare-trade-review";
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

export interface SessionDailyEntrySubmission {
  readonly revision: string;
  readonly entryVersionId: string;
}

export interface SessionPlaybookDefinitionIdentity {
  readonly id: string;
  readonly createdAtUs: string;
}

export interface SessionPlaybookDefinitionVersion {
  readonly playbookId: string;
  readonly versionId: string;
  readonly version: number;
  readonly action: PlaybookDefinitionAction;
  readonly expectedPreviousVersionId: string | null;
  readonly revision: string;
  readonly name: string;
  readonly state: PlaybookDefinitionState;
  readonly rules: readonly string[];
  readonly recordedAtUs: string;
}

export interface SessionPlaybookDefinitionSubmission {
  readonly revision: string;
  readonly versionId: string;
}

export type SessionLegacyTradeReviewRecord = Omit<
  JournalTradeReviewRecord,
  "playbookDefinition"
>;

function playbookDefinitionRecord(
  version: SessionPlaybookDefinitionVersion,
): JournalPlaybookDefinitionRecord {
  return Object.freeze({
    id: version.playbookId,
    versionId: version.versionId,
    version: version.version,
    revision: version.revision,
    name: version.name,
    state: version.state,
    rules: Object.freeze([...version.rules]),
    recordedAtUs: version.recordedAtUs,
  });
}

export function sessionPlaybookLibraryFromHistory(
  versions: readonly SessionPlaybookDefinitionVersion[],
  heads: ReadonlyMap<string, string> | readonly (readonly [string, string])[],
): readonly JournalPlaybookDefinitionRecord[] {
  const versionById = new Map(versions.map((version) => [version.versionId, version]));
  const entries = heads instanceof Map ? [...heads.entries()] : [...heads];
  return Object.freeze(entries.map(([playbookId, versionId]) => {
    const version = versionById.get(versionId);
    if (version === undefined || version.playbookId !== playbookId) {
      throw new Error("A playbook definition head lost its immutable version.");
    }
    return playbookDefinitionRecord(version);
  }).sort((left, right) => (
    stableCompare(normalizedName(left.name), normalizedName(right.name))
    || stableCompare(left.id, right.id)
  )));
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
  readonly playbookDefinitionIdentities: readonly SessionPlaybookDefinitionIdentity[];
  readonly playbookDefinitionVersions: readonly SessionPlaybookDefinitionVersion[];
  readonly playbookDefinitionHeads: ReadonlyMap<string, string>;
  readonly playbookDefinitionSubmissions: ReadonlyMap<string, SessionPlaybookDefinitionSubmission>;
  readonly reviewSubmissions: ReadonlyMap<string, SessionReviewSubmission>;
  readonly dailyEntryVersions: readonly JournalDailyEntryRecord[];
  readonly dailyEntryHeads: ReadonlyMap<string, string>;
  readonly dailyEntrySubmissions: ReadonlyMap<string, SessionDailyEntrySubmission>;
  readonly lastReviewRecordedAtMs: number;
  readonly lastDailyEntryRecordedAtMs: number;
  readonly lastPlaybookDefinitionRecordedAtMs: number;
  readonly nextExecutionSequence: number;
  readonly nextReceiptOrdinal: number;
}

export interface SessionJournalPayload {
  readonly adapter: "browser-session";
  readonly stateVersion: 3;
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
  readonly playbookDefinitionIdentities: readonly SessionPlaybookDefinitionIdentity[];
  readonly playbookDefinitionVersions: readonly SessionPlaybookDefinitionVersion[];
  readonly playbookDefinitionHeads: readonly (readonly [string, string])[];
  readonly playbookDefinitionSubmissions: readonly (readonly [string, SessionPlaybookDefinitionSubmission])[];
  readonly dailyEntryVersions: readonly JournalDailyEntryRecord[];
  readonly dailyEntryHeads: readonly (readonly [string, string])[];
  readonly dailyEntrySubmissions: readonly (readonly [string, SessionDailyEntrySubmission])[];
  readonly counters: {
    readonly lastReviewRecordedAtMs: string;
    readonly lastDailyEntryRecordedAtMs: string;
    readonly nextExecutionSequence: string;
    readonly lastPlaybookDefinitionRecordedAtMs: string;
    readonly nextReceiptOrdinal: string;
  };
}
export type SessionJournalPayloadV2 = Omit<
  SessionJournalPayload,
  | "stateVersion"
  | "reviewVersions"
  | "playbookDefinitionIdentities"
  | "playbookDefinitionVersions"
  | "playbookDefinitionHeads"
  | "playbookDefinitionSubmissions"
  | "counters"
> & {
  readonly stateVersion: 2;
  readonly reviewVersions: readonly SessionLegacyTradeReviewRecord[];
  readonly counters: {
    readonly lastReviewRecordedAtMs: string;
    readonly lastDailyEntryRecordedAtMs: string;
    readonly nextExecutionSequence: string;
    readonly nextReceiptOrdinal: string;
  };
};


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
  readonly sourcePayloadVersion: 2 | 3;
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

function canonicalReviewTermName(value: string): string {
  const canonical = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    canonical.length === 0
    || value !== canonical
    || [...canonical].length > 120
    || [...canonical.toLocaleLowerCase("en-US")].length > 120
    || /[\u0000-\u001f\u007f-\u009f]/u.test(canonical)
  ) {
    throw new Error(
      "Review vocabulary term names must be canonical single-line text of at most 120 characters.",
    );
  }
  return canonical;
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
    stateVersion: 3,
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
    playbookDefinitionIdentities: byId(state.playbookDefinitionIdentities),
    playbookDefinitionVersions: [...state.playbookDefinitionVersions]
      .sort((left, right) => stableCompare(left.versionId, right.versionId))
      .map((version) => ({ ...version, rules: [...version.rules] })),
    playbookDefinitionHeads: byKey(state.playbookDefinitionHeads.entries()),
    playbookDefinitionSubmissions: byKey(
      state.playbookDefinitionSubmissions.entries(),
    ),
    reviewSubmissions: byKey(state.reviewSubmissions.entries()),
    dailyEntryVersions: byId(state.dailyEntryVersions),
    dailyEntryHeads: byKey(state.dailyEntryHeads.entries()),
    dailyEntrySubmissions: byKey(state.dailyEntrySubmissions.entries()),
    counters: {
      lastReviewRecordedAtMs: String(state.lastReviewRecordedAtMs),
      lastDailyEntryRecordedAtMs: String(state.lastDailyEntryRecordedAtMs),
      lastPlaybookDefinitionRecordedAtMs: String(state.lastPlaybookDefinitionRecordedAtMs),
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
  payload: SessionJournalPayload | SessionJournalPayloadV2,
): JournalLedgerSnapshot {
  const executions: readonly LedgerExecution[] = payload.activeExecutions;
  const projection = normalizeTrades(executions);
  const reviewVersions: readonly JournalTradeReviewRecord[] = payload.stateVersion === 2
    ? payload.reviewVersions.map((review) => ({ ...review, playbookDefinition: null }))
    : payload.reviewVersions;
  const headIds = new Set(payload.reviewHeads.map(([, reviewId]) => reviewId));
  const tradeReviews = reviewVersions
    .filter((review) => headIds.has(review.id))
    .sort((left, right) => (
      BigInt(left.recordedAtUs) < BigInt(right.recordedAtUs) ? -1
        : BigInt(left.recordedAtUs) > BigInt(right.recordedAtUs) ? 1
          : stableCompare(left.id, right.id)
    ));
  const dailyHeadIds = new Set(payload.dailyEntryHeads.map(([, entryId]) => entryId));
  const dailyEntries = payload.dailyEntryVersions
    .filter((entry) => dailyHeadIds.has(entry.id))
    .sort((left, right) => (
      stableCompare(right.isoDate, left.isoDate)
      || stableCompare(left.id, right.id)
    ));
  return {
    workspace: payload.workspace,
    accounts: [...payload.accounts],
    instruments: [...payload.instruments],
    executions,
    projection,
    tradeSubjects: tradeSubjectsForProjection(projection),
    tradeReviews,
    dailyEntries,
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
  payload: SessionJournalPayload | SessionJournalPayloadV2,
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
    playbooks: String(
      payload.playbooks.length
      + (payload.stateVersion === 3 ? payload.playbookDefinitionIdentities.length : 0),
    ),
  });
}

export function sessionJournalStateSha256(
  payload: SessionJournalPayload | SessionJournalPayloadV2,
): string {
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

function isEmptySessionJournalBasePayload(
  payload: SessionJournalPayload | SessionJournalPayloadV2,
): boolean {
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
    && payload.dailyEntryVersions.length === 0
    && payload.dailyEntryHeads.length === 0
    && payload.dailyEntrySubmissions.length === 0
    && payload.counters.lastReviewRecordedAtMs === "-1"
    && payload.counters.lastDailyEntryRecordedAtMs === "-1"
    && payload.counters.nextExecutionSequence === "1"
    && payload.counters.nextReceiptOrdinal === "0";
}

export function isEmptySessionJournalPayload(payload: SessionJournalPayload): boolean {
  return isEmptySessionJournalBasePayload(payload)
    && payload.playbookDefinitionIdentities.length === 0
    && payload.playbookDefinitionVersions.length === 0
    && payload.playbookDefinitionHeads.length === 0
    && payload.playbookDefinitionSubmissions.length === 0
    && payload.counters.lastPlaybookDefinitionRecordedAtMs === "-1";
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
// Fast shape limits use the largest possible UTF-16 representation. The
// authoring validator below enforces exact NFC/code-point limits.
const dailyIdentifier: Validator = (value, label) => {
  boundedString(value, label, 512);
  const identifierValue = value as string;
  if (
    identifierValue.trim() !== identifierValue
    || [...identifierValue].length > 256
    || /[\u0000-\u001f\u007f-\u009f]/u.test(identifierValue)
  ) {
    throw new Error(label + " must contain 1-256 trimmed visible characters.");
  }
};
const dailyLabel: Validator = (value, label) => boundedString(value, label, 240);
const dailyNote: Validator = (value, label) => boundedString(value, label, 10_000, true);
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
const playbookDefinitionReferenceShape = objectShape({
  id: hash,
  versionId: hash,
  revision: hash,
});
const reviewShapeFields = {
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
} as const;
const legacyReviewShape = objectShape(reviewShapeFields);
const reviewShape = objectShape({
  ...reviewShapeFields,
  playbookDefinition: nullable(playbookDefinitionReferenceShape),
});
const reviewSubmissionShape = objectShape({
  revision: hash,
  reviewId: identifier,
});
const dailyEntryShape = objectShape({
  id: dailyIdentifier,
  isoDate: text,
  version: positiveSafeInteger,
  state: oneOf("draft", "completed"),
  revision: hash,
  title: nullable(dailyLabel),
  note: dailyNote,
  emotion: nullable(dailyLabel),
  processScorePct: nullable(safeCount),
  tags: arrayOf(dailyLabel),
  recordedAtUs: canonicalUnsignedInteger,
  completedAtUs: nullable(canonicalUnsignedInteger),
});
const dailyEntrySubmissionShape = objectShape({
  revision: hash,
  entryVersionId: dailyIdentifier,
});

const playbookDefinitionIdentityShape = objectShape({
  id: hash,
  createdAtUs: canonicalUnsignedInteger,
});
const playbookDefinitionVersionShape = objectShape({
  playbookId: hash,
  versionId: hash,
  version: positiveSafeInteger,
  action: oneOf("create", "edit", "archive", "restore"),
  expectedPreviousVersionId: nullable(hash),
  revision: hash,
  name: text,
  state: oneOf("active", "archived"),
  rules: arrayOf(text),
  recordedAtUs: canonicalUnsignedInteger,
});
const playbookDefinitionSubmissionShape = objectShape({
  revision: hash,
  versionId: hash,
});

const payloadShapeV2 = objectShape({
  adapter: oneOf("browser-session"),
  stateVersion: oneOf(2),
  workspace: nullable(workspaceShape),
  accounts: arrayOf(accountShape),
  instruments: arrayOf(instrumentShape),
  activeExecutions: arrayOf(executionShape),
  inactiveExecutions: arrayOf(tupleOf(identifier, executionShape)),
  receipts: arrayOf(receiptShape),
  receiptByRevision: arrayOf(tupleOf(hash, identifier)),
  manualSubmissions: arrayOf(tupleOf(hash, manualSubmissionShape)),
  reviewVersions: arrayOf(legacyReviewShape),
  reviewHeads: arrayOf(tupleOf(identifier, identifier)),
  reviewTerms: arrayOf(reviewTermShape),
  playbooks: arrayOf(playbookShape),
  reviewSubmissions: arrayOf(tupleOf(hash, reviewSubmissionShape)),
  dailyEntryVersions: arrayOf(dailyEntryShape),
  dailyEntryHeads: arrayOf(tupleOf(text, dailyIdentifier)),
  dailyEntrySubmissions: arrayOf(tupleOf(hash, dailyEntrySubmissionShape)),
  counters: objectShape({
    lastReviewRecordedAtMs: canonicalCounter,
    lastDailyEntryRecordedAtMs: canonicalCounter,
    nextExecutionSequence: canonicalCounter,
    nextReceiptOrdinal: canonicalCounter,
  }),
});

const payloadShape = objectShape({
  adapter: oneOf("browser-session"),
  stateVersion: oneOf(3),
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
  playbookDefinitionIdentities: arrayOf(playbookDefinitionIdentityShape),
  playbookDefinitionVersions: arrayOf(playbookDefinitionVersionShape),
  playbookDefinitionHeads: arrayOf(tupleOf(hash, hash)),
  playbookDefinitionSubmissions: arrayOf(tupleOf(hash, playbookDefinitionSubmissionShape)),
  reviewSubmissions: arrayOf(tupleOf(hash, reviewSubmissionShape)),
  dailyEntryVersions: arrayOf(dailyEntryShape),
  dailyEntryHeads: arrayOf(tupleOf(text, dailyIdentifier)),
  dailyEntrySubmissions: arrayOf(tupleOf(hash, dailyEntrySubmissionShape)),
  counters: objectShape({
    lastReviewRecordedAtMs: canonicalCounter,
    lastDailyEntryRecordedAtMs: canonicalCounter,
    lastPlaybookDefinitionRecordedAtMs: canonicalCounter,
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

function assertPayloadOrder(
  payload: SessionJournalPayload | SessionJournalPayloadV2,
): void {
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
  if (payload.stateVersion === 3) {
    assertStrictOrder(
      payload.playbookDefinitionIdentities.map((value) => value.id),
      "Playbook definition identities",
    );
    assertStrictOrder(payload.playbookDefinitionVersions.map((value) => value.versionId), "Playbook definition versions");
    assertStrictOrder(payload.playbookDefinitionHeads.map(([key]) => key), "Playbook definition heads");
    assertStrictOrder(payload.playbookDefinitionSubmissions.map(([key]) => key), "Playbook definition submissions");
  }
  assertStrictOrder(payload.reviewSubmissions.map(([key]) => key), "Review submissions");
  assertStrictOrder(payload.dailyEntryVersions.map((value) => value.id), "Daily entry versions");
  assertStrictOrder(payload.dailyEntryHeads.map(([key]) => key), "Daily entry heads");
  assertStrictOrder(payload.dailyEntrySubmissions.map(([key]) => key), "Daily entry submissions");
  payload.playbooks.forEach((playbook) => (
    assertStrictOrder(playbook.rules.map((rule) => rule.id), "Playbook rules")
  ));
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(label + " contains duplicates.");
}

function sameOrderedStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function reviewVocabularyIdentity(
  value: string,
  label: string,
  characterLimit: number,
): string {
  const canonical = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    canonical.length === 0
    || canonical !== value
    || [...canonical].length > characterLimit
    || [...canonical.toLocaleLowerCase("en-US")].length > characterLimit
    || /[\u0000-\u001f\u007f-\u009f]/u.test(canonical)
  ) {
    throw new Error(
      `Browser session ${label} must be canonical single-line text of at most ${characterLimit} characters.`,
    );
  }
  return canonical.toLocaleLowerCase("en-US");
}

function legacyTradeReviewRevision(
  review: ReturnType<typeof prepareTradeReview>,
): string {
  return sha256Hex(JSON.stringify([
    "hermes-trade-review-v1",
    review.submissionId,
    review.tradeSubjectId,
    review.expectedPreviousReviewId,
    review.state,
    review.note,
    review.setup === null ? null : review.setup.toLocaleLowerCase("en-US"),
    review.mistakes.map((value) => value.toLocaleLowerCase("en-US")),
    review.tags.map((value) => value.toLocaleLowerCase("en-US")),
    review.emotion === null ? null : review.emotion.toLocaleLowerCase("en-US"),
    review.playbook === null
      ? null
      : [
          review.playbook.name.toLocaleLowerCase("en-US"),
          review.playbook.rules.map((rule) => [
            rule.name.toLocaleLowerCase("en-US"),
            rule.outcome,
          ]),
        ],
    review.initialRisk === null
      ? null
      : [review.initialRisk.amount, review.initialRisk.currency],
    review.plannedStop,
    [RESULT_R_METRIC_ID, review.resultRVersion],
    [PERCENT_RETURN_METRIC_ID, review.percentReturnVersion],
  ]));
}

function assertTradeReviewRevision(
  review: JournalTradeReviewRecord,
  submissionId: string,
  expectedPreviousReviewId: string | null,
  playbooks: ReadonlyMap<string, JournalPlaybookRecord>,
  definitionVersions: ReadonlyMap<string, SessionPlaybookDefinitionVersion>,
  reviewVocabulary: ReadonlySet<string>,
): void {
  let playbook: Parameters<typeof prepareTradeReview>[0]["playbook"] = null;
  if (review.playbookId === null) {
    if (
      review.playbookName !== null
      || review.rules.length !== 0
      || review.playbookDefinition !== null
    ) {
      throw new Error("A review without a playbook contains playbook data.");
    }
  } else {
    const sharedPlaybook = playbooks.get(review.playbookId);
    if (sharedPlaybook === undefined || review.playbookName === null) {
      throw new Error("A review references missing playbook metadata.");
    }
    const sharedNameIdentity = reviewVocabularyIdentity(
      sharedPlaybook.name,
      "shared review-playbook name",
      120,
    );
    if (
      reviewVocabularyIdentity(review.playbookName, "review playbook snapshot", 120)
        !== sharedNameIdentity
    ) {
      throw new Error("A review playbook does not share its vocabulary identity.");
    }
    const sharedRules = new Map(sharedPlaybook.rules.map((rule) => [rule.id, rule]));
    for (const rule of review.rules) {
      const sharedRule = sharedRules.get(rule.ruleId);
      if (
        sharedRule === undefined
        || reviewVocabularyIdentity(rule.text, "review-rule snapshot", 500)
          !== reviewVocabularyIdentity(sharedRule.text, "shared review-rule name", 500)
      ) {
        throw new Error("A review rule snapshot conflicts with its playbook vocabulary.");
      }
    }

    let exactName = review.playbookName;
    let exactRuleNames = review.rules.map((rule) => rule.text);
    const definitionReference = review.playbookDefinition;
    if (definitionReference !== null) {
      const version = definitionVersions.get(definitionReference.versionId);
      if (
        version === undefined
        || version.playbookId !== definitionReference.id
        || version.revision !== definitionReference.revision
        || version.name !== review.playbookName
        || !sameOrderedStrings(version.rules, exactRuleNames)
      ) {
        throw new Error(
          "A review playbook definition snapshot conflicts with immutable history.",
        );
      }
      exactName = version.name;
      exactRuleNames = [...version.rules];
    }
    playbook = {
      name: exactName,
      definition: definitionReference,
      rules: review.rules.map((rule, index) => ({
        name: exactRuleNames[index] as string,
        outcome: rule.outcome,
      })),
    };
  }

  if (
    review.resultRMetricId !== RESULT_R_METRIC_ID
    || review.resultRMetricVersion !== RESULT_R_METRIC_VERSION
    || review.percentReturnMetricId !== PERCENT_RETURN_METRIC_ID
    || review.percentReturnMetricVersion !== PERCENT_RETURN_METRIC_VERSION
  ) {
    throw new Error("A trade review uses unsupported metric definitions.");
  }

  const exact = {
    submissionId,
    tradeSubjectId: review.tradeSubjectId,
    expectedPreviousReviewId,
    state: review.state,
    note: review.note,
    setup: review.setup,
    mistakes: review.mistakes,
    tags: review.tags,
    emotion: review.emotion,
    playbook,
    initialRisk: review.initialRisk,
    plannedStop: review.plannedStop,
  } as const;
  let prepared: ReturnType<typeof prepareTradeReview>;
  try {
    prepared = prepareTradeReview(exact);
  } catch (error) {
    throw new Error("A trade review does not satisfy the authored-content contract.", {
      cause: error,
    });
  }
  const exactDefinition = exact.playbook?.definition ?? null;

  const exactContent = JSON.stringify([
    exact.note,
    exact.setup,
    exact.mistakes,
    exact.tags,
    exact.emotion,
    exact.playbook === null
      ? null
      : [
          exact.playbook.name,
          exactDefinition === null
            ? null
            : [
                exactDefinition.id,
                exactDefinition.versionId,
                exactDefinition.revision,
              ],
          exact.playbook.rules.map((rule) => [rule.name, rule.outcome]),
        ],
    exact.initialRisk === null
      ? null
      : [exact.initialRisk.amount, exact.initialRisk.currency],
    exact.plannedStop,
  ]);
  const preparedContent = JSON.stringify([
    prepared.note,
    prepared.setup,
    prepared.mistakes,
    prepared.tags,
    prepared.emotion,
    prepared.playbook === null
      ? null
      : [
          prepared.playbook.name,
          prepared.playbook.definition === null
            ? null
            : [
                prepared.playbook.definition.id,
                prepared.playbook.definition.versionId,
                prepared.playbook.definition.revision,
              ],
          prepared.playbook.rules.map((rule) => [rule.name, rule.outcome]),
        ],
    prepared.initialRisk === null
      ? null
      : [prepared.initialRisk.amount, prepared.initialRisk.currency],
    prepared.plannedStop,
  ]);
  const revisionMatches = review.playbookDefinition === null
    ? review.revision === prepared.revision
      || review.revision === legacyTradeReviewRevision(prepared)
    : review.revision === prepared.revision;
  const expectedReviewId = `session-review:${sha256Hex(JSON.stringify([
    review.tradeSubjectId,
    submissionId,
    review.revision,
  ]))}`;
  if (
    exactContent !== preparedContent
    || !revisionMatches
    || review.id !== expectedReviewId
  ) {
    throw new Error("A trade review revision does not bind its exact canonical content.");
  }
  if (
    (prepared.setup !== null
      && !reviewVocabulary.has(`setup\u0000${normalizedName(prepared.setup)}`))
    || prepared.mistakes.some((mistake) => (
      !reviewVocabulary.has(`mistake\u0000${normalizedName(mistake)}`)
    ))
    || (prepared.emotion !== null
      && !reviewVocabulary.has(`emotion\u0000${normalizedName(prepared.emotion)}`))
    || prepared.tags.some((tag) => (
      !reviewVocabulary.has(`tag\u0000${normalizedName(tag)}`)
    ))
  ) {
    throw new Error("A trade review references missing shared review vocabulary.");
  }
}

function assertPlaybookDefinitionSemantics(payload: SessionJournalPayload): void {
  const identities = new Map(
    payload.playbookDefinitionIdentities.map((identity) => [identity.id, identity]),
  );
  const versions = new Map(
    payload.playbookDefinitionVersions.map((version) => [version.versionId, version]),
  );
  const heads = new Map(payload.playbookDefinitionHeads);
  const submissions = new Map(payload.playbookDefinitionSubmissions);
  if (
    identities.size !== payload.playbookDefinitionIdentities.length
    || versions.size !== payload.playbookDefinitionVersions.length
    || heads.size !== payload.playbookDefinitionHeads.length
    || submissions.size !== payload.playbookDefinitionSubmissions.length
    || identities.size !== heads.size
    || versions.size !== submissions.size
  ) {
    throw new Error("Playbook definition history contains duplicate or incomplete indexes.");
  }

  const submissionIdByVersion = new Map<string, string>();
  for (const [submissionId, submission] of payload.playbookDefinitionSubmissions) {
    const version = versions.get(submission.versionId);
    if (
      version === undefined
      || version.revision !== submission.revision
      || submissionIdByVersion.has(submission.versionId)
    ) {
      throw new Error("A playbook definition submission index is inconsistent.");
    }
    submissionIdByVersion.set(submission.versionId, submissionId);
  }

  const chains = new Map<string, SessionPlaybookDefinitionVersion[]>();
  const recordedTimes = new Set<string>();
  let maximumRecordedAtMs = -1n;
  for (const version of payload.playbookDefinitionVersions) {
    if (!identities.has(version.playbookId)) {
      throw new Error("A playbook definition version references a missing stable identity.");
    }
    const submissionId = submissionIdByVersion.get(version.versionId);
    if (submissionId === undefined) {
      throw new Error("A playbook definition version is missing its submission receipt.");
    }
    const prepared = preparePlaybookDefinition(version.action === "create" ? {
      submissionId,
      action: "create",
      playbookId: null,
      expectedPreviousVersionId: null,
      name: version.name,
      rules: version.rules,
    } : {
      submissionId,
      action: version.action,
      playbookId: version.playbookId,
      expectedPreviousVersionId: version.expectedPreviousVersionId as string,
      name: version.name,
      rules: version.rules,
    });
    if (
      prepared.playbookId !== version.playbookId
      || prepared.versionId !== version.versionId
      || prepared.revision !== version.revision
      || prepared.state !== version.state
      || prepared.name !== version.name
      || !sameOrderedStrings(prepared.rules.map((rule) => rule.text), version.rules)
    ) {
      throw new Error("A playbook definition version does not bind its exact canonical command.");
    }
    const recordedAtUs = BigInt(version.recordedAtUs);
    if (recordedAtUs % 1_000n !== 0n || recordedTimes.has(version.recordedAtUs)) {
      throw new Error("Playbook definition timestamps must be unique millisecond values.");
    }
    recordedTimes.add(version.recordedAtUs);
    const recordedAtMs = recordedAtUs / 1_000n;
    if (recordedAtMs > maximumRecordedAtMs) maximumRecordedAtMs = recordedAtMs;
    const chain = chains.get(version.playbookId) ?? [];
    chain.push(version);
    chains.set(version.playbookId, chain);
  }
  if (chains.size !== identities.size) {
    throw new Error("Every playbook definition identity must own immutable history.");
  }

  for (const [playbookId, chain] of chains) {
    chain.sort((left, right) => left.version - right.version);
    const identity = identities.get(playbookId);
    const first = chain[0];
    if (
      identity === undefined
      || first === undefined
      || identity.createdAtUs !== first.recordedAtUs
      || first.action !== "create"
      || first.expectedPreviousVersionId !== null
      || first.state !== "active"
    ) {
      throw new Error("A playbook definition identity has an invalid creation version.");
    }
    let previous: SessionPlaybookDefinitionVersion | null = null;
    for (const [index, version] of chain.entries()) {
      if (
        version.version !== index + 1
        || (previous !== null && BigInt(version.recordedAtUs) <= BigInt(previous.recordedAtUs))
        || (previous !== null && version.expectedPreviousVersionId !== previous.versionId)
      ) {
        throw new Error("Playbook definition versions are not contiguous immutable history.");
      }
      if (previous !== null) {
        const unchanged = previous.name === version.name
          && sameOrderedStrings(previous.rules, version.rules);
        const validTransition = version.action === "edit"
          ? previous.state === "active" && version.state === "active"
          : version.action === "archive"
            ? previous.state === "active" && version.state === "archived" && unchanged
            : version.action === "restore"
              && previous.state === "archived" && version.state === "active" && unchanged;
        if (!validTransition) {
          throw new Error("A playbook definition lifecycle transition is invalid.");
        }
      }
      previous = version;
    }
    if (heads.get(playbookId) !== chain.at(-1)?.versionId) {
      throw new Error("A playbook definition head is not its latest immutable version.");
    }
  }

  const names = new Set<string>();
  for (const definition of sessionPlaybookLibraryFromHistory(
    payload.playbookDefinitionVersions,
    payload.playbookDefinitionHeads,
  )) {
    const key = normalizedName(definition.name);
    if (names.has(key)) {
      throw new Error("Current playbook definition names must be unique case-insensitively.");
    }
    names.add(key);
  }
  if (BigInt(payload.counters.lastPlaybookDefinitionRecordedAtMs) !== maximumRecordedAtMs) {
    throw new Error("The playbook definition timestamp counter is inconsistent.");
  }
}

function assertPayloadSemantics(
  payload: SessionJournalPayload | SessionJournalPayloadV2,
  ledger: JournalLedgerSnapshot,
): void {
  assertPayloadOrder(payload);
  if (payload.stateVersion === 3) assertPlaybookDefinitionSemantics(payload);
  if (payload.workspace === null) {
    if (!isEmptySessionJournalBasePayload(payload)) {
      throw new Error("A browser session without a workspace must have empty journal data.");
    }
    return;
  }
  const reviewVersions: readonly JournalTradeReviewRecord[] = payload.stateVersion === 2
    ? payload.reviewVersions.map((review) => ({ ...review, playbookDefinition: null }))
    : payload.reviewVersions;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: payload.workspace.timeZone }).format(new Date(0));
  } catch {
    throw new Error("The browser session workspace time zone is invalid.");
  }

  const dailyVocabulary = new Set<string>();
  for (const term of payload.reviewTerms) {
    const canonicalName = canonicalReviewTermName(term.name);
    const normalizedTermName = normalizedName(canonicalName);
    const expectedTermId = `session-review-term:${sha256Hex(JSON.stringify([
      term.category,
      normalizedTermName,
    ]))}`;
    if (term.id !== expectedTermId) throw new Error("A review vocabulary ID is inconsistent.");
    const key = `${term.category}\u0000${normalizedTermName}`;
    if (dailyVocabulary.has(key)) {
      throw new Error("Review vocabulary contains duplicate normalized terms.");
    }
    dailyVocabulary.add(key);
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

  const reviews = new Map(reviewVersions.map((review) => [review.id, review]));
  const reviewHeadBySubject = new Map<string, string>();
  for (const [tradeSubjectId, reviewId] of payload.reviewHeads) {
    const review = reviews.get(reviewId);
    if (
      review === undefined
      || review.tradeSubjectId !== tradeSubjectId
      || reviewHeadBySubject.has(tradeSubjectId)
    ) {
      throw new Error("A review head is inconsistent.");
    }
    reviewHeadBySubject.set(tradeSubjectId, reviewId);
  }
  const expectedPreviousReviewIdByReview = new Map<string, string | null>();
  const chains = new Map<string, JournalTradeReviewRecord[]>();
  let maximumReviewMs = -1n;
  for (const review of reviewVersions) {
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
  if (chains.size !== reviewHeadBySubject.size) {
    throw new Error("Review heads do not cover every review chain.");
  }
  for (const [tradeSubjectId, chain] of chains) {
    chain.sort((left, right) => left.version - right.version);
    let expectedPreviousReviewId: string | null = null;
    let previousRecordedAtUs = -1n;
    chain.forEach((review, index) => {
      const recordedAtUs = BigInt(review.recordedAtUs);
      if (review.version !== index + 1 || recordedAtUs <= previousRecordedAtUs) {
        throw new Error("Review versions are not contiguous.");
      }
      expectedPreviousReviewIdByReview.set(review.id, expectedPreviousReviewId);
      expectedPreviousReviewId = review.id;
      previousRecordedAtUs = recordedAtUs;
    });
    if (reviewHeadBySubject.get(tradeSubjectId) !== chain.at(-1)?.id) {
      throw new Error("A review head is not the latest immutable version.");
    }
  }
  if (BigInt(payload.counters.lastReviewRecordedAtMs) !== maximumReviewMs) {
    throw new Error("The review timestamp counter is inconsistent.");
  }

  const submissionsByReview = new Set<string>();
  const submissionIdByReview = new Map<string, string>();
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
    submissionIdByReview.set(submission.reviewId, submissionId);
  }
  if (submissionsByReview.size !== reviewVersions.length) {
    throw new Error("The review submission index does not cover every review.");
  }

  const dailyEntries = new Map(payload.dailyEntryVersions.map((entry) => [entry.id, entry]));
  const dailyChains = new Map<string, JournalDailyEntryRecord[]>();
  let maximumDailyEntryMs = -1n;
  for (const entry of payload.dailyEntryVersions) {
    const parsedDate = new Date(entry.isoDate + "T12:00:00.000Z");
    if (
      !/^(?:19[7-9][0-9]|[2-9][0-9]{3})-[0-9]{2}-[0-9]{2}$/.test(entry.isoDate)
      || !Number.isFinite(parsedDate.getTime())
      || parsedDate.toISOString().slice(0, 10) !== entry.isoDate
    ) {
      throw new Error("A daily entry date is not a supported canonical Gregorian date.");
    }
    if (
      entry.processScorePct !== null
      && (!Number.isInteger(entry.processScorePct) || entry.processScorePct > 100)
    ) {
      throw new Error("A daily entry process score is outside 0-100.");
    }
    if (
      entry.title === null
      && entry.note.length === 0
      && entry.emotion === null
      && entry.processScorePct === null
      && entry.tags.length === 0
    ) {
      throw new Error("A daily entry must retain at least one authored signal.");
    }
    const recorded = BigInt(entry.recordedAtUs);
    if (
      recorded % 1_000n !== 0n
      || (entry.state === "completed" && entry.completedAtUs !== entry.recordedAtUs)
      || (entry.state === "draft" && entry.completedAtUs !== null)
    ) {
      throw new Error("A daily entry timestamp or completion state is inconsistent.");
    }
    const milliseconds = recorded / 1_000n;
    if (milliseconds > maximumDailyEntryMs) maximumDailyEntryMs = milliseconds;
    const chain = dailyChains.get(entry.isoDate) ?? [];
    chain.push(entry);
    dailyChains.set(entry.isoDate, chain);
  }
  const dailyHeadByDate = new Map<string, string>();
  for (const [isoDate, entryId] of payload.dailyEntryHeads) {
    const entry = dailyEntries.get(entryId);
    if (
      entry === undefined
      || entry.isoDate !== isoDate
      || dailyHeadByDate.has(isoDate)
    ) {
      throw new Error("A daily entry head is inconsistent.");
    }
    dailyHeadByDate.set(isoDate, entryId);
  }
  if (dailyChains.size !== dailyHeadByDate.size) {
    throw new Error("Daily entry heads do not cover every immutable chain.");
  }
  for (const [isoDate, chain] of dailyChains) {
    chain.sort((left, right) => left.version - right.version);
    let previousRecordedAtUs = -1n;
    chain.forEach((entry, index) => {
      const recordedAtUs = BigInt(entry.recordedAtUs);
      if (entry.version !== index + 1 || recordedAtUs <= previousRecordedAtUs) {
        throw new Error("Daily entry versions are not contiguous.");
      }
      previousRecordedAtUs = recordedAtUs;
    });
    if (
      dailyHeadByDate.get(isoDate) !== chain.at(-1)?.id
    ) {
      throw new Error("A daily entry head is not the latest immutable version.");
    }
  }
  if (BigInt(payload.counters.lastDailyEntryRecordedAtMs) !== maximumDailyEntryMs) {
    throw new Error("The daily entry timestamp counter is inconsistent.");
  }
  const submissionsByDailyEntry = new Set<string>();
  const submissionIdByDailyEntry = new Map<string, string>();
  for (const [submissionId, submission] of payload.dailyEntrySubmissions) {
    const entry = dailyEntries.get(submission.entryVersionId);
    if (
      submissionId.length !== 64
      || entry === undefined
      || entry.revision !== submission.revision
      || submissionsByDailyEntry.has(submission.entryVersionId)
    ) {
      throw new Error("The daily entry submission index is inconsistent.");
    }
    submissionsByDailyEntry.add(submission.entryVersionId);
    submissionIdByDailyEntry.set(submission.entryVersionId, submissionId);
  }
  if (submissionsByDailyEntry.size !== payload.dailyEntryVersions.length) {
    throw new Error("The daily entry submission index does not cover every version.");
  }
  for (const chain of dailyChains.values()) {
    chain.sort((left, right) => left.version - right.version);
    let expectedPreviousEntryId: string | null = null;
    for (const entry of chain) {
      const submissionId = submissionIdByDailyEntry.get(entry.id);
      if (submissionId === undefined) {
        throw new Error("A daily entry is missing its durable submission identity.");
      }
      let prepared: ReturnType<typeof prepareDailyJournalEntry>;
      try {
        prepared = prepareDailyJournalEntry({
          submissionId,
          isoDate: entry.isoDate,
          expectedPreviousEntryId,
          state: entry.state,
          title: entry.title,
          note: entry.note,
          emotion: entry.emotion,
          processScorePct: entry.processScorePct,
          tags: entry.tags,
        });
      } catch (error) {
        throw new Error("A daily entry does not satisfy the authored-content contract.", {
          cause: error,
        });
      }
      if (
        prepared.revision !== entry.revision
        || prepared.title !== entry.title
        || prepared.note !== entry.note
        || prepared.emotion !== entry.emotion
        || prepared.processScorePct !== entry.processScorePct
        || prepared.tags.length !== entry.tags.length
        || prepared.tags.some((tag, index) => tag !== entry.tags[index])
      ) {
        throw new Error("A daily entry revision does not bind its exact normalized content.");
      }
      if (
        (prepared.emotion !== null
          && !dailyVocabulary.has(`emotion\u0000${normalizedName(prepared.emotion)}`))
        || prepared.tags.some((tag) => (
          !dailyVocabulary.has(`tag\u0000${normalizedName(tag)}`)
        ))
      ) {
        throw new Error("A daily entry references missing shared review vocabulary.");
      }
      expectedPreviousEntryId = entry.id;
    }
  }

  const playbooks = new Map(payload.playbooks.map((playbook) => [playbook.id, playbook]));
  const definitionVersions = payload.stateVersion === 3
    ? new Map(payload.playbookDefinitionVersions.map((version) => [version.versionId, version]))
    : new Map<string, SessionPlaybookDefinitionVersion>();
  const playbookNames = new Set<string>();
  for (const playbook of payload.playbooks) {
    const playbookName = reviewVocabularyIdentity(
      playbook.name,
      "shared review-playbook name",
      120,
    );
    const expectedPlaybookId = `session-playbook:${sha256Hex(playbookName)}`;
    if (playbook.id !== expectedPlaybookId || playbookNames.has(playbookName)) {
      throw new Error("Shared review playbooks contain inconsistent normalized identity.");
    }
    playbookNames.add(playbookName);
    const ruleNames = new Set<string>();
    for (const rule of playbook.rules) {
      const ruleName = reviewVocabularyIdentity(
        rule.text,
        "shared review-rule name",
        500,
      );
      const expectedRuleId = `session-playbook-rule:${sha256Hex(JSON.stringify([
        playbook.id,
        ruleName,
      ]))}`;
      if (
        rule.playbookId !== playbook.id
        || rule.id !== expectedRuleId
        || ruleNames.has(ruleName)
      ) {
        throw new Error("A shared review-playbook rule has inconsistent normalized identity.");
      }
      ruleNames.add(ruleName);
    }
  }
  for (const review of reviewVersions) {
    const submissionId = submissionIdByReview.get(review.id);
    if (
      submissionId === undefined
      || !expectedPreviousReviewIdByReview.has(review.id)
    ) {
      throw new Error("A trade review is missing its durable command identity.");
    }
    assertTradeReviewRevision(
      review,
      submissionId,
      expectedPreviousReviewIdByReview.get(review.id) ?? null,
      playbooks,
      definitionVersions,
      dailyVocabulary,
    );
  }

  if (ledger.tradeSubjects.length !== ledger.projection.trades.length) {
    throw new Error("The active trade-subject projection is inconsistent.");
  }
}

function assertSchemaVersion(
  archive: JournalArchive,
  expectedVersion: number,
): void {
  const expectedMigrations = MOBILE_SCHEMA_MIGRATIONS.slice(0, expectedVersion);
  if (
    archive.source.schemaUserVersion !== expectedVersion
    || expectedMigrations.at(-1)?.toVersion !== expectedVersion
    || archive.source.migrations.length !== expectedMigrations.length
  ) {
    throw new Error("The browser-session schema version is incompatible.");
  }
  archive.source.migrations.forEach((migration, index) => {
    const expected = expectedMigrations[index];
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

function migrateSessionJournalPayloadV2(
  payload: SessionJournalPayloadV2,
): SessionJournalPayload {
  return {
    ...payload,
    stateVersion: 3,
    reviewVersions: payload.reviewVersions.map((review) => ({
      ...review,
      playbookDefinition: null,
    })),
    playbookDefinitionIdentities: [],
    playbookDefinitionVersions: [],
    playbookDefinitionHeads: [],
    playbookDefinitionSubmissions: [],
    counters: { ...payload.counters, lastPlaybookDefinitionRecordedAtMs: "-1" },
  };
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
  if (
    archive.payload.kind !== "browser-session-state"
    || (archive.payload.version !== 2 && archive.payload.version !== 3)
  ) {
    throw new SessionRestoreValidationError(
      "unsupported_payload",
      "The browser journal restores browser-session-state version 2 or 3 exports.",
    );
  }
  const sourcePayloadVersion = archive.payload.version;
  try {
    assertSchemaVersion(
      archive,
      sourcePayloadVersion === 2
        ? 4
        : MOBILE_SCHEMA_MIGRATIONS.at(-1)?.toVersion ?? 0,
    );
  } catch (error) {
    throw new SessionRestoreValidationError(
      "incompatible_schema",
      error instanceof Error ? error.message : "The browser-session schema is incompatible.",
      { cause: error },
    );
  }

  let sourcePayload: SessionJournalPayload | SessionJournalPayloadV2;
  let sourceLedger: JournalLedgerSnapshot;
  let sourceSummary: JournalArchiveSummary;
  try {
    if (sourcePayloadVersion === 2) {
      payloadShapeV2(archive.payload.data, "Browser session v2 payload");
      sourcePayload = archive.payload.data as unknown as SessionJournalPayloadV2;
    } else {
      payloadShape(archive.payload.data, "Browser session v3 payload");
      sourcePayload = archive.payload.data as unknown as SessionJournalPayload;
    }
    sourceLedger = sessionJournalLedgerFromPayload(sourcePayload);
    assertPayloadSemantics(sourcePayload, sourceLedger);
    if (sourceLedger.workspace !== null) workspaceSnapshotFromLedger(sourceLedger);
    sourceSummary = sessionJournalSummary(sourcePayload, sourceLedger);
  } catch (error) {
    throw new SessionRestoreValidationError(
      "invalid_payload",
      error instanceof Error ? error.message : "The browser session payload is invalid.",
      { cause: error },
    );
  }

  const sourceStateSha256 = sessionJournalStateSha256(sourcePayload);
  const sourceReportSha256 = sessionJournalReportSha256(sourceLedger);
  if (
    sourceStateSha256 !== archive.stateSha256
    || sourceReportSha256 !== archive.reportSha256
    || !sameJson(sourceSummary, archive.summary)
  ) {
    throw new SessionRestoreValidationError(
      "verification_failed",
      "The browser-session state, report input, or summary does not match its payload.",
    );
  }

  const payload = sourcePayloadVersion === 2
    ? migrateSessionJournalPayloadV2(sourcePayload as SessionJournalPayloadV2)
    : sourcePayload as SessionJournalPayload;
  let ledger: JournalLedgerSnapshot;
  let summary: JournalArchiveSummary;
  try {
    ledger = sessionJournalLedgerFromPayload(payload);
    assertPayloadSemantics(payload, ledger);
    if (ledger.workspace !== null) workspaceSnapshotFromLedger(ledger);
    summary = sessionJournalSummary(payload, ledger);
  } catch (error) {
    throw new SessionRestoreValidationError(
      "invalid_payload",
      error instanceof Error ? error.message : "The migrated browser session payload is invalid.",
      { cause: error },
    );
  }
  const stateSha256 = sessionJournalStateSha256(payload);
  const reportSha256 = sessionJournalReportSha256(ledger);
  if (reportSha256 !== sourceReportSha256 || !sameJson(summary, sourceSummary)) {
    throw new SessionRestoreValidationError(
      "verification_failed",
      "Browser-session migration changed governed report or summary inputs.",
    );
  }
  return deepFreeze({
    archive,
    payload,
    sourcePayloadVersion,
    ledger,
    summary,
    stateSha256,
    reportSha256,
  });
}
