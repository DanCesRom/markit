from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, case

from backend.app.core.database import get_db

from backend.app.models.supermarket import Supermarket
from backend.app.models.supermarket_product import SupermarketProduct
from backend.app.models.supermarket_category import SupermarketCategory
from backend.app.models.category import Category

from backend.app.models.catalog_product import CatalogProduct
from backend.app.models.supermarket_product_price import SupermarketProductPrice
from backend.app.models.product_inventory import ProductInventory

router = APIRouter(prefix="/supermarkets", tags=["Supermarkets"])


POPULAR_TERMS = [
    "leche",
    "huevo",
    "huevos",
    "pan",
    "pollo",
    "salami",
    "azúcar",
    "azucar",
    "café",
    "cafe",
    "avena",
    "pasta",
    "espagueti",
    "spaghetti",
    "habichuela",
    "habichuelas",
    "jugo",
    "galleta",
    "plátano",
    "platano",
    "cebolla",
    "papa",
    "papas",
    "detergente",
    "suavizante",
    "papel higiénico",
    "papel",
    "servilleta",
]

POPULAR_CATEGORY_TERMS = [
    "despensa",
    "abarrotes",
    "lácteos",
    "lacteos",
    "carnes",
    "embutidos",
    "bebidas",
    "panadería",
    "panaderia",
    "higiene",
    "limpieza",
    "hogar",
    "congelados",
    "snacks",
]


def _product_name_expr():
    return func.coalesce(CatalogProduct.name, SupermarketProduct.name_raw)


def _stock_expr():
    return func.coalesce(ProductInventory.stock_qty, 0)


def _popular_score_expr(name_expr, category_expr):
    """
    Score heurístico para consumo habitual / productos populares.
    No usa historial real de órdenes porque order_items no tiene supermarket_product_id.
    """
    whens = []

    for term in POPULAR_TERMS:
      like = f"%{term}%"
      whens.append((func.lower(name_expr).like(like), 10))

    for term in POPULAR_CATEGORY_TERMS:
      like = f"%{term}%"
      whens.append((func.lower(category_expr).like(like), 5))

    return case(*whens, else_=0)


@router.get("/")
def list_supermarkets(db: Session = Depends(get_db)):
    rows = (
        db.query(Supermarket.id, Supermarket.name)
        .order_by(Supermarket.id.asc())
        .all()
    )
    return [{"id": r.id, "name": r.name} for r in rows]


@router.get("/{supermarket_id}")
def get_supermarket_detail(supermarket_id: int, db: Session = Depends(get_db)):
    row = (
        db.query(Supermarket.id, Supermarket.name, Supermarket.address)
        .filter(Supermarket.id == supermarket_id)
        .first()
    )

    if not row:
        raise HTTPException(status_code=404, detail="Supermercado no encontrado")

    return {
        "id": row.id,
        "name": row.name,
        "address": row.address,
    }


@router.get("/{supermarket_id}/categories")
def list_supermarket_categories(supermarket_id: int, db: Session = Depends(get_db)):
    """
    Devuelve las categorías disponibles de un supermercado, con conteo de productos.
    """
    rows = (
        db.query(
            SupermarketCategory.id.label("supermarket_category_id"),
            SupermarketCategory.slug_raw.label("slug"),
            SupermarketCategory.name_raw.label("name"),
            func.count(SupermarketProduct.id).label("items_count"),
        )
        .join(
            SupermarketProduct,
            SupermarketProduct.supermarket_category_id == SupermarketCategory.id,
        )
        .filter(SupermarketCategory.supermarket_id == supermarket_id)
        .group_by(
            SupermarketCategory.id,
            SupermarketCategory.slug_raw,
            SupermarketCategory.name_raw,
        )
        .order_by(func.count(SupermarketProduct.id).desc())
        .all()
    )

    return [
        {
            "supermarket_category_id": r.supermarket_category_id,
            "slug": r.slug,
            "name": r.name,
            "items_count": int(r.items_count),
        }
        for r in rows
    ]


@router.get("/{supermarket_id}/popular-products")
def list_popular_supermarket_products(
    supermarket_id: int,
    limit: int = Query(default=18, ge=1, le=60),
    db: Session = Depends(get_db),
):
    """
    Productos populares / de consumo masivo para la tienda.
    Heurístico basado en nombre/categoría + stock.
    """
    supermarket_exists = (
        db.query(Supermarket.id)
        .filter(Supermarket.id == supermarket_id)
        .first()
    )
    if not supermarket_exists:
        raise HTTPException(status_code=404, detail="Supermercado no encontrado")

    stock_expr = _stock_expr()
    name_expr = _product_name_expr()
    category_expr = func.coalesce(
        SupermarketCategory.name_raw,
        SupermarketProduct.category_raw,
        ""
    )
    popular_score = _popular_score_expr(name_expr, category_expr)

    rows = (
        db.query(
            SupermarketProduct.id.label("supermarket_product_id"),
            name_expr.label("product_name"),
            SupermarketProduct.image_url.label("image_url"),
            SupermarketProduct.product_url.label("product_url"),
            category_expr.label("category_name"),
            SupermarketProductPrice.price.label("price"),
            SupermarketProductPrice.regular_price.label("regular_price"),
            SupermarketProductPrice.discount_amount.label("discount_amount"),
            SupermarketProductPrice.discount_percent.label("discount_percent"),
            SupermarketProductPrice.currency.label("currency"),
            stock_expr.label("stock"),
            popular_score.label("popular_score"),
        )
        .outerjoin(CatalogProduct, CatalogProduct.id == SupermarketProduct.catalog_product_id)
        .outerjoin(
            SupermarketCategory,
            SupermarketCategory.id == SupermarketProduct.supermarket_category_id,
        )
        .join(
            SupermarketProductPrice,
            SupermarketProductPrice.supermarket_product_id == SupermarketProduct.id,
        )
        .outerjoin(
            ProductInventory,
            ProductInventory.supermarket_product_id == SupermarketProduct.id,
        )
        .filter(SupermarketProduct.supermarket_id == supermarket_id)
        .filter(SupermarketProductPrice.price.isnot(None))
        .order_by(
            popular_score.desc(),
            stock_expr.desc(),
            name_expr.asc(),
        )
        .limit(limit)
        .all()
    )

    items = []
    for r in rows:
        regular = float(r.regular_price) if r.regular_price is not None else None
        price = float(r.price)
        discount_amount = float(r.discount_amount or 0)
        discount_percent = float(r.discount_percent or 0)
        is_on_sale = (
            (regular is not None and regular > price)
            or discount_amount > 0
            or discount_percent > 0
        )

        items.append(
            {
                "supermarket_product_id": r.supermarket_product_id,
                "product_name": r.product_name,
                "image_url": r.image_url,
                "product_url": r.product_url,
                "category_name": r.category_name,
                "price": price,
                "regular_price": regular,
                "discount_amount": discount_amount,
                "discount_percent": discount_percent,
                "currency": r.currency,
                "is_on_sale": is_on_sale,
                "stock": int(r.stock or 0),
                "popularity_hint": "consumo_habitual" if int(r.popular_score or 0) > 0 else "catalogo_general",
            }
        )

    return {
        "supermarket_id": supermarket_id,
        "limit": limit,
        "items": items,
    }


@router.get("/{supermarket_id}/categories/{category_slug}/products")
def list_products_by_category(
    supermarket_id: int,
    category_slug: str,
    q: str = Query(default="", description="búsqueda por nombre"),
    limit: int = Query(default=40, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Productos por categoría (paginado).
    Retorna: items + total + limit + offset
    """
    name_expr = func.coalesce(CatalogProduct.name, SupermarketProduct.name_raw)
    stock_expr = func.coalesce(ProductInventory.stock_qty, 0)

    base = (
        db.query(
            SupermarketProduct.id.label("supermarket_product_id"),
            name_expr.label("product_name"),
            SupermarketProduct.image_url.label("image_url"),
            SupermarketProduct.product_url.label("product_url"),
            SupermarketProduct.category_raw.label("category_raw"),
            SupermarketProductPrice.price.label("price"),
            SupermarketProductPrice.regular_price.label("regular_price"),
            SupermarketProductPrice.discount_amount.label("discount_amount"),
            SupermarketProductPrice.discount_percent.label("discount_percent"),
            SupermarketProductPrice.currency.label("currency"),
            stock_expr.label("stock"),
        )
        .join(SupermarketCategory, SupermarketCategory.id == SupermarketProduct.supermarket_category_id)
        .outerjoin(CatalogProduct, CatalogProduct.id == SupermarketProduct.catalog_product_id)
        .join(SupermarketProductPrice, SupermarketProductPrice.supermarket_product_id == SupermarketProduct.id)
        .outerjoin(ProductInventory, ProductInventory.supermarket_product_id == SupermarketProduct.id)
        .filter(SupermarketProduct.supermarket_id == supermarket_id)
        .filter(SupermarketCategory.slug_raw == category_slug)
    )

    if q.strip():
        like = f"%{q.strip()}%"
        base = base.filter(name_expr.ilike(like))

    total = base.with_entities(func.count(SupermarketProduct.id)).scalar() or 0

    rows = (
        base.order_by(name_expr.asc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    items = []
    for r in rows:
        regular = float(r.regular_price) if r.regular_price is not None else None
        price = float(r.price)
        discount_amount = float(r.discount_amount or 0)
        discount_percent = float(r.discount_percent or 0)
        is_on_sale = (regular is not None and regular > price) or discount_amount > 0 or discount_percent > 0

        items.append(
            {
                "supermarket_product_id": r.supermarket_product_id,
                "product_name": r.product_name,
                "image_url": r.image_url,
                "product_url": r.product_url,
                "category_raw": r.category_raw,
                "price": price,
                "regular_price": regular,
                "discount_amount": discount_amount,
                "discount_percent": discount_percent,
                "currency": r.currency,
                "is_on_sale": is_on_sale,
                "stock": int(r.stock),
            }
        )

    return {
        "supermarket_id": supermarket_id,
        "category_slug": category_slug,
        "q": q,
        "total": int(total),
        "limit": limit,
        "offset": offset,
        "items": items,
    }


@router.get("/{supermarket_id}/products")
def list_supermarket_products(
    supermarket_id: int,
    q: str = Query(default="", description="búsqueda por nombre"),
    limit: int = Query(default=40, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Listado general (paginado) de productos del supermercado.
    Esto evita traer 15k/16k de golpe.
    """
    stock_expr = func.coalesce(ProductInventory.stock_qty, 0)
    name_expr = func.coalesce(CatalogProduct.name, SupermarketProduct.name_raw)

    base = (
        db.query(
            SupermarketProduct.id.label("supermarket_product_id"),
            name_expr.label("product_name"),
            SupermarketProduct.image_url.label("image_url"),
            SupermarketProduct.product_url.label("product_url"),
            SupermarketProductPrice.price.label("price"),
            SupermarketProductPrice.regular_price.label("regular_price"),
            SupermarketProductPrice.discount_amount.label("discount_amount"),
            SupermarketProductPrice.discount_percent.label("discount_percent"),
            SupermarketProductPrice.currency.label("currency"),
            stock_expr.label("stock"),
        )
        .outerjoin(CatalogProduct, CatalogProduct.id == SupermarketProduct.catalog_product_id)
        .join(SupermarketProductPrice, SupermarketProductPrice.supermarket_product_id == SupermarketProduct.id)
        .outerjoin(ProductInventory, ProductInventory.supermarket_product_id == SupermarketProduct.id)
        .filter(SupermarketProduct.supermarket_id == supermarket_id)
    )

    if q.strip():
        like = f"%{q.strip()}%"
        base = base.filter(name_expr.ilike(like))

    total = base.with_entities(func.count(SupermarketProduct.id)).scalar() or 0

    rows = (
        base.order_by(name_expr.asc())
        .limit(limit)
        .offset(offset)
        .all()
    )

    out = []
    for r in rows:
        regular = float(r.regular_price) if r.regular_price is not None else None
        price = float(r.price)
        discount_amount = float(r.discount_amount or 0)
        discount_percent = float(r.discount_percent or 0)
        is_on_sale = (regular is not None and regular > price) or discount_amount > 0 or discount_percent > 0

        out.append(
            {
                "supermarket_product_id": r.supermarket_product_id,
                "product_name": r.product_name,
                "image_url": r.image_url,
                "product_url": r.product_url,
                "price": price,
                "regular_price": regular,
                "discount_amount": discount_amount,
                "discount_percent": discount_percent,
                "currency": r.currency,
                "is_on_sale": is_on_sale,
                "stock": int(r.stock),
            }
        )

    return {
        "supermarket_id": supermarket_id,
        "q": q,
        "total": int(total),
        "limit": limit,
        "offset": offset,
        "items": out,
    }