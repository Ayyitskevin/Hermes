import type { capSQLiteVersionUpgrade } from "@capacitor-community/sqlite";

import {
  V1_MIGRATION_CHECKSUM_SHA256,
  V1_MIGRATION_NAME,
  V1_MIGRATION_STATEMENTS,
  V1_MIGRATION_VERSION,
  v1MigrationChecksumInput,
} from "./v1";
import {
  V2_MIGRATION_CHECKSUM_SHA256,
  V2_MIGRATION_NAME,
  V2_MIGRATION_STATEMENTS,
  V2_MIGRATION_VERSION,
  v2MigrationChecksumInput,
} from "./v2";
import {
  V3_MIGRATION_CHECKSUM_SHA256,
  V3_MIGRATION_NAME,
  V3_MIGRATION_STATEMENTS,
  V3_MIGRATION_VERSION,
  v3MigrationChecksumInput,
} from "./v3";

export interface MobileSchemaMigration {
  readonly toVersion: number;
  readonly name: string;
  readonly checksumSha256: string;
  readonly checksumInput: string;
  readonly statements: readonly string[];
}

export const MOBILE_SCHEMA_MIGRATIONS: readonly MobileSchemaMigration[] = Object.freeze([
  Object.freeze({
    toVersion: V1_MIGRATION_VERSION,
    name: V1_MIGRATION_NAME,
    checksumSha256: V1_MIGRATION_CHECKSUM_SHA256,
    checksumInput: v1MigrationChecksumInput(),
    statements: V1_MIGRATION_STATEMENTS,
  }),
  Object.freeze({
    toVersion: V2_MIGRATION_VERSION,
    name: V2_MIGRATION_NAME,
    checksumSha256: V2_MIGRATION_CHECKSUM_SHA256,
    checksumInput: v2MigrationChecksumInput(),
    statements: V2_MIGRATION_STATEMENTS,
  }),
  Object.freeze({
    toVersion: V3_MIGRATION_VERSION,
    name: V3_MIGRATION_NAME,
    checksumSha256: V3_MIGRATION_CHECKSUM_SHA256,
    checksumInput: v3MigrationChecksumInput(),
    statements: V3_MIGRATION_STATEMENTS,
  }),
]);

/**
 * Return fresh mutable arrays matching capSQLiteVersionUpgrade exactly.
 * Capacitor may retain the arrays while the native connection is opened, so
 * callers should request a new copy instead of mutating the canonical contract.
 */
export function createCapacitorSchemaUpgrades(): capSQLiteVersionUpgrade[] {
  return MOBILE_SCHEMA_MIGRATIONS.map(({ toVersion, statements }) => ({
    toVersion,
    statements: [...statements],
  }));
}

export {
  V1_MIGRATION_BODY,
  V1_MIGRATION_CHECKSUM_SHA256,
  V1_MIGRATION_NAME,
  V1_MIGRATION_STATEMENTS,
  V1_MIGRATION_VERSION,
  v1MigrationChecksumInput,
} from "./v1";
export {
  V2_MIGRATION_BODY,
  V2_MIGRATION_CHECKSUM_SHA256,
  V2_MIGRATION_NAME,
  V2_MIGRATION_STATEMENTS,
  V2_MIGRATION_VERSION,
  v2MigrationChecksumInput,
} from "./v2";
export {
  V3_MIGRATION_BODY,
  V3_MIGRATION_CHECKSUM_SHA256,
  V3_MIGRATION_NAME,
  V3_MIGRATION_STATEMENTS,
  V3_MIGRATION_VERSION,
  v3MigrationChecksumInput,
} from "./v3";
export { sha256Hex } from "./checksum";
