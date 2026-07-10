-- A/B desk extensions (2026-07): reflection, parity ritual, RO book cache,
-- campaign status. All money fields remain % of equity or absent.

-- Trade-memory reflection (roadmap #4) — optional prose on resolve.
ALTER TABLE journal_entries ADD COLUMN reflection_md TEXT;
ALTER TABLE journal_entries ADD COLUMN reflection_source TEXT;
ALTER TABLE journal_entries ADD COLUMN reflection_status TEXT
    CHECK (reflection_status IS NULL OR reflection_status IN ('ok', 'unavailable', 'skipped'));

-- Chart ↔ dashboard parity ritual (P1 gate evidence).
CREATE TABLE parity_checks (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    session_date        TEXT NOT NULL,          -- trading day YYYY-MM-DD (ET intent)
    symbol             TEXT NOT NULL DEFAULT '', -- '' = benchmark / market regime
    chart_label         TEXT NOT NULL,          -- owner's TradingView reading
    hermes_label        TEXT,                   -- dashboard reading at check time
    match               INTEGER,                -- 1 / 0 / NULL if hermes missing
    notes               TEXT,
    recorded_at         TEXT NOT NULL,
    classifier_version  TEXT
);
CREATE INDEX idx_parity_session ON parity_checks (session_date DESC, recorded_at DESC);

-- Broker read-only book cache — % of equity only, never dollars.
CREATE TABLE book_positions (
    symbol              TEXT PRIMARY KEY,
    side                TEXT NOT NULL CHECK (side IN ('long', 'short')),
    size_pct_equity     REAL NOT NULL,          -- market value / equity * 100
    avg_entry_price     REAL,                   -- per-share price only
    current_price       REAL,
    unrealized_pct      REAL,                   -- % on the position, not $
    source              TEXT NOT NULL,          -- e.g. alpaca_paper_ro
    as_of               TEXT NOT NULL,
    fetched_at          TEXT NOT NULL
);

-- Campaign / edge-story status (UNSIGNED until owner signs).
CREATE TABLE campaign_status (
    id          INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
    status      TEXT NOT NULL CHECK (status IN (
                    'UNSIGNED', 'CONDITIONAL', 'SIGNED', 'REJECTED'
                )),
    verdict     TEXT,
    evidence    TEXT,
    updated_at  TEXT NOT NULL,
    updated_by  TEXT NOT NULL DEFAULT 'operator'
);

INSERT INTO campaign_status (id, status, verdict, evidence, updated_at, updated_by)
VALUES (
    1,
    'UNSIGNED',
    'Phase 4 campaign draft: CONDITIONAL-EDGE language in docs/campaigns — not signed.',
    'Pending Strategy Tester cross-check and external review per HANDOFF.',
    datetime('now'),
    'migration'
);
