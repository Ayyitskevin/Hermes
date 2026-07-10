import { describe, expect, it, vi } from "vitest";
import type { SQLiteDBConnection } from "@capacitor-community/sqlite";

import {
  CapacitorSqlDatabase,
  NativeJournalDatabaseFactory,
  generateEncryptionPassphrase,
  type NativeJournalDatabaseOptions,
} from "./connection";

function fakeConnection() {
  let active = false;
  const fake = {
    execute: vi.fn(async () => ({ changes: { changes: 0 } })),
    run: vi.fn(async () => ({ changes: { changes: 1, lastId: 4 } })),
    query: vi.fn(async () => ({ values: [{ value: "ok" }] })),
    beginTransaction: vi.fn(async () => {
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
  return { fake, database: fake as unknown as SQLiteDBConnection };
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

  it("rolls back and preserves the original failure", async () => {
    const { fake, database } = fakeConnection();
    const adapter = new CapacitorSqlDatabase(database, vi.fn(async () => undefined));
    const failure = new Error("injected write failure");

    await expect(adapter.transaction(async () => {
      throw failure;
    })).rejects.toBe(failure);

    expect(fake.rollbackTransaction).toHaveBeenCalledOnce();
    expect(fake.commitTransaction).not.toHaveBeenCalled();
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
