from pydantic import BaseModel, Field
from typing import List, Optional
from decimal import Decimal


class CheckoutRequest(BaseModel):
    delivery_type: str = Field(..., pattern="^(delivery|pickup)$")
    payment_method_type: str = Field(..., pattern="^(card|cash)$")
    payment_method_id: Optional[int] = None

    # address para delivery (opcional para pickup)
    delivery_address_id: Optional[int] = None

    # items seleccionados del carrito para este checkout
    cart_item_ids: Optional[List[int]] = None


class CheckoutOrderSummary(BaseModel):
    order_id: int
    supermarket_id: int
    supermarket_name: str
    total: Decimal


class CheckoutResponse(BaseModel):
    checkout_session_id: int
    cart_id: int
    total: Decimal
    delivery_type: str
    payment_method_type: str
    payment_method_id: Optional[int]
    orders: List[CheckoutOrderSummary]