"""Runtime, admin-editable settings.

Currently only the max-companies-per-device cap lives here, but this is
the natural home for anything else the admin should be able to change
without redeploying.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import AppSetting
from ..schemas import AppSettingsOut, AppSettingsUpdate

router = APIRouter(prefix="/settings", tags=["settings"])


def _get_or_create(db: Session) -> AppSetting:
    """Fetch the singleton settings row, creating it on the fly if the DB
    somehow booted without the seed insert (defensive)."""
    row = db.get(AppSetting, 1)
    if row is None:
        row = AppSetting(id=1, max_companies_per_device=2)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def get_max_companies_per_device(db: Session) -> int:
    """Small helper used by routers that need to enforce the cap."""
    return _get_or_create(db).max_companies_per_device


@router.get("", response_model=AppSettingsOut)
def get_settings(db: Session = Depends(get_db)):
    return _get_or_create(db)


@router.patch("", response_model=AppSettingsOut)
def update_settings(payload: AppSettingsUpdate, db: Session = Depends(get_db)):
    row = _get_or_create(db)
    new_cap = payload.max_companies_per_device

    # If shrinking the cap, refuse rather than silently orphan existing
    # assignments. The admin should trim overflow devices first.
    if new_cap < row.max_companies_per_device:
        from sqlalchemy import func, select
        from ..models import DeviceCompanyAssignment

        offenders = db.execute(
            select(DeviceCompanyAssignment.device_id, func.count().label("n"))
            .group_by(DeviceCompanyAssignment.device_id)
            .having(func.count() > new_cap)
        ).all()
        if offenders:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot lower the cap to {new_cap}: "
                    f"{len(offenders)} device(s) currently exceed it. "
                    "Remove company assignments from those devices first."
                ),
            )

    row.max_companies_per_device = new_cap
    db.commit()
    db.refresh(row)
    return row
