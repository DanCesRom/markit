from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from decimal import Decimal

from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User

from backend.app.models.order import Order
from backend.app.models.order_item import OrderItem
from backend.app.models.supermarket import Supermarket
from backend.app.schemas.order import OrderListResponse, OrderResponse, OrderItemResponse

router = APIRouter(prefix="/orders", tags=["Orders"])


def _to_decimal(v) -> Decimal:
    if v is None:
        return Decimal("0")
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


@router.get("/my", response_model=OrderListResponse)
def my_orders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return list_orders(db=db, current_user=current_user)


@router.get("", response_model=OrderListResponse)
def list_orders(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = current_user.id

    orders = (
        db.query(Order)
        .filter(Order.user_id == user_id)
        .order_by(Order.created_at.desc())
        .all()
    )

    if not orders:
        return {"orders": []}

    # Prefetch supermercados (evita 1 query por order)
    supermarket_ids = sorted({o.supermarket_id for o in orders})
    sm_rows = (
        db.query(Supermarket.id, Supermarket.name)
        .filter(Supermarket.id.in_(supermarket_ids))
        .all()
    )
    sm_map = {sid: name for sid, name in sm_rows}

    # Prefetch items (evita 1 query por order)
    order_ids = [o.id for o in orders]
    items = (
        db.query(OrderItem)
        .filter(OrderItem.order_id.in_(order_ids))
        .order_by(OrderItem.order_id.asc(), OrderItem.id.asc())
        .all()
    )

    items_by_order = {}
    for it in items:
        items_by_order.setdefault(it.order_id, []).append(it)

    result = []
    for o in orders:
        sm_name = sm_map.get(o.supermarket_id, "Unknown")

        item_responses = []
        for it in items_by_order.get(o.id, []):
            unit_price = _to_decimal(it.unit_price)
            qty = _to_decimal(it.quantity)
            line_total = unit_price * qty

            item_responses.append(OrderItemResponse(
                id=it.id,
                product_name_snapshot=it.product_name_snapshot,
                unit_price=unit_price,
                quantity=qty,
                line_total=line_total
            ))

        result.append(OrderResponse(
            id=o.id,
            cart_id=o.cart_id,
            supermarket_id=o.supermarket_id,
            supermarket_name=sm_name,
            subtotal=_to_decimal(o.subtotal),
            tax=_to_decimal(o.tax),
            total=_to_decimal(o.total),
            delivery_type=o.delivery_type.value if hasattr(o.delivery_type, "value") else str(o.delivery_type),
            status=o.status.value if hasattr(o.status, "value") else str(o.status),
            created_at=o.created_at,
            items=item_responses
        ))

    return {"orders": result}


@router.get("/{order_id}", response_model=OrderResponse)
def get_order(order_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user_id = current_user.id

    o = (
        db.query(Order)
        .filter(Order.id == order_id, Order.user_id == user_id)
        .first()
    )
    if not o:
        raise HTTPException(status_code=404, detail="Order not found")

    sm_name = (
        db.query(Supermarket.name)
        .filter(Supermarket.id == o.supermarket_id)
        .scalar()
    ) or "Unknown"

    items = (
        db.query(OrderItem)
        .filter(OrderItem.order_id == o.id)
        .order_by(OrderItem.id.asc())
        .all()
    )

    item_responses = []
    for it in items:
        unit_price = _to_decimal(it.unit_price)
        qty = _to_decimal(it.quantity)
        line_total = unit_price * qty

        item_responses.append(OrderItemResponse(
            id=it.id,
            product_name_snapshot=it.product_name_snapshot,
            unit_price=unit_price,
            quantity=qty,
            line_total=line_total
        ))

    return OrderResponse(
        id=o.id,
        cart_id=o.cart_id,
        supermarket_id=o.supermarket_id,
        supermarket_name=sm_name,
        subtotal=_to_decimal(o.subtotal),
        tax=_to_decimal(o.tax),
        total=_to_decimal(o.total),
        delivery_type=o.delivery_type.value if hasattr(o.delivery_type, "value") else str(o.delivery_type),
        status=o.status.value if hasattr(o.status, "value") else str(o.status),
        created_at=o.created_at,
        items=item_responses
    )