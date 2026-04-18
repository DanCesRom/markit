from pydantic import BaseModel, Field
from typing import Optional
from decimal import Decimal


class SupermarketProductUpsert(BaseModel):
    supermarket_id: int
    catalog_product_id: int
    price: Decimal = Field(..., gt=0)
    status: Optional[str] = None  # "available" | "unavailable"


class InventoryUpsert(BaseModel):
    supermarket_product_id: int
    stock: int = Field(..., ge=0)


class SupermarketProductResponse(BaseModel):
    id: int
    supermarket_id: int
    catalog_product_id: int
    price: Decimal
    status: str

    class Config:
        from_attributes = True  # Pydantic v2


class InventoryResponse(BaseModel):
    id: int
    supermarket_product_id: int
    stock: int

    class Config:
        from_attributes = True  # Pydantic v2