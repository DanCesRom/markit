from sqlalchemy import Column, Integer, ForeignKey, Enum, DateTime, String, Text, Numeric, UniqueConstraint, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from backend.app.core.database import Base


class ProductStatus(enum.Enum):
    available = "available"
    unavailable = "unavailable"


class UnitKind(enum.Enum):
    unit = "unit"
    weight = "weight"


class SupermarketProduct(Base):
    __tablename__ = "supermarket_products"

    id = Column(Integer, primary_key=True, index=True)

    supermarket_id = Column(Integer, ForeignKey("supermarkets.id"), nullable=False, index=True)

    # ✅ NUEVO: FK a categoría por supermercado
    supermarket_category_id = Column(
        Integer,
        ForeignKey("supermarket_categories.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Mapping a catálogo global (opcional)
    catalog_product_id = Column(Integer, ForeignKey("catalog_products.id"), nullable=True)

    # Identificadores externos
    external_id = Column(String(80), nullable=False, index=True)      # sirena: productid, nacional: id, bravo: idArticulo
    external_sku = Column(String(80), nullable=True, index=True)      # nacional: sku

    # Datos raw
    name_raw = Column(String(255), nullable=False)
    category_raw = Column(String(255), nullable=True)
    image_url = Column(Text, nullable=True)
    product_url = Column(Text, nullable=True)

    # Decimal/step/min/max
    unit_kind = Column(Enum(UnitKind, name="unit_kind"), nullable=False, server_default=UnitKind.unit.value)
    min_qty = Column(Numeric(10, 3), nullable=True)
    max_qty = Column(Numeric(10, 3), nullable=True)
    step_qty = Column(Numeric(10, 3), nullable=True)

    status = Column(Enum(ProductStatus), nullable=False, server_default=ProductStatus.available.value)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # Relaciones
    supermarket = relationship("Supermarket", back_populates="products")
    catalog_product = relationship("CatalogProduct", back_populates="supermarket_products")

    # ✅ NUEVO
    supermarket_category = relationship("SupermarketCategory", back_populates="products")

    price_row = relationship(
        "SupermarketProductPrice",
        back_populates="supermarket_product",
        uselist=False,
        cascade="all, delete-orphan",
    )

    inventory = relationship(
        "ProductInventory",
        back_populates="supermarket_product",
        uselist=False,
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        UniqueConstraint("supermarket_id", "external_id", name="uq_supermarket_products_supermarket_external_id"),
        Index("ix_supermarket_products_supermarket", "supermarket_id"),
    )