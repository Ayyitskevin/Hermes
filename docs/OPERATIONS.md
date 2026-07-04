# Operations

Hermes runs as a real service, not a script you remember to restart.

## Deploy (systemd)

```bash
# as a user with sudo, on the always-on machine
sudo mkdir -p /opt/hermes && sudo chown "$USER" /opt/hermes
git clone https://github.com/Ayyitskevin/Hermes.git /opt/hermes
cd /opt/hermes
python3 -m venv .venv && .venv/bin/pip install -e .
cp .env.example .env            # fill in your keys
cp config/hermes.example.toml config/hermes.toml   # adjust limits/watchlist

sudo cp deploy/hermes.service /etc/systemd/system/hermes.service
# edit User= and WorkingDirectory= in the unit if you deviate from /opt/hermes
sudo systemctl daemon-reload
sudo systemctl enable --now hermes
```

Verify with positive evidence, not absence of errors:

```bash
systemctl status hermes                     # running?
curl -s localhost:8642/api/health | python3 -m json.tool
/opt/hermes/.venv/bin/hermes doctor         # config, db, provider, ollama
```

`/api/health` reports db writability, cached bar count, provider state,
Ollama reachability, and per-job missed flags — a timestamp that actually
moved, never just "no crash".

## Logs

Canonical line format, one file per component under `logs/`:

```
timestamp · action · source · latency · outcome (ok/retry/fail) [· detail]
2026-07-04T12:31:07Z · GET /v2/stocks/SPY/bars · alpaca · 132ms · ok · SPY
```

Components: `service`, `jobs`, `data.alpaca`, `data.databento`, `ai`,
`reviewer`. Everything is mirrored to stdout, so `journalctl -u hermes -f`
shows the merged stream while per-component files stay separable.

## Scheduled jobs and MISSED semantics

Three jobs (times in `config/hermes.toml`, America/New_York, Mon–Fri):

| Job | Default | Does |
|---|---|---|
| `daily_check` | 08:00 | sync → regime → risk sweep → posture → report |
| `eod_sync` | 16:30 | pull the day's closed bars |
| `journal_resolve` | 17:00 | count open/stale entries awaiting human resolution |

Every run writes a `job_runs` row. The Station Log compares evidence against
the schedule: an expected fire with no row within 30 minutes shows **MISSED**
on the dashboard and in `/api/health`. An empty error log is not success —
if the process was down at 08:00, you'll see MISSED, not silence.

## Manual overrides

- UI: "run now" next to every job in the Station Log.
- API: `POST /api/jobs/daily_check/run` (also `eod_sync`, `journal_resolve`).
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

- State is one SQLite file: `data/hermes.db` (WAL mode — copy with
  `sqlite3 data/hermes.db ".backup backup.db"` while running, or stop first).
- Upgrade: `git pull && .venv/bin/pip install -e . && sudo systemctl restart hermes`.
  Migrations apply automatically at startup and are recorded in
  `schema_migrations`.
