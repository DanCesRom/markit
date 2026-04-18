from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from decimal import Decimal
from typing import Optional, Tuple, Dict
from backend.app.ai.service import parse_text, _is_bad_match_for_query

from backend.app.core.database import get_db
from backend.app.api.deps import get_current_user
from backend.app.models.user import User
from backend.app.models.cart import Cart
from backend.app.models.cart_item import CartItem
from backend.app.models.supermarket_product import SupermarketProduct
from backend.app.models.supermarket_product_price import SupermarketProductPrice
from backend.app.models.supermarket import Supermarket

from backend.app.ai.schemas import (
    ParseQueryRequest,
    ParseQueryResponse,
    AISearchRequest,
    AISearchResponse,
    AIAddToCartRequest,
    AIAddToCartResponse,
    SearchItemResult,
    AddedLine,
    NotFoundLine,
    RecipeSearchRequest,
    RecipeSearchResponse,
    RecipeSearchSummary,
    RecipeIngredientResult,
    RecipeIngredientOption,
    RecipeAddToCartRequest,
    RecipeAddToCartResponse,
    RecipeAddToCartAddedLine,
    SmartSearchResponse,
    SmartSearchRecipeResponse,
    SmartSearchNormalResponse,
    SearchSuggestion,
    DebugUnderstandResponse,
    AIHealthResponse,
)
from backend.app.ai.service import parse_text
from backend.app.ai.tools.product_search import search_options
from backend.app.ai.tools.recipes import find_recipe
from backend.app.core.llm import openai_health, ping_openai

router = APIRouter(prefix="/ai", tags=["AI"])


def _to_decimal(v) -> Decimal:
    if v is None:
        return Decimal("0")
    if isinstance(v, Decimal):
        return v
    return Decimal(str(v))


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


def _build_normal_search_response(
    text: str,
    db: Session,
    limit_per_item: int,
) -> Tuple[AISearchResponse, Optional[Dict]]:
    intent, parsed_items, preferences, raw, recipe, suggestion = parse_text(text)

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
        suggestion,
    )


def _build_recipe_search_response(
    text: str,
    db: Session,
    limit_per_item: int,
    include_alternatives: bool = True,
) -> Tuple[RecipeSearchResponse, Optional[Dict]]:
    intent, parsed_items, preferences, raw, recipe, suggestion = parse_text(text)

    if intent != "recipe" or recipe is None:
        raise HTTPException(
            status_code=400,
            detail="The provided text was not recognized as a recipe request",
        )

    local_recipe_def = find_recipe(recipe.name)

    items_out = []
    estimated_total = Decimal("0")
    found_count = 0

    if local_recipe_def:
        ingredient_defs = local_recipe_def["ingredients"]
    else:
        ingredient_defs = []
        for idx, parsed_item in enumerate(parsed_items):
            ingredient_defs.append(
                {
                    "key": f"llm_{idx+1}",
                    "display_name": parsed_item.query.title(),
                    "search_queries": [parsed_item.query],
                    "required": True,
                }
            )

    for idx, ingredient_def in enumerate(ingredient_defs):
        parsed_item = parsed_items[idx] if idx < len(parsed_items) else None
        if not parsed_item:
            items_out.append(
                RecipeIngredientResult(
                    ingredient_key=ingredient_def["key"],
                    ingredient_name=ingredient_def["display_name"],
                    query=ingredient_def["search_queries"][0],
                    qty=Decimal("1"),
                    required=bool(ingredient_def.get("required", True)),
                    selected_option=None,
                    alternatives=[],
                    found=False,
                )
            )
            continue

        opts = search_options(
            db=db,
            query=parsed_item.query,
            qty=_to_decimal(parsed_item.qty),
            limit=limit_per_item * 3,
            cheapest_first=True,
        )

        opts = [
            opt for opt in opts
            if not _is_bad_match_for_query(parsed_item.query, opt.product)
        ][:limit_per_item]

        selected = opts[0] if opts else None
        alternatives = opts if include_alternatives else []

        if selected:
            found_count += 1
            estimated_total += selected.line_total

        items_out.append(
            RecipeIngredientResult(
                ingredient_key=ingredient_def["key"],
                ingredient_name=ingredient_def["display_name"],
                query=parsed_item.query,
                qty=_to_decimal(parsed_item.qty),
                required=bool(ingredient_def.get("required", True)),
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
        suggestion,
    )


@router.get("/health", response_model=AIHealthResponse)
def ai_health():
    health = openai_health()
    return AIHealthResponse(
        ai_router_ok=True,
        openai_configured=health["openai_configured"],
        openai_model=health["openai_model"],
        strategy="local_correction_then_recipe_bias_then_llm_recipe_generation",
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
    intent, _, _, _, recipe, suggestion = parse_text(payload.text)

    suggestion_obj = (
        SearchSuggestion(
            original=suggestion["original"],
            corrected=suggestion["corrected"],
        )
        if suggestion
        else None
    )

    if intent == "recipe" or recipe is not None:
        recipe_data, suggestion = _build_recipe_search_response(
            text=payload.text,
            db=db,
            limit_per_item=payload.limit_per_item,
            include_alternatives=payload.include_alternatives,
        )

        suggestion_obj = (
            SearchSuggestion(
                original=suggestion["original"],
                corrected=suggestion["corrected"],
            )
            if suggestion
            else suggestion_obj
        )

        return SmartSearchRecipeResponse(
            mode="recipe",
            suggestion=suggestion_obj,
            data=recipe_data,
        )

    normal_data, suggestion = _build_normal_search_response(
        text=payload.text,
        db=db,
        limit_per_item=payload.limit_per_item,
    )

    suggestion_obj = (
        SearchSuggestion(
            original=suggestion["original"],
            corrected=suggestion["corrected"],
        )
        if suggestion
        else suggestion_obj
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
    intent, parsed_items, preferences, raw, recipe, _ = parse_text(payload.text)
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