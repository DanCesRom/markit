# backend/app/models/catalog_product.py
from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class CatalogProduct(Base):
    __tablename__ = "catalog_products"

    id = Column(Integer, primary_key=True, index=True)

    brand_id = Column(Integer, ForeignKey("brands.id"), nullable=False)

    name = Column(String(150), nullable=False)
    description = Column(Text, nullable=True)

    image_url = Column(Text, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # Relaciones
    brand = relationship("Brand", back_populates="catalog_products")

    # ⚠️ IMPORTANTE: ya NO conviene cascade delete-orphan aquí,
    # porque un listing puede vivir sin estar mapeado aún.
    supermarket_products = relationship(
        "SupermarketProduct",
        back_populates="catalog_product"
    )