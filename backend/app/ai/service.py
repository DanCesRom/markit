# backend/app/ai/service.py
from __future__ import annotations

import difflib
import re
import unicodedata
from decimal import Decimal
from typing import Dict, List, Optional, Tuple

from backend.app.ai.schemas import ParsedItem, Preferences, RecipeMeta
from backend.app.ai.tools.recipes import (
    RECIPE_CATALOG,
    apply_recipe_modifiers,
    find_recipe,
    recipe_to_parsed_items,
)
from backend.app.core.llm import (
    generate_recipe_ingredients_with_llm,
    understand_query_with_llm,
)


_STOPWORDS = {
    "de", "del", "la", "las", "el", "los", "un", "una", "unos", "unas",
    "para", "por", "al", "a", "en", "y", "e", "o",
    "que", "me", "mi", "mis", "tu", "tus", "su", "sus",
    "porfavor", "porfa", "favor",
    "mas", "más", "barato", "baratos", "barata", "baratas",
    "economico", "económico", "económicos",
    "mejor", "precio", "oferta", "ofertas",
    "quiero", "quisiera", "necesito", "dame", "buscame", "búscame",
    "agrega", "agregar", "añade", "anade", "pon", "poner",
}

_RECIPE_WORDS = {
    "receta", "ingredientes", "hacer", "cocinar", "preparar",
    "cocino", "cocinarme", "hazme",
}

_RECIPE_MODIFIER_CONNECTORS = {
    "con", "sin", "de", "extra",
}

_ADD_TRIGGERS = [
    "agrega", "agregar", "añade", "anade", "poner", "pon", "mete", "add",
    "al carrito", "carrito",
]

CHEAP_PATTERNS = [
    r"\b(más|mas)\s+barat[oa]s?\b",
    r"\blo\s+(más|mas)\s+barat[oa]\b",
    r"\bmejor\s+precio\b",
    r"\bbarat[oa]s?\b",
    r"\becon[oó]mic[oa]s?\b",
]

QTY_PATTERNS = [
    r"\bx\s*(\d+(?:[.,]\d+)?)\b",
    r"\b(\d+(?:[.,]\d+)?)\s*x\b",
    r"\b(\d+(?:[.,]\d+)?)\s*(uds|ud|unidades|unidad|personas|porciones)\b",
]

COMMON_GROCERY_TERMS = [
    "arroz",
    "leche",
    "aceite",
    "aceite vegetal",
    "sal",
    "azúcar",
    "azucar",
    "cebolla",
    "ajo",
    "pollo",
    "carne de res",
    "carne de cerdo",
    "plátano verde",
    "platano verde",
    "yuca",
    "auyama",
    "yautía",
    "yautia",
    "cilantro",
    "orégano",
    "oregano",
    "caldo de pollo",
    "sancocho",
    "mangú",
    "mangu",
    "asopao",
    "asopado de pollo",
    "locrio",
    "moro",
    "moro de guandules",
    "habichuelas con dulce",
    "pastel en hoja",
    "longaniza",
    "salami",
    "queso",
    "tomate",
    "lechuga",
    "huevo",
    "huevos",
    "mantequilla",
    "guandules",
    "habichuelas",
]

_SIMPLE_PRODUCT_HINTS = {
    "arroz", "leche", "aceite", "sal", "azucar", "azúcar", "cebolla", "ajo",
    "pollo", "cerdo", "res", "yuca", "auyama", "yautia", "yautía", "cilantro",
    "longaniza", "mazorca", "maiz", "maíz", "mantequilla", "habichuelas",
    "guandules", "queso", "huevo", "huevos", "tomate", "lechuga", "pasta",
    "spaghetti", "espagueti", "limon", "limón", "platano", "plátano",
}

_PROTECTED_QUERIES = {
    "caldo de pollo",
    "pasta de tomate",
    "aji cubanela",
    "ají cubanela",
    "aceite vegetal",
    "queso de freir",
    "queso de freír",
    "carne de res",
    "carne de cerdo",
}


def _norm(s: str) -> str:
    s = (s or "").strip()
    s = re.sub(r"\s+", " ", s)
    return s


def _strip_accents(text: str) -> str:
    return "".join(
        ch for ch in unicodedata.normalize("NFD", text)
        if unicodedata.category(ch) != "Mn"
    )


def _normalize_for_match(text: str) -> str:
    text = _norm(text).lower()
    text = _strip_accents(text)
    return text


def _best_fuzzy_match(value: str, choices: List[str], cutoff: float = 0.75) -> Optional[str]:
    norm_value = _normalize_for_match(value)
    norm_map = {_normalize_for_match(c): c for c in choices}

    matches = difflib.get_close_matches(
        norm_value,
        list(norm_map.keys()),
        n=1,
        cutoff=cutoff,
    )

    if not matches:
        return None

    return norm_map[matches[0]]


def _correct_common_phrase(text: str) -> Tuple[str, bool]:
    raw = _norm(text)
    corrected = _best_fuzzy_match(raw, COMMON_GROCERY_TERMS, cutoff=0.75)

    if corrected and _normalize_for_match(corrected) != _normalize_for_match(raw):
        return corrected, True

    return raw, False


def _detect_cheapest(low: str) -> bool:
    return any(re.search(pat, low, flags=re.IGNORECASE) for pat in CHEAP_PATTERNS)


def _strip_prefixes(s: str) -> str:
    s = re.sub(
        r"^(quiero|quisiera|necesito|dame|porfavor|por\s+favor|porfa|favor|me\s+das|me\s+pones|pon|agrega|agregar|añade|anade|hazme|buscame|búscame)\b\s*",
        "",
        s,
        flags=re.IGNORECASE,
    ).strip()
    return s


def _normalize_generated_recipe_query(query: str) -> str:
    q = _normalize_for_match(query)

    replacements = {
        "caldo pollo": "caldo de pollo",
        "caldo de pollo": "caldo de pollo",
        "consome de pollo": "caldo de pollo",
        "cubito de pollo": "caldo de pollo",
        "sopita de pollo": "caldo de pollo",
        "pasta tomate": "pasta de tomate",
        "pasta de tomate": "pasta de tomate",
        "aji": "aji cubanela",
        "aji verde": "aji cubanela",
        "aji cubanela": "aji cubanela",
        "cilantro ancho": "cilantro",
        "limon verde": "limon",
        "aceite": "aceite vegetal",
        "aceite vegetal": "aceite vegetal",
    }

    return replacements.get(q, _norm(query))


def _cleanup_product_phrase(s: str) -> str:
    s = _norm(s)
    s = _strip_prefixes(s)

    for pat in CHEAP_PATTERNS:
        s = re.sub(pat, " ", s, flags=re.IGNORECASE)

    s = re.sub(r"\bde\s+(las|los|la|el)\b", " ", s, flags=re.IGNORECASE)
    s = re.sub(r"[^0-9a-zA-ZáéíóúÁÉÍÓÚñÑ\s]", " ", s)
    s = _norm(s)

    protected_norm = {_normalize_for_match(x): x for x in _PROTECTED_QUERIES}
    s_norm = _normalize_for_match(s)

    if s_norm in protected_norm:
        return protected_norm[s_norm]

    toks = [t for t in s.split(" ") if t]
    toks2 = [t for t in toks if _normalize_for_match(t) not in _STOPWORDS]
    return _norm(" ".join(toks2))


def _extract_servings(low: str) -> Optional[int]:
    m = re.search(r"\bpara\s+(\d+)\s*(personas|porciones)?\b", low)
    if m:
        return max(int(m.group(1)), 1)

    m = re.search(r"\bx\s*(\d+)\s*(personas|porciones)?\b", low)
    if m:
        return max(int(m.group(1)), 1)

    m = re.search(r"\b(\d+)\s*(personas|porciones)\b", low)
    if m:
        return max(int(m.group(1)), 1)

    return None


def _extract_qty(raw: str) -> Tuple[str, Decimal]:
    s = raw

    for pat in QTY_PATTERNS:
        m = re.search(pat, s, flags=re.IGNORECASE)
        if not m:
            continue

        num = m.group(1) if m.lastindex else m.group(0)
        num = num.replace(",", ".")

        try:
            qty = Decimal(num)
        except Exception:
            qty = Decimal("1")

        start, end = m.span()
        s = (s[:start] + " " + s[end:]).strip()
        s = _norm(s)
        return s, qty if qty > 0 else Decimal("1")

    m = re.match(r"^\s*(\d+(?:[.,]\d+)?)\s+(.+)$", s)
    if m:
        try:
            qty = Decimal(m.group(1).replace(",", "."))
        except Exception:
            qty = Decimal("1")

        rest = _norm(m.group(2))
        return rest, qty if qty > 0 else Decimal("1")

    return s, Decimal("1")


def _split_items(raw: str) -> List[str]:
    t = _norm(raw).replace(";", ",")
    parts: List[str] = []

    for chunk in t.split(","):
        chunk = chunk.strip()
        if not chunk:
            continue

        subs = re.split(r"\s+y\s+", chunk, flags=re.IGNORECASE)

        for s in subs:
            s = s.strip()
            if s:
                parts.append(s)

    return parts


def _to_decimal_qty(v) -> Decimal:
    if v is None:
        return Decimal("1")

    if isinstance(v, Decimal):
        return v

    try:
        return Decimal(str(v))
    except Exception:
        return Decimal("1")


def _recipe_alias_map() -> Dict[str, Dict]:
    alias_map: Dict[str, Dict] = {}

    for recipe in RECIPE_CATALOG.values():
        aliases = [recipe["key"], recipe["display_name"], *recipe["aliases"]]

        for alias in aliases:
            alias_map[_normalize_for_match(alias)] = recipe

    return alias_map


def _fuzzy_match_recipe_alias(raw: str):
    candidate = _normalize_for_match(raw)
    alias_map = _recipe_alias_map()

    matches = difflib.get_close_matches(
        candidate,
        list(alias_map.keys()),
        n=1,
        cutoff=0.72,
    )

    if not matches:
        return None

    return alias_map[matches[0]]


def _find_recipe_from_free_text(raw: str):
    raw_norm = _normalize_for_match(raw)
    cleaned = _normalize_for_match(_cleanup_product_phrase(raw))

    candidates = {
        raw_norm,
        cleaned,
        raw_norm.replace("quiero un ", "").strip(),
        raw_norm.replace("quiero una ", "").strip(),
        raw_norm.replace("quiero hacer ", "").strip(),
        raw_norm.replace("quiero cocinar ", "").strip(),
        raw_norm.replace("receta de ", "").strip(),
        raw_norm.replace("ingredientes para ", "").strip(),
        raw_norm.replace("ingredientes de ", "").strip(),
        raw_norm.replace("como hacer ", "").strip(),
        raw_norm.replace("cómo hacer ", "").strip(),
    }

    for candidate in candidates:
        if not candidate:
            continue

        recipe = find_recipe(candidate)
        if recipe:
            return recipe

    alias_map = _recipe_alias_map()

    for alias_norm, recipe in alias_map.items():
        for candidate in candidates:
            if not candidate:
                continue

            if candidate == alias_norm:
                return recipe

            if f" {alias_norm} " in f" {candidate} ":
                return recipe

            if candidate.startswith(alias_norm + " "):
                return recipe

            if candidate.endswith(" " + alias_norm):
                return recipe

    fuzzy_recipe = _fuzzy_match_recipe_alias(raw)
    if fuzzy_recipe:
        return fuzzy_recipe

    return None


def _generated_recipe_to_parsed_items(generated: Dict) -> List[ParsedItem]:
    items: List[ParsedItem] = []

    protected_queries = {
        "caldo de pollo",
        "pasta de tomate",
        "aji cubanela",
        "aceite vegetal",
        "carne de cerdo",
        "carne de res",
    }

    protected_norms = {_normalize_for_match(x) for x in protected_queries}

    for ing in generated.get("ingredients", []):
        raw_query = str(ing.get("query", ""))
        normalized_query = _normalize_generated_recipe_query(raw_query)
        qty = _to_decimal_qty(ing.get("qty", 1))

        if _normalize_for_match(normalized_query) in protected_norms:
            query = _norm(normalized_query)
        else:
            query = _cleanup_product_phrase(normalized_query)

        if not query:
            query = _cleanup_product_phrase(str(ing.get("ingredient_name", "")))

        if query:
            items.append(ParsedItem(query=query, qty=qty))

    return items


def _looks_like_direct_product_search(raw: str) -> bool:
    value = _normalize_for_match(raw)
    tokens = value.split()

    if not value:
        return False

    if any(w in value for w in _RECIPE_WORDS):
        return False

    if any(conn in tokens for conn in _RECIPE_MODIFIER_CONNECTORS) and len(tokens) >= 3:
        return False

    if len(tokens) <= 3:
        cleaned = _cleanup_product_phrase(raw)
        cleaned_norm = _normalize_for_match(cleaned)

        if cleaned_norm in {_normalize_for_match(x) for x in COMMON_GROCERY_TERMS}:
            return True

        if any(tok in _SIMPLE_PRODUCT_HINTS for tok in tokens):
            return True

        fuzzy = _best_fuzzy_match(cleaned, COMMON_GROCERY_TERMS, cutoff=0.80)

        if fuzzy and _normalize_for_match(fuzzy) in {
            _normalize_for_match(x) for x in COMMON_GROCERY_TERMS
        }:
            return True

    return False


def _extract_recipe_base_and_modifiers(raw: str, recipe_def: Dict) -> Tuple[List[str], List[str]]:
    value = _normalize_for_match(raw)

    aliases = [recipe_def["key"], recipe_def["display_name"], *recipe_def["aliases"]]
    aliases_norm = sorted(
        {_normalize_for_match(alias) for alias in aliases},
        key=len,
        reverse=True,
    )

    rest = value

    for alias in aliases_norm:
        rest = rest.replace(alias, " ")

    rest = re.sub(
        r"\b(quiero|quisiera|hacer|cocinar|preparar|receta|ingredientes|para|personas|porciones)\b",
        " ",
        rest,
    )
    rest = re.sub(r"\b\d+\b", " ", rest)
    rest = _norm(rest)

    add_terms: List[str] = []
    remove_terms: List[str] = []

    for m in re.finditer(r"\bsin\s+([a-záéíóúñ ]+?)(?=\bcon\b|\bextra\b|$)", value):
        term = _cleanup_product_phrase(m.group(1))
        if term:
            remove_terms.append(term)

    for m in re.finditer(r"\b(con|de|extra)\s+([a-záéíóúñ ]+?)(?=\bsin\b|\bcon\b|\bextra\b|$)", value):
        term = _cleanup_product_phrase(m.group(2))
        if term:
            add_terms.append(term)

    if not add_terms and not remove_terms and rest:
        possible = _cleanup_product_phrase(rest)
        if possible and _normalize_for_match(possible) not in _STOPWORDS:
            add_terms.append(possible)

    return add_terms, remove_terms


def _parse_shopping_without_llm(
    raw_for_understanding: str,
    low: str,
    preferences: Preferences,
) -> Tuple[str, List[ParsedItem]]:
    intent = "search"

    if any(t in low for t in _ADD_TRIGGERS):
        intent = "add_to_cart"

    if preferences.cheapest:
        intent = "best_price"

    segments = _split_items(raw_for_understanding)
    parsed: List[ParsedItem] = []

    for seg in segments:
        seg2 = _strip_prefixes(seg)
        without_qty, qty = _extract_qty(seg2)
        q = _cleanup_product_phrase(without_qty)

        if not q:
            q = _cleanup_product_phrase(seg)

        corrected_q, was_corrected = _correct_common_phrase(q)

        if was_corrected:
            q = corrected_q

        if q:
            parsed.append(ParsedItem(query=q, qty=qty))

    if not parsed:
        q = _cleanup_product_phrase(raw_for_understanding)
        corrected_q, was_corrected = _correct_common_phrase(q)

        if was_corrected:
            q = corrected_q

        parsed = [ParsedItem(query=q or raw_for_understanding, qty=Decimal("1"))]

    return intent, parsed


def parse_text(
    text: str,
) -> Tuple[str, List[ParsedItem], Preferences, str, Optional[RecipeMeta], Optional[dict]]:
    raw = _norm(text)

    corrected_raw, corrected = _correct_common_phrase(raw)
    raw_for_understanding = corrected_raw if corrected else raw
    low = _normalize_for_match(raw_for_understanding)

    suggestion = None

    if corrected and _normalize_for_match(corrected_raw) != _normalize_for_match(raw):
        suggestion = {
            "original": raw,
            "corrected": corrected_raw,
        }

    preferences = Preferences(
        cheapest=_detect_cheapest(low),
        delivery=("delivery" in low or "domicilio" in low),
        pickup=("pickup" in low or "recoger" in low),
    )

    # 1) Receta conocida / receta conocida con modificadores, sin LLM.
    # Va ANTES del fast path para que "sancocho", "sancoho", "manguu", "asopao"
    # no caigan como búsqueda normal de producto.
    recipe_def = _find_recipe_from_free_text(raw_for_understanding)

    if recipe_def:
        servings = _extract_servings(low) or recipe_def["default_servings"]
        add_terms, remove_terms = _extract_recipe_base_and_modifiers(
            raw_for_understanding,
            recipe_def,
        )

        modified_recipe = apply_recipe_modifiers(
            recipe_def,
            add_terms=add_terms,
            remove_terms=remove_terms,
        )

        items = recipe_to_parsed_items(modified_recipe, servings=servings)

        recipe = RecipeMeta(
            name=modified_recipe["display_name"],
            servings=servings,
            source="heuristic",
            needs_confirmation=False,
        )

        return "recipe", items, preferences, raw_for_understanding, recipe, suggestion

    # 2) Fast path: producto simple sin LLM.
    if _looks_like_direct_product_search(raw_for_understanding):
        intent, parsed = _parse_shopping_without_llm(
            raw_for_understanding,
            low,
            preferences,
        )
        return intent, parsed, preferences, raw_for_understanding, None, suggestion

    # 3) Lista simple de productos, sin LLM.
    if "," in raw_for_understanding or " y " in f" {low} ":
        if not any(w in low for w in _RECIPE_WORDS):
            intent, parsed = _parse_shopping_without_llm(
                raw_for_understanding,
                low,
                preferences,
            )
            return intent, parsed, preferences, raw_for_understanding, None, suggestion

    # 4) LLM solo para intención abierta, ambigua o receta no registrada.
    try:
        data = understand_query_with_llm(raw_for_understanding)

        llm_prefs = data.get("preferences") or {}

        preferences = Preferences(
            cheapest=bool(llm_prefs.get("cheapest", preferences.cheapest)),
            delivery=bool(llm_prefs.get("delivery", preferences.delivery)),
            pickup=bool(llm_prefs.get("pickup", preferences.pickup)),
        )

        if data["kind"] == "recipe" or data["intent"] == "recipe":
            recipe_name = _norm(data.get("recipe_name") or raw_for_understanding).lower()
            servings = int(data.get("servings") or _extract_servings(low) or 4)

            recipe_def = find_recipe(recipe_name)

            if recipe_def:
                add_terms, remove_terms = _extract_recipe_base_and_modifiers(
                    raw_for_understanding,
                    recipe_def,
                )

                modified_recipe = apply_recipe_modifiers(
                    recipe_def,
                    add_terms=add_terms,
                    remove_terms=remove_terms,
                )

                items = recipe_to_parsed_items(modified_recipe, servings=servings)

                recipe = RecipeMeta(
                    name=modified_recipe["display_name"],
                    servings=servings,
                    source="llm",
                    needs_confirmation=False,
                )

                return "recipe", items, preferences, raw_for_understanding, recipe, suggestion

            fuzzy_recipe = _fuzzy_match_recipe_alias(recipe_name)

            if fuzzy_recipe:
                add_terms, remove_terms = _extract_recipe_base_and_modifiers(
                    raw_for_understanding,
                    fuzzy_recipe,
                )

                modified_recipe = apply_recipe_modifiers(
                    fuzzy_recipe,
                    add_terms=add_terms,
                    remove_terms=remove_terms,
                )

                items = recipe_to_parsed_items(modified_recipe, servings=servings)

                recipe = RecipeMeta(
                    name=modified_recipe["display_name"],
                    servings=servings,
                    source="llm",
                    needs_confirmation=False,
                )

                return "recipe", items, preferences, raw_for_understanding, recipe, suggestion

            generated = generate_recipe_ingredients_with_llm(
                recipe_name=recipe_name,
                servings=servings,
            )

            items = _generated_recipe_to_parsed_items(generated)

            recipe = RecipeMeta(
                name=generated.get("recipe_name") or recipe_name,
                servings=int(generated.get("servings") or servings),
                source="llm",
                needs_confirmation=False if items else True,
            )

            return "recipe", items, preferences, raw_for_understanding, recipe, suggestion

        parsed: List[ParsedItem] = []

        for item in data.get("items", []):
            query = _cleanup_product_phrase(str(item.get("query", "")))
            corrected_query, was_corrected = _correct_common_phrase(query)

            if was_corrected:
                query = corrected_query

            qty = _to_decimal_qty(item.get("qty", 1))

            if query:
                parsed.append(ParsedItem(query=query, qty=qty))

        if parsed:
            return data["intent"], parsed, preferences, raw_for_understanding, None, suggestion

    except Exception:
        pass

    # 5) Fallback final sin LLM.
    intent, parsed = _parse_shopping_without_llm(
        raw_for_understanding,
        low,
        preferences,
    )

    return intent, parsed, preferences, raw_for_understanding, None, suggestion