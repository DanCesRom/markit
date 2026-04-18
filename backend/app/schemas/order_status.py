from pydantic import BaseModel, Field
from typing import List
from datetime import datetime


class OrderStatusHistoryResponse(BaseModel):
    id: int
    order_id: int
    status: str
    changed_by: str
    changed_at: datetime

    class Config:
        from_attributes = True


class OrderStatusHistoryListResponse(BaseModel):
    history: List[OrderStatusHistoryResponse]


class OrderStatusChangeRequest(BaseModel):
    status: str = Field(..., min_length=1, max_length=50)
    changed_by: str = Field(..., pattern="^(system|user|admin)$")