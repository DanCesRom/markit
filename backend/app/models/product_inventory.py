# backend/app/models/product_inventory.py
from sqlalchemy import Column, Integer, ForeignKey, DateTime, Boolean, Enum
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
import enum

from backend.app.core.database import Base


class InventoryStatus(enum.Enum):
    in_stock = "in_stock"
    out_of_stock = "out_of_stock"
    unknown = "unknown"


class ProductInventory(Base):
    __tablename__ = "product_inventory"

    id = Column(Integer, primary_key=True, index=True)

    supermarket_product_id = Column(
        Integer,
        ForeignKey("supermarket_products.id"),
        nullable=False,
        unique=True
    )

    # ✅ Muchas veces NO hay cantidad exacta
    stock_qty = Column(Integer, nullable=True)

    in_stock = Column(Boolean, nullable=False, server_default="true")

    status = Column(
        Enum(InventoryStatus, name="inventory_status"),
        nullable=False,
        server_default=InventoryStatus.in_stock.value
    )

    updated_at = Column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    supermarket_product = relationship(
        "SupermarketProduct",
        back_populates="inventory"
    )