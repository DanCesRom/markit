from pydantic import BaseModel, Field
from typing import Optional
from decimal import Decimal


class SupermarketCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    address: str = Field(..., min_length=2, max_length=200)
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None


class SupermarketUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    address: Optional[str] = Field(None, min_length=2, max_length=200)
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    status: Optional[str] = None  # "active" | "inactive"


class SupermarketResponse(BaseModel):
    id: int
    name: str
    address: str
    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None
    status: str

class Config:
    from_attributes = True
