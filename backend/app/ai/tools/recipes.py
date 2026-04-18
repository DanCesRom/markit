# backend/app/ai/tools/recipes.py
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from typing import Dict, List, Optional, TypedDict

from backend.app.ai.schemas import ParsedItem


def _d(value: str | int | float | Decimal) -> Decimal:
    if isinstance(value, Decimal):
        return value
    return Decimal(str(value))


def _round_qty(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


class RecipeIngredientDef(TypedDict):
    key: str
    display_name: str
    qty: str
    required: bool
    search_queries: List[str]


class RecipeDef(TypedDict):
    key: str
    display_name: str
    aliases: List[str]
    original_servings: int
    default_servings: int
    ingredients: List[RecipeIngredientDef]


RECIPE_CATALOG: Dict[str, RecipeDef] = {

    "sancocho": {
        "key": "sancocho",
        "display_name": "Sancocho dominicano",
        "aliases": ["sancocho", "sancocho dominicano"],
        "original_servings": 12,
        "default_servings": 4,
        "ingredients": [
            {"key": "carne_res", "display_name": "Carne de res", "qty": "0.333", "required": True, "search_queries": ["carne de res"]},
            {"key": "pollo", "display_name": "Pollo", "qty": "0.667", "required": True, "search_queries": ["pollo"]},
            {"key": "platano_verde", "display_name": "Plátano verde", "qty": "1", "required": True, "search_queries": ["plátano verde"]},
            {"key": "yuca", "display_name": "Yuca", "qty": "0.333", "required": True, "search_queries": ["yuca"]},
            {"key": "auyama", "display_name": "Auyama", "qty": "0.667", "required": True, "search_queries": ["auyama"]},
            {"key": "cebolla", "display_name": "Cebolla", "qty": "0.25", "required": True, "search_queries": ["cebolla"]},
            {"key": "ajo", "display_name": "Ajo", "qty": "0.25", "required": True, "search_queries": ["ajo"]},
        ],
    },

    "mangu": {
        "key": "mangu",
        "display_name": "Mangú",
        "aliases": ["mangú", "mangu"],
        "original_servings": 8,
        "default_servings": 2,
        "ingredients": [
            {"key": "platano_verde", "display_name": "Plátano verde", "qty": "0.75", "required": True, "search_queries": ["plátano verde"]},
            {"key": "aceite", "display_name": "Aceite", "qty": "0.25", "required": False, "search_queries": ["aceite"]},
            {"key": "cebolla", "display_name": "Cebolla", "qty": "0.25", "required": False, "search_queries": ["cebolla"]},
        ],
    },

    "habichuelas_con_dulce": {
        "key": "habichuelas_con_dulce",
        "display_name": "Habichuelas con dulce",
        "aliases": ["habichuelas con dulce"],
        "original_servings": 16,
        "default_servings": 6,
        "ingredients": [
            {"key": "habichuelas", "display_name": "Habichuelas rojas", "qty": "0.375", "required": True, "search_queries": ["habichuelas rojas"]},
            {"key": "leche", "display_name": "Leche evaporada", "qty": "0.75", "required": True, "search_queries": ["leche evaporada"]},
            {"key": "azucar", "display_name": "Azúcar", "qty": "0.188", "required": True, "search_queries": ["azúcar"]},
        ],
    },

    "moro_de_guandules_con_coco": {
        "key": "moro_de_guandules_con_coco",
        "display_name": "Moro de guandules con coco",
        "aliases": ["moro con coco", "moro de guandules"],
        "original_servings": 4,
        "default_servings": 4,
        "ingredients": [
            {"key": "arroz", "display_name": "Arroz", "qty": "0.25", "required": True, "search_queries": ["arroz"]},
            {"key": "guandules", "display_name": "Guandules", "qty": "1", "required": True, "search_queries": ["guandules"]},
            {"key": "aceite", "display_name": "Aceite", "qty": "0.5", "required": True, "search_queries": ["aceite"]},
        ],
    },

    # 🔥 FIXED
    "yaniqueques": {
        "key": "yaniqueques",
        "display_name": "Yaniqueques",
        "aliases": [
            "yaniqueca",
            "yaniquecas",
            "yaniqueques",
            "yanikeke",
        ],
        "original_servings": 4,
        "default_servings": 4,
        "ingredients": [
            {
                "key": "harina",
                "display_name": "Harina de trigo",
                "qty": "0.25",
                "required": True,
                "search_queries": ["harina de trigo", "harina"],
            },
            {
                "key": "sal",
                "display_name": "Sal",
                "qty": "0.05",
                "required": True,
                "search_queries": ["sal"],
            },
            {
                "key": "polvo_hornear",
                "display_name": "Polvo de hornear",
                "qty": "0.02",
                "required": False,
                "search_queries": ["polvo de hornear"],
            },
            {
                "key": "aceite",
                "display_name": "Aceite",
                "qty": "0.10",
                "required": True,
                "search_queries": ["aceite"],
            },
        ],
    },
}


def _normalize_recipe_name(name: str) -> str:
    return " ".join((name or "").strip().lower().split())


def find_recipe(recipe_name: str) -> Optional[RecipeDef]:
    target = _normalize_recipe_name(recipe_name)

    for recipe in RECIPE_CATALOG.values():
        if target == _normalize_recipe_name(recipe["key"]):
            return recipe

        if target == _normalize_recipe_name(recipe["display_name"]):
            return recipe

        for alias in recipe["aliases"]:
            if target == _normalize_recipe_name(alias):
                return recipe

    return None


def recipe_to_parsed_items(recipe: RecipeDef, servings: Optional[int] = None) -> List[ParsedItem]:
    target_servings = servings or recipe["default_servings"]
    factor = _d(target_servings) / _d(recipe["original_servings"])

    items: List[ParsedItem] = []

    for ingredient in recipe["ingredients"]:
        qty = _round_qty(_d(ingredient["qty"]) * factor)
        if qty <= 0:
            qty = Decimal("1")

        items.append(
            ParsedItem(
                query=ingredient["search_queries"][0],
                qty=qty,
            )
        )

    return items


def get_recipe_meta(recipe: RecipeDef, servings: Optional[int] = None) -> dict:
    target_servings = servings or recipe["default_servings"]

    return {
        "key": recipe["key"],
        "display_name": recipe["display_name"],
        "original_servings": recipe["original_servings"],
        "default_servings": recipe["default_servings"],
        "servings": target_servings,
    }