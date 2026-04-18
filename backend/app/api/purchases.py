from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from decimal import Decimal

from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User

from backend.app.models.checkout_session import CheckoutSession
from backend.app.models.order import Order
from backend.app.models.order_item import OrderItem
from backend.app.models.supermarket import Supermarket

from backend.app.schemas.purchases import PurchaseListResponse, PurchaseDetailResponse

router = APIRouter(prefix="/purchases", tags=["Purchases"])


@router.get("/my", response_model=PurchaseListResponse)
def my_purchases(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = current_user.id

    purchases = (
        db.query(CheckoutSession)
        .filter(CheckoutSession.user_id == user_id)
        .order_by(CheckoutSession.created_at.desc())
        .all()
    )

    result = []
    for p in purchases:
        orders = (
            db.query(Order, Supermarket.name.label("supermarket_name"))
            .join(Supermarket, Supermarket.id == Order.supermarket_id)
            .filter(Order.checkout_session_id == p.id)
            .order_by(Order.id.asc())
            .all()
        )

        order_summaries = []
        for (o, sm_name) in orders:
            order_summaries.append({
                "order_id": o.id,
                "supermarket_id": o.supermarket_id,
                "supermarket_name": sm_name,
                "total": Decimal(str(o.total)),
                "status": o.status.value if hasattr(o.status, "value") else str(o.status),
            })

        result.append({
            "id": p.id,
            "cart_id": p.cart_id,
            "total": Decimal(str(p.total)),
            "status": p.status.value if hasattr(p.status, "value") else str(p.status),
            "created_at": p.created_at,
            "orders": order_summaries,
        })

    return {"purchases": result}


@router.get("/{purchase_id}", response_model=PurchaseDetailResponse)
def get_purchase(purchase_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = current_user.id

    p = (
        db.query(CheckoutSession)
        .filter(CheckoutSession.id == purchase_id, CheckoutSession.user_id == user_id)
        .first()
    )
    if not p:
        raise HTTPException(status_code=404, detail="Purchase not found")

    orders = (
        db.query(Order, Supermarket.name.label("supermarket_name"))
        .join(Supermarket, Supermarket.id == Order.supermarket_id)
        .filter(Order.checkout_session_id == p.id)
        .order_by(Order.id.asc())
        .all()
    )

    orders_response = []
    for (o, sm_name) in orders:
        items = (
            db.query(OrderItem)
            .filter(OrderItem.order_id == o.id)
            .order_by(OrderItem.id.asc())
            .all()
        )

        item_responses = []
        for it in items:
            unit_price = Decimal(str(it.unit_price))
            line_total = unit_price * it.quantity
            item_responses.append({
                "id": it.id,
                "product_name_snapshot": it.product_name_snapshot,
                "unit_price": unit_price,
                "quantity": it.quantity,
                "line_total": line_total,
            })

        orders_response.append({
            "order_id": o.id,
            "supermarket_id": o.supermarket_id,
            "supermarket_name": sm_name,
            "status": o.status.value if hasattr(o.status, "value") else str(o.status),
            "delivery_type": o.delivery_type.value if hasattr(o.delivery_type, "value") else str(o.delivery_type),
            "subtotal": Decimal(str(o.subtotal)),
            "tax": Decimal(str(o.tax)),
            "total": Decimal(str(o.total)),
            "created_at": o.created_at,
            "items": item_responses,
        })

    return {
        "id": p.id,
        "cart_id": p.cart_id,
        "total": Decimal(str(p.total)),
        "delivery_type": p.delivery_type.value if hasattr(p.delivery_type, "value") else str(p.delivery_type),
        "status": p.status.value if hasattr(p.status, "value") else str(p.status),
        "created_at": p.created_at,
        "orders": orders_response,
    }