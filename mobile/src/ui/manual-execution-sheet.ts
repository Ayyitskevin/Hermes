import {
  type JournalApplication,
  ManualExecutionCommitStatusUncertainError,
} from "../application/journal-application";
import type { ManualExecutionCommitResult } from "../application/journal-store";
import type { PreparedManualExecution } from "../application/prepare-manual-execution";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot } from "../core/types";

export function manualExecutionAction(label = "Add execution"): string {
  return `<button class="primary-button" type="button" data-manual-execution>${escapeHtml(label)}</button>`;
}

export function manualCaptureCard(): string {
  return `<article class="card manual-capture-card">
    <p class="card-label">QUICK CAPTURE</p>
    <h2>Add one execution</h2>
    <p>Record a fill in under a minute. Hermes reviews the exact values before one atomic on-device save.</p>
    ${manualExecutionAction("Enter execution")}
  </article>`;
}

function localDateTimeValue(timeZone: string, date = new Date()): string {
  const parts = new Map(
    new Intl.DateTimeFormat("en-CA-u-ca-iso8601-hc-h23-nu-latn", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  return `${parts.get("year")}-${parts.get("month")}-${parts.get("day")}T${parts.get("hour")}:${parts.get("minute")}`;
}

function sheetTemplate(
  snapshot: JournalWorkspaceSnapshot,
  accountNames: readonly string[],
): string {
  const accountValue = accountNames.length === 1 ? accountNames[0] ?? "" : "";
  const lockWorkspace = snapshot.provenance === "local";
  return `<div class="sheet-backdrop manual-entry-backdrop" id="manual-entry" data-manual-backdrop>
    <section class="settings-sheet manual-entry-sheet" role="dialog" aria-modal="true" aria-labelledby="manual-entry-title">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-heading">
        <div><p class="eyebrow">OFFLINE · EXACT VALUES</p><h2 id="manual-entry-title">Add execution</h2></div>
        <button class="icon-button" type="button" data-manual-close aria-label="Close manual entry">×</button>
      </div>
      <p class="helper-text">Hermes stores one immutable fill, then rebuilds trades and reports from the complete ledger. Nothing is sent to a broker.</p>
      <form id="manual-entry-form" novalidate>
        <datalist id="manual-account-options">
          ${accountNames.map((name) => `<option value="${escapeHtml(name)}"></option>`).join("")}
        </datalist>
        <div class="field-grid">
          <label>Account name<input id="manual-account" name="account" type="text" maxlength="256" list="manual-account-options" value="${escapeHtml(accountValue)}" placeholder="e.g. Brokerage" autocomplete="off" required /></label>
          <label>Symbol<input id="manual-symbol" name="symbol" type="text" maxlength="32" autocapitalize="characters" autocomplete="off" placeholder="AAPL" required /></label>
          <label>Asset class<select id="manual-asset-class" name="assetClass"><option value="stock">Stock</option><option value="etf">ETF</option></select></label>
          <label>Side<select id="manual-side" name="side"><option value="BUY">Buy</option><option value="SELL">Sell</option></select></label>
          <label>Position effect<select id="manual-position-effect" name="positionEffect"><option value="AUTO">Automatic</option><option value="OPEN">Open</option><option value="CLOSE">Close</option></select></label>
          <label>Quantity<input id="manual-quantity" name="quantity" type="text" inputmode="decimal" autocomplete="off" placeholder="1" required /></label>
          <label>Price<input id="manual-price" name="price" type="text" inputmode="decimal" autocomplete="off" placeholder="100.00" required /></label>
          <label>Commission + fees<input id="manual-fee" name="fee" type="text" inputmode="decimal" autocomplete="off" value="0" required /></label>
          <label>Execution time<input id="manual-executed-at" name="executedAt" type="datetime-local" step="1" value="${escapeHtml(localDateTimeValue(snapshot.timeZone))}" required /></label>
          <label>UTC offset, if needed<input id="manual-utc-offset" name="utcOffset" type="text" inputmode="text" maxlength="6" placeholder="-04:00" autocomplete="off" /></label>
          <label>Time zone<input id="manual-time-zone" name="timeZone" type="text" maxlength="100" value="${escapeHtml(snapshot.timeZone)}" autocomplete="off" ${lockWorkspace ? "readonly" : ""} required /></label>
          <label>Workspace currency<input id="manual-currency" name="currency" type="text" maxlength="3" value="${escapeHtml(snapshot.currencyCode)}" autocapitalize="characters" ${lockWorkspace ? "readonly" : ""} required /></label>
        </div>
        <p class="helper-text">The IANA time zone resolves local time. Add a UTC offset only when a daylight-saving clock hour occurs twice.</p>
        <p class="form-error" id="manual-entry-error" role="alert" tabindex="-1" hidden></p>
        <div class="quick-actions">
          <button class="secondary-button" type="button" data-manual-close>Cancel</button>
          <button class="primary-button" type="submit">Review execution</button>
        </div>
      </form>
      <section id="manual-entry-review" class="manual-entry-review" aria-labelledby="manual-review-title" hidden>
        <div><p class="card-label">CONFIRM IMMUTABLE SOURCE FACT</p><h3 id="manual-review-title">Review before saving</h3></div>
        <dl class="execution-grid" id="manual-review-values"></dl>
        <p class="helper-text">Saving creates a source fact and a new deterministic projection generation. Editing and voiding arrive in a later reviewed slice.</p>
        <p class="form-error" id="manual-save-error" role="alert" tabindex="-1" hidden></p>
        <div class="quick-actions">
          <button class="secondary-button" id="manual-review-back" type="button">Back</button>
          <button class="primary-button" id="manual-save" type="button">Save execution</button>
        </div>
      </section>
    </section>
  </div>`;
}

function reviewTemplate(prepared: PreparedManualExecution): string {
  const values: ReadonlyArray<readonly [string, string]> = [
    ["Account", prepared.accountName],
    ["Instrument", `${prepared.symbol} · ${prepared.assetClass.toLocaleUpperCase("en-US")}`],
    ["Action", `${prepared.side} · ${prepared.positionEffect}`],
    ["Quantity", prepared.quantity],
    ["Price", `${prepared.price} ${prepared.defaultCurrency}`],
    ["Fees", `${prepared.fee} ${prepared.defaultCurrency}`],
    ["Executed", prepared.executedAt],
  ];
  return values.map(([label, value]) => (
    `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
  )).join("");
}

function trapFocus(container: HTMLElement, event: KeyboardEvent): void {
  if (event.key !== "Tab") return;
  const focusable = Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hidden && element.getClientRects().length > 0);
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!first || !last) return;
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

export function bindManualExecutionActions(
  root: HTMLElement,
  application: JournalApplication,
  snapshot: JournalWorkspaceSnapshot,
  setBackgroundInert: (inert: boolean) => void,
  refresh: (announcement: string) => Promise<void>,
): void {
  if (snapshot.provenance === "demo") return;
  root.querySelectorAll<HTMLButtonElement>("[data-manual-execution]").forEach((trigger) => {
    trigger.addEventListener("click", async () => {
      trigger.disabled = true;
      let accountNames: readonly string[];
      try {
        accountNames = await application.loadAccountNames();
      } catch (error) {
        trigger.disabled = false;
        window.alert(error instanceof Error ? error.message : "Could not load journal accounts.");
        return;
      }
      const returnFocus = trigger;
      root.querySelector("#manual-entry")?.remove();
      root.querySelector(".app-shell")?.insertAdjacentHTML(
        "beforeend",
        sheetTemplate(snapshot, accountNames),
      );
      const backdrop = root.querySelector<HTMLElement>("#manual-entry");
      const sheet = backdrop?.querySelector<HTMLElement>(".manual-entry-sheet");
      const form = backdrop?.querySelector<HTMLFormElement>("#manual-entry-form");
      const review = backdrop?.querySelector<HTMLElement>("#manual-entry-review");
      const reviewValues = backdrop?.querySelector<HTMLElement>("#manual-review-values");
      const prepareError = backdrop?.querySelector<HTMLElement>("#manual-entry-error");
      const saveError = backdrop?.querySelector<HTMLElement>("#manual-save-error");
      const save = backdrop?.querySelector<HTMLButtonElement>("#manual-save");
      const back = backdrop?.querySelector<HTMLButtonElement>("#manual-review-back");
      if (!backdrop || !sheet || !form || !review || !reviewValues || !prepareError || !saveError || !save || !back) {
        backdrop?.remove();
        trigger.disabled = false;
        return;
      }
      setBackgroundInert(true);
      let prepared: PreparedManualExecution | null = null;
      let saving = false;
      let statusUncertain = false;
      const submissionId = application.createManualSubmissionId();

      const close = () => {
        if (saving || statusUncertain) return;
        backdrop.remove();
        setBackgroundInert(false);
        returnFocus.disabled = false;
        returnFocus.focus();
      };
      const setSaving = (value: boolean) => {
        saving = value;
        sheet.setAttribute("aria-busy", String(value));
        backdrop.querySelectorAll<HTMLButtonElement>("[data-manual-close]").forEach((button) => {
          button.disabled = value || statusUncertain;
        });
        save.disabled = value;
        back.disabled = value || statusUncertain;
      };
      backdrop.querySelectorAll<HTMLButtonElement>("[data-manual-close]").forEach((button) => {
        button.addEventListener("click", close);
      });
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
      back.addEventListener("click", () => {
        prepared = null;
        review.hidden = true;
        form.hidden = false;
        saveError.hidden = true;
        form.querySelector<HTMLInputElement>("#manual-symbol")?.focus();
      });
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = (id: string) => (
          form.querySelector<HTMLInputElement | HTMLSelectElement>(`#${id}`)?.value ?? ""
        );
        try {
          const localExecutedAt = value("manual-executed-at");
          const utcOffset = value("manual-utc-offset").trim();
          prepared = application.prepareManual({
            submissionId,
            accountName: value("manual-account").trim(),
            timeZone: value("manual-time-zone").trim(),
            defaultCurrency: value("manual-currency").trim().toLocaleUpperCase("en-US"),
            symbol: value("manual-symbol"),
            assetClass: value("manual-asset-class") === "etf" ? "etf" : "stock",
            side: value("manual-side") === "SELL" ? "SELL" : "BUY",
            positionEffect: value("manual-position-effect") === "OPEN"
              ? "OPEN"
              : value("manual-position-effect") === "CLOSE" ? "CLOSE" : "AUTO",
            quantity: value("manual-quantity"),
            price: value("manual-price"),
            fee: value("manual-fee"),
            executedAt: utcOffset.length === 0 ? localExecutedAt : `${localExecutedAt}${utcOffset}`,
          });
          prepareError.hidden = true;
          reviewValues.innerHTML = reviewTemplate(prepared);
          form.hidden = true;
          review.hidden = false;
          review.querySelector<HTMLElement>("#manual-review-title")?.focus();
          save.focus();
        } catch (error) {
          prepareError.textContent = error instanceof Error ? error.message : "Check the execution values.";
          prepareError.hidden = false;
          prepareError.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
          prepareError.focus({ preventScroll: true });
        }
      });
      save.addEventListener("click", async () => {
        if (prepared === null) return;
        setSaving(true);
        saveError.hidden = true;
        let result: ManualExecutionCommitResult;
        try {
          result = await application.commitManualSafely(prepared);
        } catch (error) {
          statusUncertain = error instanceof ManualExecutionCommitStatusUncertainError;
          setSaving(false);
          saveError.hidden = false;
          saveError.textContent = error instanceof Error ? error.message : "The execution was not saved.";
          if (statusUncertain) {
            save.textContent = "Check save status";
          } else {
            save.textContent = "Save execution";
          }
          saveError.focus();
          return;
        }
        const announcement = result.outcome === "duplicate"
          ? "This execution was already saved; no duplicate was created."
          : `${prepared.side === "BUY" ? "Buy" : "Sell"} execution for ${prepared.symbol} saved on device.`;
        backdrop.remove();
        setBackgroundInert(false);
        returnFocus.disabled = false;
        try {
          await refresh(announcement);
          root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
        } catch (error) {
          returnFocus.focus();
          window.alert(
            error instanceof Error
              ? `The execution was saved, but the journal could not refresh: ${error.message}`
              : "The execution was saved, but the journal could not refresh.",
          );
          return;
        }
        try {
          await application.acknowledgeManualExecution(prepared.submissionId);
        } catch (error) {
          window.alert(
            error instanceof Error
              ? `The execution is visible, but its save confirmation remains pending: ${error.message}`
              : "The execution is visible, but its save confirmation remains pending.",
          );
        }
      });
      backdrop.querySelector<HTMLElement>("#manual-entry-title")?.setAttribute("tabindex", "-1");
      backdrop.querySelector<HTMLElement>("#manual-entry-title")?.focus();
    });
  });
}
