import { Capacitor } from "@capacitor/core";
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
  type capSQLiteVersionUpgrade,
} from "@capacitor-community/sqlite";

import type {
  JournalDatabaseFactory,
  SqlDatabase,
  SqlParameters,
  SqlRow,
  SqlRunResult,
} from "../../application/sql-database";

const DEFAULT_DATABASE_NAME = "hermes-journal";

interface RandomSource {
  getRandomValues(array: Uint8Array): Uint8Array;
}

function changes(result: { changes?: { changes?: number; lastId?: number } }): SqlRunResult {
  return {
    changes: result.changes?.changes ?? 0,
    ...(result.changes?.lastId === undefined ? {} : { lastId: result.changes.lastId }),
  };
}

export function generateEncryptionPassphrase(
  random: RandomSource = globalThis.crypto,
): string {
  if (!random?.getRandomValues) {
    throw new Error("Secure randomness is unavailable; the encrypted journal cannot be created.");
  }
  const bytes = random.getRandomValues(new Uint8Array(32));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export class CapacitorSqlDatabase implements SqlDatabase {
  private inTransaction = false;
  private transactionReserved = false;
  private poisoned: AggregateError | null = null;
  private closed = false;

  constructor(
    private readonly database: SQLiteDBConnection,
    private readonly onClose: () => Promise<void>,
  ) {}

  async execute(statement: string): Promise<SqlRunResult> {
    this.assertOpen();
    return changes(await this.database.execute(statement, !this.inTransaction));
  }

  async run(statement: string, values: SqlParameters = []): Promise<SqlRunResult> {
    this.assertOpen();
    return changes(await this.database.run(statement, [...values], !this.inTransaction));
  }

  async query<Row extends SqlRow>(
    statement: string,
    values: SqlParameters = [],
  ): Promise<readonly Row[]> {
    this.assertOpen();
    const result = await this.database.query(statement, [...values]);
    return (result.values ?? []) as Row[];
  }

  async transaction<Result>(operation: () => Promise<Result>): Promise<Result> {
    this.assertOpen();
    if (this.transactionReserved || this.inTransaction) {
      throw new Error("Nested journal transactions are not supported.");
    }
    this.transactionReserved = true;
    let phase: "begin" | "operation" | "commit" = "begin";
    try {
      await this.database.beginTransaction();
      if (!(await this.transactionIsActive())) {
        throw new Error("The SQLite transaction did not become active.");
      }
      this.inTransaction = true;
      phase = "operation";
      const result = await operation();
      if (!(await this.transactionIsActive())) {
        throw new Error("The SQLite transaction ended before commit.");
      }
      phase = "commit";
      await this.database.commitTransaction();
      if (await this.transactionIsActive()) {
        throw new Error("The SQLite transaction remained active after commit.");
      }
      return result;
    } catch (error) {
      throw await this.reconcileTransactionFailure(error, phase);
    } finally {
      this.inTransaction = false;
      this.transactionReserved = false;
    }
  }

  async close(): Promise<void> {
    if (this.closed) return;
    if (this.transactionReserved || this.inTransaction) {
      throw new Error("Cannot close the journal database during a transaction.");
    }
    await this.database.close();
    await this.onClose();
    this.closed = true;
  }

  private assertOpen(): void {
    if (this.closed) throw new Error("The journal database connection is closed.");
    if (this.poisoned !== null) throw this.poisoned;
  }

  private async transactionIsActive(): Promise<boolean> {
    const active = (await this.database.isTransactionActive()).result;
    if (active !== true && active !== false) {
      throw new Error("SQLite returned an invalid transaction-state response.");
    }
    return active;
  }

  private poisonTransactionState(
    causes: readonly unknown[],
    phase: "begin" | "operation" | "commit",
  ): AggregateError {
    if (this.poisoned !== null) return this.poisoned;
    this.poisoned = new AggregateError(
      causes,
      `The journal database transaction state is uncertain after ${phase}. Close and reopen the journal before continuing.`,
    );
    return this.poisoned;
  }

  private async reconcileTransactionFailure(
    error: unknown,
    phase: "begin" | "operation" | "commit",
  ): Promise<unknown> {
    let active: boolean;
    try {
      active = await this.transactionIsActive();
    } catch (stateError) {
      return this.poisonTransactionState([error, stateError], phase);
    }
    if (!active) return error;

    let rollbackFailed = false;
    let rollbackError: unknown;
    try {
      await this.database.rollbackTransaction();
    } catch (caught) {
      rollbackFailed = true;
      rollbackError = caught;
    }

    try {
      active = await this.transactionIsActive();
    } catch (stateError) {
      return this.poisonTransactionState(
        rollbackFailed ? [error, rollbackError, stateError] : [error, stateError],
        phase,
      );
    }
    if (active) {
      const transactionStillActive = new Error(
        "SQLite still reports an active transaction after rollback.",
      );
      return this.poisonTransactionState(
        rollbackFailed
          ? [error, rollbackError, transactionStillActive]
          : [error, transactionStillActive],
        phase,
      );
    }
    if (rollbackFailed) {
      return new AggregateError(
        [error, rollbackError],
        "The journal transaction failed and SQLite rollback also reported an error, but inactivity was verified.",
      );
    }
    return error;
  }
}

export interface NativeJournalDatabaseOptions {
  readonly version: number;
  readonly upgrades: readonly capSQLiteVersionUpgrade[];
  readonly databaseName?: string;
  readonly random?: RandomSource;
  readonly sqlite?: Pick<SQLiteConnection,
    | "isInConfigEncryption"
    | "isSecretStored"
    | "isDatabase"
    | "setEncryptionSecret"
    | "addUpgradeStatement"
    | "checkConnectionsConsistency"
    | "isConnection"
    | "retrieveConnection"
    | "createConnection"
    | "isDatabaseEncrypted"
    | "closeConnection"
  >;
  readonly platform?: () => string;
}

export class NativeJournalDatabaseFactory implements JournalDatabaseFactory {
  private readonly databaseName: string;
  private readonly sqlite: NonNullable<NativeJournalDatabaseOptions["sqlite"]>;

  constructor(private readonly options: NativeJournalDatabaseOptions) {
    this.databaseName = options.databaseName ?? DEFAULT_DATABASE_NAME;
    this.sqlite = options.sqlite ?? new SQLiteConnection(CapacitorSQLite);
  }

  async open(): Promise<SqlDatabase> {
    if ((this.options.platform ?? (() => Capacitor.getPlatform()))() === "web") {
      throw new Error("Native encrypted SQLite is unavailable in the browser runtime.");
    }
    if (!(await this.sqlite.isInConfigEncryption()).result) {
      throw new Error("Native SQLite encryption is disabled in the Capacitor configuration.");
    }
    const secretStored = (await this.sqlite.isSecretStored()).result;
    if (!secretStored && (await this.sqlite.isDatabase(this.databaseName)).result) {
      throw new Error(
        "The encrypted Hermes journal exists but its Keychain secret is unavailable. Recovery is required; the database was not replaced.",
      );
    }
    if (!secretStored) {
      await this.sqlite.setEncryptionSecret(generateEncryptionPassphrase(this.options.random));
    }

    await this.sqlite.addUpgradeStatement(this.databaseName, [...this.options.upgrades]);
    const consistent = (await this.sqlite.checkConnectionsConsistency()).result;
    const exists = consistent && (await this.sqlite.isConnection(this.databaseName, false)).result;
    const database = exists
      ? await this.sqlite.retrieveConnection(this.databaseName, false)
      : await this.sqlite.createConnection(
        this.databaseName,
        true,
        "secret",
        this.options.version,
        false,
      );

    try {
      await database.open();
      await database.execute("PRAGMA foreign_keys = ON;", false);
      const foreignKeys = await database.query("PRAGMA foreign_keys;");
      const enabled = Number(foreignKeys.values?.[0]?.foreign_keys ?? 0) === 1;
      if (!enabled) throw new Error("SQLite foreign-key enforcement could not be enabled.");
      if (!(await this.sqlite.isDatabaseEncrypted(this.databaseName)).result) {
        throw new Error("Hermes opened a database that is not encrypted.");
      }
      const quickCheck = await database.query("PRAGMA quick_check;");
      if (String(Object.values(quickCheck.values?.[0] ?? {})[0] ?? "") !== "ok") {
        throw new Error("The journal database failed SQLite's integrity check.");
      }
      const cipherCheck = await database.query("PRAGMA cipher_integrity_check;");
      if ((cipherCheck.values?.length ?? 0) !== 0) {
        throw new Error("The encrypted journal failed SQLCipher's integrity check.");
      }
      const foreignKeyViolations = await database.query("PRAGMA foreign_key_check;");
      if ((foreignKeyViolations.values?.length ?? 0) !== 0) {
        throw new Error("The journal database contains broken foreign-key references.");
      }
      return new CapacitorSqlDatabase(
        database,
        () => this.sqlite.closeConnection(this.databaseName, false),
      );
    } catch (error) {
      try {
        if ((await database.isDBOpen()).result) await database.close();
        if ((await this.sqlite.isConnection(this.databaseName, false)).result) {
          await this.sqlite.closeConnection(this.databaseName, false);
        }
      } catch {
        // Preserve the initialization failure; the next launch rechecks consistency.
      }
      throw error;
    }
  }
}
