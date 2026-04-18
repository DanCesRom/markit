from sqlalchemy import Column, Integer, String, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from backend.app.core.database import Base


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)

    order_id = Column(Integer, ForeignKey("orders.id", ondelete="CASCADE"), nullable=False)

    product_name_snapshot = Column(String(150), nullable=False)

    unit_price = Column(Numeric(10, 2), nullable=False)

    # Antes Integer — ahora soporta lb/kg
    quantity = Column(Numeric(10, 3), nullable=False)

    order = relationship("Order", back_populates="items")