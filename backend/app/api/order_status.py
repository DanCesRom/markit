from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime

from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User

from backend.app.models.order import Order, OrderStatus
from backend.app.models.order_status_history import OrderStatusHistory
from backend.app.schemas.order_status import (
    OrderStatusHistoryListResponse,
    OrderStatusHistoryResponse,
    OrderStatusChangeRequest,
)

router = APIRouter(prefix="/orders", tags=["Order Status"])

ALLOWED_STATUSES = {"created", "paid", "preparing", "completed", "cancelled"}


@router.get("/{order_id}/status-history", response_model=OrderStatusHistoryListResponse)
def get_status_history(order_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = current_user.id

    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.user_id == user_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    rows = (
        db.query(OrderStatusHistory)
        .filter(OrderStatusHistory.order_id == order_id)
        .order_by(OrderStatusHistory.changed_at.asc())
        .all()
    )

    return {"history": rows}


@router.post("/{order_id}/status", response_model=OrderStatusHistoryResponse)
def change_status(order_id: int, payload: OrderStatusChangeRequest, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = current_user.id

    order = (
        db.query(Order)
        .filter(Order.id == order_id, Order.user_id == user_id)
        .first()
    )
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    new_status = payload.status.strip().lower()
    if new_status not in ALLOWED_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Allowed: {sorted(list(ALLOWED_STATUSES))}"
        )

    order.status = OrderStatus(new_status)

    history = OrderStatusHistory(
        order_id=order_id,
        status=new_status,
        changed_by=payload.changed_by,
        changed_at=datetime.utcnow()
    )
    db.add(history)

    db.commit()
    db.refresh(history)

    return history