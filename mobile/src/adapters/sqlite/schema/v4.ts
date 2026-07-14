import { sha256Hex } from "./checksum";

export const V4_MIGRATION_VERSION = 4;
export const V4_MIGRATION_NAME = "versioned_daily_journal_entries";

const HASH_CHECK = (column: string): string =>
  `length(${column}) = 64 AND ${column} NOT GLOB '*[^0-9a-f]*'`;

function immutableTableTriggers(tableName: string): readonly string[] {
  return [
    `CREATE TRIGGER ${tableName}_reject_update BEFORE UPDATE ON ${tableName} BEGIN SELECT RAISE(ABORT, '${tableName} is immutable'); END`,
    `CREATE TRIGGER ${tableName}_reject_delete BEFORE DELETE ON ${tableName} BEGIN SELECT RAISE(ABORT, '${tableName} is immutable'); END`,
  ];
}

/**
 * Daily reflections are authored against a workspace-local calendar date, not
 * a UTC instant. Versions are append-only, while one guarded head per date
 * provides optimistic editing. Emotion and tag assignments reuse the immutable
 * review vocabulary without coupling a day to a trade subject.
 */
const V4_MIGRATION_DEFINITIONS = Object.freeze([
  `CREATE TABLE daily_journal_entry_versions (
    id TEXT PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 256),
    workspace_id TEXT NOT NULL,
    journal_date TEXT NOT NULL CHECK(
      length(journal_date) = 10
      AND journal_date GLOB '[1-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
      AND journal_date BETWEEN '1970-01-01' AND '9999-12-31'
      AND date(journal_date) = journal_date
    ),
    version_number INTEGER NOT NULL CHECK(version_number > 0),
    supersedes_version_id TEXT,
    submission_id TEXT NOT NULL CHECK(${HASH_CHECK("submission_id")}),
    revision_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("revision_sha256")}),
    state TEXT NOT NULL CHECK(state IN ('draft', 'completed')),
    title_text TEXT CHECK(title_text IS NULL OR length(title_text) BETWEEN 1 AND 120),
    note_text TEXT NOT NULL DEFAULT '' CHECK(length(note_text) <= 5000),
    process_score_pct INTEGER CHECK(
      process_score_pct IS NULL OR process_score_pct BETWEEN 0 AND 100
    ),
    recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= 0),
    completed_at_ms INTEGER,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, journal_date, supersedes_version_id)
      REFERENCES daily_journal_entry_versions(workspace_id, journal_date, id)
      ON DELETE RESTRICT,
    UNIQUE (workspace_id, submission_id),
    UNIQUE (workspace_id, journal_date, id),
    UNIQUE (workspace_id, journal_date, version_number),
    CHECK(
      (version_number = 1 AND supersedes_version_id IS NULL)
      OR (version_number > 1 AND supersedes_version_id IS NOT NULL)
    ),
    CHECK(
      (state = 'draft' AND completed_at_ms IS NULL)
      OR
      (state = 'completed' AND completed_at_ms IS NOT NULL
        AND completed_at_ms >= recorded_at_ms)
    )
  ) STRICT`,

  `CREATE UNIQUE INDEX daily_journal_entry_versions_supersedes_idx
    ON daily_journal_entry_versions(workspace_id, journal_date, supersedes_version_id)
    WHERE supersedes_version_id IS NOT NULL`,

  `CREATE INDEX daily_journal_entry_versions_date_idx
    ON daily_journal_entry_versions(workspace_id, journal_date DESC, version_number DESC)`,

  `CREATE INDEX daily_journal_entry_versions_submission_idx
    ON daily_journal_entry_versions(workspace_id, submission_id, revision_sha256)`,

  `CREATE TRIGGER daily_journal_entry_versions_require_current_predecessor
    BEFORE INSERT ON daily_journal_entry_versions
    WHEN NEW.version_number > 1 AND NOT EXISTS (
      SELECT 1
      FROM daily_journal_entry_heads AS head
      JOIN daily_journal_entry_versions AS predecessor
        ON predecessor.id = head.entry_version_id
       AND predecessor.workspace_id = head.workspace_id
       AND predecessor.journal_date = head.journal_date
      WHERE head.workspace_id = NEW.workspace_id
        AND head.journal_date = NEW.journal_date
        AND head.entry_version_id = NEW.supersedes_version_id
        AND predecessor.version_number = NEW.version_number - 1
        AND predecessor.recorded_at_ms <= NEW.recorded_at_ms
    )
    BEGIN SELECT RAISE(ABORT, 'daily entry version must extend the current head by one'); END`,

  ...immutableTableTriggers("daily_journal_entry_versions"),

  `CREATE TABLE daily_journal_entry_heads (
    workspace_id TEXT NOT NULL,
    journal_date TEXT NOT NULL,
    entry_version_id TEXT NOT NULL,
    changed_at_ms INTEGER NOT NULL CHECK(changed_at_ms >= 0),
    PRIMARY KEY (workspace_id, journal_date),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, journal_date, entry_version_id)
      REFERENCES daily_journal_entry_versions(workspace_id, journal_date, id)
      ON DELETE RESTRICT
  ) STRICT`,

  `CREATE INDEX daily_journal_entry_heads_version_idx
    ON daily_journal_entry_heads(entry_version_id)`,

  `CREATE TRIGGER daily_journal_entry_heads_validate_initial_insert
    BEFORE INSERT ON daily_journal_entry_heads
    WHEN NOT EXISTS (
      SELECT 1 FROM daily_journal_entry_versions AS entry
      WHERE entry.id = NEW.entry_version_id
        AND entry.workspace_id = NEW.workspace_id
        AND entry.journal_date = NEW.journal_date
        AND entry.version_number = 1
        AND entry.supersedes_version_id IS NULL
        AND entry.recorded_at_ms <= NEW.changed_at_ms
    )
    BEGIN SELECT RAISE(ABORT, 'daily entry head must begin at version one'); END`,

  `CREATE TRIGGER daily_journal_entry_heads_reject_identity_update
    BEFORE UPDATE ON daily_journal_entry_heads
    WHEN NEW.workspace_id <> OLD.workspace_id
      OR NEW.journal_date <> OLD.journal_date
    BEGIN SELECT RAISE(ABORT, 'daily entry head identity is immutable'); END`,

  `CREATE TRIGGER daily_journal_entry_heads_require_forward_update
    BEFORE UPDATE ON daily_journal_entry_heads
    WHEN (
      NEW.entry_version_id = OLD.entry_version_id
      AND NEW.changed_at_ms <> OLD.changed_at_ms
    ) OR (
      NEW.entry_version_id <> OLD.entry_version_id
      AND NOT EXISTS (
        SELECT 1
        FROM daily_journal_entry_versions AS previous
        JOIN daily_journal_entry_versions AS next
          ON next.workspace_id = previous.workspace_id
         AND next.journal_date = previous.journal_date
         AND next.supersedes_version_id = previous.id
         AND next.version_number = previous.version_number + 1
        WHERE previous.id = OLD.entry_version_id
          AND previous.workspace_id = OLD.workspace_id
          AND previous.journal_date = OLD.journal_date
          AND next.id = NEW.entry_version_id
          AND next.recorded_at_ms <= NEW.changed_at_ms
          AND NEW.changed_at_ms >= OLD.changed_at_ms
      )
    )
    BEGIN SELECT RAISE(ABORT, 'daily entry head must advance one immutable version'); END`,

  `CREATE TRIGGER daily_journal_entry_heads_reject_delete
    BEFORE DELETE ON daily_journal_entry_heads
    BEGIN SELECT RAISE(ABORT, 'daily entry heads cannot be deleted'); END`,

  `CREATE TABLE daily_journal_entry_term_assignments (
    entry_version_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    journal_date TEXT NOT NULL,
    term_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('emotion', 'tag')),
    ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 0 AND 19),
    PRIMARY KEY (entry_version_id, category, ordinal),
    FOREIGN KEY (workspace_id, journal_date, entry_version_id)
      REFERENCES daily_journal_entry_versions(workspace_id, journal_date, id)
      ON DELETE RESTRICT,
    FOREIGN KEY (term_id, workspace_id, category)
      REFERENCES review_terms(id, workspace_id, category) ON DELETE RESTRICT,
    UNIQUE (entry_version_id, term_id),
    CHECK(category = 'tag' OR ordinal = 0)
  ) STRICT`,

  `CREATE INDEX daily_journal_entry_term_assignments_term_idx
    ON daily_journal_entry_term_assignments(
      workspace_id, category, term_id, entry_version_id
    )`,

  `CREATE TRIGGER daily_journal_entry_term_assignments_validate
    BEFORE INSERT ON daily_journal_entry_term_assignments
    WHEN NOT EXISTS (
      SELECT 1 FROM review_terms AS term
      WHERE term.id = NEW.term_id
        AND term.workspace_id = NEW.workspace_id
        AND term.category = NEW.category
    )
    BEGIN SELECT RAISE(ABORT, 'daily entry term must match its immutable category'); END`,

  ...immutableTableTriggers("daily_journal_entry_term_assignments"),
]);

export const V4_MIGRATION_BODY: readonly string[] = Object.freeze(
  V4_MIGRATION_DEFINITIONS.map((statement) => statement.replace(
    /^CREATE (TABLE|INDEX|UNIQUE INDEX|TRIGGER) /,
    "CREATE $1 IF NOT EXISTS ",
  )),
);

export function v4MigrationChecksumInput(): string {
  return JSON.stringify({
    toVersion: V4_MIGRATION_VERSION,
    name: V4_MIGRATION_NAME,
    statements: V4_MIGRATION_BODY,
  });
}

export const V4_MIGRATION_CHECKSUM_SHA256 = sha256Hex(v4MigrationChecksumInput());

const migrationReceiptStatement = `INSERT INTO schema_migrations (
    version, name, checksum_sha256, applied_at_ms
  ) VALUES (
    ${V4_MIGRATION_VERSION},
    '${V4_MIGRATION_NAME}',
    '${V4_MIGRATION_CHECKSUM_SHA256}',
    CAST(unixepoch() AS INTEGER) * 1000
  ) ON CONFLICT(version) DO NOTHING`;

export const V4_MIGRATION_STATEMENTS: readonly string[] = Object.freeze([
  ...V4_MIGRATION_BODY,
  migrationReceiptStatement,
]);
