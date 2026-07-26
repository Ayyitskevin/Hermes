import {
  JournalApplication,
  PlaybookDefinitionCommitStatusUncertainError,
} from "../application/journal-application";
import {
  JournalPlaybookDefinitionError,
  type JournalPlaybookDefinitionRecord,
  type PlaybookDefinitionCommitResult,
} from "../application/journal-store";
import {
  PlaybookDefinitionPreparationError,
  type PreparedPlaybookDefinitionCommand,
} from "../application/prepare-playbook-definition";
import { escapeHtml } from "../core/html";

export interface PlaybookLibraryActions {
  readonly setBackgroundInert: (inert: boolean) => void;
  readonly refresh: (
    result: PlaybookDefinitionCommitResult,
    announcement: string,
  ) => void | Promise<void>;
}

export function parsePlaybookDefinitionRules(value: string): readonly string[] {
  return value
    .replace(/\r\n?/gu, "\n")
    .split("\n")
    .map((rule) => rule.trim())
    .filter((rule) => rule.length > 0);
}

function lifecycleLabel(state: JournalPlaybookDefinitionRecord["state"]): string {
  return state === "active" ? "Active" : "Archived";
}

function definitionCard(
  definition: JournalPlaybookDefinitionRecord,
  canManage: boolean,
): string {
  const action = definition.state === "active"
    ? `<button class="secondary-button" type="button" data-playbook-definition-edit="${escapeHtml(definition.id)}" ${canManage ? "" : "disabled"}>Edit</button>
       <button class="secondary-button" type="button" data-playbook-definition-archive="${escapeHtml(definition.id)}" ${canManage ? "" : "disabled"}>Archive</button>`
    : `<button class="secondary-button" type="button" data-playbook-definition-restore="${escapeHtml(definition.id)}" ${canManage ? "" : "disabled"}>Restore</button>`;
  const rules = definition.rules.length === 0
    ? `<p class="helper-text">No rules in this revision.</p>`
    : `<ol>${definition.rules.map((rule) => `<li>${escapeHtml(rule)}</li>`).join("")}</ol>`;
  return `<article class="card playbook-library-card"
    data-playbook-definition="${escapeHtml(definition.id)}"
    data-playbook-definition-version="${escapeHtml(definition.versionId)}"
    data-playbook-definition-revision="${escapeHtml(definition.revision)}">
    <div class="section-title"><div><span class="status-chip review-${definition.state}">${lifecycleLabel(definition.state)}</span><h3>${escapeHtml(definition.name)}</h3></div><strong>v${definition.version}</strong></div>
    ${rules}
    <div class="quick-actions">${action}</div>
  </article>`;
}

export function playbookLibrarySection(
  library: readonly JournalPlaybookDefinitionRecord[],
  canManage: boolean,
): string {
  const active = library.filter(({ state }) => state === "active");
  const archived = library.filter(({ state }) => state === "archived");
  const emptyCopy = canManage
    ? "Create a reusable playbook, then explicitly apply one immutable revision while reviewing a trade."
    : "Establish the local journal before creating reusable playbooks.";
  return `<section data-playbook-library aria-labelledby="playbook-library-title">
    <div class="section-title"><div><p class="card-label">REUSABLE DEFINITIONS</p><h2 id="playbook-library-title" tabindex="-1">Playbook Library</h2></div><span>${active.length} active</span></div>
    <p class="helper-text">Names and ordered rules are versioned on device. Editing never rewrites a completed review; archive keeps every identity and revision restorable.</p>
    <div class="quick-actions"><button class="primary-button" type="button" data-playbook-definition-create ${canManage ? "" : "disabled"}>New playbook</button></div>
    <p class="form-error playbook-library-status" data-playbook-library-status role="status" tabindex="-1" hidden></p>
    <div class="playbook-library-grid">
      ${active.map((definition) => definitionCard(definition, canManage)).join("")}
      ${active.length === 0 ? `<article class="empty-state"><h3>No active playbooks</h3><p>${emptyCopy}</p></article>` : ""}
    </div>
    ${archived.length === 0 ? "" : `<details class="playbook-library-archive"><summary>Archived playbooks (${archived.length})</summary><div class="playbook-library-grid">${archived.map((definition) => definitionCard(definition, canManage)).join("")}</div></details>`}
  </section>`;
}

export function playbookDefinitionSheetTemplate(
  definition: JournalPlaybookDefinitionRecord | null,
): string {
  const editing = definition !== null;
  return `<div class="sheet-backdrop playbook-definition-backdrop" data-playbook-definition-backdrop>
    <section class="settings-sheet playbook-definition-sheet" role="dialog" aria-modal="true" aria-labelledby="playbook-definition-sheet-title" tabindex="-1">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-heading"><div><p class="eyebrow">PRIVATE · ON DEVICE</p><h2 id="playbook-definition-sheet-title" tabindex="-1">${editing ? "Edit playbook" : "New playbook"}</h2></div><button class="icon-button" type="button" data-playbook-definition-close aria-label="Close playbook editor">×</button></div>
      <p>${editing ? `Saving creates version ${definition.version + 1}; version ${definition.version} remains immutable.` : "Create one stable identity with an immutable first revision."}</p>
      <form id="playbook-definition-form" novalidate>
        <label>Name<input id="playbook-definition-name" type="text" maxlength="120" value="${escapeHtml(definition?.name ?? "")}" autocomplete="off" required /></label>
        <label>Rules, one per line<textarea id="playbook-definition-rules" rows="8" maxlength="10020" placeholder="Wait for confirmation&#10;Respect the planned stop">${escapeHtml(definition?.rules.join("\n") ?? "")}</textarea></label>
        <p class="field-hint">Order is durable. Duplicate rule text is rejected instead of silently merged.</p>
        <p class="form-error" data-playbook-definition-error role="alert" tabindex="-1" hidden></p>
        <p class="helper-text" data-playbook-definition-save-status role="status" aria-live="polite"></p>
        <div class="sheet-actions"><button class="secondary-button" type="button" data-playbook-definition-close>Cancel</button><button class="primary-button" type="submit">${editing ? "Save new version" : "Create playbook"}</button></div>
      </form>
    </section>
  </div>`;
}

function exactDefinition(
  trigger: HTMLButtonElement,
  library: readonly JournalPlaybookDefinitionRecord[],
): JournalPlaybookDefinitionRecord | null {
  const id = trigger.dataset.playbookDefinitionEdit
    ?? trigger.dataset.playbookDefinitionArchive
    ?? trigger.dataset.playbookDefinitionRestore;
  if (id === undefined) return null;
  const matches = library.filter((candidate) => candidate.id === id);
  const definition = matches.length === 1 ? matches[0] ?? null : null;
  const card = trigger.closest<HTMLElement>("[data-playbook-definition]");
  if (
    definition === null
    || card === null
    || !card.contains(trigger)
    || card.dataset.playbookDefinition !== definition.id
    || card.dataset.playbookDefinitionVersion !== definition.versionId
    || card.dataset.playbookDefinitionRevision !== definition.revision
  ) return null;
  return definition;
}

function failureMessage(error: unknown): string {
  if (
    error instanceof PlaybookDefinitionPreparationError
    || error instanceof JournalPlaybookDefinitionError
    || error instanceof PlaybookDefinitionCommitStatusUncertainError
  ) return error.message;
  return "Hermes could not save this playbook change. Nothing was partially applied.";
}

function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hidden && element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (first === undefined || last === undefined) {
    event.preventDefault();
    container.focus({ preventScroll: true });
    return;
  }
  const active = document.activeElement;
  const activeIsInTabOrder = active instanceof HTMLElement && focusable.includes(active);
  if (!container.contains(active) || !activeIsInTabOrder) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

export function bindPlaybookLibrary(
  root: HTMLElement,
  application: JournalApplication,
  library: readonly JournalPlaybookDefinitionRecord[],
  actions: PlaybookLibraryActions,
): void {
  const section = root.querySelector<HTMLElement>("[data-playbook-library]");
  const status = section?.querySelector<HTMLElement>("[data-playbook-library-status]");
  if (section === null || section === undefined || status === null || status === undefined) return;

  const showStatus = (message: string) => {
    status.hidden = false;
    status.textContent = message;
    status.focus({ preventScroll: true });
  };

  const commitLifecycle = async (
    definition: JournalPlaybookDefinitionRecord,
    action: "archive" | "restore",
    prepared?: PreparedPlaybookDefinitionCommand,
  ) => {
    const command = prepared ?? application.preparePlaybookDefinition({
      submissionId: application.createPlaybookDefinitionSubmissionId(),
      action,
      playbookId: definition.id,
      expectedPreviousVersionId: definition.versionId,
      name: definition.name,
      rules: definition.rules,
    });
    status.hidden = true;
    try {
      const result = await application.commitPlaybookDefinitionSafely(command);
      await actions.refresh(
        result,
        `${definition.name} ${action === "archive" ? "archived" : "restored"}.`,
      );
    } catch (error) {
      showStatus(failureMessage(error));
      if (error instanceof PlaybookDefinitionCommitStatusUncertainError) {
        const retry = document.createElement("button");
        retry.className = "secondary-button";
        retry.type = "button";
        retry.textContent = "Retry exact change";
        retry.addEventListener("click", () => { void commitLifecycle(definition, action, command); });
        status.append(document.createTextNode(" "), retry);
      }
    }
  };

  const openEditor = (definition: JournalPlaybookDefinitionRecord | null) => {
    (root.querySelector(".app-shell") ?? root).insertAdjacentHTML(
      "beforeend",
      playbookDefinitionSheetTemplate(definition),
    );
    const backdrop = root.querySelector<HTMLElement>("[data-playbook-definition-backdrop]");
    const sheet = backdrop?.querySelector<HTMLElement>(".playbook-definition-sheet");
    const form = backdrop?.querySelector<HTMLFormElement>("#playbook-definition-form");
    const error = backdrop?.querySelector<HTMLElement>("[data-playbook-definition-error]");
    const saveStatus = backdrop?.querySelector<HTMLElement>("[data-playbook-definition-save-status]");
    if (backdrop === null || backdrop === undefined || sheet === null || sheet === undefined || form === null || form === undefined || error === null || error === undefined || saveStatus === null || saveStatus === undefined) {
      backdrop?.remove();
      return;
    }
    actions.setBackgroundInert(true);
    let busy = false;
    let uncertain: PreparedPlaybookDefinitionCommand | null = null;
    const close = () => {
      if (busy || uncertain !== null) return;
      backdrop.remove();
      actions.setBackgroundInert(false);
    };
    backdrop.querySelectorAll<HTMLButtonElement>("[data-playbook-definition-close]").forEach((button) => button.addEventListener("click", close));
    backdrop.addEventListener("click", (event) => { if (event.target === backdrop) close(); });
    sheet.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close();
        return;
      }
      trapFocus(sheet, event);
    });
    const submissionId = application.createPlaybookDefinitionSubmissionId();
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (busy) return;
      const name = form.querySelector<HTMLInputElement>("#playbook-definition-name")?.value ?? "";
      const rules = parsePlaybookDefinitionRules(form.querySelector<HTMLTextAreaElement>("#playbook-definition-rules")?.value ?? "");
      let prepared: PreparedPlaybookDefinitionCommand | null = uncertain;
      try {
        prepared = prepared ?? application.preparePlaybookDefinition(definition === null ? {
          submissionId,
          action: "create",
          playbookId: null,
          expectedPreviousVersionId: null,
          name,
          rules,
        } : {
          submissionId,
          action: "edit",
          playbookId: definition.id,
          expectedPreviousVersionId: definition.versionId,
          name,
          rules,
        });
        busy = true;
        sheet.setAttribute("aria-busy", "true");
        saveStatus.textContent = uncertain === null
          ? "Saving one atomic immutable revision…"
          : "Retrying the exact prepared revision…";
        const result = await application.commitPlaybookDefinitionSafely(prepared);
        backdrop.remove();
        actions.setBackgroundInert(false);
        await actions.refresh(result, definition === null ? `${result.definition.name} created.` : `${result.definition.name} updated to version ${result.definition.version}.`);
      } catch (caught) {
        busy = false;
        sheet.setAttribute("aria-busy", "false");
        error.hidden = false;
        error.textContent = failureMessage(caught);
        error.focus({ preventScroll: true });
        if (
          caught instanceof PlaybookDefinitionCommitStatusUncertainError
          && prepared !== null
        ) {
          uncertain = prepared;
          saveStatus.textContent = "Retry submits the same identity and revision; fields are locked.";
          form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea").forEach((field) => {
            field.readOnly = true;
          });
          const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
          if (submit !== null) submit.textContent = "Retry exact change";
        }
      }
    });
    sheet.querySelector<HTMLElement>("#playbook-definition-sheet-title")?.focus({ preventScroll: true });
  };

  section.querySelector<HTMLButtonElement>("[data-playbook-definition-create]")?.addEventListener("click", () => openEditor(null));
  section.querySelectorAll<HTMLButtonElement>("[data-playbook-definition-edit]").forEach((button) => button.addEventListener("click", () => {
    const definition = exactDefinition(button, library);
    if (definition === null || definition.state !== "active") { showStatus("This playbook changed. Reload the library before editing."); return; }
    openEditor(definition);
  }));
  section.querySelectorAll<HTMLButtonElement>("[data-playbook-definition-archive], [data-playbook-definition-restore]").forEach((button) => button.addEventListener("click", () => {
    const definition = exactDefinition(button, library);
    const action = button.hasAttribute("data-playbook-definition-archive") ? "archive" : "restore";
    if (definition === null || (action === "archive" ? definition.state !== "active" : definition.state !== "archived")) { showStatus("This playbook changed. Reload the library before continuing."); return; }
    if (!window.confirm(`${action === "archive" ? "Archive" : "Restore"} ${definition.name}? Its stable identity and every revision stay on this device.`)) return;
    void commitLifecycle(definition, action);
  }));
}
