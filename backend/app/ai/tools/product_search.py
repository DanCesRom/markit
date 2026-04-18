# backend/app/ai/tools/product_search.py
from __future__ import annotations

import math
import re
from decimal import Decimal
from typing import List, Literal, Tuple

from sqlalchemy.orm import Session
from sqlalchemy import or_, func

from backend.app.models.catalog_product import CatalogProduct
from backend.app.models.supermarket_product import SupermarketProduct
from backend.app.models.product_inventory import ProductInventory
from backend.app.models.supermarket import Supermarket
from backend.app.models.supermarket_product_price import SupermarketProductPrice

from backend.app.ai.schemas import SearchOption


NEGATIVE_FOOD_WORDS = {
    "sabor", "aroma", "esencia", "extracto",
    "té", "te", "infusion", "infusión",
    "jugo", "zumo", "nectar", "néctar", "refresco",
    "instantaneo", "instantáneo",
    "galleta", "galletas", "cereal", "yogurt", "helado",
    "caramelo", "dulce", "gomitas",
    "mermelada", "jalea", "sirope",
    "bebida", "drink",
}

PRODUCE_WORDS = {
    "lb", "libra", "libras",
    "unidad", "unid", "ud", "uds", "und",
    "granel", "fresca", "fresco",
    "roja", "verde", "criolla", "colosal",
    "paq", "paquete",
}

NON_GROCERY_WORDS = {
    "shampoo", "champu", "champú", "acondicionador", "crema", "locion", "loción",
    "capilar", "keratina", "keratin", "argán", "argan", "almendra", "colágeno",
    "collado", "serum", "suero", "cosmetico", "cosmético", "hair", "body",
    "jabón", "jabon", "desodorante", "maquillaje", "labial", "perfume",
}

FRESH_INGREDIENT_QUERIES = {
    "ajo", "cebolla", "cilantro", "mazorca", "maiz", "maíz",
    "platano", "plátano", "platano verde", "plátano verde",
    "yuca", "auyama", "aji", "ají",
    "pollo", "carne", "carne de res", "carne de cerdo",
}

PROCESSED_WORDS = {
    "molido", "molida", "en polvo", "polvo", "pasta", "puré", "pure",
    "extracto", "deshidratado", "deshidratada", "sobre",
}

SPECIFIC_PENALTIES = {
    "mazorca": {"harina": 120},
    "maiz": {"harina": 120},
    "maíz": {"harina": 120},
    "ajo": {"pasta": 60, "molido": 40, "polvo": 40, "caldo": 100},
    "cilantro": {
        "molido": 50,
        "badia": 35,
        "sobre": 35,
        "semilla": 100,
        "sazón": 120,
        "sazon": 120,
        "salsa": 120,
        "tostones": 120,
    },
    "aceite": {
        "argán": 200,
        "argan": 200,
        "keratina": 200,
        "capilar": 200,
        "almendra": 140,
        "collado": 140,
        "oliva": 15,
        "sardina": 250,
        "sardinas": 250,
        "atun": 250,
        "atún": 250,
        "arenque": 250,
        "mejillon": 250,
        "mejillón": 250,
    },
    "cebolla": {
        "casabe": 120,
    },
}

SPECIFIC_BONUSES = {
    "ajo": {"selecto": 20, "fresco": 20, "uds": 15, "paq": 10, "pelado": 10},
    "cilantro": {"ancho": 15, "paquete": 10, "paq": 10, "hidroponico": 8, "hidropónico": 8},
    "mazorca": {"congelada": 35, "mazorca": 20, "maiz": 10, "maíz": 10, "mini": 5},
    "aceite": {"vegetal": 40, "canola": 35, "soya": 35, "girasol": 30},
}

HARD_EXCLUDES = {
    "aceite": [
        "argán", "argan", "keratina", "capilar", "collado", "serum", "hair", "body",
        "sardina", "sardinas", "atun", "atún", "arenque", "mejillon", "mejillón",
    ],
    "mazorca": ["harina"],
    "ajo": ["pasta", "caldo"],
    "cilantro": ["molido", "semilla", "badia", "sobre", "sazón", "sazon", "salsa", "tostones"],
    "cebolla": ["casabe"],
}

PREFER_CHEAP_QUERIES = {
    "aceite", "sal", "caldo de pollo", "cebolla", "ajo", "yuca",
    "auyama", "platano verde", "plátano verde", "mazorca", "cilantro"
}

PACKAGE_HINTS = [
    "peso aprox", "empacad", "paq", "paquete", "funda", "caja", "lata",
    "botella", "pack", "sobre", "sachet", "tarro", "frasco", "bolsa",
    "onz", "oz", "ml", "lt", "litro", "litros", "gr", "g ", "kg", "kl",
]

UNIT_HINTS = [
    " und", "und ", "unidad", "unidades", "uds", "ud ",
]

WEIGHT_HINTS = [
    " lb", "lb ", "libra", "libras", "granel",
]


def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def _tokenize(s: str) -> list[str]:
    s = _norm(s)
    s = re.sub(r"[^a-z0-9áéíóúñ\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return [t for t in s.split(" ") if t]


def _query_intent_allows_processed(query: str) -> bool:
    q = _norm(query)
    allow_triggers = [
        "té", "te", "jugo", "zumo", "refresco", "sabor",
        "polvo", "galleta", "mermelada", "pasta", "extracto",
    ]
    return any(t in q for t in allow_triggers)


def _is_fresh_query(query: str) -> bool:
    q = _norm(query)
    return q in FRESH_INGREDIENT_QUERIES


def _should_hard_exclude(query: str, product_name: str) -> bool:
    q = _norm(query)
    name = _norm(product_name)

    if any(w in name for w in NON_GROCERY_WORDS):
        return True

    blocked = HARD_EXCLUDES.get(q, [])
    return any(term in name for term in blocked)


def _relevance_score(query: str, product_name: str) -> int:
    q = _norm(query)
    name = _norm(product_name)

    q_tokens = set(_tokenize(q))
    n_tokens = set(_tokenize(name))

    score = 0

    if q in name:
        score += 30

    common = q_tokens.intersection(n_tokens)
    score += min(len(common), 6) * 6

    if name.startswith(q):
        score += 10

    if any(w in n_tokens for w in PRODUCE_WORDS):
        score += 10

    if any(w in n_tokens for w in NON_GROCERY_WORDS):
        score -= 250

    if not _query_intent_allows_processed(q):
        if any(w in n_tokens for w in NEGATIVE_FOOD_WORDS):
            score -= 25

    if _is_fresh_query(q):
        if any(w in name for w in PROCESSED_WORDS):
            score -= 25

    penalties = SPECIFIC_PENALTIES.get(q, {})
    for token, penalty in penalties.items():
        if token in name:
            score -= penalty

    bonuses = SPECIFIC_BONUSES.get(q, {})
    for token, bonus in bonuses.items():
        if token in name:
            score += bonus

    if q == "mazorca":
        if "mini" in name:
            score -= 5
        if "congelada" in name:
            score += 25

    if q == "aceite":
        if "oliva" in name:
            score -= 15
        if any(w in name for w in ["soya", "vegetal", "canola", "girasol"]):
            score += 30

    if q == "cilantro":
        if any(w in name for w in ["sazón", "sazon", "salsa", "tostones"]):
            score -= 150

    return score


def _ceil_decimal(value: Decimal) -> Decimal:
    return Decimal(str(math.ceil(float(value))))


def _extract_approx_pack_weight(name: str) -> Decimal | None:
    lower = _norm(name)

    m = re.search(r"peso aprox\.\s*([\d.]+)\s*libras?", lower, flags=re.IGNORECASE)
    if m:
        return Decimal(m.group(1))

    m = re.search(r"aprox\.\s*([\d.]+)\s*libras?", lower, flags=re.IGNORECASE)
    if m:
        return Decimal(m.group(1))

    return None


def _infer_pricing(
    product_name: str,
    requested_qty: Decimal,
) -> Tuple[Literal["weighted", "unit", "package"], Decimal, str]:
    name = _norm(product_name)

    has_package = any(h in name for h in PACKAGE_HINTS)
    has_unit = any(h in name for h in UNIT_HINTS)
    has_weight = any(h in name for h in WEIGHT_HINTS)

    approx_pack = _extract_approx_pack_weight(product_name)

    if approx_pack is not None:
        return (
            "package",
            Decimal("1"),
            f"Se comprará 1 paquete aprox. {approx_pack} lb",
        )

    if has_package and not has_weight:
        return (
            "package",
            Decimal("1"),
            "Se comprará 1 presentación completa",
        )

    if has_unit and not has_weight:
        units = _ceil_decimal(requested_qty if requested_qty > 0 else Decimal("1"))
        if units < 1:
            units = Decimal("1")
        return (
            "unit",
            units,
            f"Se comprarán {int(units)} {'unidad' if int(units) == 1 else 'unidades'}",
        )

    if has_package and has_weight:
        # Ej: empacado con libra / peso aprox. que realmente se vende completo
        if "empacad" in name or "paq" in name or "paquete" in name:
            return (
                "package",
                Decimal("1"),
                "Se comprará 1 paquete completo",
            )

    if has_weight:
        qty = requested_qty if requested_qty > 0 else Decimal("1")
        return (
            "weighted",
            qty,
            f"Se comprarán {qty.quantize(Decimal('0.01'))} lb aprox.",
        )

    return (
        "package",
        Decimal("1"),
        "Se comprará 1 presentación completa",
    )


def search_options(
    db: Session,
    query: str,
    qty: Decimal,
    limit: int = 5,
    cheapest_first: bool = True,
) -> List[SearchOption]:
    q = (query or "").strip()
    if not q:
        return []

    q_norm = _norm(q)
    fetch_n = max(limit * 20, 150)

    product_name_expr = func.coalesce(CatalogProduct.name, SupermarketProduct.name_raw)
    stock_ok = or_(ProductInventory.stock_qty.is_(None), ProductInventory.stock_qty > 0)

    rows = (
        db.query(
            product_name_expr.label("product"),
            Supermarket.name.label("supermarket"),
            Supermarket.id.label("supermarket_id"),
            SupermarketProduct.id.label("supermarket_product_id"),
            SupermarketProduct.image_url.label("image_url"),
            SupermarketProductPrice.price.label("price"),
            ProductInventory.in_stock.label("in_stock"),
            ProductInventory.stock_qty.label("stock_qty"),
        )
        .select_from(SupermarketProduct)
        .outerjoin(CatalogProduct, CatalogProduct.id == SupermarketProduct.catalog_product_id)
        .join(Supermarket, Supermarket.id == SupermarketProduct.supermarket_id)
        .join(ProductInventory, ProductInventory.supermarket_product_id == SupermarketProduct.id)
        .join(SupermarketProductPrice, SupermarketProductPrice.supermarket_product_id == SupermarketProduct.id)
        .filter(
            or_(
                CatalogProduct.name.ilike(f"%{q}%"),
                SupermarketProduct.name_raw.ilike(f"%{q}%"),
            )
        )
        .filter(SupermarketProduct.status == "available")
        .filter(ProductInventory.in_stock == True)  # noqa: E712
        .filter(stock_ok)
        .order_by(SupermarketProductPrice.price.asc())
        .limit(fetch_n)
        .all()
    )

    candidates: list[tuple[int, Decimal, SearchOption]] = []

    for r in rows:
        product_name = str(r.product)

        if _should_hard_exclude(q_norm, product_name):
            continue

        unit_price = Decimal(str(r.price))
        pricing_mode, purchase_qty, purchase_note = _infer_pricing(product_name, qty)

        if pricing_mode == "weighted":
            line_total = unit_price * purchase_qty
        else:
            line_total = unit_price * purchase_qty

        opt = SearchOption(
            product=product_name,
            supermarket=str(r.supermarket),
            supermarket_id=int(r.supermarket_id),
            supermarket_product_id=int(r.supermarket_product_id),
            unit_price=unit_price,
            currency="DOP",
            in_stock=bool(r.in_stock),
            stock_qty=None if r.stock_qty is None else int(r.stock_qty),
            requested_qty=qty,
            purchase_qty=purchase_qty,
            qty=purchase_qty,
            line_total=line_total,
            image_url=r.image_url,
            pricing_mode=pricing_mode,
            purchase_note=purchase_note,
        )

        score = _relevance_score(q_norm, opt.product)
        candidates.append((score, unit_price, opt))

    if not candidates:
        return []

    if q_norm in PREFER_CHEAP_QUERIES:
        max_score = max(score for score, _, _ in candidates)
        threshold = max_score - 20
        narrowed = [c for c in candidates if c[0] >= threshold]
        narrowed.sort(key=lambda x: (x[1], -x[0], x[2].product))
        return [c[2] for c in narrowed[:limit]]

    candidates.sort(key=lambda x: (-x[0], x[1], x[2].product))
    return [c[2] for c in candidates[:limit]]