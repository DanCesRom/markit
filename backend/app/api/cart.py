from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from collections import defaultdict
from decimal import Decimal

from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User

from backend.app.schemas.cart import CartItemUpdate, CartItemCreate, CartResponse
from backend.app.models.cart import Cart
from backend.app.models.cart_item import CartItem
from backend.app.models.supermarket_product import SupermarketProduct
from backend.app.models.supermarket_product_price import SupermarketProductPrice
from backend.app.models.catalog_product import CatalogProduct
from backend.app.models.supermarket import Supermarket

router = APIRouter(prefix="/cart", tags=["Cart"])


def _to_decimal(v) -> Decimal:
    if v is None:
        return Decimal("0")
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


@router.post("/items")
def add_item_to_cart(
    item: CartItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_id = current_user.id
    qty = _to_decimal(item.quantity)
    if qty <= 0:
        raise HTTPException(status_code=400, detail="Quantity must be > 0")

    cart = (
        db.query(Cart)
        .filter(Cart.user_id == user_id, Cart.status == "active")
        .first()
    )
    if not cart:
        cart = Cart(user_id=user_id)
        db.add(cart)
        db.commit()
        db.refresh(cart)

    supermarket_product = (
        db.query(SupermarketProduct)
        .filter(SupermarketProduct.id == item.supermarket_product_id)
        .first()
    )
    if not supermarket_product:
        raise HTTPException(status_code=404, detail="Product not found")

    price_row = (
        db.query(SupermarketProductPrice)
        .filter(SupermarketProductPrice.supermarket_product_id == supermarket_product.id)
        .first()
    )
    if not price_row:
        raise HTTPException(status_code=409, detail="Price not available for this product")

    current_price = _to_decimal(price_row.price)

    cart_item = (
        db.query(CartItem)
        .filter(
            CartItem.cart_id == cart.id,
            CartItem.supermarket_product_id == item.supermarket_product_id
        )
        .first()
    )

    if cart_item:
        cart_item.quantity = _to_decimal(cart_item.quantity) + qty
        cart_item.unit_price = current_price
    else:
        cart_item = CartItem(
            cart_id=cart.id,
            supermarket_product_id=item.supermarket_product_id,
            quantity=qty,
            unit_price=current_price
        )
        db.add(cart_item)

    db.commit()
    return {"message": "Item added to cart"}


@router.get("", response_model=CartResponse)
def get_cart(
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
        return {"cart_id": 0, "total": Decimal("0"), "savings_total": Decimal("0"), "supermarkets": []}

    rows = (
        db.query(
            CartItem.id.label("cart_item_id"),
            CartItem.supermarket_product_id,
            CartItem.quantity,
            CartItem.unit_price,
            Supermarket.id.label("supermarket_id"),
            Supermarket.name.label("supermarket_name"),
            func.coalesce(CatalogProduct.name, SupermarketProduct.name_raw).label("product_name"),

            # ✅ NUEVO: imagen
            SupermarketProduct.image_url.label("image_url"),

            # precios/promos
            SupermarketProductPrice.regular_price.label("regular_price"),
            SupermarketProductPrice.discount_amount.label("discount_amount"),
            SupermarketProductPrice.discount_percent.label("discount_percent"),
            SupermarketProductPrice.currency.label("currency"),
            SupermarketProductPrice.price.label("current_price"),
        )
        .join(SupermarketProduct, SupermarketProduct.id == CartItem.supermarket_product_id)
        .join(Supermarket, Supermarket.id == SupermarketProduct.supermarket_id)
        .outerjoin(CatalogProduct, CatalogProduct.id == SupermarketProduct.catalog_product_id)
        .join(SupermarketProductPrice, SupermarketProductPrice.supermarket_product_id == SupermarketProduct.id)
        .filter(CartItem.cart_id == cart.id)
        .order_by(CartItem.id.asc())
        .all()
    )

    grouped = defaultdict(lambda: {"supermarket_name": "", "subtotal": Decimal("0"), "savings": Decimal("0"), "items": []})
    total = Decimal("0")
    savings_total = Decimal("0")

    for r in rows:
        unit_price = _to_decimal(r.current_price)
        quantity = _to_decimal(r.quantity)
        line_total = unit_price * quantity

        regular_price = _to_decimal(r.regular_price) if r.regular_price is not None else None
        discount_amount = _to_decimal(r.discount_amount)
        discount_percent = _to_decimal(r.discount_percent)

        is_on_sale = (
            (regular_price is not None and regular_price > unit_price)
            or discount_amount > 0
            or discount_percent > 0
        )

        # ✅ ahorro por línea (si hay regular_price mayor que price)
        line_savings = Decimal("0")
        if regular_price is not None and regular_price > unit_price:
            line_savings = (regular_price - unit_price) * quantity

        grouped[r.supermarket_id]["supermarket_name"] = r.supermarket_name
        grouped[r.supermarket_id]["subtotal"] += line_total
        grouped[r.supermarket_id]["savings"] += line_savings

        grouped[r.supermarket_id]["items"].append({
            "cart_item_id": r.cart_item_id,
            "supermarket_product_id": r.supermarket_product_id,
            "product_name": r.product_name,
            "supermarket_id": r.supermarket_id,
            "supermarket_name": r.supermarket_name,

            # ✅ NUEVO
            "image_url": r.image_url,

            "unit_price": unit_price,
            "regular_price": regular_price,
            "discount_amount": discount_amount,
            "discount_percent": discount_percent,
            "currency": r.currency,
            "is_on_sale": bool(is_on_sale),

            "quantity": quantity,
            "line_total": line_total,
            "line_savings": line_savings,
        })

        total += line_total
        savings_total += line_savings

    supermarkets_list = []
    for sm_id, data in grouped.items():
        supermarkets_list.append({
            "supermarket_id": sm_id,
            "supermarket_name": data["supermarket_name"],
            "subtotal": data["subtotal"],
            "savings": data["savings"],
            "items": data["items"],
        })

    return {
        "cart_id": cart.id,
        "total": total,
        "savings_total": savings_total,
        "supermarkets": supermarkets_list,
    }


@router.patch("/items/{cart_item_id}")
def update_cart_item(
    cart_item_id: int,
    payload: CartItemUpdate,
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

    item = (
        db.query(CartItem)
        .filter(CartItem.id == cart_item_id, CartItem.cart_id == cart.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")

    qty = _to_decimal(payload.quantity)

    if qty == 0:
        db.delete(item)
        db.commit()
        return {"message": "Item removed"}

    if qty < 0:
        raise HTTPException(status_code=400, detail="Quantity must be >= 0")

    price_row = (
        db.query(SupermarketProductPrice)
        .filter(SupermarketProductPrice.supermarket_product_id == item.supermarket_product_id)
        .first()
    )
    if price_row:
        item.unit_price = _to_decimal(price_row.price)

    item.quantity = qty
    db.commit()
    db.refresh(item)

    return {"message": "Item updated", "cart_item_id": item.id, "quantity": item.quantity}



@router.delete("")
def clear_cart(
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
        return {"message": "Cart already empty", "deleted": 0}

    deleted = (
        db.query(CartItem)
        .filter(CartItem.cart_id == cart.id)
        .delete(synchronize_session=False)
    )

    db.commit()

    return {"message": "Cart cleared", "deleted": deleted}



@router.delete("/items/{cart_item_id}")
def delete_cart_item(
    cart_item_id: int,
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

    item = (
        db.query(CartItem)
        .filter(CartItem.id == cart_item_id, CartItem.cart_id == cart.id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=404, detail="Cart item not found")

    db.delete(item)
    db.commit()

    return {"message": "Item deleted"}