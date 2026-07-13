import type {
  CsvImportCommitResult,
  JournalAccountRecord,
  JournalImportReceipt,
  JournalInstrumentRecord,
  JournalLedgerSnapshot,
  JournalPlaybookRecord,
  JournalReviewTermCategory,
  JournalReviewTermRecord,
  JournalStore,
  JournalTradeReviewRecord,
  JournalWorkspaceRecord,
  ManualExecutionCommitResult,
  PreparedCsvImport,
  PreparedTradeReviewBatch,
  TradeReviewCommitResult,
  UnacknowledgedManualExecution,
} from "../application/journal-store";
import {
  JournalImportError,
  JournalManualExecutionError,
  JournalTradeReviewError,
} from "../application/journal-store";
import {
  canonicalJournalArchiveJson,
  createJournalExportArtifact,
  JOURNAL_ARCHIVE_KIND,
  type JournalArchiveJson,
  type JournalExportArtifact,
} from "../application/journal-archive";
import {
  type PreparedManualExecution,
  verifyPreparedManualExecution,
} from "../application/prepare-manual-execution";
import { verifyPreparedCsvImport } from "../application/prepare-csv-import";
import {
  PERCENT_RETURN_METRIC_ID,
  RESULT_R_METRIC_ID,
  tradeReviewBatchRevision,
  type PreparedTradeReview,
  verifyPreparedTradeReview,
} from "../application/prepare-trade-review";
import { currencyMinorUnit } from "../core/currency";
import type {
  LedgerExecution,
  TradeNormalizationResult,
} from "../core/ledger";
import { normalizeTrades } from "../core/normalize-trades";
import { MOBILE_SCHEMA_MIGRATIONS, sha256Hex } from "./sqlite/schema";
import { stableTradeSubjectHash } from "./sqlite/trade-subject";

interface SessionExecution extends LedgerExecution {
  readonly sourceIdentity: string;
  readonly payloadHash: string;
  readonly receiptIds: readonly string[];
}

interface SessionManualSubmission extends UnacknowledgedManualExecution {
  acknowledged: boolean;
}

interface SessionReviewSubmission {
  readonly revision: string;
  readonly reviewId: string;
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

function normalizedName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function tradeSubjectsForProjection(
  projection: TradeNormalizationResult,
): JournalLedgerSnapshot["tradeSubjects"] {
  return projection.trades.map((trade) => ({
    projectionTradeId: trade.id,
    tradeSubjectId: `session-trade:${stableTradeSubjectHash(trade, projection.allocations)}`,
  }));
}

function sessionReviewError(
  code: "submission_changed" | "review_changed" | "trade_changed",
  message: string,
): JournalTradeReviewError {
  return new JournalTradeReviewError({ code, message });
}

function ensureReviewTerm(
  terms: JournalReviewTermRecord[],
  category: JournalReviewTermCategory,
  value: string,
): JournalReviewTermRecord {
  const key = normalizedName(value);
  const existing = terms.find((term) => (
    term.category === category && normalizedName(term.name) === key
  ));
  if (existing !== undefined) return existing;
  const created: JournalReviewTermRecord = Object.freeze({
    id: `session-review-term:${sha256Hex(JSON.stringify([category, key]))}`,
    category,
    name: value,
  });
  terms.push(created);
  return created;
}

function materializeReviewVocabulary(
  terms: JournalReviewTermRecord[],
  playbooks: JournalPlaybookRecord[],
  review: PreparedTradeReview,
): Pick<
  JournalTradeReviewRecord,
  "setup" | "mistakes" | "emotion" | "tags" | "playbookId" | "playbookName" | "rules"
> {
  const setup = review.setup === null
    ? null
    : ensureReviewTerm(terms, "setup", review.setup).name;
  const mistakes = review.mistakes.map((value) => (
    ensureReviewTerm(terms, "mistake", value).name
  ));
  const emotion = review.emotion === null
    ? null
    : ensureReviewTerm(terms, "emotion", review.emotion).name;
  const tags = review.tags.map((value) => ensureReviewTerm(terms, "tag", value).name);
  if (review.playbook === null) {
    return {
      setup,
      mistakes: Object.freeze(mistakes),
      emotion,
      tags: Object.freeze(tags),
      playbookId: null,
      playbookName: null,
      rules: Object.freeze([]),
    };
  }

  const playbookKey = normalizedName(review.playbook.name);
  let playbookIndex = playbooks.findIndex((candidate) => (
    normalizedName(candidate.name) === playbookKey
  ));
  if (playbookIndex < 0) {
    const playbook: JournalPlaybookRecord = Object.freeze({
      id: `session-playbook:${sha256Hex(playbookKey)}`,
      name: review.playbook.name,
      rules: Object.freeze([]),
    });
    playbooks.push(playbook);
    playbookIndex = playbooks.length - 1;
  }
  let playbook = playbooks[playbookIndex];
  if (playbook === undefined) throw new Error("A session playbook could not be materialized.");
  const playbookId = playbook.id;
  const nextRules = [...playbook.rules];
  const reviewRules = review.playbook.rules.map((rule) => {
    const ruleKey = normalizedName(rule.name);
    let storedRule = nextRules.find((candidate) => normalizedName(candidate.text) === ruleKey);
    if (storedRule === undefined) {
      storedRule = Object.freeze({
        id: `session-playbook-rule:${sha256Hex(JSON.stringify([playbookId, ruleKey]))}`,
        playbookId,
        text: rule.name,
      });
      nextRules.push(storedRule);
    }
    return Object.freeze({
      ruleId: storedRule.id,
      text: storedRule.text,
      outcome: rule.outcome,
    });
  });
  if (nextRules.length !== playbook.rules.length) {
    playbook = Object.freeze({ ...playbook, rules: Object.freeze(nextRules) });
    playbooks[playbookIndex] = playbook;
  }
  return {
    setup,
    mistakes: Object.freeze(mistakes),
    emotion,
    tags: Object.freeze(tags),
    playbookId: playbook.id,
    playbookName: playbook.name,
    rules: Object.freeze(reviewRules),
  };
}

function verifyTradeReviewBatch(command: PreparedTradeReviewBatch): readonly PreparedTradeReview[] {
  try {
    if (!Array.isArray(command.reviews) || command.reviews.length === 0) {
      throw new Error("A trade review batch must contain at least one reviewed command.");
    }
    const verified = command.reviews.map((review) => verifyPreparedTradeReview(review));
    if (tradeReviewBatchRevision(command.batchId, verified) !== command.revision) {
      throw new Error("Trade review batch values changed after review. Review them again.");
    }
    return verified;
  } catch (error) {
    throw sessionReviewError(
      "review_changed",
      error instanceof Error ? error.message : "The trade review batch is invalid.",
    );
  }
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
  /** Append-only history; only reviewHeadByTradeSubjectId is projected by load(). */
  private reviewVersions: JournalTradeReviewRecord[] = [];
  private reviewHeadByTradeSubjectId = new Map<string, string>();
  private reviewTerms: JournalReviewTermRecord[] = [];
  private playbooks: JournalPlaybookRecord[] = [];
  private reviewSubmissionById = new Map<string, SessionReviewSubmission>();
  private lastReviewRecordedAtMs = -1;
  private nextExecutionSequence = 1;
  private nextReceiptOrdinal = 0;
  private closed = false;

  constructor(private readonly runtime: SessionJournalRuntime = DEFAULT_RUNTIME) {}

  async load(): Promise<JournalLedgerSnapshot> {
    return this.loadSnapshot();
  }

  private loadSnapshot(): JournalLedgerSnapshot {
    this.assertOpen();
    const executions: readonly LedgerExecution[] = this.executions;
    const projection = normalizeTrades(executions);
    const headIds = new Set(this.reviewHeadByTradeSubjectId.values());
    const tradeReviews = this.reviewVersions
      .filter((review) => headIds.has(review.id))
      .sort((left, right) => (
        BigInt(left.recordedAtUs) < BigInt(right.recordedAtUs) ? -1
          : BigInt(left.recordedAtUs) > BigInt(right.recordedAtUs) ? 1
            : stableCompare(left.id, right.id)
      ));
    return {
      workspace: this.workspace,
      accounts: [...this.accounts],
      instruments: [...this.instruments],
      executions,
      projection,
      tradeSubjects: tradeSubjectsForProjection(projection),
      tradeReviews,
      reviewTerms: [...this.reviewTerms].sort((left, right) => (
        stableCompare(left.category, right.category)
        || stableCompare(normalizedName(left.name), normalizedName(right.name))
        || stableCompare(left.id, right.id)
      )),
      playbooks: [...this.playbooks]
        .sort((left, right) => (
          stableCompare(normalizedName(left.name), normalizedName(right.name))
          || stableCompare(left.id, right.id)
        ))
        .map((playbook) => ({ ...playbook, rules: [...playbook.rules] })),
      imports: [...this.receipts],
    };
  }
  async exportUserData(): Promise<JournalExportArtifact> {
    const ledger = this.loadSnapshot();
    const byId = <Value extends { readonly id: string }>(values: readonly Value[]) => (
      [...values].sort((left, right) => stableCompare(left.id, right.id))
    );
    const byKey = <Value>(values: Iterable<readonly [string, Value]>) => (
      [...values].sort(([left], [right]) => stableCompare(left, right))
    );
    const payloadData = {
      adapter: "browser-session",
      stateVersion: 1,
      workspace: this.workspace,
      accounts: byId(this.accounts),
      instruments: byId(this.instruments),
      activeExecutions: byId(this.executions),
      inactiveExecutions: byKey(this.inactiveExecutions.entries()),
      receipts: byId(this.receipts),
      receiptByRevision: byKey(this.receiptByRevision.entries()),
      manualSubmissions: byKey(this.manualSubmissions.entries()),
      reviewVersions: byId(this.reviewVersions),
      reviewHeads: byKey(this.reviewHeadByTradeSubjectId.entries()),
      reviewTerms: byId(this.reviewTerms),
      playbooks: byId(this.playbooks).map((playbook) => ({
        ...playbook,
        rules: byId(playbook.rules),
      })),
      reviewSubmissions: byKey(this.reviewSubmissionById.entries()),
      counters: {
        lastReviewRecordedAtMs: String(this.lastReviewRecordedAtMs),
        nextExecutionSequence: String(this.nextExecutionSequence),
        nextReceiptOrdinal: String(this.nextReceiptOrdinal),
      },
    };
    const archiveData = payloadData as unknown as JournalArchiveJson;
    const stateSha256 = sha256Hex(canonicalJournalArchiveJson(archiveData));
    const reportSha256 = sha256Hex(canonicalJournalArchiveJson({
      digestVersion: "hermes-report-input-v1",
      ledger,
    } as unknown as JournalArchiveJson));
    const observedNowMs = this.runtime.nowMs();
    if (!Number.isSafeInteger(observedNowMs) || observedNowMs < 0) {
      throw new Error("The browser session clock is outside the journal export range.");
    }
    const inactiveExecutionCount = this.inactiveExecutions.size;
    return createJournalExportArtifact({
      kind: JOURNAL_ARCHIVE_KIND,
      formatVersion: 1,
      exportedAtUs: String(BigInt(observedNowMs) * 1_000n),
      source: {
        schemaUserVersion: MOBILE_SCHEMA_MIGRATIONS.at(-1)?.toVersion ?? 0,
        migrations: MOBILE_SCHEMA_MIGRATIONS.map((migration) => ({
          version: migration.toVersion,
          name: migration.name,
          checksumSha256: migration.checksumSha256,
        })),
      },
      payload: {
        kind: "browser-session-state",
        version: 1,
        data: archiveData,
      },
      attachments: { version: 1, entries: [] },
      summary: {
        workspaceName: ledger.workspace?.name ?? null,
        currency: ledger.workspace?.defaultCurrency ?? null,
        timeZone: ledger.workspace?.timeZone ?? null,
        accounts: String(ledger.accounts.length),
        activeExecutions: String(ledger.executions.length),
        executionVersions: String(ledger.executions.length + inactiveExecutionCount),
        importReceipts: String(this.receipts.length),
        rolledBackImports: String(
          this.receipts.filter((receipt) => receipt.rolledBackAtUs !== null).length,
        ),
        currentReviews: String(ledger.tradeReviews.length),
        reviewVersions: String(this.reviewVersions.length),
        reviewTerms: String(this.reviewTerms.length),
        playbooks: String(this.playbooks.length),
        attachments: "0",
        attachmentBytes: "0",
      },
      stateSha256,
      reportSha256,
    });
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

  async commitTradeReviews(command: PreparedTradeReviewBatch): Promise<TradeReviewCommitResult> {
    this.assertOpen();
    const reviews = verifyTradeReviewBatch(command);
    const projection = normalizeTrades(this.executions);
    const activeTradeBySubjectId = new Map(
      tradeSubjectsForProjection(projection).map((subject) => {
        const trade = projection.trades.find((candidate) => (
          candidate.id === subject.projectionTradeId
        ));
        if (trade === undefined) throw new Error("A session trade subject lost its projection.");
        return [subject.tradeSubjectId, trade] as const;
      }),
    );
    const batchSubmissionIds = new Set<string>();
    const batchSubjectIds = new Set<string>();
    const existingReviewIds = new Map<string, string>();
    const newReviews: PreparedTradeReview[] = [];

    for (const review of reviews) {
      if (batchSubmissionIds.has(review.submissionId)) {
        throw sessionReviewError(
          "submission_changed",
          "A trade review submission can appear only once in an atomic batch.",
        );
      }
      batchSubmissionIds.add(review.submissionId);
      if (batchSubjectIds.has(review.tradeSubjectId)) {
        throw sessionReviewError(
          "review_changed",
          "An atomic batch can create only one new head for each trade.",
        );
      }
      batchSubjectIds.add(review.tradeSubjectId);

      const priorSubmission = this.reviewSubmissionById.get(review.submissionId);
      if (priorSubmission !== undefined) {
        if (priorSubmission.revision !== review.revision) {
          throw sessionReviewError(
            "submission_changed",
            "This trade review submission was already saved with different values.",
          );
        }
        existingReviewIds.set(review.submissionId, priorSubmission.reviewId);
        continue;
      }

      const activeTrade = activeTradeBySubjectId.get(review.tradeSubjectId);
      if (activeTrade === undefined) {
        throw sessionReviewError(
          "trade_changed",
          "This trade is no longer part of the active immutable ledger projection.",
        );
      }
      if (
        review.initialRisk !== null
        && review.initialRisk.currency !== activeTrade.quoteCurrency
      ) {
        throw sessionReviewError(
          "trade_changed",
          `Initial risk must use this trade's ${activeTrade.quoteCurrency} P&L currency.`,
        );
      }

      const currentHeadId = this.reviewHeadByTradeSubjectId.get(review.tradeSubjectId) ?? null;
      if (currentHeadId !== review.expectedPreviousReviewId) {
        throw sessionReviewError(
          "review_changed",
          "This trade review changed after it was opened. Reload the latest review before saving.",
        );
      }
      newReviews.push(review);
    }

    if (existingReviewIds.size > 0 && newReviews.length > 0) {
      throw sessionReviewError(
        "submission_changed",
        "An atomic review batch cannot mix saved and unsaved submissions.",
      );
    }
    if (newReviews.length === 0) {
      return {
        outcome: "duplicate",
        reviewIds: reviews.map((review) => {
          const id = existingReviewIds.get(review.submissionId);
          if (id === undefined) throw new Error("A duplicate session review lost its version ID.");
          return id;
        }),
        ledger: await this.load(),
      };
    }

    const observedNowMs = this.runtime.nowMs();
    if (!Number.isSafeInteger(observedNowMs) || observedNowMs < 0) {
      throw sessionReviewError(
        "submission_changed",
        "The browser session clock is outside the journal range.",
      );
    }
    const firstRecordedAtMs = Math.max(observedNowMs, this.lastReviewRecordedAtMs + 1);
    if (!Number.isSafeInteger(firstRecordedAtMs + newReviews.length - 1)) {
      throw sessionReviewError(
        "submission_changed",
        "The browser session exhausted the review timestamp range.",
      );
    }

    const nextReviewVersions = [...this.reviewVersions];
    const nextHeads = new Map(this.reviewHeadByTradeSubjectId);
    const nextTerms = [...this.reviewTerms];
    const nextPlaybooks = this.playbooks.map((playbook) => ({
      ...playbook,
      rules: [...playbook.rules],
    }));
    const nextSubmissions = new Map(this.reviewSubmissionById);
    const createdReviewIdBySubmission = new Map<string, string>();

    newReviews.forEach((review, index) => {
      const previousReviewId = nextHeads.get(review.tradeSubjectId) ?? null;
      const previousReview = previousReviewId === null
        ? null
        : nextReviewVersions.find((candidate) => candidate.id === previousReviewId) ?? null;
      if (previousReviewId !== null && previousReview === null) {
        throw new Error("A session trade-review head lost its immutable version.");
      }
      const version = (previousReview?.version ?? 0) + 1;
      if (!Number.isSafeInteger(version)) {
        throw sessionReviewError("review_changed", "This trade exhausted its review version range.");
      }
      const recordedAtMs = firstRecordedAtMs + index;
      const recordedAtUs = `${recordedAtMs}000`;
      const vocabulary = materializeReviewVocabulary(nextTerms, nextPlaybooks, review);
      const reviewId = `session-review:${sha256Hex(JSON.stringify([
        review.tradeSubjectId,
        review.submissionId,
        review.revision,
      ]))}`;
      const created: JournalTradeReviewRecord = Object.freeze({
        id: reviewId,
        tradeSubjectId: review.tradeSubjectId,
        version,
        state: review.state,
        revision: review.revision,
        note: review.note,
        ...vocabulary,
        initialRisk: review.initialRisk === null
          ? null
          : Object.freeze({ amount: review.initialRisk.amount, currency: review.initialRisk.currency }),
        plannedStop: review.plannedStop,
        resultRMetricId: RESULT_R_METRIC_ID,
        resultRMetricVersion: review.resultRVersion,
        percentReturnMetricId: PERCENT_RETURN_METRIC_ID,
        percentReturnMetricVersion: review.percentReturnVersion,
        recordedAtUs,
        completedAtUs: review.state === "completed" ? recordedAtUs : null,
      });
      nextReviewVersions.push(created);
      nextHeads.set(review.tradeSubjectId, reviewId);
      nextSubmissions.set(review.submissionId, {
        revision: review.revision,
        reviewId,
      });
      createdReviewIdBySubmission.set(review.submissionId, reviewId);
    });

    this.reviewVersions = nextReviewVersions;
    this.reviewHeadByTradeSubjectId = nextHeads;
    this.reviewTerms = nextTerms;
    this.playbooks = nextPlaybooks;
    this.reviewSubmissionById = nextSubmissions;
    this.lastReviewRecordedAtMs = firstRecordedAtMs + newReviews.length - 1;
    return {
      outcome: "committed",
      reviewIds: reviews.map((review) => (
        existingReviewIds.get(review.submissionId)
          ?? createdReviewIdBySubmission.get(review.submissionId)
          ?? (() => { throw new Error("A committed session review lost its version ID."); })()
      )),
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
