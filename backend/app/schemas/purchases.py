from pydantic import BaseModel
from typing import List
from decimal import Decimal
from datetime import datetime


class PurchaseOrderItemResponse(BaseModel):
    id: int
    product_name_snapshot: str
    unit_price: Decimal
    quantity: int
    line_total: Decimal


class PurchaseOrderResponse(BaseModel):
    order_id: int
    supermarket_id: int
    supermarket_name: str
    status: str
    delivery_type: str
    subtotal: Decimal
    tax: Decimal
    total: Decimal
    created_at: datetime
    items: List[PurchaseOrderItemResponse]


class PurchaseDetailResponse(BaseModel):
    id: int  # checkout_session_id
    cart_id: int
    total: Decimal
    delivery_type: str
    status: str
    created_at: datetime
    orders: List[PurchaseOrderResponse]


class PurchaseListOrderSummary(BaseModel):
    order_id: int
    supermarket_id: int
    supermarket_name: str
    total: Decimal
    status: str


class PurchaseListResponseItem(BaseModel):
    id: int
    cart_id: int
    total: Decimal
    status: str
    created_at: datetime
    orders: List[PurchaseListOrderSummary]


class PurchaseListResponse(BaseModel):
    purchases: List[PurchaseListResponseItem]