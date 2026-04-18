from sqlalchemy import Column, Integer, String, Boolean, ForeignKey, DateTime, Numeric
from sqlalchemy.sql import func
from backend.app.core.database import Base


class Address(Base):
    __tablename__ = "addresses"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    label = Column(String(50), nullable=True)  # "Home", "Office", etc.
    line1 = Column(String(180), nullable=False)
    line2 = Column(String(180), nullable=True)
    city = Column(String(80), nullable=True)
    state = Column(String(80), nullable=True)
    postal_code = Column(String(30), nullable=True)
    notes = Column(String(180), nullable=True)

    latitude = Column(Numeric(10, 7), nullable=True)
    longitude = Column(Numeric(10, 7), nullable=True)

    #  nuevos
    building_type = Column(String(30), nullable=True)           # house/apartment/office/hotel/other
    formatted_address = Column(String(255), nullable=True)      # dirección completa del geocoder/mapa
    reference_note = Column(String(180), nullable=True)         # apto 3B, portón negro, etc.
    delivery_instructions = Column(String(300), nullable=True)  # knock, call, leave at lobby...

    is_default = Column(Boolean, nullable=False, server_default="false")

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())