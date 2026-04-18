from pydantic import BaseModel, Field
from typing import Optional
from decimal import Decimal


class AddressCreate(BaseModel):
    label: Optional[str] = Field(None, max_length=50)
    line1: str = Field(..., min_length=1, max_length=180)
    line2: Optional[str] = Field(None, max_length=180)
    city: Optional[str] = Field(None, max_length=80)
    state: Optional[str] = Field(None, max_length=80)
    postal_code: Optional[str] = Field(None, max_length=30)
    notes: Optional[str] = Field(None, max_length=180)

    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None

    building_type: Optional[str] = Field(None, max_length=30)
    formatted_address: Optional[str] = Field(None, max_length=255)
    reference_note: Optional[str] = Field(None, max_length=180)
    delivery_instructions: Optional[str] = Field(None, max_length=300)

    is_default: bool = False


class AddressUpdate(BaseModel):
    label: Optional[str] = Field(None, max_length=50)
    line1: Optional[str] = Field(None, min_length=1, max_length=180)
    line2: Optional[str] = Field(None, max_length=180)
    city: Optional[str] = Field(None, max_length=80)
    state: Optional[str] = Field(None, max_length=80)
    postal_code: Optional[str] = Field(None, max_length=30)
    notes: Optional[str] = Field(None, max_length=180)

    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None

    building_type: Optional[str] = Field(None, max_length=30)
    formatted_address: Optional[str] = Field(None, max_length=255)
    reference_note: Optional[str] = Field(None, max_length=180)
    delivery_instructions: Optional[str] = Field(None, max_length=300)


class AddressResponse(BaseModel):
    id: int
    label: Optional[str] = None
    line1: str
    line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    postal_code: Optional[str] = None
    notes: Optional[str] = None

    latitude: Optional[Decimal] = None
    longitude: Optional[Decimal] = None

    building_type: Optional[str] = None
    formatted_address: Optional[str] = None
    reference_note: Optional[str] = None
    delivery_instructions: Optional[str] = None

    is_default: bool

    class Config:
        from_attributes = True