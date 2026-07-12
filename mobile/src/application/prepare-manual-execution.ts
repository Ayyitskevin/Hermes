import { sha256Hex } from "../adapters/sqlite/schema/checksum";
import {
  type ExecutionInput,
  type ValidatedExecutionInput,
  validateExecutionInput,
} from "../core/execution-input";
import {
  JournalManualExecutionError,
} from "./journal-store";

export interface ManualExecutionInput extends ExecutionInput {
  readonly submissionId: string;
}

export interface PreparedManualExecution extends ValidatedExecutionInput {
  readonly submissionId: string;
  readonly revision: string;
}

export type ManualExecutionRevisionInput = Omit<PreparedManualExecution, "revision">;

function validatedSubmissionId(value: string): string {
  if (!/^[a-f0-9]{64}$/.test(value)) {
    throw new JournalManualExecutionError({
      code: "submission_changed",
      message: "Manual execution submission ID is invalid.",
    });
  }
  return value;
}

export function createManualExecutionSubmissionId(): string {
  if (globalThis.crypto?.getRandomValues === undefined) {
    throw new Error("Secure randomness is required to create a manual execution.");
  }
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(32));
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

export function manualExecutionRevision(input: ManualExecutionRevisionInput): string {
  return sha256Hex(JSON.stringify([
    "hermes-manual-execution-v1",
    input.submissionId,
    input.accountName,
    input.timeZone,
    input.defaultCurrency,
    input.symbol,
    input.assetClass,
    input.side,
    input.positionEffect,
    input.quantity,
    input.price,
    input.fee,
    input.feeMinor,
    input.minorUnit,
    input.enteredAt,
    input.executedAt,
    input.occurredAtUs,
  ]));
}

export function prepareManualExecution(input: ManualExecutionInput): PreparedManualExecution {
  try {
    const submissionId = validatedSubmissionId(input.submissionId);
    const validated = validateExecutionInput(input);
    const revisionInput: ManualExecutionRevisionInput = {
      submissionId,
      ...validated,
    };
    return {
      ...revisionInput,
      revision: manualExecutionRevision(revisionInput),
    };
  } catch (error) {
    if (error instanceof JournalManualExecutionError) throw error;
    throw new JournalManualExecutionError({
      code: "submission_changed",
      message: error instanceof Error ? error.message : "Manual execution is invalid.",
    });
  }
}

export function verifyPreparedManualExecution(
  command: PreparedManualExecution,
): PreparedManualExecution {
  const revisionInput: ManualExecutionRevisionInput = {
    submissionId: command.submissionId,
    accountName: command.accountName,
    timeZone: command.timeZone,
    defaultCurrency: command.defaultCurrency,
    symbol: command.symbol,
    assetClass: command.assetClass,
    side: command.side,
    positionEffect: command.positionEffect,
    quantity: command.quantity,
    price: command.price,
    fee: command.fee,
    feeMinor: command.feeMinor,
    minorUnit: command.minorUnit,
    enteredAt: command.enteredAt,
    executedAt: command.executedAt,
    occurredAtUs: command.occurredAtUs,
  };
  if (manualExecutionRevision(revisionInput) !== command.revision) {
    throw new JournalManualExecutionError({
      code: "submission_changed",
      message: "Manual execution values changed after review. Review them again.",
    });
  }
  const reparsed = prepareManualExecution({
    submissionId: command.submissionId,
    accountName: command.accountName,
    timeZone: command.timeZone,
    defaultCurrency: command.defaultCurrency,
    symbol: command.symbol,
    assetClass: command.assetClass,
    side: command.side,
    positionEffect: command.positionEffect,
    quantity: command.quantity,
    price: command.price,
    fee: command.fee,
    executedAt: command.enteredAt,
  });
  if (reparsed.revision !== command.revision) {
    throw new JournalManualExecutionError({
      code: "submission_changed",
      message: "Manual execution no longer matches the reviewed values.",
    });
  }
  return reparsed;
}
