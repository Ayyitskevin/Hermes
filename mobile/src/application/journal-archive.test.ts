import { describe, expect, it } from "vitest";

import {
  JOURNAL_ARCHIVE_KIND,
  canonicalJournalArchiveJson,
  createJournalArchive,
  createJournalExportArtifact,
  parseJournalArchive,
  type JournalArchiveUnsigned,
} from "./journal-archive";

function unsigned(overrides: Partial<JournalArchiveUnsigned> = {}): JournalArchiveUnsigned {
  return {
    kind: JOURNAL_ARCHIVE_KIND,
    formatVersion: 1,
    exportedAtUs: "1800000000000000",
    source: {
      schemaUserVersion: 1,
      migrations: [{ version: 1, name: "initial", checksumSha256: "a".repeat(64) }],
    },
    payload: {
      kind: "test-payload",
      version: 1,
      data: { rows: [["2", "beta"], ["1", "alpha"]], enabled: true },
    },
    attachments: { version: 1, entries: [] },
    summary: {
      workspaceName: "My Journal",
      currency: "USD",
      timeZone: "America/New_York",
      accounts: "1",
      activeExecutions: "2",
      executionVersions: "2",
      importReceipts: "1",
      rolledBackImports: "0",
      currentReviews: "1",
      reviewVersions: "2",
      reviewTerms: "3",
      playbooks: "1",
      attachments: "0",
      attachmentBytes: "0",
    },
    stateSha256: "b".repeat(64),
    reportSha256: "c".repeat(64),
    ...overrides,
  };
}

describe("Hermes journal archive v1", () => {
  it("canonicalizes object keys and produces a self-verifying artifact", () => {
    expect(canonicalJournalArchiveJson({ z: 1, a: { y: true, x: "value" } }))
      .toBe('{"a":{"x":"value","y":true},"z":1}');
    const artifact = createJournalExportArtifact(unsigned());
    expect(artifact.fileName).toBe("hermes-journal-export-2027-01-15T08-00-00.000Z.json");
    expect(parseJournalArchive(artifact.contents)).toEqual(artifact.archive);
    expect(artifact.contents.endsWith("\n")).toBe(true);
  });

  it("keeps the state digest stable while export time changes the archive digest", () => {
    const first = createJournalArchive(unsigned());
    const second = createJournalArchive(unsigned({ exportedAtUs: "1800000000001000" }));
    expect(second.stateSha256).toBe(first.stateSha256);
    expect(second.reportSha256).toBe(first.reportSha256);
    expect(second.archiveSha256).not.toBe(first.archiveSha256);
  });

  it("rejects changed content, unknown fields, future versions, and noncanonical counts", () => {
    const archive = createJournalArchive(unsigned());
    const serialized = JSON.stringify(archive);
    expect(() => parseJournalArchive(serialized.replace("My Journal", "Other Journal")))
      .toThrow(/checksum/i);
    expect(() => parseJournalArchive(JSON.stringify({ ...archive, surprise: true })))
      .toThrow(/unsupported fields/i);
    expect(() => parseJournalArchive(JSON.stringify({ ...archive, formatVersion: 2 })))
      .toThrow(/not supported/i);
    expect(() => createJournalArchive(unsigned({
      summary: { ...unsigned().summary, accounts: "01" },
    }))).toThrow(/canonical/i);
  });

  it("rejects unsupported attachment data and ambiguous numeric payload values", () => {
    expect(() => createJournalArchive({
      ...unsigned(),
      attachments: { version: 1, entries: [{ id: "future" }] } as never,
    })).toThrow(/attachments/i);
    expect(() => createJournalArchive({
      ...unsigned(),
      payload: { kind: "test-payload", version: 1, data: Number.NaN },
    })).toThrow(/safe integers/i);
    expect(() => createJournalArchive({
      ...unsigned(),
      payload: { kind: "test-payload", version: 1, data: -0 },
    })).toThrow(/canonical safe integers/i);
    const zeroArtifact = createJournalExportArtifact(unsigned({
      payload: { kind: "test-payload", version: 1, data: 0 },
    }));
    const negativeZeroBytes = zeroArtifact.contents.replace('"data":0', '"data":-0');
    expect(negativeZeroBytes).not.toBe(zeroArtifact.contents);
    expect(() => parseJournalArchive(negativeZeroBytes)).toThrow(/canonical safe integers/i);
  });

  it("rejects duplicate object keys before JSON.parse can collapse them", () => {
    const artifact = createJournalExportArtifact(unsigned());
    const canonical = artifact.contents.trimEnd();
    const plainDuplicate = canonical.replace("{", '{"kind":"not-hermes",');
    const escapedDuplicate = canonical.replace(
      "{",
      '{"\\u006b\\u0069\\u006e\\u0064":"not-hermes",',
    );

    expect(() => parseJournalArchive(plainDuplicate)).toThrow(/duplicate object key "kind"/i);
    expect(() => parseJournalArchive(escapedDuplicate)).toThrow(/duplicate object key "kind"/i);
  });

  it("bounds decimal counts and export timestamps before conversion", () => {
    expect(() => createJournalArchive(unsigned({
      summary: {
        ...unsigned().summary,
        accounts: "18446744073709551616",
      },
    }))).toThrow(/unsigned 64-bit/i);
    expect(() => createJournalArchive(unsigned({
      exportedAtUs: "9000000000000000000",
    }))).toThrow(/calendar range/i);
  });

  it("returns an immutable object graph consistent with the serialized artifact", () => {
    const artifact = createJournalExportArtifact(unsigned());
    const data = artifact.archive.payload.data as unknown as {
      readonly rows: unknown[];
    };

    expect(Object.isFrozen(artifact.archive)).toBe(true);
    expect(Object.isFrozen(artifact.archive.source.migrations)).toBe(true);
    expect(Object.isFrozen(artifact.archive.summary)).toBe(true);
    expect(Object.isFrozen(artifact.archive.attachments.entries)).toBe(true);
    expect(Object.isFrozen(artifact.archive.payload.data)).toBe(true);
    expect(Object.isFrozen(data.rows)).toBe(true);
    expect(Object.isFrozen(data.rows[0])).toBe(true);
    expect(() => data.rows.push(null)).toThrow(TypeError);
    expect(parseJournalArchive(artifact.contents)).toEqual(artifact.archive);
  });

  it("preserves prototype-named payload keys as immutable journal data", () => {
    const payloadData = JSON.parse(
      '{"__proto__":{"retained":true},"constructor":"journal"}',
    ) as unknown;
    const artifact = createJournalExportArtifact(unsigned({
      payload: { kind: "test-payload", version: 1, data: payloadData as never },
    }));
    const parsed = parseJournalArchive(artifact.contents);
    const data = parsed.payload.data as Record<string, unknown>;
    const prototypeValue = data["__proto__"] as { readonly retained: boolean };

    expect(Object.getPrototypeOf(data)).toBeNull();
    expect(Object.hasOwn(data, "__proto__")).toBe(true);
    expect(prototypeValue).toEqual({ retained: true });
    expect(data.constructor).toBe("journal");
    expect(Object.isFrozen(prototypeValue)).toBe(true);
  });

});
