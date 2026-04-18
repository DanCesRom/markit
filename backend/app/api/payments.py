from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from decimal import Decimal
from typing import Optional

from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User

from backend.app.models.order import Order, OrderStatus, DeliveryType
from backend.app.models.payment import Payment, PaymentMethodType, PaymentStatus
from backend.app.models.payment_method import PaymentMethod, PaymentMethodStatus
from backend.app.models.order_status_history import OrderStatusHistory
from backend.app.schemas.payments import PayOrderRequest, PayOrderResponse
from backend.app.models.checkout_session import CheckoutSession, CheckoutSessionStatus

router = APIRouter(prefix="/payments", tags=["Payments"])


def resolve_card_payment_method_id(db: Session, user_id: int, payment_method_id: Optional[int]) -> int:
    if payment_method_id is not None:
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
            raise HTTPException(status_code=400, detail="Invalid payment_method_id (not found/disabled/not yours).")
        return pm.id

    default_pm = (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.user_id == user_id,
            PaymentMethod.status == PaymentMethodStatus.active,
            PaymentMethod.is_default == True,  # noqa: E712
        )
        .first()
    )
    if not default_pm:
        raise HTTPException(status_code=400, detail="No default card found. Add a card and set it as default.")
    return default_pm.id


@router.post("/orders/{order_id}/pay", response_model=PayOrderResponse)
def pay_order(order_id: int, payload: PayOrderRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = current_user.id

    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.user_id == user_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    current_status = order.status.value if hasattr(order.status, "value") else str(order.status)
    if current_status == "paid":
        raise HTTPException(status_code=400, detail="Order is already paid")

    order_delivery = order.delivery_type.value if hasattr(order.delivery_type, "value") else str(order.delivery_type)
    if payload.payment_method_type == "cash" and order_delivery != DeliveryType.pickup.value:
        raise HTTPException(status_code=400, detail="Cash is only allowed for pickup orders")

    resolved_payment_method_id = None
    if payload.payment_method_type == "card":
        resolved_payment_method_id = resolve_card_payment_method_id(db, user_id, payload.payment_method_id)

    amount = Decimal(str(order.total))

    db.add(Payment(
        order_id=order.id,
        payment_method=PaymentMethodType(payload.payment_method_type),
        amount=amount,
        status=PaymentStatus.paid,
        transaction_ref=None,
    ))

    order.status = OrderStatus.paid
    db.add(OrderStatusHistory(
        order_id=order.id,
        status=OrderStatus.paid.value,
        changed_by="system",
    ))

    if order.checkout_session_id:
        pending = (
            db.query(Order)
            .filter(
                Order.checkout_session_id == order.checkout_session_id,
                Order.status != OrderStatus.paid
            )
            .count()
        )
        if pending == 0:
            cs = (
                db.query(CheckoutSession)
                .filter(CheckoutSession.id == order.checkout_session_id, CheckoutSession.user_id == user_id)
                .first()
            )
            if cs:
                cs.status = CheckoutSessionStatus.paid

    db.commit()

    return {
        "order_id": order.id,
        "amount": amount,
        "status": "paid",
        "payment_method_type": payload.payment_method_type,
        "payment_method_id": resolved_payment_method_id,
    }