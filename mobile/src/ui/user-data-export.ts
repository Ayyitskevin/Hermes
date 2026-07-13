import type { JournalApplication } from "../application/journal-application";
import type { JournalExportArtifact } from "../application/journal-archive";

export type JournalExportDeliveryResult =
  | "shared"
  | "download-requested"
  | "cancelled";

export type JournalExportDelivery = (
  artifact: JournalExportArtifact,
) => Promise<JournalExportDeliveryResult>;

function isAbortError(error: unknown): boolean {
  return typeof error === "object"
    && error !== null
    && "name" in error
    && error.name === "AbortError";
}

/**
 * This function performs its share/download side effect before returning its
 * promise. Call it directly from a user event; deferring it can lose transient
 * activation in WebKit.
 */
export function deliverJournalExport(
  artifact: JournalExportArtifact,
): Promise<JournalExportDeliveryResult> {
  const blob = new Blob([artifact.contents], { type: artifact.mediaType });
  const file = typeof File === "function"
    ? new File([blob], artifact.fileName, { type: artifact.mediaType })
    : null;
  let canShareFile = false;
  if (
    file !== null
    && typeof navigator.share === "function"
    && typeof navigator.canShare === "function"
  ) {
    try {
      canShareFile = navigator.canShare({ files: [file] });
    } catch {
      canShareFile = false;
    }
  }

  if (file !== null && canShareFile) {
    try {
      return navigator.share({
        files: [file],
        title: "Hermes journal export",
        text: "Point-in-time Hermes journal export",
      }).then(
        () => "shared" as const,
        (error: unknown) => {
          if (isAbortError(error)) return "cancelled" as const;
          throw error;
        },
      );
    } catch (error) {
      if (isAbortError(error)) return Promise.resolve("cancelled");
      return Promise.reject(error);
    }
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = artifact.fileName;
  anchor.rel = "noopener";
  anchor.hidden = true;
  document.body.append(anchor);
  try {
    anchor.click();
  } finally {
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 5_000);
  }
  return Promise.resolve("download-requested");
}

export function userDataExportCard(
  persistence: JournalApplication["persistence"],
): string {
  const environment = persistence === "encrypted-device"
    ? `<p class="helper-text"><strong>On-device archive.</strong> Preparation reads one transactional snapshot of the encrypted SQLite journal. The exported JSON file itself is not encrypted.</p>`
    : `<p class="helper-text"><strong>Development preview.</strong> This captures only the current in-memory browser session. It is not a tested native iOS backup.</p>`;

  return `<article class="card user-data-export" aria-labelledby="user-data-export-title">
    <p class="card-label">OWN YOUR DATA</p>
    <h2 id="user-data-export-title">Export journal</h2>
    <p>Create a point-in-time Hermes archive without sending it to a Hermes server.</p>
    <p class="export-warning"><strong>Unencrypted file.</strong> It can contain account names, executions, raw import provenance, notes, tags, playbooks, and immutable review history. Store and share it like sensitive financial data.</p>
    ${environment}
    <p class="helper-text">Restore and Delete All Data are not available yet. Until restore passes native recovery testing, this export is an archive—not a recoverable backup.</p>
    <button class="secondary-button" id="user-data-export" type="button">Prepare export</button>
    <p class="export-status" id="user-data-export-status" role="status" aria-live="polite" aria-atomic="true">Nothing leaves this device until you choose a destination.</p>
    <p class="form-error" id="user-data-export-error" role="alert" tabindex="-1" hidden></p>
  </article>`;
}

export function bindUserDataExport(
  root: HTMLElement,
  application: JournalApplication,
  deliver: JournalExportDelivery = deliverJournalExport,
): void {
  const card = root.querySelector<HTMLElement>(".user-data-export");
  const button = root.querySelector<HTMLButtonElement>("#user-data-export");
  const status = root.querySelector<HTMLElement>("#user-data-export-status");
  const error = root.querySelector<HTMLElement>("#user-data-export-error");
  if (card === null || button === null || status === null || error === null) return;

  let artifact: JournalExportArtifact | null = null;

  button.addEventListener("click", async () => {
    button.disabled = true;
    card.setAttribute("aria-busy", "true");
    error.hidden = true;

    if (artifact === null) {
      status.textContent = "Preparing one consistent journal snapshot…";
      try {
        artifact = await application.exportUserData();
      } catch (caught) {
        if (!button.isConnected) return;
        error.textContent = caught instanceof Error
          ? caught.message
          : "Hermes could not prepare the journal export.";
        error.hidden = false;
        error.focus();
        status.textContent = "No export was prepared.";
        button.disabled = false;
        card.setAttribute("aria-busy", "false");
        return;
      }
      if (!button.isConnected) return;
      button.textContent = "Share or save export";
      status.textContent = `Archive prepared: ${artifact.archive.summary.activeExecutions} active executions and ${artifact.archive.summary.reviewVersions} review versions. Choose a destination, then verify the file there.`;
      button.disabled = false;
      card.setAttribute("aria-busy", "false");
      return;
    }

    status.textContent = "Opening available destinations…";
    try {
      // Keep this call in the click task. It synchronously opens share/download
      // before the returned promise is awaited.
      const outcome = await deliver(artifact);
      if (!button.isConnected) return;
      status.textContent = outcome === "shared"
        ? "Export handed to the selected destination. Verify it there before deleting any data."
        : outcome === "cancelled"
          ? "Sharing cancelled. The prepared archive is still ready."
          : "Download requested. Verify the file appears in Downloads or Files.";
    } catch (caught) {
      if (!button.isConnected) return;
      error.textContent = caught instanceof Error
        ? caught.message
        : "Hermes could not hand off the prepared export.";
      error.hidden = false;
      error.focus();
      status.textContent = "The prepared archive remains ready to try again.";
    } finally {
      if (button.isConnected) {
        button.textContent = "Share or save export again";
        button.disabled = false;
        card.setAttribute("aria-busy", "false");
      }
    }
  });
}
