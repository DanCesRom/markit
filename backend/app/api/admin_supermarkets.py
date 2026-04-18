from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.api.admin_deps import require_admin
from backend.app.models.user import User
from backend.app.models.supermarket import Supermarket, SupermarketStatus
from backend.app.schemas.admin_supermarkets import (
    SupermarketCreate,
    SupermarketUpdate,
    SupermarketResponse,
)

router = APIRouter(prefix="/admin/supermarkets", tags=["Admin - Supermarkets"])


@router.get("", response_model=list[SupermarketResponse])
def list_supermarkets(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return db.query(Supermarket).order_by(Supermarket.id.asc()).all()


@router.post("", response_model=SupermarketResponse)
def create_supermarket(
    payload: SupermarketCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    existing = db.query(Supermarket).filter(Supermarket.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Supermarket name already exists")

    sm = Supermarket(
        name=payload.name,
        address=payload.address,
        latitude=payload.latitude,
        longitude=payload.longitude,
        status=SupermarketStatus.active,
    )
    db.add(sm)
    db.commit()
    db.refresh(sm)
    return sm


@router.patch("/{supermarket_id}", response_model=SupermarketResponse)
def update_supermarket(
    supermarket_id: int,
    payload: SupermarketUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    sm = db.query(Supermarket).filter(Supermarket.id == supermarket_id).first()
    if not sm:
        raise HTTPException(status_code=404, detail="Supermarket not found")

    if payload.name is not None:
        sm.name = payload.name
    if payload.address is not None:
        sm.address = payload.address
    if payload.latitude is not None:
        sm.latitude = payload.latitude
    if payload.longitude is not None:
        sm.longitude = payload.longitude
    if payload.status is not None:
        status = payload.status.strip().lower()
        if status not in ["active", "inactive"]:
            raise HTTPException(status_code=400, detail="Invalid status (use: active/inactive)")
        sm.status = SupermarketStatus(status)

    db.commit()
    db.refresh(sm)
    return sm