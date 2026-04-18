# backend/app/models/cart_item.py
from sqlalchemy import Column, Integer, ForeignKey, Numeric, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class CartItem(Base):
    __tablename__ = "cart_items"

    id = Column(Integer, primary_key=True, index=True)

    cart_id = Column(Integer, ForeignKey("carts.id"), nullable=False)
    supermarket_product_id = Column(
        Integer,
        ForeignKey("supermarket_products.id"),
        nullable=False
    )

    # ✅ Antes Integer — ahora soporta lb/kg, etc.
    quantity = Column(Numeric(10, 3), nullable=False)

    unit_price = Column(Numeric(10, 2), nullable=False)

    added_at = Column(DateTime(timezone=True), server_default=func.now())

    cart = relationship("Cart", back_populates="items")
    supermarket_product = relationship("SupermarketProduct")