import {
  TradeReviewCommitStatusUncertainError,
  type JournalApplication,
} from "../application/journal-application";
import {
  TradeReviewPreparationError,
  type TradeReviewRuleInput,
} from "../application/prepare-trade-review";
import {
  JournalTradeReviewError,
  type PreparedTradeReviewBatch,
  type TradeReviewCommitResult,
} from "../application/journal-store";
import { escapeHtml } from "../core/html";
import type { TradeMetricEvidence } from "../core/trade-metrics";
import type { JournalWorkspaceSnapshot, TradePreview } from "../core/types";

const METRIC_REASON: Readonly<Record<NonNullable<TradeMetricEvidence["nullReason"]>, string>> = {
  no_realized_exit: "No realized exit exists yet.",
  missing_initial_risk: "Add user-confirmed initial risk to calculate R.",
  currency_mismatch: "The numerator and denominator use different currencies.",
  unsupported_asset: "This formula supports stock and ETF trades only.",
  invalid_denominator: "The metric denominator must be positive.",
};

function assetClassLabel(trade: TradePreview): "Stock" | "ETF" {
  return trade.assetClass === "etf" ? "ETF" : "Stock";
}

export function reviewTradeAction(trade: TradePreview, label?: string): string {
  const action = label ?? (trade.reviewStatus === "pending" ? "Review trade" : "Edit review");
  const accessibleName = `${action} for ${trade.symbol} ${assetClassLabel(trade)}, ${trade.sessionLabel}`;
  return `<button class="secondary-button" type="button" data-review-trade="${escapeHtml(trade.tradeSubjectId)}" aria-label="${escapeHtml(accessibleName)}">${escapeHtml(action)}</button>`;
}

export function parseReviewList(value: string): readonly string[] {
  return value
    .split(/[\n,]/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function tradeReviewSaveFailureKind(
  error: unknown,
): "uncertain" | "stale" | "blocked" | "retryable" {
  if (error instanceof TradeReviewCommitStatusUncertainError) return "uncertain";
  if (
    error instanceof JournalTradeReviewError
    && error.conflict.code === "review_changed"
  ) return "stale";
  if (error instanceof JournalTradeReviewError) return "blocked";
  return "retryable";
}

function metricValue(metric: TradeMetricEvidence): string {
  if (metric.value === null) return METRIC_REASON[metric.nullReason];
  return metric.metric === "result-r" ? `${metric.value}R` : `${metric.value}%`;
}

function metricEvidenceTemplate(metric: TradeMetricEvidence): string {
  const label = metric.metric === "result-r" ? "Result R" : "Percent return";
  const numerator = metric.numerator === null
    ? "No realized P&L"
    : `${metric.numerator.amount} ${metric.numerator.currency}`;
  const denominator = metric.denominator === null
    ? "Not available"
    : `${metric.denominator.amount} ${metric.denominator.currency}`;
  const scale = metric.scaleFactor === "100" ? " × 100" : "";
  return `<article class="review-metric ${metric.value === null ? "unavailable" : ""}">
    <p class="card-label">${escapeHtml(label.toLocaleUpperCase("en-US"))}</p>
    <strong>${escapeHtml(metricValue(metric))}</strong>
    <span>${escapeHtml(numerator)} ÷ ${escapeHtml(denominator)}${scale}</span>
    <small>${escapeHtml(metric.definitionVersion)} · ${metric.fractionDigits} digits · ${escapeHtml(metric.roundingMode)}${metric.isPartial ? " · partial exit" : ""}</small>
  </article>`;
}

function tradePnlCurrency(
  trade: TradePreview,
  snapshot: JournalWorkspaceSnapshot,
): string {
  return trade.resultRMetric.numerator?.currency
    ?? trade.percentReturnMetric.numerator?.currency
    ?? trade.percentReturnMetric.denominator?.currency
    ?? trade.initialRisk?.currency
    ?? snapshot.currencyCode;
}

function savedRiskCurrency(
  trade: TradePreview,
  snapshot: JournalWorkspaceSnapshot,
): string {
  return trade.initialRisk?.currency
    ?? trade.resultRMetric.denominator?.currency
    ?? tradePnlCurrency(trade, snapshot);
}

function currencyOptions(current: string, pnlCurrency: string): string {
  return [...new Set([current, pnlCurrency])]
    .map((currency) => `<option value="${escapeHtml(currency)}"${selected(current, currency)}>${escapeHtml(currency)}</option>`)
    .join("");
}

function executionTemplate(trade: TradePreview): string {
  if (trade.executions.length === 0) {
    return `<p class="helper-text">No execution allocations are available for inspection.</p>`;
  }
  return `<div class="review-execution-list">
    ${trade.executions.map((execution) => `<article class="review-execution-row">
      <div><span class="status-chip">${escapeHtml(execution.effect)}</span><strong>${escapeHtml(execution.side.toLocaleUpperCase("en-US"))} ${escapeHtml(execution.quantity)}</strong></div>
      <div class="numeric"><strong>${escapeHtml(execution.price)} ${escapeHtml(execution.currency)}</strong><span>${escapeHtml(execution.occurredAt)}</span></div>
      <small>Fee ${escapeHtml(execution.fee)} ${escapeHtml(execution.currency)} · immutable allocation ${escapeHtml(execution.allocationId.slice(0, 12))}</small>
    </article>`).join("")}
  </div>`;
}

function selected(value: string, candidate: string): string {
  return value === candidate ? " selected" : "";
}

function ruleRow(
  name: string,
  outcome: TradePreview["rules"][number]["outcome"] = "unreviewed",
  disabled = false,
): string {
  const ruleLabel = name.trim().length === 0 ? "new rule" : name;
  const removeLabel = "Remove " + ruleLabel + " rule";
  return `<div class="review-rule-row" data-review-rule-row>
    <label>Rule<input name="review-rule-name" type="text" maxlength="500" value="${escapeHtml(name)}" placeholder="e.g. Wait for confirmation" ${disabled ? "disabled" : ""} /></label>
    <label>Outcome<select name="review-rule-outcome" aria-label="${escapeHtml("Outcome for " + ruleLabel)}" ${disabled ? "disabled" : ""}>
      <option value="unreviewed"${selected(outcome, "unreviewed")}>Not reviewed</option>
      <option value="followed"${selected(outcome, "followed")}>Followed</option>
      <option value="broken"${selected(outcome, "broken")}>Broken</option>
      <option value="not_applicable"${selected(outcome, "not_applicable")}>Not applicable</option>
    </select></label>
    ${disabled ? "" : `<button class="icon-button" type="button" data-review-rule-remove aria-label="${escapeHtml(removeLabel)}">×</button>`}
  </div>`;
}

function initialRules(trade: TradePreview, snapshot: JournalWorkspaceSnapshot): string {
  if (trade.rules.length > 0) {
    return trade.rules.map((rule) => ruleRow(
      rule.text,
      rule.outcome,
      snapshot.provenance === "demo",
    )).join("");
  }
  const configured = snapshot.reviewOptions.playbooks.find((playbook) => (
    playbook.name === trade.playbook
  ));
  return (configured?.rules ?? []).map((rule) => ruleRow(
    rule,
    "unreviewed",
    snapshot.provenance === "demo",
  )).join("");
}

function options(values: readonly string[]): string {
  return values.map((value) => `<option value="${escapeHtml(value)}"></option>`).join("");
}

export function tradeReviewSheetTemplate(
  trade: TradePreview,
  snapshot: JournalWorkspaceSnapshot,
): string {
  const demoReadOnly = snapshot.provenance === "demo";
  const invalidReviewIdentity = trade.reviewStatus === "pending"
    ? trade.reviewId !== null || trade.reviewVersion !== null
    : trade.reviewId === null
      || trade.reviewVersion === null
      || !Number.isSafeInteger(trade.reviewVersion)
      || trade.reviewVersion < 1;
  const readOnly = demoReadOnly || invalidReviewIdentity;
  const disabled = readOnly ? "disabled" : "";
  const setup = trade.hasClassifiedSetup ? trade.setup : "";
  const note = trade.note === "No journal note added." ? "" : trade.note;
  const pnlCurrency = tradePnlCurrency(trade, snapshot);
  const riskCurrency = savedRiskCurrency(trade, snapshot);
  const reviewLabel = invalidReviewIdentity
    ? "REVIEW STATE · VERSION UNAVAILABLE"
    : trade.reviewStatus === "completed"
      ? `REVIEWED · VERSION ${trade.reviewVersion}`
    : trade.reviewStatus === "draft" ? "DRAFT REVIEW" : "REVIEW PENDING";
  const hasSavedReview = trade.reviewStatus !== "pending" && !invalidReviewIdentity;
  const saveActions = trade.reviewStatus === "completed"
    ? `<button class="primary-button" type="submit" data-review-state="completed">Save review changes</button>`
    : `<button class="secondary-button" type="submit" data-review-state="draft">Save draft</button><button class="primary-button" type="submit" data-review-state="completed">Mark reviewed</button>`;
  return `<div class="sheet-backdrop trade-review-backdrop" id="trade-review" data-trade-review-backdrop>
    <section class="settings-sheet trade-review-sheet" role="dialog" aria-modal="true" aria-labelledby="trade-review-title" tabindex="-1">
      <div class="sheet-handle" aria-hidden="true"></div>
      <div class="sheet-heading">
        <div><p class="eyebrow">${escapeHtml(reviewLabel)}</p><h2 id="trade-review-title" tabindex="-1">${escapeHtml(trade.symbol)} trade review · ${assetClassLabel(trade)}</h2></div>
        <button class="icon-button" type="button" data-trade-review-close aria-label="Close trade review">×</button>
      </div>
      ${demoReadOnly
        ? `<p class="helper-text">This fictional demo review is read-only. Return to your local journal to save reviews.</p>`
        : invalidReviewIdentity
          ? `<p class="form-error" role="alert">This review state has no coherent immutable version identity. Saving is blocked until the journal is reloaded or repaired.</p>`
          : `<p class="helper-text">Review metadata creates a new immutable version. It never changes an execution or sends an order.</p>`}
      <section aria-labelledby="execution-inspection-title">
        <div class="section-title"><h3 id="execution-inspection-title">Execution inspection</h3><span>${trade.executions.length} allocations</span></div>
        ${executionTemplate(trade)}
      </section>
      <section aria-labelledby="metric-evidence-title">
        <div class="section-title"><h3 id="metric-evidence-title">${hasSavedReview ? "Saved" : "Current"} metric evidence</h3><span>${invalidReviewIdentity ? "Version unavailable" : trade.reviewVersion === null ? "No saved review" : `Review version ${trade.reviewVersion}`}</span></div>
        <p class="helper-text">These values reflect immutable executions and the ${hasSavedReview ? "saved review" : "current journal"} state from when this editor opened. Unsaved risk changes are not included.</p>
        <div class="review-metric-grid">${metricEvidenceTemplate(trade.resultRMetric)}${metricEvidenceTemplate(trade.percentReturnMetric)}</div>
      </section>
      <form id="trade-review-form" novalidate>
        <datalist id="review-setup-options">${options(snapshot.reviewOptions.setups)}</datalist>
        <datalist id="review-emotion-options">${options(snapshot.reviewOptions.emotions)}</datalist>
        <datalist id="review-playbook-options">${options(snapshot.reviewOptions.playbooks.map((playbook) => playbook.name))}</datalist>
        <div class="field-grid review-fields">
          <label>Setup<input id="review-setup" type="text" maxlength="120" list="review-setup-options" value="${escapeHtml(setup)}" placeholder="e.g. Opening-range breakout" ${disabled} /></label>
          <label>Emotion<input id="review-emotion" type="text" maxlength="120" list="review-emotion-options" value="${escapeHtml(trade.emotion ?? "")}" placeholder="e.g. Focused" ${disabled} /></label>
          <label>Mistakes<textarea id="review-mistakes" rows="2" placeholder="Comma or line separated" ${disabled}>${escapeHtml(trade.mistakes.join(", "))}</textarea></label>
          <label>Tags<textarea id="review-tags" rows="2" placeholder="Comma or line separated" ${disabled}>${escapeHtml(trade.tags.join(", "))}</textarea></label>
          <label>Initial risk (${escapeHtml(riskCurrency)})<input id="review-risk" type="text" inputmode="decimal" value="${escapeHtml(trade.initialRisk?.amount ?? "")}" placeholder="User-confirmed amount" ${disabled} /></label>
          <label>Risk currency<select id="review-risk-currency" ${disabled}>${currencyOptions(riskCurrency, pnlCurrency)}</select></label>
          <label>Planned stop<input id="review-stop" type="text" inputmode="decimal" value="${escapeHtml(trade.plannedStop ?? "")}" placeholder="Optional exact price" ${disabled} /></label>
          <label>Playbook<input id="review-playbook" type="text" maxlength="120" list="review-playbook-options" value="${escapeHtml(trade.playbook ?? "")}" placeholder="Optional playbook" ${disabled} /></label>
        </div>
        <p class="helper-text">Initial risk must be a positive amount you confirm in the trade's P&amp;L currency (${escapeHtml(pnlCurrency)}). Hermes preserves saved currency provenance and never copies risk from the position-size tool.</p>
        <fieldset class="review-rules" ${disabled}>
          <legend>Rule adherence</legend>
          <div id="review-rule-rows">${initialRules(trade, snapshot)}</div>
          ${readOnly ? "" : `<button class="text-button" id="review-rule-add" type="button">Add rule</button>`}
        </fieldset>
        <label class="review-note-label">Reflection<textarea id="review-note" rows="5" maxlength="5000" placeholder="What happened, what did you do well, and what changes next time?" ${disabled}>${escapeHtml(note)}</textarea></label>
        <p class="form-error" id="trade-review-error" role="alert" tabindex="-1" hidden></p>
        <p class="sr-only" id="trade-review-status" aria-live="polite"></p>
        <button class="secondary-button" id="trade-review-reconcile" type="button" hidden>Retry this exact save</button>
        <div class="quick-actions">
          <button class="secondary-button" type="button" data-trade-review-close>${readOnly ? "Close" : "Cancel"}</button>
          ${readOnly ? "" : saveActions}
        </div>
      </form>
    </section>
  </div>`;
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

function formFingerprint(form: HTMLFormElement): string {
  return JSON.stringify(Array.from(
    form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
      "input, textarea, select",
    ),
    (element, index) => [
      element.id || element.name || String(index),
      element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")
        ? element.checked
        : element.value,
    ],
  ));
}

function value(form: HTMLFormElement, id: string): string {
  return form.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
    `#${id}`,
  )?.value ?? "";
}

function bindRuleRemoval(container: HTMLElement): void {
  container.querySelectorAll<HTMLButtonElement>("[data-review-rule-remove]").forEach((button) => {
    if (button.dataset.bound === "true") return;
    button.dataset.bound = "true";
    const row = button.closest<HTMLElement>("[data-review-rule-row]");
    const input = row?.querySelector<HTMLInputElement>('input[name="review-rule-name"]');
    const outcome = row?.querySelector<HTMLSelectElement>('select[name="review-rule-outcome"]');
    input?.addEventListener("input", () => {
      const name = input.value.trim();
      const ruleLabel = name.length === 0 ? "new rule" : name;
      button.setAttribute("aria-label", "Remove " + ruleLabel + " rule");
      outcome?.setAttribute("aria-label", "Outcome for " + ruleLabel);
    });
    button.addEventListener("click", () => {
      if (row === null) return;
      const rows = Array.from(container.querySelectorAll<HTMLElement>("[data-review-rule-row]"));
      const index = rows.indexOf(row);
      const focusRow = rows[index + 1] ?? rows[index - 1];
      row.remove();
      const destination = focusRow?.querySelector<HTMLElement>(
        'input[name="review-rule-name"], [data-review-rule-remove]',
      ) ?? container.closest("fieldset")?.querySelector<HTMLElement>("#review-rule-add");
      destination?.focus();
    });
  });
}

export function bindTradeReviewActions(
  root: HTMLElement,
  application: JournalApplication,
  snapshot: JournalWorkspaceSnapshot,
  setBackgroundInert: (inert: boolean) => void,
  refresh: (announcement: string) => Promise<void>,
): void {
  root.querySelectorAll<HTMLButtonElement>("[data-review-trade]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const trade = snapshot.trades.find((candidate) => (
        candidate.tradeSubjectId === trigger.dataset.reviewTrade
      ));
      if (trade === undefined) return;
      root.querySelector("#trade-review")?.remove();
      (root.querySelector(".app-shell") ?? root).insertAdjacentHTML(
        "beforeend",
        tradeReviewSheetTemplate(trade, snapshot),
      );
      const backdrop = root.querySelector<HTMLElement>("#trade-review");
      const sheet = backdrop?.querySelector<HTMLElement>(".trade-review-sheet");
      const form = backdrop?.querySelector<HTMLFormElement>("#trade-review-form");
      const error = backdrop?.querySelector<HTMLElement>("#trade-review-error");
      const status = backdrop?.querySelector<HTMLElement>("#trade-review-status");
      const reconcile = backdrop?.querySelector<HTMLButtonElement>("#trade-review-reconcile");
      const ruleRows = backdrop?.querySelector<HTMLElement>("#review-rule-rows");
      if (!backdrop || !sheet || !form || !error || !status || !reconcile || !ruleRows) {
        backdrop?.remove();
        return;
      }
      setBackgroundInert(true);
      const returnFocus = trigger;
      const initialFingerprint = formFingerprint(form);
      const invalidReviewIdentity = trade.reviewStatus === "pending"
        ? trade.reviewId !== null || trade.reviewVersion !== null
        : trade.reviewId === null
          || trade.reviewVersion === null
          || !Number.isSafeInteger(trade.reviewVersion)
          || trade.reviewVersion < 1;
      const submissionId = snapshot.provenance === "demo" || invalidReviewIdentity
        ? null
        : application.createReviewSubmissionId();
      let saving = false;
      let uncertain = false;
      let committed = false;
      let saveBlocked = false;
      let reopenRefreshPending = false;
      let uncertainPrepared: PreparedTradeReviewBatch | null = null;
      let attemptedState: "draft" | "completed" = trade.reviewStatus === "completed"
        ? "completed"
        : "draft";
      type ReviewControl =
        | HTMLButtonElement
        | HTMLInputElement
        | HTMLTextAreaElement
        | HTMLSelectElement;
      const currentControls = () => Array.from(
        sheet.querySelectorAll<ReviewControl>("button, input, textarea, select"),
      );
      const initiallyDisabled = new Map<ReviewControl, boolean>(
        currentControls().map((control) => [control, control.disabled] as const),
      );
      const submitButtons = Array.from(form.querySelectorAll<HTMLButtonElement>(
        "button[type=submit][data-review-state]",
      ));

      const setPersistenceBusy = (busy: boolean) => {
        saving = busy;
        sheet.setAttribute("aria-busy", String(busy));
        currentControls().forEach((control) => {
          if (!initiallyDisabled.has(control)) {
            initiallyDisabled.set(control, control.disabled);
          }
          control.disabled = busy || (initiallyDisabled.get(control) ?? false);
        });
        if (!busy && saveBlocked) {
          submitButtons.forEach((button) => { button.disabled = true; });
        }
        if (reopenRefreshPending) {
          backdrop.querySelectorAll<HTMLButtonElement>("[data-trade-review-close]")
            .forEach((button) => { button.disabled = true; });
        }
      };
      const showUncertainSave = (message: string) => {
        committed = false;
        reopenRefreshPending = false;
        uncertain = true;
        saving = false;
        sheet.setAttribute("aria-busy", "false");
        reconcile.textContent = "Retry this exact save";
        reconcile.hidden = false;
        reconcile.disabled = false;
        error.hidden = false;
        error.textContent = message;
        status.textContent = "Trade review save status is still uncertain";
        error.focus({ preventScroll: true });
      };
      const showCommittedRefreshFailure = () => {
        committed = true;
        reopenRefreshPending = false;
        uncertain = true;
        uncertainPrepared = null;
        saving = false;
        sheet.setAttribute("aria-busy", "false");
        reconcile.textContent = "Retry journal refresh";
        reconcile.hidden = false;
        reconcile.disabled = false;
        error.hidden = false;
        error.textContent = "This trade review is saved on this device, but the journal screen could not refresh. Do not save it again. Retry the journal refresh or restart Hermes before editing this trade.";
        status.textContent = "Trade review saved but journal refresh still failed";
        error.focus({ preventScroll: true });
      };
      const showStaleConflict = () => {
        committed = false;
        uncertain = false;
        uncertainPrepared = null;
        saveBlocked = true;
        reopenRefreshPending = true;
        reconcile.textContent = "Refresh journal before reopening";
        reconcile.hidden = false;
        setPersistenceBusy(false);
        reconcile.disabled = false;
        error.hidden = false;
        error.textContent = "Hermes did not apply this exact save because its prepared review no longer matches the current journal. Nothing was overwritten, and your unsaved changes are still here. Refresh the journal before reopening this trade.";
        status.textContent = "Prepared trade review no longer matches; refresh before reopening";
        error.focus({ preventScroll: true });
      };
      const showBlockedSave = () => {
        committed = false;
        uncertain = false;
        uncertainPrepared = null;
        saveBlocked = true;
        reopenRefreshPending = true;
        reconcile.textContent = "Refresh journal before reopening";
        reconcile.hidden = false;
        setPersistenceBusy(false);
        reconcile.disabled = false;
        error.hidden = false;
        error.textContent = "Hermes could not safely apply this prepared review to the current journal. Your unsaved changes are still here. Refresh the journal before reopening this trade.";
        status.textContent = "Trade review was not saved; refresh before reopening";
        error.focus({ preventScroll: true });
      };
      const refreshAfterConfirmedSave = async (
        result: TradeReviewCommitResult,
        exactReplay: boolean,
      ) => {
        status.textContent = exactReplay
          ? "Exact trade review save confirmed; refreshing journal"
          : "Trade review saved; refreshing journal";
        const announcement = result.outcome === "duplicate"
          ? "This trade review was already saved; no duplicate version was created."
          : attemptedState === "completed"
            ? `${trade.symbol} review completed.`
            : `${trade.symbol} review draft saved.`;
        try {
          await refresh(announcement);
        } catch {
          showCommittedRefreshFailure();
          return;
        }
        saving = false;
        uncertain = false;
        backdrop.remove();
        setBackgroundInert(false);
        root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
      };

      const close = (force = false) => {
        if (saving || uncertain || reopenRefreshPending) return;
        const dirty = formFingerprint(form) !== initialFingerprint || saveBlocked;
        if (!force && dirty && !window.confirm("Discard the unsaved trade review?")) return;
        backdrop.remove();
        setBackgroundInert(false);
        if (returnFocus.isConnected) returnFocus.focus();
        else root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
      };
      backdrop.querySelectorAll<HTMLButtonElement>("[data-trade-review-close]").forEach((button) => {
        button.addEventListener("click", () => close());
      });
      reconcile.addEventListener("click", async () => {
        if (saving) return;
        sheet.focus({ preventScroll: true });
        setPersistenceBusy(true);
        error.hidden = true;
        if (reopenRefreshPending) {
          status.textContent = "Refreshing the journal before this trade is reopened";
          try {
            await refresh("Journal refreshed after rejecting an obsolete trade review save.");
            reopenRefreshPending = false;
            reconcile.hidden = true;
            setPersistenceBusy(false);
            error.hidden = false;
            error.textContent = "The journal is refreshed. Nothing was overwritten, and your unsaved changes are still here. Cancel discards this draft; then reopen the trade to review the latest saved version.";
            status.textContent = "Journal refreshed; the obsolete review remains unsaved";
            error.focus({ preventScroll: true });
          } catch {
            setPersistenceBusy(false);
            reconcile.textContent = "Refresh journal before reopening";
            reconcile.hidden = false;
            reconcile.disabled = false;
            error.hidden = false;
            error.textContent = "Hermes could not refresh the journal. Your unsaved changes are still here and saving remains blocked. Retry the journal refresh before reopening this trade.";
            status.textContent = "Journal refresh failed; trade review remains unsaved";
            error.focus({ preventScroll: true });
          }
          return;
        }
        if (committed) {
          status.textContent = "Reloading the confirmed saved trade review";
          try {
            await refresh("Journal reloaded after the saved trade review could not refresh.");
            saving = false;
            uncertain = false;
            backdrop.remove();
            setBackgroundInert(false);
            root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
          } catch {
            showCommittedRefreshFailure();
          }
          return;
        }

        const prepared = uncertainPrepared;
        if (prepared === null) {
          saving = false;
          sheet.setAttribute("aria-busy", "false");
          reconcile.disabled = true;
          error.hidden = false;
          error.textContent = "Hermes cannot safely retry this review because its exact prepared command is unavailable. Your draft remains frozen here. Keep this sheet open and do not re-enter this review.";
          status.textContent = "Exact trade review save command is unavailable";
          error.focus({ preventScroll: true });
          return;
        }

        status.textContent = "Retrying the exact trade review save on device";
        try {
          const result = await application.commitReviewsSafely(prepared);
          committed = true;
          uncertain = false;
          uncertainPrepared = null;
          await refreshAfterConfirmedSave(result, true);
        } catch (caught) {
          const failureKind = tradeReviewSaveFailureKind(caught);
          if (failureKind === "stale") {
            showStaleConflict();
            return;
          }
          showUncertainSave(failureKind === "blocked"
            ? "Hermes could not safely prove whether this exact review save committed. The form remains locked and the outcome is still unknown. Keep this sheet open and retry the same save when the device is ready."
            : "Hermes still could not confirm this exact review save. The form remains locked and the outcome is still unknown. Keep this sheet open and retry the same save when the device is ready.");
        }
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

      bindRuleRemoval(ruleRows);
      backdrop.querySelector("#review-rule-add")?.addEventListener("click", () => {
        ruleRows.insertAdjacentHTML("beforeend", ruleRow(""));
        bindRuleRemoval(ruleRows);
        ruleRows.querySelectorAll<HTMLInputElement>('input[name="review-rule-name"]')
          .item(ruleRows.querySelectorAll('input[name="review-rule-name"]').length - 1)
          ?.focus();
      });
      let acceptedPlaybookName = trade.playbook ?? "";
      backdrop.querySelector<HTMLInputElement>("#review-playbook")?.addEventListener("change", (event) => {
        const input = event.currentTarget;
        if (!(input instanceof HTMLInputElement)) return;
        const nextName = input.value.trim();
        if (
          nextName.toLocaleLowerCase("en-US")
          === acceptedPlaybookName.trim().toLocaleLowerCase("en-US")
        ) {
          acceptedPlaybookName = nextName;
          input.value = nextName;
          return;
        }
        const configured = snapshot.reviewOptions.playbooks.find((playbook) => (
          playbook.name.toLocaleLowerCase("en-US") === nextName.toLocaleLowerCase("en-US")
        ));
        if (
          ruleRows.querySelector("[data-review-rule-row]") !== null
          && !window.confirm("Changing the playbook will clear or replace the current rule work. Continue?")
        ) {
          input.value = acceptedPlaybookName;
          return;
        }
        ruleRows.innerHTML = configured?.rules.map((rule) => ruleRow(rule)).join("") ?? "";
        acceptedPlaybookName = nextName;
        input.value = nextName;
        bindRuleRemoval(ruleRows);
      });

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (submissionId === null || saving || uncertain || saveBlocked) return;
        const submitter = (event as SubmitEvent).submitter;
        const state = submitter instanceof HTMLButtonElement
          && submitter.dataset.reviewState === "completed" ? "completed" : "draft";
        attemptedState = state;
        error.hidden = true;
        uncertainPrepared = null;
        const playbookName = value(form, "review-playbook").trim();
        const rules: TradeReviewRuleInput[] = Array.from(
          ruleRows.querySelectorAll<HTMLElement>("[data-review-rule-row]"),
        )
          .flatMap((row) => {
            const name = row.querySelector<HTMLInputElement>('input[name="review-rule-name"]')
              ?.value.trim() ?? "";
            const rawOutcome = row.querySelector<HTMLSelectElement>('select[name="review-rule-outcome"]')
              ?.value ?? "unreviewed";
            const outcome = rawOutcome === "followed" || rawOutcome === "broken"
              || rawOutcome === "not_applicable" ? rawOutcome : "unreviewed";
            return name.length === 0 ? [] : [{ name, outcome }];
          });
        try {
          const riskAmount = value(form, "review-risk").trim();
          const prepared = application.prepareReview({
            submissionId,
            tradeSubjectId: trade.tradeSubjectId,
            expectedPreviousReviewId: trade.reviewId,
            state,
            note: value(form, "review-note"),
            setup: value(form, "review-setup"),
            mistakes: parseReviewList(value(form, "review-mistakes")),
            tags: parseReviewList(value(form, "review-tags")),
            emotion: value(form, "review-emotion"),
            playbook: playbookName.length === 0 ? null : { name: playbookName, rules },
            initialRisk: riskAmount.length === 0
              ? null
              : {
                  amount: riskAmount,
                  currency: value(form, "review-risk-currency").trim()
                    || tradePnlCurrency(trade, snapshot),
                },
            plannedStop: value(form, "review-stop"),
          });
          const batch = application.prepareReviewBatch([prepared]);
          uncertainPrepared = batch;
          sheet.focus({ preventScroll: true });
          setPersistenceBusy(true);
          status.textContent = state === "completed" ? "Saving completed review" : "Saving draft";
          const result = await application.commitReviewsSafely(batch);
          committed = true;
          uncertain = false;
          uncertainPrepared = null;
          await refreshAfterConfirmedSave(result, false);
        } catch (caught) {
          const failureKind = tradeReviewSaveFailureKind(caught);
          if (failureKind === "uncertain") {
            showUncertainSave(caught instanceof TradeReviewCommitStatusUncertainError
              ? caught.message
              : "Hermes could not confirm whether this exact review save committed. The form is locked here. Retry this exact save to reuse the same review identity.");
            return;
          }
          if (failureKind === "stale") {
            showStaleConflict();
            return;
          }
          if (failureKind === "blocked") {
            showBlockedSave();
            return;
          }
          uncertainPrepared = null;
          setPersistenceBusy(false);
          error.hidden = false;
          error.textContent = caught instanceof TradeReviewPreparationError
            ? caught.message
            : "Hermes could not prepare or save this trade review. Your unsaved changes are still here. Review the form and try again.";
          status.textContent = "Trade review was not saved";
          error.focus({ preventScroll: true });
        }
      });
      backdrop.querySelector<HTMLElement>("#trade-review-title")?.focus();
    });
  });
}
