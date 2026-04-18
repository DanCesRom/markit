# backend/app/ingestion/runs/import_selected_jsons.py
from __future__ import annotations

import json
import hashlib
from pathlib import Path
from decimal import Decimal
from typing import Any, Dict, Iterable, Optional, Tuple

from sqlalchemy.orm import Session

from backend.app.core.database import SessionLocal
from backend.app.models.supermarket import Supermarket
from backend.app.models.supermarket_product import SupermarketProduct, ProductStatus, UnitKind
from backend.app.models.supermarket_product_price import SupermarketProductPrice
from backend.app.models.product_inventory import ProductInventory, InventoryStatus
from backend.app.models.supermarket_raw_item import SupermarketRawItem


SIRENA_PATH = Path(r"backend\app\ingestion\output\sirena_selected\sirena_selected_merged_20260211_234626.json")
NACIONAL_PATH = Path(r"backend\app\ingestion\output\nacional_selected\nacional_selected_merged_20260211_234718.json")


# -------------------------
# Helpers
# -------------------------

def _dec(v: Any, default: str = "0") -> Decimal:
    if v is None or v == "":
        return Decimal(default)
    if isinstance(v, Decimal):
        return v
    try:
        return Decimal(str(v).strip())
    except Exception:
        return Decimal(default)


def _sha256_payload(payload: Any) -> str:
    raw = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


def _load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def _get_or_create_supermarket(db: Session, name: str) -> Supermarket:
    sm = db.query(Supermarket).filter(Supermarket.name == name).first()
    if sm:
        return sm
    sm = Supermarket(name=name, address="")
    db.add(sm)
    db.flush()
    return sm


def _upsert_raw(
    db: Session,
    supermarket_id: int,
    external_id: str,
    external_sku: Optional[str],
    payload: Any,
) -> None:
    payload_hash = _sha256_payload(payload)

    row = (
        db.query(SupermarketRawItem)
        .filter(
            SupermarketRawItem.supermarket_id == supermarket_id,
            SupermarketRawItem.external_id == external_id,
        )
        .first()
    )

    if row:
        if row.payload_hash == payload_hash:
            return
        row.external_sku = external_sku
        row.payload = payload
        row.payload_hash = payload_hash
        return

    db.add(
        SupermarketRawItem(
            supermarket_id=supermarket_id,
            external_id=external_id,
            external_sku=external_sku,
            payload=payload,
            payload_hash=payload_hash,
        )
    )


def _upsert_supermarket_product(
    db: Session,
    supermarket_id: int,
    external_id: str,
    external_sku: Optional[str],
    name_raw: str,
    category_raw: Optional[str],
    image_url: Optional[str],
    product_url: Optional[str],
    unit_kind: UnitKind,
    min_qty: Optional[Decimal],
    max_qty: Optional[Decimal],
    step_qty: Optional[Decimal],
    status: ProductStatus,
) -> SupermarketProduct:
    sp = (
        db.query(SupermarketProduct)
        .filter(
            SupermarketProduct.supermarket_id == supermarket_id,
            SupermarketProduct.external_id == external_id,
        )
        .first()
    )

    if not sp:
        sp = SupermarketProduct(
            supermarket_id=supermarket_id,
            external_id=external_id,
            external_sku=external_sku,
            name_raw=name_raw or "Unnamed",
            category_raw=category_raw,
            image_url=image_url,
            product_url=product_url,
            unit_kind=unit_kind,
            min_qty=min_qty,
            max_qty=max_qty,
            step_qty=step_qty,
            status=status,
        )
        db.add(sp)
        return sp

    sp.external_sku = external_sku
    sp.name_raw = name_raw or sp.name_raw or "Unnamed"
    sp.category_raw = category_raw
    sp.image_url = image_url
    sp.product_url = product_url
    sp.unit_kind = unit_kind
    sp.min_qty = min_qty
    sp.max_qty = max_qty
    sp.step_qty = step_qty
    sp.status = status

    return sp


def _upsert_price(
    db: Session,
    supermarket_product_id: int,
    price: Decimal,
    regular_price: Optional[Decimal],
    currency: str,
    discount_amount: Decimal,
    discount_percent: Decimal,
) -> None:
    row = (
        db.query(SupermarketProductPrice)
        .filter(SupermarketProductPrice.supermarket_product_id == supermarket_product_id)
        .first()
    )
    if not row:
        row = SupermarketProductPrice(supermarket_product_id=supermarket_product_id)
        db.add(row)

    row.price = price
    row.regular_price = regular_price
    row.currency = (currency or "DOP").strip()[:3].upper()
    row.discount_amount = discount_amount
    row.discount_percent = discount_percent


def _upsert_inventory(
    db: Session,
    supermarket_product_id: int,
    in_stock: bool,
    stock_qty: Optional[int],
) -> None:
    inv = (
        db.query(ProductInventory)
        .filter(ProductInventory.supermarket_product_id == supermarket_product_id)
        .first()
    )
    if not inv:
        inv = ProductInventory(supermarket_product_id=supermarket_product_id)
        db.add(inv)

    inv.in_stock = bool(in_stock)
    inv.stock_qty = int(stock_qty) if stock_qty is not None else None
    inv.status = InventoryStatus.in_stock if in_stock else InventoryStatus.out_of_stock


# -------------------------
# Iterators (IMPORTANT!)
# -------------------------

def _iter_merged_items(payload: Any) -> Iterable[Dict[str, Any]]:
    """
    Tus JSON vienen así:
      {
        "source": "...",
        ...
        "merged_items": [ ...items... ]
      }
    """
    if isinstance(payload, dict) and isinstance(payload.get("merged_items"), list):
        return payload["merged_items"]
    # fallback por si un día viene directo
    if isinstance(payload, list):
        return payload
    return []


# -------------------------
# Imports
# -------------------------

def import_sirena(db: Session, path: Path, progress_every: int = 500) -> Tuple[int, int]:
    payload = _load_json(path)
    items = list(_iter_merged_items(payload))
    sm = _get_or_create_supermarket(db, "La Sirena")

    ok = 0
    skipped = 0

    for i, it in enumerate(items, start=1):
        external_id = str(it.get("productid") or "").strip()
        if not external_id:
            skipped += 1
            continue

        external_sku = None
        name_raw = str(it.get("name") or "").strip() or "Unnamed"
        category_raw = str(it.get("category") or "").strip() or None
        image_url = str(it.get("image_url") or "").strip() or None
        product_url = str(it.get("product_url") or "").strip() or None

        min_qty = _dec(it.get("minimum"), "1") if it.get("minimum") is not None else None
        step_qty = _dec(it.get("producttype_step"), "1") if it.get("producttype_step") is not None else None
        unit_kind = UnitKind.weight if int(it.get("producttype_decimal") or 0) == 2 else UnitKind.unit
        max_qty = None

        price = _dec(it.get("price"), "0")
        regular_price = _dec(it.get("regular_price"), "0")
        if regular_price == Decimal("0"):
            regular_price = None

        if regular_price is not None and regular_price > price and regular_price > 0:
            discount_amount = (regular_price - price).quantize(Decimal("0.01"))
            discount_percent = ((discount_amount / regular_price) * Decimal("100")).quantize(Decimal("0.01"))
        else:
            discount_amount = Decimal("0.00")
            discount_percent = Decimal("0.00")

        in_stock = bool(it.get("available_order", 0)) and bool(it.get("visible", 1))
        stock_qty = 999 if in_stock else 0

        sp = _upsert_supermarket_product(
            db=db,
            supermarket_id=sm.id,
            external_id=external_id,
            external_sku=external_sku,
            name_raw=name_raw,
            category_raw=category_raw,
            image_url=image_url,
            product_url=product_url,
            unit_kind=unit_kind,
            min_qty=min_qty,
            max_qty=max_qty,
            step_qty=step_qty,
            status=ProductStatus.available if in_stock else ProductStatus.unavailable,
        )
        db.flush()

        _upsert_raw(db, sm.id, external_id, external_sku, it)

        _upsert_price(
            db,
            supermarket_product_id=sp.id,
            price=price.quantize(Decimal("0.01")),
            regular_price=(regular_price.quantize(Decimal("0.01")) if regular_price is not None else None),
            currency="DOP",
            discount_amount=discount_amount,
            discount_percent=discount_percent,
        )

        _upsert_inventory(db, sp.id, in_stock=in_stock, stock_qty=stock_qty)

        ok += 1
        if progress_every and (i % progress_every) == 0:
            print(f"   [Sirena] progress: {i}/{len(items)} ok={ok} skipped={skipped}")

    return ok, skipped


def import_nacional(db: Session, path: Path, progress_every: int = 500) -> Tuple[int, int]:
    payload = _load_json(path)
    items = list(_iter_merged_items(payload))
    sm = _get_or_create_supermarket(db, "Nacional")

    ok = 0
    skipped = 0

    for i, it in enumerate(items, start=1):
        external_id = str(it.get("id") or "").strip()
        if not external_id:
            skipped += 1
            continue

        external_sku = str(it.get("sku") or "").strip() or None
        name_raw = str(it.get("name") or "").strip() or "Unnamed"

        image_url = None
        if isinstance(it.get("thumbnail"), dict):
            image_url = str(it["thumbnail"].get("url") or "").strip() or None
        if not image_url and isinstance(it.get("small_image"), dict):
            image_url = str(it["small_image"].get("url") or "").strip() or None

        url_key = str(it.get("url_key") or "").strip()
        url_suffix = str(it.get("url_suffix") or "").strip()
        product_url = f"/{url_key}{url_suffix}" if (url_key or url_suffix) else None

        pr = it.get("price_range") or {}
        mp = pr.get("minimum_price") or {}

        rp = mp.get("regular_price") or {}
        fp = mp.get("final_price") or {}
        disc = mp.get("discount") or {}

        currency = (fp.get("currency") or rp.get("currency") or "DOP")

        regular_price = _dec(rp.get("value"), "0")
        if regular_price == Decimal("0"):
            regular_price = None

        price = _dec(fp.get("value"), "0")

        discount_amount = _dec(disc.get("amount_off"), "0").quantize(Decimal("0.01"))
        discount_percent = _dec(disc.get("percent_off"), "0").quantize(Decimal("0.01"))

        stock_status = str(it.get("stock_status") or "").upper()
        in_stock = (stock_status == "IN_STOCK")
        stock_qty = 999 if in_stock else 0

        sp = _upsert_supermarket_product(
            db=db,
            supermarket_id=sm.id,
            external_id=external_id,
            external_sku=external_sku,
            name_raw=name_raw,
            category_raw=None,
            image_url=image_url,
            product_url=product_url,
            unit_kind=UnitKind.unit,
            min_qty=Decimal("1.000"),
            max_qty=None,
            step_qty=Decimal("1.000"),
            status=ProductStatus.available if in_stock else ProductStatus.unavailable,
        )
        db.flush()

        _upsert_raw(db, sm.id, external_id, external_sku, it)

        _upsert_price(
            db,
            supermarket_product_id=sp.id,
            price=price.quantize(Decimal("0.01")),
            regular_price=(regular_price.quantize(Decimal("0.01")) if regular_price is not None else None),
            currency=str(currency),
            discount_amount=discount_amount,
            discount_percent=discount_percent,
        )

        _upsert_inventory(db, sp.id, in_stock=in_stock, stock_qty=stock_qty)

        ok += 1
        if progress_every and (i % progress_every) == 0:
            print(f"   [Nacional] progress: {i}/{len(items)} ok={ok} skipped={skipped}")

    return ok, skipped


def main() -> None:
    for p in (SIRENA_PATH, NACIONAL_PATH):
        if not p.exists():
            raise SystemExit(f"File not found: {p}")

    db = SessionLocal()
    try:
        print(f"🚚 Importing Sirena from: {SIRENA_PATH}")
        s_ok, s_sk = import_sirena(db, SIRENA_PATH, progress_every=500)

        print(f"🚚 Importing Nacional from: {NACIONAL_PATH}")
        n_ok, n_sk = import_nacional(db, NACIONAL_PATH, progress_every=500)

        db.commit()

        print("✅ Import completed.")
        print(f"   - Sirena:  ok={s_ok} skipped={s_sk} file={SIRENA_PATH}")
        print(f"   - Nacional: ok={n_ok} skipped={n_sk} file={NACIONAL_PATH}")

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()