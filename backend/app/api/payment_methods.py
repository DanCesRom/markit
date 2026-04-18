from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User

from backend.app.models.payment_method import PaymentMethod, PaymentMethodStatus
from backend.app.schemas.payment_methods import PaymentMethodCreate, PaymentMethodResponse

router = APIRouter(prefix="/payment-methods", tags=["Payment Methods"])


@router.get("", response_model=list[PaymentMethodResponse])
def list_payment_methods(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id

    methods = (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.user_id == user_id,
            PaymentMethod.status == PaymentMethodStatus.active,
        )
        .order_by(PaymentMethod.is_default.desc(), PaymentMethod.id.asc())
        .all()
    )
    return methods


@router.get("/{payment_method_id}", response_model=PaymentMethodResponse)
def get_payment_method(
    payment_method_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id

    pm = (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.id == payment_method_id,
            PaymentMethod.user_id == user_id,
            PaymentMethod.status == PaymentMethodStatus.active,
        )
        .first()
    )

    if not pm:
        raise HTTPException(status_code=404, detail="Payment method not found")

    return pm


@router.post("", response_model=PaymentMethodResponse)
def add_payment_method(
    payload: PaymentMethodCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id

    if payload.is_default:
        (
            db.query(PaymentMethod)
            .filter(
                PaymentMethod.user_id == user_id,
                PaymentMethod.is_default == True  # noqa: E712
            )
            .update({"is_default": False})
        )

    pm = PaymentMethod(
        user_id=user_id,
        brand=payload.brand.lower(),
        last4=payload.last4,
        exp_month=payload.exp_month,
        exp_year=payload.exp_year,
        nickname=payload.nickname,
        is_default=payload.is_default,
        status=PaymentMethodStatus.active,
    )

    db.add(pm)
    db.commit()
    db.refresh(pm)
    return pm


@router.post("/{payment_method_id}/make-default")
def make_default(
    payment_method_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id

    pm = (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.id == payment_method_id,
            PaymentMethod.user_id == user_id,
            PaymentMethod.status == PaymentMethodStatus.active,
        )
        .first()
    )
    if not pm:
        raise HTTPException(status_code=404, detail="Payment method not found")

    (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.user_id == user_id,
            PaymentMethod.is_default == True  # noqa: E712
        )
        .update({"is_default": False})
    )

    pm.is_default = True
    db.commit()
    return {"message": "Default card updated"}


@router.delete("/{payment_method_id}")
def delete_payment_method(
    payment_method_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id

    pm = (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.id == payment_method_id,
            PaymentMethod.user_id == user_id,
        )
        .first()
    )
    if not pm:
        raise HTTPException(status_code=404, detail="Payment method not found")

    pm.status = PaymentMethodStatus.inactive
    pm.is_default = False
    db.commit()

    return {"message": "Payment method disabled"}