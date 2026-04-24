# backend/app/core/llm.py
import json
import os
from decimal import Decimal, InvalidOperation
from typing import Any, Dict, List

from dotenv import load_dotenv
from openai import OpenAI

load_dotenv(override=True)


def _client() -> OpenAI:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    return OpenAI(api_key=api_key)


def _model() -> str:
    return os.getenv("OPENAI_MODEL", "gpt-4o-mini").strip() or "gpt-4o-mini"


UNDERSTAND_QUERY_SCHEMA = {
    "name": "markit_understand_query",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "kind": {
                "type": "string",
                "enum": ["recipe", "shopping"],
            },
            "intent": {
                "type": "string",
                "enum": ["recipe", "search", "best_price", "add_to_cart"],
            },
            "recipe_name": {
                "type": ["string", "null"],
            },
            "servings": {
                "type": ["integer", "null"],
                "minimum": 1,
            },
            "items": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "query": {"type": "string"},
                        "qty": {"type": "number", "minimum": 1},
                    },
                    "required": ["query", "qty"],
                },
            },
            "preferences": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "cheapest": {"type": "boolean"},
                    "delivery": {"type": "boolean"},
                    "pickup": {"type": "boolean"},
                },
                "required": ["cheapest", "delivery", "pickup"],
            },
        },
        "required": [
            "kind",
            "intent",
            "recipe_name",
            "servings",
            "items",
            "preferences",
        ],
    },
}


GENERATE_RECIPE_INGREDIENTS_SCHEMA = {
    "name": "markit_generate_recipe_ingredients",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "recipe_name": {"type": "string"},
            "servings": {"type": "integer", "minimum": 1},
            "ingredients": {
                "type": "array",
                "items": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "ingredient_key": {"type": "string"},
                        "ingredient_name": {"type": "string"},
                        "query": {"type": "string"},
                        "qty": {"type": "string"},
                        "required": {"type": "boolean"},
                    },
                    "required": [
                        "ingredient_key",
                        "ingredient_name",
                        "query",
                        "qty",
                        "required",
                    ],
                },
            },
        },
        "required": ["recipe_name", "servings", "ingredients"],
    },
}


def _parse_decimal(value: Any, default: str = "1") -> Decimal:
    try:
        return Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return Decimal(default)


def understand_query_with_llm(text: str) -> Dict[str, Any]:
    client = _client()

    system = (
        "You are the natural-language understanding layer for a grocery shopping app called Markit. "
        "Your job is to classify the user request and return STRICT JSON only.\n\n"
        "Important rules:\n"
        "1. If the user seems to want to cook or prepare a dish, classify as kind='recipe'.\n"
        "2. Short direct grocery-product searches such as 'arroz', 'leche', 'aceite', 'cebolla', "
        "'pollo' should be kind='shopping' and intent='search'.\n"
        "3. Dish names like 'sancocho', 'mangu', 'habichuelas con dulce', 'asopao', "
        "'locrio', 'moro con coco', 'cielito lindo' should be treated as recipe intent.\n"
        "4. If the user writes a known recipe with modifiers, preserve the full recipe_name. "
        "Examples: 'sancocho de cerdo', 'sancocho con cerdo', 'lasaña de pollo'.\n"
        "5. If recipe servings are not specified, use 4 by default.\n"
        "6. For shopping requests, return catalog-searchable item queries only.\n"
        "7. Remove filler words like 'quiero', 'necesito', 'por favor', 'agrega'.\n"
        "8. If the user asks for cheapest/best price, set preferences.cheapest=true and intent='best_price'.\n"
        "9. Do not invent stores, brands, prices, or products.\n"
        "10. If kind='recipe', items may be empty. Do not generate ingredient lists here.\n"
        "11. Understand Dominican food expressions and common misspellings when possible.\n"
        "12. Always return valid JSON matching the schema."
    )

    response = client.chat.completions.create(
        model=_model(),
        temperature=0.1,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": text},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": UNDERSTAND_QUERY_SCHEMA,
        },
    )

    content = response.choices[0].message.content

    if not content:
        raise ValueError("Empty response from LLM")

    data = json.loads(content)

    if data["kind"] not in {"recipe", "shopping"}:
        raise ValueError("Invalid kind from LLM")

    if data["intent"] not in {"recipe", "search", "best_price", "add_to_cart"}:
        raise ValueError("Invalid intent from LLM")

    recipe_name = data.get("recipe_name")

    if recipe_name is not None:
        recipe_name = str(recipe_name).strip() or None

    servings = data.get("servings")

    if servings is not None:
        servings = max(int(servings), 1)

    items = data.get("items") or []
    cleaned_items: List[Dict[str, Any]] = []

    for item in items:
        query = str(item.get("query", "")).strip()

        if not query:
            continue

        qty = item.get("qty", 1)

        try:
            qty = float(qty)
        except Exception:
            qty = 1.0

        if qty < 1:
            qty = 1.0

        cleaned_items.append({"query": query, "qty": qty})

    preferences = data.get("preferences") or {}

    cleaned_preferences = {
        "cheapest": bool(preferences.get("cheapest", False)),
        "delivery": bool(preferences.get("delivery", False)),
        "pickup": bool(preferences.get("pickup", False)),
    }

    return {
        "kind": data["kind"],
        "intent": data["intent"],
        "recipe_name": recipe_name,
        "servings": servings,
        "items": cleaned_items,
        "preferences": cleaned_preferences,
    }


def generate_recipe_ingredients_with_llm(recipe_name: str, servings: int = 4) -> Dict[str, Any]:
    client = _client()

    system = (
        "You generate grocery-searchable ingredients for recipes in a supermarket shopping app called Markit.\n"
        "Return STRICT JSON only.\n\n"
        "Rules:\n"
        "1. Assume Dominican Republic grocery context when the recipe sounds Dominican or Caribbean.\n"
        "2. Understand dominicanismos and dishes such as asopao, locrio, moro, mangú, víveres, sancocho.\n"
        "3. Return ingredients that can be searched in supermarket catalogs.\n"
        "4. Do not return cooking steps.\n"
        "5. Do not invent brands or stores.\n"
        "6. Use short searchable supermarket queries, for example: 'pollo', 'arroz', 'cebolla', "
        "'aji cubanela', 'cilantro', 'caldo de pollo', 'aceite vegetal'.\n"
        "7. qty must be a numeric string only.\n"
        "8. For produce sold by weight, qty can be decimal like '1.5'.\n"
        "9. For discrete items, qty can be integer like '2'.\n"
        "10. Mark only clearly optional ingredients as required=false.\n"
        "11. Use ingredient_key in snake_case ASCII.\n"
        "12. Prefer common Dominican home-cooking ingredients over gourmet or imported variations.\n"
        "13. Avoid niche or unusual ingredients unless they are essential to the dish.\n"
        "14. For Dominican-style asopao de pollo, prefer ingredients like pollo, arroz, cebolla, ajo, "
        "aji cubanela, cilantro or cilantro ancho, apio, tomate or pasta de tomate, caldo de pollo, "
        "oregano, sal, aceite vegetal.\n"
        "15. Do not include aceitunas or alcaparras by default unless they are truly typical for the dish.\n"
        "16. Do not include alcohol products.\n"
        "17. Do not include beverages when the user is asking for fresh produce like limon.\n"
        "18. For 'cielito lindo', treat it as a layered dip / taco dip and include cream cheese, sour cream "
        "or crema agria, refried beans, ground beef if appropriate, lettuce, tomato, shredded cheese, "
        "tortilla chips, salsa, and jalapeno only if needed.\n"
        "19. Return between 4 and 14 ingredients depending on the dish."
    )

    user = (
        f"Recipe name: {recipe_name}\n"
        f"Servings: {servings}\n"
        "Generate the ingredient list for supermarket search."
    )

    response = client.chat.completions.create(
        model=_model(),
        temperature=0.15,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        response_format={
            "type": "json_schema",
            "json_schema": GENERATE_RECIPE_INGREDIENTS_SCHEMA,
        },
    )

    content = response.choices[0].message.content

    if not content:
        raise ValueError("Empty response from LLM while generating recipe ingredients")

    data = json.loads(content)

    recipe_name_out = str(data.get("recipe_name", recipe_name)).strip() or recipe_name
    servings_out = int(data.get("servings", servings) or servings)
    servings_out = max(servings_out, 1)

    ingredients_raw = data.get("ingredients") or []
    ingredients: List[Dict[str, Any]] = []

    for item in ingredients_raw:
        ingredient_key = str(item.get("ingredient_key", "")).strip().lower()
        ingredient_name = str(item.get("ingredient_name", "")).strip()
        query = str(item.get("query", "")).strip()
        qty = _parse_decimal(item.get("qty", "1"), default="1")
        required = bool(item.get("required", True))

        if not ingredient_key or not ingredient_name or not query:
            continue

        if qty <= 0:
            qty = Decimal("1")

        ingredients.append(
            {
                "ingredient_key": ingredient_key,
                "ingredient_name": ingredient_name,
                "query": query,
                "qty": qty,
                "required": required,
            }
        )

    if not ingredients:
        raise ValueError("LLM returned no ingredients")

    return {
        "recipe_name": recipe_name_out,
        "servings": servings_out,
        "ingredients": ingredients,
    }


def ping_openai() -> Dict[str, Any]:
    client = _client()

    response = client.chat.completions.create(
        model=_model(),
        temperature=0,
        messages=[
            {"role": "system", "content": "Reply with exactly: ok"},
            {"role": "user", "content": "ping"},
        ],
    )

    content = (response.choices[0].message.content or "").strip().lower()

    return {
        "openai_ok": content == "ok",
        "model": _model(),
        "raw_response": content,
    }


def openai_health() -> Dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()

    return {
        "openai_configured": bool(api_key),
        "openai_model": _model(),
    }