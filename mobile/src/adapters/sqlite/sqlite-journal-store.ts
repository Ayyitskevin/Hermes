import type {
  JournalAccountRecord,
  JournalImportReceipt,
  JournalInstrumentRecord,
  JournalLedgerSnapshot,
  JournalPlaybookRecord,
  JournalReviewRuleOutcome,
  JournalReviewTermCategory,
  JournalReviewTermRecord,
  JournalStore,
  JournalTradeSubjectRecord,
  JournalTradeReviewRecord,
  JournalWorkspaceRecord,
  ManualExecutionCommitResult,
  PreparedTradeReviewBatch,
  PreparedCsvImport,
  TradeReviewCommitResult,
  CsvImportCommitResult,
  UnacknowledgedManualExecution,
} from "../../application/journal-store";
import {
  JournalImportError,
  JournalManualExecutionError,
  JournalTradeReviewError,
} from "../../application/journal-store";
import {
  type PreparedManualExecution,
  verifyPreparedManualExecution,
} from "../../application/prepare-manual-execution";
import { verifyPreparedCsvImport } from "../../application/prepare-csv-import";
import {
  type PreparedTradeReview,
  tradeReviewBatchRevision,
  verifyPreparedTradeReview,
} from "../../application/prepare-trade-review";
import type { SqlDatabase, SqlRow } from "../../application/sql-database";
import { currencyMinorUnit } from "../../core/currency";
import type {
  ExecutionFee,
  LedgerExecution,
  TradeAllocation,
  TradeNormalizationResult,
} from "../../core/ledger";
import { normalizeTrades } from "../../core/normalize-trades";
import {
  MOBILE_SCHEMA_MIGRATIONS,
  sha256Hex,
} from "./schema";
import { stableTradeSubjectHash } from "./trade-subject";

const WORKSPACE_ID = "workspace:primary";
const PARSER_ID = "generic-csv";
const PARSER_VERSION = 1;

export interface JournalStoreRuntime {
  nowMs(): number;
  newId(prefix: string): string;
}

const DEFAULT_RUNTIME: JournalStoreRuntime = {
  nowMs: () => Date.now(),
  newId(prefix) {
    const uuid = globalThis.crypto?.randomUUID?.();
    if (uuid === undefined) {
      throw new Error("A cryptographically secure UUID source is required for the journal ledger.");
    }
    return `${prefix}:${uuid}`;
  },
};

interface ActiveExecutionRow extends SqlRow {
  execution_id: unknown;
  execution_version_id: unknown;
  account_id: unknown;
  instrument_id: unknown;
  side: unknown;
  position_effect: unknown;
  quantity_text: unknown;
  price_text: unknown;
  quote_currency_code: unknown;
  executed_at_us_text: unknown;
  ledger_sequence_text: unknown;
  multiplier_text: unknown;
}

interface ActiveFeeRow extends SqlRow {
  execution_version_id: unknown;
  category: unknown;
  currency_code: unknown;
  cost_minor_text: unknown;
  minor_unit_exponent: unknown;
}

interface LoadedExecutions {
  readonly executions: readonly LedgerExecution[];
  readonly versionIdByExecutionId: ReadonlyMap<string, string>;
}

interface LoadedReviewState {
  readonly tradeReviews: readonly JournalTradeReviewRecord[];
  readonly reviewTerms: readonly JournalReviewTermRecord[];
  readonly playbooks: readonly JournalPlaybookRecord[];
}

function requireText(row: SqlRow, column: string): string {
  const value = row[column];
  if (typeof value !== "string") {
    throw new Error(`SQLite returned an invalid ${column} value.`);
  }
  return value;
}

function nullableText(row: SqlRow, column: string): string | null {
  const value = row[column];
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") {
    throw new Error(`SQLite returned an invalid ${column} value.`);
  }
  return value;
}

function requireSafeInteger(row: SqlRow, column: string): number {
  const value = row[column];
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`SQLite returned an invalid ${column} value.`);
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(value);
}

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizedReviewName(value: string): string {
  return value.toLocaleLowerCase("en-US");
}

function verifyTradeReviewBatchForCommit(
  command: PreparedTradeReviewBatch,
): readonly PreparedTradeReview[] {
  try {
    if (!Array.isArray(command.reviews) || command.reviews.length === 0) {
      throw new Error("A trade-review batch must contain at least one reviewed trade.");
    }
    const verified = command.reviews.map((review) => verifyPreparedTradeReview(review));
    if (tradeReviewBatchRevision(command.batchId, verified) !== command.revision) {
      throw new Error("Trade-review batch values changed after review. Review them again.");
    }
    return verified;
  } catch (error) {
    if (error instanceof JournalTradeReviewError) throw error;
    throw new JournalTradeReviewError({
      code: "review_changed",
      message: error instanceof Error ? error.message : "The trade-review batch is invalid.",
    });
  }
}

function isoToEpochMicroseconds(instant: string): string {
  const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,9}))?Z$/.exec(instant);
  if (match === null) throw new Error(`Unsupported canonical execution timestamp: ${instant}`);
  const epochMilliseconds = Date.parse(`${match[1]}.000Z`);
  if (!Number.isSafeInteger(epochMilliseconds) || epochMilliseconds < 0) {
    throw new Error(`Execution timestamp is outside the local ledger range: ${instant}`);
  }
  const fraction = match[2] ?? "";
  if (/[^0]/.test(fraction.slice(6))) {
    throw new Error("Execution timestamps may contain at most microsecond precision.");
  }
  const microseconds = fraction.slice(0, 6).padEnd(6, "0");
  return String((BigInt(epochMilliseconds) / 1000n) * 1_000_000n + BigInt(microseconds));
}

function decimalToMinorUnits(value: string, exponent: number): string {
  const match = /^(0|[1-9][0-9]*)(?:\.([0-9]+))?$/.exec(value);
  if (match === null) throw new Error(`Fee is not a canonical decimal: ${value}`);
  const whole = match[1] ?? "0";
  const fraction = match[2] ?? "";
  if (/[^0]/.test(fraction.slice(exponent))) {
    throw new Error(`Fee ${value} has more precision than the currency supports.`);
  }
  return `${whole}${fraction.slice(0, exponent).padEnd(exponent, "0")}`.replace(/^0+(?=[0-9])/, "");
}

function feeCategory(value: string): ExecutionFee["category"] {
  switch (value) {
    case "commission": return "COMMISSION";
    case "regulatory": return "REGULATORY";
    case "exchange": return "EXCHANGE";
    case "routing": return "ROUTING";
    case "other": return "OTHER";
    default: throw new Error(`SQLite returned an unknown fee category: ${value}`);
  }
}

function emptyLedger(): JournalLedgerSnapshot {
  return {
    workspace: null,
    accounts: [],
    instruments: [],
    executions: [],
    projection: normalizeTrades([]),
    tradeSubjects: [],
    tradeReviews: [],
    reviewTerms: [],
    playbooks: [],
    imports: [],
  };
}

export class SqliteJournalStore implements JournalStore {
  private schemaVerified = false;
  private closed = false;

  constructor(
    private readonly database: SqlDatabase,
    private readonly runtime: JournalStoreRuntime = DEFAULT_RUNTIME,
  ) {}

  async load(): Promise<JournalLedgerSnapshot> {
    this.assertOpen();
    await this.verifySchema();
    return this.loadWithinConnection();
  }

  async commitCsvImport(command: PreparedCsvImport): Promise<CsvImportCommitResult> {
    this.assertOpen();
    await this.verifySchema();
    const verified = verifyPreparedCsvImport(command);
    const preview = verified.preview;
    if (preview.rows.length === 0) {
      throw new JournalImportError({
        code: "preview_changed",
        message: "The CSV has no valid execution rows to import.",
        issues: preview.issues,
      });
    }

    const currency = command.defaultCurrency;
    const minorUnit = currencyMinorUnit(currency);
    if (minorUnit === null) {
      throw new JournalImportError({
        code: "preview_changed",
        message: `${currency} is not yet supported by the execution ledger.`,
      });
    }

    const transactionResult = await this.database.transaction(async () => {
      const nowMs = this.runtime.nowMs();
      await this.ensureWorkspace(command, currency, minorUnit, nowMs);
      const accountId = await this.ensureAccount(command.accountName, currency, nowMs);
      const inputHash = sha256Hex(command.rawInput);
      const mappingJson = canonicalJson({
        columns: command.mapping ?? {},
        timeZone: command.timeZone,
        defaultCurrency: command.defaultCurrency,
      });
      const mappingHash = sha256Hex(mappingJson);
      const duplicate = await this.database.query<SqlRow>(
        `SELECT receipt.id AS receipt_id
           FROM import_batches AS batch
           JOIN import_receipts AS receipt ON receipt.batch_id = batch.id
           LEFT JOIN import_rollbacks AS rollback ON rollback.import_receipt_id = receipt.id
          WHERE batch.workspace_id = ?
            AND batch.account_id = ?
            AND batch.input_sha256 = ?
            AND batch.parser_id = ?
            AND batch.parser_version = ?
            AND batch.mapping_sha256 = ?
            AND rollback.id IS NULL
          LIMIT 1`,
        [WORKSPACE_ID, accountId, inputHash, PARSER_ID, PARSER_VERSION, mappingHash],
      );
      const duplicateReceiptId = duplicate[0] === undefined
        ? null
        : requireText(duplicate[0], "receipt_id");
      if (duplicateReceiptId !== null) {
        return { outcome: "duplicate" as const, receiptId: duplicateReceiptId };
      }

      const batchId = this.runtime.newId("import-batch");
      await this.database.run(
        `INSERT INTO import_batches (
          id, workspace_id, account_id, source_kind, source_name, parser_id, parser_version,
          input_sha256, mapping_json, mapping_sha256, imported_at_ms
        ) VALUES (?, ?, ?, 'generic_csv', ?, ?, ?, ?, ?, ?, ?)`,
        [
          batchId,
          WORKSPACE_ID,
          accountId,
          command.sourceName,
          PARSER_ID,
          PARSER_VERSION,
          inputHash,
          mappingJson,
          mappingHash,
          nowMs,
        ],
      );

      const previewByRow = new Map(preview.rows.map((row) => [row.source.logicalRow, row]));
      const sourceIdByRow = new Map<number, string>();
      for (const record of preview.document.records.slice(1)) {
        const sourceRowId = this.runtime.newId("import-row");
        sourceIdByRow.set(record.logicalRow, sourceRowId);
        const normalized = previewByRow.get(record.logicalRow) ?? null;
        const normalizedJson = canonicalJson(normalized ?? { skipped: true });
        await this.database.run(
          `INSERT INTO import_source_rows (
            id, batch_id, row_ordinal, source_text, normalized_row_json, row_sha256
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            sourceRowId,
            batchId,
            record.logicalRow - 1,
            record.sourceText,
            normalizedJson,
            sha256Hex(record.sourceText),
          ],
        );
      }

      for (const issue of preview.issues) {
        const sourceRowId = issue.location === undefined
          ? null
          : sourceIdByRow.get(issue.location.logicalRow) ?? null;
        await this.database.run(
          `INSERT INTO import_issues (
            id, batch_id, source_row_id, severity, issue_code, column_name,
            message, details_json, created_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            this.runtime.newId("import-issue"),
            batchId,
            sourceRowId,
            issue.severity,
            issue.code,
            "field" in issue ? issue.field ?? null : null,
            issue.message,
            canonicalJson(issue),
            nowMs,
          ],
        );
      }

      let insertedExecutions = 0;
      let nextExecutionSequence = await this.nextExecutionSequenceStart();
      const fallbackOccurrences = new Map<string, number>();
      for (const row of preview.rows) {
        const instrumentId = await this.ensureInstrument(row.symbol, currency, "stock", nowMs);
        const sourceRowId = sourceIdByRow.get(row.source.logicalRow);
        if (sourceRowId === undefined) throw new Error("A preview row lost its immutable source record.");
        const fallbackIdentity = canonicalJson({
          executedAt: row.executedAt,
          side: row.side,
          positionEffect: row.positionEffect,
          quantity: row.quantity,
          price: row.price,
        });
        const fallbackHash = sha256Hex(fallbackIdentity);
        const occurrenceKey = `${instrumentId}:${fallbackHash}`;
        const fallbackOrdinal = (fallbackOccurrences.get(occurrenceKey) ?? 0) + 1;
        fallbackOccurrences.set(occurrenceKey, fallbackOrdinal);
        const stableSourceKey = row.executionId === null
          ? `${PARSER_ID}:v${PARSER_VERSION}:fingerprint:${fallbackHash}:${fallbackOrdinal}`
          : `${PARSER_ID}:v${PARSER_VERSION}:external:${row.executionId}`;
        const identityHash = sha256Hex(canonicalJson(row.executionId === null
          ? { workspaceId: WORKSPACE_ID, accountId, instrumentId, stableSourceKey }
          : {
              workspaceId: WORKSPACE_ID,
              accountId,
              parserId: PARSER_ID,
              externalExecutionId: row.executionId,
            }));
        const payload = canonicalJson({
          executionId: row.executionId,
          symbol: row.symbol,
          side: row.side,
          positionEffect: row.positionEffect,
          quantity: row.quantity,
          price: row.price,
          fee: row.fee,
          currency: row.currency,
          executedAt: row.executedAt,
        });
        const payloadHash = sha256Hex(payload);
        const existing = await this.database.query<SqlRow>(
          `SELECT execution.id AS execution_id, version.id AS current_version_id,
                  version.is_void, version.version_number,
                  CAST(execution.ledger_sequence AS TEXT) AS current_ledger_sequence_text,
                  (
                    SELECT source.source_payload_sha256
                      FROM execution_sources AS source
                      JOIN execution_versions AS source_version
                        ON source_version.id = source.execution_version_id
                     WHERE source_version.execution_id = execution.id
                     ORDER BY source_version.version_number DESC
                     LIMIT 1
                  ) AS source_payload_sha256
             FROM executions AS execution
             JOIN execution_heads AS head ON head.execution_id = execution.id
             JOIN execution_versions AS version ON version.id = head.execution_version_id
            WHERE execution.workspace_id = ? AND execution.identity_sha256 = ?
            LIMIT 1`,
          [WORKSPACE_ID, identityHash],
        );
        let executionId: string;
        let versionNumber = 1;
        let ledgerSequence: string;
        if (existing[0] !== undefined) {
          if (requireText(existing[0], "source_payload_sha256") !== payloadHash) {
            throw new JournalImportError({
              code: "execution_changed",
              message: `Row ${row.source.logicalRow} has the same source identity as an existing execution but different values.`,
            });
          }
          if (requireSafeInteger(existing[0], "is_void") === 0) {
            await this.recordImportOccurrence({
              batchId,
              sourceRowId,
              accountId,
              executionId: requireText(existing[0], "execution_id"),
              executionVersionId: requireText(existing[0], "current_version_id"),
              occurrenceKind: "duplicate",
              nowMs,
            });
            await this.database.run(
              `INSERT INTO import_issues (
                id, batch_id, source_row_id, severity, issue_code, message, created_at_ms
              ) VALUES (?, ?, ?, 'warning', 'duplicate_execution', ?, ?)`,
              [
                this.runtime.newId("import-issue"),
                batchId,
                sourceRowId,
                `Row ${row.source.logicalRow} already exists and was not duplicated.`,
                nowMs,
              ],
            );
            continue;
          }
          executionId = requireText(existing[0], "execution_id");
          versionNumber = requireSafeInteger(existing[0], "version_number") + 1;
          ledgerSequence = requireText(existing[0], "current_ledger_sequence_text");
        } else {
          executionId = this.runtime.newId("execution");
          if (!Number.isSafeInteger(nextExecutionSequence)) {
            throw new Error("The journal exhausted its stable execution ordering range.");
          }
          ledgerSequence = String(nextExecutionSequence);
          nextExecutionSequence += 1;
          await this.database.run(
            `INSERT INTO executions (
              id, workspace_id, account_id, instrument_id, ledger_sequence,
              identity_sha256, created_at_ms
            ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
              executionId,
              WORKSPACE_ID,
              accountId,
              instrumentId,
              ledgerSequence,
              identityHash,
              nowMs,
            ],
          );
        }

        const versionId = this.runtime.newId("execution-version");
        const versionHash = sha256Hex(canonicalJson({
          payloadHash,
          versionNumber,
          ledgerSequence,
          restoredByBatchId: versionNumber === 1 ? null : batchId,
          isVoid: false,
        }));
        await this.database.run(
          `INSERT INTO execution_versions (
            id, execution_id, workspace_id, version_number, side, position_effect,
            quantity_text, price_text, quote_currency_code, executed_at_us,
            external_execution_id, is_void, edit_reason,
            version_sha256, recorded_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?)`,
          [
            versionId,
            executionId,
            WORKSPACE_ID,
            versionNumber,
            row.side,
            row.positionEffect === "unspecified" ? "auto" : row.positionEffect,
            row.quantity,
            row.price,
            currency,
            isoToEpochMicroseconds(row.executedAt),
            row.executionId,
            versionNumber === 1 ? null : "Restored by a later import after receipt rollback.",
            versionHash,
            nowMs,
          ],
        );
        const feeMinor = decimalToMinorUnits(row.fee, minorUnit);
        if (feeMinor !== "0") {
          await this.database.run(
            `INSERT INTO execution_fee_components (
              execution_version_id, workspace_id, component_ordinal, category,
              currency_code, cost_minor
            ) VALUES (?, ?, 0, 'commission', ?, ?)`,
            [versionId, WORKSPACE_ID, currency, feeMinor],
          );
        }
        await this.database.run(
          `INSERT INTO execution_sources (
            id, execution_version_id, workspace_id, source_kind, import_batch_id,
            import_source_row_id, stable_source_key, source_payload_sha256, recorded_at_ms
          ) VALUES (?, ?, ?, 'import', ?, ?, ?, ?, ?)`,
          [
            this.runtime.newId("execution-source"),
            versionId,
            WORKSPACE_ID,
            batchId,
            sourceRowId,
            stableSourceKey,
            payloadHash,
            nowMs,
          ],
        );
        await this.recordImportOccurrence({
          batchId,
          sourceRowId,
          accountId,
          executionId,
          executionVersionId: versionId,
          occurrenceKind: versionNumber === 1 ? "created" : "restored",
          nowMs,
        });
        if (versionNumber === 1) {
          await this.database.run(
            `INSERT INTO execution_heads (
              execution_id, workspace_id, execution_version_id, changed_at_ms
            ) VALUES (?, ?, ?, ?)`,
            [executionId, WORKSPACE_ID, versionId, nowMs],
          );
        } else {
          await this.database.run(
            `UPDATE execution_heads
                SET execution_version_id = ?, changed_at_ms = ?
              WHERE execution_id = ?`,
            [versionId, nowMs, executionId],
          );
        }
        insertedExecutions += 1;
      }

      const loaded = await this.loadActiveExecutions();
      const projection = normalizeTrades(loaded.executions);
      const projectionHash = await this.persistProjection(
        projection,
        loaded.versionIdByExecutionId,
        "import",
        nowMs,
      );
      const receiptId = this.runtime.newId("import-receipt");
      const warningCount = preview.issues.filter((issue) => issue.severity === "warning").length
        + (preview.rows.length - insertedExecutions);
      await this.database.run(
        `INSERT INTO import_receipts (
          id, batch_id, outcome, source_row_count, accepted_row_count,
          rejected_row_count, skipped_row_count, warning_count,
          execution_version_count, result_sha256, recorded_at_ms
        ) VALUES (?, ?, 'committed', ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          receiptId,
          batchId,
          preview.totalDataRows,
          preview.validRows,
          preview.rejectedRows,
          preview.skippedRows,
          warningCount,
          insertedExecutions,
          projectionHash,
          nowMs,
        ],
      );
      return { outcome: "committed" as const, receiptId };
    });

    const ledger = await this.loadWithinConnection();
    const receipt = ledger.imports.find((item) => item.id === transactionResult.receiptId);
    if (receipt === undefined) throw new Error("The committed import receipt could not be reloaded.");
    return { outcome: transactionResult.outcome, receipt, ledger };
  }

  async commitManualExecution(
    command: PreparedManualExecution,
  ): Promise<ManualExecutionCommitResult> {
    this.assertOpen();
    await this.verifySchema();
    const verified = verifyPreparedManualExecution(command);
    const transactionResult = await this.database.transaction(async () => {
      const nowMs = this.runtime.nowMs();
      await this.ensureWorkspace(
        verified,
        verified.defaultCurrency,
        verified.minorUnit,
        nowMs,
        "manual",
      );
      const accountId = await this.ensureAccount(
        verified.accountName,
        verified.defaultCurrency,
        nowMs,
      );
      const instrumentId = await this.ensureInstrument(
        verified.symbol,
        verified.defaultCurrency,
        verified.assetClass,
        nowMs,
      );
      const commandJson = canonicalJson(verified);
      const submissionRows = await this.database.query<SqlRow>(
        `SELECT revision_sha256, command_json, state, execution_id
           FROM manual_execution_submissions
          WHERE submission_id = ? AND workspace_id = ?
          LIMIT 1`,
        [verified.submissionId, WORKSPACE_ID],
      );
      const submission = submissionRows[0];
      let submissionState: "pending" | "committed";
      if (submission === undefined) {
        await this.database.run(
          `INSERT INTO manual_execution_submissions (
            submission_id, workspace_id, revision_sha256, command_json,
            state, created_at_ms
          ) VALUES (?, ?, ?, ?, 'pending', ?)`,
          [
            verified.submissionId,
            WORKSPACE_ID,
            verified.revision,
            commandJson,
            nowMs,
          ],
        );
        submissionState = "pending";
      } else {
        if (
          requireText(submission, "revision_sha256") !== verified.revision
          || requireText(submission, "command_json") !== commandJson
        ) {
          throw new JournalManualExecutionError({
            code: "submission_changed",
            message: "This manual submission was already staged with different reviewed values.",
          });
        }
        const state = requireText(submission, "state");
        if (state !== "pending" && state !== "committed") {
          throw new Error("The manual execution submission has an invalid state.");
        }
        submissionState = state;
      }
      const stableSourceKey = `manual:v1:${verified.submissionId}`;
      const identityHash = sha256Hex(canonicalJson({
        workspaceId: WORKSPACE_ID,
        sourceKind: "manual",
        stableSourceKey,
      }));
      const payloadHash = sha256Hex(canonicalJson({
        accountId,
        instrumentId,
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
      const existing = await this.database.query<SqlRow>(
        `SELECT execution.id AS execution_id, version.is_void,
                source.source_payload_sha256
           FROM executions AS execution
           JOIN execution_heads AS head ON head.execution_id = execution.id
           JOIN execution_versions AS version ON version.id = head.execution_version_id
           JOIN execution_sources AS source
             ON source.execution_version_id = version.id
            AND source.source_kind = 'manual'
          WHERE execution.workspace_id = ? AND execution.identity_sha256 = ?
          LIMIT 1`,
        [WORKSPACE_ID, identityHash],
      );
      if (existing[0] !== undefined) {
        const executionId = requireText(existing[0], "execution_id");
        if (requireText(existing[0], "source_payload_sha256") !== payloadHash) {
          throw new JournalManualExecutionError({
            code: "execution_changed",
            message: "This manual submission was already saved with different execution values.",
          });
        }
        if (requireSafeInteger(existing[0], "is_void") !== 0) {
          throw new JournalManualExecutionError({
            code: "execution_changed",
            message: "This manual submission was superseded and cannot be replayed.",
          });
        }
        if (submissionState === "pending") {
          await this.database.run(
            `UPDATE manual_execution_submissions
                SET state = 'committed', execution_id = ?, committed_at_ms = ?
              WHERE submission_id = ? AND workspace_id = ? AND state = 'pending'`,
            [executionId, nowMs, verified.submissionId, WORKSPACE_ID],
          );
        }
        return { outcome: "duplicate" as const, executionId };
      }

      const executionId = this.runtime.newId("execution");
      const versionId = this.runtime.newId("execution-version");
      const ledgerSequence = await this.nextExecutionSequenceStart();
      await this.database.run(
        `INSERT INTO executions (
          id, workspace_id, account_id, instrument_id, ledger_sequence,
          identity_sha256, created_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          executionId,
          WORKSPACE_ID,
          accountId,
          instrumentId,
          ledgerSequence,
          identityHash,
          nowMs,
        ],
      );
      const versionHash = sha256Hex(canonicalJson({
        payloadHash,
        versionNumber: 1,
        ledgerSequence,
        sourceKind: "manual",
        isVoid: false,
      }));
      await this.database.run(
        `INSERT INTO execution_versions (
          id, execution_id, workspace_id, version_number, side, position_effect,
          quantity_text, price_text, quote_currency_code, executed_at_us,
          is_void, version_sha256, recorded_at_ms
        ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
        [
          versionId,
          executionId,
          WORKSPACE_ID,
          verified.side.toLocaleLowerCase("en-US"),
          verified.positionEffect.toLocaleLowerCase("en-US"),
          verified.quantity,
          verified.price,
          verified.defaultCurrency,
          verified.occurredAtUs,
          versionHash,
          nowMs,
        ],
      );
      if (verified.feeMinor !== "0") {
        await this.database.run(
          `INSERT INTO execution_fee_components (
            execution_version_id, workspace_id, component_ordinal, category,
            currency_code, cost_minor
          ) VALUES (?, ?, 0, 'commission', ?, ?)`,
          [versionId, WORKSPACE_ID, verified.defaultCurrency, verified.feeMinor],
        );
      }
      await this.database.run(
        `INSERT INTO execution_sources (
          id, execution_version_id, workspace_id, source_kind,
          stable_source_key, source_payload_sha256, recorded_at_ms
        ) VALUES (?, ?, ?, 'manual', ?, ?, ?)`,
        [
          this.runtime.newId("execution-source"),
          versionId,
          WORKSPACE_ID,
          stableSourceKey,
          payloadHash,
          nowMs,
        ],
      );
      await this.database.run(
        `INSERT INTO execution_heads (
          execution_id, workspace_id, execution_version_id, changed_at_ms
        ) VALUES (?, ?, ?, ?)`,
        [executionId, WORKSPACE_ID, versionId, nowMs],
      );

      const loaded = await this.loadActiveExecutions();
      const projection = normalizeTrades(loaded.executions);
      await this.persistProjection(
        projection,
        loaded.versionIdByExecutionId,
        "edit",
        nowMs,
      );
      await this.database.run(
        `UPDATE manual_execution_submissions
            SET state = 'committed', execution_id = ?, committed_at_ms = ?
          WHERE submission_id = ? AND workspace_id = ? AND state = 'pending'`,
        [executionId, nowMs, verified.submissionId, WORKSPACE_ID],
      );
      return { outcome: "committed" as const, executionId };
    });
    return { ...transactionResult, ledger: await this.loadWithinConnection() };
  }

  async commitTradeReviews(command: PreparedTradeReviewBatch): Promise<TradeReviewCommitResult> {
    this.assertOpen();
    await this.verifySchema();
    const verifiedReviews = verifyTradeReviewBatchForCommit(command);
    const subjectIds = new Set<string>();
    const submissionIds = new Set<string>();
    for (const review of verifiedReviews) {
      if (subjectIds.has(review.tradeSubjectId)) {
        throw new JournalTradeReviewError({
          code: "review_changed",
          message: "A trade-review batch cannot revise the same trade more than once.",
        });
      }
      if (submissionIds.has(review.submissionId)) {
        throw new JournalTradeReviewError({
          code: "submission_changed",
          message: "A trade-review batch cannot reuse one submission ID.",
        });
      }
      subjectIds.add(review.tradeSubjectId);
      submissionIds.add(review.submissionId);
    }

    const transactionResult = await this.database.transaction(async () => {
      const observedNowMs = this.runtime.nowMs();
      if (!Number.isSafeInteger(observedNowMs) || observedNowMs < 0) {
        throw new Error("The journal clock is outside the supported review range.");
      }
      const workspaceRows = await this.database.query<SqlRow>(
        "SELECT id FROM workspaces WHERE id = ? LIMIT 1",
        [WORKSPACE_ID],
      );
      if (workspaceRows[0] === undefined) {
        throw new JournalTradeReviewError({
          code: "trade_changed",
          message: "Import or add an execution before saving a trade review.",
        });
      }

      const existingReviewIds = new Map<string, string>();
      for (const review of verifiedReviews) {
        const existingRows = await this.database.query<SqlRow>(
          `SELECT id, trade_subject_id, revision_sha256
             FROM trade_review_versions
            WHERE workspace_id = ? AND submission_id = ?
            LIMIT 1`,
          [WORKSPACE_ID, review.submissionId],
        );
        const existing = existingRows[0];
        if (existing !== undefined) {
          if (
            requireText(existing, "trade_subject_id") !== review.tradeSubjectId
            || requireText(existing, "revision_sha256") !== review.revision
          ) {
            throw new JournalTradeReviewError({
              code: "submission_changed",
              message: "This review submission was already saved with different values.",
            });
          }
          existingReviewIds.set(review.submissionId, requireText(existing, "id"));
        }
      }
      if (existingReviewIds.size > 0 && existingReviewIds.size < verifiedReviews.length) {
        throw new JournalTradeReviewError({
          code: "submission_changed",
          message: "An atomic review batch cannot mix saved and unsaved submissions.",
        });
      }
      if (existingReviewIds.size === verifiedReviews.length) {
        return {
          outcome: "duplicate" as const,
          reviewIds: verifiedReviews.map((review) => {
            const id = existingReviewIds.get(review.submissionId);
            if (id === undefined) throw new Error("A duplicate review lost its version ID.");
            return id;
          }),
        };
      }

      const reviewIds: string[] = [];
      for (const review of verifiedReviews) {
        const activeSubjectRows = await this.database.query<SqlRow>(
          `SELECT projection.quote_currency_code
             FROM projection_active_state AS active
             JOIN trade_projections AS projection
               ON projection.workspace_id = active.workspace_id
              AND projection.rebuild_run_id = active.active_rebuild_run_id
            WHERE active.workspace_id = ?
              AND projection.trade_subject_id = ?
            LIMIT 1`,
          [WORKSPACE_ID, review.tradeSubjectId],
        );
        const activeSubject = activeSubjectRows[0];
        if (activeSubject === undefined) {
          throw new JournalTradeReviewError({
            code: "trade_changed",
            message: "This trade is no longer part of the current execution ledger.",
          });
        }
        if (
          review.initialRisk !== null
          && review.initialRisk.currency !== requireText(activeSubject, "quote_currency_code")
        ) {
          throw new JournalTradeReviewError({
            code: "trade_changed",
            message: "Initial risk must use the trade's exact P&L currency.",
          });
        }

        const headRows = await this.database.query<SqlRow>(
          `SELECT head.review_version_id, version.version_number, version.recorded_at_ms
             FROM trade_review_heads AS head
             JOIN trade_review_versions AS version
               ON version.id = head.review_version_id
              AND version.workspace_id = head.workspace_id
              AND version.trade_subject_id = head.trade_subject_id
            WHERE head.workspace_id = ? AND head.trade_subject_id = ?
            LIMIT 1`,
          [WORKSPACE_ID, review.tradeSubjectId],
        );
        const head = headRows[0];
        const previousReviewId = head === undefined
          ? null
          : requireText(head, "review_version_id");
        if (previousReviewId !== review.expectedPreviousReviewId) {
          throw new JournalTradeReviewError({
            code: "review_changed",
            message: "This trade review changed on another screen. Reload it before saving.",
          });
        }
        const previousVersion = head === undefined
          ? 0
          : requireSafeInteger(head, "version_number");
        const previousRecordedAtMs = head === undefined
          ? 0
          : requireSafeInteger(head, "recorded_at_ms");
        const recordedAtMs = Math.max(observedNowMs, previousRecordedAtMs);
        const reviewId = this.runtime.newId("trade-review");
        const playbook = await this.ensureReviewPlaybook(review.playbook, recordedAtMs);

        await this.database.run(
          `INSERT INTO trade_review_versions (
            id, workspace_id, trade_subject_id, version_number,
            supersedes_version_id, submission_id, revision_sha256, state,
            note_text, playbook_id, initial_risk_amount_text, risk_currency_code,
            planned_stop_price_text, result_r_metric_id, result_r_metric_version,
            percent_return_metric_id, percent_return_metric_version,
            recorded_at_ms, completed_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'result-r', ?,
                    'percent-return', ?, ?, ?)`,
          [
            reviewId,
            WORKSPACE_ID,
            review.tradeSubjectId,
            previousVersion + 1,
            previousReviewId,
            review.submissionId,
            review.revision,
            review.state,
            review.note,
            playbook?.id ?? null,
            review.initialRisk?.amount ?? null,
            review.initialRisk?.currency ?? null,
            review.plannedStop,
            review.resultRVersion,
            review.percentReturnVersion,
            recordedAtMs,
            review.state === "completed" ? recordedAtMs : null,
          ],
        );

        const assignments: readonly {
          readonly category: JournalReviewTermCategory;
          readonly values: readonly string[];
        }[] = [
          { category: "setup", values: review.setup === null ? [] : [review.setup] },
          { category: "mistake", values: review.mistakes },
          { category: "emotion", values: review.emotion === null ? [] : [review.emotion] },
          { category: "tag", values: review.tags },
        ];
        for (const assignment of assignments) {
          for (const [ordinal, value] of assignment.values.entries()) {
            const termId = await this.ensureReviewTerm(
              assignment.category,
              value,
              recordedAtMs,
            );
            await this.database.run(
              `INSERT INTO trade_review_term_assignments (
                review_version_id, workspace_id, trade_subject_id,
                term_id, category, ordinal
              ) VALUES (?, ?, ?, ?, ?, ?)`,
              [
                reviewId,
                WORKSPACE_ID,
                review.tradeSubjectId,
                termId,
                assignment.category,
                ordinal,
              ],
            );
          }
        }

        if (playbook !== null) {
          for (const [ordinal, rule] of playbook.rules.entries()) {
            await this.database.run(
              `INSERT INTO trade_review_rule_results (
                review_version_id, workspace_id, trade_subject_id,
                playbook_rule_id, outcome, rule_name_snapshot, ordinal
              ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                reviewId,
                WORKSPACE_ID,
                review.tradeSubjectId,
                rule.id,
                rule.outcome,
                rule.name,
                ordinal,
              ],
            );
          }
        }

        if (previousReviewId === null) {
          await this.database.run(
            `INSERT INTO trade_review_heads (
              workspace_id, trade_subject_id, review_version_id, changed_at_ms
            ) VALUES (?, ?, ?, ?)`,
            [WORKSPACE_ID, review.tradeSubjectId, reviewId, recordedAtMs],
          );
        } else {
          const update = await this.database.run(
            `UPDATE trade_review_heads
                SET review_version_id = ?, changed_at_ms = ?
              WHERE workspace_id = ? AND trade_subject_id = ?
                AND review_version_id = ?`,
            [
              reviewId,
              recordedAtMs,
              WORKSPACE_ID,
              review.tradeSubjectId,
              previousReviewId,
            ],
          );
          if (update.changes !== 1) {
            throw new JournalTradeReviewError({
              code: "review_changed",
              message: "This trade review changed while it was being saved.",
            });
          }
        }
        reviewIds.push(reviewId);
      }
      return {
        outcome: "committed" as const,
        reviewIds,
      };
    });
    return { ...transactionResult, ledger: await this.loadWithinConnection() };
  }

  async loadUnacknowledgedManualExecutions(): Promise<readonly UnacknowledgedManualExecution[]> {
    this.assertOpen();
    await this.verifySchema();
    const rows = await this.database.query<SqlRow>(
      `SELECT submission.submission_id, submission.execution_id,
              instrument.symbol, version.side
         FROM manual_execution_submissions AS submission
         JOIN executions AS execution
           ON execution.id = submission.execution_id
          AND execution.workspace_id = submission.workspace_id
         JOIN instruments AS instrument ON instrument.id = execution.instrument_id
         JOIN execution_heads AS head ON head.execution_id = execution.id
         JOIN execution_versions AS version ON version.id = head.execution_version_id
        WHERE submission.workspace_id = ?
          AND submission.state = 'committed'
          AND submission.acknowledged_at_ms IS NULL
          AND version.is_void = 0
        ORDER BY submission.created_at_ms, submission.submission_id`,
      [WORKSPACE_ID],
    );
    return rows.map((row) => {
      const side = requireText(row, "side");
      if (side !== "buy" && side !== "sell") {
        throw new Error("SQLite returned an invalid manual execution side.");
      }
      return {
        submissionId: requireText(row, "submission_id"),
        executionId: requireText(row, "execution_id"),
        symbol: requireText(row, "symbol"),
        side: side === "buy" ? "BUY" : "SELL",
      };
    });
  }

  async acknowledgeManualExecution(submissionId: string): Promise<void> {
    this.assertOpen();
    await this.verifySchema();
    const observedNowMs = this.runtime.nowMs();
    const result = await this.database.run(
      `UPDATE manual_execution_submissions
          SET acknowledged_at_ms = CASE
            WHEN committed_at_ms > ? THEN committed_at_ms
            ELSE ?
          END
        WHERE submission_id = ?
          AND workspace_id = ?
          AND state = 'committed'
          AND acknowledged_at_ms IS NULL`,
      [observedNowMs, observedNowMs, submissionId, WORKSPACE_ID],
    );
    if (result.changes === 0) {
      const rows = await this.database.query<SqlRow>(
        `SELECT acknowledged_at_ms
           FROM manual_execution_submissions
          WHERE submission_id = ? AND workspace_id = ? AND state = 'committed'`,
        [submissionId, WORKSPACE_ID],
      );
      if (rows[0] === undefined || rows[0].acknowledged_at_ms === null) {
        throw new Error("The manual execution confirmation is missing.");
      }
    }
  }

  async rollbackImport(receiptId: string, reason: string): Promise<JournalLedgerSnapshot> {
    this.assertOpen();
    await this.verifySchema();
    const normalizedReason = reason.trim();
    if (normalizedReason.length < 3 || normalizedReason.length > 500) {
      throw new Error("Rollback reason must contain 3-500 characters.");
    }

    await this.database.transaction(async () => {
      let nowMs = this.runtime.nowMs();
      const receiptRows = await this.database.query<SqlRow>(
        `SELECT receipt.batch_id, receipt.recorded_at_ms
           FROM import_receipts AS receipt
           LEFT JOIN import_rollbacks AS rollback ON rollback.import_receipt_id = receipt.id
          WHERE receipt.id = ? AND rollback.id IS NULL
          LIMIT 1`,
        [receiptId],
      );
      const receiptRow = receiptRows[0];
      if (receiptRow === undefined) throw new Error("Import receipt is missing or already rolled back.");
      nowMs = Math.max(nowMs, requireSafeInteger(receiptRow, "recorded_at_ms"));
      const batchId = requireText(receiptRow, "batch_id");
      const sourced = await this.database.query<SqlRow>(
        `SELECT DISTINCT execution.id AS execution_id, current.id AS current_version_id,
                current.version_number, current.side, current.position_effect,
                current.quantity_text, current.price_text, current.quote_currency_code,
                CAST(current.executed_at_us AS TEXT) AS executed_at_us_text,
                current.version_sha256
           FROM import_execution_occurrences AS occurrence
           JOIN executions AS execution ON execution.id = occurrence.execution_id
           JOIN execution_heads AS head ON head.execution_id = execution.id
           JOIN execution_versions AS current ON current.id = head.execution_version_id
          WHERE occurrence.import_batch_id = ? AND current.is_void = 0
          ORDER BY execution.id`,
        [batchId],
      );

      let revertedExecutionCount = 0;
      for (const row of sourced) {
        const executionId = requireText(row, "execution_id");
        const activeCoverage = await this.database.query<SqlRow>(
          `SELECT 1 AS covered
             FROM import_execution_occurrences AS occurrence
             JOIN import_receipts AS receipt ON receipt.batch_id = occurrence.import_batch_id
             LEFT JOIN import_rollbacks AS rollback
               ON rollback.import_receipt_id = receipt.id
            WHERE occurrence.execution_id = ?
              AND receipt.id <> ?
              AND rollback.id IS NULL
            LIMIT 1`,
          [executionId, receiptId],
        );
        if (activeCoverage[0] !== undefined) continue;
        const versionId = this.runtime.newId("execution-version");
        const voidHash = sha256Hex(canonicalJson({
          previous: requireText(row, "version_sha256"),
          rollbackReceiptId: receiptId,
          void: true,
        }));
        await this.database.run(
          `INSERT INTO execution_versions (
            id, execution_id, workspace_id, version_number, side, position_effect,
            quantity_text, price_text, quote_currency_code, executed_at_us,
            is_void, edit_reason, version_sha256, recorded_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          [
            versionId,
            executionId,
            WORKSPACE_ID,
            requireSafeInteger(row, "version_number") + 1,
            requireText(row, "side"),
            requireText(row, "position_effect"),
            requireText(row, "quantity_text"),
            requireText(row, "price_text"),
            requireText(row, "quote_currency_code"),
            requireText(row, "executed_at_us_text"),
            normalizedReason,
            voidHash,
            nowMs,
          ],
        );
        await this.database.run(
          `UPDATE execution_heads
              SET execution_version_id = ?, changed_at_ms = ?
            WHERE execution_id = ?`,
          [versionId, nowMs, executionId],
        );
        revertedExecutionCount += 1;
      }

      const loaded = await this.loadActiveExecutions();
      const projection = normalizeTrades(loaded.executions);
      const projectionHash = await this.persistProjection(
        projection,
        loaded.versionIdByExecutionId,
        "rollback",
        nowMs,
      );
      await this.database.run(
        `INSERT INTO import_rollbacks (
          id, import_receipt_id, reason, reverted_execution_count, result_sha256, recorded_at_ms
        ) VALUES (?, ?, ?, ?, ?, ?)`,
        [
          this.runtime.newId("import-rollback"),
          receiptId,
          normalizedReason,
          revertedExecutionCount,
          projectionHash,
          nowMs,
        ],
      );
    });
    return this.loadWithinConnection();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.database.close();
    this.closed = true;
  }

  private async recordImportOccurrence(input: {
    readonly batchId: string;
    readonly sourceRowId: string;
    readonly accountId: string;
    readonly executionId: string;
    readonly executionVersionId: string;
    readonly occurrenceKind: "created" | "restored" | "duplicate";
    readonly nowMs: number;
  }): Promise<void> {
    await this.database.run(
      `INSERT INTO import_execution_occurrences (
        id, import_batch_id, import_source_row_id, workspace_id, account_id,
        execution_id, execution_version_id, occurrence_kind, recorded_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        this.runtime.newId("import-occurrence"),
        input.batchId,
        input.sourceRowId,
        WORKSPACE_ID,
        input.accountId,
        input.executionId,
        input.executionVersionId,
        input.occurrenceKind,
        input.nowMs,
      ],
    );
  }

  private async nextExecutionSequenceStart(): Promise<number> {
    const rows = await this.database.query<SqlRow>(
      "SELECT COALESCE(MAX(ledger_sequence), 0) AS max_sequence FROM executions",
    );
    const maximum = rows[0] === undefined ? 0 : requireSafeInteger(rows[0], "max_sequence");
    if (maximum >= Number.MAX_SAFE_INTEGER) {
      throw new Error("The journal exhausted its stable execution ordering range.");
    }
    return maximum + 1;
  }

  private async ensureReviewTerm(
    category: JournalReviewTermCategory,
    name: string,
    nowMs: number,
  ): Promise<string> {
    const normalizedName = normalizedReviewName(name);
    const rows = await this.database.query<SqlRow>(
      `SELECT id, name
         FROM review_terms
        WHERE workspace_id = ? AND category = ? AND normalized_name = ?
        LIMIT 1`,
      [WORKSPACE_ID, category, normalizedName],
    );
    if (rows[0] !== undefined) return requireText(rows[0], "id");
    const id = this.runtime.newId("review-term");
    await this.database.run(
      `INSERT INTO review_terms (
        id, workspace_id, category, name, normalized_name, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, WORKSPACE_ID, category, name, normalizedName, nowMs],
    );
    return id;
  }

  private async ensureReviewPlaybook(
    playbook: PreparedTradeReview["playbook"],
    nowMs: number,
  ): Promise<{
    readonly id: string;
    readonly rules: readonly {
      readonly id: string;
      readonly name: string;
      readonly outcome: JournalReviewRuleOutcome;
    }[];
  } | null> {
    if (playbook === null) return null;
    const normalizedName = normalizedReviewName(playbook.name);
    const rows = await this.database.query<SqlRow>(
      `SELECT id FROM playbooks
        WHERE workspace_id = ? AND normalized_name = ? LIMIT 1`,
      [WORKSPACE_ID, normalizedName],
    );
    let id: string;
    if (rows[0] === undefined) {
      id = this.runtime.newId("playbook");
      await this.database.run(
        `INSERT INTO playbooks (
          id, workspace_id, name, normalized_name, created_at_ms
        ) VALUES (?, ?, ?, ?, ?)`,
        [id, WORKSPACE_ID, playbook.name, normalizedName, nowMs],
      );
    } else {
      id = requireText(rows[0], "id");
    }
    const rules: {
      id: string;
      name: string;
      outcome: JournalReviewRuleOutcome;
    }[] = [];
    for (const rule of playbook.rules) {
      const normalizedRule = normalizedReviewName(rule.name);
      const existing = await this.database.query<SqlRow>(
        `SELECT id, rule_text FROM playbook_rules
          WHERE workspace_id = ? AND playbook_id = ? AND normalized_rule_text = ?
          LIMIT 1`,
        [WORKSPACE_ID, id, normalizedRule],
      );
      let ruleId: string;
      let ruleName: string;
      if (existing[0] === undefined) {
        ruleId = this.runtime.newId("playbook-rule");
        ruleName = rule.name;
        await this.database.run(
          `INSERT INTO playbook_rules (
            id, workspace_id, playbook_id, rule_text,
            normalized_rule_text, created_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [ruleId, WORKSPACE_ID, id, rule.name, normalizedRule, nowMs],
        );
      } else {
        ruleId = requireText(existing[0], "id");
        ruleName = requireText(existing[0], "rule_text");
      }
      rules.push({ id: ruleId, name: ruleName, outcome: rule.outcome });
    }
    return { id, rules };
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("The journal store is closed.");
  }

  private async verifySchema(): Promise<void> {
    if (this.schemaVerified) return;
    const userVersionRows = await this.database.query<SqlRow>("PRAGMA user_version");
    const expectedUserVersion = MOBILE_SCHEMA_MIGRATIONS.at(-1)?.toVersion ?? 0;
    if (
      userVersionRows[0] === undefined
      || requireSafeInteger(userVersionRows[0], "user_version") !== expectedUserVersion
    ) {
      throw new Error("The journal database user_version does not match this app build.");
    }
    const rows = await this.database.query<SqlRow>(
      "SELECT version, name, checksum_sha256 FROM schema_migrations ORDER BY version",
    );
    if (rows.length !== MOBILE_SCHEMA_MIGRATIONS.length) {
      throw new Error("The journal database migration history is incomplete.");
    }
    rows.forEach((row, index) => {
      const expected = MOBILE_SCHEMA_MIGRATIONS[index];
      if (
        expected === undefined
        || requireSafeInteger(row, "version") !== expected.toVersion
        || requireText(row, "name") !== expected.name
        || requireText(row, "checksum_sha256") !== expected.checksumSha256
      ) {
        throw new Error("The journal database migration checksum does not match this app build.");
      }
    });
    const metricRows = await this.database.query<SqlRow>(
      `SELECT metric_id, version, fraction_digits, rounding_mode
         FROM metric_definitions
        ORDER BY metric_id, version`,
    );
    const metricContract = metricRows.map((row) => ({
      id: requireText(row, "metric_id"),
      version: requireSafeInteger(row, "version"),
      fractionDigits: requireSafeInteger(row, "fraction_digits"),
      rounding: requireText(row, "rounding_mode"),
    }));
    if (canonicalJson(metricContract) !== canonicalJson([
      {
        id: "percent-return",
        version: 1,
        fractionDigits: 12,
        rounding: "half_away_from_zero",
      },
      {
        id: "result-r",
        version: 1,
        fractionDigits: 12,
        rounding: "half_away_from_zero",
      },
    ])) {
      throw new Error("The journal metric-definition registry does not match this app build.");
    }
    this.schemaVerified = true;
  }

  private async ensureWorkspace(
    command: { readonly timeZone: string },
    currency: string,
    minorUnit: number,
    nowMs: number,
    source: "import" | "manual" = "import",
  ): Promise<void> {
    await this.database.run(
      `INSERT INTO currencies (code, minor_unit_exponent, display_name)
       VALUES (?, ?, ?) ON CONFLICT(code) DO NOTHING`,
      [currency, minorUnit, currency],
    );
    const rows = await this.database.query<SqlRow>(
      "SELECT default_currency_code, time_zone_id FROM workspaces WHERE id = ?",
      [WORKSPACE_ID],
    );
    if (rows[0] === undefined) {
      await this.database.run(
        `INSERT INTO workspaces (
          id, name, default_currency_code, time_zone_id, created_at_ms, updated_at_ms
        ) VALUES (?, 'My Journal', ?, ?, ?, ?)`,
        [WORKSPACE_ID, currency, command.timeZone, nowMs, nowMs],
      );
      return;
    }
    if (
      requireText(rows[0], "default_currency_code") !== currency
      || requireText(rows[0], "time_zone_id") !== command.timeZone
    ) {
      if (source === "manual") {
        throw new JournalManualExecutionError({
          code: "submission_changed",
          message: "This execution must use the journal's existing currency and time zone.",
        });
      }
      throw new JournalImportError({
        code: "preview_changed",
        message: "This import must use the journal's existing currency and time zone.",
      });
    }
  }

  private async ensureAccount(name: string, currency: string, nowMs: number): Promise<string> {
    const rows = await this.database.query<SqlRow>(
      "SELECT id, base_currency_code FROM accounts WHERE workspace_id = ? AND name = ? LIMIT 1",
      [WORKSPACE_ID, name],
    );
    if (rows[0] !== undefined) {
      if (requireText(rows[0], "base_currency_code") !== currency) {
        throw new Error("Existing account currency does not match the import.");
      }
      return requireText(rows[0], "id");
    }
    const id = this.runtime.newId("account");
    await this.database.run(
      `INSERT INTO accounts (
        id, workspace_id, name, account_kind, base_currency_code, created_at_ms
      ) VALUES (?, ?, ?, 'brokerage', ?, ?)`,
      [id, WORKSPACE_ID, name, currency, nowMs],
    );
    return id;
  }

  private async ensureInstrument(
    symbol: string,
    currency: string,
    assetClass: "stock" | "etf",
    nowMs: number,
  ): Promise<string> {
    const rows = await this.database.query<SqlRow>(
      `SELECT id, quote_currency_code, multiplier_text
         FROM instruments
        WHERE workspace_id = ? AND symbol = ? AND asset_class = ?
        LIMIT 1`,
      [WORKSPACE_ID, symbol, assetClass],
    );
    if (rows[0] !== undefined) {
      if (
        requireText(rows[0], "quote_currency_code") !== currency
        || requireText(rows[0], "multiplier_text") !== "1"
      ) {
        throw new Error(`Instrument ${symbol} conflicts with its existing ledger metadata.`);
      }
      return requireText(rows[0], "id");
    }
    const id = this.runtime.newId("instrument");
    await this.database.run(
      `INSERT INTO instruments (
        id, workspace_id, symbol, asset_class, quote_currency_code,
        multiplier_text, created_at_ms
      ) VALUES (?, ?, ?, ?, ?, '1', ?)`,
      [id, WORKSPACE_ID, symbol, assetClass, currency, nowMs],
    );
    return id;
  }

  private async loadActiveExecutions(): Promise<LoadedExecutions> {
    const rows = await this.database.query<ActiveExecutionRow>(
      `SELECT execution.id AS execution_id, version.id AS execution_version_id,
              execution.account_id, execution.instrument_id, version.side,
              version.position_effect, version.quantity_text, version.price_text,
              version.quote_currency_code,
              CAST(version.executed_at_us AS TEXT) AS executed_at_us_text,
              CAST(execution.ledger_sequence AS TEXT) AS ledger_sequence_text,
              instrument.multiplier_text
         FROM executions AS execution
         JOIN execution_heads AS head ON head.execution_id = execution.id
         JOIN execution_versions AS version ON version.id = head.execution_version_id
         JOIN instruments AS instrument ON instrument.id = execution.instrument_id
        WHERE execution.workspace_id = ? AND version.is_void = 0
        ORDER BY version.executed_at_us, execution.ledger_sequence, execution.id`,
      [WORKSPACE_ID],
    );
    const feeRows = await this.database.query<ActiveFeeRow>(
      `SELECT fee.execution_version_id, fee.category, fee.currency_code,
              CAST(fee.cost_minor AS TEXT) AS cost_minor_text,
              currency.minor_unit_exponent
         FROM execution_fee_components AS fee
         JOIN execution_heads AS head ON head.execution_version_id = fee.execution_version_id
         JOIN currencies AS currency ON currency.code = fee.currency_code
        WHERE head.workspace_id = ?
        ORDER BY fee.execution_version_id, fee.component_ordinal`,
      [WORKSPACE_ID],
    );
    const feesByVersion = new Map<string, ExecutionFee[]>();
    for (const row of feeRows) {
      const versionId = requireText(row, "execution_version_id");
      const fees = feesByVersion.get(versionId) ?? [];
      fees.push({
        category: feeCategory(requireText(row, "category")),
        currency: requireText(row, "currency_code"),
        costMinor: requireText(row, "cost_minor_text"),
        minorUnit: requireSafeInteger(row, "minor_unit_exponent"),
      });
      feesByVersion.set(versionId, fees);
    }

    const versionIdByExecutionId = new Map<string, string>();
    const executions = rows.map((row): LedgerExecution => {
      const executionId = requireText(row, "execution_id");
      const versionId = requireText(row, "execution_version_id");
      versionIdByExecutionId.set(executionId, versionId);
      const side = requireText(row, "side");
      const effect = requireText(row, "position_effect");
      if (side !== "buy" && side !== "sell") throw new Error("SQLite returned an invalid execution side.");
      if (effect !== "auto" && effect !== "open" && effect !== "close") {
        throw new Error("SQLite returned an invalid position effect.");
      }
      return {
        id: executionId,
        accountId: requireText(row, "account_id"),
        instrumentId: requireText(row, "instrument_id"),
        occurredAtUs: requireText(row, "executed_at_us_text"),
        ledgerSequence: requireText(row, "ledger_sequence_text"),
        side: side === "buy" ? "BUY" : "SELL",
        positionEffect: effect === "auto" ? "AUTO" : effect === "open" ? "OPEN" : "CLOSE",
        quantity: requireText(row, "quantity_text"),
        price: requireText(row, "price_text"),
        quoteCurrency: requireText(row, "quote_currency_code"),
        multiplier: requireText(row, "multiplier_text"),
        fees: feesByVersion.get(versionId) ?? [],
      };
    });
    return { executions, versionIdByExecutionId };
  }

  private async persistProjection(
    projection: TradeNormalizationResult,
    versionIdByExecutionId: ReadonlyMap<string, string>,
    reason: "import" | "edit" | "rollback",
    nowMs: number,
  ): Promise<string> {
    const inputHeads = projection.executions
      .map((execution) => {
        const versionId = versionIdByExecutionId.get(execution.id);
        if (versionId === undefined) {
          throw new Error("A projection input lost its active immutable execution version.");
        }
        return { executionId: execution.id, executionVersionId: versionId };
      })
      .sort((left, right) => stableCompare(left.executionId, right.executionId));
    const inputHash = sha256Hex(canonicalJson(inputHeads));
    const outputHash = sha256Hex(canonicalJson({
      trades: projection.trades,
      allocations: projection.allocations,
      lotMatches: projection.lotMatches,
      moneyTotals: projection.moneyTotals,
    }));
    const runId = this.runtime.newId("projection-run");
    await this.database.run(
      `INSERT INTO projection_rebuild_runs (
        id, workspace_id, reason, algorithm_version, status, input_heads_sha256,
        output_sha256, started_at_ms, completed_at_ms
      ) VALUES (?, ?, ?, 1, 'succeeded', ?, ?, ?, ?)`,
      [runId, WORKSPACE_ID, reason, inputHash, outputHash, nowMs, nowMs],
    );

    const allocationsByTradeId = new Map<string, TradeAllocation[]>();
    for (const allocation of projection.allocations) {
      const tradeAllocations = allocationsByTradeId.get(allocation.tradeId) ?? [];
      tradeAllocations.push(allocation);
      allocationsByTradeId.set(allocation.tradeId, tradeAllocations);
    }
    const subjectIdByTradeId = new Map<string, string>();
    for (const trade of projection.trades) {
      const tradeAllocations = allocationsByTradeId.get(trade.id) ?? [];
      const stableHash = stableTradeSubjectHash(trade, projection.allocations);
      const existing = await this.database.query<SqlRow>(
        "SELECT id FROM trade_subjects WHERE workspace_id = ? AND stable_key_sha256 = ? LIMIT 1",
        [WORKSPACE_ID, stableHash],
      );
      const subjectId = existing[0] === undefined
        ? this.runtime.newId("trade")
        : requireText(existing[0], "id");
      if (existing[0] === undefined) {
        await this.database.run(
          `INSERT INTO trade_subjects (
            id, workspace_id, account_id, instrument_id, stable_key_sha256, created_at_ms
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [subjectId, WORKSPACE_ID, trade.accountId, trade.instrumentId, stableHash, nowMs],
        );
      }
      subjectIdByTradeId.set(trade.id, subjectId);
      const executionCount = new Set(
        tradeAllocations.map((allocation) => allocation.executionId),
      ).size;
      await this.database.run(
        `INSERT INTO trade_projections (
          rebuild_run_id, trade_subject_id, workspace_id, direction, status,
          quote_currency_code, multiplier_text, opened_at_us, closed_at_us,
          entered_quantity_text, exited_quantity_text, remaining_quantity_text,
          entry_notional_text, exit_notional_text, execution_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          runId,
          subjectId,
          WORKSPACE_ID,
          trade.direction.toLocaleLowerCase("en-US"),
          trade.status.toLocaleLowerCase("en-US"),
          trade.quoteCurrency,
          trade.multiplier,
          trade.openedAtUs,
          trade.closedAtUs,
          trade.enteredQuantity,
          trade.exitedQuantity,
          trade.remainingQuantity,
          trade.entryNotional,
          trade.exitNotional,
          executionCount,
        ],
      );
    }

    const allocationIdMap = new Map<string, string>();
    for (const allocation of projection.allocations) {
      const subjectId = subjectIdByTradeId.get(allocation.tradeId);
      const versionId = versionIdByExecutionId.get(allocation.executionId);
      if (subjectId === undefined || versionId === undefined) {
        throw new Error("A derived allocation lost its source execution or trade.");
      }
      const allocationId = this.runtime.newId("trade-allocation");
      allocationIdMap.set(allocation.id, allocationId);
      await this.database.run(
        `INSERT INTO trade_execution_allocations (
          id, rebuild_run_id, trade_subject_id, workspace_id, execution_version_id,
          fragment_index, effect, side, occurred_at_us, quantity_text, price_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          allocationId,
          runId,
          subjectId,
          WORKSPACE_ID,
          versionId,
          allocation.fragmentIndex,
          allocation.effect.toLocaleLowerCase("en-US"),
          allocation.side.toLocaleLowerCase("en-US"),
          allocation.occurredAtUs,
          allocation.quantity,
          allocation.price,
        ],
      );
    }

    for (const match of projection.lotMatches) {
      const subjectId = subjectIdByTradeId.get(match.tradeId);
      const entryId = allocationIdMap.get(match.entryAllocationId);
      const exitId = allocationIdMap.get(match.exitAllocationId);
      if (subjectId === undefined || entryId === undefined || exitId === undefined) {
        throw new Error("A derived FIFO match lost an allocation.");
      }
      await this.database.run(
        `INSERT INTO trade_lot_matches (
          id, rebuild_run_id, trade_subject_id, entry_allocation_id,
          exit_allocation_id, quantity_text, pnl_currency_code, gross_pnl_text
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          this.runtime.newId("lot-match"),
          runId,
          subjectId,
          entryId,
          exitId,
          match.quantity,
          match.pnlCurrency,
          match.grossPnl,
        ],
      );
    }

    for (const trade of projection.trades) {
      const subjectId = subjectIdByTradeId.get(trade.id);
      if (subjectId === undefined) throw new Error("A derived trade lost its subject.");
      for (const total of trade.moneyTotals) {
        await this.database.run(
          `INSERT INTO trade_money_totals (
            rebuild_run_id, trade_subject_id, currency_code,
            gross_pnl_text, fee_cost_text, net_pnl_text
          ) VALUES (?, ?, ?, ?, ?, ?)`,
          [
            runId,
            subjectId,
            total.currency,
            total.grossPnl,
            total.feeCost,
            total.netPnl,
          ],
        );
      }
    }

    await this.database.run(
      `INSERT INTO projection_active_state (
        workspace_id, active_rebuild_run_id, generation,
        execution_heads_sha256, activated_at_ms
      ) VALUES (?, ?, 1, ?, ?)
      ON CONFLICT(workspace_id) DO UPDATE SET
        active_rebuild_run_id = excluded.active_rebuild_run_id,
        generation = projection_active_state.generation + 1,
        execution_heads_sha256 = excluded.execution_heads_sha256,
        activated_at_ms = excluded.activated_at_ms`,
      [WORKSPACE_ID, runId, inputHash, nowMs],
    );
    return outputHash;
  }

  private async loadWithinConnection(): Promise<JournalLedgerSnapshot> {
    const workspaceRows = await this.database.query<SqlRow>(
      `SELECT id, name, default_currency_code, time_zone_id
         FROM workspaces WHERE archived_at_ms IS NULL ORDER BY created_at_ms LIMIT 2`,
    );
    if (workspaceRows.length === 0) return emptyLedger();
    if (workspaceRows.length !== 1) throw new Error("Hermes currently supports one local journal workspace.");
    const workspaceRow = workspaceRows[0];
    if (workspaceRow === undefined) return emptyLedger();
    const workspace: JournalWorkspaceRecord = {
      id: requireText(workspaceRow, "id"),
      name: requireText(workspaceRow, "name"),
      defaultCurrency: requireText(workspaceRow, "default_currency_code"),
      timeZone: requireText(workspaceRow, "time_zone_id"),
    };
    const accountRows = await this.database.query<SqlRow>(
      `SELECT id, name, base_currency_code
         FROM accounts WHERE workspace_id = ? AND archived_at_ms IS NULL ORDER BY name`,
      [workspace.id],
    );
    const accounts: JournalAccountRecord[] = accountRows.map((row) => ({
      id: requireText(row, "id"),
      name: requireText(row, "name"),
      baseCurrency: requireText(row, "base_currency_code"),
    }));
    const instrumentRows = await this.database.query<SqlRow>(
      `SELECT id, symbol, asset_class, quote_currency_code, multiplier_text
         FROM instruments WHERE workspace_id = ? ORDER BY symbol`,
      [workspace.id],
    );
    const instruments: JournalInstrumentRecord[] = instrumentRows.map((row) => {
      const assetClass = requireText(row, "asset_class");
      if (![
        "stock", "etf", "option", "future", "forex", "crypto", "other",
      ].includes(assetClass)) throw new Error("SQLite returned an invalid asset class.");
      return {
        id: requireText(row, "id"),
        symbol: requireText(row, "symbol"),
        assetClass: assetClass as JournalInstrumentRecord["assetClass"],
        quoteCurrency: requireText(row, "quote_currency_code"),
        multiplier: requireText(row, "multiplier_text"),
      };
    });
    const loaded = await this.loadActiveExecutions();
    const projection = normalizeTrades(loaded.executions);
    const tradeSubjects = await this.loadTradeSubjects(projection);
    const reviewState = await this.loadReviewState();
    const receiptRows = await this.database.query<SqlRow>(
      `SELECT receipt.id, batch.account_id, account.name AS account_name, batch.source_name,
              CAST(receipt.recorded_at_ms AS TEXT) AS recorded_at_ms_text,
              receipt.source_row_count, receipt.accepted_row_count,
              receipt.rejected_row_count, receipt.skipped_row_count,
              receipt.warning_count, receipt.execution_version_count,
              CAST(rollback.recorded_at_ms AS TEXT) AS rollback_at_ms_text
         FROM import_receipts AS receipt
         JOIN import_batches AS batch ON batch.id = receipt.batch_id
         JOIN accounts AS account ON account.id = batch.account_id
         LEFT JOIN import_rollbacks AS rollback ON rollback.import_receipt_id = receipt.id
        WHERE batch.workspace_id = ?
        ORDER BY receipt.recorded_at_ms DESC, receipt.id DESC`,
      [workspace.id],
    );
    const imports: JournalImportReceipt[] = receiptRows.map((row) => {
      const rollbackMs = nullableText(row, "rollback_at_ms_text");
      return {
        id: requireText(row, "id"),
        accountId: requireText(row, "account_id"),
        accountName: requireText(row, "account_name"),
        sourceName: requireText(row, "source_name"),
        importedAtUs: `${requireText(row, "recorded_at_ms_text")}000`,
        sourceRows: requireSafeInteger(row, "source_row_count"),
        acceptedRows: requireSafeInteger(row, "accepted_row_count"),
        rejectedRows: requireSafeInteger(row, "rejected_row_count"),
        skippedRows: requireSafeInteger(row, "skipped_row_count"),
        warningCount: requireSafeInteger(row, "warning_count"),
        executionCount: requireSafeInteger(row, "execution_version_count"),
        rolledBackAtUs: rollbackMs === null ? null : `${rollbackMs}000`,
      };
    });
    return {
      workspace,
      accounts,
      instruments,
      executions: loaded.executions,
      projection,
      tradeSubjects,
      tradeReviews: reviewState.tradeReviews,
      reviewTerms: reviewState.reviewTerms,
      playbooks: reviewState.playbooks,
      imports,
    };
  }

  private async loadReviewState(): Promise<LoadedReviewState> {
    const termRows = await this.database.query<SqlRow>(
      `SELECT id, category, name
         FROM review_terms
        WHERE workspace_id = ?
        ORDER BY category, normalized_name, id`,
      [WORKSPACE_ID],
    );
    const reviewTerms: JournalReviewTermRecord[] = termRows.map((row) => {
      const category = requireText(row, "category");
      if (!["setup", "mistake", "emotion", "tag"].includes(category)) {
        throw new Error("SQLite returned an invalid review-term category.");
      }
      return {
        id: requireText(row, "id"),
        category: category as JournalReviewTermCategory,
        name: requireText(row, "name"),
      };
    });

    const playbookRows = await this.database.query<SqlRow>(
      `SELECT id, name
         FROM playbooks
        WHERE workspace_id = ?
        ORDER BY normalized_name, id`,
      [WORKSPACE_ID],
    );
    const playbookRuleRows = await this.database.query<SqlRow>(
      `SELECT id, playbook_id, rule_text
         FROM playbook_rules
        WHERE workspace_id = ?
        ORDER BY playbook_id, created_at_ms, id`,
      [WORKSPACE_ID],
    );
    const rulesByPlaybook = new Map<string, JournalPlaybookRecord["rules"][number][]>();
    for (const row of playbookRuleRows) {
      const playbookId = requireText(row, "playbook_id");
      const rules = rulesByPlaybook.get(playbookId) ?? [];
      rules.push({
        id: requireText(row, "id"),
        playbookId,
        text: requireText(row, "rule_text"),
      });
      rulesByPlaybook.set(playbookId, rules);
    }
    const playbooks: JournalPlaybookRecord[] = playbookRows.map((row) => {
      const id = requireText(row, "id");
      return { id, name: requireText(row, "name"), rules: rulesByPlaybook.get(id) ?? [] };
    });

    const reviewRows = await this.database.query<SqlRow>(
      `SELECT version.id, version.trade_subject_id, version.version_number,
              version.revision_sha256, version.state, version.note_text,
              version.playbook_id, playbook.name AS playbook_name,
              version.initial_risk_amount_text, version.risk_currency_code,
              version.planned_stop_price_text, version.result_r_metric_id,
              version.result_r_metric_version, version.percent_return_metric_id,
              version.percent_return_metric_version,
              CAST(version.recorded_at_ms AS TEXT) AS recorded_at_ms_text,
              CAST(version.completed_at_ms AS TEXT) AS completed_at_ms_text
         FROM trade_review_heads AS head
         JOIN trade_review_versions AS version
           ON version.id = head.review_version_id
          AND version.workspace_id = head.workspace_id
          AND version.trade_subject_id = head.trade_subject_id
         LEFT JOIN playbooks AS playbook ON playbook.id = version.playbook_id
        WHERE head.workspace_id = ?
        ORDER BY version.recorded_at_ms, version.id`,
      [WORKSPACE_ID],
    );
    const currentReviewIds = reviewRows.map((row) => requireText(row, "id"));
    const assignmentRows = currentReviewIds.length === 0
      ? []
      : await this.database.query<SqlRow>(
        `SELECT assignment.review_version_id, assignment.category, assignment.ordinal,
                term.name
           FROM trade_review_term_assignments AS assignment
           JOIN trade_review_heads AS head
             ON head.review_version_id = assignment.review_version_id
            AND head.workspace_id = assignment.workspace_id
            AND head.trade_subject_id = assignment.trade_subject_id
           JOIN review_terms AS term ON term.id = assignment.term_id
          WHERE assignment.workspace_id = ?
          ORDER BY assignment.review_version_id, assignment.category, assignment.ordinal`,
        [WORKSPACE_ID],
      );
    const termsByReview = new Map<string, {
      setup: string | null;
      mistakes: string[];
      emotion: string | null;
      tags: string[];
    }>();
    for (const row of assignmentRows) {
      const reviewId = requireText(row, "review_version_id");
      const category = requireText(row, "category");
      const value = requireText(row, "name");
      const terms = termsByReview.get(reviewId) ?? {
        setup: null,
        mistakes: [],
        emotion: null,
        tags: [],
      };
      if (category === "setup") {
        if (terms.setup !== null) throw new Error("A review has more than one setup.");
        terms.setup = value;
      } else if (category === "emotion") {
        if (terms.emotion !== null) throw new Error("A review has more than one emotion.");
        terms.emotion = value;
      } else if (category === "mistake") {
        terms.mistakes.push(value);
      } else if (category === "tag") {
        terms.tags.push(value);
      } else {
        throw new Error("SQLite returned an invalid review assignment category.");
      }
      termsByReview.set(reviewId, terms);
    }

    const ruleRows = currentReviewIds.length === 0
      ? []
      : await this.database.query<SqlRow>(
        `SELECT result.review_version_id, result.playbook_rule_id,
                result.rule_name_snapshot, result.outcome
           FROM trade_review_rule_results AS result
           JOIN trade_review_heads AS head
             ON head.review_version_id = result.review_version_id
            AND head.workspace_id = result.workspace_id
            AND head.trade_subject_id = result.trade_subject_id
          WHERE result.workspace_id = ?
          ORDER BY result.review_version_id, result.ordinal`,
        [WORKSPACE_ID],
      );
    const rulesByReview = new Map<string, JournalTradeReviewRecord["rules"][number][]>();
    for (const row of ruleRows) {
      const outcome = requireText(row, "outcome");
      if (!["followed", "broken", "not_applicable", "unreviewed"].includes(outcome)) {
        throw new Error("SQLite returned an invalid rule-review outcome.");
      }
      const reviewId = requireText(row, "review_version_id");
      const rules = rulesByReview.get(reviewId) ?? [];
      rules.push({
        ruleId: requireText(row, "playbook_rule_id"),
        text: requireText(row, "rule_name_snapshot"),
        outcome: outcome as JournalReviewRuleOutcome,
      });
      rulesByReview.set(reviewId, rules);
    }

    const tradeReviews: JournalTradeReviewRecord[] = reviewRows.map((row) => {
      const id = requireText(row, "id");
      const state = requireText(row, "state");
      if (state !== "draft" && state !== "completed") {
        throw new Error("SQLite returned an invalid trade-review state.");
      }
      const resultRMetricId = requireText(row, "result_r_metric_id");
      const percentReturnMetricId = requireText(row, "percent_return_metric_id");
      const resultRMetricVersion = requireSafeInteger(row, "result_r_metric_version");
      const percentReturnMetricVersion = requireSafeInteger(row, "percent_return_metric_version");
      if (
        resultRMetricId !== "result-r"
        || resultRMetricVersion !== 1
        || percentReturnMetricId !== "percent-return"
        || percentReturnMetricVersion !== 1
      ) {
        throw new Error("A trade review references an unsupported metric definition.");
      }
      const riskAmount = nullableText(row, "initial_risk_amount_text");
      const riskCurrency = nullableText(row, "risk_currency_code");
      if ((riskAmount === null) !== (riskCurrency === null)) {
        throw new Error("A trade review has an incomplete initial-risk basis.");
      }
      const terms = termsByReview.get(id) ?? {
        setup: null,
        mistakes: [],
        emotion: null,
        tags: [],
      };
      const completedMs = nullableText(row, "completed_at_ms_text");
      return {
        id,
        tradeSubjectId: requireText(row, "trade_subject_id"),
        version: requireSafeInteger(row, "version_number"),
        state,
        revision: requireText(row, "revision_sha256"),
        note: requireText(row, "note_text"),
        setup: terms.setup,
        mistakes: terms.mistakes,
        emotion: terms.emotion,
        tags: terms.tags,
        playbookId: nullableText(row, "playbook_id"),
        playbookName: nullableText(row, "playbook_name"),
        rules: rulesByReview.get(id) ?? [],
        initialRisk: riskAmount === null || riskCurrency === null
          ? null
          : { amount: riskAmount, currency: riskCurrency },
        plannedStop: nullableText(row, "planned_stop_price_text"),
        resultRMetricId: "result-r",
        resultRMetricVersion: 1,
        percentReturnMetricId: "percent-return",
        percentReturnMetricVersion: 1,
        recordedAtUs: `${requireText(row, "recorded_at_ms_text")}000`,
        completedAtUs: completedMs === null ? null : `${completedMs}000`,
      };
    });
    return { tradeReviews, reviewTerms, playbooks };
  }

  private async loadTradeSubjects(
    projection: TradeNormalizationResult,
  ): Promise<readonly JournalTradeSubjectRecord[]> {
    const rows = await this.database.query<SqlRow>(
      `SELECT subject.id AS trade_subject_id, subject.stable_key_sha256
         FROM projection_active_state AS active
         JOIN trade_projections AS trade
           ON trade.rebuild_run_id = active.active_rebuild_run_id
          AND trade.workspace_id = active.workspace_id
         JOIN trade_subjects AS subject
           ON subject.id = trade.trade_subject_id
          AND subject.workspace_id = trade.workspace_id
        WHERE active.workspace_id = ?`,
      [WORKSPACE_ID],
    );
    const subjectByHash = new Map<string, string>();
    for (const row of rows) {
      const stableHash = requireText(row, "stable_key_sha256");
      if (subjectByHash.has(stableHash)) {
        throw new Error("The active projection contains a duplicate stable trade subject.");
      }
      subjectByHash.set(stableHash, requireText(row, "trade_subject_id"));
    }
    const mapped = projection.trades.map((trade) => {
      const stableHash = stableTradeSubjectHash(trade, projection.allocations);
      const tradeSubjectId = subjectByHash.get(stableHash);
      if (tradeSubjectId === undefined) {
        throw new Error(`The active projection lost durable subject identity for trade ${trade.id}.`);
      }
      return { projectionTradeId: trade.id, tradeSubjectId };
    });
    if (mapped.length !== rows.length) {
      throw new Error("The active projection trade count does not match the deterministic ledger.");
    }
    return mapped;
  }
}
