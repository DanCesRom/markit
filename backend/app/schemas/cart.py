from pydantic import BaseModel
from decimal import Decimal
from typing import List, Optional


class CartItemCreate(BaseModel):
    supermarket_product_id: int
    quantity: Decimal


class CartItemUpdate(BaseModel):
    quantity: Decimal


class CartItemResponse(BaseModel):
    cart_item_id: int
    supermarket_product_id: int
    product_name: str
    supermarket_id: int
    supermarket_name: str

    # precios
    unit_price: Decimal
    regular_price: Optional[Decimal] = None
    discount_amount: Decimal = Decimal("0")
    discount_percent: Decimal = Decimal("0")
    currency: Optional[str] = None
    is_on_sale: bool = False

    #  NUEVO
    image_url: Optional[str] = None
    line_savings: Decimal = Decimal("0")

    # qty/total
    quantity: Decimal
    line_total: Decimal


class CartGroupResponse(BaseModel):
    supermarket_id: int
    supermarket_name: str
    subtotal: Decimal

    #  NUEVO
    savings: Decimal = Decimal("0")

    items: List[CartItemResponse]


class CartResponse(BaseModel):
    cart_id: int
    total: Decimal

    #  NUEVO
    savings_total: Decimal = Decimal("0")

    supermarkets: List[CartGroupResponse]