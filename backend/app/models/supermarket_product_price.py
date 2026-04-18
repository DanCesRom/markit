from sqlalchemy import Column, Integer, ForeignKey, Numeric, String, DateTime
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from backend.app.core.database import Base


class SupermarketProductPrice(Base):
    __tablename__ = "supermarket_product_prices"

    id = Column(Integer, primary_key=True, index=True)

    supermarket_product_id = Column(
        Integer,
        ForeignKey("supermarket_products.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    price = Column(Numeric(10, 2), nullable=False)
    regular_price = Column(Numeric(10, 2), nullable=True)

    currency = Column(String(3), nullable=False, server_default="DOP")
    discount_amount = Column(Numeric(10, 2), nullable=False, server_default="0")
    discount_percent = Column(Numeric(5, 2), nullable=False, server_default="0")

    updated_at = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), onupdate=func.now())

    supermarket_product = relationship("SupermarketProduct", back_populates="price_row")