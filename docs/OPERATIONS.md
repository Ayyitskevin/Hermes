# Operations

Hermes runs as a real service, not a script you remember to restart.

## Deploy (systemd)

```bash
# as a user with sudo, on the always-on machine (Python 3.11+ required)
sudo mkdir -p /opt/hermes && sudo chown "$USER" /opt/hermes
git clone https://github.com/Ayyitskevin/Hermes.git /opt/hermes
cd /opt/hermes
python3 -m venv .venv && .venv/bin/pip install -e .
cp .env.example .env            # fill in your keys
cp config/hermes.example.toml config/hermes.toml   # adjust limits/watchlist

# The unit runs as a dedicated system user — create it, the runtime dirs,
# and hand the tree over (the unit's ReadWritePaths expect these to exist):
sudo useradd --system --home /opt/hermes --shell /usr/sbin/nologin hermes || true
sudo install -d -o hermes -g hermes /opt/hermes/data /opt/hermes/logs
sudo chown -R hermes:hermes /opt/hermes

sudo cp deploy/hermes.service /etc/systemd/system/hermes.service
# edit User= and the /opt/hermes paths in the unit if you deviate
sudo systemctl daemon-reload
sudo systemctl enable --now hermes
```

Verify with positive evidence, not absence of errors:

```bash
systemctl status hermes                     # running?
curl -s localhost:8642/api/health | python3 -m json.tool
/opt/hermes/.venv/bin/hermes doctor         # config, db, provider, ollama
```

`/api/health` reports db writability (a real write-lock probe — a read-only
database file reports `writable: false`), cached bar count, provider state,
Ollama reachability, and per-job missed flags — positive evidence, never
just "no crash".

## Logs

Canonical line format, one file per component under `logs/`:

```
timestamp · action · source · latency · outcome (ok/retry/fail/skip) [· detail]
2026-07-04T12:31:07Z · GET /v2/stocks/SPY/bars · alpaca · 132ms · ok · SPY
```

Components: `service`, `jobs`, `data.alpaca`, `data.databento`, `ai`,
`reviewer`. Everything is mirrored to stdout, so `journalctl -u hermes -f`
shows the merged stream while per-component files stay separable.

## Scheduled jobs and MISSED semantics

Jobs (times in `config/hermes.toml`, America/New_York):

| Job | Default | Does |
|---|---|---|
| `daily_check` | Mon–Fri 08:00 | sync → regime → risk sweep → posture → report |
| `eod_sync` | Mon–Fri 16:30 | pull the day's closed bars |
| `journal_resolve` | Mon–Fri 17:00 | count open/stale entries awaiting human resolution |
| `weekly_review` | Sun 18:00 | regime coherence, sector heat, correlation matrix, journal-informed exposure → stored report |
| `backup` | Daily 02:00 | snapshot `hermes.db`, prune to retention (see Backup & upgrade) |

The market jobs fire Mon–Fri; `weekly_review` is weekly (Sunday); `backup`
runs every day including weekends, so a weekend of journalling is never left
un-snapshotted. The schedule grammar is `"MIN HOUR"` (defaults Mon–Fri) or
`"MIN HOUR DOW"` — the optional day-of-week is an APScheduler string (`sun`,
`mon-fri`, `mon-sun`, `mon,wed,fri`). MISSED detection understands each job's
own cadence: a weekly job is flagged MISSED only when a *Sunday* fire has no
evidence row, the backup only when a *daily* fire is missing.

Every run writes a `job_runs` row. The Station Log compares evidence against
the schedule: an expected fire with no row within 30 minutes shows **MISSED**
on the dashboard and in `/api/health`. An empty error log is not success —
if the process was down at 08:00, you'll see MISSED, not silence.

**Day zero:** a fresh install deployed *after* a job's scheduled time shows
MISSED for that job until its first real fire — correct (the fire genuinely
didn't happen), and it clears the next scheduled run. To clear it
immediately, trigger the job manually; a manual run is evidence too.

## Manual overrides

- UI: "run now" next to every job in the Station Log.
- API: `POST /api/jobs/daily_check/run` (also `eod_sync`, `journal_resolve`,
  `weekly_review`).
- CLI: `hermes daily-check`, `hermes sync` — same code path, same evidence.

## Degradation states (all visible, none silent)

| State | Where it shows |
|---|---|
| Alpaca 429 rate limit | provider chip `▲ rate-limited` in the rail; retry logged |
| Missing/invalid keys | provider chip `✗ no keys` / `✗ auth error`; sample mode still works |
| Ollama down | report's narrative section says so; reviewer verdict notes the skipped LLM pass |
| Stale prices | per-symbol freshness chip flips `● live → ◐ stale → ○ dead` |
| Missing bars | shown as gaps/`∅ missing`; nothing interpolated |
| Job didn't run | `■ MISSED` in Station Log and `/api/health` |

## Backup & upgrade

State is one SQLite file: `data/hermes.db` (WAL mode) — every journal entry,
regime reading, risk event, and equity-index point.

- **Automatic (default):** the `backup` job snapshots the database nightly at
  02:00 (every day) to `data/backups/hermes-<timestamp>.db` and prunes to
  `[backup] retention` (default 14). It uses SQLite's online backup API, so
  it's safe against the live WAL database — no downtime. The most recent
  snapshot shows in `/api/health` under `backup`; a backup that stops firing
  is flagged **MISSED** like any other job (silence is not evidence).
- **On demand:** `hermes backup` (same code path, same evidence, prunes to
  retention) or `POST /api/jobs/backup/run`.
- **Restore:** stop the service, copy a chosen snapshot over
  `data/hermes.db`, restart. Snapshots are self-contained, restorable `.db`
  files — do this once as a drill so restore is rehearsed, not assumed.
- **No `sqlite3` CLI?** Not needed — the job uses the Python stdlib. For a
  one-off manual copy without the CLI:

  ```bash
  python3 -c "import sqlite3; s=sqlite3.connect('data/hermes.db'); d=sqlite3.connect('backup.db'); s.backup(d); d.close()"
  ```
- **Upgrade:** `git pull && .venv/bin/pip install -e . && sudo systemctl restart hermes`.
  Migrations apply automatically at startup and are recorded in
  `schema_migrations`.
