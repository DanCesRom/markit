from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal
from typing import Optional, Dict, Any, List, Set

from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User

from backend.app.models.cart import Cart
from backend.app.models.cart_item import CartItem
from backend.app.models.supermarket_product import SupermarketProduct
from backend.app.models.supermarket_product_price import SupermarketProductPrice
from backend.app.models.product_inventory import ProductInventory
from backend.app.models.catalog_product import CatalogProduct
from backend.app.models.supermarket import Supermarket
from backend.app.models.order import Order, DeliveryType, OrderStatus
from backend.app.models.order_item import OrderItem
from backend.app.models.order_status_history import OrderStatusHistory
from backend.app.models.payment_method import PaymentMethod, PaymentMethodStatus
from backend.app.models.checkout_session import CheckoutSession, CheckoutSessionStatus
from backend.app.models.payment import Payment, PaymentMethodType, PaymentStatus
from backend.app.models.address import Address

from backend.app.schemas.checkout import CheckoutRequest, CheckoutResponse

router = APIRouter(prefix="/checkout", tags=["Checkout"])


def _to_decimal(v) -> Decimal:
    if v is None:
        return Decimal("0")
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


def resolve_card_payment_method_id(
    db: Session,
    user_id: int,
    payment_method_id: Optional[int],
) -> int:
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
            raise HTTPException(
                status_code=400,
                detail="Invalid payment_method_id (not found/disabled/not yours).",
            )
        return pm.id

    default_pm = (
        db.query(PaymentMethod)
        .filter(
            PaymentMethod.user_id == user_id,
            PaymentMethod.status == PaymentMethodStatus.active,
            PaymentMethod.is_default == True,  # noqa
        )
        .first()
    )
    if not default_pm:
        raise HTTPException(
            status_code=400,
            detail="No default card found. Add a card and set it as default.",
        )
    return default_pm.id


@router.post("", response_model=CheckoutResponse)
def checkout(
    payload: CheckoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id

    cart = (
        db.query(Cart)
        .filter(Cart.user_id == user_id, Cart.status == "active")
        .first()
    )
    if not cart:
        raise HTTPException(status_code=404, detail="Active cart not found")

    selected_ids: Optional[List[int]] = None
    if getattr(payload, "cart_item_ids", None):
        selected_ids = list({int(x) for x in payload.cart_item_ids if x is not None})
        if not selected_ids:
            raise HTTPException(status_code=400, detail="cart_item_ids is empty")

    cart_items_query = db.query(CartItem).filter(CartItem.cart_id == cart.id)
    if selected_ids is not None:
        cart_items_query = cart_items_query.filter(CartItem.id.in_(selected_ids))

    cart_items: List[CartItem] = cart_items_query.all()
    if not cart_items:
        raise HTTPException(status_code=400, detail="Cart is empty")

    if selected_ids is not None:
        found_ids: Set[int] = {ci.id for ci in cart_items}
        missing_ids = [x for x in selected_ids if x not in found_ids]
        if missing_ids:
            raise HTTPException(
                status_code=400,
                detail=f"Some cart_item_ids are invalid or not in your active cart: {missing_ids}",
            )

    rows_query = (
        db.query(
            CartItem,
            SupermarketProduct,
            Supermarket.id.label("supermarket_id"),
            Supermarket.name.label("supermarket_name"),
            func.coalesce(
                CatalogProduct.name,
                SupermarketProduct.name_raw
            ).label("product_name"),
            SupermarketProductPrice.price.label("current_price"),
            ProductInventory.in_stock.label("in_stock"),
            ProductInventory.stock_qty.label("stock_qty"),
            ProductInventory.status.label("inv_status"),
        )
        .join(SupermarketProduct, SupermarketProduct.id == CartItem.supermarket_product_id)
        .join(Supermarket, Supermarket.id == SupermarketProduct.supermarket_id)
        .outerjoin(CatalogProduct, CatalogProduct.id == SupermarketProduct.catalog_product_id)
        .join(
            SupermarketProductPrice,
            SupermarketProductPrice.supermarket_product_id == SupermarketProduct.id,
        )
        .outerjoin(
            ProductInventory,
            ProductInventory.supermarket_product_id == SupermarketProduct.id,
        )
        .filter(CartItem.cart_id == cart.id)
    )

    if selected_ids is not None:
        rows_query = rows_query.filter(CartItem.id.in_(selected_ids))

    rows = rows_query.all()

    grouped: Dict[int, Dict[str, Any]] = {}

    for (
        cart_item,
        sm_prod,
        supermarket_id,
        supermarket_name,
        product_name,
        current_price,
        in_stock,
        stock_qty,
        inv_status,
    ) in rows:

        inv_status_val = (
            (inv_status.value if hasattr(inv_status, "value") else str(inv_status))
            if inv_status is not None
            else "unknown"
        )

        effective_in_stock = True if in_stock is None else bool(in_stock)
        if inv_status_val == "out_of_stock":
            effective_in_stock = False

        if not effective_in_stock:
            raise HTTPException(
                status_code=409,
                detail=f"Out of stock: {product_name}",
            )

        qty = _to_decimal(cart_item.quantity)

        if stock_qty is not None:
            is_int_qty = qty == qty.to_integral_value()
            if is_int_qty and int(qty) > int(stock_qty):
                raise HTTPException(
                    status_code=409,
                    detail=f"Insufficient stock for {product_name}. Requested={qty}, Available={stock_qty}",
                )

        grouped.setdefault(supermarket_id, {"name": supermarket_name, "items": []})
        grouped[supermarket_id]["items"].append(
            (cart_item, product_name, _to_decimal(current_price))
        )

    supermarket_count = len(grouped)

    enforced_delivery_type = payload.delivery_type
    if supermarket_count >= 2:
        enforced_delivery_type = "delivery"
        if payload.delivery_type == "pickup":
            raise HTTPException(
                status_code=400,
                detail="Pickup not allowed with multiple supermarkets.",
            )

    if supermarket_count >= 2 and payload.payment_method_type != "card":
        raise HTTPException(
            status_code=400,
            detail="Multiple supermarkets require card payment.",
        )

    if (
        supermarket_count == 1
        and enforced_delivery_type == "delivery"
        and payload.payment_method_type == "cash"
    ):
        raise HTTPException(
            status_code=400,
            detail="Cash allowed only for pickup.",
        )

    resolved_payment_method_id = None
    if payload.payment_method_type == "card":
        resolved_payment_method_id = resolve_card_payment_method_id(
            db=db,
            user_id=user_id,
            payment_method_id=payload.payment_method_id,
        )

    resolved_address = None
    if enforced_delivery_type == "delivery":
        if payload.delivery_address_id is None:
            raise HTTPException(
                status_code=400,
                detail="delivery_address_id is required for delivery.",
            )

        resolved_address = (
            db.query(Address)
            .filter(
                Address.id == payload.delivery_address_id,
                Address.user_id == user_id,
            )
            .first()
        )
        if not resolved_address:
            raise HTTPException(
                status_code=400,
                detail="Invalid delivery_address_id (not found/not yours).",
            )

    checkout_session = CheckoutSession(
        user_id=user_id,
        cart_id=cart.id,
        total=Decimal("0"),
        delivery_type=DeliveryType(enforced_delivery_type),
        status=CheckoutSessionStatus.created,
    )
    db.add(checkout_session)
    db.flush()

    created_orders = []
    cart_total = Decimal("0")
    processed_cart_item_ids: List[int] = []

    for supermarket_id, data in grouped.items():
        subtotal = Decimal("0")

        order = Order(
            user_id=user_id,
            cart_id=cart.id,
            supermarket_id=supermarket_id,
            checkout_session_id=checkout_session.id,
            subtotal=Decimal("0"),
            tax=Decimal("0"),
            total=Decimal("0"),
            delivery_type=DeliveryType(enforced_delivery_type),
            status=OrderStatus.created,
            delivery_address_label=resolved_address.label if resolved_address else None,
            delivery_address_line1=resolved_address.line1 if resolved_address else None,
            delivery_address_line2=resolved_address.line2 if resolved_address else None,
            delivery_address_city=resolved_address.city if resolved_address else None,
            delivery_address_state=resolved_address.state if resolved_address else None,
            delivery_address_postal_code=resolved_address.postal_code if resolved_address else None,
            delivery_address_notes=resolved_address.notes if resolved_address else None,
        )
        db.add(order)
        db.flush()

        db.add(
            OrderStatusHistory(
                order_id=order.id,
                status=OrderStatus.created.value,
                changed_by="system",
            )
        )

        for (cart_item, product_name, current_price) in data["items"]:
            qty = _to_decimal(cart_item.quantity)

            cart_item.unit_price = current_price

            line_total = current_price * qty
            subtotal += line_total
            processed_cart_item_ids.append(cart_item.id)

            db.add(
                OrderItem(
                    order_id=order.id,
                    product_name_snapshot=product_name,
                    unit_price=current_price,
                    quantity=qty,
                )
            )

        order.subtotal = subtotal
        order.tax = Decimal("0")
        order.total = subtotal
        cart_total += subtotal

        created_orders.append({
            "order_id": order.id,
            "supermarket_id": supermarket_id,
            "supermarket_name": data["name"],
            "total": order.total,
        })

    if payload.payment_method_type == "card":
        checkout_session.status = CheckoutSessionStatus.paid

        orders_db = (
            db.query(Order)
            .filter(Order.checkout_session_id == checkout_session.id)
            .all()
        )

        for o in orders_db:
            amount = _to_decimal(o.total)

            db.add(
                Payment(
                    order_id=o.id,
                    payment_method=PaymentMethodType.card,
                    amount=amount,
                    status=PaymentStatus.paid,
                    transaction_ref=None,
                )
            )

            o.status = OrderStatus.paid

            db.add(
                OrderStatusHistory(
                    order_id=o.id,
                    status=OrderStatus.paid.value,
                    changed_by="system",
                )
            )
    else:
        checkout_session.status = CheckoutSessionStatus.created

    processed_set = set(processed_cart_item_ids)

    remaining_cart_items_count = (
        db.query(CartItem)
        .filter(
            CartItem.cart_id == cart.id,
            ~CartItem.id.in_(processed_set) if processed_set else True,
        )
        .count()
    )

    if processed_set:
        (
            db.query(CartItem)
            .filter(
                CartItem.cart_id == cart.id,
                CartItem.id.in_(processed_set),
            )
            .delete(synchronize_session=False)
        )

    if remaining_cart_items_count == 0:
        cart.status = "converted"

    checkout_session.total = cart_total

    db.commit()

    return {
        "checkout_session_id": checkout_session.id,
        "cart_id": cart.id,
        "total": cart_total,
        "delivery_type": enforced_delivery_type,
        "payment_method_type": payload.payment_method_type,
        "payment_method_id": resolved_payment_method_id,
        "orders": created_orders,
    }