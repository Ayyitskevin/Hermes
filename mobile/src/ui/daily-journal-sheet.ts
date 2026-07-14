import {
  DailyJournalCommitStatusUncertainError,
  JournalApplication,
} from "../application/journal-application";
import { escapeHtml } from "../core/html";
import type { DailyJournalPreview, JournalWorkspaceSnapshot } from "../core/types";

type SaveFailureKind = "uncertain" | "retryable";

export function dailyJournalSaveFailureKind(error: unknown): SaveFailureKind {
  return error instanceof DailyJournalCommitStatusUncertainError
    ? "uncertain"
    : "retryable";
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
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${isoDate}T12:00:00.000Z`));
}

export function dailyJournalAction(
  entry: DailyJournalPreview | null,
  label?: string,
): string {
  if (entry === null) {
    return `<button class="primary-button" type="button" data-daily-entry-new>${escapeHtml(label ?? "Write daily reflection")}</button>`;
  }
  return `<button class="secondary-button" type="button" data-daily-entry-edit="${escapeHtml(entry.isoDate)}" aria-label="Edit daily reflection for ${escapeHtml(longDateLabel(entry.isoDate))}">${escapeHtml(label ?? "Edit reflection")}</button>`;
}

export function dailyJournalSheetTemplate(
  entry: DailyJournalPreview | null,
  snapshot: JournalWorkspaceSnapshot,
  defaultDate = workspaceTodayIsoDate(snapshot.timeZone),
  createDate = defaultDate,
): string {
  const isoDate = entry?.isoDate ?? createDate;
  const edit = entry !== null;
  const title = entry?.title ?? "";
  const note = entry?.note ?? "";
  const emotion = entry?.emotion ?? "";
  const score = entry?.processScorePct === null || entry?.processScorePct === undefined
    ? ""
    : String(entry.processScorePct);
  const tags = entry?.tags.join(", ") ?? "";
  return `<div class="sheet-backdrop daily-journal-backdrop" data-daily-entry-backdrop>
    <section class="settings-sheet daily-journal-sheet" role="dialog" aria-modal="true" aria-labelledby="daily-entry-title">
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
            min="1970-01-01" max="${escapeHtml(defaultDate)}" value="${escapeHtml(isoDate)}"
            ${edit ? 'readonly aria-describedby="daily-entry-date-hint"' : ""} required />
        </label>
        ${edit ? '<p class="field-hint" id="daily-entry-date-hint">The date is part of this entry’s durable identity and cannot be changed.</p>' : ""}
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
        <button class="secondary-button" id="daily-entry-reconcile" type="button" hidden>Reload journal and reconcile</button>
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
  )).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
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

export function bindDailyJournalActions(
  root: HTMLElement,
  application: JournalApplication,
  snapshot: JournalWorkspaceSnapshot,
  setBackgroundInert: (inert: boolean) => void,
  refresh: (announcement: string) => Promise<void>,
): void {
  if (snapshot.provenance !== "local") return;
  const triggers = root.querySelectorAll<HTMLButtonElement>(
    "[data-daily-entry-new], [data-daily-entry-edit]",
  );
  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const requestedDate = trigger.dataset.dailyEntryEdit;
      const entry = requestedDate === undefined
        ? null
        : snapshot.dailyJournal.find((candidate) => candidate.isoDate === requestedDate) ?? null;
      if (requestedDate !== undefined && entry === null) return;
      const defaultDate = workspaceTodayIsoDate(snapshot.timeZone);
      const createDate = entry === null
        ? newestAvailableDailyJournalDate(snapshot.dailyJournal, defaultDate)
        : defaultDate;
      root.insertAdjacentHTML(
        "beforeend",
        dailyJournalSheetTemplate(entry, snapshot, defaultDate, createDate),
      );
      const backdrop = root.querySelector<HTMLElement>("[data-daily-entry-backdrop]");
      const sheet = backdrop?.querySelector<HTMLElement>(".daily-journal-sheet");
      const form = backdrop?.querySelector<HTMLFormElement>("#daily-entry-form");
      const error = backdrop?.querySelector<HTMLElement>("#daily-entry-error");
      const status = backdrop?.querySelector<HTMLElement>("#daily-entry-status");
      const reconcile = backdrop?.querySelector<HTMLButtonElement>("#daily-entry-reconcile");
      const heading = backdrop?.querySelector<HTMLElement>("#daily-entry-title");
      if (
        backdrop === null || backdrop === undefined
        || sheet === null || sheet === undefined
        || form === null || form === undefined
        || error === null || error === undefined
        || status === null || status === undefined
        || reconcile === null || reconcile === undefined
        || heading === null || heading === undefined
      ) {
        backdrop?.remove();
        throw new Error("Daily reflection sheet could not be initialized.");
      }
      const submissionId = application.createDailyJournalSubmissionId();
      const initialFingerprint = formFingerprint(form);
      let saving = false;
      let uncertain = false;
      let committed = false;
      setBackgroundInert(true);
      heading.focus({ preventScroll: true });

      const controls = Array.from(backdrop.querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLButtonElement
      >("input, textarea, button"));
      const initiallyDisabled = new Map(controls.map((control) => [control, control.disabled]));
      const setBusy = (busy: boolean) => {
        saving = busy;
        form.setAttribute("aria-busy", String(busy));
        controls.forEach((control) => {
          control.disabled = busy || (initiallyDisabled.get(control) ?? false);
        });
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
          && formFingerprint(form) !== initialFingerprint
          && !window.confirm("Discard the unsaved daily reflection?")
        ) return;
        backdrop.remove();
        setBackgroundInert(false);
        trigger.focus();
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
        reconcile.disabled = true;
        status.textContent = committed
          ? "Reloading the saved daily reflection"
          : "Reconciling uncertain daily reflection save";
        try {
          await refresh(committed
            ? "Journal reloaded after the saved daily reflection could not refresh."
            : "Journal reloaded after reconciling an uncertain daily reflection save.");
          backdrop.remove();
          setBackgroundInert(false);
          root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
        } catch (caught) {
          reconcile.disabled = false;
          const detail = caught instanceof Error ? ` ${caught.message}` : "";
          error.hidden = false;
          error.textContent = committed
            ? `The daily reflection is saved, but the journal still could not reload. Retry reload or restart Hermes before editing again.${detail}`
            : `Daily reflection status is still uncertain. Retry reload or restart Hermes; do not re-enter it.${detail}`;
          status.textContent = committed
            ? "Daily reflection saved but journal reload still failed"
            : "Daily reflection save status is still uncertain";
          error.focus();
        }
      });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (saving || uncertain) return;
        const submitter = (event as SubmitEvent).submitter;
        const state = submitter instanceof HTMLButtonElement
          && submitter.dataset.dailyEntryState === "completed"
          ? "completed" as const
          : "draft" as const;
        error.hidden = true;
        const scoreText = inputValue(form, "daily-entry-score").trim();
        try {
          const prepared = application.prepareDailyJournal({
            submissionId,
            isoDate: inputValue(form, "daily-entry-date"),
            expectedPreviousEntryId: entry?.entryVersionId ?? null,
            state,
            title: inputValue(form, "daily-entry-headline"),
            note: inputValue(form, "daily-entry-note"),
            emotion: inputValue(form, "daily-entry-emotion"),
            processScorePct: scoreText.length === 0 ? null : Number(scoreText),
            tags: parseDailyJournalTags(inputValue(form, "daily-entry-tags")),
          });
          setBusy(true);
          status.textContent = "Saving daily reflection on device";
          await application.commitDailyJournalSafely(prepared);
          committed = true;
          status.textContent = "Daily reflection saved; refreshing journal";
          try {
            await refresh(`Daily reflection for ${longDateLabel(prepared.isoDate)} saved on device.`);
          } catch (refreshError) {
            uncertain = true;
            saving = false;
            form.setAttribute("aria-busy", "false");
            reconcile.hidden = false;
            reconcile.disabled = false;
            error.hidden = false;
            const detail = refreshError instanceof Error ? ` ${refreshError.message}` : "";
            error.textContent = `The daily reflection was saved, but the screen could not refresh. Reload the journal before continuing.${detail}`;
            status.textContent = "Daily reflection saved but journal refresh failed";
            error.focus();
            return;
          }
          saving = false;
          backdrop.remove();
          setBackgroundInert(false);
          root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
        } catch (caught) {
          if (dailyJournalSaveFailureKind(caught) === "uncertain") {
            uncertain = true;
            saving = false;
            form.setAttribute("aria-busy", "false");
            reconcile.hidden = false;
            reconcile.disabled = false;
            error.hidden = false;
            error.textContent = caught instanceof Error
              ? caught.message
              : "Daily reflection save status is uncertain.";
            status.textContent = "Daily reflection save status is uncertain";
            error.focus();
            return;
          }
          setBusy(false);
          error.hidden = false;
          error.textContent = caught instanceof Error
            ? caught.message
            : "Daily reflection could not be saved.";
          status.textContent = "Daily reflection was not saved";
          error.focus();
        }
      });
    });
  });
}
