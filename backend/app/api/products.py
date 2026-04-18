from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from decimal import Decimal
from typing import List

from backend.app.core.database import get_db
from backend.app.models.supermarket_product import SupermarketProduct
from backend.app.models.supermarket_product_price import SupermarketProductPrice
from backend.app.models.supermarket import Supermarket
from backend.app.models.product_inventory import ProductInventory

router = APIRouter(prefix="/products", tags=["Products"])


def _to_decimal(v) -> Decimal:
    if v is None:
        return Decimal("0")
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


@router.get("/search")
def search_products(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
):
    q_lower = f"%{q.lower()}%"

    rows = (
        db.query(
            SupermarketProduct.id.label("supermarket_product_id"),
            SupermarketProduct.name_raw,
            SupermarketProduct.image_url,
            Supermarket.id.label("supermarket_id"),
            Supermarket.name.label("supermarket_name"),
            SupermarketProductPrice.price,
            SupermarketProductPrice.currency,
            ProductInventory.in_stock,
        )
        .join(Supermarket, Supermarket.id == SupermarketProduct.supermarket_id)
        .join(
            SupermarketProductPrice,
            SupermarketProductPrice.supermarket_product_id == SupermarketProduct.id,
        )
        .outerjoin(
            ProductInventory,
            ProductInventory.supermarket_product_id == SupermarketProduct.id,
        )
        .filter(func.lower(SupermarketProduct.name_raw).like(q_lower))
        .order_by(SupermarketProduct.name_raw.asc())
        .limit(50)
        .all()
    )

    results = []

    for r in rows:
        results.append({
            "supermarket_product_id": r.supermarket_product_id,
            "name": r.name_raw,
            "image_url": r.image_url,
            "supermarket_id": r.supermarket_id,
            "supermarket_name": r.supermarket_name,
            "price": _to_decimal(r.price),
            "currency": r.currency,
            "in_stock": bool(r.in_stock) if r.in_stock is not None else True,
        })

    return results