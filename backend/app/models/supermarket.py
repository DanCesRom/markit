from sqlalchemy import Column, Integer, String, DateTime, Enum, DECIMAL
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from backend.app.core.database import Base


class SupermarketStatus(enum.Enum):
    active = "active"
    inactive = "inactive"


class Supermarket(Base):
    __tablename__ = "supermarkets"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False)
    address = Column(String(200), nullable=False)

    latitude = Column(DECIMAL(10, 8), nullable=True)
    longitude = Column(DECIMAL(11, 8), nullable=True)

    status = Column(
        Enum(SupermarketStatus),
        nullable=False,
        server_default=SupermarketStatus.active.value
    )

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    products = relationship(
        "SupermarketProduct",
        back_populates="supermarket",
        cascade="all, delete-orphan"
    )
