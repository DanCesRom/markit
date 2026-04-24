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
        "aliases": [
            "sancocho",
            "sancocho dominicano",
            "sancocho criollo",
            "sanchocho",
            "sancoho",
        ],
        "original_servings": 12,
        "default_servings": 4,
        "ingredients": [
            {
                "key": "carne_res",
                "display_name": "Carne de res",
                "qty": "1",
                "required": True,
                "search_queries": ["carne de res para guisar"],
            },
            {
                "key": "pollo",
                "display_name": "Pollo",
                "qty": "2",
                "required": True,
                "search_queries": ["pollo"],
            },
            {
                "key": "platano_verde",
                "display_name": "Plátano verde",
                "qty": "3",
                "required": True,
                "search_queries": ["plátano verde"],
            },
            {
                "key": "yuca",
                "display_name": "Yuca",
                "qty": "1",
                "required": True,
                "search_queries": ["yuca"],
            },
            {
                "key": "auyama",
                "display_name": "Auyama",
                "qty": "2",
                "required": True,
                "search_queries": ["auyama"],
            },
            {
                "key": "yautia",
                "display_name": "Yautía",
                "qty": "1",
                "required": False,
                "search_queries": ["yautía", "yautia"],
            },
            {
                "key": "mazorca",
                "display_name": "Mazorca",
                "qty": "2",
                "required": False,
                "search_queries": ["mazorca"],
            },
            {
                "key": "cebolla",
                "display_name": "Cebolla",
                "qty": "1",
                "required": True,
                "search_queries": ["cebolla"],
            },
            {
                "key": "ajo",
                "display_name": "Ajo",
                "qty": "1",
                "required": True,
                "search_queries": ["ajo"],
            },
            {
                "key": "aji_cubanela",
                "display_name": "Ají cubanela",
                "qty": "1",
                "required": False,
                "search_queries": ["aji cubanela", "ají cubanela"],
            },
            {
                "key": "cilantro",
                "display_name": "Cilantro",
                "qty": "0.25",
                "required": True,
                "search_queries": ["cilantro"],
            },
            {
                "key": "oregano",
                "display_name": "Orégano",
                "qty": "0.10",
                "required": False,
                "search_queries": ["orégano", "oregano"],
            },
            {
                "key": "sal",
                "display_name": "Sal",
                "qty": "0.20",
                "required": True,
                "search_queries": ["sal"],
            },
        ],
    },

    "mangu": {
        "key": "mangu",
        "display_name": "Mangú",
        "aliases": [
            "mangú",
            "mangu",
            "mango dominicano",
            "mangu dominicano",
        ],
        "original_servings": 8,
        "default_servings": 2,
        "ingredients": [
            {
                "key": "platano_verde",
                "display_name": "Plátano verde",
                "qty": "6",
                "required": True,
                "search_queries": ["plátano verde"],
            },
            {
                "key": "cebolla",
                "display_name": "Cebolla",
                "qty": "1",
                "required": False,
                "search_queries": ["cebolla"],
            },
            {
                "key": "mantequilla",
                "display_name": "Mantequilla",
                "qty": "1",
                "required": False,
                "search_queries": ["mantequilla"],
            },
            {
                "key": "aceite",
                "display_name": "Aceite vegetal",
                "qty": "1",
                "required": False,
                "search_queries": ["aceite vegetal", "aceite"],
            },
            {
                "key": "sal",
                "display_name": "Sal",
                "qty": "1",
                "required": True,
                "search_queries": ["sal"],
            },
        ],
    },

    "mangu_tres_golpes": {
        "key": "mangu_tres_golpes",
        "display_name": "Mangú con los tres golpes",
        "aliases": [
            "mangu con los tres golpes",
            "mangú con los tres golpes",
            "tres golpes",
            "mangu tres golpes",
            "mangú tres golpes",
        ],
        "original_servings": 4,
        "default_servings": 4,
        "ingredients": [
            {
                "key": "platano_verde",
                "display_name": "Plátano verde",
                "qty": "6",
                "required": True,
                "search_queries": ["plátano verde"],
            },
            {
                "key": "salami",
                "display_name": "Salami",
                "qty": "1",
                "required": True,
                "search_queries": ["salami"],
            },
            {
                "key": "queso_freir",
                "display_name": "Queso de freír",
                "qty": "1",
                "required": True,
                "search_queries": ["queso de freir", "queso de freír"],
            },
            {
                "key": "huevo",
                "display_name": "Huevos",
                "qty": "4",
                "required": True,
                "search_queries": ["huevos"],
            },
            {
                "key": "cebolla",
                "display_name": "Cebolla",
                "qty": "1",
                "required": False,
                "search_queries": ["cebolla"],
            },
            {
                "key": "aceite",
                "display_name": "Aceite vegetal",
                "qty": "1",
                "required": True,
                "search_queries": ["aceite vegetal", "aceite"],
            },
        ],
    },

    "habichuelas_con_dulce": {
        "key": "habichuelas_con_dulce",
        "display_name": "Habichuelas con dulce",
        "aliases": [
            "habichuelas con dulce",
            "habichuela con dulce",
            "habichuelas dulces",
        ],
        "original_servings": 16,
        "default_servings": 6,
        "ingredients": [
            {
                "key": "habichuelas_rojas",
                "display_name": "Habichuelas rojas",
                "qty": "1",
                "required": True,
                "search_queries": ["habichuelas rojas"],
            },
            {
                "key": "leche_evaporada",
                "display_name": "Leche evaporada",
                "qty": "3",
                "required": True,
                "search_queries": ["leche evaporada"],
            },
            {
                "key": "leche_coco",
                "display_name": "Leche de coco",
                "qty": "2",
                "required": True,
                "search_queries": ["leche de coco"],
            },
            {
                "key": "azucar",
                "display_name": "Azúcar",
                "qty": "1",
                "required": True,
                "search_queries": ["azúcar", "azucar"],
            },
            {
                "key": "batata",
                "display_name": "Batata",
                "qty": "2",
                "required": True,
                "search_queries": ["batata"],
            },
            {
                "key": "canela",
                "display_name": "Canela",
                "qty": "1",
                "required": True,
                "search_queries": ["canela"],
            },
            {
                "key": "galletas_leche",
                "display_name": "Galletas de leche",
                "qty": "1",
                "required": False,
                "search_queries": ["galletas de leche"],
            },
        ],
    },

    "moro_de_guandules_con_coco": {
        "key": "moro_de_guandules_con_coco",
        "display_name": "Moro de guandules con coco",
        "aliases": [
            "moro con coco",
            "moro de guandules",
            "moro de guandules con coco",
            "arroz con guandules",
        ],
        "original_servings": 4,
        "default_servings": 4,
        "ingredients": [
            {
                "key": "arroz",
                "display_name": "Arroz",
                "qty": "1",
                "required": True,
                "search_queries": ["arroz"],
            },
            {
                "key": "guandules",
                "display_name": "Guandules",
                "qty": "1",
                "required": True,
                "search_queries": ["guandules"],
            },
            {
                "key": "leche_coco",
                "display_name": "Leche de coco",
                "qty": "1",
                "required": True,
                "search_queries": ["leche de coco"],
            },
            {
                "key": "cebolla",
                "display_name": "Cebolla",
                "qty": "1",
                "required": False,
                "search_queries": ["cebolla"],
            },
            {
                "key": "ajo",
                "display_name": "Ajo",
                "qty": "1",
                "required": False,
                "search_queries": ["ajo"],
            },
            {
                "key": "aceite",
                "display_name": "Aceite vegetal",
                "qty": "1",
                "required": True,
                "search_queries": ["aceite vegetal", "aceite"],
            },
        ],
    },

    "yaniqueques": {
        "key": "yaniqueques",
        "display_name": "Yaniqueques",
        "aliases": [
            "yaniqueca",
            "yaniquecas",
            "yaniqueques",
            "yanikeke",
            "yaniqueque",
        ],
        "original_servings": 4,
        "default_servings": 4,
        "ingredients": [
            {
                "key": "harina_trigo",
                "display_name": "Harina de trigo",
                "qty": "1",
                "required": True,
                "search_queries": ["harina de trigo", "harina"],
            },
            {
                "key": "sal",
                "display_name": "Sal",
                "qty": "1",
                "required": True,
                "search_queries": ["sal"],
            },
            {
                "key": "polvo_hornear",
                "display_name": "Polvo de hornear",
                "qty": "1",
                "required": False,
                "search_queries": ["polvo de hornear"],
            },
            {
                "key": "aceite",
                "display_name": "Aceite vegetal",
                "qty": "1",
                "required": True,
                "search_queries": ["aceite vegetal", "aceite"],
            },
        ],
    },
}


RECIPE_MODIFIER_INGREDIENTS: Dict[str, RecipeIngredientDef] = {
    "cerdo": {
        "key": "cerdo",
        "display_name": "Carne de cerdo",
        "qty": "1",
        "required": True,
        "search_queries": ["carne de cerdo"],
    },
    "carne_cerdo": {
        "key": "cerdo",
        "display_name": "Carne de cerdo",
        "qty": "1",
        "required": True,
        "search_queries": ["carne de cerdo"],
    },
    "pollo": {
        "key": "pollo",
        "display_name": "Pollo",
        "qty": "2",
        "required": True,
        "search_queries": ["pollo"],
    },
    "res": {
        "key": "carne_res",
        "display_name": "Carne de res",
        "qty": "1",
        "required": True,
        "search_queries": ["carne de res"],
    },
    "carne_res": {
        "key": "carne_res",
        "display_name": "Carne de res",
        "qty": "1",
        "required": True,
        "search_queries": ["carne de res"],
    },
    "maiz": {
        "key": "mazorca",
        "display_name": "Mazorca",
        "qty": "2",
        "required": True,
        "search_queries": ["mazorca"],
    },
    "maíz": {
        "key": "mazorca",
        "display_name": "Mazorca",
        "qty": "2",
        "required": True,
        "search_queries": ["mazorca"],
    },
    "mazorca": {
        "key": "mazorca",
        "display_name": "Mazorca",
        "qty": "2",
        "required": True,
        "search_queries": ["mazorca"],
    },
    "salami": {
        "key": "salami",
        "display_name": "Salami",
        "qty": "1",
        "required": True,
        "search_queries": ["salami"],
    },
    "queso": {
        "key": "queso_freir",
        "display_name": "Queso de freír",
        "qty": "1",
        "required": True,
        "search_queries": ["queso de freir", "queso de freír"],
    },
    "huevo": {
        "key": "huevo",
        "display_name": "Huevos",
        "qty": "4",
        "required": True,
        "search_queries": ["huevos"],
    },
    "huevos": {
        "key": "huevo",
        "display_name": "Huevos",
        "qty": "4",
        "required": True,
        "search_queries": ["huevos"],
    },
}


def _normalize_recipe_name(name: str) -> str:
    return " ".join((name or "").strip().lower().split())


def _normalize_for_key(name: str) -> str:
    text = _normalize_recipe_name(name)
    replacements = {
        "á": "a",
        "é": "e",
        "í": "i",
        "ó": "o",
        "ú": "u",
        "ñ": "n",
    }
    for src, dst in replacements.items():
        text = text.replace(src, dst)
    return text


def find_recipe(recipe_name: str) -> Optional[RecipeDef]:
    target = _normalize_recipe_name(recipe_name)
    target_key = _normalize_for_key(recipe_name)

    for recipe in RECIPE_CATALOG.values():
        if target == _normalize_recipe_name(recipe["key"]):
            return recipe

        if target == _normalize_recipe_name(recipe["display_name"]):
            return recipe

        if target_key == _normalize_for_key(recipe["key"]):
            return recipe

        if target_key == _normalize_for_key(recipe["display_name"]):
            return recipe

        for alias in recipe["aliases"]:
            if target == _normalize_recipe_name(alias):
                return recipe
            if target_key == _normalize_for_key(alias):
                return recipe

    return None


def clone_recipe(recipe: RecipeDef) -> RecipeDef:
    return {
        "key": recipe["key"],
        "display_name": recipe["display_name"],
        "aliases": list(recipe["aliases"]),
        "original_servings": recipe["original_servings"],
        "default_servings": recipe["default_servings"],
        "ingredients": [dict(ingredient) for ingredient in recipe["ingredients"]],
    }


def add_or_replace_ingredient(recipe: RecipeDef, ingredient: RecipeIngredientDef) -> RecipeDef:
    cloned = clone_recipe(recipe)

    existing_index = None
    for idx, current in enumerate(cloned["ingredients"]):
        if current["key"] == ingredient["key"]:
            existing_index = idx
            break

    if existing_index is None:
        cloned["ingredients"].append(dict(ingredient))
    else:
        cloned["ingredients"][existing_index] = dict(ingredient)

    return cloned


def remove_ingredient_by_key_or_query(recipe: RecipeDef, value: str) -> RecipeDef:
    cloned = clone_recipe(recipe)
    value_norm = _normalize_for_key(value)

    keys_to_remove = set()
    modifier = RECIPE_MODIFIER_INGREDIENTS.get(value_norm)
    if modifier:
        keys_to_remove.add(modifier["key"])

    keys_to_remove.add(value_norm)

    filtered: List[RecipeIngredientDef] = []
    for ingredient in cloned["ingredients"]:
        ingredient_key = _normalize_for_key(ingredient["key"])
        display = _normalize_for_key(ingredient["display_name"])
        queries = [_normalize_for_key(q) for q in ingredient["search_queries"]]

        should_remove = (
            ingredient_key in keys_to_remove
            or value_norm in display
            or any(value_norm in query for query in queries)
        )

        if not should_remove:
            filtered.append(ingredient)

    cloned["ingredients"] = filtered
    return cloned


def apply_recipe_modifiers(
    recipe: RecipeDef,
    add_terms: Optional[List[str]] = None,
    remove_terms: Optional[List[str]] = None,
) -> RecipeDef:
    modified = clone_recipe(recipe)

    for term in remove_terms or []:
        modified = remove_ingredient_by_key_or_query(modified, term)

    for term in add_terms or []:
        term_key = _normalize_for_key(term).replace(" ", "_")
        ingredient = RECIPE_MODIFIER_INGREDIENTS.get(term_key) or RECIPE_MODIFIER_INGREDIENTS.get(
            _normalize_for_key(term)
        )
        if ingredient:
            modified = add_or_replace_ingredient(modified, ingredient)

    return modified


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