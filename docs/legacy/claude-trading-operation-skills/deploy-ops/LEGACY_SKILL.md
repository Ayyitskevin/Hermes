---
name: deploy-ops
description: Running Hermes for real — the systemd unit, scheduled jobs with MISSED detection, nightly backups and the restore drill, .env secrets handling, the doctor check, and the go-live parity gate. Fire this whenever deploying, configuring the service, reasoning about jobs/scheduling, backups, health, or where credentials live. Trigger phrases — "deploy Hermes", "set up systemd", "the job didn't run", "MISSED flag", "restore from backup", "where do the keys go", "is it healthy", "rotate the API key". The rule — silence is not evidence, and secrets live only in .env — never in the repo, config, or database. Apply a security-review lens to .env and the service surface.
---

# deploy-ops — a service, not a script you remember to restart

Hermes "runs as a real service, not a script you remember to restart." Ops here
is about **positive evidence**: prove it ran, prove it is backed up, prove the
keys are only where they belong.

## The doctrine

**systemd** (`deploy/hermes.service`) — a dedicated `hermes` system user,
`WorkingDirectory=/opt/hermes`, `ExecStart=.venv/bin/hermes serve`,
`Restart=on-failure`. Hardening is deliberate and minimal: `NoNewPrivileges`,
`ProtectSystem=strict`, `ProtectHome=true`, `PrivateTmp=true`, and
`ReadWritePaths=/opt/hermes/data /opt/hermes/logs` (the only paths it may write).
Verify with **positive evidence, not absence of errors**: `systemctl status`,
`curl /api/health`, `hermes doctor`.

**Scheduled jobs + MISSED detection** (`src/hermes/jobs/scheduler.py`, times in
`config/hermes.toml`, America/New_York):

| Job | Default | Does |
|---|---|---|
| `daily_check` | Mon–Fri 08:00 | sync → regime → risk sweep → posture → report |
| `eod_sync` | Mon–Fri 16:30 | pull the day's closed bars |
| `journal_resolve` | Mon–Fri 17:00 | count open/stale entries awaiting resolution |
| `weekly_review` | Sun 18:00 | coherence, sector heat, correlation matrix, exposure |
| `backup` | Daily 02:00 | snapshot the DB, prune to retention |

Every run writes a `job_runs` row. The schedule grammar is `"MIN HOUR"` (defaults
Mon–Fri) or `"MIN HOUR DOW"`; MISSED detection understands each job's *own*
cadence (a weekly job is MISSED only when a *Sunday* fire has no row within 30
min). **"Silence is not evidence"** — if the process was down at 08:00 you see
`■ MISSED`, not a quiet blank. Every job has a manual override (UI "run now",
`POST /api/jobs/{name}/run`, CLI) — a manual run is evidence too. Day-zero
MISSED on a fresh install is correct and clears on the next real fire.

**Backups + restore drill** (`src/hermes/jobs/backup.py`). State is one SQLite
file, `data/hermes.db` (WAL). The `backup` job snapshots nightly via SQLite's
**online backup API** (safe against the live WAL DB, no downtime) to
`data/backups/` and prunes to `[backup] retention` (default 14). The latest
snapshot is positive evidence in `/api/health`; a backup that stops firing is
itself **MISSED**-flagged. **Restore:** stop the service, copy a chosen snapshot
over `data/hermes.db`, restart — and **do it once as a drill so restore is
rehearsed, not assumed** (the Phase-6 gate is a restore actually performed).

**Secrets / `.env`** (security-review lens). Every credential lives in `.env`
only, loaded from the environment (`src/hermes/config.py`, `Secrets`). "Nothing
in the repo, config, or database should ever contain a secret, a personal path,
or a dollar figure." The env var *names* are `APCA_API_KEY_ID`,
`APCA_API_SECRET_KEY`, `DATABENTO_API_KEY`, `ANTHROPIC_API_KEY`
(`.env.example` documents the shape; `ANTHROPIC_API_KEY` is a reserved V2 slot
no V1 code reads). **Alpaca keys are account-wide, not read-scoped** — even
though Hermes only ever GETs the data host, guard `.env` like the credential it
is: never commit it, keep it owned/readable only by the service user, and rotate
if exposed.

**The doctor check** (`hermes doctor`) — config path, DB + cached bar count,
provider + state, Ollama reachability, active classifier. `/api/health` adds a
real DB write-lock probe (a read-only file reports `writable: false`), provider
state, and per-job missed flags — positive evidence, never just "no crash."

**The go-live parity gate.** Before trusting the live operation, 10 consecutive
sessions of chart-vs-dashboard regime parity (Phase 1; see `regime-parity`) and
10 trading days with zero MISSED and zero manual restarts (Phase 2).

## What NOT to do

**#1 failure: silent infra rot, or secrets in the wrong place.** Rot: a cron
that quietly stopped, a backup that hasn't fired in a week, a stale price nobody
noticed — mitigated *only* if you open the dashboard daily and act on MISSED
flags and the health surface. "Letting a broken cron rot for a week" is a named
kill-risk; the MISSED flag exists so it can't happen silently, but the flag is
useless unread. Secrets: a key pasted into `config/hermes.toml`, committed to
git, or logged — any of these turns an account-wide credential into a leak.
Keys go in `.env`, nowhere else; never echo them into logs or the canonical
log lines (`timestamp · action · source · latency · outcome`).

Second failure: verifying by absence of errors. An empty error log is not
success — demand a `job_runs` row, a fresh backup entry, a writable DB.

## Where it lives

- Unit: `deploy/hermes.service`. Runbook: `docs/OPERATIONS.md` (deploy, logs,
  MISSED semantics, degradation states, backup & upgrade).
- Scheduler + MISSED: `src/hermes/jobs/scheduler.py`; backups:
  `src/hermes/jobs/backup.py`; daily check: `src/hermes/jobs/daily_check.py`.
- Secrets: `src/hermes/config.py` (`Secrets`, `load_config`); `.env.example`.
- Doctor / health: `src/hermes/main.py` (`doctor`), `src/hermes/api/routes.py`.
- Tests: `tests/test_backup.py`, `tests/test_infra.py`, `tests/test_api.py`.

## How to verify

`.venv/bin/hermes doctor` prints provider/DB/Ollama/classifier; `curl
/api/health` shows writable DB, provider state, latest backup, per-job missed
flags. Confirm a job you kill shows `MISSED` (not silence), a fresh `backup`
run leaves a snapshot in `data/backups/` and a health entry, and
`restore_check()` passes on that snapshot. Grep the repo for any key value or
dollar figure — there must be none; credentials appear only as env-var names.
