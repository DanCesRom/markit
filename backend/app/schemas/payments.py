from pydantic import BaseModel, Field
from typing import Optional
from decimal import Decimal


class PayOrderRequest(BaseModel):
    payment_method_type: str = Field(..., pattern="^(card|cash)$")
    payment_method_id: Optional[int] = None


class PayOrderResponse(BaseModel):
    order_id: int
    amount: Decimal
    status: str
    payment_method_type: str
    payment_method_id: Optional[int]