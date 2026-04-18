from pydantic import BaseModel, Field
from datetime import datetime
from typing import Optional


class PaymentMethodCreate(BaseModel):
    brand: str = Field(..., min_length=2, max_length=20)
    last4: str = Field(..., min_length=4, max_length=4, pattern=r"^\d{4}$")
    exp_month: int = Field(..., ge=1, le=12)
    exp_year: int = Field(..., ge=2000, le=2100)
    nickname: Optional[str] = Field(default=None, max_length=80)
    is_default: bool = False


class PaymentMethodResponse(BaseModel):
    id: int
    brand: str
    last4: str
    exp_month: int
    exp_year: int
    nickname: Optional[str] = None
    is_default: bool
    status: str
    created_at: datetime

    class Config:
        from_attributes = True