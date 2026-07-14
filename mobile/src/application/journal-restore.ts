import { sha256Hex } from "../adapters/sqlite/schema";
import type { JournalArchiveSummary } from "./journal-archive";

export type JournalRestorePayloadKind = "sqlite-table-set" | "browser-session-state";

export interface JournalRestorePreview {
  /** Digest of the exact selected text supplied by the UI, including trailing whitespace. */
  readonly selectedFileSha256: string;
  /** Digest carried by and verified against the canonical archive envelope. */
  readonly archiveSha256: string;
  /** Recomputed durable-state digest. */
  readonly stateSha256: string;
  /** Recomputed versioned report-input digest. */
  readonly reportSha256: string;
  readonly exportedAtUs: string;
  readonly payloadKind: JournalRestorePayloadKind;
  /** Native table archives remain v1; browser state archives are v2. */
  readonly payloadVersion: 1 | 2;
  /** Recomputed by the payload-specific adapter; never copied from the envelope. */
  readonly summary: JournalArchiveSummary;
  /** Destination state observed during the adapter's verified preview transaction. */
  readonly target: "empty" | "already-restored";
}

export interface PreparedJournalRestore {
  /**
   * Digest of the exact selected text plus every recomputed preview claim. The
   * store still reparses and rederives these claims at commit.
   */
  readonly revisionSha256: string;
  readonly contents: string;
  readonly preview: JournalRestorePreview;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;
const UNSIGNED_INTEGER_PATTERN = /^(?:0|[1-9][0-9]*)$/;

function assertHash(value: string, label: string): void {
  if (!HASH_PATTERN.test(value)) throw new Error(`${label} must be a lowercase SHA-256 digest.`);
}

function assertUnsignedInteger(value: string, label: string): void {
  if (!UNSIGNED_INTEGER_PATTERN.test(value)) {
    throw new Error(`${label} must be a canonical non-negative integer.`);
  }
}

function frozenSummary(summary: JournalArchiveSummary): JournalArchiveSummary {
  const copy = Object.freeze({ ...summary });
  assertUnsignedInteger(copy.accounts, "Restore account count");
  assertUnsignedInteger(copy.activeExecutions, "Restore active-execution count");
  assertUnsignedInteger(copy.executionVersions, "Restore execution-version count");
  assertUnsignedInteger(copy.importReceipts, "Restore import-receipt count");
  assertUnsignedInteger(copy.rolledBackImports, "Restore rollback count");
  assertUnsignedInteger(copy.currentReviews, "Restore current-review count");
  assertUnsignedInteger(copy.reviewVersions, "Restore review-version count");
  assertUnsignedInteger(copy.reviewTerms, "Restore review-term count");
  assertUnsignedInteger(copy.playbooks, "Restore playbook count");
  assertUnsignedInteger(copy.attachments, "Restore attachment count");
  assertUnsignedInteger(copy.attachmentBytes, "Restore attachment byte count");
  return copy;
}

function previewRevisionInput(preview: JournalRestorePreview): readonly unknown[] {
  const summary = preview.summary;
  return [
    "hermes-journal-restore-preview-v1",
    preview.selectedFileSha256,
    preview.archiveSha256,
    preview.stateSha256,
    preview.reportSha256,
    preview.exportedAtUs,
    preview.payloadKind,
    preview.payloadVersion,
    preview.target,
    summary.workspaceName,
    summary.currency,
    summary.timeZone,
    summary.accounts,
    summary.activeExecutions,
    summary.executionVersions,
    summary.importReceipts,
    summary.rolledBackImports,
    summary.currentReviews,
    summary.reviewVersions,
    summary.reviewTerms,
    summary.playbooks,
    summary.attachments,
    summary.attachmentBytes,
  ];
}

/**
 * Payload adapters call this only after independently recomputing and
 * verifying every preview field. It deliberately does not accept a generic
 * JournalArchive because the envelope's summary and state claims are not
 * sufficient restore evidence.
 */
export function createPreparedJournalRestore(
  contents: string,
  verifiedPreview: Omit<JournalRestorePreview, "selectedFileSha256">,
): PreparedJournalRestore {
  if (typeof contents !== "string") throw new Error("Restore contents must be text.");
  const selectedFileSha256 = sha256Hex(contents);
  const preview = Object.freeze({
    ...verifiedPreview,
    selectedFileSha256,
    summary: frozenSummary(verifiedPreview.summary),
  });
  assertHash(preview.archiveSha256, "Restore archive digest");
  assertHash(preview.stateSha256, "Restore state digest");
  assertHash(preview.reportSha256, "Restore report digest");
  assertUnsignedInteger(preview.exportedAtUs, "Restore export time");
  if (
    (preview.payloadKind !== "sqlite-table-set"
      && preview.payloadKind !== "browser-session-state")
    || !(
      (preview.payloadKind === "sqlite-table-set" && preview.payloadVersion === 1)
      || (preview.payloadKind === "browser-session-state" && preview.payloadVersion === 2)
    )
    || (preview.target !== "empty" && preview.target !== "already-restored")
  ) {
    throw new Error("Restore preview compatibility fields are invalid.");
  }
  return Object.freeze({
    revisionSha256: sha256Hex(JSON.stringify(previewRevisionInput(preview))),
    contents,
    preview,
  });
}

export function assertPreparedJournalRestoreRevision(
  command: PreparedJournalRestore,
): void {
  if (
    typeof command !== "object"
    || command === null
    || typeof command.contents !== "string"
    || typeof command.revisionSha256 !== "string"
    || typeof command.preview !== "object"
    || command.preview === null
  ) {
    throw new Error("The selected restore file changed after preview. Preview it again.");
  }
  const expected = createPreparedJournalRestore(command.contents, command.preview);
  if (
    command.revisionSha256 !== expected.revisionSha256
    || command.preview.selectedFileSha256 !== expected.preview.selectedFileSha256
  ) {
    throw new Error("The selected restore file changed after preview. Preview it again.");
  }
}
