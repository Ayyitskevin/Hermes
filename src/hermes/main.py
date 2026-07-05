"""Service entry — FastAPI app factory and the `hermes` CLI.

Run modes:
    hermes serve            long-lived service (what systemd runs)
    hermes daily-check      run the daily market check once, now (manual override)
    hermes sync             sync bars once, now
    hermes backup           snapshot the database once, now (prunes to retention)
    hermes doctor           startup checks + positive-evidence health, then exit
"""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, db, oplog
from .api.routes import build_router
from .config import HermesConfig, load_config
from .data.registry import build_provider

WEB_DIR = Path(__file__).resolve().parent.parent.parent / "web"


def create_app(config: HermesConfig | None = None, *, with_scheduler: bool = True) -> FastAPI:
    config = config or load_config()
    oplog.init(config.log_dir)
    db.init(config.data_dir)
    provider = build_provider(config)
    oplog.log("service", "startup", provider.name, None, "ok",
              f"hermes v{__version__}, provider={provider.name}, "
              f"classifier={config.regime.classifier}")

    app = FastAPI(title="Hermes", version=__version__, docs_url="/api/docs")
    app.include_router(build_router(config, provider))

    if with_scheduler:
        from .jobs import scheduler as sched

        @app.on_event("startup")
        def _start_scheduler():
            app.state.scheduler = sched.start(config, provider)
            oplog.log("service", "scheduler_start", "apscheduler", None, "ok",
                      ", ".join(sched.job_definitions(config, provider)))

        @app.on_event("shutdown")
        def _stop_scheduler():
            if getattr(app.state, "scheduler", None):
                app.state.scheduler.shutdown(wait=False)

    if WEB_DIR.exists():
        @app.get("/", include_in_schema=False)
        def index():
            return FileResponse(WEB_DIR / "index.html")

        @app.get("/journal", include_in_schema=False)
        def journal_page():
            return FileResponse(WEB_DIR / "journal.html")

        app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")

    return app


def cli() -> None:
    command = sys.argv[1] if len(sys.argv) > 1 else "serve"
    config = load_config()

    if command == "serve":
        import uvicorn
        uvicorn.run(create_app(config), host=config.server.host,
                    port=config.server.port, log_level="warning")
        return

    # One-shot commands share the service's init path but skip the scheduler.
    oplog.init(config.log_dir)
    db.init(config.data_dir)
    provider = build_provider(config)

    if command == "daily-check":
        from .jobs import daily_check, runner
        result = runner.run_job(
            "daily_check", lambda: daily_check.daily_check(config, provider),
            trigger="manual")
        print(result["detail"])
    elif command == "sync":
        from .jobs import runner, sync
        result = runner.run_job(
            "eod_sync", lambda: sync.sync_bars(config, provider), trigger="manual")
        print(result["detail"])
    elif command == "backup":
        from .jobs import backup, runner
        result = runner.run_job(
            "backup", lambda: backup.backup_db(config), trigger="manual")
        print(result["detail"])
    elif command == "doctor":
        from .ai.ollama import OllamaClient
        conn = db.connect()
        bars = conn.execute("SELECT COUNT(*) FROM bars").fetchone()[0]
        print(f"hermes v{__version__}")
        print(f"config: {config.config_path or '(defaults — no hermes.toml found)'}")
        print(f"db: {config.data_dir / 'hermes.db'} ({bars} bars cached)")
        print(f"provider: {provider.name} state={provider.state().value}")
        print(f"ollama: {'reachable' if OllamaClient(config).available() else 'UNREACHABLE'} "
              f"at {config.ai.ollama_url}")
        print(f"classifier: {config.regime.classifier}")
    else:
        print(f"Unknown command {command!r}. "
              "Commands: serve, daily-check, sync, backup, doctor")
        sys.exit(2)


if __name__ == "__main__":
    cli()
