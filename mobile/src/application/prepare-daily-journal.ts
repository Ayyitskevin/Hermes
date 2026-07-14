import { sha256Hex } from "../adapters/sqlite/schema/checksum";

export const DAILY_JOURNAL_NOTE_LIMIT = 5_000;
export const DAILY_JOURNAL_LABEL_LIMIT = 120;
export const DAILY_JOURNAL_LIST_LIMIT = 20;
export const DAILY_JOURNAL_IDENTIFIER_LIMIT = 256;

export type DailyJournalEntryState = "draft" | "completed";

export interface DailyJournalEntryInput {
  readonly submissionId: string;
  readonly isoDate: string;
  readonly expectedPreviousEntryId: string | null;
  readonly state: DailyJournalEntryState;
  readonly title: string | null;
  readonly note: string;
  readonly emotion: string | null;
  readonly processScorePct: number | null;
  readonly tags: readonly string[];
}

export interface PreparedDailyJournalEntry {
  readonly submissionId: string;
  readonly isoDate: string;
  readonly expectedPreviousEntryId: string | null;
  readonly state: DailyJournalEntryState;
  readonly title: string | null;
  readonly note: string;
  readonly emotion: string | null;
  readonly processScorePct: number | null;
  readonly tags: readonly string[];
  readonly revision: string;
}

export type DailyJournalRevisionInput = Omit<PreparedDailyJournalEntry, "revision">;

export type DailyJournalPreparationErrorCode =
  | "invalid_submission_id"
  | "invalid_identifier"
  | "invalid_date"
  | "invalid_state"
  | "invalid_content"
  | "invalid_score"
  | "too_many_values"
  | "incomplete_entry"
  | "entry_changed";

export class DailyJournalPreparationError extends Error {
  constructor(
    readonly code: DailyJournalPreparationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "DailyJournalPreparationError";
  }
}

function fail(code: DailyJournalPreparationErrorCode, message: string): never {
  throw new DailyJournalPreparationError(code, message);
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

function validatedSubmissionId(value: string): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    fail(
      "invalid_submission_id",
      "Daily reflection submission ID must be a 256-bit lowercase hexadecimal value.",
    );
  }
  return value;
}

export function validateDailyJournalIdentifier(value: string, label: string): string {
  if (
    typeof value !== "string"
    || value.length === 0
    || value.trim() !== value
    || characterCount(value) > DAILY_JOURNAL_IDENTIFIER_LIMIT
    || hasControlCharacter(value)
  ) {
    fail(
      "invalid_identifier",
      `${label} must contain 1-${DAILY_JOURNAL_IDENTIFIER_LIMIT} trimmed visible characters.`,
    );
  }
  return value;
}

export function validateDailyJournalIsoDate(value: string): string {
  if (
    typeof value !== "string"
    || !/^(?:19[7-9][0-9]|[2-9][0-9]{3})-[0-9]{2}-[0-9]{2}$/.test(value)
  ) {
    fail(
      "invalid_date",
      "Daily reflection date must use YYYY-MM-DD from 1970-01-01 through 9999-12-31.",
    );
  }
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    fail("invalid_date", "Daily reflection date must be a valid Gregorian date.");
  }
  return value;
}

function normalizedNote(value: string): string {
  if (typeof value !== "string") fail("invalid_content", "Reflection note must be text.");
  const normalized = value.replace(/\r\n?/g, "\n").normalize("NFC").trim();
  if (hasControlCharacter(normalized, true)) {
    fail("invalid_content", "Reflection note contains an unsupported control character.");
  }
  if (characterCount(normalized) > DAILY_JOURNAL_NOTE_LIMIT) {
    fail(
      "invalid_content",
      `Reflection note must be at most ${DAILY_JOURNAL_NOTE_LIMIT} characters.`,
    );
  }
  return normalized;
}

function normalizedLabel(value: string, label: string): string {
  if (typeof value !== "string" || hasControlCharacter(value)) {
    fail("invalid_content", `${label} must use visible single-line text.`);
  }
  const normalized = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    normalized.length === 0
    || characterCount(normalized) > DAILY_JOURNAL_LABEL_LIMIT
  ) {
    fail(
      "invalid_content",
      `${label} must contain 1-${DAILY_JOURNAL_LABEL_LIMIT} visible characters.`,
    );
  }
  return normalized;
}

function normalizedVocabularyLabel(value: string, label: string): string {
  const normalized = normalizedLabel(value, label);
  if (characterCount(normalized.toLocaleLowerCase("en-US")) > DAILY_JOURNAL_LABEL_LIMIT) {
    fail(
      "invalid_content",
      `${label}'s normalized identity must be at most ${DAILY_JOURNAL_LABEL_LIMIT} characters.`,
    );
  }
  return normalized;
}

function normalizedOptionalLabel(value: string | null, label: string): string | null {
  if (value === null || (typeof value === "string" && value.trim().length === 0)) return null;
  return normalizedLabel(value, label);
}

function normalizedTags(values: readonly string[]): readonly string[] {
  if (!Array.isArray(values)) fail("invalid_content", "Tags must be a list.");
  if (values.length > DAILY_JOURNAL_LIST_LIMIT) {
    fail("too_many_values", `A daily reflection supports at most ${DAILY_JOURNAL_LIST_LIMIT} tags.`);
  }
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const value of values) {
    const tag = normalizedVocabularyLabel(value, "Tag");
    const key = tag.toLocaleLowerCase("en-US");
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return Object.freeze(tags);
}

function normalizedScore(value: number | null): number | null {
  if (value === null) return null;
  if (!Number.isInteger(value) || Object.is(value, -0) || value < 0 || value > 100) {
    fail("invalid_score", "Self-reported process score must be a whole number from 0 through 100.");
  }
  return value;
}

function vocabularyIdentity(value: string | null): string | null {
  return value === null ? null : value.toLocaleLowerCase("en-US");
}

export function dailyJournalEntryRevision(input: DailyJournalRevisionInput): string {
  return sha256Hex(JSON.stringify([
    "hermes-daily-journal-entry-v1",
    input.submissionId,
    input.isoDate,
    input.expectedPreviousEntryId,
    input.state,
    input.title,
    input.note,
    vocabularyIdentity(input.emotion),
    input.processScorePct,
    input.tags.map((tag) => vocabularyIdentity(tag)),
  ]));
}

export function createDailyJournalSubmissionId(): string {
  if (globalThis.crypto?.getRandomValues === undefined) {
    throw new Error("Secure randomness is required to create a daily reflection.");
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function prepareDailyJournalEntry(
  input: DailyJournalEntryInput,
): PreparedDailyJournalEntry {
  const submissionId = validatedSubmissionId(input.submissionId);
  const isoDate = validateDailyJournalIsoDate(input.isoDate);
  const expectedPreviousEntryId = input.expectedPreviousEntryId === null
    ? null
    : validateDailyJournalIdentifier(input.expectedPreviousEntryId, "Previous daily-entry ID");
  if (input.state !== "draft" && input.state !== "completed") {
    fail("invalid_state", "Daily reflection state must be draft or completed.");
  }
  const title = normalizedOptionalLabel(input.title, "Reflection title");
  const note = normalizedNote(input.note);
  const emotion = input.emotion === null || input.emotion.trim().length === 0
    ? null
    : normalizedVocabularyLabel(input.emotion, "Emotion");
  const processScorePct = normalizedScore(input.processScorePct);
  const tags = normalizedTags(input.tags);
  if (
    title === null
    && note.length === 0
    && emotion === null
    && processScorePct === null
    && tags.length === 0
  ) {
    fail("incomplete_entry", "A daily reflection needs at least one authored signal.");
  }
  const revisionInput: DailyJournalRevisionInput = {
    submissionId,
    isoDate,
    expectedPreviousEntryId,
    state: input.state,
    title,
    note,
    emotion,
    processScorePct,
    tags,
  };
  return Object.freeze({
    ...revisionInput,
    revision: dailyJournalEntryRevision(revisionInput),
  });
}

export function verifyPreparedDailyJournalEntry(
  command: PreparedDailyJournalEntry,
): PreparedDailyJournalEntry {
  const revisionInput: DailyJournalRevisionInput = {
    submissionId: command.submissionId,
    isoDate: command.isoDate,
    expectedPreviousEntryId: command.expectedPreviousEntryId,
    state: command.state,
    title: command.title,
    note: command.note,
    emotion: command.emotion,
    processScorePct: command.processScorePct,
    tags: command.tags,
  };
  if (dailyJournalEntryRevision(revisionInput) !== command.revision) {
    fail("entry_changed", "Daily reflection values changed after review. Review them again.");
  }
  const reparsed = prepareDailyJournalEntry(command);
  if (reparsed.revision !== command.revision) {
    fail("entry_changed", "Daily reflection no longer matches its normalized values.");
  }
  return reparsed;
}
