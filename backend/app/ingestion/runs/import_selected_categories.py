# backend/app/ingestion/runs/import_selected_categories.py
import json
import os
import re
from decimal import Decimal
from typing import Optional, Tuple

from sqlalchemy.orm import Session

from backend.app.core.database import SessionLocal
from backend.app.models.supermarket import Supermarket
from backend.app.models.category import Category
from backend.app.models.supermarket_category import SupermarketCategory
from backend.app.models.supermarket_product import SupermarketProduct, UnitKind, ProductStatus
from backend.app.models.supermarket_product_price import SupermarketProductPrice
from backend.app.models.product_inventory import ProductInventory, InventoryStatus


# ===== Config paths =====
NACIONAL_DIR = r"backend/app/ingestion/output/nacional_selected/categories"
SIRENA_DIR = r"backend/app/ingestion/output/sirena_selected/categories"


def slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-{2,}", "-", s)
    return s.strip("-") or "unknown"


def get_or_create_supermarket(db: Session, name: str) -> Supermarket:
    sm = db.query(Supermarket).filter(Supermarket.name == name).first()
    if sm:
        return sm

    sm = Supermarket(name=name, address="N/A")
    db.add(sm)
    db.flush()
    return sm


def upsert_category(db: Session, name: str, slug: str) -> Category:
    slug = slugify(slug or name)
    cat = db.query(Category).filter(Category.slug == slug).first()
    if cat:
        if name and cat.name != name:
            cat.name = name
        return cat

    cat = Category(name=name, slug=slug)
    db.add(cat)
    db.flush()
    return cat


def upsert_supermarket_category(
    db: Session,
    supermarket_id: int,
    category_id: int,
    name_raw: str,
    slug_raw: Optional[str],
) -> SupermarketCategory:
    key = slugify(slug_raw or name_raw)

    sc = (
        db.query(SupermarketCategory)
        .filter(
            SupermarketCategory.supermarket_id == supermarket_id,
            SupermarketCategory.slug_raw == key,
        )
        .first()
    )

    if sc:
        sc.category_id = category_id
        sc.name_raw = name_raw
        sc.slug_raw = key
        return sc

    sc = SupermarketCategory(
        supermarket_id=supermarket_id,
        category_id=category_id,
        name_raw=name_raw,
        slug_raw=key,
    )
    db.add(sc)
    db.flush()
    return sc


def upsert_product(
    db: Session,
    supermarket_id: int,
    supermarket_category_id: Optional[int],
    external_id: str,
    external_sku: Optional[str],
    name_raw: str,
    category_raw: Optional[str],
    image_url: Optional[str],
    product_url: Optional[str],
    unit_kind: UnitKind,
    min_qty: Optional[Decimal],
    step_qty: Optional[Decimal],
    status: ProductStatus,
) -> SupermarketProduct:
    p = (
        db.query(SupermarketProduct)
        .filter(
            SupermarketProduct.supermarket_id == supermarket_id,
            SupermarketProduct.external_id == external_id,
        )
        .first()
    )

    safe_name = (name_raw or "").strip()
    if not safe_name:
        raise ValueError(
            f"Producto sin name_raw (supermarket_id={supermarket_id}, external_id={external_id})"
        )

    if not p:
        #  crea con required fields
        p = SupermarketProduct(
            supermarket_id=supermarket_id,
            external_id=external_id,
            name_raw=safe_name,
        )
        db.add(p)

    #  setea todo
    p.supermarket_category_id = supermarket_category_id
    p.external_sku = external_sku
    p.name_raw = safe_name
    p.category_raw = category_raw
    p.image_url = image_url
    p.product_url = product_url
    p.unit_kind = unit_kind
    p.min_qty = min_qty
    p.step_qty = step_qty
    p.status = status

    #  IMPORTANT: garantizar p.id para usarlo en price/inventory
    db.flush()

    return p


def upsert_price(
    db: Session,
    supermarket_product_id: int,
    price: Decimal,
    regular_price: Optional[Decimal],
    currency: str = "DOP",
    discount_amount: Decimal = Decimal("0"),
    discount_percent: Decimal = Decimal("0"),
) -> SupermarketProductPrice:
    if not supermarket_product_id:
        raise ValueError("supermarket_product_id es None en upsert_price")

    row = (
        db.query(SupermarketProductPrice)
        .filter(SupermarketProductPrice.supermarket_product_id == supermarket_product_id)
        .first()
    )

    if not row:
        row = SupermarketProductPrice(
            supermarket_product_id=supermarket_product_id,
            price=price,
            regular_price=regular_price,
        )
        db.add(row)
    else:
        row.price = price
        row.regular_price = regular_price

    row.currency = currency
    row.discount_amount = discount_amount
    row.discount_percent = discount_percent

    db.flush()
    return row


def upsert_inventory(
    db: Session,
    supermarket_product_id: int,
    in_stock: bool,
    status: InventoryStatus,
    stock_qty: Optional[int] = None,
) -> ProductInventory:
    if not supermarket_product_id:
        raise ValueError("supermarket_product_id es None en upsert_inventory")

    inv = (
        db.query(ProductInventory)
        .filter(ProductInventory.supermarket_product_id == supermarket_product_id)
        .first()
    )

    if not inv:
        inv = ProductInventory(
            supermarket_product_id=supermarket_product_id,
            in_stock=in_stock,
            status=status,
            stock_qty=stock_qty,
        )
        db.add(inv)
    else:
        inv.in_stock = in_stock
        inv.status = status
        inv.stock_qty = stock_qty

    db.flush()
    return inv


# ===== Parsers =====

def parse_nacional_file(path: str) -> Tuple[str, str, list]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    cat = data.get("category") or {}
    category_name = cat.get("name") or "Sin categoría"
    category_slug = cat.get("url_key") or slugify(category_name)

    products = (data.get("products") or {}).get("items") or []
    return category_name, category_slug, products


def parse_sirena_file(path: str) -> Tuple[str, str, list]:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    category_slug = data.get("slug") or "unknown"
    category_name = data.get("category") or "Sin categoría"
    items = data.get("items") or []
    return category_name, category_slug, items


def import_nacional(db: Session) -> int:
    sm = get_or_create_supermarket(db, "Nacional")
    total = 0

    for fname in sorted(os.listdir(NACIONAL_DIR)):
        if not fname.endswith(".json"):
            continue

        fpath = os.path.join(NACIONAL_DIR, fname)
        cat_name, cat_slug, items = parse_nacional_file(fpath)

        cat = upsert_category(db, cat_name, cat_slug)
        sc = upsert_supermarket_category(db, sm.id, cat.id, cat_name, cat_slug)

        for it in items:
            ext_id = str(it.get("id") or "").strip()
            if not ext_id:
                print(f"[NACIONAL] skip item sin id en {fname}")
                continue

            sku = it.get("sku")
            name = it.get("name") or ""
            img = (it.get("thumbnail") or {}).get("url") or (it.get("small_image") or {}).get("url")

            url_key = (it.get("url_key") or "").strip()
            product_url = f"https://supermercadosnacional.com/{url_key}" if url_key else None

            stock_status = (it.get("stock_status") or "").upper()
            in_stock = stock_status == "IN_STOCK"
            status = ProductStatus.available if in_stock else ProductStatus.unavailable

            unit_kind = UnitKind.unit
            min_qty = None
            step_qty = None

            try:
                p = upsert_product(
                    db=db,
                    supermarket_id=sm.id,
                    supermarket_category_id=sc.id,
                    external_id=ext_id,
                    external_sku=str(sku) if sku else None,
                    name_raw=name,
                    category_raw=cat_name,
                    image_url=img,
                    product_url=product_url,
                    unit_kind=unit_kind,
                    min_qty=min_qty,
                    step_qty=step_qty,
                    status=status,
                )
            except Exception as e:
                print(f"[NACIONAL] skip external_id={ext_id} sku={sku} reason={e}")
                continue

            # price
            mp = ((it.get("price_range") or {}).get("minimum_price") or {})
            final_price = ((mp.get("final_price") or {}).get("value"))
            reg_price = ((mp.get("regular_price") or {}).get("value"))
            currency = ((mp.get("final_price") or {}).get("currency")) or "DOP"

            if final_price is not None:
                try:
                    upsert_price(
                        db=db,
                        supermarket_product_id=p.id,
                        price=Decimal(str(final_price)),
                        regular_price=Decimal(str(reg_price)) if reg_price is not None else None,
                        currency=currency,
                    )
                except Exception as e:
                    print(f"[NACIONAL] price skip external_id={ext_id} reason={e}")

            try:
                upsert_inventory(
                    db=db,
                    supermarket_product_id=p.id,
                    in_stock=in_stock,
                    status=InventoryStatus.in_stock if in_stock else InventoryStatus.out_of_stock,
                )
            except Exception as e:
                print(f"[NACIONAL] inventory skip external_id={ext_id} reason={e}")

            total += 1

        db.commit()
        print(f" [NACIONAL] {fname} importado. items_ok={total}")

    return total


def import_sirena(db: Session) -> int:
    sm = get_or_create_supermarket(db, "Sirena")
    total = 0

    for fname in sorted(os.listdir(SIRENA_DIR)):
        if not fname.endswith(".json"):
            continue

        fpath = os.path.join(SIRENA_DIR, fname)
        cat_name, cat_slug, items = parse_sirena_file(fpath)

        cat = upsert_category(db, cat_name, cat_slug)
        sc = upsert_supermarket_category(db, sm.id, cat.id, cat_name, cat_slug)

        for it in items:
            ext_id = str(it.get("productid") or "").strip()
            if not ext_id:
                print(f"[SIRENA] skip item sin productid en {fname}")
                continue

            name = it.get("name") or ""
            img = it.get("image_url")
            product_url = it.get("product_url")

            min_qty = Decimal(str(it.get("minimum"))) if it.get("minimum") else None
            step_qty = Decimal(str(it.get("producttype_step"))) if it.get("producttype_step") else None
            unit_kind = UnitKind.weight if int(it.get("producttype_decimal") or 0) > 0 else UnitKind.unit

            visible = int(it.get("visible") or 1) == 1
            available_order = int(it.get("available_order") or 0) == 1
            in_stock = visible and available_order
            status = ProductStatus.available if in_stock else ProductStatus.unavailable

            try:
                p = upsert_product(
                    db=db,
                    supermarket_id=sm.id,
                    supermarket_category_id=sc.id,
                    external_id=ext_id,
                    external_sku=None,
                    name_raw=name,
                    category_raw=it.get("category") or cat_name,
                    image_url=img,
                    product_url=product_url,
                    unit_kind=unit_kind,
                    min_qty=min_qty,
                    step_qty=step_qty,
                    status=status,
                )
            except Exception as e:
                print(f"[SIRENA] skip external_id={ext_id} reason={e}")
                continue

            price = Decimal(str(it.get("price") or "0"))
            regular_price = Decimal(str(it.get("regular_price"))) if it.get("regular_price") else None
            discount_percent = Decimal(str(it.get("discount") or "0"))

            try:
                upsert_price(
                    db=db,
                    supermarket_product_id=p.id,
                    price=price,
                    regular_price=regular_price,
                    currency="DOP",
                    discount_amount=Decimal("0"),
                    discount_percent=discount_percent,
                )
            except Exception as e:
                print(f"[SIRENA] price skip external_id={ext_id} reason={e}")

            try:
                upsert_inventory(
                    db=db,
                    supermarket_product_id=p.id,
                    in_stock=in_stock,
                    status=InventoryStatus.in_stock if in_stock else InventoryStatus.out_of_stock,
                )
            except Exception as e:
                print(f"[SIRENA] inventory skip external_id={ext_id} reason={e}")

            total += 1

        db.commit()
        print(f" [SIRENA] {fname} importado. items_ok={total}")

    return total


def main():
    db = SessionLocal()
    try:
        n = import_nacional(db)
        s = import_sirena(db)
        print(f" Import completado. Nacional: {n} items, Sirena: {s} items")
    finally:
        db.close()


if __name__ == "__main__":
    main()