from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from ..database import get_db
from ..models import Company, Device, DeviceCompanyAssignment
from ..schemas import AssignmentCreate, DeviceCompanyOut, DeviceOut
from .devices import _to_out as _device_to_out
from .settings import get_max_companies_per_device

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.post("", response_model=DeviceOut, status_code=status.HTTP_201_CREATED)
def create_assignment(payload: AssignmentCreate, db: Session = Depends(get_db)):
    device = db.get(Device, payload.device_id)
    if not device:
        raise HTTPException(status_code=404, detail="Device not found")
    company = db.get(Company, payload.company_id)
    if not company:
        raise HTTPException(status_code=404, detail="Company not found")

    # App-layer cap check before we hit the DB trigger. The cap is now
    # admin-configurable and lives in the app_settings row.
    max_companies = get_max_companies_per_device(db)
    current_count = db.scalar(
        select(func.count(DeviceCompanyAssignment.id)).where(
            DeviceCompanyAssignment.device_id == device.id
        )
    ) or 0
    if current_count >= max_companies:
        raise HTTPException(
            status_code=400,
            detail=f"Device already assigned to the maximum of {max_companies} companies",
        )

    existing = db.execute(
        select(DeviceCompanyAssignment).where(
            DeviceCompanyAssignment.device_id == device.id,
            DeviceCompanyAssignment.company_id == company.id,
        )
    ).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Device is already assigned to that company")

    db.add(DeviceCompanyAssignment(device_id=device.id, company_id=company.id))
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # The DB trigger fires as a last-resort safeguard.
        if "max companies per device" in str(exc.orig).lower():
            raise HTTPException(
                status_code=400,
                detail=f"Device already assigned to the maximum of {max_companies} companies",
            )
        raise HTTPException(status_code=409, detail="Assignment conflict")

    db.refresh(device)
    # Re-fetch with eager load so the response has company names.
    device = db.execute(
        select(Device)
        .options(selectinload(Device.assignments).selectinload(DeviceCompanyAssignment.company))
        .where(Device.id == device.id)
    ).scalar_one()
    return _device_to_out(device)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_assignment(device_id: int, company_id: int, db: Session = Depends(get_db)):
    assignment = db.execute(
        select(DeviceCompanyAssignment).where(
            DeviceCompanyAssignment.device_id == device_id,
            DeviceCompanyAssignment.company_id == company_id,
        )
    ).scalar_one_or_none()
    if not assignment:
        raise HTTPException(status_code=404, detail="Assignment not found")
    db.delete(assignment)
    db.commit()
    return None
