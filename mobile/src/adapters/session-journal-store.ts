import type {
  CsvImportCommitResult,
  JournalAccountRecord,
  JournalImportReceipt,
  JournalInstrumentRecord,
  JournalLedgerSnapshot,
  JournalStore,
  JournalWorkspaceRecord,
  ManualExecutionCommitResult,
  PreparedCsvImport,
  UnacknowledgedManualExecution,
} from "../application/journal-store";
import {
  JournalImportError,
  JournalManualExecutionError,
} from "../application/journal-store";
import {
  type PreparedManualExecution,
  verifyPreparedManualExecution,
} from "../application/prepare-manual-execution";
import { verifyPreparedCsvImport } from "../application/prepare-csv-import";
import { currencyMinorUnit } from "../core/currency";
import type { LedgerExecution } from "../core/ledger";
import { normalizeTrades } from "../core/normalize-trades";
import { sha256Hex } from "./sqlite/schema";

interface SessionExecution extends LedgerExecution {
  readonly sourceIdentity: string;
  readonly payloadHash: string;
  readonly receiptIds: readonly string[];
}

interface SessionManualSubmission extends UnacknowledgedManualExecution {
  acknowledged: boolean;
}

export interface SessionJournalRuntime {
  nowMs(): number;
}

const DEFAULT_RUNTIME: SessionJournalRuntime = { nowMs: () => Date.now() };

function epochMicroseconds(instant: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(instant);
  if (match === null) throw new Error(`Unsupported execution timestamp: ${instant}`);
  const milliseconds = Date.parse(`${match[1]}.000Z`);
  if (!Number.isSafeInteger(milliseconds) || milliseconds < 0) {
    throw new Error(`Execution timestamp is outside the journal range: ${instant}`);
  }
  const fraction = match[2] ?? "";
  if (/[^0]/.test(fraction.slice(6))) {
    throw new Error("Execution timestamps may contain at most microsecond precision.");
  }
  return String((BigInt(milliseconds) / 1000n) * 1_000_000n + BigInt(fraction.slice(0, 6).padEnd(6, "0")));
}

function feeMinor(value: string, exponent: number): string {
  const [whole = "0", fraction = ""] = value.split(".", 2);
  if (/[^0]/.test(fraction.slice(exponent))) {
    throw new Error("Fee precision exceeds the selected currency's minor unit.");
  }
  return `${whole}${fraction.slice(0, exponent).padEnd(exponent, "0")}`.replace(/^0+(?=[0-9])/, "");
}

export class SessionJournalStore implements JournalStore {
  private workspace: JournalWorkspaceRecord | null = null;
  private accounts: JournalAccountRecord[] = [];
  private instruments: JournalInstrumentRecord[] = [];
  private executions: SessionExecution[] = [];
  private inactiveExecutions = new Map<string, SessionExecution>();
  private receipts: JournalImportReceipt[] = [];
  private readonly receiptByRevision = new Map<string, string>();
  private readonly manualSubmissions = new Map<string, SessionManualSubmission>();
  private nextExecutionSequence = 1;
  private nextReceiptOrdinal = 0;
  private closed = false;

  constructor(private readonly runtime: SessionJournalRuntime = DEFAULT_RUNTIME) {}

  async load(): Promise<JournalLedgerSnapshot> {
    this.assertOpen();
    const executions: readonly LedgerExecution[] = this.executions;
    return {
      workspace: this.workspace,
      accounts: [...this.accounts],
      instruments: [...this.instruments],
      executions,
      projection: normalizeTrades(executions),
      imports: [...this.receipts],
    };
  }

  async commitCsvImport(command: PreparedCsvImport): Promise<CsvImportCommitResult> {
    this.assertOpen();
    const verified = verifyPreparedCsvImport(command);
    if (verified.preview.rows.length === 0) {
      throw new JournalImportError({
        code: "preview_changed",
        message: "The CSV has no valid execution rows to import.",
        issues: verified.preview.issues,
      });
    }
    const minorUnit = currencyMinorUnit(command.defaultCurrency);
    if (minorUnit === null) {
      throw new JournalImportError({
        code: "preview_changed",
        message: `${command.defaultCurrency} is not yet supported by the execution ledger.`,
      });
    }
    const existingReceiptId = this.receiptByRevision.get(command.revision);
    if (existingReceiptId !== undefined) {
      const existingReceipt = this.receipts.find((receipt) => receipt.id === existingReceiptId);
      if (existingReceipt === undefined) throw new Error("Session receipt index is inconsistent.");
      if (existingReceipt.rolledBackAtUs === null) {
        return { outcome: "duplicate", receipt: existingReceipt, ledger: await this.load() };
      }
    }

    const nowMs = this.runtime.nowMs();
    const receiptId = `session-receipt:${sha256Hex(
      `${command.revision}:${nowMs}:${this.nextReceiptOrdinal}`,
    )}`;
    this.nextReceiptOrdinal += 1;
    const nextWorkspace = this.workspace ?? {
      id: "session-workspace",
      name: "My Journal",
      defaultCurrency: command.defaultCurrency,
      timeZone: command.timeZone,
    };
    if (
      nextWorkspace.defaultCurrency !== command.defaultCurrency
      || nextWorkspace.timeZone !== command.timeZone
    ) {
      throw new JournalImportError({
        code: "preview_changed",
        message: "This import must use the journal's existing currency and time zone.",
      });
    }

    const nextAccounts = [...this.accounts];
    let account = nextAccounts.find((candidate) => candidate.name === command.accountName);
    if (account === undefined) {
      account = {
        id: `session-account:${sha256Hex(command.accountName)}`,
        name: command.accountName,
        baseCurrency: command.defaultCurrency,
      };
      nextAccounts.push(account);
    }
    const nextInstruments = [...this.instruments];
    const nextExecutions = [...this.executions];
    const nextInactiveExecutions = new Map(this.inactiveExecutions);
    let nextExecutionSequence = this.nextExecutionSequence;
    let inserted = 0;
    const fallbackOccurrences = new Map<string, number>();

    for (const row of verified.preview.rows) {
      let instrument = nextInstruments.find((candidate) => (
        candidate.symbol === row.symbol && candidate.assetClass === "stock"
      ));
      if (instrument === undefined) {
        instrument = {
          id: `session-instrument:${sha256Hex(row.symbol)}`,
          symbol: row.symbol,
          assetClass: "stock",
          quoteCurrency: command.defaultCurrency,
          multiplier: "1",
        };
        nextInstruments.push(instrument);
      }
      const fallbackIdentity = JSON.stringify({
        executedAt: row.executedAt,
        side: row.side,
        positionEffect: row.positionEffect,
        quantity: row.quantity,
        price: row.price,
      });
      const fallbackHash = sha256Hex(fallbackIdentity);
      const occurrenceKey = `${instrument.id}:${fallbackHash}`;
      const fallbackOrdinal = (fallbackOccurrences.get(occurrenceKey) ?? 0) + 1;
      fallbackOccurrences.set(occurrenceKey, fallbackOrdinal);
      const stableIdentity = row.executionId === null
        ? `fingerprint:${fallbackHash}:${fallbackOrdinal}`
        : `external:${row.executionId}`;
      const sourceIdentity = row.executionId === null
        ? `${account.id}:${instrument.id}:${stableIdentity}`
        : `${account.id}:${stableIdentity}`;
      const payloadHash = sha256Hex(JSON.stringify({
        executionId: row.executionId,
        symbol: row.symbol,
        side: row.side,
        positionEffect: row.positionEffect,
        quantity: row.quantity,
        price: row.price,
        fee: row.fee,
        currency: row.currency,
        executedAt: row.executedAt,
      }));
      const existingIndex = nextExecutions.findIndex((execution) => (
        execution.sourceIdentity === sourceIdentity
      ));
      const existing = nextExecutions[existingIndex];
      if (existing !== undefined) {
        if (existing.payloadHash !== payloadHash) {
          throw new JournalImportError({
            code: "execution_changed",
            message: `Row ${row.source.logicalRow} conflicts with an existing execution from the same source.`,
          });
        }
        nextExecutions[existingIndex] = {
          ...existing,
          receiptIds: [...existing.receiptIds, receiptId],
        };
        continue;
      }
      const inactive = nextInactiveExecutions.get(sourceIdentity);
      if (inactive !== undefined) {
        if (inactive.payloadHash !== payloadHash) {
          throw new JournalImportError({
            code: "execution_changed",
            message: `Row ${row.source.logicalRow} conflicts with a rolled-back execution from the same source.`,
          });
        }
        nextInactiveExecutions.delete(sourceIdentity);
        nextExecutions.push({ ...inactive, receiptIds: [receiptId] });
        inserted += 1;
        continue;
      }
      const costMinor = feeMinor(row.fee, minorUnit);
      nextExecutions.push({
        id: `session-execution:${sha256Hex(`${account.id}:${instrument.id}:${sourceIdentity}`)}`,
        accountId: account.id,
        instrumentId: instrument.id,
        occurredAtUs: epochMicroseconds(row.executedAt),
        ledgerSequence: String(nextExecutionSequence),
        side: row.side === "buy" ? "BUY" : "SELL",
        positionEffect: row.positionEffect === "unspecified"
          ? "AUTO"
          : row.positionEffect === "open" ? "OPEN" : "CLOSE",
        quantity: row.quantity,
        price: row.price,
        quoteCurrency: row.currency,
        multiplier: "1",
        fees: costMinor === "0" ? [] : [{
          category: "COMMISSION",
          currency: row.currency,
          costMinor,
          minorUnit,
        }],
        sourceIdentity,
        payloadHash,
        receiptIds: [receiptId],
      });
      nextExecutionSequence += 1;
      inserted += 1;
    }

    normalizeTrades(nextExecutions);
    const receipt: JournalImportReceipt = {
      id: receiptId,
      accountId: account.id,
      accountName: account.name,
      sourceName: command.sourceName,
      importedAtUs: `${nowMs}000`,
      sourceRows: verified.preview.totalDataRows,
      acceptedRows: verified.preview.validRows,
      rejectedRows: verified.preview.rejectedRows,
      skippedRows: verified.preview.skippedRows,
      warningCount: verified.preview.issues.filter((issue) => issue.severity === "warning").length
        + (verified.preview.rows.length - inserted),
      executionCount: inserted,
      rolledBackAtUs: null,
    };

    this.workspace = nextWorkspace;
    this.accounts = nextAccounts;
    this.instruments = nextInstruments;
    this.executions = nextExecutions;
    this.inactiveExecutions = nextInactiveExecutions;
    this.nextExecutionSequence = nextExecutionSequence;
    this.receipts = [receipt, ...this.receipts];
    this.receiptByRevision.set(command.revision, receipt.id);
    return { outcome: "committed", receipt, ledger: await this.load() };
  }

  async commitManualExecution(
    command: PreparedManualExecution,
  ): Promise<ManualExecutionCommitResult> {
    this.assertOpen();
    const verified = verifyPreparedManualExecution(command);
    const nextWorkspace = this.workspace ?? {
      id: "session-workspace",
      name: "My Journal",
      defaultCurrency: verified.defaultCurrency,
      timeZone: verified.timeZone,
    };
    if (
      nextWorkspace.defaultCurrency !== verified.defaultCurrency
      || nextWorkspace.timeZone !== verified.timeZone
    ) {
      throw new JournalManualExecutionError({
        code: "submission_changed",
        message: "This execution must use the journal's existing currency and time zone.",
      });
    }

    const nextAccounts = [...this.accounts];
    let account = nextAccounts.find((candidate) => candidate.name === verified.accountName);
    if (account === undefined) {
      account = {
        id: `session-account:${sha256Hex(verified.accountName)}`,
        name: verified.accountName,
        baseCurrency: verified.defaultCurrency,
      };
      nextAccounts.push(account);
    } else if (account.baseCurrency !== verified.defaultCurrency) {
      throw new JournalManualExecutionError({
        code: "submission_changed",
        message: "The selected account uses a different journal currency.",
      });
    }

    const nextInstruments = [...this.instruments];
    let instrument = nextInstruments.find((candidate) => (
      candidate.symbol === verified.symbol && candidate.assetClass === verified.assetClass
    ));
    if (instrument === undefined) {
      instrument = {
        id: `session-instrument:${sha256Hex(`${verified.assetClass}:${verified.symbol}`)}`,
        symbol: verified.symbol,
        assetClass: verified.assetClass,
        quoteCurrency: verified.defaultCurrency,
        multiplier: "1",
      };
      nextInstruments.push(instrument);
    } else if (
      instrument.quoteCurrency !== verified.defaultCurrency
      || instrument.multiplier !== "1"
    ) {
      throw new JournalManualExecutionError({
        code: "submission_changed",
        message: `Instrument ${verified.symbol} conflicts with its existing ledger metadata.`,
      });
    }

    const sourceIdentity = `manual:v1:${verified.submissionId}`;
    const payloadHash = sha256Hex(JSON.stringify({
      accountId: account.id,
      instrumentId: instrument.id,
      symbol: verified.symbol,
      assetClass: verified.assetClass,
      side: verified.side,
      positionEffect: verified.positionEffect,
      quantity: verified.quantity,
      price: verified.price,
      fee: verified.fee,
      currency: verified.defaultCurrency,
      occurredAtUs: verified.occurredAtUs,
    }));
    const existing = this.executions.find((execution) => (
      execution.sourceIdentity === sourceIdentity
    )) ?? this.inactiveExecutions.get(sourceIdentity);
    if (existing !== undefined) {
      if (existing.payloadHash !== payloadHash) {
        throw new JournalManualExecutionError({
          code: "execution_changed",
          message: "This manual submission was already saved with different execution values.",
        });
      }
      if (this.inactiveExecutions.has(sourceIdentity)) {
        throw new JournalManualExecutionError({
          code: "execution_changed",
          message: "This manual submission was superseded and cannot be replayed.",
        });
      }
      return { outcome: "duplicate", executionId: existing.id, ledger: await this.load() };
    }

    const nextExecutions = [...this.executions, {
      id: `session-execution:${sha256Hex(sourceIdentity)}`,
      accountId: account.id,
      instrumentId: instrument.id,
      occurredAtUs: verified.occurredAtUs,
      ledgerSequence: String(this.nextExecutionSequence),
      side: verified.side,
      positionEffect: verified.positionEffect,
      quantity: verified.quantity,
      price: verified.price,
      quoteCurrency: verified.defaultCurrency,
      multiplier: "1",
      fees: verified.feeMinor === "0" ? [] : [{
        category: "COMMISSION" as const,
        currency: verified.defaultCurrency,
        costMinor: verified.feeMinor,
        minorUnit: verified.minorUnit,
      }],
      sourceIdentity,
      payloadHash,
      receiptIds: [],
    }];
    normalizeTrades(nextExecutions);
    this.workspace = nextWorkspace;
    this.accounts = nextAccounts;
    this.instruments = nextInstruments;
    this.executions = nextExecutions;
    this.nextExecutionSequence += 1;
    const executionId = nextExecutions.at(-1)?.id;
    if (executionId === undefined) {
      throw new Error("The committed session execution could not be identified.");
    }
    this.manualSubmissions.set(verified.submissionId, {
      submissionId: verified.submissionId,
      executionId,
      symbol: verified.symbol,
      side: verified.side,
      acknowledged: false,
    });
    return {
      outcome: "committed",
      executionId,
      ledger: await this.load(),
    };
  }

  async loadUnacknowledgedManualExecutions(): Promise<readonly UnacknowledgedManualExecution[]> {
    this.assertOpen();
    return [...this.manualSubmissions.values()]
      .filter((submission) => !submission.acknowledged)
      .map(({ acknowledged: _acknowledged, ...submission }) => submission);
  }

  async acknowledgeManualExecution(submissionId: string): Promise<void> {
    this.assertOpen();
    const submission = this.manualSubmissions.get(submissionId);
    if (submission === undefined) {
      throw new Error("The manual execution confirmation is missing.");
    }
    this.manualSubmissions.set(submissionId, { ...submission, acknowledged: true });
  }

  async rollbackImport(receiptId: string, reason: string): Promise<JournalLedgerSnapshot> {
    this.assertOpen();
    if (reason.trim().length < 3) throw new Error("Provide a reason before rolling back an import.");
    const receiptIndex = this.receipts.findIndex((receipt) => receipt.id === receiptId);
    const receipt = this.receipts[receiptIndex];
    if (receipt === undefined || receipt.rolledBackAtUs !== null) {
      throw new Error("Import receipt is missing or already rolled back.");
    }
    const nextInactiveExecutions = new Map(this.inactiveExecutions);
    const nextExecutions = this.executions.flatMap((execution) => {
      if (!execution.receiptIds.includes(receiptId)) return [execution];
      const remainingReceiptIds = execution.receiptIds.filter((id) => id !== receiptId);
      if (remainingReceiptIds.length !== 0) {
        return [{ ...execution, receiptIds: remainingReceiptIds }];
      }
      nextInactiveExecutions.set(execution.sourceIdentity, { ...execution, receiptIds: [] });
      return [];
    });
    normalizeTrades(nextExecutions);
    const observedNowMs = this.runtime.nowMs();
    if (!Number.isSafeInteger(observedNowMs) || observedNowMs < 0) {
      throw new Error("The browser session clock is outside the journal range.");
    }
    const nowUs = String(
      BigInt(observedNowMs) * 1_000n > BigInt(receipt.importedAtUs)
        ? BigInt(observedNowMs) * 1_000n
        : BigInt(receipt.importedAtUs),
    );
    const nextReceipts = [...this.receipts];
    nextReceipts[receiptIndex] = { ...receipt, rolledBackAtUs: nowUs };
    this.executions = nextExecutions;
    this.inactiveExecutions = nextInactiveExecutions;
    this.receipts = nextReceipts;
    return this.load();
  }

  async close(): Promise<void> {
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("The browser session journal is closed.");
  }
}
