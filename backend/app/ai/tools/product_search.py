# backend/app/ai/tools/product_search.py
from __future__ import annotations

import math
import re
import unicodedata
from decimal import Decimal
from typing import List, Literal, Tuple

from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from backend.app.ai.schemas import SearchOption
from backend.app.models.catalog_product import CatalogProduct
from backend.app.models.product_inventory import ProductInventory
from backend.app.models.supermarket import Supermarket
from backend.app.models.supermarket_product import SupermarketProduct
from backend.app.models.supermarket_product_price import SupermarketProductPrice


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
    "yuca", "auyama", "aji", "ají", "aji cubanela", "ají cubanela",
    "tomate", "lechuga", "limon", "limón", "jalapeno", "jalapeño",
    "res", "carne de res",
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
        "oliva": 10,
        "sardina": 300,
        "sardinas": 300,
        "atun": 300,
        "atún": 300,
        "salmon": 300,
        "salmón": 300,
        "arenque": 300,
        "mejillon": 300,
        "mejillón": 300,
        "enlatado": 220,
    },

    "aceite vegetal": {
        "argán": 250,
        "argan": 250,
        "keratina": 250,
        "capilar": 250,
        "almendra": 140,
        "collado": 140,
        "oliva": 20,
        "sardina": 350,
        "sardinas": 350,
        "atun": 350,
        "atún": 350,
        "salmon": 350,
        "salmón": 350,
        "arenque": 350,
        "mejillon": 350,
        "mejillón": 350,
        "enlatado": 250,
    },

    "cebolla": {
        "casabe": 120,
    },

    "limon": {
        "limonada": 180,
        "jugo": 160,
        "bebida": 160,
        "refresco": 160,
        "te": 120,
        "té": 120,
        "galleta": 120,
    },

    "limón": {
        "limonada": 180,
        "jugo": 160,
        "bebida": 160,
        "refresco": 160,
        "te": 120,
        "té": 120,
        "galleta": 120,
    },

    "jalapeno": {
        "queso": 220,
        "gouda": 220,
        "cheddar": 220,
        "chips": 180,
        "papitas": 180,
        "salsa": 160,
        "dip": 160,
        "nacho": 160,
    },

    "jalapeño": {
        "queso": 220,
        "gouda": 220,
        "cheddar": 220,
        "chips": 180,
        "papitas": 180,
        "salsa": 160,
        "dip": 160,
        "nacho": 160,
    },
    "res": {
    "sopa": 250,
    "ramen": 250,
    "sobre": 180,
    "gato": 300,
    "perro": 300,
    "alimento": 300,
},
"carne de res": {
    "rinon": 220,
    "riñon": 220,
    "riñón": 220,
    "higado": 220,
    "hígado": 220,
    "corazon": 220,
    "corazón": 220,
    "mondongo": 220,
    "lengua": 180,
    "sopa": 300,
    "ramen": 300,
    "sobre": 220,
    "gato": 350,
    "perro": 350,
    "alimento": 350,
},
}

SPECIFIC_BONUSES = {
    "ajo": {"selecto": 20, "fresco": 20, "uds": 15, "paq": 10, "pelado": 10},
    "cilantro": {"ancho": 15, "paquete": 10, "paq": 10, "hidroponico": 8, "hidropónico": 8},
    "mazorca": {"congelada": 35, "mazorca": 20, "maiz": 10, "maíz": 10, "mini": 5},

    "aceite": {
        "aceite": 30,
        "vegetal": 50,
        "canola": 35,
        "soya": 35,
        "girasol": 30,
        "maiz": 25,
        "maíz": 25,
        "crisol": 8,
        "mazola": 8,
    },

    "aceite vegetal": {
        "aceite": 40,
        "vegetal": 70,
        "canola": 40,
        "soya": 40,
        "girasol": 35,
        "maiz": 30,
        "maíz": 30,
        "crisol": 8,
        "mazola": 8,
    },

    "limon": {"limon": 35, "limón": 35, "verde": 10, "lb": 8},
    "limón": {"limon": 35, "limón": 35, "verde": 10, "lb": 8},

    "jalapeno": {"jalapeno": 45, "jalapeño": 45, "fresco": 20, "lb": 10},
    "jalapeño": {"jalapeno": 45, "jalapeño": 45, "fresco": 20, "lb": 10},
    "carne de res": {
    "guisar": 80,
    "molida": 60,
    "res": 50,
    "carne": 50,
    "masa": 35,
    "posta": 35,
},
"res": {
    "carne": 60,
    "guisar": 60,
    "molida": 50,
    "masa": 35,
    "posta": 35,
},
}

HARD_EXCLUDES = {
    "aceite": [
        "argán", "argan", "keratina", "capilar", "collado", "serum", "hair", "body",
        "sardina", "sardinas", "atun", "atún", "salmon", "salmón", "arenque",
        "mejillon", "mejillón", "enlatado",
    ],
    "aceite vegetal": [
        "argán", "argan", "keratina", "capilar", "collado", "serum", "hair", "body",
        "sardina", "sardinas", "atun", "atún", "salmon", "salmón", "arenque",
        "mejillon", "mejillón", "enlatado",
    ],
    "mazorca": ["harina"],
    "ajo": ["pasta", "caldo"],
    "cilantro": ["molido", "semilla", "badia", "sobre", "sazón", "sazon", "salsa", "tostones"],
    "cebolla": ["casabe"],
    "limon": ["limonada", "jugo", "bebida", "refresco", "galleta"],
    "limón": ["limonada", "jugo", "bebida", "refresco", "galleta"],
    "jalapeno": ["queso", "gouda", "cheddar", "chips", "papitas", "salsa", "dip", "nacho"],
    "jalapeño": ["queso", "gouda", "cheddar", "chips", "papitas", "salsa", "dip", "nacho"],


    "arroz": [
    "chocolate", "crispado", "crispy", "cereal", "barra", "galleta",
    "compota", "asopao", "sopa", "maggi", "postre", "leche/arroz",
    ],
    "crema agria": [
    "naranja", "limon", "limón", "fruta", "jugo", "bebida",
],
    "res": [
    "sopa", "ramen", "sobre", "caldo", "whiskas", "gato", "gatos",
    "perro", "perros", "purina", "alimento", "mascota",
],
    "carne de res": [
    "sopa", "ramen", "sobre", "caldo", "whiskas", "gato", "gatos",
    "perro", "perros", "purina", "alimento", "mascota",
    "rinon", "riñon", "riñón", "higado", "hígado", "corazon", "corazón",
    "mondongo", "lengua", "tripa",
],

}

PREFER_CHEAP_QUERIES = {
    "aceite", "aceite vegetal", "sal", "caldo de pollo", "cebolla", "ajo", "yuca",
    "auyama", "platano verde", "plátano verde", "mazorca", "cilantro", "arroz",
    "leche", "azucar", "azúcar",
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


def _strip_accents(text: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", text)
        if unicodedata.category(ch) != "Mn"
    )


def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"\s+", " ", s)
    return s


def _norm_ascii(s: str) -> str:
    return _strip_accents(_norm(s))


def _tokenize(s: str) -> list[str]:
    s = _norm(s)
    s = re.sub(r"[^a-z0-9áéíóúñ\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return [t for t in s.split(" ") if t]


def _tokenize_ascii(s: str) -> list[str]:
    s = _norm_ascii(s)
    s = re.sub(r"[^a-z0-9\s]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    return [t for t in s.split(" ") if t]


def _query_intent_allows_processed(query: str) -> bool:
    q = _norm(query)
    allow_triggers = [
        "té", "te", "jugo", "zumo", "refresco", "sabor",
        "polvo", "galleta", "mermelada", "pasta", "extracto",
        "salsa", "queso", "salami", "jamon", "jamón",
    ]
    return any(t in q for t in allow_triggers)


def _is_fresh_query(query: str) -> bool:
    q = _norm(query)
    q_ascii = _norm_ascii(query)
    return q in FRESH_INGREDIENT_QUERIES or q_ascii in {_norm_ascii(x) for x in FRESH_INGREDIENT_QUERIES}

def _is_beef_query(query: str) -> bool:
    q = _norm_ascii(query)
    return q in {
        "res",
        "carne res",
        "carne de res",
        "carne res guisar",
        "carne de res para guisar",
    }


def _strict_required_match(query: str, product_name: str) -> bool:
    q_ascii = _norm_ascii(query)
    name_ascii = _norm_ascii(product_name)

    if _is_beef_query(q_ascii):
        blocked = [
            "sopa", "ramen", "sobre", "caldo",
            "gato", "gatos", "perro", "perros", "alimento", "snack",
            "protector", "protectores",
            "fresca", "fresco", "fresa", "fresh",
            "rinon", "rinones", "higado", "corazon",
            "mondongo", "lengua", "tripa",
        ]

        if any(w in name_ascii for w in blocked):
            return False

        return (
            ("carne" in name_ascii and "res" in name_ascii)
            or ("res" in name_ascii and "guisar" in name_ascii)
            or ("molida" in name_ascii and "res" in name_ascii)
            or ("bistec" in name_ascii)
            or ("churrasco" in name_ascii and "cerdo" not in name_ascii)
        )

    return True


def _should_hard_exclude(query: str, product_name: str) -> bool:
    q = _norm(query)
    q_ascii = _norm_ascii(query)
    name = _norm(product_name)
    name_ascii = _norm_ascii(product_name)

    if any(_norm_ascii(w) in name_ascii for w in NON_GROCERY_WORDS):
        return True

    blocked = HARD_EXCLUDES.get(q, []) or HARD_EXCLUDES.get(q_ascii, [])
    return any(_norm_ascii(term) in name_ascii for term in blocked)


def _relevance_score(query: str, product_name: str) -> int:
    q = _norm(query)
    q_ascii = _norm_ascii(query)
    name = _norm(product_name)
    name_ascii = _norm_ascii(product_name)

    q_tokens = set(_tokenize(q))
    n_tokens = set(_tokenize(name))
    q_tokens_ascii = set(_tokenize_ascii(q))
    n_tokens_ascii = set(_tokenize_ascii(name))

    score = 0

    if q in name:
        score += 35

    if q_ascii in name_ascii:
        score += 35

    common = q_tokens.intersection(n_tokens)
    common_ascii = q_tokens_ascii.intersection(n_tokens_ascii)

    score += min(len(common), 6) * 7
    score += min(len(common_ascii), 6) * 5

    if name.startswith(q) or name_ascii.startswith(q_ascii):
        score += 15

    if any(w in n_tokens for w in PRODUCE_WORDS) or any(_norm_ascii(w) in n_tokens_ascii for w in PRODUCE_WORDS):
        score += 8

    if any(_norm_ascii(w) in name_ascii for w in NON_GROCERY_WORDS):
        score -= 300

    if not _query_intent_allows_processed(q):
        if any(_norm_ascii(w) in n_tokens_ascii for w in NEGATIVE_FOOD_WORDS):
            score -= 30

    if _is_fresh_query(q):
        if any(_norm_ascii(w) in name_ascii for w in PROCESSED_WORDS):
            score -= 30

    penalties = SPECIFIC_PENALTIES.get(q, {}) or SPECIFIC_PENALTIES.get(q_ascii, {})
    for token, penalty in penalties.items():
        if _norm_ascii(token) in name_ascii:
            score -= penalty

    bonuses = SPECIFIC_BONUSES.get(q, {}) or SPECIFIC_BONUSES.get(q_ascii, {})
    for token, bonus in bonuses.items():
        if _norm_ascii(token) in name_ascii:
            score += bonus

    if q_ascii == "mazorca":
        if "mini" in name_ascii:
            score -= 5
        if "congelada" in name_ascii:
            score += 25

    if q_ascii in {"aceite", "aceite vegetal"}:
        # Tiene que ser aceite como producto, no un alimento "en aceite".
        if "aceite" not in name_ascii:
            score -= 250

        if any(w in name_ascii for w in ["salmon", "atun", "sardina", "arenque", "mejillon"]):
            score -= 350

        if any(w in name_ascii for w in ["soya", "vegetal", "canola", "girasol", "maiz"]):
            score += 45

        if "oliva" in name_ascii and q_ascii == "aceite vegetal":
            score -= 20

    if q_ascii == "cilantro":
        if any(w in name_ascii for w in ["sazon", "salsa", "tostones"]):
            score -= 180

    if q_ascii in {"jalapeno", "jalapeño"}:
        if any(w in name_ascii for w in ["queso", "gouda", "cheddar", "chips", "salsa", "dip"]):
            score -= 250

    if q_ascii in {"limon", "limón"}:
        if any(w in name_ascii for w in ["limonada", "jugo", "bebida", "refresco"]):
            score -= 220

    
    if q_ascii == "arroz":
        if any(w in name_ascii for w in [
            "chocolate", "crispado", "crispy", "cereal", "barra",
            "galleta", "compota", "asopao", "sopa", "maggi", "postre"
        ]):
            score -= 350

        if "arroz" in name_ascii:
            score += 70

        if any(w in name_ascii for w in ["premium", "selecto", "campos", "lider", "rico"]):
            score += 15

    if q_ascii == "crema agria":
        if not any(w in name_ascii for w in ["crema", "sour", "agria"]):
            score -= 300

        if any(w in name_ascii for w in ["naranja", "limon", "jugo", "bebida"]):
            score -= 350

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
        requested = requested_qty if requested_qty > 0 else Decimal("1")
        packs = _ceil_decimal(requested / approx_pack)

        if packs < Decimal("1"):
            packs = Decimal("1")

        return (
            "package",
            packs,
            f"Se comprarán {int(packs)} {'paquete' if int(packs) == 1 else 'paquetes'} aprox. {approx_pack} lb c/u",
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
        if "empacad" in name or "paq" in name or "paquete" in name:
            return (
                "package",
                Decimal("1"),
                "Se comprará 1 paquete completo",
            )

    if has_weight:
        requested = requested_qty if requested_qty > 0 else Decimal("1")
        qty = _ceil_decimal(requested)

        if qty < Decimal("1"):
            qty = Decimal("1")

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


def _query_like_filters(product_name_expr, q: str):
    q_norm = _norm(q)
    q_ascii = _norm_ascii(q_norm)

    if _is_beef_query(q_ascii):
        return or_(
            CatalogProduct.name.ilike("%carne%res%"),
            SupermarketProduct.name_raw.ilike("%carne%res%"),

            CatalogProduct.name.ilike("%res%guisar%"),
            SupermarketProduct.name_raw.ilike("%res%guisar%"),

            CatalogProduct.name.ilike("%carne%guisar%"),
            SupermarketProduct.name_raw.ilike("%carne%guisar%"),

            CatalogProduct.name.ilike("%molida%res%"),
            SupermarketProduct.name_raw.ilike("%molida%res%"),

            CatalogProduct.name.ilike("%bistec%"),
            SupermarketProduct.name_raw.ilike("%bistec%"),

            CatalogProduct.name.ilike("%churrasco%"),
            SupermarketProduct.name_raw.ilike("%churrasco%"),
        )

    tokens = [t for t in _tokenize(q_norm) if len(t) >= 3]

    filters = [
        CatalogProduct.name.ilike(f"%{q_norm}%"),
        SupermarketProduct.name_raw.ilike(f"%{q_norm}%"),
    ]

    for token in tokens[:4]:
        filters.extend(
            [
                CatalogProduct.name.ilike(f"%{token}%"),
                SupermarketProduct.name_raw.ilike(f"%{token}%"),
            ]
        )

    return or_(*filters)


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
    q_ascii = _norm_ascii(q_norm)
    fetch_n = max(limit * 30, 200)

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
        .filter(_query_like_filters(product_name_expr, q))
        .filter(SupermarketProduct.status == "available")
        .filter(ProductInventory.in_stock == True)  # noqa: E712
        .filter(stock_ok)
        .order_by(SupermarketProductPrice.price.asc())
        .limit(fetch_n)
        .all()
    )

    candidates: list[tuple[int, Decimal, SearchOption]] = []

    for r in rows:
        product_name = str(r.product or "")

        if not _strict_required_match(q_norm, product_name):
            continue

        if not product_name:
            continue

        if _should_hard_exclude(q_norm, product_name):
            continue

        unit_price = Decimal(str(r.price))
        pricing_mode, purchase_qty, purchase_note = _infer_pricing(product_name, qty)

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

        # Si el score queda demasiado bajo, probablemente fue match por token suelto irrelevante.
        if score < -50:
            continue

        candidates.append((score, unit_price, opt))

    if not candidates:
        return []

    if cheapest_first and (q_norm in PREFER_CHEAP_QUERIES or q_ascii in {_norm_ascii(x) for x in PREFER_CHEAP_QUERIES}):
        max_score = max(score for score, _, _ in candidates)
        threshold = max_score - 25
        narrowed = [c for c in candidates if c[0] >= threshold]

        narrowed.sort(key=lambda x: (x[1], -x[0], x[2].product))
        return [c[2] for c in narrowed[:limit]]

    candidates.sort(key=lambda x: (-x[0], x[1], x[2].product))
    return [c[2] for c in candidates[:limit]]