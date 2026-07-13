import { sha256Hex } from "./checksum";

export const V3_MIGRATION_VERSION = 3;
export const V3_MIGRATION_NAME = "versioned_trade_reviews_and_metrics";

const HASH_CHECK = (column: string): string =>
  `length(${column}) = 64 AND ${column} NOT GLOB '*[^0-9a-f]*'`;

const UNSIGNED_DECIMAL_MAGNITUDE_CHECK = (column: string): string => `
      length(${column}) BETWEEN 1 AND 140
      AND ${column} NOT GLOB '*[^0-9.]*'
      AND ${column} NOT LIKE '.%'
      AND ${column} NOT LIKE '%.'
      AND length(${column}) - length(replace(${column}, '.', '')) <= 1
      AND ${column} NOT GLOB '0[0-9]*'
      AND (instr(${column}, '.') = 0 OR substr(${column}, -1) <> '0')`;

const canonicalPositiveDecimalCheck = (column: string): string =>
  `${UNSIGNED_DECIMAL_MAGNITUDE_CHECK(column)}\n      AND ${column} <> '0'`;

function immutableTableTriggers(tableName: string): readonly string[] {
  return [
    `CREATE TRIGGER ${tableName}_reject_update BEFORE UPDATE ON ${tableName} BEGIN SELECT RAISE(ABORT, '${tableName} is immutable'); END`,
    `CREATE TRIGGER ${tableName}_reject_delete BEFORE DELETE ON ${tableName} BEGIN SELECT RAISE(ABORT, '${tableName} is immutable'); END`,
  ];
}

/**
 * Slice-B review schema. Execution facts remain in the v1 ledger; this body
 * stores user-authored, immutable review versions against stable trade
 * subjects. Mutable heads can only advance one link at a time. Exact decimal
 * inputs remain canonical base-ten TEXT and metric semantics are pinned by an
 * immutable `(metric_id, version)` definition.
 */
const V3_MIGRATION_DEFINITIONS = Object.freeze([
  `CREATE TABLE metric_definitions (
    metric_id TEXT NOT NULL CHECK(metric_id IN ('result-r', 'percent-return')),
    version INTEGER NOT NULL CHECK(version > 0),
    fraction_digits INTEGER NOT NULL CHECK(fraction_digits BETWEEN 0 AND 18),
    rounding_mode TEXT NOT NULL CHECK(rounding_mode = 'half_away_from_zero'),
    description TEXT NOT NULL CHECK(length(description) > 0),
    PRIMARY KEY (metric_id, version)
  ) STRICT`,

  ...immutableTableTriggers("metric_definitions"),

  `INSERT INTO metric_definitions (
    metric_id, version, fraction_digits, rounding_mode, description
  ) VALUES (
    'result-r', 1, 12, 'half_away_from_zero',
    'Exact net realized P&L divided by user-confirmed initial risk in the same currency.'
  ) ON CONFLICT(metric_id, version) DO NOTHING`,

  `INSERT INTO metric_definitions (
    metric_id, version, fraction_digits, rounding_mode, description
  ) VALUES (
    'percent-return', 1, 12, 'half_away_from_zero',
    'Exact net realized P&L divided by absolute entry notional, multiplied by 100.'
  ) ON CONFLICT(metric_id, version) DO NOTHING`,

  `CREATE TABLE review_terms (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    workspace_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('setup', 'mistake', 'emotion', 'tag')),
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
    normalized_name TEXT NOT NULL CHECK(length(normalized_name) BETWEEN 1 AND 120),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    UNIQUE (id, workspace_id),
    UNIQUE (id, workspace_id, category),
    UNIQUE (workspace_id, category, normalized_name)
  ) STRICT`,

  `CREATE INDEX review_terms_workspace_category_idx
    ON review_terms(workspace_id, category, created_at_ms, id)`,

  `CREATE TABLE playbooks (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL CHECK(length(name) BETWEEN 1 AND 120),
    normalized_name TEXT NOT NULL CHECK(length(normalized_name) BETWEEN 1 AND 120),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    UNIQUE (id, workspace_id),
    UNIQUE (workspace_id, normalized_name)
  ) STRICT`,

  `CREATE INDEX playbooks_workspace_name_idx
    ON playbooks(workspace_id, created_at_ms, id)`,

  `CREATE TABLE playbook_rules (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    workspace_id TEXT NOT NULL,
    playbook_id TEXT NOT NULL,
    rule_text TEXT NOT NULL CHECK(length(rule_text) BETWEEN 1 AND 500),
    normalized_rule_text TEXT NOT NULL CHECK(length(normalized_rule_text) BETWEEN 1 AND 500),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (playbook_id, workspace_id)
      REFERENCES playbooks(id, workspace_id) ON DELETE RESTRICT,
    UNIQUE (id, workspace_id),
    UNIQUE (playbook_id, normalized_rule_text)
  ) STRICT`,

  `CREATE INDEX playbook_rules_playbook_idx
    ON playbook_rules(workspace_id, playbook_id, created_at_ms, id)`,

  ...immutableTableTriggers("review_terms"),
  ...immutableTableTriggers("playbooks"),
  ...immutableTableTriggers("playbook_rules"),

  `CREATE TABLE trade_review_versions (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    workspace_id TEXT NOT NULL,
    trade_subject_id TEXT NOT NULL,
    version_number INTEGER NOT NULL CHECK(version_number > 0),
    supersedes_version_id TEXT,
    submission_id TEXT NOT NULL CHECK(${HASH_CHECK("submission_id")}),
    revision_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("revision_sha256")}),
    state TEXT NOT NULL CHECK(state IN ('draft', 'completed')),
    note_text TEXT NOT NULL DEFAULT '' CHECK(length(note_text) <= 5000),
    playbook_id TEXT,
    initial_risk_amount_text TEXT CHECK(
      initial_risk_amount_text IS NULL
      OR (${canonicalPositiveDecimalCheck("initial_risk_amount_text")})
    ),
    risk_currency_code TEXT,
    planned_stop_price_text TEXT CHECK(
      planned_stop_price_text IS NULL
      OR (${canonicalPositiveDecimalCheck("planned_stop_price_text")})
    ),
    result_r_metric_id TEXT NOT NULL CHECK(result_r_metric_id = 'result-r'),
    result_r_metric_version INTEGER NOT NULL CHECK(result_r_metric_version > 0),
    percent_return_metric_id TEXT NOT NULL CHECK(percent_return_metric_id = 'percent-return'),
    percent_return_metric_version INTEGER NOT NULL CHECK(percent_return_metric_version > 0),
    recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= 0),
    completed_at_ms INTEGER,
    FOREIGN KEY (trade_subject_id, workspace_id)
      REFERENCES trade_subjects(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, trade_subject_id, supersedes_version_id)
      REFERENCES trade_review_versions(workspace_id, trade_subject_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (playbook_id, workspace_id)
      REFERENCES playbooks(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (risk_currency_code) REFERENCES currencies(code)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    FOREIGN KEY (result_r_metric_id, result_r_metric_version)
      REFERENCES metric_definitions(metric_id, version) ON DELETE RESTRICT,
    FOREIGN KEY (percent_return_metric_id, percent_return_metric_version)
      REFERENCES metric_definitions(metric_id, version) ON DELETE RESTRICT,
    UNIQUE (workspace_id, submission_id),
    UNIQUE (workspace_id, trade_subject_id, id),
    UNIQUE (workspace_id, trade_subject_id, version_number),
    CHECK(
      (version_number = 1 AND supersedes_version_id IS NULL)
      OR (version_number > 1 AND supersedes_version_id IS NOT NULL)
    ),
    CHECK(
      (initial_risk_amount_text IS NULL AND risk_currency_code IS NULL)
      OR (initial_risk_amount_text IS NOT NULL AND risk_currency_code IS NOT NULL)
    ),
    CHECK(planned_stop_price_text IS NULL OR initial_risk_amount_text IS NOT NULL),
    CHECK(
      (state = 'draft' AND completed_at_ms IS NULL)
      OR
      (state = 'completed' AND completed_at_ms IS NOT NULL AND completed_at_ms >= recorded_at_ms)
    )
  ) STRICT`,

  `CREATE UNIQUE INDEX trade_review_versions_supersedes_idx
    ON trade_review_versions(workspace_id, trade_subject_id, supersedes_version_id)
    WHERE supersedes_version_id IS NOT NULL`,

  `CREATE INDEX trade_review_versions_subject_version_idx
    ON trade_review_versions(workspace_id, trade_subject_id, version_number DESC)`,

  `CREATE INDEX trade_review_versions_submission_idx
    ON trade_review_versions(workspace_id, submission_id, revision_sha256)`,

  `CREATE TRIGGER trade_review_versions_require_current_predecessor
    BEFORE INSERT ON trade_review_versions
    WHEN NEW.version_number > 1 AND NOT EXISTS (
      SELECT 1
      FROM trade_review_heads AS head
      JOIN trade_review_versions AS predecessor
        ON predecessor.id = head.review_version_id
       AND predecessor.workspace_id = head.workspace_id
       AND predecessor.trade_subject_id = head.trade_subject_id
      WHERE head.workspace_id = NEW.workspace_id
        AND head.trade_subject_id = NEW.trade_subject_id
        AND head.review_version_id = NEW.supersedes_version_id
        AND predecessor.version_number = NEW.version_number - 1
        AND predecessor.recorded_at_ms <= NEW.recorded_at_ms
    )
    BEGIN SELECT RAISE(ABORT, 'trade review version must extend the current head by one'); END`,

  ...immutableTableTriggers("trade_review_versions"),

  `CREATE TABLE trade_review_heads (
    workspace_id TEXT NOT NULL,
    trade_subject_id TEXT NOT NULL,
    review_version_id TEXT NOT NULL,
    changed_at_ms INTEGER NOT NULL CHECK(changed_at_ms >= 0),
    PRIMARY KEY (workspace_id, trade_subject_id),
    FOREIGN KEY (trade_subject_id, workspace_id)
      REFERENCES trade_subjects(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (workspace_id, trade_subject_id, review_version_id)
      REFERENCES trade_review_versions(workspace_id, trade_subject_id, id) ON DELETE RESTRICT
  ) STRICT`,

  `CREATE INDEX trade_review_heads_review_version_idx
    ON trade_review_heads(review_version_id)`,

  `CREATE TRIGGER trade_review_heads_validate_initial_insert
    BEFORE INSERT ON trade_review_heads
    WHEN NOT EXISTS (
      SELECT 1 FROM trade_review_versions AS review
      WHERE review.id = NEW.review_version_id
        AND review.workspace_id = NEW.workspace_id
        AND review.trade_subject_id = NEW.trade_subject_id
        AND review.version_number = 1
        AND review.supersedes_version_id IS NULL
        AND review.recorded_at_ms <= NEW.changed_at_ms
    )
    BEGIN SELECT RAISE(ABORT, 'trade review head must begin at version one'); END`,

  `CREATE TRIGGER trade_review_heads_reject_identity_update
    BEFORE UPDATE ON trade_review_heads
    WHEN NEW.workspace_id <> OLD.workspace_id
      OR NEW.trade_subject_id <> OLD.trade_subject_id
    BEGIN SELECT RAISE(ABORT, 'trade review head identity is immutable'); END`,

  `CREATE TRIGGER trade_review_heads_require_forward_update
    BEFORE UPDATE ON trade_review_heads
    WHEN (
      NEW.review_version_id = OLD.review_version_id
      AND NEW.changed_at_ms <> OLD.changed_at_ms
    ) OR (
      NEW.review_version_id <> OLD.review_version_id
      AND NOT EXISTS (
        SELECT 1
        FROM trade_review_versions AS previous
        JOIN trade_review_versions AS next
          ON next.workspace_id = previous.workspace_id
         AND next.trade_subject_id = previous.trade_subject_id
         AND next.supersedes_version_id = previous.id
         AND next.version_number = previous.version_number + 1
        WHERE previous.id = OLD.review_version_id
          AND previous.workspace_id = OLD.workspace_id
          AND previous.trade_subject_id = OLD.trade_subject_id
          AND next.id = NEW.review_version_id
          AND next.recorded_at_ms <= NEW.changed_at_ms
          AND NEW.changed_at_ms >= OLD.changed_at_ms
      )
    )
    BEGIN SELECT RAISE(ABORT, 'trade review head must advance one immutable version'); END`,

  `CREATE TRIGGER trade_review_heads_reject_delete
    BEFORE DELETE ON trade_review_heads
    BEGIN SELECT RAISE(ABORT, 'trade review heads cannot be deleted'); END`,

  `CREATE TABLE trade_review_term_assignments (
    review_version_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    trade_subject_id TEXT NOT NULL,
    term_id TEXT NOT NULL,
    category TEXT NOT NULL CHECK(category IN ('setup', 'mistake', 'emotion', 'tag')),
    ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 0 AND 19),
    PRIMARY KEY (review_version_id, category, ordinal),
    FOREIGN KEY (workspace_id, trade_subject_id, review_version_id)
      REFERENCES trade_review_versions(workspace_id, trade_subject_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (term_id, workspace_id, category)
      REFERENCES review_terms(id, workspace_id, category) ON DELETE RESTRICT,
    UNIQUE (review_version_id, term_id),
    CHECK(category IN ('mistake', 'tag') OR ordinal = 0)
  ) STRICT`,

  `CREATE INDEX trade_review_term_assignments_term_idx
    ON trade_review_term_assignments(workspace_id, category, term_id, review_version_id)`,

  `CREATE TRIGGER trade_review_term_assignments_validate
    BEFORE INSERT ON trade_review_term_assignments
    WHEN NOT EXISTS (
      SELECT 1 FROM review_terms AS term
      WHERE term.id = NEW.term_id
        AND term.workspace_id = NEW.workspace_id
        AND term.category = NEW.category
    )
    BEGIN SELECT RAISE(ABORT, 'review term assignment must match its immutable category'); END`,

  `CREATE TABLE trade_review_rule_results (
    review_version_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    trade_subject_id TEXT NOT NULL,
    playbook_rule_id TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK(outcome IN (
      'followed', 'broken', 'not_applicable', 'unreviewed'
    )),
    rule_name_snapshot TEXT NOT NULL CHECK(length(rule_name_snapshot) BETWEEN 1 AND 500),
    ordinal INTEGER NOT NULL CHECK(ordinal BETWEEN 0 AND 19),
    PRIMARY KEY (review_version_id, ordinal),
    FOREIGN KEY (workspace_id, trade_subject_id, review_version_id)
      REFERENCES trade_review_versions(workspace_id, trade_subject_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (playbook_rule_id, workspace_id)
      REFERENCES playbook_rules(id, workspace_id) ON DELETE RESTRICT,
    UNIQUE (review_version_id, playbook_rule_id)
  ) STRICT`,

  `CREATE INDEX trade_review_rule_results_rule_idx
    ON trade_review_rule_results(workspace_id, playbook_rule_id, review_version_id)`,

  `CREATE TRIGGER trade_review_rule_results_validate_playbook
    BEFORE INSERT ON trade_review_rule_results
    WHEN NOT EXISTS (
      SELECT 1
      FROM trade_review_versions AS review
      JOIN playbook_rules AS rule
        ON rule.id = NEW.playbook_rule_id
       AND rule.workspace_id = NEW.workspace_id
       AND rule.playbook_id = review.playbook_id
      WHERE review.id = NEW.review_version_id
        AND review.workspace_id = NEW.workspace_id
        AND review.trade_subject_id = NEW.trade_subject_id
        AND rule.rule_text = NEW.rule_name_snapshot
    )
    BEGIN SELECT RAISE(ABORT, 'rule result must match the review playbook and rule snapshot'); END`,

  ...immutableTableTriggers("trade_review_term_assignments"),
  ...immutableTableTriggers("trade_review_rule_results"),
]);

/**
 * Capacitor can commit all upgrade statements immediately before it advances
 * `user_version`. IF NOT EXISTS plus conflict-free seeds/receipt make replay
 * safe when iOS terminates in that gap.
 */
export const V3_MIGRATION_BODY: readonly string[] = Object.freeze(
  V3_MIGRATION_DEFINITIONS.map((statement) => statement.replace(
    /^CREATE (TABLE|INDEX|UNIQUE INDEX|TRIGGER) /,
    "CREATE $1 IF NOT EXISTS ",
  )),
);

export function v3MigrationChecksumInput(): string {
  return JSON.stringify({
    toVersion: V3_MIGRATION_VERSION,
    name: V3_MIGRATION_NAME,
    statements: V3_MIGRATION_BODY,
  });
}

export const V3_MIGRATION_CHECKSUM_SHA256 = sha256Hex(v3MigrationChecksumInput());

const migrationReceiptStatement = `INSERT INTO schema_migrations (
    version, name, checksum_sha256, applied_at_ms
  ) VALUES (
    ${V3_MIGRATION_VERSION},
    '${V3_MIGRATION_NAME}',
    '${V3_MIGRATION_CHECKSUM_SHA256}',
    CAST(unixepoch() AS INTEGER) * 1000
  ) ON CONFLICT(version) DO NOTHING`;

export const V3_MIGRATION_STATEMENTS: readonly string[] = Object.freeze([
  ...V3_MIGRATION_BODY,
  migrationReceiptStatement,
]);
