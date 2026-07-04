-- Hermes schema v1.
-- Data-integrity rule: every market number carries a source and an as-of
-- timestamp. Missing values stay missing (NULL) — nothing is interpolated.

-- Cached OHLCV bars. ts is the bar's own timestamp (UTC ISO-8601);
-- fetched_at records when we obtained it; source names the provider.
CREATE TABLE bars (
    symbol      TEXT NOT NULL,
    timeframe   TEXT NOT NULL,          -- e.g. '1Day'
    ts          TEXT NOT NULL,
    open        REAL NOT NULL,
    high        REAL NOT NULL,
    low         REAL NOT NULL,
    close       REAL NOT NULL,
    volume      INTEGER,
    source      TEXT NOT NULL,
    fetched_at  TEXT NOT NULL,
    PRIMARY KEY (symbol, timeframe, ts)
);

-- Latest-price snapshots (quotes/trades collapsed to "last known price").
CREATE TABLE snapshots (
    symbol      TEXT PRIMARY KEY,
    price       REAL NOT NULL,
    ts          TEXT NOT NULL,          -- when the price was struck at the venue
    source      TEXT NOT NULL,
    fetched_at  TEXT NOT NULL
);

-- One row per regime classification run. evidence_json holds the per-component
-- claims that power the teach-in display; classifier_version says which
-- classifier produced it (reference-v1 until Regime Label v6.2 is ported).
CREATE TABLE regime_readings (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    ts                  TEXT NOT NULL,
    label               TEXT NOT NULL,
    score               REAL NOT NULL,
    confidence          REAL NOT NULL,
    classifier_version  TEXT NOT NULL,
    evidence_json       TEXT NOT NULL,
    data_asof           TEXT NOT NULL,
    data_source         TEXT NOT NULL,
    honesty             TEXT NOT NULL DEFAULT ''
);

-- The trade journal. Sizes and risk are % of account equity — no dollars.
-- signal_json freezes the regime reading at entry; review_json stores the
-- reviewer second-pass verdict issued before the entry was accepted.
CREATE TABLE journal_entries (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol              TEXT NOT NULL,
    side                TEXT NOT NULL CHECK (side IN ('long', 'short')),
    sector              TEXT,
    setup_tag           TEXT,           -- named setup, e.g. 'regime-pullback'
    opened_at           TEXT NOT NULL,
    entry_price         REAL NOT NULL,
    stop_price          REAL NOT NULL,
    target_price        REAL,
    size_pct_equity     REAL NOT NULL,
    planned_risk_pct    REAL NOT NULL,
    thesis              TEXT NOT NULL,
    signal_json         TEXT,
    review_json         TEXT,
    status              TEXT NOT NULL DEFAULT 'open'
                        CHECK (status IN ('open', 'closed')),
    closed_at           TEXT,
    exit_price          REAL,
    realized_return_pct REAL,
    benchmark_return_pct REAL,
    alpha_pct           REAL,
    thesis_played_out   TEXT CHECK (thesis_played_out IN ('yes', 'partial', 'no')),
    resolution_note     TEXT
);

-- Normalized equity curve: starts at 100.0, moves by realized trade returns
-- weighted by position size. Tracks drawdown without ever knowing dollars.
CREATE TABLE equity_index (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL,
    value       REAL NOT NULL,
    cause       TEXT NOT NULL           -- e.g. 'journal_close:17'
);

-- Risk limit breaches and warnings. Unacknowledged events of severity
-- 'breach' put the whole dashboard into its alarm state.
CREATE TABLE risk_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    ts           TEXT NOT NULL,
    kind         TEXT NOT NULL,          -- e.g. 'max_open_risk', 'drawdown', 'correlation'
    severity     TEXT NOT NULL CHECK (severity IN ('info', 'warn', 'breach')),
    message      TEXT NOT NULL,
    acknowledged INTEGER NOT NULL DEFAULT 0
);

-- Positive evidence that scheduled jobs ran. "Silence is not evidence":
-- the dashboard compares this table against the schedule and shows MISSED
-- for any expected run with no row — an empty error log proves nothing.
CREATE TABLE job_runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job         TEXT NOT NULL,
    started_at  TEXT NOT NULL,
    finished_at TEXT,
    outcome     TEXT CHECK (outcome IN ('ok', 'retry', 'fail')),
    detail      TEXT,
    trigger     TEXT NOT NULL DEFAULT 'schedule'  -- 'schedule' or 'manual'
);

-- Morning reports produced by the daily market check.
CREATE TABLE reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    ts          TEXT NOT NULL,
    kind        TEXT NOT NULL,           -- 'daily_check'
    body_md     TEXT NOT NULL,
    meta_json   TEXT
);

CREATE INDEX idx_bars_symbol_tf ON bars (symbol, timeframe, ts DESC);
CREATE INDEX idx_regime_ts ON regime_readings (ts DESC);
CREATE INDEX idx_journal_status ON journal_entries (status, opened_at DESC);
CREATE INDEX idx_job_runs_job ON job_runs (job, started_at DESC);
CREATE INDEX idx_risk_events_ack ON risk_events (acknowledged, ts DESC);
