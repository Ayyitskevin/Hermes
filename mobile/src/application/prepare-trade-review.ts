import { sha256Hex } from "../adapters/sqlite/schema/checksum";
import { currencyMinorUnit } from "../core/currency";
import { canonicalizeDecimal, type CanonicalDecimal } from "../core/decimal";

export const RESULT_R_METRIC_ID = "result-r" as const;
export const RESULT_R_METRIC_VERSION = 1 as const;
export const PERCENT_RETURN_METRIC_ID = "percent-return" as const;
export const PERCENT_RETURN_METRIC_VERSION = 1 as const;

export const TRADE_REVIEW_NOTE_LIMIT = 5_000;
export const TRADE_REVIEW_LABEL_LIMIT = 120;
export const TRADE_REVIEW_RULE_LIMIT = 500;
export const TRADE_REVIEW_LIST_LIMIT = 20;
export const TRADE_REVIEW_IDENTIFIER_LIMIT = 256;

export type TradeReviewState = "draft" | "completed";
export type TradeReviewRuleOutcome =
  | "followed"
  | "broken"
  | "not_applicable"
  | "unreviewed";

export interface TradeReviewRuleInput {
  readonly name: string;
  readonly outcome: TradeReviewRuleOutcome;
}

export interface TradeReviewPlaybookInput {
  readonly name: string;
  readonly rules: readonly TradeReviewRuleInput[];
}

export interface TradeReviewInitialRiskInput {
  readonly amount: string;
  readonly currency: string;
}

export interface TradeReviewInput {
  readonly submissionId: string;
  readonly tradeSubjectId: string;
  readonly expectedPreviousReviewId: string | null;
  readonly state: TradeReviewState;
  readonly note: string;
  readonly setup: string | null;
  readonly mistakes: readonly string[];
  readonly tags: readonly string[];
  readonly emotion: string | null;
  readonly playbook: TradeReviewPlaybookInput | null;
  readonly initialRisk: TradeReviewInitialRiskInput | null;
  readonly plannedStop: string | null;
}

export interface PreparedTradeReviewRule {
  readonly name: string;
  readonly outcome: TradeReviewRuleOutcome;
}

export interface PreparedTradeReviewPlaybook {
  readonly name: string;
  readonly rules: readonly PreparedTradeReviewRule[];
}

export interface PreparedTradeReviewInitialRisk {
  readonly amount: CanonicalDecimal;
  readonly currency: string;
}

export interface PreparedTradeReview {
  readonly submissionId: string;
  readonly tradeSubjectId: string;
  readonly expectedPreviousReviewId: string | null;
  readonly state: TradeReviewState;
  readonly note: string;
  readonly setup: string | null;
  readonly mistakes: readonly string[];
  readonly tags: readonly string[];
  readonly emotion: string | null;
  readonly playbook: PreparedTradeReviewPlaybook | null;
  readonly initialRisk: PreparedTradeReviewInitialRisk | null;
  readonly plannedStop: CanonicalDecimal | null;
  readonly resultRVersion: typeof RESULT_R_METRIC_VERSION;
  readonly percentReturnVersion: typeof PERCENT_RETURN_METRIC_VERSION;
  readonly revision: string;
}

export type TradeReviewRevisionInput = Omit<PreparedTradeReview, "revision">;

export type TradeReviewPreparationErrorCode =
  | "invalid_submission_id"
  | "invalid_identifier"
  | "invalid_state"
  | "invalid_content"
  | "too_many_values"
  | "invalid_rule_outcome"
  | "invalid_risk"
  | "incomplete_review"
  | "review_changed";

export class TradeReviewPreparationError extends Error {
  constructor(
    readonly code: TradeReviewPreparationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "TradeReviewPreparationError";
  }
}

const RULE_OUTCOMES: ReadonlySet<string> = new Set<TradeReviewRuleOutcome>([
  "followed",
  "broken",
  "not_applicable",
  "unreviewed",
]);

function fail(code: TradeReviewPreparationErrorCode, message: string): never {
  throw new TradeReviewPreparationError(code, message);
}

function characterCount(value: string): number {
  return [...value].length;
}

function hasControlCharacter(value: string, allowNoteWhitespace = false): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) return false;
    if (allowNoteWhitespace && (codePoint === 9 || codePoint === 10)) return false;
    return codePoint < 32 || (codePoint >= 127 && codePoint <= 159);
  });
}

function validatedIdentifier(value: string, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.trim() !== value
    || characterCount(value) > TRADE_REVIEW_IDENTIFIER_LIMIT
    || hasControlCharacter(value)
  ) {
    fail(
      "invalid_identifier",
      `${label} must contain 1-${TRADE_REVIEW_IDENTIFIER_LIMIT} trimmed visible characters.`,
    );
  }
  return value;
}

function validatedSubmissionId(value: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    fail(
      "invalid_submission_id",
      "Trade review submission ID must be a 256-bit lowercase hexadecimal value.",
    );
  }
  return value;
}

function normalizedNote(value: string): string {
  if (typeof value !== "string") {
    fail("invalid_content", "Review note must be text.");
  }
  const normalized = value
    .replace(/\r\n?/g, "\n")
    .normalize("NFC")
    .trim();
  if (hasControlCharacter(normalized, true)) {
    fail("invalid_content", "Review note contains an unsupported control character.");
  }
  if (characterCount(normalized) > TRADE_REVIEW_NOTE_LIMIT) {
    fail(
      "invalid_content",
      `Review note must be at most ${TRADE_REVIEW_NOTE_LIMIT} characters.`,
    );
  }
  return normalized;
}

function normalizedLabel(
  value: string,
  label: string,
  limit = TRADE_REVIEW_LABEL_LIMIT,
): string {
  if (typeof value !== "string" || hasControlCharacter(value)) {
    fail("invalid_content", `${label} must use visible single-line text.`);
  }
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    normalized.length === 0
    || characterCount(normalized) > limit
    || characterCount(normalized.toLocaleLowerCase("en-US")) > limit
  ) {
    fail(
      "invalid_content",
      `${label} must contain 1-${limit} visible characters.`,
    );
  }
  return normalized;
}

function normalizedOptionalLabel(value: string | null, label: string): string | null {
  if (value === null) return null;
  if (typeof value === "string" && value.trim().length === 0) return null;
  return normalizedLabel(value, label);
}

function normalizedLabels(values: readonly string[], label: string): readonly string[] {
  if (!Array.isArray(values)) {
    fail("invalid_content", `${label} must be a list.`);
  }
  if (values.length > TRADE_REVIEW_LIST_LIMIT) {
    fail(
      "too_many_values",
      `${label} supports at most ${TRADE_REVIEW_LIST_LIMIT} values.`,
    );
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const item = normalizedLabel(value, `${label} value`);
    const key = item.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(item);
  }
  return Object.freeze(normalized);
}

function normalizedRules(
  rules: readonly TradeReviewRuleInput[],
): readonly PreparedTradeReviewRule[] {
  if (!Array.isArray(rules)) {
    fail("invalid_content", "Playbook rules must be a list.");
  }
  if (rules.length > TRADE_REVIEW_LIST_LIMIT) {
    fail(
      "too_many_values",
      `A playbook supports at most ${TRADE_REVIEW_LIST_LIMIT} reviewed rules.`,
    );
  }

  const byName = new Map<string, TradeReviewRuleOutcome>();
  const normalized: PreparedTradeReviewRule[] = [];
  for (const rule of rules) {
    if (typeof rule !== "object" || rule === null) {
      fail("invalid_content", "Each playbook rule must include a name and outcome.");
    }
    const name = normalizedLabel(rule.name, "Playbook rule", TRADE_REVIEW_RULE_LIMIT);
    if (!RULE_OUTCOMES.has(rule.outcome)) {
      fail(
        "invalid_rule_outcome",
        "Rule outcome must be followed, broken, not_applicable, or unreviewed.",
      );
    }
    const key = name.toLocaleLowerCase("en-US");
    const priorOutcome = byName.get(key);
    if (priorOutcome !== undefined) {
      if (priorOutcome !== rule.outcome) {
        fail(
          "invalid_rule_outcome",
          `Rule ${name} has conflicting outcomes in the same review.`,
        );
      }
      continue;
    }
    byName.set(key, rule.outcome);
    normalized.push(Object.freeze({ name, outcome: rule.outcome }));
  }
  return Object.freeze(normalized);
}

function normalizedPlaybook(
  playbook: TradeReviewPlaybookInput | null,
): PreparedTradeReviewPlaybook | null {
  if (playbook === null) return null;
  if (typeof playbook !== "object") {
    fail("invalid_content", "Playbook must include a name and reviewed rules.");
  }
  return Object.freeze({
    name: normalizedLabel(playbook.name, "Playbook name"),
    rules: normalizedRules(playbook.rules),
  });
}

function canonicalPositiveDecimal(value: string, label: string): CanonicalDecimal {
  if (typeof value !== "string") {
    fail("invalid_risk", `${label} must be an exact decimal string.`);
  }
  const parsed = canonicalizeDecimal(value);
  if (!parsed.ok) {
    fail("invalid_risk", `${label}: ${parsed.message}`);
  }
  return parsed.value;
}

function normalizedInitialRisk(
  risk: TradeReviewInitialRiskInput | null,
): PreparedTradeReviewInitialRisk | null {
  if (risk === null) return null;
  if (typeof risk !== "object") {
    fail("invalid_risk", "Initial risk must pair an exact amount with its currency.");
  }
  const amount = canonicalPositiveDecimal(risk.amount, "Initial risk");
  if (typeof risk.currency !== "string") {
    fail("invalid_risk", "Initial risk must include a supported currency.");
  }
  const currency = risk.currency.trim().toLocaleUpperCase("en-US");
  if (currencyMinorUnit(currency) === null) {
    fail(
      "invalid_risk",
      `${currency || "Initial risk currency"} is not supported by the local ledger.`,
    );
  }
  return Object.freeze({ amount, currency });
}

function normalizedPlannedStop(
  value: string | null,
  initialRisk: PreparedTradeReviewInitialRisk | null,
): CanonicalDecimal | null {
  if (value === null || (typeof value === "string" && value.trim().length === 0)) return null;
  if (initialRisk === null) {
    fail("invalid_risk", "A planned stop can only be saved with an initial-risk basis.");
  }
  return canonicalPositiveDecimal(value, "Planned stop");
}

function hasReviewSignal(input: TradeReviewRevisionInput): boolean {
  return input.note.length > 0
    || input.setup !== null
    || input.mistakes.length > 0
    || input.tags.length > 0
    || input.emotion !== null
    || input.playbook !== null
    || input.initialRisk !== null;
}

function vocabularyIdentity(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

function optionalVocabularyIdentity(value: string | null): string | null {
  return value === null ? null : vocabularyIdentity(value);
}

function playbookSnapshot(playbook: PreparedTradeReviewPlaybook | null): unknown {
  return playbook === null
    ? null
    : [
        vocabularyIdentity(playbook.name),
        playbook.rules.map((rule) => [vocabularyIdentity(rule.name), rule.outcome]),
      ];
}

/**
 * Hashes one fully normalized review command in an explicit, stable field order.
 * Reusable vocabulary uses its case-insensitive identity so a store's canonical
 * display spelling reproduces the same digest as the user's equivalent spelling.
 */
export function tradeReviewRevision(input: TradeReviewRevisionInput): string {
  return sha256Hex(JSON.stringify([
    "hermes-trade-review-v1",
    input.submissionId,
    input.tradeSubjectId,
    input.expectedPreviousReviewId,
    input.state,
    input.note,
    optionalVocabularyIdentity(input.setup),
    input.mistakes.map(vocabularyIdentity),
    input.tags.map(vocabularyIdentity),
    optionalVocabularyIdentity(input.emotion),
    playbookSnapshot(input.playbook),
    input.initialRisk === null
      ? null
      : [input.initialRisk.amount, input.initialRisk.currency],
    input.plannedStop,
    [RESULT_R_METRIC_ID, input.resultRVersion],
    [PERCENT_RETURN_METRIC_ID, input.percentReturnVersion],
  ]));
}

/** Fingerprints the ordered set of already-reviewed commands in one atomic write. */
export function tradeReviewBatchRevision(
  batchId: string,
  reviews: readonly PreparedTradeReview[],
): string {
  const validatedBatchId = validatedIdentifier(batchId, "Trade review batch ID");
  if (!Array.isArray(reviews)) {
    fail("invalid_content", "Trade review batch must contain an ordered review list.");
  }
  return sha256Hex(JSON.stringify([
    "hermes-trade-review-batch-v1",
    validatedBatchId,
    reviews.map((review) => [review.submissionId, review.revision]),
  ]));
}

export function createTradeReviewSubmissionId(): string {
  if (globalThis.crypto?.getRandomValues === undefined) {
    throw new Error("Secure randomness is required to create a trade review.");
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function prepareTradeReview(input: TradeReviewInput): PreparedTradeReview {
  const submissionId = validatedSubmissionId(input.submissionId);
  const tradeSubjectId = validatedIdentifier(input.tradeSubjectId, "Trade subject ID");
  const expectedPreviousReviewId = input.expectedPreviousReviewId === null
    ? null
    : validatedIdentifier(input.expectedPreviousReviewId, "Previous review ID");
  if (input.state !== "draft" && input.state !== "completed") {
    fail("invalid_state", "Trade review state must be draft or completed.");
  }

  const note = normalizedNote(input.note);
  const setup = normalizedOptionalLabel(input.setup, "Setup");
  const mistakes = normalizedLabels(input.mistakes, "Mistakes");
  const tags = normalizedLabels(input.tags, "Tags");
  const emotion = normalizedOptionalLabel(input.emotion, "Emotion");
  const playbook = normalizedPlaybook(input.playbook);
  const initialRisk = normalizedInitialRisk(input.initialRisk);
  const plannedStop = normalizedPlannedStop(input.plannedStop, initialRisk);
  const revisionInput: TradeReviewRevisionInput = {
    submissionId,
    tradeSubjectId,
    expectedPreviousReviewId,
    state: input.state,
    note,
    setup,
    mistakes,
    tags,
    emotion,
    playbook,
    initialRisk,
    plannedStop,
    resultRVersion: RESULT_R_METRIC_VERSION,
    percentReturnVersion: PERCENT_RETURN_METRIC_VERSION,
  };
  if (input.state === "completed" && !hasReviewSignal(revisionInput)) {
    fail(
      "incomplete_review",
      "A completed review needs at least one reflection or initial-risk signal.",
    );
  }

  return Object.freeze({
    ...revisionInput,
    revision: tradeReviewRevision(revisionInput),
  });
}

export function verifyPreparedTradeReview(command: PreparedTradeReview): PreparedTradeReview {
  const revisionInput: TradeReviewRevisionInput = {
    submissionId: command.submissionId,
    tradeSubjectId: command.tradeSubjectId,
    expectedPreviousReviewId: command.expectedPreviousReviewId,
    state: command.state,
    note: command.note,
    setup: command.setup,
    mistakes: command.mistakes,
    tags: command.tags,
    emotion: command.emotion,
    playbook: command.playbook,
    initialRisk: command.initialRisk,
    plannedStop: command.plannedStop,
    resultRVersion: command.resultRVersion,
    percentReturnVersion: command.percentReturnVersion,
  };
  if (tradeReviewRevision(revisionInput) !== command.revision) {
    fail("review_changed", "Trade review values changed after review. Review them again.");
  }

  const reparsed = prepareTradeReview({
    submissionId: command.submissionId,
    tradeSubjectId: command.tradeSubjectId,
    expectedPreviousReviewId: command.expectedPreviousReviewId,
    state: command.state,
    note: command.note,
    setup: command.setup,
    mistakes: command.mistakes,
    tags: command.tags,
    emotion: command.emotion,
    playbook: command.playbook,
    initialRisk: command.initialRisk,
    plannedStop: command.plannedStop,
  });
  if (reparsed.revision !== command.revision) {
    fail(
      "review_changed",
      "Trade review no longer matches the normalized values and metric definitions.",
    );
  }
  return reparsed;
}
