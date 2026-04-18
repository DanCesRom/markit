from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from decimal import Decimal

from backend.app.core.database import get_db
from backend.app.api.admin_deps import require_admin
from backend.app.models.user import User

from backend.app.models.supermarket import Supermarket
from backend.app.models.catalog_product import CatalogProduct
from backend.app.models.supermarket_product import SupermarketProduct, ProductStatus
from backend.app.models.product_inventory import ProductInventory

from backend.app.schemas.admin_pricing_inventory import (
    SupermarketProductUpsert,
    InventoryUpsert,
    SupermarketProductResponse,
    InventoryResponse,
)

router = APIRouter(prefix="/admin", tags=["Admin - Pricing & Inventory"])


@router.post("/supermarket-products", response_model=SupermarketProductResponse)
def upsert_supermarket_product(
    payload: SupermarketProductUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    # Validar FK básicos (para errores lindos)
    sm = db.query(Supermarket).filter(Supermarket.id == payload.supermarket_id).first()
    if not sm:
        raise HTTPException(status_code=404, detail="Supermarket not found")

    cp = db.query(CatalogProduct).filter(CatalogProduct.id == payload.catalog_product_id).first()
    if not cp:
        raise HTTPException(status_code=404, detail="Catalog product not found")

    # Upsert por clave natural (supermarket_id + catalog_product_id)
    sp = (
        db.query(SupermarketProduct)
        .filter(
            SupermarketProduct.supermarket_id == payload.supermarket_id,
            SupermarketProduct.catalog_product_id == payload.catalog_product_id,
        )
        .first()
    )

    # Status
    status = None
    if payload.status is not None:
        s = payload.status.strip().lower()
        if s not in ["available", "unavailable"]:
            raise HTTPException(status_code=400, detail="Invalid status (use: available/unavailable)")
        status = ProductStatus(s)

    if sp:
        sp.price = Decimal(str(payload.price))
        if status is not None:
            sp.status = status
    else:
        sp = SupermarketProduct(
            supermarket_id=payload.supermarket_id,
            catalog_product_id=payload.catalog_product_id,
            price=Decimal(str(payload.price)),
            status=status or ProductStatus.available,
        )
        db.add(sp)
        db.flush()  # para obtener sp.id sin commit todavía

    db.commit()
    db.refresh(sp)
    return {
        "id": sp.id,
        "supermarket_id": sp.supermarket_id,
        "catalog_product_id": sp.catalog_product_id,
        "price": sp.price,
        "status": sp.status.value if hasattr(sp.status, "value") else str(sp.status),
    }


@router.post("/inventory", response_model=InventoryResponse)
def upsert_inventory(
    payload: InventoryUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    sp = db.query(SupermarketProduct).filter(SupermarketProduct.id == payload.supermarket_product_id).first()
    if not sp:
        raise HTTPException(status_code=404, detail="Supermarket product not found")

    inv = (
        db.query(ProductInventory)
        .filter(ProductInventory.supermarket_product_id == payload.supermarket_product_id)
        .first()
    )

    if inv:
        inv.stock = payload.stock
    else:
        inv = ProductInventory(supermarket_product_id=payload.supermarket_product_id, stock=payload.stock)
        db.add(inv)

    db.commit()
    db.refresh(inv)
    return inv


@router.get("/supermarket-products/{supermarket_id}", response_model=list[SupermarketProductResponse])
def list_supermarket_products(
    supermarket_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    return (
        db.query(SupermarketProduct)
        .filter(SupermarketProduct.supermarket_id == supermarket_id)
        .order_by(SupermarketProduct.id.asc())
        .all()
    )


@router.get("/inventory/{supermarket_product_id}", response_model=InventoryResponse)
def get_inventory(
    supermarket_product_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    inv = (
        db.query(ProductInventory)
        .filter(ProductInventory.supermarket_product_id == supermarket_product_id)
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Inventory not found")
    return inv