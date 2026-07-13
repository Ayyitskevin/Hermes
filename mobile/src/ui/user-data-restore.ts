import {
  JournalRestoreCommitStatusUncertainError,
  type JournalApplication,
} from "../application/journal-application";
import { JOURNAL_ARCHIVE_MAX_BYTES } from "../application/journal-archive";
import type { PreparedJournalRestore } from "../application/journal-restore";

const ARCHIVE_MEDIA_TYPE = "application/vnd.hermes.journal+json";

export interface JournalRestoreFile {
  readonly name: string;
  readonly size: number;
  text(): Promise<string>;
}

export type JournalRestoreRefresh = (announcement: string) => Promise<void>;

export function assertJournalRestoreFileSize(file: Pick<JournalRestoreFile, "size">): void {
  if (!Number.isSafeInteger(file.size) || file.size < 0) {
    throw new Error("Hermes could not determine the selected archive size.");
  }
  if (file.size > JOURNAL_ARCHIVE_MAX_BYTES) {
    throw new Error("Choose a Hermes archive no larger than 64 MiB.");
  }
}

export async function readJournalRestoreFile(file: JournalRestoreFile): Promise<string> {
  // Reject before File.text() to avoid copying an oversized archive into memory.
  assertJournalRestoreFileSize(file);
  return file.text();
}

export function userDataRestoreCard(
  journalIsEmpty: boolean,
  persistence: JournalApplication["persistence"],
): string {
  if (!journalIsEmpty) {
    return `<article class="card user-data-restore restore-blocked" aria-labelledby="user-data-restore-title">
      <p class="card-label">RESTORE JOURNAL</p>
      <h2 id="user-data-restore-title">Empty journal required</h2>
      <p>Hermes never merges or overwrites an existing journal. Restore is available only before local workspace, execution, import, or review data exists.</p>
      <p class="helper-text">Delete All Data is not available yet. Keep this journal and its exports until a separate verified deletion flow ships.</p>
    </article>`;
  }

  const environment = persistence === "encrypted-device"
    ? `<p class="helper-text"><strong>On-device restore.</strong> Only a compatible native SQLite-table archive can be previewed here.</p>`
    : `<p class="helper-text"><strong>Development preview.</strong> Only a browser-session archive can be previewed here; this is not native iOS recovery evidence.</p>`;

  return `<article class="card user-data-restore" aria-labelledby="user-data-restore-title">
    <p class="card-label">RESTORE JOURNAL</p>
    <h2 id="user-data-restore-title">Restore into this empty journal</h2>
    <p>Choose a Hermes JSON archive stored on this device. Nothing is uploaded, and Hermes never merges or overwrites journal data.</p>
    ${environment}
    <form id="user-data-restore-form" novalidate>
      <label for="user-data-restore-file">Hermes archive</label>
      <input id="user-data-restore-file" name="journal-archive" type="file" accept=".json,application/json,${ARCHIVE_MEDIA_TYPE}" aria-describedby="user-data-restore-file-help" />
      <p class="helper-text" id="user-data-restore-file-help">JSON only · 64 MiB maximum. Preview verifies compatibility, corruption, and the destination without keeping imported records.</p>
      <button class="secondary-button" id="user-data-restore-preview" type="button" disabled>Preview archive</button>
      <section class="restore-preview" id="user-data-restore-details" aria-labelledby="user-data-restore-preview-title" hidden>
        <p class="card-label">ADAPTER-VERIFIED PREVIEW</p>
        <h3 id="user-data-restore-preview-title" tabindex="-1">Ready for confirmation</h3>
        <dl class="restore-preview-grid">
          <div><dt>Workspace</dt><dd id="user-data-restore-workspace">—</dd></div>
          <div><dt>Archive contents</dt><dd id="user-data-restore-counts">—</dd></div>
          <div><dt>Exported</dt><dd id="user-data-restore-exported">—</dd></div>
          <div><dt>Compatible payload</dt><dd id="user-data-restore-payload">—</dd></div>
          <div><dt>State digest</dt><dd id="user-data-restore-state-digest">—</dd></div>
          <div><dt>Report digest</dt><dd id="user-data-restore-report-digest">—</dd></div>
        </dl>
        <label class="restore-confirmation" for="user-data-restore-confirm">
          <input id="user-data-restore-confirm" type="checkbox" />
          <span id="user-data-restore-confirm-copy">I understand Hermes will restore this verified archive only if the journal is still empty, without merging or overwriting data.</span>
        </label>
        <div class="quick-actions restore-actions">
          <button class="primary-button" id="user-data-restore-commit" type="button" disabled>Restore verified archive</button>
          <button class="secondary-button" id="user-data-restore-cancel" type="button">Cancel</button>
        </div>
      </section>
    </form>
    <p class="restore-status" id="user-data-restore-status" role="status" aria-live="polite" aria-atomic="true" tabindex="-1">No archive selected. Restore remains local and offline.</p>
    <p class="form-error" id="user-data-restore-error" role="alert" tabindex="-1" hidden></p>
  </article>`;
}

function currentFile(input: HTMLInputElement): File | null {
  return input.files?.item(0) ?? null;
}

function exportedAtLabel(exportedAtUs: string): string {
  try {
    return new Date(Number(BigInt(exportedAtUs) / 1_000n)).toISOString();
  } catch {
    return `${exportedAtUs} microseconds UTC`;
  }
}

function countLabel(value: string, singular: string): string {
  return `${value} ${value === "1" ? singular : `${singular}s`}`;
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function bindUserDataRestore(
  root: HTMLElement,
  application: JournalApplication,
  refresh: JournalRestoreRefresh,
): void {
  const card = root.querySelector<HTMLElement>(".user-data-restore:not(.restore-blocked)");
  const input = root.querySelector<HTMLInputElement>("#user-data-restore-file");
  const previewButton = root.querySelector<HTMLButtonElement>("#user-data-restore-preview");
  const details = root.querySelector<HTMLElement>("#user-data-restore-details");
  const previewTitle = root.querySelector<HTMLElement>("#user-data-restore-preview-title");
  const confirmation = root.querySelector<HTMLInputElement>("#user-data-restore-confirm");
  const confirmationCopy = root.querySelector<HTMLElement>("#user-data-restore-confirm-copy");
  const commitButton = root.querySelector<HTMLButtonElement>("#user-data-restore-commit");
  const cancelButton = root.querySelector<HTMLButtonElement>("#user-data-restore-cancel");
  const status = root.querySelector<HTMLElement>("#user-data-restore-status");
  const error = root.querySelector<HTMLElement>("#user-data-restore-error");
  const workspace = root.querySelector<HTMLElement>("#user-data-restore-workspace");
  const counts = root.querySelector<HTMLElement>("#user-data-restore-counts");
  const exported = root.querySelector<HTMLElement>("#user-data-restore-exported");
  const payload = root.querySelector<HTMLElement>("#user-data-restore-payload");
  const stateDigest = root.querySelector<HTMLElement>("#user-data-restore-state-digest");
  const reportDigest = root.querySelector<HTMLElement>("#user-data-restore-report-digest");
  if (!card || !input || !previewButton || !details || !previewTitle
    || !confirmation || !confirmationCopy || !commitButton || !cancelButton
    || !status || !error || !workspace || !counts || !exported || !payload
    || !stateDigest || !reportDigest) return;

  let generation = 0;
  let prepared: PreparedJournalRestore | null = null;
  let commitPending = false;

  const clearError = (): void => {
    error.textContent = "";
    error.hidden = true;
  };
  const showError = (detail: string, state: string): void => {
    error.textContent = detail;
    error.hidden = false;
    status.textContent = state;
    error.focus();
  };
  const invalidate = (): void => {
    prepared = null;
    details.hidden = true;
    confirmation.checked = false;
    confirmation.disabled = true;
    commitButton.disabled = true;
  };
  const previewBusy = (busy: boolean): void => {
    card.setAttribute("aria-busy", String(busy));
    previewButton.disabled = busy || currentFile(input) === null;
  };
  const showPreview = (candidate: PreparedJournalRestore): void => {
    const preview = candidate.preview;
    const summary = preview.summary;
    workspace.textContent = summary.workspaceName === null
      ? "Unnamed workspace"
      : `${summary.workspaceName} · ${summary.currency ?? "No currency"} · ${summary.timeZone ?? "No time zone"}`;
    counts.textContent = [
      countLabel(summary.accounts, "account"),
      countLabel(summary.activeExecutions, "active execution"),
      countLabel(summary.reviewVersions, "review version"),
    ].join(" · ");
    exported.textContent = exportedAtLabel(preview.exportedAtUs);
    payload.textContent = `${preview.payloadKind} v${preview.payloadVersion} · ${preview.target === "empty" ? "empty target verified" : "exact restored state verified"}`;
    stateDigest.textContent = preview.stateSha256;
    reportDigest.textContent = preview.reportSha256;
    confirmationCopy.textContent = preview.target === "already-restored"
      ? "I understand this exact archive already matches the journal and Hermes will verify it without merging or overwriting data."
      : "I understand Hermes will restore this verified archive only if the journal is still empty, without merging or overwriting data.";
    details.hidden = false;
    confirmation.disabled = false;
    confirmation.checked = false;
    commitButton.disabled = true;
  };

  input.addEventListener("change", () => {
    if (commitPending) return;
    generation += 1;
    clearError();
    invalidate();
    const file = currentFile(input);
    previewButton.disabled = file === null;
    card.setAttribute("aria-busy", "false");
    status.textContent = file === null
      ? "No archive selected. Restore remains local and offline."
      : `${file.name || "Archive selected"}. Choose Preview archive to verify it before restore.`;
  });

  previewButton.addEventListener("click", async () => {
    const file = currentFile(input);
    if (file === null) return;
    const token = generation;
    clearError();
    invalidate();
    previewBusy(true);
    status.textContent = "Reading and verifying the selected archive locally…";
    try {
      const contents = await readJournalRestoreFile(file);
      if (token !== generation || currentFile(input) !== file) return;
      const candidate = await application.prepareUserDataRestore(contents);
      if (token !== generation || currentFile(input) !== file) return;
      prepared = candidate;
      showPreview(candidate);
      status.textContent = candidate.preview.target === "already-restored"
        ? "Verified: this exact archive already matches the journal. Confirm to finish recovery verification."
        : "Verified: the archive is compatible and the journal is empty. Review the details, then confirm restore.";
      previewTitle.focus();
    } catch (caught) {
      if (token !== generation || currentFile(input) !== file) return;
      invalidate();
      showError(message(caught, "Hermes could not verify the selected archive."), "No restore preview was prepared.");
    } finally {
      if (token === generation && card.isConnected) previewBusy(false);
    }
  });

  confirmation.addEventListener("change", () => {
    commitButton.disabled = prepared === null || !confirmation.checked;
  });

  cancelButton.addEventListener("click", () => {
    generation += 1;
    clearError();
    invalidate();
    input.value = "";
    previewButton.disabled = true;
    card.setAttribute("aria-busy", "false");
    status.textContent = "Restore preview cancelled. Choose an archive to start again.";
    input.focus();
  });

  commitButton.addEventListener("click", async () => {
    if (prepared === null || !confirmation.checked || commitPending) return;
    const command = prepared;
    commitPending = true;
    generation += 1;
    clearError();
    card.setAttribute("aria-busy", "true");
    input.disabled = true;
    previewButton.disabled = true;
    confirmation.disabled = true;
    commitButton.disabled = true;
    cancelButton.disabled = true;
    status.textContent = "Restoring and verifying the journal atomically…";

    let outcome: "committed" | "already-restored";
    try {
      outcome = (await application.commitUserDataRestoreSafely(command)).outcome;
    } catch (caught) {
      if (card.isConnected) {
        if (caught instanceof JournalRestoreCommitStatusUncertainError) {
          showError(caught.message, "Restore status is uncertain. Keep this file and retry the same verified restore; do not add journal data.");
        } else {
          invalidate();
          showError(message(caught, "Hermes stopped the restore before it could be verified."), "Restore was not committed. Preview the archive again before retrying.");
        }
      }
      commitPending = false;
      if (card.isConnected) {
        card.setAttribute("aria-busy", "false");
        input.disabled = false;
        previewButton.disabled = currentFile(input) === null;
        confirmation.disabled = prepared === null;
        commitButton.disabled = prepared === null || !confirmation.checked;
        cancelButton.disabled = false;
      }
      return;
    }

    const announcement = outcome === "already-restored"
      ? "Restore verified. This exact archive was already restored; no duplicate data was created."
      : "Restore complete. The verified journal is now available on this device.";
    try {
      await refresh(announcement);
    } catch (caught) {
      if (card.isConnected) {
        showError(message(caught, "The restored journal could not be redrawn."), `${announcement} The screen could not refresh.`);
      }
    } finally {
      commitPending = false;
      if (card.isConnected) {
        card.setAttribute("aria-busy", "false");
        input.disabled = false;
        previewButton.disabled = currentFile(input) === null;
        confirmation.disabled = false;
        commitButton.disabled = !confirmation.checked;
        cancelButton.disabled = false;
      }
    }
  });

  invalidate();
}
