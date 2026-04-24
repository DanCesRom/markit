# backend/app/ai/router.py
from __future__ import annotations

from decimal import Decimal
from typing import Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.ai.schemas import (
    AIAddToCartRequest,
    AIAddToCartResponse,
    AIHealthResponse,
    AISearchRequest,
    AISearchResponse,
    AddedLine,
    DebugUnderstandResponse,
    NotFoundLine,
    ParseQueryRequest,
    ParseQueryResponse,
    RecipeAddToCartAddedLine,
    RecipeAddToCartRequest,
    RecipeAddToCartResponse,
    RecipeIngredientOption,
    RecipeIngredientResult,
    RecipeSearchRequest,
    RecipeSearchResponse,
    RecipeSearchSummary,
    SearchItemResult,
    SearchSuggestion,
    SmartSearchNormalResponse,
    SmartSearchRecipeResponse,
    SmartSearchResponse,
)
from backend.app.ai.service import parse_text
from backend.app.ai.tools.product_search import search_options
from backend.app.api.deps import get_current_user
from backend.app.core.database import get_db
from backend.app.core.llm import openai_health, ping_openai
from backend.app.models.cart import Cart
from backend.app.models.cart_item import CartItem
from backend.app.models.supermarket import Supermarket
from backend.app.models.supermarket_product import SupermarketProduct
from backend.app.models.supermarket_product_price import SupermarketProductPrice
from backend.app.models.user import User

router = APIRouter(prefix="/ai", tags=["AI"])

ParsedPayload = Tuple[str, list, object, str, object, Optional[dict]]


def _to_decimal(v) -> Decimal:
    if v is None:
        return Decimal("0")
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


def _suggestion_to_schema(suggestion: Optional[dict]) -> Optional[SearchSuggestion]:
    if not suggestion:
        return None

    original = str(suggestion.get("original") or "").strip()
    corrected = str(suggestion.get("corrected") or "").strip()

    if not original or not corrected:
        return None

    if original.lower() == corrected.lower():
        return None

    return SearchSuggestion(original=original, corrected=corrected)


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


def _ingredient_display_name(query: str) -> str:
    cleaned = str(query or "").strip()
    if not cleaned:
        return "Ingrediente"
    return cleaned[:1].upper() + cleaned[1:]


def _ingredient_key(query: str, idx: int) -> str:
    import re
    import unicodedata

    text = str(query or "").strip().lower()
    text = "".join(
        ch for ch in unicodedata.normalize("NFD", text)
        if unicodedata.category(ch) != "Mn"
    )
    text = re.sub(r"[^a-z0-9]+", "_", text).strip("_")
    return text or f"ingredient_{idx + 1}"


def _build_normal_search_response_from_parsed(
    parsed: ParsedPayload,
    db: Session,
    limit_per_item: int,
) -> Tuple[AISearchResponse, Optional[SearchSuggestion]]:
    intent, parsed_items, preferences, raw, recipe, suggestion = parsed

    item_results = []
    total_best = Decimal("0")

    for it in parsed_items:
        opts = search_options(
            db=db,
            query=it.query,
            qty=_to_decimal(it.qty),
            limit=limit_per_item,
            cheapest_first=True,
        )

        opts = opts[:limit_per_item]

        best = opts[0] if opts else None

        if best:
            total_best += best.line_total

        item_results.append(
            SearchItemResult(
                query=it.query,
                qty=_to_decimal(it.qty),
                options=opts,
                best_option=best,
            )
        )

    return (
        AISearchResponse(
            intent=intent,
            preferences=preferences,
            raw=raw,
            items=item_results,
            estimated_total_best=total_best,
            recipe=recipe,
        ),
        _suggestion_to_schema(suggestion),
    )


def _build_recipe_search_response_from_parsed(
    parsed: ParsedPayload,
    db: Session,
    limit_per_item: int,
    include_alternatives: bool = True,
) -> Tuple[RecipeSearchResponse, Optional[SearchSuggestion]]:
    intent, parsed_items, preferences, raw, recipe, suggestion = parsed

    if intent != "recipe" or recipe is None:
        raise HTTPException(
            status_code=400,
            detail="The provided text was not recognized as a recipe request",
        )

    items_out = []
    estimated_total = Decimal("0")
    found_count = 0

    for idx, parsed_item in enumerate(parsed_items):
        opts = search_options(
            db=db,
            query=parsed_item.query,
            qty=_to_decimal(parsed_item.qty),
            limit=limit_per_item * 3,
            cheapest_first=True,
        )

        opts = opts[:limit_per_item]

        selected = opts[0] if opts else None
        alternatives = opts if include_alternatives else []

        if selected:
            found_count += 1
            estimated_total += selected.line_total

        items_out.append(
            RecipeIngredientResult(
                ingredient_key=_ingredient_key(parsed_item.query, idx),
                ingredient_name=_ingredient_display_name(parsed_item.query),
                query=parsed_item.query,
                qty=_to_decimal(parsed_item.qty),
                required=True,
                selected_option=(
                    RecipeIngredientOption(**selected.model_dump()) if selected else None
                ),
                alternatives=[
                    RecipeIngredientOption(**opt.model_dump()) for opt in alternatives
                ],
                found=bool(selected),
            )
        )

    summary = RecipeSearchSummary(
        ingredients_total=len(items_out),
        ingredients_found=found_count,
        ingredients_missing=len(items_out) - found_count,
        estimated_total=estimated_total,
    )

    return (
        RecipeSearchResponse(
            intent="recipe",
            preferences=preferences,
            raw=raw,
            recipe=recipe,
            summary=summary,
            items=items_out,
        ),
        _suggestion_to_schema(suggestion),
    )


def _build_normal_search_response(
    text: str,
    db: Session,
    limit_per_item: int,
) -> Tuple[AISearchResponse, Optional[SearchSuggestion]]:
    parsed = parse_text(text)
    return _build_normal_search_response_from_parsed(
        parsed=parsed,
        db=db,
        limit_per_item=limit_per_item,
    )


def _build_recipe_search_response(
    text: str,
    db: Session,
    limit_per_item: int,
    include_alternatives: bool = True,
) -> Tuple[RecipeSearchResponse, Optional[SearchSuggestion]]:
    parsed = parse_text(text)
    return _build_recipe_search_response_from_parsed(
        parsed=parsed,
        db=db,
        limit_per_item=limit_per_item,
        include_alternatives=include_alternatives,
    )


@router.get("/health", response_model=AIHealthResponse)
def ai_health():
    health = openai_health()

    return AIHealthResponse(
        ai_router_ok=True,
        openai_configured=health["openai_configured"],
        openai_model=health["openai_model"],
        strategy="fast_product_search_then_recipe_modifiers_then_llm_fallback",
    )


@router.post("/ping-openai")
def ai_ping_openai():
    return ping_openai()


@router.post("/debug-understand", response_model=DebugUnderstandResponse)
def debug_understand(payload: ParseQueryRequest):
    health = openai_health()
    intent, items, preferences, raw, recipe, suggestion = parse_text(payload.text)

    return DebugUnderstandResponse(
        raw_text=payload.text,
        normalized_text=raw,
        corrected=bool(suggestion),
        correction_original=(suggestion or {}).get("original"),
        correction_corrected=(suggestion or {}).get("corrected"),
        final_intent=intent,
        recipe_name=recipe.name if recipe else None,
        servings=recipe.servings if recipe else None,
        llm_used=(recipe.source == "llm") if recipe else False,
        openai_ok=health["openai_configured"],
    )


@router.post("/parse-query", response_model=ParseQueryResponse)
def parse_query(payload: ParseQueryRequest):
    intent, items, preferences, raw, recipe, _ = parse_text(payload.text)

    return ParseQueryResponse(
        intent=intent,
        items=items,
        preferences=preferences,
        raw=raw,
        recipe=recipe,
    )


@router.post("/search", response_model=AISearchResponse)
def ai_search(payload: AISearchRequest, db: Session = Depends(get_db)):
    response, _ = _build_normal_search_response(
        text=payload.text,
        db=db,
        limit_per_item=payload.limit_per_item,
    )
    return response


@router.post("/recipe-search", response_model=RecipeSearchResponse)
def recipe_search(payload: RecipeSearchRequest, db: Session = Depends(get_db)):
    response, _ = _build_recipe_search_response(
        text=payload.text,
        db=db,
        limit_per_item=payload.limit_per_item,
        include_alternatives=payload.include_alternatives,
    )
    return response


@router.post("/search-smart", response_model=SmartSearchResponse)
def search_smart(payload: RecipeSearchRequest, db: Session = Depends(get_db)):
    parsed = parse_text(payload.text)
    intent, _, _, _, recipe, _ = parsed

    if intent == "recipe" or recipe is not None:
        recipe_data, suggestion_obj = _build_recipe_search_response_from_parsed(
            parsed=parsed,
            db=db,
            limit_per_item=payload.limit_per_item,
            include_alternatives=payload.include_alternatives,
        )

        return SmartSearchRecipeResponse(
            mode="recipe",
            suggestion=suggestion_obj,
            data=recipe_data,
        )

    normal_data, suggestion_obj = _build_normal_search_response_from_parsed(
        parsed=parsed,
        db=db,
        limit_per_item=payload.limit_per_item,
    )

    return SmartSearchNormalResponse(
        mode="normal",
        suggestion=suggestion_obj,
        data=normal_data,
    )


@router.post("/add-to-cart", response_model=AIAddToCartResponse)
def ai_add_to_cart(
    payload: AIAddToCartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    parsed = parse_text(payload.text)
    intent, parsed_items, preferences, raw, recipe, _ = parsed

    cart = _get_or_create_active_cart(db, user_id=current_user.id)

    added = []
    not_found = []
    total_added = Decimal("0")

    for it in parsed_items:
        opts = search_options(
            db=db,
            query=it.query,
            qty=_to_decimal(it.qty),
            limit=payload.limit_per_item,
            cheapest_first=True,
        )

        opts = opts[:limit_per_item]

        best = opts[0] if opts else None

        if not best:
            not_found.append(
                NotFoundLine(
                    query=it.query,
                    qty=_to_decimal(it.qty),
                    reason="no_match",
                )
            )
            continue

        price_row = (
            db.query(SupermarketProductPrice)
            .filter(SupermarketProductPrice.supermarket_product_id == best.supermarket_product_id)
            .first()
        )

        unit_price = _to_decimal(price_row.price) if price_row else best.unit_price
        cart_qty = best.purchase_qty

        existing = (
            db.query(CartItem)
            .filter(
                CartItem.cart_id == cart.id,
                CartItem.supermarket_product_id == best.supermarket_product_id,
            )
            .first()
        )

        if existing:
            existing.quantity = _to_decimal(existing.quantity) + cart_qty
            existing.unit_price = unit_price
        else:
            db.add(
                CartItem(
                    cart_id=cart.id,
                    supermarket_product_id=best.supermarket_product_id,
                    quantity=cart_qty,
                    unit_price=unit_price,
                )
            )

        line_total = best.line_total
        total_added += line_total

        added.append(
            AddedLine(
                query=it.query,
                qty=cart_qty,
                supermarket_product_id=best.supermarket_product_id,
                product=best.product,
                supermarket=best.supermarket,
                unit_price=unit_price,
                currency=best.currency,
                line_total=line_total,
                pricing_mode=best.pricing_mode,
                purchase_note=best.purchase_note,
            )
        )

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


@router.post("/recipe-add-to-cart", response_model=RecipeAddToCartResponse)
def recipe_add_to_cart(
    payload: RecipeAddToCartRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cart = _get_or_create_active_cart(db, user_id=current_user.id)

    added = []
    total_added = Decimal("0")

    for sel in payload.selections:
        supermarket_product = (
            db.query(SupermarketProduct)
            .filter(SupermarketProduct.id == sel.supermarket_product_id)
            .first()
        )

        if not supermarket_product:
            raise HTTPException(
                status_code=404,
                detail=f"Product not found for supermarket_product_id={sel.supermarket_product_id}",
            )

        supermarket = (
            db.query(Supermarket)
            .filter(Supermarket.id == supermarket_product.supermarket_id)
            .first()
        )

        price_row = (
            db.query(SupermarketProductPrice)
            .filter(SupermarketProductPrice.supermarket_product_id == supermarket_product.id)
            .first()
        )

        if not price_row:
            raise HTTPException(
                status_code=409,
                detail=f"Price not available for supermarket_product_id={sel.supermarket_product_id}",
            )

        unit_price = _to_decimal(price_row.price)
        qty = _to_decimal(sel.qty)

        existing = (
            db.query(CartItem)
            .filter(
                CartItem.cart_id == cart.id,
                CartItem.supermarket_product_id == supermarket_product.id,
            )
            .first()
        )

        if existing:
            existing.quantity = _to_decimal(existing.quantity) + qty
            existing.unit_price = unit_price
        else:
            db.add(
                CartItem(
                    cart_id=cart.id,
                    supermarket_product_id=supermarket_product.id,
                    quantity=qty,
                    unit_price=unit_price,
                )
            )

        line_total = unit_price * qty
        total_added += line_total

        added.append(
            RecipeAddToCartAddedLine(
                ingredient_key=sel.ingredient_key,
                ingredient_name=sel.ingredient_name,
                qty=qty,
                supermarket_product_id=supermarket_product.id,
                product=supermarket_product.name_raw,
                supermarket=supermarket.name if supermarket else "Supermercado",
                unit_price=unit_price,
                currency=price_row.currency or "DOP",
                line_total=line_total,
            )
        )

    db.commit()

    return RecipeAddToCartResponse(
        recipe_name=payload.recipe_name,
        servings=payload.servings,
        added=added,
        estimated_total_added=total_added,
    )