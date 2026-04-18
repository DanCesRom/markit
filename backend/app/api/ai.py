# backend/app/api/ai.py
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from typing import List, Tuple, Optional, Dict
import re
from decimal import Decimal

from sqlalchemy.orm import Session

from backend.app.core.database import get_db
from backend.app.core.llm import parse_query_with_llm

from backend.app.models.catalog_product import CatalogProduct
from backend.app.models.supermarket_product import SupermarketProduct
from backend.app.models.product_inventory import ProductInventory
from backend.app.models.supermarket import Supermarket

from backend.app.models.cart import Cart
from backend.app.models.cart_item import CartItem

from backend.app.api.deps import get_current_user
from backend.app.models.user import User

router = APIRouter(prefix="/ai", tags=["AI"])


# =========================
# Schemas
# =========================
class Preferences(BaseModel):
    cheapest: bool = False
    delivery: bool = False
    pickup: bool = False


class RecipeMeta(BaseModel):
    name: str
    servings: int = 1
    source: str = "heuristic"  # heuristic | llm
    needs_confirmation: bool = False


class ParseQueryRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=300)


class ParsedItem(BaseModel):
    query: str
    qty: int = 1


class ParseQueryResponse(BaseModel):
    intent: str
    items: List[ParsedItem]
    preferences: Preferences = Preferences()
    raw: str
    recipe: Optional[RecipeMeta] = None


class AISearchRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=300)
    limit_per_item: int = Field(5, ge=1, le=20)


class SearchOption(BaseModel):
    product: str
    supermarket: str
    supermarket_id: int
    supermarket_product_id: int
    unit_price: Decimal
    stock: int
    qty: int
    line_total: Decimal


class SearchItemResult(BaseModel):
    query: str
    qty: int
    options: List[SearchOption]
    best_option: Optional[SearchOption] = None


class AISearchResponse(BaseModel):
    intent: str
    preferences: Preferences
    raw: str
    items: List[SearchItemResult]
    estimated_total_best: Decimal
    recipe: Optional[RecipeMeta] = None


class AIAddToCartRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=300)
    limit_per_item: int = Field(5, ge=1, le=20)


class AddedLine(BaseModel):
    query: str
    qty: int
    supermarket_product_id: int
    product: str
    supermarket: str
    unit_price: Decimal
    line_total: Decimal


class NotFoundLine(BaseModel):
    query: str
    qty: int
    reason: str = "no_match"


class AIAddToCartResponse(BaseModel):
    intent: str
    preferences: Preferences
    raw: str
    added: List[AddedLine]
    not_found: List[NotFoundLine]
    estimated_total_added: Decimal
    recipe: Optional[RecipeMeta] = None


# =========================
# Recipe catalog (MVP)
# =========================
RECIPE_CATALOG: Dict[str, List[ParsedItem]] = {
    "sancocho": [
        ParsedItem(query="pollo", qty=1),
        ParsedItem(query="carne de res", qty=1),
        ParsedItem(query="yuca", qty=1),
        ParsedItem(query="plátano verde", qty=2),
        ParsedItem(query="auyama", qty=1),
        ParsedItem(query="yautía", qty=1),
        ParsedItem(query="cebolla", qty=1),
        ParsedItem(query="ajo", qty=1),
        ParsedItem(query="cilantro", qty=1),
        ParsedItem(query="orégano", qty=1),
        ParsedItem(query="sal", qty=1),
    ],
    "mangú": [
        ParsedItem(query="plátano verde", qty=6),
        ParsedItem(query="cebolla", qty=2),
        ParsedItem(query="mantequilla", qty=1),
        ParsedItem(query="sal", qty=1),
    ],
}


# =========================
# Helpers (parse)
# =========================
def _normalize_text(t: str) -> str:
    t = (t or "").strip()
    t = re.sub(r"\s+", " ", t)
    return t


def _strip_prefix_phrases(q: str) -> str:
    q = _normalize_text(q)

    # quita frases típicas al inicio
    q = re.sub(
        r"^(necesito|quiero|quisiera|dame|me\s+das|por\s+favor|porfa|favor|agrega|añade|anade|add|pon)\s+",
        "",
        q,
        flags=re.IGNORECASE,
    ).strip()

    # quita “al carrito” / “en el carrito”
    q = re.sub(r"\b(al|en)\s+carrito\b", "", q, flags=re.IGNORECASE).strip()

    return _normalize_text(q)


def _strip_cheapest_suffix(q: str) -> str:
    q = _normalize_text(q)
    # cubre: mas barato / más baratas / mas baratos / mejor precio...
    q = re.sub(
        r"\s*(lo\s+m(a|á)s\s+barat[oa]s?|m(a|á)s\s+barat[oa]s?|mejor\s+precio|barat[oa]s?)\s*$",
        "",
        q,
        flags=re.IGNORECASE,
    ).strip()
    return _normalize_text(q)


def _strip_leading_articles(q: str) -> str:
    q = _normalize_text(q)
    q = re.sub(r"^(de\s+)?(las|los|la|el|unos|unas|un|una)\s+", "", q, flags=re.IGNORECASE).strip()
    return _normalize_text(q)


def _extract_qty(segment: str) -> Tuple[str, int]:
    s = _normalize_text(segment)

    # patrones tipo "x 4" / "4 x"
    m = re.search(r"\bx\s*(\d+)\b", s, flags=re.IGNORECASE)
    if m:
        qty = int(m.group(1))
        s = re.sub(r"\bx\s*\d+\b", "", s, flags=re.IGNORECASE).strip()
        return s, max(qty, 1)

    m = re.search(r"\b(\d+)\s*x\b", s, flags=re.IGNORECASE)
    if m:
        qty = int(m.group(1))
        s = re.sub(r"\b\d+\s*x\b", "", s, flags=re.IGNORECASE).strip()
        return s, max(qty, 1)

    # "4 unidades"
    m = re.search(r"\b(\d+)\s*(unidades|unidad|uds|ud|unit)\b", s, flags=re.IGNORECASE)
    if m:
        qty = int(m.group(1))
        s = re.sub(r"\b\d+\s*(unidades|unidad|uds|ud|unit)\b", "", s, flags=re.IGNORECASE).strip()
        return s, max(qty, 1)

    # ✅ NUEVO: "4 manzanas" / "4 de las manzanas"
    m = re.match(r"^\s*(\d+)\s+(.+)$", s)
    if m:
        qty = int(m.group(1))
        rest = m.group(2).strip()
        rest = re.sub(r"^(de\s+)?(las|los|la|el)\s+", "", rest, flags=re.IGNORECASE).strip()
        return rest, max(qty, 1)

    # ✅ NUEVO: "quiero 4 de las manzanas..." (por si llega sin limpiar)
    m = re.search(r"\b(\d+)\b\s*(de\s+)?(las|los|la|el)?\s*(.+)$", s, flags=re.IGNORECASE)
    if m and m.group(4):
        qty = int(m.group(1))
        rest = m.group(4).strip()
        return rest, max(qty, 1)

    return s, 1


def _split_items(text: str) -> List[str]:
    t = f" {text.strip()} "
    t = t.replace(";", ",")
    parts: List[str] = []

    for chunk in t.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue
        sub = re.split(r"\s+y\s+|\s+con\s+", chunk, flags=re.IGNORECASE)
        for s in sub:
            s = s.strip()
            if s:
                parts.append(s)

    return parts


def _clean_query_phrase(q: str) -> str:
    q = _strip_prefix_phrases(q)
    q = _strip_cheapest_suffix(q)
    q = _strip_leading_articles(q)
    return _normalize_text(q)


def _filter_and_sanitize_items(items: List[ParsedItem]) -> List[ParsedItem]:
    banned_exact = {
        "lo más barato",
        "lo mas barato",
        "más barato",
        "mas barato",
        "mejor precio",
        "barato",
        "barata",
        "baratos",
        "baratas",
        "ingredientes",
    }

    filtered: List[ParsedItem] = []
    for it in items:
        cleaned = _clean_query_phrase(it.query)
        cleaned_low = cleaned.lower()

        if not cleaned or cleaned_low in banned_exact:
            continue

        filtered.append(ParsedItem(query=cleaned, qty=max(int(it.qty), 1)))

    return filtered


def _looks_like_recipe_request(raw_low: str) -> bool:
    triggers = [
        "ingredientes para",
        "ingredientes de",
        "quiero hacer",
        "quisiera hacer",
        "cómo hago",
        "como hago",
        "receta de",
        "receta para",
        "para hacer",
        "cocinar",
        "preparar",
    ]
    return any(t in raw_low for t in triggers)


def _extract_servings(raw_low: str) -> int:
    m = re.search(r"\bpara\s+(\d+)\s*(personas|porciones|personas?)?\b", raw_low)
    if m:
        return max(int(m.group(1)), 1)

    m = re.search(r"\bx\s*(\d+)\s*(personas|porciones)?\b", raw_low)
    if m:
        return max(int(m.group(1)), 1)

    return 1


def _extract_recipe_name(raw: str) -> str:
    m = re.search(r"(ingredientes\s+para|ingredientes\s+de)\s+(.+)$", raw, flags=re.IGNORECASE)
    if m:
        name = m.group(2)
        name = re.sub(r"\bpara\s+\d+\b.*$", "", name, flags=re.IGNORECASE).strip()
        name = re.sub(r"(lo\s+m(a|á)s\s+barat[oa]s?|mejor\s+precio|barat[oa]s?)\b.*$", "", name, flags=re.IGNORECASE).strip()
        return _normalize_text(name)

    m = re.search(r"(quiero|quisiera)\s+hacer\s+(.+)$", raw, flags=re.IGNORECASE)
    if m:
        name = m.group(2)
        name = re.sub(r"\bpara\s+\d+\b.*$", "", name, flags=re.IGNORECASE).strip()
        name = re.sub(r"(lo\s+m(a|á)s\s+barat[oa]s?|mejor\s+precio|barat[oa]s?)\b.*$", "", name, flags=re.IGNORECASE).strip()
        return _normalize_text(name)

    m = re.search(r"(receta\s+de|receta\s+para)\s+(.+)$", raw, flags=re.IGNORECASE)
    if m:
        name = m.group(2)
        name = re.sub(r"\bpara\s+\d+\b.*$", "", name, flags=re.IGNORECASE).strip()
        name = re.sub(r"(lo\s+m(a|á)s\s+barat[oa]s?|mejor\s+precio|barat[oa]s?)\b.*$", "", name, flags=re.IGNORECASE).strip()
        return _normalize_text(name)

    return _normalize_text(raw)


def _scale_recipe(items: List[ParsedItem], servings: int) -> List[ParsedItem]:
    if servings <= 1:
        return items
    scaled: List[ParsedItem] = []
    for it in items:
        scaled.append(ParsedItem(query=it.query, qty=max(int(it.qty) * servings, 1)))
    return scaled


def _parse(payload_text: str) -> Tuple[str, List[ParsedItem], Preferences, str, Optional[RecipeMeta]]:
    raw = _normalize_text(payload_text)
    low = raw.lower()

    # ✅ Mejor detección cheapest
    cheapest = bool(
        re.search(r"\b(barat[oa]s?)\b", low) or re.search(r"\bm(a|á)s\s+barat[oa]s?\b", low) or ("mejor precio" in low)
    )

    preferences = Preferences(
        cheapest=cheapest,
        delivery=("delivery" in low or "domicilio" in low),
        pickup=("pickup" in low or "recoger" in low),
    )

    # =========================
    # 0) Recipe detection first
    # =========================
    if _looks_like_recipe_request(low):
        servings = _extract_servings(low)
        recipe_name = _extract_recipe_name(raw)
        key = recipe_name.lower().strip()

        if key in RECIPE_CATALOG:
            items = _scale_recipe(RECIPE_CATALOG[key], servings)
            items = _filter_and_sanitize_items(items)
            recipe = RecipeMeta(name=recipe_name, servings=servings, source="heuristic", needs_confirmation=False)
            return "recipe", items, preferences, raw, recipe

        try:
            llm_text = f"Ingredientes para {recipe_name} para {servings} personas"
            data = parse_query_with_llm(llm_text)

            items = [ParsedItem(query=i["query"], qty=int(i.get("qty", 1))) for i in data.get("items", [])]
            items = _filter_and_sanitize_items(items)

            recipe = RecipeMeta(name=recipe_name, servings=servings, source="llm", needs_confirmation=True)
            return "recipe", items, preferences, raw, recipe
        except Exception:
            recipe = RecipeMeta(name=recipe_name, servings=servings, source="heuristic", needs_confirmation=True)
            return "recipe", [], preferences, raw, recipe

    # =========================
    # 1) Try LLM (non-recipe)
    # =========================
    try:
        data = parse_query_with_llm(raw)
        items = [ParsedItem(query=i["query"], qty=int(i.get("qty", 1))) for i in data["items"]]
        items = _filter_and_sanitize_items(items)
        if not items:
            raise ValueError("LLM returned only non-product items")

        prefs = data.get("preferences") or {}
        preferences = Preferences(
            cheapest=bool(prefs.get("cheapest", preferences.cheapest)),
            delivery=bool(prefs.get("delivery", preferences.delivery)),
            pickup=bool(prefs.get("pickup", preferences.pickup)),
        )

        return data["intent"], items, preferences, raw, None
    except Exception:
        pass

    # =========================
    # 2) Heuristic fallback (non-recipe)
    # =========================
    intent = "search"
    if any(w in low for w in ["agrega", "añade", "anade", "add", "poner en carrito", "carrito"]):
        intent = "add_to_cart"
    if any(w in low for w in ["comparar", "mejor precio", "más barato", "mas barato", "barato", "barata", "baratos", "baratas"]):
        intent = "best_price"

    segments = _split_items(raw)
    items2: List[ParsedItem] = []

    for seg in segments:
        seg2 = _strip_prefix_phrases(seg)
        seg2 = _strip_cheapest_suffix(seg2)

        cleaned, qty = _extract_qty(seg2)
        cleaned = _strip_leading_articles(cleaned)
        cleaned = _normalize_text(cleaned)

        if cleaned:
            items2.append(ParsedItem(query=cleaned, qty=qty))

    items2 = _filter_and_sanitize_items(items2)

    if not items2:
        # fallback final: limpia raw entero y vuelve a intentar qty
        seg2 = _strip_prefix_phrases(raw)
        seg2 = _strip_cheapest_suffix(seg2)
        cleaned, qty = _extract_qty(seg2)
        cleaned = _strip_leading_articles(cleaned)
        cleaned = _normalize_text(cleaned)
        if cleaned:
            items2 = [ParsedItem(query=cleaned, qty=qty)]
        else:
            items2 = [ParsedItem(query=_normalize_text(raw), qty=1)]

    return intent, items2, preferences, raw, None


# =========================
# Endpoints
# =========================
@router.post("/parse-query", response_model=ParseQueryResponse)
def parse_query(payload: ParseQueryRequest):
    intent, items, preferences, raw, recipe = _parse(payload.text)
    return ParseQueryResponse(intent=intent, items=items, preferences=preferences, raw=raw, recipe=recipe)


def _db_search_options(db: Session, query: str, qty: int, limit: int) -> List[SearchOption]:
    rows = (
        db.query(
            CatalogProduct.name.label("product"),
            Supermarket.name.label("supermarket"),
            Supermarket.id.label("supermarket_id"),
            SupermarketProduct.id.label("supermarket_product_id"),
            SupermarketProduct.price.label("price"),
            ProductInventory.stock.label("stock"),
        )
        .join(SupermarketProduct, SupermarketProduct.catalog_product_id == CatalogProduct.id)
        .join(Supermarket, Supermarket.id == SupermarketProduct.supermarket_id)
        .join(ProductInventory, ProductInventory.supermarket_product_id == SupermarketProduct.id)
        .filter(CatalogProduct.name.ilike(f"%{query}%"))
        .filter(SupermarketProduct.status == "available")
        .filter(ProductInventory.stock > 0)
        .order_by(SupermarketProduct.price.asc())
        .limit(limit)
        .all()
    )

    options: List[SearchOption] = []
    for r in rows:
        unit_price = Decimal(str(r.price))
        line_total = unit_price * Decimal(qty)
        options.append(
            SearchOption(
                product=r.product,
                supermarket=r.supermarket,
                supermarket_id=int(r.supermarket_id),
                supermarket_product_id=int(r.supermarket_product_id),
                unit_price=unit_price,
                stock=int(r.stock),
                qty=int(qty),
                line_total=line_total,
            )
        )
    return options


@router.post("/search", response_model=AISearchResponse)
def ai_search(payload: AISearchRequest, db: Session = Depends(get_db)):
    intent, parsed_items, preferences, raw, recipe = _parse(payload.text)

    item_results: List[SearchItemResult] = []
    total_best = Decimal("0")

    for it in parsed_items:
        options = _db_search_options(db, query=it.query, qty=it.qty, limit=payload.limit_per_item)
        best = options[0] if options else None
        if best:
            total_best += best.line_total

        item_results.append(
            SearchItemResult(
                query=it.query,
                qty=it.qty,
                options=options,
                best_option=best,
            )
        )

    return AISearchResponse(
        intent=intent,
        preferences=preferences,
        raw=raw,
        items=item_results,
        estimated_total_best=total_best,
        recipe=recipe,
    )


def _get_or_create_active_cart(db: Session, user_id: int) -> Cart:
    cart = (
        db.query(Cart)
        .filter(Cart.user_id == user_id, Cart.status == "active")
        .first()
    )
    if cart:
        return cart

    cart = Cart(user_id=user_id)
    db.add(cart)
    db.commit()
    db.refresh(cart)
    return cart


def _add_supermarket_product_to_cart(
    db: Session,
    cart_id: int,
    supermarket_product_id: int,
    qty: int,
    unit_price: Decimal,
):
    existing = (
        db.query(CartItem)
        .filter(
            CartItem.cart_id == cart_id,
            CartItem.supermarket_product_id == supermarket_product_id,
        )
        .first()
    )

    if existing:
        existing.quantity += qty
    else:
        db.add(
            CartItem(
                cart_id=cart_id,
                supermarket_product_id=supermarket_product_id,
                quantity=qty,
                unit_price=unit_price,
            )
        )


@router.post("/add-to-cart", response_model=AIAddToCartResponse)
def ai_add_to_cart(
    payload: AIAddToCartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    intent, parsed_items, preferences, raw, recipe = _parse(payload.text)

    cart = _get_or_create_active_cart(db, user_id=current_user.id)

    added: List[AddedLine] = []
    not_found: List[NotFoundLine] = []
    total_added = Decimal("0")

    for it in parsed_items:
        options = _db_search_options(db, query=it.query, qty=it.qty, limit=payload.limit_per_item)
        best = options[0] if options else None

        if not best:
            not_found.append(NotFoundLine(query=it.query, qty=it.qty, reason="no_match"))
            continue

        _add_supermarket_product_to_cart(
            db=db,
            cart_id=cart.id,
            supermarket_product_id=best.supermarket_product_id,
            qty=it.qty,
            unit_price=best.unit_price,
        )

        added.append(
            AddedLine(
                query=it.query,
                qty=it.qty,
                supermarket_product_id=best.supermarket_product_id,
                product=best.product,
                supermarket=best.supermarket,
                unit_price=best.unit_price,
                line_total=best.line_total,
            )
        )
        total_added += best.line_total

    db.commit()

    return AIAddToCartResponse(
        intent=intent,
        preferences=preferences,
        raw=raw,
        added=added,
        not_found=not_found,
        estimated_total_added=total_added,
        recipe=recipe,
    )