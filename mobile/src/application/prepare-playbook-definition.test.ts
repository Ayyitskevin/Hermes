import { describe, expect, it } from "vitest";

import {
  PLAYBOOK_DEFINITION_NAME_LIMIT,
  PLAYBOOK_DEFINITION_RULE_COUNT_LIMIT,
  PLAYBOOK_DEFINITION_RULE_LIMIT,
  createPlaybookDefinitionSubmissionId,
  playbookDefinitionIdFromSubmission,
  playbookDefinitionRevision,
  playbookDefinitionVersionId,
  preparePlaybookDefinition,
  verifyPreparedPlaybookDefinition,
  type PlaybookDefinitionInput,
  type PreparedPlaybookDefinitionCommand,
} from "./prepare-playbook-definition";

function createInput(
  overrides: Partial<PlaybookDefinitionInput> = {},
): PlaybookDefinitionInput {
  return {
    submissionId: "a".repeat(64),
    action: "create",
    playbookId: null,
    expectedPreviousVersionId: null,
    name: "Opening Range Breakout",
    rules: ["Wait for confirmation", "Size from invalidation"],
    ...overrides,
  } as PlaybookDefinitionInput;
}

function revisedInput(
  overrides: Partial<PlaybookDefinitionInput> = {},
): PlaybookDefinitionInput {
  return {
    submissionId: "b".repeat(64),
    action: "edit",
    playbookId: playbookDefinitionIdFromSubmission("a".repeat(64)),
    expectedPreviousVersionId: playbookDefinitionVersionId(
      playbookDefinitionIdFromSubmission("a".repeat(64)),
      "a".repeat(64),
    ),
    name: "Opening Range Breakout",
    rules: ["Wait for confirmation", "Size from invalidation"],
    ...overrides,
  } as PlaybookDefinitionInput;
}

function rehashed(
  command: PreparedPlaybookDefinitionCommand,
  changes: Partial<PreparedPlaybookDefinitionCommand>,
): PreparedPlaybookDefinitionCommand {
  const changed = { ...command, ...changes };
  const { revision: _revision, ...revisionInput } = changed;
  return {
    ...changed,
    revision: playbookDefinitionRevision(revisionInput),
  };
}

describe("prepared playbook definition command", () => {
  it("normalizes a create command and derives stable definition and version IDs", () => {
    const prepared = preparePlaybookDefinition(createInput({
      name: "  Opening   Range Cafe\u0301  ",
      rules: ["  Wait   for confirmation ", "Size from invalidation"],
    }));
    expect(prepared).toMatchObject({
      action: "create",
      playbookId: playbookDefinitionIdFromSubmission("a".repeat(64)),
      expectedPreviousVersionId: null,
      name: "Opening Range Café",
      normalizedName: "opening range café",
      state: "active",
      rules: [
        {
          text: "Wait for confirmation",
          normalizedText: "wait for confirmation",
          ordinal: 0,
        },
        {
          text: "Size from invalidation",
          normalizedText: "size from invalidation",
          ordinal: 1,
        },
      ],
    });
    expect(prepared.versionId).toBe(
      playbookDefinitionVersionId(prepared.playbookId, prepared.submissionId),
    );
    expect(prepared.revision).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.isFrozen(prepared)).toBe(true);
    expect(Object.isFrozen(prepared.rules)).toBe(true);
    expect(prepared.rules.every(Object.isFrozen)).toBe(true);
    expect(verifyPreparedPlaybookDefinition(prepared)).toEqual(prepared);
  });

  it("keeps the stable playbook ID while deriving each immutable version ID", () => {
    const created = preparePlaybookDefinition(createInput());
    const edited = preparePlaybookDefinition(revisedInput({
      playbookId: created.playbookId,
      expectedPreviousVersionId: created.versionId,
    }));
    expect(edited.playbookId).toBe(created.playbookId);
    expect(edited.versionId).not.toBe(created.versionId);
    expect(edited.state).toBe("active");
    expect(preparePlaybookDefinition(revisedInput({ action: "archive" })).state)
      .toBe("archived");
    expect(preparePlaybookDefinition(revisedInput({ action: "restore" })).state)
      .toBe("active");
  });

  it("preserves explicit rule order and rejects duplicate normalized rule text", () => {
    const prepared = preparePlaybookDefinition(createInput({
      rules: ["Exit before entry", "Confirm trend", "Manage risk"],
    }));
    expect(prepared.rules.map(({ text, ordinal }) => [text, ordinal])).toEqual([
      ["Exit before entry", 0],
      ["Confirm trend", 1],
      ["Manage risk", 2],
    ]);
    expect(preparePlaybookDefinition(createInput({ rules: [] })).rules).toEqual([]);
    expect(() => preparePlaybookDefinition(createInput({
      rules: ["Wait for confirmation", " wait FOR confirmation "],
    }))).toThrow(/duplicates another rule/i);
  });

  it("enforces Unicode code-point limits and visible canonical labels", () => {
    expect(preparePlaybookDefinition(createInput({
      name: "🙂".repeat(PLAYBOOK_DEFINITION_NAME_LIMIT),
      rules: ["🙂".repeat(PLAYBOOK_DEFINITION_RULE_LIMIT)],
    }))).toMatchObject({
      name: "🙂".repeat(PLAYBOOK_DEFINITION_NAME_LIMIT),
    });
    expect(() => preparePlaybookDefinition(createInput({
      name: "🙂".repeat(PLAYBOOK_DEFINITION_NAME_LIMIT + 1),
    }))).toThrow(/1-120/);
    expect(() => preparePlaybookDefinition(createInput({
      rules: ["🙂".repeat(PLAYBOOK_DEFINITION_RULE_LIMIT + 1)],
    }))).toThrow(/1-500/);
    expect(() => preparePlaybookDefinition(createInput({
      name: "Line\nbreak",
    }))).toThrow(/single-line/i);
    expect(() => preparePlaybookDefinition(createInput({
      rules: ["Visible\u0000hidden"],
    }))).toThrow(/single-line/i);
    expect(() => preparePlaybookDefinition(createInput({
      rules: Array.from(
        { length: PLAYBOOK_DEFINITION_RULE_COUNT_LIMIT + 1 },
        (_, index) => `Rule ${index}`,
      ),
    }))).toThrow(/at most 20/);
  });

  it("requires create-only null identities and lowercase 256-bit command IDs", () => {
    expect(() => preparePlaybookDefinition(createInput({
      submissionId: "A".repeat(64),
    }))).toThrow(/lowercase hexadecimal/i);
    expect(() => preparePlaybookDefinition(createInput({
      expectedPreviousVersionId: "c".repeat(64),
    }))).toThrow(/only create may omit/i);
    expect(() => preparePlaybookDefinition(revisedInput({
      expectedPreviousVersionId: null,
    }))).toThrow(/only create may omit/i);
    expect(() => preparePlaybookDefinition(revisedInput({
      playbookId: "not-a-definition-id",
    }))).toThrow(/lowercase hexadecimal/i);
    expect(() => preparePlaybookDefinition({
      ...createInput(),
      action: "delete",
    } as unknown as PlaybookDefinitionInput)).toThrow(/action is invalid/i);
  });

  it("binds every canonical field and rejects rehashed noncanonical values", () => {
    const prepared = preparePlaybookDefinition(revisedInput());
    for (const changed of [
      { ...prepared, submissionId: "c".repeat(64) },
      { ...prepared, action: "archive" as const },
      { ...prepared, playbookId: "d".repeat(64) },
      { ...prepared, versionId: "e".repeat(64) },
      { ...prepared, expectedPreviousVersionId: "f".repeat(64) },
      { ...prepared, name: "Changed" },
      { ...prepared, normalizedName: "changed" },
      { ...prepared, rules: [] },
      { ...prepared, state: "archived" as const },
    ]) {
      expect(() => verifyPreparedPlaybookDefinition(changed)).toThrow(/changed after review/i);
    }

    expect(() => verifyPreparedPlaybookDefinition(rehashed(prepared, {
      name: ` ${prepared.name} `,
    }))).toThrow(/canonical values/i);
    expect(() => verifyPreparedPlaybookDefinition(rehashed(prepared, {
      rules: prepared.rules.map((rule, ordinal) => ({ ...rule, ordinal: ordinal + 1 })),
    }))).toThrow(/canonical values/i);
  });

  it("creates independent cryptographically shaped submission IDs", () => {
    const first = createPlaybookDefinitionSubmissionId();
    const second = createPlaybookDefinitionSubmissionId();
    expect(first).toMatch(/^[a-f0-9]{64}$/);
    expect(second).toMatch(/^[a-f0-9]{64}$/);
    expect(second).not.toBe(first);
  });
});
