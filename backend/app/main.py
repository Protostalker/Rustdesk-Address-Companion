"""FastAPI application entrypoint for RustDesk Address Companion."""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import init_db
from .logging_config import configure_logging
from .routers import assignments, companies, devices, health, settings as settings_router, sync
from .services.presence_scheduler import presence_scheduler
from .services.sync_scheduler import scheduler

configure_logging(logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    logger.info("Starting RustDesk Address Companion")
    logger.info(
        "RustDesk DB path: %s (exists=%s)",
        settings.rustdesk_db_path,
        settings.rustdesk_db_path.exists(),
    )
    init_db()
    await scheduler.start()
    await presence_scheduler.start()
    try:
        yield
    finally:
        await presence_scheduler.stop()
        await scheduler.stop()


app = FastAPI(
    title="RustDesk Address Companion",
    version="1.0.0",
    description=(
        "A self-hosted pseudo address book for RustDesk OSS. "
        "Reads the RustDesk OSS SQLite database read-only and builds its own "
        "admin metadata store (companies, nicknames, notes, assignments). "
        "Does not depend on RustDesk Pro."
    ),
    lifespan=lifespan,
)

settings = get_settings()
cors_origins = [o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# All API routes are mounted under /api so nginx can proxy cleanly.
app.include_router(health.router, prefix="/api")
app.include_router(companies.router, prefix="/api")
app.include_router(devices.router, prefix="/api")
app.include_router(assignments.router, prefix="/api")
app.include_router(sync.router, prefix="/api")
app.include_router(settings_router.router, prefix="/api")
