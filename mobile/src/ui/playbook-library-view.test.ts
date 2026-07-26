import { describe, expect, it } from "vitest";

import type { JournalPlaybookDefinitionRecord } from "../application/journal-store";
import {
  parsePlaybookDefinitionRules,
  playbookDefinitionSheetTemplate,
  playbookLibrarySection,
} from "./playbook-library-view";

const ACTIVE_ID = "a".repeat(64);
const ACTIVE_VERSION_ID = "b".repeat(64);
const ACTIVE_REVISION = "c".repeat(64);

function definition(
  overrides: Partial<JournalPlaybookDefinitionRecord> = {},
): JournalPlaybookDefinitionRecord {
  return {
    id: ACTIVE_ID,
    versionId: ACTIVE_VERSION_ID,
    version: 2,
    revision: ACTIVE_REVISION,
    name: "Opening <Range>",
    state: "active",
    rules: ["Wait for <confirmation>", "Respect the stop"],
    recordedAtUs: "1782864000000000",
    ...overrides,
  };
}

describe("Playbook Library view", () => {
  it("preserves authored rule order while trimming blank lines", () => {
    expect(parsePlaybookDefinitionRules(
      "  First rule  \r\n\r\nSecond rule\n  Third rule\n",
    )).toEqual(["First rule", "Second rule", "Third rule"]);
  });

  it("renders escaped stable identities, ordered rules, and explicit lifecycle actions", () => {
    const archived = definition({
      id: "d".repeat(64),
      versionId: "e".repeat(64),
      revision: "f".repeat(64),
      name: "Archived plan",
      state: "archived",
      version: 4,
      rules: [],
    });
    const html = playbookLibrarySection([definition(), archived], true);

    expect(html).toContain("Opening &lt;Range&gt;");
    expect(html).not.toContain("Opening <Range>");
    expect(html).toContain("Wait for &lt;confirmation&gt;");
    expect(html).toContain(`data-playbook-definition="${ACTIVE_ID}"`);
    expect(html).toContain(`data-playbook-definition-version="${ACTIVE_VERSION_ID}"`);
    expect(html).toContain(`data-playbook-definition-revision="${ACTIVE_REVISION}"`);
    expect(html.indexOf("Wait for &lt;confirmation&gt;")).toBeLessThan(
      html.indexOf("Respect the stop"),
    );
    expect(html).toContain(`data-playbook-definition-edit="${ACTIVE_ID}"`);
    expect(html).toContain(`data-playbook-definition-archive="${ACTIVE_ID}"`);
    expect(html).toContain(`data-playbook-definition-restore="${archived.id}"`);
    expect(html).toContain("Archived playbooks (1)");
    expect(html).toContain("No rules in this revision.");
  });

  it("blocks management outside an established local journal", () => {
    const html = playbookLibrarySection([], false);

    expect(html).toMatch(/data-playbook-definition-create\s+disabled/u);
    expect(html).toContain("Establish the local journal");
    expect(html).toContain("0 active");
  });

  it("renders an edit sheet that explains immutable successor versions", () => {
    const html = playbookDefinitionSheetTemplate(definition());

    expect(html).toContain("Edit playbook");
    expect(html).toContain("Saving creates version 3");
    expect(html).toContain("version 2 remains immutable");
    expect(html).toContain("Opening &lt;Range&gt;");
    expect(html).toContain("Wait for &lt;confirmation&gt;\nRespect the stop");
    expect(html).toContain("Duplicate rule text is rejected");
  });
});
