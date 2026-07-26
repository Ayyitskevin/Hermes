import { sha256Hex } from "../adapters/sqlite/schema/checksum";

export const PLAYBOOK_DEFINITION_NAME_LIMIT = 120;
export const PLAYBOOK_DEFINITION_RULE_LIMIT = 500;
export const PLAYBOOK_DEFINITION_RULE_COUNT_LIMIT = 20;

export type PlaybookDefinitionAction = "create" | "edit" | "archive" | "restore";
export type PlaybookDefinitionState = "active" | "archived";

interface PlaybookDefinitionInputBase {
  readonly submissionId: string;
  readonly name: string;
  readonly rules: readonly string[];
}

export interface CreatePlaybookDefinitionInput extends PlaybookDefinitionInputBase {
  readonly action: "create";
  readonly playbookId: null;
  readonly expectedPreviousVersionId: null;
}

export interface RevisePlaybookDefinitionInput extends PlaybookDefinitionInputBase {
  readonly action: "edit" | "archive" | "restore";
  readonly playbookId: string;
  readonly expectedPreviousVersionId: string;
}

export type PlaybookDefinitionInput =
  | CreatePlaybookDefinitionInput
  | RevisePlaybookDefinitionInput;

export interface PreparedPlaybookDefinitionRule {
  readonly text: string;
  readonly normalizedText: string;
  readonly ordinal: number;
}

export interface PreparedPlaybookDefinitionCommand {
  readonly submissionId: string;
  readonly action: PlaybookDefinitionAction;
  readonly playbookId: string;
  readonly versionId: string;
  readonly expectedPreviousVersionId: string | null;
  readonly name: string;
  readonly normalizedName: string;
  readonly rules: readonly PreparedPlaybookDefinitionRule[];
  readonly state: PlaybookDefinitionState;
  readonly revision: string;
}

export type PlaybookDefinitionRevisionInput =
  Omit<PreparedPlaybookDefinitionCommand, "revision">;

export type PlaybookDefinitionPreparationErrorCode =
  | "invalid_action"
  | "invalid_submission_id"
  | "invalid_identifier"
  | "invalid_content"
  | "duplicate_rule"
  | "too_many_rules"
  | "definition_changed";

export class PlaybookDefinitionPreparationError extends Error {
  constructor(
    readonly code: PlaybookDefinitionPreparationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PlaybookDefinitionPreparationError";
  }
}

function fail(
  code: PlaybookDefinitionPreparationErrorCode,
  message: string,
): never {
  throw new PlaybookDefinitionPreparationError(code, message);
}

function characterCount(value: string): number {
  return [...value].length;
}

function hasControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined
      && (codePoint < 32 || (codePoint >= 127 && codePoint <= 159));
  });
}

function validatedHash(
  value: string,
  label: string,
  code: "invalid_submission_id" | "invalid_identifier",
): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    fail(code, `${label} must be a 256-bit lowercase hexadecimal value.`);
  }
  return value;
}

function canonicalLabel(value: string, label: string, limit: number): string {
  if (typeof value !== "string" || hasControlCharacter(value)) {
    fail("invalid_content", `${label} must use visible single-line text.`);
  }
  const canonical = value.normalize("NFC").trim().replace(/\s+/gu, " ");
  const normalized = canonical.toLocaleLowerCase("en-US");
  if (
    canonical.length === 0
    || characterCount(canonical) > limit
    || characterCount(normalized) > limit
  ) {
    fail(
      "invalid_content",
      `${label} and its normalized identity must contain 1-${limit} visible characters.`,
    );
  }
  return canonical;
}

function normalizedIdentity(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

function preparedRules(
  values: readonly string[],
): readonly PreparedPlaybookDefinitionRule[] {
  if (!Array.isArray(values)) {
    fail("invalid_content", "Playbook definition rules must be an ordered list.");
  }
  if (values.length > PLAYBOOK_DEFINITION_RULE_COUNT_LIMIT) {
    fail(
      "too_many_rules",
      `A playbook definition supports at most ${PLAYBOOK_DEFINITION_RULE_COUNT_LIMIT} rules.`,
    );
  }

  const seen = new Set<string>();
  const rules = values.map((value, ordinal) => {
    const text = canonicalLabel(
      value,
      "Playbook definition rule",
      PLAYBOOK_DEFINITION_RULE_LIMIT,
    );
    const normalizedText = normalizedIdentity(text);
    if (seen.has(normalizedText)) {
      fail(
        "duplicate_rule",
        `Playbook definition rule ${text} duplicates another rule.`,
      );
    }
    seen.add(normalizedText);
    return Object.freeze({ text, normalizedText, ordinal });
  });
  return Object.freeze(rules);
}

function targetState(action: PlaybookDefinitionAction): PlaybookDefinitionState {
  return action === "archive" ? "archived" : "active";
}

export function createPlaybookDefinitionSubmissionId(): string {
  if (globalThis.crypto?.getRandomValues === undefined) {
    throw new Error("Secure randomness is required to create a playbook definition command.");
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function playbookDefinitionIdFromSubmission(
  createSubmissionId: string,
): string {
  const submissionId = validatedHash(
    createSubmissionId,
    "Playbook definition create submission ID",
    "invalid_submission_id",
  );
  return sha256Hex(JSON.stringify([
    "hermes-playbook-definition-id-v1",
    submissionId,
  ]));
}

export function playbookDefinitionVersionId(
  playbookId: string,
  submissionId: string,
): string {
  const definitionId = validatedHash(
    playbookId,
    "Playbook definition ID",
    "invalid_identifier",
  );
  const commandId = validatedHash(
    submissionId,
    "Playbook definition submission ID",
    "invalid_submission_id",
  );
  return sha256Hex(JSON.stringify([
    "hermes-playbook-definition-version-id-v1",
    definitionId,
    commandId,
  ]));
}

export function playbookDefinitionRevision(
  input: PlaybookDefinitionRevisionInput,
): string {
  return sha256Hex(JSON.stringify([
    "hermes-playbook-definition-command-v1",
    input.submissionId,
    input.action,
    input.playbookId,
    input.versionId,
    input.expectedPreviousVersionId,
    input.name,
    input.normalizedName,
    input.rules.map((rule) => [
      rule.ordinal,
      rule.text,
      rule.normalizedText,
    ]),
    input.state,
  ]));
}

export function preparePlaybookDefinition(
  input: PlaybookDefinitionInput,
): PreparedPlaybookDefinitionCommand {
  if (
    input.action !== "create"
    && input.action !== "edit"
    && input.action !== "archive"
    && input.action !== "restore"
  ) {
    fail("invalid_action", "Playbook definition action is invalid.");
  }

  const submissionId = validatedHash(
    input.submissionId,
    "Playbook definition submission ID",
    "invalid_submission_id",
  );
  const isCreate = input.action === "create";
  if (
    (isCreate && (
      input.playbookId !== null
      || input.expectedPreviousVersionId !== null
    ))
    || (!isCreate && (
      input.playbookId === null
      || input.expectedPreviousVersionId === null
    ))
  ) {
    fail(
      "invalid_identifier",
      "Only create may omit the playbook and previous-version identifiers.",
    );
  }

  const playbookId = isCreate
    ? playbookDefinitionIdFromSubmission(submissionId)
    : validatedHash(
        input.playbookId,
        "Playbook definition ID",
        "invalid_identifier",
      );
  const expectedPreviousVersionId = isCreate
    ? null
    : validatedHash(
        input.expectedPreviousVersionId,
        "Previous playbook definition version ID",
        "invalid_identifier",
      );
  const name = canonicalLabel(
    input.name,
    "Playbook definition name",
    PLAYBOOK_DEFINITION_NAME_LIMIT,
  );
  const rules = preparedRules(input.rules);
  const revisionInput: PlaybookDefinitionRevisionInput = {
    submissionId,
    action: input.action,
    playbookId,
    versionId: playbookDefinitionVersionId(playbookId, submissionId),
    expectedPreviousVersionId,
    name,
    normalizedName: normalizedIdentity(name),
    rules,
    state: targetState(input.action),
  };
  return Object.freeze({
    ...revisionInput,
    revision: playbookDefinitionRevision(revisionInput),
  });
}

export function verifyPreparedPlaybookDefinition(
  command: PreparedPlaybookDefinitionCommand,
): PreparedPlaybookDefinitionCommand {
  const revisionInput: PlaybookDefinitionRevisionInput = {
    submissionId: command.submissionId,
    action: command.action,
    playbookId: command.playbookId,
    versionId: command.versionId,
    expectedPreviousVersionId: command.expectedPreviousVersionId,
    name: command.name,
    normalizedName: command.normalizedName,
    rules: command.rules,
    state: command.state,
  };
  if (playbookDefinitionRevision(revisionInput) !== command.revision) {
    fail(
      "definition_changed",
      "Playbook definition values changed after review. Review them again.",
    );
  }

  const reparsed = preparePlaybookDefinition({
    submissionId: command.submissionId,
    action: command.action,
    playbookId: command.action === "create" ? null : command.playbookId,
    expectedPreviousVersionId: command.action === "create"
      ? null
      : command.expectedPreviousVersionId as string,
    name: command.name,
    rules: command.rules.map((rule) => rule.text),
  } as PlaybookDefinitionInput);
  if (
    reparsed.revision !== command.revision
    || reparsed.playbookId !== command.playbookId
    || reparsed.versionId !== command.versionId
  ) {
    fail(
      "definition_changed",
      "Playbook definition no longer matches its canonical values.",
    );
  }
  return reparsed;
}
