"""Application database engine + session factory.

This is the *companion* database. It is never the RustDesk DB.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# Ensure parent directory exists. Inside the container this is /data.
db_path = Path(settings.app_db_path)
db_path.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    f"sqlite:///{db_path}",
    echo=False,
    connect_args={"check_same_thread": False},
    future=True,
)


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_conn, _connection_record):
    # Enforce foreign keys for referential integrity.
    cur = dbapi_conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.execute("PRAGMA journal_mode=WAL")
    cur.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    pass


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables, seed the singleton settings row, and (re)create the
    max-companies-per-device trigger against the current settings value."""
    from . import models  # noqa: F401  (ensures model registration)

    Base.metadata.create_all(bind=engine)

    with engine.begin() as conn:
        # Seed the singleton settings row if missing. Default max = 2 to
        # preserve historical behavior of pre-settings deployments.
        conn.exec_driver_sql(
            "INSERT OR IGNORE INTO app_settings (id, max_companies_per_device) VALUES (1, 2)"
        )

        # Drop the legacy hard-coded "max 2" trigger from earlier deploys, if
        # present. The new trigger reads the current limit from app_settings
        # so it always matches the admin-configured value.
        conn.exec_driver_sql("DROP TRIGGER IF EXISTS trg_max_two_companies_per_device")
        conn.exec_driver_sql("DROP TRIGGER IF EXISTS trg_max_companies_per_device")
        conn.exec_driver_sql(
            """
            CREATE TRIGGER trg_max_companies_per_device
            BEFORE INSERT ON device_company_assignments
            FOR EACH ROW
            WHEN (
                SELECT COUNT(*) FROM device_company_assignments
                WHERE device_id = NEW.device_id
            ) >= (SELECT max_companies_per_device FROM app_settings WHERE id = 1)
            BEGIN
                SELECT RAISE(ABORT, 'max companies per device exceeded');
            END;
            """
        )
    logger.info("Application database initialized at %s", db_path)
