from sqlalchemy import Column, Integer, String, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class Brand(Base):
    __tablename__ = "brands"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(120), nullable=False, unique=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    catalog_products = relationship(
        "CatalogProduct",
        back_populates="brand",
        cascade="all, delete-orphan"
    )
