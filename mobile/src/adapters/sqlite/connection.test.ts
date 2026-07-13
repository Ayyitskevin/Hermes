import { describe, expect, it, vi } from "vitest";
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";

import {
  CapacitorSqlDatabase,
  NativeJournalDatabaseFactory,
  generateEncryptionPassphrase,
  type NativeJournalDatabaseOptions,
} from "./connection";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function fakeConnection(options: { readonly beforeBegin?: () => Promise<void> } = {}) {
  let active = false;
  const fake = {
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    run: vi.fn(async () => ({ changes: { changes: 1, lastId: 4 } })),
    query: vi.fn(async () => ({ values: [{ value: "ok" }] })),
    beginTransaction: vi.fn(async () => {
      await options.beforeBegin?.();
      active = true;
      return { changes: { changes: 0 } };
    }),
    commitTransaction: vi.fn(async () => {
      active = false;
      return { changes: { changes: 0 } };
    }),
    rollbackTransaction: vi.fn(async () => {
      active = false;
      return { changes: { changes: 0 } };
    }),
    isTransactionActive: vi.fn(async () => ({ result: active })),
    close: vi.fn(async () => undefined),
  };
  return {
    fake,
    database: fake as unknown as SQLiteDBConnection,
    setActive(value: boolean) {
      active = value;
    },
  };
}

describe("Capacitor SQLite connection adapter", () => {
  it("creates a deterministic 256-bit passphrase without exposing raw bytes", () => {
    const passphrase = generateEncryptionPassphrase({
      getRandomValues(array) {
        array.forEach((_, index) => { array[index] = index; });
        return array;
      },
    });

    expect(passphrase).toBe("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f");
  });

  it("commits a successful explicit transaction and disables nested statement transactions", async () => {
    const { fake, database } = fakeConnection();
    const adapter = new CapacitorSqlDatabase(database, vi.fn(async () => undefined));

    const result = await adapter.transaction(async () => {
      const inserted = await adapter.run("INSERT INTO ledger(value) VALUES (?)", ["safe"]);
      expect(inserted).toEqual({ changes: 1, lastId: 4 });
      return "committed";
    });

    expect(result).toBe("committed");
    expect(fake.run).toHaveBeenCalledWith(
      "INSERT INTO ledger(value) VALUES (?)",
      ["safe"],
      false,
    );
    expect(fake.commitTransaction).toHaveBeenCalledOnce();
    expect(fake.rollbackTransaction).not.toHaveBeenCalled();
  });

  it("reserves the transaction synchronously while native begin is pending", async () => {
    const begin = deferred();
    const { fake, database } = fakeConnection({ beforeBegin: () => begin.promise });
    const adapter = new CapacitorSqlDatabase(database, vi.fn(async () => undefined));

    const first = adapter.transaction(async () => "first");
    expect(fake.beginTransaction).toHaveBeenCalledOnce();

    await expect(adapter.transaction(async () => "second"))
      .rejects.toThrow("Nested journal transactions are not supported.");
    expect(fake.beginTransaction).toHaveBeenCalledOnce();
    await expect(adapter.close())
      .rejects.toThrow("Cannot close the journal database during a transaction.");
    expect(fake.close).not.toHaveBeenCalled();

    begin.resolve();
    await expect(first).resolves.toBe("first");
    await expect(adapter.transaction(async () => "later")).resolves.toBe("later");
    expect(fake.beginTransaction).toHaveBeenCalledTimes(2);
  });

  it("keeps rejecting reentrant transactions after native begin completes", async () => {
    const { fake, database } = fakeConnection();
    const adapter = new CapacitorSqlDatabase(database, vi.fn(async () => undefined));

    await expect(adapter.transaction(async () => {
      await expect(adapter.transaction(async () => "nested"))
        .rejects.toThrow("Nested journal transactions are not supported.");
      return "outer";
    })).resolves.toBe("outer");

    expect(fake.beginTransaction).toHaveBeenCalledOnce();
    expect(fake.commitTransaction).toHaveBeenCalledOnce();
  });

  it("releases the reservation when native begin fails", async () => {
    const { fake, database } = fakeConnection();
    const adapter = new CapacitorSqlDatabase(database, vi.fn(async () => undefined));
    const failure = new Error("injected begin failure");
    fake.beginTransaction.mockRejectedValueOnce(failure);

    await expect(adapter.transaction(async () => "unreachable")).rejects.toBe(failure);
    expect(fake.rollbackTransaction).not.toHaveBeenCalled();
    await expect(adapter.transaction(async () => "retry")).resolves.toBe("retry");
    expect(fake.beginTransaction).toHaveBeenCalledTimes(2);
  });

  it("rolls back when native begin succeeds but its response is lost", async () => {
    const { fake, database, setActive } = fakeConnection();
    const adapter = new CapacitorSqlDatabase(database, vi.fn(async () => undefined));
    const failure = new Error("injected lost begin response");
    fake.beginTransaction.mockImplementationOnce(async () => {
      setActive(true);
      throw failure;
    });

    await expect(adapter.transaction(async () => "unreachable")).rejects.toBe(failure);
    expect(fake.rollbackTransaction).toHaveBeenCalledOnce();
    await expect(adapter.transaction(async () => "retry")).resolves.toBe("retry");
    expect(fake.beginTransaction).toHaveBeenCalledTimes(2);
  });

  it("rolls back and preserves the original failure", async () => {
    const { fake, database } = fakeConnection();
    const adapter = new CapacitorSqlDatabase(database, vi.fn(async () => undefined));
    const failure = new Error("injected write failure");

    await expect(adapter.transaction(async () => {
      throw failure;
    })).rejects.toBe(failure);

    expect(fake.rollbackTransaction).toHaveBeenCalledOnce();
    expect(fake.commitTransaction).not.toHaveBeenCalled();
    await expect(adapter.transaction(async () => "retry")).resolves.toBe("retry");
  });

  it("rolls back a failed commit and releases the reservation", async () => {
    const { fake, database } = fakeConnection();
    const adapter = new CapacitorSqlDatabase(database, vi.fn(async () => undefined));
    const failure = new Error("injected commit failure");
    fake.commitTransaction.mockRejectedValueOnce(failure);

    await expect(adapter.transaction(async () => "uncertain")).rejects.toBe(failure);
    expect(fake.rollbackTransaction).toHaveBeenCalledOnce();
    await expect(adapter.transaction(async () => "retry")).resolves.toBe("retry");
  });

  it("preserves a lost commit response while remaining usable when commit completed", async () => {
    const { fake, database, setActive } = fakeConnection();
    const adapter = new CapacitorSqlDatabase(database, vi.fn(async () => undefined));
    const failure = new Error("injected lost commit response");
    fake.commitTransaction.mockImplementationOnce(async () => {
      setActive(false);
      throw failure;
    });

    await expect(adapter.transaction(async () => "unknown")).rejects.toBe(failure);
    expect(fake.rollbackTransaction).not.toHaveBeenCalled();
    await expect(adapter.transaction(async () => "retry")).resolves.toBe("retry");
    expect(fake.commitTransaction).toHaveBeenCalledTimes(2);
  });

  it("keeps the adapter usable when a lost rollback response still leaves it inactive", async () => {
    const { fake, database, setActive } = fakeConnection();
    const adapter = new CapacitorSqlDatabase(database, vi.fn(async () => undefined));
    const operationFailure = new Error("injected operation failure");
    const rollbackFailure = new Error("injected lost rollback response");
    fake.rollbackTransaction.mockImplementationOnce(async () => {
      setActive(false);
      throw rollbackFailure;
    });

    const failure = await adapter.transaction(async () => {
      throw operationFailure;
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([operationFailure, rollbackFailure]);
    await expect(adapter.transaction(async () => "retry")).resolves.toBe("retry");
    expect(fake.beginTransaction).toHaveBeenCalledTimes(2);
  });

  it("poisons every data operation when the rollback response is lost and SQLite remains active", async () => {
    const { fake, database } = fakeConnection();
    const onClose = vi.fn(async () => undefined);
    const adapter = new CapacitorSqlDatabase(database, onClose);
    const operationFailure = new Error("injected operation failure");
    const rollbackFailure = new Error("injected lost rollback response");
    fake.rollbackTransaction.mockRejectedValueOnce(rollbackFailure);

    const failure = await adapter.transaction(async () => {
      throw operationFailure;
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).message).toMatch(/uncertain after operation/);
    expect((failure as AggregateError).errors).toEqual([
      operationFailure,
      rollbackFailure,
      expect.any(Error),
    ]);
    await expect(adapter.execute("DELETE FROM ledger")).rejects.toBe(failure);
    await expect(adapter.run("INSERT INTO ledger DEFAULT VALUES")).rejects.toBe(failure);
    await expect(adapter.query("SELECT 1")).rejects.toBe(failure);
    await expect(adapter.transaction(async () => "blocked")).rejects.toBe(failure);
    expect(fake.execute).not.toHaveBeenCalled();
    expect(fake.run).not.toHaveBeenCalled();
    expect(fake.query).not.toHaveBeenCalled();
    expect(fake.beginTransaction).toHaveBeenCalledOnce();

    await expect(adapter.close()).resolves.toBeUndefined();
    expect(fake.close).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not generate a replacement secret over an existing encrypted journal", async () => {
    const sqlite = {
      isInConfigEncryption: vi.fn(async () => ({ result: true })),
      isSecretStored: vi.fn(async () => ({ result: false })),
      isDatabase: vi.fn(async () => ({ result: true })),
      setEncryptionSecret: vi.fn(),
    } as unknown as NonNullable<NativeJournalDatabaseOptions["sqlite"]>;
    const factory = new NativeJournalDatabaseFactory({
      version: 1,
      upgrades: [],
      sqlite,
      platform: () => "ios",
    });

    await expect(factory.open()).rejects.toThrow(/Keychain secret is unavailable/);
    expect(sqlite.setEncryptionSecret).not.toHaveBeenCalled();
  });

  it("opens native data only after encryption and integrity gates pass", async () => {
    let open = false;
    const nativeDatabase = {
      open: vi.fn(async () => { open = true; }),
      execute: vi.fn(async () => ({ changes: { changes: 0 } })),
      query: vi.fn(async (statement: string) => {
        if (statement === "PRAGMA foreign_keys;") return { values: [{ foreign_keys: 1 }] };
        if (statement === "PRAGMA quick_check;") return { values: [{ quick_check: "ok" }] };
        if (statement === "PRAGMA cipher_integrity_check;") return { values: [] };
        if (statement === "PRAGMA foreign_key_check;") return { values: [] };
        throw new Error(`Unexpected native query: ${statement}`);
      }),
      isDBOpen: vi.fn(async () => ({ result: open })),
      close: vi.fn(async () => { open = false; }),
    };
    const database = nativeDatabase as unknown as SQLiteDBConnection;
    const sqlite = {
      isInConfigEncryption: vi.fn(async () => ({ result: true })),
      isSecretStored: vi.fn(async () => ({ result: true })),
      isDatabase: vi.fn(async () => ({ result: false })),
      setEncryptionSecret: vi.fn(),
      addUpgradeStatement: vi.fn(async () => undefined),
      checkConnectionsConsistency: vi.fn(async () => ({ result: false })),
      isConnection: vi.fn(async () => ({ result: false })),
      retrieveConnection: vi.fn(),
      createConnection: vi.fn(async () => database),
      isDatabaseEncrypted: vi.fn(async () => ({ result: true })),
      closeConnection: vi.fn(async () => undefined),
    } as unknown as NonNullable<NativeJournalDatabaseOptions["sqlite"]>;
    const factory = new NativeJournalDatabaseFactory({
      version: 1,
      upgrades: [],
      sqlite,
      platform: () => "ios",
    });

    const adapter = await factory.open();

    expect(nativeDatabase.execute).toHaveBeenCalledWith("PRAGMA foreign_keys = ON;", false);
    expect(nativeDatabase.query).toHaveBeenCalledWith("PRAGMA quick_check;");
    expect(nativeDatabase.query).toHaveBeenCalledWith("PRAGMA cipher_integrity_check;");
    expect(nativeDatabase.query).toHaveBeenCalledWith("PRAGMA foreign_key_check;");
    expect(sqlite.isDatabaseEncrypted).toHaveBeenCalledWith("hermes-journal");
    await adapter.close();
    expect(sqlite.closeConnection).toHaveBeenCalledWith("hermes-journal", false);
  });

  it("closes the native connection when SQLCipher reports a damaged page", async () => {
    const nativeDatabase = {
      open: vi.fn(async () => undefined),
      execute: vi.fn(async () => ({ changes: { changes: 0 } })),
      query: vi.fn(async (statement: string) => {
        if (statement === "PRAGMA foreign_keys;") return { values: [{ foreign_keys: 1 }] };
        if (statement === "PRAGMA quick_check;") return { values: [{ quick_check: "ok" }] };
        if (statement === "PRAGMA cipher_integrity_check;") {
          return { values: [{ cipher_integrity_check: "HMAC verification failed for page 4" }] };
        }
        throw new Error(`Unexpected native query: ${statement}`);
      }),
      isDBOpen: vi.fn(async () => ({ result: true })),
      close: vi.fn(async () => undefined),
    };
    const database = nativeDatabase as unknown as SQLiteDBConnection;
    const sqlite = {
      isInConfigEncryption: vi.fn(async () => ({ result: true })),
      isSecretStored: vi.fn(async () => ({ result: true })),
      isDatabase: vi.fn(async () => ({ result: true })),
      setEncryptionSecret: vi.fn(),
      addUpgradeStatement: vi.fn(async () => undefined),
      checkConnectionsConsistency: vi.fn(async () => ({ result: false })),
      isConnection: vi.fn(async () => ({ result: true })),
      retrieveConnection: vi.fn(),
      createConnection: vi.fn(async () => database),
      isDatabaseEncrypted: vi.fn(async () => ({ result: true })),
      closeConnection: vi.fn(async () => undefined),
    } as unknown as NonNullable<NativeJournalDatabaseOptions["sqlite"]>;
    const factory = new NativeJournalDatabaseFactory({
      version: 1,
      upgrades: [],
      sqlite,
      platform: () => "ios",
    });

    await expect(factory.open()).rejects.toThrow(/SQLCipher's integrity check/);
    expect(nativeDatabase.close).toHaveBeenCalledOnce();
    expect(sqlite.closeConnection).toHaveBeenCalledWith("hermes-journal", false);
  });
});
