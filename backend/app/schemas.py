"""Pydantic request/response schemas."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_serializer


def _iso_utc(dt: Optional[datetime]) -> Optional[str]:
    """Serialize a datetime as an unambiguous UTC ISO-8601 string with Z suffix.

    We store timestamps as UTC via `datetime.now(timezone.utc)`, but SQLAlchemy's
    plain `DateTime` column drops tzinfo on readback from SQLite. Without this
    serializer, naive datetimes would be emitted with no timezone marker and JS
    would interpret them as local time — producing negative "Xs ago" deltas.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    else:
        dt = dt.astimezone(timezone.utc)
    # isoformat on a +00:00 datetime emits "+00:00"; normalize to "Z"
    return dt.isoformat().replace("+00:00", "Z")


class CompanyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    description: Optional[str] = None


class CompanyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None


class CompanyOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    device_count: int = 0

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("created_at", "updated_at")
    def _ser_created_updated(self, v: datetime) -> str:
        return _iso_utc(v)


class DeviceCreate(BaseModel):
    rustdesk_id: Optional[str] = Field(None, max_length=64)
    nickname: Optional[str] = Field(None, max_length=200)
    hostname: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None


class DeviceUpdate(BaseModel):
    rustdesk_id: Optional[str] = Field(None, max_length=64)
    nickname: Optional[str] = Field(None, max_length=200)
    hostname: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = None


class DeviceCompanyOut(BaseModel):
    id: int
    name: str

    model_config = ConfigDict(from_attributes=True)


class DeviceOut(BaseModel):
    id: int
    rustdesk_id: Optional[str] = None
    nickname: Optional[str] = None
    hostname: Optional[str] = None
    alias_from_rustdesk: Optional[str] = None
    notes: Optional[str] = None
    last_seen_at: Optional[datetime] = None
    online_status: Optional[str] = None
    source_type: str
    rustdesk_raw_payload_json: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    companies: List[DeviceCompanyOut] = []

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("last_seen_at", "created_at", "updated_at")
    def _ser_datetimes(self, v: Optional[datetime]) -> Optional[str]:
        return _iso_utc(v)


class AssignmentCreate(BaseModel):
    device_id: int
    company_id: int


class SyncRunOut(BaseModel):
    id: int
    started_at: datetime
    finished_at: Optional[datetime] = None
    status: str
    message: Optional[str] = None
    devices_seen: int
    devices_inserted: int
    devices_updated: int

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("started_at", "finished_at")
    def _ser_run_times(self, v: Optional[datetime]) -> Optional[str]:
        return _iso_utc(v)


class SchemaInspectionColumn(BaseModel):
    name: str
    type: str
    notnull: bool
    pk: bool


class SchemaInspectionTable(BaseModel):
    name: str
    columns: List[SchemaInspectionColumn]
    row_count: Optional[int] = None


class SchemaInspectionReport(BaseModel):
    db_path: str
    db_exists: bool
    readable: bool
    tables: List[SchemaInspectionTable] = []
    chosen_table: Optional[str] = None
    column_mapping: Optional[dict] = None
    notes: List[str] = []


class SyncStatus(BaseModel):
    interval_seconds: int
    last_run: Optional[SyncRunOut] = None
    recent_runs: List[SyncRunOut] = []
    schema_report: Optional[SchemaInspectionReport] = None
    launch_rustdesk_enabled: bool = False


class HealthOut(BaseModel):
    status: str
    rustdesk_db_detected: bool
    rustdesk_db_path: str
    sync_interval_seconds: int
    launch_rustdesk_enabled: bool


class AppSettingsOut(BaseModel):
    max_companies_per_device: int
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

    @field_serializer("updated_at")
    def _ser_updated(self, v: datetime) -> str:
        return _iso_utc(v)


class AppSettingsUpdate(BaseModel):
    # Hard upper bound stops accidental values from turning the UI into a mess
    # (each pill takes real estate in the drawer) and stops the trigger from
    # having to fend off DoS-style inserts. 20 is generous.
    max_companies_per_device: int = Field(..., ge=1, le=20)
