import type { JournalApplication } from "../application/journal-application";
import type { PreparedCsvImport } from "../application/journal-store";
import {
  DEFAULT_CSV_LIMITS,
  type CsvHeaderMapping,
  type CsvImportField,
} from "../core/csv";
import { escapeHtml } from "../core/html";
import type { JournalWorkspaceSnapshot } from "../core/types";

const CSV_FIELDS: ReadonlyArray<{ readonly id: CsvImportField; readonly label: string }> = [
  { id: "executionId", label: "Execution ID (optional)" },
  { id: "symbol", label: "Symbol" },
  { id: "side", label: "Side" },
  { id: "quantity", label: "Quantity" },
  { id: "price", label: "Price" },
  { id: "fee", label: "Fee (optional)" },
  { id: "currency", label: "Currency (optional)" },
  { id: "executedAt", label: "Executed at" },
];

function countNoun(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function importTool(snapshot: JournalWorkspaceSnapshot): string {
  const defaultTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const accountValue = "";
  return `<article class="card import-tool" aria-labelledby="import-tool-title">
    <p class="card-label">GENERIC BROKER CSV</p>
    <h2 id="import-tool-title">Import executions</h2>
    <p>Hermes previews and validates the file before one atomic on-device commit. Required columns: symbol, side, quantity, price, and execution time.</p>
    <form id="csv-import-form" novalidate>
      <div class="field-grid">
        <label>Account name<input id="import-account" name="account" type="text" maxlength="256" value="${escapeHtml(accountValue)}" placeholder="e.g. Brokerage" autocomplete="off" required /></label>
        <label>Time zone<input id="import-time-zone" name="timeZone" type="text" maxlength="100" value="${escapeHtml(snapshot.provenance === "empty" ? defaultTimeZone : snapshot.timeZone)}" autocomplete="off" required /></label>
        <label>Workspace currency<input id="import-currency" name="currency" type="text" maxlength="3" value="${escapeHtml(snapshot.currencyCode)}" autocapitalize="characters" required /></label>
        <label>CSV file<input id="import-file" name="file" type="file" accept=".csv,text/csv,text/plain" required /></label>
      </div>
      <p class="helper-text">Timestamps without an offset use the selected IANA time zone. The first journal version intentionally prevents mixed-currency aggregation.</p>
      <button class="primary-button" type="submit">Preview CSV</button>
      <p id="import-status" class="result-count" role="status" aria-live="polite"></p>
      <div id="import-preview"></div>
    </form>
  </article>`;
}

function mappingFromControls(container: HTMLElement): CsvHeaderMapping {
  const read = (field: CsvImportField): number | null => {
    const value = container.querySelector<HTMLSelectElement>(`[data-csv-field="${field}"]`)?.value ?? "";
    return value === "" ? null : Number(value);
  };
  return {
    executionId: read("executionId"),
    symbol: read("symbol"),
    side: read("side"),
    quantity: read("quantity"),
    price: read("price"),
    fee: read("fee"),
    currency: read("currency"),
    executedAt: read("executedAt"),
  };
}

function preparedPreviewTemplate(prepared: PreparedCsvImport): string {
  const preview = prepared.preview;
  const mapping = preview.mapping;
  const headers = preview.header?.cells.map((cell) => cell.value) ?? [];
  const issueRows = preview.issues.slice(0, 8).map((issue) => `<li class="${issue.severity === "error" ? "negative" : ""}">
    <strong>${escapeHtml(issue.code.replaceAll("_", " "))}</strong> ${escapeHtml(issue.message)}
  </li>`).join("");
  const remainingIssueCount = Math.max(preview.issues.length - 8, 0);
  const sampleRows = preview.rows.slice(0, 5).map((row) => `<div class="report-row" role="row">
    <strong role="cell">${escapeHtml(row.symbol)}</strong>
    <span role="cell">${escapeHtml(row.side.toUpperCase())}</span>
    <span role="cell">${escapeHtml(row.quantity)}</span>
    <span role="cell">${escapeHtml(row.price)}</span>
  </div>`).join("");
  const selects = CSV_FIELDS.map((field) => `<label>${escapeHtml(field.label)}<select data-csv-field="${field.id}">
    <option value="">Not mapped</option>
    ${headers.map((header, index) => `<option value="${index}" ${mapping?.[field.id] === index ? "selected" : ""}>${escapeHtml(header || `Column ${index + 1}`)}</option>`).join("")}
  </select></label>`).join("");
  return `<section class="import-preview-card" aria-labelledby="preview-title">
    <div class="section-title"><div><p class="card-label">VALIDATION PREVIEW</p><h3 id="preview-title">${preview.status === "ready" ? "Ready to import" : "Needs attention"}</h3></div><span>${preview.validRows} valid · ${preview.rejectedRows} rejected · ${preview.skippedRows} skipped</span></div>
    ${headers.length === 0 ? "" : `<details class="mapping-details" ${preview.status === "invalid" ? "open" : ""}><summary>Review column mapping</summary><div class="field-grid">${selects}</div></details>`}
    ${issueRows.length === 0 ? "" : `<ul class="issue-list">${issueRows}${remainingIssueCount === 0 ? "" : `<li>And ${remainingIssueCount} more issues. Correct the source file or mapping and preview again.</li>`}</ul>`}
    ${sampleRows.length === 0 ? "" : `<div class="report-table" role="table" aria-label="Execution preview"><div class="report-row report-header" role="row"><span role="columnheader">Symbol</span><span role="columnheader">Side</span><span role="columnheader">Qty</span><span role="columnheader">Price</span></div>${sampleRows}</div>`}
    ${preview.status === "ready" ? `<button class="primary-button" id="commit-import" type="button">Import ${countNoun(preview.validRows, "execution")}</button>` : ""}
  </section>`;
}

export function bindImportForm(
  root: HTMLElement,
  application: JournalApplication,
  refresh: (announcement: string) => Promise<void>,
): void {
  const form = root.querySelector<HTMLFormElement>("#csv-import-form");
  const fileInput = root.querySelector<HTMLInputElement>("#import-file");
  const previewContainer = root.querySelector<HTMLElement>("#import-preview");
  const status = root.querySelector<HTMLElement>("#import-status");
  if (!form || !fileInput || !previewContainer || !status) return;

  let rawInput: string | null = null;
  let sourceName: string | null = null;
  let prepared: PreparedCsvImport | null = null;

  const selection = (mapping?: CsvHeaderMapping) => ({
    rawInput: rawInput ?? "",
    sourceName: sourceName ?? "broker.csv",
    accountName: root.querySelector<HTMLInputElement>("#import-account")?.value.trim() ?? "",
    timeZone: root.querySelector<HTMLInputElement>("#import-time-zone")?.value.trim() ?? "",
    defaultCurrency: root.querySelector<HTMLInputElement>("#import-currency")?.value.trim().toUpperCase() ?? "",
    ...(mapping === undefined ? {} : { mapping }),
  });

  const renderPrepared = (next: PreparedCsvImport, focusField?: CsvImportField): void => {
    prepared = next;
    previewContainer.innerHTML = preparedPreviewTemplate(next);
    previewContainer.querySelectorAll<HTMLSelectElement>("[data-csv-field]").forEach((select) => {
      select.addEventListener("change", () => {
        try {
          const changedField = select.dataset.csvField as CsvImportField | undefined;
          renderPrepared(
            application.prepareCsv(selection(mappingFromControls(previewContainer))),
            changedField,
          );
          status.textContent = "Column mapping updated.";
        } catch (error) {
          status.textContent = error instanceof Error ? error.message : "Could not update the mapping.";
        }
      });
    });
    const commitButton = previewContainer.querySelector<HTMLButtonElement>("#commit-import");
    commitButton?.addEventListener("click", async (event) => {
      const button = event.currentTarget;
      if (!(button instanceof HTMLButtonElement) || prepared === null) return;
      button.disabled = true;
      status.textContent = "Writing one atomic journal transaction…";
      try {
        const result = await application.commitCsv(prepared);
        const alreadyPresent = result.receipt.acceptedRows - result.receipt.executionCount;
        const announcement = result.outcome === "duplicate"
          ? "This exact CSV was already imported; no records were duplicated."
          : `${countNoun(result.receipt.acceptedRows, "execution")} accepted with a reversible receipt${alreadyPresent === 0 ? "." : `; ${countNoun(alreadyPresent, "execution")} already existed.`}`;
        status.textContent = announcement;
        await refresh(announcement);
        root.querySelector<HTMLElement>("#screen")?.focus({ preventScroll: true });
      } catch (error) {
        button.disabled = false;
        status.textContent = error instanceof Error ? error.message : "The import was rolled back after an unexpected error.";
      }
    });
    if (focusField !== undefined) {
      if (next.preview.status === "ready") commitButton?.focus();
      else previewContainer.querySelector<HTMLSelectElement>(`[data-csv-field="${focusField}"]`)?.focus();
    }
  };

  const invalidateOptions = (): void => {
    if (prepared === null) return;
    prepared = null;
    previewContainer.innerHTML = "";
    status.textContent = "Import options changed. Preview the CSV again before committing.";
  };
  for (const id of ["#import-account", "#import-time-zone", "#import-currency"]) {
    root.querySelector<HTMLInputElement>(id)?.addEventListener("input", invalidateOptions);
  }

  fileInput.addEventListener("change", () => {
    prepared = null;
    rawInput = null;
    sourceName = null;
    previewContainer.innerHTML = "";
    const file = fileInput.files?.[0];
    status.textContent = file === undefined ? "Choose a CSV file." : `${file.name} selected. Preview it before import.`;
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const file = fileInput.files?.[0];
    if (file === undefined) {
      status.textContent = "Choose a CSV file first.";
      return;
    }
    if (file.size > DEFAULT_CSV_LIMITS.maxBytes) {
      status.textContent = `CSV is ${file.size} bytes; the limit is ${DEFAULT_CSV_LIMITS.maxBytes} bytes.`;
      previewContainer.innerHTML = "";
      return;
    }
    status.textContent = "Reading and validating locally…";
    try {
      rawInput = await file.text();
      sourceName = file.name.trim() || "broker.csv";
      renderPrepared(application.prepareCsv(selection()));
      status.textContent = prepared?.preview.status === "ready"
        ? "Preview is ready. Confirm the mapping and execution count."
        : "Resolve the preview errors before import.";
    } catch (error) {
      previewContainer.innerHTML = "";
      status.textContent = error instanceof Error ? error.message : "Could not preview this CSV.";
    }
  });
}
