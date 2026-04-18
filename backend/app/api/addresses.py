from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User
from backend.app.models.address import Address
from backend.app.schemas.addresses import AddressCreate, AddressUpdate, AddressResponse

router = APIRouter(prefix="/addresses", tags=["Addresses"])


@router.get("", response_model=list[AddressResponse])
def list_addresses(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rows = (
        db.query(Address)
        .filter(Address.user_id == current_user.id)
        .order_by(Address.is_default.desc(), Address.id.asc())
        .all()
    )
    return rows


@router.post("", response_model=AddressResponse)
def create_address(
    payload: AddressCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id

    if payload.is_default:
        (
            db.query(Address)
            .filter(Address.user_id == user_id, Address.is_default == True)  # noqa
            .update({"is_default": False})
        )

    addr = Address(
        user_id=user_id,
        label=payload.label.strip() if payload.label and payload.label.strip() else None,
        line1=payload.line1.strip(),
        line2=payload.line2.strip() if payload.line2 else None,
        city=payload.city.strip() if payload.city else None,
        state=payload.state.strip() if payload.state else None,
        postal_code=payload.postal_code.strip() if payload.postal_code else None,
        notes=payload.notes.strip() if payload.notes else None,
        latitude=payload.latitude,
        longitude=payload.longitude,

        #  nuevos
        building_type=payload.building_type.strip() if payload.building_type else None,
        formatted_address=payload.formatted_address.strip() if payload.formatted_address else None,
        reference_note=payload.reference_note.strip() if payload.reference_note else None,
        delivery_instructions=payload.delivery_instructions.strip() if payload.delivery_instructions else None,

        is_default=payload.is_default,
    )
    db.add(addr)
    db.commit()
    db.refresh(addr)

    if not addr.is_default:
        count = db.query(Address).filter(Address.user_id == user_id).count()
        if count == 1:
            addr.is_default = True
            db.commit()
            db.refresh(addr)

    return addr


@router.patch("/{address_id}", response_model=AddressResponse)
def update_address(
    address_id: int,
    payload: AddressUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id
    addr = (
        db.query(Address)
        .filter(Address.id == address_id, Address.user_id == user_id)
        .first()
    )
    if not addr:
        raise HTTPException(status_code=404, detail="Address not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        if isinstance(value, str):
            value = value.strip()
            if field == "label" and value == "":
                value = None
        setattr(addr, field, value)

    db.commit()
    db.refresh(addr)
    return addr


@router.post("/{address_id}/make-default")
def make_default(
    address_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id
    addr = (
        db.query(Address)
        .filter(Address.id == address_id, Address.user_id == user_id)
        .first()
    )
    if not addr:
        raise HTTPException(status_code=404, detail="Address not found")

    (
        db.query(Address)
        .filter(Address.user_id == user_id, Address.is_default == True)  # noqa
        .update({"is_default": False})
    )
    addr.is_default = True
    db.commit()
    return {"message": "Default address updated"}


@router.delete("/{address_id}")
def delete_address(
    address_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id
    addr = (
        db.query(Address)
        .filter(Address.id == address_id, Address.user_id == user_id)
        .first()
    )
    if not addr:
        raise HTTPException(status_code=404, detail="Address not found")

    was_default = bool(addr.is_default)
    db.delete(addr)
    db.commit()

    if was_default:
        next_addr = (
            db.query(Address)
            .filter(Address.user_id == user_id)
            .order_by(Address.id.asc())
            .first()
        )
        if next_addr:
            next_addr.is_default = True
            db.commit()

    return {"message": "Address deleted"}