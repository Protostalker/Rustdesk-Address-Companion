"""SQLAlchemy ORM models for the app database."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Company(Base):
    __tablename__ = "companies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), unique=True, nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )

    assignments: Mapped[List["DeviceCompanyAssignment"]] = relationship(
        back_populates="company", cascade="all, delete-orphan"
    )


class Device(Base):
    __tablename__ = "devices"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    # rustdesk_id is unique when present; for manual devices it may be NULL.
    rustdesk_id: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    nickname: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    hostname: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    alias_from_rustdesk: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # "online" | "offline" | None (unknown / not derivable)
    online_status: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    # "imported" | "manual"
    source_type: Mapped[str] = mapped_column(String(16), default="manual", nullable=False)
    # Raw JSON captured from the RustDesk row (best-effort), for debug.
    rustdesk_raw_payload_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )

    assignments: Mapped[List["DeviceCompanyAssignment"]] = relationship(
        back_populates="device", cascade="all, delete-orphan"
    )


class DeviceCompanyAssignment(Base):
    __tablename__ = "device_company_assignments"
    __table_args__ = (
        UniqueConstraint("device_id", "company_id", name="uq_device_company"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_id: Mapped[int] = mapped_column(
        ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)

    device: Mapped[Device] = relationship(back_populates="assignments")
    company: Mapped[Company] = relationship(back_populates="assignments")


class SyncRun(Base):
    __tablename__ = "sync_runs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow, nullable=False)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    # "running" | "success" | "error" | "skipped"
    status: Mapped[str] = mapped_column(String(16), default="running", nullable=False)
    message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    devices_seen: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    devices_inserted: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    devices_updated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class AppSetting(Base):
    """Singleton settings row (id = 1). Admin-editable at runtime via the
    Setup UI; also read by the SQLite trigger that guards the
    max-companies-per-device invariant."""

    __tablename__ = "app_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    max_companies_per_device: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=_utcnow, onupdate=_utcnow, nullable=False
    )
