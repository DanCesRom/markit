from pydantic import BaseModel
from typing import List
from decimal import Decimal
from datetime import datetime


class OrderItemResponse(BaseModel):
    id: int
    product_name_snapshot: str
    unit_price: Decimal
    quantity: Decimal
    line_total: Decimal


class OrderResponse(BaseModel):
    id: int
    cart_id: int
    supermarket_id: int
    supermarket_name: str
    subtotal: Decimal
    tax: Decimal
    total: Decimal
    delivery_type: str
    status: str
    created_at: datetime
    items: List[OrderItemResponse]

    class Config:
        from_attributes = True


class OrderListResponse(BaseModel):
    orders: List[OrderResponse]