import {
  DailyJournalCommitStatusUncertainError,
  JournalApplication,
} from "../application/journal-application";
import {
  DailyJournalPreparationError,
  type PreparedDailyJournalEntry,
  validateDailyJournalIdentifier,
  validateDailyJournalIsoDate,
} from "../application/prepare-daily-journal";
import { JournalDailyEntryError } from "../application/journal-store";
import { escapeHtml } from "../core/html";
import type { DailyJournalPreview, JournalWorkspaceSnapshot } from "../core/types";

type SaveFailureKind = "uncertain" | "stale" | "blocked" | "retryable";

export function dailyJournalSaveFailureKind(error: unknown): SaveFailureKind {
  if (error instanceof DailyJournalCommitStatusUncertainError) return "uncertain";
  if (
    error instanceof JournalDailyEntryError
    && error.conflict.code === "entry_changed"
  ) return "stale";
  if (error instanceof JournalDailyEntryError) return "blocked";
  return "retryable";
}

export function parseDailyJournalTags(value: string): readonly string[] {
  return value
    .split(/[,\n]/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function workspaceTodayIsoDate(
  timeZone: string,
  instant: Date = new Date(),
): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const value = (type: Intl.DateTimeFormatPartTypes): string => {
    const found = parts.find((part) => part.type === type)?.value;
    if (found === undefined) throw new Error(`Workspace date formatter omitted ${type}.`);
    return found;
  };
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function newestAvailableDailyJournalDate(
  entries: readonly DailyJournalPreview[],
  maximumDate: string,
): string {
  const occupied = new Set(entries.map((entry) => entry.isoDate));
  let candidate = maximumDate;
  for (let checked = 0; checked <= occupied.size; checked += 1) {
    if (!occupied.has(candidate)) return candidate;
    const date = new Date(`${candidate}T12:00:00.000Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    candidate = date.toISOString().slice(0, 10);
    if (candidate < "1970-01-01") break;
  }
  throw new Error("Every supported daily-reflection date already has an entry.");
}

function longDateLabel(isoDate: string): string {
  const exactDate = validateDailyJournalIsoDate(isoDate);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${exactDate}T12:00:00.000Z`));
}

export function dailyJournalAction(
  entry: DailyJournalPreview | null,
  label?: string,
  calendarIsoDate?: string,
): string {
  const exactCalendarDate = calendarIsoDate === undefined
    ? null
    : validateDailyJournalIsoDate(calendarIsoDate);
  if (entry !== null) {
    validateDailyJournalIsoDate(entry.isoDate);
    if (exactCalendarDate !== null && entry.isoDate !== exactCalendarDate) {
      throw new DailyJournalPreparationError(
        "invalid_date",
        "The calendar origin must match the daily reflection date.",
      );
    }
  }
  const calendarAttribute = exactCalendarDate === null
    ? ""
    : ` data-daily-entry-calendar-date="${escapeHtml(exactCalendarDate)}" aria-haspopup="dialog"`;
  if (entry === null) {
    const actionLabel = label
      ?? (exactCalendarDate === null ? "Write daily reflection" : "Write reflection for this day");
    const accessibleName = exactCalendarDate === null
      ? ""
      : ` aria-label="${escapeHtml(actionLabel)} — ${escapeHtml(longDateLabel(exactCalendarDate))}"`;
    return `<button class="primary-button" type="button" data-daily-entry-new${calendarAttribute}${accessibleName}>${escapeHtml(actionLabel)}</button>`;
  }
  const actionLabel = exactCalendarDate === null
    ? "Edit reflection"
    : entry.state === "draft"
      ? "Continue reflection draft"
      : "Edit completed reflection";
  const visibleLabel = label ?? actionLabel;
  const accessibleName = exactCalendarDate === null
    ? `Edit daily reflection for ${longDateLabel(entry.isoDate)}`
    : `${visibleLabel} — ${longDateLabel(entry.isoDate)}`;
  return `<button class="secondary-button" type="button" data-daily-entry-edit="${escapeHtml(entry.isoDate)}"${calendarAttribute} aria-label="${escapeHtml(accessibleName)}">${escapeHtml(visibleLabel)}</button>`;
}

export function dailyJournalLatestVersionTemplate(
  entry: DailyJournalPreview,
): string {
  const title = entry.title ?? "No headline";
  const emotion = entry.emotion ?? "Not recorded";
  const score = entry.processScorePct === null
    ? "Not recorded"
    : `${entry.processScorePct}%`;
  const tags = entry.tags.length === 0 ? "None" : entry.tags.join(", ");
  return `<h4 id="daily-entry-latest-title">Latest saved version</h4>
  <dl class="daily-entry-latest-grid" data-daily-entry-latest-version="${entry.version}">
    <div><dt>Saved version</dt><dd>Version ${entry.version} · ${escapeHtml(entry.state)}</dd></div>
    <div><dt>Date</dt><dd>${escapeHtml(entry.dateLabel)}</dd></div>
    <div><dt>Headline</dt><dd>${escapeHtml(title)}</dd></div>
    <div><dt>Reflection</dt><dd class="daily-entry-latest-note">${escapeHtml(entry.note)}</dd></div>
    <div><dt>Emotion</dt><dd>${escapeHtml(emotion)}</dd></div>
    <div><dt>Self-reported process score</dt><dd>${escapeHtml(score)}</dd></div>
    <div><dt>Tags</dt><dd>${escapeHtml(tags)}</dd></div>
  </dl>`;
}

export function dailyJournalReconciliationHead(
  snapshot: JournalWorkspaceSnapshot,
  isoDate: string,
  expectedPreviousEntryId: string | null,
  expectedPreviousVersion: number,
): DailyJournalPreview | null {
  if (snapshot.provenance !== "local") return null;
  const latest = snapshot.dailyJournal.find((entry) => entry.isoDate === isoDate) ?? null;
  if (
    latest === null
    || latest.entryVersionId === expectedPreviousEntryId
    || latest.version <= expectedPreviousVersion
  ) return null;
  return latest;
}

export function dailyJournalSheetTemplate(
  entry: DailyJournalPreview | null,
  snapshot: JournalWorkspaceSnapshot,
  defaultDate = workspaceTodayIsoDate(snapshot.timeZone),
  createDate = defaultDate,
  calendarIsoDate: string | null = null,
): string {
  const maximumDate = validateDailyJournalIsoDate(defaultDate);
  const isoDate = validateDailyJournalIsoDate(entry?.isoDate ?? createDate);
  const exactCalendarDate = calendarIsoDate === null
    ? null
    : validateDailyJournalIsoDate(calendarIsoDate);
  if (
    exactCalendarDate !== null
    && (exactCalendarDate !== isoDate || exactCalendarDate > maximumDate)
  ) {
    throw new DailyJournalPreparationError(
      "invalid_date",
      "The calendar origin must be the same non-future daily reflection date.",
    );
  }
  const edit = entry !== null;
  const dateLocked = edit || exactCalendarDate !== null;
  const title = entry?.title ?? "";
  const note = entry?.note ?? "";
  const emotion = entry?.emotion ?? "";
  const score = entry?.processScorePct === null || entry?.processScorePct === undefined
    ? ""
    : String(entry.processScorePct);
  const tags = entry?.tags.join(", ") ?? "";
  return `<div class="sheet-backdrop daily-journal-backdrop" data-daily-entry-backdrop>
    <section class="settings-sheet daily-journal-sheet" role="dialog" aria-modal="true" aria-labelledby="daily-entry-title" tabindex="-1">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-heading">
        <div>
          <p class="eyebrow">PRIVATE · ON DEVICE</p>
          <h2 id="daily-entry-title" tabindex="-1">${edit ? "Edit daily reflection" : "New daily reflection"}</h2>
        </div>
        <button class="icon-button" type="button" data-daily-entry-close aria-label="Close daily reflection">×</button>
      </div>
      <p>Reflect on process, decisions, and what changes next session. This note never places or routes a trade.</p>
      <form id="daily-entry-form" novalidate>
        <label>Date
          <input id="daily-entry-date" name="daily-entry-date" type="date"
            min="1970-01-01" max="${escapeHtml(maximumDate)}" value="${escapeHtml(isoDate)}"
            ${dateLocked ? 'readonly aria-describedby="daily-entry-date-hint"' : ""} required />
        </label>
        ${dateLocked ? `<p class="field-hint" id="daily-entry-date-hint">${exactCalendarDate === null ? "The date is part of this entry’s durable identity and cannot be changed." : "The selected calendar day is this entry’s durable identity and cannot be changed here."}</p>` : ""}
        <label>Headline <span class="field-hint">Optional</span>
          <input id="daily-entry-headline" name="daily-entry-headline" type="text"
            maxlength="240" value="${escapeHtml(title)}" placeholder="What defined the day?" aria-describedby="daily-entry-headline-count" />
        </label>
        <p class="field-hint character-count" id="daily-entry-headline-count" data-daily-count="daily-entry-headline" data-daily-limit="120"></p>
        <label>Reflection
          <textarea id="daily-entry-note" name="daily-entry-note" rows="7"
            maxlength="10000" aria-describedby="daily-entry-note-hint daily-entry-note-count"
            placeholder="What happened? What did you follow? What changes next session?">${escapeHtml(note)}</textarea>
        </label>
        <p class="field-hint" id="daily-entry-note-hint">Up to 5,000 Unicode characters. Saved only when you choose an action below.</p>
        <p class="field-hint character-count" id="daily-entry-note-count" data-daily-count="daily-entry-note" data-daily-limit="5000"></p>
        <div class="field-grid">
          <label>Emotion <span class="field-hint">Optional</span>
            <input id="daily-entry-emotion" name="daily-entry-emotion" type="text"
              maxlength="240" value="${escapeHtml(emotion)}" list="daily-entry-emotions" aria-describedby="daily-entry-emotion-count" />
            <span class="field-hint character-count" id="daily-entry-emotion-count" data-daily-count="daily-entry-emotion" data-daily-limit="120"></span>
          </label>
          <label>Self-reported process score <span class="field-hint">Optional</span>
            <input id="daily-entry-score" name="daily-entry-score" type="number"
              inputmode="numeric" min="0" max="100" step="1" value="${escapeHtml(score)}" aria-describedby="daily-entry-score-hint" />
          </label>
        </div>
        <datalist id="daily-entry-emotions">${snapshot.reviewOptions.emotions.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("")}</datalist>
        <label>Tags <span class="field-hint">Optional · comma separated</span>
          <input id="daily-entry-tags" name="daily-entry-tags" type="text"
            value="${escapeHtml(tags)}" placeholder="Plan followed, Patient" />
        </label>
        <p class="privacy-copy" id="daily-entry-score-hint">The process score is your own reflection and is excluded from performance and Plan Check analytics.</p>
        <p class="form-error" id="daily-entry-error" role="alert" tabindex="-1" hidden></p>
        <p id="daily-entry-status" class="sr-only" role="status" aria-live="polite"></p>
        <button class="secondary-button" id="daily-entry-reconcile" type="button" hidden>Retry this exact save</button>
        <section class="daily-entry-conflict" id="daily-entry-conflict" aria-labelledby="daily-entry-conflict-title" hidden>
          <h3 id="daily-entry-conflict-title" tabindex="-1">Review the saved version before continuing</h3>
          <p id="daily-entry-conflict-copy">Hermes rejected the prepared save. Your unsaved changes remain in the form, and nothing was overwritten. Review the latest saved version before choosing whether to append your changes as its successor.</p>
          <div id="daily-entry-latest" role="region" aria-labelledby="daily-entry-latest-title" tabindex="0" hidden></div>
          <p class="privacy-copy" id="daily-entry-rebase-status" hidden></p>
          <div class="quick-actions daily-entry-conflict-actions">
            <button class="secondary-button" id="daily-entry-review-latest" type="button">Review latest saved version</button>
            <button class="primary-button" id="daily-entry-accept-latest" type="button" hidden>Continue with my unsaved changes</button>
          </div>
        </section>
        <div class="quick-actions daily-entry-actions">
          <button class="text-button" type="button" data-daily-entry-close>Cancel</button>
          <button class="secondary-button" type="submit" data-daily-entry-state="draft">Save draft</button>
          <button class="primary-button" type="submit" data-daily-entry-state="completed">${edit && entry.state === "completed" ? "Save changes" : "Complete reflection"}</button>
        </div>
      </form>
    </section>
  </div>`;
}

function focusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]):not([hidden]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => (
    !element.hidden
    && element.getAttribute("aria-hidden") !== "true"
    && element.getClientRects().length > 0
  ));
}

function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const focusable = focusableElements(container);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (first === undefined || last === undefined) {
    event.preventDefault();
    container.focus();
    return;
  }
  const activeIsInTabOrder = focusable.includes(document.activeElement as HTMLElement);
  if (event.shiftKey && (!activeIsInTabOrder || document.activeElement === first)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (!activeIsInTabOrder || document.activeElement === last)) {
    event.preventDefault();
    first.focus();
  }
}

function formFingerprint(form: HTMLFormElement): string {
  return JSON.stringify(Array.from(new FormData(form).entries()));
}

function inputValue(form: HTMLFormElement, id: string): string {
  const input = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
  if (input === null) throw new Error(`Daily reflection form is missing ${id}.`);
  return input.value;
}

export function validateDailyJournalPreview(entry: DailyJournalPreview): void {
  validateDailyJournalIsoDate(entry.isoDate);
  validateDailyJournalIdentifier(entry.entryVersionId, "Daily reflection entry version ID");
  if (typeof entry.revision !== "string" || !/^[a-f0-9]{64}$/.test(entry.revision)) {
    throw new Error("Daily reflection revision must be a 256-bit lowercase hexadecimal value.");
  }
  if (!Number.isSafeInteger(entry.version) || entry.version < 1) {
    throw new Error("Daily reflection version must be a positive safe integer.");
  }
  if (entry.state !== "draft" && entry.state !== "completed") {
    throw new Error("Daily reflection state must be draft or completed.");
  }
}

function focusAfterDailyJournalRefresh(
  root: HTMLElement,
  calendarOriginDate: string | null,
): void {
  if (calendarOriginDate !== null) {
    const card = Array.from(
      root.querySelectorAll<HTMLElement>("[data-calendar-day-filter]"),
    ).find((candidate) => candidate.dataset.calendarDayFilter === calendarOriginDate);
    const target = card?.querySelector<HTMLElement>("#calendar-day-reflection-title")
      ?? card?.querySelector<HTMLElement>("#calendar-day-filter-title")
      ?? null;
    if (target !== null) {
      target.scrollIntoView?.({ behavior: "auto", block: "start" });
      target.focus({ preventScroll: true });
      return;
    }
  }
  root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
}

export function bindDailyJournalActions(
  root: HTMLElement,
  application: JournalApplication,
  snapshot: JournalWorkspaceSnapshot,
  setBackgroundInert: (inert: boolean) => void,
  refresh: (announcement: string) => Promise<JournalWorkspaceSnapshot>,
  selectedCalendarDate: string | null = null,
): void {
  if (snapshot.provenance !== "local") return;
  const triggers = root.querySelectorAll<HTMLButtonElement>(
    "[data-daily-entry-new], [data-daily-entry-edit]",
  );
  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      root.querySelectorAll<HTMLElement>("[data-daily-entry-open-error]")
        .forEach((message) => message.remove());
      const showOpenError = () => {
        const message = document.createElement("p");
        message.className = "form-error";
        message.dataset.dailyEntryOpenError = "";
        message.setAttribute("role", "alert");
        message.setAttribute("tabindex", "-1");
        message.textContent = "Hermes could not safely open this daily reflection. Refresh the journal and try again.";
        trigger.insertAdjacentElement("afterend", message);
        message.focus({ preventScroll: true });
      };
      let entry: DailyJournalPreview | null;
      let defaultDate: string;
      let createDate: string;
      let calendarOriginDate: string | null;
      let sheetHtml: string;
      try {
        const isNew = trigger.hasAttribute("data-daily-entry-new");
        const isEdit = trigger.hasAttribute("data-daily-entry-edit");
        if (Number(isNew) + Number(isEdit) !== 1) throw new Error("Ambiguous action.");

        const editAttribute = isEdit
          ? trigger.getAttribute("data-daily-entry-edit")
          : null;
        if (isEdit && editAttribute === null) throw new Error("Missing edit date.");
        const requestedDate = editAttribute === null
          ? null
          : validateDailyJournalIsoDate(editAttribute);
        const calendarAttribute = trigger.getAttribute("data-daily-entry-calendar-date");
        calendarOriginDate = calendarAttribute === null
          ? null
          : validateDailyJournalIsoDate(calendarAttribute);
        const selectedDate = selectedCalendarDate === null
          ? null
          : validateDailyJournalIsoDate(selectedCalendarDate);
        if ((selectedDate === null) !== (calendarOriginDate === null)) {
          throw new Error("The daily reflection action has an invalid calendar origin.");
        }
        if (calendarOriginDate !== null && selectedDate !== null) {
          const selectedCard = trigger.closest<HTMLElement>("[data-calendar-day-filter]");
          const selectedCardDate = selectedCard?.getAttribute("data-calendar-day-filter") ?? null;
          if (
            selectedDate !== calendarOriginDate
            || selectedCardDate === null
            || validateDailyJournalIsoDate(selectedCardDate) !== calendarOriginDate
          ) {
            throw new Error("The calendar action is detached from its selected day.");
          }
        }
        if (
          calendarOriginDate !== null
          && requestedDate !== null
          && calendarOriginDate !== requestedDate
        ) {
          throw new Error("Calendar and edit dates do not match.");
        }

        defaultDate = validateDailyJournalIsoDate(
          workspaceTodayIsoDate(snapshot.timeZone),
        );
        if (calendarOriginDate !== null && calendarOriginDate > defaultDate) {
          throw new Error("Future calendar dates cannot open daily reflections.");
        }

        const matches = requestedDate === null
          ? []
          : snapshot.dailyJournal.filter((candidate) => candidate.isoDate === requestedDate);
        if (requestedDate !== null && matches.length !== 1) {
          throw new Error("The requested daily reflection head is missing or ambiguous.");
        }
        entry = matches[0] ?? null;
        if (entry !== null) validateDailyJournalPreview(entry);

        if (isNew && calendarOriginDate !== null) {
          const existingCalendarHeads = snapshot.dailyJournal.filter(
            (candidate) => candidate.isoDate === calendarOriginDate,
          );
          if (existingCalendarHeads.length !== 0) {
            throw new Error("The calendar date already has a daily reflection head.");
          }
        }
        createDate = entry === null
          ? calendarOriginDate
            ?? newestAvailableDailyJournalDate(snapshot.dailyJournal, defaultDate)
          : defaultDate;
        sheetHtml = dailyJournalSheetTemplate(
          entry,
          snapshot,
          defaultDate,
          createDate,
          calendarOriginDate,
        );
      } catch {
        showOpenError();
        return;
      }
      const identityIsoDate = entry?.isoDate ?? calendarOriginDate;
      root.insertAdjacentHTML(
        "beforeend",
        sheetHtml,
      );
      const backdrop = root.querySelector<HTMLElement>("[data-daily-entry-backdrop]");
      const sheet = backdrop?.querySelector<HTMLElement>(".daily-journal-sheet");
      const form = backdrop?.querySelector<HTMLFormElement>("#daily-entry-form");
      const error = backdrop?.querySelector<HTMLElement>("#daily-entry-error");
      const status = backdrop?.querySelector<HTMLElement>("#daily-entry-status");
      const reconcile = backdrop?.querySelector<HTMLButtonElement>("#daily-entry-reconcile");
      const conflict = backdrop?.querySelector<HTMLElement>("#daily-entry-conflict");
      const conflictHeading = backdrop?.querySelector<HTMLElement>("#daily-entry-conflict-title");
      const latestEvidence = backdrop?.querySelector<HTMLElement>("#daily-entry-latest");
      const rebaseStatus = backdrop?.querySelector<HTMLElement>("#daily-entry-rebase-status");
      const reviewLatest = backdrop?.querySelector<HTMLButtonElement>("#daily-entry-review-latest");
      const acceptLatest = backdrop?.querySelector<HTMLButtonElement>("#daily-entry-accept-latest");
      const heading = backdrop?.querySelector<HTMLElement>("#daily-entry-title");
      if (
        backdrop === null || backdrop === undefined
        || sheet === null || sheet === undefined
        || form === null || form === undefined
        || error === null || error === undefined
        || status === null || status === undefined
        || reconcile === null || reconcile === undefined
        || conflict === null || conflict === undefined
        || conflictHeading === null || conflictHeading === undefined
        || latestEvidence === null || latestEvidence === undefined
        || rebaseStatus === null || rebaseStatus === undefined
        || reviewLatest === null || reviewLatest === undefined
        || acceptLatest === null || acceptLatest === undefined
        || heading === null || heading === undefined
      ) {
        backdrop?.remove();
        throw new Error("Daily reflection sheet could not be initialized.");
      }
      let submissionId = application.createDailyJournalSubmissionId();
      let expectedPreviousEntryId = entry?.entryVersionId ?? null;
      let expectedPreviousVersion = entry?.version ?? 0;
      const initialFingerprint = formFingerprint(form);
      let saving = false;
      let uncertain = false;
      let committed = false;
      let conflictPending = false;
      let saveBlocked = false;
      let reconciledDraftPending = false;
      let conflictIsoDate: string | null = null;
      let latestCandidate: DailyJournalPreview | null = null;
      let uncertainPrepared: PreparedDailyJournalEntry | null = null;
      let attemptedState: "draft" | "completed" = entry?.state ?? "draft";
      setBackgroundInert(true);
      heading.focus({ preventScroll: true });

      const controls = Array.from(backdrop.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
      >("input, textarea, button"));
      const initiallyDisabled = new Map(controls.map((control) => [control, control.disabled]));
      const submitButtons = Array.from(form.querySelectorAll<HTMLButtonElement>(
        "button[type=submit][data-daily-entry-state]",
      ));
      const setBusy = (busy: boolean) => {
        saving = busy;
        form.setAttribute("aria-busy", String(busy));
        controls.forEach((control) => {
          control.disabled = busy || (initiallyDisabled.get(control) ?? false);
        });
        if (!busy && (conflictPending || saveBlocked)) {
          submitButtons.forEach((button) => { button.disabled = true; });
        }
      };
      const showUncertainSave = (message: string) => {
        uncertain = true;
        saving = false;
        form.setAttribute("aria-busy", "false");
        reconcile.textContent = "Retry this exact save";
        reconcile.hidden = false;
        reconcile.disabled = false;
        error.hidden = false;
        error.textContent = message;
        status.textContent = "Daily reflection save status is still uncertain";
        error.focus({ preventScroll: true });
      };
      const showCommittedRefreshFailure = () => {
        uncertain = true;
        saving = false;
        form.setAttribute("aria-busy", "false");
        reconcile.textContent = "Retry journal refresh";
        reconcile.hidden = false;
        reconcile.disabled = false;
        error.hidden = false;
        error.textContent = "This daily reflection is saved on this device, but the journal screen could not refresh. Do not save it again. Retry the journal refresh or restart Hermes before editing this date.";
        status.textContent = "Daily reflection saved but journal refresh still failed";
        error.focus({ preventScroll: true });
      };
      const showStaleConflict = (isoDate: string) => {
        committed = false;
        uncertain = false;
        uncertainPrepared = null;
        conflictPending = true;
        reconciledDraftPending = false;
        conflictIsoDate = isoDate;
        latestCandidate = null;
        latestEvidence.replaceChildren();
        latestEvidence.hidden = true;
        rebaseStatus.hidden = true;
        reviewLatest.hidden = false;
        acceptLatest.hidden = true;
        reconcile.hidden = true;
        const dateInput = form.querySelector<HTMLInputElement>("#daily-entry-date");
        if (dateInput !== null) {
          dateInput.readOnly = true;
          const descriptions = new Set(
            (dateInput.getAttribute("aria-describedby") ?? "")
              .split(/\s+/u)
              .filter((value) => value.length > 0),
          );
          descriptions.add("daily-entry-conflict-copy");
          dateInput.setAttribute("aria-describedby", [...descriptions].join(" "));
        }
        conflict.hidden = false;
        setBusy(false);
        error.hidden = false;
        error.textContent = "Hermes did not apply this exact save because its expected saved version no longer matches. Nothing was overwritten, and your unsaved changes are still here. Review the latest saved version before saving again.";
        status.textContent = "Daily reflection was not saved because its expected version did not match";
        error.focus({ preventScroll: true });
      };
      const showBlockedSave = () => {
        committed = false;
        uncertain = false;
        uncertainPrepared = null;
        saveBlocked = true;
        reconcile.hidden = true;
        setBusy(false);
        error.hidden = false;
        error.textContent = "Hermes could not safely apply this prepared save to the current journal. Your unsaved changes are still here. Cancel and reopen the reflection before trying again.";
        status.textContent = "Daily reflection was not saved; reopen it before retrying";
        error.focus({ preventScroll: true });
      };
      backdrop.querySelectorAll<HTMLElement>("[data-daily-count]").forEach((counter) => {
        const inputId = counter.dataset.dailyCount;
        const limit = Number(counter.dataset.dailyLimit);
        const input = inputId === undefined
          ? null
          : form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${inputId}`);
        if (input === null || !Number.isSafeInteger(limit)) return;
        const update = () => {
          const count = Array.from(input.value.normalize("NFC")).length;
          counter.textContent = `${count.toLocaleString("en-US")} / ${limit.toLocaleString("en-US")} characters`;
          counter.classList.toggle("limit-exceeded", count > limit);
        };
        input.addEventListener("input", update);
        update();
      });
      const close = (force = false) => {
        if (saving || uncertain) return;
        if (
          !force
          && (
            formFingerprint(form) !== initialFingerprint
            || conflictPending
            || saveBlocked
            || reconciledDraftPending
          )
          && !window.confirm("Discard the unsaved daily reflection?")
        ) return;
        backdrop.remove();
        setBackgroundInert(false);
        if (trigger.isConnected) trigger.focus();
        else focusAfterDailyJournalRefresh(root, calendarOriginDate);
      };

      backdrop.querySelectorAll<HTMLButtonElement>("[data-daily-entry-close]")
        .forEach((button) => button.addEventListener("click", () => close()));
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) close();
      });
      sheet.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          close();
          return;
        }
        trapFocus(sheet, event);
      });
      reconcile.addEventListener("click", async () => {
        if (saving) return;
        sheet.focus({ preventScroll: true });
        setBusy(true);
        error.hidden = true;
        if (committed) {
          status.textContent = "Reloading the confirmed saved daily reflection";
          try {
            await refresh("Journal reloaded after the saved daily reflection could not refresh.");
            backdrop.remove();
            setBackgroundInert(false);
            focusAfterDailyJournalRefresh(root, calendarOriginDate);
          } catch {
            showCommittedRefreshFailure();
          }
          return;
        }

        const prepared = uncertainPrepared;
        if (prepared === null) {
          saving = false;
          form.setAttribute("aria-busy", "false");
          reconcile.disabled = true;
          error.hidden = false;
          error.textContent = "Hermes cannot safely retry this save because its exact prepared command is unavailable. Your draft remains frozen here. Keep this sheet open and do not create another reflection for this date.";
          status.textContent = "Exact daily reflection save command is unavailable";
          error.focus({ preventScroll: true });
          return;
        }

        status.textContent = "Retrying the exact daily reflection save on device";
        try {
          await application.commitDailyJournalSafely(prepared);
          committed = true;
          uncertainPrepared = null;
        } catch (caught) {
          const failureKind = dailyJournalSaveFailureKind(caught);
          if (failureKind === "stale") {
            showStaleConflict(prepared.isoDate);
            return;
          }
          showUncertainSave(failureKind === "blocked"
            ? "Hermes could not safely prove whether this exact save committed. The form remains locked and the outcome is still unknown. Keep this sheet open and retry the same save when the device is ready."
            : "Hermes still could not confirm this exact save. The form remains locked and the outcome is still unknown. Keep this sheet open and retry the same save when the device is ready.");
          return;
        }

        status.textContent = "Exact daily reflection save confirmed; refreshing journal";
        try {
          await refresh("Journal reloaded after confirming the exact daily reflection save.");
          backdrop.remove();
          setBackgroundInert(false);
          focusAfterDailyJournalRefresh(root, calendarOriginDate);
        } catch {
          showCommittedRefreshFailure();
        }
      });
      reviewLatest.addEventListener("click", async () => {
        if (!conflictPending || conflictIsoDate === null || uncertain || saving) return;
        const preservedValues = new Map([
          "daily-entry-date",
          "daily-entry-headline",
          "daily-entry-note",
          "daily-entry-emotion",
          "daily-entry-score",
          "daily-entry-tags",
        ].map((id) => [id, inputValue(form, id)]));
        const restorePreservedValues = () => {
          preservedValues.forEach((value, id) => {
            const control = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#${id}`);
            if (control === null) return;
            control.value = id === "daily-entry-date" && identityIsoDate !== null
              ? identityIsoDate
              : value;
            control.dispatchEvent(new Event("input"));
          });
        };
        conflictHeading.focus({ preventScroll: true });
        setBusy(true);
        status.textContent = "Loading the latest saved daily reflection for comparison";
        error.hidden = true;
        try {
          const fresh = await refresh(
            "Journal refreshed; checking the latest saved daily reflection.",
          );
          restorePreservedValues();
          const latest = dailyJournalReconciliationHead(
            fresh,
            conflictIsoDate,
            expectedPreviousEntryId,
            expectedPreviousVersion,
          );
          if (latest === null) {
            throw new Error("A different newer local head was not available.");
          }
          latestEvidence.innerHTML = dailyJournalLatestVersionTemplate(latest);
          latestEvidence.hidden = false;
          latestCandidate = latest;
          reviewLatest.hidden = true;
          acceptLatest.hidden = false;
          rebaseStatus.hidden = true;
          setBusy(false);
          status.textContent = `Latest saved version ${latest.version} loaded; your unsaved text is unchanged`;
          latestEvidence.focus({ preventScroll: true });
        } catch {
          restorePreservedValues();
          latestCandidate = null;
          latestEvidence.replaceChildren();
          latestEvidence.hidden = true;
          reviewLatest.hidden = false;
          acceptLatest.hidden = true;
          setBusy(false);
          error.hidden = false;
          error.textContent = "Hermes could not prove a different newer saved version for this date. Your unsaved changes are still here. Keep this sheet open and retry the review. Cancel discards this draft.";
          status.textContent = "Latest saved daily reflection could not be verified";
          error.focus({ preventScroll: true });
        }
      });
      acceptLatest.addEventListener("click", () => {
        if (!conflictPending || latestCandidate === null || saving || uncertain) return;
        expectedPreviousEntryId = latestCandidate.entryVersionId;
        expectedPreviousVersion = latestCandidate.version;
        submissionId = application.createDailyJournalSubmissionId();
        conflictPending = false;
        reconciledDraftPending = true;
        reviewLatest.hidden = true;
        acceptLatest.hidden = true;
        rebaseStatus.hidden = false;
        rebaseStatus.textContent = `Version ${expectedPreviousVersion} is now the base. Your form still contains your unsaved changes. Choose a save action to append version ${expectedPreviousVersion + 1}.`;
        error.hidden = true;
        setBusy(false);
        status.textContent = `Latest saved version ${expectedPreviousVersion} accepted as the base; choose a save action`;
        const intendedSubmit = submitButtons.find((button) => (
          button.dataset.dailyEntryState === attemptedState
        ));
        intendedSubmit?.focus({ preventScroll: true });
      });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (saving || uncertain || conflictPending || saveBlocked) return;
        const submitter = (event as SubmitEvent).submitter;
        const state = submitter instanceof HTMLButtonElement
          && submitter.dataset.dailyEntryState === "completed"
          ? "completed" as const
          : "draft" as const;
        attemptedState = state;
        error.hidden = true;
        uncertainPrepared = null;
        const scoreText = inputValue(form, "daily-entry-score").trim();
        const isoDateForSave = identityIsoDate
          ?? inputValue(form, "daily-entry-date");
        try {
          const prepared = application.prepareDailyJournal({
            submissionId,
            isoDate: isoDateForSave,
            expectedPreviousEntryId,
            state,
            title: inputValue(form, "daily-entry-headline"),
            note: inputValue(form, "daily-entry-note"),
            emotion: inputValue(form, "daily-entry-emotion"),
            processScorePct: scoreText.length === 0 ? null : Number(scoreText),
            tags: parseDailyJournalTags(inputValue(form, "daily-entry-tags")),
          });
          uncertainPrepared = prepared;
          sheet.focus({ preventScroll: true });
          setBusy(true);
          status.textContent = "Saving daily reflection on device";
          await application.commitDailyJournalSafely(prepared);
          committed = true;
          uncertainPrepared = null;
          status.textContent = "Daily reflection saved; refreshing journal";
          try {
            await refresh(`Daily reflection for ${longDateLabel(prepared.isoDate)} saved on device.`);
          } catch {
            showCommittedRefreshFailure();
            return;
          }
          saving = false;
          backdrop.remove();
          setBackgroundInert(false);
          focusAfterDailyJournalRefresh(root, calendarOriginDate);
        } catch (caught) {
          const failureKind = dailyJournalSaveFailureKind(caught);
          if (failureKind === "uncertain") {
            showUncertainSave(caught instanceof DailyJournalCommitStatusUncertainError
              ? caught.message
              : "Hermes could not confirm whether this exact daily reflection save committed. The form is locked here. Retry this exact save to reuse the same save identity; do not create another reflection for this date.");
            return;
          }
          if (failureKind === "stale") {
            showStaleConflict(isoDateForSave);
            return;
          }
          if (failureKind === "blocked") {
            showBlockedSave();
            return;
          }
          uncertainPrepared = null;
          setBusy(false);
          error.hidden = false;
          error.textContent = caught instanceof DailyJournalPreparationError
            ? caught.message
            : "Hermes could not prepare or save this daily reflection. Your unsaved changes are still here. Review the form and try again.";
          status.textContent = "Daily reflection was not saved";
          error.focus();
        }
      });
    });
  });
}
