import { sha256Hex } from "./checksum";

export const V5_MIGRATION_VERSION = 5;
export const V5_MIGRATION_NAME = "versioned_playbook_definition_library";

const HASH_CHECK = (column: string): string =>
  `length(${column}) = 64 AND ${column} NOT GLOB '*[^0-9a-f]*'`;

function immutableTableTriggers(tableName: string): readonly string[] {
  return [
    `CREATE TRIGGER ${tableName}_reject_update BEFORE UPDATE ON ${tableName} BEGIN SELECT RAISE(ABORT, '${tableName} is immutable'); END`,
    `CREATE TRIGGER ${tableName}_reject_delete BEFORE DELETE ON ${tableName} BEGIN SELECT RAISE(ABORT, '${tableName} is immutable'); END`,
  ];
}

/**
 * Explicit user-owned playbook definitions remain separate from the v3
 * review-derived vocabulary. Definition identities are stable, revisions and
 * ordered rules are immutable, and guarded heads retain active and archived
 * names so lifecycle changes cannot make historical identity ambiguous.
 */
const V5_MIGRATION_DEFINITIONS = Object.freeze([
  `CREATE TABLE playbook_definitions (
    id TEXT PRIMARY KEY CHECK(${HASH_CHECK("id")}),
    workspace_id TEXT NOT NULL,
    create_submission_id TEXT NOT NULL CHECK(${HASH_CHECK("create_submission_id")}),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    UNIQUE (id, workspace_id),
    UNIQUE (workspace_id, create_submission_id)
  ) STRICT`,

  `CREATE INDEX playbook_definitions_workspace_created_idx
    ON playbook_definitions(workspace_id, created_at_ms DESC, id)`,

  ...immutableTableTriggers("playbook_definitions"),

  `CREATE TABLE playbook_definition_versions (
    id TEXT PRIMARY KEY CHECK(${HASH_CHECK("id")}),
    workspace_id TEXT NOT NULL,
    playbook_id TEXT NOT NULL CHECK(${HASH_CHECK("playbook_id")}),
    version_number INTEGER NOT NULL CHECK(version_number > 0),
    supersedes_version_id TEXT CHECK(
      supersedes_version_id IS NULL OR (${HASH_CHECK("supersedes_version_id")})
    ),
    action TEXT NOT NULL CHECK(action IN ('create', 'edit', 'archive', 'restore')),
    submission_id TEXT NOT NULL CHECK(${HASH_CHECK("submission_id")}),
    revision_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("revision_sha256")}),
    name_snapshot TEXT NOT NULL CHECK(length(name_snapshot) BETWEEN 1 AND 120),
    normalized_name TEXT NOT NULL CHECK(length(normalized_name) BETWEEN 1 AND 120),
    state TEXT NOT NULL CHECK(state IN ('active', 'archived')),
    recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= 0),
    FOREIGN KEY (playbook_id, workspace_id)
      REFERENCES playbook_definitions(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (supersedes_version_id, workspace_id, playbook_id)
      REFERENCES playbook_definition_versions(id, workspace_id, playbook_id)
      ON DELETE RESTRICT,
    UNIQUE (id, workspace_id, playbook_id),
    UNIQUE (workspace_id, submission_id),
    UNIQUE (workspace_id, playbook_id, version_number),
    CHECK(
      (version_number = 1 AND supersedes_version_id IS NULL
        AND action = 'create' AND state = 'active')
      OR
      (version_number > 1 AND supersedes_version_id IS NOT NULL
        AND action <> 'create'
        AND (
          (action IN ('edit', 'restore') AND state = 'active')
          OR (action = 'archive' AND state = 'archived')
        ))
    )
  ) STRICT`,

  `CREATE UNIQUE INDEX playbook_definition_versions_supersedes_idx
    ON playbook_definition_versions(workspace_id, playbook_id, supersedes_version_id)
    WHERE supersedes_version_id IS NOT NULL`,

  `CREATE INDEX playbook_definition_versions_workspace_state_idx
    ON playbook_definition_versions(
      workspace_id, state, normalized_name, version_number DESC
    )`,

  `CREATE INDEX playbook_definition_versions_submission_idx
    ON playbook_definition_versions(workspace_id, submission_id, revision_sha256)`,

  `CREATE TRIGGER playbook_definition_versions_validate_initial_create
    BEFORE INSERT ON playbook_definition_versions
    WHEN NEW.version_number = 1 AND NOT EXISTS (
      SELECT 1
      FROM playbook_definitions AS definition
      WHERE definition.id = NEW.playbook_id
        AND definition.workspace_id = NEW.workspace_id
        AND definition.create_submission_id = NEW.submission_id
        AND definition.created_at_ms <= NEW.recorded_at_ms
    )
    BEGIN SELECT RAISE(ABORT, 'playbook definition must begin with its create submission'); END`,

  `CREATE TRIGGER playbook_definition_versions_require_current_predecessor
    BEFORE INSERT ON playbook_definition_versions
    WHEN NEW.version_number > 1 AND NOT EXISTS (
      SELECT 1
      FROM playbook_definition_heads AS head
      JOIN playbook_definition_versions AS predecessor
        ON predecessor.id = head.definition_version_id
       AND predecessor.workspace_id = head.workspace_id
       AND predecessor.playbook_id = head.playbook_id
      WHERE head.workspace_id = NEW.workspace_id
        AND head.playbook_id = NEW.playbook_id
        AND head.definition_version_id = NEW.supersedes_version_id
        AND predecessor.version_number = NEW.version_number - 1
        AND predecessor.recorded_at_ms <= NEW.recorded_at_ms
        AND (
          (NEW.action = 'edit' AND predecessor.state = 'active')
          OR (NEW.action = 'archive' AND predecessor.state = 'active')
          OR (NEW.action = 'restore' AND predecessor.state = 'archived')
        )
    )
    BEGIN SELECT RAISE(ABORT, 'playbook definition version must extend the current lifecycle head by one'); END`,

  ...immutableTableTriggers("playbook_definition_versions"),

  `CREATE TABLE playbook_definition_rules (
    definition_version_id TEXT NOT NULL CHECK(${HASH_CHECK("definition_version_id")}),
    workspace_id TEXT NOT NULL,
    playbook_id TEXT NOT NULL CHECK(${HASH_CHECK("playbook_id")}),
    ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 0 AND 19),
    rule_text_snapshot TEXT NOT NULL CHECK(length(rule_text_snapshot) BETWEEN 1 AND 500),
    normalized_rule_text TEXT NOT NULL CHECK(
      length(normalized_rule_text) BETWEEN 1 AND 500
    ),
    PRIMARY KEY (definition_version_id, ordinal),
    FOREIGN KEY (definition_version_id, workspace_id, playbook_id)
      REFERENCES playbook_definition_versions(id, workspace_id, playbook_id)
      ON DELETE RESTRICT,
    UNIQUE (definition_version_id, normalized_rule_text)
  ) STRICT`,

  `CREATE INDEX playbook_definition_rules_version_idx
    ON playbook_definition_rules(
      workspace_id, playbook_id, definition_version_id, ordinal
    )`,

  ...immutableTableTriggers("playbook_definition_rules"),

  `CREATE TABLE playbook_definition_heads (
    workspace_id TEXT NOT NULL,
    playbook_id TEXT NOT NULL CHECK(${HASH_CHECK("playbook_id")}),
    definition_version_id TEXT NOT NULL CHECK(${HASH_CHECK("definition_version_id")}),
    normalized_current_name TEXT NOT NULL CHECK(
      length(normalized_current_name) BETWEEN 1 AND 120
    ),
    current_state TEXT NOT NULL CHECK(current_state IN ('active', 'archived')),
    changed_at_ms INTEGER NOT NULL CHECK(changed_at_ms >= 0),
    PRIMARY KEY (workspace_id, playbook_id),
    FOREIGN KEY (playbook_id, workspace_id)
      REFERENCES playbook_definitions(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (definition_version_id, workspace_id, playbook_id)
      REFERENCES playbook_definition_versions(id, workspace_id, playbook_id)
      ON DELETE RESTRICT,
    UNIQUE (workspace_id, normalized_current_name)
  ) STRICT`,

  `CREATE INDEX playbook_definition_heads_version_idx
    ON playbook_definition_heads(definition_version_id)`,

  `CREATE TRIGGER playbook_definition_heads_validate_initial_insert
    BEFORE INSERT ON playbook_definition_heads
    WHEN NOT EXISTS (
      SELECT 1
      FROM playbook_definition_versions AS version
      WHERE version.id = NEW.definition_version_id
        AND version.workspace_id = NEW.workspace_id
        AND version.playbook_id = NEW.playbook_id
        AND version.version_number = 1
        AND version.supersedes_version_id IS NULL
        AND version.action = 'create'
        AND version.normalized_name = NEW.normalized_current_name
        AND version.state = NEW.current_state
        AND version.recorded_at_ms <= NEW.changed_at_ms
        AND (
          SELECT count(*)
          FROM playbook_definition_rules AS rule
          WHERE rule.definition_version_id = version.id
        ) = coalesce((
          SELECT max(rule.ordinal) + 1
          FROM playbook_definition_rules AS rule
          WHERE rule.definition_version_id = version.id
        ), 0)
    )
    BEGIN SELECT RAISE(ABORT, 'playbook definition head must match a complete version one'); END`,

  `CREATE TRIGGER playbook_definition_heads_reject_identity_update
    BEFORE UPDATE ON playbook_definition_heads
    WHEN NEW.workspace_id <> OLD.workspace_id
      OR NEW.playbook_id <> OLD.playbook_id
    BEGIN SELECT RAISE(ABORT, 'playbook definition head identity is immutable'); END`,

  `CREATE TRIGGER playbook_definition_heads_require_forward_update
    BEFORE UPDATE ON playbook_definition_heads
    WHEN (
      NEW.definition_version_id = OLD.definition_version_id
      AND (
        NEW.normalized_current_name <> OLD.normalized_current_name
        OR NEW.current_state <> OLD.current_state
        OR NEW.changed_at_ms <> OLD.changed_at_ms
      )
    ) OR (
      NEW.definition_version_id <> OLD.definition_version_id
      AND NOT EXISTS (
        SELECT 1
        FROM playbook_definition_versions AS previous
        JOIN playbook_definition_versions AS next
          ON next.workspace_id = previous.workspace_id
         AND next.playbook_id = previous.playbook_id
         AND next.supersedes_version_id = previous.id
         AND next.version_number = previous.version_number + 1
        WHERE previous.id = OLD.definition_version_id
          AND previous.workspace_id = OLD.workspace_id
          AND previous.playbook_id = OLD.playbook_id
          AND next.id = NEW.definition_version_id
          AND next.normalized_name = NEW.normalized_current_name
          AND next.state = NEW.current_state
          AND next.recorded_at_ms <= NEW.changed_at_ms
          AND NEW.changed_at_ms >= OLD.changed_at_ms
          AND (
            SELECT count(*)
            FROM playbook_definition_rules AS rule
            WHERE rule.definition_version_id = next.id
          ) = coalesce((
            SELECT max(rule.ordinal) + 1
            FROM playbook_definition_rules AS rule
            WHERE rule.definition_version_id = next.id
          ), 0)
          AND (
            next.action = 'edit'
            OR (
              next.name_snapshot = previous.name_snapshot
              AND (
                SELECT count(*)
                FROM playbook_definition_rules AS next_rule
                WHERE next_rule.definition_version_id = next.id
              ) = (
                SELECT count(*)
                FROM playbook_definition_rules AS previous_rule
                WHERE previous_rule.definition_version_id = previous.id
              )
              AND NOT EXISTS (
                SELECT 1
                FROM playbook_definition_rules AS next_rule
                LEFT JOIN playbook_definition_rules AS previous_rule
                  ON previous_rule.definition_version_id = previous.id
                 AND previous_rule.ordinal = next_rule.ordinal
                WHERE next_rule.definition_version_id = next.id
                  AND (
                    previous_rule.definition_version_id IS NULL
                    OR previous_rule.rule_text_snapshot <> next_rule.rule_text_snapshot
                    OR previous_rule.normalized_rule_text <> next_rule.normalized_rule_text
                  )
              )
            )
          )
      )
    )
    BEGIN SELECT RAISE(ABORT, 'playbook definition head must advance one complete immutable version'); END`,

  `CREATE TRIGGER playbook_definition_heads_reject_delete
    BEFORE DELETE ON playbook_definition_heads
    BEGIN SELECT RAISE(ABORT, 'playbook definition heads cannot be deleted'); END`,

  `CREATE TABLE trade_review_playbook_definition_links (
    review_version_id TEXT PRIMARY KEY CHECK(length(review_version_id) BETWEEN 1 AND 256),
    workspace_id TEXT NOT NULL,
    trade_subject_id TEXT NOT NULL,
    playbook_id TEXT NOT NULL CHECK(${HASH_CHECK("playbook_id")}),
    definition_version_id TEXT NOT NULL CHECK(${HASH_CHECK("definition_version_id")}),
    revision_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("revision_sha256")}),
    FOREIGN KEY (workspace_id, trade_subject_id, review_version_id)
      REFERENCES trade_review_versions(workspace_id, trade_subject_id, id)
      ON DELETE RESTRICT,
    FOREIGN KEY (definition_version_id, workspace_id, playbook_id)
      REFERENCES playbook_definition_versions(id, workspace_id, playbook_id)
      ON DELETE RESTRICT
  ) STRICT`,

  `CREATE INDEX trade_review_playbook_definition_links_definition_idx
    ON trade_review_playbook_definition_links(
      workspace_id, playbook_id, definition_version_id, review_version_id
    )`,

  `CREATE TRIGGER trade_review_playbook_definition_links_validate_exact_snapshot
    BEFORE INSERT ON trade_review_playbook_definition_links
    WHEN NOT EXISTS (
      SELECT 1
      FROM trade_review_versions AS review
      JOIN playbooks AS review_playbook
        ON review_playbook.id = review.playbook_id
       AND review_playbook.workspace_id = review.workspace_id
      JOIN playbook_definition_versions AS definition
        ON definition.id = NEW.definition_version_id
       AND definition.workspace_id = NEW.workspace_id
       AND definition.playbook_id = NEW.playbook_id
      WHERE review.id = NEW.review_version_id
        AND review.workspace_id = NEW.workspace_id
        AND review.trade_subject_id = NEW.trade_subject_id
        AND review_playbook.normalized_name = definition.normalized_name
        AND definition.revision_sha256 = NEW.revision_sha256
        AND (
          SELECT count(*)
          FROM trade_review_rule_results AS result
          WHERE result.review_version_id = review.id
        ) = (
          SELECT count(*)
          FROM playbook_definition_rules AS definition_rule
          WHERE definition_rule.definition_version_id = definition.id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM playbook_definition_rules AS definition_rule
          LEFT JOIN trade_review_rule_results AS result
            ON result.review_version_id = review.id
           AND result.ordinal = definition_rule.ordinal
          LEFT JOIN playbook_rules AS review_rule
            ON review_rule.id = result.playbook_rule_id
           AND review_rule.workspace_id = review.workspace_id
          WHERE definition_rule.definition_version_id = definition.id
            AND (
              result.review_version_id IS NULL
              OR review_rule.normalized_rule_text <> definition_rule.normalized_rule_text
            )
        )
    )
    BEGIN SELECT RAISE(ABORT, 'review link must match the exact playbook definition snapshot'); END`,

  ...immutableTableTriggers("trade_review_playbook_definition_links"),
]);

/**
 * Capacitor may persist all DDL before advancing user_version. IF NOT EXISTS
 * plus a conflict-free receipt makes that interrupted-upgrade replay safe.
 */
export const V5_MIGRATION_BODY: readonly string[] = Object.freeze(
  V5_MIGRATION_DEFINITIONS.map((statement) => statement.replace(
    /^CREATE (TABLE|INDEX|UNIQUE INDEX|TRIGGER) /,
    "CREATE $1 IF NOT EXISTS ",
  )),
);

export function v5MigrationChecksumInput(): string {
  return JSON.stringify({
    toVersion: V5_MIGRATION_VERSION,
    name: V5_MIGRATION_NAME,
    statements: V5_MIGRATION_BODY,
  });
}

export const V5_MIGRATION_CHECKSUM_SHA256 = sha256Hex(v5MigrationChecksumInput());

const migrationReceiptStatement = `INSERT INTO schema_migrations (
    version, name, checksum_sha256, applied_at_ms
  ) VALUES (
    ${V5_MIGRATION_VERSION},
    '${V5_MIGRATION_NAME}',
    '${V5_MIGRATION_CHECKSUM_SHA256}',
    CAST(unixepoch() AS INTEGER) * 1000
  ) ON CONFLICT(version) DO NOTHING`;

export const V5_MIGRATION_STATEMENTS: readonly string[] = Object.freeze([
  ...V5_MIGRATION_BODY,
  migrationReceiptStatement,
]);
