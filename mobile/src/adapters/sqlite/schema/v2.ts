import { sha256Hex } from "./checksum";

export const V2_MIGRATION_VERSION = 2;
export const V2_MIGRATION_NAME = "durable_manual_execution_submissions";

const HASH_CHECK = (column: string): string =>
  `length(${column}) = 64 AND ${column} NOT GLOB '*[^0-9a-f]*'`;

const V2_MIGRATION_DEFINITIONS = Object.freeze([
  `CREATE TABLE manual_execution_submissions (
    submission_id TEXT PRIMARY KEY CHECK(${HASH_CHECK("submission_id")}),
    workspace_id TEXT NOT NULL,
    revision_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("revision_sha256")}),
    command_json TEXT NOT NULL CHECK(length(command_json) > 1),
    state TEXT NOT NULL CHECK(state IN ('pending', 'committed')),
    execution_id TEXT,
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    committed_at_ms INTEGER,
    acknowledged_at_ms INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (execution_id, workspace_id)
      REFERENCES executions(id, workspace_id) ON DELETE RESTRICT,
    UNIQUE (execution_id),
    CHECK(
      (state = 'pending' AND execution_id IS NULL AND committed_at_ms IS NULL)
      OR
      (state = 'committed' AND execution_id IS NOT NULL AND committed_at_ms IS NOT NULL)
    ),
    CHECK(committed_at_ms IS NULL OR committed_at_ms >= created_at_ms),
    CHECK(
      acknowledged_at_ms IS NULL
      OR (committed_at_ms IS NOT NULL AND acknowledged_at_ms >= committed_at_ms)
    )
  ) STRICT`,

  `CREATE INDEX manual_execution_submissions_unacknowledged_idx
    ON manual_execution_submissions(workspace_id, acknowledged_at_ms, created_at_ms)
    WHERE state = 'committed' AND acknowledged_at_ms IS NULL`,

  `CREATE TRIGGER manual_execution_submissions_reject_identity_update
    BEFORE UPDATE ON manual_execution_submissions
    WHEN NEW.submission_id <> OLD.submission_id
      OR NEW.workspace_id <> OLD.workspace_id
      OR NEW.revision_sha256 <> OLD.revision_sha256
      OR NEW.command_json <> OLD.command_json
      OR NEW.created_at_ms <> OLD.created_at_ms
    BEGIN SELECT RAISE(ABORT, 'manual execution submission identity is immutable'); END`,

  `CREATE TRIGGER manual_execution_submissions_reject_regression
    BEFORE UPDATE ON manual_execution_submissions
    WHEN (OLD.state = 'committed' AND NEW.state <> 'committed')
      OR (OLD.execution_id IS NOT NULL AND NEW.execution_id IS NOT OLD.execution_id)
      OR (OLD.committed_at_ms IS NOT NULL AND NEW.committed_at_ms IS NOT OLD.committed_at_ms)
      OR (OLD.acknowledged_at_ms IS NOT NULL AND NEW.acknowledged_at_ms IS NOT OLD.acknowledged_at_ms)
    BEGIN SELECT RAISE(ABORT, 'manual execution submission state cannot regress'); END`,

  `CREATE TRIGGER manual_execution_submissions_reject_delete
    BEFORE DELETE ON manual_execution_submissions
    BEGIN SELECT RAISE(ABORT, 'manual execution submissions are retained for idempotency'); END`,
]);

export const V2_MIGRATION_BODY: readonly string[] = Object.freeze(
  V2_MIGRATION_DEFINITIONS.map((statement) => statement.replace(
    /^CREATE (TABLE|INDEX|UNIQUE INDEX|TRIGGER) /,
    "CREATE $1 IF NOT EXISTS ",
  )),
);

export function v2MigrationChecksumInput(): string {
  return JSON.stringify({
    toVersion: V2_MIGRATION_VERSION,
    name: V2_MIGRATION_NAME,
    statements: V2_MIGRATION_BODY,
  });
}

export const V2_MIGRATION_CHECKSUM_SHA256 = sha256Hex(v2MigrationChecksumInput());

const migrationReceiptStatement = `INSERT INTO schema_migrations (
    version, name, checksum_sha256, applied_at_ms
  ) VALUES (
    ${V2_MIGRATION_VERSION},
    '${V2_MIGRATION_NAME}',
    '${V2_MIGRATION_CHECKSUM_SHA256}',
    CAST(unixepoch() AS INTEGER) * 1000
  ) ON CONFLICT(version) DO NOTHING`;

export const V2_MIGRATION_STATEMENTS: readonly string[] = Object.freeze([
  ...V2_MIGRATION_BODY,
  migrationReceiptStatement,
]);
