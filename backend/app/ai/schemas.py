from decimal import Decimal
from typing import List, Optional, Literal, Union
from pydantic import BaseModel, Field


class Preferences(BaseModel):
    cheapest: bool = False
    delivery: bool = False
    pickup: bool = False


class RecipeMeta(BaseModel):
    name: str
    servings: int = 1
    source: Literal["heuristic", "llm"] = "heuristic"
    needs_confirmation: bool = False


class ParsedItem(BaseModel):
    query: str
    qty: Decimal = Decimal("1")


class ParseQueryRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=300)


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
    currency: str = "RD$"
    in_stock: bool = True
    stock_qty: Optional[int] = None

    requested_qty: Decimal
    purchase_qty: Decimal
    qty: Decimal

    line_total: Decimal
    image_url: Optional[str] = None

    pricing_mode: Literal["weighted", "unit", "package"] = "weighted"
    purchase_note: Optional[str] = None


class SearchItemResult(BaseModel):
    query: str
    qty: Decimal
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
    qty: Decimal
    supermarket_product_id: int
    product: str
    supermarket: str
    unit_price: Decimal
    currency: str = "RD$"
    line_total: Decimal
    pricing_mode: Literal["weighted", "unit", "package"] = "weighted"
    purchase_note: Optional[str] = None


class NotFoundLine(BaseModel):
    query: str
    qty: Decimal
    reason: str = "no_match"


class AIAddToCartResponse(BaseModel):
    intent: str
    preferences: Preferences
    raw: str
    added: List[AddedLine]
    not_found: List[NotFoundLine]
    estimated_total_added: Decimal
    recipe: Optional[RecipeMeta] = None


class RecipeIngredientOption(BaseModel):
    product: str
    supermarket: str
    supermarket_id: int
    supermarket_product_id: int
    unit_price: Decimal
    currency: str = "RD$"
    in_stock: bool = True
    stock_qty: Optional[int] = None

    requested_qty: Decimal
    purchase_qty: Decimal
    qty: Decimal

    line_total: Decimal
    image_url: Optional[str] = None

    pricing_mode: Literal["weighted", "unit", "package"] = "weighted"
    purchase_note: Optional[str] = None


class RecipeIngredientResult(BaseModel):
    ingredient_key: str
    ingredient_name: str
    query: str
    qty: Decimal
    required: bool = True
    selected_option: Optional[RecipeIngredientOption] = None
    alternatives: List[RecipeIngredientOption] = []
    found: bool = False


class RecipeSearchSummary(BaseModel):
    ingredients_total: int
    ingredients_found: int
    ingredients_missing: int
    estimated_total: Decimal


class RecipeSearchRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=300)
    limit_per_item: int = Field(5, ge=1, le=20)
    include_alternatives: bool = True


class RecipeSearchResponse(BaseModel):
    intent: Literal["recipe"] = "recipe"
    preferences: Preferences
    raw: str
    recipe: RecipeMeta
    summary: RecipeSearchSummary
    items: List[RecipeIngredientResult]


class RecipeSelectionItem(BaseModel):
    ingredient_key: str
    ingredient_name: str
    qty: Decimal
    supermarket_product_id: int


class RecipeAddToCartRequest(BaseModel):
    recipe_name: str = Field(..., min_length=1, max_length=200)
    servings: int = Field(1, ge=1, le=100)
    selections: List[RecipeSelectionItem] = Field(default_factory=list)


class RecipeAddToCartAddedLine(BaseModel):
    ingredient_key: str
    ingredient_name: str
    qty: Decimal
    supermarket_product_id: int
    product: str
    supermarket: str
    unit_price: Decimal
    currency: str = "RD$"
    line_total: Decimal


class RecipeAddToCartResponse(BaseModel):
    recipe_name: str
    servings: int
    added: List[RecipeAddToCartAddedLine]
    estimated_total_added: Decimal


class SearchSuggestion(BaseModel):
    original: str
    corrected: str


class SmartSearchRecipeResponse(BaseModel):
    mode: Literal["recipe"] = "recipe"
    suggestion: Optional[SearchSuggestion] = None
    data: RecipeSearchResponse


class SmartSearchNormalResponse(BaseModel):
    mode: Literal["normal"] = "normal"
    suggestion: Optional[SearchSuggestion] = None
    data: AISearchResponse


SmartSearchResponse = Union[SmartSearchRecipeResponse, SmartSearchNormalResponse]


class DebugUnderstandResponse(BaseModel):
    raw_text: str
    normalized_text: str
    corrected: bool = False
    correction_original: Optional[str] = None
    correction_corrected: Optional[str] = None
    final_intent: str
    recipe_name: Optional[str] = None
    servings: Optional[int] = None
    llm_used: bool = False
    openai_ok: bool = False


class AIHealthResponse(BaseModel):
    ai_router_ok: bool
    openai_configured: bool
    openai_model: str
    strategy: str