import { sha256Hex } from "./checksum";

export const V1_MIGRATION_VERSION = 1;
export const V1_MIGRATION_NAME = "initial_execution_ledger";

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

const canonicalUnsignedDecimalCheck = (column: string, allowZero: boolean): string =>
  `${UNSIGNED_DECIMAL_MAGNITUDE_CHECK(column)}${allowZero ? "" : `\n      AND ${column} <> '0'`}`;

const canonicalSignedDecimalCheck = (column: string): string => {
  const magnitude = `(CASE WHEN substr(${column}, 1, 1) = '-' THEN substr(${column}, 2) ELSE ${column} END)`;
  return `
      length(${column}) BETWEEN 1 AND 141
      AND ${column} NOT GLOB '*[^0-9.-]*'
      AND instr(substr(${column}, 2), '-') = 0
      AND ${column} <> '-0'
      AND ${UNSIGNED_DECIMAL_MAGNITUDE_CHECK(magnitude)}`;
};

function immutableTableTriggers(tableName: string): readonly string[] {
  return [
    `CREATE TRIGGER ${tableName}_reject_update BEFORE UPDATE ON ${tableName} BEGIN SELECT RAISE(ABORT, '${tableName} is immutable'); END`,
    `CREATE TRIGGER ${tableName}_reject_delete BEFORE DELETE ON ${tableName} BEGIN SELECT RAISE(ABORT, '${tableName} is immutable'); END`,
  ];
}

/**
 * Version-one schema body. Every array item is exactly one top-level SQLite
 * statement so it can be passed through Capacitor's incremental upgrade API.
 * Source and projection decimals use canonical base-ten TEXT, never IEEE-754
 * values. Only broker fee components use integer currency minor units.
 */
const V1_MIGRATION_DEFINITIONS = Object.freeze([
  `CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE CHECK(length(name) > 0),
    checksum_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("checksum_sha256")}),
    applied_at_ms INTEGER NOT NULL CHECK(applied_at_ms >= 0)
  ) STRICT`,

  `CREATE TABLE currencies (
    code TEXT PRIMARY KEY CHECK(
      length(code) BETWEEN 3 AND 12
      AND code = upper(code)
      AND substr(code, 1, 1) GLOB '[A-Z]'
      AND code NOT GLOB '*[^A-Z0-9]*'
    ),
    minor_unit_exponent INTEGER NOT NULL CHECK(minor_unit_exponent BETWEEN 0 AND 8),
    display_name TEXT NOT NULL CHECK(length(display_name) > 0)
  ) STRICT`,

  `CREATE TABLE workspaces (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    name TEXT NOT NULL CHECK(length(name) > 0),
    default_currency_code TEXT NOT NULL,
    time_zone_id TEXT NOT NULL CHECK(length(time_zone_id) > 0),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms >= created_at_ms),
    archived_at_ms INTEGER CHECK(archived_at_ms IS NULL OR archived_at_ms >= created_at_ms),
    FOREIGN KEY (default_currency_code) REFERENCES currencies(code)
      ON UPDATE CASCADE ON DELETE RESTRICT
  ) STRICT`,

  ...immutableTableTriggers("schema_migrations"),
  ...immutableTableTriggers("currencies"),

  `CREATE TABLE accounts (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    workspace_id TEXT NOT NULL,
    name TEXT NOT NULL CHECK(length(name) > 0),
    account_kind TEXT NOT NULL CHECK(account_kind IN ('brokerage', 'paper', 'crypto', 'other')),
    base_currency_code TEXT NOT NULL,
    broker_name TEXT,
    external_account_key TEXT,
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    archived_at_ms INTEGER CHECK(archived_at_ms IS NULL OR archived_at_ms >= created_at_ms),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (base_currency_code) REFERENCES currencies(code)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    CHECK(external_account_key IS NULL OR broker_name IS NOT NULL),
    UNIQUE (workspace_id, name),
    UNIQUE (id, workspace_id)
  ) STRICT`,

  `CREATE INDEX accounts_workspace_active_idx
    ON accounts(workspace_id, archived_at_ms, name)`,

  `CREATE UNIQUE INDEX accounts_external_key_idx
    ON accounts(workspace_id, broker_name, external_account_key)
    WHERE external_account_key IS NOT NULL`,

  `CREATE TABLE instruments (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    workspace_id TEXT NOT NULL,
    symbol TEXT NOT NULL CHECK(length(symbol) > 0),
    asset_class TEXT NOT NULL CHECK(asset_class IN (
      'stock', 'etf', 'option', 'future', 'forex', 'crypto', 'other'
    )),
    quote_currency_code TEXT NOT NULL,
    multiplier_text TEXT NOT NULL CHECK(${canonicalUnsignedDecimalCheck("multiplier_text", false)}),
    expires_on TEXT,
    strike_price_text TEXT CHECK(
      strike_price_text IS NULL OR (${canonicalUnsignedDecimalCheck("strike_price_text", false)})
    ),
    option_right TEXT CHECK(option_right IS NULL OR option_right IN ('call', 'put')),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (quote_currency_code) REFERENCES currencies(code)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    CHECK(
      (asset_class = 'option' AND expires_on IS NOT NULL AND strike_price_text IS NOT NULL AND option_right IS NOT NULL)
      OR
      (asset_class <> 'option' AND strike_price_text IS NULL AND option_right IS NULL)
    ),
    UNIQUE (id, workspace_id)
  ) STRICT`,

  `CREATE INDEX instruments_workspace_symbol_idx
    ON instruments(workspace_id, symbol, asset_class)`,

  `CREATE UNIQUE INDEX instruments_non_option_identity_idx
    ON instruments(workspace_id, symbol, asset_class, COALESCE(expires_on, ''))
    WHERE asset_class <> 'option'`,

  `CREATE UNIQUE INDEX instruments_option_identity_idx
    ON instruments(workspace_id, symbol, expires_on, strike_price_text, option_right)
    WHERE asset_class = 'option'`,

  ...immutableTableTriggers("instruments"),

  `CREATE TABLE import_batches (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    workspace_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    source_kind TEXT NOT NULL CHECK(source_kind IN ('generic_csv', 'broker_csv', 'manual_file')),
    source_name TEXT NOT NULL CHECK(length(source_name) > 0),
    parser_id TEXT NOT NULL CHECK(length(parser_id) > 0),
    parser_version INTEGER NOT NULL CHECK(parser_version > 0),
    input_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("input_sha256")}),
    mapping_json TEXT NOT NULL CHECK(length(mapping_json) > 1),
    mapping_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("mapping_sha256")}),
    imported_at_ms INTEGER NOT NULL CHECK(imported_at_ms >= 0),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (account_id, workspace_id)
      REFERENCES accounts(id, workspace_id) ON DELETE RESTRICT,
    UNIQUE (id, workspace_id),
    UNIQUE (id, account_id, workspace_id)
  ) STRICT`,

  `CREATE INDEX import_batches_workspace_time_idx
    ON import_batches(workspace_id, imported_at_ms DESC)`,

  `CREATE INDEX import_batches_dedupe_idx
    ON import_batches(
      workspace_id, account_id, input_sha256, parser_id, parser_version, mapping_sha256
    )`,

  `CREATE TABLE import_source_rows (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    batch_id TEXT NOT NULL,
    row_ordinal INTEGER NOT NULL CHECK(row_ordinal > 0),
    source_text TEXT NOT NULL,
    normalized_row_json TEXT NOT NULL CHECK(length(normalized_row_json) > 1),
    row_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("row_sha256")}),
    FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE RESTRICT,
    UNIQUE (batch_id, row_ordinal),
    UNIQUE (batch_id, id)
  ) STRICT`,

  `CREATE INDEX import_source_rows_batch_hash_idx
    ON import_source_rows(batch_id, row_sha256)`,

  `CREATE TABLE import_issues (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    batch_id TEXT NOT NULL,
    source_row_id TEXT,
    severity TEXT NOT NULL CHECK(severity IN ('warning', 'error')),
    issue_code TEXT NOT NULL CHECK(length(issue_code) > 0),
    column_name TEXT,
    message TEXT NOT NULL CHECK(length(message) > 0),
    details_json TEXT,
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE RESTRICT,
    FOREIGN KEY (batch_id, source_row_id)
      REFERENCES import_source_rows(batch_id, id) ON DELETE RESTRICT
  ) STRICT`,

  `CREATE INDEX import_issues_batch_severity_idx
    ON import_issues(batch_id, severity, source_row_id)`,

  `CREATE TABLE import_receipts (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    batch_id TEXT NOT NULL UNIQUE,
    outcome TEXT NOT NULL CHECK(outcome IN ('committed', 'rejected')),
    source_row_count INTEGER NOT NULL CHECK(source_row_count >= 0),
    accepted_row_count INTEGER NOT NULL CHECK(accepted_row_count >= 0),
    rejected_row_count INTEGER NOT NULL CHECK(rejected_row_count >= 0),
    skipped_row_count INTEGER NOT NULL CHECK(skipped_row_count >= 0),
    warning_count INTEGER NOT NULL CHECK(warning_count >= 0),
    execution_version_count INTEGER NOT NULL CHECK(execution_version_count >= 0),
    result_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("result_sha256")}),
    recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= 0),
    FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE RESTRICT,
    CHECK(accepted_row_count + rejected_row_count + skipped_row_count = source_row_count),
    CHECK(outcome <> 'rejected' OR accepted_row_count = 0)
  ) STRICT`,

  `CREATE INDEX import_receipts_recorded_at_idx
    ON import_receipts(recorded_at_ms DESC)`,

  `CREATE TABLE import_rollbacks (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    import_receipt_id TEXT NOT NULL UNIQUE,
    reason TEXT NOT NULL CHECK(length(reason) > 0),
    reverted_execution_count INTEGER NOT NULL CHECK(reverted_execution_count >= 0),
    result_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("result_sha256")}),
    recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= 0),
    FOREIGN KEY (import_receipt_id) REFERENCES import_receipts(id) ON DELETE RESTRICT
  ) STRICT`,

  `CREATE INDEX import_rollbacks_recorded_at_idx
    ON import_rollbacks(recorded_at_ms DESC)`,

  `CREATE TRIGGER import_rollbacks_require_committed_receipt
    BEFORE INSERT ON import_rollbacks
    WHEN NOT EXISTS (
      SELECT 1 FROM import_receipts AS receipt
      WHERE receipt.id = NEW.import_receipt_id AND receipt.outcome = 'committed'
    )
    BEGIN SELECT RAISE(ABORT, 'only a committed import receipt can be rolled back'); END`,

  ...immutableTableTriggers("import_batches"),
  ...immutableTableTriggers("import_source_rows"),
  ...immutableTableTriggers("import_issues"),
  ...immutableTableTriggers("import_receipts"),
  ...immutableTableTriggers("import_rollbacks"),

  `CREATE TABLE executions (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    workspace_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    instrument_id TEXT NOT NULL,
    ledger_sequence INTEGER NOT NULL CHECK(ledger_sequence > 0),
    identity_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("identity_sha256")}),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (account_id, workspace_id)
      REFERENCES accounts(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (instrument_id, workspace_id)
      REFERENCES instruments(id, workspace_id) ON DELETE RESTRICT,
    UNIQUE (workspace_id, identity_sha256),
    UNIQUE (workspace_id, ledger_sequence),
    UNIQUE (id, workspace_id),
    UNIQUE (id, account_id, workspace_id)
  ) STRICT`,

  `CREATE INDEX executions_account_time_idx
    ON executions(workspace_id, account_id, created_at_ms DESC)`,

  `CREATE INDEX executions_instrument_idx
    ON executions(workspace_id, instrument_id)`,

  `CREATE TABLE execution_versions (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    execution_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    version_number INTEGER NOT NULL CHECK(version_number > 0),
    side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
    position_effect TEXT NOT NULL DEFAULT 'auto'
      CHECK(position_effect IN ('auto', 'open', 'close')),
    quantity_text TEXT NOT NULL CHECK(${canonicalUnsignedDecimalCheck("quantity_text", false)}),
    price_text TEXT NOT NULL CHECK(${canonicalUnsignedDecimalCheck("price_text", false)}),
    quote_currency_code TEXT NOT NULL,
    executed_at_us INTEGER NOT NULL CHECK(executed_at_us >= 0),
    external_order_id TEXT,
    external_execution_id TEXT,
    is_void INTEGER NOT NULL DEFAULT 0 CHECK(is_void IN (0, 1)),
    edit_reason TEXT,
    version_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("version_sha256")}),
    recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= 0),
    FOREIGN KEY (execution_id, workspace_id)
      REFERENCES executions(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (quote_currency_code) REFERENCES currencies(code)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE (execution_id, version_number),
    UNIQUE (execution_id, id),
    UNIQUE (id, workspace_id),
    UNIQUE (execution_id, version_sha256),
    CHECK(edit_reason IS NULL OR length(edit_reason) > 0),
    CHECK(version_number = 1 OR edit_reason IS NOT NULL)
  ) STRICT`,

  `CREATE INDEX execution_versions_time_idx
    ON execution_versions(execution_id, executed_at_us, version_number)`,

  `CREATE TABLE execution_fee_components (
    execution_version_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    component_ordinal INTEGER NOT NULL CHECK(component_ordinal >= 0),
    category TEXT NOT NULL CHECK(category IN (
      'commission', 'regulatory', 'exchange', 'routing', 'other'
    )),
    currency_code TEXT NOT NULL,
    cost_minor INTEGER NOT NULL,
    PRIMARY KEY (execution_version_id, component_ordinal),
    FOREIGN KEY (execution_version_id, workspace_id)
      REFERENCES execution_versions(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (currency_code) REFERENCES currencies(code)
      ON UPDATE CASCADE ON DELETE RESTRICT
  ) STRICT`,

  `CREATE INDEX execution_fee_components_currency_idx
    ON execution_fee_components(currency_code, execution_version_id)`,

  `CREATE TABLE execution_heads (
    execution_id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    execution_version_id TEXT NOT NULL UNIQUE,
    changed_at_ms INTEGER NOT NULL CHECK(changed_at_ms >= 0),
    FOREIGN KEY (execution_id, workspace_id)
      REFERENCES executions(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (execution_id, execution_version_id)
      REFERENCES execution_versions(execution_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (execution_version_id, workspace_id)
      REFERENCES execution_versions(id, workspace_id) ON DELETE RESTRICT
  ) STRICT`,

  `CREATE INDEX execution_heads_version_idx
    ON execution_heads(execution_version_id)`,

  `CREATE TABLE execution_sources (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    execution_version_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    source_kind TEXT NOT NULL CHECK(source_kind IN ('import', 'manual')),
    import_batch_id TEXT,
    import_source_row_id TEXT,
    stable_source_key TEXT NOT NULL CHECK(length(stable_source_key) > 0),
    source_payload_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("source_payload_sha256")}),
    recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= 0),
    FOREIGN KEY (execution_version_id, workspace_id)
      REFERENCES execution_versions(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (import_batch_id, workspace_id)
      REFERENCES import_batches(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (import_batch_id, import_source_row_id)
      REFERENCES import_source_rows(batch_id, id) ON DELETE RESTRICT,
    UNIQUE (execution_version_id, source_kind, stable_source_key),
    CHECK(
      (source_kind = 'import' AND import_batch_id IS NOT NULL AND import_source_row_id IS NOT NULL)
      OR
      (source_kind = 'manual' AND import_batch_id IS NULL AND import_source_row_id IS NULL)
    )
  ) STRICT`,

  `CREATE INDEX execution_sources_import_row_idx
    ON execution_sources(import_source_row_id)
    WHERE import_source_row_id IS NOT NULL`,

  `CREATE TABLE import_execution_occurrences (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    import_batch_id TEXT NOT NULL,
    import_source_row_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    execution_id TEXT NOT NULL,
    execution_version_id TEXT NOT NULL,
    occurrence_kind TEXT NOT NULL CHECK(occurrence_kind IN ('created', 'restored', 'duplicate')),
    recorded_at_ms INTEGER NOT NULL CHECK(recorded_at_ms >= 0),
    FOREIGN KEY (import_batch_id, account_id, workspace_id)
      REFERENCES import_batches(id, account_id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (import_batch_id, import_source_row_id)
      REFERENCES import_source_rows(batch_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (execution_id, account_id, workspace_id)
      REFERENCES executions(id, account_id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (execution_id, execution_version_id)
      REFERENCES execution_versions(execution_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (execution_version_id, workspace_id)
      REFERENCES execution_versions(id, workspace_id) ON DELETE RESTRICT,
    UNIQUE (import_batch_id, import_source_row_id)
  ) STRICT`,

  `CREATE INDEX import_execution_occurrences_execution_idx
    ON import_execution_occurrences(execution_id, import_batch_id)`,

  ...immutableTableTriggers("executions"),
  ...immutableTableTriggers("execution_versions"),
  ...immutableTableTriggers("execution_fee_components"),
  ...immutableTableTriggers("execution_sources"),
  ...immutableTableTriggers("import_execution_occurrences"),

  `CREATE TABLE projection_rebuild_runs (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    workspace_id TEXT NOT NULL,
    reason TEXT NOT NULL CHECK(reason IN ('initial', 'import', 'edit', 'rollback', 'recovery', 'schema')),
    algorithm_version INTEGER NOT NULL CHECK(algorithm_version > 0),
    status TEXT NOT NULL CHECK(status IN ('running', 'succeeded', 'failed')),
    input_heads_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("input_heads_sha256")}),
    output_sha256 TEXT CHECK(output_sha256 IS NULL OR (${HASH_CHECK("output_sha256")})),
    error_message TEXT,
    started_at_ms INTEGER NOT NULL CHECK(started_at_ms >= 0),
    completed_at_ms INTEGER CHECK(completed_at_ms IS NULL OR completed_at_ms >= started_at_ms),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    UNIQUE (workspace_id, id),
    CHECK(
      (status = 'running' AND completed_at_ms IS NULL AND output_sha256 IS NULL AND error_message IS NULL)
      OR
      (status = 'succeeded' AND completed_at_ms IS NOT NULL AND output_sha256 IS NOT NULL AND error_message IS NULL)
      OR
      (status = 'failed' AND completed_at_ms IS NOT NULL AND output_sha256 IS NULL AND error_message IS NOT NULL)
    )
  ) STRICT`,

  `CREATE INDEX projection_rebuild_runs_workspace_status_idx
    ON projection_rebuild_runs(workspace_id, status, started_at_ms DESC)`,

  `CREATE TABLE projection_active_state (
    workspace_id TEXT PRIMARY KEY,
    active_rebuild_run_id TEXT NOT NULL UNIQUE,
    generation INTEGER NOT NULL CHECK(generation > 0),
    execution_heads_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("execution_heads_sha256")}),
    activated_at_ms INTEGER NOT NULL CHECK(activated_at_ms >= 0),
    FOREIGN KEY (workspace_id, active_rebuild_run_id)
      REFERENCES projection_rebuild_runs(workspace_id, id) ON DELETE RESTRICT
  ) STRICT`,

  `CREATE TRIGGER projection_active_state_require_succeeded_insert
    BEFORE INSERT ON projection_active_state
    WHEN NOT EXISTS (
      SELECT 1 FROM projection_rebuild_runs AS run
      WHERE run.id = NEW.active_rebuild_run_id
        AND run.workspace_id = NEW.workspace_id
        AND run.status = 'succeeded'
        AND run.input_heads_sha256 = NEW.execution_heads_sha256
    )
    BEGIN SELECT RAISE(ABORT, 'active projection must reference a succeeded rebuild for the same execution heads'); END`,

  `CREATE TRIGGER projection_active_state_require_succeeded_update
    BEFORE UPDATE ON projection_active_state
    WHEN NOT EXISTS (
      SELECT 1 FROM projection_rebuild_runs AS run
      WHERE run.id = NEW.active_rebuild_run_id
        AND run.workspace_id = NEW.workspace_id
        AND run.status = 'succeeded'
        AND run.input_heads_sha256 = NEW.execution_heads_sha256
    )
    BEGIN SELECT RAISE(ABORT, 'active projection must reference a succeeded rebuild for the same execution heads'); END`,

  `CREATE TABLE trade_subjects (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    workspace_id TEXT NOT NULL,
    account_id TEXT NOT NULL,
    instrument_id TEXT NOT NULL,
    stable_key_sha256 TEXT NOT NULL CHECK(${HASH_CHECK("stable_key_sha256")}),
    created_at_ms INTEGER NOT NULL CHECK(created_at_ms >= 0),
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE RESTRICT,
    FOREIGN KEY (account_id, workspace_id)
      REFERENCES accounts(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (instrument_id, workspace_id)
      REFERENCES instruments(id, workspace_id) ON DELETE RESTRICT,
    UNIQUE (workspace_id, stable_key_sha256),
    UNIQUE (id, workspace_id)
  ) STRICT`,

  `CREATE INDEX trade_subjects_account_instrument_idx
    ON trade_subjects(workspace_id, account_id, instrument_id, created_at_ms DESC)`,

  `CREATE TABLE trade_projections (
    rebuild_run_id TEXT NOT NULL,
    trade_subject_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    direction TEXT NOT NULL CHECK(direction IN ('long', 'short')),
    status TEXT NOT NULL CHECK(status IN ('open', 'closed')),
    quote_currency_code TEXT NOT NULL,
    multiplier_text TEXT NOT NULL CHECK(${canonicalUnsignedDecimalCheck("multiplier_text", false)}),
    opened_at_us INTEGER NOT NULL CHECK(opened_at_us >= 0),
    closed_at_us INTEGER CHECK(closed_at_us IS NULL OR closed_at_us >= opened_at_us),
    entered_quantity_text TEXT NOT NULL CHECK(${canonicalUnsignedDecimalCheck("entered_quantity_text", false)}),
    exited_quantity_text TEXT NOT NULL CHECK(${canonicalUnsignedDecimalCheck("exited_quantity_text", true)}),
    remaining_quantity_text TEXT NOT NULL CHECK(${canonicalUnsignedDecimalCheck("remaining_quantity_text", true)}),
    entry_notional_text TEXT NOT NULL CHECK(${canonicalUnsignedDecimalCheck("entry_notional_text", false)}),
    exit_notional_text TEXT NOT NULL CHECK(${canonicalUnsignedDecimalCheck("exit_notional_text", true)}),
    execution_count INTEGER NOT NULL CHECK(execution_count > 0),
    PRIMARY KEY (rebuild_run_id, trade_subject_id),
    FOREIGN KEY (workspace_id, rebuild_run_id)
      REFERENCES projection_rebuild_runs(workspace_id, id) ON DELETE RESTRICT,
    FOREIGN KEY (trade_subject_id, workspace_id)
      REFERENCES trade_subjects(id, workspace_id) ON DELETE RESTRICT,
    FOREIGN KEY (quote_currency_code) REFERENCES currencies(code)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE (workspace_id, rebuild_run_id, trade_subject_id),
    CHECK(
      (status = 'open' AND remaining_quantity_text <> '0' AND closed_at_us IS NULL)
      OR
      (status = 'closed' AND remaining_quantity_text = '0' AND closed_at_us IS NOT NULL)
    )
  ) STRICT`,

  `CREATE INDEX trade_projections_status_time_idx
    ON trade_projections(rebuild_run_id, status, opened_at_us DESC)`,

  `CREATE TABLE trade_execution_allocations (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    rebuild_run_id TEXT NOT NULL,
    trade_subject_id TEXT NOT NULL,
    workspace_id TEXT NOT NULL,
    execution_version_id TEXT NOT NULL,
    fragment_index INTEGER NOT NULL CHECK(fragment_index >= 0),
    effect TEXT NOT NULL CHECK(effect IN ('entry', 'exit')),
    side TEXT NOT NULL CHECK(side IN ('buy', 'sell')),
    occurred_at_us INTEGER NOT NULL CHECK(occurred_at_us >= 0),
    quantity_text TEXT NOT NULL CHECK(${canonicalUnsignedDecimalCheck("quantity_text", false)}),
    price_text TEXT NOT NULL CHECK(${canonicalUnsignedDecimalCheck("price_text", false)}),
    FOREIGN KEY (workspace_id, rebuild_run_id, trade_subject_id)
      REFERENCES trade_projections(workspace_id, rebuild_run_id, trade_subject_id) ON DELETE RESTRICT,
    FOREIGN KEY (execution_version_id, workspace_id)
      REFERENCES execution_versions(id, workspace_id) ON DELETE RESTRICT,
    UNIQUE (rebuild_run_id, trade_subject_id, execution_version_id, fragment_index),
    UNIQUE (rebuild_run_id, trade_subject_id, id, effect)
  ) STRICT`,

  `CREATE INDEX trade_execution_allocations_version_idx
    ON trade_execution_allocations(execution_version_id, rebuild_run_id)`,

  `CREATE TABLE trade_lot_matches (
    id TEXT PRIMARY KEY CHECK(length(id) > 0),
    rebuild_run_id TEXT NOT NULL,
    trade_subject_id TEXT NOT NULL,
    entry_allocation_id TEXT NOT NULL,
    entry_effect TEXT NOT NULL DEFAULT 'entry' CHECK(entry_effect = 'entry'),
    exit_allocation_id TEXT NOT NULL,
    exit_effect TEXT NOT NULL DEFAULT 'exit' CHECK(exit_effect = 'exit'),
    quantity_text TEXT NOT NULL CHECK(${canonicalUnsignedDecimalCheck("quantity_text", false)}),
    pnl_currency_code TEXT NOT NULL,
    gross_pnl_text TEXT NOT NULL CHECK(${canonicalSignedDecimalCheck("gross_pnl_text")}),
    FOREIGN KEY (rebuild_run_id, trade_subject_id)
      REFERENCES trade_projections(rebuild_run_id, trade_subject_id) ON DELETE RESTRICT,
    FOREIGN KEY (rebuild_run_id, trade_subject_id, entry_allocation_id, entry_effect)
      REFERENCES trade_execution_allocations(rebuild_run_id, trade_subject_id, id, effect)
      ON DELETE RESTRICT,
    FOREIGN KEY (rebuild_run_id, trade_subject_id, exit_allocation_id, exit_effect)
      REFERENCES trade_execution_allocations(rebuild_run_id, trade_subject_id, id, effect)
      ON DELETE RESTRICT,
    FOREIGN KEY (pnl_currency_code) REFERENCES currencies(code)
      ON UPDATE CASCADE ON DELETE RESTRICT,
    UNIQUE (rebuild_run_id, trade_subject_id, entry_allocation_id, exit_allocation_id),
    CHECK(entry_allocation_id <> exit_allocation_id)
  ) STRICT`,

  `CREATE INDEX trade_lot_matches_entry_idx
    ON trade_lot_matches(entry_allocation_id, rebuild_run_id)`,

  `CREATE INDEX trade_lot_matches_exit_idx
    ON trade_lot_matches(exit_allocation_id, rebuild_run_id)`,

  `CREATE TABLE trade_money_totals (
    rebuild_run_id TEXT NOT NULL,
    trade_subject_id TEXT NOT NULL,
    currency_code TEXT NOT NULL,
    gross_pnl_text TEXT NOT NULL CHECK(${canonicalSignedDecimalCheck("gross_pnl_text")}),
    fee_cost_text TEXT NOT NULL CHECK(${canonicalSignedDecimalCheck("fee_cost_text")}),
    net_pnl_text TEXT NOT NULL CHECK(${canonicalSignedDecimalCheck("net_pnl_text")}),
    PRIMARY KEY (rebuild_run_id, trade_subject_id, currency_code),
    FOREIGN KEY (rebuild_run_id, trade_subject_id)
      REFERENCES trade_projections(rebuild_run_id, trade_subject_id) ON DELETE RESTRICT,
    FOREIGN KEY (currency_code) REFERENCES currencies(code)
      ON UPDATE CASCADE ON DELETE RESTRICT
  ) STRICT`,

  `CREATE INDEX trade_money_totals_currency_idx
    ON trade_money_totals(currency_code, rebuild_run_id)`,

  ...immutableTableTriggers("projection_rebuild_runs"),
  ...immutableTableTriggers("trade_subjects"),
  ...immutableTableTriggers("trade_projections"),
  ...immutableTableTriggers("trade_execution_allocations"),
  ...immutableTableTriggers("trade_lot_matches"),
  ...immutableTableTriggers("trade_money_totals"),
]);

/**
 * The native plugin commits upgrade statements before it advances
 * `user_version`. IF NOT EXISTS makes replay safe if iOS terminates the process
 * in that narrow gap; checksum verification still rejects a different schema.
 */
export const V1_MIGRATION_BODY: readonly string[] = Object.freeze(
  V1_MIGRATION_DEFINITIONS.map((statement) => statement.replace(
    /^CREATE (TABLE|INDEX|UNIQUE INDEX|TRIGGER) /,
    "CREATE $1 IF NOT EXISTS ",
  )),
);

export function v1MigrationChecksumInput(): string {
  return JSON.stringify({
    toVersion: V1_MIGRATION_VERSION,
    name: V1_MIGRATION_NAME,
    statements: V1_MIGRATION_BODY,
  });
}

// The receipt is deliberately excluded from its own digest; every receipt
// value except the wall-clock application time is derived from this body.
export const V1_MIGRATION_CHECKSUM_SHA256 = sha256Hex(v1MigrationChecksumInput());

const migrationReceiptStatement = `INSERT INTO schema_migrations (
    version, name, checksum_sha256, applied_at_ms
  ) VALUES (
    ${V1_MIGRATION_VERSION},
    '${V1_MIGRATION_NAME}',
    '${V1_MIGRATION_CHECKSUM_SHA256}',
    CAST(unixepoch() AS INTEGER) * 1000
  ) ON CONFLICT(version) DO NOTHING`;

export const V1_MIGRATION_STATEMENTS: readonly string[] = Object.freeze([
  ...V1_MIGRATION_BODY,
  migrationReceiptStatement,
]);
